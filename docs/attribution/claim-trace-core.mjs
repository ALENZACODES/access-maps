/** Offline claim-to-source trace contract. No I/O, clocks, or network. */
import { SOURCES } from './attribution-utils.mjs';

export const CLAIM_SCHEMA = 'attribution-claim-trace/1';
export const CLAIM_UNKNOWN = 'UNKNOWN';
export const CLAIM_MAX_BYTES = 2_097_152;
export const CLAIM_LIMITS = Object.freeze({ sources: 500, claims: 2000, surfaces: 300, references: 3000 });
export const CLAIM_STATES = Object.freeze(['included', 'held', 'excluded']);
export const CLAIM_TIERS = Object.freeze(['primary', 'secondary', 'community', 'UNKNOWN']);
export const CLAIM_PERMISSIONS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const CLAIM_KINDS = Object.freeze(['accessibility', 'service', 'place', 'travel', 'other']);
export const CLAIM_FAMILIES = Object.freeze(['osm', 'metrolinx-aua', 'metrolinx-ogl', 'ltc', 'other']);

export class ClaimInputError extends Error {
  constructor(path, description) {
    super(`${path}: ${description}`);
    this.name = 'ClaimInputError';
    this.path = path;
  }
}

function fail(path, detail) { throw new ClaimInputError(path, detail); }
function record(input, path) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(path, 'Expected object');
  return input;
}
function keys(input, expected, path) {
  for (const key of Object.keys(input)) if (!expected.includes(key)) fail(`${path}.${key}`, 'Unexpected field');
  for (const key of expected) if (!Object.hasOwn(input, key)) fail(`${path}.${key}`, 'Missing field');
}
function safeText(input, path, max, allowEmpty = false) {
  if (typeof input !== 'string' || input.length > max || (!allowEmpty && !input.trim())) fail(path, 'Invalid text length');
  if (input.normalize('NFC') !== input) fail(path, 'Text must use NFC');
  for (const c of input) {
    const n = c.codePointAt(0);
    if (n === undefined || n === 127 || (n < 32 && n !== 9 && n !== 10 && n !== 13)) fail(path, 'Control character');
  }
  return input;
}
function id(input, path) {
  const value = safeText(input, path, 80);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) fail(path, 'Invalid identifier');
  return value;
}
function choice(input, list, path) {
  if (typeof input !== 'string' || !list.includes(input)) fail(path, `Expected ${list.join(', ')}`);
  return input;
}
function date(input, path) {
  if (input === CLAIM_UNKNOWN) return input;
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(input)) fail(path, 'Expected ISO date or UNKNOWN');
  const year = Number(input.slice(0, 4));
  const month = Number(input.slice(5, 7));
  const day = Number(input.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail(path, 'Invalid calendar date');
  return input;
}
function publicUrl(input, path) {
  if (input === CLAIM_UNKNOWN) return input;
  const value = safeText(input, path, 2048);
  let url;
  try { url = new URL(value); } catch { fail(path, 'Malformed URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') ||
      /^(?:\[::1\]|\[fe80:)/iu.test(url.hostname) || /^(?:127\.|10\.|192\.168\.|169\.254\.)/u.test(url.hostname) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./u.test(url.hostname)) fail(path, 'Public HTTPS URL required');
  return value;
}
function list(input, path, maximum, transform) {
  if (!Array.isArray(input) || input.length > maximum) fail(path, 'Expected bounded array');
  return input.map((item, index) => transform(item, `${path}[${index}]`));
}
function unique(items, path, extract = (value) => value) {
  const found = new Set();
  for (const item of items) {
    const key = extract(item);
    if (found.has(key)) fail(path, `Duplicate ${key}`);
    found.add(key);
  }
  return items;
}
function ids(input, path, limit = 500) { return unique(list(input, path, limit, id), path); }
function positiveTarget(input, path) {
  if (input === CLAIM_UNKNOWN) return input;
  if (!Number.isInteger(input) || input < 0 || input > 1000) fail(path, 'Expected pixels or UNKNOWN');
  return input;
}

export function parseClaimSource(input, path = 'source') {
  const value = record(input, path);
  keys(value, ['id', 'provider', 'family', 'name', 'url', 'licence', 'licenceUrl', 'permission', 'tier', 'acquiredDate', 'datasetDate', 'termsDate', 'notice', 'state'], path);
  return {
    id: id(value.id, `${path}.id`),
    provider: choice(value.provider, ['osm', 'metrolinx', 'ltc', 'other'], `${path}.provider`),
    family: choice(value.family, CLAIM_FAMILIES, `${path}.family`),
    name: safeText(value.name, `${path}.name`, 200),
    url: publicUrl(value.url, `${path}.url`),
    licence: safeText(value.licence, `${path}.licence`, 200),
    licenceUrl: publicUrl(value.licenceUrl, `${path}.licenceUrl`),
    permission: choice(value.permission, CLAIM_PERMISSIONS, `${path}.permission`),
    tier: choice(value.tier, CLAIM_TIERS, `${path}.tier`),
    acquiredDate: date(value.acquiredDate, `${path}.acquiredDate`),
    datasetDate: date(value.datasetDate, `${path}.datasetDate`),
    termsDate: date(value.termsDate, `${path}.termsDate`),
    notice: safeText(value.notice, `${path}.notice`, 8000, true),
    state: choice(value.state, CLAIM_STATES, `${path}.state`),
  };
}
export function parseClaimReference(input, path = 'reference') {
  const value = record(input, path);
  keys(value, ['id', 'sourceId', 'url', 'title', 'date', 'tier', 'excerpt', 'language'], path);
  return {
    id: id(value.id, `${path}.id`),
    sourceId: id(value.sourceId, `${path}.sourceId`),
    url: publicUrl(value.url, `${path}.url`),
    title: safeText(value.title, `${path}.title`, 200),
    date: date(value.date, `${path}.date`),
    tier: choice(value.tier, CLAIM_TIERS, `${path}.tier`),
    excerpt: safeText(value.excerpt, `${path}.excerpt`, 1000, true),
    language: choice(value.language, ['en', 'fr', 'UNKNOWN'], `${path}.language`),
  };
}
export function parseClaimStatement(input, path = 'claim') {
  const value = record(input, path);
  keys(value, ['id', 'kind', 'sourceIds', 'referenceIds', 'text', 'language', 'observedDate', 'status', 'disclosure', 'notes'], path);
  return {
    id: id(value.id, `${path}.id`),
    kind: choice(value.kind, CLAIM_KINDS, `${path}.kind`),
    sourceIds: ids(value.sourceIds, `${path}.sourceIds`),
    referenceIds: ids(value.referenceIds, `${path}.referenceIds`),
    text: safeText(value.text, `${path}.text`, 2000),
    language: choice(value.language, ['en', 'fr'], `${path}.language`),
    observedDate: date(value.observedDate, `${path}.observedDate`),
    status: choice(value.status, CLAIM_STATES, `${path}.status`),
    disclosure: choice(value.disclosure, ['evidence', 'unknown', 'unsupported'], `${path}.disclosure`),
    notes: safeText(value.notes, `${path}.notes`, 1500, true),
  };
}
export function parseClaimSurface(input, path = 'surface') {
  const value = record(input, path);
  keys(value, ['id', 'language', 'route', 'claimIds', 'sourceIds', 'offline', 'keyboard', 'screenReader', 'targetPx', 'mapCredit', 'publishedDate'], path);
  return {
    id: id(value.id, `${path}.id`),
    language: choice(value.language, ['en', 'fr'], `${path}.language`),
    route: safeText(value.route, `${path}.route`, 300),
    claimIds: ids(value.claimIds, `${path}.claimIds`, CLAIM_LIMITS.claims),
    sourceIds: ids(value.sourceIds, `${path}.sourceIds`),
    offline: choice(value.offline, CLAIM_PERMISSIONS, `${path}.offline`),
    keyboard: choice(value.keyboard, CLAIM_PERMISSIONS, `${path}.keyboard`),
    screenReader: choice(value.screenReader, CLAIM_PERMISSIONS, `${path}.screenReader`),
    targetPx: positiveTarget(value.targetPx, `${path}.targetPx`),
    mapCredit: choice(value.mapCredit, CLAIM_PERMISSIONS, `${path}.mapCredit`),
    publishedDate: date(value.publishedDate, `${path}.publishedDate`),
  };
}
export function parseClaimTrace(input) {
  const root = record(input, 'trace');
  keys(root, ['schema', 'releaseId', 'sources', 'references', 'claims', 'surfaces'], 'trace');
  if (root.schema !== CLAIM_SCHEMA) fail('trace.schema', 'Unsupported schema');
  return {
    schema: CLAIM_SCHEMA,
    releaseId: id(root.releaseId, 'trace.releaseId'),
    sources: unique(list(root.sources, 'trace.sources', CLAIM_LIMITS.sources, parseClaimSource), 'trace.sources', (item) => item.id),
    references: unique(list(root.references, 'trace.references', CLAIM_LIMITS.references, parseClaimReference), 'trace.references', (item) => item.id),
    claims: unique(list(root.claims, 'trace.claims', CLAIM_LIMITS.claims, parseClaimStatement), 'trace.claims', (item) => item.id),
    surfaces: unique(list(root.surfaces, 'trace.surfaces', CLAIM_LIMITS.surfaces, parseClaimSurface), 'trace.surfaces', (item) => item.id),
  };
}
export function parseClaimTraceJson(value) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > CLAIM_MAX_BYTES) fail('trace', 'JSON exceeds limit');
  let parsed;
  try { parsed = JSON.parse(value); } catch { fail('trace', 'Invalid JSON'); }
  return parseClaimTrace(parsed);
}
export function catalogueSource(provider) { return Object.hasOwn(SOURCES, provider) ? SOURCES[provider] : null; }

export function serialiseClaimTrace(trace) { return `${JSON.stringify(parseClaimTrace(trace), null, 2)}\n`; }
