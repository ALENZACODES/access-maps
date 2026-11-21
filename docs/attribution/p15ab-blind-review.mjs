import { REVIEW_SCHEMA,DECISIONS,fail,exact,id,text,date,hash,copy,sha256,
 digestBody,sorted,unique,safePublicId } from './p15ab-contract.mjs';
import { validateAssignmentPlan } from './p15ab-assign.mjs';
import { validateTaskSet } from './p15ab-tasks.mjs';
import { validateReviewerRoster } from './p15ab-roster.mjs';

export const RESPONSE_SCHEMA='access-maps-blind-review-response/1';
export const RECONCILIATION_SCHEMA='access-maps-blind-review-reconciliation/1';
const PACKET_KEYS=['schema','packetId','planId','taskId','blindReviewerId','recordDigest','evidenceDigest',
 'field','featureSkills','language','priority','dueOn','brief','issuedOn','expiresOn','digest'];
const RESPONSE_KEYS=['schema','responseId','packetId','blindReviewerId','decision','observedAccess','rationale',
 'sourceIds','reviewedOn','evidenceDigest','digest'];
const ACCESS=['YES','NO','UNKNOWN'];
function publicReviewerToken(seed,taskId,reviewerId){
 return `blind-${sha256(`${seed}\u0000${taskId}\u0000${reviewerId}`).slice(0,20)}`;
}
export function createBlindPackets(planInput,{roster:rosterInput,conflicts,taskSet:taskSetInput,
 issuedOn,expiresOn}={}){
 const plan=validateAssignmentPlan(planInput,{roster:rosterInput,conflicts,taskSet:taskSetInput});
 const roster=validateReviewerRoster(rosterInput),tasks=validateTaskSet(taskSetInput),byTask=new Map(tasks.tasks.map(row=>[row.taskId,row]));
 date(issuedOn,'issuedOn');date(expiresOn,'expiresOn');fail(expiresOn>=issuedOn,'DATE_ORDER','Packet expiry precedes issue date.');
 const packets=[];
 for(const assignment of plan.assignments)for(const reviewerId of assignment.reviewerIds){
  const task=byTask.get(assignment.taskId),blindReviewerId=publicReviewerToken(plan.seed,task.taskId,reviewerId);
  const publicCopy=JSON.stringify({field:task.field,brief:task.reviewBrief});
  for(const privateValue of [task.recordId,task.recordAlias,task.sourceGroupId,task.operatorGroupId,task.geographicCellId]){
   if(privateValue!==null)fail(!publicCopy.includes(privateValue),'BLIND_LEAK','Task brief contains internal record or conflict metadata.');
  }
  const packet={schema:REVIEW_SCHEMA,packetId:`packet-${sha256({planId:plan.planId,taskId:task.taskId,blindReviewerId}).slice(0,24)}`,
   planId:plan.planId,taskId:task.taskId,blindReviewerId,recordDigest:task.recordDigest,
   evidenceDigest:task.evidenceDigest,field:task.field,featureSkills:[...task.featureSkills],
   language:task.language,priority:task.priority,dueOn:task.dueOn,brief:copy(task.reviewBrief),
   issuedOn,expiresOn,digest:''};
  packet.digest=digestBody(packet);packets.push(packet);
 }
 unique(packets.map(row=>row.packetId),'blind packet IDs');
 return sorted(packets,row=>row.packetId);
}
export function validateBlindPacket(input){
 exact(input,PACKET_KEYS);fail(input.schema===REVIEW_SCHEMA,'SCHEMA','Unsupported blind packet schema.');
 id(input.packetId,'packetId');id(input.planId,'planId');id(input.taskId,'taskId');safePublicId(input.blindReviewerId);
 hash(input.recordDigest,'recordDigest');hash(input.evidenceDigest,'evidenceDigest');text(input.field,'field',{max:120});
 fail(Array.isArray(input.featureSkills)&&input.featureSkills.length>0,'SKILLS','Packet skills missing.');
 unique(input.featureSkills,'packet skills');date(input.dueOn,'dueOn');date(input.issuedOn,'issuedOn');date(input.expiresOn,'expiresOn');
 fail(input.expiresOn>=input.issuedOn,'DATE_ORDER','Packet expiry precedes issue date.');
 exact(input.brief,['en','fr']);text(input.brief.en,'brief en');text(input.brief.fr,'brief fr');
 hash(input.digest);fail(input.digest===digestBody(input),'HASH','Blind packet digest invalid.');
 fail(!/(?:"(?:reviewerId|recordId|operatorGroupId|geographicCellId|sourceGroupId)"\s*:)/iu.test(JSON.stringify(input)),
  'BLIND_LEAK','Blind packet contains internal identity or conflict metadata.');
 return copy(input);
}
export function submitBlindResponse(packetInput,{responseId,decision,observedAccess,rationale,sourceIds,
 reviewedOn,evidenceDigest}={}){
 const packet=validateBlindPacket(packetInput);id(responseId,'responseId');
 fail(DECISIONS.includes(decision),'DECISION','Review decision invalid.');
 fail(ACCESS.includes(observedAccess),'UNKNOWN','Observed access must be YES, NO or UNKNOWN.');
 fail(decision!=='supported'||observedAccess!=='UNKNOWN','UNKNOWN','UNKNOWN cannot be a supported conclusion.');
 fail(decision!=='contradicted'||observedAccess!=='UNKNOWN','UNKNOWN','A contradiction requires an observed state.');
 text(rationale,'rationale',{max:1000});fail(Array.isArray(sourceIds)&&sourceIds.length<=100,'SOURCE_IDS','Source IDs are invalid.');
 sourceIds.forEach(value=>id(value,'sourceId'));unique(sourceIds,'response source IDs');
 date(reviewedOn,'reviewedOn');fail(reviewedOn>=packet.issuedOn&&reviewedOn<=packet.expiresOn,
  'PACKET_WINDOW','Response is outside packet validity.');
 hash(evidenceDigest,'evidenceDigest');fail(evidenceDigest===packet.evidenceDigest,
  'STALE_EVIDENCE','Response evidence digest differs from packet.');
 const response={schema:RESPONSE_SCHEMA,responseId,packetId:packet.packetId,
  blindReviewerId:packet.blindReviewerId,decision,observedAccess,rationale,sourceIds:sorted(sourceIds,x=>x),
  reviewedOn,evidenceDigest,digest:''};
 response.digest=digestBody(response);return response;
}
export function validateBlindResponse(input,packet){
 exact(input,RESPONSE_KEYS);fail(input.schema===RESPONSE_SCHEMA,'SCHEMA','Unsupported blind response schema.');
 const row=submitBlindResponse(packet,input);
 fail(row.digest===input.digest,'HASH','Blind response digest invalid.');
 return row;
}
export function reconcileBlindResponses(packetsInput,responsesInput,{minimumAgreement=2}={}){
 fail(Array.isArray(packetsInput)&&Array.isArray(responsesInput),'SHAPE','Packets and responses must be arrays.');
 integerBound(minimumAgreement,1,5);
 const packets=packetsInput.map(validateBlindPacket),byPacket=new Map(packets.map(row=>[row.packetId,row]));
 unique(packets.map(row=>row.packetId),'packet IDs');
 const responses=responsesInput.map(row=>{
  const packet=byPacket.get(row.packetId);fail(packet,'PACKET_REF','Response packet does not exist.');
  return validateBlindResponse(row,packet);
 });
 unique(responses.map(row=>row.responseId),'response IDs');unique(responses.map(row=>row.packetId),'responses per packet');
 const groups=new Map();
 for(const row of responses){const taskId=byPacket.get(row.packetId).taskId;const list=groups.get(taskId)??[];list.push(row);groups.set(taskId,list);}
 const outcomes=[];
 for(const [taskId,rows] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  const decisions=rows.filter(row=>row.decision!=='abstain').map(row=>row.observedAccess);
  const known=new Set(decisions.filter(value=>value!=='UNKNOWN'));
  const conflict=known.size>1,allUnknown=known.size===0;
  const quorum=rows.filter(row=>row.decision!=='abstain').length>=minimumAgreement;
  const consensus=!conflict&&!allUnknown&&quorum&&new Set(decisions).size===1?decisions[0]:'UNKNOWN';
  outcomes.push({taskId,responseCount:rows.length,decisionCount:decisions.length,quorum,
   conflict,consensus,needsAdjudication:conflict||!quorum||allUnknown,
   responseDigests:sorted(rows,row=>row.responseId).map(row=>row.digest)});
 }
 const result={schema:RECONCILIATION_SCHEMA,minimumAgreement,outcomes,
  totals:{tasks:outcomes.length,consensus:outcomes.filter(row=>row.consensus!=='UNKNOWN').length,
   adjudication:outcomes.filter(row=>row.needsAdjudication).length},digest:''};
 result.digest=digestBody(result);return result;
}
function integerBound(value,min,max){fail(Number.isSafeInteger(value)&&value>=min&&value<=max,'INTEGER','Minimum agreement is invalid.');}
