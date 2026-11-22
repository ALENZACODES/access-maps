import { checkCustodyHistory, itemTransitions } from './p15-custody-history.mjs';
import {
 CUSTODY_SCHEMA,EVIDENCE_TIERS,ITEM_STATES,ACCESS_PURPOSES,EVENT_TYPES,EVIDENCE_KINDS,MAX_ITEMS,MAX_EVENTS,
 MAX_ACCESS,MAX_REDACTIONS,fail,exact,id,role,text,date,timestamp,hash,integer,oneOf,
 array,unique,copy,sorted,bodyHash,appendEvent,eventHash
} from './p15-custody-contract.mjs';

const ROOT=['schema','ledgerId','openedOn','openedBy','items','accessRecords','redactions','events','digest'];
const ITEM=['itemId','kind','label','reference','contentDigest','sourceId','sourceDigest','licence',
 'licenceReference','retrievedOn','capturedOn','custodianToken','state','supersedes','notes'];
const ACCESS=['accessId','itemId','purpose','actorToken','accessedAt','reason','result','exportDigest'];
const REDACTION=['redactionId','itemId','fieldPath','reason','appliedOn','appliedBy','replacement','originalDigest'];
const LICENCES=['CC0-1.0','CC-BY-4.0','OGL-Canada-2.0','OGL-ON-1.0','ODbL-1.0','UNKNOWN','NOT-APPLICABLE'];
const ACCESS_RESULTS=['allowed','denied','not-recorded'];
function itemRow(row){
 exact(row,ITEM,['tier']);
 if(Object.hasOwn(row,'tier'))oneOf(row.tier,EVIDENCE_TIERS,'tier');
 id(row.itemId);oneOf(row.kind,EVIDENCE_KINDS,'kind');
 text(row.label,'label',{max:180});text(row.reference,'reference',{max:500});
 hash(row.contentDigest,'contentDigest');id(row.sourceId,'sourceId');hash(row.sourceDigest,'sourceDigest');
 oneOf(row.licence,LICENCES,'licence');text(row.licenceReference,'licenceReference',{max:500,empty:true});
 date(row.retrievedOn);date(row.capturedOn);fail(row.retrievedOn>=row.capturedOn,'DATE_ORDER','Retrieval predates capture.');
 role(row.custodianToken);oneOf(row.state,ITEM_STATES,'item state');
 if(row.supersedes!==null)id(row.supersedes);
 text(row.notes,'notes',{max:1000,empty:true});return copy(row);
}
function accessRow(row){
 exact(row,ACCESS);id(row.accessId);id(row.itemId);oneOf(row.purpose,ACCESS_PURPOSES,'purpose');
 role(row.actorToken);timestamp(row.accessedAt);text(row.reason,'reason',{max:500});
 oneOf(row.result,ACCESS_RESULTS,'result');
 if(row.exportDigest!==null)hash(row.exportDigest,'exportDigest');
 return copy(row);
}
function redactionRow(row){
 exact(row,REDACTION);id(row.redactionId);id(row.itemId);
 text(row.fieldPath,'fieldPath',{max:200});text(row.reason,'reason',{max:500});
 date(row.appliedOn);role(row.appliedBy);text(row.replacement,'replacement',{max:300});
 hash(row.originalDigest,'originalDigest');
 const parts=row.fieldPath.split('.');
 fail(['label','reference','notes','licenceReference','custodianToken','contentDigest','sourceDigest'].includes(parts[0])&&
  parts.every(part=>/^[a-z][a-zA-Z0-9]*$/u.test(part)),'FIELD_PATH','Redaction field path is invalid.');
 return copy(row);
}
function validateEvent(row,index,previous,previousTime){
 exact(row,['sequence','type','at','actorToken','payload','previousHash','hash']);
 integer(row.sequence,'sequence',{min:1,max:MAX_EVENTS});
 fail(row.sequence===index+1,'SEQUENCE','Event sequence is not contiguous.');
 oneOf(row.type,EVENT_TYPES,'event type');timestamp(row.at);role(row.actorToken);
 fail(row.at>=previousTime,'EVENT_ORDER','Event timestamps moved backwards.');
 hash(row.previousHash);hash(row.hash);
 fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Custody event chain invalid.');
 if(row.type==='ledger-opened')exact(row.payload,['ledgerId']);
 else if(row.type==='item-registered')exact(row.payload,['itemId','itemDigest','custodianToken']);
 else if(row.type==='item-metadata-updated')exact(row.payload,['itemId','previousDigest','nextDigest','reason']);
 else if(row.type==='item-state-changed')exact(row.payload,['itemId','from','to','reason','previousDigest','nextDigest']);
 else if(row.type==='custody-transferred')exact(row.payload,['itemId','fromCustodian','toCustodian','reason','previousDigest','nextDigest']);
 else if(row.type==='access-recorded')exact(row.payload,['accessId','itemId','accessDigest']);
 else if(row.type==='redaction-recorded')exact(row.payload,['redactionId','itemId','redactionDigest']);
 else if(row.type==='checkpoint-added')exact(row.payload,['checkpointId','headHash','sequence']);
 return row;
}
export function createCustodyLedger({ledgerId,openedOn,openedAt,openedBy}={}){
 id(ledgerId);date(openedOn);timestamp(openedAt);role(openedBy);
 fail(openedAt.slice(0,10)===openedOn,'DATE_ORDER','Ledger timestamp date differs from opening date.');
 const value={schema:CUSTODY_SCHEMA,ledgerId,openedOn,openedBy,items:[],
  accessRecords:[],redactions:[],events:[],digest:''};
 value.digest=bodyHash(value);appendEvent(value,'ledger-opened',openedAt,openedBy,{ledgerId});
 return validateCustodyLedger(value);
}
export function validateCustodyLedger(input){
 exact(input,ROOT);fail(input.schema===CUSTODY_SCHEMA,'SCHEMA','Unsupported custody ledger.');
 id(input.ledgerId);date(input.openedOn);role(input.openedBy);
 array(input.items,'items',{max:MAX_ITEMS});array(input.accessRecords,'access records',{max:MAX_ACCESS});
 array(input.redactions,'redactions',{max:MAX_REDACTIONS});array(input.events,'events',{min:1,max:MAX_EVENTS});
 const items=input.items.map(itemRow),access=input.accessRecords.map(accessRow),redactions=input.redactions.map(redactionRow);
 unique(items.map(row=>row.itemId),'item IDs');unique(access.map(row=>row.accessId),'access IDs');
 unique(redactions.map(row=>row.redactionId),'redaction IDs');
 const itemIds=new Set(items.map(row=>row.itemId));
 for(const item of items){
  fail(item.retrievedOn<=input.events.at(-1).at.slice(0,10),'FUTURE_ITEM','Item retrieval date postdates ledger activity.');
  if(item.supersedes!==null)fail(itemIds.has(item.supersedes)&&item.supersedes!==item.itemId,
   'ITEM_REFERENCE','Superseded item does not exist or self-references.');
 }
 for(const row of access)fail(itemIds.has(row.itemId),'ITEM_REFERENCE','Access record item is missing.');
 for(const row of redactions)fail(itemIds.has(row.itemId),'ITEM_REFERENCE','Redaction item is missing.');
 let previous='0'.repeat(64),previousTime=input.events[0].at;
 input.events.forEach((row,index)=>{
  validateEvent(row,index,previous,previousTime);previous=row.hash;previousTime=row.at;
 });
 checkCustodyHistory(input);
 fail(input.digest===bodyHash(input),'HASH','Custody ledger digest invalid.');
 return copy(input);
}
function mutate(input,operation){
 const current=validateCustodyLedger(input),next=copy(current);operation(next);
 next.digest=bodyHash(next);return validateCustodyLedger(next);
}
export function registerEvidence(input,row,{at,actorToken}={}){
 const current=validateCustodyLedger(input);timestamp(at);role(actorToken);
 const value=itemRow(row);
 if(!Object.hasOwn(value,'tier'))value.tier='UNKNOWN';
 fail(at>=`${current.openedOn}T00:00:00.000Z`,'EVENT_ORDER','Registration predates ledger opening.');
 fail(!current.items.some(item=>item.itemId===value.itemId),'DUPLICATE','Evidence item already exists.');
 fail(value.retrievedOn<=at.slice(0,10)&&value.capturedOn<=at.slice(0,10),
  'DATE_ORDER','Evidence dates postdate registration.');
 fail(value.state==='held','INITIAL_STATE','New evidence must begin in held state.');
 fail(value.supersedes===null||current.items.some(item=>item.itemId===value.supersedes),
  'ITEM_REFERENCE','Superseded evidence item must already exist.');
 return mutate(current,next=>{
  next.items.push(value);next.items=sorted(next.items,item=>item.itemId);
  appendEvent(next,'item-registered',at,actorToken,{itemId:value.itemId,itemDigest:bodyHash(value),custodianToken:value.custodianToken});
 });
}
export function updateEvidenceMetadata(input,itemId,patch,{at,actorToken,reason}={}){
 const current=validateCustodyLedger(input);id(itemId);timestamp(at);role(actorToken);text(reason,'reason',{max:500});
 const index=current.items.findIndex(row=>row.itemId===itemId);fail(index>=0,'ITEM_REFERENCE','Evidence item not found.');
 const before=current.items[index],after=itemRow({...before,...patch});
 fail(after.itemId===itemId,'IMMUTABLE_ID','Evidence item ID cannot change.');
 fail(after.state===before.state&&after.custodianToken===before.custodianToken,
  'STATE_API','Use state and transfer operations for custody changes.');
 fail(after.capturedOn===before.capturedOn,'IMMUTABLE_CAPTURE','Capture date cannot change.');
 return mutate(current,next=>{
  next.items[index]=after;
  appendEvent(next,'item-metadata-updated',at,actorToken,{itemId,previousDigest:bodyHash(before),
   nextDigest:bodyHash(after),reason});
 });
}
export function changeEvidenceState(input,{itemId,to,at,actorToken,reason}={}){
 const current=validateCustodyLedger(input);id(itemId);oneOf(to,ITEM_STATES,'item state');
 timestamp(at);role(actorToken);text(reason,'reason',{max:500});
 const item=current.items.find(row=>row.itemId===itemId);fail(item,'ITEM_REFERENCE','Evidence item not found.');
 fail(itemTransitions[item.state].includes(to),'STATE_TRANSITION','Evidence state transition is not permitted.');
 return mutate(current,next=>{
  const target=next.items.find(row=>row.itemId===itemId),from=target.state;
  const previousDigest=bodyHash(target);target.state=to;const nextDigest=bodyHash(target);
  appendEvent(next,'item-state-changed',at,actorToken,{itemId,from,to,reason,previousDigest,nextDigest});
 });
}
export function transferCustody(input,{itemId,toCustodian,at,actorToken,reason}={}){
 const current=validateCustodyLedger(input);id(itemId);role(toCustodian,'toCustodian');
 timestamp(at);role(actorToken);text(reason,'reason',{max:500});
 const item=current.items.find(row=>row.itemId===itemId);fail(item,'ITEM_REFERENCE','Evidence item not found.');
 fail(item.state!=='withdrawn','ITEM_WITHDRAWN','Withdrawn evidence cannot be transferred.');
 fail(item.custodianToken!==toCustodian,'SAME_CUSTODIAN','Custody transfer must change custodian.');
 return mutate(current,next=>{
  const target=next.items.find(row=>row.itemId===itemId),fromCustodian=target.custodianToken;
  const previousDigest=bodyHash(target);target.custodianToken=toCustodian;const nextDigest=bodyHash(target);
  appendEvent(next,'custody-transferred',at,actorToken,{itemId,fromCustodian,toCustodian,reason,previousDigest,nextDigest});
 });
}
export function recordAccess(input,row){
 const current=validateCustodyLedger(input),value=accessRow(row);
 const item=current.items.find(entry=>entry.itemId===value.itemId);fail(item,'ITEM_REFERENCE','Access item not found.');
 fail(item.state!=='withdrawn','ACCESS_WITHDRAWN','Withdrawn evidence cannot be accessed.');
 fail(!current.accessRecords.some(entry=>entry.accessId===value.accessId),'DUPLICATE','Access ID already exists.');
 fail(value.accessedAt>=`${current.openedOn}T00:00:00.000Z`,'EVENT_ORDER','Access predates ledger opening.');
 return mutate(current,next=>{
  next.accessRecords.push(value);next.accessRecords=sorted(next.accessRecords,entry=>entry.accessId);
  appendEvent(next,'access-recorded',value.accessedAt,value.actorToken,
   {accessId:value.accessId,itemId:value.itemId,accessDigest:bodyHash(value)});
 });
}
export function recordRedaction(input,row,{actorToken,at}={}){
 const current=validateCustodyLedger(input),value=redactionRow(row);
 timestamp(at);role(actorToken);
 const item=current.items.find(entry=>entry.itemId===value.itemId);fail(item,'ITEM_REFERENCE','Redaction item not found.');
 fail(!current.redactions.some(entry=>entry.redactionId===value.redactionId),'DUPLICATE','Redaction already recorded.');
 fail(value.appliedOn===at.slice(0,10),'DATE','Redaction date must match event date.');
 fail(value.appliedBy===actorToken,'ACTOR','Redaction actor differs from event actor.');
 return mutate(current,next=>{
  next.redactions.push(value);next.redactions=sorted(next.redactions,entry=>entry.redactionId);
  appendEvent(next,'redaction-recorded',at,actorToken,
   {redactionId:value.redactionId,itemId:value.itemId,redactionDigest:bodyHash(value)});
 });
}
export function addCheckpoint(input,{checkpointId,at,actorToken}={}){
 const current=validateCustodyLedger(input);id(checkpointId);timestamp(at);role(actorToken);
 fail(!current.events.some(row=>row.type==='checkpoint-added'&&row.payload.checkpointId===checkpointId),
  'DUPLICATE','Checkpoint ID already exists.');
 return mutate(current,next=>{
  const prior=next.events.at(-1);
  appendEvent(next,'checkpoint-added',at,actorToken,{checkpointId,headHash:prior.hash,sequence:prior.sequence});
 });
}
export function evidenceById(input,itemId){
 const ledger=validateCustodyLedger(input);id(itemId);
 const row=ledger.items.find(item=>item.itemId===itemId);fail(row,'ITEM_REFERENCE','Evidence item not found.');
 return copy(row);
}
export function custodySummary(input){
 const ledger=validateCustodyLedger(input);
 return {ledgerId:ledger.ledgerId,itemCount:ledger.items.length,
  states:Object.fromEntries(ITEM_STATES.map(state=>[state,ledger.items.filter(row=>row.state===state).length])),
  accessRecords:ledger.accessRecords.length,redactions:ledger.redactions.length,
  eventCount:ledger.events.length,digest:ledger.digest};
}
