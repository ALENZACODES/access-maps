/** A bounded, strict, local-only contract for publication rights decisions. */
export const RIGHTS_SCHEMA = 'attribution-rights-matrix/1';
export const UNKNOWN = 'UNKNOWN';
export const RIGHTS_MAX_BYTES = 2_097_152;
export const RIGHTS_MAX_SOURCES = 300;
export const RIGHTS_MAX_OUTPUTS = 400;
export const RIGHTS_MAX_EXCEPTIONS = 200;
export const PROVIDERS = Object.freeze(['osm', 'metrolinx', 'ltc', 'other']);
export const LICENCES = Object.freeze([
  'ODbL-1.0', 'Metrolinx-AUA', 'OGL-Ontario-Metrolinx',
  'LTC-Open-Data-Terms', 'OTHER-OPEN', UNKNOWN,
]);
export const STATES = Object.freeze(['YES', 'NO', UNKNOWN]);
export const TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const OUTPUT_KINDS = Object.freeze(['map', 'journey', 'list', 'download', 'other']);
export const TRANSFORMS = Object.freeze(['unaltered', 'derived', 'combined', 'summary']);
export const DISTRIBUTIONS = Object.freeze(['offline', 'online', 'both']);
export const PUBLICATION_STATES = Object.freeze(['included', 'held', 'excluded']);
export const DISPOSITIONS = Object.freeze(['open', 'resolved', 'rejected']);
const SOURCE_KEYS = Object.freeze([
  'id', 'provider', 'name', 'licenceId', 'licenceName', 'sourceUrl',
  'licenceUrl', 'termsUrl', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn',
  'evidenceTier', 'evidenceUrl', 'permission', 'redistribution',
  'derivativeUse', 'openLicenceEvidence', 'shareAlikeRequired',
  'attribution', 'publication',
]);
const OUTPUT_KEYS = Object.freeze([
  'id', 'name', 'locale', 'kind', 'distribution', 'transformation',
  'sourceIds', 'route', 'state', 'attribution', 'mapCredit', 'licenceLink',
  'redistributionNotice', 'shareAlikePublished', 'separatedDatasets',
  'offlineAvailable', 'keyboardAccessible', 'screenReaderLabelled',
  'minimumTargetPx', 'publishedOn',
]);
const EXCEPTION_KEYS = Object.freeze([
  'id', 'sourceId', 'outputId', 'issue', 'evidenceUrl', 'recordedOn',
  'reviewer', 'disposition', 'reason',
]);
const MATRIX_KEYS = Object.freeze(['schema', 'releaseId', 'sources', 'outputs', 'exceptions']);
export class RightsInputError extends Error {
  constructor(at, detail) {
    super(`${at}: ${detail}`);
    this.name = 'RightsInputError';
    this.at = at;
  }
}
function object(value, at) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RightsInputError(at, 'Expected an object');
  }
  return value;
}
function fields(value, expected, at) {
  const keys = new Set(expected);
  for (const name of Object.keys(value)) {
    if (!keys.has(name)) throw new RightsInputError(`${at}.${name}`, 'Unknown property');
  }
  for (const name of expected) {
    if (!Object.hasOwn(value, name)) throw new RightsInputError(`${at}.${name}`, 'Missing property');
  }
}
function text(value, at, max = 300, allowEmpty = false, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw new RightsInputError(at, 'Expected bounded text');
  }
  if (value !== value.normalize('NFC')) throw new RightsInputError(at, 'Expected NFC text');
  const disallowed = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
    : /[\u0000-\u001f\u007f]/u;
  if (disallowed.test(value)) throw new RightsInputError(at, 'Control characters are not allowed');
  return value;
}
function id(value, at) {
  const result = text(value, at, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) {
    throw new RightsInputError(at, 'Use lowercase hyphenated identifier');
  }
  return result;
}
function choice(value, allowed, at) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new RightsInputError(at, `Expected one of ${allowed.join(', ')}`);
  }
  return value;
}
function date(value, at) {
  if (value === UNKNOWN) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new RightsInputError(at, 'Expected YYYY-MM-DD or UNKNOWN');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new RightsInputError(at, 'Invalid calendar date');
  }
  return value;
}
function url(value, at) {
  if (value === UNKNOWN) return value;
  const valueText = text(value, at, 2048);
  let parsed;
  try { parsed = new URL(valueText); }
  catch { throw new RightsInputError(at, 'Invalid address'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || !host || parsed.username || parsed.password || parsed.hash
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host === '[::1]' || /^(?:10\.|127\.|192\.168\.|169\.254\.)/u.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)) {
    throw new RightsInputError(at, 'Expected a public HTTPS address');
  }
  return valueText;
}
function route(value, at) {
  const valueText = text(value, at, 300);
  if (/[:?#\\]/u.test(valueText) || valueText.startsWith('/') || valueText.startsWith('~')) {
    throw new RightsInputError(at, 'Expected relative route path');
  }
  const parts = valueText.split('/');
  if (parts.some(part => part === '.' || part === '..' || !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/u.test(part))) {
    throw new RightsInputError(at, 'Unsafe route component');
  }
  if (!valueText.endsWith('.html')) throw new RightsInputError(at, 'Expected HTML route');
  return valueText;
}
function list(value, at, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new RightsInputError(at, 'Invalid array size');
  return value;
}
function ids(value, at) {
  const result = list(value, at, RIGHTS_MAX_SOURCES).map((entry, i) => id(entry, `${at}[${i}]`));
  if (new Set(result).size !== result.length) throw new RightsInputError(at, 'Duplicate reference');
  return result;
}
function target(value, at) {
  if (value === UNKNOWN) return value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000) {
    throw new RightsInputError(at, 'Expected bounded integer pixels or UNKNOWN');
  }
  return value;
}
function parseSource(value, at) {
  const item = object(value, at); fields(item, SOURCE_KEYS, at);
  return {
    id: id(item.id, `${at}.id`),
    provider: choice(item.provider, PROVIDERS, `${at}.provider`),
    name: text(item.name, `${at}.name`),
    licenceId: choice(item.licenceId, LICENCES, `${at}.licenceId`),
    licenceName: text(item.licenceName, `${at}.licenceName`),
    sourceUrl: url(item.sourceUrl, `${at}.sourceUrl`),
    licenceUrl: url(item.licenceUrl, `${at}.licenceUrl`),
    termsUrl: url(item.termsUrl, `${at}.termsUrl`),
    acquiredOn: date(item.acquiredOn, `${at}.acquiredOn`),
    datasetAsOf: date(item.datasetAsOf, `${at}.datasetAsOf`),
    termsReviewedOn: date(item.termsReviewedOn, `${at}.termsReviewedOn`),
    evidenceTier: choice(item.evidenceTier, TIERS, `${at}.evidenceTier`),
    evidenceUrl: url(item.evidenceUrl, `${at}.evidenceUrl`),
    permission: choice(item.permission, STATES, `${at}.permission`),
    redistribution: choice(item.redistribution, STATES, `${at}.redistribution`),
    derivativeUse: choice(item.derivativeUse, STATES, `${at}.derivativeUse`),
    openLicenceEvidence: choice(item.openLicenceEvidence, STATES, `${at}.openLicenceEvidence`),
    shareAlikeRequired: choice(item.shareAlikeRequired, STATES, `${at}.shareAlikeRequired`),
    attribution: text(item.attribution, `${at}.attribution`, 4096, true, true),
    publication: choice(item.publication, PUBLICATION_STATES, `${at}.publication`),
  };
}
function parseOutput(value, at) {
  const item = object(value, at); fields(item, OUTPUT_KEYS, at);
  return {
    id: id(item.id, `${at}.id`),
    name: text(item.name, `${at}.name`),
    locale: choice(item.locale, ['en', 'fr'], `${at}.locale`),
    kind: choice(item.kind, OUTPUT_KINDS, `${at}.kind`),
    distribution: choice(item.distribution, DISTRIBUTIONS, `${at}.distribution`),
    transformation: choice(item.transformation, TRANSFORMS, `${at}.transformation`),
    sourceIds: ids(item.sourceIds, `${at}.sourceIds`),
    route: route(item.route, `${at}.route`),
    state: choice(item.state, PUBLICATION_STATES, `${at}.state`),
    attribution: text(item.attribution, `${at}.attribution`, 8192, true, true),
    mapCredit: choice(item.mapCredit, STATES, `${at}.mapCredit`),
    licenceLink: choice(item.licenceLink, STATES, `${at}.licenceLink`),
    redistributionNotice: choice(item.redistributionNotice, STATES, `${at}.redistributionNotice`),
    shareAlikePublished: choice(item.shareAlikePublished, STATES, `${at}.shareAlikePublished`),
    separatedDatasets: choice(item.separatedDatasets, STATES, `${at}.separatedDatasets`),
    offlineAvailable: choice(item.offlineAvailable, STATES, `${at}.offlineAvailable`),
    keyboardAccessible: choice(item.keyboardAccessible, STATES, `${at}.keyboardAccessible`),
    screenReaderLabelled: choice(item.screenReaderLabelled, STATES, `${at}.screenReaderLabelled`),
    minimumTargetPx: target(item.minimumTargetPx, `${at}.minimumTargetPx`),
    publishedOn: date(item.publishedOn, `${at}.publishedOn`),
  };
}
function parseException(value, at) {
  const item = object(value, at); fields(item, EXCEPTION_KEYS, at);
  return {
    id: id(item.id, `${at}.id`),
    sourceId: id(item.sourceId, `${at}.sourceId`),
    outputId: id(item.outputId, `${at}.outputId`),
    issue: text(item.issue, `${at}.issue`, 600),
    evidenceUrl: url(item.evidenceUrl, `${at}.evidenceUrl`),
    recordedOn: date(item.recordedOn, `${at}.recordedOn`),
    reviewer: text(item.reviewer, `${at}.reviewer`, 160),
    disposition: choice(item.disposition, DISPOSITIONS, `${at}.disposition`),
    reason: text(item.reason, `${at}.reason`, 1200, true, true),
  };
}
export function parseRightsMatrix(value) {
  const input = object(value, 'matrix'); fields(input, MATRIX_KEYS, 'matrix');
  if (input.schema !== RIGHTS_SCHEMA) throw new RightsInputError('matrix.schema', 'Unsupported schema');
  const sources = list(input.sources, 'matrix.sources', RIGHTS_MAX_SOURCES)
    .map((entry, i) => parseSource(entry, `matrix.sources[${i}]`));
  const outputs = list(input.outputs, 'matrix.outputs', RIGHTS_MAX_OUTPUTS)
    .map((entry, i) => parseOutput(entry, `matrix.outputs[${i}]`));
  const exceptions = list(input.exceptions, 'matrix.exceptions', RIGHTS_MAX_EXCEPTIONS)
    .map((entry, i) => parseException(entry, `matrix.exceptions[${i}]`));
  for (const [items, name] of [[sources, 'sources'], [outputs, 'outputs'], [exceptions, 'exceptions']]) {
    const identifiers = items.map(item => item.id);
    if (new Set(identifiers).size !== identifiers.length) throw new RightsInputError(`matrix.${name}`, 'Duplicate ID');
  }
  const paths = outputs.map(item => item.route);
  if (new Set(paths).size !== paths.length) throw new RightsInputError('matrix.outputs', 'Duplicate route path');
  return {schema: RIGHTS_SCHEMA, releaseId: id(input.releaseId, 'matrix.releaseId'), sources, outputs, exceptions};
}
export function parseRightsMatrixJson(json) {
  if (typeof json !== 'string' || BufferlessBytes(json) > RIGHTS_MAX_BYTES) {
    throw new RightsInputError('matrix', 'Input exceeds size limit');
  }
  let parsed;
  try { parsed = JSON.parse(json); }
  catch { throw new RightsInputError('matrix', 'Invalid JSON'); }
  return parseRightsMatrix(parsed);
}
/** Browser-safe UTF-8 byte length. */
export function BufferlessBytes(value) { return new TextEncoder().encode(value).length; }
export function exportRightsMatrix(value) { return `${JSON.stringify(parseRightsMatrix(value), null, 2)}\n`; }
export function rightsBySource(matrix) {
  const results = Object.fromEntries(matrix.sources.map(source => [source.id, []]));
  for (const output of matrix.outputs) {
    for (const sourceId of output.sourceIds) {
      if (!Object.hasOwn(results, sourceId)) results[sourceId] = [];
      results[sourceId].push(output.id);
    }
  }
  for (const idsForSource of Object.values(results)) idsForSource.sort();
  return results;
}
