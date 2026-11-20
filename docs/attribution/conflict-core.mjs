/** Independent, local-only notice discrepancy record. No network or clock use. */
export const CONFLICT_SCHEMA = 'map-attribution-conflicts/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_BYTES = 1024 * 1024;
export const MAX_ROWS = 500;
export const SEVERITIES = Object.freeze(['blocking', 'review', 'information']);
export const DECISIONS = Object.freeze(['open', 'hold', 'resolved']);
export const EVIDENCE = Object.freeze(['UNKNOWN', 'publisher', 'imported', 'community', 'manual']);
export const CATEGORIES = Object.freeze(['credit', 'licence', 'source', 'retrieval', 'tier', 'placement', 'permission', 'other']);
const FIELDS = Object.freeze(['id','surfaceId','layerId','sourceId','category','current','proposed','source','licence','retrievedOn','tier','reason','severity','decision','reviewedOn','note']);
const ROOT_FIELDS = Object.freeze(['schema','title','conflicts']);
const ID = /^[a-z][a-z0-9._-]{1,79}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
export class ConflictInputError extends Error {
  constructor(code, location, message) {
    super(`${location}: ${message}`);
    this.name = 'ConflictInputError';
    this.code = code;
    this.location = location;
  }
}
function reject(code, location, message) { throw new ConflictInputError(code,location,message); }
function object(value, fields, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject('SHAPE',location,'Plain object required');
  for (const k of Object.keys(value)) if (!fields.includes(k)) reject('FIELD',`${location}.${k}`,'Unexpected field');
  for (const k of fields) if (!Object.hasOwn(value,k)) reject('FIELD',`${location}.${k}`,'Missing field');
}
function text(value, location, max=2000) {
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value)) reject('TEXT',location,'Invalid text');
  return value;
}
function identifier(value,location) {
  if (typeof value !== 'string' || !ID.test(value)) reject('ID',location,'Invalid identifier');
  return value;
}
function list(value,options,location) {
  if (!options.includes(value)) reject('ENUM',location,'Unexpected value');
  return value;
}
export function validDate(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const x = new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y && x.getUTCMonth()===m-1 && x.getUTCDate()===d;
}
function date(value,location) {
  if (!validDate(value)) reject('DATE',location,'Invalid date');
  return value;
}
export function safeEvidenceLink(value) {
  if (value===UNKNOWN) return UNKNOWN;
  if (typeof value!=='string' || value.length>2048) return null;
  try {
    const u=new URL(value);
    if (u.protocol!=='https:' || !u.hostname || u.username || u.password || u.port || u.hash || /^(?:localhost|127\.|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/iu.test(u.hostname)) return null;
    return u.href;
  } catch {return null;}
}
export function emptyConflicts() { return {schema:CONFLICT_SCHEMA,title:'UNKNOWN',conflicts:[]}; }
export function newConflict(id='item-01') {
  return {id,surfaceId:UNKNOWN,layerId:UNKNOWN,sourceId:UNKNOWN,category:'credit',current:UNKNOWN,proposed:UNKNOWN,source:UNKNOWN,licence:UNKNOWN,retrievedOn:UNKNOWN,tier:UNKNOWN,reason:UNKNOWN,severity:'review',decision:'open',reviewedOn:UNKNOWN,note:UNKNOWN};
}
export function parseConflicts(input) {
  const raw=typeof input==='string'?input:JSON.stringify(input);
  if (typeof raw!=='string' || BufferSafeLength(raw)>MAX_BYTES) reject('SIZE','root','File exceeds limit');
  let model;
  try {model=typeof input==='string'?JSON.parse(input):structuredClone(input);} catch {reject('JSON','root','Invalid JSON');}
  object(model,ROOT_FIELDS,'root');
  if (model.schema!==CONFLICT_SCHEMA) reject('VERSION','root.schema','Unsupported format');
  text(model.title,'root.title',200);
  if (!Array.isArray(model.conflicts) || model.conflicts.length>MAX_ROWS) reject('ROWS','root.conflicts','Invalid row collection');
  const seen=new Set();
  const conflicts=model.conflicts.map((r,i)=>{
    const p=`root.conflicts[${i}]`;
    object(r,FIELDS,p);
    const id=identifier(r.id,`${p}.id`);
    if(seen.has(id)) reject('DUPLICATE',`${p}.id`,'Duplicate id');
    seen.add(id);
    for(const k of ['surfaceId','layerId','sourceId']) if(r[k]!==UNKNOWN) identifier(r[k],`${p}.${k}`);
    list(r.category,CATEGORIES,`${p}.category`);
    for(const k of ['current','proposed','reason','note']) text(r[k],`${p}.${k}`);
    if(safeEvidenceLink(r.source)===null) reject('URL',`${p}.source`,'HTTPS link or UNKNOWN required');
    text(r.licence,`${p}.licence`,300);
    date(r.retrievedOn,`${p}.retrievedOn`);
    date(r.reviewedOn,`${p}.reviewedOn`);
    list(r.tier,EVIDENCE,`${p}.tier`);
    list(r.severity,SEVERITIES,`${p}.severity`);
    list(r.decision,DECISIONS,`${p}.decision`);
    return {...r};
  });
  return {schema:CONFLICT_SCHEMA,title:model.title,conflicts};
}
function BufferSafeLength(s) {return new TextEncoder().encode(s).length;}
export function serializeConflicts(input) {return `${JSON.stringify(parseConflicts(input),null,2)}\n`;}
export function upsertConflict(input,record) {
  const base=parseConflicts(input);
  const row=parseConflicts({...base,conflicts:[record]}).conflicts[0];
  return parseConflicts({...base,conflicts:[...base.conflicts.filter(r=>r.id!==row.id),row]});
}
export function removeConflict(input,id) {
  const base=parseConflicts(input);
  return parseConflicts({...base,conflicts:base.conflicts.filter(r=>r.id!==id)});
}
export function filterConflicts(input,{decision='all',severity='all',sourceId='all',query=''}={}) {
  const m=parseConflicts(input);
  if (!['all',...DECISIONS].includes(decision) || !['all',...SEVERITIES].includes(severity)) reject('FILTER','filter','Unknown filter');
  text(query,'filter.query',200);
  const q=query.trim().toLocaleLowerCase();
  return m.conflicts.filter(r=>(decision==='all'||r.decision===decision)&&(severity==='all'||r.severity===severity)&&(sourceId==='all'||r.sourceId===sourceId)&&(!q||[r.id,r.surfaceId,r.layerId,r.sourceId,r.category,r.current,r.proposed,r.note].some(v=>v.toLocaleLowerCase().includes(q))));
}
export function conflictKey(r) {return `${r.surfaceId}|${r.layerId}|${r.sourceId}|${r.category}`;}
export function duplicatesByScope(input) {
  const seen=new Map();const matches=[];
  for(const r of parseConflicts(input).conflicts) {
    const k=conflictKey(r);
    if(seen.has(k)) matches.push([seen.get(k),r.id]);
    else seen.set(k,r.id);
  }
  return matches;
}
