import {fail,exact,id,role,text,date,hash,integer,oneOf,array,unique,copy,sorted,bodyHash,appendEvent,eventHash} from './p15-custody-contract.mjs';
import {validateCustodyLedger} from './p15-custody-ledger.mjs';
import {validateRetentionPolicySet,validateRetentionReviewPlan} from './p15aj-retention.mjs';
import {proposeDisposition} from './p15aj-disposition.mjs';

export const EXCEPTION_SCHEMA='access-maps-evidence-retention-exception-register/1';
export const EXCEPTION_TYPES=Object.freeze(['retention-extension','policy-clarification','source-integrity-review']);
export const EXCEPTION_STATES=Object.freeze(['requested','approved','rejected','withdrawn']);
export const EXCEPTION_DECISIONS=Object.freeze(['approve','reject']);
const ROOT=['schema','registerId','createdOn','createdBy','exceptions','events','digest'];
const ROW=['exceptionId','itemId','exceptionType','ledgerDigest','policySetDigest','retentionPlanDigest','itemDigest',
 'requestedOn','requestedUntil','requestedBy','reason','rationale','state','approvals','rejectionReason',
 'withdrawnOn','withdrawnBy','originDigest'];
const APPROVAL=['approvalId','reviewerToken','reviewedOn','decision','reason'];
const EVENT_TYPES=['exception-register-opened','exception-requested','exception-reviewed','exception-withdrawn','exception-checkpoint'];
function originBody(row){const value={...row,state:'requested',approvals:[],rejectionReason:'',withdrawnOn:null,withdrawnBy:null};delete value.originDigest;return value;}
function approvalRow(row){
 exact(row,APPROVAL);id(row.approvalId);role(row.reviewerToken);date(row.reviewedOn);
 oneOf(row.decision,EXCEPTION_DECISIONS,'decision');text(row.reason,'review reason',{max:700});return copy(row);
}
function exceptionRow(row){
 exact(row,ROW);id(row.exceptionId);id(row.itemId);oneOf(row.exceptionType,EXCEPTION_TYPES,'exception type');
 for(const field of ['ledgerDigest','policySetDigest','retentionPlanDigest','itemDigest'])hash(row[field],field);
 date(row.requestedOn);date(row.requestedUntil);fail(row.requestedUntil>row.requestedOn,'DATE_ORDER','End date must follow request.');
 const days=(Date.parse(row.requestedUntil+'T00:00:00Z')-Date.parse(row.requestedOn+'T00:00:00Z'))/86400000;
 fail(days<=365,'DURATION','Exception cannot exceed 365 days.');
 role(row.requestedBy);text(row.reason,'reason',{max:700});text(row.rationale,'rationale',{max:1200});
 oneOf(row.state,EXCEPTION_STATES,'state');array(row.approvals,'approvals',{max:2});
 const approvals=row.approvals.map(approvalRow);unique(approvals.map(x=>x.approvalId),'approval IDs');
 unique(approvals.map(x=>x.reviewerToken),'reviewer tokens');
 text(row.rejectionReason,'rejectionReason',{max:800,empty:true});
 if(row.state==='approved')fail(approvals.filter(x=>x.decision==='approve').length===2&&!approvals.some(x=>x.decision==='reject'),'APPROVAL_COUNT','Two approvals required.');
 if(row.state==='rejected')fail(approvals.some(x=>x.decision==='reject')&&row.rejectionReason.length>0,'REJECTION_DETAILS','Rejection reason required.');
 else fail(row.rejectionReason==='','REJECTION_DETAILS','Unexpected rejection reason.');
 if(row.state==='withdrawn')fail(row.withdrawnOn!==null&&row.withdrawnBy!==null,'WITHDRAWAL_DETAILS','Withdrawal details required.');
 else fail(row.withdrawnOn===null&&row.withdrawnBy===null,'WITHDRAWAL_DETAILS','Unexpected withdrawal details.');
 if(row.withdrawnOn!==null)date(row.withdrawnOn);if(row.withdrawnBy!==null)role(row.withdrawnBy);
 hash(row.originDigest);fail(row.originDigest===bodyHash(originBody(row)),'ORIGIN_DIGEST','Request origin changed.');
 return copy(row);
}
function eventRow(row,index,previous,previousAt){
 exact(row,['sequence','type','at','actorToken','payload','previousHash','hash']);
 integer(row.sequence,'sequence',{min:1,max:100000});fail(row.sequence===index+1,'SEQUENCE','Sequence invalid.');
 oneOf(row.type,EVENT_TYPES,'event type');fail(typeof row.at==='string'&&Number.isFinite(Date.parse(row.at)),'TIMESTAMP','Timestamp invalid.');
 role(row.actorToken);hash(row.previousHash);hash(row.hash);fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Event chain invalid.');
 if(previousAt!==null)fail(row.at>=previousAt,'EVENT_ORDER','Event order invalid.');
 if(row.type==='exception-register-opened')exact(row.payload,['registerId']);
 else if(row.type==='exception-requested')exact(row.payload,['exceptionId','originDigest']);
 else if(row.type==='exception-reviewed')exact(row.payload,['exceptionId','approvalDigest','decision']);
 else if(row.type==='exception-withdrawn')exact(row.payload,['exceptionId','reason']);
 else exact(row.payload,['checkpointId','headHash','sequence']);
}
export function createExceptionRegister({registerId,createdOn,createdAt,createdBy}={}){
 id(registerId);date(createdOn);role(createdBy);
 fail(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&createdAt.slice(0,10)===createdOn,'TIMESTAMP','Creation timestamp invalid.');
 const result={schema:EXCEPTION_SCHEMA,registerId,createdOn,createdBy,exceptions:[],events:[],digest:''};
 result.digest=bodyHash(result);appendEvent(result,'exception-register-opened',createdAt,createdBy,{registerId});return copy(result);
}
export function validateExceptionRegister(input){
 exact(input,ROOT);fail(input.schema===EXCEPTION_SCHEMA,'SCHEMA','Unsupported exception register.');
 id(input.registerId);date(input.createdOn);role(input.createdBy);array(input.exceptions,'exceptions',{max:20000});
 array(input.events,'events',{min:1,max:100000});const rows=input.exceptions.map(exceptionRow);
 unique(rows.map(x=>x.exceptionId),'exception IDs');
 for(const row of rows)fail(row.requestedOn>=input.createdOn,'DATE_ORDER','Request predates register.');
 let previous='0'.repeat(64),previousAt=null;
 input.events.forEach((row,index)=>{eventRow(row,index,previous,previousAt);previous=row.hash;previousAt=row.at;});
 fail(input.events[0].type==='exception-register-opened'&&input.events[0].payload.registerId===input.registerId,'GENESIS','Genesis event invalid.');
 for(const row of rows){
  const request=input.events.find(e=>e.type==='exception-requested'&&e.payload.exceptionId===row.exceptionId);
  fail(request&&request.payload.originDigest===row.originDigest&&request.actorToken===row.requestedBy&&
   request.at.slice(0,10)===row.requestedOn,'REQUEST_HISTORY','Request event missing or inconsistent.');
  for(const approval of row.approvals)fail(input.events.some(e=>e.type==='exception-reviewed'&&
   e.payload.exceptionId===row.exceptionId&&e.payload.approvalDigest===bodyHash(approval)&&
   e.actorToken===approval.reviewerToken&&e.at.slice(0,10)===approval.reviewedOn),
   'APPROVAL_HISTORY','Approval event missing or inconsistent.');
  if(row.state==='withdrawn'){
   const event=input.events.filter(e=>e.type==='exception-withdrawn'&&e.payload.exceptionId===row.exceptionId).at(-1);
   fail(event&&event.actorToken===row.withdrawnBy&&event.at.slice(0,10)===row.withdrawnOn,'WITHDRAWAL_HISTORY','Withdrawal event mismatch.');
  }
 }
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Register digest invalid.');return copy(input);
}
function mutate(input,fn){const current=validateExceptionRegister(input),next=copy(current);fn(next);next.digest=bodyHash(next);return validateExceptionRegister(next);}
export function requestRetentionException(registerInput,ledgerInput,policyInput,planInput,options={}){
 const register=validateExceptionRegister(registerInput),ledger=validateCustodyLedger(ledgerInput);
 const policies=validateRetentionPolicySet(policyInput),plan=validateRetentionReviewPlan(planInput,ledger,policies);
 const {exceptionId,itemId,exceptionType,requestedOn,requestedUntil,requestedBy,reason,rationale,at}=options;
 id(exceptionId);id(itemId);oneOf(exceptionType,EXCEPTION_TYPES,'exception type');date(requestedOn);date(requestedUntil);
 role(requestedBy);text(reason,'reason',{max:700});text(rationale,'rationale',{max:1200});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===requestedOn,'TIMESTAMP','Request date mismatch.');
 fail(at>=register.events.at(-1).at,'EVENT_ORDER','Request predates register head.');
 fail(requestedOn>=register.createdOn,'DATE_ORDER','Request predates register.');
 const item=ledger.items.find(x=>x.itemId===itemId);fail(item,'ITEM_REFERENCE','Evidence item missing.');
 fail(item.state!=='withdrawn','ITEM_WITHDRAWN','Withdrawn evidence cannot receive an exception.');
 const planItem=plan.items.find(x=>x.itemId===itemId);fail(planItem,'PLAN_ITEM','Plan item missing.');
 fail(exceptionType!=='retention-extension'||planItem.state!=='unknown','POLICY_UNKNOWN','No configured policy for extension.');
 fail(!register.exceptions.some(x=>x.itemId===itemId&&['requested','approved'].includes(x.state)&&x.requestedUntil>=requestedOn),'ACTIVE_EXCEPTION','Overlapping request exists.');
 const row={exceptionId,itemId,exceptionType,ledgerDigest:ledger.digest,policySetDigest:policies.digest,
  retentionPlanDigest:plan.digest,itemDigest:bodyHash(item),requestedOn,requestedUntil,requestedBy,
  reason,rationale,state:'requested',approvals:[],rejectionReason:'',withdrawnOn:null,withdrawnBy:null,originDigest:''};
 row.originDigest=bodyHash(originBody(row));
 return mutate(register,next=>{next.exceptions.push(row);next.exceptions=sorted(next.exceptions,x=>x.exceptionId);
  appendEvent(next,'exception-requested',at,requestedBy,{exceptionId,originDigest:row.originDigest});});
}
export function reviewRetentionException(input,options={}){
 const register=validateExceptionRegister(input);
 const {exceptionId,approvalId,reviewerToken,reviewedOn,decision,reason,at}=options;
 id(exceptionId);id(approvalId);role(reviewerToken);date(reviewedOn);oneOf(decision,EXCEPTION_DECISIONS,'decision');text(reason,'reason',{max:700});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===reviewedOn,'TIMESTAMP','Review date mismatch.');
 fail(at>=register.events.at(-1).at,'EVENT_ORDER','Review predates register head.');
 const current=register.exceptions.find(x=>x.exceptionId===exceptionId);fail(current,'EXCEPTION_REF','Exception missing.');
 fail(current.state==='requested','EXCEPTION_TERMINAL','Only requested exceptions can be reviewed.');
 fail(reviewerToken!==current.requestedBy,'SEPARATION','Requester cannot review own exception.');
 fail(!current.approvals.some(x=>x.reviewerToken===reviewerToken),'DUPLICATE_REVIEWER','Reviewer already acted.');
 fail(current.approvals.length<2,'APPROVAL_COUNT','Review limit reached.');
 const approval={approvalId,reviewerToken,reviewedOn,decision,reason};
 return mutate(register,next=>{const row=next.exceptions.find(x=>x.exceptionId===exceptionId);row.approvals.push(approval);
  if(decision==='reject'){row.state='rejected';row.rejectionReason=reason;}
  else if(row.approvals.filter(x=>x.decision==='approve').length===2)row.state='approved';
  appendEvent(next,'exception-reviewed',at,reviewerToken,{exceptionId,approvalDigest:bodyHash(approval),decision});});
}
export function withdrawRetentionException(input,options={}){
 const register=validateExceptionRegister(input),{exceptionId,withdrawnOn,withdrawnBy,reason,at}=options;
 id(exceptionId);date(withdrawnOn);role(withdrawnBy);text(reason,'reason',{max:700});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===withdrawnOn,'TIMESTAMP','Withdrawal date mismatch.');
 fail(at>=register.events.at(-1).at,'EVENT_ORDER','Withdrawal predates register head.');
 const current=register.exceptions.find(x=>x.exceptionId===exceptionId);fail(current,'EXCEPTION_REF','Exception missing.');
 fail(current.state==='requested','EXCEPTION_TERMINAL','Only requested exceptions can be withdrawn.');
 fail(withdrawnBy!==current.requestedBy,'SEPARATION','Requester cannot withdraw own exception.');
 return mutate(register,next=>{const row=next.exceptions.find(x=>x.exceptionId===exceptionId);
  row.state='withdrawn';row.withdrawnOn=withdrawnOn;row.withdrawnBy=withdrawnBy;
  appendEvent(next,'exception-withdrawn',at,withdrawnBy,{exceptionId,reason});});
}
export function activeExceptionsForItem(input,itemId,{asOf}={}){
 const register=validateExceptionRegister(input);id(itemId);date(asOf);
 return sorted(register.exceptions.filter(x=>x.itemId===itemId&&x.state==='approved'&&x.requestedOn<=asOf&&x.requestedUntil>=asOf),x=>x.exceptionId);
}
export function isExceptionActive(input,itemId,{asOf}={}){return activeExceptionsForItem(input,itemId,{asOf}).length>0;}
export function exceptionSummary(input,{asOf}={}){
 const register=validateExceptionRegister(input);date(asOf);
 return {registerId:register.registerId,total:register.exceptions.length,
  requested:register.exceptions.filter(x=>x.state==='requested').length,
  approved:register.exceptions.filter(x=>x.state==='approved').length,
  rejected:register.exceptions.filter(x=>x.state==='rejected').length,
  withdrawn:register.exceptions.filter(x=>x.state==='withdrawn').length,
  active:register.exceptions.filter(x=>x.state==='approved'&&x.requestedOn<=asOf&&x.requestedUntil>=asOf).length,
  expired:register.exceptions.filter(x=>x.state==='approved'&&x.requestedUntil<asOf).length,
  digest:bodyHash({registerId:register.registerId,exceptions:register.exceptions,asOf})};
}
export function proposeDispositionWithExceptionCheck(registerInput,ledgerInput,policyInput,retentionPlan,
 reviewLedger,holdLedger,exceptionRegister,options){
 const exceptions=validateExceptionRegister(exceptionRegister);
 fail(!isExceptionActive(exceptions,options?.itemId,{asOf:options?.proposedOn}),
  'ACTIVE_EXCEPTION','Approved retention exception blocks disposition during its active dates.');
 return proposeDisposition(registerInput,ledgerInput,policyInput,retentionPlan,reviewLedger,holdLedger,options);
}
