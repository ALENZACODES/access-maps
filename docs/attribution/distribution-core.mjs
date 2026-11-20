/** Versioned distribution manifest: source -> asset -> delivered view. Pure, offline. */
export const DISTRIBUTION_SCHEMA = 'attribution-distribution/1';
export const DISTRIBUTION_MAX_BYTES = 2_097_152;
export const UNKNOWN = 'UNKNOWN';
export const EVIDENCE = Object.freeze(['YES', 'NO', UNKNOWN]);
export const TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const PROVIDERS = Object.freeze(['osm', 'metrolinx-aua', 'metrolinx-ogl', 'ltc', 'other']);
export const STATES = Object.freeze(['included', 'held', 'excluded']);
export const ASSET_KINDS = Object.freeze(['html', 'javascript', 'stylesheet', 'data', 'image', 'other']);
export const PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/u;
export const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export class DistributionInputError extends Error {
  constructor(path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'DistributionInputError';
    this.path = path;
  }
}
const reject = (path, reason) => { throw new DistributionInputError(path, reason); };
const record = (value, path) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject(path, 'Expected an object');
  return value;
};
const exact = (obj, fields, path) => {
  const expected = new Set(fields);
  for (const name of Object.keys(obj)) if (!expected.has(name)) reject(`${path}.${name}`, 'Unknown field');
  for (const name of fields) if (!Object.hasOwn(obj, name)) reject(`${path}.${name}`, 'Missing field');
};
export function strictText(value, path, max = 512, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) reject(path, 'Expected bounded text');
  if (value !== value.normalize('NFC')) reject(path, 'NFC required');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) reject(path, 'Control character');
  return value;
}
export function strictId(value, path) {
  const id = strictText(value, path, 72);
  if (!ID_PATTERN.test(id)) reject(path, 'Invalid identifier');
  return id;
}
export function strictChoice(value, options, path) {
  if (typeof value !== 'string' || !options.includes(value)) reject(path, `Expected ${options.join(', ')}`);
  return value;
}
export function strictDate(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) reject(path, 'ISO date or UNKNOWN required');
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1900 || year > 9999 || month < 1 || month > 12) reject(path, 'Invalid date');
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) reject(path, 'Invalid day');
  return value;
}
export function strictUrl(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const input = strictText(value, path, 2048);
  let uri;
  try { uri = new URL(input); } catch { reject(path, 'Invalid URL'); }
  if (uri.protocol !== 'https:' || !uri.hostname || uri.username || uri.password || uri.hash) reject(path, 'Public HTTPS required');
  if (uri.hostname === 'localhost' || uri.hostname.endsWith('.local') || uri.hostname.endsWith('.localhost')) reject(path, 'Private hostname');
  if (/^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(uri.hostname)) reject(path, 'Private address');
  return input;
}
export function strictPath(value, path) {
  const input = strictText(value, path, 240);
  if (!PATH_PATTERN.test(input) || input.startsWith('/') || input.includes('\\') || input.includes('//') || input.includes('?') || input.includes('#')) reject(path, 'Relative POSIX path required');
  if (input.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) reject(path, 'Traversing or hidden path');
  return input;
}
export function strictList(value, path, max, parse) {
  if (!Array.isArray(value) || value.length > max) reject(path, 'Expected bounded array');
  return value.map((item, index) => parse(item, `${path}[${index}]`));
}
export function unique(values, path) {
  if (new Set(values).size !== values.length) reject(path, 'Duplicate entry');
  return values;
}
const sourceKeys = ['id', 'provider', 'name', 'sourceUrl', 'licenceName', 'licenceUrl', 'permission', 'licenceEvidence', 'tier', 'datasetDate', 'acquiredDate', 'termsDate', 'notice', 'state'];
const assetKeys = ['id', 'path', 'kind', 'sourceIds', 'dependencyIds', 'state', 'bytes', 'sha256'];
const viewKeys = ['id', 'path', 'locale', 'assetIds', 'sourceIds', 'noticeText', 'noticeVisible', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedDate'];
const allKeys = ['schema', 'releaseId', 'sources', 'assets', 'views'];
export function parseSource(value, path = 'source') {
  const o = record(value, path); exact(o, sourceKeys, path);
  return {
    id: strictId(o.id, `${path}.id`), provider: strictChoice(o.provider, PROVIDERS, `${path}.provider`),
    name: strictText(o.name, `${path}.name`, 160), sourceUrl: strictUrl(o.sourceUrl, `${path}.sourceUrl`),
    licenceName: strictText(o.licenceName, `${path}.licenceName`, 180), licenceUrl: strictUrl(o.licenceUrl, `${path}.licenceUrl`),
    permission: strictChoice(o.permission, EVIDENCE, `${path}.permission`),
    licenceEvidence: strictChoice(o.licenceEvidence, EVIDENCE, `${path}.licenceEvidence`),
    tier: strictChoice(o.tier, TIERS, `${path}.tier`), datasetDate: strictDate(o.datasetDate, `${path}.datasetDate`),
    acquiredDate: strictDate(o.acquiredDate, `${path}.acquiredDate`), termsDate: strictDate(o.termsDate, `${path}.termsDate`),
    notice: strictText(o.notice, `${path}.notice`, 8000, true),
    state: strictChoice(o.state, STATES, `${path}.state`),
  };
}
export function parseAsset(value, path = 'asset') {
  const o = record(value, path); exact(o, assetKeys, path);
  const bytes = o.bytes === UNKNOWN ? UNKNOWN : o.bytes;
  if (bytes !== UNKNOWN && (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0)) reject(`${path}.bytes`, 'Nonnegative bytes or UNKNOWN required');
  const sha = o.sha256;
  if (sha !== UNKNOWN && (typeof sha !== 'string' || !/^[a-f0-9]{64}$/u.test(sha))) reject(`${path}.sha256`, 'Lowercase SHA-256 or UNKNOWN required');
  return {
    id: strictId(o.id, `${path}.id`), path: strictPath(o.path, `${path}.path`), kind: strictChoice(o.kind, ASSET_KINDS, `${path}.kind`),
    sourceIds: unique(strictList(o.sourceIds, `${path}.sourceIds`, 250, strictId), `${path}.sourceIds`),
    dependencyIds: unique(strictList(o.dependencyIds, `${path}.dependencyIds`, 250, strictId), `${path}.dependencyIds`),
    state: strictChoice(o.state, STATES, `${path}.state`), bytes, sha256: sha,
  };
}
export function parseView(value, path = 'view') {
  const o = record(value, path); exact(o, viewKeys, path);
  const target = o.targetPx;
  if (target !== UNKNOWN && (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target > 1000)) reject(`${path}.targetPx`, 'Target pixels or UNKNOWN required');
  return {
    id: strictId(o.id, `${path}.id`), path: strictPath(o.path, `${path}.path`), locale: strictChoice(o.locale, ['en', 'fr'], `${path}.locale`),
    assetIds: unique(strictList(o.assetIds, `${path}.assetIds`, 500, strictId), `${path}.assetIds`),
    sourceIds: unique(strictList(o.sourceIds, `${path}.sourceIds`, 500, strictId), `${path}.sourceIds`),
    noticeText: strictText(o.noticeText, `${path}.noticeText`, 20000, true),
    noticeVisible: strictChoice(o.noticeVisible, EVIDENCE, `${path}.noticeVisible`),
    offline: strictChoice(o.offline, EVIDENCE, `${path}.offline`),
    keyboard: strictChoice(o.keyboard, EVIDENCE, `${path}.keyboard`),
    screenReader: strictChoice(o.screenReader, EVIDENCE, `${path}.screenReader`),
    targetPx: target, publishedDate: strictDate(o.publishedDate, `${path}.publishedDate`),
  };
}
export function parseDistribution(value) {
  const o = record(value, 'manifest'); exact(o, allKeys, 'manifest');
  if (o.schema !== DISTRIBUTION_SCHEMA) reject('manifest.schema', 'Unsupported schema');
  const sources = strictList(o.sources, 'manifest.sources', 400, parseSource);
  const assets = strictList(o.assets, 'manifest.assets', 1500, parseAsset);
  const views = strictList(o.views, 'manifest.views', 500, parseView);
  unique(sources.map(s => s.id), 'manifest.sources');
  unique(assets.map(a => a.id), 'manifest.assets');
  unique(assets.map(a => a.path), 'manifest.assets.path');
  unique(views.map(v => v.id), 'manifest.views');
  unique(views.map(v => v.path), 'manifest.views.path');
  return { schema: DISTRIBUTION_SCHEMA, releaseId: strictId(o.releaseId, 'manifest.releaseId'), sources, assets, views };
}
export function parseDistributionJson(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > DISTRIBUTION_MAX_BYTES) reject('manifest', 'Document too large');
  let value;
  try { value = JSON.parse(text); } catch { reject('manifest', 'Invalid JSON'); }
  return parseDistribution(value);
}
export function canonicalDistribution(value) {
  const manifest = parseDistribution(value);
  const sorting = (a, b) => a.id.localeCompare(b.id);
  return { ...manifest, sources: [...manifest.sources].sort(sorting), assets: [...manifest.assets].sort(sorting).map(x => ({...x, sourceIds: [...x.sourceIds].sort(), dependencyIds: [...x.dependencyIds].sort()})), views: [...manifest.views].sort(sorting).map(x=>({...x, sourceIds: [...x.sourceIds].sort(), assetIds: [...x.assetIds].sort()})) };
}
export function serializeDistribution(value) { return `${JSON.stringify(canonicalDistribution(value), null, 2)}\n`; }
