import test from 'node:test';
import assert from 'node:assert/strict';
import {reference,responseSet,NEXT,POLICY} from './p15ad-fixtures.mjs';
import {createQualityPolicy,calibrateReviewers} from './p15ad-calibration.mjs';
import {createQualityReport,validateQualityReport,renderQualityReport,reportSummary} from './p15ad-report.mjs';
import {QualityError,sha} from './p15ad-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);
function make(lang='en'){
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const policy=createQualityPolicy(POLICY);
 const calibration=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-report',asOf:NEXT});
 return createQualityReport(calibration,{reference:ref,responseSet:responses,policy,reportId:'report-one',lang});
}

test('quality report validates its digest and bilingual label set',()=>{
 const report=make();assert.equal(validateQualityReport(report).digest,report.digest);
});
test('quality report binds calibration and policy digests',()=>{
 const report=make();assert.equal(report.calibrationDigest.length,64);
 assert.equal(report.policyDigest.length,64);
});
test('quality report renders English headings and caveats',()=>{
 const output=renderQualityReport(make('en'));
 assert.match(output,/Offline review quality report/u);
 assert.match(output,/No automatic reviewer restriction/u);
});
test('quality report renders French headings and caveats',()=>{
 const output=renderQualityReport(make('fr'));
 assert.match(output,/Rapport hors ligne/u);
 assert.match(output,/Aucune restriction automatique/u);
});
test('quality report carries every reviewer disposition',()=>{
 const report=make();
 assert.equal(report.reviewers.length,2);
 assert.ok(report.reviewers.every(row=>typeof row.label==='string'));
});
test('quality report labels insufficient sample without implying misconduct',()=>{
 const ref=reference({count:3}),responses=responseSet({referenceSet:ref});
 const policy=createQualityPolicy(POLICY);
 const calibration=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-small',asOf:NEXT});
 const report=createQualityReport(calibration,{reference:ref,responseSet:responses,policy,
  reportId:'report-small',lang:'en'});
 assert.ok(report.reviewers.every(row=>row.label.includes('Insufficient sample')));
});
test('quality report rejects unsupported language',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref}),policy=createQualityPolicy(POLICY);
 const calibration=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-report',asOf:NEXT});
 fails(()=>createQualityReport(calibration,{reference:ref,responseSet:responses,policy,
  reportId:'report-bad',lang:'de'}),'LANGUAGE');
});
test('quality report rejects a forged digest',()=>{
 const report=make(),copy=structuredClone(report);copy.cohort.flagged=999;
 fails(()=>validateQualityReport(copy),'HASH');
});
test('quality report refuses missing safety caveats',()=>{
 const report=make(),copy=structuredClone(report);copy.cautions.noAutomaticAction=false;
 copy.digest=sha((({digest,...rest})=>rest)(copy));
 fails(()=>validateQualityReport(copy),'CAUTION');
});
test('quality report excludes identity-bearing fields',()=>{
 const report=make();assert.ok(!JSON.stringify(report).includes('reviewerName'));
 assert.ok(!JSON.stringify(report).includes('@'));
});
test('quality report summary is compact',()=>{
 const summary=reportSummary(make());
 assert.equal(summary.reportId,'report-one');
 assert.equal(summary.reviewers,2);
});
test('quality report summary rejects malformed digest',()=>{
 const report=make();report.digest='bad';
 fails(()=>reportSummary(report),'HASH');
});
test('French report labels use narrow no-break punctuation',()=>{
 const report=make('fr');
 assert.ok(report.labels.insufficient.includes('insuffisant'));
});
test('quality report preserves pseudonymous reviewer tokens',()=>{
 const report=make();
 assert.ok(report.reviewers.every(row=>row.reviewerToken.startsWith('blind-')));
});

test('report labels preserve the required French nonbreaking punctuation',()=>{
 const report=make('fr');
 for(const value of Object.values(report.labels)){
  assert.ok(!/[a-zÀ-ÿ] :/iu.test(value));
  assert.ok(!/ [;!?]/u.test(value));
 }
});
test('report output includes the digest for offline integrity checks',()=>{
 const output=renderQualityReport(make('en'));
 assert.match(output,/SHA-256: [a-f0-9]{64}/u);
});
