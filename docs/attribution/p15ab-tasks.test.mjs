import test from 'node:test';
import assert from 'node:assert/strict';
import {tasks,roster,DAY,NEXT,LATER,HASH} from './p15ab-fixtures.mjs';
import {createTaskSet,validateTaskSet,validateTaskForRoster,taskById} from './p15ab-tasks.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('task set validates and sorts by stable task identifier',()=>{
 const value=tasks();assert.equal(validateTaskSet(value).digest,value.digest);
 assert.deepEqual(value.tasks.map(row=>row.taskId),['task-1','task-2']);
});
test('task set rejects duplicate task identifiers',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:[...value.tasks,value.tasks[0]]}),'DUPLICATE');
});
test('task set rejects an invalid record digest',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,recordDigest:'bad'}:row)}),'HASH');
});
test('task set rejects a blind alias containing a record identity hint',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,recordAlias:'record-name-001'}:row)}),'BLIND_ALIAS');
});
test('task set rejects duplicate feature skill requirements',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,featureSkills:['entrance','entrance']}:row)}),'DUPLICATE');
});
test('task set rejects an unsupported skill',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,featureSkills:['unicorn']}:row)}),'SKILLS');
});
test('task set requires at least one reviewer',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,requiredReviewers:0}:row)}),'INTEGER');
});
test('task set minimum independent groups cannot exceed reviewer count',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,minimumGroups:3}:row)}),'INTEGER');
});
test('task set rejects unsupported review language',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,language:'de'}:row)}),'LANGUAGE');
});
test('task set rejects unsupported priority',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,priority:'urgent'}:row)}),'PRIORITY');
});
test('task set rejects due date before creation',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,dueOn:'2026-11-20'}:row)}),'DATE_ORDER');
});
test('task set rejects a creator label that is not pseudonymous',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,createdBy:'person@example.invalid'}:row)}),'PRIVATE');
});
test('task set rejects personal information in a bilingual review brief',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,reviewBrief:{en:'Call 416-555-0111',fr:'Appelez au 416-555-0111'}}:row)}),'PRIVATE');
});
test('task set digest detects tampering',()=>{
 const value=tasks(),copy=structuredClone(value);copy.tasks[0].priority='low';
 fails(()=>validateTaskSet(copy),'HASH');
});
test('task lookup returns a defensive copy',()=>{
 const value=tasks(),row=taskById(value,'task-1');row.field='mutated';
 assert.equal(taskById(value,'task-1').field,'entrance');
});
test('task lookup rejects unknown task IDs',()=>{
 fails(()=>taskById(tasks(),'task-missing'),'TASK_NOT_FOUND');
});
test('reviewer with all required skills and languages is eligible',()=>{
 const result=validateTaskForRoster(tasks().tasks[0],roster().reviewers[0],DAY);
 assert.equal(result.eligible,true);assert.deepEqual(result.missingSkills,[]);
});
test('reviewer missing a feature skill is ineligible',()=>{
 const row=tasks({patch:{0:{featureSkills:['entrance','washroom']}}}).tasks[0];
 const result=validateTaskForRoster(row,roster().reviewers[0],DAY);
 assert.equal(result.eligible,false);assert.deepEqual(result.missingSkills,['washroom']);
});
test('reviewer missing one required language is ineligible for both-language review',()=>{
 const row=roster({ 'reviewer-a':{languages:['en']} }).reviewers[0];
 const result=validateTaskForRoster(tasks().tasks[0],row,DAY);
 assert.equal(result.eligible,false);assert.equal(result.languageOk,false);
});
test('reviewer available only outside assignment date is ineligible',()=>{
 const row=roster({'reviewer-a':{availableFrom:NEXT,availableTo:LATER}}).reviewers[0];
 assert.equal(validateTaskForRoster(tasks().tasks[0],row,DAY).eligible,false);
});
test('task cannot be assigned before its creation or after due date',()=>{
 const row=tasks().tasks[0],reviewer=roster().reviewers[0];
 assert.equal(validateTaskForRoster(row,reviewer,'2026-11-20').eligible,false);
 assert.equal(validateTaskForRoster(row,reviewer,'2026-11-25').eligible,false);
});
test('task set creation date cannot postdate an included task',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,createdOn:'2026-11-20'}),'DATE');
});

test('task alias must use a generated blind-label namespace',()=>{
 const value=tasks();fails(()=>createTaskSet({...value,tasks:value.tasks.map((row,index)=>
  index===0?{...row,recordAlias:'toronto-city-hall'}:row)}),'BLIND_ALIAS');
});
