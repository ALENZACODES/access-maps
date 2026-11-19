/**
 * P15O — local-only manifest assembler for attributed offline accessibility data.
 *
 * The caller supplies complete data and local bytes. No network, filesystem,
 * timers, mutations, account access, or publication paths are present here.
 * A failure blocks the entire manifest; partial outputs are never emitted.
 */
import { createHash } from 'node:crypto';

const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const SILOS = new Set(['open', 'odbl']);
const ISSUES = Object.freeze({
  ROOT: ['The offline package has an invalid structure.', 'La structure du paquet hors ligne est incorrecte.'],
  DATE: ['The date is invalid or outside the permitted window.', 'La date est incorrecte ou hors de la période autorisée.'],
  SOURCE: ['Source attribution is missing or inconsistent.', 'L’attribution de la source est absente ou incohérente.'],
  LICENCE: ['The source licence is unavailable or not open.', 'La licence de la source est absente ou non ouverte.'],
  SILO: ['The licence groups cannot be combined.', 'Les groupes de licences ne peuvent pas être réunis.'],
  DUPLICATE: ['An identifier or file path is repeated.', 'Un identifiant ou un chemin de fichier est répété.'],
  TEXT: ['English or French display text is unsafe or absent.', 'Le texte affiché en anglais ou en français est absent ou non sûr.'],
  PATH: ['The offline path is unsafe.', 'Le chemin hors ligne n’est pas sûr.'],
  BYTES: ['The offline file does not match its declared length or digest.', 'Le fichier hors ligne ne correspond pas à la longueur ou à l’empreinte indiquée.'],
  LIMIT: ['The offline package exceeds its bounds.', 'Le paquet hors ligne dépasse les limites permises.'],
  ACCESS: ['An access statement lacks suitable dated observations.', 'Un état d’accès manque d’observations datées appropriées.'],
  TIER: ['The evidence does not support the stated tier.', 'Les observations ne soutiennent pas le niveau indiqué.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Des observations contradictoires exigent UNKNOWN.'],
  LINK: ['The record references an absent source or file.', 'La fiche renvoie à une source ou à un fichier absent.'],
  POLICY: ['The stated export policy is invalid.', 'La politique d’exportation indiquée est incorrecte.'],
});
const DAY_MS = 86400000;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 20000;
const MAX_SOURCES = 5000;
const MAX_ASSETS = 10000;
const FIELDS = Object.freeze({
  root: ['schemaVersion', 'asOf', 'maxAgeDays', 'silo', 'sources', 'assets', 'records'],
  source: ['id', 'name', 'licence', 'reference', 'observedOn'],
  asset: ['id', 'path', 'sourceIds', 'silo', 'bytes', 'sha256'],
  record: ['id', 'en', 'fr', 'feature', 'access', 'tier', 'sourceIds', 'assetIds', 'evidence', 'silo'],
  evidence: ['sourceId', 'feature', 'access', 'observedOn', 'tier'],
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value, required) {
  return object(value) && Object.keys(value).length === required.length &&
    required.every(key => Object.hasOwn(value, key));
}
function id(value) {
  return typeof value === 'string' && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time;
}
function validPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    !value.startsWith('/') && !/[\\%?#:]|\p{Cc}/u.test(value) &&
    value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}
function text(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 250 &&
    value.trim() === value && !/\p{Cc}/u.test(value) &&
    !/<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu.test(value) &&
    !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(value);
}
function list(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_SOURCES &&
    value.every(id) && new Set(value).size === value.length;
}
function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return null;
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function french(value) {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(value[i]) && i > 0 && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function safeAge(observed, asOf, maxAgeDays) {
  const time = date(observed);
  return time !== null && time <= asOf && asOf - time <= maxAgeDays * DAY_MS;
}
function sorted(values) {
  return [...values].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
function finding(code, path) {
  const [en, fr] = ISSUES[code];
  return { code, path, en, fr };
}
function orderedFindings(findings) {
  return findings.sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en'));
}
function isHeld(value) {
  return typeof value === 'string' && value.toLowerCase().replace(/[^a-z0-9]/gu, '').includes('miway');
}

/**
 * @param {unknown} input Complete manifest candidate.
 * @param {Readonly<Record<string, Uint8Array|string>>} localFiles Caller-owned bytes keyed by asset path.
 * @returns {{ok: boolean, findings: Array<{code:string,path:string,en:string,fr:string}>, manifest: object|null}}
 */
export function assembleOfflineManifest(input, localFiles = {}) {
  const findings = [];
  const add = (code, path) => findings.push(finding(code, path));
  const block = () => ({ ok: false, findings: orderedFindings(findings), manifest: null });
  if (!keys(input, FIELDS.root) || input.schemaVersion !== 1 ||
      !Array.isArray(input.sources) || !Array.isArray(input.assets) ||
      !Array.isArray(input.records) || !SILOS.has(input.silo) ||
      !object(localFiles) || !Number.isSafeInteger(input.maxAgeDays) ||
      input.maxAgeDays < 0 || input.maxAgeDays > 3650) {
    add('ROOT', '$'); return block();
  }
  const asOf = date(input.asOf);
  if (asOf === null) { add('DATE', '$.asOf'); return block(); }
  if (input.sources.length > MAX_SOURCES || input.assets.length > MAX_ASSETS ||
      input.records.length > MAX_RECORDS) { add('LIMIT', '$'); return block(); }
  const sources = new Map();
  for (const [i, source] of input.sources.entries()) {
    const at = `$.sources[${i}]`;
    if (!keys(source, FIELDS.source) || !id(source.id) || !text(source.name) ||
        !validPath(source.reference) || isHeld(source.name)) { add('SOURCE', at); continue; }
    if (sources.has(source.id)) add('DUPLICATE', `${at}.id`);
    if (!LICENCES.has(source.licence)) add('LICENCE', `${at}.licence`);
    if (!safeAge(source.observedOn, asOf, input.maxAgeDays)) add('DATE', `${at}.observedOn`);
    sources.set(source.id, source);
  }
  const assets = new Map();
  const paths = new Set();
  let size = 0;
  for (const [i, asset] of input.assets.entries()) {
    const at = `$.assets[${i}]`;
    if (!keys(asset, FIELDS.asset) || !id(asset.id) || !validPath(asset.path) ||
        !list(asset.sourceIds) || !SILOS.has(asset.silo) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 ||
        typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(asset.sha256)) {
      add('PATH', at); continue;
    }
    if (assets.has(asset.id) || paths.has(asset.path)) add('DUPLICATE', at);
    paths.add(asset.path);
    if (asset.silo !== input.silo || asset.sourceIds.some(sourceId =>
      sources.get(sourceId)?.licence === 'ODbL-1.0' !== (input.silo === 'odbl'))) add('SILO', at);
    for (const sourceId of asset.sourceIds) if (!sources.has(sourceId)) add('LINK', `${at}.sourceIds`);
    const file = Object.hasOwn(localFiles, asset.path) ? bytes(localFiles[asset.path]) : null;
    if (!file || file.byteLength !== asset.bytes || sha256(file) !== asset.sha256) add('BYTES', at);
    size += asset.bytes;
    if (size > MAX_BYTES) add('LIMIT', '$.assets');
    assets.set(asset.id, asset);
  }
  const records = new Map();
  for (const [i, record] of input.records.entries()) {
    const at = `$.records[${i}]`;
    if (!keys(record, FIELDS.record) || !id(record.id) || !text(record.en) ||
        !text(record.fr) || !french(record.fr) || !FEATURES.has(record.feature) ||
        !STATES.has(record.access) || ![0, 1, 2, 3].includes(record.tier) ||
        !list(record.sourceIds) || !Array.isArray(record.assetIds) ||
        record.assetIds.some(assetId => !id(assetId)) ||
        new Set(record.assetIds).size !== record.assetIds.length ||
        !Array.isArray(record.evidence) || record.silo !== input.silo) {
      add('TEXT', at); continue;
    }
    if (records.has(record.id)) add('DUPLICATE', `${at}.id`);
    if (record.sourceIds.some(sourceId => sources.get(sourceId)?.licence === 'ODbL-1.0' !==
        (input.silo === 'odbl'))) add('SILO', `${at}.sourceIds`);
    for (const sourceId of record.sourceIds) if (!sources.has(sourceId)) add('LINK', `${at}.sourceIds`);
    for (const assetId of record.assetIds) {
      const asset = assets.get(assetId);
      if (!asset || asset.sourceIds.some(sourceId => !record.sourceIds.includes(sourceId))) add('LINK', `${at}.assetIds`);
    }
    const valid = [];
    for (const [j, evidence] of record.evidence.entries()) {
      const where = `${at}.evidence[${j}]`;
      if (!keys(evidence, FIELDS.evidence) || !id(evidence.sourceId) ||
          !FEATURES.has(evidence.feature) || !STATES.has(evidence.access) ||
          ![0, 1, 2, 3].includes(evidence.tier) || evidence.feature !== record.feature ||
          !record.sourceIds.includes(evidence.sourceId) ||
          !safeAge(evidence.observedOn, asOf, input.maxAgeDays)) { add('ACCESS', where); continue; }
      valid.push(evidence);
    }
    const yes = valid.some(e => e.access === 'YES');
    const no = valid.some(e => e.access === 'NO');
    if (yes && no && record.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
    if (record.access !== 'UNKNOWN' && !valid.some(e => e.access === record.access)) add('ACCESS', `${at}.access`);
    if (record.tier === 0 && (record.access !== 'UNKNOWN' || valid.length > 0)) add('TIER', `${at}.tier`);
    if (record.tier === 1 && record.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
    if (record.tier >= 2 && record.access === 'UNKNOWN') add('TIER', `${at}.tier`);
    if (record.tier >= 2 && !valid.some(e => e.access === record.access && e.tier >= record.tier)) add('TIER', `${at}.tier`);
    if (record.tier === 3 && new Set(valid.filter(e => e.access === record.access).map(e => e.sourceId)).size < 2) add('TIER', `${at}.tier`);
    records.set(record.id, record);
  }
  if (findings.length) return block();
  const manifest = {
    schemaVersion: 1,
    asOf: input.asOf,
    silo: input.silo,
    sources: sorted(input.sources).map(source => ({ ...source })),
    assets: sorted(input.assets).map(asset => ({ ...asset, sourceIds: [...asset.sourceIds].sort() })),
    records: sorted(input.records).map(record => ({ ...record,
      sourceIds: [...record.sourceIds].sort(), assetIds: [...record.assetIds].sort(),
      evidence: [...record.evidence].sort((a, b) =>
        a.sourceId.localeCompare(b.sourceId, 'en') || a.observedOn.localeCompare(b.observedOn, 'en')) })),
    totalBytes: size,
  };
  return { ok: true, findings: [], manifest };
}

/** Render findings as stable, copy-ready plain text in English or French. */
export function manifestText(result, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new RangeError('Unsupported locale');
  return [result.ok ? (locale === 'fr' ? 'Contrôle réussi' : 'Check passed') :
    (locale === 'fr' ? 'Paquet bloqué' : 'Package blocked'),
  ...result.findings.map(entry => `${entry.code} ${entry.path}: ${entry[locale]}`)].join('\n') + '\n';
}
