/** Offline attribution reference-pack contract. No I/O, clocks or network calls. */
import { SOURCE_IDS, SOURCES, UNKNOWN } from './attribution-utils.mjs';

export const REFERENCE_SCHEMA = 'attribution-reference-pack/1';
export const REFERENCE_MAX_BYTES = 2_097_152;
export const REFERENCE_MAX_RECORDS = 500;
export const REFERENCE_MAX_SURFACES = 500;
export const REFERENCE_MAX_REFERENCES = 1000;
export const REFERENCE_TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const PERMISSION_STATES = Object.freeze(['YES', 'NO', UNKNOWN]);
export const RELEASE_STATES = Object.freeze(['included', 'held', 'excluded']);
export const REFERENCE_LICENCES = Object.freeze(['ODbL-1.0', 'Metrolinx-AUA', 'OGL-Ontario-Metrolinx', 'LTC-Open-Data-Terms', 'OTHER-OPEN', UNKNOWN]);
const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const KNOWN_KEYS = ['schema', 'releaseId', 'sources', 'references', 'surfaces'];
const SOURCE_KEYS = ['id', 'provider', 'licence', 'licenceUrl', 'sourceUrl', 'permission', 'tier', 'datasetDate', 'acquiredDate', 'termsDate', 'notice', 'state', 'referenceIds'];
const REFERENCE_KEYS = ['id', 'sourceId', 'title', 'url', 'licenceUrl', 'collectedDate', 'termsDate', 'tier', 'offlineNote', 'sha256', 'language'];
const SURFACE_KEYS = ['id', 'language', 'sourceIds', 'referenceIds', 'mapCredit', 'offline', 'keyboard', 'screenReader', 'targetPx', 'route'];

export class ReferenceInputError extends Error {
  constructor(path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'ReferenceInputError';
    this.path = path;
  }
}
function error(path, message) { throw new ReferenceInputError(path, message); }
function record(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) error(path, 'Expected object');
  return value;
}
function keys(value, expected, path) {
  const allowed = new Set(expected);
  for (const item of Object.keys(value)) if (!allowed.has(item)) error(`${path}.${item}`, 'Unknown field');
  for (const item of expected) if (!Object.hasOwn(value, item)) error(`${path}.${item}`, 'Missing field');
}
function text(value, path, limit = 512, empty = false, multiline = false) {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim())) error(path, 'Expected bounded text');
  if (value !== value.normalize('NFC')) error(path, 'Text must use NFC');
  if ((multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u).test(value)) error(path, 'Control character');
  return value;
}
function id(value, path) {
  const result = text(value, path, 72);
  if (!IDENTIFIER.test(result)) error(path, 'Invalid identifier');
  return result;
}
function choice(value, choices, path) {
  if (!choices.includes(value)) error(path, `Expected ${choices.join(', ')}`);
  return value;
}
function date(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) error(path, 'Expected YYYY-MM-DD or UNKNOWN');
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) error(path, 'Invalid calendar date');
  return value;
}
function url(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const result = text(value, path, 2048);
  let parsed;
  try { parsed = new URL(result); } catch { error(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash || parsed.hostname.endsWith('.local') || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname) || parsed.hostname === '[::1]') error(path, 'Public HTTPS URL required');
  return result;
}
function array(value, path, max) {
  if (!Array.isArray(value) || value.length > max) error(path, 'Expected bounded array');
  return value;
}
function ids(value, path, max) {
  const entries = array(value, path, max).map((v, i) => id(v, `${path}[${i}]`));
  if (new Set(entries).size !== entries.length) error(path, 'Duplicate identifiers');
  return entries;
}
function unique(entries, path) {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) error(path, 'Duplicate IDs');
  return entries;
}
function source(value, path) {
  const r = record(value, path); keys(r, SOURCE_KEYS, path);
  return Object.freeze({
    id: id(r.id, `${path}.id`),
    provider: choice(r.provider, [...SOURCE_IDS, 'other', UNKNOWN], `${path}.provider`),
    licence: choice(r.licence, REFERENCE_LICENCES, `${path}.licence`),
    licenceUrl: url(r.licenceUrl, `${path}.licenceUrl`),
    sourceUrl: url(r.sourceUrl, `${path}.sourceUrl`),
    permission: choice(r.permission, PERMISSION_STATES, `${path}.permission`),
    tier: choice(r.tier, REFERENCE_TIERS, `${path}.tier`),
    datasetDate: date(r.datasetDate, `${path}.datasetDate`),
    acquiredDate: date(r.acquiredDate, `${path}.acquiredDate`),
    termsDate: date(r.termsDate, `${path}.termsDate`),
    notice: text(r.notice, `${path}.notice`, 7000, true, true),
    state: choice(r.state, RELEASE_STATES, `${path}.state`),
    referenceIds: ids(r.referenceIds, `${path}.referenceIds`, 100),
  });
}
function reference(value, path) {
  const r = record(value, path); keys(r, REFERENCE_KEYS, path);
  const hash = r.sha256 === UNKNOWN ? UNKNOWN : text(r.sha256, `${path}.sha256`, 64);
  if (hash !== UNKNOWN && !/^[0-9a-f]{64}$/u.test(hash)) error(`${path}.sha256`, 'Expected SHA-256 or UNKNOWN');
  return Object.freeze({
    id: id(r.id, `${path}.id`), sourceId: id(r.sourceId, `${path}.sourceId`),
    title: text(r.title, `${path}.title`, 180),
    url: url(r.url, `${path}.url`),
    licenceUrl: url(r.licenceUrl, `${path}.licenceUrl`),
    collectedDate: date(r.collectedDate, `${path}.collectedDate`),
    termsDate: date(r.termsDate, `${path}.termsDate`),
    tier: choice(r.tier, REFERENCE_TIERS, `${path}.tier`),
    offlineNote: text(r.offlineNote, `${path}.offlineNote`, 1500, true, true),
    sha256: hash,
    language: choice(r.language, ['en', 'fr', UNKNOWN], `${path}.language`),
  });
}
function surface(value, path) {
  const r = record(value, path); keys(r, SURFACE_KEYS, path);
  if (r.targetPx !== UNKNOWN && (!Number.isSafeInteger(r.targetPx) || r.targetPx < 0 || r.targetPx > 2000)) error(`${path}.targetPx`, 'Expected pixels or UNKNOWN');
  return Object.freeze({
    id: id(r.id, `${path}.id`),
    language: choice(r.language, ['en', 'fr'], `${path}.language`),
    sourceIds: ids(r.sourceIds, `${path}.sourceIds`, 100),
    referenceIds: ids(r.referenceIds, `${path}.referenceIds`, 250),
    mapCredit: choice(r.mapCredit, PERMISSION_STATES, `${path}.mapCredit`),
    offline: choice(r.offline, PERMISSION_STATES, `${path}.offline`),
    keyboard: choice(r.keyboard, PERMISSION_STATES, `${path}.keyboard`),
    screenReader: choice(r.screenReader, PERMISSION_STATES, `${path}.screenReader`),
    targetPx: r.targetPx,
    route: text(r.route, `${path}.route`, 256),
  });
}
export function parseReferencePack(value) {
  const r = record(value, 'pack'); keys(r, KNOWN_KEYS, 'pack');
  if (r.schema !== REFERENCE_SCHEMA) error('pack.schema', 'Unsupported schema');
  const sources = unique(array(r.sources, 'pack.sources', REFERENCE_MAX_RECORDS).map((v, i) => source(v, `pack.sources[${i}]`)), 'pack.sources');
  const references = unique(array(r.references, 'pack.references', REFERENCE_MAX_REFERENCES).map((v, i) => reference(v, `pack.references[${i}]`)), 'pack.references');
  const surfaces = unique(array(r.surfaces, 'pack.surfaces', REFERENCE_MAX_SURFACES).map((v, i) => surface(v, `pack.surfaces[${i}]`)), 'pack.surfaces');
  return Object.freeze({schema:REFERENCE_SCHEMA, releaseId:id(r.releaseId, 'pack.releaseId'), sources:Object.freeze(sources), references:Object.freeze(references), surfaces:Object.freeze(surfaces)});
}
export function parseReferencePackJson(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > REFERENCE_MAX_BYTES) error('pack', 'JSON too large or invalid');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { error('pack', 'Invalid JSON'); }
  return parseReferencePack(parsed);
}
export function referenceIndex(pack) {
  return Object.freeze({
    sources:new Map(pack.sources.map((s) => [s.id, s])),
    references:new Map(pack.references.map((r) => [r.id, r])),
    surfaces:new Map(pack.surfaces.map((s) => [s.id, s])),
  });
}
export function describeSource(source, locale) {
  const name = source.provider !== 'other' && source.provider !== UNKNOWN ? SOURCES[source.provider]?.name : undefined;
  return {id:source.id, name:name ?? (locale === 'fr' ? 'Source non répertoriée' : 'Unlisted source'), datasetDate:source.datasetDate, tier:source.tier, licence:source.licence};
}
