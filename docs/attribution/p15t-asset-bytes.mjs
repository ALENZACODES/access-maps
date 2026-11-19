/**
 * P15T offline asset byte gate.
 *
 * Every expected asset is accounted for by content, not just by metadata.
 * This module does not open files, fetch data, publish results, or persist state.
 * The caller supplies a bounded in-memory collection of bytes and a manifest.
 * The output is a deterministic, bilingual diagnostic report with no raw bytes.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const SILOS = new Set(['open', 'odbl']);
const HEX_SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const UNSAFE_COPY = /\p{Cc}|<\s*\/?\s*[a-z]|(?:javascript|data)\s*:/iu;
const PRIVATE_COPY = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|api[-_]?key)\s*[:=]/iu;
const CLAIMS = /\b(?:guaranteed|real[- ]time|approved|certified|garanti|temps réel|certifié)\b/iu;
const MAX_ASSETS = 2048;
const MAX_SOURCES = 2048;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_FINDINGS = 5000;

const MESSAGES = Object.freeze({
  ROOT: ['The offline inventory has an invalid structure.', 'La structure de l’inventaire hors ligne est invalide.'],
  SOURCE: ['A source entry is incomplete.', 'Une entrée de source est incomplète.'],
  LICENCE: ['A source licence is not permitted.', 'Une licence de source n’est pas autorisée.'],
  DATE: ['A source observation date is invalid.', 'Une date d’observation de source est invalide.'],
  FUTURE: ['A source observation date is later than the inventory date.', 'Une date d’observation de source dépasse la date de l’inventaire.'],
  STALE: ['A source observation is outside its age window.', 'Une observation de source dépasse sa période de validité.'],
  TEXT: ['A bilingual description is missing or unsafe.', 'Une description bilingue est absente ou non sûre.'],
  PATH: ['An offline asset path is not local and safe.', 'Le chemin d’un fichier hors ligne n’est pas local et sûr.'],
  DUPLICATE: ['An identifier or path is repeated.', 'Un identifiant ou un chemin est répété.'],
  LIMIT: ['The inventory exceeds a safety limit.', 'L’inventaire dépasse une limite de sécurité.'],
  ASSET: ['An asset declaration is incomplete.', 'Une déclaration de fichier est incomplète.'],
  SOURCE_LINK: ['An asset references an unavailable source.', 'Un fichier renvoie à une source indisponible.'],
  SILO: ['An asset is assigned to the wrong licence export.', 'Un fichier est affecté à la mauvaise exportation de licence.'],
  MISSING: ['An expected offline asset has no supplied bytes.', 'Les octets d’un fichier hors ligne attendu sont absents.'],
  EXTRA: ['Bytes were supplied for an undeclared offline asset.', 'Des octets ont été fournis pour un fichier hors ligne non déclaré.'],
  BYTE_TYPE: ['An offline asset is not a byte array.', 'Un fichier hors ligne n’est pas un tableau d’octets.'],
  SIZE: ['An offline asset byte length does not match its declaration.', 'La taille d’un fichier hors ligne ne correspond pas à sa déclaration.'],
  DIGEST: ['An offline asset digest does not match its bytes.', 'L’empreinte d’un fichier hors ligne ne correspond pas à ses octets.'],
  POLICY: ['The inventory policy is invalid.', 'La politique de l’inventaire est invalide.'],
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hasExactly(value, expected) {
  return object(value) && Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key));
}
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 96 && ID.test(value);
}
function dateNumber(value) {
  if (typeof value !== 'string') return null;
  const found = DAY.exec(value);
  if (!found) return null;
  const year = Number(found[1]);
  const month = Number(found[2]);
  const day = Number(found[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day) return null;
  return parsed.getTime() / 86_400_000;
}
function safeCopy(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 280 &&
    value.trim() === value && !UNSAFE_COPY.test(value) && !PRIVATE_COPY.test(value) &&
    !CLAIMS.test(value);
}
function goodFrench(value) {
  if (!safeCopy(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (c !== undefined && ';!?'.includes(c) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (c === '«' && value[i + 1] !== '\u202f') return false;
    if (c === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function localPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512 ||
      path.startsWith('/') || path.includes('\\') || /[\p{Cc}%?#:]/u.test(path)) return false;
  const parts = path.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..' &&
    !part.startsWith('.') && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(part));
}
function goodSource(value) {
  return hasExactly(value, ['id', 'name', 'licence', 'observedOn', 'reference']) &&
    identifier(value.id) && safeCopy(value.name) && localPath(value.reference);
}
function goodAsset(value) {
  return hasExactly(value, ['id', 'path', 'en', 'fr', 'sha256', 'bytes', 'sourceIds', 'silo']) &&
    identifier(value.id) && safeCopy(value.en) && goodFrench(value.fr) &&
    typeof value.sha256 === 'string' && HEX_SHA256.test(value.sha256) &&
    Number.isSafeInteger(value.bytes) && value.bytes > 0 &&
    Array.isArray(value.sourceIds) && value.sourceIds.length > 0 &&
    value.sourceIds.length <= MAX_SOURCES && value.sourceIds.every(identifier) &&
    new Set(value.sourceIds).size === value.sourceIds.length && SILOS.has(value.silo);
}
function boundedPolicy(value) {
  return hasExactly(value, ['maxAssetBytes', 'maxTotalBytes', 'maxAgeDays']) &&
    Number.isSafeInteger(value.maxAssetBytes) && value.maxAssetBytes > 0 &&
    value.maxAssetBytes <= MAX_ASSET_BYTES && Number.isSafeInteger(value.maxTotalBytes) &&
    value.maxTotalBytes > 0 && value.maxTotalBytes <= MAX_TOTAL_BYTES &&
    Number.isSafeInteger(value.maxAgeDays) && value.maxAgeDays >= 0 && value.maxAgeDays <= 3650;
}
const DEFAULT_POLICY = Object.freeze({
  maxAssetBytes: MAX_ASSET_BYTES,
  maxTotalBytes: MAX_TOTAL_BYTES,
  maxAgeDays: 365,
});
function bytesView(value) {
  // Copies the caller's bytes only after all allocation limits have been checked.
  if (value instanceof Uint8Array && !ArrayBuffer.isView(value.buffer)) return value;
  if (value instanceof Uint8Array) return value;
  return null;
}
function equalDigest(actual, declared) {
  const computed = Buffer.from(actual, 'hex');
  const expected = Buffer.from(declared, 'hex');
  return computed.length === 32 && expected.length === 32 && timingSafeEqual(computed, expected);
}

/**
 * Check a complete inventory of caller-provided offline bytes.
 *
 * inventory: { schemaVersion: 1, asOf, sources, assets }
 * bytes: Map of asset ID to Uint8Array (Buffer is accepted)
 * policy: strict numeric resource bounds
 *
 * No result ever contains raw payload bytes, secret material, or an upload URL.
 * The caller must not publish an inventory when ok is false.
 */
export function auditOfflineAssetBytes(inventory, bytes, policy = DEFAULT_POLICY) {
  const findings = [];
  const summary = { sources: 0, assets: 0, matched: 0, declaredBytes: 0, suppliedBytes: 0 };
  function add(code, path) {
    if (findings.length >= MAX_FINDINGS) return;
    const [en, fr] = MESSAGES[code];
    findings.push({ code, path, en, fr });
  }
  function finish() {
    const ordered = [...findings].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
      a.code.localeCompare(b.code, 'en'));
    return { ok: ordered.length === 0, findings: ordered, summary: { ...summary } };
  }
  if (!boundedPolicy(policy)) { add('POLICY', '$.policy'); return finish(); }
  if (!hasExactly(inventory, ['schemaVersion', 'asOf', 'sources', 'assets']) ||
      inventory.schemaVersion !== 1 || !Array.isArray(inventory.sources) ||
      !Array.isArray(inventory.assets) || !(bytes instanceof Map)) {
    add('ROOT', '$'); return finish();
  }
  const asOf = dateNumber(inventory.asOf);
  if (asOf === null) { add('DATE', '$.asOf'); return finish(); }
  if (inventory.sources.length > MAX_SOURCES || inventory.assets.length > MAX_ASSETS ||
      bytes.size > MAX_ASSETS) { add('LIMIT', '$'); return finish(); }
  summary.sources = inventory.sources.length;
  summary.assets = inventory.assets.length;
  const sources = new Map();
  for (let i = 0; i < inventory.sources.length; i++) {
    const source = inventory.sources[i];
    const where = `$.sources[${i}]`;
    if (!goodSource(source)) { add('SOURCE', where); continue; }
    if (sources.has(source.id)) add('DUPLICATE', `${where}.id`);
    if (!LICENCES.has(source.licence)) add('LICENCE', `${where}.licence`);
    const observed = dateNumber(source.observedOn);
    if (observed === null) add('DATE', `${where}.observedOn`);
    else if (observed > asOf) add('FUTURE', `${where}.observedOn`);
    else if (asOf - observed > policy.maxAgeDays) add('STALE', `${where}.observedOn`);
    sources.set(source.id, source);
  }
  const ids = new Set();
  const paths = new Set();
  const declared = new Set();
  for (let i = 0; i < inventory.assets.length; i++) {
    const asset = inventory.assets[i];
    const where = `$.assets[${i}]`;
    if (!goodAsset(asset)) { add('ASSET', where); continue; }
    if (ids.has(asset.id)) add('DUPLICATE', `${where}.id`);
    if (paths.has(asset.path)) add('DUPLICATE', `${where}.path`);
    ids.add(asset.id);
    paths.add(asset.path);
    declared.add(asset.id);
    if (!localPath(asset.path)) add('PATH', `${where}.path`);
    const linked = asset.sourceIds.map((id) => sources.get(id));
    if (linked.some((value) => !value)) add('SOURCE_LINK', `${where}.sourceIds`);
    const needsOdbl = linked.some((value) => value?.licence === 'ODbL-1.0');
    if (asset.silo !== (needsOdbl ? 'odbl' : 'open')) add('SILO', `${where}.silo`);
    if (asset.bytes > policy.maxAssetBytes) add('LIMIT', `${where}.bytes`);
    summary.declaredBytes += asset.bytes;
    if (summary.declaredBytes > policy.maxTotalBytes) add('LIMIT', '$.assets');
    if (!bytes.has(asset.id)) { add('MISSING', `${where}.bytes`); continue; }
    const input = bytesView(bytes.get(asset.id));
    if (!input) { add('BYTE_TYPE', `${where}.bytes`); continue; }
    if (input.byteLength > policy.maxAssetBytes) { add('LIMIT', `${where}.bytes`); continue; }
    summary.suppliedBytes += input.byteLength;
    if (summary.suppliedBytes > policy.maxTotalBytes) { add('LIMIT', '$.bytes'); continue; }
    if (input.byteLength !== asset.bytes) { add('SIZE', `${where}.bytes`); continue; }
    const digest = createHash('sha256').update(input).digest('hex');
    if (!equalDigest(digest, asset.sha256)) { add('DIGEST', `${where}.sha256`); continue; }
    summary.matched += 1;
  }
  for (const [id, value] of bytes) {
    if (!identifier(id) || !declared.has(id)) { add('EXTRA', '$.bytes'); continue; }
    if (!bytesView(value)) add('BYTE_TYPE', '$.bytes');
  }
  if (summary.declaredBytes > policy.maxTotalBytes) add('LIMIT', '$.assets');
  return finish();
}

export function assetByteReportText(report, locale = 'en') {
  if (!object(report) || typeof report.ok !== 'boolean' || !Array.isArray(report.findings) ||
      (locale !== 'en' && locale !== 'fr')) throw new TypeError('Invalid report or locale');
  const title = locale === 'fr'
    ? (report.ok ? 'Contrôle des fichiers réussi' : 'Contrôle des fichiers bloqué')
    : (report.ok ? 'Asset check passed' : 'Asset check blocked');
  return `${[title, ...report.findings.map((entry) => `${entry.code} ${entry.path}: ${entry[locale]}`)].join('\n')}\n`;
}
