import test from 'node:test';
import assert from 'node:assert/strict';
import {CustodyError,isPlain,exact,id,role,text,date,timestamp,hash,integer,
 oneOf,array,unique,canonical,stable,sha,bodyHash,copy,sorted,eventHash,appendEvent,noIdentity,
 frenchTypography} from './p15-custody-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
test('plain contract accepts ordinary object',()=>assert.equal(isPlain({}),true));
test('plain contract accepts null prototype',()=>assert.equal(isPlain(Object.create(null)),true));
test('plain contract rejects array',()=>assert.equal(isPlain([]),false));
test('plain contract rejects class instance',()=>{class Row{};assert.equal(isPlain(new Row()),false);});
test('exact contract accepts required fields',()=>assert.doesNotThrow(()=>exact({id:'x'},['id'])));
test('exact contract accepts optional fields',()=>assert.doesNotThrow(()=>exact({id:'x',label:'y'},['id'],['label'])));
test('exact contract rejects missing fields',()=>fails(()=>exact({},['id']),'SHAPE'));
test('exact contract rejects extra fields',()=>fails(()=>exact({id:'x',extra:1},['id']),'SHAPE'));
test('identifier accepts lower-case dash format',()=>assert.equal(id('evidence-one'),'evidence-one'));
test('identifier accepts underscore and digits',()=>assert.equal(id('item_2'),'item_2'));
test('identifier rejects uppercase',()=>fails(()=>id('Evidence'),'ID'));
test('identifier rejects path separators',()=>fails(()=>id('../item'),'ID'));
test('identifier rejects spaces',()=>fails(()=>id('evidence item'),'ID'));
test('role accepts actor token',()=>assert.equal(role('actor-auditor'),'actor-auditor'));
test('role rejects person token',()=>fails(()=>role('person-alex'),'PRIVATE'));
test('role rejects email token',()=>fails(()=>role('email-alex'),'PRIVATE'));
test('role rejects phone token',()=>fails(()=>role('phone-alex'),'PRIVATE'));
test('role rejects reviewer token',()=>fails(()=>role('reviewer-alex'),'PRIVATE'));
test('text accepts bounded ordinary content',()=>assert.equal(text('Evidence note','note'),'Evidence note'));
test('text accepts optional empty content',()=>assert.equal(text('','note',{empty:true}),''));
test('text rejects empty required content',()=>fails(()=>text('','note'),'TEXT'));
test('text rejects leading whitespace',()=>fails(()=>text(' note','note'),'TEXT'));
test('text rejects trailing whitespace',()=>fails(()=>text('note ','note'),'TEXT'));
test('text rejects content over maximum',()=>fails(()=>text('x'.repeat(1201),'note'),'TEXT'));
test('text rejects control characters',()=>fails(()=>text('one\n two','note'),'CONTROL'));
test('text rejects embedded email',()=>fails(()=>text('Email x@y.example','note'),'PRIVATE'));
test('text rejects North American phone',()=>fails(()=>text('Call 416-555-0199','note'),'PRIVATE'));
test('text rejects HTML tags',()=>fails(()=>text('<b>note</b>','note'),'UNSAFE'));
test('text rejects javascript URL',()=>fails(()=>text('javascript:alert(1)','note'),'UNSAFE'));
test('text rejects event handler text',()=>fails(()=>text('onload=bad','note'),'UNSAFE'));
test('text rejects guarantee wording',()=>fails(()=>text('Guaranteed result','note'),'OVERCLAIM'));
test('date accepts leap day',()=>assert.equal(date('2024-02-29'),'2024-02-29'));
test('date rejects invalid leap day',()=>fails(()=>date('2025-02-29'),'DATE'));
test('date rejects month 13',()=>fails(()=>date('2026-13-01'),'DATE'));
test('date rejects day 0',()=>fails(()=>date('2026-01-00'),'DATE'));
test('date rejects year zero',()=>fails(()=>date('0000-01-01'),'DATE'));
test('date rejects timestamp format',()=>fails(()=>date('2026-11-21T00:00:00Z'),'DATE'));
test('timestamp accepts UTC millisecond timestamp',()=>assert.equal(timestamp('2026-11-21T10:00:00.000Z'),'2026-11-21T10:00:00.000Z'));
test('timestamp rejects date-only string',()=>fails(()=>timestamp('2026-11-21'),'TIMESTAMP'));
test('timestamp rejects offset timestamp',()=>fails(()=>timestamp('2026-11-21T10:00:00+00:00'),'TIMESTAMP'));
test('timestamp rejects impossible date',()=>fails(()=>timestamp('2026-02-30T10:00:00.000Z'),'TIMESTAMP'));
test('hash accepts lowercase 64 hex',()=>assert.equal(hash('a'.repeat(64)).length,64));
test('hash rejects uppercase',()=>fails(()=>hash('A'.repeat(64)),'HASH'));
test('hash rejects short digest',()=>fails(()=>hash('abc'),'HASH'));
test('integer accepts bounded value',()=>assert.equal(integer(4,'count',{min:1,max:4}),4));
test('integer rejects below minimum',()=>fails(()=>integer(0,'count',{min:1}),'INTEGER'));
test('integer rejects above maximum',()=>fails(()=>integer(5,'count',{max:4}),'INTEGER'));
test('integer rejects fractional value',()=>fails(()=>integer(1.2,'count'),'INTEGER'));
test('integer rejects unsafe value',()=>fails(()=>integer(Number.MAX_SAFE_INTEGER+1,'count'),'INTEGER'));
test('oneOf accepts declared value',()=>assert.equal(oneOf('held',['held','released'],'state'),'held'));
test('oneOf rejects unknown value',()=>fails(()=>oneOf('unknown',['held','released'],'state'),'ENUM'));
test('array accepts bounded values',()=>assert.deepEqual(array([1,2],'rows',{min:1,max:2}),[1,2]));
test('array rejects non-array',()=>fails(()=>array('rows','rows'),'LIMIT'));
test('array rejects empty when minimum one',()=>fails(()=>array([],'rows',{min:1}),'LIMIT'));
test('array rejects above maximum',()=>fails(()=>array([1,2,3],'rows',{max:2}),'LIMIT'));
test('unique accepts unique strings',()=>assert.doesNotThrow(()=>unique(['a','b'])));
test('unique rejects duplicate strings',()=>fails(()=>unique(['a','a']),'DUPLICATE'));
test('canonical serializer sorts object keys',()=>assert.equal(stable({z:1,a:2}),'{"a":2,"z":1}'));
test('canonical serializer recursively sorts keys',()=>assert.equal(stable({b:{z:1,a:2}}),'{"b":{"a":2,"z":1}}'));
test('canonical serializer preserves array order',()=>assert.equal(stable([2,1]),'[2,1]'));
test('canonical serializer rejects negative zero',()=>fails(()=>canonical(-0),'NUMBER'));
test('canonical serializer rejects infinity',()=>fails(()=>canonical(Infinity),'NUMBER'));
test('canonical serializer rejects NaN',()=>fails(()=>canonical(NaN),'NUMBER'));
test('canonical serializer rejects date objects',()=>fails(()=>canonical(new Date()),'SHAPE'));
test('canonical serializer rejects unsafe constructor key',()=>fails(()=>canonical(JSON.parse('{"constructor":1}')),'UNSAFE'));
test('canonical serializer rejects unsafe prototype key',()=>fails(()=>canonical(JSON.parse('{"__proto__":1}')),'UNSAFE'));
test('canonical serializer rejects excessive depth',()=>{
 let value='leaf';for(let i=0;i<34;i++)value=[value];fails(()=>canonical(value),'LIMIT');
});
test('sha is deterministic',()=>assert.equal(sha('evidence'),sha('evidence')));
test('sha canonicalizes object property order',()=>assert.equal(sha({a:1,b:2}),sha({b:2,a:1})));
test('bodyHash excludes root digest property',()=>assert.equal(bodyHash({id:'x',digest:'ignored'}),sha({id:'x'})));
test('copy creates independent nested objects',()=>{
 const value={nested:{field:1}},result=copy(value);result.nested.field=2;assert.equal(value.nested.field,1);
});
test('sorted returns a new array',()=>{
 const input=[{id:'z'},{id:'a'}],result=sorted(input,row=>row.id);
 assert.deepEqual(result.map(row=>row.id),['a','z']);assert.equal(input[0].id,'z');
});
test('event hash excludes self hash property',()=>{
 assert.equal(eventHash({sequence:1,hash:'bad'}),sha({sequence:1}));
});
test('appendEvent creates genesis previous hash',()=>{
 const ledger={events:[],digest:''},event=appendEvent(ledger,'opened','2026-11-21T10:00:00.000Z',
  'actor-auditor',{ledgerId:'ledger-one'});
 assert.equal(event.previousHash,'0'.repeat(64));assert.equal(event.sequence,1);
});
test('appendEvent chains subsequent event to prior hash',()=>{
 const ledger={events:[],digest:''};
 const first=appendEvent(ledger,'opened','2026-11-21T10:00:00.000Z','actor-auditor',{});
 const second=appendEvent(ledger,'updated','2026-11-22T10:00:00.000Z','actor-auditor',{});
 assert.equal(second.previousHash,first.hash);
});
test('appendEvent produces a digest on target',()=>{
 const ledger={events:[],digest:''};appendEvent(ledger,'opened','2026-11-21T10:00:00.000Z','actor-auditor',{});
 assert.equal(ledger.digest.length,64);
});
test('appendEvent refuses maximum event count',()=>{
 const ledger={events:Array.from({length:100000},(_,i)=>({sequence:i+1})),digest:''};
 fails(()=>appendEvent(ledger,'updated','2026-11-22T10:00:00.000Z','actor-auditor',{}),'LIMIT');
});
test('noIdentity rejects full name key',()=>fails(()=>noIdentity({fullName:'Example'}),'PRIVATE'));
test('noIdentity rejects email key',()=>fails(()=>noIdentity({email:'x'}),'PRIVATE'));
test('noIdentity rejects email value',()=>fails(()=>noIdentity({summary:'x@y.example'}),'PRIVATE'));
test('noIdentity accepts opaque token and digest',()=>assert.doesNotThrow(()=>noIdentity({actorToken:'actor-reviewer',digest:sha('x')})));
test('French colon requires NBSP',()=>{
 fails(()=>frenchTypography('État : ouvert'),'TYPOGRAPHY');
 assert.doesNotThrow(()=>frenchTypography('État\u00a0: ouvert'));
});
test('French question requires NBSP',()=>{
 fails(()=>frenchTypography('Une question ?'),'TYPOGRAPHY');
 assert.doesNotThrow(()=>frenchTypography('Une question\u00a0?'));
});
test('French exclamation requires NBSP',()=>{
 fails(()=>frenchTypography('Attention !'),'TYPOGRAPHY');
 assert.doesNotThrow(()=>frenchTypography('Attention\u00a0!'));
});
test('French semicolon requires NNBSP',()=>{
 fails(()=>frenchTypography('Note ; suite'),'TYPOGRAPHY');
 assert.doesNotThrow(()=>frenchTypography('Note\u202f; suite'));
});
test('French guillemets require NBSP inside',()=>{
 fails(()=>frenchTypography('« citation »'),'TYPOGRAPHY');
 assert.doesNotThrow(()=>frenchTypography('«\u00a0citation\u00a0»'));
});

test('timestamp preserves millisecond precision',()=>{
 assert.doesNotThrow(()=>timestamp('2026-11-21T10:00:00.123Z'));
});
test('timestamp rejects missing millisecond precision',()=>{
 fails(()=>timestamp('2026-11-21T10:00:00Z'),'TIMESTAMP');
});
test('canonical serializer rejects function values',()=>{
 fails(()=>canonical({callback:()=>true}),'SHAPE');
});
test('canonical serializer rejects symbol values',()=>{
 fails(()=>canonical(Symbol('secret')),'SHAPE');
});
test('role token accepts archive and auditor roles',()=>{
 assert.equal(role('actor-archive'),'actor-archive');
 assert.equal(role('actor-auditor'),'actor-auditor');
});
test('body hash changes when declared payload changes',()=>{
 assert.notEqual(bodyHash({value:'one'}),bodyHash({value:'two'}));
});

test('hash output uses lowercase hexadecimal',()=>assert.match(sha('x'),/^[a-f0-9]{64}$/u));
