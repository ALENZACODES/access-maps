import {createHash} from 'node:crypto';

export const CUSTODY_SCHEMA='access-maps-evidence-custody-ledger/1';
export const ITEM_SCHEMA='access-maps-evidence-item/1';
export const MANIFEST_SCHEMA='access-maps-evidence-redaction-manifest/1';
export const PACK_SCHEMA='access-maps-evidence-custody-pack/1';
export const ITEM_STATES=Object.freeze(['held','released','withdrawn','superseded']);
export const ACCESS_PURPOSES=Object.freeze(['intake','review','correction','appeal','audit','export']);
export const EVENT_TYPES=Object.freeze(['ledger-opened','item-registered','item-metadata-updated',
 'item-state-changed','custody-transferred','access-recorded','redaction-recorded','checkpoint-added']);
export const EVIDENCE_KINDS=Object.freeze(['source-capture','document-reference','observation-note',
 'licence-record','change-notice','correspondence-summary','review-artifact','other']);
export const MAX_ITEMS=20000,MAX_EVENTS=100000,MAX_ACCESS=50000,MAX_REDACTIONS=20000;
export class CustodyError extends Error{
 constructor(code,message){super(message);this.name='CustodyError';this.code=code;}
}
export function fail(ok,code,message){if(!ok)throw new CustodyError(code,message);}
export function isPlain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
export function exact(value,required,optional=[]){
 fail(isPlain(value),'SHAPE','Expected a plain object.');
 const allowed=new Set([...required,...optional]);
 fail(required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>allowed.has(key)),
 'SHAPE','Object keys differ from declared contract.');
}
export function id(value,field='id'){
 fail(typeof value==='string'&&value.length<=120&&/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value),
 'ID',`${field} is invalid.`);return value;
}
export function role(value,field='role'){
 id(value,field);
 fail(!['person-','name-','email-','phone-','reviewer-','user-'].some(prefix=>value.toLowerCase().startsWith(prefix)),
 'PRIVATE',`${field} must be a role-scoped token.`);return value;
}
export function text(value,field,{max=1200,empty=false}={}){
 fail(typeof value==='string'&&value.length<=max&&(empty||value.length>0)&&value===value.trim(),
 'TEXT',`${field} is invalid.`);
 fail(!/[\u0000-\u001f\u007f]/u.test(value),'CONTROL',`${field} contains control characters.`);
 fail(!/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b)/iu.test(value),
 'PRIVATE',`${field} contains contact details.`);
 fail(!/<\s*\/?\s*[a-z]|javascript\s*:|\bon[a-z]+\s*=/iu.test(value),'UNSAFE',`${field} contains markup.`);
 fail(!/\b(?:guaranteed|real[- ]time|partnership|garanti|temps réel|partenariat)\b/iu.test(value),
 'OVERCLAIM',`${field} contains a prohibited assertion.`);
 return value;
}
export function date(value,field='date'){
 fail(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value),'DATE',`${field} must use YYYY-MM-DD.`);
 const [y,m,d]=value.split('-').map(Number),v=new Date(0);v.setUTCHours(0,0,0,0);v.setUTCFullYear(y,m-1,d);
 fail(y>0&&v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d,
 'DATE',`${field} is not a calendar date.`);return value;
}
export function timestamp(value,field='timestamp'){
 fail(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value),
 'TIMESTAMP',`${field} must be UTC ISO timestamp with milliseconds.`);
 fail(Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'TIMESTAMP',`${field} is invalid.`);
 return value;
}
export function hash(value,field='digest'){
 fail(typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value),'HASH',`${field} must be lowercase SHA-256.`);
 return value;
}
export function integer(value,field,{min=0,max=1000000}={}){
 fail(Number.isSafeInteger(value)&&value>=min&&value<=max,'INTEGER',`${field} is outside bounds.`);
 return value;
}
export function oneOf(value,values,field){fail(values.includes(value),'ENUM',`${field} is unsupported.`);return value;}
export function array(value,field,{min=0,max=MAX_ITEMS}={}){
 fail(Array.isArray(value)&&value.length>=min&&value.length<=max,'LIMIT',`${field} size is invalid.`);return value;
}
export function unique(values,field='values'){
 fail(Array.isArray(values)&&new Set(values).size===values.length,'DUPLICATE',`${field} must be unique.`);
}
export function canonical(value,depth=0){
 fail(depth<=32,'LIMIT','Canonical data is too deeply nested.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){
  fail(Number.isFinite(value)&&!Object.is(value,-0),'NUMBER','Noncanonical number.');return value;
 }
 if(Array.isArray(value))return value.map(row=>canonical(row,depth+1));
 fail(isPlain(value),'SHAPE','Only plain JSON objects are supported.');
 const result={};for(const key of Object.keys(value).sort()){
  fail(!['__proto__','constructor','prototype'].includes(key),'UNSAFE','Unsafe property key.');
  result[key]=canonical(value[key],depth+1);
 }return result;
}
export function stable(value){return JSON.stringify(canonical(value));}
export function sha(value){return createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex');}
export function bodyHash(value){const {digest,...body}=value;return sha(body);}
export function copy(value){return structuredClone(value);}
export function sorted(rows,key){return [...rows].sort((a,b)=>String(key(a)).localeCompare(String(key(b)),'en'));}
export function eventHash(event){const {hash:ignored,...body}=event;return sha(body);}
export function appendEvent(ledger,type,at,actorToken,payload){
 fail(ledger.events.length<MAX_EVENTS,'LIMIT','Custody event limit reached.');
 const previous=ledger.events.at(-1);
 const event={sequence:ledger.events.length+1,type,at,actorToken,payload:copy(payload),
  previousHash:previous?.hash??'0'.repeat(64),hash:''};
 event.hash=eventHash(event);ledger.events.push(event);ledger.digest=bodyHash(ledger);return event;
}
export function noIdentity(value){
 const raw=JSON.stringify(value);
 fail(!/"(?:fullName|legalName|email|phone|address|personName|reviewerName|userName)"\s*:/iu.test(raw)&&
 !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(raw),'PRIVATE','Custody output contains identity-bearing data.');
}
export function frenchTypography(value){
 for(let i=0;i<value.length;i++){
  if(value[i]===':')fail(i===0||value[i-1]==='\u00a0','TYPOGRAPHY','French colon requires U+00A0.');
  if(';!?'.includes(value[i]))fail(i===0||value[i-1]==='\u202f','TYPOGRAPHY','French punctuation requires U+202F.');
  if(value[i]==='«')fail(value[i+1]==='\u202f','TYPOGRAPHY','French opening guillemet requires U+202F.');
  if(value[i]==='»')fail(value[i-1]==='\u202f','TYPOGRAPHY','French closing guillemet requires U+202F.');
 }
}
