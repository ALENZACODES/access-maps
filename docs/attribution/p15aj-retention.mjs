import {
 fail,exact,id,role,text,date,hash,integer,oneOf,array,unique,copy,sorted,
 bodyHash,appendEvent,eventHash,timestamp
} from './p15ai-contract.mjs';
import {validateCustodyLedger} from './p15ai-ledger.mjs';

export const RETENTION_SCHEMA='access-maps-evidence-retention-policy-set/1';
export const RETENTION_PLAN_SCHEMA='access-maps-evidence-retention-review-plan/1';
export const RETENTION_LEDGER_SCHEMA='access-maps-evidence-retention-review-ledger/1';
export const ANCHORS=Object.freeze(['capturedOn','retrievedOn']);
export const REVIEW_STATES=Object.freeze(['within-retention','review-due','expired','unknown']);
export const REVIEW_DECISIONS=Object.freeze(['confirm-retention','extend-review-date','preservation-required','propose-disposition','defer']);
export const MAX_POLICIES=1000,MAX_REVIEW_ITEMS=20000,MAX_REVIEW_EVENTS=100000;
const POLICY=['policyId','evidenceKind','retentionDays','reviewIntervalDays','anchorField',
 'effectiveOn','ownerToken','notes'];
const PLAN=['schema','planId','ledgerId','ledgerDigest','policySetDigest','asOf','items','summary','digest'];
const REVIEW=['reviewId','itemId','policyId','reviewedOn','reviewerToken','decision',
 'nextReviewOn','reason','evidenceDigest'];
const EVENT_TYPES=['review-ledger-opened','retention-review-recorded','retention-review-checkpoint'];

function addDays(iso,days){
 const [y,m,d]=date(iso).split('-').map(Number);
 const value=new Date(Date.UTC(y,m-1,d+days));
 return `${String(value.getUTCFullYear()).padStart(4,'0')}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`;
}
export function daysBetween(start,end){
 date(start);date(end);
 return Math.floor((Date.parse(`${end}T00:00:00.000Z`)-Date.parse(`${start}T00:00:00.000Z`))/86400000);
}
function policyRow(row){
 exact(row,POLICY);id(row.policyId);text(row.evidenceKind,'evidenceKind',{max:80});
 integer(row.retentionDays,'retentionDays',{min:1,max:36500});
 integer(row.reviewIntervalDays,'reviewIntervalDays',{min:1,max:3650});
 oneOf(row.anchorField,ANCHORS,'anchorField');date(row.effectiveOn);role(row.ownerToken);
 text(row.notes,'notes',{max:800,empty:true});return copy(row);
}
export function createRetentionPolicySet({setId,createdOn,createdBy,policies=[]}={}){
 id(setId);date(createdOn);role(createdBy);array(policies,'policies',{max:MAX_POLICIES});
 const rows=policies.map(policyRow);unique(rows.map(row=>row.policyId),'policy IDs');
 unique(rows.map(row=>row.evidenceKind),'evidence kinds');
 for(const row of rows)fail(row.effectiveOn>=createdOn,'DATE_ORDER','Policy effective date predates policy set.');
 const result={schema:RETENTION_SCHEMA,setId,createdOn,createdBy,
  policies:sorted(rows,row=>row.evidenceKind),digest:''};
 result.digest=bodyHash(result);return result;
}
export function validateRetentionPolicySet(input){
 exact(input,['schema','setId','createdOn','createdBy','policies','digest']);
 fail(input.schema===RETENTION_SCHEMA,'SCHEMA','Unsupported retention policy set.');
 id(input.setId);date(input.createdOn);role(input.createdBy);
 array(input.policies,'policies',{max:MAX_POLICIES});
 const rows=input.policies.map(policyRow);
 unique(rows.map(row=>row.policyId),'policy IDs');unique(rows.map(row=>row.evidenceKind),'evidence kinds');
 fail(input.policies.every((row,index)=>row.evidenceKind===sorted(rows,row=>row.evidenceKind)[index].evidenceKind),
  'ORDER','Policies are not sorted by evidence kind.');
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Retention policy digest invalid.');
 return copy(input);
}
export function policyForKind(input,kind){
 const set=validateRetentionPolicySet(input);text(kind,'evidenceKind',{max:80});
 const row=set.policies.find(policy=>policy.evidenceKind===kind);
 fail(row,'POLICY_MISSING','No retention policy is defined for this evidence kind.');
 return copy(row);
}
function dueFor(item,policy){
 const anchor=item[policy.anchorField];
 const expiresOn=addDays(anchor,policy.retentionDays);
 const reviewOn=addDays(anchor,policy.reviewIntervalDays);
 return {anchorOn:anchor,expiresOn,reviewOn};
}
export function buildRetentionReviewPlan(ledgerInput,policyInput,{planId,asOf}={}){
 const ledger=validateCustodyLedger(ledgerInput),policies=validateRetentionPolicySet(policyInput);
 id(planId);date(asOf);
 const items=ledger.items.map(item=>{
  const policy=policies.policies.find(row=>row.evidenceKind===item.kind);
  if(!policy)return {itemId:item.itemId,evidenceKind:item.kind,sourceId:item.sourceId,
   itemDigest:bodyHash(item),policyId:null,anchorOn:null,expiresOn:null,nextReviewOn:null,
   state:'unknown',daysToExpiry:null,actionRequired:true};
  const dates=dueFor(item,policy),daysToExpiry=daysBetween(asOf,dates.expiresOn);
  const state=daysToExpiry<0?'expired':asOf>=dates.reviewOn?'review-due':'within-retention';
  return {itemId:item.itemId,evidenceKind:item.kind,sourceId:item.sourceId,
   itemDigest:bodyHash(item),policyId:policy.policyId,...dates,nextReviewOn:dates.reviewOn,
   state,daysToExpiry,actionRequired:state!=='within-retention'};
 });
 const summary={total:items.length,withinRetention:items.filter(row=>row.state==='within-retention').length,
  reviewDue:items.filter(row=>row.state==='review-due').length,
  expired:items.filter(row=>row.state==='expired').length,
  unknown:items.filter(row=>row.state==='unknown').length,
  actionRequired:items.filter(row=>row.actionRequired).length};
 const result={schema:RETENTION_PLAN_SCHEMA,planId,ledgerId:ledger.ledgerId,
  ledgerDigest:ledger.digest,policySetDigest:policies.digest,asOf,
  items:sorted(items,row=>row.itemId),summary,digest:''};
 result.digest=bodyHash(result);return result;
}
export function validateRetentionReviewPlan(input,ledgerInput,policyInput){
 exact(input,PLAN);fail(input.schema===RETENTION_PLAN_SCHEMA,'SCHEMA','Unsupported retention plan.');
 const expected=buildRetentionReviewPlan(ledgerInput,policyInput,{planId:input.planId,asOf:input.asOf});
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Retention plan digest invalid.');
 fail(input.digest===expected.digest,'STALE_PLAN','Retention plan does not match current ledger and policy set.');
 return copy(input);
}
export function createRetentionReviewLedger({reviewLedgerId,createdOn,createdAt,createdBy}={}){
 id(reviewLedgerId);date(createdOn);role(createdBy);timestamp(createdAt);
 fail(createdAt.slice(0,10)===createdOn,'DATE_ORDER','Review ledger date mismatch.');
 const value={schema:RETENTION_LEDGER_SCHEMA,reviewLedgerId,createdOn,createdBy,reviews:[],events:[],digest:''};
 value.digest=bodyHash(value);
 appendEvent(value,'review-ledger-opened',createdAt,createdBy,{reviewLedgerId});
 return copy(value);
}
function reviewRow(row){
 exact(row,REVIEW);id(row.reviewId);id(row.itemId);id(row.policyId);date(row.reviewedOn);
 role(row.reviewerToken);oneOf(row.decision,REVIEW_DECISIONS,'decision');
 date(row.nextReviewOn);fail(row.nextReviewOn>=row.reviewedOn,'DATE_ORDER','Next review predates review.');
 text(row.reason,'reason',{max:700});hash(row.evidenceDigest);return copy(row);
}
function validateReviewEvent(row,index,previous,previousAt){
 exact(row,['sequence','type','at','actorToken','payload','previousHash','hash']);
 integer(row.sequence,'sequence',{min:1,max:MAX_REVIEW_EVENTS});
 fail(row.sequence===index+1,'SEQUENCE','Review event sequence invalid.');
 oneOf(row.type,EVENT_TYPES,'event type');
 timestamp(row.at);
 role(row.actorToken);hash(row.previousHash);hash(row.hash);
 fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Review event chain invalid.');
 if(row.type==='review-ledger-opened')exact(row.payload,['reviewLedgerId']);
 else exact(row.payload,['reviewId','itemId','reviewDigest','decision']);
}
export function validateRetentionReviewLedger(input,ledgerInput,policyInput){
 exact(input,['schema','reviewLedgerId','createdOn','createdBy','reviews','events','digest']);
 fail(input.schema===RETENTION_LEDGER_SCHEMA,'SCHEMA','Unsupported retention review ledger.');
 id(input.reviewLedgerId);date(input.createdOn);role(input.createdBy);
 const ledger=validateCustodyLedger(ledgerInput),policies=validateRetentionPolicySet(policyInput);
 array(input.reviews,'reviews',{max:MAX_REVIEW_ITEMS});array(input.events,'events',{min:1,max:MAX_REVIEW_EVENTS});
 const reviews=input.reviews.map(reviewRow);unique(reviews.map(row=>row.reviewId),'review IDs');
 unique(reviews.map(row=>`${row.itemId}:${row.reviewedOn}`),'item review dates');
 for(const row of reviews){
  const item=ledger.items.find(value=>value.itemId===row.itemId);
  fail(item,'ITEM_REFERENCE','Review item is missing.');
  const policy=policies.policies.find(value=>value.policyId===row.policyId);
  fail(policy&&policy.evidenceKind===item.kind,'POLICY_REFERENCE','Review policy does not match item kind.');
  fail(row.reviewedOn>=input.createdOn,'DATE_ORDER','Review predates review ledger.');
  fail(row.evidenceDigest===bodyHash(item),'STALE_EVIDENCE','Review evidence digest is stale.');
 }
 let previous='0'.repeat(64);
 input.events.forEach((row,index)=>{validateReviewEvent(row,index,previous);previous=row.hash;});
 fail(input.events[0].type==='review-ledger-opened'&&
  input.events[0].payload.reviewLedgerId===input.reviewLedgerId,'GENESIS','Review ledger genesis invalid.');
 for(const row of reviews){
  const event=input.events.find(value=>value.type==='retention-review-recorded'&&value.payload.reviewId===row.reviewId);
  fail(event&&event.payload.reviewDigest===bodyHash(row),'REVIEW_HISTORY','Review event does not match review row.');
 }
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Review ledger digest invalid.');
 return copy(input);
}
export function recordRetentionReview(reviewLedgerInput,ledgerInput,policyInput,row,{at,actorToken}={}){
 const current=validateRetentionReviewLedger(reviewLedgerInput,ledgerInput,policyInput);
 const ledger=validateCustodyLedger(ledgerInput),policySet=validateRetentionPolicySet(policyInput);
 const value=reviewRow(row);role(actorToken);
 fail(value.reviewerToken===actorToken,'ACTOR','Reviewer differs from event actor.');
 timestamp(at);fail(at>=current.events.at(-1).at,'EVENT_ORDER','Review event predates ledger head.');
 fail(at.slice(0,10)===value.reviewedOn,'DATE','Review date differs from event date.');
 const item=ledger.items.find(entry=>entry.itemId===value.itemId);
 fail(item,'ITEM_REFERENCE','Review item is missing.');
 const policy=policySet.policies.find(entry=>entry.policyId===value.policyId);
 fail(policy&&policy.evidenceKind===item.kind,'POLICY_REFERENCE','Review policy does not match item.');
 fail(value.evidenceDigest===bodyHash(item),'STALE_EVIDENCE','Review references stale item digest.');
 fail(!current.reviews.some(entry=>entry.reviewId===value.reviewId),'DUPLICATE','Review ID already exists.');
 fail(!current.reviews.some(entry=>entry.itemId===value.itemId&&entry.reviewedOn===value.reviewedOn),
  'DUPLICATE_REVIEW','Item already reviewed on this date.');
 const next=copy(current);next.reviews.push(value);next.reviews=sorted(next.reviews,row=>`${row.itemId}:${row.reviewedOn}`);
 appendEvent(next,'retention-review-recorded',at,actorToken,{reviewId:value.reviewId,itemId:value.itemId,
  reviewDigest:bodyHash(value),decision:value.decision});
 return validateRetentionReviewLedger(next,ledgerInput,policyInput);
}
export function retentionReviewSummary(input,ledgerInput,policyInput){
 const ledger=validateRetentionReviewLedger(input,ledgerInput,policyInput);
 return {reviewLedgerId:ledger.reviewLedgerId,total:ledger.reviews.length,
  decisions:Object.fromEntries(REVIEW_DECISIONS.map(decision=>[decision,
   ledger.reviews.filter(row=>row.decision===decision).length])),
  digest:bodyHash({reviewLedgerId:ledger.reviewLedgerId,reviews:ledger.reviews})};
}
