import test from 'node:test';
import assert from 'node:assert/strict';
import {QualityError,exact,id,text,date,ordinal,hash,canonical,stable,sha,bytesSha,bodyHash,
 unique,integer,fraction,bilingual,pseudonym,wilson,noIdentity,copy,sorted} from './p15ad-contract.mjs';

const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);

test('canonical JSON recursively sorts object keys',()=>{
 assert.equal(stable({z:1,a:{y:2,x:1}}),'{"a":{"x":1,"y":2},"z":1}');
});
test('canonical JSON preserves array order',()=>{
 assert.equal(stable({values:[3,1,2]}),'{"values":[3,1,2]}');
});
test('canonical JSON rejects custom prototypes',()=>{
 const value=Object.create({inherited:true});value.own=true;
 fails(()=>canonical(value),'SHAPE');
});
test('canonical JSON rejects dangerous object keys',()=>{
 const value=JSON.parse('{"__proto__":{"polluted":true}}');
 fails(()=>canonical(value),'UNSAFE');
});
test('canonical JSON rejects infinite and negative-zero numbers',()=>{
 fails(()=>canonical({value:Infinity}),'NUMBER');
 fails(()=>canonical({value:-0}),'NUMBER');
});
test('canonical JSON enforces nesting bound',()=>{
 let value='leaf';
 for(let index=0;index<34;index++)value=[value];
 fails(()=>canonical(value),'LIMIT');
});
test('stable digest ignores object insertion order',()=>{
 assert.equal(sha({a:1,b:2}),sha({b:2,a:1}));
});
test('raw byte digest is different from a JSON text digest',()=>{
 const bytes=new Uint8Array([1,2,3]);
 assert.notEqual(bytesSha(bytes),sha('010203'));
});
test('raw byte digest rejects strings',()=>{
 fails(()=>bytesSha('abc'),'BYTES');
});
test('body digest excludes only the root digest field',()=>{
 const value={a:1,digest:'a'.repeat(64)};
 assert.equal(bodyHash(value),sha({a:1}));
});
test('identifier validator accepts bounded opaque identifiers',()=>{
 assert.equal(id('blind-alpha'),'blind-alpha');
});
test('identifier validator rejects uppercase, whitespace and path traversal',()=>{
 for(const value of ['Blind-alpha','has space','../outside',''])fails(()=>id(value),'ID');
});
test('safe text rejects email addresses and phone numbers',()=>{
 fails(()=>text('person@example.invalid','label'),'PRIVATE');
 fails(()=>text('Call 416-555-0199','label'),'PRIVATE');
});
test('safe text rejects HTML and control characters',()=>{
 fails(()=>text('<script>','label'),'UNSAFE');
 fails(()=>text('line\nbreak','label'),'CONTROL');
});
test('safe text rejects unsupported guarantee claims',()=>{
 fails(()=>text('Guaranteed access','label'),'OVERCLAIM');
});
test('calendar date rejects impossible days and months',()=>{
 for(const value of ['2026-02-30','2026-13-01','0000-01-01','2026-1-01'])fails(()=>date(value),'DATE');
});
test('ordinal preserves calendar-day ordering',()=>{
 assert.equal(ordinal('2026-11-22')-ordinal('2026-11-21'),1);
});
test('hash validation requires lowercase SHA-256 hex',()=>{
 assert.equal(hash('a'.repeat(64)).length,64);
 fails(()=>hash('A'.repeat(64)),'HASH');
});
test('exact object contract rejects missing and unexpected fields',()=>{
 fails(()=>exact({a:1},['a','b']),'SHAPE');
 fails(()=>exact({a:1,b:2,c:3},['a','b']),'SHAPE');
});
test('unique helper rejects repeated values',()=>{
 assert.throws(()=>unique(['a','a'],'labels'),{code:'DUPLICATE'});
});
test('bounded integer checks both boundaries',()=>{
 assert.equal(integer(2,'count',{min:1,max:2}),2);
 fails(()=>integer(3,'count',{min:1,max:2}),'INTEGER');
});
test('fraction helper rejects values outside unit interval',()=>{
 assert.equal(fraction(0.5,'rate'),0.5);
 fails(()=>fraction(1.1,'rate'),'FRACTION');
});
test('French typography requires U+00A0 before colon',()=>{
 fails(()=>bilingual({en:'Source label',fr:'Source : étiquette'}),'TYPOGRAPHY');
 assert.doesNotThrow(()=>bilingual({en:'Source label',fr:'Source\u00a0: étiquette'}));
});
test('French typography requires U+202F before punctuation',()=>{
 fails(()=>bilingual({en:'A review',fr:'Une revue !'}),'TYPOGRAPHY');
 assert.doesNotThrow(()=>bilingual({en:'A review',fr:'Une revue\u202f!'}));
});
test('French guillemets require narrow nonbreaking spaces',()=>{
 fails(()=>bilingual({en:'Quoted',fr:'« citation »'}),'TYPOGRAPHY');
 assert.doesNotThrow(()=>bilingual({en:'Quoted',fr:'«\u202fcitation\u202f»'}));
});
test('opaque token validator rejects identity-shaped tokens',()=>{
 assert.equal(pseudonym('blind-alpha'),'blind-alpha');
 fails(()=>pseudonym('reviewer-alice'),'IDENTITY');
});
test('Wilson interval is bounded and ordered',()=>{
 const value=wilson(8,10);
 assert.ok(value.lower>=0&&value.upper<=1&&value.lower<value.upper);
});
test('Wilson interval returns null for empty sample',()=>{
 assert.deepEqual(wilson(0,0),{lower:null,upper:null});
});
test('Wilson interval rejects successes above total',()=>{
 fails(()=>wilson(2,1),'COUNT');
});
test('identity scanner rejects named identity fields',()=>{
 fails(()=>noIdentity({reviewerName:'Example'}),'IDENTITY');
});
test('identity scanner accepts opaque tokens and digests',()=>{
 assert.doesNotThrow(()=>noIdentity({reviewerToken:'blind-alpha',digest:'a'.repeat(64)}));
});
test('copy returns an independent defensive value',()=>{
 const original={nested:{value:1}},cloned=copy(original);cloned.nested.value=2;
 assert.equal(original.nested.value,1);
});
test('sorted helper orders values by a selected stable key',()=>{
 assert.deepEqual(sorted([{id:'b'},{id:'a'}],row=>row.id).map(row=>row.id),['a','b']);
});

test('P15AD production modules remain local and synchronous',async()=>{
 const {readFile,readdir}=await import('node:fs/promises');
 const directory=new URL('.',import.meta.url);
 const names=(await readdir(directory)).filter(name=>
  /^p15ad-(?!.*\.test\.mjs$).*\.mjs$/u.test(name));
 for(const name of names){
  const source=await readFile(new URL(name,directory),'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/u.test(source),name);
  assert.ok(!/setInterval|setTimeout|localStorage|sessionStorage|indexedDB/u.test(source),name);
 }
});
