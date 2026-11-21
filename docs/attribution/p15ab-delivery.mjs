import {fail,exact,id,date,text,hash,sha256,sha256Bytes,digestBody,copy,sorted,unique} from './p15ab-contract.mjs';
import {validateBlindPacket} from './p15ab-blind-review.mjs';

export const DELIVERY_SCHEMA='access-maps-review-packet-delivery/1';
export const DELIVERY_LEDGER_SCHEMA='access-maps-review-delivery-ledger/1';
const MAX_PACKET_BYTES=1024,MAX_TOTAL_BYTES=8*1024*1024,MAX_ATTEMPTS=3;
const STATUSES=['received','unreadable','declined'];
function safePath(value){
 fail(typeof value==='string'&&value.length<=240&&!value.startsWith('/')&&!value.includes('\\')&&
  value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.startsWith('.')),
  'PATH','Delivery path must remain package-relative.');return value;
}
function stablePacketBytes(packet){return new TextEncoder().encode(JSON.stringify(packet));}
export function createDeliveryManifest({deliveryId,createdOn,packets,maxBytes=MAX_TOTAL_BYTES}={}){
 id(deliveryId,'deliveryId');date(createdOn,'createdOn');
 fail(Array.isArray(packets)&&packets.length>0&&packets.length<=1000,'LIMIT','Delivery packet count is invalid.');
 fail(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=MAX_TOTAL_BYTES,'BYTE_LIMIT','Delivery byte limit is invalid.');
 const rows=packets.map(validateBlindPacket);unique(rows.map(row=>row.packetId),'packet IDs');
 const entries=rows.map(packet=>{
  const bytes=stablePacketBytes(packet);fail(bytes.byteLength<=MAX_PACKET_BYTES,'BYTE_LIMIT','A packet exceeds 1 MiB.');
  return {packetId:packet.packetId,blindReviewerId:packet.blindReviewerId,
   path:`packets/${packet.packetId}.json`,bytes:bytes.byteLength,sha256:sha256Bytes(bytes),
   packetDigest:packet.digest,attempt:1};
 });
 const totalBytes=entries.reduce((sum,row)=>sum+row.bytes,0);
 fail(totalBytes<=maxBytes,'BYTE_LIMIT','Delivery manifest exceeds total byte budget.');
 const manifest={schema:DELIVERY_SCHEMA,deliveryId,createdOn,entries:sorted(entries,row=>row.packetId),
  totals:{packets:entries.length,bytes:totalBytes,maxBytes},digest:''};
 manifest.digest=digestBody(manifest);return manifest;
}
export function validateDeliveryManifest(input){
 exact(input,['schema','deliveryId','createdOn','entries','totals','digest']);
 fail(input.schema===DELIVERY_SCHEMA,'SCHEMA','Unsupported delivery manifest.');
 id(input.deliveryId,'deliveryId');date(input.createdOn,'createdOn');
 fail(Array.isArray(input.entries)&&input.entries.length>0&&input.entries.length<=1000,'LIMIT','Delivery entries invalid.');
 unique(input.entries.map(row=>row.packetId),'delivery packet IDs');
 unique(input.entries.map(row=>row.path),'delivery paths');
 let total=0;
 for(const row of input.entries){
  exact(row,['packetId','blindReviewerId','path','bytes','sha256','packetDigest','attempt']);
  id(row.packetId,'packetId');id(row.blindReviewerId,'blindReviewerId');safePath(row.path);
  fail(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=MAX_PACKET_BYTES,'BYTE_LIMIT','Packet byte count invalid.');
  hash(row.sha256);hash(row.packetDigest);fail(Number.isSafeInteger(row.attempt)&&row.attempt>=1&&row.attempt<=MAX_ATTEMPTS,
   'ATTEMPT','Delivery attempt is invalid.');total+=row.bytes;
 }
 fail(total===input.totals.bytes&&input.totals.packets===input.entries.length&&
  Number.isSafeInteger(input.totals.maxBytes)&&total<=input.totals.maxBytes&&input.totals.maxBytes<=MAX_TOTAL_BYTES,
  'BYTE_LIMIT','Delivery totals are inconsistent.');
 fail(input.digest===digestBody(input),'HASH','Delivery manifest digest invalid.');
 return copy(input);
}
export function verifyDeliveryBytes(manifestInput,byteMap){
 const manifest=validateDeliveryManifest(manifestInput);
 fail(byteMap instanceof Map,'BYTES','Asset bytes must be supplied in a Map.');
 const results=[];
 for(const entry of manifest.entries){
  const bytes=byteMap.get(entry.path);
  fail(bytes instanceof Uint8Array,'BYTES_MISSING',`Missing packet bytes: ${entry.path}`);
  fail(bytes.byteLength===entry.bytes,'BYTE_COUNT',`Packet byte count differs: ${entry.path}`);
  fail(sha256Bytes(bytes)===entry.sha256,'HASH',`Packet bytes differ: ${entry.path}`);
  let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{fail(false,'JSON','Packet bytes are not valid UTF-8 JSON.');}
  const packet=validateBlindPacket(parsed);
  fail(packet.packetId===entry.packetId&&packet.digest===entry.packetDigest&&
   packet.blindReviewerId===entry.blindReviewerId,'PACKET_MISMATCH','Packet identity differs from manifest.');
  results.push({packetId:entry.packetId,path:entry.path,valid:true,sha256:entry.sha256});
 }
 return {valid:true,deliveryId:manifest.deliveryId,verified:results.length,bytes:manifest.totals.bytes,
  digest:sha256(results)};
}
export function createDeliveryLedger({ledgerId,manifest,createdBy}={}){
 id(ledgerId,'ledgerId');id(createdBy,'createdBy');
 const value={schema:DELIVERY_LEDGER_SCHEMA,ledgerId,deliveryId:validateDeliveryManifest(manifest).deliveryId,
  manifestDigest:manifest.digest,createdBy,events:[],digest:''};
 value.digest=digestBody(value);return value;
}
function appendDeliveryEvent(ledger,type,payload){
 const previous=ledger.events.at(-1),sequence=ledger.events.length+1;
 const event={sequence,type,payload:copy(payload),previousHash:previous?.hash??'0'.repeat(64),hash:''};
 event.hash=sha256((({hash,...rest})=>rest)(event));ledger.events.push(event);ledger.digest=digestBody(ledger);return event;
}
export function recordDeliveryReceipt(input,manifestInput,{receiptId,packetId,blindReviewerId,status,receivedOn,
 attempt,reason='UNKNOWN'}={}){
 const ledger=validateDeliveryLedger(input),manifest=validateDeliveryManifest(manifestInput);
 fail(ledger.manifestDigest===manifest.digest,'STALE','Delivery manifest changed.');
 id(receiptId,'receiptId');id(packetId,'packetId');id(blindReviewerId,'blindReviewerId');date(receivedOn,'receivedOn');
 fail(STATUSES.includes(status),'RECEIPT_STATUS','Delivery receipt status invalid.');
 text(reason,'receipt reason',{max:500});
 const entry=manifest.entries.find(row=>row.packetId===packetId);
 fail(entry&&entry.blindReviewerId===blindReviewerId,'PACKET_REF','Receipt does not match a manifest entry.');
 fail(entry.attempt===attempt,'ATTEMPT','Receipt attempt does not match the current packet delivery.');
 fail(!ledger.events.some(row=>row.type==='receipt'&&row.payload.receiptId===receiptId),'DUPLICATE','Receipt ID already exists.');
 fail(!ledger.events.some(row=>row.type==='receipt'&&row.payload.packetId===packetId&&row.payload.attempt===attempt),
  'DUPLICATE','A receipt already exists for this packet attempt.');
 const next=copy(ledger);appendDeliveryEvent(next,'receipt',{receiptId,packetId,blindReviewerId,status,
  receivedOn,attempt,reason});return next;
}
export function reissueUnreadablePacket(manifestInput,ledgerInput,{packetId,reissuedOn,reason}={}){
 const manifest=validateDeliveryManifest(manifestInput),ledger=validateDeliveryLedger(ledgerInput);
 fail(ledger.manifestDigest===manifest.digest,'STALE','Delivery ledger is bound to another manifest.');
 id(packetId,'packetId');date(reissuedOn,'reissuedOn');text(reason,'reissue reason',{max:500});
 const entry=manifest.entries.find(row=>row.packetId===packetId);fail(entry,'PACKET_REF','Packet is absent from manifest.');
 const receipts=ledger.events.filter(row=>row.type==='receipt'&&row.payload.packetId===packetId);
 const latest=receipts.at(-1);
 fail(latest&&latest.payload.status==='unreadable','REISSUE_STATE','Only an unreadable packet can be reissued.');
 fail(entry.attempt<MAX_ATTEMPTS,'ATTEMPT_LIMIT','Maximum packet delivery attempts reached.');
 const next=copy(manifest),target=next.entries.find(row=>row.packetId===packetId);
 target.attempt+=1;target.path=`packets/${packetId}-attempt-${target.attempt}.json`;
 next.digest=digestBody(next);
 const nextLedger=copy(ledger);nextLedger.manifestDigest=next.digest;
 appendDeliveryEvent(nextLedger,'reissue',{packetId,previousAttempt:entry.attempt,nextAttempt:target.attempt,
  previousPath:entry.path,nextPath:target.path,reissuedOn,reason});
 return {manifest:next,ledger:nextLedger,reissue:{packetId,previousAttempt:entry.attempt,nextAttempt:target.attempt,
  previousPath:entry.path,nextPath:target.path,reissuedOn,reason,digest:sha256({packetId,
   previousAttempt:entry.attempt,nextAttempt:target.attempt,reissuedOn,reason})}};
}
export function validateDeliveryLedger(input){
 exact(input,['schema','ledgerId','deliveryId','manifestDigest','createdBy','events','digest']);
 fail(input.schema===DELIVERY_LEDGER_SCHEMA,'SCHEMA','Unsupported delivery ledger.');
 id(input.ledgerId,'ledgerId');id(input.deliveryId,'deliveryId');hash(input.manifestDigest);id(input.createdBy,'createdBy');
 fail(Array.isArray(input.events)&&input.events.length<=10000,'LIMIT','Delivery event list too large.');
 let previous='0'.repeat(64);const receipts=new Set(),attempts=new Map(),latestStatus=new Map();
 input.events.forEach((row,index)=>{
  exact(row,['sequence','type','payload','previousHash','hash']);
  fail(row.sequence===index+1&&['receipt','reissue'].includes(row.type),'EVENT','Delivery event sequence or type invalid.');
  hash(row.previousHash);hash(row.hash);
  fail(row.previousHash===previous&&row.hash===sha256((({hash,...rest})=>rest)(row)),'EVENT_HASH','Delivery event chain invalid.');
  if(row.type==='receipt'){
   exact(row.payload,['receiptId','packetId','blindReviewerId','status','receivedOn','attempt','reason']);
   id(row.payload.receiptId);id(row.payload.packetId);id(row.payload.blindReviewerId);
   fail(STATUSES.includes(row.payload.status),'RECEIPT_STATUS','Delivery status invalid.');
   date(row.payload.receivedOn);integerAttempt(row.payload.attempt);text(row.payload.reason,'receipt reason',{max:500});
   fail(!receipts.has(row.payload.receiptId),'DUPLICATE','Receipt identifier repeats.');receipts.add(row.payload.receiptId);
   const expectedAttempt=attempts.get(row.payload.packetId)??1;
   fail(row.payload.attempt===expectedAttempt,'ATTEMPT','Receipt attempt is not the active delivery attempt.');
   fail(!latestStatus.has(row.payload.packetId)||latestStatus.get(row.payload.packetId)==='unreadable',
    'DUPLICATE','A packet attempt already has a receipt.');
   latestStatus.set(row.payload.packetId,row.payload.status);
  }else{
   exact(row.payload,['packetId','previousAttempt','nextAttempt','previousPath','nextPath','reissuedOn','reason']);
   id(row.payload.packetId);integerAttempt(row.payload.previousAttempt);integerAttempt(row.payload.nextAttempt);
   safePath(row.payload.previousPath);safePath(row.payload.nextPath);date(row.payload.reissuedOn);
   text(row.payload.reason,'reissue reason',{max:500});
   const current=attempts.get(row.payload.packetId)??1;
   fail(latestStatus.get(row.payload.packetId)==='unreadable'&&row.payload.previousAttempt===current&&
    row.payload.nextAttempt===current+1&&row.payload.nextAttempt<=MAX_ATTEMPTS,
    'REISSUE_STATE','Reissue must follow an unreadable receipt and increment the attempt once.');
   attempts.set(row.payload.packetId,row.payload.nextAttempt);latestStatus.delete(row.payload.packetId);
  }
  previous=row.hash;
 });
 fail(input.digest===digestBody(input),'HASH','Delivery ledger digest invalid.');return copy(input);
}
function integerAttempt(value){fail(Number.isSafeInteger(value)&&value>=1&&value<=MAX_ATTEMPTS,'ATTEMPT','Delivery attempt invalid.');}
export function deliverySummary(manifestInput,ledgerInput){
 const manifest=validateDeliveryManifest(manifestInput),ledger=validateDeliveryLedger(ledgerInput);
 fail(manifest.deliveryId===ledger.deliveryId&&manifest.digest===ledger.manifestDigest,'STALE','Delivery ledger and manifest differ.');
 const receipts=ledger.events.filter(row=>row.type==='receipt').map(row=>row.payload),latest=new Map(),attempts=new Map();
 for(const row of ledger.events){if(row.type==='reissue')attempts.set(row.payload.packetId,row.payload.nextAttempt);else if(row.type==='receipt')latest.set(row.payload.packetId,row.payload);}
 for(const entry of manifest.entries)fail(entry.attempt===(attempts.get(entry.packetId)??1),
  'ATTEMPT','Manifest attempt does not match delivery history.');
 const counts={received:0,unreadable:0,declined:0,pending:0};
 for(const entry of manifest.entries){const row=latest.get(entry.packetId);if(!row)counts.pending++;
  else counts[row.status]++;}
 return {deliveryId:manifest.deliveryId,total:manifest.entries.length,counts,
  complete:counts.pending===0&&counts.unreadable===0,digest:sha256({deliveryId:manifest.deliveryId,counts})};
}
