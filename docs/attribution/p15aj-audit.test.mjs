import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,NEXT,FOURTH,FIFTH,custody,policies,plan,reviewedLedger,holds,heldLedger,
 dispositionRegister} from './p15aj-fixtures.mjs';
import {bodyHash,sha,CustodyError} from './p15ai-contract.mjs';
import {registerEvidence} from './p15ai-ledger.mjs';
import {createRetentionReviewLedger,recordRetentionReview} from './p15aj-retention.mjs';
import {placeHold,releaseHold} from './p15aj-holds.mjs';
import {proposeDisposition,reviewDisposition} from './p15aj-disposition.mjs';
import {auditEvidenceGovernance,createGovernanceSnapshot,validateGovernanceSnapshot,
 compareGovernanceSnapshots} from './p15aj-audit.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function audit({review=reviewedLedger(),hold=holds(),disposition=dispositionRegister(),asOf=FOURTH}={}){
 return auditEvidenceGovernance(custody(),policies(),review,hold,disposition,{asOf});
}
function proposed(){
 return proposeDisposition(dispositionRegister(),custody(),policies(),plan(),reviewedLedger(),holds(),{
  proposalId:'proposal-audit',itemId:'evidence-one',reasonCode:'retention-period-ended',
  rationale:'Human review recommends manual disposition consideration.',
  proposedOn:FOURTH,proposedBy:'actor-proposer',at:'2026-11-24T10:00:00.000Z'});
}
test('governance audit returns digests for every source ledger',()=>{
 const result=audit();assert.equal(result.ledgerDigest,custody().digest);
 assert.equal(result.policySetDigest,policies().digest);
 assert.equal(result.holdLedgerDigest,holds().digest);
});
test('governance audit detects unknown retention policy',()=>{
 const base=custody(),unknown=registerEvidence(base,{...base.items[0],itemId:'evidence-other',kind:'other',contentDigest:sha('other')},{at:'2026-11-24T10:00:00.000Z',actorToken:'actor-coordinator'});
 const result=auditEvidenceGovernance(unknown,policies(),reviewedLedger(),holds(),
  dispositionRegister(),{asOf:FOURTH});
 assert.ok(result.findings.some(row=>row.code==='RETENTION_POLICY_UNKNOWN'));
});
test('governance audit detects expired evidence without review',()=>{
 const empty=createRetentionReviewLedger({reviewLedgerId:'review-empty',createdOn:DAY,
  createdAt:'2026-11-21T10:00:00.000Z',createdBy:'actor-review-coordinator'});
 const result=audit({review:empty});
 assert.ok(result.findings.some(row=>row.code==='EXPIRED_WITHOUT_REVIEW'));
});
test('governance audit accepts reviewed expired evidence with no proposal',()=>{
 assert.ok(!audit().findings.some(row=>row.code==='EXPIRED_WITHOUT_REVIEW'));
});
test('governance audit detects active hold and active proposal conflict',()=>{
 const result=audit({hold:heldLedger(),disposition:proposed()});
 assert.ok(result.findings.some(row=>row.code==='HOLD_AND_DISPOSITION_CONFLICT'));
});
test('governance audit accepts proposal when no hold is active',()=>{
 const result=audit({disposition:proposed()});
 assert.ok(!result.findings.some(row=>row.code==='HOLD_AND_DISPOSITION_CONFLICT'));
});
test('governance audit counts active holds',()=>{
 const result=audit({hold:heldLedger()});assert.equal(result.summary.activeHolds,1);
});
test('governance audit counts active disposition proposals',()=>{
 const result=audit({disposition:proposed()});assert.equal(result.summary.activeProposals,1);
});
test('governance audit rejects malformed as-of date',()=>{
 fails(()=>auditEvidenceGovernance(custody(),policies(),reviewedLedger(),holds(),
  dispositionRegister(),{asOf:'bad'}),'DATE');
});
test('governance audit digest is deterministic',()=>{
 assert.deepEqual(audit(),audit());
});
test('governance snapshot validates generated audit output',()=>{
 const result=audit(),snapshot=createGovernanceSnapshot(result,{snapshotId:'snapshot-one',createdOn:FOURTH});
 assert.equal(validateGovernanceSnapshot(snapshot).digest,snapshot.digest);
});
test('governance snapshot rejects creation before audit date',()=>{
 fails(()=>createGovernanceSnapshot(audit(),{snapshotId:'snapshot-old',createdOn:NEXT}),'DATE_ORDER');
});
test('governance snapshot rejects invalid ID',()=>{
 fails(()=>createGovernanceSnapshot(audit(),{snapshotId:'Bad ID',createdOn:FOURTH}),'ID');
});
test('governance snapshot rejects tampered digest',()=>{
 const snapshot=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 fails(()=>validateGovernanceSnapshot({...snapshot,summary:{items:0}}),'HASH');
});
test('governance snapshot rejects unsupported schema',()=>{
 const snapshot=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 fails(()=>validateGovernanceSnapshot({...snapshot,schema:'other'}),'SCHEMA');
});
test('governance snapshot rejects duplicate findings',()=>{
 const empty=createRetentionReviewLedger({reviewLedgerId:'review-empty',createdOn:DAY,createdAt:'2026-11-21T10:00:00.000Z',createdBy:'actor-review-coordinator'});
 const snapshot=createGovernanceSnapshot(audit({review:empty}),{snapshotId:'snapshot-one',createdOn:FOURTH});
 const changed=structuredClone(snapshot);changed.findings.push(changed.findings[0]);
 changed.digest=bodyHash(changed);fails(()=>validateGovernanceSnapshot(changed),'DUPLICATE');
});
test('governance snapshot comparison detects added finding',()=>{
 const previous=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 const base=custody(),unknown=registerEvidence(base,{...base.items[0],itemId:'evidence-other',kind:'other',contentDigest:sha('other')},{at:'2026-11-24T10:00:00.000Z',actorToken:'actor-coordinator'});
 const currentAudit=auditEvidenceGovernance(unknown,policies(),reviewedLedger(),holds(),
  dispositionRegister(),{asOf:FIFTH});
 const current=createGovernanceSnapshot(currentAudit,{snapshotId:'snapshot-two',createdOn:FIFTH});
 assert.ok(compareGovernanceSnapshots(previous,current).summary.added>=1);
});
test('governance snapshot comparison detects cleared finding',()=>{
 const empty=createRetentionReviewLedger({reviewLedgerId:'review-empty',createdOn:DAY,
  createdAt:'2026-11-21T10:00:00.000Z',createdBy:'actor-review-coordinator'});
 const previousAudit=audit({review:empty});
 const previous=createGovernanceSnapshot(previousAudit,{snapshotId:'snapshot-one',createdOn:FOURTH});
 const current=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-two',createdOn:FIFTH});
 assert.equal(compareGovernanceSnapshots(previous,current).summary.cleared,1);
});
test('governance snapshot comparison rejects backwards snapshot date',()=>{
 const first=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 const second=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-two',createdOn:FIFTH});
 fails(()=>compareGovernanceSnapshots(second,first),'DATE_ORDER');
});
test('governance snapshot comparison rejects malformed snapshot',()=>{
 const first=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 fails(()=>compareGovernanceSnapshots({...first,digest:'bad'},first),'HASH');
});
test('governance audit does not alter any source ledger',()=>{
 const row=custody(),digest=row.digest;audit();assert.equal(row.digest,digest);
});
test('governance audit preserves explicit UNKNOWN licence in underlying ledger',()=>{
 audit();assert.equal(custody().items[0].licence,'UNKNOWN');
});
test('governance snapshot comparison returns stable digest',()=>{
 const first=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 const second=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-two',createdOn:FIFTH});
 assert.deepEqual(compareGovernanceSnapshots(first,second),compareGovernanceSnapshots(first,second));
});
test('governance snapshot findings remain code and item scoped',()=>{
 const snapshot=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 assert.ok(snapshot.findings.every(row=>Object.keys(row).sort().join(',')==='code,itemId'));
});
test('governance audit never recommends automatic deletion',()=>{
 const result=audit();assert.ok(!Object.hasOwn(result,'deleteNow'));
});
test('governance audit preserves ledger revision identity',()=>{
 const result=audit();assert.equal(result.ledgerId,'ledger-retention');
});

test('governance audit counts active holds once when hold scopes overlap',()=>{
 const first=heldLedger(),second=placeHold(first,custody(),{holdId:'hold-two',
  itemIds:['evidence-one'],scope:'Additional scope.',reason:'Second preservation request.',
  placedOn:FOURTH,placedBy:'actor-second-placer',reviewOn:FIFTH,
  at:'2026-11-24T10:00:00.000Z'});
 const result=audit({hold:second});
 assert.equal(result.summary.activeHolds,2);
});
test('governance audit keeps snapshot findings sorted',()=>{
 const result=audit({review:createRetentionReviewLedger({reviewLedgerId:'review-empty',
  createdOn:DAY,createdAt:'2026-11-21T10:00:00.000Z',createdBy:'actor-review-coordinator'})});
 const keys=result.findings.map(row=>`${row.code}:${row.itemId}`);
 assert.deepEqual(keys,[...keys].sort());
});
test('governance snapshot digest binds source ledger revision',()=>{
 const snapshot=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 assert.equal(snapshot.ledgerDigest,custody().digest);
});
test('governance snapshot preserves no automatic disposition outcome',()=>{
 const snapshot=createGovernanceSnapshot(audit(),{snapshotId:'snapshot-one',createdOn:FOURTH});
 assert.ok(!Object.hasOwn(snapshot,'executedDispositions'));
});
