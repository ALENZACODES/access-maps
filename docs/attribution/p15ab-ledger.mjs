import { LEDGER_SCHEMA,MAX_EVENTS,ZERO,fail,exact,id,date,actor,text,hash,copy,
 digestBody,eventDigest,addEvent,sha256,unique } from './p15ab-contract.mjs';
import { validateBlindPacket,validateBlindResponse } from './p15ab-blind-review.mjs';

const ROOT=['schema','ledgerId','planId','planDigest','createdOn','createdBy','events','checkpoints','digest'];
const EVENT_TYPES=['plan-opened','packet-issued','response-received','reviewer-recused','adjudication-opened',
 'adjudication-closed','assignment-reopened','checkpoint'];
const CHECKPOINT=['checkpointId','sequence','headHash','stateDigest','createdAt','createdBy'];
const EVENT=['eventId','sequence','type','at','actor','payload','previousHash','hash'];
function stateDigest(value){const {digest,...body}=value;return sha256(body);}
function append(ledger,type,at,by,payload){
 fail(ledger.events.length<MAX_EVENTS,'LIMIT','Assignment ledger event limit reached.');
 const row=addEvent(ledger,type,at,by,payload);ledger.digest=stateDigest(ledger);return row;
}
export function createAssignmentLedger({ledgerId,plan,createdOn,createdBy}={}){
 id(ledgerId,'ledgerId');date(createdOn,'createdOn');actor(createdBy);
 fail(plan?.schema==='access-maps-review-assignment/1','PLAN','A valid assignment plan is required.');
 hash(plan.digest,'planDigest');
 const ledger={schema:LEDGER_SCHEMA,ledgerId,planId:plan.planId,planDigest:plan.digest,
  createdOn,createdBy,events:[],checkpoints:[],digest:''};
 ledger.digest=stateDigest(ledger);append(ledger,'plan-opened',createdOn,createdBy,{planId:plan.planId,planDigest:plan.digest});
 return copy(ledger);
}
export function validateAssignmentLedger(input){
 exact(input,ROOT);fail(input.schema===LEDGER_SCHEMA,'SCHEMA','Unsupported assignment ledger.');
 id(input.ledgerId,'ledgerId');id(input.planId,'planId');hash(input.planDigest);date(input.createdOn,'createdOn');actor(input.createdBy);
 fail(Array.isArray(input.events)&&input.events.length<=MAX_EVENTS,'LIMIT','Assignment event list invalid.');
 fail(Array.isArray(input.checkpoints)&&input.checkpoints.length<=10000,'LIMIT','Checkpoint list invalid.');
 let previous=ZERO;const eventIds=new Set(),packets=new Set(),responses=new Set(),recused=new Set(),adjudications=new Set(),closed=new Set();
 let previousAt=input.createdOn;
 input.events.forEach((row,index)=>{
  exact(row,EVENT);id(row.eventId,'eventId');fail(row.sequence===index+1,'SEQUENCE','Event sequence is not contiguous.');
  fail(EVENT_TYPES.includes(row.type),'EVENT_TYPE','Assignment event type invalid.');date(row.at,'event date');actor(row.actor);
  fail(row.at>=previousAt,'EVENT_ORDER','Assignment event dates cannot move backwards.');previousAt=row.at;
  hash(row.previousHash);hash(row.hash);fail(row.previousHash===previous&&row.hash===eventDigest(row),'EVENT_HASH','Event chain integrity failed.');
  fail(!eventIds.has(row.eventId),'DUPLICATE','Event ID repeats.');eventIds.add(row.eventId);
  validatePayload(row,packets,responses,recused,adjudications,closed);
  previous=row.hash;
 });
 const checkpointIds=new Set();
 for(const row of input.checkpoints){
  exact(row,CHECKPOINT);id(row.checkpointId,'checkpointId');date(row.createdAt,'createdAt');actor(row.createdBy);
  hash(row.headHash);hash(row.stateDigest);
  fail(!checkpointIds.has(row.checkpointId),'DUPLICATE','Checkpoint ID repeats.');checkpointIds.add(row.checkpointId);
  fail(Number.isSafeInteger(row.sequence)&&row.sequence>=0&&row.sequence<=input.events.length,'CHECKPOINT','Checkpoint sequence invalid.');
  fail(row.headHash===(row.sequence===0?ZERO:input.events[row.sequence-1].hash),'CHECKPOINT_HEAD','Checkpoint head mismatch.');
 }
 fail(input.digest===stateDigest(input),'LEDGER_DIGEST','Assignment ledger digest invalid.');
 return copy(input);
}
function validatePayload(row,packets,responses,recused,adjudications,closed){
 const p=row.payload;
 if(row.type==='plan-opened'){
  exact(p,['planId','planDigest']);id(p.planId);hash(p.planDigest);
 }else if(row.type==='packet-issued'){
  exact(p,['packetId','taskId','blindReviewerId','packetDigest']);id(p.packetId);id(p.taskId);
  id(p.blindReviewerId);hash(p.packetDigest);fail(!packets.has(p.packetId),'DUPLICATE','Packet already issued.');packets.add(p.packetId);
 }else if(row.type==='response-received'){
  exact(p,['responseId','packetId','blindReviewerId','responseDigest']);id(p.responseId);id(p.packetId);id(p.blindReviewerId);hash(p.responseDigest);
  fail(packets.has(p.packetId),'PACKET_REF','Response packet was not issued.');
  fail(!responses.has(p.responseId),'DUPLICATE','Response already received.');
  fail(!recused.has(p.blindReviewerId),'RECUSAL','A recused reviewer cannot submit a response.');responses.add(p.responseId);
 }else if(row.type==='reviewer-recused'){
  exact(p,['blindReviewerId','reason']);id(p.blindReviewerId);text(p.reason,'recusal reason',{max:500});
  recused.add(p.blindReviewerId);
 }else if(row.type==='adjudication-opened'){
  exact(p,['taskId','adjudicationId','responseIds','reason']);id(p.taskId);id(p.adjudicationId);
  fail(Array.isArray(p.responseIds)&&p.responseIds.length>=2,'ADJUDICATION','At least two responses are required.');
  p.responseIds.forEach(value=>id(value));unique(p.responseIds,'adjudication response IDs');
  text(p.reason,'adjudication reason',{max:500});fail(!adjudications.has(p.adjudicationId),'DUPLICATE','Adjudication ID repeats.');
  adjudications.add(p.adjudicationId);
 }else if(row.type==='adjudication-closed'){
  exact(p,['adjudicationId','decision','reason','evidenceDigest']);id(p.adjudicationId);
  fail(adjudications.has(p.adjudicationId),'ADJUDICATION_REF','Adjudication was not opened.');
  fail(['YES','NO','UNKNOWN'].includes(p.decision),'UNKNOWN','Adjudication decision is invalid.');
  text(p.reason,'adjudication reason',{max:1000});hash(p.evidenceDigest,'evidenceDigest');
  fail(!closed.has(p.adjudicationId),'ADJUDICATION_CLOSED','Adjudication was already closed.');closed.add(p.adjudicationId);
 }else if(row.type==='assignment-reopened'){
  exact(p,['taskId','reason']);id(p.taskId);text(p.reason,'reopen reason',{max:500});
 }else if(row.type==='checkpoint'){
  exact(p,['checkpointId','sequence','headHash']);id(p.checkpointId);integerValue(p.sequence);
  hash(p.headHash);
 }
}
function integerValue(value){fail(Number.isSafeInteger(value)&&value>=0,'INTEGER','Sequence must be a nonnegative integer.');}
export function issuePacket(input,packet,{at,actor:by}={}){
 const ledger=validateAssignmentLedger(input),row=validateBlindPacket(packet);
 date(at,'at');actor(by);fail(row.planId===ledger.planId,'PLAN_MISMATCH','Packet belongs to another plan.');
 const next=copy(ledger);append(next,'packet-issued',at,by,{packetId:row.packetId,taskId:row.taskId,
  blindReviewerId:row.blindReviewerId,packetDigest:row.digest});return copy(next);
}
export function receiveResponse(input,response,packet,{at,actor:by}={}){
 const ledger=validateAssignmentLedger(input),row=validateBlindResponse(response,packet);
 date(at,'at');actor(by);fail(row.reviewedOn<=at,'EVENT_DATE','Response receipt cannot predate review.');
 fail(!ledger.events.some(event=>event.type==='reviewer-recused'&&event.payload.blindReviewerId===row.blindReviewerId),
  'RECUSAL','A recused reviewer cannot submit a response.');
 fail(ledger.events.some(event=>event.type==='packet-issued'&&event.payload.packetId===row.packetId),
  'PACKET_REF','Packet must be issued before response receipt.');
 fail(!ledger.events.some(event=>event.type==='response-received'&&event.payload.responseId===row.responseId),
  'DUPLICATE','Response has already been received.');
 const next=copy(ledger);append(next,'response-received',at,by,{responseId:row.responseId,
  packetId:row.packetId,blindReviewerId:row.blindReviewerId,responseDigest:row.digest});return copy(next);
}
export function recuseBlindReviewer(input,{blindReviewerId,at,actor:by,reason}={}){
 const ledger=validateAssignmentLedger(input);id(blindReviewerId,'blindReviewerId');date(at,'at');actor(by);
 text(reason,'recusal reason',{max:500});
 fail(!ledger.events.some(event=>event.type==='reviewer-recused'&&event.payload.blindReviewerId===blindReviewerId),
  'DUPLICATE','Reviewer has already been recused.');
 const next=copy(ledger);append(next,'reviewer-recused',at,by,{blindReviewerId,reason});return copy(next);
}
export function openAdjudication(input,{taskId,adjudicationId,responseIds,at,actor:by,reason}={}){
 const ledger=validateAssignmentLedger(input);id(taskId,'taskId');id(adjudicationId,'adjudicationId');
 date(at,'at');actor(by);text(reason,'adjudication reason',{max:500});
 fail(Array.isArray(responseIds)&&responseIds.length>=2,'ADJUDICATION','At least two response IDs are required.');
 const received=new Set(ledger.events.filter(event=>event.type==='response-received').map(event=>event.payload.responseId));
 fail(responseIds.every(value=>received.has(value)),'RESPONSE_REF','Every adjudication response must be received.');
 const next=copy(ledger);append(next,'adjudication-opened',at,by,{taskId,adjudicationId,responseIds:[...responseIds],reason});return copy(next);
}
export function closeAdjudication(input,{adjudicationId,decision,reason,evidenceDigest,at,actor:by}={}){
 const ledger=validateAssignmentLedger(input);id(adjudicationId,'adjudicationId');date(at,'at');actor(by);
 const opened=ledger.events.some(event=>event.type==='adjudication-opened'&&event.payload.adjudicationId===adjudicationId);
 fail(opened,'ADJUDICATION_REF','Adjudication must be opened before closing.');
 fail(!ledger.events.some(event=>event.type==='adjudication-closed'&&event.payload.adjudicationId===adjudicationId),
  'ADJUDICATION_CLOSED','Adjudication is already closed.');
 fail(['YES','NO','UNKNOWN'].includes(decision),'UNKNOWN','Adjudication decision invalid.');
 text(reason,'adjudication reason',{max:1000});hash(evidenceDigest,'evidenceDigest');
 const next=copy(ledger);append(next,'adjudication-closed',at,by,{adjudicationId,decision,reason,evidenceDigest});return copy(next);
}
export function reopenAssignment(input,{taskId,at,actor:by,reason}={}){
 const ledger=validateAssignmentLedger(input);id(taskId,'taskId');date(at,'at');actor(by);text(reason,'reopen reason',{max:500});
 const next=copy(ledger);append(next,'assignment-reopened',at,by,{taskId,reason});return copy(next);
}
export function checkpointAssignmentLedger(input,{checkpointId,at,actor:by}={}){
 const ledger=validateAssignmentLedger(input);id(checkpointId,'checkpointId');date(at,'at');actor(by);
 fail(!ledger.checkpoints.some(row=>row.checkpointId===checkpointId),'DUPLICATE','Checkpoint ID already exists.');
 const next=copy(ledger),sequence=next.events.length,headHash=sequence?next.events[sequence-1].hash:ZERO;
 next.checkpoints.push({checkpointId,sequence,headHash,stateDigest:digestBody(next),createdAt:at,createdBy:by});
 append(next,'checkpoint',at,by,{checkpointId,sequence,headHash});return copy(next);
}
