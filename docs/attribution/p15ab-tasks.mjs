import { MAX_TASKS,SKILLS,fail,exact,id,text,date,integer,unique,sorted,copy,sha256,
 digestBody,hash,bilingual } from './p15ab-contract.mjs';

export const TASKS_SCHEMA='access-maps-review-task-set/1';
const TASK_KEYS=['taskId','recordId','recordDigest','recordAlias','field','featureSkills','requiredReviewers',
 'minimumGroups','language','priority','sourceGroupId','operatorGroupId','geographicCellId','dueOn',
 'createdOn','createdBy','evidenceDigest','reviewBrief'];
const PRIORITIES=['critical','high','normal','low'];
const LANGUAGES=['en','fr','both'];
function taskRow(row){
 exact(row,TASK_KEYS);id(row.taskId,'taskId');id(row.recordId,'recordId');hash(row.recordDigest,'recordDigest');
 id(row.recordAlias,'recordAlias');fail(/^review-(?:target|item)-[a-z0-9-]+$/u.test(row.recordAlias)&&
  !/record|place|site|location|name|address/iu.test(row.recordAlias),
  'BLIND_ALIAS','Blind alias cannot disclose a real record label.');
 text(row.field,'field',{max:120});fail(Array.isArray(row.featureSkills)&&row.featureSkills.length>0&&
  row.featureSkills.length<=SKILLS.length&&row.featureSkills.every(value=>SKILLS.includes(value)),
  'SKILLS','Task skill requirements are invalid.');
 unique(row.featureSkills,'task feature skills');
 integer(row.requiredReviewers,'requiredReviewers',{min:1,max:5});
 integer(row.minimumGroups,'minimumGroups',{min:1,max:row.requiredReviewers});
 fail(LANGUAGES.includes(row.language),'LANGUAGE','Task language requirement is invalid.');
 fail(PRIORITIES.includes(row.priority),'PRIORITY','Task priority is invalid.');
 for(const key of ['sourceGroupId','operatorGroupId','geographicCellId'])if(row[key]!==null)id(row[key],key);
 date(row.dueOn,'dueOn');date(row.createdOn,'createdOn');fail(row.dueOn>=row.createdOn,'DATE_ORDER','Task due date precedes creation.');
 actorLabel(row.createdBy);hash(row.evidenceDigest,'evidenceDigest');
 bilingual(row.reviewBrief,'reviewBrief');
 return copy(row);
}
function actorLabel(value){fail(typeof value==='string'&&/^[a-z][a-z0-9_-]{1,79}$/u.test(value)&&
 !/[<>@]/u.test(value),'PRIVATE','Creator label must be pseudonymous.');return value;}
export function createTaskSet({taskSetId,createdOn,tasks=[]}={}){
 id(taskSetId,'taskSetId');date(createdOn,'createdOn');
 fail(Array.isArray(tasks)&&tasks.length<=MAX_TASKS,'LIMIT','Task set is too large.');
 const rows=tasks.map(taskRow);unique(rows.map(row=>row.taskId),'task IDs');
 fail(rows.every(row=>row.createdOn<=createdOn),'DATE','Task set predates a task.');
 const value={schema:TASKS_SCHEMA,taskSetId,createdOn,tasks:sorted(rows,row=>row.taskId),digest:''};
 value.digest=digestBody(value);return value;
}
export function validateTaskSet(input){
 exact(input,['schema','taskSetId','createdOn','tasks','digest']);
 fail(input.schema===TASKS_SCHEMA,'SCHEMA','Unsupported task set schema.');
 const value=createTaskSet(input);hash(input.digest);fail(value.digest===input.digest,'HASH','Task set digest invalid.');
 return value;
}
export function validateTaskForRoster(task,reviewer,asOf){
 date(asOf,'asOf');
 if(task.createdOn>asOf||task.dueOn<asOf)return {eligible:false,missingSkills:[],languageOk:false,reason:'task-window'};
 if(reviewer.availableFrom>asOf||reviewer.availableTo<asOf)return {eligible:false,missingSkills:[],languageOk:false,reason:'reviewer-window'};
 const missing=task.featureSkills.filter(skill=>!reviewer.skills.includes(skill));
 const languageOk=task.language==='both'?reviewer.languages.includes('both')||
  reviewer.languages.includes('en')&&reviewer.languages.includes('fr'):
  reviewer.languages.includes(task.language)||reviewer.languages.includes('both');
 return {eligible:missing.length===0&&languageOk,missingSkills:missing,languageOk};
}
export function taskById(taskSet,taskId){
 const value=validateTaskSet(taskSet);id(taskId,'taskId');
 const row=value.tasks.find(task=>task.taskId===taskId);fail(row,'TASK_NOT_FOUND','Task does not exist.');return copy(row);
}
export function taskSetDigest(taskSet){return sha256(validateTaskSet(taskSet));}
