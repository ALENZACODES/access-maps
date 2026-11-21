import {createReviewerRoster,createConflictRegister} from './p15ab-roster.mjs';
import {createTaskSet} from './p15ab-tasks.mjs';
import {sha256} from './p15ab-contract.mjs';
export const DAY='2026-11-21',NEXT='2026-11-22',LATER='2026-11-24',HASH='a'.repeat(64);
export function roster(overrides={}){
 const reviewers=[
  ['reviewer-a','group-a',['entrance','source-quality'],['en','fr']],
  ['reviewer-b','group-b',['entrance','washroom'],['en','fr']],
  ['reviewer-c','group-c',['entrance','washroom','source-quality'],['en','fr']],
  ['reviewer-d','group-d',['entrance','washroom','licensing'],['en','fr']],
 ];
 return createReviewerRoster({rosterId:'roster-one',version:1,effectiveOn:DAY,
  reviewers:reviewers.map(([reviewerId,groupId,skills,languages])=>({
   reviewerId,groupId,role:'editor',active:true,capacity:5,skills,languages,
   availableFrom:DAY,availableTo:LATER,maxPerDay:5,...(overrides[reviewerId]??{}),
  }))});
}
export function conflicts(patch=[]){
 return createConflictRegister({registerId:'conflicts-one',asOf:DAY,conflicts:patch});
}
export function tasks({count=2,patch={}}={}){
 return createTaskSet({taskSetId:'tasks-one',createdOn:DAY,tasks:Array.from({length:count},(_,index)=>({
  taskId:`task-${index+1}`,recordId:`record-${index+1}`,recordDigest:HASH,
  recordAlias:`review-target-${index+1}`,field:'entrance',
  featureSkills:['entrance'],requiredReviewers:2,minimumGroups:2,language:'both',
  priority:index===0?'critical':'normal',sourceGroupId:`source-group-${index+1}`,
  operatorGroupId:null,geographicCellId:`cell-${index+1}`,dueOn:LATER,createdOn:DAY,
  createdBy:'coordinator',evidenceDigest:HASH,
  reviewBrief:{en:'Assess the supplied evidence only.',fr:'Évaluez uniquement les observations fournies.'},
  ...(patch[index]??{}),
 }))});
}
