import {
 fail,exact,id,role,text,date,hash,integer,oneOf,array,unique,copy,sorted,bodyHash,appendEvent,eventHash
} from './p15-custody-contract.mjs';
import {validateCustodyLedger} from './p15-custody-ledger.mjs';
import {validateRetentionReviewPlan,validateRetentionReviewLedger} from './p15aj-retention.mjs';
import {validateHoldLedger,isItemPreserved} from './p15aj-holds.mjs';

export const DISPOSITION_SCHEMA='access-maps-evidence-disposition-register/1';
export const DISPOSITION_STATES=Object.freeze(['proposed','approved-for-manual-review','rejected','withdrawn']);
export const DISPOSITION_REASONS=Object.freeze(['retention-period-ended','source-withdrawn',
 'duplicate-capture','superseded-evidence','scope-reduction','other']);
export const DISPOSITION_EVENT_TYPES=Object.freeze(['disposition-register-opened',
 'disposition-proposed','disposition-reviewed','disposition-withdrawn','disposition-checkpoint']);
const ROOT=['schema','registerId','createdOn','createdBy','proposals','events','digest'];
const PROPOSAL=['proposalId','itemId','ledgerDigest','retentionPlanDigest','retentionReviewLedgerDigest',
 'holdLedgerDigest','reasonCode','rationale','proposedOn','proposedBy','originDigest','state','approvals',
 'rejectionReason','withdrawnOn','withdrawnBy'];
const APPROVAL=['approvalId','reviewerToken','reviewedOn','decision','reason'];
const MAX_PROPOSALS=20000,MAX_EVENTS=100000;
function approvalRow(row){
 exact(row,APPROVAL);id(row.approvalId);role(row.reviewerToken);date(row.reviewedOn);
 oneOf(row.decision,['approve','reject'],'approval decision');text(row.reason,'approval reason',{max:700});
 return copy(row);
}
function proposalRow(row){
 exact(row,PROPOSAL);id(row.proposalId);id(row.itemId);hash(row.ledgerDigest);
 hash(row.retentionPlanDigest);hash(row.retentionReviewLedgerDigest);hash(row.holdLedgerDigest);
 oneOf(row.reasonCode,DISPOSITION_REASONS,'reason code');text(row.rationale,'rationale',{max:1200});
 date(row.proposedOn);role(row.proposedBy);oneOf(row.state,DISPOSITION_STATES,'proposal state');
 array(row.approvals,'approvals',{max:10});const approvals=row.approvals.map(approvalRow);
 unique(approvals.map(row=>row.approvalId),'approval IDs');
 unique(approvals.map(row=>row.reviewerToken),'approval reviewers');
 const {originDigest,...origin}=row;
 origin.state='proposed';origin.approvals=[];origin.rejectionReason='';origin.withdrawnOn=null;origin.withdrawnBy=null;
 hash(originDigest,'originDigest');
 fail(originDigest===bodyHash(origin),'ORIGIN_DIGEST','Proposal origin content was altered.');
 text(row.rejectionReason,'rejectionReason',{max:800,empty:true});
 if(row.withdrawnOn!==null)date(row.withdrawnOn);
 if(row.withdrawnBy!==null)role(row.withdrawnBy);
 if(row.state==='rejected')fail(row.rejectionReason.length>0&&approvals.some(row=>row.decision==='reject'),
  'REJECTION_DETAILS','Rejected proposal requires rejection reason and reviewer.');
 else fail(row.rejectionReason==='','REJECTION_DETAILS','Non-rejected proposal cannot carry rejection reason.');
 if(row.state==='withdrawn')fail(row.withdrawnOn!==null&&row.withdrawnBy!==null,
  'WITHDRAWAL_DETAILS','Withdrawn proposal requires withdrawal details.');
 else fail(row.withdrawnOn===null&&row.withdrawnBy===null,
  'WITHDRAWAL_DETAILS','Active proposal cannot carry withdrawal details.');
 if(row.state==='approved-for-manual-review')fail(approvals.filter(row=>row.decision==='approve').length>=2,
  'APPROVAL_COUNT','Manual review status requires two approvals.');
 return copy(row);
}
function validateEvent(row,index,previous){
 exact(row,['sequence','type','at','actorToken','payload','previousHash','hash']);
 integer(row.sequence,'sequence',{min:1,max:MAX_EVENTS});fail(row.sequence===index+1,'SEQUENCE','Disposition event sequence invalid.');
 oneOf(row.type,DISPOSITION_EVENT_TYPES,'event type');
 fail(typeof row.at==='string'&&Number.isFinite(Date.parse(row.at)),'TIMESTAMP','Disposition timestamp invalid.');
 role(row.actorToken);hash(row.previousHash);hash(row.hash);
 fail(row.previousHash===previous&&row.hash===eventHash(row),'EVENT_HASH','Disposition event chain invalid.');
 if(row.type==='disposition-register-opened')exact(row.payload,['registerId']);
 else if(row.type==='disposition-proposed')exact(row.payload,['proposalId','proposalDigest']);
 else if(row.type==='disposition-reviewed')exact(row.payload,['proposalId','approvalDigest','decision']);
 else if(row.type==='disposition-withdrawn')exact(row.payload,['proposalId','reason']);
 else exact(row.payload,['checkpointId','headHash','sequence']);
}
export function createDispositionRegister({registerId,createdOn,createdAt,createdBy}={}){
 id(registerId);date(createdOn);role(createdBy);
 fail(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&createdAt.slice(0,10)===createdOn,
  'TIMESTAMP','Register creation timestamp invalid.');
 const result={schema:DISPOSITION_SCHEMA,registerId,createdOn,createdBy,proposals:[],events:[],digest:''};
 result.digest=bodyHash(result);appendEvent(result,'disposition-register-opened',createdAt,createdBy,{registerId});
 return validateDispositionRegister(result);
}
export function validateDispositionRegister(input){
 exact(input,ROOT);fail(input.schema===DISPOSITION_SCHEMA,'SCHEMA','Unsupported disposition register.');
 id(input.registerId);date(input.createdOn);role(input.createdBy);
 array(input.proposals,'proposals',{max:MAX_PROPOSALS});array(input.events,'events',{min:1,max:MAX_EVENTS});
 const proposals=input.proposals.map(proposalRow);unique(proposals.map(row=>row.proposalId),'proposal IDs');
 for(const row of proposals)fail(row.proposedOn>=input.createdOn,'DATE_ORDER','Proposal predates register.');
 let previous='0'.repeat(64);input.events.forEach((row,index)=>{validateEvent(row,index,previous);previous=row.hash;});
 fail(input.events[0].type==='disposition-register-opened'&&
  input.events[0].payload.registerId===input.registerId,'GENESIS','Disposition register genesis invalid.');
 for(const row of proposals){
  const event=input.events.find(value=>value.type==='disposition-proposed'&&value.payload.proposalId===row.proposalId);
  fail(event&&event.payload.proposalDigest===row.originDigest,'PROPOSAL_HISTORY','Proposal event missing.');
  for(const approval of row.approvals){
   const approvalEvent=input.events.find(value=>value.type==='disposition-reviewed'&&
    value.payload.proposalId===row.proposalId&&value.payload.approvalDigest===bodyHash(approval));
   fail(approvalEvent,'APPROVAL_HISTORY','Approval event missing.');
  }
  if(row.state==='withdrawn'){
   const event=input.events.filter(value=>value.type==='disposition-withdrawn'&&
    value.payload.proposalId===row.proposalId).at(-1);
   fail(event&&event.actorToken===row.withdrawnBy&&event.at.slice(0,10)===row.withdrawnOn,
    'WITHDRAWAL_HISTORY','Withdrawal event does not match proposal.');
  }
 }
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Disposition register digest invalid.');
 return copy(input);
}
function mutate(input,operation){
 const current=validateDispositionRegister(input),next=copy(current);operation(next);
 next.digest=bodyHash(next);return validateDispositionRegister(next);
}
export function proposeDisposition(registerInput,ledgerInput,policyInput,retentionPlan,
 reviewLedger,holdLedger,{proposalId,itemId,reasonCode,rationale,proposedOn,proposedBy,at}={}){
 const register=validateDispositionRegister(registerInput),ledger=validateCustodyLedger(ledgerInput);
 const plan=validateRetentionReviewPlan(retentionPlan,ledger,policyInput);
 const reviews=validateRetentionReviewLedger(reviewLedger,ledger,policyInput);
 const holds=validateHoldLedger(holdLedger,ledger);
 id(proposalId);id(itemId);oneOf(reasonCode,DISPOSITION_REASONS,'reason code');
 text(rationale,'rationale',{max:1200});date(proposedOn);role(proposedBy);
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===proposedOn,
  'TIMESTAMP','Proposal timestamp invalid.');
 fail(proposedOn>=register.createdOn,'DATE_ORDER','Proposal predates register.');
 const item=ledger.items.find(row=>row.itemId===itemId);fail(item,'ITEM_REFERENCE','Evidence item missing.');
 fail(item.state!=='withdrawn','ITEM_WITHDRAWN','Withdrawn evidence cannot be proposed for disposition.');
 fail(!isItemPreserved(holds,ledger,itemId),'ACTIVE_HOLD','Active preservation hold blocks disposition.');
 const planItem=plan.items.find(row=>row.itemId===itemId);fail(planItem,'PLAN_ITEM','Retention plan item missing.');
 fail(planItem.state==='expired','NOT_EXPIRED','Evidence is not beyond its configured retention period.');
 const review=reviews.reviews.filter(row=>row.itemId===itemId).at(-1);
 fail(review&&review.decision==='propose-disposition','REVIEW_REQUIRED','A human retention review must propose disposition.');
 fail(review.evidenceDigest===bodyHash(item),'STALE_EVIDENCE','Retention review is stale.');
 fail(!register.proposals.some(row=>row.proposalId===proposalId),'DUPLICATE','Proposal ID already exists.');
 fail(!register.proposals.some(row=>row.itemId===itemId&&
  ['proposed','approved-for-manual-review'].includes(row.state)),
  'DUPLICATE_ACTIVE','An active proposal already exists for this item.');
 const row={proposalId,itemId,ledgerDigest:ledger.digest,retentionPlanDigest:plan.digest,
  retentionReviewLedgerDigest:reviews.digest,holdLedgerDigest:holds.digest,
  reasonCode,rationale,proposedOn,proposedBy,state:'proposed',approvals:[],
  rejectionReason:'',withdrawnOn:null,withdrawnBy:null};
 row.originDigest=bodyHash(row);
 return mutate(register,next=>{
  next.proposals.push(row);next.proposals=sorted(next.proposals,row=>row.proposalId);
  appendEvent(next,'disposition-proposed',at,proposedBy,{proposalId,proposalDigest:row.originDigest});
 });
}
export function reviewDisposition(input,{proposalId,approvalId,reviewerToken,reviewedOn,
 decision,reason,at}={}){
 const current=validateDispositionRegister(input);id(proposalId);id(approvalId);role(reviewerToken);
 date(reviewedOn);oneOf(decision,['approve','reject'],'decision');text(reason,'reason',{max:700});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===reviewedOn,
  'TIMESTAMP','Review timestamp invalid.');
 const proposal=current.proposals.find(row=>row.proposalId===proposalId);
 fail(proposal,'PROPOSAL_REF','Disposition proposal not found.');
 fail(proposal.state==='proposed','PROPOSAL_TERMINAL','Only proposed dispositions can be reviewed.');
 fail(reviewerToken!==proposal.proposedBy,'SEPARATION','Proposer cannot review their own disposition.');
 fail(!proposal.approvals.some(row=>row.reviewerToken===reviewerToken),'DUPLICATE_REVIEWER','Reviewer already acted.');
 const approval={approvalId,reviewerToken,reviewedOn,decision,reason};
 const approvals=[...proposal.approvals,approval];
 if(decision==='reject'){
  return mutate(current,next=>{
   const row=next.proposals.find(value=>value.proposalId===proposalId);
   row.approvals=approvals;row.state='rejected';row.rejectionReason=reason;
   appendEvent(next,'disposition-reviewed',at,reviewerToken,{proposalId,
    approvalDigest:bodyHash(approval),decision});
  });
 }
 fail(approvals.filter(row=>row.decision==='approve').length<=2,'APPROVAL_COUNT','At most two approvals are recorded.');
 return mutate(current,next=>{
  const row=next.proposals.find(value=>value.proposalId===proposalId);
  row.approvals=approvals;
  if(approvals.filter(value=>value.decision==='approve').length===2)row.state='approved-for-manual-review';
  appendEvent(next,'disposition-reviewed',at,reviewerToken,{proposalId,
   approvalDigest:bodyHash(approval),decision});
 });
}
export function withdrawDisposition(input,{proposalId,withdrawnOn,withdrawnBy,reason,at}={}){
 const current=validateDispositionRegister(input);id(proposalId);date(withdrawnOn);role(withdrawnBy);
 text(reason,'reason',{max:700});
 fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&at.slice(0,10)===withdrawnOn,
  'TIMESTAMP','Withdrawal timestamp invalid.');
 const proposal=current.proposals.find(row=>row.proposalId===proposalId);
 fail(proposal,'PROPOSAL_REF','Disposition proposal not found.');
 fail(proposal.state==='proposed','PROPOSAL_TERMINAL','Only proposed disposition can be withdrawn.');
 fail(withdrawnBy!==proposal.proposedBy,'SEPARATION','Proposer cannot withdraw own proposal.');
 return mutate(current,next=>{
  const row=next.proposals.find(value=>value.proposalId===proposalId);
  row.state='withdrawn';row.withdrawnOn=withdrawnOn;row.withdrawnBy=withdrawnBy;
  appendEvent(next,'disposition-withdrawn',at,withdrawnBy,{proposalId,reason});
 });
}
export function activeDispositionForItem(input,itemId){
 const register=validateDispositionRegister(input);id(itemId);
 return register.proposals.filter(row=>row.itemId===itemId&&
  ['proposed','approved-for-manual-review'].includes(row.state)).map(copy);
}
export function dispositionSummary(input){
 const register=validateDispositionRegister(input);
 return {registerId:register.registerId,total:register.proposals.length,
  proposed:register.proposals.filter(row=>row.state==='proposed').length,
  approvedForManualReview:register.proposals.filter(row=>row.state==='approved-for-manual-review').length,
  rejected:register.proposals.filter(row=>row.state==='rejected').length,
  withdrawn:register.proposals.filter(row=>row.state==='withdrawn').length,
  executionSupported:false,digest:bodyHash({registerId:register.registerId,proposals:register.proposals})};
}
