import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,DAY,NEXT,LATER} from './p15ab-fixtures.mjs';
import {createReviewerRoster,validateReviewerRoster,createConflictRegister,validateConflictRegister,
 activeConflicts,reviewerConflictSet,conflictsWithTask,addConflict,expireConflicts,reviewerCapacitySummary} from './p15ab-roster.mjs';
import {tasks} from './p15ab-fixtures.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('reviewer roster is deterministic and digest sealed',()=>{
 const value=roster();assert.equal(validateReviewerRoster(value).digest,value.digest);
 assert.deepEqual(value.reviewers.map(row=>row.reviewerId),['reviewer-a','reviewer-b','reviewer-c','reviewer-d']);
});
test('reviewer roster rejects duplicate reviewer identifiers',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:[...value.reviewers,value.reviewers[0]]}),'DUPLICATE');
});
test('reviewer roster rejects unknown roles',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,role:'chair'}:row)}),'ROLE');
});
test('reviewer roster rejects capacity above global limit',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,capacity:1000001}:row)}),'INTEGER');
});
test('reviewer roster rejects daily capacity above total capacity',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,maxPerDay:6}:row)}),'CAPACITY');
});
test('reviewer roster requires bounded and supported skills',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,skills:['telepathy']}:row)}),'SKILLS');
});
test('reviewer roster rejects duplicate skills',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,skills:['entrance','entrance']}:row)}),'DUPLICATE');
});
test('reviewer roster requires a supported language',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,languages:['es']}:row)}),'LANGUAGE');
});
test('reviewer roster rejects reversed availability',()=>{
 const value=roster();fails(()=>createReviewerRoster({...value,reviewers:value.reviewers.map((row,index)=>
  index===0?{...row,availableFrom:LATER,availableTo:DAY}:row)}),'DATE_ORDER');
});
test('reviewer roster digest detects metadata tampering',()=>{
 const value=roster(),copy=structuredClone(value);copy.version=2;
 fails(()=>validateReviewerRoster(copy),'HASH');
});
test('empty conflict register is valid and sealed',()=>{
 const value=conflicts();assert.equal(validateConflictRegister(value,roster()).digest,value.digest);
});
test('conflict register requires known reviewer identity',()=>{
 const value=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-missing',scope:'record',
  scopeId:'record-one',declaredOn:DAY,expiresOn:LATER,reason:'Declared conflict',source:'Self declaration'}]);
 fails(()=>validateConflictRegister(value,roster()),'REVIEWER_REF');
});
test('conflict register rejects unsupported scope',()=>{
 fails(()=>createConflictRegister({registerId:'register-one',asOf:DAY,conflicts:[{
  conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'country',scopeId:'country-one',
  declaredOn:DAY,expiresOn:LATER,reason:'Reason',source:'Declaration'}]}),'CONFLICT_SCOPE');
});
test('conflict expiry cannot precede declaration',()=>{
 fails(()=>createConflictRegister({registerId:'register-one',asOf:DAY,conflicts:[{
  conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',scopeId:'record-one',
  declaredOn:NEXT,expiresOn:DAY,reason:'Reason',source:'Declaration'}]}),'DATE_ORDER');
});
test('conflict register cannot include a future declaration',()=>{
 fails(()=>createConflictRegister({registerId:'register-one',asOf:DAY,conflicts:[{
  conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',scopeId:'record-one',
  declaredOn:NEXT,expiresOn:LATER,reason:'Reason',source:'Declaration'}]}),'FUTURE_CONFLICT');
});
test('active conflicts are filtered by inclusive expiry date',()=>{
 const value=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',
  scopeId:'record-one',declaredOn:DAY,expiresOn:NEXT,reason:'Reason',source:'Declaration'}]);
 assert.equal(activeConflicts(value,NEXT).length,1);assert.equal(activeConflicts(value,LATER).length,0);
});
test('reviewer conflict set filters by reviewer',()=>{
 const value=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',
  scopeId:'record-one',declaredOn:DAY,expiresOn:LATER,reason:'Reason',source:'Declaration'}]);
 assert.equal(reviewerConflictSet(value,'reviewer-a',DAY).length,1);
 assert.equal(reviewerConflictSet(value,'reviewer-b',DAY).length,0);
});
test('task conflict matching covers record and source groups',()=>{
 const value=conflicts([
  {conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',scopeId:'record-1',
   declaredOn:DAY,expiresOn:LATER,reason:'Record conflict',source:'Declaration'},
  {conflictId:'conflict-two',reviewerId:'reviewer-a',scope:'source',scopeId:'source-group-1',
   declaredOn:DAY,expiresOn:LATER,reason:'Source conflict',source:'Declaration'}]);
 const task=tasks().tasks[0];
 assert.equal(conflictsWithTask(value,'reviewer-a',task,DAY).length,2);
});
test('conflict addition preserves prior declarations',()=>{
 const initial=conflicts(),next=addConflict(initial,{conflictId:'conflict-one',reviewerId:'reviewer-a',
  scope:'record',scopeId:'record-1',declaredOn:DAY,expiresOn:LATER,reason:'Declared',source:'Self declaration'});
 assert.equal(next.conflicts.length,1);
});
test('conflict addition rejects repeated conflict IDs',()=>{
 const initial=conflicts(),one=addConflict(initial,{conflictId:'conflict-one',reviewerId:'reviewer-a',
  scope:'record',scopeId:'record-1',declaredOn:DAY,expiresOn:LATER,reason:'Declared',source:'Self declaration'});
 fails(()=>addConflict(one,{conflictId:'conflict-one',reviewerId:'reviewer-b',scope:'record',
  scopeId:'record-2',declaredOn:DAY,expiresOn:LATER,reason:'Declared',source:'Self declaration'}),'DUPLICATE');
});
test('conflict expiry retains current and future active entries only',()=>{
 const value=conflicts([{conflictId:'conflict-one',reviewerId:'reviewer-a',scope:'record',
  scopeId:'record-1',declaredOn:DAY,expiresOn:NEXT,reason:'Declared',source:'Declaration'}]);
 assert.equal(expireConflicts(value,NEXT).conflicts.length,1);
 assert.equal(expireConflicts(value,LATER).conflicts.length,0);
});
test('reviewer capacity summary counts assigned reviewers',()=>{
 const value=reviewerCapacitySummary(roster(),[{reviewerIds:['reviewer-a','reviewer-b']},{reviewerIds:['reviewer-a']}]);
 assert.equal(value.find(row=>row.reviewerId==='reviewer-a').assigned,2);
 assert.equal(value.find(row=>row.reviewerId==='reviewer-c').remaining,5);
});
test('reviewer capacity summary does not expose personal contact fields',()=>{
 const value=reviewerCapacitySummary(roster());
 assert.ok(!JSON.stringify(value).includes('@'));assert.ok(!JSON.stringify(value).includes('phone'));
});
