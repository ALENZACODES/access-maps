/** Strict coverage register for locally supplied publication evidence. No I/O. */
import { SOURCES, UNKNOWN } from './attribution-utils.mjs';

export const COVERAGE_SCHEMA = 'attribution-coverage/1';
export const MAX_DOCUMENT_BYTES = 2_097_152;
export const LIMITS = Object.freeze({ sources: 500, views: 500, links: 4000, notes: 2000 });
export const LICENCE_KINDS = Object.freeze(['odbl', 'metrolinx-aua', 'metrolinx-ogl', 'ltc-terms', 'other-open', UNKNOWN]);
export const EVIDENCE_TIERS = Object.freeze(['primary', 'secondary', 'self-reported', UNKNOWN]);
export const STATES = Object.freeze(['YES', 'NO', UNKNOWN]);
export const VIEW_KINDS = Object.freeze(['map', 'journey', 'directory', 'download', 'other']);
export const PUBLICATION_STATES = Object.freeze(['included', 'held', 'excluded']);

export class CoverageInputError extends Error {
  constructor(path, detail) {
    super(`${path}: ${detail}`);
    this.name = 'CoverageInputError';
    this.path = path;
  }
}

function obj(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoverageInputError(path, 'Object required');
  return value;
}
function keys(value, required, path) {
  const allowed = new Set(required);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new CoverageInputError(`${path}.${key}`, 'Unexpected field');
  for (const key of required) if (!Object.hasOwn(value, key)) throw new CoverageInputError(`${path}.${key}`, 'Missing field');
}
function text(value, path, max = 250, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && value.trim() === '') || value !== value.normalize('NFC')) {
    throw new CoverageInputError(path, 'Invalid text');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new CoverageInputError(path, 'Control character');
  return value;
}
function id(value, path) {
  const result = text(value, path, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) throw new CoverageInputError(path, 'Invalid identifier');
  return result;
}
function choice(value, choices, path) {
  if (!choices.includes(value)) throw new CoverageInputError(path, `Expected one of ${choices.join(', ')}`);
  return value;
}
function date(value, path) {
  if (value === UNKNOWN) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new CoverageInputError(path, 'ISO date or UNKNOWN required');
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new CoverageInputError(path, 'Invalid calendar date');
  }
  return value;
}
function url(value, path) {
  if (value === UNKNOWN) return value;
  const raw = text(value, path, 2048);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new CoverageInputError(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname ||
      parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname) ||
      parsed.hostname === '[::1]') throw new CoverageInputError(path, 'Public HTTPS URL required');
  return raw;
}
function list(value, path, limit, parse) {
  if (!Array.isArray(value) || value.length > limit) throw new CoverageInputError(path, 'Bounded list required');
  return value.map((entry, i) => parse(entry, `${path}[${i}]`));
}
function uniqueIds(items, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new CoverageInputError(path, `Duplicate identifier ${item.id}`);
    seen.add(item.id);
  }
}
function references(value, path) {
  const entries = list(value, path, LIMITS.links, id);
  if (new Set(entries).size !== entries.length) throw new CoverageInputError(path, 'Duplicate reference');
  return entries;
}

export function parseCoverageSource(value, path = 'source') {
  const entry = obj(value, path);
  keys(entry, ['id', 'provider', 'title', 'sourceUrl', 'licenceUrl', 'licenceKind', 'licenceName', 'permission', 'evidenceTier',
    'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'attribution', 'notes', 'state'], path);
  const provider = choice(entry.provider, [...Object.keys(SOURCES), 'other'], `${path}.provider`);
  return Object.freeze({
    id: id(entry.id, `${path}.id`),
    provider,
    title: text(entry.title, `${path}.title`, 200),
    sourceUrl: url(entry.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: url(entry.licenceUrl, `${path}.licenceUrl`),
    licenceKind: choice(entry.licenceKind, LICENCE_KINDS, `${path}.licenceKind`),
    licenceName: text(entry.licenceName, `${path}.licenceName`, 200),
    permission: choice(entry.permission, STATES, `${path}.permission`),
    evidenceTier: choice(entry.evidenceTier, EVIDENCE_TIERS, `${path}.evidenceTier`),
    acquiredOn: date(entry.acquiredOn, `${path}.acquiredOn`),
    datasetAsOf: date(entry.datasetAsOf, `${path}.datasetAsOf`),
    termsReviewedOn: date(entry.termsReviewedOn, `${path}.termsReviewedOn`),
    attribution: text(entry.attribution, `${path}.attribution`, 5000, true),
    notes: text(entry.notes, `${path}.notes`, LIMITS.notes, true),
    state: choice(entry.state, PUBLICATION_STATES, `${path}.state`),
  });
}

export function parseCoverageView(value, path = 'view') {
  const entry = obj(value, path);
  keys(entry, ['id', 'title', 'kind', 'language', 'sourceIds', 'state', 'offline', 'keyboard', 'screenReader', 'mapCredit',
    'minimumTargetPx', 'publishedOn', 'notes'], path);
  const dimension = entry.minimumTargetPx;
  if (dimension !== UNKNOWN && (!Number.isInteger(dimension) || dimension < 0 || dimension > 1000)) {
    throw new CoverageInputError(`${path}.minimumTargetPx`, 'Integer pixels or UNKNOWN required');
  }
  return Object.freeze({
    id: id(entry.id, `${path}.id`),
    title: text(entry.title, `${path}.title`, 200),
    kind: choice(entry.kind, VIEW_KINDS, `${path}.kind`),
    language: choice(entry.language, ['en', 'fr'], `${path}.language`),
    sourceIds: Object.freeze(references(entry.sourceIds, `${path}.sourceIds`)),
    state: choice(entry.state, PUBLICATION_STATES, `${path}.state`),
    offline: choice(entry.offline, STATES, `${path}.offline`),
    keyboard: choice(entry.keyboard, STATES, `${path}.keyboard`),
    screenReader: choice(entry.screenReader, STATES, `${path}.screenReader`),
    mapCredit: choice(entry.mapCredit, STATES, `${path}.mapCredit`),
    minimumTargetPx: dimension,
    publishedOn: date(entry.publishedOn, `${path}.publishedOn`),
    notes: text(entry.notes, `${path}.notes`, LIMITS.notes, true),
  });
}

export function parseCoverageRegister(value) {
  const root = obj(value, 'register');
  keys(root, ['schema', 'releaseId', 'sources', 'views'], 'register');
  if (root.schema !== COVERAGE_SCHEMA) throw new CoverageInputError('register.schema', 'Unsupported schema');
  const sources = list(root.sources, 'register.sources', LIMITS.sources, parseCoverageSource);
  const views = list(root.views, 'register.views', LIMITS.views, parseCoverageView);
  uniqueIds(sources, 'register.sources');
  uniqueIds(views, 'register.views');
  return Object.freeze({schema: COVERAGE_SCHEMA, releaseId: id(root.releaseId, 'register.releaseId'),
    sources: Object.freeze(sources), views: Object.freeze(views)});
}

export function parseCoverageJson(raw) {
  if (typeof raw !== 'string') throw new CoverageInputError('json', 'Text required');
  if (BufferByteLength(raw) > MAX_DOCUMENT_BYTES) throw new CoverageInputError('json', 'File too large');
  let value;
  try { value = JSON.parse(raw); } catch { throw new CoverageInputError('json', 'Invalid JSON'); }
  return parseCoverageRegister(value);
}

/** Works in browsers and Node, without Buffer or filesystem APIs. */
function BufferByteLength(raw) { return new TextEncoder().encode(raw).length; }
export function coverageToJson(register) {
  return `${JSON.stringify(parseCoverageRegister(register), null, 2)}\n`;
}
export function sourcesById(register) { return new Map(register.sources.map((source) => [source.id, source])); }
export function viewsById(register) { return new Map(register.views.map((view) => [view.id, view])); }
export function includedSources(register) { return register.sources.filter((source) => source.state === 'included'); }
export function includedViews(register) { return register.views.filter((view) => view.state === 'included'); }
export function linkedViews(register, sourceId) {
  return register.views.filter((view) => view.sourceIds.includes(sourceId));
}
export function linkedSources(register, viewId) {
  const view = register.views.find((entry) => entry.id === viewId);
  if (!view) return [];
  const byId = sourcesById(register);
  return view.sourceIds.map((sourceId) => byId.get(sourceId)).filter(Boolean);
}
