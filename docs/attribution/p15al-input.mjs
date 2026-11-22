// @ts-check
import { createHash } from 'node:crypto';

/** @import { Access, Capture, RecordLink, ReviewInput, Source } from './p15al-types.d.mts' */

export const INPUT_SCHEMA = 'access-maps/source-revalidation-input/1';
export const LIMITS = Object.freeze({
  sources: 4_096,
  records: 20_000,
  captures: 50_000,
  links: 100_000,
  sourceRecordPairs: 100_000,
  // A candidate can mention each affected record once per reason.
  candidateRecordPairs: 200_000,
  bytes: 32 * 1_024 * 1_024,
});

const MESSAGES = {
  shape: ['Unexpected fields or data type.', 'Champs ou type de données inattendus.'],
  limit: ['The review exceeds its processing limit.', 'Le contrôle dépasse sa limite de traitement.'],
  id: ['Invalid catalogue identifier.', 'Identifiant de catalogue invalide.'],
  licence: ['Enter a public licence label.', 'Saisir un libellé de licence public.'],
  date: ['Enter a valid calendar date.', 'Saisir une date civile valide.'],
  future: ['The date follows the review date.', 'La date suit celle du contrôle.'],
  order: ['The evidence dates are out of order.', 'Les dates des éléments de preuve sont incohérentes.'],
  tier: ['The source tier must be between 0 and 4.', 'Le niveau de la source doit être compris entre 0 et 4.'],
  digest: ['Expected a lowercase SHA-256 digest.', 'Une empreinte SHA-256 en minuscules est requise.'],
  days: ['Invalid number of calendar days.', 'Nombre de jours civils invalide.'],
  duplicate: ['A catalogue identifier is repeated.', 'Un identifiant de catalogue est répété.'],
  excluded: ['This source is excluded from review.', 'Cette source est exclue du contrôle.'],
  link: ['A referenced item is missing.', 'Un élément référencé est absent.'],
  cycle: ['The record dependencies contain a cycle.', 'Les dépendances des fiches forment un cycle.'],
  origin: ['A record has no source.', 'Une fiche n’a aucune source.'],
  access: ['Unknown accessibility value.', 'Valeur d’accessibilité non reconnue.'],
  report: ['The report differs from the replayed evidence.', 'Le rapport diffère du résultat du recalcul.'],
  credit: ['The source credit is incorrect.', 'La mention de source est incorrecte.'],
};

/** @typedef {keyof typeof MESSAGES} Code */

export class SourceReviewError extends Error {
  /** @param {Code} code @param {string} field */
  constructor(code, field) {
    super(MESSAGES[code][0] + ' (' + field + ')');
    this.name = 'SourceReviewError';
    this.code = code;
    this.field = field;
  }

  /** @param {'en'|'fr'} language */
  localize(language) {
    return MESSAGES[this.code][language === 'fr' ? 1 : 0] + ' (' + this.field + ')';
  }
}

/** @param {unknown} test @param {Code} code @param {string} field @returns {asserts test} */
export function expectValue(test, code, field) {
  if (!test) throw new SourceReviewError(code, field);
}

/** @param {unknown} value @param {string} field @returns {Record<string, unknown>} */
export function object(value, field) {
  expectValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'shape', field);
  const proto = Object.getPrototypeOf(value);
  expectValue(proto === null || proto === Object.prototype, 'shape', field);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string[]} fields @param {string} path */
function exact(value, fields, path) {
  const row = object(value, path);
  expectValue(
    Object.keys(row).length === fields.length && fields.every(key => Object.hasOwn(row, key)),
    'shape', path,
  );
  return row;
}

/** @param {unknown} value @param {number} max @param {string} field @returns {unknown[]} */
export function list(value, max, field) {
  expectValue(Array.isArray(value), 'shape', field);
  expectValue(value.length <= max, 'limit', field);
  // A sparse input from the JS API must not bypass a map/forEach validation.
  for (let i = 0; i < value.length; i++) {
    expectValue(Object.hasOwn(value, i), 'shape', field);
  }
  return value;
}

/** @param {unknown} value @param {string} field */
function identifier(value, field) {
  expectValue(typeof value === 'string' && value.length <= 120 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value), 'id', field);
  return value;
}

/** @param {unknown} value */
function excluded(value) {
  return typeof value === 'string' && value.toLowerCase().replace(/[^a-z0-9]/gu, '').includes('miway');
}

/** @param {unknown} value @param {string} field */
export function sourceId(value, field) {
  const id = identifier(value, field);
  expectValue(!excluded(id), 'excluded', field);
  return id;
}

/** @param {unknown} value @param {string} field */
export function licence(value, field) {
  expectValue(typeof value === 'string' && value.length >= 1 && value.length <= 256 &&
    value === value.trim() && /^[\p{L}\p{N} .,+()/'’&_:–—-]+$/u.test(value) &&
    !/\b(?:token|password|secret|api[-_ ]?key)\s*:/iu.test(value) &&
    !/\b(?:https?|ftp|file|mailto|data|javascript):/iu.test(value) &&
    !/\b\+?(?:1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/u.test(value),
  'licence', field);
  return value;
}

/** @param {unknown} value @param {string} field */
export function calendarDate(value, field) {
  expectValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !value.startsWith('0000'), 'date', field);
  const millis = Date.parse(value + 'T00:00:00.000Z');
  expectValue(Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value, 'date', field);
  return value;
}

/** @param {string} from @param {string} to */
export function elapsedDays(from, to) {
  return (Date.parse(to + 'T00:00:00.000Z') - Date.parse(from + 'T00:00:00.000Z')) / 86_400_000;
}

/** @param {unknown} value @param {string} field @param {string} asOf */
function historicalDate(value, field, asOf) {
  const date = calendarDate(value, field);
  expectValue(date <= asOf, 'future', field);
  return date;
}

/** @param {unknown} value @param {number} min @param {number} max @param {Code} code @param {string} field */
function integer(value, min, max, code, field) {
  expectValue(typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0) &&
    value >= min && value <= max, code, field);
  return value;
}

/** @param {unknown} value @param {string} field */
function digest(value, field) {
  expectValue(typeof value === 'string' && /^[a-f\d]{64}$/u.test(value), 'digest', field);
  return value;
}

/** @param {unknown} value @param {string} field */
function ids(value, field) {
  const values = list(value, LIMITS.records, field).map(id => identifier(id, field));
  expectValue(values.length === new Set(values).size, 'duplicate', field);
  return values.sort();
}

/** @param {unknown} value @param {string} path @param {string} asOf @returns {Source} */
function readSource(value, path, asOf) {
  const row = exact(value, ['source', 'licence', 'retrievedOn', 'verificationTier', 'contentDigest', 'validForDays'], path);
  return {
    source: sourceId(row.source, path + '.source'),
    licence: licence(row.licence, path + '.licence'),
    retrievedOn: historicalDate(row.retrievedOn, path + '.retrievedOn', asOf),
    verificationTier: row.verificationTier === 'UNKNOWN' ? 'UNKNOWN' : integer(row.verificationTier, 0, 4, 'tier', path + '.verificationTier'),
    contentDigest: row.contentDigest === null ? null : digest(row.contentDigest, path + '.contentDigest'),
    validForDays: integer(row.validForDays, 1, 3650, 'days', path + '.validForDays'),
  };
}

/** @param {unknown} value @param {string} path @returns {RecordLink} */
function readRecord(value, path) {
  const row = exact(value, ['recordId', 'access', 'sourceIds', 'dependsOn'], path);
  const recordId = identifier(row.recordId, path + '.recordId');
  const sourceIds = ids(row.sourceIds, path + '.sourceIds');
  const dependsOn = ids(row.dependsOn, path + '.dependsOn');
  expectValue(row.access === 'YES' || row.access === 'NO' || row.access === 'UNKNOWN', 'access', path + '.access');
  expectValue(sourceIds.length + dependsOn.length > 0, 'origin', path);
  return { recordId, sourceIds, dependsOn, access: row.access };
}

/** @param {unknown} value @param {string} path @param {string} asOf @returns {Capture} */
function readCapture(value, path, asOf) {
  const row = object(value, path);
  const fields = ['captureId', 'sourceId', 'checkedOn', 'baselineHash', 'evidenceDigest', 'kind'];
  if (row.kind === 'retrieved') fields.push('licence', 'retrievedOn', 'verificationTier', 'contentDigest');
  exact(row, fields, path);
  const base = {
    captureId: identifier(row.captureId, path + '.captureId'),
    sourceId: sourceId(row.sourceId, path + '.sourceId'),
    checkedOn: historicalDate(row.checkedOn, path + '.checkedOn', asOf),
    baselineHash: digest(row.baselineHash, path + '.baselineHash'),
    evidenceDigest: digest(row.evidenceDigest, path + '.evidenceDigest'),
  };
  if (row.kind === 'retrieved') {
    const retrievedOn = calendarDate(row.retrievedOn, path + '.retrievedOn');
    expectValue(retrievedOn <= base.checkedOn, 'order', path + '.retrievedOn');
    return {
      ...base, kind: row.kind, retrievedOn,
      licence: licence(row.licence, path + '.licence'),
      contentDigest: digest(row.contentDigest, path + '.contentDigest'),
      verificationTier: row.verificationTier === 'UNKNOWN' ? 'UNKNOWN' : integer(row.verificationTier, 0, 4, 'tier', path + '.verificationTier'),
    };
  }
  expectValue(row.kind === 'unavailable' || row.kind === 'withdrawn', 'shape', path + '.kind');
  return { ...base, kind: row.kind };
}

/** @template T @param {T[]} rows @param {(row:T)=>string} key @param {string} path */
function index(rows, key, path) {
  const map = new Map(rows.map(row => [key(row), row]));
  expectValue(map.size === rows.length, 'duplicate', path);
  return map;
}

/** @param {string} a @param {string} b */
export function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {unknown} value */
export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Captures bind to evidence identity. Changing the calendar alone preserves their applicability.
 * @param {Source} source */
export function baselineHash(source) {
  return fingerprint([
    'access-maps/source-baseline/1', source.source, source.licence,
    source.retrievedOn, source.verificationTier, source.contentDigest,
  ]);
}

/** @param {unknown} input @returns {ReviewInput} */
export function prepareReview(input) {
  const root = exact(input, ['schema', 'asOf', 'leadDays', 'sources', 'records', 'captures'], '$');
  expectValue(root.schema === INPUT_SCHEMA, 'shape', 'schema');
  const asOf = calendarDate(root.asOf, 'asOf');
  const leadDays = integer(root.leadDays, 0, 3650, 'days', 'leadDays');
  const sources = list(root.sources, LIMITS.sources, 'sources')
    .map((row, i) => readSource(row, 'sources[' + i + ']', asOf));
  const captures = list(root.captures, LIMITS.captures, 'captures')
    .map((row, i) => readCapture(row, 'captures[' + i + ']', asOf));
  let edges = 0;
  const records = list(root.records, LIMITS.records, 'records').map((raw, i) => {
    const row = readRecord(raw, 'records[' + i + ']');
    edges += row.dependsOn.length + row.sourceIds.length;
    expectValue(edges <= LIMITS.links, 'limit', 'records');
    return row;
  });
  const bySource = index(sources, row => row.source, 'sources');
  const byRecord = index(records, row => row.recordId, 'records');
  index(captures, row => row.captureId, 'captures');
  for (const [i, row] of records.entries()) {
    expectValue(row.sourceIds.every(id => bySource.has(id)), 'link', 'records[' + i + '].sourceIds');
    expectValue(row.dependsOn.every(id => byRecord.has(id)), 'link', 'records[' + i + '].dependsOn');
  }
  const hashes = new Map(sources.map(source => [source.source, baselineHash(source)]));
  for (const [i, capture] of captures.entries()) {
    const source = bySource.get(capture.sourceId);
    expectValue(source, 'link', 'captures[' + i + '].sourceId');
    if (capture.baselineHash !== hashes.get(source.source)) continue;
    expectValue(capture.checkedOn >= source.retrievedOn &&
      (capture.kind !== 'retrieved' || capture.retrievedOn >= source.retrievedOn), 'order', 'captures[' + i + ']');
  }
  return {
    schema: INPUT_SCHEMA, asOf, leadDays,
    sources: sources.sort((a, b) => compare(a.source, b.source)),
    records: records.sort((a, b) => compare(a.recordId, b.recordId)),
    captures: captures.sort((a, b) => compare(a.checkedOn, b.checkedOn) || compare(a.captureId, b.captureId)),
  };
}

/** Project only source identity, retrieval date, licence and tier from sources/registry.json.
 * Private notes, entry URLs and download locations are never copied into the offline report.
 * @param {unknown} registry @param {{asOf:string, validForDays:number, leadDays:number}} options */
export function fromRegistry(registry, options) {
  const raw = object(registry, 'registry');
  const sources = list(raw.sources, LIMITS.sources, 'registry.sources').flatMap((value, i) => {
    const path = 'registry.sources[' + i + ']';
    const row = object(value, path);
    if (excluded(row.id) || excluded(row.name)) return [];
    if (row.kind === 'osm' || row.id === 'osm-ontario') {
      expectValue(row.attribution === '© OpenStreetMap contributors', 'credit', path + '.attribution');
    }
    return [{
      source: row.id, licence: row.licence_id, retrievedOn: row.retrieved_at,
      verificationTier: integer(row.tier, 0, 4, 'tier', path + '.tier'),
      contentDigest: null, validForDays: options.validForDays,
    }];
  });
  // Validate the period even for an empty registry.
  integer(options.validForDays, 1, 3650, 'days', 'validForDays');
  return prepareReview({
    schema: INPUT_SCHEMA, asOf: options.asOf, leadDays: options.leadDays,
    sources, records: [], captures: [],
  });
}
