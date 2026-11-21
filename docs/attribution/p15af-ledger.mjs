import {SOURCE_STATES,HOLD_REASONS,fail,exact,id,token,date,hash,safeText,copy,bodyDigest,
 appendEvent,eventHash,unique,MAX_EVENTS} from './p15af-contract.mjs';
import {validateImpactCatalog} from './p15af-catalog.mjs';
export const LEDGER_SCHEMA='access-maps-source-impact-ledger/1';
export const LEDGER_EVENTS=Object.freeze(['source-held','source-released','source-retired','source-superseded','impact-acknowledged','remediation-recorded','checkpoint']);
const ROOT=['schema','ledgerId','catalogDigest','createdOn','createdBy','sourceSnapshots','events','digest'];
function payload(row,type){
 if(type==='source-held'){
  exact(row,['sourceId','reason','reasonCode','previousState','sourceDigest']);
  id(row.sourceId);safeText(row.reason,'reason',500);
  fail(HOLD_REASONS.includes(row.reasonCode),'HOLD_REASON','Hold reason invalid.');
  fail(row.previousState==='active','SOURCE_STATE','Only active source can be held.');hash(row.sourceDigest);
 }else if(type==='source-released'){
  exact(row,['sourceId','holdEventHash','reviewDigest','sourceDigest']);
  id(row.sourceId);hash(row.holdEventHash);hash(row.reviewDigest);hash(row.sourceDigest);
 }else if(type==='source-retired'||type==='source-superseded'){
  exact(row,['sourceId','previousState','replacementSourceId','reason','sourceDigest']);
  id(row.sourceId);fail(SOURCE_STATES.includes(row.previousState),'SOURCE_STATE','Previous state invalid.');
  if(row.replacementSourceId!==null)id(row.replacementSourceId);
  safeText(row.reason,'reason',500);hash(row.sourceDigest);
 }else if(type==='impact-acknowledged'){
  exact(row,['planDigest','actionId','acknowledgedState','evidenceDigest']);
  hash(row.planDigest);id(row.actionId);fail(['accepted','deferred','rejected'].includes(row.acknowledgedState),
   'ACK_STATE','Acknowledgement state invalid.');hash(row.evidenceDigest);
 }else if(type==='remediation-recorded'){
  exact(row,['planDigest','actionId','resolution','evidenceDigest','resultDigest']);
  hash(row.planDigest);id(row.actionId);safeText(row.resolution,'resolution',500);
  hash(row.evidenceDigest);hash(row.resultDigest);
 }else if(type==='checkpoint'){
  exact(row,['sequence','headHash']);fail(Number.isSafeInteger(row.sequence)&&row.sequence>=0,'SEQUENCE','Checkpoint sequence invalid.');
  hash(row.headHash);
 }
}
export function createImpactLedger({ledgerId,catalog,createdOn,createdBy}={}){
 const valueCatalog=validateImpactCatalog(catalog);
 id(ledgerId);date(createdOn);token(createdBy);
 fail(createdOn>=valueCatalog.asOf,'DATE_ORDER','Ledger creation predates catalog.');
 const value={schema:LEDGER_SCHEMA,ledgerId,catalogDigest:valueCatalog.digest,createdOn,createdBy,
  sourceSnapshots:valueCatalog.sources.map(row=>({sourceId:row.sourceId,sourceDigest:row.sourceDigest,status:row.status})),
  events:[],digest:''};
 value.digest=bodyDigest(value);return value;
}
export function validateImpactLedger(input,{catalog}={}){
 exact(input,ROOT);fail(input.schema===LEDGER_SCHEMA,'SCHEMA','Unsupported impact ledger.');
 id(input.ledgerId);hash(input.catalogDigest);date(input.createdOn);token(input.createdBy);
 fail(Array.isArray(input.sourceSnapshots)&&input.sourceSnapshots.length<=5000,'LIMIT','Source snapshot index invalid.');
 input.sourceSnapshots.forEach(row=>{exact(row,['sourceId','sourceDigest','status']);id(row.sourceId);hash(row.sourceDigest);
  fail(SOURCE_STATES.includes(row.status),'SOURCE_STATE','Source snapshot state invalid.');});
 unique(input.sourceSnapshots.map(row=>row.sourceId),'ledger source IDs');
 if(catalog)fail(validateImpactCatalog(catalog).digest===input.catalogDigest,'STALE_LEDGER','Ledger catalog digest differs.');
 fail(Array.isArray(input.events)&&input.events.length<=MAX_EVENTS,'LIMIT','Ledger event list too large.');
 let previous='0'.repeat(64),lastDate=input.createdOn;
 input.events.forEach((row,index)=>{
  exact(row,['sequence','type','at','actor','payload','previousHash','hash']);
  fail(row.sequence===index+1,'SEQUENCE','Event sequence is not contiguous.');
  fail(LEDGER_EVENTS.includes(row.type),'EVENT_TYPE','Event type invalid.');
  date(row.at);token(row.actor);
  fail(row.at>=lastDate,'EVENT_ORDER','Event dates move backwards.');
  payload(row.payload,row.type);
  if(row.payload.sourceId){
   const snapshot=input.sourceSnapshots.find(item=>item.sourceId===row.payload.sourceId);
   fail(snapshot,'SOURCE_REF','Ledger event references a source outside its catalog snapshot.');
   fail(row.payload.sourceDigest===snapshot.sourceDigest,'SOURCE_DIGEST','Ledger event source digest differs from catalog snapshot.');
   if(row.type==='source-held')fail(snapshot.status==='active','SOURCE_STATE','Only an active catalog source can be held.');
   if(row.type==='source-superseded')fail(row.payload.replacementSourceId!==row.payload.sourceId,'SOURCE_REF','Replacement source must differ.');
  }
  hash(row.previousHash);hash(row.hash);
  fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Ledger event chain invalid.');
  previous=row.hash;lastDate=row.at;
 });
 hash(input.digest);fail(input.digest===bodyDigest(input),'HASH','Ledger digest invalid.');
 return copy(input);
}
function append(input,type,at,by,data){
 const next=copy(input);appendEvent(next,type,at,by,data);return validateImpactLedger(next);
}
export function holdSource(input,{sourceId,at,actor:by,reasonCode,reason,sourceDigest}={}){
 const ledger=validateImpactLedger(input);id(sourceId);date(at);token(by);safeText(reason,'reason',500);hash(sourceDigest);
 const snapshot=ledger.sourceSnapshots.find(row=>row.sourceId===sourceId);
 fail(snapshot&&snapshot.status==='active'&&snapshot.sourceDigest===sourceDigest,'SOURCE_REF','Hold must match an active source in the ledger snapshot.');
 fail(at>=ledger.createdOn,'EVENT_ORDER','Hold predates ledger.');
 const prior=ledger.events.filter(row=>row.payload.sourceId===sourceId).at(-1);
 fail(!prior||['source-released','source-retired','source-superseded'].includes(prior.type),
  'SOURCE_ALREADY_HELD','Source already has an unresolved hold or terminal status.');
 return append(ledger,'source-held',at,by,{sourceId,reason,reasonCode,previousState:'active',sourceDigest});
}
export function releaseSource(input,{sourceId,at,actor:by,holdEventHash,reviewDigest,sourceDigest}={}){
 const ledger=validateImpactLedger(input);id(sourceId);date(at);token(by);
 hash(holdEventHash);hash(reviewDigest);hash(sourceDigest);
 const snapshot=ledger.sourceSnapshots.find(row=>row.sourceId===sourceId);
 fail(snapshot&&snapshot.sourceDigest===sourceDigest,'SOURCE_REF','Release digest does not match ledger source snapshot.');
 const held=[...ledger.events].reverse().find(row=>row.type==='source-held'&&row.payload.sourceId===sourceId);
 fail(held&&held.hash===holdEventHash,'HOLD_REF','Release must reference the latest matching hold event.');
 const later=ledger.events.some(row=>row.sequence>held.sequence&&row.payload.sourceId===sourceId);
 fail(!later,'HOLD_RESOLVED','Hold has already been resolved.');
 fail(at>=held.at,'EVENT_ORDER','Release predates hold.');
 return append(ledger,'source-released',at,by,{sourceId,holdEventHash,reviewDigest,sourceDigest});
}
export function retireSource(input,{sourceId,at,actor:by,reason,replacementSourceId=null,sourceDigest}={}){
 const ledger=validateImpactLedger(input);id(sourceId);date(at);token(by);safeText(reason,'reason',500);hash(sourceDigest);
 const snapshot=ledger.sourceSnapshots.find(row=>row.sourceId===sourceId);
 fail(snapshot&&snapshot.sourceDigest===sourceDigest,'SOURCE_REF','Retirement digest does not match ledger source snapshot.');
 if(replacementSourceId!==null){id(replacementSourceId);fail(ledger.sourceSnapshots.some(row=>row.sourceId===replacementSourceId),'SOURCE_REF','Replacement source is not in ledger catalog snapshot.');}
 const last=[...ledger.events].reverse().find(row=>row.payload.sourceId===sourceId);
 const previousState=last?.type==='source-held'?'held':'active';
 fail(!last||['source-released'].includes(last.type),'SOURCE_TERMINAL','Source already retired or superseded.');
 return append(ledger,replacementSourceId?'source-superseded':'source-retired',at,by,
  {sourceId,previousState,replacementSourceId,reason,sourceDigest});
}
export function acknowledgeImpact(input,{planDigest,actionId,acknowledgedState,evidenceDigest,at,actor:by}={}){
 const ledger=validateImpactLedger(input);hash(planDigest);id(actionId);hash(evidenceDigest);date(at);token(by);
 fail(['accepted','deferred','rejected'].includes(acknowledgedState),'ACK_STATE','Acknowledgement state invalid.');
 return append(ledger,'impact-acknowledged',at,by,{planDigest,actionId,acknowledgedState,evidenceDigest});
}
export function recordRemediation(input,{planDigest,actionId,resolution,evidenceDigest,resultDigest,at,actor:by}={}){
 const ledger=validateImpactLedger(input);hash(planDigest);id(actionId);safeText(resolution,'resolution',500);
 hash(evidenceDigest);hash(resultDigest);date(at);token(by);
 const ack=[...ledger.events].reverse().find(row=>row.type==='impact-acknowledged'&&row.payload.actionId===actionId);
 fail(ack&&ack.payload.planDigest===planDigest&&ack.payload.acknowledgedState==='accepted',
  'ACK_REQUIRED','Accepted acknowledgement is required before remediation.');
 return append(ledger,'remediation-recorded',at,by,{planDigest,actionId,resolution,evidenceDigest,resultDigest});
}
export function ledgerSummary(input){
 const ledger=validateImpactLedger(input),held=new Set(),retired=new Set(),acks=new Map(),done=new Set();
 for(const row of ledger.events){
  const p=row.payload;
  if(row.type==='source-held')held.add(p.sourceId);
  if(row.type==='source-released'||row.type==='source-retired'||row.type==='source-superseded')held.delete(p.sourceId);
  if(row.type==='source-retired'||row.type==='source-superseded')retired.add(p.sourceId);
  if(row.type==='impact-acknowledged')acks.set(p.actionId,p.acknowledgedState);
  if(row.type==='remediation-recorded')done.add(p.actionId);
 }
 return {ledgerId:ledger.ledgerId,events:ledger.events.length,heldSources:[...held].sort(),
  retiredSources:[...retired].sort(),acknowledgements:Object.fromEntries([...acks].sort()),
  remediatedActions:[...done].sort(),digest:bodyDigest({ledgerId:ledger.ledgerId,held:[...held].sort(),
   retired:[...retired].sort(),acks:Object.fromEntries([...acks].sort()),done:[...done].sort()})};
}
