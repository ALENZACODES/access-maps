/** P15AA: contracts for local Ontario accessibility evidence review. */
import { createHash } from 'node:crypto';
import { dayNumber, french, localPath } from './p15v-ontario-model.mjs';

export const LICENCES = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
export const FEATURES = Object.freeze(['entrance', 'lift', 'washroom', 'parking', 'path', 'seating', 'crossing', 'curb-cut', 'platform', 'door', 'ramp', 'surface', 'gradient', 'outage']);
export const ACCESS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const KINDS = Object.freeze(['municipal', 'operator', 'survey', 'community', 'open-map']);
export const ROLES = Object.freeze(['observer', 'maintainer', 'editor', 'operator']);
export const LIMITS = Object.freeze({ sources: 5000, observations: 30000, features: 20000, decisions: 20000, aliases: 20000, notes: 250 });
export const SORT = (a, b) => a.localeCompare(b, 'en');
const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;
const TEXT_UNSAFE = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=|\p{Cc}/iu;
const PERSONAL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|secret|token|private[-_]?key|api[-_]?key)\s*[:=]/iu;
const OVERCLAIM = /\b(?:guaranteed|real[- ]time|partnership|garanti|temps réel|partenariat)\b/iu;
const URI = /^(?:https?:|file:|ftp:|data:|javascript:)/iu;

export const PHRASES = Object.freeze({
  ROOT: ['The evidence package has an invalid structure.', 'Le paquet d’observations a une structure invalide.'],
  DATE: ['The evidence date is invalid.', 'La date de l’observation est invalide.'],
  LIMIT: ['The package exceeds safe processing limits.', 'Le paquet dépasse les limites de traitement permises.'],
  SOURCE: ['Source metadata is incomplete.', 'Les renseignements de source sont incomplets.'],
  OBSERVATION: ['The observation is incomplete.', 'L’observation est incomplète.'],
  FEATURE: ['The accessibility feature is incomplete.', 'L’élément d’accessibilité est incomplet.'],
  REFERENCE: ['A linked record is missing.', 'Une fiche liée est absente.'],
  DUPLICATE: ['The record identifier is repeated.', 'L’identifiant de la fiche est répété.'],
  LICENCE: ['Only allowed open licences may be used.', 'Seules les licences ouvertes autorisées sont admises.'],
  SILO: ['Licence groups must remain separate.', 'Les groupes de licences doivent demeurer séparés.'],
  AGE: ['An observation is outside its allowed date window.', 'Une observation est hors de sa période permise.'],
  FUTURE: ['A future observation cannot be treated as current.', 'Une observation future ne peut pas être traitée comme actuelle.'],
  CLAIM: ['An access statement requires matching dated evidence.', 'Un état d’accès exige une observation datée correspondante.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Des observations contradictoires exigent UNKNOWN.'],
  TIER: ['The stated evidence tier is unsupported.', 'Le niveau déclaré des observations n’est pas soutenu.'],
  INDEPENDENCE: ['The requested confidence requires independent sources.', 'Le niveau demandé exige des sources indépendantes.'],
  TEXT: ['The bilingual label is missing or unsafe.', 'Le libellé bilingue est absent ou non sûr.'],
  TYPOGRAPHY: ['French punctuation requires nonbreaking spacing.', 'La ponctuation française exige des espaces insécables.'],
  PATH: ['The offline reference is not a safe relative path.', 'La référence hors ligne n’est pas un chemin relatif sûr.'],
  HOLD: ['This source is not available for publication.', 'Cette source n’est pas disponible pour publication.'],
  UNKNOWN: ['An unknown access value must remain UNKNOWN.', 'Un état d’accès inconnu doit rester UNKNOWN.'],
  POLICY: ['The review policy is invalid.', 'La politique de contrôle est invalide.'],
  REMOVAL: ['A record removal needs explicit authorization.', 'Un retrait de fiche exige une autorisation explicite.'],
  UNMATCHED: ['A removal authorization does not match a removal.', 'Une autorisation ne correspond à aucun retrait.'],
  ROUTE: ['A route contains unsupported or missing evidence.', 'Un parcours contient des observations absentes ou non soutenues.'],
  ASSET: ['An offline asset is incomplete.', 'Un fichier hors ligne est incomplet.'],
  HASH: ['The supplied asset bytes do not match their digest.', 'Les octets du fichier ne correspondent pas à son empreinte.'],
  TIME: ['The report time cannot precede source observations.', 'La date du rapport ne peut pas précéder les observations.'],
  TRANSITION: ['The state change is unsupported by new evidence.', 'Le changement d’état n’est pas soutenu par de nouvelles observations.'],
  ROLLBACK: ['Evidence history cannot move backwards.', 'L’historique des observations ne peut pas reculer.'],
  EMPTY: ['No evidence supports this proposed assertion.', 'Aucune observation ne soutient cette déclaration.'],
  WINDOW: ['The time window is invalid.', 'La période indiquée est invalide.'],
  IDENTITY: ['The source identity changed under the same identifier.', 'L’identité de la source a changé sous le même identifiant.'],
  ALIAS: ['An alias is ambiguous or invalid.', 'Un alias est ambigu ou non valide.'],
  PRIVACY: ['Personal or restricted content is not allowed.', 'Les renseignements personnels ou restreints sont interdits.'],
  MANIFEST: ['A complete manifest is required.', 'Un manifeste complet est obligatoire.'],
});

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function hasKeys(value, required, optional = []) {
  return isObject(value) && required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
export function isId(value) {
  return typeof value === 'string' && value.length <= 96 && ID.test(value);
}
export function isDate(value) {
  return dayNumber(value) !== null;
}
export function dateDistance(earlier, later) {
  const a = dayNumber(earlier);
  const b = dayNumber(later);
  return a === null || b === null ? null : b - a;
}
export function isText(value, max = 280) {
  return typeof value === 'string' && value.length > 0 && value.length <= max &&
    value === value.trim() && !TEXT_UNSAFE.test(value) && !PERSONAL.test(value) &&
    !OVERCLAIM.test(value) && !URI.test(value);
}
export function isBilingual(value) {
  return hasKeys(value, ['en', 'fr']) && isText(value.en) && isText(value.fr) && french(value.fr);
}
export function isLicence(value) {
  return LICENCES.includes(value);
}
export function licenceSilo(value) {
  return value === 'ODbL-1.0' ? 'odbl' : 'open';
}
export function isSilo(value) {
  return value === 'open' || value === 'odbl';
}
export function isAccess(value) {
  return ACCESS.includes(value);
}
export function isFeature(value) {
  return FEATURES.includes(value);
}
export function isTier(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}
export function isSafePath(value) {
  return localPath(value) && !URI.test(value) && value.split('/').every((part) => !part.startsWith('.'));
}
export function isUniqueIds(list, max = 5000) {
  return Array.isArray(list) && list.length <= max && list.every(isId) &&
    new Set(list).size === list.length;
}
export function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
export function checksum(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Uint8Array required');
  return createHash('sha256').update(bytes).digest('hex');
}
export function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}
export function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort(SORT).map((key) => [key, stableObject(value[key])]));
}
export function stableDigest(value) {
  return checksum(jsonBytes(stableObject(value)));
}
export function diagnostic(code, path, details = null) {
  const phrases = PHRASES[code] ?? PHRASES.ROOT;
  return Object.freeze({ code, path, en: phrases[0], fr: phrases[1], details });
}
export function sortedIssues(issues) {
  return Object.freeze([...issues].sort((a, b) => SORT(a.path, b.path) || SORT(a.code, b.code)));
}
export function blocked(issues, summary = {}) {
  return Object.freeze({ ok: false, issues: sortedIssues(issues), value: null, summary: Object.freeze({ ...summary }) });
}
export function accepted(value, summary = {}) {
  return Object.freeze({ ok: true, issues: Object.freeze([]), value: Object.freeze(value), summary: Object.freeze({ ...summary }) });
}
export function requireKeys(record, required, path, report, optional = []) {
  if (!hasKeys(record, required, optional)) {
    report.push(diagnostic('ROOT', path));
    return false;
  }
  return true;
}
export function indexUnique(items, kind, add) {
  const result = new Map();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isObject(item) || !isId(item.id)) {
      add(kind, `${kind.toLowerCase()}[${i}]`);
      continue;
    }
    if (result.has(item.id)) add('DUPLICATE', `${kind.toLowerCase()}[${i}].id`);
    else result.set(item.id, item);
  }
  return result;
}
export function validateTimeWindow(value, asOf, maxAge) {
  const delta = dateDistance(value, asOf);
  return delta !== null && delta >= 0 && delta <= maxAge;
}
export function normalizeWord(value) {
  return value.normalize('NFC').toLocaleLowerCase('en').trim().replace(/\s+/gu, ' ');
}
export function containsRestrictedText(value) {
  return typeof value === 'string' && (TEXT_UNSAFE.test(value) || PERSONAL.test(value) || OVERCLAIM.test(value));
}
export function independentSources(observations, bySource) {
  const groups = new Set();
  for (const row of observations) {
    const source = bySource.get(row.sourceId);
    if (source) groups.add(source.independenceGroup);
  }
  return groups.size;
}
export function makeReport(ok, issues, result, counters) {
  return Object.freeze({
    ok,
    issues: sortedIssues(issues),
    result: ok ? Object.freeze(result) : null,
    counters: Object.freeze({ ...counters }),
  });
}
export function ensureLimit(rows, max, code, path, add) {
  if (!Array.isArray(rows) || rows.length > max) {
    add(code, path);
    return false;
  }
  return true;
}
export function validateNames(name, path, add) {
  if (!isBilingual(name)) {
    add('TEXT', path);
    return false;
  }
  return true;
}
export function compareDates(a, b) {
  const first = dayNumber(a);
  const second = dayNumber(b);
  return first === null || second === null ? null : Math.sign(first - second);
}
export function compactIssueText(report, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Locale must be en or fr');
  const header = report.ok ?
    (locale === 'fr' ? 'Contrôle réussi' : 'Check passed') :
    (locale === 'fr' ? 'Contrôle bloqué' : 'Check blocked');
  return [header, ...report.issues.map((issue) => `${issue.code} ${issue.path}: ${issue[locale]}`)].join('\n') + '\n';
}
