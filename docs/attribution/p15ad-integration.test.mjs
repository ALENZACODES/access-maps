import test from 'node:test';
import assert from 'node:assert/strict';
import {reference,responseSet,DAY,NEXT,LATER,POLICY} from './p15ad-fixtures.mjs';
import {createReviewSample,validateReviewSample} from './p15ad-sampling.mjs';
import {createResponseSet,joinReviewEvidence} from './p15ad-reference.mjs';
import {createQualityPolicy,calibrateReviewers,validateCalibration} from './p15ad-calibration.mjs';
import {reviewerAgreement,stratifiedMetrics} from './p15ad-agreement.mjs';
import {createQualityReport,renderQualityReport} from './p15ad-report.mjs';
import {compareReviewerWindows,buildCohortDriftReport} from './p15ad-drift.mjs';
import {sha,bodyHash,QualityError} from './p15ad-contract.mjs';

const policy=createQualityPolicy(POLICY);
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);
function sampledRun({seed='sample-seed',accuracy=1,reviewedOn=NEXT}={}){
 const ref=reference({count:36});
 const sample=createReviewSample(ref,{sampleId:`sample-${seed}`,seed,createdOn:DAY,size:18});
 const full=responseSet({referenceSet:ref,reviewers:['blind-alpha','blind-bravo'],
  accuracy,reviewedOn});
 const selected=new Set(sample.items.map(row=>row.itemId));
 const responses=createResponseSet({responseSetId:`responses-${seed}`,createdOn:reviewedOn,
  responses:full.responses.filter(row=>selected.has(row.itemId))});
 const calibration=calibrateReviewers(ref,responses,{policy,calibrationId:`cal-${seed}`,
  asOf:reviewedOn});
 return {ref,sample,responses,calibration};
}

test('sample-to-calibration workflow validates sampled membership and response provenance',()=>{
 const run=sampledRun();
 assert.equal(validateReviewSample(run.sample,run.ref).sampleSize,18);
 assert.equal(joinReviewEvidence(run.ref,run.responses).length,36);
 assert.equal(validateCalibration(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy}).digest,run.calibration.digest);
});
test('sample-to-report workflow produces a bilingual report from the same calibration',()=>{
 const run=sampledRun();
 const en=createQualityReport(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy,reportId:'report-integration-en',lang:'en'});
 const fr=createQualityReport(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy,reportId:'report-integration-fr',lang:'fr'});
 assert.match(renderQualityReport(en),/Offline review quality report/u);
 assert.match(renderQualityReport(fr),/Rapport hors ligne/u);
});
test('sample-to-agreement workflow uses only joined reviewer responses',()=>{
 const run=sampledRun();
 const joined=joinReviewEvidence(run.ref,run.responses);
 const result=reviewerAgreement(joined);
 assert.equal(result.reviewers,2);
 assert.equal(result.pairwise.length,1);
});
test('sample-to-stratified-analysis workflow returns field groups',()=>{
 const run=sampledRun();
 const groups=stratifiedMetrics(joinReviewEvidence(run.ref,run.responses),'feature');
 assert.ok(Object.keys(groups).length>=2);
});
test('a second period can be compared without rewriting the first calibration',()=>{
 const first=sampledRun({seed:'period-one',accuracy:1,reviewedOn:NEXT});
 const second=sampledRun({seed:'period-two',accuracy:0.5,reviewedOn:LATER});
 const windows=[
  {windowId:'period-one',from:DAY,to:NEXT,calibration:first.calibration},
  {windowId:'period-two',from:LATER,to:LATER,calibration:second.calibration},
 ];
 const drift=compareReviewerWindows(windows,{reviewerToken:'blind-alpha',policy});
 assert.equal(drift.windows.length,2);
 assert.equal(drift.automaticRestriction,false);
});
test('cohort drift report preserves explicit no-automatic-action boundary',()=>{
 const first=sampledRun({seed:'period-one',accuracy:1,reviewedOn:NEXT});
 const second=sampledRun({seed:'period-two',accuracy:0.5,reviewedOn:LATER});
 const report=buildCohortDriftReport([
  {windowId:'period-one',from:DAY,to:NEXT,calibration:first.calibration},
  {windowId:'period-two',from:LATER,to:LATER,calibration:second.calibration},
 ],{policy});
 assert.equal(report.summary.automaticRestriction,false);
});
test('sample selection changes with a different seed but does not change source evidence',()=>{
 const ref=reference({count:36});
 const first=createReviewSample(ref,{sampleId:'sample-one',seed:'one',createdOn:DAY,size:12});
 const second=createReviewSample(ref,{sampleId:'sample-two',seed:'two',createdOn:DAY,size:12});
 assert.notDeepEqual(first.items.map(row=>row.itemId),second.items.map(row=>row.itemId));
 assert.equal(first.referenceDigest,second.referenceDigest);
});
test('review quality workflow refuses a changed evidence digest before calibration',()=>{
 const run=sampledRun();
 const changed=createResponseSet({responseSetId:'responses-changed',createdOn:NEXT,
  responses:run.responses.responses.map((row,index)=>index===0?{...row,evidenceDigest:sha('changed')}:row)});
 fails(()=>calibrateReviewers(run.ref,changed,{policy,calibrationId:'cal-changed',asOf:NEXT}),'STALE_EVIDENCE');
});
test('review quality workflow refuses a changed adjudicated reference',()=>{
 const run=sampledRun();
 const changed=reference({count:36,patch:{0:{rationale:'A revised adjudication rationale.'}}});
 fails(()=>validateCalibration(run.calibration,{reference:changed,responseSet:run.responses,policy}),
  'STALE_CALIBRATION');
});
test('report generation does not create a decision when sample is too small',()=>{
 const ref=reference({count:3}),responses=responseSet({referenceSet:ref});
 const calibration=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-small',asOf:NEXT});
 const report=createQualityReport(calibration,{reference:ref,responseSet:responses,policy,
  reportId:'report-small',lang:'en'});
 assert.ok(report.reviewers.every(row=>row.disposition==='insufficient-sample'));
});
test('a disagreement between reviewers remains visible in pairwise agreement',()=>{
 const ref=reference({count:12});
 const full=responseSet({referenceSet:ref,reviewers:['blind-alpha','blind-bravo']});
 const changed=createResponseSet({responseSetId:'responses-disagree',createdOn:NEXT,
  responses:full.responses.map(row=>{
   const refItem=ref.items.find(item=>item.itemId===row.itemId);
   return row.reviewerToken==='blind-bravo'&&refItem.referenceState!=='UNKNOWN'?
    {...row,observedState:row.observedState==='YES'?'NO':'YES',decision:'contradicted'}:row;
  })});
 const joined=joinReviewEvidence(ref,changed);
 const agreement=reviewerAgreement(joined);
 assert.equal(agreement.pairwise.length,1);
 assert.ok(agreement.pairwise[0].n>0);
});
test('UNKNOWN remains an explicit category through the complete workflow',()=>{
 const run=sampledRun();
 const unknown=run.calibration.reviewers.map(row=>row.unknownRecall);
 assert.ok(unknown.every(value=>value===1));
 assert.ok(run.calibration.reviewers.every(row=>row.unknownReferenceCount>0));
});
test('no identity fields cross into a rendered report',()=>{
 const run=sampledRun();
 const report=createQualityReport(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy,reportId:'report-private',lang:'en'});
 const output=renderQualityReport(report);
 assert.ok(!output.includes('reviewerName'));
 assert.ok(!output.includes('@'));
});
test('reference and response versions are explicit in the calibration',()=>{
 const run=sampledRun();
 assert.equal(run.calibration.referenceDigest,run.ref.digest);
 assert.equal(run.calibration.responseDigest,run.responses.digest);
});
test('calibration results are tied to the as-of date',()=>{
 const run=sampledRun();
 assert.equal(run.calibration.asOf,NEXT);
});
test('sample membership remains bounded by the declared population',()=>{
 const run=sampledRun();
 assert.equal(run.sample.population,36);
 assert.equal(run.sample.sampleSize,18);
});
test('response counts cannot silently exceed one response per reviewer and item',()=>{
 const run=sampledRun();
 assert.equal(run.responses.responses.length,36);
});
test('reviewer report order is deterministic across repeated runs',()=>{
 const first=sampledRun({seed:'stable'}),second=sampledRun({seed:'stable'});
 assert.deepEqual(first.calibration.reviewers.map(row=>row.reviewerToken),
  second.calibration.reviewers.map(row=>row.reviewerToken));
});
test('digest is stable across serialization round trips',()=>{
 const run=sampledRun();
 const parsed=JSON.parse(JSON.stringify(run.calibration));
 assert.equal(bodyHash(parsed),parsed.digest);
});

test('a calibration cannot be reused after the reference version changes',()=>{
 const run=sampledRun();
 const newer={...run.ref,version:2};
 newer.digest=bodyHash(newer);
 fails(()=>validateCalibration(run.calibration,{reference:newer,responseSet:run.responses,policy}),
  'STALE_CALIBRATION');
});
test('review response date remains bound to the calibration period',()=>{
 const run=sampledRun();
 assert.ok(run.responses.responses.every(row=>row.reviewedOn<=run.calibration.asOf));
});
test('a sample can be replayed only against its original reference digest',()=>{
 const run=sampledRun();
 const changed=reference({count:36,patch:{1:{tier:3}}});
 fails(()=>validateReviewSample(run.sample,changed),'STALE_SAMPLE');
});
test('report language selection changes only presentation fields',()=>{
 const run=sampledRun();
 const en=createQualityReport(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy,reportId:'report-language-en',lang:'en'});
 const fr=createQualityReport(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy,reportId:'report-language-fr',lang:'fr'});
 assert.equal(en.calibrationDigest,fr.calibrationDigest);
 assert.notEqual(en.labels.title,fr.labels.title);
});
test('quality metrics remain a descriptive audit and not an accessibility assertion',()=>{
 const run=sampledRun();
 const report=createQualityReport(run.calibration,{reference:run.ref,responseSet:run.responses,
  policy,reportId:'report-descriptive',lang:'en'});
 assert.equal(report.cautions.sampleBounded,true);
 assert.equal(report.cautions.noAutomaticAction,true);
});
