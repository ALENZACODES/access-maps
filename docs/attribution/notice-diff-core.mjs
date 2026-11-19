/** Strict release notice manifest. Pure: no network, clock, or storage. */
import {
  SOURCE_IDS, SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';

export const NOTICE_SCHEMA = 'attribution-notice-diff/1';
export const UNKNOWN = 'UNKNOWN';
export const MAX_DOCUMENT_BYTES = 2_097_152;
export const MAX_SOURCES = 250;
export const MAX_SURFACES = 400;
export const MAX_NOTICES = 1000;
export const LICENCE_TYPES = Object.freeze(['ODbL-1.0', 'Metrolinx-AUA', 'Metrolinx-OGL', 'LTC-Terms', 'OTHER-OPEN', UNKNOWN]);
export const EVIDENCE_TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const STATES = Object.freeze(['YES', 'NO', UNKNOWN]);
export const DISPOSITIONS = Object.freeze(['included', 'held', 'excluded']);
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const SURFACE_MODES = Object.freeze(['map', 'journey', 'list', 'download', 'other']);
export const NOTICE_KINDS = Object.freeze(['credit', 'licence', 'law', 'explanation', 'other']);

export class NoticeInputError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'NoticeInputError';
    this.path = path;
  }
}
function object(value, path) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new NoticeInputError(path, 'Expected object');
  return value;
}
function fields(value, required, optional, path) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new NoticeInputError(`${path}.${key}`, 'Unknown field');
  for (const key of required) if (!Object.hasOwn(value, key)) throw new NoticeInputError(`${path}.${key}`, 'Missing field');
}
function text(value, path, max = 500, allowEmpty = false, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim() === '')) {
    throw new NoticeInputError(path, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new NoticeInputError(path, 'Expected NFC text');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (!multiline && /[\r\n\t]/u.test(value))) {
    throw new NoticeInputError(path, 'Control character in text');
  }
  return value;
}
function id(value, path) {
  const result = text(value, path, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) throw new NoticeInputError(path, 'Invalid identifier');
  return result;
}
function enumValue(value, choices, path) {
  if (!choices.includes(value)) throw new NoticeInputError(path, `Expected ${choices.join(', ')}`);
  return value;
}
function date(value, path) {
  if (value === UNKNOWN) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new NoticeInputError(path, 'Expected ISO date or UNKNOWN');
  const [y, m, d] = value.split('-').map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) throw new NoticeInputError(path, 'Invalid calendar date');
  return value;
}
function https(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const raw = text(value, path, 2048);
  let u;
  try { u = new URL(raw); } catch { throw new NoticeInputError(path, 'Invalid URL'); }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.hash || u.hostname === 'localhost' || u.hostname.endsWith('.local') || u.hostname.endsWith('.localhost') || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(u.hostname) || u.hostname === '[::1]') {
    throw new NoticeInputError(path, 'Public HTTPS URL required');
  }
  return raw;
}
function array(value, path, limit) {
  if (!Array.isArray(value) || value.length > limit) throw new NoticeInputError(path, 'Expected bounded array');
  return value;
}
function ids(value, path, limit = 250) {
  const result = array(value, path, limit).map((v, i) => id(v, `${path}[${i}]`));
  if (new Set(result).size !== result.length) throw new NoticeInputError(path, 'Duplicate IDs');
  return result;
}
function boolOrUnknown(value, path) { return enumValue(value, STATES, path); }
function size(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (!Number.isInteger(value) || value < 0 || value > 1000) throw new NoticeInputError(path, 'Expected integer pixel size or UNKNOWN');
  return value;
}
function unique(records, key, path) {
  const seen = new Set();
  for (const [i, record] of records.entries()) {
    if (seen.has(record[key])) throw new NoticeInputError(`${path}[${i}].${key}`, 'Duplicate identifier');
    seen.add(record[key]);
  }
}
export function parseNoticeSource(raw, path = 'source') {
  const r = object(raw, path);
  fields(r, ['id', 'provider', 'licence', 'sourceUrl', 'licenceUrl', 'licenceName', 'permission', 'licenceEvidence', 'tier', 'acquiredDate', 'datasetDate', 'termsDate', 'state'], ['note'], path);
  const provider = enumValue(r.provider, [...SOURCE_IDS, 'other'], `${path}.provider`);
  return Object.freeze({
    id: id(r.id, `${path}.id`), provider,
    licence: enumValue(r.licence, LICENCE_TYPES, `${path}.licence`),
    sourceUrl: https(r.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: https(r.licenceUrl, `${path}.licenceUrl`),
    licenceName: text(r.licenceName, `${path}.licenceName`, 160),
    permission: boolOrUnknown(r.permission, `${path}.permission`),
    licenceEvidence: boolOrUnknown(r.licenceEvidence, `${path}.licenceEvidence`),
    tier: enumValue(r.tier, EVIDENCE_TIERS, `${path}.tier`),
    acquiredDate: date(r.acquiredDate, `${path}.acquiredDate`),
    datasetDate: date(r.datasetDate, `${path}.datasetDate`),
    termsDate: date(r.termsDate, `${path}.termsDate`),
    state: enumValue(r.state, DISPOSITIONS, `${path}.state`),
    note: r.note === undefined ? '' : text(r.note, `${path}.note`, 500, true, true),
  });
}
export function parseNotice(raw, path = 'notice') {
  const r = object(raw, path);
  fields(r, ['id', 'sourceId', 'locale', 'kind', 'text', 'visible', 'nearMap', 'termsUrl', 'recordedDate'], [], path);
  return Object.freeze({
    id: id(r.id, `${path}.id`), sourceId: id(r.sourceId, `${path}.sourceId`),
    locale: enumValue(r.locale, LANGUAGES, `${path}.locale`),
    kind: enumValue(r.kind, NOTICE_KINDS, `${path}.kind`),
    text: text(r.text, `${path}.text`, 4000, false, true),
    visible: boolOrUnknown(r.visible, `${path}.visible`),
    nearMap: boolOrUnknown(r.nearMap, `${path}.nearMap`),
    termsUrl: https(r.termsUrl, `${path}.termsUrl`),
    recordedDate: date(r.recordedDate, `${path}.recordedDate`),
  });
}
export function parseNoticeSurface(raw, path = 'surface') {
  const r = object(raw, path);
  fields(r, ['id', 'route', 'locale', 'mode', 'sourceIds', 'noticeIds', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedDate'], [], path);
  const route = text(r.route, `${path}.route`, 240);
  if (route.startsWith('/') || route.startsWith('.') || route.includes('\\') || route.includes('?') || route.includes('#') || route.split('/').some(p => !p || p === '.' || p === '..') || !/^[a-zA-Z0-9_./-]+$/u.test(route)) throw new NoticeInputError(`${path}.route`, 'Unsafe relative route');
  return Object.freeze({
    id: id(r.id, `${path}.id`), route,
    locale: enumValue(r.locale, LANGUAGES, `${path}.locale`),
    mode: enumValue(r.mode, SURFACE_MODES, `${path}.mode`),
    sourceIds: Object.freeze(ids(r.sourceIds, `${path}.sourceIds`)),
    noticeIds: Object.freeze(ids(r.noticeIds, `${path}.noticeIds`, 1000)),
    offline: boolOrUnknown(r.offline, `${path}.offline`),
    keyboard: boolOrUnknown(r.keyboard, `${path}.keyboard`),
    screenReader: boolOrUnknown(r.screenReader, `${path}.screenReader`),
    targetPx: size(r.targetPx, `${path}.targetPx`),
    publishedDate: date(r.publishedDate, `${path}.publishedDate`),
  });
}
export function parseNoticeRelease(value) {
  const r = object(value, 'release');
  fields(r, ['schema', 'releaseId', 'sources', 'notices', 'surfaces'], [], 'release');
  if (r.schema !== NOTICE_SCHEMA) throw new NoticeInputError('release.schema', 'Unsupported version');
  const sources = array(r.sources, 'release.sources', MAX_SOURCES).map((item, i) => parseNoticeSource(item, `release.sources[${i}]`));
  const notices = array(r.notices, 'release.notices', MAX_NOTICES).map((item, i) => parseNotice(item, `release.notices[${i}]`));
  const surfaces = array(r.surfaces, 'release.surfaces', MAX_SURFACES).map((item, i) => parseNoticeSurface(item, `release.surfaces[${i}]`));
  unique(sources, 'id', 'release.sources');
  unique(notices, 'id', 'release.notices');
  unique(surfaces, 'id', 'release.surfaces');
  const routes = new Set();
  for (const [i, surface] of surfaces.entries()) {
    if (routes.has(surface.route)) throw new NoticeInputError(`release.surfaces[${i}].route`, 'Duplicate route');
    routes.add(surface.route);
  }
  return Object.freeze({ schema: NOTICE_SCHEMA, releaseId: id(r.releaseId, 'release.releaseId'), sources: Object.freeze(sources), notices: Object.freeze(notices), surfaces: Object.freeze(surfaces) });
}
export function parseNoticeReleaseJson(json) {
  if (typeof json !== 'string' || BufferSafeLength(json) > MAX_DOCUMENT_BYTES) throw new NoticeInputError('release', 'Document too large');
  let value;
  try { value = JSON.parse(json); } catch { throw new NoticeInputError('release', 'Invalid JSON'); }
  return parseNoticeRelease(value);
}
function BufferSafeLength(raw) { return new TextEncoder().encode(raw).byteLength; }
export function knownCatalogueProvider(source) { return SOURCE_IDS.includes(source.provider); }
export function catalogueFor(source) { return SOURCES[source.provider] ?? null; }
export const LEGAL_NOTICES = Object.freeze({
  aua: Object.freeze([METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR]),
  ogl: METROLINX_OGL_NOTICE,
  osmCredit: SOURCES.osm.notices.en[0],
  osmLicence: SOURCES.osm.notices.en[1],
  ltcEn: SOURCES.ltc.notices.en[0],
  ltcFr: SOURCES.ltc.notices.fr[0],
});
export function normalizedNotice(value) { return value.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
export function hasFullNotice(haystack, needle) { return normalizedNotice(haystack).includes(normalizedNotice(needle)); }
export function licenceMatchesProvider(source) {
  if (source.provider === 'osm') return source.licence === 'ODbL-1.0';
  if (source.provider === 'ltc') return source.licence === 'LTC-Terms';
  if (source.provider === 'metrolinx') return source.licence === 'Metrolinx-AUA' || source.licence === 'Metrolinx-OGL';
  return source.licence === 'OTHER-OPEN';
}
