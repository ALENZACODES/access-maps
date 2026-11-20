/** Strict offline contract for source-backed bilingual attribution publication QA. */
export const LOCALE_QA_SCHEMA = 'attribution-locale-qa/1';
export const UNKNOWN = 'UNKNOWN';
export const MAX_BYTES = 2_097_152;
export const MAX_SOURCES = 350;
export const MAX_PAGES = 350;
export const MAX_NOTICES = 1600;
export const MAX_TEXT = 6000;
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const TERMS = Object.freeze(['ODbL-1.0', 'Metrolinx-AUA', 'Metrolinx-OGL', 'LTC-Terms', 'OTHER-OPEN']);
export const REVIEW_STATES = Object.freeze(['accepted', 'pending', 'rejected', UNKNOWN]);
export const PERMISSIONS = Object.freeze(['YES', 'NO', UNKNOWN]);
export const PUBLICATION = Object.freeze(['included', 'held', 'excluded']);
export const DISPLAY = Object.freeze(['map', 'journey', 'results', 'download', 'other']);
export const NOTICE_KINDS = Object.freeze(['credit', 'licence', 'laws', 'disclaimer', 'supporting']);

export class LocaleQaInputError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'LocaleQaInputError';
    this.path = path;
  }
}

function fail(path, message) { throw new LocaleQaInputError(path, message); }
function object(input, path) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(path, 'Expected object');
  return input;
}
function exactKeys(input, allowed, path) {
  const keys = new Set(allowed);
  for (const key of Object.keys(input)) if (!keys.has(key)) fail(`${path}.${key}`, 'Unexpected field');
  for (const key of allowed) if (!Object.hasOwn(input, key)) fail(`${path}.${key}`, 'Missing field');
}
function text(input, path, max = MAX_TEXT, empty = false) {
  if (typeof input !== 'string' || input.length > max || (!empty && !input.trim())) fail(path, 'Expected bounded text');
  if (input !== input.normalize('NFC')) fail(path, 'Expected normalized text');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(input)) fail(path, 'Control character');
  return input;
}
function id(input, path) {
  const value = text(input, path, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) fail(path, 'Invalid identifier');
  return value;
}
function choice(input, choices, path) {
  if (!choices.includes(input)) fail(path, `Expected ${choices.join(', ')}`);
  return input;
}
function yesNo(input, path) { return choice(input, PERMISSIONS, path); }
function date(input, path) {
  if (input === UNKNOWN) return UNKNOWN;
  const value = text(input, path, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail(path, 'Expected ISO date or UNKNOWN');
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 9999 || m < 1 || m > 12) fail(path, 'Invalid date');
  const max = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > max) fail(path, 'Invalid calendar day');
  return value;
}
function link(input, path) {
  if (input === UNKNOWN) return UNKNOWN;
  const value = text(input, path, 2048);
  let parsed;
  try { parsed = new URL(value); } catch { fail(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash) fail(path, 'Public HTTPS URL required');
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local')) fail(path, 'Local URL is not allowed');
  if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/u.test(parsed.hostname)) fail(path, 'Private IP URL is not allowed');
  if (/^172\.(?:1[6-9]|2\d|3[01])\./u.test(parsed.hostname)) fail(path, 'Private IP URL is not allowed');
  if (parsed.hostname === '[::1]') fail(path, 'Loopback URL is not allowed');
  return value;
}
function route(input, path) {
  const value = text(input, path, 250);
  if (value.startsWith('/') || value.includes('\\') || value.includes('?') || value.includes('#') || /^[a-z][a-z\d+.-]*:/iu.test(value)) fail(path, 'Relative route required');
  if (value.split('/').some(s => !s || s === '.' || s === '..' || s.startsWith('.'))) fail(path, 'Unsafe route segment');
  if (!/^[a-zA-Z0-9_./-]+$/u.test(value)) fail(path, 'Unexpected route character');
  return value;
}
function boundedArray(input, path, limit) {
  if (!Array.isArray(input) || input.length > limit) fail(path, 'Expected bounded array');
  return input;
}
function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, 'Duplicate value');
  return values;
}
function ids(input, path, limit = 100) {
  return unique(boundedArray(input, path, limit).map((v, i) => id(v, `${path}[${i}]`)), path);
}
function dimension(input, path) {
  if (input === UNKNOWN) return UNKNOWN;
  if (!Number.isInteger(input) || input < 0 || input > 2000) fail(path, 'Expected integer pixels or UNKNOWN');
  return input;
}
export function parseLocaleSource(input, path = 'source') {
  const obj = object(input, path);
  exactKeys(obj, ['id', 'provider', 'terms', 'name', 'sourceUrl', 'licenceUrl', 'licenceName', 'permission', 'licenceEvidence', 'acquiredDate', 'datasetDate', 'termsDate', 'evidenceTier', 'status'], path);
  return {
    id: id(obj.id, `${path}.id`),
    provider: choice(obj.provider, ['osm', 'metrolinx', 'ltc', 'other'], `${path}.provider`),
    terms: choice(obj.terms, TERMS, `${path}.terms`),
    name: text(obj.name, `${path}.name`, 160),
    sourceUrl: link(obj.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: link(obj.licenceUrl, `${path}.licenceUrl`),
    licenceName: text(obj.licenceName, `${path}.licenceName`, 180),
    permission: yesNo(obj.permission, `${path}.permission`),
    licenceEvidence: yesNo(obj.licenceEvidence, `${path}.licenceEvidence`),
    acquiredDate: date(obj.acquiredDate, `${path}.acquiredDate`),
    datasetDate: date(obj.datasetDate, `${path}.datasetDate`),
    termsDate: date(obj.termsDate, `${path}.termsDate`),
    evidenceTier: choice(obj.evidenceTier, ['primary', 'secondary', 'community', UNKNOWN], `${path}.evidenceTier`),
    status: choice(obj.status, PUBLICATION, `${path}.status`),
  };
}
export function parseLocaleNotice(input, path = 'notice') {
  const obj = object(input, path);
  exactKeys(obj, ['id', 'sourceId', 'kind', 'text', 'licenceUrl', 'visible', 'nearContent', 'targetPx', 'keyboard', 'screenReader', 'contrast', 'review', 'reviewDate', 'evidenceUrl', 'evidenceNote'], path);
  return {
    id: id(obj.id, `${path}.id`),
    sourceId: id(obj.sourceId, `${path}.sourceId`),
    kind: choice(obj.kind, NOTICE_KINDS, `${path}.kind`),
    text: text(obj.text, `${path}.text`),
    licenceUrl: link(obj.licenceUrl, `${path}.licenceUrl`),
    visible: yesNo(obj.visible, `${path}.visible`),
    nearContent: yesNo(obj.nearContent, `${path}.nearContent`),
    targetPx: dimension(obj.targetPx, `${path}.targetPx`),
    keyboard: yesNo(obj.keyboard, `${path}.keyboard`),
    screenReader: yesNo(obj.screenReader, `${path}.screenReader`),
    contrast: yesNo(obj.contrast, `${path}.contrast`),
    review: choice(obj.review, REVIEW_STATES, `${path}.review`),
    reviewDate: date(obj.reviewDate, `${path}.reviewDate`),
    evidenceUrl: link(obj.evidenceUrl, `${path}.evidenceUrl`),
    evidenceNote: text(obj.evidenceNote, `${path}.evidenceNote`, 800, true),
  };
}
export function parseLocalePage(input, path = 'page') {
  const obj = object(input, path);
  exactKeys(obj, ['id', 'pairId', 'locale', 'route', 'display', 'sourceIds', 'notices', 'offline', 'targetPx', 'publishedDate', 'publicStatus'], path);
  const notices = boundedArray(obj.notices, `${path}.notices`, MAX_NOTICES).map((v, i) => parseLocaleNotice(v, `${path}.notices[${i}]`));
  unique(notices.map(n => n.id), `${path}.notices`);
  return {
    id: id(obj.id, `${path}.id`),
    pairId: id(obj.pairId, `${path}.pairId`),
    locale: choice(obj.locale, LANGUAGES, `${path}.locale`),
    route: route(obj.route, `${path}.route`),
    display: choice(obj.display, DISPLAY, `${path}.display`),
    sourceIds: ids(obj.sourceIds, `${path}.sourceIds`),
    notices,
    offline: yesNo(obj.offline, `${path}.offline`),
    targetPx: dimension(obj.targetPx, `${path}.targetPx`),
    publishedDate: date(obj.publishedDate, `${path}.publishedDate`),
    publicStatus: choice(obj.publicStatus, PUBLICATION, `${path}.publicStatus`),
  };
}
export function parseLocaleQa(input) {
  const obj = object(input, 'release');
  exactKeys(obj, ['schema', 'releaseId', 'requireBilingual', 'sources', 'pages'], 'release');
  if (obj.schema !== LOCALE_QA_SCHEMA) fail('release.schema', 'Unsupported schema');
  if (typeof obj.requireBilingual !== 'boolean') fail('release.requireBilingual', 'Expected boolean');
  const sources = boundedArray(obj.sources, 'release.sources', MAX_SOURCES).map((v, i) => parseLocaleSource(v, `release.sources[${i}]`));
  const pages = boundedArray(obj.pages, 'release.pages', MAX_PAGES).map((v, i) => parseLocalePage(v, `release.pages[${i}]`));
  unique(sources.map(s => s.id), 'release.sources');
  unique(pages.map(p => p.id), 'release.pages');
  unique(pages.map(p => p.route), 'release.pages.routes');
  return { schema: LOCALE_QA_SCHEMA, releaseId: id(obj.releaseId, 'release.releaseId'), requireBilingual: obj.requireBilingual, sources, pages };
}
export function parseLocaleQaJson(input) {
  if (typeof input !== 'string' || BufferByteLength(input) > MAX_BYTES) fail('release', 'JSON input too large');
  let parsed;
  try { parsed = JSON.parse(input); } catch { fail('release', 'Invalid JSON'); }
  return parseLocaleQa(parsed);
}
function BufferByteLength(input) { return new TextEncoder().encode(input).byteLength; }
export function serializeLocaleQa(release) { return `${JSON.stringify(parseLocaleQa(release), null, 2)}\n`; }
export function locatePage(release, id) { return release.pages.find(p => p.id === id) ?? null; }
export function locateSource(release, id) { return release.sources.find(s => s.id === id) ?? null; }
export function pairedPages(release) {
  const pairs = new Map();
  for (const page of release.pages) {
    const entries = pairs.get(page.pairId) ?? { en: null, fr: null };
    entries[page.locale] = page;
    pairs.set(page.pairId, entries);
  }
  return pairs;
}
export function sourcesUsedByPages(release) {
  const used = new Map(release.sources.map(s => [s.id, []]));
  for (const page of release.pages) for (const sourceId of page.sourceIds) {
    if (!used.has(sourceId)) used.set(sourceId, []);
    used.get(sourceId).push(page.id);
  }
  for (const [id, pages] of used) used.set(id, [...new Set(pages)].sort());
  return used;
}
export function noticeById(page, noticeId) { return page.notices.find(n => n.id === noticeId) ?? null; }
