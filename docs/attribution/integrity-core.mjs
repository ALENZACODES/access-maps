/** Fail-closed local attribution/file integrity register. No I/O or clock access. */
export const SCHEMA = 'map-source-file-integrity/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_SOURCES = 150;
export const MAX_ASSETS = 400;
export const MAX_CHECKS = 1600;
export const MAX_MEASUREMENTS = 1000;
export const STATES = Object.freeze(['UNKNOWN','yes','no']);
export const TIERS = Object.freeze(['UNKNOWN','publisher','imported','community','manual']);
export const METHODS = Object.freeze(['visual','keyboard','screen-reader','touch']);
export const PLACEMENTS = Object.freeze(['UNKNOWN','beside-map','visible-panel','details-only','absent']);
export const STATUSES = Object.freeze(['draft','held','included']);
export const KINDS = Object.freeze(['UNKNOWN','basemap','geometry','overlay','timetable','document','other']);
const idPattern = /^[a-z][a-z0-9._-]{1,79}$/u;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const shaPattern = /^[a-f0-9]{64}$/u;
const keys = Object.freeze({
  root:['schema','title','sources','assets','checks','measurements'],
  source:['id','name','sourceUrl','licence','licenceUrl','retrievedOn','tier','credit','permission'],
  asset:['id','label','fileName','kind','sourceIds','sha256','byteLength','status','route'],
  check:['id','assetId','sourceId','method','noticeText','placement','observedOn','creditPresent','licenceShown','focusVisible','targetPx','evidence'],
  measurement:['id','assetId','sha256','byteLength','checkedOn','notes'],
});
export class IntegrityInputError extends Error {
  constructor(code,path,message) { super(`${path}: ${message}`); this.name='IntegrityInputError'; this.code=code; this.path=path; }
}
function fail(code,path,message) { throw new IntegrityInputError(code,path,message); }
function plain(v) { return v!==null && typeof v==='object' && !Array.isArray(v) && Object.getPrototypeOf(v)===Object.prototype; }
function exactFields(obj,expected,path) {
  if (!plain(obj)) fail('SHAPE',path,'Expected plain object');
  for (const key of Object.keys(obj)) if (!expected.includes(key)) fail('FIELD',`${path}.${key}`,'Unexpected field');
  for (const key of expected) if (!Object.hasOwn(obj,key)) fail('FIELD',`${path}.${key}`,'Missing field');
}
function str(value,path,max=2000,{allowEmpty=false}={}) {
  if (typeof value!=='string' || value.length>max || (!allowEmpty && !value.length) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail('TEXT',path,'Invalid string');
  return value;
}
function id(value,path) { if (typeof value!=='string'||!idPattern.test(value)) fail('ID',path,'Invalid identifier'); return value; }
function oneOf(value,allowed,path) { if(!allowed.includes(value)) fail('ENUM',path,'Unexpected value'); return value; }
export function isValidDate(value) {
  if (value===UNKNOWN) return true;
  if (typeof value!=='string') return false;
  const m=datePattern.exec(value); if(!m) return false;
  const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]);
  if(year<1900 || year>9999 || month<1 || month>12) return false;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
}
function date(v,path) { if(!isValidDate(v)) fail('DATE',path,'Expected ISO date or UNKNOWN'); return v; }
export function safeHttps(value) {
  if(value===UNKNOWN) return UNKNOWN;
  if(typeof value!=='string'||value.length>2048) return null;
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.port||url.hash) return null;
    if(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/iu.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
function address(v,path) { if(safeHttps(v)===null) fail('URL',path,'Expected HTTPS address or UNKNOWN'); return v; }
function route(value,path) {
  if(value===UNKNOWN) return value;
  str(value,path,255);
  if(!value.startsWith('/')||value.startsWith('//')||/[?#\\]/u.test(value)||value.split('/').some(x=>x==='.'||x==='..')) fail('ROUTE',path,'Expected local path');
  return value;
}
function hash(value,path) { if(value!==UNKNOWN && (typeof value!=='string'||!shaPattern.test(value))) fail('SHA256',path,'Expected 64 hexadecimal characters or UNKNOWN'); return value; }
function size(value,path) { if(value===UNKNOWN) return value; if(!Number.isSafeInteger(value)||value<0||value>10_000_000_000) fail('SIZE',path,'Expected nonnegative integer or UNKNOWN'); return value; }
function target(value,path) { if(value===UNKNOWN) return value; if(!Number.isInteger(value)||value<0||value>4096) fail('TARGET',path,'Expected CSS pixel value or UNKNOWN'); return value; }
function ids(value,path,limit) {
  if(!Array.isArray(value)||value.length>limit) fail('ARRAY',path,'Invalid identifiers');
  const seen=new Set();
  return value.map((v,i)=>{const k=id(v,`${path}[${i}]`);if(seen.has(k)) fail('DUPLICATE',`${path}[${i}]`,'Repeated identifier');seen.add(k);return k;});
}
function collection(root,key,limit,fn) {
  if(!Array.isArray(root[key])||root[key].length>limit) fail('ARRAY',key,'Invalid collection');
  const seen=new Set();
  return root[key].map((v,i)=>{const row=fn(v,`${key}[${i}]`);if(seen.has(row.id)) fail('DUPLICATE',`${key}[${i}].id`,'Repeated identifier');seen.add(row.id);return row;});
}
export function parseSource(obj,path='source') {
  exactFields(obj,keys.source,path);
  return {id:id(obj.id,`${path}.id`),name:str(obj.name,`${path}.name`,200),sourceUrl:address(obj.sourceUrl,`${path}.sourceUrl`),licence:str(obj.licence,`${path}.licence`,250),licenceUrl:address(obj.licenceUrl,`${path}.licenceUrl`),retrievedOn:date(obj.retrievedOn,`${path}.retrievedOn`),tier:oneOf(obj.tier,TIERS,`${path}.tier`),credit:str(obj.credit,`${path}.credit`,2000),permission:oneOf(obj.permission,STATES,`${path}.permission`)};
}
export function parseAsset(obj,path='asset') {
  exactFields(obj,keys.asset,path);
  return {id:id(obj.id,`${path}.id`),label:str(obj.label,`${path}.label`,200),fileName:str(obj.fileName,`${path}.fileName`,250),kind:oneOf(obj.kind,KINDS,`${path}.kind`),sourceIds:ids(obj.sourceIds,`${path}.sourceIds`,MAX_SOURCES),sha256:hash(obj.sha256,`${path}.sha256`),byteLength:size(obj.byteLength,`${path}.byteLength`),status:oneOf(obj.status,STATUSES,`${path}.status`),route:route(obj.route,`${path}.route`)};
}
export function parseCheck(obj,path='check') {
  exactFields(obj,keys.check,path);
  return {id:id(obj.id,`${path}.id`),assetId:id(obj.assetId,`${path}.assetId`),sourceId:id(obj.sourceId,`${path}.sourceId`),method:oneOf(obj.method,METHODS,`${path}.method`),noticeText:str(obj.noticeText,`${path}.noticeText`,8000),placement:oneOf(obj.placement,PLACEMENTS,`${path}.placement`),observedOn:date(obj.observedOn,`${path}.observedOn`),creditPresent:oneOf(obj.creditPresent,STATES,`${path}.creditPresent`),licenceShown:oneOf(obj.licenceShown,STATES,`${path}.licenceShown`),focusVisible:oneOf(obj.focusVisible,STATES,`${path}.focusVisible`),targetPx:target(obj.targetPx,`${path}.targetPx`),evidence:str(obj.evidence,`${path}.evidence`,1500)};
}
export function parseMeasurement(obj,path='measurement') {
  exactFields(obj,keys.measurement,path);
  return {id:id(obj.id,`${path}.id`),assetId:id(obj.assetId,`${path}.assetId`),sha256:hash(obj.sha256,`${path}.sha256`),byteLength:size(obj.byteLength,`${path}.byteLength`),checkedOn:date(obj.checkedOn,`${path}.checkedOn`),notes:str(obj.notes,`${path}.notes`,1500,{allowEmpty:true})};
}
export function parseRegister(input) {
  let value=input;
  if(typeof input==='string') {
    if(new TextEncoder().encode(input).length>MAX_JSON_BYTES) fail('LIMIT','root','Import too large');
    try {value=JSON.parse(input);} catch {fail('JSON','root','Invalid JSON');}
  }
  exactFields(value,keys.root,'root');
  if(value.schema!==SCHEMA) fail('SCHEMA','root.schema','Unsupported register');
  const title=str(value.title,'root.title',200);
  const sources=collection(value,'sources',MAX_SOURCES,parseSource);
  const assets=collection(value,'assets',MAX_ASSETS,parseAsset);
  const checks=collection(value,'checks',MAX_CHECKS,parseCheck);
  const measurements=collection(value,'measurements',MAX_MEASUREMENTS,parseMeasurement);
  const sourceIds=new Set(sources.map(x=>x.id)), assetIds=new Set(assets.map(x=>x.id));
  const assetById=new Map(assets.map(x=>[x.id,x]));
  for(const asset of assets) for(const sourceId of asset.sourceIds) if(!sourceIds.has(sourceId)) fail('REFERENCE',`assets.${asset.id}.sourceIds`,'Missing source');
  const slots=new Set();
  for(const check of checks) {
    if(!assetIds.has(check.assetId)) fail('REFERENCE',`checks.${check.id}.assetId`,'Missing asset');
    if(!sourceIds.has(check.sourceId)||!assetById.get(check.assetId).sourceIds.includes(check.sourceId)) fail('REFERENCE',`checks.${check.id}.sourceId`,'Source not linked to asset');
    const slot=[check.assetId,check.sourceId,check.method].join('|');
    if(slots.has(slot)) fail('DUPLICATE',`checks.${check.id}`,'Repeated method slot'); slots.add(slot);
  }
  for(const item of measurements) if(!assetIds.has(item.assetId)) fail('REFERENCE',`measurements.${item.id}.assetId`,'Missing asset');
  return {schema:SCHEMA,title,sources,assets,checks,measurements};
}
export function blankRegister() {return {schema:SCHEMA,title:'Local source file integrity',sources:[],assets:[],checks:[],measurements:[]};}
export function newSource(recordId) {return parseSource({id:recordId,name:UNKNOWN,sourceUrl:UNKNOWN,licence:UNKNOWN,licenceUrl:UNKNOWN,retrievedOn:UNKNOWN,tier:UNKNOWN,credit:UNKNOWN,permission:UNKNOWN});}
export function newAsset(recordId) {return parseAsset({id:recordId,label:UNKNOWN,fileName:UNKNOWN,kind:UNKNOWN,sourceIds:[],sha256:UNKNOWN,byteLength:UNKNOWN,status:'draft',route:UNKNOWN});}
export function newCheck(recordId,assetId,sourceId,method) {return parseCheck({id:recordId,assetId,sourceId,method,noticeText:UNKNOWN,placement:UNKNOWN,observedOn:UNKNOWN,creditPresent:UNKNOWN,licenceShown:UNKNOWN,focusVisible:UNKNOWN,targetPx:UNKNOWN,evidence:UNKNOWN});}
export function newMeasurement(recordId,assetId,digest,bytes) {return parseMeasurement({id:recordId,assetId,sha256:digest,byteLength:bytes,checkedOn:UNKNOWN,notes:''});}
export function replaceRecord(register,collectionName,row) {
  const parsers={sources:parseSource,assets:parseAsset,checks:parseCheck,measurements:parseMeasurement};
  if(!Object.hasOwn(parsers,collectionName)) fail('COLLECTION','collection','Unknown collection');
  const state=parseRegister(register),record=parsers[collectionName](row);
  const existing=state[collectionName];
  return parseRegister({...state,[collectionName]:existing.some(x=>x.id===record.id)?existing.map(x=>x.id===record.id?record:x):[...existing,record]});
}
export function removeRecord(register,collectionName,recordId) {
  if(!['sources','assets','checks','measurements'].includes(collectionName)) fail('COLLECTION','collection','Unknown collection');
  const state=parseRegister(register);
  if(!state[collectionName].some(x=>x.id===recordId)) fail('REFERENCE','record','Missing record');
  return parseRegister({...state,[collectionName]:state[collectionName].filter(x=>x.id!==recordId)});
}
export function serializeRegister(register) {return JSON.stringify(parseRegister(register),null,2)+'\n';}
export function localeFromSearch(search) {const p=new URLSearchParams(typeof search==='string'&&search.length<1024?search:'');return p.get('lang')==='fr'?'fr':'en';}
export function creditIsOsm(source) {return source.licence!=='UNKNOWN' && /\b(?:odbl|open database licen[sc]e)\b/iu.test(source.licence);}
