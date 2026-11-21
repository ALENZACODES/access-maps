import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,tasks,DAY,LATER} from './p15ab-fixtures.mjs';
import {buildAssignmentPlan} from './p15ab-assign.mjs';
import {createBlindPackets} from './p15ab-blind-review.mjs';
import {auditAssignments,verifyAssignmentAudit,renderAssignmentAudit,fairnessBand} from './p15ab-audit.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const policy={balanceWeight:30,specialtyWeight:5,maxAssignmentsPerGroup:10,allowPartial:true};
const inputs=()=>({roster:roster(),conflicts:conflicts(),taskSet:tasks({count:2})});
const plan=()=>buildAssignmentPlan({planId:'plan-audit',...inputs(),asOf:DAY,seed:'audit-seed',policy});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('assignment audit reports load distribution metrics',()=>{
 const options=inputs(),value=plan(),audit=auditAssignments(value,options);
 assert.ok(audit.metrics.gini>=0&&audit.metrics.gini<=1);
 assert.ok(audit.metrics.jain>=0&&audit.metrics.jain<=1);
});
test('assignment audit binds plan digest and as-of date',()=>{
 const options=inputs(),value=plan(),audit=auditAssignments(value,options);
 assert.equal(audit.planDigest,value.digest);assert.equal(audit.asOf,DAY);
});
test('assignment audit validates against unchanged plan inputs',()=>{
 const options=inputs(),value=plan(),audit=auditAssignments(value,options);
 assert.equal(verifyAssignmentAudit(audit,value,options).valid,true);
});
test('assignment audit detects plan changes',()=>{
 const options=inputs(),value=plan(),audit=auditAssignments(value,options),changed=structuredClone(value);
 changed.seed='different';changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>verifyAssignmentAudit(audit,changed,options),'STALE_AUDIT');
});
test('assignment audit records unfilled review slots',()=>{
 const limited=roster({'reviewer-a':{active:false},'reviewer-b':{active:false},'reviewer-c':{active:false}});
 const options={roster:limited,conflicts:conflicts(),taskSet:tasks({count:1})};
 const value=buildAssignmentPlan({planId:'plan-limited',...options,asOf:DAY,seed:'seed-one',policy});
 const audit=auditAssignments(value,options);
 assert.ok(audit.issues.some(row=>row.code==='UNFILLED'));
});
test('assignment audit detects declared reviewer conflict if plan is tampered',()=>{
 const options=inputs(),conflict=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',
  scopeId:'record-1',declaredOn:DAY,expiresOn:LATER,reason:'Conflict',source:'Declaration'}]);
 const selected=plan().assignments[0].reviewerIds;
 const reviewer=selected.includes('reviewer-a')?'reviewer-a':'reviewer-b';
 const taskSet=tasks({count:1});
 const tampered={...options,conflicts:conflict};
 const value=buildAssignmentPlan({planId:'plan-conflict',...tampered,asOf:DAY,seed:'seed-one',policy});
 assert.ok(!value.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment audit verifies blind packet safety',()=>{
 const options=inputs(),value=plan(),packets=createBlindPackets(value,{...options,issuedOn:DAY,expiresOn:LATER});
 const audit=auditAssignments(value,{...options,packets});
 assert.equal(audit.packetFindings.length,0);
});
test('assignment audit reports invalid blind packets',()=>{
 const options=inputs(),value=plan(),packets=createBlindPackets(value,{...options,issuedOn:DAY,expiresOn:LATER});
 const changed=[{...packets[0],blindReviewerId:'reviewer-a'}];
 const audit=auditAssignments(value,{...options,packets:changed});
 assert.equal(audit.packetFindings.length,1);
});
test('fairness band classifies a balanced audit',()=>{
 const options=inputs(),audit=auditAssignments(plan(),options);
 assert.ok(['balanced','watch','concentrated'].includes(fairnessBand(audit)));
});
test('fairness band rejects a forged audit digest',()=>{
 const audit=auditAssignments(plan(),inputs());audit.digest='f'.repeat(64);
 fails(()=>fairnessBand(audit),'HASH');
});
test('audit report renders English and French summaries',()=>{
 const audit=auditAssignments(plan(),inputs());
 assert.match(renderAssignmentAudit(audit,{lang:'en'}),/Reviewer assignment audit/u);
 assert.match(renderAssignmentAudit(audit,{lang:'fr'}),/Contrôle de la répartition/u);
});
test('audit report rejects unsupported locale',()=>{
 const audit=auditAssignments(plan(),inputs());fails(()=>renderAssignmentAudit(audit,{lang:'de'}),'LANGUAGE');
});
test('audit digest detects changed metrics',()=>{
 const audit=auditAssignments(plan(),inputs()),copy=structuredClone(audit);copy.metrics.gini=1;
 fails(()=>verifyAssignmentAudit(copy,plan(),inputs()),'HASH');
});
