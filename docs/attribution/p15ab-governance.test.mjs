import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,tasks,DAY,NEXT,LATER} from './p15ab-fixtures.mjs';
import {buildAssignmentPlan} from './p15ab-assign.mjs';
import {reassignAfterRecusal,validateReassignment,assignAdjudicator,validateAdjudicatorAssignment,
 simulateSeedFairness,validateFairnessSimulation} from './p15ab-governance.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const policy={balanceWeight:30,specialtyWeight:5,maxAssignmentsPerGroup:10,allowPartial:true};
const input=()=>({roster:roster(),conflicts:conflicts(),taskSet:tasks({count:2})});
const plan=()=>buildAssignmentPlan({planId:'plan-governance',...input(),asOf:DAY,seed:'governance-seed',policy});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('reassignment after recusal produces a new plan and audit record',()=>{
 const options=input(),value=plan(),task=value.assignments[0],recused=task.reviewerIds[0];
 const result=reassignAfterRecusal(value,{taskId:task.taskId,recusedReviewerIds:[recused],
  reason:'Reviewer declared a conflict after allocation',at:NEXT,actor:'coordinator',seed:'recusal-seed'},
  {...options,policy});
 assert.ok(!result.reassignment.reviewerIds.includes(recused));
 assert.ok(result.reassignment.addedReviewerIds.length>0);
 assert.equal(validateReassignment(result.reassignment).digest,result.reassignment.digest);
});
test('reassignment refuses a reviewer not assigned to the target task',()=>{
 const options=input(),value=plan();
 fails(()=>reassignAfterRecusal(value,{taskId:'task-1',recusedReviewerIds:['reviewer-not-assigned'],
  reason:'Recusal',at:NEXT,actor:'coordinator',seed:'recusal-seed'},{...options,policy}),'RECUSAL');
});
test('reassignment requires a nonempty recusal set',()=>{
 const options=input(),value=plan();
 fails(()=>reassignAfterRecusal(value,{taskId:'task-1',recusedReviewerIds:[],
  reason:'Recusal',at:NEXT,actor:'coordinator',seed:'recusal-seed'},{...options,policy}),'RECUSAL');
});
test('reassignment does not retain a recused reviewer in the new assignment',()=>{
 const options=input(),value=plan(),row=value.assignments[0],recused=row.reviewerIds[0];
 const result=reassignAfterRecusal(value,{taskId:row.taskId,recusedReviewerIds:[recused],
  reason:'Conflict declaration',at:NEXT,actor:'coordinator',seed:'new-seed'},{...options,policy});
 assert.ok(!result.plan.assignments.find(item=>item.taskId===row.taskId).reviewerIds.includes(recused));
});
test('reassignment record detects digest tampering',()=>{
 const options=input(),value=plan(),row=value.assignments[0];
 const result=reassignAfterRecusal(value,{taskId:row.taskId,recusedReviewerIds:[row.reviewerIds[0]],
  reason:'Conflict declaration',at:NEXT,actor:'coordinator',seed:'new-seed'},{...options,policy});
 const changed={...result.reassignment,reason:'Changed'};
 fails(()=>validateReassignment(changed),'HASH');
});
test('reassignment records previous and next plan digests',()=>{
 const options=input(),value=plan(),row=value.assignments[0];
 const result=reassignAfterRecusal(value,{taskId:row.taskId,recusedReviewerIds:[row.reviewerIds[0]],
  reason:'Conflict declaration',at:NEXT,actor:'coordinator',seed:'new-seed'},{...options,policy});
 assert.equal(result.reassignment.previousPlanDigest,value.digest);
 assert.equal(result.reassignment.nextPlanDigest,result.plan.digest);
});
test('adjudicator is assigned from a separate reviewer group',()=>{
 const base=roster(),reviewers=base.reviewers.map(row=>row.reviewerId==='reviewer-d'?
  {...row,role:'adjudicator',groupId:'group-adjudicator'}:row);
 const adjudicatorRoster={...base,reviewers};
 adjudicatorRoster.digest=sha256((({digest,...rest})=>rest)(adjudicatorRoster));
 const options={...input(),roster:adjudicatorRoster},value=buildAssignmentPlan({planId:'plan-adj',
  ...options,asOf:DAY,seed:'adjudicator-seed',policy});
 const result=assignAdjudicator({taskId:'task-1',planInput:value,...options,asOf:DAY,seed:'adjudicator-seed'});
 assert.ok(result.assignment.reviewerGroupsExcluded.every(group=>group!=='group-adjudicator'));
 assert.equal(validateAdjudicatorAssignment(result.assignment).digest,result.assignment.digest);
});
test('adjudicator token does not reveal reviewer identity',()=>{
 const base=roster(),reviewers=base.reviewers.map(row=>row.reviewerId==='reviewer-d'?
  {...row,role:'adjudicator',groupId:'group-adjudicator'}:row);
 const adjudicatorRoster={...base,reviewers};adjudicatorRoster.digest=sha256((({digest,...rest})=>rest)(adjudicatorRoster));
 const options={...input(),roster:adjudicatorRoster},value=buildAssignmentPlan({planId:'plan-adj',
  ...options,asOf:DAY,seed:'adjudicator-seed',policy});
 const result=assignAdjudicator({taskId:'task-1',planInput:value,...options,asOf:DAY,seed:'adjudicator-seed'});
 assert.ok(!result.assignment.adjudicatorToken.includes('reviewer-d'));
});
test('adjudicator allocation refuses a reviewer already on the task',()=>{
 const options=input(),value=plan();
 fails(()=>assignAdjudicator({taskId:'task-1',planInput:value,...options,asOf:DAY,seed:'seed'}),
  'NO_ADJUDICATOR');
});
test('adjudicator allocation refuses a declared conflict',()=>{
 const base=roster(),reviewers=base.reviewers.map(row=>row.reviewerId==='reviewer-d'?
  {...row,role:'adjudicator',groupId:'group-adjudicator'}:row);
 const adjudicatorRoster={...base,reviewers};adjudicatorRoster.digest=sha256((({digest,...rest})=>rest)(adjudicatorRoster));
 const conflict=conflicts([{conflictId:'conflict-adj',reviewerId:'reviewer-d',scope:'record',
  scopeId:'record-1',declaredOn:DAY,expiresOn:LATER,reason:'Declared conflict',source:'Self declaration'}]);
 const options={roster:adjudicatorRoster,conflicts:conflict,taskSet:tasks({count:1})};
 const value=buildAssignmentPlan({planId:'plan-adj',...options,asOf:DAY,seed:'seed',policy});
 fails(()=>assignAdjudicator({taskId:'task-1',planInput:value,...options,asOf:DAY,seed:'seed'}),'NO_ADJUDICATOR');
});
test('fairness simulation runs a bounded deterministic seed set',()=>{
 const options=input(),result=simulateSeedFairness({...options,asOf:DAY,
  seeds:['seed-a','seed-b','seed-c'],policy});
 assert.equal(result.runs.length,3);assert.equal(validateFairnessSimulation(result).digest,result.digest);
});
test('fairness simulation is deterministic for the same seeds',()=>{
 const options=input(),args={...options,asOf:DAY,seeds:['seed-a','seed-b'],policy};
 assert.deepEqual(simulateSeedFairness(args),simulateSeedFairness(args));
});
test('fairness simulation rejects duplicate seeds',()=>{
 const options=input();fails(()=>simulateSeedFairness({...options,asOf:DAY,seeds:['seed-a','seed-a'],policy}),'DUPLICATE');
});
test('fairness simulation rejects more than one hundred seeds',()=>{
 const options=input();fails(()=>simulateSeedFairness({...options,asOf:DAY,
  seeds:Array.from({length:101},(_,index)=>`seed-${index}`),policy}),'LIMIT');
});
test('fairness simulation detects changed metrics',()=>{
 const options=input(),result=simulateSeedFairness({...options,asOf:DAY,seeds:['seed-a'],policy});
 const changed={...result,aggregate:{...result.aggregate,meanGini:1}};
 fails(()=>validateFairnessSimulation(changed),'HASH');
});
