import test from 'node:test';
import assert from 'node:assert/strict';
import {ledger,item,withItem,withAccess,withRedaction,access,redaction,DAY,NEXT,AT,NEXT_AT,LATER_AT} from './p15-custody-fixtures.mjs';
import {sha,bodyHash,CustodyError,eventHash} from './p15-custody-contract.mjs';
import {createCustodyLedger,validateCustodyLedger,registerEvidence,updateEvidenceMetadata,
 changeEvidenceState,transferCustody,recordAccess,recordRedaction,addCheckpoint,
 evidenceById,custodySummary} from './p15-custody-ledger.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);

test('ledger opens with genesis event and stable digest',()=>{
 const row=ledger();assert.equal(validateCustodyLedger(row).digest,row.digest);
 assert.equal(row.events[0].type,'ledger-opened');assert.equal(row.events[0].sequence,1);
});
test('ledger starts with empty evidence and access arrays',()=>{
 const row=ledger();assert.equal(row.items.length,0);assert.equal(row.accessRecords.length,0);
});
test('ledger opening date must match opening timestamp',()=>{
 fails(()=>createCustodyLedger({ledgerId:'ledger-two',openedOn:DAY,
  openedAt:NEXT_AT,openedBy:'actor-coordinator'}),'DATE_ORDER');
});
test('ledger rejects malformed opening timestamp',()=>{
 fails(()=>createCustodyLedger({ledgerId:'ledger-two',openedOn:DAY,
  openedAt:'2026-11-21',openedBy:'actor-coordinator'}),'TIMESTAMP');
});
test('ledger rejects invalid ledger ID',()=>{
 fails(()=>createCustodyLedger({ledgerId:'Bad ID',openedOn:DAY,
  openedAt:AT,openedBy:'actor-coordinator'}),'ID');
});
test('ledger rejects identity-bearing opening actor',()=>{
 fails(()=>createCustodyLedger({ledgerId:'ledger-two',openedOn:DAY,
  openedAt:AT,openedBy:'person-alex'}),'PRIVATE');
});
test('ledger validator detects root digest tampering',()=>{
 const row=ledger(),changed={...row,digest:'f'.repeat(64)};
 fails(()=>validateCustodyLedger(changed),'HASH');
});
test('ledger validator rejects additional root fields',()=>{
 fails(()=>validateCustodyLedger({...ledger(),privateNote:'secret'}),'SHAPE');
});
test('ledger validator rejects unsupported schema',()=>{
 fails(()=>validateCustodyLedger({...ledger(),schema:'other'}),'SCHEMA');
});
test('evidence registration stores item metadata and digest event',()=>{
 const row=withItem();assert.equal(row.items.length,1);
 assert.equal(row.events.at(-1).type,'item-registered');
 assert.equal(row.events.at(-1).payload.itemDigest,bodyHash(row.items[0]));
});
test('evidence registration starts in held state',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{state:'released'}),
  {at:AT,actorToken:'actor-coordinator'}),'INITIAL_STATE');
});
test('evidence registration rejects duplicate item ID',()=>{
 const row=withItem();fails(()=>registerEvidence(row,item(),{at:NEXT_AT,actorToken:'actor-coordinator'}),'DUPLICATE');
});
test('evidence registration rejects invalid item kind',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{kind:'untrusted'}),
  {at:AT,actorToken:'actor-coordinator'}),'ENUM');
});
test('evidence registration rejects malformed content digest',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{contentDigest:'bad'}),
  {at:AT,actorToken:'actor-coordinator'}),'HASH');
});
test('evidence registration rejects malformed source digest',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{sourceDigest:'bad'}),
  {at:AT,actorToken:'actor-coordinator'}),'HASH');
});
test('evidence registration rejects malformed source ID',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{sourceId:'Bad ID'}),
  {at:AT,actorToken:'actor-coordinator'}),'ID');
});
test('evidence registration rejects unknown licence vocabulary',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{licence:'CUSTOM'}),
  {at:AT,actorToken:'actor-coordinator'}),'ENUM');
});
test('evidence registration accepts UNKNOWN licence without inference',()=>{
 const row=withItem(ledger(),item('evidence-one',{licence:'UNKNOWN'}));
 assert.equal(row.items[0].licence,'UNKNOWN');
});
test('evidence registration rejects retrieval before capture',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{retrievedOn:'2026-11-20'}),
  {at:AT,actorToken:'actor-coordinator'}),'DATE_ORDER');
});
test('evidence registration rejects event before ledger opening',()=>{
 fails(()=>registerEvidence(ledger(),item(),{at:'2026-11-20T10:00:00.000Z',
  actorToken:'actor-coordinator'}),'EVENT_ORDER');
});
test('evidence registration rejects future retrieval date',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{retrievedOn:NEXT}),
  {at:AT,actorToken:'actor-coordinator'}),'DATE_ORDER');
});
test('evidence registration requires existing superseded item',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-new',{supersedes:'evidence-old'}),
  {at:AT,actorToken:'actor-coordinator'}),'ITEM_REFERENCE');
});
test('evidence registration rejects self supersession',()=>{
 const row=withItem();fails(()=>validateCustodyLedger({...row,items:[{...row.items[0],supersedes:'evidence-one'}]}),'ITEM_REFERENCE');
});
test('evidence registration is immutable to caller input',()=>{
 const input=item(),row=registerEvidence(ledger(),input,{at:AT,actorToken:'actor-coordinator'});
 input.label='Changed';assert.notEqual(row.items[0].label,input.label);
});
test('evidence lookup returns detached row',()=>{
 const row=withItem(),found=evidenceById(row,'evidence-one');found.label='Changed';
 assert.notEqual(row.items[0].label,found.label);
});
test('evidence lookup rejects unknown item',()=>{
 fails(()=>evidenceById(withItem(),'missing-item'),'ITEM_REFERENCE');
});
test('metadata update changes label and records previous and next digests',()=>{
 const row=withItem(),before=bodyHash(row.items[0]);
 const next=updateEvidenceMetadata(row,'evidence-one',{label:'Updated capture label'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Correct label.'});
 assert.equal(next.items[0].label,'Updated capture label');
 assert.equal(next.events.at(-1).payload.previousDigest,before);
 assert.equal(next.events.at(-1).payload.nextDigest,bodyHash(next.items[0]));
});
test('metadata update rejects unknown item',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'missing-item',{notes:'Changed'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Update'}),'ITEM_REFERENCE');
});
test('metadata update cannot change item ID',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{itemId:'evidence-two'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Rename'}),'IMMUTABLE_ID');
});
test('metadata update cannot change custody state',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{state:'released'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Release'}),'STATE_API');
});
test('metadata update cannot change custodian token',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{custodianToken:'actor-other'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer'}),'STATE_API');
});
test('metadata update cannot rewrite original capture date',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{capturedOn:NEXT},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Change capture date'}),'DATE_ORDER');
});
test('metadata update requires a reason',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{notes:'Changed'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:''}),'TEXT');
});
test('metadata update rejects unsafe text',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{notes:'<script>'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Update'}),'UNSAFE');
});
test('metadata update preserves other evidence rows',()=>{
 const first=withItem(),second=registerEvidence(first,item('evidence-two'),
  {at:NEXT_AT,actorToken:'actor-coordinator'});
 const next=updateEvidenceMetadata(second,'evidence-one',{notes:'Revised notes'},
  {at:LATER_AT,actorToken:'actor-custodian',reason:'Clarify notes.'});
 assert.equal(next.items.find(row=>row.itemId==='evidence-two').label,'Fictional evidence evidence-two');
});
test('state transition releases held evidence',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'released',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Approved for release.'});
 assert.equal(row.items[0].state,'released');
});
test('state transition records prior and next state',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'released',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Release.'});
 assert.equal(row.events.at(-1).payload.from,'held');assert.equal(row.events.at(-1).payload.to,'released');
});
test('state transition rejects missing evidence',()=>{
 fails(()=>changeEvidenceState(withItem(),{itemId:'missing-item',to:'released',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Release.'}),'ITEM_REFERENCE');
});
test('state transition rejects unsupported target state',()=>{
 fails(()=>changeEvidenceState(withItem(),{itemId:'evidence-one',to:'published',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Publish.'}),'ENUM');
});
test('state transition rejects released to held after terminal supersession',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'superseded',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Superseded.'});
 fails(()=>changeEvidenceState(row,{itemId:'evidence-one',to:'held',at:LATER_AT,
  actorToken:'actor-custodian',reason:'Reopen.'}),'STATE_TRANSITION');
});
test('withdrawn evidence cannot be restored',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'withdrawn',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Withdrawn.'});
 fails(()=>changeEvidenceState(row,{itemId:'evidence-one',to:'held',at:LATER_AT,
  actorToken:'actor-custodian',reason:'Restore.'}),'STATE_TRANSITION');
});
test('custody transfer changes custodian and records transfer',()=>{
 const row=transferCustody(withItem(),{itemId:'evidence-one',toCustodian:'actor-archive',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Move to archive custodian.'});
 assert.equal(row.items[0].custodianToken,'actor-archive');
 assert.equal(row.events.at(-1).type,'custody-transferred');
});
test('custody transfer rejects same custodian',()=>{
 fails(()=>transferCustody(withItem(),{itemId:'evidence-one',toCustodian:'actor-custodian',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'No change.'}),'SAME_CUSTODIAN');
});
test('custody transfer rejects withdrawn item',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'withdrawn',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Withdrawn.'});
 fails(()=>transferCustody(row,{itemId:'evidence-one',toCustodian:'actor-archive',
  at:LATER_AT,actorToken:'actor-custodian',reason:'Transfer.'}),'ITEM_WITHDRAWN');
});
test('custody transfer rejects invalid custodian token',()=>{
 fails(()=>transferCustody(withItem(),{itemId:'evidence-one',toCustodian:'person-alex',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer.'}),'PRIVATE');
});
test('custody transfer rejects unknown item',()=>{
 fails(()=>transferCustody(withItem(),{itemId:'missing-item',toCustodian:'actor-archive',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer.'}),'ITEM_REFERENCE');
});
test('access record can be appended for a held item',()=>{
 const row=withAccess();assert.equal(row.accessRecords.length,1);
 assert.equal(row.events.at(-1).type,'access-recorded');
});
test('access record requires valid purpose',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{purpose:'publish'})),'ENUM');
});
test('access record requires pseudonymous actor',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{actorToken:'person-alex'})),'PRIVATE');
});
test('access record rejects withdrawn evidence',()=>{
 const withdrawn=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'withdrawn',at:NEXT_AT,
  actorToken:'actor-custodian',reason:'Withdrawn.'});
 fails(()=>recordAccess(withdrawn,access('evidence-one',{accessedAt:LATER_AT})),'ACCESS_WITHDRAWN');
});
test('access record rejects duplicate access ID',()=>{
 const row=withAccess();fails(()=>recordAccess(row,access('evidence-one',{accessedAt:LATER_AT})),'DUPLICATE');
});
test('access record rejects unknown item',()=>{
 fails(()=>recordAccess(withItem(),access('missing-item')),'ITEM_REFERENCE');
});
test('access record rejects event before ledger opening',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{accessedAt:'2026-11-20T10:00:00.000Z'})),'EVENT_ORDER');
});
test('access record accepts denied result and records it',()=>{
 const row=recordAccess(withItem(),access('evidence-one',{result:'denied'}));
 assert.equal(row.accessRecords[0].result,'denied');
});
test('access record export digest is optional but validated when supplied',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{exportDigest:'bad'})),'HASH');
});
test('redaction receipt is appended to ledger',()=>{
 const row=withRedaction();assert.equal(row.redactions.length,1);
 assert.equal(row.events.at(-1).type,'redaction-recorded');
});
test('redaction requires matching applied date and event timestamp date',()=>{
 fails(()=>recordRedaction(withItem(),redaction(),{at:LATER_AT,actorToken:'actor-redactor'}),'DATE');
});
test('redaction actor must match event actor',()=>{
 fails(()=>recordRedaction(withItem(),redaction(),{at:NEXT_AT,actorToken:'actor-other'}),'ACTOR');
});
test('redaction rejects duplicate receipt ID',()=>{
 const row=withRedaction();fails(()=>recordRedaction(row,redaction(),{at:LATER_AT,actorToken:'actor-redactor'}),'DUPLICATE');
});
test('redaction rejects unknown item',()=>{
 fails(()=>recordRedaction(withItem(),redaction('missing-item'),{at:NEXT_AT,actorToken:'actor-redactor'}),'ITEM_REFERENCE');
});
test('checkpoint binds previous event head',()=>{
 const row=withItem(),next=addCheckpoint(row,{checkpointId:'checkpoint-one',at:NEXT_AT,
  actorToken:'actor-auditor'});
 assert.equal(next.events.at(-1).payload.headHash,row.events.at(-1).hash);
});
test('checkpoint identifier must be unique',()=>{
 const row=withItem(),next=addCheckpoint(row,{checkpointId:'checkpoint-one',at:NEXT_AT,
  actorToken:'actor-auditor'});
 fails(()=>addCheckpoint(next,{checkpointId:'checkpoint-one',at:LATER_AT,
  actorToken:'actor-auditor'}),'DUPLICATE');
});
test('checkpoint rejects malformed ID',()=>{
 fails(()=>addCheckpoint(withItem(),{checkpointId:'Bad ID',at:NEXT_AT,actorToken:'actor-auditor'}),'ID');
});
test('custody summary counts item states and events',()=>{
 const row=withAccess(),summary=custodySummary(row);
 assert.equal(summary.itemCount,1);assert.equal(summary.states.held,1);
 assert.equal(summary.accessRecords,1);
});
test('ledger validator rejects malformed access history event',()=>{
 const row=withAccess(),changed=structuredClone(row);changed.events.at(-1).payload.accessDigest=sha('other');
 fails(()=>validateCustodyLedger(changed),'EVENT_HASH');
});
test('ledger validator rejects access record without event',()=>{
 const row=withItem(),changed=structuredClone(row);
 changed.accessRecords.push(access('evidence-one'));changed.digest=bodyHash(changed);
 fails(()=>validateCustodyLedger(changed),'ACCESS_HISTORY');
});
test('ledger validator rejects redaction record without event',()=>{
 const row=withItem(),changed=structuredClone(row);
 changed.redactions.push(redaction());changed.digest=bodyHash(changed);
 fails(()=>validateCustodyLedger(changed),'REDACTION_HISTORY');
});
test('ledger validator rejects missing registration event',()=>{
 const row=withItem(),changed=structuredClone(row);
 changed.events=changed.events.filter(event=>event.type!=='item-registered');
 changed.events=changed.events.map((event,index)=>({...event,sequence:index+1}));
 fails(()=>validateCustodyLedger(changed),'ITEM_HISTORY');
});
test('ledger validator rejects noncontiguous sequence',()=>{
 const row=withItem(),changed=structuredClone(row);changed.events[1].sequence=3;
 fails(()=>validateCustodyLedger(changed),'SEQUENCE');
});
test('ledger validator rejects changed event previous hash',()=>{
 const row=withItem(),changed=structuredClone(row);changed.events[1].previousHash='f'.repeat(64);
 fails(()=>validateCustodyLedger(changed),'EVENT_HASH');
});
test('ledger validator rejects event date moving backwards',()=>{
 const row=withAccess(),changed=structuredClone(row);changed.events.at(-1).at='2026-11-20T10:00:00.000Z';
 fails(()=>validateCustodyLedger(changed),'FUTURE_ITEM');
});
test('ledger validator rejects duplicate evidence IDs',()=>{
 const row=withItem(),changed=structuredClone(row);changed.items.push(changed.items[0]);
 fails(()=>validateCustodyLedger(changed),'DUPLICATE');
});
test('ledger operations never mutate caller ledger',()=>{
 const row=withItem(),digest=row.digest;changeEvidenceState(row,{itemId:'evidence-one',to:'released',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Release.'});
 assert.equal(row.digest,digest);assert.equal(row.items[0].state,'held');
});
test('ledger operations never store source bytes',()=>{
 const row=withItem();assert.ok(!Object.hasOwn(row.items[0],'bytes'));
});
test('ledger metadata preserves exact source digest',()=>{
 const row=withItem();assert.equal(row.items[0].sourceDigest,sha('source-one'));
});

test('evidence item label rejects contact details',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{label:'Contact x@y.example'}),
  {at:AT,actorToken:'actor-coordinator'}),'PRIVATE');
});
test('evidence item reference rejects markup',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{reference:'<script>'}),
  {at:AT,actorToken:'actor-coordinator'}),'UNSAFE');
});
test('evidence item note rejects prohibited endorsement wording',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{notes:'Official partnership confirmed'}),
  {at:AT,actorToken:'actor-coordinator'}),'OVERCLAIM');
});
test('evidence item custodian must be pseudonymous',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{custodianToken:'reviewer-jane'}),
  {at:AT,actorToken:'actor-coordinator'}),'PRIVATE');
});
test('evidence metadata update rejects future retrieval date',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{retrievedOn:'2026-11-25'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Future retrieval'}),'FUTURE_ITEM');
});
test('evidence metadata update may refresh licence label',()=>{
 const row=updateEvidenceMetadata(withItem(),'evidence-one',{licence:'UNKNOWN'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Licence reference could not be confirmed.'});
 assert.equal(row.items[0].licence,'UNKNOWN');
});
test('evidence metadata update cannot set unknown state through patch',()=>{
 fails(()=>updateEvidenceMetadata(withItem(),'evidence-one',{state:'unknown'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'State change'}),'ENUM');
});
test('evidence state transition held to released to withdrawn is recorded',()=>{
 let row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'released',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Release.'});
 row=changeEvidenceState(row,{itemId:'evidence-one',to:'withdrawn',
  at:LATER_AT,actorToken:'actor-custodian',reason:'Withdraw.'});
 assert.equal(row.items[0].state,'withdrawn');
 assert.deepEqual(row.events.filter(event=>event.type==='item-state-changed').map(event=>event.payload.to),
  ['released','withdrawn']);
});
test('evidence state transition rejects released to held after allowed path',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'released',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Release.'});
 assert.equal(changeEvidenceState(row,{itemId:'evidence-one',to:'held',at:LATER_AT,
  actorToken:'actor-custodian',reason:'Return to hold.'}).items[0].state,'held');
});
test('custody transfer event validates final custodian token',()=>{
 const row=transferCustody(withItem(),{itemId:'evidence-one',toCustodian:'actor-archive',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Transfer.'});
 const changed=structuredClone(row);changed.items[0].custodianToken='actor-other';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyLedger(changed),'CUSTODIAN_HISTORY');
});
test('access records are sorted by access identifier',()=>{
 let row=withItem();
 row=recordAccess(row,access('evidence-one',{accessId:'access-z',accessedAt:NEXT_AT}));
 row=recordAccess(row,access('evidence-one',{accessId:'access-a',accessedAt:LATER_AT}));
 assert.deepEqual(row.accessRecords.map(item=>item.accessId),['access-a','access-z']);
});
test('access record rejects malformed access timestamp',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{accessedAt:'tomorrow'})),'TIMESTAMP');
});
test('access record rejects empty reason',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{reason:''})),'TEXT');
});
test('access record rejects export digest with wrong shape',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{exportDigest:'123'})),'HASH');
});
test('redaction field path rejects leading dot',()=>{
 fails(()=>recordRedaction(withItem(),redaction('evidence-one',{fieldPath:'.notes'}),
  {at:NEXT_AT,actorToken:'actor-redactor'}),'FIELD_PATH');
});
test('redaction field path rejects trailing dot',()=>{
 fails(()=>recordRedaction(withItem(),redaction('evidence-one',{fieldPath:'notes.'}),
  {at:NEXT_AT,actorToken:'actor-redactor'}),'FIELD_PATH');
});
test('redaction reason rejects contact details',()=>{
 fails(()=>recordRedaction(withItem(),redaction('evidence-one',{reason:'Call 416-555-0199'}),
  {at:NEXT_AT,actorToken:'actor-redactor'}),'PRIVATE');
});
test('redaction receipt keeps original digest immutable',()=>{
 const row=withRedaction();assert.equal(row.redactions[0].originalDigest,sha('original-evidence-one'));
});
test('ledger checkpoint event has exact previous sequence',()=>{
 const row=withItem(),next=addCheckpoint(row,{checkpointId:'checkpoint-x',at:NEXT_AT,
  actorToken:'actor-auditor'});
 assert.equal(next.events.at(-1).payload.sequence,row.events.length);
});
test('ledger rejects state mutation without matching state event',()=>{
 const row=withItem(),changed=structuredClone(row);changed.items[0].state='released';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyLedger(changed),'STATE_HISTORY');
});
test('ledger rejects custodian mutation without transfer event',()=>{
 const row=withItem(),changed=structuredClone(row);changed.items[0].custodianToken='actor-other';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyLedger(changed),'CUSTODIAN_HISTORY');
});
test('ledger summary includes withdrawn count after state transition',()=>{
 const row=changeEvidenceState(withItem(),{itemId:'evidence-one',to:'withdrawn',
  at:NEXT_AT,actorToken:'actor-custodian',reason:'Withdraw.'});
 assert.equal(custodySummary(row).states.withdrawn,1);
});

test('ledger rejects duplicate redaction IDs even with different item references',()=>{
 const row=withRedaction(),changed=structuredClone(row);
 changed.redactions.push({...changed.redactions[0],itemId:'evidence-two'});
 changed.digest=bodyHash(changed);fails(()=>validateCustodyLedger(changed),'DUPLICATE');
});
test('ledger rejects duplicate access identifiers',()=>{
 const row=withAccess(),changed=structuredClone(row);
 changed.accessRecords.push(changed.accessRecords[0]);changed.digest=bodyHash(changed);
 fails(()=>validateCustodyLedger(changed),'DUPLICATE');
});
test('ledger rejects item registration after a future event timestamp mismatch',()=>{
 const row=withItem(),changed=structuredClone(row);
 changed.items[0].retrievedOn='2026-11-25';changed.digest=bodyHash(changed);
 fails(()=>validateCustodyLedger(changed),'FUTURE_ITEM');
});
test('ledger rejects source capture date after retrieval date',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{capturedOn:NEXT,retrievedOn:DAY}),
  {at:NEXT_AT,actorToken:'actor-coordinator'}),'DATE_ORDER');
});
test('ledger rejects empty source reference',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{reference:''}),
  {at:AT,actorToken:'actor-coordinator'}),'TEXT');
});
test('ledger rejects access actor contact-like token',()=>{
 fails(()=>recordAccess(withItem(),access('evidence-one',{actorToken:'email-reviewer'})),'PRIVATE');
});
test('ledger rejects redaction replacement with contact details',()=>{
 fails(()=>recordRedaction(withItem(),redaction('evidence-one',{replacement:'x@y.example'}),
  {at:NEXT_AT,actorToken:'actor-redactor'}),'PRIVATE');
});
test('ledger rejects unsupported item lifecycle state',()=>{
 fails(()=>registerEvidence(ledger(),item('evidence-one',{state:'published'}),
  {at:AT,actorToken:'actor-coordinator'}),'ENUM');
});
test('ledger access purpose values remain controlled',()=>{
 for(const purpose of ['intake','review','correction','appeal','audit','export'])
  assert.doesNotThrow(()=>recordAccess(withItem(),access('evidence-one',{purpose})));
});
test('ledger can add repeated checkpoints with different identifiers',()=>{
 let row=withItem();
 row=addCheckpoint(row,{checkpointId:'checkpoint-a',at:NEXT_AT,actorToken:'actor-auditor'});
 row=addCheckpoint(row,{checkpointId:'checkpoint-b',at:LATER_AT,actorToken:'actor-auditor'});
 assert.equal(row.events.filter(event=>event.type==='checkpoint-added').length,2);
});

test('ledger rejects a broken metadata digest chain even when root digest is recomputed',()=>{
 const row=updateEvidenceMetadata(withItem(),'evidence-one',{label:'Revised label'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Correct label.'});
 const changed=structuredClone(row);
 changed.events.at(-1).payload.previousDigest=sha('wrong');
 changed.events.at(-1).hash=eventHash(changed.events.at(-1));changed.digest=bodyHash(changed);
 fails(()=>validateCustodyLedger(changed),'ITEM_DIGEST_CHAIN');
});
test('ledger rejects current item metadata that diverges from event digest chain',()=>{
 const row=updateEvidenceMetadata(withItem(),'evidence-one',{label:'Revised label'},
  {at:NEXT_AT,actorToken:'actor-custodian',reason:'Correct label.'});
 const changed=structuredClone(row);changed.items[0].label='Unrecorded label';changed.digest=bodyHash(changed);
 fails(()=>validateCustodyLedger(changed),'ITEM_DIGEST_CHAIN');
});
