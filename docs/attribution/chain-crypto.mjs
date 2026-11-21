/** Local cryptographic measurements, with no signing or authenticity claims. */
import {parseChain,UNKNOWN} from './chain-core.mjs';
export function stableObject(value){
  if(Array.isArray(value))return value.map(stableObject);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableObject(value[key])]));
  return value;
}
export function canonicalJson(value){return JSON.stringify(stableObject(value));}
export function bytesToHex(bytes){return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');}
export function hexToBytes(hex){
  if(typeof hex!=='string'||!/^(?:[a-f0-9]{2})+$/u.test(hex))throw new TypeError('Expected even-length lowercase hex');
  const result=new Uint8Array(hex.length/2);
  for(let i=0;i<result.length;i++)result[i]=Number.parseInt(hex.slice(2*i,2*i+2),16);
  return result;
}
export async function sha256(data,provider=globalThis.crypto){
  if(!provider?.subtle?.digest)throw new Error('Web Crypto SHA-256 unavailable');
  const bytes=typeof data==='string'?new TextEncoder().encode(data):data instanceof Uint8Array?data:new Uint8Array(data);
  const digest=await provider.subtle.digest('SHA-256',bytes);
  return bytesToHex(new Uint8Array(digest));
}
export async function measureFile(file,provider=globalThis.crypto){
  if(!file||typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size<0)throw new TypeError('Expected an uploaded File');
  const buffer=await file.arrayBuffer();
  if(buffer.byteLength!==file.size)throw new Error('File byte length changed during reading');
  return {name:file.name??UNKNOWN,bytes:buffer.byteLength,sha256:await sha256(buffer,provider)};
}
export function matchMeasurement(input,assetId,measurement){
  const chain=parseChain(input),asset=chain.assets.find(x=>x.id===assetId);
  if(!asset)return {state:'asset-not-found',assetId};
  if(!measurement||typeof measurement.sha256!=='string'||!Number.isInteger(measurement.bytes))throw new TypeError('Invalid file measurement');
  const hash=asset.sha256===UNKNOWN?'unknown':asset.sha256===measurement.sha256?'same':'different';
  const size=asset.bytes===UNKNOWN?'unknown':asset.bytes===measurement.bytes?'same':'different';
  return {state:hash==='different'||size==='different'?'different':hash==='unknown'||size==='unknown'?'incomplete':'matches-record',
    assetId,hash,size,recordedHash:asset.sha256,measuredHash:measurement.sha256,
    recordedBytes:asset.bytes,measuredBytes:measurement.bytes};
}
export async function canonicalChainHash(input,provider=globalThis.crypto){
  const chain=parseChain(input);
  return sha256(canonicalJson(chain),provider);
}
export async function receiptLeafHash(receipt,provider=globalThis.crypto){
  return sha256(canonicalJson({assetId:receipt.assetId,sourceId:receipt.sourceId,contentHash:receipt.contentHash,
    issuedOn:receipt.issuedOn,parentIds:[...receipt.parentIds].sort(),status:receipt.status,tier:receipt.tier}),provider);
}
export async function receiptMerkleRoot(input,provider=globalThis.crypto){
  const chain=parseChain(input),sorted=[...chain.receipts].sort((a,b)=>a.id.localeCompare(b.id));
  let layer=[];
  for(const receipt of sorted)layer.push(await receiptLeafHash(receipt,provider));
  if(!layer.length)return sha256('',provider);
  while(layer.length>1){
    const next=[];
    for(let i=0;i<layer.length;i+=2){
      const right=layer[i+1]??layer[i];
      next.push(await sha256(hexToBytes(layer[i]+right),provider));
    }
    layer=next;
  }
  return layer[0];
}
export function explainHashLimitations(){
  return 'SHA-256 checks whether bytes match the recorded digest. A matching digest does not establish who created a file, whether a licence grants permission, or whether an accessibility assertion is accurate.';
}
