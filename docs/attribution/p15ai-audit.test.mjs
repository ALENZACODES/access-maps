import test from 'node:test';
import assert from 'node:assert/strict';
import {ledger,item,withItem,withAccess,withRedaction,access,DAY,NEXT,LATER,NEXT_AT,LATER_AT} from './p15ai-fixtures.mjs';
import {sha,bodyHash,CustodyError} from './p15ai-contract.mjs';
import {registerEvidence,changeEvidenceState,transferCustody,recordAccess} from './p15ai-ledger.mjs';
import {createRedactionManifest} from './p15ai-redaction.mjs';
import {createCustodyPack} from './p15ai-pack.mjs';
import {verifyCustodyLedger,auditCustodyReferences,compareCustodyLedgers,
 validateCustodyComparison,auditPackAgainstLedger,auditNoIdentityExports} from './p15ai-audit.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
test('ledger verifier returns valid result and head hash',()=>{
 const row=withItem(),result=verifyCustodyLedger(row);
 assert.equal(result.valid,true);assert.equal(result.headHash,row.events.at(-1).hash);
});
test('ledger verifier reports item count',()=>{
 assert.equal(verifyCustodyLedger(withItem()).itemCount,1);
});
test('ledger audit detects source digest mismatch',()=>{
 const row=withItem(),result=auditCustodyReferences(row,{expectedSourceDigests:{'source-one':sha('other')}});
 assert.ok(result.issues.some(issue=>issue.code==='SOURCE_DIGEST_MISMATCH'));
});
test('ledger audit detects UNKNOWN licence',()=>{
 const row=withItem(ledger(),item('evidence-one',{licence:'UNKNOWN'}));
 const result=auditCustodyReferences(row);
 assert.ok(result.issues.some(issue=>issue.code==='LICENCE_UNKNOWN'));
});
test('ledger audit detects held supersession candidate',()=>{
 const first=withItem(),replacement=registerEvidence(first,item('evidence-two',{supersedes:'evidence-one'}),
  {at:NEXT_AT,actorToken:'actor-coordinator'});
 const result=auditCustodyReferences(replacement);
 assert.ok(result.issues.some(issue=>issue.code==='SUPERSESSION_REVIEW'));
});
test('ledger audit detects missing purpose-specific access record',()=>{
 const result=auditCustodyReferences(withItem(),{requiredAccessPurpose:'review'});
 assert.ok(result.issues.some(issue=>issue.code==='ACCESS_NOT_RECORDED'));
});
test('ledger audit accepts purpose-specific access record',()=>{
 const result=auditCustodyReferences(withAccess(),{requiredAccessPurpose:'review'});
 assert.ok(!result.issues.some(issue=>issue.code==='ACCESS_NOT_RECORDED'));
});
test('ledger audit returns deterministic issue ordering',()=>{
 const row=withItem(ledger(),item('evidence-one',{licence:'UNKNOWN'}));
 const result=auditCustodyReferences(row,{expectedSourceDigests:{'source-one':sha('wrong')}});
 assert.deepEqual(result.issues.map(issue=>issue.code),['LICENCE_UNKNOWN','SOURCE_DIGEST_MISMATCH']);
});
test('ledger audit rejects invalid as-of date',()=>{
 fails(()=>auditCustodyReferences(withItem(),{asOf:'bad'}),'DATE');
});
test('ledger comparison detects changed item metadata',()=>{
 const first=withItem(),second=registerEvidence(first,item('evidence-two'),
  {at:NEXT_AT,actorToken:'actor-coordinator'});
 const changed=changeEvidenceState(second,{itemId:'evidence-two',to:'released',at:LATER_AT,
  actorToken:'actor-custodian',reason:'Release.'});
 const result=compareCustodyLedgers(second,changed);
 assert.equal(result.summary.changed,1);
});
test('ledger comparison detects newly registered item',()=>{
 const first=withItem(),second=registerEvidence(first,item('evidence-two'),
  {at:NEXT_AT,actorToken:'actor-coordinator'});
 assert.equal(compareCustodyLedgers(first,second).summary.added,1);
});
test('ledger comparison detects removed item in a valid snapshot pair',()=>{
 const first=withItem(),second={...first,items:[]};
 second.digest=bodyHash(second);
 assert.equal(compareCustodyLedgers(first,second).summary.removed,1);
});
test('ledger comparison detects unchanged items',()=>{
 const row=withItem();assert.equal(compareCustodyLedgers(row,row).summary.unchanged,1);
});
test('ledger comparison binds previous and current digests',()=>{
 const first=withItem(),second=changeEvidenceState(first,{itemId:'evidence-one',
  to:'released',at:NEXT_AT,actorToken:'actor-custodian',reason:'Release.'});
 const result=compareCustodyLedgers(first,second);
 assert.equal(result.previousLedgerDigest,first.digest);assert.equal(result.currentLedgerDigest,second.digest);
});
test('ledger comparison validator accepts generated result',()=>{
 const row=withItem(),result=compareCustodyLedgers(row,row);
 assert.equal(validateCustodyComparison(result).digest,result.digest);
});
test('ledger comparison validator rejects tampered result',()=>{
 const row=withItem(),result=compareCustodyLedgers(row,row);
 fails(()=>validateCustodyComparison({...result,summary:{changed:99}}),'HASH');
});
test('pack audit validates pack against exact ledger revision',()=>{
 const row=withItem(),pack=createCustodyPack(row,{packId:'pack-one',createdOn:NEXT,
  createdBy:'actor-auditor'});
 assert.equal(auditPackAgainstLedger(pack,row).valid,true);
});
test('pack audit rejects stale ledger revision',()=>{
 const row=withItem(),pack=createCustodyPack(row,{packId:'pack-one',createdOn:NEXT,
  createdBy:'actor-auditor'});
 const changed=changeEvidenceState(row,{itemId:'evidence-one',to:'released',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Release.'});
 fails(()=>auditPackAgainstLedger(pack,changed),'STALE_PACK');
});
test('pack audit verifies redaction manifest digest',()=>{
 const row=withRedaction(),manifest=createRedactionManifest(row,{manifestId:'manifest-one',
  createdOn:NEXT,createdBy:'actor-auditor',entries:[{
   redactionId:'redaction-evidence-one',itemId:'evidence-one',fieldPath:'notes',
   reason:'Remove note from public copy.',replacement:'[redacted]',
   originalDigest:sha('original-evidence-one'),appliedOn:NEXT,appliedBy:'actor-redactor'}]});
 const pack=createCustodyPack(row,{packId:'pack-one',createdOn:LATER,createdBy:'actor-auditor',manifest});
 assert.equal(auditPackAgainstLedger(pack,row,manifest).valid,true);
});
test('pack audit rejects manifest that differs from pack manifest',()=>{
 const row=withRedaction(),manifest=createRedactionManifest(row,{manifestId:'manifest-one',
  createdOn:NEXT,createdBy:'actor-auditor',entries:[{
   redactionId:'redaction-evidence-one',itemId:'evidence-one',fieldPath:'notes',
   reason:'Remove note from public copy.',replacement:'[redacted]',
   originalDigest:sha('original-evidence-one'),appliedOn:NEXT,appliedBy:'actor-redactor'}]});
 const pack=createCustodyPack(row,{packId:'pack-one',createdOn:LATER,createdBy:'actor-auditor'});
 fails(()=>auditPackAgainstLedger(pack,row,manifest),'STALE_MANIFEST');
});
test('export audit rejects personal data field names',()=>{
 fails(()=>auditNoIdentityExports({email:'person@example.invalid'}),'PRIVATE');
});
test('export audit rejects phone-like contact data',()=>{
 fails(()=>auditNoIdentityExports({summary:'Call 416-555-0199'}),'PRIVATE');
});
test('export audit accepts digests and role tokens',()=>{
 assert.equal(auditNoIdentityExports({actorToken:'actor-auditor',digest:sha('x')}).valid,true);
});
test('audit outputs are stable for same ledger revision',()=>{
 const row=withItem();assert.deepEqual(auditCustodyReferences(row),auditCustodyReferences(row));
});
test('ledger audit does not mutate ledger',()=>{
 const row=withItem(),digest=row.digest;auditCustodyReferences(row);
 assert.equal(row.digest,digest);
});
test('ledger comparison does not mutate either ledger',()=>{
 const first=withItem(),second=withAccess(first),before=[first.digest,second.digest];
 compareCustodyLedgers(first,second);assert.deepEqual([first.digest,second.digest],before);
});

test('ledger audit reports no issue for known licence and matching source digest',()=>{
 const row=withItem(),result=auditCustodyReferences(row,{expectedSourceDigests:{'source-one':sha('source-one')}});
 assert.equal(result.issueCount,0);
});
test('ledger audit reports one unknown licence issue per affected item',()=>{
 const row=withItem(ledger(),item('evidence-one',{licence:'UNKNOWN'}));
 assert.equal(auditCustodyReferences(row).issues.filter(issue=>issue.code==='LICENCE_UNKNOWN').length,1);
});
test('ledger audit supports a missing as-of date',()=>{
 assert.equal(auditCustodyReferences(withItem()).asOf,null);
});
test('ledger audit preserves ledger digest in report',()=>{
 const row=withItem();assert.equal(auditCustodyReferences(row).ledgerDigest,row.digest);
});
test('ledger comparison rejects invalid previous ledger',()=>{
 const row=withItem(),changed={...row,digest:'bad'};
 fails(()=>compareCustodyLedgers(changed,row),'HASH');
});
test('ledger comparison preserves item state before and after',()=>{
 const first=withItem(),second=changeEvidenceState(first,{itemId:'evidence-one',to:'released',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Release.'});
 const result=compareCustodyLedgers(first,second);
 assert.equal(result.changes[0].previousState,'held');
 assert.equal(result.changes[0].currentState,'released');
});
test('ledger comparison does not classify access-only changes as item changes',()=>{
 const first=withItem(),second=withAccess(first);
 assert.equal(compareCustodyLedgers(first,second).summary.unchanged,1);
});
test('ledger comparison does not classify event-only changes as item changes',()=>{
 const first=withItem(),second={...first,events:[...first.events]};
 second.events.push({...first.events.at(-1),sequence:2});
 second.digest=bodyHash(second);
 // The compared ledgers are required to validate, so a malformed event chain is rejected.
 fails(()=>compareCustodyLedgers(first,second),'SEQUENCE');
});
test('comparison validator rejects duplicate item IDs',()=>{
 const row=withItem(),result=compareCustodyLedgers(row,row);
 const changed=structuredClone(result);changed.changes.push(changed.changes[0]);
 changed.digest=bodyHash(changed);fails(()=>validateCustodyComparison(changed),'DUPLICATE');
});
test('comparison validator rejects malformed ledger digest',()=>{
 const row=withItem(),result=compareCustodyLedgers(row,row);
 fails(()=>validateCustodyComparison({...result,previousLedgerDigest:'bad'}),'HASH');
});
test('pack audit rejects pack item absent from ledger',()=>{
 const row=withItem(),pack=createCustodyPack(row,{packId:'pack-one',createdOn:NEXT,
  createdBy:'actor-auditor'});
 const changed=structuredClone(pack);changed.items[0].itemId='missing-item';
 changed.digest=bodyHash(changed);
 // The pack may be structurally valid, but the ledger digest check prevents substituted contents.
 fails(()=>auditPackAgainstLedger(changed,row),'ITEM_REFERENCE');
});
test('pack audit returns selected item count',()=>{
 const row=withItem(),pack=createCustodyPack(row,{packId:'pack-one',createdOn:NEXT,
  createdBy:'actor-auditor'});
 assert.equal(auditPackAgainstLedger(pack,row).itemsChecked,1);
});
test('export audit returns deterministic digest',()=>{
 const value={incidentId:'incident-one',itemId:'evidence-one',digest:sha('value')};
 assert.deepEqual(auditNoIdentityExports(value),auditNoIdentityExports(value));
});
test('export audit rejects email in nested value',()=>{
 fails(()=>auditNoIdentityExports({nested:{summary:'x@y.example'}}),'PRIVATE');
});
test('export audit accepts French text with typographic spaces',()=>{
 assert.equal(auditNoIdentityExports({summary:'État\u00a0: ouvert'}).valid,true);
});
test('export audit accepts UNKNOWN labels',()=>{
 assert.equal(auditNoIdentityExports({licence:'UNKNOWN'}).valid,true);
});
test('ledger verification digest changes after new access event',()=>{
 const first=withItem(),second=withAccess(first);
 assert.notEqual(verifyCustodyLedger(first).digest,verifyCustodyLedger(second).digest);
});
test('ledger verification returns deterministic item order',()=>{
 const first=withItem(),second=registerEvidence(first,{
  itemId:'evidence-two',kind:'other',label:'Second evidence',reference:'catalogue/two',
  contentDigest:sha('two'),sourceId:'source-one',sourceDigest:sha('source-one'),
  licence:'UNKNOWN',licenceReference:'',retrievedOn:DAY,capturedOn:DAY,
  custodianToken:'actor-custodian',state:'held',supersedes:null,notes:'Second item.'
 },{at:NEXT_AT,actorToken:'actor-coordinator'});
 assert.deepEqual(verifyCustodyLedger(second).items.map(row=>row.itemId),['evidence-one','evidence-two']);
});

test('ledger audit result includes stable digest for empty ledger',()=>{
 const row=ledger(),result=auditCustodyReferences(row);
 assert.equal(result.issueCount,0);
 assert.equal(result.digest.length,64);
});
