import test from 'node:test';
import assert from 'node:assert/strict';
import {bilingual,canonical,exact,sha256,sha256Bytes,date,id,text,hash,ReviewAssignmentError} from './p15ab-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ReviewAssignmentError&&error.code===code);
test('canonical JSON sorts keys recursively and preserves arrays',()=>{
 assert.equal(JSON.stringify(canonical({z:1,a:{y:2,x:1}})),'{"a":{"x":1,"y":2},"z":1}');
});
test('canonical JSON rejects prototypes and special object keys',()=>{
 const value=JSON.parse('{"__proto__":{"polluted":true}}');fails(()=>canonical(value),'UNSAFE');
});
test('canonical JSON rejects non-finite values and negative zero',()=>{
 fails(()=>canonical({value:Infinity}),'NUMBER');fails(()=>canonical({value:-0}),'NUMBER');
});
test('canonical JSON rejects nesting beyond the configured bound',()=>{
 let value='end';for(let i=0;i<34;i++)value=[value];fails(()=>canonical(value),'LIMIT');
});
test('digest is stable across object key order',()=>{
 assert.equal(sha256({b:2,a:1}),sha256({a:1,b:2}));
});
test('byte digest hashes raw bytes rather than JSON representation',()=>{
 const bytes=new Uint8Array([1,2,3]);assert.notEqual(sha256Bytes(bytes),sha256('010203'));
});
test('date parser rejects impossible calendar dates',()=>{
 for(const value of ['2026-02-30','2026-13-01','0000-01-01','2026-1-01'])fails(()=>date(value),'DATE');
});
test('identifier parser rejects traversal and whitespace',()=>{
 for(const value of ['../secret','Bad','with space',''])fails(()=>id(value),'ID');
});
test('public text rejects phone numbers and email addresses',()=>{
 for(const value of ['name@example.invalid','Call 416-555-0100'])fails(()=>text(value,'public text'),'PRIVATE');
});
test('public text rejects markup and control characters',()=>{
 fails(()=>text('<script>','public text'),'UNSAFE');fails(()=>text('line\nbreak','public text'),'CONTROL');
});
test('French copy requires a nonbreaking space before colon',()=>{
 fails(()=>bilingual({en:'Source label',fr:'Source : étiquette'}),'TYPOGRAPHY');
 assert.doesNotThrow(()=>bilingual({en:'Source label',fr:'Source\u00a0: étiquette'}));
});
test('French copy requires narrow nonbreaking spaces before punctuation',()=>{
 fails(()=>bilingual({en:'A review',fr:'Une revue !'}),'TYPOGRAPHY');
 assert.doesNotThrow(()=>bilingual({en:'A review',fr:'Une revue\u202f!'}));
});
test('exact object contract rejects undeclared optional properties',()=>{
 fails(()=>exact({required:1,extra:2},['required']),'SHAPE');
});
test('hash validation rejects non-SHA-256 strings',()=>{
 fails(()=>hash('not-a-hash'),'HASH');
});

test('P15AB modules do not use network, timers, browser storage or scheduled work',async()=>{
 const {readFile,readdir}=await import('node:fs/promises');
 const directory=new URL('.',import.meta.url);
 const names=(await readdir(directory)).filter(name=>/^p15ab-(?!.*\.test\.mjs$).*\.mjs$/u.test(name));
 for(const name of names){
  const source=await readFile(new URL(name,directory),'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/u.test(source),`${name} must stay offline`);
  assert.ok(!/setInterval|setTimeout|localStorage|sessionStorage|indexedDB/u.test(source),`${name} must not schedule or persist`);
 }
});
