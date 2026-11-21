import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,tasks,DAY,NEXT,LATER,HASH} from './p15ab-fixtures.mjs';
import {buildAssignmentPlan,validateAssignmentPlan,assignmentSummary} from './p15ab-assign.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const policy={balanceWeight:30,specialtyWeight:5,maxAssignmentsPerGroup:10,allowPartial:true};
const make=(patch={})=>buildAssignmentPlan({planId:'plan-one',roster:roster(),conflicts:conflicts(),
 taskSet:tasks(),asOf:DAY,seed:'seed-one',policy:{...policy,...patch}});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('assignment plan allocates every task to distinct reviewer groups',()=>{
 const plan=make();assert.equal(plan.assignments.length,2);
 for(const row of plan.assignments){assert.equal(row.assigned,2);assert.equal(new Set(row.groups).size,2);}
});
test('assignment plan is deterministic for the same seed and inputs',()=>{
 assert.deepEqual(make(),make());
});
test('assignment plan validates against exact roster and conflict revisions',()=>{
 const plan=make();assert.equal(validateAssignmentPlan(plan,{roster:roster(),conflicts:conflicts(),
  taskSet:tasks()}).digest,plan.digest);
});
test('assignment plan changes deterministically when seed changes',()=>{
 const first=make(),second=buildAssignmentPlan({planId:'plan-one',roster:roster(),conflicts:conflicts(),
  taskSet:tasks(),asOf:DAY,seed:'seed-two',policy});
 assert.notDeepEqual(first.assignments,second.assignments);
});
test('assignment plan rejects an invalid policy weight',()=>{
 fails(()=>make({balanceWeight:0}),'INTEGER');
});
test('assignment plan rejects nonboolean partial policy',()=>{
 fails(()=>make({allowPartial:'yes'}),'POLICY');
});
test('assignment plan rejects invalid seed',()=>{
 fails(()=>buildAssignmentPlan({planId:'plan-one',roster:roster(),conflicts:conflicts(),
  taskSet:tasks(),asOf:DAY,seed:'Bad Seed',policy}),'ID');
});
test('assignment plan prioritizes critical tasks before normal tasks',()=>{
 const plan=make();assert.equal(plan.assignments[0].taskId,'task-1');
});
test('assignment plan respects declared record conflicts',()=>{
 const conflict=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',
  scopeId:'record-1',declaredOn:DAY,expiresOn:LATER,reason:'Declared conflict',source:'Self declaration'}]);
 const plan=buildAssignmentPlan({planId:'plan-conflict',roster:roster(),conflicts:conflict,
  taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
 assert.ok(!plan.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment plan respects source-group conflict declarations',()=>{
 const conflict=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'source',
  scopeId:'source-group-1',declaredOn:DAY,expiresOn:LATER,reason:'Source conflict',source:'Self declaration'}]);
 const plan=buildAssignmentPlan({planId:'plan-conflict',roster:roster(),conflicts:conflict,
  taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
 assert.ok(!plan.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment plan respects operator-group conflict declarations',()=>{
 const conflict=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'operator-group',
  scopeId:'operator-one',declaredOn:DAY,expiresOn:LATER,reason:'Operator conflict',source:'Self declaration'}]);
 const taskSet=tasks({count:1,patch:{0:{operatorGroupId:'operator-one'}}});
 const plan=buildAssignmentPlan({planId:'plan-conflict',roster:roster(),conflicts:conflict,
  taskSet,asOf:DAY,seed:'seed-one',policy});
 assert.ok(!plan.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment plan respects geographic-cell conflict declarations',()=>{
 const conflict=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'geographic-cell',
  scopeId:'cell-1',declaredOn:DAY,expiresOn:LATER,reason:'Cell conflict',source:'Self declaration'}]);
 const plan=buildAssignmentPlan({planId:'plan-conflict',roster:roster(),conflicts:conflict,
  taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
 assert.ok(!plan.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment plan respects reviewer capacity',()=>{
 const limited=roster({'reviewer-a':{capacity:0,maxPerDay:0}});
 const plan=buildAssignmentPlan({planId:'plan-limited',roster:limited,conflicts:conflicts(),
  taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
 assert.ok(!plan.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment plan respects reviewer daily capacity',()=>{
 const limited=roster({'reviewer-a':{maxPerDay:0}});
 const plan=buildAssignmentPlan({planId:'plan-limited',roster:limited,conflicts:conflicts(),
  taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
 assert.ok(!plan.assignments[0].reviewerIds.includes('reviewer-a'));
});
test('assignment plan leaves tasks queued when independent groups are unavailable',()=>{
 const limited=roster({'reviewer-a':{active:false},'reviewer-b':{active:false},
  'reviewer-c':{active:false}});
 const plan=buildAssignmentPlan({planId:'plan-limited',roster:limited,conflicts:conflicts(),
  taskSet:tasks({count:1}),asOf:DAY,seed:'seed-one',policy});
 assert.equal(plan.assignments[0].status,'queued');assert.equal(plan.unfilled.length,1);
});
test('assignment plan does not duplicate a reviewer within a task',()=>{
 const plan=make();for(const row of plan.assignments)assert.equal(new Set(row.reviewerIds).size,row.reviewerIds.length);
});
test('assignment plan balances assignments across available reviewers',()=>{
 const taskSet=tasks({count:4,patch:{0:{requiredReviewers:1,minimumGroups:1},
  1:{requiredReviewers:1,minimumGroups:1},2:{requiredReviewers:1,minimumGroups:1},3:{requiredReviewers:1,minimumGroups:1}}});
 const plan=buildAssignmentPlan({planId:'plan-fair',roster:roster(),conflicts:conflicts(),taskSet,
  asOf:DAY,seed:'fair-seed',policy});
 const values=plan.loads.map(row=>row.assigned).filter(value=>value>0);
 assert.ok(Math.max(...values)-Math.min(...values)<=1);
});
test('assignment plan binds roster digest and rejects stale roster',()=>{
 const plan=make(),changed=roster({'reviewer-a':{capacity:4,maxPerDay:4}});
 fails(()=>validateAssignmentPlan(plan,{roster:changed,conflicts:conflicts(),taskSet:tasks()}),'STALE');
});
test('assignment plan binds conflict register digest',()=>{
 const plan=make(),changed=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',
  scopeId:'record-1',declaredOn:DAY,expiresOn:LATER,reason:'Declared',source:'Self declaration'}]);
 fails(()=>validateAssignmentPlan(plan,{roster:roster(),conflicts:changed,taskSet:tasks()}),'STALE');
});
test('assignment plan binds task set digest',()=>{
 const plan=make(),changed=tasks({patch:{0:{priority:'low'}}});
 fails(()=>validateAssignmentPlan(plan,{roster:roster(),conflicts:conflicts(),taskSet:changed}),'STALE');
});
test('assignment plan digest detects modified reviewer assignment',()=>{
 const plan=make(),copy=structuredClone(plan);copy.assignments[0].reviewerIds[0]=
  copy.assignments[0].reviewerIds[0]==='reviewer-d'?'reviewer-a':'reviewer-d';
 fails(()=>validateAssignmentPlan(copy,{roster:roster(),conflicts:conflicts(),taskSet:tasks()}),'ASSIGNMENT_ID');
});
test('assignment plan rejects duplicate assignment rows',()=>{
 const plan=make(),copy=structuredClone(plan);copy.assignments[1].taskId=copy.assignments[0].taskId;
 copy.digest=sha256((({digest,...rest})=>rest)(copy));
 fails(()=>validateAssignmentPlan(copy,{roster:roster(),conflicts:conflicts(),taskSet:tasks()}),'DUPLICATE');
});
test('assignment summary reports filled and queued slots',()=>{
 const summary=assignmentSummary(make());assert.equal(summary.tasks,2);assert.equal(summary.filledSlots,4);
});
test('assignment summary rejects forged plan digest',()=>{
 const plan=make();plan.digest='f'.repeat(64);fails(()=>assignmentSummary(plan),'HASH');
});
