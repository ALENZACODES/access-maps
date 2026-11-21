import { fail,sha256,sorted,copy } from './p15ab-contract.mjs';
import { validateReviewerRoster,validateConflictRegister,conflictsWithTask } from './p15ab-roster.mjs';
import { validateTaskSet } from './p15ab-tasks.mjs';
import { validateAssignmentPlan } from './p15ab-assign.mjs';
import { validateBlindPacket } from './p15ab-blind-review.mjs';

export const AUDIT_SCHEMA='access-maps-review-assignment-audit/1';
const WORDS={
 en:{title:'Reviewer assignment audit',balanced:'Reviewer load is reasonably distributed.',
  imbalance:'Reviewer load is concentrated among a small group.',
  unfilled:'Some review slots remain unfilled.',conflict:'A reviewer assignment conflicts with a declared interest.',
  independence:'A task lacks the required independent reviewer groups.',
  unused:'Eligible reviewer capacity remains unused.',blind:'A blind packet exposes internal identity metadata.',
  none:'No assignments were supplied.'},
 fr:{title:'Contrôle de la répartition des évaluations',balanced:'La charge est répartie de façon raisonnable.',
  imbalance:'La charge est concentrée chez un petit groupe.',
  unfilled:'Certains rôles d’évaluation restent vacants.',conflict:'Une affectation entre en conflit avec un intérêt déclaré.',
  independence:'Un dossier ne possède pas le nombre requis de groupes indépendants.',
  unused:'Une capacité admissible demeure inutilisée.',blind:'Un dossier masqué révèle des renseignements internes.',
  none:'Aucune affectation n’a été fournie.'},
};
function gini(values){
 const sortedValues=[...values].sort((a,b)=>a-b),n=sortedValues.length,total=sortedValues.reduce((a,b)=>a+b,0);
 if(!n||total===0)return 0;
 let weighted=0;for(let i=0;i<n;i++)weighted+=(i+1)*sortedValues[i];
 return (2*weighted)/(n*total)-(n+1)/n;
}
function jain(values){
 if(!values.length)return 1;const sum=values.reduce((a,b)=>a+b,0),squares=values.reduce((a,b)=>a+b*b,0);
 return squares===0?1:sum*sum/(values.length*squares);
}
export function auditAssignments(planInput,{roster:rosterInput,conflicts:conflictInput,
 taskSet:taskSetInput,packets=[]}={}){
 const plan=validateAssignmentPlan(planInput,{roster:rosterInput,conflicts:conflictInput,taskSet:taskSetInput});
 const roster=validateReviewerRoster(rosterInput),conflicts=validateConflictRegister(conflictInput,roster),
  tasks=validateTaskSet(taskSetInput),reviewerById=new Map(roster.reviewers.map(row=>[row.reviewerId,row]));
 const issues=[];
 const add=(code,taskId,detail)=>issues.push({code,taskId,detail});
 const loadValues=roster.reviewers.filter(row=>row.active&&row.capacity>0).map(row=>
  plan.loads.find(item=>item.reviewerId===row.reviewerId)?.assigned??0);
 const activeLoads=loadValues.filter(value=>value>0);
 const groupLoads=new Map();
 for(const assignment of plan.assignments){
  const task=tasks.tasks.find(row=>row.taskId===assignment.taskId);
  if(assignment.missing)add('UNFILLED',task.taskId,`${assignment.missing} slots`);
  if(assignment.groups.length<task.minimumGroups)add('INDEPENDENCE',task.taskId,'group count below task minimum');
  for(const reviewerId of assignment.reviewerIds){
   if(conflictsWithTask(conflicts,reviewerId,task,plan.asOf).length)add('CONFLICT',task.taskId,reviewerId);
   const group=reviewerById.get(reviewerId).groupId;groupLoads.set(group,(groupLoads.get(group)??0)+1);
  }
 }
 const packetFindings=[];
 for(const packet of packets){
  try{validateBlindPacket(packet);}catch(error){packetFindings.push({packetId:packet?.packetId??'UNKNOWN',code:error.code??'INVALID'});}
 }
 const giniValue=gini(loadValues),jainValue=jain(loadValues);
 const concentration=groupLoads.size?Math.max(...groupLoads.values())/Math.max(1,plan.assignments.reduce((sum,row)=>sum+row.assigned,0)):0;
 const issuesSorted=sorted(issues,row=>`${row.code}:${row.taskId}:${row.detail}`);
 const audit={schema:AUDIT_SCHEMA,planId:plan.planId,planDigest:plan.digest,asOf:plan.asOf,
  metrics:{activeReviewers:loadValues.length,usedReviewers:activeLoads.length,
   totalCapacity:roster.reviewers.reduce((sum,row)=>sum+(row.active?row.capacity:0),0),
   filledSlots:loadValues.reduce((sum,value)=>sum+value,0),unfilledSlots:plan.unfilled.reduce((sum,row)=>sum+row.missing,0),
   gini:Number(giniValue.toFixed(6)),jain:Number(jainValue.toFixed(6)),
   maximumGroupShare:Number(concentration.toFixed(6))},
  issues:issuesSorted,packetFindings,
  digest:''};
 audit.digest=sha256({...audit,digest:''});return audit;
}
export function verifyAssignmentAudit(input,plan,options){
 fail(input?.schema===AUDIT_SCHEMA&&input.digest===sha256({...input,digest:''}),'HASH','Assignment audit digest invalid.');
 const expected=auditAssignments(plan,options);
 fail(input.digest===expected.digest,'STALE_AUDIT','Audit does not match current assignment inputs.');
 return {valid:true,digest:input.digest,metrics:copy(input.metrics)};
}
export function renderAssignmentAudit(audit,{lang='en'}={}){
 fail(['en','fr'].includes(lang),'LANGUAGE','Audit language invalid.');
 fail(audit?.schema===AUDIT_SCHEMA&&audit.digest===sha256({...audit,digest:''}),'HASH','Audit document invalid.');
 const words=WORDS[lang],metrics=audit.metrics,lines=[words.title,
  `Gini: ${metrics.gini}`,`Jain: ${metrics.jain}`,
  `Reviewers: ${metrics.usedReviewers}/${metrics.activeReviewers}`,
  `Filled slots: ${metrics.filledSlots}`,`Unfilled slots: ${metrics.unfilledSlots}`,
  ...audit.issues.map(row=>`${row.code} ${row.taskId}: ${row.detail}`),
  ...audit.packetFindings.map(row=>`${words.blind} ${row.packetId}`),
  `SHA-256: ${audit.digest}`];
 return lines.join('\n')+'\n';
}
export function fairnessBand(audit){
 fail(audit?.schema===AUDIT_SCHEMA&&audit.digest===sha256({...audit,digest:''}),'HASH','Audit document invalid.');
 const {gini,jain}=audit.metrics;
 return gini<=0.2&&jain>=0.85?'balanced':gini<=0.35&&jain>=0.7?'watch':'concentrated';
}
