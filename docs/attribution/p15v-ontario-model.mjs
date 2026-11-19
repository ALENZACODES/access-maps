/** Local-only Ontario accessibility route facts. No assumptions from absent data. */
import { createHash } from 'node:crypto';

export const ONTARIO_LICENCES = Object.freeze([
  'CC0-1.0', 'CC-BY-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-ON-1.0',
]);
export const ACCESS_VALUES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const FEATURE_VALUES = Object.freeze([
  'entrance', 'lift', 'washroom', 'parking', 'path', 'seating', 'crossing',
  'curb-cut', 'platform', 'door', 'ramp', 'surface', 'gradient', 'outage',
]);
export const SOURCE_TYPES = Object.freeze(['municipal', 'operator', 'survey', 'community', 'open-map']);
const MS_PER_DAY = 86_400_000;
const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;
const HASH = /^[a-f0-9]{64}$/u;
const HTML_LIKE = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu;
const SENSITIVE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|api[-_]?key)\s*[:=]/iu;
const CLAIM = /\b(?:guaranteed|real[- ]time|partnership|guarantee|garanti|temps réel|partenariat)\b/iu;
const code = (value) => typeof value === 'string' && [...value].some((character) => {
  const point = character.codePointAt(0);
  return point !== undefined && (point < 32 || point === 127);
});
const plain = (value) => typeof value === 'string' && value.trim() === value &&
  value.length > 0 && value.length <= 300 && !code(value) &&
  !HTML_LIKE.test(value) && !SENSITIVE.test(value) && !CLAIM.test(value);
const obj = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, required, optional = []) => obj(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const ident = (value) => typeof value === 'string' && value.length <= 96 && ID.test(value);
const pair = (value) => exact(value, ['en', 'fr']) && plain(value.en) && plain(value.fr) && french(value.fr);
const licence = (value) => ONTARIO_LICENCES.includes(value);
const silo = (value) => value === 'open' || value === 'odbl';
const access = (value) => ACCESS_VALUES.includes(value);
const feature = (value) => FEATURE_VALUES.includes(value);
const sorted = (value) => [...value].sort((a, b) => a.localeCompare(b, 'en'));

export function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;
  return date.getTime() / MS_PER_DAY;
}

export function french(value) {
  if (typeof value !== 'string') return false;
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let index = 0; index < value.length; index++) {
    const symbol = value[index];
    if (symbol === ':' && index > 0 && value[index - 1] !== '\u00a0') return false;
    if (';!?'.includes(symbol) && index > 0 && value[index - 1] !== '\u202f') return false;
    if (symbol === '«' && value[index + 1] !== '\u202f') return false;
    if (symbol === '»' && value[index - 1] !== '\u202f') return false;
  }
  return true;
}

export function localPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 400 ||
      value.startsWith('/') || code(value) || /[\\%?#:]/u.test(value)) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..' &&
    part.trim() === part && !part.startsWith('.'));
}

export function byteHash(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
  return createHash('sha256').update(bytes).digest('hex');
}

const NOTES = Object.freeze({
  ROOT: ['Snapshot structure is incomplete.', 'La structure des données est incomplète.'],
  DATE: ['Snapshot date is invalid.', 'La date des données est invalide.'],
  LIMIT: ['Snapshot exceeds its bounded limits.', 'Les données dépassent les limites permises.'],
  SOURCE: ['A source is incomplete.', 'Une source est incomplète.'],
  LICENCE: ['An open licence is required.', 'Une licence ouverte est obligatoire.'],
  SILO: ['Licence-separated data cannot be mixed.', 'Les données de licences distinctes ne peuvent pas être mélangées.'],
  DUPLICATE: ['An identifier is repeated.', 'Un identifiant est répété.'],
  PLACE: ['A place is incomplete.', 'Une fiche de lieu est incomplète.'],
  NODE: ['A routing node is incomplete.', 'Un point de parcours est incomplet.'],
  EDGE: ['A routing segment is incomplete.', 'Un segment de parcours est incomplet.'],
  EVIDENCE: ['An observation is incomplete.', 'Une observation est incomplète.'],
  REF: ['A referenced record is unavailable.', 'Une fiche liée est indisponible.'],
  TIME: ['An observation date is outside the allowed window.', 'La date d’observation est hors de la période permise.'],
  TIER: ['The evidence tier is unsupported.', 'Le niveau des observations n’est pas admis.'],
  ASSERTION: ['Access cannot be stated without current observations.', 'L’accès ne peut être déclaré sans observations actuelles.'],
  CONFLICT: ['Conflicting evidence requires UNKNOWN.', 'Les observations divergent\u202f; l’accès doit rester UNKNOWN.'],
  UNKNOWN: ['Missing facts must remain UNKNOWN.', 'Les renseignements absents doivent rester UNKNOWN.'],
  TEXT: ['Bilingual text is missing or unsafe.', 'Le texte bilingue est absent ou non sûr.'],
  PATH: ['The offline path is unsafe.', 'Le chemin hors ligne n’est pas sûr.'],
  ASSET: ['An offline asset is incomplete.', 'Un fichier hors ligne est incomplet.'],
  HELD: ['The source is not authorized for this export.', 'La source n’est pas autorisée pour cette exportation.'],
  LOOP: ['A segment cannot point to itself.', 'Un segment ne peut pas revenir sur lui-même.'],
  DIRECTION: ['Direction metadata is invalid.', 'La direction indiquée est invalide.'],
});

export function diagnostic(codeName, path) {
  const words = NOTES[codeName] ?? NOTES.ROOT;
  return Object.freeze({ code: codeName, path, en: words[0], fr: words[1] });
}

function allowedDate(value, asOf, maxDays) {
  const day = dayNumber(value);
  return day !== null && day <= asOf && asOf - day <= maxDays;
}

function uniqueIds(items, name, add) {
  const seen = new Set();
  for (let index = 0; index < items.length; index++) {
    const id = items[index]?.id;
    if (!ident(id)) continue;
    if (seen.has(id)) add('DUPLICATE', `${name}[${index}].id`);
    seen.add(id);
  }
}

function allowedSource(value, asOf, maxAge, add, at) {
  if (!exact(value, ['id', 'name', 'kind', 'licence', 'observedOn', 'reference', 'silo']) ||
      !ident(value.id) || !pair(value.name) || !SOURCE_TYPES.includes(value.kind) ||
      !localPath(value.reference) || !silo(value.silo)) { add('SOURCE', at); return false; }
  if (!licence(value.licence)) add('LICENCE', `${at}.licence`);
  if (value.silo !== (value.licence === 'ODbL-1.0' ? 'odbl' : 'open')) add('SILO', `${at}.silo`);
  if (!allowedDate(value.observedOn, asOf, maxAge)) add('TIME', `${at}.observedOn`);
  if (value.name.en.toLowerCase().replace(/[^a-z0-9]/gu, '').includes('miway')) add('HELD', `${at}.name`);
  return true;
}

function allowedObservation(value, add, at) {
  if (!exact(value, ['sourceId', 'feature', 'access', 'observedOn', 'tier']) ||
      !ident(value.sourceId) || !feature(value.feature) || !access(value.access) ||
      !Number.isInteger(value.tier) || value.tier < 0 || value.tier > 3 ||
      dayNumber(value.observedOn) === null) { add('EVIDENCE', at); return false; }
  return true;
}

function evidenceCheck(item, sources, asOf, maxAge, add, at) {
  const matched = [];
  for (let index = 0; index < item.evidence.length; index++) {
    const value = item.evidence[index];
    const path = `${at}.evidence[${index}]`;
    if (!allowedObservation(value, add, path)) continue;
    const source = sources.get(value.sourceId);
    if (!source) { add('REF', `${path}.sourceId`); continue; }
    if (!item.sourceIds.includes(value.sourceId)) add('REF', `${path}.sourceId`);
    if (item.feature !== value.feature) add('EVIDENCE', `${path}.feature`);
    if (source.silo !== item.silo) add('SILO', `${path}.sourceId`);
    if (!allowedDate(value.observedOn, asOf, maxAge) ||
        dayNumber(value.observedOn) < dayNumber(source.observedOn)) add('TIME', `${path}.observedOn`);
    if (value.tier === 0 && value.access !== 'UNKNOWN') add('TIER', `${path}.tier`);
    matched.push(value);
  }
  const positive = matched.filter((value) => value.access === 'YES');
  const negative = matched.filter((value) => value.access === 'NO');
  if (positive.length && negative.length && item.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
  if (item.access !== 'UNKNOWN' && !matched.some((value) => value.access === item.access)) {
    add('ASSERTION', `${at}.access`);
  }
  if (item.tier === 0 && (item.access !== 'UNKNOWN' || matched.length)) add('TIER', `${at}.tier`);
  if (item.tier === 1 && item.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
  if (item.tier > 1 && item.access !== 'UNKNOWN' &&
      !matched.some((value) => value.tier >= item.tier && value.access === item.access)) add('TIER', `${at}.tier`);
  if (item.tier === 3 && item.access !== 'UNKNOWN' &&
      new Set(matched.filter((value) => value.access === item.access).map((value) => value.sourceId)).size < 2) {
    add('TIER', `${at}.tier`);
  }
}

function factShape(value, type, add, at) {
  const common = ['id', 'name', 'feature', 'access', 'tier', 'sourceIds', 'evidence', 'silo'];
  const required = type === 'place' ? [...common, 'nodeIds'] : type === 'node' ?
    [...common, 'placeId', 'lat', 'lon'] : [...common, 'from', 'to', 'metres', 'direction'];
  if (!exact(value, required) || !ident(value.id) || !pair(value.name) ||
      !feature(value.feature) || !access(value.access) || !silo(value.silo) ||
      !Number.isInteger(value.tier) || value.tier < 0 || value.tier > 3 ||
      !Array.isArray(value.sourceIds) || !value.sourceIds.every(ident) ||
      new Set(value.sourceIds).size !== value.sourceIds.length ||
      !Array.isArray(value.evidence) || value.evidence.length > 100) { add(type.toUpperCase(), at); return false; }
  return true;
}

/** Evaluate an entirely local candidate Ontario routing snapshot; fail closed. */
export function parseOntarioSnapshot(input) {
  const issues = [];
  const add = (codeName, path) => issues.push(diagnostic(codeName, path));
  const empty = () => Object.freeze({ ok: false, issues: orderIssues(issues), snapshot: null });
  if (!exact(input, ['version', 'asOf', 'maxAgeDays', 'sources', 'places', 'nodes', 'edges', 'assets']) ||
      input.version !== 1 || !Array.isArray(input.sources) || !Array.isArray(input.places) ||
      !Array.isArray(input.nodes) || !Array.isArray(input.edges) || !Array.isArray(input.assets)) {
    add('ROOT', '$'); return empty();
  }
  const asOf = dayNumber(input.asOf);
  if (asOf === null || !Number.isSafeInteger(input.maxAgeDays) || input.maxAgeDays < 0 ||
      input.maxAgeDays > 3650) { add('DATE', '$.asOf'); return empty(); }
  if (input.sources.length > 5000 || input.places.length > 20000 ||
      input.nodes.length > 30000 || input.edges.length > 60000 || input.assets.length > 20000) {
    add('LIMIT', '$'); return empty();
  }
  const collections = [['sources', input.sources], ['places', input.places],
    ['nodes', input.nodes], ['edges', input.edges], ['assets', input.assets]];
  for (const [key, array] of collections) uniqueIds(array, key, add);
  const sources = new Map();
  for (const [i, source] of input.sources.entries()) {
    const at = `sources[${i}]`;
    if (allowedSource(source, asOf, input.maxAgeDays, add, at)) sources.set(source.id, source);
  }
  for (const [kind, items] of [['place', input.places], ['node', input.nodes], ['edge', input.edges]]) {
    for (const [index, item] of items.entries()) {
      const at = `${kind}s[${index}]`;
      if (!factShape(item, kind, add, at)) continue;
      for (const id of item.sourceIds) {
        const source = sources.get(id);
        if (!source) add('REF', `${at}.sourceIds`);
        else if (source.silo !== item.silo) add('SILO', `${at}.sourceIds`);
      }
      evidenceCheck(item, sources, asOf, input.maxAgeDays, add, at);
      if (kind === 'place') {
        if (!Array.isArray(item.nodeIds) || !item.nodeIds.every(ident) ||
            new Set(item.nodeIds).size !== item.nodeIds.length) add('PLACE', `${at}.nodeIds`);
      } else if (kind === 'node') {
        if (!ident(item.placeId) || !Number.isFinite(item.lat) || !Number.isFinite(item.lon) ||
            item.lat < 41 || item.lat > 57 || item.lon < -96 || item.lon > -74) add('NODE', at);
      } else {
        if (!ident(item.from) || !ident(item.to) || !Number.isFinite(item.metres) ||
            item.metres <= 0 || item.metres > 200000) add('EDGE', at);
        if (item.from === item.to) add('LOOP', at);
        if (item.direction !== 'both' && item.direction !== 'forward') add('DIRECTION', at);
      }
    }
  }
  const places = new Map(input.places.filter((v) => obj(v) && ident(v.id)).map((v) => [v.id, v]));
  const nodes = new Map(input.nodes.filter((v) => obj(v) && ident(v.id)).map((v) => [v.id, v]));
  for (const [index, item] of input.places.entries()) {
    if (!Array.isArray(item?.nodeIds)) continue;
    for (const id of item.nodeIds) if (!nodes.has(id)) add('REF', `places[${index}].nodeIds`);
  }
  for (const [index, item] of input.nodes.entries()) {
    if (!obj(item)) continue;
    if (!places.has(item.placeId)) add('REF', `nodes[${index}].placeId`);
    if (places.has(item.placeId) && !places.get(item.placeId).nodeIds?.includes(item.id)) {
      add('REF', `nodes[${index}].placeId`);
    }
  }
  for (const [index, item] of input.edges.entries()) {
    if (!obj(item)) continue;
    if (!nodes.has(item.from) || !nodes.has(item.to)) add('REF', `edges[${index}]`);
    if (nodes.has(item.from) && nodes.has(item.to) &&
        (nodes.get(item.from).silo !== item.silo || nodes.get(item.to).silo !== item.silo)) {
      add('SILO', `edges[${index}]`);
    }
  }
  const assetPaths = new Set();
  for (const [index, item] of input.assets.entries()) {
    const at = `assets[${index}]`;
    if (!exact(item, ['id', 'path', 'bytes', 'sha256', 'sourceIds', 'silo']) ||
        !ident(item.id) || !localPath(item.path) || !Number.isSafeInteger(item.bytes) ||
        item.bytes < 1 || item.bytes > 32 * 1024 * 1024 ||
        typeof item.sha256 !== 'string' || !HASH.test(item.sha256) ||
        !Array.isArray(item.sourceIds) || !item.sourceIds.length || !item.sourceIds.every(ident) ||
        !silo(item.silo)) { add('ASSET', at); continue; }
    if (assetPaths.has(item.path)) add('DUPLICATE', `${at}.path`);
    assetPaths.add(item.path);
    for (const id of item.sourceIds) {
      const source = sources.get(id);
      if (!source) add('REF', `${at}.sourceIds`);
      else if (source.silo !== item.silo) add('SILO', `${at}.sourceIds`);
    }
  }
  if (issues.length) return empty();
  const snapshot = structuredClone(input);
  return Object.freeze({ ok: true, issues: Object.freeze([]), snapshot: Object.freeze(snapshot) });
}

export function orderIssues(issues) {
  return Object.freeze([...issues].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en')));
}

export function textIssues(report, locale = 'en') {
  if (!['en', 'fr'].includes(locale)) throw new TypeError('Invalid locale');
  if (report.ok) return locale === 'en' ? 'Check passed\n' : 'Contrôle réussi\n';
  const heading = locale === 'en' ? 'Snapshot blocked' : 'Données bloquées';
  return [heading, ...report.issues.map((item) => `${item.code} ${item.path}: ${item[locale]}`)].join('\n') + '\n';
}

export function allFacts(snapshot) {
  return [...snapshot.places, ...snapshot.nodes, ...snapshot.edges];
}

export function factIds(snapshot) {
  return Object.freeze(sorted(allFacts(snapshot).map((value) => value.id)));
}
