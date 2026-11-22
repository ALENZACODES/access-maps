import {fail,exact,id,role,text,date,hash,integer,oneOf,array,unique,copy,bodyHash,appendEvent,eventHash} from './p15-custody-contract.mjs';
import {validateExceptionRegister} from './p15ak-exceptions.mjs';
export const APPEAL_SCHEMA='access-maps-evidence-retention-exception-appeal-register/1';
export const APPEAL_STATES=Object.freeze(['filed','accepted-for-reconsideration','rejected','withdrawn']);
const ROOT=['schema','registerId','createdOn','createdBy','appeals','events','digest'];
const ROW=['appealId','exceptionId','exceptionOriginDigest','filedOn','filedBy','reason','rationale',
 'state','reviews','withdrawnOn','withdrawnBy','originDigest'];
const REVIEW=['reviewId','reviewerToken','reviewedOn','decision','reason'];
const TYPES=['appeal-register-opened','appeal-filed','appeal-reviewed','appeal-withdrawn'];
function origin(row){const value={...row,state:'filed',reviews:[],withdrawnOn:null,withdrawnBy:null};delete value.originDigest;return value;}
function reviewRow(row){
 exact(row,REVIEW);id(row.reviewId);role(row.reviewerToken);date(row.reviewedOn);
 oneOf(row.decision,['accept','reject'],'appeal decision');text(row.reason,'review reason',{max:700});return copy(row);
}
function appealRow(row){
 exact(row,ROW);id(row.appealId);id(row.exceptionId);hash(row.exceptionOriginDigest);
 date(row.filedOn);role(row.filedBy);text(row.reason,'reason',{max:700});text(row.rationale,'rationale',{max:1200});
 oneOf(row.state,APPEAL_STATES,'appeal state');array(row.reviews,'reviews',{max:2});
 const reviews=row.reviews.map(reviewRow);unique(reviews.map(x=>x.reviewId),'review IDs');
 unique(reviews.map(x=>x.reviewerToken),'reviewers');
 if(row.state==='accepted-for-reconsideration')fail(reviews.filter(x=>x.decision==='accept').length===2,'REVIEW_COUNT','Two accepts required.');
 if(row.state==='rejected')fail(reviews.some(x=>x.decision==='reject'),'REVIEW_COUNT','Rejection review required.');
 if(row.state==='withdrawn')fail(row.withdrawnOn!==null&&row.withdrawnBy!==null,'WITHDRAWAL_DETAILS','Withdrawal details required.');
 else fail(row.withdrawnOn===null&&row.withdrawnBy===null,'WITHDRAWAL_DETAILS','Unexpected withdrawal details.');
 if(row.withdrawnOn!==null)date(row.withdrawnOn);if(row.withdrawnBy!==null)role(row.withdrawnBy);
 hash(row.originDigest);fail(row.originDigest===bodyHash(origin(row)),'ORIGIN_DIGEST','Appeal origin changed.');
 return copy(row);
}
function eventRow(row,index,previous,previousAt){
 exact(row,['sequence','type','at','actorToken','payload','previousHash','hash']);
 integer(row.sequence,'sequence',{min:1,max:100000});fail(row.sequence===index+1,'SEQUENCE','Appeal event sequence invalid.');
 oneOf(row.type,TYPES,'appeal event type');fail(typeof row.at==='string'&&Number.isFinite(Date.parse(row.at)),'TIMESTAMP','Appeal event timestamp invalid.');
 role(row.actorToken);hash(row.previousHash);hash(row.hash);
 fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Appeal event chain invalid.');
 if(previousAt!==null)fail(row.at>=previousAt,'EVENT_ORDER','Appeal event time moved backwards.');
 if(row.type==='appeal-register-opened')exact(row.payload,['registerId']);
 else if(row.type==='appeal-filed')exact(row.payload,['appealId','originDigest']);
 else if(row.type==='appeal-reviewed')exact(row.payload,['appealId','reviewDigest','decision']);
 else exact(row.payload,['appealId','reason']);
}
export function createAppealRegister({registerId,createdOn,createdAt,createdBy}={}){
 id(registerId);date(createdOn);role(createdBy);
 fail(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&createdAt.slice(0,10)===createdOn,'TIMESTAMP','Appeal register timestamp invalid.');
 const result={schema:APPEAL_SCHEMA,registerId,createdOn,createdBy,appeals:[],events:[],digest:''};
 result.digest=bodyHash(result);appendEvent(result,'appeal-register-opened',createdAt,createdBy,{registerId});return copy(result);
}
export function validateAppealRegister(input,exceptionInput){
 exact(input,ROOT);fail(input.schema===APPEAL_SCHEMA,'SCHEMA','Unsupported appeal register.');
 id(input.registerId);date(input.createdOn);role(input.createdBy);
 const exceptions=validateExceptionRegister(exceptionInput);array(input.appeals,'appeals',{max:20000});
 array(input.events,'events',{min:1,max:100000});const rows=input.appeals.map(appealRow);
 unique(rows.map(x=>x.appealId),'appeal IDs');unique(rows.map(x=>x.exceptionId),'exception appeals');unique(rows.map(x=>x.exceptionId),'exception appeals');
 for(const row of rows){
  const target=exceptions.exceptions.find(x=>x.exceptionId===row.exceptionId);
  fail(target&&target.state==='rejected'&&target.originDigest===row.exceptionOriginDigest,'EXCEPTION_REF','Appeal target is not a rejected matching exception.');
  fail(row.filedOn>=input.createdOn,'DATE_ORDER','Appeal predates register.');
  for(const review of row.reviews)fail(input.events.some(e=>e.type==='appeal-reviewed'&&e.payload.appealId===row.appealId&&e.payload.reviewDigest===bodyHash(review)),'REVIEW_HISTORY','Appeal review receipt missing.');
 }
 let previous='0'.repeat(64),previousAt=null;
 input.events.forEach((row,index)=>{eventRow(row,index,previous,previousAt);previous=row.hash;previousAt=row.at;});
 fail(input.events[0].type==='appeal-register-opened'&&input.events[0].payload.registerId===input.registerId,'GENESIS','Appeal genesis invalid.');
 for(const row of rows){
  const filed=input.events.find(e=>e.type==='appeal-filed'&&e.payload.appealId===row.appealId);
  fail(filed&&filed.payload.originDigest===row.originDigest,'APPEAL_HISTORY','Appeal filing receipt missing.');
  if(row.state==='withdrawn'){
   const event=input.events.filter(e=>e.type==='appeal-withdrawn'&&e.payload.appealId===row.appealId).at(-1);
   fail(event&&event.actorToken===row.withdrawnBy&&event.at.slice(0,10)===row.withdrawnOn,'WITHDRAWAL_HISTORY','Appeal withdrawal receipt mismatch.');
  }
 }
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Appeal register digest invalid.');return copy(input);
}
function mutate(input,exceptions,fn){const current=validateAppealRegister(input,exceptions),next=copy(current);fn(next);next.digest=bodyHash(next);return validateAppealRegister(next,exceptions);}
export function fileExceptionAppeal(input,exceptionInput,{appealId,exceptionId,filedOn,filedBy,reason,rationale,at}={}){
 const register=validateAppealRegister(input,exceptionInput),exceptions=validateExceptionRegister(exceptionInput);
 id(appealId);id(exceptionId);date(filedOn);role(filedBy);text(reason,'reason',{max:700});text(rationale,'rationale',{max:1200});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===filedOn,'TIMESTAMP','Appeal date mismatch.');
 fail(at>=register.events.at(-1).at,'EVENT_ORDER','Appeal predates register head.');
 fail(filedOn>=register.createdOn,'DATE_ORDER','Appeal predates appeal register.');
 const target=exceptions.exceptions.find(x=>x.exceptionId===exceptionId);fail(target,'EXCEPTION_REF','Exception not found.');
 fail(target.state==='rejected','APPEAL_STATE','Only rejected exceptions may be appealed.');
 const rejection=target.approvals.filter(x=>x.decision==='reject').at(-1);fail(rejection,'REJECTION_RECEIPT','Rejection review missing.');
 const days=(Date.parse(`${filedOn}T00:00:00Z`)-Date.parse(`${rejection.reviewedOn}T00:00:00Z`))/86400000;
 fail(days>=0&&days<=30,'APPEAL_WINDOW','Appeal must be filed within 30 days of rejection.');
 fail(filedBy!==target.requestedBy,'SEPARATION','Original requester cannot file an appeal.');
 fail(!register.appeals.some(x=>x.exceptionId===exceptionId),'DUPLICATE_APPEAL','An appeal already exists for this exception.');
 const row={appealId,exceptionId,exceptionOriginDigest:target.originDigest,filedOn,filedBy,reason,rationale,
  state:'filed',reviews:[],withdrawnOn:null,withdrawnBy:null,originDigest:''};
 row.originDigest=bodyHash(origin(row));
 return mutate(register,exceptions,next=>{next.appeals.push(row);
  appendEvent(next,'appeal-filed',at,filedBy,{appealId,originDigest:row.originDigest});});
}
export function reviewExceptionAppeal(input,exceptionInput,{appealId,reviewId,reviewerToken,
 reviewedOn,decision,reason,at}={}){
 const register=validateAppealRegister(input,exceptionInput);id(appealId);id(reviewId);role(reviewerToken);
 date(reviewedOn);oneOf(decision,['accept','reject'],'decision');text(reason,'reason',{max:700});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===reviewedOn,'TIMESTAMP','Review date mismatch.');
 fail(at>=register.events.at(-1).at,'EVENT_ORDER','Review predates register head.');
 const current=register.appeals.find(x=>x.appealId===appealId);fail(current,'APPEAL_REF','Appeal not found.');
 fail(current.state==='filed','APPEAL_TERMINAL','Only filed appeals can be reviewed.');
 fail(reviewerToken!==current.filedBy,'SEPARATION','Appellant cannot review own appeal.');
 fail(!current.reviews.some(x=>x.reviewerToken===reviewerToken),'DUPLICATE_REVIEWER','Reviewer already acted.');
 fail(current.reviews.length<2,'REVIEW_COUNT','Appeal review limit reached.');
 const review={reviewId,reviewerToken,reviewedOn,decision,reason};
 return mutate(register,exceptionInput,next=>{const row=next.appeals.find(x=>x.appealId===appealId);row.reviews.push(review);
  if(decision==='reject')row.state='rejected';
  else if(row.reviews.filter(x=>x.decision==='accept').length===2)row.state='accepted-for-reconsideration';
  appendEvent(next,'appeal-reviewed',at,reviewerToken,{appealId,reviewDigest:bodyHash(review),decision});});
}
export function withdrawExceptionAppeal(input,exceptionInput,{appealId,withdrawnOn,withdrawnBy,reason,at}={}){
 const register=validateAppealRegister(input,exceptionInput);id(appealId);date(withdrawnOn);role(withdrawnBy);text(reason,'reason',{max:700});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===withdrawnOn,'TIMESTAMP','Withdrawal date mismatch.');
 fail(at>=register.events.at(-1).at,'EVENT_ORDER','Withdrawal predates register head.');
 const current=register.appeals.find(x=>x.appealId===appealId);fail(current,'APPEAL_REF','Appeal not found.');
 fail(current.state==='filed','APPEAL_TERMINAL','Only filed appeals can be withdrawn.');
 fail(withdrawnBy===current.filedBy,'SEPARATION','Only appellant may withdraw appeal.');
 return mutate(register,exceptionInput,next=>{const row=next.appeals.find(x=>x.appealId===appealId);
  row.state='withdrawn';row.withdrawnOn=withdrawnOn;row.withdrawnBy=withdrawnBy;
  appendEvent(next,'appeal-withdrawn',at,withdrawnBy,{appealId,reason});});
}
export function canReconsiderException(input,exceptionInput,appealId){
 const register=validateAppealRegister(input,exceptionInput);id(appealId);
 const row=register.appeals.find(x=>x.appealId===appealId);fail(row,'APPEAL_REF','Appeal not found.');
 return row.state==='accepted-for-reconsideration';
}
export function appealSummary(input,exceptionInput){
 const register=validateAppealRegister(input,exceptionInput);
 return {registerId:register.registerId,total:register.appeals.length,
  filed:register.appeals.filter(x=>x.state==='filed').length,
  accepted:register.appeals.filter(x=>x.state==='accepted-for-reconsideration').length,
  rejected:register.appeals.filter(x=>x.state==='rejected').length,
  withdrawn:register.appeals.filter(x=>x.state==='withdrawn').length,
  newExceptionRequired:true,digest:bodyHash({registerId:register.registerId,appeals:register.appeals})};
}
