import test from 'node:test';
import assert from 'node:assert/strict';
import {FOURTH,FIFTH,NEXT_AT,FOURTH_AT,FIFTH_AT,
 custody,policies,plan,reviewedLedger,holds,heldLedger,dispositionRegister} from './p15aj-fixtures.mjs';
import {sha,bodyHash,CustodyError} from './p15-custody-contract.mjs';
import {changeEvidenceState} from './p15-custody-ledger.mjs';
import {buildRetentionReviewPlan,
 retentionReviewSummary} from './p15aj-retention.mjs';
import {placeHold,releaseHold,isItemPreserved,holdSummary,validateHoldLedger} from './p15aj-holds.mjs';
import {proposeDisposition,reviewDisposition,dispositionSummary,validateDispositionRegister} from './p15aj-disposition.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function makeProposal(){
 return proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-flow',itemId:'evidence-one',reasonCode:'retention-period-ended',
  rationale:'Retention review recommended manual disposition consideration.',
  proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT});
}
function twoApprovals(){
 const first=reviewDisposition(makeProposal(),{proposalId:'proposal-flow',approvalId:'approval-flow-one',
  reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,decision:'approve',
  reason:'First independent review.',at:FOURTH_AT});
 return reviewDisposition(first,{proposalId:'proposal-flow',approvalId:'approval-flow-two',
  reviewerToken:'actor-reviewer-two',reviewedOn:FIFTH,decision:'approve',
  reason:'Second independent review.',at:FIFTH_AT});
}
test('end-to-end retention plan is bound to custody evidence digest',()=>{
 const result=plan();assert.equal(result.items[0].itemDigest,sha(custody().items[0]));
});
test('end-to-end retention review records human disposition recommendation',()=>{
 const row=reviewedLedger();assert.equal(row.reviews[0].decision,'propose-disposition');
});
test('end-to-end active preservation hold blocks disposition proposal',()=>{
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),
  reviewedLedger(),heldLedger(),{proposalId:'proposal-held',itemId:'evidence-one',
   reasonCode:'retention-period-ended',rationale:'Review.',proposedOn:FOURTH,
   proposedBy:'actor-proposer',at:FOURTH_AT}),'ACTIVE_HOLD');
});
test('end-to-end release of preservation hold permits later proposal',()=>{
 const released=releaseHold(heldLedger(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Preservation review concluded.'});
 assert.equal(isItemPreserved(released,custody(),'evidence-one'),false);
 const row=proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewedLedger(),released,{
  proposalId:'proposal-after-release',itemId:'evidence-one',reasonCode:'retention-period-ended',
  rationale:'Human review after hold release.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT});
 assert.equal(row.proposals.length,1);
});
test('end-to-end first approval is not sufficient for manual review status',()=>{
 const row=reviewDisposition(makeProposal(),{proposalId:'proposal-flow',approvalId:'approval-one',
  reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,decision:'approve',
  reason:'Independent review.',at:FOURTH_AT});
 assert.equal(row.proposals[0].state,'proposed');
});
test('end-to-end two-person approval reaches manual-review state only',()=>{
 const row=twoApprovals();
 assert.equal(row.proposals[0].state,'approved-for-manual-review');
 assert.equal(dispositionSummary(row).executionSupported,false);
});
test('end-to-end retention review digest is retained in proposal',()=>{
 const reviews=reviewedLedger(),row=proposeDisposition(dispositionRegister(),custody(),policies(),
  plan(),reviews,holds(),{proposalId:'proposal-digest',itemId:'evidence-one',
  reasonCode:'retention-period-ended',rationale:'Review.',proposedOn:FOURTH,
  proposedBy:'actor-proposer',at:FOURTH_AT});
 assert.equal(row.proposals[0].retentionReviewLedgerDigest,reviews.digest);
});
test('end-to-end proposal is invalidated by changed custody ledger digest',()=>{
 const changed=changeEvidenceState(custody(),{itemId:'evidence-one',to:'released',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Release.'});
 const changedPlan=buildRetentionReviewPlan(changed,policies(),{planId:'plan-changed',asOf:FOURTH});
 fails(()=>proposeDisposition(dispositionRegister(),changed,policies(),changedPlan,
  reviewedLedger(),holds(),{proposalId:'proposal-stale',itemId:'evidence-one',
  reasonCode:'retention-period-ended',rationale:'Review.',proposedOn:FOURTH,
  proposedBy:'actor-proposer',at:FOURTH_AT}),'STALE_EVIDENCE');
});
test('end-to-end active holds can be reviewed and extended',()=>{
 const row=placeHold(heldLedger(),custody(),{holdId:'hold-two',itemIds:['evidence-one'],
  scope:'Second review scope.',reason:'Another preservation request.',
  placedOn:FOURTH,placedBy:'actor-other-placer',reviewOn:FIFTH,at:FOURTH_AT});
 assert.equal(holdSummary(row,custody()).active,2);
});
test('end-to-end hold ledger validation uses current custody snapshot',()=>{
 assert.equal(validateHoldLedger(heldLedger(),custody()).holds.length,1);
});
test('end-to-end disposition proposal is validated against origin digest',()=>{
 const row=makeProposal();assert.equal(validateDispositionRegister(row).digest,row.digest);
});
test('end-to-end proposal rationale tampering is detected',()=>{
 const row=makeProposal(),changed=structuredClone(row);
 changed.proposals[0].rationale='Altered rationale';changed.digest=bodyHash(changed);
 fails(()=>validateDispositionRegister(changed),'ORIGIN_DIGEST');
});
test('end-to-end rejected proposal cannot be reapproved',()=>{
 const rejected=reviewDisposition(makeProposal(),{proposalId:'proposal-flow',approvalId:'reject-one',
  reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,decision:'reject',
  reason:'Evidence is insufficient.',at:FOURTH_AT});
 fails(()=>reviewDisposition(rejected,{proposalId:'proposal-flow',approvalId:'approve-later',
  reviewerToken:'actor-reviewer-two',reviewedOn:FIFTH,decision:'approve',
  reason:'Try again.',at:FIFTH_AT}),'PROPOSAL_TERMINAL');
});
test('end-to-end withdrawn proposal remains in immutable register history',()=>{
 const {withdrawDisposition}=awaitDisposition();
 const row=withdrawDisposition(makeProposal(),{proposalId:'proposal-flow',withdrawnOn:FIFTH,
  withdrawnBy:'actor-coordinator-two',reason:'Request superseded.',at:FIFTH_AT});
 assert.equal(row.proposals[0].state,'withdrawn');assert.equal(row.events.length,3);
});
function awaitDisposition(){return {withdrawDisposition:withdrawDispositionImported};}
import {withdrawDisposition as withdrawDispositionImported} from './p15aj-disposition.mjs';
test('end-to-end retention summary counts review recommendation',()=>{
 assert.equal(retentionReviewSummary(reviewedLedger(),custody(),policies()).decisions['propose-disposition'],1);
});
test('end-to-end UNKNOWN licence remains explicit in custody item',()=>{
 assert.equal(custody().items[0].licence,'UNKNOWN');
});
test('end-to-end no disposition operation removes custody item',()=>{
 const row=twoApprovals();assert.equal(custody().items.length,1);
 assert.equal(row.proposals[0].state,'approved-for-manual-review');
});
test('end-to-end disposition governance exposes no execution support',()=>{
 assert.equal(dispositionSummary(twoApprovals()).executionSupported,false);
});
test('end-to-end ledger digest remains unchanged during retention assessment',()=>{
 const row=custody(),digest=row.digest;plan({ledger:row});
 assert.equal(row.digest,digest);
});
test('end-to-end ledger digest remains unchanged during hold evaluation',()=>{
 const row=custody(),digest=row.digest;isItemPreserved(heldLedger({ledger:row}),row,'evidence-one');
 assert.equal(row.digest,digest);
});
test('end-to-end all governance events have contiguous sequence values',()=>{
 const row=twoApprovals();
 assert.deepEqual(row.events.map(event=>event.sequence),[1,2,3,4]);
});
test('end-to-end proposal does not include personal identifiers',()=>{
 const row=makeProposal();assert.ok(!JSON.stringify(row).includes('@'));
});
test('end-to-end proposal stores no deletion completion flag',()=>{
 const row=makeProposal();assert.ok(!Object.hasOwn(row.proposals[0],'deleted'));
});
test('end-to-end approval requires distinct reviewer tokens',()=>{
 const first=reviewDisposition(makeProposal(),{proposalId:'proposal-flow',approvalId:'approval-one',
  reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,decision:'approve',
  reason:'First review.',at:FOURTH_AT});
 fails(()=>reviewDisposition(first,{proposalId:'proposal-flow',approvalId:'approval-two',
  reviewerToken:'actor-reviewer-one',reviewedOn:FIFTH,decision:'approve',
  reason:'Second review.',at:FIFTH_AT}),'DUPLICATE_REVIEWER');
});
test('end-to-end retention plan remains deterministic across repeated builds',()=>{
 assert.deepEqual(plan(),plan());
});
test('end-to-end hold state remains active until explicit release',()=>{
 assert.equal(heldLedger().holds[0].state,'active');
});
test('end-to-end proposal is not created while hold remains active',()=>{
 fails(()=>proposeDisposition(dispositionRegister(),custody(),policies(),plan(),
  reviewedLedger(),heldLedger(),{proposalId:'proposal-blocked',itemId:'evidence-one',
  reasonCode:'other',rationale:'Review.',proposedOn:FOURTH,proposedBy:'actor-proposer',at:FOURTH_AT}),
  'ACTIVE_HOLD');
});
