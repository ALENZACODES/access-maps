/** Strict, local publication checklist. No implicit source facts, network or clock. */
export const SCHEMA = 'notice-publication-checklist/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_BYTES = 1024 * 1024;
export const METHODS = Object.freeze(['visual', 'keyboard', 'screen-reader', 'touch']);
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const STATES = Object.freeze(['UNKNOWN', 'yes', 'no']);
export const PLACEMENTS = Object.freeze(['UNKNOWN', 'near-map', 'near-content', 'notice-panel', 'hidden']);
export const TIERS = Object.freeze(['UNKNOWN', 'publisher', 'imported', 'community', 'manual']);
const ID = /^[a-z][a-z0-9._-]{1,79}$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const SHAPES = Object.freeze({
  root: ['schema','title','sources','views','observations'],
  source: ['id','name','sourceUrl','licence','licenceUrl','retrievedOn','tier','permission','credit','datasetDate'],
  view: ['id','title','route','locale','kind','included','sourceIds','mapCreditNearMap'],
  observation: ['id','viewId','sourceId','method','observedOn','noticeText','placement','noticePresent','licenceAvailable','keyboardReachable','screenReaderReadable','focusVisible','targetPx','evidence'],
});
export class ChecklistError extends Error {
  constructor(code, path, description) { super(`${path}: ${description}`); this.name = 'ChecklistError'; this.code = code; this.path = path; }
}
function fail(code,path,message) { throw new ChecklistError(code,path,message); }
function object(value,path,shape) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype) fail('SHAPE',path,'Expected plain object');
  for(const key of Object.keys(value)) if(!shape.includes(key)) fail('FIELD',`${path}.${key}`,'Unexpected field');
  for(const key of shape) if(!Object.hasOwn(value,key)) fail('FIELD',`${path}.${key}`,'Missing field');
}
function text(value,path,max=2000,allowEmpty=false) {
  if(typeof value !== 'string' || (!allowEmpty && !value.length) || value.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail('TEXT',path,'Invalid text');
  return value;
}
function id(value,path) { if(typeof value!=='string'||!ID.test(value)) fail('ID',path,'Invalid identifier'); return value; }
function enumeration(value,options,path) { if(!options.includes(value)) fail('ENUM',path,'Unexpected value'); return value; }
export function validDate(value) {
  if(value===UNKNOWN) return true;
  if(typeof value!=='string') return false;
  const match=DATE.exec(value); if(!match) return false;
  const [year,month,day]=match.slice(1).map(Number);
  if(year<1900||year>9999||month<1||month>12) return false;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
function date(value,path) { if(!validDate(value)) fail('DATE',path,'Invalid calendar date');return value; }
export function safeUrl(value) {
  if(value===UNKNOWN) return UNKNOWN;
  if(typeof value!=='string'||value.length>2048) return null;
  try { const u=new URL(value);if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.port||u.hash||/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/iu.test(u.hostname)) return null;return u.href; } catch {return null;}
}
function url(value,path) {if(safeUrl(value)===null)fail('URL',path,'Use public HTTPS or UNKNOWN');return value;}
function route(value,path) {
  if(value===UNKNOWN)return value;
  text(value,path,256);
  if(!value.startsWith('/')||value.startsWith('//')||/[?#\\]/u.test(value)||value.split('/').some(x=>x==='.'||x==='..'))fail('ROUTE',path,'Invalid local route');
  return value;
}
function names(value,path,limit) {
  if(!Array.isArray(value)||value.length>limit)fail('ARRAY',path,'Invalid ID collection');
  const seen=new Set();return value.map((item,index)=>{const key=id(item,`${path}[${index}]`);if(seen.has(key))fail('DUPLICATE',path,'Duplicate ID');seen.add(key);return key;});
}
function numberOrUnknown(value,path) {
  if(value===UNKNOWN)return value;
  if(!Number.isInteger(value)||value<0||value>4096)fail('SIZE',path,'Invalid CSS pixels');
  return value;
}
export function source(value,path='source') {
  object(value,path,SHAPES.source);
  return {id:id(value.id,`${path}.id`),name:text(value.name,`${path}.name`,200),sourceUrl:url(value.sourceUrl,`${path}.sourceUrl`),
    licence:text(value.licence,`${path}.licence`,250),licenceUrl:url(value.licenceUrl,`${path}.licenceUrl`),
    retrievedOn:date(value.retrievedOn,`${path}.retrievedOn`),tier:enumeration(value.tier,TIERS,`${path}.tier`),
    permission:enumeration(value.permission,STATES,`${path}.permission`),credit:text(value.credit,`${path}.credit`),
    datasetDate:date(value.datasetDate,`${path}.datasetDate`)};
}
export function view(value,path='view') {
  object(value,path,SHAPES.view);
  return {id:id(value.id,`${path}.id`),title:text(value.title,`${path}.title`,200),route:route(value.route,`${path}.route`),
    locale:enumeration(value.locale,LANGUAGES,`${path}.locale`),kind:enumeration(value.kind,['map','list','journey'],`${path}.kind`),
    included:enumeration(value.included,STATES,`${path}.included`),sourceIds:names(value.sourceIds,`${path}.sourceIds`,120),
    mapCreditNearMap:enumeration(value.mapCreditNearMap,STATES,`${path}.mapCreditNearMap`)};
}
export function observation(value,path='observation') {
  object(value,path,SHAPES.observation);
  return {id:id(value.id,`${path}.id`),viewId:id(value.viewId,`${path}.viewId`),sourceId:id(value.sourceId,`${path}.sourceId`),
    method:enumeration(value.method,METHODS,`${path}.method`),observedOn:date(value.observedOn,`${path}.observedOn`),
    noticeText:text(value.noticeText,`${path}.noticeText`,4000),placement:enumeration(value.placement,PLACEMENTS,`${path}.placement`),
    noticePresent:enumeration(value.noticePresent,STATES,`${path}.noticePresent`),licenceAvailable:enumeration(value.licenceAvailable,STATES,`${path}.licenceAvailable`),
    keyboardReachable:enumeration(value.keyboardReachable,STATES,`${path}.keyboardReachable`),
    screenReaderReadable:enumeration(value.screenReaderReadable,STATES,`${path}.screenReaderReadable`),
    focusVisible:enumeration(value.focusVisible,STATES,`${path}.focusVisible`),targetPx:numberOrUnknown(value.targetPx,`${path}.targetPx`),
    evidence:text(value.evidence,`${path}.evidence`,4000)};
}
function records(value,path,limit,parse) {
  if(!Array.isArray(value)||value.length>limit)fail('ARRAY',path,'Collection exceeds limit');
  const seen=new Set();return value.map((row,index)=>{const item=parse(row,`${path}[${index}]`);if(seen.has(item.id))fail('DUPLICATE',path,'Repeated record');seen.add(item.id);return item;});
}
export function parseChecklist(value) {
  if(typeof value==='string') {
    if(BufferSafeLength(value)>MAX_BYTES) fail('LIMIT','root','File exceeds limit');
    try {value=JSON.parse(value);}catch{fail('JSON','root','Malformed JSON');}
  }
  object(value,'root',SHAPES.root);
  if(value.schema!==SCHEMA)fail('SCHEMA','root.schema','Unsupported version');
  const title=text(value.title,'root.title',200);
  const sources=records(value.sources,'sources',120,source);
  const views=records(value.views,'views',80,view);
  const observations=records(value.observations,'observations',1500,observation);
  const sourceIds=new Set(sources.map(x=>x.id));
  const viewMap=new Map(views.map(x=>[x.id,x]));
  for(const v of views)for(const s of v.sourceIds)if(!sourceIds.has(s))fail('REFERENCE',`views.${v.id}.sourceIds`,'Source not found');
  const triples=new Set();
  for(const o of observations){
    const v=viewMap.get(o.viewId);
    if(!v||!v.sourceIds.includes(o.sourceId))fail('REFERENCE',`observations.${o.id}`,'View and source must be linked');
    const key=[o.viewId,o.sourceId,o.method].join('|');
    if(triples.has(key))fail('DUPLICATE',`observations.${o.id}`,'Only one entry per view, source and method');
    triples.add(key);
  }
  return {schema:SCHEMA,title,sources,views,observations};
}
function BufferSafeLength(value) {return new TextEncoder().encode(value).length;}
export function emptyChecklist(){return {schema:SCHEMA,title:'Local publication checklist',sources:[],views:[],observations:[]};}
export function newSource(identifier){return source({id:identifier,name:UNKNOWN,sourceUrl:UNKNOWN,licence:UNKNOWN,licenceUrl:UNKNOWN,retrievedOn:UNKNOWN,tier:UNKNOWN,permission:UNKNOWN,credit:UNKNOWN,datasetDate:UNKNOWN});}
export function newView(identifier,sourceIds=[]){return view({id:identifier,title:UNKNOWN,route:UNKNOWN,locale:'en',kind:'map',included:UNKNOWN,sourceIds,mapCreditNearMap:UNKNOWN});}
export function newObservation(identifier,viewId,sourceId,method){return observation({id:identifier,viewId,sourceId,method,observedOn:UNKNOWN,noticeText:UNKNOWN,placement:UNKNOWN,noticePresent:UNKNOWN,licenceAvailable:UNKNOWN,keyboardReachable:UNKNOWN,screenReaderReadable:UNKNOWN,focusVisible:UNKNOWN,targetPx:UNKNOWN,evidence:UNKNOWN});}
export function mutateChecklist(input,collection,item){
  if(!['sources','views','observations'].includes(collection))fail('COLLECTION','root','Unknown collection');
  const state=parseChecklist(input);const validator={sources:source,views:view,observations:observation}[collection];
  const record=validator(item);const existing=state[collection].some(x=>x.id===record.id);
  const rows=existing?state[collection].map(x=>x.id===record.id?record:x):[...state[collection],record];
  return parseChecklist({...state,[collection]:rows});
}
export function removeChecklistRecord(input,collection,identifier){
  if(!['sources','views','observations'].includes(collection))fail('COLLECTION','root','Unknown collection');
  const state=parseChecklist(input);const rows=state[collection].filter(x=>x.id!==identifier);
  if(rows.length===state[collection].length)fail('REFERENCE','root','Record not found');
  return parseChecklist({...state,[collection]:rows});
}
export function serializeChecklist(input){return JSON.stringify(parseChecklist(input),null,2)+'\n';}
