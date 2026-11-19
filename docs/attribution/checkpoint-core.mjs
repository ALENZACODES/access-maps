/** Manual attribution terms checkpoint. Input is local, not a provider feed. */
export const CHECKPOINT_SCHEMA = 'attribution-checkpoint/1';
export const CHECKPOINT_UNKNOWN = 'UNKNOWN';
export const CHECKPOINT_MAX_BYTES = 2_097_152;
export const CHECKPOINT_MAX_SOURCES = 400;
export const CHECKPOINT_MAX_SURFACES = 400;
export const EVIDENCE_TIERS = Object.freeze(['primary', 'secondary', 'community', 'UNKNOWN']);
export const PERMISSIONS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const DECISIONS = Object.freeze(['accepted', 'needs-review', 'held']);
export const PUBLICATION = Object.freeze(['included', 'held', 'excluded']);
const ROOT_FIELDS = ['schema', 'releaseId', 'comparisonDate', 'sources', 'surfaces'];
const SOURCE_FIELDS = [
  'id', 'name', 'sourceUrl', 'licenceUrl', 'licenceName', 'evidenceUrl',
  'permission', 'evidenceTier', 'termsDate', 'datasetDate', 'acquisitionDate',
  'decision', 'decisionDate', 'decisionReason', 'notice', 'publication',
];
const SURFACE_FIELDS = [
  'id', 'title', 'mode', 'locale', 'sourceIds', 'offline', 'keyboard', 'screenReader',
  'targetPx', 'mapCredit', 'publicationDate',
];

export class CheckpointInputError extends Error {
  constructor(path, description) {
    super(`${path}: ${description}`);
    this.name = 'CheckpointInputError';
    this.path = path;
  }
}

function fail(path, message) { throw new CheckpointInputError(path, message); }
function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Expected object');
  return value;
}
function exact(value, fields, path) {
  for (const field of fields) if (!Object.hasOwn(value, field)) fail(`${path}.${field}`, 'Missing field');
  const names = new Set(fields);
  for (const field of Object.keys(value)) if (!names.has(field)) fail(`${path}.${field}`, 'Unexpected field');
}
function text(value, path, max = 256, empty = false) {
  if (typeof value !== 'string') fail(path, 'Expected text');
  if (value.length > max || (!empty && value.trim().length === 0)) fail(path, 'Invalid text length');
  if (value.normalize('NFC') !== value) fail(path, 'Use normalized Unicode');
  for (const symbol of value) {
    const n = symbol.codePointAt(0);
    if (n !== undefined && ((n < 32 && n !== 10 && n !== 9) || n === 127)) fail(path, 'Control character');
  }
  return value;
}
function id(value, path) {
  const v = text(value, path, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(v)) fail(path, 'Invalid ID');
  return v;
}
function choice(value, allowed, path) {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(path, 'Unsupported value');
  return value;
}
function date(value, path) {
  if (value === 'UNKNOWN') return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail(path, 'Expected ISO date or UNKNOWN');
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]) fail(path, 'Invalid calendar date');
  return value;
}
function url(value, path) {
  if (value === 'UNKNOWN') return 'UNKNOWN';
  const raw = text(value, path, 2000);
  let parsed;
  try { parsed = new URL(raw); } catch { fail(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash) fail(path, 'Public HTTPS URL required');
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '[::1]' || host.endsWith('.localhost') || host.endsWith('.local')) fail(path, 'Local addresses are not evidence URLs');
  const ip = /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host);
  if (ip) fail(path, 'Use a public provider hostname');
  return parsed.href;
}
function list(value, path, max) {
  if (!Array.isArray(value) || value.length > max) fail(path, 'Expected bounded list');
  return value;
}
function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, 'Duplicate identity');
  return values;
}
function source(value, path) {
  const item = object(value, path);
  exact(item, SOURCE_FIELDS, path);
  return {
    id: id(item.id, `${path}.id`),
    name: text(item.name, `${path}.name`, 160),
    sourceUrl: url(item.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: url(item.licenceUrl, `${path}.licenceUrl`),
    licenceName: text(item.licenceName, `${path}.licenceName`, 160),
    evidenceUrl: url(item.evidenceUrl, `${path}.evidenceUrl`),
    permission: choice(item.permission, PERMISSIONS, `${path}.permission`),
    evidenceTier: choice(item.evidenceTier, EVIDENCE_TIERS, `${path}.evidenceTier`),
    termsDate: date(item.termsDate, `${path}.termsDate`),
    datasetDate: date(item.datasetDate, `${path}.datasetDate`),
    acquisitionDate: date(item.acquisitionDate, `${path}.acquisitionDate`),
    decision: choice(item.decision, DECISIONS, `${path}.decision`),
    decisionDate: date(item.decisionDate, `${path}.decisionDate`),
    decisionReason: text(item.decisionReason, `${path}.decisionReason`, 1200, true),
    notice: text(item.notice, `${path}.notice`, 4000, true),
    publication: choice(item.publication, PUBLICATION, `${path}.publication`),
  };
}
function surface(value, path) {
  const item = object(value, path);
  exact(item, SURFACE_FIELDS, path);
  const ids = unique(list(item.sourceIds, `${path}.sourceIds`, 400).map((v, i) => id(v, `${path}.sourceIds[${i}]`)), `${path}.sourceIds`);
  const target = item.targetPx;
  if (target !== 'UNKNOWN' && (typeof target !== 'number' || !Number.isSafeInteger(target) || target < 0 || target > 1000)) fail(`${path}.targetPx`, 'Expected integer pixels or UNKNOWN');
  return {
    id: id(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 160),
    mode: choice(item.mode, ['map', 'journey', 'list', 'download', 'other'], `${path}.mode`),
    locale: choice(item.locale, ['en', 'fr'], `${path}.locale`),
    sourceIds: ids,
    offline: choice(item.offline, PERMISSIONS, `${path}.offline`),
    keyboard: choice(item.keyboard, PERMISSIONS, `${path}.keyboard`),
    screenReader: choice(item.screenReader, PERMISSIONS, `${path}.screenReader`),
    targetPx: target,
    mapCredit: choice(item.mapCredit, PERMISSIONS, `${path}.mapCredit`),
    publicationDate: date(item.publicationDate, `${path}.publicationDate`),
  };
}
export function parseCheckpoint(input) {
  const root = object(input, 'checkpoint');
  exact(root, ROOT_FIELDS, 'checkpoint');
  if (root.schema !== CHECKPOINT_SCHEMA) fail('checkpoint.schema', 'Unsupported schema');
  const sources = list(root.sources, 'checkpoint.sources', CHECKPOINT_MAX_SOURCES).map((v, i) => source(v, `checkpoint.sources[${i}]`));
  const surfaces = list(root.surfaces, 'checkpoint.surfaces', CHECKPOINT_MAX_SURFACES).map((v, i) => surface(v, `checkpoint.surfaces[${i}]`));
  unique(sources.map(s => s.id), 'checkpoint.sources');
  unique(surfaces.map(s => s.id), 'checkpoint.surfaces');
  return {
    schema: CHECKPOINT_SCHEMA,
    releaseId: id(root.releaseId, 'checkpoint.releaseId'),
    comparisonDate: date(root.comparisonDate, 'checkpoint.comparisonDate'),
    sources, surfaces,
  };
}
export function parseCheckpointJson(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > CHECKPOINT_MAX_BYTES) fail('checkpoint', 'Input exceeds size limit');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail('checkpoint', 'Invalid JSON'); }
  return parseCheckpoint(parsed);
}
export function writeCheckpointJson(checkpoint) {
  return `${JSON.stringify(parseCheckpoint(checkpoint), null, 2)}\n`;
}
export function checkpointMetadata(checkpoint) {
  const parsed = parseCheckpoint(checkpoint);
  return {
    releaseId: parsed.releaseId,
    sourceCount: parsed.sources.length,
    surfaceCount: parsed.surfaces.length,
    unknownDatasetDates: parsed.sources.filter(item => item.datasetDate === 'UNKNOWN').length,
    pendingDecisions: parsed.sources.filter(item => item.decision !== 'accepted').length,
    includedSources: parsed.sources.filter(item => item.publication === 'included').length,
  };
}
