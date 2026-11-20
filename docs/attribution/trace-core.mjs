/** Offline map-notice trace register. Browser-safe, no remote I/O or ambient clock. */
export const TRACE_SCHEMA = 'map-notice-trace/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_BYTES = 1024 * 1024;
export const MAX_SOURCES = 120;
export const MAX_LAYERS = 240;
export const MAX_SURFACES = 80;
export const MAX_NOTICES = 1000;
export const MAX_TEXT = 8000;
export const MAX_ID = 80;
export const STATES = Object.freeze(['UNKNOWN', 'yes', 'no']);
export const TIERS = Object.freeze(['UNKNOWN', 'publisher', 'imported', 'community', 'manual']);
export const LICENCE_FAMILIES = Object.freeze(['UNKNOWN', 'ODbL', 'OGL', 'AUA', 'LTC', 'other']);
export const MODES = Object.freeze(['UNKNOWN', 'basemap', 'overlay', 'route', 'catalogue', 'feed']);
export const PLACEMENTS = Object.freeze(['UNKNOWN', 'adjacent', 'visible-panel', 'details-only', 'not-shown']);
export const STATUS = Object.freeze(['draft', 'held', 'included']);
export const LOCALES = Object.freeze(['en', 'fr']);
const ID_RE = /^[a-z][a-z0-9._-]{1,79}$/u;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const KEYS = Object.freeze({
  root: ['schema', 'title', 'sources', 'layers', 'surfaces', 'notices'],
  source: ['id','name','sourceUrl','licence','licenceUrl','retrievedOn','tier','credit','permission','notes'],
  layer: ['id','label','mode','surfaceIds','sourceIds','status','geometrySourceIds','notes'],
  surface: ['id','label','route','locale','mapShown','keyboard','screenReader','focusVisible','minimumTargetPx','notes'],
  notice: ['id','layerId','surfaceId','sourceId','locale','text','placement','visible','focusable','readable','observedOn','notes'],
});

export class TraceInputError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = 'TraceInputError';
    this.code = code;
    this.path = path;
  }
}
function fail(code, path, message) { throw new TraceInputError(code, path, message); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function keys(value, allowed, path) {
  if (!plain(value)) fail('SHAPE', path, 'Expected a plain object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('FIELD', `${path}.${key}`, 'Unexpected field');
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail('FIELD', `${path}.${key}`, 'Missing field');
}
function string(value, path, { min = 0, max = MAX_TEXT } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail('TEXT', path, 'Invalid text');
  return value;
}
function id(value, path) {
  if (typeof value !== 'string' || value.length > MAX_ID || !ID_RE.test(value)) fail('ID', path, 'Invalid identifier');
  return value;
}
function enumeration(value, options, path) {
  if (!options.includes(value)) fail('ENUM', path, `Expected ${options.join(', ')}`);
  return value;
}
function boolState(value, path) { return enumeration(value, STATES, path); }
export function validDate(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function date(value, path) { if (!validDate(value)) fail('DATE', path, 'Invalid date or UNKNOWN'); return value; }
export function safeHttps(value) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port || url.hash || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/u.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
function url(value, path) {
  if (safeHttps(value) === null) fail('URL', path, 'Expected public HTTPS URL or UNKNOWN');
  return value;
}
function relativeRoute(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  string(value, path, {min: 1, max: 256});
  if (!value.startsWith('/') || value.startsWith('//') || /[?#\\\u0000-\u001f]/u.test(value) || value.split('/').some(s => s === '..' || s === '.')) fail('ROUTE', path, 'Expected an absolute local path');
  return value;
}
function ids(value, path, limit) {
  if (!Array.isArray(value) || value.length > limit) fail('ARRAY', path, 'Invalid identifier list');
  const seen = new Set();
  return value.map((x, i) => {
    const result = id(x, `${path}[${i}]`);
    if (seen.has(result)) fail('DUPLICATE', `${path}[${i}]`, 'Repeated identifier');
    seen.add(result);
    return result;
  });
}
function rowArray(input, field, limit, validate) {
  const value = input[field];
  if (!Array.isArray(value) || value.length > limit) fail('ARRAY', field, 'Invalid collection');
  const seen = new Set();
  return value.map((item, index) => {
    const path = `${field}[${index}]`;
    const result = validate(item, path);
    if (seen.has(result.id)) fail('DUPLICATE', `${path}.id`, 'Repeated identifier');
    seen.add(result.id);
    return result;
  });
}
export function sourceRecord(value, path = 'source') {
  keys(value, KEYS.source, path);
  return {
    id: id(value.id, `${path}.id`),
    name: string(value.name, `${path}.name`, {min: 1, max: 200}),
    sourceUrl: url(value.sourceUrl, `${path}.sourceUrl`),
    licence: string(value.licence, `${path}.licence`, {min: 1, max: 250}),
    licenceUrl: url(value.licenceUrl, `${path}.licenceUrl`),
    retrievedOn: date(value.retrievedOn, `${path}.retrievedOn`),
    tier: enumeration(value.tier, TIERS, `${path}.tier`),
    credit: string(value.credit, `${path}.credit`, {min: 1, max: 2000}),
    permission: boolState(value.permission, `${path}.permission`),
    notes: string(value.notes, `${path}.notes`, {max: 2000}),
  };
}
export function layerRecord(value, path = 'layer') {
  keys(value, KEYS.layer, path);
  return {
    id: id(value.id, `${path}.id`),
    label: string(value.label, `${path}.label`, {min: 1, max: 200}),
    mode: enumeration(value.mode, MODES, `${path}.mode`),
    surfaceIds: ids(value.surfaceIds, `${path}.surfaceIds`, MAX_SURFACES),
    sourceIds: ids(value.sourceIds, `${path}.sourceIds`, MAX_SOURCES),
    status: enumeration(value.status, STATUS, `${path}.status`),
    geometrySourceIds: ids(value.geometrySourceIds, `${path}.geometrySourceIds`, MAX_SOURCES),
    notes: string(value.notes, `${path}.notes`, {max: 2000}),
  };
}
export function surfaceRecord(value, path = 'surface') {
  keys(value, KEYS.surface, path);
  if (!Number.isInteger(value.minimumTargetPx) && value.minimumTargetPx !== UNKNOWN) fail('SIZE', `${path}.minimumTargetPx`, 'Invalid target size');
  if (typeof value.minimumTargetPx === 'number' && (value.minimumTargetPx < 0 || value.minimumTargetPx > 4096)) fail('SIZE', `${path}.minimumTargetPx`, 'Invalid target size');
  return {
    id: id(value.id, `${path}.id`),
    label: string(value.label, `${path}.label`, {min: 1, max: 200}),
    route: relativeRoute(value.route, `${path}.route`),
    locale: enumeration(value.locale, LOCALES, `${path}.locale`),
    mapShown: boolState(value.mapShown, `${path}.mapShown`),
    keyboard: boolState(value.keyboard, `${path}.keyboard`),
    screenReader: boolState(value.screenReader, `${path}.screenReader`),
    focusVisible: boolState(value.focusVisible, `${path}.focusVisible`),
    minimumTargetPx: value.minimumTargetPx,
    notes: string(value.notes, `${path}.notes`, {max: 2000}),
  };
}
export function noticeRecord(value, path = 'notice') {
  keys(value, KEYS.notice, path);
  return {
    id: id(value.id, `${path}.id`),
    layerId: id(value.layerId, `${path}.layerId`),
    surfaceId: id(value.surfaceId, `${path}.surfaceId`),
    sourceId: id(value.sourceId, `${path}.sourceId`),
    locale: enumeration(value.locale, LOCALES, `${path}.locale`),
    text: string(value.text, `${path}.text`, {min: 1, max: 8000}),
    placement: enumeration(value.placement, PLACEMENTS, `${path}.placement`),
    visible: boolState(value.visible, `${path}.visible`),
    focusable: boolState(value.focusable, `${path}.focusable`),
    readable: boolState(value.readable, `${path}.readable`),
    observedOn: date(value.observedOn, `${path}.observedOn`),
    notes: string(value.notes, `${path}.notes`, {max: 2000}),
  };
}
function ensureReference(exists, path) { if (!exists) fail('REFERENCE', path, 'Unknown identifier reference'); }
export function parseTrace(input) {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > MAX_BYTES) fail('LIMIT', 'root', 'Import too large');
    try { input = JSON.parse(input); } catch { fail('JSON', 'root', 'Invalid JSON'); }
  }
  keys(input, KEYS.root, 'root');
  if (input.schema !== TRACE_SCHEMA) fail('SCHEMA', 'root.schema', 'Unsupported schema');
  const title = string(input.title, 'root.title', {min: 1, max: 200});
  const sources = rowArray(input, 'sources', MAX_SOURCES, sourceRecord);
  const surfaces = rowArray(input, 'surfaces', MAX_SURFACES, surfaceRecord);
  const layers = rowArray(input, 'layers', MAX_LAYERS, layerRecord);
  const notices = rowArray(input, 'notices', MAX_NOTICES, noticeRecord);
  const sourceIds = new Set(sources.map(row => row.id));
  const surfaceIds = new Set(surfaces.map(row => row.id));
  const layerIds = new Set(layers.map(row => row.id));
  const layerById = new Map(layers.map(row => [row.id, row]));
  const surfaceById = new Map(surfaces.map(row => [row.id, row]));
  for (const layer of layers) {
    for (const sourceId of layer.sourceIds) ensureReference(sourceIds.has(sourceId), `layers.${layer.id}.sourceIds`);
    for (const sourceId of layer.geometrySourceIds) {
      ensureReference(sourceIds.has(sourceId), `layers.${layer.id}.geometrySourceIds`);
      ensureReference(layer.sourceIds.includes(sourceId), `layers.${layer.id}.geometrySourceIds`);
    }
    for (const surfaceId of layer.surfaceIds) ensureReference(surfaceIds.has(surfaceId), `layers.${layer.id}.surfaceIds`);
  }
  const tuples = new Set();
  for (const notice of notices) {
    const layer = layerById.get(notice.layerId);
    ensureReference(layer, `notices.${notice.id}.layerId`);
    ensureReference(sourceIds.has(notice.sourceId), `notices.${notice.id}.sourceId`);
    ensureReference(surfaceById.has(notice.surfaceId), `notices.${notice.id}.surfaceId`);
    ensureReference(layer.sourceIds.includes(notice.sourceId), `notices.${notice.id}.sourceId`);
    ensureReference(layer.surfaceIds.includes(notice.surfaceId), `notices.${notice.id}.surfaceId`);
    ensureReference(surfaceById.get(notice.surfaceId).locale === notice.locale, `notices.${notice.id}.locale`);
    const tuple = [notice.layerId, notice.surfaceId, notice.sourceId, notice.locale].join('\u001f');
    if (tuples.has(tuple)) fail('DUPLICATE', `notices.${notice.id}`, 'Repeated notice for source, layer and surface');
    tuples.add(tuple);
  }
  return {schema: TRACE_SCHEMA, title, sources, layers, surfaces, notices};
}
export function emptyTrace() { return {schema: TRACE_SCHEMA, title: 'Local notice trace', sources: [], layers: [], surfaces: [], notices: []}; }
export function jsonTrace(trace) { return `${JSON.stringify(parseTrace(trace), null, 2)}\n`; }
export function replaceRecord(trace, collection, record) {
  if (!['sources','layers','surfaces','notices'].includes(collection)) fail('COLLECTION', collection, 'Unknown collection');
  const validated = ({sources: sourceRecord, layers: layerRecord, surfaces: surfaceRecord, notices: noticeRecord})[collection](record);
  const old = parseTrace(trace);
  const rows = old[collection];
  const index = rows.findIndex(row => row.id === validated.id);
  const next = index === -1 ? [...rows, validated] : rows.map(row => row.id === validated.id ? validated : row);
  return parseTrace({...old, [collection]: next});
}
export function removeRecord(trace, collection, recordId) {
  if (!['sources','layers','surfaces','notices'].includes(collection)) fail('COLLECTION', collection, 'Unknown collection');
  const old = parseTrace(trace);
  const next = old[collection].filter(row => row.id !== recordId);
  if (next.length === old[collection].length) fail('REFERENCE', recordId, 'Unknown record');
  return parseTrace({...old, [collection]: next});
}
export function makeSource(idValue, label) {
  return sourceRecord({id: idValue, name: label, sourceUrl: UNKNOWN, licence: UNKNOWN, licenceUrl: UNKNOWN, retrievedOn: UNKNOWN, tier: UNKNOWN, credit: UNKNOWN, permission: UNKNOWN, notes: ''});
}
export function makeSurface(idValue, label, locale = 'en') {
  return surfaceRecord({id: idValue, label, route: UNKNOWN, locale, mapShown: UNKNOWN, keyboard: UNKNOWN, screenReader: UNKNOWN, focusVisible: UNKNOWN, minimumTargetPx: UNKNOWN, notes: ''});
}
export function makeLayer(idValue, label, sourceIds, surfaceIds) {
  return layerRecord({id: idValue, label, mode: UNKNOWN, sourceIds, surfaceIds, status: 'draft', geometrySourceIds: [], notes: ''});
}
export function makeNotice(idValue, sourceId, layerId, surfaceId, locale) {
  return noticeRecord({id: idValue, sourceId, layerId, surfaceId, locale, text: UNKNOWN, placement: UNKNOWN, visible: UNKNOWN, focusable: UNKNOWN, readable: UNKNOWN, observedOn: UNKNOWN, notes: ''});
}
export function availableNoticeSlots(trace) {
  const state = parseTrace(trace);
  const actual = new Set(state.notices.map(n => [n.layerId,n.surfaceId,n.sourceId,n.locale].join('|')));
  const surfaces = new Map(state.surfaces.map(x => [x.id,x]));
  const slots = [];
  for (const layer of state.layers) {
    for (const surfaceId of layer.surfaceIds) {
      const surface = surfaces.get(surfaceId);
      for (const sourceId of layer.sourceIds) {
        const slot = {layerId: layer.id, surfaceId, sourceId, locale: surface.locale};
        if (!actual.has([slot.layerId,slot.surfaceId,slot.sourceId,slot.locale].join('|'))) slots.push(slot);
      }
    }
  }
  return slots;
}
export function traceStats(trace) {
  const state = parseTrace(trace);
  const used = state.layers.filter(layer => layer.status === 'included');
  const usedSources = new Set(used.flatMap(layer => layer.sourceIds));
  const usedSurfaces = new Set(used.flatMap(layer => layer.surfaceIds));
  return {
    sources: state.sources.length,
    layers: state.layers.length,
    surfaces: state.surfaces.length,
    notices: state.notices.length,
    includedLayers: used.length,
    includedSources: usedSources.size,
    includedSurfaces: usedSurfaces.size,
    missingSlots: availableNoticeSlots(state).filter(slot => used.some(layer => layer.id === slot.layerId)).length,
  };
}
