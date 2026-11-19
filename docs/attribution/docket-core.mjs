/** Explicit, local-only licence evidence docket. No ambient clock or network operations. */
export const DOCKET_SCHEMA = 'attribution-recheck-docket/1';
export const UNKNOWN = 'UNKNOWN';
export const MAX_BYTES = 2_097_152;
export const LIMITS = Object.freeze({ records: 400, surfaces: 500, evidence: 1200, text: 4000 });
export const PROVIDERS = Object.freeze(['osm', 'metrolinx', 'ltc', 'other']);
export const LICENCES = Object.freeze(['ODbL-1.0', 'Metrolinx-AUA', 'OGL-Ontario-Metrolinx', 'LTC-Open-Data-Terms', 'OTHER-OPEN', UNKNOWN]);
export const STATES = Object.freeze(['included', 'held', 'excluded']);
export const TRI = Object.freeze(['YES', 'NO', UNKNOWN]);
export const TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const REVIEW_STATES = Object.freeze(['pending', 'accepted', 'rejected', 'needs-evidence']);
export const PLACEMENTS = Object.freeze(['map', 'journey', 'list', 'download', 'other']);

export class DocketInputError extends Error {
  constructor(path, detail) {
    super(`${path}: ${detail}`);
    this.name = 'DocketInputError';
    this.path = path;
  }
}
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DocketInputError(path, 'Expected an object');
  }
  return value;
}
function exact(obj, keys, path) {
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) throw new DocketInputError(`${path}.${key}`, 'Unexpected field');
  }
  for (const key of keys) {
    if (!own(obj, key)) throw new DocketInputError(`${path}.${key}`, 'Missing required field');
  }
}
function controls(value, path, multiline = false) {
  for (let n = 0; n < value.length; n += 1) {
    const code = value.charCodeAt(n);
    if ((code < 32 && !(multiline && (code === 10 || code === 13))) || code === 127) {
      throw new DocketInputError(path, 'Control character in text');
    }
  }
}
export function boundedText(value, path, options = {}) {
  const { max = LIMITS.text, empty = false, multiline = false } = options;
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) {
    throw new DocketInputError(path, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new DocketInputError(path, 'Expected NFC text');
  controls(value, path, multiline);
  return value;
}
export function id(value, path = 'id') {
  const result = boundedText(value, path, { max: 64 });
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) {
    throw new DocketInputError(path, 'Expected lowercase identifier');
  }
  return result;
}
export function choice(value, values, path) {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new DocketInputError(path, `Expected one of ${values.join(', ')}`);
  }
  return value;
}
export function isoDate(value, path = 'date') {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new DocketInputError(path, 'Expected ISO date or UNKNOWN');
  }
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12) {
    throw new DocketInputError(path, 'Invalid calendar date');
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) throw new DocketInputError(path, 'Invalid calendar date');
  return value;
}
export function publicUrl(value, path = 'url') {
  if (value === UNKNOWN) return UNKNOWN;
  const text = boundedText(value, path, { max: 2048 });
  let url;
  try { url = new URL(text); } catch { throw new DocketInputError(path, 'Invalid URL'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash ||
    url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.local') || url.hostname === '[::1]' ||
    /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/u.test(url.hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./u.test(url.hostname)) {
    throw new DocketInputError(path, 'Expected public HTTPS URL');
  }
  return text;
}
function finiteTarget(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
    throw new DocketInputError(path, 'Expected integer pixels or UNKNOWN');
  }
  return value;
}
function list(value, path, max, parse) {
  if (!Array.isArray(value) || value.length > max) throw new DocketInputError(path, 'Expected bounded array');
  return value.map((item, index) => parse(item, `${path}[${index}]`));
}
function unique(items, path, key = (x) => x) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new DocketInputError(path, `Repeated identity: ${value}`);
    seen.add(value);
  }
  return items;
}
function ids(value, path) {
  return unique(list(value, path, 500, id), path);
}
function evidence(value, path) {
  const v = object(value, path);
  exact(v, ['id', 'sourceId', 'title', 'url', 'tier', 'observedOn', 'recordedOn', 'licenceUrl', 'summary'], path);
  return {
    id: id(v.id, `${path}.id`),
    sourceId: id(v.sourceId, `${path}.sourceId`),
    title: boundedText(v.title, `${path}.title`, { max: 180 }),
    url: publicUrl(v.url, `${path}.url`),
    tier: choice(v.tier, TIERS, `${path}.tier`),
    observedOn: isoDate(v.observedOn, `${path}.observedOn`),
    recordedOn: isoDate(v.recordedOn, `${path}.recordedOn`),
    licenceUrl: publicUrl(v.licenceUrl, `${path}.licenceUrl`),
    summary: boundedText(v.summary, `${path}.summary`, { max: 2000, empty: true, multiline: true }),
  };
}
function source(value, path) {
  const v = object(value, path);
  exact(v, ['id', 'provider', 'name', 'licence', 'licenceName', 'sourceUrl', 'licenceUrl',
    'permission', 'licenceEvidence', 'datasetDate', 'acquiredOn', 'termsReviewedOn',
    'reviewDueOn', 'notice', 'tier', 'state', 'evidenceIds'], path);
  return {
    id: id(v.id, `${path}.id`),
    provider: choice(v.provider, PROVIDERS, `${path}.provider`),
    name: boundedText(v.name, `${path}.name`, { max: 160 }),
    licence: choice(v.licence, LICENCES, `${path}.licence`),
    licenceName: boundedText(v.licenceName, `${path}.licenceName`, { max: 180 }),
    sourceUrl: publicUrl(v.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: publicUrl(v.licenceUrl, `${path}.licenceUrl`),
    permission: choice(v.permission, TRI, `${path}.permission`),
    licenceEvidence: choice(v.licenceEvidence, TRI, `${path}.licenceEvidence`),
    datasetDate: isoDate(v.datasetDate, `${path}.datasetDate`),
    acquiredOn: isoDate(v.acquiredOn, `${path}.acquiredOn`),
    termsReviewedOn: isoDate(v.termsReviewedOn, `${path}.termsReviewedOn`),
    reviewDueOn: isoDate(v.reviewDueOn, `${path}.reviewDueOn`),
    notice: boundedText(v.notice, `${path}.notice`, { max: LIMITS.text, empty: true, multiline: true }),
    tier: choice(v.tier, TIERS, `${path}.tier`),
    state: choice(v.state, STATES, `${path}.state`),
    evidenceIds: ids(v.evidenceIds, `${path}.evidenceIds`),
  };
}
function surface(value, path) {
  const v = object(value, path);
  exact(v, ['id', 'title', 'locale', 'kind', 'sourceIds', 'offline', 'mapCredit',
    'keyboard', 'screenReader', 'targetPx', 'publishedOn'], path);
  return {
    id: id(v.id, `${path}.id`),
    title: boundedText(v.title, `${path}.title`, { max: 180 }),
    locale: choice(v.locale, ['en', 'fr'], `${path}.locale`),
    kind: choice(v.kind, PLACEMENTS, `${path}.kind`),
    sourceIds: ids(v.sourceIds, `${path}.sourceIds`),
    offline: choice(v.offline, TRI, `${path}.offline`),
    mapCredit: choice(v.mapCredit, TRI, `${path}.mapCredit`),
    keyboard: choice(v.keyboard, TRI, `${path}.keyboard`),
    screenReader: choice(v.screenReader, TRI, `${path}.screenReader`),
    targetPx: finiteTarget(v.targetPx, `${path}.targetPx`),
    publishedOn: isoDate(v.publishedOn, `${path}.publishedOn`),
  };
}
function decision(value, path) {
  const v = object(value, path);
  exact(v, ['id', 'sourceId', 'state', 'decidedOn', 'reason', 'evidenceIds', 'actorRole'], path);
  return {
    id: id(v.id, `${path}.id`),
    sourceId: id(v.sourceId, `${path}.sourceId`),
    state: choice(v.state, REVIEW_STATES, `${path}.state`),
    decidedOn: isoDate(v.decidedOn, `${path}.decidedOn`),
    reason: boundedText(v.reason, `${path}.reason`, { max: 1500, empty: true, multiline: true }),
    evidenceIds: ids(v.evidenceIds, `${path}.evidenceIds`),
    actorRole: boundedText(v.actorRole, `${path}.actorRole`, { max: 80 }),
  };
}
export function parseDocket(value) {
  const v = object(value, 'docket');
  exact(v, ['schema', 'releaseId', 'asOf', 'sources', 'evidence', 'surfaces', 'decisions'], 'docket');
  if (v.schema !== DOCKET_SCHEMA) throw new DocketInputError('docket.schema', 'Unsupported schema');
  const sources = unique(list(v.sources, 'docket.sources', LIMITS.records, source), 'docket.sources', (x) => x.id);
  const items = unique(list(v.evidence, 'docket.evidence', LIMITS.evidence, evidence), 'docket.evidence', (x) => x.id);
  const surfaces = unique(list(v.surfaces, 'docket.surfaces', LIMITS.surfaces, surface), 'docket.surfaces', (x) => x.id);
  const decisions = unique(list(v.decisions, 'docket.decisions', LIMITS.records * 2, decision), 'docket.decisions', (x) => x.id);
  return { schema: DOCKET_SCHEMA, releaseId: id(v.releaseId, 'docket.releaseId'),
    asOf: isoDate(v.asOf, 'docket.asOf'), sources, evidence: items, surfaces, decisions };
}
export function parseDocketJson(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BYTES) {
    throw new DocketInputError('docket', 'JSON exceeds size limit');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new DocketInputError('docket', 'Invalid JSON'); }
  return parseDocket(value);
}
export function stableDocketJson(docket) {
  return `${JSON.stringify(parseDocket(docket), null, 2)}\n`;
}
