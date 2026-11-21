/** Explicit bilingual map notice pair register. No network, clock or storage effects. */
import { parseTrace, UNKNOWN, validDate } from './trace-core.mjs';

export const PAIR_SCHEMA = 'attribution-locale-pairs/1';
export const MAX_PAIR_BYTES = 1024 * 1024;
export const MAX_PAIRS = 160;
export const PAIR_STATES = Object.freeze(['draft','held','included']);
export const RECORD_STATES = Object.freeze(['UNKNOWN','yes','no']);
export const REVIEW_TIERS = Object.freeze(['UNKNOWN','manual','publisher','imported','community']);
const ID = /^[a-z][a-z0-9._-]{1,79}$/u;
export class PairInputError extends Error {
  constructor(code, path, detail) { super(`${path}: ${detail}`); this.name = 'PairInputError'; this.code = code; this.path = path; }
}
function fail(code,path,detail) { throw new PairInputError(code,path,detail); }
function plain(x) { return x!==null && typeof x==='object' && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype; }
function exact(object,fields,path) {
  if(!plain(object)) fail('SHAPE',path,'Expected object');
  for(const name of Object.keys(object)) if(!fields.includes(name)) fail('FIELD',`${path}.${name}`,'Unexpected field');
  for(const name of fields) if(!Object.hasOwn(object,name)) fail('FIELD',`${path}.${name}`,'Missing field');
}
function label(x,path,min=1,max=2000) {
  if(typeof x!=='string'||x.length<min||x.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(x)) fail('TEXT',path,'Invalid text');
  return x;
}
function identifier(x,path) { if(typeof x!=='string'||!ID.test(x)) fail('ID',path,'Invalid identifier'); return x; }
function enumeration(x,allowed,path) { if(!allowed.includes(x)) fail('ENUM',path,`Expected ${allowed.join(', ')}`); return x; }
function date(x,path) { if(!validDate(x)) fail('DATE',path,'Invalid date or UNKNOWN'); return x; }
function https(x,path) {
  if(x===UNKNOWN) return UNKNOWN;
  if(typeof x!=='string'||x.length>2048) fail('URL',path,'Invalid URL');
  let url;try { url=new URL(x); }catch {fail('URL',path,'Invalid URL');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.port||url.hash||/^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(url.hostname)) fail('URL',path,'Expected public HTTPS address');
  return x;
}
const FIELDS=Object.freeze({
  root:['schema','title','pairs'],
  pair:['id','enSurfaceId','frSurfaceId','state','reviewedOn','reviewTier','evidenceUrl','parityObserved','notes'],
});
export function parsePair(value,path='pair') {
  exact(value,FIELDS.pair,path);
  const result={
    id:identifier(value.id,`${path}.id`),
    enSurfaceId:identifier(value.enSurfaceId,`${path}.enSurfaceId`),
    frSurfaceId:identifier(value.frSurfaceId,`${path}.frSurfaceId`),
    state:enumeration(value.state,PAIR_STATES,`${path}.state`),
    reviewedOn:date(value.reviewedOn,`${path}.reviewedOn`),
    reviewTier:enumeration(value.reviewTier,REVIEW_TIERS,`${path}.reviewTier`),
    evidenceUrl:https(value.evidenceUrl,`${path}.evidenceUrl`),
    parityObserved:enumeration(value.parityObserved,RECORD_STATES,`${path}.parityObserved`),
    notes:label(value.notes,`${path}.notes`,0,2000),
  };
  if(result.enSurfaceId===result.frSurfaceId) fail('PAIR',path,'Language views must be distinct');
  return result;
}
export function parsePairs(input) {
  if(typeof input==='string') {
    if(new TextEncoder().encode(input).length>MAX_PAIR_BYTES) fail('LIMIT','root','Too many bytes');
    try {input=JSON.parse(input);}catch {fail('JSON','root','Invalid JSON');}
  }
  exact(input,FIELDS.root,'root');
  if(input.schema!==PAIR_SCHEMA) fail('SCHEMA','root.schema','Unsupported schema');
  const title=label(input.title,'root.title',1,200);
  if(!Array.isArray(input.pairs)||input.pairs.length>MAX_PAIRS) fail('LIMIT','root.pairs','Too many pairs');
  const ids=new Set(), usedEn=new Set(), usedFr=new Set();
  const pairs=input.pairs.map((x,i)=>{
    const row=parsePair(x,`pairs[${i}]`);
    if(ids.has(row.id)) fail('DUPLICATE',`pairs[${i}].id`,'Duplicate pair identifier');
    if(usedEn.has(row.enSurfaceId)||usedFr.has(row.frSurfaceId)) fail('DUPLICATE',`pairs[${i}]`,'A surface is already paired in the same language');
    ids.add(row.id);usedEn.add(row.enSurfaceId);usedFr.add(row.frSurfaceId);
    return row;
  });
  return {schema:PAIR_SCHEMA,title,pairs};
}
export function emptyPairs() {return {schema:PAIR_SCHEMA,title:'Local bilingual notice pairs',pairs:[]};}
export function newPair(id,enSurfaceId,frSurfaceId) {
  return parsePair({id,enSurfaceId,frSurfaceId,state:'draft',reviewedOn:UNKNOWN,reviewTier:UNKNOWN,evidenceUrl:UNKNOWN,parityObserved:UNKNOWN,notes:''});
}
export function putPair(input,row) {
  const state=parsePairs(input),newRow=parsePair(row);
  return parsePairs({...state,pairs:[...state.pairs.filter(p=>p.id!==newRow.id),newRow]});
}
export function dropPair(input,id) {
  const state=parsePairs(input);
  if(!state.pairs.some(p=>p.id===id)) fail('REFERENCE','id','No such pair');
  return parsePairs({...state,pairs:state.pairs.filter(p=>p.id!==id)});
}
export function serializePairs(input) {return `${JSON.stringify(parsePairs(input),null,2)}\n`;}
export function parseInputs(trace,register) {
  const parsedTrace=parseTrace(trace),parsedPairs=parsePairs(register);
  const surfaces=new Map(parsedTrace.surfaces.map(s=>[s.id,s]));
  for(const row of parsedPairs.pairs) {
    const en=surfaces.get(row.enSurfaceId),fr=surfaces.get(row.frSurfaceId);
    if(!en||!fr) fail('REFERENCE',`pairs.${row.id}`,'A referenced display surface is absent');
    if(en.locale!=='en'||fr.locale!=='fr') fail('LOCALE',`pairs.${row.id}`,'A pair must have English and French surfaces');
  }
  return {trace:parsedTrace,register:parsedPairs};
}
export function prospectivePairs(trace,register) {
  const {trace:state,register:pairs}=parseInputs(trace,register);
  const selected=new Set(pairs.pairs.flatMap(x=>[x.enSurfaceId,x.frSurfaceId]));
  // Suggestions are lists, not inferred pairings; a person must choose both views explicitly.
  return {en:state.surfaces.filter(s=>s.locale==='en'&&!selected.has(s.id)).map(s=>({id:s.id,label:s.label,route:s.route})),
    fr:state.surfaces.filter(s=>s.locale==='fr'&&!selected.has(s.id)).map(s=>({id:s.id,label:s.label,route:s.route}))};
}
