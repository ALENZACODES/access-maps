/** Offline notice bundle composer. Strict, versioned, local-only evidence records. */
export const SCHEMA = 'map-notice-bundle/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_SOURCES = 160;
export const MAX_VIEWS = 100;
export const MAX_ASSETS = 350;
export const MAX_USES = 1000;
export const MAX_NOTICES = 1600;
export const TIERS = Object.freeze(['UNKNOWN', 'publisher', 'imported', 'community', 'manual']);
export const RIGHTS = Object.freeze(['UNKNOWN', 'yes', 'no']);
export const FAMILIES = Object.freeze(['UNKNOWN', 'ODbL', 'OGL', 'AUA', 'LTC', 'other']);
export const PLACEMENTS = Object.freeze(['UNKNOWN', 'near-map', 'visible-panel', 'details', 'missing']);
export const DELIVERY = Object.freeze(['map', 'route', 'list', 'offline-document']);
export const METHODS = Object.freeze(['visual', 'keyboard', 'screen-reader', 'touch']);
export const ID_PATTERN = /^[a-z][a-z0-9._-]{1,79}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
export const REQUIRED = Object.freeze({
  root: ['schema', 'title', 'sources', 'views', 'assets', 'uses', 'notices', 'observations'],
  source: ['id', 'name', 'sourceUrl', 'licence', 'licenceUrl', 'family', 'retrievedOn', 'tier', 'permission', 'credit', 'datasetAsOf'],
  view: ['id', 'titleEn', 'titleFr', 'route', 'delivery', 'included', 'notesEn', 'notesFr'],
  asset: ['id', 'label', 'viewId', 'sourceIds', 'geometrySourceIds', 'included', 'notes'],
  use: ['id', 'viewId', 'assetId', 'sourceId', 'required', 'notes'],
  notice: ['id', 'useId', 'locale', 'text', 'placement', 'visible', 'keyboard', 'screenReader', 'observedOn'],
  observation: ['id', 'viewId', 'method', 'observedOn', 'result', 'minimumTargetPx', 'evidence'],
});
export class BundleInputError extends Error {
  constructor(code, path, details) {
    super(`${path}: ${details}`);
    this.name = 'BundleInputError';
    this.code = code;
    this.path = path;
  }
}
function reject(code, path, details) { throw new BundleInputError(code, path, details); }
function record(value, path, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    reject('SHAPE', path, 'Expected a plain object');
  }
  for (const key of Object.keys(value)) if (!fields.includes(key)) reject('FIELD', `${path}.${key}`, 'Unexpected field');
  for (const key of fields) if (!Object.hasOwn(value, key)) reject('FIELD', `${path}.${key}`, 'Missing field');
  return value;
}
export function boundedText(value, path, max = 500, { allowUnknown = true, empty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.length) || CONTROL.test(value)) {
    reject('TEXT', path, 'Invalid text');
  }
  if (!allowUnknown && value === UNKNOWN) reject('UNKNOWN', path, 'UNKNOWN is not permitted here');
  return value;
}
export function identifier(value, path = 'id') {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) reject('ID', path, 'Invalid identifier');
  return value;
}
function oneOf(value, values, path) {
  if (!values.includes(value)) reject('ENUM', path, `Unexpected option ${String(value)}`);
  return value;
}
export function validDay(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function day(value, path) { if (!validDay(value)) reject('DATE', path, 'Invalid date or UNKNOWN'); return value; }
export function safeHttps(value) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./u.test(host)) return null;
    return url.href;
  } catch { return null; }
}
function url(value, path) {
  if (safeHttps(value) === null) reject('URL', path, 'Expected HTTPS URL or UNKNOWN');
  return value;
}
function route(value, path) {
  if (value === UNKNOWN) return value;
  boundedText(value, path, 256, {allowUnknown:false});
  if (!value.startsWith('/') || value.startsWith('//') || /[?#\\]/u.test(value) || value.split('/').some(v => v === '.' || v === '..')) {
    reject('ROUTE', path, 'Expected absolute same-origin route path');
  }
  return value;
}
function idArray(value, path, max) {
  if (!Array.isArray(value) || value.length > max) reject('ARRAY', path, 'Invalid identifier list');
  const found = new Set();
  return value.map((row, index) => {
    const result = identifier(row, `${path}[${index}]`);
    if (found.has(result)) reject('DUPLICATE', `${path}[${index}]`, 'Repeated identifier');
    found.add(result);
    return result;
  });
}
export function sourceRecord(row, path = 'source') {
  record(row, path, REQUIRED.source);
  return {
    id: identifier(row.id, `${path}.id`),
    name: boundedText(row.name, `${path}.name`, 200),
    sourceUrl: url(row.sourceUrl, `${path}.sourceUrl`),
    licence: boundedText(row.licence, `${path}.licence`, 250),
    licenceUrl: url(row.licenceUrl, `${path}.licenceUrl`),
    family: oneOf(row.family, FAMILIES, `${path}.family`),
    retrievedOn: day(row.retrievedOn, `${path}.retrievedOn`),
    tier: oneOf(row.tier, TIERS, `${path}.tier`),
    permission: oneOf(row.permission, RIGHTS, `${path}.permission`),
    credit: boundedText(row.credit, `${path}.credit`, 3000),
    datasetAsOf: day(row.datasetAsOf, `${path}.datasetAsOf`),
  };
}
export function viewRecord(row, path = 'view') {
  record(row, path, REQUIRED.view);
  return {
    id: identifier(row.id, `${path}.id`),
    titleEn: boundedText(row.titleEn, `${path}.titleEn`, 200),
    titleFr: boundedText(row.titleFr, `${path}.titleFr`, 200),
    route: route(row.route, `${path}.route`),
    delivery: oneOf(row.delivery, DELIVERY, `${path}.delivery`),
    included: oneOf(row.included, RIGHTS, `${path}.included`),
    notesEn: boundedText(row.notesEn, `${path}.notesEn`, 3000, {empty:true}),
    notesFr: boundedText(row.notesFr, `${path}.notesFr`, 3000, {empty:true}),
  };
}
export function assetRecord(row, path = 'asset') {
  record(row, path, REQUIRED.asset);
  return {
    id: identifier(row.id, `${path}.id`),
    label: boundedText(row.label, `${path}.label`, 200),
    viewId: identifier(row.viewId, `${path}.viewId`),
    sourceIds: idArray(row.sourceIds, `${path}.sourceIds`, MAX_SOURCES),
    geometrySourceIds: idArray(row.geometrySourceIds, `${path}.geometrySourceIds`, MAX_SOURCES),
    included: oneOf(row.included, RIGHTS, `${path}.included`),
    notes: boundedText(row.notes, `${path}.notes`, 3000, {empty:true}),
  };
}
export function useRecord(row, path = 'use') {
  record(row, path, REQUIRED.use);
  return {
    id: identifier(row.id, `${path}.id`),
    viewId: identifier(row.viewId, `${path}.viewId`),
    assetId: identifier(row.assetId, `${path}.assetId`),
    sourceId: identifier(row.sourceId, `${path}.sourceId`),
    required: oneOf(row.required, RIGHTS, `${path}.required`),
    notes: boundedText(row.notes, `${path}.notes`, 2000, {empty:true}),
  };
}
export function noticeRecord(row, path = 'notice') {
  record(row, path, REQUIRED.notice);
  return {
    id: identifier(row.id, `${path}.id`),
    useId: identifier(row.useId, `${path}.useId`),
    locale: oneOf(row.locale, ['en','fr'], `${path}.locale`),
    text: boundedText(row.text, `${path}.text`, 5000),
    placement: oneOf(row.placement, PLACEMENTS, `${path}.placement`),
    visible: oneOf(row.visible, RIGHTS, `${path}.visible`),
    keyboard: oneOf(row.keyboard, RIGHTS, `${path}.keyboard`),
    screenReader: oneOf(row.screenReader, RIGHTS, `${path}.screenReader`),
    observedOn: day(row.observedOn, `${path}.observedOn`),
  };
}
export function observationRecord(row, path = 'observation') {
  record(row, path, REQUIRED.observation);
  if (row.minimumTargetPx !== UNKNOWN && (!Number.isInteger(row.minimumTargetPx) || row.minimumTargetPx < 0 || row.minimumTargetPx > 4096)) {
    reject('SIZE', `${path}.minimumTargetPx`, 'Expected 0–4096 or UNKNOWN');
  }
  return {
    id: identifier(row.id, `${path}.id`),
    viewId: identifier(row.viewId, `${path}.viewId`),
    method: oneOf(row.method, METHODS, `${path}.method`),
    observedOn: day(row.observedOn, `${path}.observedOn`),
    result: oneOf(row.result, RIGHTS, `${path}.result`),
    minimumTargetPx: row.minimumTargetPx,
    evidence: boundedText(row.evidence, `${path}.evidence`, 3000),
  };
}
function collection(root, field, limit, parser) {
  if (!Array.isArray(root[field]) || root[field].length > limit) reject('ARRAY', field, 'Invalid collection');
  const seen = new Set();
  return root[field].map((item, i) => {
    const row = parser(item, `${field}[${i}]`);
    if (seen.has(row.id)) reject('DUPLICATE', `${field}[${i}].id`, 'Duplicate record');
    seen.add(row.id);
    return row;
  });
}
function reference(map, id, path) { const row = map.get(id); if (!row) reject('REFERENCE', path, `Missing ${id}`); return row; }
export function parseBundle(input) {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES) reject('LIMIT', 'root', 'File too large');
    try { input = JSON.parse(input); } catch { reject('JSON', 'root', 'Invalid JSON'); }
  }
  record(input, 'root', REQUIRED.root);
  if (input.schema !== SCHEMA) reject('SCHEMA', 'root.schema', 'Unsupported schema');
  const title = boundedText(input.title, 'root.title', 200);
  const sources = collection(input, 'sources', MAX_SOURCES, sourceRecord);
  const views = collection(input, 'views', MAX_VIEWS, viewRecord);
  const assets = collection(input, 'assets', MAX_ASSETS, assetRecord);
  const uses = collection(input, 'uses', MAX_USES, useRecord);
  const notices = collection(input, 'notices', MAX_NOTICES, noticeRecord);
  const observations = collection(input, 'observations', MAX_USES, observationRecord);
  const sourcesById = new Map(sources.map(v => [v.id,v]));
  const viewsById = new Map(views.map(v => [v.id,v]));
  const assetsById = new Map(assets.map(v => [v.id,v]));
  const usesById = new Map(uses.map(v => [v.id,v]));
  for (const asset of assets) {
    reference(viewsById, asset.viewId, `assets.${asset.id}.viewId`);
    for (const sid of asset.sourceIds) reference(sourcesById, sid, `assets.${asset.id}.sourceIds`);
    for (const sid of asset.geometrySourceIds) {
      reference(sourcesById, sid, `assets.${asset.id}.geometrySourceIds`);
      if (!asset.sourceIds.includes(sid)) reject('REFERENCE', `assets.${asset.id}.geometrySourceIds`, 'Geometry source must also be asset source');
    }
  }
  const triples = new Set();
  for (const use of uses) {
    const asset = reference(assetsById, use.assetId, `uses.${use.id}.assetId`);
    reference(viewsById, use.viewId, `uses.${use.id}.viewId`);
    reference(sourcesById, use.sourceId, `uses.${use.id}.sourceId`);
    if (asset.viewId !== use.viewId || !asset.sourceIds.includes(use.sourceId)) reject('REFERENCE', `uses.${use.id}`, 'Use must belong to asset and source');
    const key = `${use.assetId}\u001f${use.sourceId}`;
    if (triples.has(key)) reject('DUPLICATE', `uses.${use.id}`, 'Repeated asset source use');
    triples.add(key);
  }
  const noticePairs = new Set();
  for (const notice of notices) {
    reference(usesById, notice.useId, `notices.${notice.id}.useId`);
    const key = `${notice.useId}\u001f${notice.locale}`;
    if (noticePairs.has(key)) reject('DUPLICATE', `notices.${notice.id}`, 'Repeated notice in language');
    noticePairs.add(key);
  }
  const observationPairs = new Set();
  for (const observation of observations) {
    reference(viewsById, observation.viewId, `observations.${observation.id}.viewId`);
    const key = `${observation.viewId}\u001f${observation.method}`;
    if (observationPairs.has(key)) reject('DUPLICATE', `observations.${observation.id}`, 'Repeated observation method');
    observationPairs.add(key);
  }
  return {schema: SCHEMA, title, sources, views, assets, uses, notices, observations};
}
export function emptyBundle() {
  return {schema:SCHEMA, title:'Local disclosure bundle', sources:[], views:[], assets:[], uses:[], notices:[], observations:[]};
}
export function serializeBundle(input) { return `${JSON.stringify(parseBundle(input),null,2)}\n`; }
export function defaultSource(id) {
  return sourceRecord({id, name:UNKNOWN, sourceUrl:UNKNOWN, licence:UNKNOWN, licenceUrl:UNKNOWN, family:UNKNOWN,
    retrievedOn:UNKNOWN, tier:UNKNOWN, permission:UNKNOWN, credit:UNKNOWN, datasetAsOf:UNKNOWN});
}
export function defaultView(id) {
  return viewRecord({id, titleEn:UNKNOWN, titleFr:UNKNOWN, route:UNKNOWN, delivery:'map', included:UNKNOWN, notesEn:'', notesFr:''});
}
export function defaultAsset(id, viewId) {
  return assetRecord({id, label:UNKNOWN, viewId, sourceIds:[], geometrySourceIds:[], included:UNKNOWN, notes:''});
}
export function defaultUse(id, viewId, assetId, sourceId) {
  return useRecord({id, viewId, assetId, sourceId, required:UNKNOWN, notes:''});
}
export function defaultNotice(id, useId, locale) {
  return noticeRecord({id, useId, locale, text:UNKNOWN, placement:UNKNOWN, visible:UNKNOWN,
    keyboard:UNKNOWN, screenReader:UNKNOWN, observedOn:UNKNOWN});
}
export function defaultObservation(id, viewId, method) {
  return observationRecord({id, viewId, method, observedOn:UNKNOWN, result:UNKNOWN, minimumTargetPx:UNKNOWN, evidence:UNKNOWN});
}
export function putRecord(input, collectionName, row) {
  const bundle = parseBundle(input);
  const parsers = {sources:sourceRecord, views:viewRecord, assets:assetRecord, uses:useRecord, notices:noticeRecord, observations:observationRecord};
  if (!Object.hasOwn(parsers, collectionName)) reject('COLLECTION', collectionName, 'Unknown collection');
  const parsed = parsers[collectionName](row);
  const rows = bundle[collectionName];
  return parseBundle({...bundle,[collectionName]:rows.some(x=>x.id===parsed.id) ? rows.map(x=>x.id===parsed.id?parsed:x) : [...rows,parsed]});
}
export function deleteRecord(input, collectionName, id) {
  const bundle = parseBundle(input);
  if (!['sources','views','assets','uses','notices','observations'].includes(collectionName)) reject('COLLECTION', collectionName, 'Unknown collection');
  const rows = bundle[collectionName];
  if (!rows.some(x=>x.id===id)) reject('REFERENCE', id, 'Record missing');
  return parseBundle({...bundle,[collectionName]:rows.filter(row=>row.id!==id)});
}
export function nextId(input, collectionName, stem) {
  const bundle = parseBundle(input);
  if (!Object.hasOwn(bundle,collectionName) || !Array.isArray(bundle[collectionName])) reject('COLLECTION', collectionName, 'Unknown collection');
  identifier(`${stem}1`);
  const ids = new Set(bundle[collectionName].map(x=>x.id));
  for (let n=1;n<=100000;n++) if (!ids.has(`${stem}${n}`)) return `${stem}${n}`;
  reject('LIMIT', collectionName, 'Identifier space exhausted');
}
