/** Strict declarative contract for scanning locally built attribution HTML. */
import { SOURCE_IDS, UNKNOWN } from './attribution-utils.mjs';

export const STATIC_SCHEMA = 'attribution-static-pages/1';
export const MAX_MANIFEST_BYTES = 1_048_576;
export const MAX_HTML_BYTES = 2_097_152;
export const MAX_PAGES = 200;
export const MAX_CREDITS = 1000;
export const LICENCES = Object.freeze([
  'ODbL-1.0', 'Metrolinx-AUA', 'OGL-Ontario-Metrolinx',
  'LTC-Open-Data-Terms', 'OTHER-OPEN', UNKNOWN,
]);
export const TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const RIGHTS = Object.freeze(['YES', 'NO', UNKNOWN]);

export class StaticInputError extends Error {
  constructor(path, description) {
    super(`${path}: ${description}`);
    this.name = 'StaticInputError';
    this.path = path;
  }
}
function fail(path, message) { throw new StaticInputError(path, message); }
function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Expected object');
  return value;
}
function exact(value, fields, path) {
  const expected = new Set(fields);
  for (const field of Object.keys(value)) if (!expected.has(field)) fail(`${path}.${field}`, 'Unknown field');
  for (const field of fields) if (!Object.hasOwn(value, field)) fail(`${path}.${field}`, 'Missing field');
}
function text(value, path, limit = 512, empty = false, multiline = false) {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim())) fail(path, 'Expected bounded text');
  if (value !== value.normalize('NFC') || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value)) fail(path, 'Unsafe or non-normalized text');
  return value;
}
function id(value, path) {
  const result = text(value, path, 80);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) fail(path, 'Invalid identifier');
  return result;
}
function one(value, options, path) {
  if (!options.includes(value)) fail(path, `Allowed values: ${options.join(', ')}`);
  return value;
}
function iso(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/u.test(value)) fail(path, 'Expected date or UNKNOWN');
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8));
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) fail(path, 'Invalid date');
  return value;
}
function publicUrl(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const raw = text(value, path, 2048);
  let parsed;
  try { parsed = new URL(raw); } catch { fail(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash ||
      parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname) ||
      parsed.hostname === '[::1]') fail(path, 'Public HTTPS URL required');
  return raw;
}
/** Restrict scanned files to ordinary relative paths, independent of OS. */
export function relativePage(value, path = 'file') {
  const raw = text(value, path, 300);
  if (raw.startsWith('/') || raw.startsWith('~') || raw.includes('\\') ||
      raw.includes('?') || raw.includes('#') || /^[a-z][a-z\d+.-]*:/iu.test(raw)) {
    fail(path, 'Relative POSIX path required');
  }
  const parts = raw.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.') ||
        !/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/u.test(part))) fail(path, 'Invalid path segment');
  if (!raw.endsWith('.html')) fail(path, 'HTML page required');
  return raw;
}
function unique(items, path) {
  if (new Set(items).size !== items.length) fail(path, 'Duplicate value');
  return items;
}
const CREDIT_FIELDS = ['id', 'provider', 'licence', 'sourceUrl', 'licenceUrl', 'permission',
  'tier', 'datasetDate', 'collectedDate', 'termsDate', 'notice'];
const PAGE_FIELDS = ['id', 'file', 'locale', 'credits', 'offline', 'minimumTargetPx',
  'navigationLabel', 'mapView'];
const ROOT_FIELDS = ['schema', 'releaseId', 'pages'];
function credit(value, path) {
  const entry = object(value, path);
  exact(entry, CREDIT_FIELDS, path);
  const notice = text(entry.notice, `${path}.notice`, 8000, true, true);
  return Object.freeze({
    id: id(entry.id, `${path}.id`),
    provider: one(entry.provider, [...SOURCE_IDS, 'other', UNKNOWN], `${path}.provider`),
    licence: one(entry.licence, LICENCES, `${path}.licence`),
    sourceUrl: publicUrl(entry.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: publicUrl(entry.licenceUrl, `${path}.licenceUrl`),
    permission: one(entry.permission, RIGHTS, `${path}.permission`),
    tier: one(entry.tier, TIERS, `${path}.tier`),
    datasetDate: iso(entry.datasetDate, `${path}.datasetDate`),
    collectedDate: iso(entry.collectedDate, `${path}.collectedDate`),
    termsDate: iso(entry.termsDate, `${path}.termsDate`),
    notice,
  });
}
function page(value, path) {
  const entry = object(value, path);
  exact(entry, PAGE_FIELDS, path);
  if (!Array.isArray(entry.credits) || entry.credits.length > MAX_CREDITS) fail(`${path}.credits`, 'Expected bounded list');
  const credits = entry.credits.map((item, i) => credit(item, `${path}.credits[${i}]`));
  unique(credits.map(item => item.id), `${path}.credits`);
  const px = entry.minimumTargetPx;
  if (px !== UNKNOWN && (!Number.isSafeInteger(px) || px < 0 || px > 2000)) fail(`${path}.minimumTargetPx`, 'Expected pixels or UNKNOWN');
  return Object.freeze({
    id: id(entry.id, `${path}.id`),
    file: relativePage(entry.file, `${path}.file`),
    locale: one(entry.locale, ['en', 'fr'], `${path}.locale`),
    credits: Object.freeze(credits),
    offline: one(entry.offline, RIGHTS, `${path}.offline`),
    minimumTargetPx: px,
    navigationLabel: text(entry.navigationLabel, `${path}.navigationLabel`, 150),
    mapView: one(entry.mapView, RIGHTS, `${path}.mapView`),
  });
}
export function parseStaticRelease(value) {
  const root = object(value, 'release');
  exact(root, ROOT_FIELDS, 'release');
  if (root.schema !== STATIC_SCHEMA) fail('release.schema', 'Unsupported schema');
  if (!Array.isArray(root.pages) || root.pages.length > MAX_PAGES) fail('release.pages', 'Expected bounded list');
  const pages = root.pages.map((item, i) => page(item, `release.pages[${i}]`));
  unique(pages.map(item => item.id), 'release.pages.id');
  unique(pages.map(item => item.file), 'release.pages.file');
  return Object.freeze({schema: STATIC_SCHEMA, releaseId: id(root.releaseId, 'release.releaseId'), pages: Object.freeze(pages)});
}
export function parseStaticReleaseJson(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_MANIFEST_BYTES) fail('release', 'Input exceeds limit');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail('release', 'Invalid JSON'); }
  return parseStaticRelease(parsed);
}
