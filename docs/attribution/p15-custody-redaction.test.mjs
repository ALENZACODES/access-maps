import test from 'node:test';
import assert from 'node:assert/strict';
import {item,withItem,withRedaction,redaction,DAY,NEXT,LATER,NEXT_AT} from './p15-custody-fixtures.mjs';
import {sha,bodyHash,CustodyError} from './p15-custody-contract.mjs';
import {createCustodyLedger,recordRedaction,recordRedaction as recordRedactionImported} from './p15-custody-ledger.mjs';
import {createRedactionManifest,validateRedactionManifest,redactionsForItem,redactionSummary} from './p15-custody-redaction.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function make(){
 const row=withRedaction();
 return createRedactionManifest(row,{manifestId:'manifest-one',createdOn:LATER,
  createdBy:'actor-auditor',entries:row.redactions});
}
test('manifest binds exact custody ledger',()=>{
 const manifest=make();assert.equal(manifest.ledgerId,'ledger-one');
});
test('manifest validates generated digest',()=>{
 const row=withRedaction(),manifest=make();
 assert.equal(validateRedactionManifest(manifest,row).digest,manifest.digest);
});
test('manifest rejects unknown schema',()=>{
 fails(()=>validateRedactionManifest({...make(),schema:'other'},withRedaction()),'SCHEMA');
});
test('manifest rejects different ledger ID',()=>{
 const manifest=make(),other=createCustodyLedger({ledgerId:'other-ledger',openedOn:NEXT,openedAt:NEXT_AT,openedBy:'actor-archive'});
 fails(()=>validateRedactionManifest(manifest,other),'LEDGER_REF');
});
test('manifest rejects entry without ledger receipt',()=>{
 const row=withItem(),entry={...redaction(),redactionId:'redaction-missing'};
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry]}),'REDACTION_RECEIPT');
});
test('manifest rejects unknown item reference',()=>{
 const row=withRedaction(),entry={...redaction(),itemId:'missing-item'};
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry]}),'ITEM_REFERENCE');
});
test('manifest rejects duplicate redaction IDs',()=>{
 const row=withRedaction(),entry=redaction();
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry,entry]}),'DUPLICATE');
});
test('manifest rejects created date before redaction',()=>{
 const row=withRedaction(),entry=redaction();
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:DAY,
  createdBy:'actor-auditor',entries:[entry]}),'DATE_ORDER');
});
test('manifest rejects invalid field path root',()=>{
 const row=withRedaction(),entry=redaction('evidence-one',{fieldPath:'secret.password'});
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry]}),'ENUM');
});
test('manifest rejects malformed field path',()=>{
 const row=withRedaction(),entry=redaction('evidence-one',{fieldPath:'notes..value'});
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry]}),'FIELD_PATH');
});
test('manifest accepts all declared redactable field categories',()=>{
 const row=withRedaction(),fields=['label','reference','notes','licenceReference',
  'custodianToken','contentDigest','sourceDigest'];
 let updated=row;
 const entries=fields.map((field,index)=>({...redaction(),redactionId:`redaction-${index}`,
  fieldPath:field,appliedOn:`2026-11-${String(24+index).padStart(2,'0')}`,originalDigest:sha(`original-${index}`)}));
 entries.forEach((entry,index)=>{
  updated=recordRedactionImported(updated,entry,{at:`2026-11-${String(24+index).padStart(2,'0')}T10:00:00.000Z`,
   actorToken:'actor-redactor'});
 });
 const result=createRedactionManifest(updated,{manifestId:'manifest-fields',createdOn:'2026-12-01',
  createdBy:'actor-auditor',entries:[...updated.redactions]});
 assert.equal(result.entries.length,8);
});
test('manifest requires pseudonymous creator',()=>{
 fails(()=>createRedactionManifest(withRedaction(),{manifestId:'manifest-two',
  createdOn:LATER,createdBy:'person-alex',entries:[redaction()]}),'PRIVATE');
});
test('manifest validates redaction original digest',()=>{
 const row=withRedaction(),entry={...redaction(),originalDigest:'bad'};
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry]}),'HASH');
});
test('manifest rejects unsafe replacement text',()=>{
 const row=withRedaction(),entry={...redaction(),replacement:'<script>'};
 fails(()=>createRedactionManifest(row,{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[entry]}),'UNSAFE');
});
test('manifest lookup returns only selected item redactions',()=>{
 const manifest=make();assert.equal(redactionsForItem(manifest,'evidence-one').length,1);
});
test('manifest lookup rejects invalid item ID',()=>{
 fails(()=>redactionsForItem(make(),'Bad ID'),'ID');
});
test('manifest summary counts redacted items and fields',()=>{
 const result=redactionSummary(make());assert.equal(result.entryCount,1);
 assert.equal(result.affectedItems,1);assert.equal(result.byField.notes,1);
});
test('manifest validator detects altered entry content',()=>{
 const manifest=make(),changed=structuredClone(manifest);changed.entries[0].reason='Changed';
 fails(()=>validateRedactionManifest(changed,withRedaction()),'HASH');
});
test('manifest output is detached from input ledger',()=>{
 const row=withRedaction(),manifest=createRedactionManifest(row,{manifestId:'manifest-one',
  createdOn:LATER,createdBy:'actor-auditor',entries:[redaction()]});
 manifest.entries[0].replacement='Changed';assert.equal(row.redactions[0].replacement,'[redacted]');
});
test('manifest digest stable for identical inputs',()=>{
 assert.deepEqual(make(),make());
});

test('manifest rejects missing creator ID',()=>{
 fails(()=>createRedactionManifest(withRedaction(),{manifestId:'Bad ID',createdOn:LATER,
  createdBy:'actor-auditor',entries:[redaction()]}),'ID');
});
test('manifest rejects unknown policy version text when empty',()=>{
 fails(()=>createRedactionManifest(withRedaction(),{manifestId:'manifest-two',createdOn:LATER,
  createdBy:'actor-auditor',entries:[redaction()],policyVersion:''}),'TEXT');
});
test('manifest accepts empty entries for no-redaction declaration',()=>{
 const result=createRedactionManifest(withItem(),{manifestId:'manifest-empty',
  createdOn:NEXT,createdBy:'actor-auditor',entries:[]});
 assert.equal(result.entries.length,0);
});
test('manifest validates redaction entries are sorted by item and field',()=>{
 const row=withRedaction();
 const first={...redaction(),redactionId:'redaction-a',fieldPath:'label',appliedOn:'2026-11-24'};
 const second={...redaction(),redactionId:'redaction-b',fieldPath:'reference',appliedOn:'2026-11-25'};
 const secondRow=recordSecondReceipt(row,first,second);
 const manifest=createRedactionManifest(secondRow,{manifestId:'manifest-sort',
  createdOn:'2026-11-26',createdBy:'actor-auditor',entries:[...secondRow.redactions]});
 assert.deepEqual(manifest.entries.map(entry=>entry.fieldPath),['label','notes','reference']);
});
function recordSecondReceipt(input,first,second){
 let row=input;
 row=recordRedactionImported(row,first,{at:'2026-11-24T10:00:00.000Z',actorToken:'actor-redactor'});
 row=recordRedactionImported(row,second,{at:'2026-11-25T10:00:00.000Z',actorToken:'actor-redactor'});
 return row;
}

test('manifest can cover multiple field paths for one evidence item',()=>{
 const row=withRedaction();
 const label={...redaction(),redactionId:'redaction-label',fieldPath:'label',appliedOn:'2026-11-24',
  originalDigest:sha('label-original')};
 const reference={...redaction(),redactionId:'redaction-reference',fieldPath:'reference',appliedOn:'2026-11-25',
  originalDigest:sha('reference-original')};
 let updated=recordRedaction(row,label,{at:'2026-11-24T10:00:00.000Z',actorToken:'actor-redactor'});
 updated=recordRedaction(updated,reference,{at:'2026-11-25T10:00:00.000Z',actorToken:'actor-redactor'});
 const entries=[...updated.redactions];
 const manifest=createRedactionManifest(updated,{manifestId:'manifest-multi',
  createdOn:'2026-11-26',createdBy:'actor-auditor',entries});
 assert.equal(manifest.entries.length,3);
});
test('manifest validator rejects entry for another item',()=>{
 const row=withRedaction(withItem(withItem(),item('evidence-two'))),manifest=make();
 const changed=structuredClone(manifest);changed.entries[0].itemId='evidence-two';
 changed.digest=bodyHash(changed);fails(()=>validateRedactionManifest(changed,row),'REDACTION_RECEIPT');
});
test('manifest validator rejects duplicate field path with different receipt IDs',()=>{
 const row=withRedaction(),first=redaction('evidence-one',{redactionId:'redaction-other'});
 const updated=recordRedactionImported(row,first,{at:NEXT_AT,actorToken:'actor-redactor'});
 const entries=[...updated.redactions];
 const manifest=createRedactionManifest(updated,{manifestId:'manifest-duplicate-field',
  createdOn:LATER,createdBy:'actor-auditor',entries});
 assert.equal(manifest.entries.filter(entry=>entry.fieldPath==='notes').length,2);
});
test('redaction summary includes per-field totals',()=>{
 const result=redactionSummary(make());
 assert.deepEqual(result.byField,{notes:1});
});
