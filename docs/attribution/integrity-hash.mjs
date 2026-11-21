import {UNKNOWN} from './integrity-core.mjs';
/** Hash bytes in memory; never upload file bytes or retain the selected file. */
export function hexDigest(bytes) { return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export async function digestFile(file,cryptoProvider=globalThis.crypto) {
  if(!file || typeof file.arrayBuffer!=='function' || typeof file.size!=='number') throw new TypeError('Expected selected browser File');
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>50*1024*1024) throw new RangeError('File is larger than the local 50 MB limit');
  if(!cryptoProvider?.subtle?.digest) throw new Error('SHA-256 is unavailable');
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength!==file.size) throw new Error('File length changed while reading');
  const hash=hexDigest(await cryptoProvider.subtle.digest('SHA-256',bytes));
  return {sha256:hash,byteLength:bytes.byteLength};
}
export function compareDigest(expected,actual) {
  if(expected.sha256===UNKNOWN||expected.byteLength===UNKNOWN) return 'UNKNOWN';
  if(typeof actual.sha256!=='string'||!Number.isSafeInteger(actual.byteLength)) throw new TypeError('Invalid observed digest');
  return expected.sha256===actual.sha256&&expected.byteLength===actual.byteLength?'match':'mismatch';
}
