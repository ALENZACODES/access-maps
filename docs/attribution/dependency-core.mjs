/** Publication dependency inventory. All evidence is supplied locally by a person. */
export const SCHEMA = 'attribution-dependency-inventory/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_INPUT_BYTES = 1024 * 1024;
export const LIMITS = Object.freeze({sources: 150, assets: 500, surfaces: 120, notices: 1200, edges: 1000});
export const TIERS = Object.freeze(['UNKNOWN', 'publisher', 'imported', 'community', 'manual']);
export const STATES = Object.freeze(['UNKNOWN', 'yes', 'no']);
export const MODES = Object.freeze(['held', 'included']);
export const ASSET_KINDS = Object.freeze(['map', 'tile', 'route', 'timetable', 'metadata', 'interface', 'document', 'other']);
export const POSITIONS = Object.freeze(['UNKNOWN', 'adjacent', 'visible-panel', 'details-only', 'absent']);
const ID = /^[a-z][a-z0-9._-]{1,79}$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const SCHEMAS = Object.freeze({
  root: ['schema', 'title', 'sources', 'assets', 'surfaces'],
  source: ['id', 'name', 'sourceUrl', 'licence', 'licenceUrl', 'retrievedOn', 'tier', 'permission', 'credit', 'notes'],
  asset: ['id', 'label', 'path', 'kind', 'sourceIds', 'dependsOn', 'bytes', 'mode', 'notes'],
  surface: ['id', 'label', 'route', 'locale', 'assetIds', 'notices', 'keyboard', 'screenReader', 'focusVisible', 'minimumTargetPx', 'notes'],
  notice: ['sourceId', 'text', 'position', 'observedOn', 'visible', 'readable'],
});
export class DependencyInputError extends Error {
  constructor(code, path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'DependencyInputError';
    this.code = code;
    this.path = path;
  }
}
function fail(code, path, reason) { throw new DependencyInputError(code, path, reason); }
function object(value, path, schema) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('SHAPE', path, 'Expected a plain object');
  }
  for (const field of Object.keys(value)) if (!schema.includes(field)) fail('EXTRA_FIELD', `${path}.${field}`, 'Unexpected field');
  for (const field of schema) if (!Object.hasOwn(value, field)) fail('MISSING_FIELD', `${path}.${field}`, 'Missing field');
}
function text(value, path, max = 2048, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.length === 0) || CONTROL.test(value)) {
    fail('TEXT', path, 'Invalid text');
  }
  return value;
}
function identifier(value, path) {
  if (typeof value !== 'string' || !ID.test(value)) fail('IDENTIFIER', path, 'Invalid identifier');
  return value;
}
function choice(value, set, path) {
  if (!set.includes(value)) fail('ENUM', path, `Expected one of ${set.join(', ')}`);
  return value;
}
export function isValidDate(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function date(value, path) {
  if (!isValidDate(value)) fail('DATE', path, 'Expected ISO calendar date or UNKNOWN');
  return value;
}
export function safeHttps(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && Boolean(host) && !url.username && !url.password && !url.port && !url.hash &&
      !(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/u.test(host)) &&
      !host.endsWith('.local') && !host.endsWith('.internal');
  } catch { return false; }
}
function https(value, path) {
  if (!safeHttps(value)) fail('URL', path, 'Expected a public HTTPS URL or UNKNOWN');
  return value;
}
export function safePath(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string' || value.length > 400 || value.length < 2 || !value.startsWith('/') || value.startsWith('//')) return false;
  if (/[?#\\%\u0000-\u001f\u007f]/u.test(value)) return false;
  return !value.split('/').some(segment => segment === '..' || segment === '.');
}
function path(value, at) {
  if (!safePath(value)) fail('PATH', at, 'Expected a local absolute path or UNKNOWN');
  return value;
}
function ids(value, at, maximum) {
  if (!Array.isArray(value) || value.length > maximum) fail('ARRAY', at, 'Invalid identifier list');
  const found = new Set();
  return value.map((item, index) => {
    const name = identifier(item, `${at}[${index}]`);
    if (found.has(name)) fail('DUPLICATE', `${at}[${index}]`, 'Repeated reference');
    found.add(name);
    return name;
  });
}
function records(value, name, maximum, parse) {
  if (!Array.isArray(value) || value.length > maximum) fail('ARRAY', name, 'Invalid collection');
  const found = new Set();
  return value.map((item, i) => {
    const record = parse(item, `${name}[${i}]`);
    if (found.has(record.id)) fail('DUPLICATE', `${name}[${i}].id`, 'Repeated identifier');
    found.add(record.id);
    return record;
  });
}
export function parseSource(row, at = 'source') {
  object(row, at, SCHEMAS.source);
  return {
    id: identifier(row.id, `${at}.id`),
    name: text(row.name, `${at}.name`, 200),
    sourceUrl: https(row.sourceUrl, `${at}.sourceUrl`),
    licence: text(row.licence, `${at}.licence`, 250),
    licenceUrl: https(row.licenceUrl, `${at}.licenceUrl`),
    retrievedOn: date(row.retrievedOn, `${at}.retrievedOn`),
    tier: choice(row.tier, TIERS, `${at}.tier`),
    permission: choice(row.permission, STATES, `${at}.permission`),
    credit: text(row.credit, `${at}.credit`, 2000),
    notes: text(row.notes, `${at}.notes`, 2000, true),
  };
}
export function parseAsset(row, at = 'asset') {
  object(row, at, SCHEMAS.asset);
  if (row.bytes !== UNKNOWN && (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 10000000000)) {
    fail('BYTES', `${at}.bytes`, 'Expected a nonnegative byte count or UNKNOWN');
  }
  return {
    id: identifier(row.id, `${at}.id`),
    label: text(row.label, `${at}.label`, 200),
    path: path(row.path, `${at}.path`),
    kind: choice(row.kind, ASSET_KINDS, `${at}.kind`),
    sourceIds: ids(row.sourceIds, `${at}.sourceIds`, LIMITS.sources),
    dependsOn: ids(row.dependsOn, `${at}.dependsOn`, LIMITS.assets),
    bytes: row.bytes,
    mode: choice(row.mode, MODES, `${at}.mode`),
    notes: text(row.notes, `${at}.notes`, 2000, true),
  };
}
export function parseNotice(row, at = 'notice') {
  object(row, at, SCHEMAS.notice);
  return {
    sourceId: identifier(row.sourceId, `${at}.sourceId`),
    text: text(row.text, `${at}.text`, 4000),
    position: choice(row.position, POSITIONS, `${at}.position`),
    observedOn: date(row.observedOn, `${at}.observedOn`),
    visible: choice(row.visible, STATES, `${at}.visible`),
    readable: choice(row.readable, STATES, `${at}.readable`),
  };
}
export function parseSurface(row, at = 'surface') {
  object(row, at, SCHEMAS.surface);
  if (row.minimumTargetPx !== UNKNOWN && (!Number.isInteger(row.minimumTargetPx) || row.minimumTargetPx < 0 || row.minimumTargetPx > 4096)) {
    fail('TARGET', `${at}.minimumTargetPx`, 'Expected integer pixels or UNKNOWN');
  }
  if (!Array.isArray(row.notices) || row.notices.length > LIMITS.notices) fail('ARRAY', `${at}.notices`, 'Invalid notice collection');
  const notices = row.notices.map((notice, index) => parseNotice(notice, `${at}.notices[${index}]`));
  const unique = new Set();
  for (const notice of notices) {
    if (unique.has(notice.sourceId)) fail('DUPLICATE', `${at}.notices`, 'Multiple notices for the same source');
    unique.add(notice.sourceId);
  }
  return {
    id: identifier(row.id, `${at}.id`),
    label: text(row.label, `${at}.label`, 200),
    route: path(row.route, `${at}.route`),
    locale: choice(row.locale, ['en', 'fr'], `${at}.locale`),
    assetIds: ids(row.assetIds, `${at}.assetIds`, LIMITS.assets),
    notices,
    keyboard: choice(row.keyboard, STATES, `${at}.keyboard`),
    screenReader: choice(row.screenReader, STATES, `${at}.screenReader`),
    focusVisible: choice(row.focusVisible, STATES, `${at}.focusVisible`),
    minimumTargetPx: row.minimumTargetPx,
    notes: text(row.notes, `${at}.notes`, 2000, true),
  };
}
export function parseInventory(input) {
  let data = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > MAX_INPUT_BYTES) fail('LIMIT', 'root', 'Input exceeds the size limit');
    try { data = JSON.parse(input); } catch { fail('JSON', 'root', 'Invalid JSON'); }
  }
  object(data, 'root', SCHEMAS.root);
  if (data.schema !== SCHEMA) fail('SCHEMA', 'root.schema', 'Unknown schema');
  const title = text(data.title, 'root.title', 200);
  const sources = records(data.sources, 'sources', LIMITS.sources, parseSource);
  const assets = records(data.assets, 'assets', LIMITS.assets, parseAsset);
  const surfaces = records(data.surfaces, 'surfaces', LIMITS.surfaces, parseSurface);
  const sourceIds = new Set(sources.map(row => row.id));
  const assetIds = new Set(assets.map(row => row.id));
  let edges = 0;
  for (const asset of assets) {
    for (const ref of asset.sourceIds) if (!sourceIds.has(ref)) fail('REFERENCE', `assets.${asset.id}.sourceIds`, ref);
    for (const ref of asset.dependsOn) if (!assetIds.has(ref)) fail('REFERENCE', `assets.${asset.id}.dependsOn`, ref);
    if (asset.dependsOn.includes(asset.id)) fail('CYCLE', `assets.${asset.id}.dependsOn`, 'Self dependency');
    edges += asset.dependsOn.length;
  }
  if (edges > LIMITS.edges) fail('LIMIT', 'assets', 'Too many dependency links');
  for (const surface of surfaces) {
    for (const ref of surface.assetIds) if (!assetIds.has(ref)) fail('REFERENCE', `surfaces.${surface.id}.assetIds`, ref);
    for (const notice of surface.notices) if (!sourceIds.has(notice.sourceId)) fail('REFERENCE', `surfaces.${surface.id}.notices`, notice.sourceId);
  }
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const visiting = new Set();
  const visited = new Set();
  function walk(idValue) {
    if (visited.has(idValue)) return;
    if (visiting.has(idValue)) fail('CYCLE', `assets.${idValue}.dependsOn`, 'Circular dependency');
    visiting.add(idValue);
    for (const dependency of byId.get(idValue).dependsOn) walk(dependency);
    visiting.delete(idValue);
    visited.add(idValue);
  }
  for (const asset of assets) walk(asset.id);
  return {schema: SCHEMA, title, sources, assets, surfaces};
}
export function emptyInventory() { return {schema: SCHEMA, title: 'Local attribution bundle', sources: [], assets: [], surfaces: []}; }
export function serializeInventory(input) { return `${JSON.stringify(parseInventory(input), null, 2)}\n`; }
export function makeSource(id = 'source1') {
  return parseSource({id, name: UNKNOWN, sourceUrl: UNKNOWN, licence: UNKNOWN, licenceUrl: UNKNOWN,
    retrievedOn: UNKNOWN, tier: UNKNOWN, permission: UNKNOWN, credit: UNKNOWN, notes: ''});
}
export function makeAsset(id = 'asset1') {
  return parseAsset({id, label: UNKNOWN, path: UNKNOWN, kind: 'other', sourceIds: [], dependsOn: [], bytes: UNKNOWN, mode: 'held', notes: ''});
}
export function makeSurface(id = 'view1', locale = 'en') {
  return parseSurface({id, label: UNKNOWN, route: UNKNOWN, locale, assetIds: [], notices: [],
    keyboard: UNKNOWN, screenReader: UNKNOWN, focusVisible: UNKNOWN, minimumTargetPx: UNKNOWN, notes: ''});
}
export function makeNotice(sourceId) {
  return parseNotice({sourceId, text: UNKNOWN, position: UNKNOWN, observedOn: UNKNOWN, visible: UNKNOWN, readable: UNKNOWN});
}
export function updateRecord(input, collection, next) {
  const inventory = parseInventory(input);
  if (!['sources', 'assets', 'surfaces'].includes(collection)) fail('COLLECTION', collection, 'Unsupported collection');
  const parser = ({sources: parseSource, assets: parseAsset, surfaces: parseSurface})[collection];
  const valid = parser(next);
  const old = inventory[collection];
  const rows = old.some(row => row.id === valid.id) ? old.map(row => row.id === valid.id ? valid : row) : [...old, valid];
  return parseInventory({...inventory, [collection]: rows});
}
export function removeRecord(input, collection, id) {
  const inventory = parseInventory(input);
  if (!['sources', 'assets', 'surfaces'].includes(collection)) fail('COLLECTION', collection, 'Unsupported collection');
  const rows = inventory[collection].filter(row => row.id !== id);
  if (rows.length === inventory[collection].length) fail('REFERENCE', `${collection}.${id}`, 'Record not found');
  return parseInventory({...inventory, [collection]: rows});
}
