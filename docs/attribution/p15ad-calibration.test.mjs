import test from 'node:test';
import assert from 'node:assert/strict';
import {reference,responseSet,DAY,NEXT,POLICY,calibrationInputs} from './p15ad-fixtures.mjs';
import {createResponseSet} from './p15ad-reference.mjs';
import {createQualityPolicy,validateQualityPolicy,calibrateReviewers,validateCalibration,
 reviewerDisposition,calibrationSummary} from './p15ad-calibration.mjs';
import {QualityError,sha,bodyHash} from './p15ad-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);
function run(options={}){
 const ref=reference({count:options.count??12});
 const responses=responseSet({referenceSet:ref,reviewers:options.reviewers??['blind-alpha','blind-bravo'],
  accuracy:options.accuracy??1,abstainEvery:options.abstainEvery??0,
  unknownHandling:options.unknownHandling??'correct'});
 const policy=createQualityPolicy(options.policy??POLICY);
 return {reference:ref,responseSet:responses,policy,
  calibration:calibrateReviewers(ref,responses,{policy,calibrationId:'calibration-one',asOf:NEXT})};
}

test('quality policy is versioned and digest sealed',()=>{
 const value=createQualityPolicy(POLICY);assert.equal(validateQualityPolicy(value).digest,value.digest);
});
test('quality policy rejects zero minimum sample',()=>{
 fails(()=>createQualityPolicy({...POLICY,minimumScored:0}),'INTEGER');
});
test('quality policy rejects coverage outside unit interval',()=>{
 fails(()=>createQualityPolicy({...POLICY,minimumCoverage:1.2}),'FRACTION');
});
test('quality policy rejects unexpected fields',()=>{
 fails(()=>createQualityPolicy({...POLICY,autoSuspend:true}),'SHAPE');
});
test('quality policy detects tampering',()=>{
 const value=createQualityPolicy(POLICY),copy=structuredClone(value);copy.minimumAccuracy=0;
 fails(()=>validateQualityPolicy(copy),'HASH');
});
test('calibration evaluates every reviewer independently',()=>{
 const result=run().calibration;
 assert.equal(result.reviewers.length,2);
 assert.equal(result.reviewers[0].accuracy,1);
 assert.equal(result.reviewers[1].accuracy,1);
});
test('calibration binds reference and response digests',()=>{
 const result=run();
 assert.equal(result.calibration.referenceDigest,result.reference.digest);
 assert.equal(result.calibration.responseDigest,result.responseSet.digest);
});
test('calibration is deterministic for identical inputs',()=>{
 const first=run().calibration,second=run().calibration;
 assert.deepEqual(first,second);
});
test('calibration flags a reviewer with a poor accuracy sample',()=>{
 const result=run({accuracy:0.5}).calibration;
 assert.ok(result.reviewers.some(row=>row.disposition==='manual-review'||row.disposition==='insufficient-sample'));
});
test('calibration reports insufficient sample without adverse conclusion',()=>{
 const result=run({count:3}).calibration;
 assert.ok(result.reviewers.every(row=>row.disposition==='insufficient-sample'));
});
test('calibration reports coverage watch for excessive abstention',()=>{
 const result=run({abstainEvery:2}).calibration;
 assert.ok(result.reviewers.some(row=>row.disposition==='coverage-watch'||row.disposition==='insufficient-sample'));
});
test('calibration measures unknown handling separately',()=>{
 const result=run({unknownHandling:'overclaim'}).calibration;
 assert.ok(result.reviewers.every(row=>row.unknownRecall===0));
});
test('calibration rewards correct UNKNOWN handling',()=>{
 const result=run().calibration;
 assert.ok(result.reviewers.every(row=>row.unknownRecall===1));
});
test('calibration excludes UNKNOWN reference items from ordinary accuracy denominator',()=>{
 const result=run({count:9}).calibration;
 assert.equal(result.reviewers[0].totalEligible,6);
 assert.equal(result.reviewers[0].unknownReferenceCount,3);
});
test('calibration keeps all abstentions out of accuracy denominator',()=>{
 const result=run({abstainEvery:2}).calibration;
 assert.ok(result.reviewers.every(row=>row.abstained>0));
 assert.ok(result.reviewers.every(row=>row.scored<row.totalEligible));
});
test('calibration records Wilson confidence interval',()=>{
 const result=run().calibration.reviewers[0];
 assert.ok(result.accuracyInterval.lower<=result.accuracy);
 assert.ok(result.accuracyInterval.upper>=result.accuracy);
});
test('calibration does not automatically restrict a reviewer',()=>{
 const result=run({accuracy:0.5}).calibration;
 const flagged=result.reviewers.find(row=>row.disposition==='manual-review'||row.disposition==='insufficient-sample');
 const decision=reviewerDisposition(result,flagged.reviewerToken);
 assert.equal(decision.automaticAction,false);
});
test('reviewer disposition identifies missing reviewers',()=>{
 const result=run().calibration;
 fails(()=>reviewerDisposition(result,'blind-missing'),'REVIEWER_MISSING');
});
test('calibration summary is compact and digest-bound',()=>{
 const result=run().calibration,summary=calibrationSummary(result);
 assert.equal(summary.calibrationId,'calibration-one');
 assert.equal(summary.reviewers,2);
});
test('calibration validator recomputes metrics from inputs',()=>{
 const value=run();
 assert.equal(validateCalibration(value.calibration,{reference:value.reference,
  responseSet:value.responseSet,policy:value.policy}).digest,value.calibration.digest);
});
test('calibration validator detects altered accuracy',()=>{
 const value=run(),changed=structuredClone(value.calibration);
 changed.reviewers[0].accuracy=0;
 fails(()=>validateCalibration(changed,{reference:value.reference,
  responseSet:value.responseSet,policy:value.policy}),'HASH');
});
test('calibration rejects an as-of date before reference creation',()=>{
 const value=run();
 fails(()=>calibrateReviewers(value.reference,value.responseSet,{policy:value.policy,
  calibrationId:'calibration-old',asOf:'2026-11-20'}),'DATE');
});
test('calibration rejects missing response reference evidence',()=>{
 const value=run(),changed={...value.responseSet,responses:value.responseSet.responses.map((row,index)=>
  index===0?{...row,evidenceDigest:sha('stale')}:row)};
 changed.digest=sha({schema:changed.schema,responseSetId:changed.responseSetId,
  createdOn:changed.createdOn,responses:changed.responses});
 fails(()=>calibrateReviewers(value.reference,changed,{policy:value.policy,
  calibrationId:'calibration-stale',asOf:NEXT}),'STALE_EVIDENCE');
});
test('calibration rejects identity-bearing reviewer fields',()=>{
 const value=run(),changed={...value.responseSet,responses:value.responseSet.responses.map((row,index)=>
  index===0?{...row,reviewerName:'Example'}:row)};
 changed.digest=sha({schema:changed.schema,responseSetId:changed.responseSetId,
  createdOn:changed.createdOn,responses:changed.responses});
 fails(()=>calibrateReviewers(value.reference,changed,{policy:value.policy,
  calibrationId:'calibration-private',asOf:NEXT}),'SHAPE');
});
test('calibration report has deterministic reviewer order',()=>{
 const value=run({reviewers:['blind-zeta','blind-alpha']}).calibration;
 assert.deepEqual(value.reviewers.map(row=>row.reviewerToken),['blind-alpha','blind-zeta']);
});
test('calibration distinguishes abstention from incorrect answer',()=>{
 const value=run({abstainEvery:3}).calibration;
 assert.ok(value.reviewers.every(row=>row.abstained>0));
 assert.ok(value.reviewers.every(row=>row.incorrect>=0));
});
test('calibration summary rejects a forged digest',()=>{
 const value=run().calibration;value.digest='f'.repeat(64);
 fails(()=>calibrationSummary(value),'HASH');
});

test('calibration records cohort-level scored denominator separately from all eligible items',()=>{
 const value=run({count:18}).calibration;
 assert.equal(value.cohort.scored,value.reviewers.reduce((sum,row)=>sum+row.scored,0));
});
test('calibration never treats an unknown reference as a correct known-state prediction',()=>{
 const value=run({count:12,unknownHandling:'overclaim'}).calibration;
 assert.ok(value.reviewers.every(row=>row.unknownCorrect===0));
 assert.ok(value.reviewers.every(row=>row.unknownRecall===0));
});
test('calibration keeps unknown-reference sample count independent of abstentions',()=>{
 const value=run({count:12,abstainEvery:2}).calibration;
 assert.ok(value.reviewers.every(row=>row.unknownReferenceCount===4));
});
test('calibration computes class-level precision and recall from confusion matrix',()=>{
 const value=run().calibration.reviewers[0];
 assert.equal(value.macroRecall,1);
 assert.equal(value.macroF1,1);
});
test('calibration exposes scored, correct and incorrect counts consistently',()=>{
 const value=run({accuracy:0.5}).calibration.reviewers[0];
 assert.equal(value.correct+value.incorrect,value.scored);
});
test('calibration cohort accuracy is a micro average, not an average of reviewer averages',()=>{
 const value=run().calibration;
 const expected=value.cohort.correct/value.cohort.scored;
 assert.equal(value.cohort.accuracy,expected);
});
test('calibration policy can require a higher minimum sample',()=>{
 const policy=createQualityPolicy({...POLICY,minimumScored:10});
 const ref=reference({count:12}),responses=responseSet({referenceSet:ref});
 const result=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-threshold',asOf:NEXT});
 assert.ok(result.reviewers.every(row=>row.disposition==='insufficient-sample'));
});
test('calibration policy can require higher unknown-state recall',()=>{
 const policy=createQualityPolicy({...POLICY,minimumUnknownRecall:1});
 const ref=reference({count:12}),responses=responseSet({referenceSet:ref,unknownHandling:'overclaim'});
 const result=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-unknown',asOf:NEXT});
 assert.ok(result.reviewers.every(row=>row.disposition==='unknown-handling-watch'));
});
test('calibration policy can constrain abstention rate',()=>{
 const policy=createQualityPolicy({...POLICY,maximumAbstention:0});
 const ref=reference({count:12}),responses=responseSet({referenceSet:ref,abstainEvery:2});
 const result=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-abstain',asOf:NEXT});
 assert.ok(result.reviewers.every(row=>row.disposition==='coverage-watch'||row.disposition==='abstention-watch'));
});
test('calibration policy can require near-perfect accuracy',()=>{
 const policy=createQualityPolicy({...POLICY,minimumAccuracy:1});
 const ref=reference({count:12}),responses=responseSet({referenceSet:ref,accuracy:0.5});
 const result=calibrateReviewers(ref,responses,{policy,calibrationId:'cal-accuracy',asOf:NEXT});
 assert.ok(result.reviewers.every(row=>row.disposition==='manual-review'||row.disposition==='insufficient-sample'));
});
test('calibration policy rejects a negative watch threshold',()=>{
 fails(()=>createQualityPolicy({...POLICY,watchAccuracyDrop:-0.1}),'FRACTION');
});
test('calibration reviewer order is stable regardless of input response order',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const reversed=createResponseSet({...responses,responses:[...responses.responses].reverse()});
 const first=calibrateReviewers(ref,responses,{policy:createQualityPolicy(POLICY),calibrationId:'cal-first',asOf:NEXT});
 const second=calibrateReviewers(ref,reversed,{policy:createQualityPolicy(POLICY),calibrationId:'cal-second',asOf:NEXT});
 assert.deepEqual(first.reviewers,second.reviewers);
});
test('calibration validator rejects mismatched response set even if the summary is valid',()=>{
 const value=run(),other=responseSet({referenceSet:value.reference,accuracy:0.5});
 fails(()=>validateCalibration(value.calibration,{reference:value.reference,responseSet:other,
  policy:value.policy}),'STALE_CALIBRATION');
});
test('reviewer disposition does not create a suspension or access restriction',()=>{
 const value=run({accuracy:0.5}).calibration;
 const result=reviewerDisposition(value,value.reviewers[0].reviewerToken);
 assert.equal(result.automaticAction,false);
 assert.equal(result.requiresHumanReview,true);
});
test('calibration report flags reviewer only after configured sample minimum',()=>{
 const value=run({count:3,accuracy:0.2}).calibration;
 assert.ok(value.reviewers.every(row=>row.disposition==='insufficient-sample'));
});
