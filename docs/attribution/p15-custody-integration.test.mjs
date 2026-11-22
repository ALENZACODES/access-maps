import test from 'node:test';
import assert from 'node:assert/strict';
import {ledger,item,withItem,access,redaction,DAY,NEXT,LATER,NEXT_AT,LATER_AT} from './p15-custody-fixtures.mjs';
import {sha,CustodyError} from './p15-custody-contract.mjs';
import {registerEvidence,updateEvidenceMetadata,changeEvidenceState,transferCustody,
 recordAccess,recordRedaction,validateCustodyLedger,custodySummary} from './p15-custody-ledger.mjs';
import {createRedactionManifest,validateRedactionManifest} from './p15-custody-redaction.mjs';
import {createCustodyPack,validateCustodyPack,renderCustodyPackSummary} from './p15-custody-pack.mjs';
import {verifyCustodyLedger,auditCustodyReferences,auditPackAgainstLedger} from './p15-custody-audit.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function fullFlow(){
 let row=withItem();
 row=transferCustody(row,{itemId:'evidence-one',toCustodian:'actor-archive',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer to archive role.'});
 row=recordAccess(row,access('evidence-one',{accessedAt:NEXT_AT}));
 row=recordRedaction(row,redaction(),{at:NEXT_AT,actorToken:'actor-redactor'});
 const manifest=createRedactionManifest(row,{manifestId:'manifest-flow',createdOn:LATER,
  createdBy:'actor-auditor',entries:[redaction()]});
 const pack=createCustodyPack(row,{packId:'pack-flow',createdOn:LATER,
  createdBy:'actor-auditor',manifest,includeAccess:true});
 return {row,manifest,pack};
}
test('complete flow opens ledger, registers evidence, transfers custody and records access',()=>{
 const {row}=fullFlow();assert.equal(validateCustodyLedger(row).items[0].custodianToken,'actor-archive');
 assert.equal(row.accessRecords.length,1);
});
test('complete flow binds redaction manifest and pack',()=>{
 const {row,manifest,pack}=fullFlow();
 assert.equal(validateRedactionManifest(manifest,row).digest,manifest.digest);
 assert.equal(auditPackAgainstLedger(pack,row,manifest).valid,true);
});
test('complete flow creates an identity-minimized report',()=>{
 const {pack}=fullFlow(),summary=renderCustodyPackSummary(pack);
 assert.ok(!summary.includes('actor-archive'));assert.ok(summary.includes('SHA-256'));
});
test('complete flow audits evidence source references',()=>{
 const {row}=fullFlow(),audit=auditCustodyReferences(row,{requiredAccessPurpose:'review'});
 assert.equal(audit.issueCount,0);
});
test('complete flow verifies final event chain head',()=>{
 const {row}=fullFlow(),verification=verifyCustodyLedger(row);
 assert.equal(verification.valid,true);assert.equal(verification.headHash,row.events.at(-1).hash);
});
test('complete flow can update item metadata before redaction',()=>{
 let row=withItem();
 row=updateEvidenceMetadata(row,'evidence-one',{notes:'Revised evidence handling note.'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Clarify custody note.'});
 assert.equal(row.items[0].notes,'Revised evidence handling note.');
});
test('complete flow prevents access after withdrawal',()=>{
 const withdrawn=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'withdrawn',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Evidence withdrawn.'});
 fails(()=>recordAccess(withdrawn,access('evidence-one',{accessedAt:LATER_AT})),'ACCESS_WITHDRAWN');
});
test('complete flow preserves UNKNOWN licence through pack export',()=>{
 const row=withItem(ledger(),item('evidence-one',{licence:'UNKNOWN'}));
 const pack=createCustodyPack(row,{packId:'pack-unknown',createdOn:NEXT,createdBy:'actor-auditor'});
 assert.equal(pack.items[0].licence,'UNKNOWN');
});
test('complete flow can select only one item from multi-item ledger',()=>{
 const first=withItem(),second=registerEvidence(first,item('evidence-two'),
  {at:NEXT_AT,actorToken:'actor-coordinator'});
 const pack=createCustodyPack(second,{packId:'pack-subset',createdOn:LATER,
  createdBy:'actor-auditor',itemIds:['evidence-two']});
 assert.deepEqual(pack.items.map(row=>row.itemId),['evidence-two']);
});
test('complete flow rejects a pack created from stale ledger digest',()=>{
 const {row,pack}=fullFlow();
 const changed=updateEvidenceMetadata(row,'evidence-one',{label:'New label'},
  {at:'2026-11-24T10:00:00.000Z',actorToken:'actor-custodian',reason:'Label correction.'});
 fails(()=>auditPackAgainstLedger(pack,changed),'STALE_PACK');
});
test('complete flow never changes a source record or access state',()=>{
 const {row}=fullFlow();assert.ok(!Object.hasOwn(row.items[0],'accessState'));
 assert.ok(!Object.hasOwn(row.items[0],'accessibility'));
});
test('complete flow records each mutation as a new event',()=>{
 const {row}=fullFlow();assert.equal(row.events.length,5);
 assert.deepEqual(row.events.map(event=>event.sequence),[1,2,3,4,5]);
});
test('complete flow verifies each event previous hash',()=>{
 const {row}=fullFlow();
 for(let index=1;index<row.events.length;index++)
  assert.equal(row.events[index].previousHash,row.events[index-1].hash);
});
test('complete flow keeps the source digest stable across custody transfer',()=>{
 const first=withItem(),digest=first.items[0].sourceDigest;
 const next=transferCustody(first,{itemId:'evidence-one',toCustodian:'actor-archive',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer.'});
 assert.equal(next.items[0].sourceDigest,digest);
});
test('complete flow separates content digest from source metadata digest',()=>{
 const row=withItem();assert.notEqual(row.items[0].contentDigest,row.items[0].sourceDigest);
});
test('complete flow redaction does not mutate evidence content digest',()=>{
 const first=withItem(),next=recordRedaction(first,redaction(),{at:NEXT_AT,actorToken:'actor-redactor'});
 assert.equal(next.items[0].contentDigest,first.items[0].contentDigest);
});
test('complete flow keeps raw content bytes out of ledger',()=>{
 const {row}=fullFlow();assert.ok(!JSON.stringify(row).includes('"bytes"'));
});
test('complete flow summary is deterministic',()=>{
 const {row}=fullFlow();assert.deepEqual(custodySummary(row),custodySummary(row));
});
test('complete flow preserves item count after multiple metadata events',()=>{
 let row=withItem();
 row=updateEvidenceMetadata(row,'evidence-one',{label:'Second label'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Correct label.'});
 row=updateEvidenceMetadata(row,'evidence-one',{notes:'Second note'},
  {at:LATER_AT,actorToken:'actor-custodian',reason:'Correct note.'});
 assert.equal(row.items.length,1);assert.equal(row.events.length,4);
});
test('complete flow refuses transfer to an identity token',()=>{
 fails(()=>transferCustody(withItem(),{itemId:'evidence-one',toCustodian:'person-alex',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer.'}),'PRIVATE');
});
test('complete flow redaction receipt is linked to exact original digest',()=>{
 const {row}=fullFlow();assert.equal(row.redactions[0].originalDigest,sha('original-evidence-one'));
});
test('complete flow has no unrecorded access side effect',()=>{
 const {row}=fullFlow();assert.equal(row.accessRecords.length,1);
 assert.equal(row.events.filter(event=>event.type==='access-recorded').length,1);
});

test('complete flow checkpoint extends verified history',()=>{
 const {row}=fullFlow();
 const {addCheckpoint}=ledgerOperations();
 const next=addCheckpoint(row,{checkpointId:'checkpoint-final',at:'2026-11-24T10:00:00.000Z',
  actorToken:'actor-auditor'});
 assert.equal(verifyCustodyLedger(next).eventCount,row.events.length+1);
});
function ledgerOperations(){
 return {addCheckpoint:addCheckpointImported};
}
import {addCheckpoint as addCheckpointImported} from './p15-custody-ledger.mjs';
test('complete flow records source retrieval date unchanged in pack',()=>{
 const {pack}=fullFlow();assert.equal(pack.items[0].retrievedOn,DAY);
});
test('complete flow keeps evidence capture date immutable in report pack',()=>{
 const {pack}=fullFlow();assert.equal(pack.items[0].capturedOn,DAY);
});
test('complete flow retains licence reference in the offline pack',()=>{
 const {pack}=fullFlow();assert.equal(pack.items[0].licenceReference,'licence-record-1');
});
test('complete flow includes redaction replacement and original digest',()=>{
 const {pack}=fullFlow(),entry=pack.items[0].redactions[0];
 assert.equal(entry.replacement,'[redacted]');assert.equal(entry.originalDigest,sha('original-evidence-one'));
});
test('complete flow access record preserves purpose and result',()=>{
 const {pack}=fullFlow();assert.equal(pack.access[0].purpose,'review');
 assert.equal(pack.access[0].result,'allowed');
});
test('complete flow redaction manifest remains bound to ledger',()=>{
 const {row,manifest}=fullFlow();assert.equal(manifest.ledgerId,row.ledgerId);
});
test('complete flow access history contains exactly one record',()=>{
 const {row}=fullFlow();assert.equal(row.accessRecords.length,1);
});
test('complete flow custody history records one transfer',()=>{
 const {row}=fullFlow();assert.equal(row.events.filter(event=>event.type==='custody-transferred').length,1);
});
test('complete flow redaction history records one receipt',()=>{
 const {row}=fullFlow();assert.equal(row.events.filter(event=>event.type==='redaction-recorded').length,1);
});
test('complete flow output omits original custodian token',()=>{
 const {pack}=fullFlow();assert.ok(!JSON.stringify(pack).includes('actor-custodian'));
});
test('complete flow report retains only the pack creator role token outside item metadata',()=>{
 const {pack}=fullFlow();assert.equal(pack.createdBy,'actor-auditor');
 assert.ok(!Object.hasOwn(pack.items[0],'custodianToken'));
});
test('complete flow source digest is retained after transfer and redaction',()=>{
 const {row,pack}=fullFlow();assert.equal(pack.items[0].sourceDigest,row.items[0].sourceDigest);
});
test('complete flow pack digest is valid after validation',()=>{
 const {pack}=fullFlow();assert.equal(validateCustodyPack(pack).digest,pack.digest);
});
test('complete flow ledger digest is valid after validation',()=>{
 const {row}=fullFlow();assert.equal(validateCustodyLedger(row).digest,row.digest);
});
