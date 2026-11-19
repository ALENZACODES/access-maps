import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTierLedger, parseTierLedgerJson, parseLedgerRecord, parseLedgerSurface, serializeTierLedger, summarizeTiers, surfaceRecordIndex, LedgerInputError, LEDGER_SCHEMA, MAX_DOCUMENT_BYTES } from './tier-ledger.mjs';
import { ledger,record,surface } from './tier-fixtures.mjs';
const clone = value => structuredClone(value);
const fails = (value, pattern) => assert.throws(()=>parseTierLedger(value),pattern??LedgerInputError);

test('the fixture conforms to exact contract and preserves UNKNOWN',()=>{
  const result=parseTierLedger(ledger());
  assert.equal(result.schema,LEDGER_SCHEMA);
  assert.equal(result.records[0].sourceDate,'UNKNOWN');
  assert.equal(result.records[0].tier,'primary');
  assert.equal(result.surfaces[0].targetPx,44);
});
test('record parsing is deterministic and frozen',()=>{
  const result=parseLedgerRecord(record());
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(result,record());
});
test('surface parsing freezes nested id lists',()=>{
  const result=parseLedgerSurface(surface());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.recordIds));
});
test('full serialisation round-trips without dates or permissions inferred',()=>{
  const original=ledger();
  const copied=parseTierLedgerJson(serializeTierLedger(original));
  assert.deepEqual(copied,original);
});
test('exact schema required',()=>{
  for(const schema of ['','attribution-tier-ledger/0','other',null,1])fails(ledger({schema}),/schema/);
});
test('root rejects unknown fields',()=>fails({...ledger(),extra:'x'},/extra/));
test('root rejects missing fields',()=>{const x=ledger();delete x.records;fails(x,/records/);});
test('root rejects non-objects',()=>{for(const v of [null,[],1,false,'hello'])fails(v,/object/);});
test('record rejects extra keys',()=>fails(ledger({records:[{...record(),wrong:true}]}),/wrong/));
test('record rejects missing fields',()=>{const r=record();delete r.tier;fails(ledger({records:[r]}),/tier/);});
test('surface rejects extra keys',()=>fails(ledger({surfaces:[{...surface(),wrong:0}]}),/wrong/));
test('surface rejects missing fields',()=>{const s=surface();delete s.offline;fails(ledger({surfaces:[s]}),/offline/);});
test('record uniqueness enforced',()=>fails(ledger({records:[record(),record()]}),/Duplicate/));
test('surface uniqueness enforced',()=>fails(ledger({surfaces:[surface(),surface()]}),/Duplicate/));
test('id list uniqueness enforced',()=>fails(ledger({surfaces:[surface({recordIds:['osm-record','osm-record']})]}),/Duplicate/));
test('lists reject non-arrays',()=>{fails(ledger({records:{}}),/records/);fails(ledger({surfaces:{}}),/surfaces/);});
test('record ID must be slug',()=>{for(const id of ['A','foo_bar','foo/bar','', '1abc', 'a--b','-a', 'a-', 'a b'])fails(ledger({records:[record({id})]}),/id/);});
test('surface ID must be slug',()=>{for(const id of ['Z','1','a_b','a/../b',''])fails(ledger({surfaces:[surface({id})]}),/id/);});
test('invalid JSON rejected',()=>{for(const value of ['','{','null','[]','{"x":1}'])assert.throws(()=>parseTierLedgerJson(value),LedgerInputError);});
test('document size bounded by UTF-8 length',()=>assert.throws(()=>parseTierLedgerJson('a'.repeat(MAX_DOCUMENT_BYTES+1)),/large/));
test('document must be a string',()=>assert.throws(()=>parseTierLedgerJson({}),/large/));
test('Unicode length is counted as bytes',()=>assert.throws(()=>parseTierLedgerJson('é'.repeat(MAX_DOCUMENT_BYTES)),/large/));
test('tier summaries count all records without making a release claim',()=>{
  const x=ledger({records:[record(),record({id:'other',tier:'UNKNOWN',state:'held'})]});
  assert.deepEqual(summarizeTiers(parseTierLedger(x)),{primary:1,secondary:0,community:0,UNKNOWN:1});
});
test('surface reverse index ignores missing links',()=>{
  const x=ledger({surfaces:[surface({recordIds:['osm-record','not-listed']})]});
  assert.deepEqual(surfaceRecordIndex(parseTierLedger(x)).get('osm-record'),['map-en']);
});
test('surface reverse index tracks repeated usage across surfaces',()=>{
  const x=ledger({surfaces:[surface(),surface({id:'map-fr',locale:'fr'})]});
  assert.deepEqual(surfaceRecordIndex(parseTierLedger(x)).get('osm-record'),['map-en','map-fr']);
});
for(const [field,values] of Object.entries({family:['random','metrolinx','MiWay',null,0],tier:['trusted','high','none',null,1],permission:['yes','Y','TRUE',true,null],state:['published','pending','UNKNOWN',null],licenceName:['',null,[],42],name:['',null,{},0],attribution:[null,[],5],notes:[null,{},5]})){
  for(const value of values)test(`record ${field} rejects ${JSON.stringify(value)}`,()=>fails(ledger({records:[record({[field]:value})]}),new RegExp(field)));
}
for(const [field,values] of Object.entries({locale:['es','EN','fr-CA',null],mode:['road','UNKNOWN',0],offline:['yes','TRUE',null],mapCredit:[0,null,'unknown'],keyboard:['Y',null],labelled:['true',null],targetPx:[-1,1.5,2000,null,'44'],publicationDate:['now','2026-20-02','2025-02-29'],recordIds:['osm-record',null,1,{}]})){
  for(const value of values)test(`surface ${field} rejects ${JSON.stringify(value)}`,()=>fails(ledger({surfaces:[surface({[field]:value})]}),new RegExp(field)));
}
for(const field of ['sourceDate','acquiredOn','termsReviewedOn']){
  for(const value of ['2026-02-29','2024-13-01','2025-00-10','2025-04-31','2026-2-2','2000-00-01','1899-01-01','2020-01-00',null,20200101]){
    test(`${field} invalid calendar ${JSON.stringify(value)}`,()=>fails(ledger({records:[record({[field]:value})]}),new RegExp(field)));
  }
}
for(const field of ['sourceUrl','licenceUrl','evidenceUrl']){
  for(const value of ['http://example.com','https://localhost/x','https://127.0.0.1/x','https://192.168.1.4','https://10.0.0.1','https://host.local/x','https://user:pass@example.com','https://example.com/#fragment','javascript:alert(1)','file:///tmp/data','not a url',null]){
    test(`${field} rejects unsafe ${JSON.stringify(value)}`,()=>fails(ledger({records:[record({[field]:value})]}),new RegExp(field)));
  }
}
test('UNKNOWN link values remain UNKNOWN',()=>{
  const r=parseLedgerRecord(record({sourceUrl:'UNKNOWN',licenceUrl:'UNKNOWN',evidenceUrl:'UNKNOWN'}));
  assert.equal(r.sourceUrl,'UNKNOWN');assert.equal(r.licenceUrl,'UNKNOWN');assert.equal(r.evidenceUrl,'UNKNOWN');
});
test('newline is permitted in legal notice and notes',()=>{
  const r=parseLedgerRecord(record({attribution:'A\nB',notes:'C\nD'}));
  assert.equal(r.attribution,'A\nB');
});
test('control chars are rejected',()=>fails(ledger({records:[record({notes:'bad\u0000value'})]}),/notes/));
test('non-normalized Unicode is rejected',()=>fails(ledger({records:[record({name:'e\u0301'})]}),/name/));
test('record input remains unchanged by parser',()=>{const x=ledger();const snapshot=clone(x);parseTierLedger(x);assert.deepEqual(x,snapshot);});
