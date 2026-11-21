import { ASSIGNMENT_SCHEMA,MAX_TASKS,fail,exact,id,date,integer,sha256,
 digestBody,copy,sorted,unique,ZERO } from './p15ab-contract.mjs';
import { validateReviewerRoster,validateConflictRegister,conflictsWithTask,reviewerCapacitySummary } from './p15ab-roster.mjs';
import { validateTaskSet,validateTaskForRoster } from './p15ab-tasks.mjs';

const PLAN_KEYS=['schema','planId','rosterDigest','conflictDigest','taskSetDigest','asOf','seed','policy',
 'assignments','loads','unfilled','digest'];
const POLICY_KEYS=['balanceWeight','specialtyWeight','maxAssignmentsPerGroup','allowPartial'];
function policyRow(value){
 exact(value,POLICY_KEYS);integer(value.balanceWeight,'balanceWeight',{min:1,max:100});
 integer(value.specialtyWeight,'specialtyWeight',{min:0,max:100});
 integer(value.maxAssignmentsPerGroup,'maxAssignmentsPerGroup',{min:1,max:MAX_TASKS});
 fail(typeof value.allowPartial==='boolean','POLICY','allowPartial must be boolean.');return copy(value);
}
function tie(seed,taskId,reviewerId){return sha256(`${seed}\u0000${taskId}\u0000${reviewerId}`);}
function eligibility(task,reviewer,roster,conflicts,asOf,loads,perDay,groupLoads,policy){
 if(!reviewer.active||reviewer.role==='adjudicator')return {ok:false,reason:'inactive-or-adjudicator'};
 const skill=validateTaskForRoster(task,reviewer,asOf);
 if(!skill.eligible)return {ok:false,reason:skill.languageOk?'missing-skills':'language'};
 if(conflictsWithTask(conflicts,reviewer.reviewerId,task,asOf).length)return {ok:false,reason:'declared-conflict'};
 if((loads.get(reviewer.reviewerId)??0)>=reviewer.capacity)return {ok:false,reason:'capacity'};
 if((perDay.get(`${reviewer.reviewerId}:${asOf}`)??0)>=reviewer.maxPerDay)return {ok:false,reason:'daily-capacity'};
 if((groupLoads.get(reviewer.groupId)??0)>=policy.maxAssignmentsPerGroup)return {ok:false,reason:'group-capacity'};
 return {ok:true,reason:null};
}
function candidateScore(reviewer,task,loads,groupLoads,policy,seed){
 const load=loads.get(reviewer.reviewerId)??0;
 const ratio=reviewer.capacity===0?1000:load/reviewer.capacity;
 const groupLoad=groupLoads.get(reviewer.groupId)??0;
 const speciality=task.featureSkills.reduce((sum,skill)=>sum+(reviewer.skills.includes(skill)?1:0),0);
 return ratio*policy.balanceWeight+groupLoad*2-policy.specialtyWeight*speciality/Math.max(1,task.featureSkills.length)+
  Number.parseInt(tie(seed,task.taskId,reviewer.reviewerId).slice(0,8),16)/0xffffffff/100;
}
function failureReasons(task,reviewers,conflicts,asOf,loads,perDay,groupLoads,policy){
 const counts={};for(const reviewer of reviewers){
  const result=eligibility(task,reviewer,null,conflicts,asOf,loads,perDay,groupLoads,policy);
  if(!result.ok)counts[result.reason]=(counts[result.reason]??0)+1;
 }
 return Object.keys(counts).sort().map(key=>`${key}:${counts[key]}`);
}
export function buildAssignmentPlan({planId,roster:rosterInput,conflicts:conflictInput,
 taskSet:taskSetInput,asOf,seed,policy:policyInput}={}){
 id(planId,'planId');date(asOf,'asOf');id(seed,'seed');
 const roster=validateReviewerRoster(rosterInput),conflicts=validateConflictRegister(conflictInput,roster),
  taskSet=validateTaskSet(taskSetInput),policy=policyRow(policyInput);
 fail(taskSet.createdOn<=asOf&&conflicts.asOf<=asOf&&roster.effectiveOn<=asOf,
  'DATE','Assignment inputs cannot postdate assignment date.');
 const reviewerById=new Map(roster.reviewers.map(row=>[row.reviewerId,row]));
 const loads=new Map(),perDay=new Map(),groupLoads=new Map(),assignments=[],unfilled=[];
 const tasks=[...taskSet.tasks].sort((a,b)=>{
  const rank={critical:0,high:1,normal:2,low:3};
  return rank[a.priority]-rank[b.priority]||a.dueOn.localeCompare(b.dueOn)||a.taskId.localeCompare(b.taskId);
 });
 for(const task of tasks){
  const chosen=[],chosenGroups=new Set();
  for(let slot=0;slot<task.requiredReviewers;slot++){
   const candidates=[];
   for(const reviewer of roster.reviewers){
    if(chosen.includes(reviewer.reviewerId)||chosenGroups.has(reviewer.groupId))continue;
    const result=eligibility(task,reviewer,roster,conflicts,asOf,loads,perDay,groupLoads,policy);
    if(result.ok)candidates.push({reviewer,score:candidateScore(reviewer,task,loads,groupLoads,policy,seed)});
   }
   candidates.sort((a,b)=>a.score-b.score||a.reviewer.reviewerId.localeCompare(b.reviewer.reviewerId));
   if(!candidates.length)break;
   const selected=candidates[0].reviewer;chosen.push(selected.reviewerId);chosenGroups.add(selected.groupId);
   loads.set(selected.reviewerId,(loads.get(selected.reviewerId)??0)+1);
   perDay.set(`${selected.reviewerId}:${asOf}`,(perDay.get(`${selected.reviewerId}:${asOf}`)??0)+1);
   groupLoads.set(selected.groupId,(groupLoads.get(selected.groupId)??0)+1);
  }
  const missing=task.requiredReviewers-chosen.length;
  const assignment={assignmentId:`assignment-${sha256({planId,taskId:task.taskId,reviewers:chosen}).slice(0,24)}`,
   taskId:task.taskId,reviewerIds:chosen,required:task.requiredReviewers,assigned:chosen.length,missing,
   minimumGroups:task.minimumGroups,groups:chosen.map(value=>reviewerById.get(value).groupId),
   status:missing===0?'assigned':'queued',reason:missing?(failureReasons(task,roster.reviewers,conflicts,asOf,loads,perDay,groupLoads,policy).length?
   failureReasons(task,roster.reviewers,conflicts,asOf,loads,perDay,groupLoads,policy):['independence:insufficient-groups']):[]};
  assignments.push(assignment);
  if(missing)unfilled.push({taskId:task.taskId,missing,reason:assignment.reason});
 }
 const loadRows=reviewerCapacitySummary(roster,assignments).map(row=>({...row,
  utilization:row.capacity===0?0:row.assigned/row.capacity}));
 const plan={schema:ASSIGNMENT_SCHEMA,planId,rosterDigest:roster.digest,conflictDigest:conflicts.digest,
  taskSetDigest:taskSet.digest,asOf,seed,policy,assignments,loads:loadRows,unfilled,digest:''};
 plan.digest=digestBody(plan);return plan;
}
export function validateAssignmentPlan(input,{roster:rosterInput,conflicts:conflictInput,
 taskSet:taskSetInput}={}){
 exact(input,PLAN_KEYS);fail(input.schema===ASSIGNMENT_SCHEMA,'SCHEMA','Unsupported assignment plan schema.');
 id(input.planId,'planId');date(input.asOf,'asOf');id(input.seed,'seed');
 const roster=validateReviewerRoster(rosterInput),conflicts=validateConflictRegister(conflictInput,roster),
  taskSet=validateTaskSet(taskSetInput),policy=policyRow(input.policy);
 fail(input.asOf>=roster.effectiveOn&&input.asOf>=conflicts.asOf&&input.asOf>=taskSet.createdOn,
  'DATE','Assignment date predates one of its input revisions.');
 fail(input.rosterDigest===roster.digest&&input.conflictDigest===conflicts.digest&&
  input.taskSetDigest===taskSet.digest,'STALE','Assignment inputs changed.');
 fail(Array.isArray(input.assignments)&&input.assignments.length===taskSet.tasks.length,'ASSIGNMENT','Assignment count is incomplete.');
 const tasks=new Map(taskSet.tasks.map(row=>[row.taskId,row])),reviewers=new Map(roster.reviewers.map(row=>[row.reviewerId,row]));
 const seenTasks=new Set(),loads=new Map();
 for(const row of input.assignments){
  exact(row,['assignmentId','taskId','reviewerIds','required','assigned','missing','minimumGroups','groups','status','reason']);
  id(row.assignmentId,'assignmentId');id(row.taskId,'taskId');const task=tasks.get(row.taskId);
  fail(task&&!seenTasks.has(row.taskId),'DUPLICATE','Assignment task is unknown or repeated.');seenTasks.add(row.taskId);
  integer(row.required,'required',{min:1,max:5});integer(row.assigned,'assigned',{max:5});
  integer(row.missing,'missing',{max:5});fail(row.required===task.requiredReviewers&&
   row.assigned===row.reviewerIds.length&&row.missing===row.required-row.assigned,'ASSIGNMENT','Assignment counts mismatch.');
  fail(row.assignmentId===`assignment-${sha256({planId:input.planId,taskId:row.taskId,reviewers:row.reviewerIds}).slice(0,24)}`,'ASSIGNMENT_ID','Assignment ID does not match reviewer allocation.');
  unique(row.reviewerIds,'assigned reviewers');unique(row.groups,'assigned groups');
  fail(Array.isArray(row.reason)&&row.reason.every(value=>typeof value==='string'&&value.length<=100),
   'ASSIGNMENT_REASON','Assignment reason list is invalid.');
  fail((row.missing===0&&row.reason.length===0)||(row.missing>0&&row.reason.length>0),
   'ASSIGNMENT_REASON','Assignment reason must match its completion state.');
  fail(row.reviewerIds.every(value=>reviewers.has(value)),'REVIEWER_REF','Assignment references unknown reviewer.');
  const actualGroups=row.reviewerIds.map(value=>reviewers.get(value).groupId);
  fail(new Set(actualGroups).size===actualGroups.length&&JSON.stringify([...actualGroups].sort())===JSON.stringify([...row.groups].sort()),
   'INDEPENDENCE','Assigned reviewers must belong to distinct groups.');
  fail(row.groups.length>=Math.min(row.minimumGroups,row.assigned),'INDEPENDENCE','Minimum independent group count is not met.');
  fail(['assigned','queued'].includes(row.status)&&
   row.status===(row.missing===0?'assigned':'queued'),'ASSIGNMENT_STATE','Assignment state does not match completion.');
  fail(row.reviewerIds.length<=row.required,'ASSIGNMENT','Too many reviewers assigned to a task.');
  for(const reviewerId of row.reviewerIds){
   const reviewer=reviewers.get(reviewerId);
   fail(reviewer.active&&reviewer.role!=='adjudicator','REVIEWER','Ineligible reviewer was assigned.');
   fail(!conflictsWithTask(conflicts,reviewerId,task,input.asOf).length,'CONFLICT','Conflicted reviewer was assigned.');
   const skill=validateTaskForRoster(task,reviewer,input.asOf);
   fail(skill.eligible,'SKILL','Assigned reviewer lacks required skill or language.');
   loads.set(reviewerId,(loads.get(reviewerId)??0)+1);

  }
 }
 fail(seenTasks.size===tasks.size,'ASSIGNMENT','Every task must appear exactly once.');
 for(const reviewer of roster.reviewers){
  const assigned=loads.get(reviewer.reviewerId)??0;
  fail(assigned<=reviewer.capacity&&assigned<=reviewer.maxPerDay,'CAPACITY','Reviewer exceeds total or daily capacity.');
 }
 const groupLoads=new Map();
 for(const row of input.assignments)for(const group of row.groups)groupLoads.set(group,(groupLoads.get(group)??0)+1);
 for(const count of groupLoads.values())fail(count<=policy.maxAssignmentsPerGroup,'GROUP_CAPACITY','Reviewer group exceeds assignment policy.');
 fail(Array.isArray(input.loads)&&input.loads.length===roster.reviewers.length,'LOADS','Load summary must include every reviewer.');
 const loadIds=new Set();
 for(const row of input.loads){
  exact(row,['reviewerId','groupId','role','active','capacity','assigned','remaining','utilization']);
  const reviewer=reviewers.get(row.reviewerId);fail(reviewer&&!loadIds.has(row.reviewerId),'REVIEWER_REF','Load row references unknown or repeated reviewer.');
  loadIds.add(row.reviewerId);
  const assigned=loads.get(row.reviewerId)??0;
  fail(row.groupId===reviewer.groupId&&row.role===reviewer.role&&row.active===reviewer.active&&
   row.capacity===reviewer.capacity&&row.assigned===assigned&&row.remaining===Math.max(0,row.capacity-assigned)&&
   row.utilization===(row.capacity===0?0:assigned/row.capacity),
   'CAPACITY','Reviewer load summary does not match the roster and assignment rows.');
 }
 fail(input.digest===digestBody(input),'HASH','Assignment plan digest invalid.');
 return copy(input);
}
export function assignmentSummary(plan){
 fail(plan?.schema===ASSIGNMENT_SCHEMA&&plan.digest===digestBody(plan),'HASH','Assignment plan is invalid.');
 return {planId:plan.planId,tasks:plan.assignments.length,assigned:plan.assignments.filter(row=>row.status==='assigned').length,
  queued:plan.unfilled.length,reviewSlots:plan.assignments.reduce((sum,row)=>sum+row.required,0),
  filledSlots:plan.assignments.reduce((sum,row)=>sum+row.assigned,0),
  reviewers:plan.loads.filter(row=>row.assigned>0).length,digest:plan.digest};
}
