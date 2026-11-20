/** Explicit, local, human-recorded attribution observations. No provider data is fetched. */
export const OBSERVATION_SCHEMA = 'map-attribution-observations/1';
export const UNKNOWN = 'UNKNOWN';
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const MAX_FILE_BYTES = 1024 * 1024;
export const LIMITS = Object.freeze({ sources: 100, views: 150, observations: 1500 });
export const SOURCE_IDS = Object.freeze(['osm', 'metrolinx', 'ltc', 'other']);
export const LOCALES = Object.freeze(['en', 'fr']);
export const STATES = Object.freeze(['yes', 'no', UNKNOWN]);
export const PLACEMENTS = Object.freeze(['beside-map', 'within-view', 'details-only', 'absent', UNKNOWN]);
export const METHOD = Object.freeze(['keyboard', 'screen-reader', 'touch', 'visual']);
export const TIERS = Object.freeze(['publisher', 'imported', 'community', 'manual', UNKNOWN]);
const OBJECT_KEYS = Object.freeze({
  root: ['schema', 'title', 'sources', 'views', 'observations'],
  source: ['id', 'provider', 'sourceUrl', 'licence', 'licenceUrl', 'retrievedOn', 'tier', 'credit', 'permission'],
  view: ['id', 'title', 'route', 'locale', 'kind', 'sourceIds', 'included'],
  observation: ['id', 'viewId', 'sourceId', 'method', 'date', 'placement', 'creditSeen', 'licenceSeen', 'legible', 'focusVisible', 'targetPx', 'noticeText', 'evidence', 'notes'],
});
const ID = /^[a-z][a-z0-9_-]{1,63}$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export class ObservationInputError extends Error {
  constructor(code, path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'ObservationInputError';
    this.code = code;
    this.path = path;
  }
}
function fail(code, path, message) { throw new ObservationInputError(code, path, message); }
function object(value, fields, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('OBJECT', path, 'Expected an object');
  }
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail('FIELD', `${path}.${key}`, 'Unexpected field');
  for (const key of fields) if (!Object.hasOwn(value, key)) fail('FIELD', `${path}.${key}`, 'Missing field');
}
function text(value, path, max = 2000, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.length === 0) || CONTROL.test(value)) {
    fail('TEXT', path, 'Invalid text');
  }
  return value;
}
function identifier(value, path) {
  if (typeof value !== 'string' || !ID.test(value)) fail('ID', path, 'Invalid identifier');
  return value;
}
function choice(value, choices, path) {
  if (!choices.includes(value)) fail('CHOICE', path, `Expected one of ${choices.join(', ')}`);
  return value;
}
export function validDate(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day;
}
function date(value, path) { if (!validDate(value)) fail('DATE', path, 'Expected YYYY-MM-DD or UNKNOWN'); return value; }
export function safeUrl(value) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.port || parsed.hash) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname)) return null;
    return parsed.href;
  } catch { return null; }
}
function url(value, path) { if (safeUrl(value) === null) fail('URL', path, 'Expected HTTPS URL or UNKNOWN'); return value; }
function route(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  text(value, path, 255);
  if (!value.startsWith('/') || value.startsWith('//') || /[?#\\]/u.test(value) || value.split('/').some(part => part === '..' || part === '.')) {
    fail('ROUTE', path, 'Expected a local absolute path');
  }
  return value;
}
function ids(value, path, max) {
  if (!Array.isArray(value) || value.length > max) fail('LIST', path, 'Invalid identifier list');
  const seen = new Set();
  return value.map((entry, i) => {
    const current = identifier(entry, `${path}[${i}]`);
    if (seen.has(current)) fail('DUPLICATE', `${path}[${i}]`, 'Repeated identifier');
    seen.add(current);
    return current;
  });
}
function rows(value, limit, key, validate) {
  if (!Array.isArray(value) || value.length > limit) fail('LIST', key, 'Invalid record count');
  const seen = new Set();
  return value.map((entry, i) => {
    const record = validate(entry, `${key}[${i}]`);
    if (seen.has(record.id)) fail('DUPLICATE', `${key}[${i}].id`, 'Repeated identifier');
    seen.add(record.id);
    return record;
  });
}
export function parseSource(value, path = 'source') {
  object(value, OBJECT_KEYS.source, path);
  return {
    id: identifier(value.id, `${path}.id`),
    provider: text(value.provider, `${path}.provider`, 180),
    sourceUrl: url(value.sourceUrl, `${path}.sourceUrl`),
    licence: text(value.licence, `${path}.licence`, 200),
    licenceUrl: url(value.licenceUrl, `${path}.licenceUrl`),
    retrievedOn: date(value.retrievedOn, `${path}.retrievedOn`),
    tier: choice(value.tier, TIERS, `${path}.tier`),
    credit: text(value.credit, `${path}.credit`, 2000),
    permission: choice(value.permission, STATES, `${path}.permission`),
  };
}
export function parseView(value, path = 'view') {
  object(value, OBJECT_KEYS.view, path);
  return {
    id: identifier(value.id, `${path}.id`),
    title: text(value.title, `${path}.title`, 180),
    route: route(value.route, `${path}.route`),
    locale: choice(value.locale, LOCALES, `${path}.locale`),
    kind: choice(value.kind, ['map', 'list', 'journey'], `${path}.kind`),
    sourceIds: ids(value.sourceIds, `${path}.sourceIds`, LIMITS.sources),
    included: choice(value.included, STATES, `${path}.included`),
  };
}
export function parseObservation(value, path = 'observation') {
  object(value, OBJECT_KEYS.observation, path);
  const target = value.targetPx;
  if (target !== UNKNOWN && (!Number.isInteger(target) || target < 0 || target > 4096)) fail('SIZE', `${path}.targetPx`, 'Invalid target size');
  return {
    id: identifier(value.id, `${path}.id`),
    viewId: identifier(value.viewId, `${path}.viewId`),
    sourceId: identifier(value.sourceId, `${path}.sourceId`),
    method: choice(value.method, METHOD, `${path}.method`),
    date: date(value.date, `${path}.date`),
    placement: choice(value.placement, PLACEMENTS, `${path}.placement`),
    creditSeen: choice(value.creditSeen, STATES, `${path}.creditSeen`),
    licenceSeen: choice(value.licenceSeen, STATES, `${path}.licenceSeen`),
    legible: choice(value.legible, STATES, `${path}.legible`),
    focusVisible: choice(value.focusVisible, STATES, `${path}.focusVisible`),
    targetPx: target,
    noticeText: text(value.noticeText, `${path}.noticeText`, 2000),
    evidence: text(value.evidence, `${path}.evidence`, 2000),
    notes: text(value.notes, `${path}.notes`, 4000, {allowEmpty: true}),
  };
}
export function parseJournal(input) {
  let value = input;
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).length > MAX_FILE_BYTES) fail('LIMIT', 'root', 'File too large');
    try { value = JSON.parse(value); } catch { fail('JSON', 'root', 'Invalid JSON'); }
  }
  object(value, OBJECT_KEYS.root, 'root');
  if (value.schema !== OBSERVATION_SCHEMA) fail('SCHEMA', 'root.schema', 'Unsupported schema');
  const result = {
    schema: OBSERVATION_SCHEMA,
    title: text(value.title, 'root.title', 200),
    sources: rows(value.sources, LIMITS.sources, 'sources', parseSource),
    views: rows(value.views, LIMITS.views, 'views', parseView),
    observations: rows(value.observations, LIMITS.observations, 'observations', parseObservation),
  };
  const sourceSet = new Set(result.sources.map(x => x.id));
  const viewSet = new Map(result.views.map(x => [x.id, x]));
  for (const view of result.views) {
    for (const sourceId of view.sourceIds) if (!sourceSet.has(sourceId)) fail('REFERENCE', `views.${view.id}.sourceIds`, 'Missing source record');
  }
  for (const observation of result.observations) {
    const view = viewSet.get(observation.viewId);
    if (!view) fail('REFERENCE', `observations.${observation.id}.viewId`, 'Missing view record');
    if (!sourceSet.has(observation.sourceId) || !view.sourceIds.includes(observation.sourceId)) {
      fail('REFERENCE', `observations.${observation.id}.sourceId`, 'Source is not used by the view');
    }
  }
  return result;
}
export function emptyJournal() {
  return {schema: OBSERVATION_SCHEMA, title: 'Local notice observations', sources: [], views: [], observations: []};
}
export function newObservation(viewId, sourceId, method, id) {
  identifier(viewId, 'viewId'); identifier(sourceId, 'sourceId'); identifier(id, 'id');
  choice(method, METHOD, 'method');
  return {id, viewId, sourceId, method, date: UNKNOWN, placement: UNKNOWN,
    creditSeen: UNKNOWN, licenceSeen: UNKNOWN, legible: UNKNOWN, focusVisible: UNKNOWN,
    targetPx: UNKNOWN, noticeText: UNKNOWN, evidence: UNKNOWN, notes: ''};
}
export function replaceObservation(journal, candidate) {
  const current = parseJournal(journal);
  const item = parseObservation(candidate);
  const existing = current.observations.filter(x => x.id !== item.id);
  return parseJournal({...current, observations: [...existing, item]});
}
export function removeObservation(journal, id) {
  const current = parseJournal(journal);
  return parseJournal({...current, observations: current.observations.filter(x => x.id !== id)});
}
export function serializeJournal(journal) { return `${JSON.stringify(parseJournal(journal), null, 2)}\n`; }
export function observationKey(viewId, sourceId, method) { return `${viewId}\u001f${sourceId}\u001f${method}`; }
export function observationIndex(journal) {
  const index = new Map();
  for (const row of parseJournal(journal).observations) {
    const key = observationKey(row.viewId, row.sourceId, row.method);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}
