/** Offline attribution handoff contract. The parser performs no network or disk I/O. */
export const HANDOFF_SCHEMA = 'attribution-handoff/1';
export const MAX_HANDOFF_BYTES = 2_097_152;
export const MAX_HANDOFF_RECORDS = 500;
export const UNKNOWN = 'UNKNOWN';
export const PROVIDERS = Object.freeze(['osm', 'metrolinx-aua', 'metrolinx-ogl', 'ltc', 'other']);
export const TIERS = Object.freeze(['primary', 'secondary', 'community', 'UNKNOWN']);
export const PERMISSIONS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const STATES = Object.freeze(['included', 'held', 'excluded']);
export const MODES = Object.freeze(['map', 'journey', 'list', 'download', 'other']);
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ROOT_KEYS = ['schema', 'releaseId', 'policy', 'sources', 'surfaces', 'handoffs'];
const POLICY_KEYS = ['audience', 'purposeEn', 'purposeFr', 'retention', 'contact', 'reviewDate'];
const SOURCE_KEYS = [
  'id', 'provider', 'name', 'sourceUrl', 'licenceName', 'licenceUrl', 'permission',
  'tier', 'datasetDate', 'acquiredDate', 'termsDate', 'notice', 'status', 'evidenceUrl',
];
const SURFACE_KEYS = [
  'id', 'mode', 'locale', 'sourceIds', 'offline', 'keyboard', 'screenReader',
  'mapCredit', 'targetPx', 'publicationDate',
];
const HANDOFF_KEYS = [
  'id', 'surfaceIds', 'sourceIds', 'recipient', 'purpose', 'format', 'scope',
  'approval', 'approvedDate', 'expiresDate', 'digest',
];
const RETENTION = ['ephemeral', 'explicit-export', 'UNKNOWN'];
const AUDIENCES = ['internal', 'public', 'UNKNOWN'];
const FORMATS = ['json', 'text', 'html'];
const SCOPES = ['attribution-only', 'source-summary', 'UNKNOWN'];

export class HandoffInputError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'HandoffInputError';
    this.path = path;
  }
}
export function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
export function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HandoffInputError(path, 'Expected an object');
  }
  return value;
}
export function exactKeys(value, keys, path) {
  const found = Object.keys(value);
  for (const name of keys) if (!own(value, name)) throw new HandoffInputError(`${path}.${name}`, 'Missing field');
  for (const name of found) if (!keys.includes(name)) throw new HandoffInputError(`${path}.${name}`, 'Unexpected field');
}
export function choice(value, allowed, path) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new HandoffInputError(path, `Expected ${allowed.join(' | ')}`);
  }
  return value;
}
export function text(value, path, limit = 512, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim())) {
    throw new HandoffInputError(path, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new HandoffInputError(path, 'Expected NFC text');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new HandoffInputError(path, 'Control character');
  }
  return value;
}
export function id(value, path) {
  const result = text(value, path, 64);
  if (!ID_PATTERN.test(result)) throw new HandoffInputError(path, 'Invalid identifier');
  return result;
}
export function date(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new HandoffInputError(path, 'Expected ISO date or UNKNOWN');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) {
    throw new HandoffInputError(path, 'Invalid calendar date');
  }
  return value;
}
export function url(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const raw = text(value, path, 2048);
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new HandoffInputError(path, 'Invalid URL'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || !host || parsed.username || parsed.password || parsed.hash ||
      host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') ||
      host === '[::1]' || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/u.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)) {
    throw new HandoffInputError(path, 'Public HTTPS URL required');
  }
  return raw;
}
export function array(value, path, max = MAX_HANDOFF_RECORDS) {
  if (!Array.isArray(value) || value.length > max) throw new HandoffInputError(path, 'Expected bounded array');
  return value;
}
export function ids(value, path) {
  const entries = array(value, path, 500).map((entry, index) => id(entry, `${path}[${index}]`));
  if (new Set(entries).size !== entries.length) throw new HandoffInputError(path, 'Duplicate identifier');
  return entries;
}
export function pixels(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
    throw new HandoffInputError(path, 'Expected whole pixels or UNKNOWN');
  }
  return value;
}
export function digest(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new HandoffInputError(path, 'Expected SHA-256 lowercase hex or UNKNOWN');
  }
  return value;
}
export function parsePolicy(value, path = 'policy') {
  const entry = object(value, path);
  exactKeys(entry, POLICY_KEYS, path);
  return {
    audience: choice(entry.audience, AUDIENCES, `${path}.audience`),
    purposeEn: text(entry.purposeEn, `${path}.purposeEn`, 800),
    purposeFr: text(entry.purposeFr, `${path}.purposeFr`, 800),
    retention: choice(entry.retention, RETENTION, `${path}.retention`),
    contact: choice(entry.contact, ['none', 'public-source-link'], `${path}.contact`),
    reviewDate: date(entry.reviewDate, `${path}.reviewDate`),
  };
}
export function parseSource(value, path = 'source') {
  const entry = object(value, path);
  exactKeys(entry, SOURCE_KEYS, path);
  return {
    id: id(entry.id, `${path}.id`),
    provider: choice(entry.provider, PROVIDERS, `${path}.provider`),
    name: text(entry.name, `${path}.name`, 160),
    sourceUrl: url(entry.sourceUrl, `${path}.sourceUrl`),
    licenceName: text(entry.licenceName, `${path}.licenceName`, 180),
    licenceUrl: url(entry.licenceUrl, `${path}.licenceUrl`),
    permission: choice(entry.permission, PERMISSIONS, `${path}.permission`),
    tier: choice(entry.tier, TIERS, `${path}.tier`),
    datasetDate: date(entry.datasetDate, `${path}.datasetDate`),
    acquiredDate: date(entry.acquiredDate, `${path}.acquiredDate`),
    termsDate: date(entry.termsDate, `${path}.termsDate`),
    notice: text(entry.notice, `${path}.notice`, 5000, true),
    status: choice(entry.status, STATES, `${path}.status`),
    evidenceUrl: url(entry.evidenceUrl, `${path}.evidenceUrl`),
  };
}
export function parseSurface(value, path = 'surface') {
  const entry = object(value, path);
  exactKeys(entry, SURFACE_KEYS, path);
  return {
    id: id(entry.id, `${path}.id`),
    mode: choice(entry.mode, MODES, `${path}.mode`),
    locale: choice(entry.locale, LANGUAGES, `${path}.locale`),
    sourceIds: ids(entry.sourceIds, `${path}.sourceIds`),
    offline: choice(entry.offline, PERMISSIONS, `${path}.offline`),
    keyboard: choice(entry.keyboard, PERMISSIONS, `${path}.keyboard`),
    screenReader: choice(entry.screenReader, PERMISSIONS, `${path}.screenReader`),
    mapCredit: choice(entry.mapCredit, PERMISSIONS, `${path}.mapCredit`),
    targetPx: pixels(entry.targetPx, `${path}.targetPx`),
    publicationDate: date(entry.publicationDate, `${path}.publicationDate`),
  };
}
export function parseHandoff(value, path = 'handoff') {
  const entry = object(value, path);
  exactKeys(entry, HANDOFF_KEYS, path);
  return {
    id: id(entry.id, `${path}.id`),
    surfaceIds: ids(entry.surfaceIds, `${path}.surfaceIds`),
    sourceIds: ids(entry.sourceIds, `${path}.sourceIds`),
    recipient: choice(entry.recipient, ['local-device', 'public-download', 'UNKNOWN'], `${path}.recipient`),
    purpose: text(entry.purpose, `${path}.purpose`, 600),
    format: choice(entry.format, FORMATS, `${path}.format`),
    scope: choice(entry.scope, SCOPES, `${path}.scope`),
    approval: choice(entry.approval, PERMISSIONS, `${path}.approval`),
    approvedDate: date(entry.approvedDate, `${path}.approvedDate`),
    expiresDate: date(entry.expiresDate, `${path}.expiresDate`),
    digest: digest(entry.digest, `${path}.digest`),
  };
}
function distinct(records, path) {
  const ids = records.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new HandoffInputError(path, 'Duplicate record ID');
}
export function parseHandoffPack(value) {
  const entry = object(value, 'pack');
  exactKeys(entry, ROOT_KEYS, 'pack');
  if (entry.schema !== HANDOFF_SCHEMA) throw new HandoffInputError('pack.schema', 'Unsupported version');
  const sources = array(entry.sources, 'pack.sources').map((item, index) => parseSource(item, `sources[${index}]`));
  const surfaces = array(entry.surfaces, 'pack.surfaces').map((item, index) => parseSurface(item, `surfaces[${index}]`));
  const handoffs = array(entry.handoffs, 'pack.handoffs').map((item, index) => parseHandoff(item, `handoffs[${index}]`));
  distinct(sources, 'sources');
  distinct(surfaces, 'surfaces');
  distinct(handoffs, 'handoffs');
  return {
    schema: HANDOFF_SCHEMA,
    releaseId: id(entry.releaseId, 'pack.releaseId'),
    policy: parsePolicy(entry.policy),
    sources,
    surfaces,
    handoffs,
  };
}
export function parseHandoffJson(raw) {
  if (typeof raw !== 'string') throw new HandoffInputError('pack', 'Expected JSON text');
  if (new TextEncoder().encode(raw).byteLength > MAX_HANDOFF_BYTES) {
    throw new HandoffInputError('pack', 'File exceeds size limit');
  }
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new HandoffInputError('pack', 'Invalid JSON'); }
  return parseHandoffPack(payload);
}
export function stableHandoffJson(pack) {
  return `${JSON.stringify(parseHandoffPack(pack), null, 2)}\n`;
}
export function sourceById(pack, sourceId) {
  return pack.sources.find((entry) => entry.id === sourceId) ?? null;
}
export function surfaceById(pack, surfaceId) {
  return pack.surfaces.find((entry) => entry.id === surfaceId) ?? null;
}
export function reachableSources(pack, handoff) {
  const direct = new Set(handoff.sourceIds);
  for (const surfaceId of handoff.surfaceIds) {
    const surface = surfaceById(pack, surfaceId);
    for (const sourceId of surface?.sourceIds ?? []) direct.add(sourceId);
  }
  return [...direct].sort();
}
export function handoffsForSurface(pack, surfaceId) {
  return pack.handoffs.filter((handoff) => handoff.surfaceIds.includes(surfaceId));
}
export function handoffsForSource(pack, sourceId) {
  return pack.handoffs.filter((handoff) => reachableSources(pack, handoff).includes(sourceId));
}
export function distributionIndex(pack) {
  const result = {};
  for (const source of pack.sources) result[source.id] = handoffsForSource(pack, source.id).map((item) => item.id);
  return result;
}
