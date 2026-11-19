/**
 * P15U — bounded, deterministic, offline transfer audit.
 * No network, timers, filesystem, accounts or export side effects.
 * Asset bytes are caller-supplied. No content is fetched on demand.
 */
import { createHash } from 'node:crypto';

const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const ACCESS = new Set(['YES', 'NO', 'UNKNOWN']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const SILOS = new Set(['open', 'odbl']);
const MAX_ASSETS = 2000;
const MAX_PLACES = 10000;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PART = 4 * 1024 * 1024;
const DAY = 86400000;
const BAD_TEXT = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\b(?:password|token|api[-_]?key)\s*[:=]|\p{Cc}/iu;
const BAD_CONTACT = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu;
const BLOCKED_CLAIM = /\b(?:guaranteed|real[- ]time|garanti|temps réel)\b/iu;
const WORDS = Object.freeze({
  ROOT: ['An input section is missing or malformed.', 'Une section du dossier est absente ou incorrecte.'],
  LIMIT: ['The offline transfer exceeds a configured limit.', 'Le transfert hors ligne dépasse une limite prévue.'],
  DATE: ['A date is missing, invalid, or outside the permitted window.', 'Une date est absente, incorrecte ou hors de la période permise.'],
  SOURCE: ['A source is missing or has invalid attribution.', 'Une source est absente ou son attribution est incorrecte.'],
  LICENCE: ['An unsupported source licence was supplied.', 'Une licence de source non admise a été fournie.'],
  SILO: ['The open and ODbL export groups must remain separate.', 'Les groupes d’exportation libre et ODbL doivent rester séparés.'],
  DUPLICATE: ['A record identifier or path is repeated.', 'Un identifiant ou un chemin est répété.'],
  LABEL: ['English and French descriptions are required and must be safe.', 'Les descriptions anglaises et françaises doivent être présentes et sûres.'],
  PATH: ['An asset path is not a safe local relative path.', 'Le chemin du fichier n’est pas un chemin local relatif sûr.'],
  HASH: ['The asset digest or byte count does not match.', 'L’empreinte ou la taille du fichier ne correspond pas.'],
  PART: ['The asset parts are incomplete, duplicated, or out of order.', 'Les parties du fichier sont incomplètes, répétées ou désordonnées.'],
  ORPHAN: ['A record refers to an unavailable source or asset.', 'Une fiche renvoie à une source ou à un fichier indisponible.'],
  EVIDENCE: ['Dated source evidence does not support the record.', 'L’observation datée ne soutient pas la fiche.'],
  TIER: ['A record tier exceeds its supporting evidence.', 'Le niveau de la fiche dépasse les observations disponibles.'],
  CONFLICT: ['Observations conflict; the access result must remain UNKNOWN.', 'Les observations divergent ; l’état d’accès doit rester UNKNOWN.'],
  POLICY: ['The transfer policy is invalid.', 'La politique de transfert est incorrecte.'],
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value, allowed) {
  return object(value) && Object.keys(value).every(key => allowed.includes(key));
}
function ident(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value) && value.length <= 96;
}
function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= 240 && !BAD_TEXT.test(value) && !BAD_CONTACT.test(value) && !BLOCKED_CLAIM.test(value);
}
function french(value) {
  if (!text(value) || /[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (ch !== undefined && ';!?'.includes(ch) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (ch === '«' && value[i + 1] !== '\u202f') return false;
    if (ch === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const day = new Date(0);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCFullYear(y, m - 1, d);
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return null;
  return day.getTime() / DAY;
}
function path(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !value.startsWith('/') && !value.includes('\\') && !/[?#:%]|\p{Cc}/u.test(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..' &&
      !part.startsWith('.') && part.length <= 100);
}
function hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function byteArray(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function ids(value) {
  return Array.isArray(value) && value.length <= 2000 && value.every(ident) &&
    new Set(value).size === value.length;
}
function sortedFindings(findings) {
  return findings.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
}
function flags(options) {
  if (!keys(options, ['maxBytes', 'maxAgeDays', 'allowEmpty']) ||
      !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > MAX_BYTES ||
      !Number.isSafeInteger(options.maxAgeDays) || options.maxAgeDays < 0 || options.maxAgeDays > 3650 ||
      typeof options.allowEmpty !== 'boolean') return null;
  return options;
}
function sourceIndex(sources, asOf, maxAgeDays, add) {
  const out = new Map();
  sources.forEach((item, i) => {
    const at = `$.sources[${i}]`;
    if (!keys(item, ['id', 'en', 'fr', 'licence', 'observedOn', 'reference']) ||
        !ident(item.id) || !text(item.en) || !french(item.fr) || !path(item.reference)) {
      add('SOURCE', at); return;
    }
    if (out.has(item.id)) add('DUPLICATE', `${at}.id`);
    if (!LICENCES.has(item.licence)) add('LICENCE', `${at}.licence`);
    const on = dateDay(item.observedOn);
    if (on === null || on > asOf || asOf - on > maxAgeDays) add('DATE', `${at}.observedOn`);
    out.set(item.id, { ...item, day: on });
  });
  return out;
}
function assetIndex(assets, sources, asOf, opts, add) {
  const out = new Map();
  const seenPaths = new Set();
  let total = 0;
  assets.forEach((item, i) => {
    const at = `$.assets[${i}]`;
    if (!keys(item, ['id', 'path', 'sourceIds', 'silo', 'sha256', 'bytes', 'parts', 'observedOn']) ||
        !ident(item.id) || !path(item.path) || !ids(item.sourceIds) || item.sourceIds.length === 0 ||
        !SILOS.has(item.silo) || !hex(item.sha256) || !Number.isSafeInteger(item.bytes) ||
        item.bytes < 1 || item.bytes > MAX_BYTES || !Array.isArray(item.parts)) {
      add('ROOT', at); return;
    }
    if (out.has(item.id) || seenPaths.has(item.path)) add('DUPLICATE', `${at}.id`);
    seenPaths.add(item.path);
    const day = dateDay(item.observedOn);
    if (day === null || day > asOf || asOf - day > opts.maxAgeDays) add('DATE', `${at}.observedOn`);
    const refs = item.sourceIds.map(id => sources.get(id));
    if (refs.some(ref => !ref)) add('ORPHAN', `${at}.sourceIds`);
    const odbl = refs.some(ref => ref?.licence === 'ODbL-1.0');
    if ((odbl ? 'odbl' : 'open') !== item.silo) add('SILO', `${at}.silo`);
    const seen = new Set();
    const hasher = createHash('sha256');
    let size = 0;
    if (item.parts.length === 0 || item.parts.length > 1000) add('PART', `${at}.parts`);
    item.parts.forEach((part, j) => {
      const where = `${at}.parts[${j}]`;
      if (!keys(part, ['offset', 'bytes', 'sha256']) || !Number.isSafeInteger(part.offset) ||
          part.offset < 0 || !hex(part.sha256)) { add('PART', where); return; }
      const bytes = byteArray(part.bytes);
      if (!bytes || bytes.byteLength < 1 || bytes.byteLength > MAX_PART) { add('PART', where); return; }
      if (seen.has(part.offset) || part.offset !== size) add('PART', `${where}.offset`);
      seen.add(part.offset);
      if (digest(bytes) !== part.sha256) add('HASH', `${where}.sha256`);
      size += bytes.byteLength;
      if (size > MAX_BYTES) add('LIMIT', where);
      hasher.update(bytes);
    });
    total += item.bytes;
    if (total > opts.maxBytes) add('LIMIT', at);
    if (size !== item.bytes || hasher.digest('hex') !== item.sha256) add('HASH', at);
    out.set(item.id, { id: item.id, path: item.path, bytes: item.bytes, sha256: item.sha256,
      sourceIds: [...item.sourceIds], observedOn: item.observedOn, silo: item.silo });
  });
  return { assets: out, total };
}
function recordIndex(records, sources, assets, asOf, opts, add) {
  const out = new Map();
  records.forEach((item, i) => {
    const at = `$.records[${i}]`;
    if (!keys(item, ['id', 'en', 'fr', 'feature', 'access', 'tier', 'silo', 'observedOn',
      'sourceIds', 'assetIds', 'evidence']) || !ident(item.id) || !text(item.en) ||
        !french(item.fr) || !FEATURES.has(item.feature) || !ACCESS.has(item.access) ||
        ![0, 1, 2, 3].includes(item.tier) || !SILOS.has(item.silo) ||
        !ids(item.sourceIds) || !ids(item.assetIds) || !Array.isArray(item.evidence) ||
        item.evidence.length > 2000) { add('ROOT', at); return; }
    if (out.has(item.id)) add('DUPLICATE', `${at}.id`);
    const day = dateDay(item.observedOn);
    if (day === null || day > asOf || asOf - day > opts.maxAgeDays) add('DATE', `${at}.observedOn`);
    const refs = item.sourceIds.map(id => sources.get(id));
    if (refs.some(ref => !ref)) add('ORPHAN', `${at}.sourceIds`);
    const odbl = refs.some(ref => ref?.licence === 'ODbL-1.0');
    if ((odbl ? 'odbl' : 'open') !== item.silo) add('SILO', `${at}.silo`);
    for (const id of item.assetIds) {
      const asset = assets.get(id);
      if (!asset) add('ORPHAN', `${at}.assetIds`);
      else if (asset.silo !== item.silo || asset.sourceIds.some(key => !item.sourceIds.includes(key))) {
        add('SILO', `${at}.assetIds`);
      }
    }
    const evidence = [];
    const unique = new Set();
    item.evidence.forEach((entry, j) => {
      const atEvidence = `${at}.evidence[${j}]`;
      if (!keys(entry, ['sourceId', 'observedOn', 'feature', 'access', 'tier']) ||
          !ident(entry.sourceId) || !FEATURES.has(entry.feature) || !ACCESS.has(entry.access) ||
          ![0, 1, 2, 3].includes(entry.tier)) { add('EVIDENCE', atEvidence); return; }
      const source = sources.get(entry.sourceId);
      const on = dateDay(entry.observedOn);
      if (!source || !item.sourceIds.includes(entry.sourceId) || entry.feature !== item.feature) {
        add('ORPHAN', atEvidence);
      }
      if (on === null || on > asOf || asOf - on > opts.maxAgeDays ||
          (source?.day !== null && source?.day !== undefined && on !== null && on < source.day)) {
        add('DATE', `${atEvidence}.observedOn`);
      }
      const id = JSON.stringify([entry.sourceId, entry.observedOn, entry.feature, entry.access, entry.tier]);
      if (unique.has(id)) add('DUPLICATE', atEvidence);
      unique.add(id);
      evidence.push(entry);
    });
    const yes = evidence.filter(entry => entry.access === 'YES');
    const no = evidence.filter(entry => entry.access === 'NO');
    if (yes.length && no.length && item.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
    if (item.tier === 0 && (item.access !== 'UNKNOWN' || evidence.length > 0)) add('TIER', `${at}.tier`);
    if (item.tier === 1 && item.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
    const matching = evidence.filter(entry => entry.access === item.access && entry.tier >= item.tier);
    if (item.access !== 'UNKNOWN' && (matching.length === 0 || item.tier < 2)) add('EVIDENCE', `${at}.access`);
    if (item.tier === 3 && item.access !== 'UNKNOWN' &&
        new Set(matching.map(entry => entry.sourceId)).size < 2) add('TIER', `${at}.tier`);
    out.set(item.id, { id: item.id, en: item.en, fr: item.fr, feature: item.feature,
      access: item.access, tier: item.tier, silo: item.silo, observedOn: item.observedOn,
      sourceIds: [...item.sourceIds], assetIds: [...item.assetIds] });
  });
  return out;
}
function renderReport(findings, total) {
  return Object.freeze({ ok: findings.length === 0, findings: sortedFindings(findings), totalBytes: total });
}
/**
 * Fail closed; only a fully accepted bundle receives a materialized inventory.
 * Parts must be supplied in exact byte order with one digest per part.
 */
export function auditOfflineTransfer(input, policy = { maxBytes: MAX_BYTES, maxAgeDays: 90, allowEmpty: false }) {
  const findings = [];
  const add = (code, pathValue) => {
    const [en, fr] = WORDS[code];
    findings.push({ code, path: pathValue, en, fr });
  };
  const opts = flags(policy);
  if (!opts) { add('POLICY', '$.policy'); return renderReport(findings, 0); }
  if (!keys(input, ['asOf', 'sources', 'assets', 'records']) ||
      !Array.isArray(input.sources) || !Array.isArray(input.assets) || !Array.isArray(input.records) ||
      input.sources.length > MAX_ASSETS || input.assets.length > MAX_ASSETS ||
      input.records.length > MAX_PLACES) {
    add('ROOT', '$'); return renderReport(findings, 0);
  }
  const asOf = dateDay(input.asOf);
  if (asOf === null) { add('DATE', '$.asOf'); return renderReport(findings, 0); }
  if (!opts.allowEmpty && (input.sources.length === 0 || input.assets.length === 0 || input.records.length === 0)) {
    add('ROOT', '$'); return renderReport(findings, 0);
  }
  const sources = sourceIndex(input.sources, asOf, opts.maxAgeDays, add);
  const result = assetIndex(input.assets, sources, asOf, opts, add);
  const records = recordIndex(input.records, sources, result.assets, asOf, opts, add);
  const report = renderReport(findings, result.total);
  if (!report.ok) return report;
  return Object.freeze({ ...report, inventory: Object.freeze({
    asOf: input.asOf,
    sources: [...sources.values()].map(({ day, ...source }) => source).sort((a, b) => a.id.localeCompare(b.id, 'en')),
    assets: [...result.assets.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    records: [...records.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
  }) });
}
/** Localized diagnostic only. No data or personal information is echoed. */
export function transferDiagnostic(report, locale = 'en') {
  if (!object(report) || typeof report.ok !== 'boolean' || !Array.isArray(report.findings) ||
      !['en', 'fr'].includes(locale)) throw new TypeError('Invalid report or locale');
  const heading = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Transfert bloqué') :
    (report.ok ? 'Check passed' : 'Transfer blocked');
  return [heading, ...report.findings.map(finding =>
    `${finding.code} ${finding.path}: ${finding[locale]}`)].join('\n') + '\n';
}
