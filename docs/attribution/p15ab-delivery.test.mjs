import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,conflicts,tasks,DAY,NEXT,LATER,HASH} from './p15ab-fixtures.mjs';
import {buildAssignmentPlan} from './p15ab-assign.mjs';
import {createBlindPackets} from './p15ab-blind-review.mjs';
import {createDeliveryManifest,validateDeliveryManifest,verifyDeliveryBytes,createDeliveryLedger,
 validateDeliveryLedger,recordDeliveryReceipt,reissueUnreadablePacket,deliverySummary} from './p15ab-delivery.mjs';
import {ReviewAssignmentError,sha256} from './p15ab-contract.mjs';
const policy={balanceWeight:30,specialtyWeight:5,maxAssignmentsPerGroup:10,allowPartial:true};
function packets(){
 const options={roster:roster(),conflicts:conflicts(),taskSet:tasks({count:1})};
 const plan=buildAssignmentPlan({planId:'plan-delivery',...options,asOf:DAY,seed:'delivery-seed',policy});
 return createBlindPackets(plan,{...options,issuedOn:DAY,expiresOn:LATER});
}
function manifest(){return createDeliveryManifest({deliveryId:'delivery-one',createdOn:DAY,packets:packets()});}
function bytes(value){return new TextEncoder().encode(JSON.stringify(value));}
function byteMap(value){return new Map(packets().map(packet=>[`packets/${packet.packetId}.json`,bytes(packet)]));}
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);

test('delivery manifest records packet byte sizes and digests',()=>{
 const value=manifest();assert.equal(validateDeliveryManifest(value).digest,value.digest);
 assert.equal(value.totals.packets,2);assert.ok(value.entries.every(row=>row.bytes>0));
});
test('delivery manifest rejects duplicate packet identifiers',()=>{
 const rows=packets();fails(()=>createDeliveryManifest({deliveryId:'delivery-two',createdOn:DAY,
  packets:[rows[0],rows[0]]}),'DUPLICATE');
});
test('delivery manifest enforces per-file byte ceiling',()=>{
 const rows=packets(),huge={...rows[0],brief:{en:'x'.repeat(500),fr:'y'.repeat(500)}};
 huge.digest=sha256((({digest,...rest})=>rest)(huge));
 fails(()=>createDeliveryManifest({deliveryId:'delivery-two',createdOn:DAY,packets:[huge]}),'BYTE_LIMIT');
});
test('delivery manifest enforces total byte budget',()=>{
 const rows=packets();fails(()=>createDeliveryManifest({deliveryId:'delivery-two',createdOn:DAY,
  packets:rows,maxBytes:1}),'BYTE_LIMIT');
});
test('delivery manifest digest detects tampering',()=>{
 const value=manifest(),copy=structuredClone(value);copy.entries[0].path='../escape';
 fails(()=>validateDeliveryManifest(copy),'PATH');
});
test('delivery byte verification checks every local asset',()=>{
 const value=manifest(),verified=verifyDeliveryBytes(value,byteMap(value));
 assert.equal(verified.valid,true);assert.equal(verified.verified,2);
});
test('delivery byte verification refuses missing packet bytes',()=>{
 const value=manifest();fails(()=>verifyDeliveryBytes(value,new Map()),'BYTES_MISSING');
});
test('delivery byte verification rejects byte count mismatch',()=>{
 const value=manifest(),map=byteMap(value),path=value.entries[0].path;
 map.set(path,new Uint8Array([1,2,3]));fails(()=>verifyDeliveryBytes(value,map),'BYTE_COUNT');
});
test('delivery byte verification rejects changed content with same declared byte count',()=>{
 const value=manifest(),map=byteMap(value),path=value.entries[0].path,original=map.get(path);
 const changed=new Uint8Array(original);changed[0]^=1;map.set(path,changed);
 fails(()=>verifyDeliveryBytes(value,map),'HASH');
});
test('delivery byte verification rejects valid JSON for a different packet',()=>{
 const value=manifest(),map=byteMap(value),path=value.entries[0].path,other=packets()[1];
 map.set(path,bytes(other));fails(()=>verifyDeliveryBytes(value,map),'HASH');
});
test('delivery ledger starts empty and is digest sealed',()=>{
 const row=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:manifest(),createdBy:'coordinator'});
 assert.equal(validateDeliveryLedger(row).digest,row.digest);
});
test('delivery receipt binds packet and blind reviewer token',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 const row=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'received',receivedOn:NEXT,attempt:1,reason:'Package opened'});
 assert.equal(row.events[0].payload.status,'received');
});
test('delivery receipt rejects an unknown packet ID',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 fails(()=>recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:'packet-missing',
  blindReviewerId:entry.blindReviewerId,status:'received',receivedOn:NEXT,attempt:1,reason:'Opened'}),'PACKET_REF');
});
test('delivery receipt rejects mismatched blind reviewer token',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 fails(()=>recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:'blind-other',status:'received',receivedOn:NEXT,attempt:1,reason:'Opened'}),'PACKET_REF');
});
test('delivery receipt rejects an attempt that differs from manifest',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 fails(()=>recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'received',receivedOn:NEXT,attempt:2,reason:'Opened'}),'ATTEMPT');
});
test('delivery receipt rejects duplicate receipt ID',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 const input={receiptId:'receipt-one',packetId:entry.packetId,blindReviewerId:entry.blindReviewerId,
  status:'received',receivedOn:NEXT,attempt:1,reason:'Opened'};
 const row=recordDeliveryReceipt(ledger,value,input);fails(()=>recordDeliveryReceipt(row,value,input),'DUPLICATE');
});
test('delivery receipt rejects second receipt for the same attempt',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 const first=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'received',receivedOn:NEXT,attempt:1,reason:'Opened'});
 fails(()=>recordDeliveryReceipt(first,value,{receiptId:'receipt-two',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'declined',receivedOn:NEXT,attempt:1,reason:'Declined'}),'DUPLICATE');
});
test('delivery summary reports pending receipts',()=>{
 const value=manifest(),ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 assert.equal(deliverySummary(value,ledger).counts.pending,2);
});
test('delivery summary counts each receipt status',()=>{
 const value=manifest(),ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 const [one,two]=value.entries;
 let next=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:one.packetId,
  blindReviewerId:one.blindReviewerId,status:'received',receivedOn:NEXT,attempt:1,reason:'Opened'});
 next=recordDeliveryReceipt(next,value,{receiptId:'receipt-two',packetId:two.packetId,
  blindReviewerId:two.blindReviewerId,status:'unreadable',receivedOn:NEXT,attempt:1,reason:'Unreadable'});
 const summary=deliverySummary(value,next);
 assert.equal(summary.counts.received,1);assert.equal(summary.counts.unreadable,1);
 assert.equal(summary.complete,false);
});
test('delivery ledger detects a modified event hash',()=>{
 const value=manifest(),ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 const entry=value.entries[0],next=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',
  packetId:entry.packetId,blindReviewerId:entry.blindReviewerId,status:'received',
  receivedOn:NEXT,attempt:1,reason:'Opened'});
 const changed=structuredClone(next);changed.events[0].payload.reason='changed';
 fails(()=>validateDeliveryLedger(changed),'EVENT_HASH');
});
test('delivery ledger cannot be used with another manifest revision',()=>{
 const value=manifest(),ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 const changed={...value,createdOn:NEXT};changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>recordDeliveryReceipt(ledger,changed,{receiptId:'receipt-one',packetId:value.entries[0].packetId,
  blindReviewerId:value.entries[0].blindReviewerId,status:'received',receivedOn:NEXT,attempt:1,reason:'Opened'}),'STALE');
});
test('unreadable delivery can be reissued with a new attempt and path',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 const received=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'unreadable',receivedOn:NEXT,attempt:1,reason:'Unreadable file'});
 const result=reissueUnreadablePacket(value,received,{packetId:entry.packetId,reissuedOn:NEXT,reason:'Re-exported'});
 assert.equal(result.manifest.entries.find(row=>row.packetId===entry.packetId).attempt,2);
 assert.notEqual(result.reissue.nextPath,entry.path);
 assert.equal(validateDeliveryLedger(result.ledger).manifestDigest,result.manifest.digest);
 assert.equal(deliverySummary(result.manifest,result.ledger).counts.pending,1);
});
test('reissue refuses a packet without unreadable receipt',()=>{
 const value=manifest(),ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 fails(()=>reissueUnreadablePacket(value,ledger,{packetId:value.entries[0].packetId,
  reissuedOn:NEXT,reason:'Retry'}),'REISSUE_STATE');
});
test('reissue is bounded to three attempts',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 let currentManifest=value,currentLedger=ledger;
 for(let attempt=1;attempt<=2;attempt++){
  currentLedger=recordDeliveryReceipt(currentLedger,currentManifest,{receiptId:`receipt-${attempt}`,
   packetId:entry.packetId,blindReviewerId:entry.blindReviewerId,status:'unreadable',
   receivedOn:NEXT,attempt,reason:'Unreadable'});
  const result=reissueUnreadablePacket(currentManifest,currentLedger,{packetId:entry.packetId,
   reissuedOn:NEXT,reason:'Retry'});currentManifest=result.manifest;currentLedger=result.ledger;
 }
 const last=currentManifest.entries.find(row=>row.packetId===entry.packetId);
 const lastLedger=recordDeliveryReceipt(currentLedger,currentManifest,{receiptId:'receipt-final',
  packetId:entry.packetId,blindReviewerId:entry.blindReviewerId,status:'unreadable',
  receivedOn:NEXT,attempt:last.attempt,reason:'Unreadable'});
 fails(()=>reissueUnreadablePacket(currentManifest,lastLedger,{packetId:entry.packetId,
  reissuedOn:NEXT,reason:'Retry again'}),'ATTEMPT_LIMIT');
});

test('a packet can be acknowledged on the second delivery attempt',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 const first=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'unreadable',receivedOn:NEXT,attempt:1,reason:'Unreadable'});
 const retry=reissueUnreadablePacket(value,first,{packetId:entry.packetId,reissuedOn:NEXT,reason:'Retry'});
 const second=recordDeliveryReceipt(retry.ledger,retry.manifest,{receiptId:'receipt-two',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'received',receivedOn:LATER,attempt:2,reason:'Opened'});
 assert.equal(deliverySummary(retry.manifest,second).counts.received,1);
});
test('reissue history is append-only and preserves the original receipt',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 const first=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'unreadable',receivedOn:NEXT,attempt:1,reason:'Unreadable'});
 const retry=reissueUnreadablePacket(value,first,{packetId:entry.packetId,reissuedOn:NEXT,reason:'Retry'});
 assert.deepEqual(retry.ledger.events.map(row=>row.type),['receipt','reissue']);
 assert.equal(retry.ledger.events[0].payload.receiptId,'receipt-one');
});
test('reissue rejects a changed packet identity',()=>{
 const value=manifest(),entry=value.entries[0],ledger=createDeliveryLedger({ledgerId:'ledger-delivery',
  manifest:value,createdBy:'coordinator'});
 const first=recordDeliveryReceipt(ledger,value,{receiptId:'receipt-one',packetId:entry.packetId,
  blindReviewerId:entry.blindReviewerId,status:'unreadable',receivedOn:NEXT,attempt:1,reason:'Unreadable'});
 fails(()=>reissueUnreadablePacket(value,first,{packetId:'packet-missing',reissuedOn:NEXT,reason:'Retry'}),'PACKET_REF');
});
test('delivery summary rejects a manifest with a forged attempt counter',()=>{
 const value=manifest(),ledger=createDeliveryLedger({ledgerId:'ledger-delivery',manifest:value,createdBy:'coordinator'});
 const changed=structuredClone(value);changed.entries[0].attempt=2;
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>deliverySummary(changed,ledger),'STALE');
});
test('delivery manifest keeps every path inside the local package',()=>{
 const value=manifest(),changed=structuredClone(value);changed.entries[0].path='../../outside.json';
 fails(()=>validateDeliveryManifest(changed),'PATH');
});
