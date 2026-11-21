import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {digestFile,hexDigest,compareDigest} from './integrity-hash.mjs';
import {UNKNOWN} from './integrity-core.mjs';
import {HASH_A} from './integrity-fixture.mjs';

function mockFile(content) {
  const bytes=Buffer.from(content);
  return {size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}
function expectedSha(content) {return createHash('sha256').update(content).digest('hex');}

test('local SHA-256 uses the bytes actually selected by a person',async()=>{
  const file=mockFile('fictional bytes');
  const result=await digestFile(file,webcrypto);
  assert.equal(result.byteLength,15);
  assert.equal(result.sha256,expectedSha('fictional bytes'));
});
test('empty files have a valid known zero-byte digest',async()=>{
  const result=await digestFile(mockFile(''),webcrypto);
  assert.equal(result.byteLength,0);
  assert.equal(result.sha256,expectedSha(''));
});
test('the same bytes generate the same SHA-256 each time',async()=>{
  const f=mockFile('same bytes');
  assert.deepEqual(await digestFile(f,webcrypto),await digestFile(f,webcrypto));
});
test('changing one byte changes the generated hash',async()=>{
  const a=await digestFile(mockFile('fictional-A'),webcrypto);
  const b=await digestFile(mockFile('fictional-B'),webcrypto);
  assert.notEqual(a.sha256,b.sha256);
  assert.equal(a.byteLength,b.byteLength);
});
test('the hash is lower-case 64-character hexadecimal',async()=>{
  const result=await digestFile(mockFile('abc'),webcrypto);
  assert.match(result.sha256,/^[a-f0-9]{64}$/u);
});
test('no selected bytes or file content are returned in a measurement',async()=>{
  const result=await digestFile(mockFile('local-only private text'),webcrypto);
  assert.deepEqual(Object.keys(result).sort(),['byteLength','sha256']);
  assert.ok(!JSON.stringify(result).includes('private text'));
});
test('digestFile does not require a URL, network connection or fetch',async()=>{
  const result=await digestFile(mockFile('offline'),webcrypto);
  assert.equal(result.sha256,expectedSha('offline'));
});
test('digestFile rejects no file',async()=>{
  await assert.rejects(()=>digestFile(null,webcrypto),TypeError);
});
test('digestFile rejects a fake file with no arrayBuffer',async()=>{
  await assert.rejects(()=>digestFile({size:1},webcrypto),TypeError);
});
test('digestFile rejects a fake file with no numeric size',async()=>{
  await assert.rejects(()=>digestFile({arrayBuffer:async()=>new ArrayBuffer(0)},webcrypto),TypeError);
});
test('digestFile rejects file sizes exceeding the local 50 MB safety cap',async()=>{
  const file={size:50*1024*1024+1,arrayBuffer:async()=>new ArrayBuffer(0)};
  await assert.rejects(()=>digestFile(file,webcrypto),RangeError);
});
test('digestFile rejects a negative file size',async()=>{
  const file={size:-1,arrayBuffer:async()=>new ArrayBuffer(0)};
  await assert.rejects(()=>digestFile(file,webcrypto),RangeError);
});
test('digestFile rejects a fractional byte count',async()=>{
  const file={size:1.5,arrayBuffer:async()=>new ArrayBuffer(1)};
  await assert.rejects(()=>digestFile(file,webcrypto),RangeError);
});
test('digestFile rejects a file that changes length during reading',async()=>{
  const file={size:2,arrayBuffer:async()=>new ArrayBuffer(1)};
  await assert.rejects(()=>digestFile(file,webcrypto),/length changed/u);
});
test('digestFile rejects environments lacking SHA-256 browser support',async()=>{
  await assert.rejects(()=>digestFile(mockFile('abc'),{}),/unavailable/u);
});
test('hexDigest preserves leading zeroes',()=>{
  const bytes=Uint8Array.of(0,1,15,16,255);
  assert.equal(hexDigest(bytes.buffer),'00010f10ff');
});
test('hexDigest handles a digest with all zero bytes',()=>{
  assert.equal(hexDigest(new Uint8Array(32).buffer),'0'.repeat(64));
});
test('hexDigest handles the full 0 to 255 range without dropping bytes',()=>{
  const bytes=Uint8Array.from({length:256},(_,i)=>i);
  const result=hexDigest(bytes.buffer);
  assert.equal(result.length,512);
  assert.ok(result.startsWith('00010203'));
  assert.ok(result.endsWith('fcfdfeff'));
});
test('compareDigest returns explicit match for equal hash and length',()=>{
  assert.equal(compareDigest({sha256:HASH_A,byteLength:15},{sha256:HASH_A,byteLength:15}),'match');
});
test('compareDigest returns explicit mismatch when digest differs',()=>{
  assert.equal(compareDigest({sha256:HASH_A,byteLength:15},{sha256:'b'.repeat(64),byteLength:15}),'mismatch');
});
test('compareDigest returns explicit mismatch when length differs',()=>{
  assert.equal(compareDigest({sha256:HASH_A,byteLength:15},{sha256:HASH_A,byteLength:16}),'mismatch');
});
test('compareDigest returns UNKNOWN when expected digest was never recorded',()=>{
  assert.equal(compareDigest({sha256:UNKNOWN,byteLength:15},{sha256:HASH_A,byteLength:15}),UNKNOWN);
});
test('compareDigest returns UNKNOWN when expected length was never recorded',()=>{
  assert.equal(compareDigest({sha256:HASH_A,byteLength:UNKNOWN},{sha256:HASH_A,byteLength:15}),UNKNOWN);
});
test('compareDigest never treats missing observed values as a match',()=>{
  assert.throws(()=>compareDigest({sha256:HASH_A,byteLength:15},{sha256:null,byteLength:15}),TypeError);
});
test('compareDigest rejects noninteger observed length',()=>{
  assert.throws(()=>compareDigest({sha256:HASH_A,byteLength:15},{sha256:HASH_A,byteLength:15.5}),TypeError);
});
test('compareDigest compares a measured local file against an exact manifest',async()=>{
  const measured=await digestFile(mockFile('ABC'),webcrypto);
  const expected={sha256:expectedSha('ABC'),byteLength:3};
  assert.equal(compareDigest(expected,measured),'match');
});
