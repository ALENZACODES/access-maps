/**
 * P15S — deterministic offline delivery receipt audit.
 * No filesystem, network, timers, environment variables or publishing actions.
 * The caller provides one plain JSON document describing local offline assets.
 */
import { createHash } from 'node:crypto';

const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const ACCESS = new Set(['YES', 'NO', 'UNKNOWN']);
const FIELDS = new Set(['entrance', 'washroom', 'lift', 'path', 'parking', 'seating']);
const SILOS = new Set(['open', 'odbl']);
const LEVELS = new Set([0, 1, 2, 3]);
const MAX = Object.freeze({ sources: 1000, places: 10000, assets: 20000, bytes: 33554432 });
const MESSAGES = Object.freeze({
  ROOT: ['Receipt structure is invalid.', 'La structure du reçu est non valide.'],
  DATE: ['The date is invalid or outside the permitted window.', 'La date est non valide ou hors de la période permise.'],
  LIMIT: ['A configured limit was exceeded.', 'Une limite configurée a été dépassée.'],
  SOURCE: ['A source entry is incomplete or repeated.', 'Une source est incomplète ou répétée.'],
  LICENCE: ['The licence is missing or is not open.', 'La licence est absente ou non ouverte.'],
  SILO: ['A record crosses its licence boundary.', 'Une fiche franchit la limite de sa licence.'],
  PATH: ['A local asset reference is unsafe.', 'Une référence locale de fichier est non sûre.'],
  DIGEST: ['The asset digest is missing or inconsistent.', 'L’empreinte du fichier est absente ou incohérente.'],
  MISSING: ['A referenced source or asset is missing.', 'Une source ou un fichier cité est absent.'],
  TEXT: ['English and French labels must be present and safe.', 'Les libellés anglais et français doivent être présents et sûrs.'],
  TIER: ['The confidence tier is not supported by dated observations.', 'Le niveau de confiance ne repose pas sur des observations datées.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Les observations divergent\u202f; la valeur doit rester UNKNOWN.'],
  ACCESS: ['An accessibility assertion lacks matching observations.', 'Une indication d’accès manque d’observations correspondantes.'],
  DUPLICATE: ['An identifier or observation repeats.', 'Un identifiant ou une observation se répète.'],
  COVERAGE: ['Not all required local assets are present.', 'Des fichiers locaux requis sont absents.'],
  PRIVATE: ['The record contains a personal contact or credential pattern.', 'La fiche contient des coordonnées personnelles ou des renseignements sensibles.'],
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, required, optional = []) {
  return object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function id(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value);
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const date = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || date < 1 || date > 31) return null;
  const time = new Date(0);
  time.setUTCHours(0, 0, 0, 0);
  time.setUTCFullYear(year, month - 1, date);
  if (time.getUTCFullYear() !== year || time.getUTCMonth() + 1 !== month ||
      time.getUTCDate() !== date) return null;
  return time.getTime() / 86400000;
}
function control(value) {
  return /\p{Cc}/u.test(value);
}
function privateText(value) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|api[-_]?key)\s*[:=]/iu.test(value);
}
function label(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 &&
    value === value.trim() && !control(value) && !privateText(value) &&
    !/<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu.test(value) &&
    !/\b(?:guaranteed|real[- ]time|certified|garanti|temps réel|certifié)\b/iu.test(value);
}
function french(value) {
  if (!label(value)) return false;
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === ':' && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(value[i]) && value[i - 1] !== '\u202f') return false;
    if (value[i] === '»' && value[i - 1] !== '\u202f') return false;
  }
  for (let i = 0; i < value.length - 1; i += 1) {
    if (value[i] === '«' && value[i + 1] !== '\u202f') return false;
  }
  return true;
}
function safePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 ||
      value.startsWith('/') || /[\\%?#:]|\p{Cc}/u.test(value) || privateText(value)) return false;
  return value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..' &&
    !part.startsWith('.') && !part.endsWith('.') && !part.includes(' '));
}
function safeStrings(value) {
  return Array.isArray(value) && value.length <= 1000 && value.every(id) &&
    new Set(value).size === value.length;
}
function digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, stable(item)]));
  return value;
}
function issue(code, path) {
  const [en, fr] = MESSAGES[code];
  return { code, path, en, fr };
}
function sortedIssues(findings) {
  return findings.sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en'));
}
function validateSources(items, asOf, maxAgeDays, add) {
  const result = new Map();
  for (const [index, entry] of items.entries()) {
    const at = `$.sources[${index}]`;
    if (!exact(entry, ['id', 'name', 'licence', 'observedOn', 'reference']) ||
        !id(entry.id) || !label(entry.name)) { add('SOURCE', at); continue; }
    if (result.has(entry.id)) { add('DUPLICATE', `${at}.id`); continue; }
    if (!LICENCES.has(entry.licence)) add('LICENCE', `${at}.licence`);
    if (!safePath(entry.reference)) add('PATH', `${at}.reference`);
    const observed = day(entry.observedOn);
    if (observed === null || observed > asOf || asOf - observed > maxAgeDays) {
      add('DATE', `${at}.observedOn`);
    }
    if (LICENCES.has(entry.licence) && safePath(entry.reference) && observed !== null &&
        observed <= asOf && asOf - observed <= maxAgeDays) result.set(entry.id, entry);
  }
  return result;
}
function validateAssets(items, sources, add) {
  const result = new Map();
  const paths = new Set();
  for (const [index, entry] of items.entries()) {
    const at = `$.assets[${index}]`;
    if (!exact(entry, ['id', 'path', 'sha256', 'bytes', 'sourceIds', 'silo', 'present']) ||
        !id(entry.id) || !safeStrings(entry.sourceIds) || entry.sourceIds.length === 0 ||
        !SILOS.has(entry.silo) || typeof entry.present !== 'boolean' ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > MAX.bytes) {
      add('ROOT', at); continue;
    }
    if (result.has(entry.id)) add('DUPLICATE', `${at}.id`);
    if (!safePath(entry.path)) add('PATH', `${at}.path`);
    else if (paths.has(entry.path)) add('DUPLICATE', `${at}.path`);
    else paths.add(entry.path);
    if (!digest(entry.sha256)) add('DIGEST', `${at}.sha256`);
    const linked = entry.sourceIds.map(key => sources.get(key));
    if (linked.some(item => !item)) add('MISSING', `${at}.sourceIds`);
    const needsOdbl = linked.some(item => item?.licence === 'ODbL-1.0');
    if (entry.silo !== (needsOdbl ? 'odbl' : 'open')) add('SILO', `${at}.silo`);
    if (!entry.present) add('COVERAGE', `${at}.present`);
    result.set(entry.id, entry);
  }
  return result;
}
function validObservation(value, record, sources, asOf, maxAgeDays, at, add) {
  if (!exact(value, ['sourceId', 'feature', 'access', 'observedOn', 'tier']) ||
      !id(value.sourceId) || !FIELDS.has(value.feature) || !ACCESS.has(value.access) ||
      !LEVELS.has(value.tier)) { add('ROOT', at); return null; }
  const source = sources.get(value.sourceId);
  if (!source || !record.sourceIds.includes(value.sourceId)) add('MISSING', `${at}.sourceId`);
  const observed = day(value.observedOn);
  if (observed === null || observed > asOf || asOf - observed > maxAgeDays ||
      (source && observed < day(source.observedOn))) add('DATE', `${at}.observedOn`);
  if (value.feature !== record.feature) add('ACCESS', `${at}.feature`);
  if (value.tier === 0 && value.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
  if (!source || observed === null || observed > asOf || asOf - observed > maxAgeDays ||
      observed < day(source.observedOn) || value.feature !== record.feature) return null;
  return value;
}
function validatePlaces(items, sources, assets, asOf, maxAgeDays, add) {
  const result = [];
  const seen = new Set();
  for (const [index, entry] of items.entries()) {
    const at = `$.places[${index}]`;
    if (!exact(entry, ['id', 'en', 'fr', 'feature', 'access', 'tier', 'silo',
      'sourceIds', 'assetIds', 'evidence']) || !id(entry.id) ||
      !FIELDS.has(entry.feature) || !ACCESS.has(entry.access) ||
      !LEVELS.has(entry.tier) || !SILOS.has(entry.silo) ||
      !safeStrings(entry.sourceIds) || !safeStrings(entry.assetIds) ||
      !Array.isArray(entry.evidence) || entry.evidence.length > 200) {
      add('ROOT', at); continue;
    }
    if (seen.has(entry.id)) add('DUPLICATE', `${at}.id`);
    seen.add(entry.id);
    if (!label(entry.en) || !french(entry.fr)) add('TEXT', `${at}.labels`);
    if (entry.sourceIds.length === 0) add('MISSING', `${at}.sourceIds`);
    const linked = entry.sourceIds.map(key => sources.get(key));
    if (linked.some(item => !item)) add('MISSING', `${at}.sourceIds`);
    const needsOdbl = linked.some(item => item?.licence === 'ODbL-1.0');
    if (entry.silo !== (needsOdbl ? 'odbl' : 'open')) add('SILO', `${at}.silo`);
    for (const key of entry.assetIds) {
      const asset = assets.get(key);
      if (!asset) add('MISSING', `${at}.assetIds`);
      else if (asset.silo !== entry.silo ||
        !asset.sourceIds.every(sourceId => entry.sourceIds.includes(sourceId))) {
        add('SILO', `${at}.assetIds`);
      }
    }
    const evidence = [];
    const signatures = new Set();
    for (const [i, observation] of entry.evidence.entries()) {
      const path = `${at}.evidence[${i}]`;
      const clean = validObservation(observation, entry, sources, asOf, maxAgeDays, path, add);
      if (!clean) continue;
      const signature = JSON.stringify([clean.sourceId, clean.feature, clean.access,
        clean.observedOn, clean.tier]);
      if (signatures.has(signature)) add('DUPLICATE', path);
      signatures.add(signature);
      evidence.push(clean);
    }
    const yes = evidence.some(item => item.access === 'YES');
    const no = evidence.some(item => item.access === 'NO');
    if (yes && no && entry.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
    const matches = evidence.filter(item => item.access === entry.access);
    if (entry.access !== 'UNKNOWN' && !matches.length) add('ACCESS', `${at}.access`);
    if (entry.tier === 0 && (entry.access !== 'UNKNOWN' || evidence.length)) {
      add('TIER', `${at}.tier`);
    }
    if (entry.tier === 1 && entry.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
    if (entry.tier >= 2 && entry.access === 'UNKNOWN') add('TIER', `${at}.tier`);
    if (entry.tier >= 2 && !matches.some(item => item.tier >= entry.tier)) {
      add('TIER', `${at}.tier`);
    }
    if (entry.tier === 3 && new Set(matches.filter(item => item.tier >= 3)
      .map(item => item.sourceId)).size < 2) add('TIER', `${at}.tier`);
    result.push(entry);
  }
  return result;
}

/**
 * An OK report is only an audit receipt, never a permission to auto-publish.
 * No external operations are performed. Output ordering is stable.
 * @param {unknown} input Local JSON data to inspect.
 * @returns {{ok:boolean,findings:object[],summary:object,receipt:null|object}}
 */
export function auditOfflineDelivery(input) {
  const findings = [];
  const add = (code, path) => findings.push(issue(code, path));
  const summary = { sources: 0, places: 0, assets: 0, presentAssets: 0,
    missingAssets: 0, unknownPlaces: 0, assertedPlaces: 0, totalBytes: 0 };
  const finish = (receipt = null) => ({ ok: findings.length === 0,
    findings: sortedIssues(findings), summary: { ...summary },
    receipt: findings.length ? null : receipt });
  if (!exact(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'sources', 'places', 'assets']) ||
      input.schemaVersion !== 1 || !Array.isArray(input.sources) ||
      !Array.isArray(input.places) || !Array.isArray(input.assets)) {
    add('ROOT', '$'); return finish();
  }
  const asOf = day(input.asOf);
  if (asOf === null || !Number.isSafeInteger(input.maxAgeDays) ||
      input.maxAgeDays < 0 || input.maxAgeDays > 3650) {
    add('DATE', '$.asOf'); return finish();
  }
  if (input.sources.length > MAX.sources || input.places.length > MAX.places ||
      input.assets.length > MAX.assets) { add('LIMIT', '$'); return finish(); }
  summary.sources = input.sources.length;
  summary.places = input.places.length;
  summary.assets = input.assets.length;
  summary.presentAssets = input.assets.filter(item => item?.present === true).length;
  summary.missingAssets = summary.assets - summary.presentAssets;
  summary.unknownPlaces = input.places.filter(item => item?.access === 'UNKNOWN').length;
  summary.assertedPlaces = summary.places - summary.unknownPlaces;
  summary.totalBytes = input.assets.reduce((sum, item) => sum +
    (Number.isSafeInteger(item?.bytes) && item.bytes >= 0 ? item.bytes : 0), 0);
  if (!Number.isSafeInteger(summary.totalBytes) || summary.totalBytes > MAX.bytes * MAX.assets) {
    add('LIMIT', '$.assets'); return finish();
  }
  const sources = validateSources(input.sources, asOf, input.maxAgeDays, add);
  const assets = validateAssets(input.assets, sources, add);
  validatePlaces(input.places, sources, assets, asOf, input.maxAgeDays, add);
  if (findings.length) return finish();
  const receiptData = {
    schemaVersion: input.schemaVersion,
    asOf: input.asOf,
    sourceIds: [...sources.keys()].sort(),
    placeIds: input.places.map(item => item.id).sort(),
    assetIds: [...assets.keys()].sort(),
    totalBytes: summary.totalBytes,
    silos: [...new Set(input.places.map(item => item.silo))].sort(),
  };
  const content = JSON.stringify(stable(receiptData));
  return finish({ ...receiptData, sha256: createHash('sha256').update(content).digest('hex') });
}

export function deliveryText(report, locale = 'en') {
  if (!report || typeof report.ok !== 'boolean' || !Array.isArray(report.findings) ||
      !['en', 'fr'].includes(locale)) return '';
  const heading = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Livraison bloquée') :
    (report.ok ? 'Check passed' : 'Delivery blocked');
  return `${[heading, ...report.findings.map(item => `${item.code} ${item.path}: ${item[locale]}`)].join('\n')}\n`;
}
