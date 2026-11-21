import {
 fail,exact,id,role,text,date,hash,integer,oneOf,array,unique,copy,sorted,
 bodyHash,appendEvent,eventHash
} from './p15ai-contract.mjs';
import {validateCustodyLedger} from './p15ai-ledger.mjs';

export const HOLD_SCHEMA='access-maps-evidence-preservation-hold-ledger/1';
export const HOLD_STATES=Object.freeze(['active','released','withdrawn']);
export const HOLD_EVENT_TYPES=Object.freeze(['hold-ledger-opened','hold-placed','hold-reviewed',
 'hold-released','hold-withdrawn','hold-checkpoint']);
const HOLD=['holdId','itemIds','scope','reason','placedOn','placedBy','reviewOn',
 'state','releasedOn','releasedBy','releaseReason'];
const ROOT=['schema','holdLedgerId','createdOn','createdBy','holds','events','digest'];
const MAX_HOLDS=20000,MAX_HOLD_EVENTS=100000;
function itemIds(values){
 array(values,'itemIds',{min:1,max:20000});values.forEach(id);unique(values,'itemIds');return [...values].sort();
}
function holdRow(row){
 exact(row,HOLD);id(row.holdId);itemIds(row.itemIds);text(row.scope,'scope',{max:300});
 text(row.reason,'reason',{max:1000});date(row.placedOn);role(row.placedBy);date(row.reviewOn);
 fail(row.reviewOn>=row.placedOn,'DATE_ORDER','Hold review date predates placement.');
 oneOf(row.state,HOLD_STATES,'hold state');
 if(row.releasedOn!==null)date(row.releasedOn);
 if(row.releasedBy!==null)role(row.releasedBy);
 text(row.releaseReason,'releaseReason',{max:800,empty:true});
 if(row.state==='released')fail(row.releasedOn!==null&&row.releasedBy!==null&&row.releaseReason.length>0,
  'RELEASE_DETAILS','Released hold requires release details.');
 else fail(row.releasedOn===null&&row.releasedBy===null&&row.releaseReason==='',
  'RELEASE_DETAILS','Unreleased hold cannot carry release details.');
 return copy(row);
}
function validateEvent(row,index,previous,previousAt){
 exact(row,['sequence','type','at','actorToken','payload','previousHash','hash']);
 integer(row.sequence,'sequence',{min:1,max:MAX_HOLD_EVENTS});
 fail(row.sequence===index+1,'SEQUENCE','Hold event sequence invalid.');
 oneOf(row.type,HOLD_EVENT_TYPES,'hold event type');
 fail(typeof row.at==='string'&&Number.isFinite(Date.parse(row.at)),'TIMESTAMP','Hold timestamp invalid.');
 role(row.actorToken);hash(row.previousHash);hash(row.hash);
 fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Hold event chain invalid.');
 if(previousAt!==null)fail(row.at>=previousAt,'EVENT_ORDER','Hold event time moved backwards.');
 if(row.type==='hold-ledger-opened')exact(row.payload,['holdLedgerId']);
 else if(row.type==='hold-placed')exact(row.payload,['holdId','holdDigest']);
 else if(row.type==='hold-reviewed')exact(row.payload,['holdId','reviewOn','reason']);
 else if(row.type==='hold-released')exact(row.payload,['holdId','releaseReason']);
 else if(row.type==='hold-withdrawn')exact(row.payload,['holdId','reason']);
 else exact(row.payload,['checkpointId','headHash','sequence']);
}
export function createHoldLedger({holdLedgerId,createdOn,createdAt,createdBy}={}){
 id(holdLedgerId);date(createdOn);role(createdBy);
 fail(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt)),'TIMESTAMP','Creation timestamp invalid.');
 fail(createdAt.slice(0,10)===createdOn,'DATE_ORDER','Hold ledger date mismatch.');
 const result={schema:HOLD_SCHEMA,holdLedgerId,createdOn,createdBy,holds:[],events:[],digest:''};
 result.digest=bodyHash(result);appendEvent(result,'hold-ledger-opened',createdAt,createdBy,{holdLedgerId});
 return copy(result);
}
export function validateHoldLedger(input,ledgerInput){
 exact(input,ROOT);fail(input.schema===HOLD_SCHEMA,'SCHEMA','Unsupported hold ledger.');
 id(input.holdLedgerId);date(input.createdOn);role(input.createdBy);
 const custody=validateCustodyLedger(ledgerInput);
 array(input.holds,'holds',{max:MAX_HOLDS});array(input.events,'events',{min:1,max:MAX_HOLD_EVENTS});
 const holds=input.holds.map(holdRow);unique(holds.map(row=>row.holdId),'hold IDs');
 for(const hold of holds){
  fail(hold.placedOn>=input.createdOn,'DATE_ORDER','Hold predates hold ledger.');
  for(const itemId of hold.itemIds)fail(custody.items.some(row=>row.itemId===itemId),
   'ITEM_REFERENCE','Hold references missing evidence item.');
  const events=input.events.filter(row=>row.payload?.holdId===hold.holdId);
  fail(events.some(row=>row.type==='hold-placed'),'HOLD_HISTORY','Hold placement event missing.');
  const lastState=events.filter(row=>['hold-released','hold-withdrawn'].includes(row.type)).at(-1);
  if(hold.state==='active')fail(!lastState,'HOLD_STATE_HISTORY','Active hold has terminal event.');
  if(hold.state==='released')fail(lastState?.type==='hold-released','HOLD_STATE_HISTORY','Release event missing.');
  if(hold.state==='withdrawn')fail(lastState?.type==='hold-withdrawn','HOLD_STATE_HISTORY','Withdrawal event missing.');
 }
 let previous='0'.repeat(64),previousAt=null;
 input.events.forEach((row,index)=>{validateEvent(row,index,previous,previousAt);previous=row.hash;previousAt=row.at;});
 fail(input.events[0].type==='hold-ledger-opened'&&
  input.events[0].payload.holdLedgerId===input.holdLedgerId,'GENESIS','Hold ledger genesis invalid.');
 for(const hold of holds){
  const placed=input.events.find(row=>row.type==='hold-placed'&&row.payload.holdId===hold.holdId);
  fail(placed&&placed.payload.holdDigest.length===64&&placed.actorToken===hold.placedBy&&
   placed.at.slice(0,10)===hold.placedOn,'HOLD_HISTORY','Hold digest receipt missing.');
  const lastReview=input.events.filter(row=>row.type==='hold-reviewed'&&row.payload.holdId===hold.holdId).at(-1);
  if(lastReview)fail(lastReview.payload.reviewOn===hold.reviewOn,'HOLD_REVIEW_HISTORY','Hold review date differs from event.');
  if(hold.state==='released'){
   const released=input.events.filter(row=>row.type==='hold-released'&&row.payload.holdId===hold.holdId).at(-1);
   fail(released&&released.at.slice(0,10)===hold.releasedOn&&released.actorToken===hold.releasedBy,
    'HOLD_HISTORY','Release receipt does not match hold row.');
  }
 }
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Hold ledger digest invalid.');
 return copy(input);
}
function mutate(input,ledgerInput,operation){
 const current=validateHoldLedger(input,ledgerInput),next=copy(current);operation(next);
 next.digest=bodyHash(next);return validateHoldLedger(next,ledgerInput);
}
export function placeHold(input,ledgerInput,{holdId,itemIds:ids,scope,reason,placedOn,placedBy,reviewOn,at}={}){
 const current=validateHoldLedger(input,ledgerInput);id(holdId);date(placedOn);role(placedBy);
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at)),'TIMESTAMP','Hold event timestamp invalid.');
 fail(at>=current.events.at(-1).at,'EVENT_ORDER','Hold placement event predates ledger head.');
 fail(at.slice(0,10)===placedOn,'DATE','Hold placement date differs from event.');
 text(scope,'scope',{max:300});text(reason,'reason',{max:1000});date(reviewOn);
 const selected=itemIds(ids),custody=validateCustodyLedger(ledgerInput);
 for(const itemId of selected)fail(custody.items.some(row=>row.itemId===itemId),
  'ITEM_REFERENCE','Hold item is absent from custody ledger.');
 fail(!current.holds.some(row=>row.holdId===holdId),'DUPLICATE','Hold ID already exists.');
 const row={holdId,itemIds:selected,scope,reason,placedOn,placedBy,reviewOn,state:'active',
  releasedOn:null,releasedBy:null,releaseReason:''};
 return mutate(current,ledgerInput,next=>{
  next.holds.push(row);next.holds=sorted(next.holds,row=>row.holdId);
  appendEvent(next,'hold-placed',at,placedBy,{holdId,holdDigest:bodyHash(row)});
 });
}
export function reviewHold(input,ledgerInput,{holdId,reviewOn,reviewedBy,at,reason,nextReviewOn}={}){
 const current=validateHoldLedger(input,ledgerInput);id(holdId);date(reviewOn);role(reviewedBy);
 date(nextReviewOn);text(reason,'reason',{max:700});
 fail(nextReviewOn>=reviewOn,'DATE_ORDER','Next hold review predates review.');
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===reviewOn,
  'TIMESTAMP','Hold review event timestamp invalid.');
 const hold=current.holds.find(row=>row.holdId===holdId);fail(hold,'HOLD_REFERENCE','Hold not found.');
 fail(hold.state==='active','HOLD_TERMINAL','Only active holds can be reviewed.');
 return mutate(current,ledgerInput,next=>{
  const target=next.holds.find(row=>row.holdId===holdId);target.reviewOn=nextReviewOn;
  appendEvent(next,'hold-reviewed',at,reviewedBy,{holdId,reviewOn:nextReviewOn,reason});
 });
}
export function releaseHold(input,ledgerInput,{holdId,releasedOn,releasedBy,at,reason}={}){
 const current=validateHoldLedger(input,ledgerInput);id(holdId);date(releasedOn);role(releasedBy);
 text(reason,'reason',{max:800});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===releasedOn,
  'TIMESTAMP','Hold release timestamp invalid.');
 const hold=current.holds.find(row=>row.holdId===holdId);fail(hold,'HOLD_REFERENCE','Hold not found.');
 fail(hold.state==='active','HOLD_TERMINAL','Only active holds can be released.');
 fail(releasedBy!==hold.placedBy,'SEPARATION','Hold placer cannot release their own hold.');
 fail(releasedOn>=hold.placedOn,'DATE_ORDER','Release predates hold.');
 return mutate(current,ledgerInput,next=>{
  const target=next.holds.find(row=>row.holdId===holdId);
  target.state='released';target.releasedOn=releasedOn;target.releasedBy=releasedBy;target.releaseReason=reason;
  appendEvent(next,'hold-released',at,releasedBy,{holdId,releaseReason:reason});
 });
}
export function withdrawHold(input,ledgerInput,{holdId,withdrawnOn,withdrawnBy,at,reason}={}){
 const current=validateHoldLedger(input,ledgerInput);id(holdId);date(withdrawnOn);role(withdrawnBy);
 text(reason,'reason',{max:800});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===withdrawnOn,
  'TIMESTAMP','Hold withdrawal timestamp invalid.');
 const hold=current.holds.find(row=>row.holdId===holdId);fail(hold,'HOLD_REFERENCE','Hold not found.');
 fail(hold.state==='active','HOLD_TERMINAL','Only active holds can be withdrawn.');
 fail(withdrawnBy!==hold.placedBy,'SEPARATION','Hold placer cannot withdraw their own hold.');
 fail(withdrawnOn>=hold.placedOn,'DATE_ORDER','Withdrawal predates hold.');
 return mutate(current,ledgerInput,next=>{
  const target=next.holds.find(row=>row.holdId===holdId);target.state='withdrawn';
  appendEvent(next,'hold-withdrawn',at,withdrawnBy,{holdId,reason});
 });
}
export function activeHoldsForItem(input,ledgerInput,itemId){
 const ledger=validateHoldLedger(input,ledgerInput);id(itemId);
 return sorted(ledger.holds.filter(row=>row.state==='active'&&row.itemIds.includes(itemId)),row=>row.holdId);
}
export function isItemPreserved(input,ledgerInput,itemId){
 return activeHoldsForItem(input,ledgerInput,itemId).length>0;
}
export function holdSummary(input,ledgerInput){
 const ledger=validateHoldLedger(input,ledgerInput);
 return {holdLedgerId:ledger.holdLedgerId,total:ledger.holds.length,
  active:ledger.holds.filter(row=>row.state==='active').length,
  released:ledger.holds.filter(row=>row.state==='released').length,
  withdrawn:ledger.holds.filter(row=>row.state==='withdrawn').length,
  heldItems:new Set(ledger.holds.filter(row=>row.state==='active').flatMap(row=>row.itemIds)).size,
  digest:bodyHash({holdLedgerId:ledger.holdLedgerId,holds:ledger.holds})};
}
