/** Offline, strict record-level source/licence/date/tier contract. */
export const LEDGER_SCHEMA = 'attribution-tier-ledger/1';
export const UNKNOWN = 'UNKNOWN';
export const TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const PERMISSIONS = Object.freeze(['YES', 'NO', UNKNOWN]);
export const STATES = Object.freeze(['included', 'held', 'excluded']);
export const FAMILIES = Object.freeze(['osm', 'metrolinx-aua', 'metrolinx-ogl', 'ltc', 'other']);
export const MODES = Object.freeze(['map', 'journey', 'place', 'download', 'other']);
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_RECORDS = 1000;
export const MAX_SURFACES = 500;
const RECORD_KEYS = Object.freeze(['id', 'name', 'family', 'sourceUrl', 'licenceUrl', 'licenceName', 'sourceDate', 'acquiredOn', 'termsReviewedOn', 'tier', 'permission', 'attribution', 'state', 'evidenceUrl', 'notes']);
const SURFACE_KEYS = Object.freeze(['id', 'locale', 'mode', 'recordIds', 'offline', 'targetPx', 'mapCredit', 'labelled', 'keyboard', 'publicationDate']);
const ROOT_KEYS = Object.freeze(['schema', 'release', 'records', 'surfaces']);
export class LedgerInputError extends Error {
  constructor(path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'LedgerInputError';
    this.path = path;
  }
}
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LedgerInputError(path, 'Expected object');
  }
  return value;
}
function exact(value, keys, path) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new LedgerInputError(`${path}.${key}`, 'Unexpected field');
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new LedgerInputError(`${path}.${key}`, 'Missing field');
  }
}
function text(value, path, max, optional = false, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    throw new LedgerInputError(path, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new LedgerInputError(path, 'Non-normalized text');
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (controls.test(value)) throw new LedgerInputError(path, 'Control character');
  return value;
}
function id(value, path) {
  const valueText = text(value, path, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(valueText)) {
    throw new LedgerInputError(path, 'Invalid identifier');
  }
  return valueText;
}
function choice(value, allowed, path) {
  if (!allowed.includes(value)) throw new LedgerInputError(path, `Expected one of ${allowed.join(', ')}`);
  return value;
}
function date(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new LedgerInputError(path, 'Expected YYYY-MM-DD or UNKNOWN');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new LedgerInputError(path, 'Invalid calendar date');
  }
  return value;
}
function url(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const input = text(value, path, 2048);
  let parsed;
  try { parsed = new URL(input); } catch { throw new LedgerInputError(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash ||
      !parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') ||
      parsed.hostname.endsWith('.localhost') || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname) ||
      parsed.hostname === '[::1]') {
    throw new LedgerInputError(path, 'Expected public HTTPS URL without credentials or fragment');
  }
  return input;
}
function idList(value, path, max) {
  if (!Array.isArray(value) || value.length > max) throw new LedgerInputError(path, 'Invalid list');
  const output = value.map((entry, index) => id(entry, `${path}[${index}]`));
  if (new Set(output).size !== output.length) throw new LedgerInputError(path, 'Duplicate identifier');
  return output;
}
function integer(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (!Number.isInteger(value) || value < 0 || value > 1024) {
    throw new LedgerInputError(path, 'Expected target pixels or UNKNOWN');
  }
  return value;
}
export function parseLedgerRecord(value, path = 'record') {
  const raw = object(value, path);
  exact(raw, RECORD_KEYS, path);
  return Object.freeze({
    id: id(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`, 160),
    family: choice(raw.family, FAMILIES, `${path}.family`),
    sourceUrl: url(raw.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: url(raw.licenceUrl, `${path}.licenceUrl`),
    licenceName: text(raw.licenceName, `${path}.licenceName`, 160),
    sourceDate: date(raw.sourceDate, `${path}.sourceDate`),
    acquiredOn: date(raw.acquiredOn, `${path}.acquiredOn`),
    termsReviewedOn: date(raw.termsReviewedOn, `${path}.termsReviewedOn`),
    tier: choice(raw.tier, TIERS, `${path}.tier`),
    permission: choice(raw.permission, PERMISSIONS, `${path}.permission`),
    attribution: text(raw.attribution, `${path}.attribution`, 5000, true, true),
    state: choice(raw.state, STATES, `${path}.state`),
    evidenceUrl: url(raw.evidenceUrl, `${path}.evidenceUrl`),
    notes: text(raw.notes, `${path}.notes`, 1500, true, true),
  });
}
export function parseLedgerSurface(value, path = 'surface') {
  const raw = object(value, path);
  exact(raw, SURFACE_KEYS, path);
  return Object.freeze({
    id: id(raw.id, `${path}.id`),
    locale: choice(raw.locale, ['en', 'fr'], `${path}.locale`),
    mode: choice(raw.mode, MODES, `${path}.mode`),
    recordIds: Object.freeze(idList(raw.recordIds, `${path}.recordIds`, MAX_RECORDS)),
    offline: choice(raw.offline, PERMISSIONS, `${path}.offline`),
    targetPx: integer(raw.targetPx, `${path}.targetPx`),
    mapCredit: choice(raw.mapCredit, PERMISSIONS, `${path}.mapCredit`),
    labelled: choice(raw.labelled, PERMISSIONS, `${path}.labelled`),
    keyboard: choice(raw.keyboard, PERMISSIONS, `${path}.keyboard`),
    publicationDate: date(raw.publicationDate, `${path}.publicationDate`),
  });
}
function distinct(items, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new LedgerInputError(path, `Duplicate ID ${item.id}`);
    seen.add(item.id);
  }
}
export function parseTierLedger(value) {
  const root = object(value, 'ledger');
  exact(root, ROOT_KEYS, 'ledger');
  if (root.schema !== LEDGER_SCHEMA) throw new LedgerInputError('ledger.schema', 'Unsupported schema');
  if (!Array.isArray(root.records) || root.records.length > MAX_RECORDS) throw new LedgerInputError('ledger.records', 'Too many records');
  if (!Array.isArray(root.surfaces) || root.surfaces.length > MAX_SURFACES) throw new LedgerInputError('ledger.surfaces', 'Too many surfaces');
  const records = root.records.map((item, index) => parseLedgerRecord(item, `ledger.records[${index}]`));
  const surfaces = root.surfaces.map((item, index) => parseLedgerSurface(item, `ledger.surfaces[${index}]`));
  distinct(records, 'ledger.records');
  distinct(surfaces, 'ledger.surfaces');
  return Object.freeze({schema: LEDGER_SCHEMA, release: id(root.release, 'ledger.release'), records: Object.freeze(records), surfaces: Object.freeze(surfaces)});
}
export function parseTierLedgerJson(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).byteLength > MAX_DOCUMENT_BYTES) {
    throw new LedgerInputError('ledger', 'Document too large or not text');
  }
  let value;
  try { value = JSON.parse(input); } catch { throw new LedgerInputError('ledger', 'Malformed JSON'); }
  return parseTierLedger(value);
}
export function serializeTierLedger(ledger) {
  return `${JSON.stringify(parseTierLedger(ledger), null, 2)}\n`;
}
export function surfaceRecordIndex(ledger) {
  const result = new Map();
  for (const record of ledger.records) result.set(record.id, []);
  for (const surface of ledger.surfaces) {
    for (const recordId of surface.recordIds) {
      if (result.has(recordId)) result.get(recordId).push(surface.id);
    }
  }
  return result;
}
export function summarizeTiers(ledger) {
  const totals = Object.fromEntries(TIERS.map((tier) => [tier, 0]));
  for (const record of ledger.records) totals[record.tier] += 1;
  return Object.freeze(totals);
}
