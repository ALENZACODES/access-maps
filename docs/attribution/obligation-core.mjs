/** Explicit, offline, read-only publication-obligation evidence contract. */
export const OBLIGATION_SCHEMA = 'attribution-obligation-register/1';
export const OBLIGATION_UNKNOWN = 'UNKNOWN';
export const MAX_OBLIGATION_BYTES = 2_097_152;
export const MAX_OBLIGATION_RECORDS = 600;
export const MAX_OBLIGATION_PAGES = 400;
export const MAX_OBLIGATION_PLACEMENTS = 2400;
export const MAX_OBLIGATION_WITNESSES = 3000;
export const OBLIGATION_PROVIDERS = Object.freeze(['osm', 'metrolinx-aua', 'metrolinx-ogl', 'ltc', 'other']);
export const OBLIGATION_STATES = Object.freeze(['YES', 'NO', OBLIGATION_UNKNOWN]);
export const OBLIGATION_TIERS = Object.freeze(['primary', 'secondary', 'community', OBLIGATION_UNKNOWN]);
export const OBLIGATION_LIFECYCLE = Object.freeze(['included', 'held', 'excluded']);
export const OBLIGATION_DISPLAYS = Object.freeze(['map', 'journey', 'list', 'download', 'other']);
export const OBLIGATION_KINDS = Object.freeze(['credit', 'licence', 'terms', 'laws', 'disclosure']);
export const OBLIGATION_VISIBILITY = Object.freeze(['visible', 'visually-hidden', 'absent', OBLIGATION_UNKNOWN]);
export const OBLIGATION_WITNESS_TYPES = Object.freeze(['source-document', 'local-screenshot', 'local-test', 'editor-note']);

const ROOT_KEYS = ['schema', 'releaseId', 'sources', 'pages', 'placements', 'witnesses'];
const SOURCE_KEYS = ['id', 'provider', 'title', 'sourceUrl', 'licenceUrl', 'licenceName', 'licenceId', 'permission', 'tier', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'attribution', 'state'];
const PAGE_KEYS = ['id', 'path', 'locale', 'display', 'sourceIds', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedOn'];
const PLACEMENT_KEYS = ['id', 'pageId', 'sourceId', 'kind', 'notice', 'elementId', 'visibility', 'nearMap', 'witnessIds'];
const WITNESS_KEYS = ['id', 'sourceId', 'url', 'recordedOn', 'tier', 'type', 'note'];

export class ObligationInputError extends Error {
  constructor(path, detail) {
    super(`${path}: ${detail}`);
    this.name = 'ObligationInputError';
    this.path = path;
  }
}
function record(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ObligationInputError(path, 'Expected object');
  }
  return value;
}
function keys(value, expected, path) {
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) throw new ObligationInputError(`${path}.${key}`, 'Unknown field');
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) throw new ObligationInputError(`${path}.${key}`, 'Missing field');
  }
}
function string(value, path, max = 400, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw new ObligationInputError(path, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new ObligationInputError(path, 'Expected NFC text');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new ObligationInputError(path, 'Control characters are not allowed');
  }
  return value;
}
function identifier(value, path) {
  const result = string(value, path, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) {
    throw new ObligationInputError(path, 'Expected lower-case hyphenated identifier');
  }
  return result;
}
function option(value, choices, path) {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new ObligationInputError(path, `Expected ${choices.join(', ')}`);
  }
  return value;
}
function date(value, path) {
  if (value === OBLIGATION_UNKNOWN) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new ObligationInputError(path, 'Expected ISO calendar date or UNKNOWN');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) {
    throw new ObligationInputError(path, 'Invalid calendar date');
  }
  return value;
}
function url(value, path) {
  if (value === OBLIGATION_UNKNOWN) return value;
  const text = string(value, path, 2048);
  let parsed;
  try { parsed = new URL(text); } catch { throw new ObligationInputError(path, 'Invalid address'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash) {
    throw new ObligationInputError(path, 'Only public HTTPS addresses are accepted');
  }
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local')) {
    throw new ObligationInputError(path, 'Local addresses are not accepted');
  }
  if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/u.test(parsed.hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(parsed.hostname)) {
    throw new ObligationInputError(path, 'Private addresses are not accepted');
  }
  if (parsed.hostname.includes(':') || /^\d+(?:\.\d+){3}$/u.test(parsed.hostname)) {
    throw new ObligationInputError(path, 'Use an HTTPS hostname');
  }
  return text;
}
function path(value, at) {
  const text = string(value, at, 360);
  if (text.startsWith('/') || text.includes('\\') || text.includes('?') || text.includes('#') || text.includes('//')) {
    throw new ObligationInputError(at, 'Use a clean relative route');
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(text)) throw new ObligationInputError(at, 'No URI schemes');
  const parts = text.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw new ObligationInputError(at, 'Invalid or traversing route segment');
  }
  if (parts.some(part => !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/u.test(part))) {
    throw new ObligationInputError(at, 'Unsupported path character');
  }
  return text;
}
function list(value, at, max) {
  if (!Array.isArray(value) || value.length > max) throw new ObligationInputError(at, 'Expected bounded array');
  return value;
}
function uniqueIds(value, at, max = MAX_OBLIGATION_RECORDS) {
  const entries = list(value, at, max).map((item, index) => identifier(item, `${at}[${index}]`));
  if (new Set(entries).size !== entries.length) throw new ObligationInputError(at, 'Duplicate list item');
  return entries;
}
function unique(items, field, at) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[field])) throw new ObligationInputError(at, `Duplicate ${field}: ${item[field]}`);
    seen.add(item[field]);
  }
  return items;
}
export function parseObligationSource(value, at = 'source') {
  const source = record(value, at); keys(source, SOURCE_KEYS, at);
  return {
    id: identifier(source.id, `${at}.id`),
    provider: option(source.provider, OBLIGATION_PROVIDERS, `${at}.provider`),
    title: string(source.title, `${at}.title`, 180),
    sourceUrl: url(source.sourceUrl, `${at}.sourceUrl`),
    licenceUrl: url(source.licenceUrl, `${at}.licenceUrl`),
    licenceName: string(source.licenceName, `${at}.licenceName`, 180),
    licenceId: string(source.licenceId, `${at}.licenceId`, 80),
    permission: option(source.permission, OBLIGATION_STATES, `${at}.permission`),
    tier: option(source.tier, OBLIGATION_TIERS, `${at}.tier`),
    acquiredOn: date(source.acquiredOn, `${at}.acquiredOn`),
    datasetAsOf: date(source.datasetAsOf, `${at}.datasetAsOf`),
    termsReviewedOn: date(source.termsReviewedOn, `${at}.termsReviewedOn`),
    attribution: string(source.attribution, `${at}.attribution`, 5000, true),
    state: option(source.state, OBLIGATION_LIFECYCLE, `${at}.state`),
  };
}
export function parseObligationPage(value, at = 'page') {
  const page = record(value, at); keys(page, PAGE_KEYS, at);
  const target = page.targetPx === OBLIGATION_UNKNOWN ? OBLIGATION_UNKNOWN : page.targetPx;
  if (target !== OBLIGATION_UNKNOWN && (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target > 1000)) {
    throw new ObligationInputError(`${at}.targetPx`, 'Expected integer pixels or UNKNOWN');
  }
  return {
    id: identifier(page.id, `${at}.id`),
    path: path(page.path, `${at}.path`),
    locale: option(page.locale, ['en', 'fr'], `${at}.locale`),
    display: option(page.display, OBLIGATION_DISPLAYS, `${at}.display`),
    sourceIds: uniqueIds(page.sourceIds, `${at}.sourceIds`),
    offline: option(page.offline, OBLIGATION_STATES, `${at}.offline`),
    keyboard: option(page.keyboard, OBLIGATION_STATES, `${at}.keyboard`),
    screenReader: option(page.screenReader, OBLIGATION_STATES, `${at}.screenReader`),
    targetPx: target,
    publishedOn: date(page.publishedOn, `${at}.publishedOn`),
  };
}
export function parseObligationPlacement(value, at = 'placement') {
  const placement = record(value, at); keys(placement, PLACEMENT_KEYS, at);
  return {
    id: identifier(placement.id, `${at}.id`),
    pageId: identifier(placement.pageId, `${at}.pageId`),
    sourceId: identifier(placement.sourceId, `${at}.sourceId`),
    kind: option(placement.kind, OBLIGATION_KINDS, `${at}.kind`),
    notice: string(placement.notice, `${at}.notice`, 5000, true),
    elementId: identifier(placement.elementId, `${at}.elementId`),
    visibility: option(placement.visibility, OBLIGATION_VISIBILITY, `${at}.visibility`),
    nearMap: option(placement.nearMap, OBLIGATION_STATES, `${at}.nearMap`),
    witnessIds: uniqueIds(placement.witnessIds, `${at}.witnessIds`),
  };
}
export function parseObligationWitness(value, at = 'witness') {
  const witness = record(value, at); keys(witness, WITNESS_KEYS, at);
  return {
    id: identifier(witness.id, `${at}.id`),
    sourceId: identifier(witness.sourceId, `${at}.sourceId`),
    url: url(witness.url, `${at}.url`),
    recordedOn: date(witness.recordedOn, `${at}.recordedOn`),
    tier: option(witness.tier, OBLIGATION_TIERS, `${at}.tier`),
    type: option(witness.type, OBLIGATION_WITNESS_TYPES, `${at}.type`),
    note: string(witness.note, `${at}.note`, 1500, true),
  };
}
export function parseObligationRegister(value) {
  const root = record(value, 'register'); keys(root, ROOT_KEYS, 'register');
  if (root.schema !== OBLIGATION_SCHEMA) throw new ObligationInputError('register.schema', 'Unsupported schema');
  return {
    schema: OBLIGATION_SCHEMA,
    releaseId: identifier(root.releaseId, 'register.releaseId'),
    sources: unique(list(root.sources, 'register.sources', MAX_OBLIGATION_RECORDS).map((item, i) => parseObligationSource(item, `register.sources[${i}]`)), 'id', 'register.sources'),
    pages: unique(list(root.pages, 'register.pages', MAX_OBLIGATION_PAGES).map((item, i) => parseObligationPage(item, `register.pages[${i}]`)), 'id', 'register.pages'),
    placements: unique(list(root.placements, 'register.placements', MAX_OBLIGATION_PLACEMENTS).map((item, i) => parseObligationPlacement(item, `register.placements[${i}]`)), 'id', 'register.placements'),
    witnesses: unique(list(root.witnesses, 'register.witnesses', MAX_OBLIGATION_WITNESSES).map((item, i) => parseObligationWitness(item, `register.witnesses[${i}]`)), 'id', 'register.witnesses'),
  };
}
export function parseObligationJson(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_OBLIGATION_BYTES) {
    throw new ObligationInputError('register', 'JSON input exceeds limit or is not text');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new ObligationInputError('register', 'Invalid JSON'); }
  return parseObligationRegister(value);
}
export function canonicalObligationJson(register) {
  const parsed = parseObligationRegister(register);
  const sorted = {
    ...parsed,
    sources: [...parsed.sources].sort((a, b) => a.id.localeCompare(b.id)),
    pages: [...parsed.pages].sort((a, b) => a.id.localeCompare(b.id)),
    placements: [...parsed.placements].sort((a, b) => a.id.localeCompare(b.id)),
    witnesses: [...parsed.witnesses].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
export function sourcePageIndex(register) {
  const index = Object.create(null);
  for (const source of register.sources) index[source.id] = [];
  for (const page of register.pages) {
    for (const id of page.sourceIds) {
      if (!index[id]) index[id] = [];
      index[id].push(page.id);
    }
  }
  for (const key of Object.keys(index)) index[key].sort();
  return index;
}
export function placementIndex(register) {
  const index = Object.create(null);
  for (const page of register.pages) index[page.id] = [];
  for (const placement of register.placements) {
    if (!index[placement.pageId]) index[placement.pageId] = [];
    index[placement.pageId].push(placement.id);
  }
  for (const key of Object.keys(index)) index[key].sort();
  return index;
}
export function witnessIndex(register) {
  const index = Object.create(null);
  for (const source of register.sources) index[source.id] = [];
  for (const witness of register.witnesses) {
    if (!index[witness.sourceId]) index[witness.sourceId] = [];
    index[witness.sourceId].push(witness.id);
  }
  for (const key of Object.keys(index)) index[key].sort();
  return index;
}
