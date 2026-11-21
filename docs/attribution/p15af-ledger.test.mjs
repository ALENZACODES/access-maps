import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,DAY,NEXT,LATER,sourceDigest} from './p15af-fixtures.mjs';
import {createImpactLedger,validateImpactLedger,holdSource,releaseSource,retireSource,
 acknowledgeImpact,recordRemediation,ledgerSummary} from './p15af-ledger.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
function ledger(){
 return createImpactLedger({ledgerId:'ledger-one',catalog:catalog(),createdOn:NEXT,createdBy:'actor-steward'});
}
function held(){
 return holdSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'licence-review',reason:'Licence metadata needs a human review.',sourceDigest});
}
test('ledger opens against an exact catalog digest',()=>{
 const row=ledger();
 assert.equal(validateImpactLedger(row,{catalog:catalog()}).digest,row.digest);
});
test('ledger rejects an unsupported schema',()=>{
 const row=ledger();
 fails(()=>validateImpactLedger({...row,schema:'unknown'}),'SCHEMA');
});
test('ledger rejects catalog digest mismatch',()=>{
 const row=ledger();
 fails(()=>validateImpactLedger(row,{catalog:catalog({sources:[source({statusReason:'Source status note has changed.'})]})}),'STALE_LEDGER');
});
test('ledger rejects duplicate or skipped event sequence',()=>{
 const row=held();
 const changed=structuredClone(row);
 changed.events[0].sequence=4;
 fails(()=>validateImpactLedger(changed),'SEQUENCE');
});
test('ledger rejects a modified event payload',()=>{
 const row=held();
 const changed=structuredClone(row);
 changed.events[0].payload.reason='altered';
 fails(()=>validateImpactLedger(changed),'EVENT_HASH');
});
test('ledger rejects a broken previous hash',()=>{
 const row=held();
 const changed=structuredClone(row);
 changed.events[0].previousHash='f'.repeat(64);
 fails(()=>validateImpactLedger(changed),'EVENT_HASH');
});
test('ledger rejects event chronology moving backwards',()=>{
 const row=held();
 const changed=structuredClone(row);
 changed.events[0].at=DAY;
 changed.events[0].hash=sha256((({hash,...rest})=>rest)(changed.events[0]));
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateImpactLedger(changed),'EVENT_ORDER');
});
test('hold records source, reason and previous state',()=>{
 const row=held();
 assert.equal(row.events[0].type,'source-held');
 assert.equal(row.events[0].payload.previousState,'active');
});
test('hold refuses unknown source reason code',()=>{
 fails(()=>holdSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'guess',reason:'Review needed.',sourceDigest}),'HOLD_REASON');
});
test('hold refuses malformed source digest',()=>{
 fails(()=>holdSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'other',reason:'Review needed.',sourceDigest:'bad'}),'HASH');
});
test('hold refuses a source identifier outside the ledger catalog snapshot',()=>{
 fails(()=>holdSource(ledger(),{sourceId:'source-missing',at:LATER,actor:'actor-steward',
  reasonCode:'other',reason:'Review needed.',sourceDigest}),'SOURCE_REF');
});
test('hold prevents a second unresolved hold',()=>{
 const row=held();
 fails(()=>holdSource(row,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'other',reason:'Second hold.',sourceDigest}),'SOURCE_ALREADY_HELD');
});
test('hold accepts a new hold after a prior release',()=>{
 const first=held();
 const released=releaseSource(first,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:first.events[0].hash,reviewDigest:sha256('review'),sourceDigest});
 const next=holdSource(released,{sourceId:'source-one',at:'2026-11-25',actor:'actor-steward',
  reasonCode:'other',reason:'New concern.',sourceDigest});
 assert.equal(next.events.length,3);
});
test('release requires the exact hold event hash',()=>{
 const row=held();
 fails(()=>releaseSource(row,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:'f'.repeat(64),reviewDigest:sha256('review'),sourceDigest}),'HOLD_REF');
});
test('release rejects a hold already resolved',()=>{
 const row=held();
 const released=releaseSource(row,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:row.events[0].hash,reviewDigest:sha256('review'),sourceDigest});
 fails(()=>releaseSource(released,{sourceId:'source-one',at:'2026-11-25',actor:'actor-steward',
  holdEventHash:row.events[0].hash,reviewDigest:sha256('review-two'),sourceDigest}),'HOLD_RESOLVED');
});
test('release requires release date after hold date',()=>{
 const row=held();
 fails(()=>releaseSource(row,{sourceId:'source-one',at:DAY,actor:'actor-steward',
  holdEventHash:row.events[0].hash,reviewDigest:sha256('review'),sourceDigest}),'EVENT_ORDER');
});
test('release records human review digest',()=>{
 const row=held();
 const result=releaseSource(row,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:row.events[0].hash,reviewDigest:sha256('review'),sourceDigest});
 assert.equal(result.events.at(-1).payload.reviewDigest,sha256('review'));
});
test('retire converts active source history into terminal state',()=>{
 const result=retireSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reason:'Source was withdrawn by its publisher.',sourceDigest});
 assert.equal(result.events[0].type,'source-retired');
});
test('supersede records replacement source identifier',()=>{
 const withReplacement=catalog({sources:[source(),source({sourceId:'source-two',
  sourceDigest:sha256('two'),reference:'sources/two.json'})]});
 const value=createImpactLedger({ledgerId:'ledger-with-replacement',catalog:withReplacement,
  createdOn:NEXT,createdBy:'actor-steward'});
 const result=retireSource(value,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reason:'Replacement source snapshot is available.',replacementSourceId:'source-two',sourceDigest});
 assert.equal(result.events[0].type,'source-superseded');
 assert.equal(result.events[0].payload.replacementSourceId,'source-two');
});
test('retire rejects invalid replacement source identifier',()=>{
 fails(()=>retireSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reason:'Retired.',replacementSourceId:'../bad',sourceDigest}),'ID');
});
test('retire refuses a second terminal transition',()=>{
 const first=retireSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reason:'Retired.',sourceDigest});
 fails(()=>retireSource(first,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  reason:'Again.',sourceDigest}),'SOURCE_TERMINAL');
});
test('acknowledgement requires a known state label',()=>{
 fails(()=>acknowledgeImpact(ledger(),{planDigest:sha256('plan'),actionId:'action-one',
  acknowledgedState:'done',evidenceDigest:sha256('evidence'),at:LATER,actor:'actor-steward'}),'ACK_STATE');
});
test('acknowledgement stores plan and action references',()=>{
 const result=acknowledgeImpact(ledger(),{planDigest:sha256('plan'),actionId:'action-one',
  acknowledgedState:'accepted',evidenceDigest:sha256('evidence'),at:LATER,actor:'actor-steward'});
 assert.equal(result.events[0].payload.actionId,'action-one');
});
test('remediation requires an accepted acknowledgement',()=>{
 fails(()=>recordRemediation(ledger(),{planDigest:sha256('plan'),actionId:'action-one',
  resolution:'Rebuilt asset.',evidenceDigest:sha256('evidence'),resultDigest:sha256('result'),
  at:LATER,actor:'actor-steward'}),'ACK_REQUIRED');
});
test('remediation requires the matching plan digest',()=>{
 const first=acknowledgeImpact(ledger(),{planDigest:sha256('plan-one'),actionId:'action-one',
  acknowledgedState:'accepted',evidenceDigest:sha256('ack'),at:LATER,actor:'actor-steward'});
 fails(()=>recordRemediation(first,{planDigest:sha256('plan-two'),actionId:'action-one',
  resolution:'Rebuilt asset.',evidenceDigest:sha256('evidence'),resultDigest:sha256('result'),
  at:LATER,actor:'actor-steward'}),'ACK_REQUIRED');
});
test('remediation can be recorded after accepted acknowledgement',()=>{
 const planDigest=sha256('plan');
 const first=acknowledgeImpact(ledger(),{planDigest,actionId:'action-one',
  acknowledgedState:'accepted',evidenceDigest:sha256('ack'),at:LATER,actor:'actor-steward'});
 const result=recordRemediation(first,{planDigest,actionId:'action-one',resolution:'Asset rebuilt and checked.',
  evidenceDigest:sha256('evidence'),resultDigest:sha256('result'),at:'2026-11-24',actor:'actor-steward'});
 assert.equal(result.events.at(-1).type,'remediation-recorded');
});
test('remediation refuses deferred acknowledgement',()=>{
 const planDigest=sha256('plan');
 const first=acknowledgeImpact(ledger(),{planDigest,actionId:'action-one',
  acknowledgedState:'deferred',evidenceDigest:sha256('ack'),at:LATER,actor:'actor-steward'});
 fails(()=>recordRemediation(first,{planDigest,actionId:'action-one',resolution:'Rebuilt.',
  evidenceDigest:sha256('evidence'),resultDigest:sha256('result'),at:'2026-11-24',actor:'actor-steward'}),'ACK_REQUIRED');
});
test('ledger summary reports held sources',()=>assert.deepEqual(ledgerSummary(held()).heldSources,['source-one']));
test('ledger summary reports terminal source retirement',()=>{
 const row=retireSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',reason:'Retired.',sourceDigest});
 assert.deepEqual(ledgerSummary(row).retiredSources,['source-one']);
});
test('ledger summary removes a released source from held set',()=>{
 const row=held();
 const released=releaseSource(row,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:row.events[0].hash,reviewDigest:sha256('review'),sourceDigest});
 assert.deepEqual(ledgerSummary(released).heldSources,[]);
});
test('ledger summary counts acknowledgement and remediation',()=>{
 const planDigest=sha256('plan');
 let row=acknowledgeImpact(ledger(),{planDigest,actionId:'action-one',acknowledgedState:'accepted',
  evidenceDigest:sha256('ack'),at:LATER,actor:'actor-steward'});
 row=recordRemediation(row,{planDigest,actionId:'action-one',resolution:'Done.',
  evidenceDigest:sha256('evidence'),resultDigest:sha256('result'),at:'2026-11-24',actor:'actor-steward'});
 const summary=ledgerSummary(row);
 assert.equal(summary.acknowledgements['action-one'],'accepted');
 assert.deepEqual(summary.remediatedActions,['action-one']);
});

test('ledger records source release without changing original hold event',()=>{
 const row=held(),hold=row.events[0];
 const released=releaseSource(row,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:hold.hash,reviewDigest:sha256('review'),sourceDigest});
 assert.equal(released.events[0].hash,hold.hash);
 assert.equal(released.events[1].type,'source-released');
});
test('ledger rejects malformed actor token on hold event',()=>{
 fails(()=>holdSource(ledger(),{sourceId:'source-one',at:LATER,actor:'person-steward',
  reasonCode:'other',reason:'Review.',sourceDigest}),'PRIVATE');
});
test('ledger rejects personal email in hold reason',()=>{
 fails(()=>holdSource(ledger(),{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'other',reason:'Contact person@example.invalid',sourceDigest}),'PRIVATE');
});
test('ledger summary digest changes when a hold is added',()=>{
 const before=ledgerSummary(ledger()),after=ledgerSummary(held());
 assert.notEqual(before.digest,after.digest);
});
test('ledger exposes event count in summary',()=>{
 assert.equal(ledgerSummary(held()).events,1);
});

test('ledger rejects hold event source digest outside catalog snapshot',()=>{
 const row=ledger();
 fails(()=>holdSource(row,{sourceId:'source-one',at:LATER,actor:'actor-steward',
  reasonCode:'other',reason:'Digest mismatch.',sourceDigest:sha256('other')}),'SOURCE_REF');
});
test('ledger rejects release digest outside original catalog snapshot',()=>{
 const row=held();
 fails(()=>releaseSource(row,{sourceId:'source-one',at:'2026-11-24',actor:'actor-steward',
  holdEventHash:row.events[0].hash,reviewDigest:sha256('review'),sourceDigest:sha256('other')}),'SOURCE_REF');
});
test('ledger stores a catalog-bound source snapshot index',()=>{
 const row=ledger();
 assert.deepEqual(row.sourceSnapshots.map(item=>item.sourceId),['source-one']);
 assert.equal(row.sourceSnapshots[0].sourceDigest,sourceDigest);
});
