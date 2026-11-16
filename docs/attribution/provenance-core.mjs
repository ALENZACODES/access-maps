/**
 * Strict, local-only dataset provenance contracts shared by the browser route
 * and the command-line release gate. There is intentionally no data fetching.
 * An absent fact is UNKNOWN, never a favourable assumption.
 */
export const UNKNOWN = 'UNKNOWN';
export const SCHEMA_VERSION = 1;
export const MAX_RECORDS = 250;
export const MAX_TEXT_LENGTH = 500;
export const MAX_DOCUMENT_BYTES = 1_048_576;
export const PROVIDERS = Object.freeze(['osm', 'metrolinx', 'ltc', 'other']);
export const LICENCES = Object.freeze([
  'ODbL-1.0',
  'Metrolinx-AUA',
  'OGL-Ontario-Metrolinx',
  'LTC-Open-Data-Terms',
  'OTHER-OPEN',
  UNKNOWN,
]);
export const USES = Object.freeze(['map', 'transit', 'place', 'other']);
export const STATUSES = Object.freeze(['included', 'held', 'excluded']);
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
export const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/u;
export const URL_FIELDS = Object.freeze(['sourceUrl', 'licenceUrl']);
export const DATE_FIELDS = Object.freeze(['acquiredOn', 'datasetAsOf', 'termsReviewedOn']);
export const TEXT_FIELDS = Object.freeze(['title', 'sourceName', 'notes']);
export const REQUIRED_FIELDS = Object.freeze([
  'id', 'title', 'provider', 'use', 'status', 'sourceName', 'sourceUrl',
  'licence', 'licenceUrl', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn',
  'notice', 'notes', 'containsOdbl', 'derivedFromOdbl', 'redistributionAllowed',
]);

export class ProvenanceError extends Error {
  constructor(code, path, detail = '') {
    super(`${code} at ${path}${detail ? `: ${detail}` : ''}`);
    this.name = 'ProvenanceError';
    this.code = code;
    this.path = path;
  }
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isKnownDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= days;
}

export function isUnknownOrDate(value) {
  return value === UNKNOWN || isKnownDate(value);
}

export function isSafeUrl(value) {
  if (value === UNKNOWN) return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/\s|[\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) &&
      url.username === '' && url.password === '' &&
      !url.hostname.endsWith('.local') && url.hostname !== 'localhost';
  } catch {
    return false;
  }
}

export function emptyRecord(id = 'dataset') {
  return {
    id,
    title: UNKNOWN,
    provider: 'other',
    use: 'other',
    status: 'held',
    sourceName: UNKNOWN,
    sourceUrl: UNKNOWN,
    licence: UNKNOWN,
    licenceUrl: UNKNOWN,
    acquiredOn: UNKNOWN,
    datasetAsOf: UNKNOWN,
    termsReviewedOn: UNKNOWN,
    notice: UNKNOWN,
    notes: '',
    containsOdbl: UNKNOWN,
    derivedFromOdbl: UNKNOWN,
    redistributionAllowed: UNKNOWN,
  };
}

export function emptyInventory() {
  return { version: SCHEMA_VERSION, records: [] };
}

function reject(code, path, detail) {
  throw new ProvenanceError(code, path, detail);
}

function assertString(value, path, max = MAX_TEXT_LENGTH, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    reject('INVALID_TEXT', path);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    reject('CONTROL_CHARACTER', path);
  }
  return value;
}

function assertEnum(value, allowed, path) {
  if (!allowed.includes(value)) reject('INVALID_VALUE', path);
  return value;
}

function assertTriState(value, path) {
  if (value !== true && value !== false && value !== UNKNOWN) {
    reject('INVALID_TRISTATE', path);
  }
  return value;
}

function assertDate(value, path) {
  if (!isUnknownOrDate(value)) reject('INVALID_DATE', path);
  return value;
}

function assertUrl(value, path) {
  if (!isSafeUrl(value)) reject('UNSAFE_URL', path);
  return value;
}

/** Refuses unknown keys rather than passing unexamined input through exports. */
export function parseRecord(input, path = 'record') {
  if (!isPlainObject(input)) reject('NOT_OBJECT', path);
  for (const key of Object.keys(input)) {
    if (!REQUIRED_FIELDS.includes(key)) reject('UNEXPECTED_FIELD', `${path}.${key}`);
  }
  for (const key of REQUIRED_FIELDS) {
    if (!Object.hasOwn(input, key)) reject('MISSING_FIELD', `${path}.${key}`);
  }
  const id = assertString(input.id, `${path}.id`, 64);
  if (!ID_PATTERN.test(id)) reject('INVALID_ID', `${path}.id`);
  const result = {
    id,
    title: assertString(input.title, `${path}.title`),
    provider: assertEnum(input.provider, PROVIDERS, `${path}.provider`),
    use: assertEnum(input.use, USES, `${path}.use`),
    status: assertEnum(input.status, STATUSES, `${path}.status`),
    sourceName: assertString(input.sourceName, `${path}.sourceName`),
    sourceUrl: assertUrl(input.sourceUrl, `${path}.sourceUrl`),
    licence: assertEnum(input.licence, LICENCES, `${path}.licence`),
    licenceUrl: assertUrl(input.licenceUrl, `${path}.licenceUrl`),
    acquiredOn: assertDate(input.acquiredOn, `${path}.acquiredOn`),
    datasetAsOf: assertDate(input.datasetAsOf, `${path}.datasetAsOf`),
    termsReviewedOn: assertDate(input.termsReviewedOn, `${path}.termsReviewedOn`),
    notice: assertString(input.notice, `${path}.notice`, 4000),
    notes: assertString(input.notes, `${path}.notes`, 4000, true),
    containsOdbl: assertTriState(input.containsOdbl, `${path}.containsOdbl`),
    derivedFromOdbl: assertTriState(input.derivedFromOdbl, `${path}.derivedFromOdbl`),
    redistributionAllowed: assertTriState(input.redistributionAllowed, `${path}.redistributionAllowed`),
  };
  return Object.freeze(result);
}

export function parseInventory(input) {
  if (!isPlainObject(input)) reject('NOT_OBJECT', 'inventory');
  for (const key of Object.keys(input)) {
    if (key !== 'version' && key !== 'records') reject('UNEXPECTED_FIELD', `inventory.${key}`);
  }
  if (input.version !== SCHEMA_VERSION) reject('SCHEMA_VERSION', 'inventory.version');
  if (!Array.isArray(input.records)) reject('NOT_ARRAY', 'inventory.records');
  if (input.records.length > MAX_RECORDS) reject('TOO_MANY_RECORDS', 'inventory.records');
  const seen = new Set();
  const records = input.records.map((record, index) => {
    const parsed = parseRecord(record, `inventory.records[${index}]`);
    if (seen.has(parsed.id)) reject('DUPLICATE_ID', `inventory.records[${index}].id`);
    seen.add(parsed.id);
    return parsed;
  });
  return Object.freeze({ version: SCHEMA_VERSION, records: Object.freeze(records) });
}

export function parseInventoryText(text) {
  if (typeof text !== 'string') reject('INVALID_TEXT', 'file');
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_DOCUMENT_BYTES) reject('FILE_TOO_LARGE', 'file');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    reject('INVALID_JSON', 'file');
  }
  return parseInventory(parsed);
}

export function encodeInventory(input) {
  return `${JSON.stringify(parseInventory(input), null, 2)}\n`;
}

export function upsertRecord(inventory, raw) {
  const parsed = parseInventory(inventory);
  const record = parseRecord(raw);
  const records = [...parsed.records];
  const index = records.findIndex((item) => item.id === record.id);
  if (index < 0) records.push(record);
  else records[index] = record;
  records.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return parseInventory({ version: SCHEMA_VERSION, records });
}

export function removeRecord(inventory, id) {
  const parsed = parseInventory(inventory);
  if (typeof id !== 'string') reject('INVALID_ID', 'id');
  return parseInventory({
    version: SCHEMA_VERSION,
    records: parsed.records.filter((item) => item.id !== id),
  });
}

export function markRecord(inventory, id, status) {
  assertEnum(status, STATUSES, 'status');
  const parsed = parseInventory(inventory);
  const record = parsed.records.find((item) => item.id === id);
  if (!record) reject('NOT_FOUND', 'id');
  return upsertRecord(parsed, { ...record, status });
}

export function cloneRecord(record, newId) {
  return parseRecord({ ...parseRecord(record), id: newId, status: 'held' });
}

export function filterRecords(inventory, filter = {}) {
  const parsed = parseInventory(inventory);
  const { status = 'all', provider = 'all', text = '' } = filter;
  if (status !== 'all') assertEnum(status, STATUSES, 'filter.status');
  if (provider !== 'all') assertEnum(provider, PROVIDERS, 'filter.provider');
  const query = typeof text === 'string' ? text.trim().toLocaleLowerCase() : '';
  return parsed.records.filter((item) =>
    (status === 'all' || item.status === status) &&
    (provider === 'all' || item.provider === provider) &&
    (!query || [item.id, item.title, item.sourceName, item.notes].some((value) =>
      value.toLocaleLowerCase().includes(query))),
  );
}

export function inventoryStats(inventory) {
  const records = parseInventory(inventory).records;
  const byStatus = { included: 0, held: 0, excluded: 0 };
  const byProvider = { osm: 0, metrolinx: 0, ltc: 0, other: 0 };
  let missingDates = 0;
  let unknownLicences = 0;
  for (const record of records) {
    byStatus[record.status] += 1;
    byProvider[record.provider] += 1;
    if (record.datasetAsOf === UNKNOWN) missingDates += 1;
    if (record.licence === UNKNOWN) unknownLicences += 1;
  }
  return Object.freeze({ total: records.length, byStatus, byProvider, missingDates, unknownLicences });
}

export function isReleaseCandidate(record) {
  return parseRecord(record).status === 'included';
}
