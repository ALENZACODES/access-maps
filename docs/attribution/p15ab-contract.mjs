/** P15AB — contracts for local, blinded reviewer assignment. */
import { createHash } from 'node:crypto';

export const ASSIGNMENT_SCHEMA='access-maps-review-assignment/1';
export const REVIEW_SCHEMA='access-maps-blind-review-packet/1';
export const LEDGER_SCHEMA='access-maps-review-assignment-ledger/1';
export const ROLES=Object.freeze(['observer','maintainer','editor','operator','adjudicator']);
export const SKILLS=Object.freeze(['entrance','washroom','lift','parking','path','seating','crossing','curb-cut',
 'platform','door','ramp','surface','gradient','outage','source-quality','licensing','translation']);
export const DECISIONS=Object.freeze(['supported','contradicted','insufficient','abstain']);
export const TASK_STATES=Object.freeze(['queued','assigned','in-review','submitted','withdrawn','adjudication']);
export const MAX_REVIEWERS=500,MAX_TASKS=10000,MAX_CONFLICTS=50000,MAX_EVENTS=100000;
export const ZERO='0'.repeat(64);
export class ReviewAssignmentError extends Error{
 constructor(code,message,details={}){super(message);this.name='ReviewAssignmentError';this.code=code;this.details=details;}
}
export function fail(condition,code,message,details={}){
 if(!condition)throw new ReviewAssignmentError(code,message,details);
}
export function plain(value){
 if(value===null||typeof value!=='object'||Array.isArray(value))return false;
 const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;
}
export function exact(value,required,optional=[]){
 fail(plain(value),'SHAPE','Expected a plain object.');
 const allowed=new Set([...required,...optional]);
 fail(required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>allowed.has(key)),
  'SHAPE','Object has missing or unexpected fields.');
}
export function id(value,field='id'){
 fail(typeof value==='string'&&/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value)&&value.length<=96,
  'ID',`${field} is invalid.`);return value;
}
export function text(value,field,{max=500,privateAllowed=false}={}){
 fail(typeof value==='string'&&value.length>0&&value.length<=max&&value===value.trim(),'TEXT',`${field} is empty or too long.`);
 fail(!/[\u0000-\u001f\u007f]/u.test(value),'CONTROL',`${field} contains control characters.`);
 if(!privateAllowed)fail(!/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b)/u.test(value),
  'PRIVATE',`${field} cannot contain contact details.`);
 fail(!/<\s*\/?\s*[a-z]|javascript\s*:|\bon[a-z]+\s*=/iu.test(value),'UNSAFE',`${field} contains markup.`);
 return value;
}
export function date(value,field='date'){
 fail(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value),'DATE',`${field} must use YYYY-MM-DD.`);
 const [year,month,day]=value.split('-').map(Number),d=new Date(0);d.setUTCHours(0,0,0,0);d.setUTCFullYear(year,month-1,day);
 fail(year>0&&d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day,
  'DATE',`${field} is not a calendar date.`);return value;
}
export function integer(value,field,{min=0,max=1000000}={}){
 fail(Number.isSafeInteger(value)&&value>=min&&value<=max,'INTEGER',`${field} is outside its allowed range.`);return value;
}
export function hash(value,field='digest'){
 fail(typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value),'HASH',`${field} must be a SHA-256 digest.`);return value;
}
export function canonical(value,depth=0){
 fail(depth<=32,'LIMIT','Canonical document nesting is too deep.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){fail(Number.isFinite(value)&&!Object.is(value,-0),'NUMBER','Number is not canonical.');return value;}
 if(Array.isArray(value))return value.map(item=>canonical(item,depth+1));
 fail(plain(value),'SHAPE','Only plain JSON values are supported.');
 const output={};for(const key of Object.keys(value).sort()){
  fail(!['__proto__','prototype','constructor'].includes(key),'UNSAFE','Unsafe object key.');
  output[key]=canonical(value[key],depth+1);
 }return output;
}
export function stableJson(value){return JSON.stringify(canonical(value));}
export function sha256(value){return createHash('sha256').update(typeof value==='string'?value:stableJson(value)).digest('hex');}
export function sha256Bytes(value){fail(value instanceof Uint8Array,'BYTES','Expected Uint8Array.');return createHash('sha256').update(value).digest('hex');}
export function digestBody(value){const {digest,...body}=value;return sha256(body);}
export function actor(value){text(value,'actor',{max:80});fail(!/[<>@]/u.test(value),'PRIVATE','Actor must be a pseudonymous label.');return value;}
export function unique(values,field){
 fail(Array.isArray(values)&&new Set(values).size===values.length,'DUPLICATE',`${field} must be unique.`);return values;
}
export function sorted(values,key){return [...values].sort((a,b)=>String(key(a)).localeCompare(String(key(b))));}
export function copy(value){return structuredClone(value);}
export function freeze(value){return Object.freeze(value);}
export function bilingual(value,field='copy'){
 exact(value,['en','fr']);text(value.en,`${field}.en`);text(value.fr,`${field}.fr`);
 for(let i=0;i<value.fr.length;i++){
  const c=value.fr[i];
  if(c===':')fail(i===0||value.fr[i-1]==='\u00a0','TYPOGRAPHY','French colon needs a nonbreaking space.');
  if(';!?'.includes(c))fail(i===0||value.fr[i-1]==='\u202f','TYPOGRAPHY','French punctuation needs a narrow nonbreaking space.');
  if(c==='«')fail(value.fr[i+1]==='\u202f','TYPOGRAPHY','French opening quote needs a narrow nonbreaking space.');
  if(c==='»')fail(value.fr[i-1]==='\u202f','TYPOGRAPHY','French closing quote needs a narrow nonbreaking space.');
 }
 return value;
}
export function eventDigest(event){const {hash:ignored,...body}=event;return sha256(body);}
export function addEvent(ledger,type,at,by,payload){
 fail(ledger.events.length<MAX_EVENTS,'LIMIT','Assignment event limit reached.');
 const previous=ledger.events.at(-1),sequence=ledger.events.length+1;
 const event={eventId:`event-${sha256({ledgerId:ledger.ledgerId,sequence,type,at,by,payload}).slice(0,24)}`,
  sequence,type,at,actor:by,payload:copy(payload),previousHash:previous?.hash??ZERO,hash:''};
 event.hash=eventDigest(event);ledger.events.push(event);ledger.digest=digestBody(ledger);return event;
}
export function safePublicId(value,field='publicId'){
 id(value,field);fail(!/(?:reviewer|person|email|phone|name)/iu.test(value),'PRIVATE',`${field} must not reveal identity.`);return value;
}
export function dateOrdinal(value){return Date.parse(`${date(value)}T00:00:00.000Z`)/86400000;}
