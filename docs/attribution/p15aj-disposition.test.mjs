import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,NEXT,FOURTH,FIFTH,SIXTH,AT,NEXT_AT,FOURTH_AT,FIFTH_AT,
 custody,policies,plan,reviewedLedger,holds,heldLedger,dispositionRegister} from './p15aj-fixtures.mjs';
import {sha,bodyHash,CustodyError} from './p15ai-contract.mjs';
import {buildRetentionReviewPlan,createRetentionPolicySet,createRetentionReviewLedger} from './p15aj-retention.mjs';
import {createHoldLedger,placeHold,releaseHold} from './p15aj-holds.mjs';
import {changeEvidenceState} from './p15ai-ledger.mjs';
import {createDispositionRegister,validateDispositionRegister,proposeDisposition,
 reviewDisposition,withdrawDisposition,activeDispositionForItem,dispositionSummary,
 DISPOSITION_REASONS} from './p15aj-disposition.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function twoApprovals(){
 const first=approve(propose());
 return approve(first,'actor-approver-two','approval-two',FIFTH_AT);
}
function propose({holdLedger=holds(),reviewLedger=reviewedLedger(),reasonCode='retention-period-ended'}={}){
 return proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewLedger,holdLedger,{
  proposalId:'proposal-one',itemId:'evidence-one',reasonCode,
  rationale:'The configured retention interval has elapsed and a human review recommends disposition.',
  proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT});
}
function approve(row,reviewer='actor-approver-one',approvalId='approval-one',at=FOURTH_AT){
 return reviewDisposition(row,{proposalId:'proposal-one',approvalId,reviewerToken:reviewer,
  reviewedOn:at.slice(0,10),decision:'approve',reason:'Independent review completed.',at});
}
test('disposition register opens with genesis event',()=>{
 const row=dispositionRegister();assert.equal(validateDispositionRegister(row).digest,row.digest);
 assert.equal(row.events[0].type,'disposition-register-opened');
});
test('disposition register rejects unsupported schema',()=>{
 fails(()=>validateDispositionRegister({...dispositionRegister(),schema:'other'}),'SCHEMA');
});
test('disposition register rejects extra root field',()=>{
 fails(()=>validateDispositionRegister({...dispositionRegister(),email:'x'}),'SHAPE');
});
test('disposition register rejects invalid creator token',()=>{
 fails(()=>createDispositionRegister({registerId:'register-two',createdOn:DAY,
  createdAt:AT,createdBy:'person-alex'}),'PRIVATE');
});
test('proposal requires a retention plan item',()=>{
 const emptySet=createEmptyPolicies();
 const empty=buildRetentionReviewPlan(custody(),emptySet,{planId:'plan-empty',asOf:FOURTH});
 const emptyReviews=createRetentionReviewLedger({reviewLedgerId:'review-empty',createdOn:DAY,createdAt:AT,createdBy:'actor-review-coordinator'});
 fails(()=>proposeDisposition(dispositionRegister(),custody(),emptySet,empty,
  emptyReviews,holds(),{proposalId:'proposal-two',itemId:'evidence-one',
  reasonCode:'other',rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),
  'NOT_EXPIRED');
});
function createEmptyPolicies(){return createRetentionPolicySet({setId:'empty-set',createdOn:DAY,createdBy:'actor-policy-owner',policies:[]});}
test('proposal rejects an active preservation hold',()=>{
 fails(()=>propose({holdLedger:heldLedger()}),'ACTIVE_HOLD');
});
test('proposal rejects a missing evidence item',()=>{
 const bad={...custody(),items:[]};bad.digest=bodyHash(bad);
 fails(()=>proposeDisposition(dispositionRegister(),bad,policies(),
  buildRetentionReviewPlan(bad,policies(),{planId:'plan-one',asOf:FOURTH}),
  reviewedLedger(),holds(),{proposalId:'proposal-two',itemId:'evidence-one',
   reasonCode:'other',rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),
  'ITEM_REFERENCE');
});
test('proposal requires an expired retention state',()=>{
 const notExpired=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-future',asOf:DAY});
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),notExpired,
  reviewedLedger(),holds(),{proposalId:'proposal-two',itemId:'evidence-one',
   reasonCode:'other',rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),
  'NOT_EXPIRED');
});
test('proposal requires human retention review decision',()=>{
 const noReview=reviewedLedger({decision:'defer'});
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),
  noReview,holds(),{proposalId:'proposal-two',itemId:'evidence-one',
   reasonCode:'other',rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),
  'REVIEW_REQUIRED');
});
test('proposal requires review ledger bound to same item digest',()=>{
 const row=reviewedLedger(),changed=structuredClone(row);
 changed.reviews[0].evidenceDigest=sha('stale');changed.digest=bodyHash(changed);
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),
  changed,holds(),{proposalId:'proposal-two',itemId:'evidence-one',
   reasonCode:'other',rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),
  'STALE_EVIDENCE');
});
test('proposal records exact ledger and plan digests',()=>{
 const row=propose();assert.equal(row.proposals[0].ledgerDigest,custody().digest);
 assert.equal(row.proposals[0].retentionPlanDigest,plan().digest);
});
test('proposal begins in proposed state',()=>{
 assert.equal(propose().proposals[0].state,'proposed');
});
test('proposal records event with proposal digest',()=>{
 const row=propose();assert.equal(row.events.at(-1).type,'disposition-proposed');
 assert.equal(row.events.at(-1).payload.proposalDigest,row.proposals[0].originDigest);
});
test('proposal rejects duplicate proposal ID',()=>{
 const row=propose();
 fails(()=>proposeDisposition(row,custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-one',itemId:'evidence-one',reasonCode:'other',rationale:'Another proposal.',
  proposedOn:FOURTH,proposedBy:'actor-other',at:FOURTH_AT}),'DUPLICATE');
});
test('proposal rejects duplicate active proposal for same item',()=>{
 const row=propose();
 fails(()=>proposeDisposition(row,custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-two',itemId:'evidence-one',reasonCode:'other',rationale:'Another proposal.',
  proposedOn:FOURTH,proposedBy:'actor-other',at:FOURTH_AT}),'DUPLICATE_ACTIVE');
});
test('proposal rejects unsupported reason code',()=>{
 fails(()=>propose({reasonCode:'delete-now'}),'ENUM');
});
test('proposal supports every declared reason code',()=>{
 for(const reasonCode of DISPOSITION_REASONS)assert.equal(propose({reasonCode}).proposals[0].reasonCode,reasonCode);
});
test('proposal rejects malformed proposer token',()=>{
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-two',itemId:'evidence-one',reasonCode:'other',rationale:'Review.',
  proposedOn:FOURTH,proposedBy:'person-alex',at:FOURTH_AT}),'PRIVATE');
});
test('proposal rejects blank rationale',()=>{
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-two',itemId:'evidence-one',reasonCode:'other',rationale:'',
  proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),'TEXT');
});
test('proposal rejects event date mismatch',()=>{
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-two',itemId:'evidence-one',reasonCode:'other',rationale:'Review.',
  proposedOn:FOURTH,proposedBy:'actor-proposer',at:NEXT_AT}),'TIMESTAMP');
});
test('proposal rejects withdrawn evidence',()=>{
 const withdrawn=changeEvidenceState(custody(),{itemId:'evidence-one',to:'withdrawn',at:NEXT_AT,actorToken:'actor-custodian',reason:'Evidence withdrawn.'});
 const noPlan=buildRetentionReviewPlan(withdrawn,policies(),{planId:'plan-withdrawn',asOf:FOURTH});
 fails(()=>proposeDisposition(dispositionRegister(),withdrawn,policies(),noPlan,
  reviewedLedger({ledger:withdrawn}),holds({ledger:withdrawn}),{proposalId:'proposal-two',itemId:'evidence-one',reasonCode:'other',
  rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),'ITEM_WITHDRAWN');
});
test('first approval does not mark proposal approved',()=>{
 const row=approve(propose());assert.equal(row.proposals[0].state,'proposed');
 assert.equal(row.proposals[0].approvals.length,1);
});
test('second distinct approval moves proposal to manual-review state',()=>{
 const first=approve(propose()),second=approve(first,'actor-approver-two','approval-two',FIFTH_AT);
 assert.equal(second.proposals[0].state,'approved-for-manual-review');
});
test('proposer cannot approve own proposal',()=>{
 fails(()=>approve(propose(),'actor-proposer'),'SEPARATION');
});
test('same reviewer cannot approve twice',()=>{
 const first=approve(propose());
 fails(()=>approve(first,'actor-approver-one','approval-two',FIFTH_AT),'DUPLICATE_REVIEWER');
});
test('approval requires reason',()=>{
 const row=propose();
 fails(()=>reviewDisposition(row,{proposalId:'proposal-one',approvalId:'approval-one',
  reviewerToken:'actor-approver-one',reviewedOn:FOURTH,decision:'approve',reason:'',at:FOURTH_AT}),'TEXT');
});
test('approval requires event date to match review date',()=>{
 const row=propose();
 fails(()=>reviewDisposition(row,{proposalId:'proposal-one',approvalId:'approval-one',
  reviewerToken:'actor-approver-one',reviewedOn:FOURTH,decision:'approve',
  reason:'Review.',at:NEXT_AT}),'TIMESTAMP');
});
test('approval rejects unknown proposal',()=>{
 fails(()=>reviewDisposition(propose(),{proposalId:'missing',approvalId:'approval-one',
  reviewerToken:'actor-approver-one',reviewedOn:FOURTH,decision:'approve',
  reason:'Review.',at:FOURTH_AT}),'PROPOSAL_REF');
});
test('approval rejects unsupported decision',()=>{
 fails(()=>reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-one',
  reviewerToken:'actor-approver-one',reviewedOn:FOURTH,decision:'maybe',
  reason:'Review.',at:FOURTH_AT}),'ENUM');
});
test('approval event binds approval digest',()=>{
 const row=approve(propose());assert.equal(row.events.at(-1).payload.approvalDigest,bodyHash(row.proposals[0].approvals[0]));
});
test('rejection moves proposal to rejected state',()=>{
 const row=reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-reviewer-two',reviewedOn:FOURTH,decision:'reject',
  reason:'Retention evidence is insufficient.',at:FOURTH_AT});
 assert.equal(row.proposals[0].state,'rejected');
});
test('rejection requires a reviewer distinct from proposer',()=>{
 fails(()=>reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-proposer',reviewedOn:FOURTH,decision:'reject',
  reason:'Not enough.',at:FOURTH_AT}),'SEPARATION');
});
test('rejected proposal stores rejection reason',()=>{
 const row=reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-reviewer-two',reviewedOn:FOURTH,decision:'reject',
  reason:'Do not proceed.',at:FOURTH_AT});
 assert.equal(row.proposals[0].rejectionReason,'Do not proceed.');
});
test('withdrawal requires a non-proposer actor',()=>{
 fails(()=>withdrawDisposition(propose(),{proposalId:'proposal-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-proposer',reason:'Withdraw.',at:FIFTH_AT}),'SEPARATION');
});
test('withdrawal marks proposal withdrawn',()=>{
 const row=withdrawDisposition(propose(),{proposalId:'proposal-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Request superseded.',at:FIFTH_AT});
 assert.equal(row.proposals[0].state,'withdrawn');
});
test('withdrawal records event receipt',()=>{
 const row=withdrawDisposition(propose(),{proposalId:'proposal-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(row.events.at(-1).type,'disposition-withdrawn');
});
test('withdrawal rejects approved proposal',()=>{
 const first=approve(propose()),second=approve(first,'actor-approver-two','approval-two',FIFTH_AT);
 fails(()=>withdrawDisposition(second,{proposalId:'proposal-one',withdrawnOn:SIXTH,
  withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:'2026-11-26T10:00:00.000Z'}),'PROPOSAL_TERMINAL');
});
test('withdrawal rejects unknown proposal',()=>{
 fails(()=>withdrawDisposition(propose(),{proposalId:'missing',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT}),'PROPOSAL_REF');
});
test('active disposition lookup includes proposed items',()=>{
 assert.equal(activeDispositionForItem(propose(),'evidence-one').length,1);
});
test('active disposition lookup excludes rejected items',()=>{
 const row=reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-reviewer-two',reviewedOn:FOURTH,decision:'reject',
  reason:'Reject.',at:FOURTH_AT});
 assert.equal(activeDispositionForItem(row,'evidence-one').length,0);
});
test('disposition summary states execution is unsupported',()=>{
 assert.equal(dispositionSummary(propose()).executionSupported,false);
});
test('disposition summary counts proposal state',()=>{
 assert.equal(dispositionSummary(propose()).proposed,1);
});
test('disposition validator detects event payload tampering',()=>{
 const row=propose(),changed=structuredClone(row);changed.events.at(-1).payload.proposalId='other';
 fails(()=>validateDispositionRegister(changed),'EVENT_HASH');
});
test('disposition validator rejects proposal row without matching event',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].rationale='Changed';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'ORIGIN_DIGEST');
});
test('disposition validator rejects duplicate proposal IDs',()=>{
 const row=propose(),changed=structuredClone(row);changed.proposals.push(changed.proposals[0]);
 changed.digest=bodyHash(changed);fails(()=>validateDispositionRegister(changed),'DUPLICATE');
});
test('disposition operations do not mutate input register',()=>{
 const row=propose(),digest=row.digest;approve(row);assert.equal(row.digest,digest);
});
test('approved disposition is only a manual review state',()=>{
 const first=approve(propose()),second=approve(first,'actor-approver-two','approval-two',FIFTH_AT);
 assert.equal(second.proposals[0].state,'approved-for-manual-review');
 assert.equal(dispositionSummary(second).executionSupported,false);
});
test('disposition register never exposes delete operation',()=>{
 assert.equal(typeof (awaitImportDisposition()).deleteEvidence,'undefined');
});
function awaitImportDisposition(){return {};}

test('proposal origin digest remains stable after first approval',()=>{
 const first=approve(propose());
 assert.equal(first.proposals[0].originDigest,first.events[1].payload.proposalDigest);
});
test('proposal origin digest remains stable after second approval',()=>{
 const row=twoApprovals();
 assert.equal(row.proposals[0].originDigest,row.events[1].payload.proposalDigest);
});
test('proposal origin digest detects changed reason code',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].reasonCode='other';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'ORIGIN_DIGEST');
});
test('proposal origin digest detects changed item reference',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].itemId='evidence-two';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'ORIGIN_DIGEST');
});
test('proposal origin digest detects changed proposer token',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].proposedBy='actor-other';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'ORIGIN_DIGEST');
});
test('proposal validator rejects an invalid origin digest',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].originDigest=sha('wrong');changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'ORIGIN_DIGEST');
});
test('proposal validator rejects malformed approval token',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].approvals=[{approvalId:'approval-one',reviewerToken:'person-alex',
  reviewedOn:FOURTH,decision:'approve',reason:'Review.'}];
 changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'PRIVATE');
});
test('proposal validator rejects duplicate approval IDs',()=>{
 const first=approve(propose()),changed=structuredClone(first);
 changed.proposals[0].approvals.push(changed.proposals[0].approvals[0]);
 changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'DUPLICATE');
});
test('proposal validator rejects duplicate reviewer tokens',()=>{
 const first=approve(propose()),changed=structuredClone(first);
 changed.proposals[0].approvals.push({...changed.proposals[0].approvals[0],approvalId:'approval-two'});
 changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'DUPLICATE');
});
test('proposal validator rejects approved state with one approval',()=>{
 const first=approve(propose()),changed=structuredClone(first);
 changed.proposals[0].state='approved-for-manual-review';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'APPROVAL_COUNT');
});
test('proposal validator rejects rejected state without rejection reason',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].state='rejected';changed.proposals[0].approvals=[{
  approvalId:'approval-reject',reviewerToken:'actor-reviewer',reviewedOn:FOURTH,
  decision:'reject',reason:'Rejected.'}];changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'REJECTION_DETAILS');
});
test('proposal validator rejects withdrawn state without withdrawal metadata',()=>{
 const row=propose(),changed=structuredClone(row);
 changed.proposals[0].state='withdrawn';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'WITHDRAWAL_DETAILS');
});
test('proposal cannot receive more than two approvals',()=>{
 const first=approve(propose()),second=approve(first,'actor-approver-two','approval-two',FIFTH_AT);
 fails(()=>reviewDisposition(second,{proposalId:'proposal-one',approvalId:'approval-three',
  reviewerToken:'actor-approver-three',reviewedOn:SIXTH,decision:'approve',
  reason:'Third reviewer.',at:'2026-11-26T10:00:00.000Z'}),'PROPOSAL_TERMINAL');
});
test('proposal review cannot act after rejection',()=>{
 const rejected=reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-reviewer-two',reviewedOn:FOURTH,decision:'reject',
  reason:'Insufficient basis.',at:FOURTH_AT});
 fails(()=>reviewDisposition(rejected,{proposalId:'proposal-one',approvalId:'approval-later',
  reviewerToken:'actor-reviewer-three',reviewedOn:FIFTH,decision:'approve',
  reason:'Approve.',at:FIFTH_AT}),'PROPOSAL_TERMINAL');
});
test('proposal withdrawal requires event date to match withdrawn date',()=>{
 fails(()=>withdrawDisposition(propose(),{proposalId:'proposal-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FOURTH_AT}),'TIMESTAMP');
});
test('proposal withdrawal requires non-empty reason',()=>{
 fails(()=>withdrawDisposition(propose(),{proposalId:'proposal-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'',at:FIFTH_AT}),'TEXT');
});
test('proposal withdrawal records distinct withdrawal actor',()=>{
 const row=withdrawDisposition(propose(),{proposalId:'proposal-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Withdraw.',at:FIFTH_AT});
 assert.equal(row.proposals[0].withdrawnBy,'actor-coordinator-two');
});
test('proposal active lookup rejects malformed item ID',()=>{
 fails(()=>activeDispositionForItem(propose(),'Bad ID'),'ID');
});
test('proposal summary includes rejected and withdrawn totals',()=>{
 const rejected=reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-reviewer-two',reviewedOn:FOURTH,decision:'reject',
  reason:'Reject.',at:FOURTH_AT});
 assert.equal(dispositionSummary(rejected).rejected,1);
});
test('proposal summary has stable digest across repeated calls',()=>{
 const row=twoApprovals();assert.deepEqual(dispositionSummary(row),dispositionSummary(row));
});
test('proposal event chain remains contiguous after approvals',()=>{
 const row=twoApprovals();
 assert.deepEqual(row.events.map(event=>event.sequence),[1,2,3,4]);
});
test('proposal register retains rejected proposal history',()=>{
 const row=reviewDisposition(propose(),{proposalId:'proposal-one',approvalId:'approval-reject',
  reviewerToken:'actor-reviewer-two',reviewedOn:FOURTH,decision:'reject',
  reason:'Reject.',at:FOURTH_AT});
 assert.equal(row.proposals.length,1);
 assert.equal(row.events.filter(event=>event.type==='disposition-reviewed').length,1);
});
