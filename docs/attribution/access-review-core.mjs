/**
 * Evidence contract for manual accessibility review of attribution notices.
 * No browser APIs, external services, inferred dates, or implicit approvals.
 */
export const REVIEW_SCHEMA = 'attribution-access-review/1';
export const REVIEW_MAX_BYTES = 2_097_152;
export const UNKNOWN = 'UNKNOWN';
export const REVIEW_PROVIDERS = Object.freeze(['osm', 'metrolinx', 'ltc', 'other']);
export const REVIEW_LICENCES = Object.freeze(['ODbL-1.0', 'Metrolinx-AUA', 'OGL-Ontario-Metrolinx', 'LTC-Open-Data-Terms', 'OTHER-OPEN', UNKNOWN]);
export const REVIEW_STATES = Object.freeze(['YES', 'NO', UNKNOWN]);
export const REVIEW_DISPOSITIONS = Object.freeze(['included', 'held', 'excluded']);
export const REVIEW_TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const REVIEW_KINDS = Object.freeze(['credit', 'terms', 'aua-legend', 'aua-laws-en', 'aua-laws-fr', 'ogl', 'ltc']);
export const REVIEW_TECHNIQUES = Object.freeze(['keyboard', 'screen-reader', 'contrast', 'reflow', 'touch']);
export const REVIEW_RESULTS = Object.freeze(['PASS', 'FAIL', UNKNOWN]);
export const REVIEW_LOCALES = Object.freeze(['en', 'fr']);
const SOURCE_FIELDS = ['id', 'provider', 'licence', 'sourceUrl', 'licenceUrl', 'datasetDate', 'acquiredDate', 'termsDate', 'permission', 'tier', 'notice', 'status'];
const TARGET_FIELDS = ['id', 'sourceId', 'kind', 'text', 'visible', 'keyboard', 'focusVisible', 'screenReader', 'widthPx', 'heightPx', 'testedDate', 'evidenceUrl', 'observations'];
const OBSERVATION_FIELDS = ['technique', 'result', 'note', 'date', 'referenceUrl'];
const SURFACE_FIELDS = ['id', 'route', 'locale', 'sourceIds', 'offline', 'status', 'targets'];
const ROOT_FIELDS = ['schema', 'releaseId', 'sources', 'surfaces'];

export class ReviewInputError extends Error {
  constructor(path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'ReviewInputError';
    this.path = path;
  }
}

export function isReviewObject(input) {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
function object(input, path) {
  if (!isReviewObject(input)) throw new ReviewInputError(path, 'Expected object');
  return input;
}
function keys(value, expected, path) {
  const allowed = new Set(expected);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new ReviewInputError(`${path}.${field}`, 'Unknown field');
  }
  for (const field of expected) {
    if (!Object.hasOwn(value, field)) throw new ReviewInputError(`${path}.${field}`, 'Missing field');
  }
}
function text(value, path, maximum = 512, empty = false, multiline = false) {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim())) {
    throw new ReviewInputError(path, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new ReviewInputError(path, 'Expected NFC text');
  const bad = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (bad.test(value)) throw new ReviewInputError(path, 'Control character');
  return value;
}
function selection(value, options, path) {
  if (typeof value !== 'string' || !options.includes(value)) throw new ReviewInputError(path, `Expected ${options.join(', ')}`);
  return value;
}
function id(value, path) {
  const parsed = text(value, path, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(parsed)) throw new ReviewInputError(path, 'Invalid identifier');
  return parsed;
}
function array(value, path, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new ReviewInputError(path, 'Expected bounded array');
  return value;
}
function unique(values, path) {
  if (new Set(values).size !== values.length) throw new ReviewInputError(path, 'Duplicate identity');
  return values;
}
export function parseReviewDate(value, path = 'date') {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new ReviewInputError(path, 'Expected YYYY-MM-DD or UNKNOWN');
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (y < 1900 || y > 9999 || m < 1 || m > 12) throw new ReviewInputError(path, 'Invalid date');
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > lengths[m - 1]) throw new ReviewInputError(path, 'Invalid day');
  return value;
}
export function parseReviewUrl(value, path = 'url') {
  if (value === UNKNOWN) return UNKNOWN;
  const v = text(value, path, 2048);
  let parsed;
  try { parsed = new URL(v); } catch { throw new ReviewInputError(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash) {
    throw new ReviewInputError(path, 'Only public HTTPS URLs without credentials or fragment');
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' || /^\d+\.\d+\.\d+\.\d+$/u.test(host)) {
    throw new ReviewInputError(path, 'Private or numeric host');
  }
  return v;
}
export function parseReviewRoute(value, path = 'route') {
  const v = text(value, path, 256);
  if (v.startsWith('/') || v.includes('\\') || v.includes('?') || v.includes('#') || /^[a-z][a-z\d+.-]*:/iu.test(v)) {
    throw new ReviewInputError(path, 'Expected safe relative path');
  }
  const parts = v.split('/');
  if (parts.some(part => !part || part === '..' || part === '.' || part.startsWith('.') || !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/u.test(part))) {
    throw new ReviewInputError(path, 'Unsafe path segment');
  }
  return v;
}
function dimension(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (!Number.isInteger(value) || value < 0 || value > 1000) throw new ReviewInputError(path, 'Expected integer pixels or UNKNOWN');
  return value;
}
function parseObservation(value, path) {
  const o = object(value, path);
  keys(o, OBSERVATION_FIELDS, path);
  return {
    technique: selection(o.technique, REVIEW_TECHNIQUES, `${path}.technique`),
    result: selection(o.result, REVIEW_RESULTS, `${path}.result`),
    note: text(o.note, `${path}.note`, 1200, true, true),
    date: parseReviewDate(o.date, `${path}.date`),
    referenceUrl: parseReviewUrl(o.referenceUrl, `${path}.referenceUrl`),
  };
}
export function parseReviewTarget(value, path = 'target') {
  const o = object(value, path);
  keys(o, TARGET_FIELDS, path);
  const observations = array(o.observations, `${path}.observations`, 12).map((entry, index) => parseObservation(entry, `${path}.observations[${index}]`));
  unique(observations.map(item => item.technique), `${path}.observations`);
  return {
    id: id(o.id, `${path}.id`),
    sourceId: id(o.sourceId, `${path}.sourceId`),
    kind: selection(o.kind, REVIEW_KINDS, `${path}.kind`),
    text: text(o.text, `${path}.text`, 6000, true, true),
    visible: selection(o.visible, REVIEW_STATES, `${path}.visible`),
    keyboard: selection(o.keyboard, REVIEW_STATES, `${path}.keyboard`),
    focusVisible: selection(o.focusVisible, REVIEW_STATES, `${path}.focusVisible`),
    screenReader: selection(o.screenReader, REVIEW_STATES, `${path}.screenReader`),
    widthPx: dimension(o.widthPx, `${path}.widthPx`),
    heightPx: dimension(o.heightPx, `${path}.heightPx`),
    testedDate: parseReviewDate(o.testedDate, `${path}.testedDate`),
    evidenceUrl: parseReviewUrl(o.evidenceUrl, `${path}.evidenceUrl`),
    observations,
  };
}
export function parseReviewSource(value, path = 'source') {
  const o = object(value, path);
  keys(o, SOURCE_FIELDS, path);
  return {
    id: id(o.id, `${path}.id`),
    provider: selection(o.provider, REVIEW_PROVIDERS, `${path}.provider`),
    licence: selection(o.licence, REVIEW_LICENCES, `${path}.licence`),
    sourceUrl: parseReviewUrl(o.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: parseReviewUrl(o.licenceUrl, `${path}.licenceUrl`),
    datasetDate: parseReviewDate(o.datasetDate, `${path}.datasetDate`),
    acquiredDate: parseReviewDate(o.acquiredDate, `${path}.acquiredDate`),
    termsDate: parseReviewDate(o.termsDate, `${path}.termsDate`),
    permission: selection(o.permission, REVIEW_STATES, `${path}.permission`),
    tier: selection(o.tier, REVIEW_TIERS, `${path}.tier`),
    notice: text(o.notice, `${path}.notice`, 6000, true, true),
    status: selection(o.status, REVIEW_DISPOSITIONS, `${path}.status`),
  };
}
export function parseReviewSurface(value, path = 'surface') {
  const o = object(value, path);
  keys(o, SURFACE_FIELDS, path);
  const sourceIds = array(o.sourceIds, `${path}.sourceIds`, 200).map((entry, index) => id(entry, `${path}.sourceIds[${index}]`));
  const targets = array(o.targets, `${path}.targets`, 400).map((entry, index) => parseReviewTarget(entry, `${path}.targets[${index}]`));
  unique(sourceIds, `${path}.sourceIds`);
  unique(targets.map(target => target.id), `${path}.targets`);
  return {
    id: id(o.id, `${path}.id`),
    route: parseReviewRoute(o.route, `${path}.route`),
    locale: selection(o.locale, REVIEW_LOCALES, `${path}.locale`),
    sourceIds,
    offline: selection(o.offline, REVIEW_STATES, `${path}.offline`),
    status: selection(o.status, REVIEW_DISPOSITIONS, `${path}.status`),
    targets,
  };
}
export function parseAccessReview(value) {
  const o = object(value, 'release');
  keys(o, ROOT_FIELDS, 'release');
  if (o.schema !== REVIEW_SCHEMA) throw new ReviewInputError('release.schema', 'Unsupported schema');
  const sources = array(o.sources, 'release.sources', 500).map((entry, index) => parseReviewSource(entry, `release.sources[${index}]`));
  const surfaces = array(o.surfaces, 'release.surfaces', 500).map((entry, index) => parseReviewSurface(entry, `release.surfaces[${index}]`));
  unique(sources.map(source => source.id), 'release.sources');
  unique(surfaces.map(surface => surface.id), 'release.surfaces');
  unique(surfaces.map(surface => surface.route), 'release.surfaces.route');
  return { schema: REVIEW_SCHEMA, releaseId: id(o.releaseId, 'release.releaseId'), sources, surfaces };
}
export function parseAccessReviewJson(value) {
  if (typeof value !== 'string' || BufferlessByteLength(value) > REVIEW_MAX_BYTES) throw new ReviewInputError('release', 'JSON exceeds byte limit');
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new ReviewInputError('release', 'Invalid JSON'); }
  return parseAccessReview(parsed);
}
/** UTF-8 byte count without a Node dependency, for browser reuse. */
export function BufferlessByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
export function exportAccessReview(value) {
  return `${JSON.stringify(parseAccessReview(value), null, 2)}\n`;
}
export function summarizeReviewStructure(review) {
  const parsed = parseAccessReview(review);
  const included = parsed.sources.filter(item => item.status === 'included');
  const active = parsed.surfaces.filter(item => item.status === 'included');
  return {
    releaseId: parsed.releaseId,
    sources: parsed.sources.length,
    includedSources: included.length,
    surfaces: parsed.surfaces.length,
    includedSurfaces: active.length,
    targets: active.reduce((count, surface) => count + surface.targets.length, 0),
    unknownDatasetDates: included.filter(item => item.datasetDate === UNKNOWN).length,
  };
}
