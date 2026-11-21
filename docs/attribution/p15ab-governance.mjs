import {fail,id,date,text,hash,sha256,digestBody,copy,sorted,unique} from './p15ab-contract.mjs';
import {createReviewerRoster,validateReviewerRoster,validateConflictRegister,conflictsWithTask} from './p15ab-roster.mjs';
import {validateTaskSet,validateTaskForRoster} from './p15ab-tasks.mjs';
import {buildAssignmentPlan,validateAssignmentPlan} from './p15ab-assign.mjs';

export const REASSIGNMENT_SCHEMA='access-maps-review-reassignment/1';
export const ADJUDICATOR_SCHEMA='access-maps-review-adjudicator/1';
export const SIMULATION_SCHEMA='access-maps-review-fairness-simulation/1';
function planInputs(plan,options){
 return validateAssignmentPlan(plan,{roster:options.roster,conflicts:options.conflicts,taskSet:options.taskSet});
}
export function reassignAfterRecusal(planInput,{taskId,recusedReviewerIds,reason,at,actor:by,seed}={},
 {roster:rosterInput,conflicts:conflictInput,taskSet:taskSetInput,policy}={}){
 const plan=planInputs(planInput,{roster:rosterInput,conflicts:conflictInput,taskSet:taskSetInput});
 const roster=validateReviewerRoster(rosterInput),conflicts=validateConflictRegister(conflictInput,roster),
  taskSet=validateTaskSet(taskSetInput);
 id(taskId,'taskId');date(at,'at');id(by,'actor');id(seed,'seed');text(reason,'reassignment reason',{max:500});
 fail(Array.isArray(recusedReviewerIds)&&recusedReviewerIds.length>0,'RECUSAL','At least one reviewer must be recused.');
 recusedReviewerIds.forEach(value=>id(value,'reviewerId'));unique(recusedReviewerIds,'recused reviewer IDs');
 const current=plan.assignments.find(row=>row.taskId===taskId);fail(current,'TASK_NOT_FOUND','Task does not exist.');
 fail(recusedReviewerIds.every(value=>current.reviewerIds.includes(value)),'RECUSAL','A recused reviewer is not assigned to this task.');
 const changedRoster=createReviewerRoster({rosterId:roster.rosterId,version:roster.version+1,effectiveOn:at,
  reviewers:roster.reviewers.map(row=>recusedReviewerIds.includes(row.reviewerId)?{...row,active:false}:row)});
 const rebuilt=buildAssignmentPlan({planId:`${plan.planId}-r${roster.version+1}`,roster:changedRoster,
  conflicts:conflictInput,taskSet,asOf:at,seed,policy:plan.policy});
 const next=rebuilt.assignments.find(row=>row.taskId===taskId);
 const added=next.reviewerIds.filter(value=>!current.reviewerIds.includes(value));
 const retained=next.reviewerIds.filter(value=>current.reviewerIds.includes(value)&&!recusedReviewerIds.includes(value));
 const removed=current.reviewerIds.filter(value=>!next.reviewerIds.includes(value));
 const result={schema:REASSIGNMENT_SCHEMA,taskId,previousPlanDigest:plan.digest,nextPlanDigest:rebuilt.digest,
  rosterDigest:changedRoster.digest,recusedReviewerIds:[...recusedReviewerIds].sort(),
  retainedReviewerIds:retained,removedReviewerIds:removed,addedReviewerIds:added,reviewerIds:next.reviewerIds,
  required:next.required,assigned:next.assigned,missing:next.missing,status:next.status,
  reason,at,actor:by,digest:''};
 fail(!result.reviewerIds.some(value=>recusedReviewerIds.includes(value)),'RECUSAL','Recused reviewer remains assigned.');
 result.digest=digestBody(result);return {reassignment:result,plan:rebuilt,roster:changedRoster};
}
export function validateReassignment(input){
 fail(input?.schema===REASSIGNMENT_SCHEMA,'SCHEMA','Unsupported reassignment record.');
 hash(input.previousPlanDigest);hash(input.nextPlanDigest);hash(input.rosterDigest);id(input.taskId);
 date(input.at,'at');text(input.reason,'reason',{max:500});id(input.actor,'actor');
 unique(input.recusedReviewerIds,'recused reviewer IDs');unique(input.reviewerIds,'reviewer IDs');
 fail(input.reviewerIds.every(value=>!input.recusedReviewerIds.includes(value)),'RECUSAL','Recused reviewer remains assigned.');
 fail(input.digest===digestBody(input),'HASH','Reassignment digest invalid.');return copy(input);
}
export function assignAdjudicator({taskId,planInput,roster:rosterInput,conflicts:conflictInput,
 taskSet:taskSetInput,asOf,seed,alreadyAssigned=[]}={}){
 const plan=validateAssignmentPlan(planInput,{roster:rosterInput,conflicts:conflictInput,taskSet:taskSetInput});
 const roster=validateReviewerRoster(rosterInput),conflicts=validateConflictRegister(conflictInput,roster),
  tasks=validateTaskSet(taskSetInput);
 id(taskId,'taskId');date(asOf,'asOf');id(seed,'seed');unique(alreadyAssigned,'already assigned adjudicators');
 const task=tasks.tasks.find(row=>row.taskId===taskId);fail(task,'TASK_NOT_FOUND','Task does not exist.');
 const prior=plan.assignments.find(row=>row.taskId===taskId);
 const excluded=new Set([...prior.reviewerIds,...alreadyAssigned]),excludedGroups=new Set(prior.groups);
 const candidates=roster.reviewers.filter(row=>row.active&&row.role==='adjudicator'&&!excluded.has(row.reviewerId)&&
  !excludedGroups.has(row.groupId)&&
  row.capacity>0&&validateTaskForRoster(task,row,asOf).eligible&&
  !conflictsWithTask(conflicts,row.reviewerId,task,asOf).length);
 candidates.sort((a,b)=>a.reviewerId.localeCompare(b.reviewerId));
 fail(candidates.length>0,'NO_ADJUDICATOR','No eligible independent adjudicator is available.');
 const selected=candidates[0];
 const result={schema:ADJUDICATOR_SCHEMA,adjudicatorToken:`blind-adj-${sha256(`${seed}:${taskId}:${selected.reviewerId}`).slice(0,20)}`,
  taskId,planDigest:plan.digest,recordDigest:task.recordDigest,evidenceDigest:task.evidenceDigest,
  reviewerGroupsExcluded:[...new Set(prior.groups)].sort(),requiredSkills:[...task.featureSkills],
  language:task.language,assignedOn:asOf,digest:''};
 result.digest=digestBody(result);return {assignment:result,reviewerId:selected.reviewerId};
}
export function validateAdjudicatorAssignment(input){
 fail(input?.schema===ADJUDICATOR_SCHEMA,'SCHEMA','Unsupported adjudicator assignment.');
 id(input.taskId,'taskId');hash(input.planDigest);hash(input.recordDigest);hash(input.evidenceDigest);
 id(input.adjudicatorToken,'adjudicatorToken');date(input.assignedOn,'assignedOn');
 unique(input.reviewerGroupsExcluded,'excluded reviewer groups');unique(input.requiredSkills,'required skills');
 fail(input.digest===digestBody(input),'HASH','Adjudicator assignment digest invalid.');
 fail(!input.adjudicatorToken.includes('reviewer-'),'BLIND_LEAK','Adjudicator token exposes reviewer identity.');
 return copy(input);
}
function fairness(values){
 const sum=values.reduce((a,b)=>a+b,0),squares=values.reduce((a,b)=>a+b*b,0);
 const jain=squares===0?1:sum*sum/(values.length*squares);
 const sortedValues=[...values].sort((a,b)=>a-b),n=values.length;
 let weighted=0;for(let i=0;i<n;i++)weighted+=(i+1)*sortedValues[i];
 const gini=!n||sum===0?0:(2*weighted)/(n*sum)-(n+1)/n;
 return {gini:Number(gini.toFixed(6)),jain:Number(jain.toFixed(6)),
  min:n?Math.min(...values):0,max:n?Math.max(...values):0,mean:n?Number((sum/n).toFixed(6)):0};
}
export function simulateSeedFairness({roster:rosterInput,conflicts:conflictInput,taskSet:taskSetInput,
 asOf,seeds,policy}={}){
 date(asOf,'asOf');fail(Array.isArray(seeds)&&seeds.length>0&&seeds.length<=100,'LIMIT','Seed simulation is limited to 100 runs.');
 seeds.forEach(value=>id(value,'seed'));unique(seeds,'simulation seeds');
 const rows=seeds.map(seed=>{
  const plan=buildAssignmentPlan({planId:`simulation-${seed}`,roster:rosterInput,conflicts:conflictInput,
   taskSet:taskSetInput,asOf,seed,policy});
  const loads=plan.loads.filter(row=>row.active&&row.capacity>0).map(row=>row.assigned);
  return {seed,planDigest:plan.digest,metrics:fairness(loads),filledSlots:plan.assignments.reduce((sum,row)=>sum+row.assigned,0),
   missingSlots:plan.assignments.reduce((sum,row)=>sum+row.missing,0)};
 });
 const result={schema:SIMULATION_SCHEMA,asOf,runs:rows,
  aggregate:{meanGini:Number((rows.reduce((sum,row)=>sum+row.metrics.gini,0)/rows.length).toFixed(6)),
   meanJain:Number((rows.reduce((sum,row)=>sum+row.metrics.jain,0)/rows.length).toFixed(6)),
   minimumFilled:Math.min(...rows.map(row=>row.filledSlots)),
   maximumMissing:Math.max(...rows.map(row=>row.missingSlots))},digest:''};
 result.digest=digestBody(result);return result;
}
export function validateFairnessSimulation(input){
 fail(input?.schema===SIMULATION_SCHEMA,'SCHEMA','Unsupported fairness simulation.');
 fail(Array.isArray(input.runs)&&input.runs.length>0&&input.runs.length<=100,'LIMIT','Simulation run count invalid.');
 input.runs.forEach(row=>{id(row.seed,'seed');hash(row.planDigest);});
 fail(input.digest===digestBody(input),'HASH','Fairness simulation digest invalid.');return copy(input);
}
