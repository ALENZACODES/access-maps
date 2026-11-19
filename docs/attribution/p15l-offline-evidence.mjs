/**
 * P15L: a local-only gate for a candidate offline evidence package.
 *
 * Input shape is intentionally independent of web rendering and networking.
 * Every assertion about a real location must name an observed source, an
 * observation date and a confidence tier. No record is created by this module.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating', 'transit']);
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const SILOS = new Set(['open', 'odbl']);
const LEVELS = new Set([0, 1, 2, 3]);
const MAX_FILES = 2000;
const MAX_SOURCES = 5000;
const MAX_RECORDS = 20000;
const MAX_BYTES = 32 * 1024 * 1024;
const DAY_MS = 86_400_000;
const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UNSAFE_COPY = /\p{Cc}|<\s*\/?\s*[a-z]|(?:javascript|data)\s*:/i;
const UNSAFE_PERSONAL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|api[-_]?key|private[-_]?key)\s*[:=]/i;
const ASSERTIVE = /\b(?:guaranteed|real[- ]time|officially approved|partnership|garanti|temps réel|partenariat)\b/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hasOnly(value, keys) {
  return isObject(value) && Object.keys(value).every(key => keys.includes(key));
}
function id(value) {
  return typeof value === 'string' && value.length <= 96 && ID.test(value);
}
function label(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 &&
    value.trim() === value && !UNSAFE_COPY.test(value) &&
    !UNSAFE_PERSONAL.test(value) && !ASSERTIVE.test(value);
}
function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(0);
  dt.setUTCHours(0, 0, 0, 0);
  dt.setUTCFullYear(year, month - 1, day);
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.getTime() / DAY_MS;
}
function pathSafe(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 320 ||
      value.startsWith('/') || /[\\%?#:]|\p{Cc}/.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
function frSpacing(value) {
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(ch) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (ch === '«' && value[i + 1] !== '\u202f') return false;
    if (ch === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function distinctStrings(value) {
  return Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
}
function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}
function actualDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function equalDigest(a, b) {
  if (!DIGEST.test(a) || !DIGEST.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function standardFinding(code, path) {
  return { code, path, en: TEXT[code][0], fr: TEXT[code][1] };
}
const TEXT = Object.freeze({
  ROOT: ['Input package format is not supported.', 'Le format du paquet n’est pas pris en charge.'],
  LIMIT: ['The package exceeds a safe limit.', 'Le paquet dépasse une limite de sécurité.'],
  DATE: ['A calendar date is missing or invalid.', 'Une date civile est absente ou non valide.'],
  SOURCE: ['A source entry is incomplete.', 'Une entrée de source est incomplète.'],
  LICENCE: ['The source licence cannot be used for this export.', 'La licence de la source ne convient pas à cette exportation.'],
  DUPLICATE: ['An identifier or path is repeated.', 'Un identifiant ou un chemin est répété.'],
  PATH: ['An offline path must be local and safe.', 'Un chemin hors ligne doit être local et sûr.'],
  FILE: ['A file entry is incomplete.', 'Une entrée de fichier est incomplète.'],
  BYTES: ['The supplied file bytes are absent or do not match.', 'Les octets du fichier sont absents ou ne correspondent pas.'],
  DIGEST: ['The supplied file content has a different digest.', 'Le contenu du fichier possède une empreinte différente.'],
  RECORD: ['A place fact has missing or invalid fields.', 'Une donnée de lieu comporte des champs absents ou non valides.'],
  LABEL: ['English and French labels must be safe and complete.', 'Les libellés anglais et français doivent être complets et sûrs.'],
  TYPOGRAPHY: ['French punctuation requires nonbreaking spacing.', 'La ponctuation française exige des espaces insécables.'],
  SOURCE_LINK: ['A record must refer to an available source.', 'Une fiche doit renvoyer à une source disponible.'],
  FILE_LINK: ['A record refers to an unavailable offline file.', 'Une fiche renvoie à un fichier hors ligne indisponible.'],
  SILO: ['Licence export separation is inconsistent.', 'La séparation des exportations par licence est incohérente.'],
  TIER: ['The confidence tier is inconsistent with the evidence.', 'Le niveau de confiance ne correspond pas aux observations.'],
  OBSERVATION: ['An observation is missing or inconsistent.', 'Une observation est absente ou incohérente.'],
  CONFLICT: ['Conflicting observations must leave access UNKNOWN.', 'Des observations contradictoires doivent laisser l’accès UNKNOWN.'],
  AGE: ['A source or observation is outside the allowed date range.', 'Une source ou une observation est hors de la période permise.'],
  ASSERTION: ['A stated access value needs a matching observation.', 'Un état d’accès déclaré exige une observation correspondante.'],
  REFERENCE: ['A source reference is missing from the local package.', 'Une référence de source manque dans le paquet local.'],
  HELD: ['A held feed may not enter the publication package.', 'Un flux retenu ne peut pas entrer dans le paquet de publication.'],
});

/**
 * Audit a supplied package and its caller-provided local file buffers.
 *
 * The function never reads a path or opens a URL. A passing result means the
 * supplied candidate satisfies this contract, not that its field facts are
 * independently established. Use a separate human review for real-world claims.
 *
 * @param {unknown} candidate
 * @param {unknown} fileBytes - map of manifest paths to Uint8Array or ArrayBuffer
 * @returns {{ok:boolean,findings:Array<{code:string,path:string,en:string,fr:string}>,summary:object}}
 */
export function auditOfflineEvidence(candidate, fileBytes = {}) {
  const findings = [];
  const add = (code, path) => findings.push(standardFinding(code, path));
  const summary = { sources: 0, records: 0, files: 0, unknown: 0, asserted: 0, tier0: 0, totalBytes: 0 };
  const finish = () => ({ ok: findings.length === 0,
    findings: findings.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')),
    summary: { ...summary } });
  const rootKeys = ['schemaVersion', 'asOf', 'maxAgeDays', 'sources', 'records', 'files'];
  if (!hasOnly(candidate, rootKeys) || rootKeys.some(key => !Object.hasOwn(candidate, key)) ||
      candidate.schemaVersion !== 1 || !Array.isArray(candidate.sources) ||
      !Array.isArray(candidate.records) || !Array.isArray(candidate.files) ||
      !isObject(fileBytes)) { add('ROOT', '$'); return finish(); }
  const asOf = dateNumber(candidate.asOf);
  if (asOf === null || !Number.isSafeInteger(candidate.maxAgeDays) ||
      candidate.maxAgeDays < 0 || candidate.maxAgeDays > 3650) { add('DATE', '$.asOf'); return finish(); }
  if (candidate.sources.length > MAX_SOURCES || candidate.records.length > MAX_RECORDS ||
      candidate.files.length > MAX_FILES || Object.keys(fileBytes).length > MAX_FILES) {
    add('LIMIT', '$'); return finish();
  }
  summary.sources = candidate.sources.length;
  summary.records = candidate.records.length;
  summary.files = candidate.files.length;
  const sources = new Map();
  for (const [i, source] of candidate.sources.entries()) {
    const at = `$.sources[${i}]`;
    if (!hasOnly(source, ['id', 'name', 'licence', 'observedOn', 'reference']) ||
        !id(source.id) || !label(source.name) || !pathSafe(source.reference)) {
      add('SOURCE', at); continue;
    }
    if (sources.has(source.id)) add('DUPLICATE', `${at}.id`);
    if (!LICENCES.has(source.licence)) add('LICENCE', `${at}.licence`);
    if (/miway/i.test(source.name.replace(/[^a-z]/gi, ''))) add('HELD', `${at}.name`);
    const day = dateNumber(source.observedOn);
    if (day === null || day > asOf || asOf - day > candidate.maxAgeDays) add('AGE', `${at}.observedOn`);
    sources.set(source.id, { ...source, day });
  }
  const files = new Map();
  const paths = new Set();
  let allocated = 0;
  for (const [i, file] of candidate.files.entries()) {
    const at = `$.files[${i}]`;
    if (!hasOnly(file, ['id', 'path', 'sha256', 'bytes', 'sourceIds', 'silo']) ||
        !id(file.id) || !pathSafe(file.path) || !DIGEST.test(file.sha256 ?? '') ||
        !Number.isSafeInteger(file.bytes) || file.bytes <= 0 ||
        !distinctStrings(file.sourceIds) || file.sourceIds.length === 0 || !SILOS.has(file.silo)) {
      add('FILE', at); continue;
    }
    if (files.has(file.id) || paths.has(file.path)) add('DUPLICATE', `${at}.id`);
    paths.add(file.path);
    allocated += file.bytes;
    if (allocated > MAX_BYTES) { add('LIMIT', '$.files'); break; }
    const bytes = bytesFrom(fileBytes[file.path]);
    if (!bytes || bytes.byteLength !== file.bytes) add('BYTES', `${at}.bytes`);
    else if (!equalDigest(actualDigest(bytes), file.sha256)) add('DIGEST', `${at}.sha256`);
    const missing = file.sourceIds.some(key => !sources.has(key));
    if (missing) add('SOURCE_LINK', `${at}.sourceIds`);
    const expectedSilo = file.sourceIds.some(key => sources.get(key)?.licence === 'ODbL-1.0') ? 'odbl' : 'open';
    if (file.silo !== expectedSilo) add('SILO', `${at}.silo`);
    files.set(file.id, file);
  }
  summary.totalBytes = allocated;
  for (const path of Object.keys(fileBytes)) if (!paths.has(path)) add('REFERENCE', `$.fileBytes.${path}`);
  const records = new Set();
  for (const [i, item] of candidate.records.entries()) {
    const at = `$.records[${i}]`;
    if (!hasOnly(item, ['id', 'en', 'fr', 'feature', 'access', 'tier', 'sourceIds',
      'fileIds', 'silo', 'observations']) || !id(item.id) || !FEATURES.has(item.feature) ||
      !STATES.has(item.access) || !LEVELS.has(item.tier) || !distinctStrings(item.sourceIds) ||
      item.sourceIds.length === 0 || !distinctStrings(item.fileIds) || !SILOS.has(item.silo) ||
      !Array.isArray(item.observations)) { add('RECORD', at); continue; }
    if (records.has(item.id)) add('DUPLICATE', `${at}.id`);
    records.add(item.id);
    if (!label(item.en) || !label(item.fr)) add('LABEL', `${at}.labels`);
    else if (!frSpacing(item.fr)) add('TYPOGRAPHY', `${at}.fr`);
    if (item.access === 'UNKNOWN') summary.unknown += 1; else summary.asserted += 1;
    if (item.tier === 0) { summary.tier0 += 1; add('TIER', `${at}.tier`); }
    for (const sourceId of item.sourceIds) if (!sources.has(sourceId)) add('SOURCE_LINK', `${at}.sourceIds`);
    for (const fileId of item.fileIds) {
      const file = files.get(fileId);
      if (!file) add('FILE_LINK', `${at}.fileIds`);
      else if (file.silo !== item.silo || file.sourceIds.some(sourceId => !item.sourceIds.includes(sourceId))) {
        add('SILO', `${at}.fileIds`);
      }
    }
    const expectedSilo = item.sourceIds.some(key => sources.get(key)?.licence === 'ODbL-1.0') ? 'odbl' : 'open';
    if (expectedSilo !== item.silo) add('SILO', `${at}.silo`);
    const observations = [];
    for (const [j, entry] of item.observations.entries()) {
      const where = `${at}.observations[${j}]`;
      if (!hasOnly(entry, ['feature', 'access', 'sourceId', 'observedOn', 'tier']) ||
          !FEATURES.has(entry.feature) || !STATES.has(entry.access) ||
          !id(entry.sourceId) || !LEVELS.has(entry.tier) || entry.tier === 0 ||
          !item.sourceIds.includes(entry.sourceId) || entry.feature !== item.feature) {
        add('OBSERVATION', where); continue;
      }
      const day = dateNumber(entry.observedOn);
      const source = sources.get(entry.sourceId);
      if (!source) add('SOURCE_LINK', `${where}.sourceId`);
      if (day === null || day > asOf || asOf - day > candidate.maxAgeDays ||
          (source && source.day !== null && day < source.day)) add('AGE', `${where}.observedOn`);
      if (entry.tier > item.tier) add('TIER', `${where}.tier`);
      observations.push(entry);
    }
    if (item.tier > 1 && !observations.some(entry => entry.tier >= item.tier && entry.access !== 'UNKNOWN')) {
      add('TIER', `${at}.tier`);
    }
    if (item.access !== 'UNKNOWN' && !observations.some(entry => entry.access === item.access)) {
      add('ASSERTION', `${at}.access`);
    }
    if (observations.some(entry => entry.access === 'YES') &&
        observations.some(entry => entry.access === 'NO') && item.access !== 'UNKNOWN') {
      add('CONFLICT', `${at}.access`);
    }
    if (item.tier >= 2 && item.access === 'UNKNOWN') add('TIER', `${at}.tier`);
  }
  return finish();
}

/** A stable diagnostic format; findings never contain raw input values. */
export function offlineEvidenceText(result, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Expected en or fr');
  const header = locale === 'fr' ? (result.ok ? 'Contrôle réussi' : 'Exportation bloquée') :
    (result.ok ? 'Check passed' : 'Export blocked');
  return [header, ...result.findings.map(issue => `${issue.code} ${issue.path}: ${issue[locale]}`)].join('\n') + '\n';
}

export const OFFLINE_EVIDENCE_LIMITS = Object.freeze({
  sources: MAX_SOURCES, records: MAX_RECORDS, files: MAX_FILES, totalBytes: MAX_BYTES,
});
