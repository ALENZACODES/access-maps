/** Strict, browser-safe, versioned attribution evidence chain contract. */
export const CHAIN_SCHEMA = 'map-attribution-evidence-chain/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_IMPORT_BYTES = 1_500_000;
export const MAX_SOURCE_COUNT = 300;
export const MAX_ASSET_COUNT = 600;
export const MAX_SURFACE_COUNT = 240;
export const MAX_NOTICE_COUNT = 2500;
export const MAX_RECEIPT_COUNT = 2500;
export const SOURCE_TIERS = Object.freeze([UNKNOWN, 'publisher', 'imported', 'community', 'manual']);
export const RIGHTS = Object.freeze([UNKNOWN, 'yes', 'no']);
export const ASSET_STATES = Object.freeze(['draft', 'held', 'included', 'withdrawn']);
export const SURFACE_KINDS = Object.freeze(['map', 'journey', 'list', 'detail', 'export']);
export const PLACEMENTS = Object.freeze([UNKNOWN, 'near-map', 'adjacent', 'visible-panel', 'details-only', 'missing']);
export const RECEIPT_STATES = Object.freeze(['draft', 'reviewed', 'held']);
export const METHODS = Object.freeze(['visual', 'keyboard', 'screen-reader', 'touch']);
const ROOT_FIELDS = ['schema','id','title','reviewedOn','sources','assets','surfaces','notices','receipts'];
const SOURCE_FIELDS = ['id','label','url','licence','licenceUrl','retrievedOn','tier','credit','permission','notes'];
const ASSET_FIELDS = ['id','label','kind','state','sourceIds','parentIds','sha256','bytes','retrievedOn','notes'];
const SURFACE_FIELDS = ['id','label','route','locale','kind','included','mapShown','keyboard','screenReader','focusVisible','minimumTargetPx'];
const NOTICE_FIELDS = ['id','assetId','sourceId','surfaceId','text','placement','observedOn','visible','readable','keyboard','evidenceRef'];
const RECEIPT_FIELDS = ['id','assetId','sourceId','parentIds','contentHash','issuedOn','tier','status','reviewerRef','evidenceRef','notes'];
const IDENTIFIER = /^[a-z][a-z0-9._-]{1,79}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
export class ChainError extends Error {
  constructor(code,path,message){super(`${path}: ${message}`);this.name='ChainError';this.code=code;this.path=path;}
}
const failure=(code,path,message)=>{throw new ChainError(code,path,message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function strict(value,fields,path){
  if(!plain(value))failure('SHAPE',path,'Expected a plain object');
  for(const field of Object.keys(value))if(!fields.includes(field))failure('EXTRA_FIELD',`${path}.${field}`,'Unexpected field');
  for(const field of fields)if(!Object.hasOwn(value,field))failure('MISSING_FIELD',`${path}.${field}`,'Missing required field');
}
function string(value,path,min=0,max=1500){
  if(typeof value!=='string'||value.length<min||value.length>max||CONTROL.test(value))failure('TEXT',path,'Invalid text');
  return value;
}
function identifier(value,path){
  if(typeof value!=='string'||!IDENTIFIER.test(value))failure('IDENTIFIER',path,'Expected a lowercase identifier');
  return value;
}
function choice(value,values,path){if(!values.includes(value))failure('CHOICE',path,`Expected ${values.join(', ')}`);return value;}
export function validDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  if(y<1900||y>9999||m<1||m>12||d<1||d>31)return false;
  const day=new Date(Date.UTC(y,m-1,d));
  return day.getUTCFullYear()===y&&day.getUTCMonth()===m-1&&day.getUTCDate()===d;
}
function date(value,path){if(value!==UNKNOWN&&!validDay(value))failure('DATE',path,'Expected ISO date or UNKNOWN');return value;}
export function safeLink(value){
  if(value===UNKNOWN)return UNKNOWN;
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const uri=new URL(value);
    const host=uri.hostname.toLowerCase();
    if(uri.protocol!=='https:'||!host||uri.username||uri.password||uri.hash||uri.port)return null;
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host==='[::1]'||/^127\./u.test(host)||/^10\./u.test(host)||/^192\.168\./u.test(host)||/^172\.(1[6-9]|2\d|3[01])\./u.test(host))return null;
    return uri.href;
  }catch{return null;}
}
function https(value,path){if(safeLink(value)===null)failure('LINK',path,'Expected public HTTPS link or UNKNOWN');return value;}
function digest(value,path){if(value!==UNKNOWN&&(typeof value!=='string'||!DIGEST.test(value)))failure('HASH',path,'Expected lowercase SHA-256 or UNKNOWN');return value;}
function ids(value,path,max=600){
  if(!Array.isArray(value)||value.length>max)failure('ARRAY',path,'Invalid identifier list');
  const seen=new Set();
  return value.map((item,index)=>{
    const id=identifier(item,`${path}[${index}]`);
    if(seen.has(id))failure('DUPLICATE',`${path}[${index}]`,'Repeated identifier');
    seen.add(id);return id;
  });
}
function positivePixels(value,path){
  if(value===UNKNOWN)return value;
  if(!Number.isInteger(value)||value<0||value>10000)failure('TARGET',path,'Invalid minimum target pixels');
  return value;
}
function byteLength(value,path){
  if(value===UNKNOWN)return value;
  if(!Number.isSafeInteger(value)||value<0)failure('BYTES',path,'Invalid byte count');
  return value;
}
export function parseSource(record,path='source'){
  strict(record,SOURCE_FIELDS,path);
  return {id:identifier(record.id,`${path}.id`),label:string(record.label,`${path}.label`,1,200),
    url:https(record.url,`${path}.url`),licence:string(record.licence,`${path}.licence`,1,200),
    licenceUrl:https(record.licenceUrl,`${path}.licenceUrl`),retrievedOn:date(record.retrievedOn,`${path}.retrievedOn`),
    tier:choice(record.tier,SOURCE_TIERS,`${path}.tier`),credit:string(record.credit,`${path}.credit`,1,2000),
    permission:choice(record.permission,RIGHTS,`${path}.permission`),notes:string(record.notes,`${path}.notes`,0,1500)};
}
export function parseAsset(record,path='asset'){
  strict(record,ASSET_FIELDS,path);
  return {id:identifier(record.id,`${path}.id`),label:string(record.label,`${path}.label`,1,200),
    kind:choice(record.kind,['geometry','tiles','timetable','document','overlay','other'],`${path}.kind`),
    state:choice(record.state,ASSET_STATES,`${path}.state`),sourceIds:ids(record.sourceIds,`${path}.sourceIds`,MAX_SOURCE_COUNT),
    parentIds:ids(record.parentIds,`${path}.parentIds`,MAX_ASSET_COUNT),sha256:digest(record.sha256,`${path}.sha256`),
    bytes:byteLength(record.bytes,`${path}.bytes`),retrievedOn:date(record.retrievedOn,`${path}.retrievedOn`),
    notes:string(record.notes,`${path}.notes`,0,1500)};
}
export function parseSurface(record,path='surface'){
  strict(record,SURFACE_FIELDS,path);
  const route=string(record.route,`${path}.route`,1,240);
  if(route!==UNKNOWN&&(!route.startsWith('/')||route.startsWith('//')||/[?#\\]/u.test(route)||route.split('/').includes('..')))failure('ROUTE',`${path}.route`,'Expected a local absolute path');
  return {id:identifier(record.id,`${path}.id`),label:string(record.label,`${path}.label`,1,200),route,
    locale:choice(record.locale,['en','fr'],`${path}.locale`),kind:choice(record.kind,SURFACE_KINDS,`${path}.kind`),
    included:choice(record.included,RIGHTS,`${path}.included`),mapShown:choice(record.mapShown,RIGHTS,`${path}.mapShown`),
    keyboard:choice(record.keyboard,RIGHTS,`${path}.keyboard`),screenReader:choice(record.screenReader,RIGHTS,`${path}.screenReader`),
    focusVisible:choice(record.focusVisible,RIGHTS,`${path}.focusVisible`),minimumTargetPx:positivePixels(record.minimumTargetPx,`${path}.minimumTargetPx`)};
}
export function parseNotice(record,path='notice'){
  strict(record,NOTICE_FIELDS,path);
  return {id:identifier(record.id,`${path}.id`),assetId:identifier(record.assetId,`${path}.assetId`),
    sourceId:identifier(record.sourceId,`${path}.sourceId`),surfaceId:identifier(record.surfaceId,`${path}.surfaceId`),
    text:string(record.text,`${path}.text`,1,3000),placement:choice(record.placement,PLACEMENTS,`${path}.placement`),
    observedOn:date(record.observedOn,`${path}.observedOn`),visible:choice(record.visible,RIGHTS,`${path}.visible`),
    readable:choice(record.readable,RIGHTS,`${path}.readable`),keyboard:choice(record.keyboard,RIGHTS,`${path}.keyboard`),
    evidenceRef:https(record.evidenceRef,`${path}.evidenceRef`)};
}
export function parseReceipt(record,path='receipt'){
  strict(record,RECEIPT_FIELDS,path);
  return {id:identifier(record.id,`${path}.id`),assetId:identifier(record.assetId,`${path}.assetId`),
    sourceId:identifier(record.sourceId,`${path}.sourceId`),parentIds:ids(record.parentIds,`${path}.parentIds`,MAX_RECEIPT_COUNT),
    contentHash:digest(record.contentHash,`${path}.contentHash`),issuedOn:date(record.issuedOn,`${path}.issuedOn`),
    tier:choice(record.tier,SOURCE_TIERS,`${path}.tier`),status:choice(record.status,RECEIPT_STATES,`${path}.status`),
    reviewerRef:string(record.reviewerRef,`${path}.reviewerRef`,1,200),evidenceRef:https(record.evidenceRef,`${path}.evidenceRef`),
    notes:string(record.notes,`${path}.notes`,0,1500)};
}
function parseRows(value,field,max,parser){
  if(!Array.isArray(value)||value.length>max)failure('ARRAY',field,'Invalid or oversized record list');
  const seen=new Set();
  return value.map((item,index)=>{
    const parsed=parser(item,`${field}[${index}]`);
    if(seen.has(parsed.id))failure('DUPLICATE',`${field}[${index}].id`,'Duplicate record identifier');
    seen.add(parsed.id);return parsed;
  });
}
function checkReferences(document){
  const sources=new Set(document.sources.map(x=>x.id));
  const assets=new Map(document.assets.map(x=>[x.id,x]));
  const surfaces=new Set(document.surfaces.map(x=>x.id));
  const receipts=new Map(document.receipts.map(x=>[x.id,x]));
  for(const asset of document.assets){
    for(const id of asset.sourceIds)if(!sources.has(id))failure('REFERENCE',`assets.${asset.id}.sourceIds`,'Unknown source');
    for(const id of asset.parentIds)if(!assets.has(id))failure('REFERENCE',`assets.${asset.id}.parentIds`,'Unknown parent asset');
  }
  const noticed=new Set();
  for(const notice of document.notices){
    const asset=assets.get(notice.assetId);
    if(!asset)failure('REFERENCE',`notices.${notice.id}.assetId`,'Unknown asset');
    if(!sources.has(notice.sourceId)||!asset.sourceIds.includes(notice.sourceId))failure('REFERENCE',`notices.${notice.id}.sourceId`,'Source is not attached to this asset');
    if(!surfaces.has(notice.surfaceId))failure('REFERENCE',`notices.${notice.id}.surfaceId`,'Unknown publication surface');
    const pair=[notice.assetId,notice.sourceId,notice.surfaceId].join('|');
    if(noticed.has(pair))failure('DUPLICATE',`notices.${notice.id}`,'Duplicate notice placement');
    noticed.add(pair);
  }
  for(const receipt of document.receipts){
    const asset=assets.get(receipt.assetId);
    if(!asset)failure('REFERENCE',`receipts.${receipt.id}.assetId`,'Unknown asset');
    if(!sources.has(receipt.sourceId)||!asset.sourceIds.includes(receipt.sourceId))failure('REFERENCE',`receipts.${receipt.id}.sourceId`,'Receipt source is not attached to asset');
    for(const id of receipt.parentIds)if(!receipts.has(id))failure('REFERENCE',`receipts.${receipt.id}.parentIds`,'Unknown parent receipt');
  }
  return document;
}
export function parseChain(input){
  if(typeof input==='string'){
    if(new TextEncoder().encode(input).length>MAX_IMPORT_BYTES)failure('LIMIT','root','Input exceeds 1.5 MB');
    try{input=JSON.parse(input);}catch{failure('JSON','root','Invalid JSON document');}
  }
  strict(input,ROOT_FIELDS,'root');
  if(input.schema!==CHAIN_SCHEMA)failure('SCHEMA','root.schema','Unsupported evidence-chain version');
  const chain={schema:CHAIN_SCHEMA,id:identifier(input.id,'root.id'),title:string(input.title,'root.title',1,200),
    reviewedOn:date(input.reviewedOn,'root.reviewedOn'),
    sources:parseRows(input.sources,'sources',MAX_SOURCE_COUNT,parseSource),
    assets:parseRows(input.assets,'assets',MAX_ASSET_COUNT,parseAsset),
    surfaces:parseRows(input.surfaces,'surfaces',MAX_SURFACE_COUNT,parseSurface),
    notices:parseRows(input.notices,'notices',MAX_NOTICE_COUNT,parseNotice),
    receipts:parseRows(input.receipts,'receipts',MAX_RECEIPT_COUNT,parseReceipt)};
  return checkReferences(chain);
}
export function emptyChain(){return parseChain({schema:CHAIN_SCHEMA,id:'evidence-chain',title:'Local attribution evidence chain',reviewedOn:UNKNOWN,sources:[],assets:[],surfaces:[],notices:[],receipts:[]});}
export function copyChain(input){return parseChain(JSON.parse(JSON.stringify(parseChain(input))));}
export function toJson(input){return `${JSON.stringify(parseChain(input),null,2)}\n`;}
export function addRow(input,collection,row){
  const parsers={sources:parseSource,assets:parseAsset,surfaces:parseSurface,notices:parseNotice,receipts:parseReceipt};
  if(!Object.hasOwn(parsers,collection))failure('COLLECTION',collection,'Unsupported record collection');
  const chain=parseChain(input),parsed=parsers[collection](row);
  if(chain[collection].some(x=>x.id===parsed.id))failure('DUPLICATE',`${collection}.${parsed.id}`,'Record already exists');
  return parseChain({...chain,[collection]:[...chain[collection],parsed]});
}
export function replaceRow(input,collection,row){
  const parsers={sources:parseSource,assets:parseAsset,surfaces:parseSurface,notices:parseNotice,receipts:parseReceipt};
  if(!Object.hasOwn(parsers,collection))failure('COLLECTION',collection,'Unsupported record collection');
  const chain=parseChain(input),parsed=parsers[collection](row);
  if(!chain[collection].some(x=>x.id===parsed.id))failure('REFERENCE',`${collection}.${parsed.id}`,'Record not found');
  return parseChain({...chain,[collection]:chain[collection].map(x=>x.id===parsed.id?parsed:x)});
}
export function removeRow(input,collection,id){
  if(!['sources','assets','surfaces','notices','receipts'].includes(collection))failure('COLLECTION',collection,'Unsupported record collection');
  const chain=parseChain(input),rest=chain[collection].filter(x=>x.id!==id);
  if(rest.length===chain[collection].length)failure('REFERENCE',`${collection}.${id}`,'Record not found');
  return parseChain({...chain,[collection]:rest});
}
export function sourceUseMatrix(input){
  const chain=parseChain(input);const result=[];
  for(const asset of chain.assets){for(const sourceId of asset.sourceIds){
    const source=chain.sources.find(x=>x.id===sourceId);
    const related=chain.notices.filter(n=>n.assetId===asset.id&&n.sourceId===sourceId);
    const receipts=chain.receipts.filter(r=>r.assetId===asset.id&&r.sourceId===sourceId);
    result.push({assetId:asset.id,assetState:asset.state,assetHash:asset.sha256,sourceId,source:source.label,
      licence:source.licence,retrievedOn:source.retrievedOn,tier:source.tier,permission:source.permission,
      noticeIds:related.map(n=>n.id),surfaceIds:related.map(n=>n.surfaceId),receiptIds:receipts.map(r=>r.id)});
  }}
  return result.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.sourceId.localeCompare(b.sourceId));
}
