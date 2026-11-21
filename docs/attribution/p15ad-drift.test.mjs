import test from 'node:test';
import assert from 'node:assert/strict';
import {reference,responseSet,DAY,NEXT,LATER,POLICY} from './p15ad-fixtures.mjs';
import {createQualityPolicy,calibrateReviewers} from './p15ad-calibration.mjs';
import {compareReviewerWindows,buildCohortDriftReport,verifyDriftReport} from './p15ad-drift.mjs';
import {QualityError,sha} from './p15ad-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);
const policy=createQualityPolicy(POLICY);
function calibration({accuracy=1,reviewedOn=NEXT,referenceSet=reference()}={}){
 const responses=responseSet({referenceSet,reviewers:['blind-alpha','blind-bravo'],accuracy,reviewedOn});
 return calibrateReviewers(referenceSet,responses,{policy,calibrationId:`cal-${reviewedOn}-${accuracy===1?'perfect':'lower'}`,
  asOf:reviewedOn});
}
function windows(){
 return [
  {windowId:'window-one',from:DAY,to:NEXT,calibration:calibration({accuracy:1,reviewedOn:NEXT})},
  {windowId:'window-two',from:LATER,to:LATER,calibration:calibration({accuracy:0.5,reviewedOn:LATER})},
 ];
}

test('reviewer drift compares two ordered nonoverlapping windows',()=>{
 const result=compareReviewerWindows(windows(),{reviewerToken:'blind-alpha',policy});
 assert.equal(result.windows.length,2);assert.equal(result.comparisons.length,1);
});
test('reviewer drift flags a meaningful decline for human review',()=>{
 const result=compareReviewerWindows(windows(),{reviewerToken:'blind-alpha',policy});
 assert.ok(['watch','regression-signal'].includes(result.comparisons[0].status));
 assert.equal(result.automaticRestriction,false);
});
test('reviewer drift refuses an unknown reviewer token',()=>{
 fails(()=>compareReviewerWindows(windows(),{reviewerToken:'blind-missing',policy}),'REVIEWER_MISSING');
});
test('reviewer drift requires at least two windows',()=>{
 fails(()=>compareReviewerWindows(windows().slice(0,1),{reviewerToken:'blind-alpha',policy}),'WINDOWS');
});
test('reviewer drift rejects overlapping date windows',()=>{
 const values=windows();values[1].from=NEXT;
 fails(()=>compareReviewerWindows(values,{reviewerToken:'blind-alpha',policy}),'WINDOW_OVERLAP');
});
test('reviewer drift rejects reversed date windows',()=>{
 const values=windows();values[0].from=LATER;values[0].to=DAY;
 fails(()=>compareReviewerWindows(values,{reviewerToken:'blind-alpha',policy}),'DATE_ORDER');
});
test('reviewer drift rejects a calibration digest that has been altered',()=>{
 const values=windows();values[0].calibration.digest='f'.repeat(64);
 fails(()=>compareReviewerWindows(values,{reviewerToken:'blind-alpha',policy}),'HASH');
});
test('reviewer drift reports insufficient sample rather than a regression',()=>{
 const small=reference({count:3});
 const values=[
  {windowId:'window-one',from:DAY,to:NEXT,calibration:calibration({referenceSet:small,reviewedOn:NEXT})},
  {windowId:'window-two',from:LATER,to:LATER,calibration:calibration({referenceSet:small,reviewedOn:LATER,accuracy:0.5})},
 ];
 const result=compareReviewerWindows(values,{reviewerToken:'blind-alpha',policy});
 assert.equal(result.comparisons[0].status,'insufficient-sample');
});
test('cohort drift report compares adjacent cohort summaries',()=>{
 const result=buildCohortDriftReport(windows(),{policy});
 assert.equal(result.comparisons.length,1);
 assert.equal(result.summary.automaticRestriction,false);
});
test('cohort drift report is digest sealed',()=>{
 const result=buildCohortDriftReport(windows(),{policy});
 assert.equal(verifyDriftReport(result).digest,result.digest);
});
test('cohort drift report detects tampering',()=>{
 const result=buildCohortDriftReport(windows(),{policy}),copy=structuredClone(result);
 copy.summary.watches++;
 fails(()=>verifyDriftReport(copy),'HASH');
});
test('cohort drift report refuses automatic restriction flag',()=>{
 const result=buildCohortDriftReport(windows(),{policy});
 result.summary.automaticRestriction=true;
 result.digest=sha((({digest,...rest})=>rest)(result));
 fails(()=>verifyDriftReport(result),'AUTOMATION');
});
test('cohort drift report does not compare windows that overlap',()=>{
 const values=windows();values[1].from=NEXT;
 fails(()=>buildCohortDriftReport(values,{policy}),'WINDOW_OVERLAP');
});
test('cohort drift report sorts out-of-order windows deterministically',()=>{
 const values=windows().reverse();
 const result=buildCohortDriftReport(values,{policy});
 assert.equal(result.comparisons[0].fromWindow,'window-one');
});

test('reviewer drift includes accuracy intervals for adjacent windows',()=>{
 const result=compareReviewerWindows(windows(),{reviewerToken:'blind-alpha',policy});
 assert.ok(result.comparisons[0].previousInterval);
 assert.ok(result.comparisons[0].currentInterval);
});
test('reviewer drift distinguishes stable performance from regression',()=>{
 const values=[
  {windowId:'window-one',from:DAY,to:NEXT,calibration:calibration({accuracy:1,reviewedOn:NEXT})},
  {windowId:'window-two',from:LATER,to:LATER,calibration:calibration({accuracy:1,reviewedOn:LATER})},
 ];
 const result=compareReviewerWindows(values,{reviewerToken:'blind-alpha',policy});
 assert.equal(result.comparisons[0].status,'stable');
});
test('reviewer drift returns not-comparable when a reviewer is absent from one window',()=>{
 const values=windows();
 values[1].calibration.reviewers=values[1].calibration.reviewers.filter(row=>row.reviewerToken!=='blind-alpha');
 values[1].calibration.digest=sha((({digest,...rest})=>rest)(values[1].calibration));
 const result=compareReviewerWindows(values,{reviewerToken:'blind-alpha',policy});
 assert.equal(result.comparisons[0].status,'not-comparable');
});
test('reviewer drift records explicit no-restriction outcome',()=>{
 const result=compareReviewerWindows(windows(),{reviewerToken:'blind-alpha',policy});
 assert.equal(result.automaticRestriction,false);
 assert.ok(result.needsHumanReview===true||result.needsHumanReview===false);
});
test('cohort drift report counts comparison categories',()=>{
 const result=buildCohortDriftReport(windows(),{policy});
 assert.equal(result.summary.comparisons,1);
 assert.equal(result.summary.regressions+result.summary.watches<=1,true);
});
test('cohort drift report keeps previous and current sample denominators',()=>{
 const result=buildCohortDriftReport(windows(),{policy});
 const row=result.comparisons[0];
 assert.ok(row.previous.scored>0);
 assert.ok(row.current.scored>0);
});
test('cohort drift report refuses empty comparison list',()=>{
 fails(()=>buildCohortDriftReport([],{policy}),'WINDOWS');
});
test('cohort drift report refuses one comparison window',()=>{
 fails(()=>buildCohortDriftReport(windows().slice(0,1),{policy}),'WINDOWS');
});
test('cohort drift report bounds number of windows',()=>{
 const values=Array.from({length:101},(_,index)=>({
  windowId:`window-${index}`,from:`2026-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,
  to:`2026-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,
  calibration:windows()[0].calibration,
 }));
 fails(()=>buildCohortDriftReport(values,{policy}),'WINDOWS');
});
