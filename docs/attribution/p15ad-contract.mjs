import {createHash} from 'node:crypto';
export const STATES=Object.freeze(['YES','NO','UNKNOWN']);
export const DECISIONS=Object.freeze(['supported','contradicted','insufficient','abstain']);
export const MAX_ITEMS=20000,MAX_REVIEWERS=500,MAX_RESPONSES=50000,MAX_WINDOWS=100;
export class QualityError extends Error{constructor(code,message){super(message);this.name='QualityError';this.code=code;}}
export function fail(ok,code,message){if(!ok)throw new QualityError(code,message);}
export function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
export function exact(v,required,optional=[]){fail(object(v),'SHAPE','Expected plain object.');const keys=new Set([...required,...optional]);fail(required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>keys.has(k)),'SHAPE','Object fields do not match contract.');}
export function id(v,field='id'){fail(typeof v==='string'&&v.length<=96&&/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(v),'ID',`${field} is invalid.`);return v;}
export function text(v,field,{max=500}={}){fail(typeof v==='string'&&v.length>0&&v.length<=max&&v===v.trim(),'TEXT',`${field} invalid.`);fail(!/[\u0000-\u001f\u007f]/u.test(v),'CONTROL',`${field} has control characters.`);fail(!/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b)/iu.test(v),'PRIVATE',`${field} has contact information.`);fail(!/<\s*\/?\s*[a-z]|javascript\s*:|\bon[a-z]+\s*=/iu.test(v),'UNSAFE',`${field} has markup.`);fail(!/\b(?:guaranteed|real[- ]time|partnership|guarantee|garanti|temps réel|partenariat)\b/iu.test(v),'OVERCLAIM',`${field} has prohibited claim.`);return v;}
export function date(v,field='date'){fail(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v),'DATE',`${field} format invalid.`);const [y,m,d]=v.split('-').map(Number),x=new Date(0);x.setUTCHours(0,0,0,0);x.setUTCFullYear(y,m-1,d);fail(y>0&&x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d,'DATE',`${field} invalid.`);return v;}
export function ordinal(v){return Date.parse(`${date(v)}T00:00:00Z`)/86400000;}
export function hash(v,field='digest'){fail(typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v),'HASH',`${field} invalid.`);return v;}
export function canonical(v,depth=0){fail(depth<=32,'LIMIT','Nesting too deep.');if(v===null||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='number'){fail(Number.isFinite(v)&&!Object.is(v,-0),'NUMBER','Noncanonical number.');return v;}if(Array.isArray(v))return v.map(x=>canonical(x,depth+1));fail(object(v),'SHAPE','Only plain JSON values supported.');const out={};for(const k of Object.keys(v).sort()){fail(!['__proto__','constructor','prototype'].includes(k),'UNSAFE','Unsafe key.');out[k]=canonical(v[k],depth+1);}return out;}
export function stable(v){return JSON.stringify(canonical(v));}
export function sha(v){return createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');}
export function bytesSha(v){fail(v instanceof Uint8Array,'BYTES','Expected bytes.');return createHash('sha256').update(v).digest('hex');}
export function bodyHash(v){const {digest,...body}=v;return sha(body);}
export function unique(v,field='items'){fail(Array.isArray(v)&&new Set(v).size===v.length,'DUPLICATE',`${field} must be unique.`);}
export function integer(v,field,{min=0,max=MAX_ITEMS}={}){fail(Number.isSafeInteger(v)&&v>=min&&v<=max,'INTEGER',`${field} outside bounds.`);return v;}
export function fraction(v,field,{min=0,max=1}={}){fail(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,'FRACTION',`${field} outside bounds.`);return v;}
export function copy(v){return structuredClone(v);}
export function sorted(v,key){return [...v].sort((a,b)=>String(key(a)).localeCompare(String(key(b)),'en'));}
export function bilingual(v,field='copy'){exact(v,['en','fr']);text(v.en,`${field}.en`);text(v.fr,`${field}.fr`);for(let i=0;i<v.fr.length;i++){if(v.fr[i]===':')fail(i===0||v.fr[i-1]==='\u00a0','TYPOGRAPHY','French colon needs U+00A0.');if(';!?'.includes(v.fr[i]))fail(i===0||v.fr[i-1]==='\u202f','TYPOGRAPHY','French punctuation needs U+202F.');if(v.fr[i]==='«')fail(v.fr[i+1]==='\u202f','TYPOGRAPHY','French opening quote needs U+202F.');if(v.fr[i]==='»')fail(v.fr[i-1]==='\u202f','TYPOGRAPHY','French closing quote needs U+202F.');}return v;}
export function pseudonym(v,field='token'){id(v,field);fail(!/(?:reviewer|person|email|phone|identity|name)/iu.test(v),'IDENTITY',`${field} must be opaque.`);return v;}
export function wilson(success,total,z=1.959963984540054){integer(success,'success',{max:MAX_RESPONSES});integer(total,'total',{max:MAX_RESPONSES});fail(success<=total,'COUNT','Success exceeds total.');if(!total)return {lower:null,upper:null};const p=success/total,z2=z*z,den=1+z2/total,c=(p+z2/(2*total))/den,m=z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/den;return {lower:Math.round(Math.max(0,c-m)*1e6)/1e6,upper:Math.round(Math.min(1,c+m)*1e6)/1e6};}
export function noIdentity(v){const s=JSON.stringify(v);fail(!/"(?:email|phone|fullName|legalName|address|reviewerName|personName)"\s*:/iu.test(s)&&!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(s),'IDENTITY','Identity-bearing content is not allowed.');}

export function round(value,places=6){
 const scale=10**places;
 return Math.round((value+Number.EPSILON)*scale)/scale;
}
