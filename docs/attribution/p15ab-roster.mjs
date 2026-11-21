import { ROLES,SKILLS,MAX_REVIEWERS,MAX_TASKS,fail,exact,id,text,date,integer,
 unique,sorted,copy,sha256,digestBody,hash } from './p15ab-contract.mjs';

export const ROSTER_SCHEMA='access-maps-reviewer-roster/1';
export const CONFLICT_SCHEMA='access-maps-reviewer-conflicts/1';
const REVIEWER_KEYS=['reviewerId','groupId','role','active','capacity','skills','languages','availableFrom','availableTo','maxPerDay'];
const CONFLICT_KEYS=['conflictId','reviewerId','scope','scopeId','declaredOn','expiresOn','reason','source'];
const SCOPES=['record','source','operator-group','geographic-cell'];
const LANGUAGES=['en','fr','both'];
function reviewerRow(row){
 exact(row,REVIEWER_KEYS);id(row.reviewerId,'reviewerId');id(row.groupId,'groupId');
 fail(ROLES.includes(row.role),'ROLE','Reviewer role is invalid.');
 fail(typeof row.active==='boolean','ACTIVE','Reviewer active flag must be boolean.');
 integer(row.capacity,'capacity',{min:0,max:MAX_TASKS});
 fail(Array.isArray(row.skills)&&row.skills.length<=SKILLS.length,'SKILLS','Reviewer skills are invalid.');
 fail(row.skills.every(value=>SKILLS.includes(value)),'SKILLS','Reviewer has an unsupported skill.');
 unique(row.skills,'reviewer skills');
 fail(Array.isArray(row.languages)&&row.languages.length>0&&row.languages.every(value=>LANGUAGES.includes(value)),
  'LANGUAGE','Reviewer languages are invalid.');
 unique(row.languages,'reviewer languages');
 date(row.availableFrom,'availableFrom');date(row.availableTo,'availableTo');
 fail(row.availableFrom<=row.availableTo,'DATE_ORDER','Reviewer availability range is reversed.');
 integer(row.maxPerDay,'maxPerDay',{min:0,max:MAX_TASKS});
 fail(row.maxPerDay<=row.capacity,'CAPACITY','Daily capacity cannot exceed total capacity.');
 return copy(row);
}
function conflictRow(row){
 exact(row,CONFLICT_KEYS);id(row.conflictId,'conflictId');id(row.reviewerId,'reviewerId');
 fail(SCOPES.includes(row.scope),'CONFLICT_SCOPE','Conflict scope is invalid.');
 id(row.scopeId,'scopeId');date(row.declaredOn,'declaredOn');date(row.expiresOn,'expiresOn');
 fail(row.expiresOn>=row.declaredOn,'DATE_ORDER','Conflict expiry precedes declaration.');
 text(row.reason,'conflict reason',{max:500});text(row.source,'conflict source',{max:200});
 return copy(row);
}
export function createReviewerRoster({rosterId,version,effectiveOn,reviewers}={}){
 id(rosterId,'rosterId');integer(version,'version',{min:1,max:100000});date(effectiveOn,'effectiveOn');
 fail(Array.isArray(reviewers)&&reviewers.length<=MAX_REVIEWERS,'LIMIT','Reviewer roster is too large.');
 const rows=reviewers.map(reviewerRow);unique(rows.map(row=>row.reviewerId),'reviewer IDs');
 const value={schema:ROSTER_SCHEMA,rosterId,version,effectiveOn,
  reviewers:sorted(rows,row=>row.reviewerId),digest:''};
 value.digest=digestBody(value);return value;
}
export function validateReviewerRoster(input){
 exact(input,['schema','rosterId','version','effectiveOn','reviewers','digest']);
 fail(input.schema===ROSTER_SCHEMA,'SCHEMA','Unsupported reviewer roster schema.');
 const value=createReviewerRoster(input);hash(input.digest);
 fail(value.digest===input.digest,'HASH','Reviewer roster digest is invalid.');
 return value;
}
export function createConflictRegister({registerId,asOf,conflicts=[]}={}){
 id(registerId,'registerId');date(asOf,'asOf');
 fail(Array.isArray(conflicts)&&conflicts.length<=MAX_TASKS*5,'LIMIT','Conflict register is too large.');
 const rows=conflicts.map(conflictRow);unique(rows.map(row=>row.conflictId),'conflict IDs');
 fail(rows.every(row=>row.declaredOn<=asOf),'FUTURE_CONFLICT','Conflict cannot be declared after register date.');
 const value={schema:CONFLICT_SCHEMA,registerId,asOf,
  conflicts:sorted(rows,row=>row.conflictId),digest:''};
 value.digest=digestBody(value);return value;
}
export function validateConflictRegister(input,roster){
 exact(input,['schema','registerId','asOf','conflicts','digest']);
 fail(input.schema===CONFLICT_SCHEMA,'SCHEMA','Unsupported conflict register schema.');
 const value=createConflictRegister(input),known=new Set(validateReviewerRoster(roster).reviewers.map(row=>row.reviewerId));
 for(const row of value.conflicts)fail(known.has(row.reviewerId),'REVIEWER_REF','Conflict refers to an unknown reviewer.');
 fail(value.digest===input.digest,'HASH','Conflict register digest is invalid.');
 return value;
}
export function activeConflicts(register,asOf){
 const value=register.schema===CONFLICT_SCHEMA?register:createConflictRegister(register);
 date(asOf,'asOf');return value.conflicts.filter(row=>row.declaredOn<=asOf&&row.expiresOn>=asOf);
}
export function reviewerConflictSet(register,reviewerId,asOf){
 id(reviewerId,'reviewerId');return activeConflicts(register,asOf).filter(row=>row.reviewerId===reviewerId);
}
export function conflictsWithTask(register,reviewerId,task,asOf){
 const conflicts=reviewerConflictSet(register,reviewerId,asOf);
 const targets={
  record:task.recordId,source:task.sourceGroupId,'operator-group':task.operatorGroupId,
  'geographic-cell':task.geographicCellId,
 };
 return conflicts.filter(row=>targets[row.scope]&&targets[row.scope]===row.scopeId);
}
export function addConflict(input,{conflictId,reviewerId,scope,scopeId,declaredOn,expiresOn,reason,source}={}){
 const current=createConflictRegister(input);
 const next=createConflictRegister({registerId:current.registerId,asOf:declaredOn,
  conflicts:[...current.conflicts,{conflictId,reviewerId,scope,scopeId,declaredOn,expiresOn,reason,source}]});
 return next;
}
export function expireConflicts(input,asOf){
 const current=createConflictRegister(input);date(asOf,'asOf');
 return createConflictRegister({registerId:current.registerId,asOf,
  conflicts:current.conflicts.filter(row=>row.expiresOn>=asOf)});
}
export function reviewerCapacitySummary(rosterInput,assignments=[]){
 const roster=validateReviewerRoster(rosterInput),loads=new Map();
 for(const assignment of assignments)for(const reviewerId of assignment.reviewerIds??[])
  loads.set(reviewerId,(loads.get(reviewerId)??0)+1);
 return roster.reviewers.map(row=>({reviewerId:row.reviewerId,groupId:row.groupId,role:row.role,
  active:row.active,capacity:row.capacity,assigned:loads.get(row.reviewerId)??0,
  remaining:Math.max(0,row.capacity-(loads.get(row.reviewerId)??0))}));
}
