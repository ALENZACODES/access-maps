/** Shared fail-closed primitives for local publication checks. */
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const LICENCES = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'OGL-ON-1.0', 'OGL-Canada-2.0', 'ODbL-1.0']);
export const ACCESS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const DAY_MS = 86400000;
export const LIMITS = Object.freeze({ records: 10000, findings: 10000, bytes: 8 * 1024 * 1024 });

export const WORDS = Object.freeze({
  SHAPE: ['The input has missing or unexpected fields.', 'L’entrée contient des champs manquants ou inattendus.'],
  LIMIT: ['The input exceeds the local size limit.', 'L’entrée dépasse la limite locale.'],
  SOURCE: ['A complete source record is required.', 'Une fiche de source complète est requise.'],
  LICENCE: ['The source licence is missing or is not open.', 'La licence de la source est absente ou n’est pas ouverte.'],
  DATE: ['An observation date is invalid or in the future.', 'Une date d’observation est non valide ou future.'],
  STALE: ['The observation is older than the selected policy.', 'L’observation est plus ancienne que la règle choisie.'],
  HELD: ['This held feed cannot be included.', 'Ce flux retenu ne peut pas être inclus.'],
  SILO: ['ODbL content must remain in its separate export.', 'Les données ODbL doivent rester dans leur exportation distincte.'],
  DUPLICATE: ['An identifier appears more than once.', 'Un identifiant apparaît plusieurs fois.'],
  UNKNOWN: ['Missing access information must stay UNKNOWN.', 'Les renseignements d’accès manquants doivent rester UNKNOWN.'],
  EVIDENCE: ['A known access statement requires matching evidence.', 'Un état d’accès connu exige une observation correspondante.'],
  CONFLICT: ['Conflicting access evidence must remain UNKNOWN.', 'Les observations d’accès contradictoires doivent rester UNKNOWN.'],
  PATH: ['An offline path is invalid or leaves its package.', 'Un chemin hors ligne est invalide ou sort de son paquet.'],
  HASH: ['An asset digest is missing or inconsistent.', 'Une empreinte du fichier est absente ou incohérente.'],
  REFERENCE: ['A referenced record or asset does not exist.', 'Une fiche ou un fichier référencé n’existe pas.'],
  LANGUAGE: ['English and French content must both be present.', 'Les contenus français et anglais doivent tous deux être présents.'],
  TYPOGRAPHY: ['French punctuation must use nonbreaking spaces.', 'La ponctuation française doit employer des espaces insécables.'],
  TARGET: ['An interactive control must be at least 44 pixels.', 'Une commande interactive doit mesurer au moins 44 pixels.'],
  UNSAFE: ['The content contains unsafe markup or personal identifiers.', 'Le contenu comprend du balisage risqué ou des identifiants personnels.'],
  ORDER: ['The change sequence or dates are inconsistent.', 'La suite des modifications ou les dates sont incohérentes.'],
  ROLLBACK: ['A failed update must retain a complete fallback.', 'Une mise à jour échouée doit conserver une version de repli complète.'],
  REMOVAL: ['A removed item needs an explicit reason and replacement state.', 'Un élément retiré exige une raison explicite et un état de remplacement.'],
  DRIFT: ['The released content differs from its declared evidence.', 'Le contenu publié diffère de ses observations déclarées.'],
  CONSENT: ['Private notes cannot enter public export data.', 'Les notes privées ne peuvent pas entrer dans les données publiques.'],
  BYTES: ['The offline package exceeds its declared byte budget.', 'Le paquet hors ligne dépasse son budget déclaré en octets.'],
});

export function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
export function hasExactly(value, required, optional = []) {
  return object(value) && required.every(key => own(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
export function label(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() &&
    value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}
export function identifier(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value) && value.length <= 96;
}
export function safeInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}
export function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / DAY_MS;
}
export function ageWithin(day, asOf, maxAgeDays) {
  const a = calendar(day);
  const b = calendar(asOf);
  return a !== null && b !== null && safeInteger(maxAgeDays, 36500) && a <= b && b - a <= maxAgeDays;
}
export function held(value) {
  return typeof value === 'string' && value.toLowerCase().replace(/[^a-z0-9]/gu, '').includes('miway');
}
export function stamp(value) {
  return hasExactly(value, ['source', 'licence', 'observedOn', 'reference']) &&
    label(value.source) && !held(value.source) && LICENCES.includes(value.licence) &&
    calendar(value.observedOn) !== null && offlinePath(value.reference);
}
export function stampKey(value) {
  return JSON.stringify([value.source, value.licence, value.observedOn, value.reference]);
}
export function sameStamp(a, b) { return stamp(a) && stamp(b) && stampKey(a) === stampKey(b); }
export function siloOf(stamps) { return stamps.some(item => item.licence === 'ODbL-1.0') ? 'odbl' : 'open'; }
export function offlinePath(value) {
  if (!label(value, 512) || value.includes('\\') || value.includes('%') || value.includes('?') || value.includes('#')) return false;
  if (/^(?:\/|[a-z][a-z0-9+.-]*:)/iu.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.includes(':')) &&
    posix.normalize(value) === value;
}
export function digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function privateText(value) {
  return typeof value === 'string' && /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b|\b(?:password|secret|access[_ -]?token|api[_ -]?key)\s*[:=])/iu.test(value);
}
export function unsafeMarkup(value) {
  return typeof value === 'string' && /(?:<\s*\/?\s*(?:script|style|iframe|embed|object|form)\b|\bon[a-z]+\s*=|javascript:|data:text\/html)/iu.test(value);
}
export function frenchType(value) {
  if (typeof value !== 'string' || /[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (c !== undefined && ';!?'.includes(c) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (c === '«' && value[i + 1] !== '\u202f') return false;
    if (c === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
export function bilingual(value, max = 2000) {
  return hasExactly(value, ['en', 'fr']) && label(value.en, max) && label(value.fr, max) &&
    frenchType(value.fr) && !privateText(value.en) && !privateText(value.fr) &&
    !unsafeMarkup(value.en) && !unsafeMarkup(value.fr);
}
export function unique(values) { return new Set(values).size === values.length; }
export function array(value, max = LIMITS.records) { return Array.isArray(value) && value.length <= max ? value : null; }
export function stable(items, key = item => item.id) { return [...items].sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'en')); }
export function makeAudit() {
  const findings = [];
  function add(code, path, severity = 'ERROR') {
    if (!own(WORDS, code)) throw new Error(`Unknown audit diagnostic ${code}`);
    if (findings.length >= LIMITS.findings) return;
    const [en, fr] = WORDS[code];
    findings.push({ code, path, severity, en, fr });
  }
  function finish(summary = {}) {
    const ordered = stable(findings, item => `${item.path}\u0000${item.code}`);
    return { ok: !ordered.some(item => item.severity === 'ERROR'), findings: ordered, summary };
  }
  return { add, finish };
}
export function renderText(report, locale) {
  if (locale !== 'en' && locale !== 'fr') throw new RangeError('Invalid locale');
  const start = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Exportation bloquée') :
    (report.ok ? 'Check passed' : 'Export blocked');
  return [start, ...report.findings.map(item => `${item.severity} ${item.code} ${item.path}: ${item[locale]}`)].join('\n') + '\n';
}
export function validRoot(value, keys) { return hasExactly(value, keys) && value.schemaVersion === 1; }
export function localSize(value) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
export function maxInput(value, audit, path = '$') {
  if (localSize(value) > LIMITS.bytes) { audit.add('LIMIT', path); return false; }
  return true;
}
export function inspectSource(source, audit, path, policy) {
  if (!object(source) || !hasExactly(source, ['source', 'licence', 'observedOn', 'reference'])) {
    audit.add('SOURCE', path); return false;
  }
  let ok = true;
  if (!label(source.source) || !offlinePath(source.reference)) { audit.add('SOURCE', path); ok = false; }
  if (held(source.source)) { audit.add('HELD', path); ok = false; }
  if (!LICENCES.includes(source.licence)) { audit.add('LICENCE', path); ok = false; }
  if (calendar(source.observedOn) === null || calendar(source.observedOn) > calendar(policy.asOf)) {
    audit.add('DATE', path); ok = false;
  } else if (!ageWithin(source.observedOn, policy.asOf, policy.maxAgeDays)) {
    audit.add('STALE', path); ok = false;
  }
  return ok;
}
export function inspectBilingual(value, audit, path, max = 2000) {
  if (!hasExactly(value, ['en', 'fr']) || !label(value.en, max) || !label(value.fr, max)) {
    audit.add('LANGUAGE', path); return false;
  }
  let ok = true;
  if (!frenchType(value.fr)) { audit.add('TYPOGRAPHY', path); ok = false; }
  if ([value.en, value.fr].some(v => privateText(v) || unsafeMarkup(v))) {
    audit.add('UNSAFE', path); ok = false;
  }
  return ok;
}
