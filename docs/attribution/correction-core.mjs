/** Strict local contract for attribution correction cases. No I/O or implicit dates. */
import { SOURCES, UNKNOWN } from './attribution-utils.mjs';
export { UNKNOWN } from './attribution-utils.mjs';
export const CORRECTION_SCHEMA = 'attribution-corrections/1';
export const CORRECTION_MAX_BYTES = 2_097_152;
export const CORRECTION_MAX_CASES = 400;
export const CORRECTION_MAX_EVIDENCE = 20;
export const CORRECTION_STATES = Object.freeze(['open', 'under-review', 'resolved', 'rejected', 'withdrawn']);
export const CORRECTION_ISSUES = Object.freeze(['notice', 'licence', 'source', 'date', 'permission', 'translation', 'other']);
export const CORRECTION_TIERS = Object.freeze(['primary', 'secondary', 'community', UNKNOWN]);
export const CORRECTION_PERMISSIONS = Object.freeze(['YES', 'NO', UNKNOWN]);
export const CORRECTION_DECISIONS = Object.freeze(['accept', 'decline', 'defer', UNKNOWN]);
export class CorrectionInputError extends Error {
  constructor(path, reason) { super(`${path}: ${reason}`); this.name = 'CorrectionInputError'; this.path = path; }
}
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exactFields(value, fields, path) {
  if (!isObject(value)) throw new CorrectionInputError(path, 'Expected object');
  const expected = new Set(fields);
  for (const field of fields) if (!Object.hasOwn(value, field)) throw new CorrectionInputError(`${path}.${field}`, 'Missing field');
  for (const field of Object.keys(value)) if (!expected.has(field)) throw new CorrectionInputError(`${path}.${field}`, 'Unknown field');
}
export function safeText(value, path, max = 1000, optional = false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
    throw new CorrectionInputError(path, 'Expected bounded text');
  if (value !== value.normalize('NFC')) throw new CorrectionInputError(path, 'Text must use NFC');
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code === 127 || code < 32 && code !== 10 && code !== 13 && code !== 9)
      throw new CorrectionInputError(path, 'Control character');
  }
  return value;
}
export function safeId(value, path) {
  const text = safeText(value, path, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(text)) throw new CorrectionInputError(path, 'Invalid identifier');
  return text;
}
export function enumValue(value, values, path) {
  if (!values.includes(value)) throw new CorrectionInputError(path, `Expected one of ${values.join(', ')}`);
  return value;
}
export function validDate(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new CorrectionInputError(path, 'Expected date or UNKNOWN');
  const y = Number(value.slice(0, 4)), m = Number(value.slice(5, 7)), d = Number(value.slice(8));
  if (y < 1900 || y > 9999 || m < 1 || m > 12) throw new CorrectionInputError(path, 'Invalid date');
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > days[m - 1]) throw new CorrectionInputError(path, 'Invalid date');
  return value;
}
export function publicUrl(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  const text = safeText(value, path, 2048);
  let parsed;
  try { parsed = new URL(text); } catch { throw new CorrectionInputError(path, 'Invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash ||
      parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname))
    throw new CorrectionInputError(path, 'Expected public HTTPS URL');
  return text;
}
export function distinctIds(value, path, max = 50) {
  if (!Array.isArray(value) || value.length > max) throw new CorrectionInputError(path, 'Expected bounded array');
  const result = value.map((id, i) => safeId(id, `${path}[${i}]`));
  if (new Set(result).size !== result.length) throw new CorrectionInputError(path, 'Duplicate identifier');
  return result;
}
export function parseEvidence(value, path = 'evidence') {
  exactFields(value, ['id','title','url','licenceUrl','collectedOn','tier','language','excerpt','sourceId'], path);
  return {
    id: safeId(value.id, `${path}.id`), title: safeText(value.title, `${path}.title`, 180),
    url: publicUrl(value.url, `${path}.url`), licenceUrl: publicUrl(value.licenceUrl, `${path}.licenceUrl`),
    collectedOn: validDate(value.collectedOn, `${path}.collectedOn`),
    tier: enumValue(value.tier, CORRECTION_TIERS, `${path}.tier`),
    language: enumValue(value.language, ['en','fr',UNKNOWN], `${path}.language`),
    excerpt: safeText(value.excerpt, `${path}.excerpt`, 2400, true),
    sourceId: safeId(value.sourceId, `${path}.sourceId`),
  };
}
export function parseSource(value, path = 'source') {
  exactFields(value, ['id','provider','name','sourceUrl','licenceUrl','licence','permission','datasetDate','acquisitionDate','termsDate','notice','tier','included'], path);
  return {
    id: safeId(value.id, `${path}.id`),
    provider: enumValue(value.provider, [...Object.keys(SOURCES),'other'], `${path}.provider`),
    name: safeText(value.name, `${path}.name`, 180),
    sourceUrl: publicUrl(value.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: publicUrl(value.licenceUrl, `${path}.licenceUrl`),
    licence: safeText(value.licence, `${path}.licence`, 180),
    permission: enumValue(value.permission, CORRECTION_PERMISSIONS, `${path}.permission`),
    datasetDate: validDate(value.datasetDate, `${path}.datasetDate`),
    acquisitionDate: validDate(value.acquisitionDate, `${path}.acquisitionDate`),
    termsDate: validDate(value.termsDate, `${path}.termsDate`),
    notice: safeText(value.notice, `${path}.notice`, 4000, true),
    tier: enumValue(value.tier, CORRECTION_TIERS, `${path}.tier`),
    included: enumValue(value.included, ['YES','NO'], `${path}.included`),
  };
}
export function parseCase(value, path = 'case') {
  exactFields(value, ['id','sourceId','surfaceId','issue','state','openedOn','updatedOn','summary','currentText','proposedText','permission','evidenceIds','decision','decisionOn','decisionNote','assignee','locale'], path);
  return {
    id: safeId(value.id, `${path}.id`), sourceId: safeId(value.sourceId, `${path}.sourceId`),
    surfaceId: safeId(value.surfaceId, `${path}.surfaceId`),
    issue: enumValue(value.issue, CORRECTION_ISSUES, `${path}.issue`),
    state: enumValue(value.state, CORRECTION_STATES, `${path}.state`),
    openedOn: validDate(value.openedOn, `${path}.openedOn`),
    updatedOn: validDate(value.updatedOn, `${path}.updatedOn`),
    summary: safeText(value.summary, `${path}.summary`, 500),
    currentText: safeText(value.currentText, `${path}.currentText`, 4000, true),
    proposedText: safeText(value.proposedText, `${path}.proposedText`, 4000, true),
    permission: enumValue(value.permission, CORRECTION_PERMISSIONS, `${path}.permission`),
    evidenceIds: distinctIds(value.evidenceIds, `${path}.evidenceIds`, CORRECTION_MAX_EVIDENCE),
    decision: enumValue(value.decision, CORRECTION_DECISIONS, `${path}.decision`),
    decisionOn: validDate(value.decisionOn, `${path}.decisionOn`),
    decisionNote: safeText(value.decisionNote, `${path}.decisionNote`, 2000, true),
    assignee: safeText(value.assignee, `${path}.assignee`, 100, true),
    locale: enumValue(value.locale, ['en','fr',UNKNOWN], `${path}.locale`),
  };
}
export function parseSurface(value, path = 'surface') {
  exactFields(value, ['id','route','locale','sourceIds','caseIds','offline','keyboard','screenReader','minimumTargetPx','publishedOn'], path);
  const size = value.minimumTargetPx;
  if (size !== UNKNOWN && (!Number.isSafeInteger(size) || size < 0 || size > 1000))
    throw new CorrectionInputError(`${path}.minimumTargetPx`, 'Expected pixel size or UNKNOWN');
  const route = safeText(value.route, `${path}.route`, 320);
  if (route.startsWith('/') || route.includes('\\') || route.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')))
    throw new CorrectionInputError(`${path}.route`, 'Expected relative route');
  return {
    id: safeId(value.id, `${path}.id`), route,
    locale: enumValue(value.locale, ['en','fr'], `${path}.locale`),
    sourceIds: distinctIds(value.sourceIds, `${path}.sourceIds`, 150),
    caseIds: distinctIds(value.caseIds, `${path}.caseIds`, 150),
    offline: enumValue(value.offline, CORRECTION_PERMISSIONS, `${path}.offline`),
    keyboard: enumValue(value.keyboard, CORRECTION_PERMISSIONS, `${path}.keyboard`),
    screenReader: enumValue(value.screenReader, CORRECTION_PERMISSIONS, `${path}.screenReader`),
    minimumTargetPx: size,
    publishedOn: validDate(value.publishedOn, `${path}.publishedOn`),
  };
}
export function parseCorrectionRegister(value) {
  exactFields(value, ['schema','releaseId','sources','evidence','cases','surfaces','localePairRequired'], 'register');
  if (value.schema !== CORRECTION_SCHEMA) throw new CorrectionInputError('register.schema', 'Unsupported schema');
  const releaseId = safeId(value.releaseId, 'register.releaseId');
  const entries = [ ['sources',value.sources,parseSource,250], ['evidence',value.evidence,parseEvidence,1000],
    ['cases',value.cases,parseCase,CORRECTION_MAX_CASES], ['surfaces',value.surfaces,parseSurface,200] ];
  const parsed = {};
  for (const [key, list, parser, max] of entries) {
    if (!Array.isArray(list) || list.length > max) throw new CorrectionInputError(`register.${key}`, 'Expected bounded array');
    const values = list.map((item,i)=>parser(item,`register.${key}[${i}]`));
    if (new Set(values.map(item=>item.id)).size !== values.length) throw new CorrectionInputError(`register.${key}`, 'Duplicate ID');
    parsed[key] = values;
  }
  if (typeof value.localePairRequired !== 'boolean') throw new CorrectionInputError('register.localePairRequired', 'Expected boolean');
  return { schema:CORRECTION_SCHEMA, releaseId, ...parsed, localePairRequired:value.localePairRequired };
}
export function parseCorrectionJson(raw) {
  if (typeof raw !== 'string' || BufferByteLength(raw) > CORRECTION_MAX_BYTES) throw new CorrectionInputError('register','Input too large');
  let value;
  try { value = JSON.parse(raw); } catch { throw new CorrectionInputError('register', 'Malformed JSON'); }
  return parseCorrectionRegister(value);
}
function BufferByteLength(text) { return new TextEncoder().encode(text).length; }
export function serializeCorrectionRegister(value) { return `${JSON.stringify(parseCorrectionRegister(value),null,2)}\n`; }
export function sourceMap(register) { return new Map(register.sources.map(item=>[item.id,item])); }
export function caseMap(register) { return new Map(register.cases.map(item=>[item.id,item])); }
export function evidenceMap(register) { return new Map(register.evidence.map(item=>[item.id,item])); }
export function activeCases(register) { return register.cases.filter(item=>item.state==='open'||item.state==='under-review'); }
export function resolvedCases(register) { return register.cases.filter(item=>item.state==='resolved'||item.state==='rejected'); }
export function groupCasesBySource(register) {
  const result = new Map();
  for (const item of register.cases) result.set(item.sourceId,[...(result.get(item.sourceId)??[]),item]);
  return result;
}
export function groupCasesBySurface(register) {
  const result = new Map();
  for (const surface of register.surfaces) result.set(surface.id,register.cases.filter(c=>c.surfaceId===surface.id));
  return result;
}
