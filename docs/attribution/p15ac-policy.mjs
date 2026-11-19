/** Policy and source-window controls for local Ontario route evidence review. */
import { dayNumber, diagnostic, orderIssues } from './p15v-ontario-model.mjs';

export const REVIEW_LIMITS = Object.freeze({
  sources: 5000,
  records: 60000,
  observations: 150000,
  routes: 20,
  segments: 500,
  maxAgeDays: 3650,
  maxDistanceMetres: 1_000_000,
  maxFindings: 12000,
});
export const ACCESS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const OPEN_LICENCES = Object.freeze([
  'CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0',
]);
export const FEATURES = Object.freeze([
  'entrance', 'lift', 'washroom', 'parking', 'path', 'seating', 'crossing',
  'curb-cut', 'platform', 'door', 'ramp', 'surface', 'gradient', 'outage',
]);
const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;
const forbiddenMarkup = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu;
const forbiddenPrivate = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|api[-_]?key)\s*[:=]/iu;
const unsupportedCopy = /\b(?:guaranteed|real[- ]time|partnership|guarantee|garanti|temps réel|partenariat)\b/iu;
export const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
export const isId = (x) => typeof x === 'string' && x.length <= 96 && ID.test(x);
export const isDate = (x) => dayNumber(x) !== null;
export const sortId = (a, b) => a.localeCompare(b, 'en');
export const uniqueSorted = (values) => [...new Set(values)].sort(sortId);

export function frenchSpacing(text) {
  if (typeof text !== 'string') return false;
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(text)) return false;
  for (let index = 0; index < text.length; index++) {
    const mark = text[index];
    if (mark === ':' && index > 0 && text[index - 1] !== '\u00a0') return false;
    if (';!?'.includes(mark) && index > 0 && text[index - 1] !== '\u202f') return false;
    if (mark === '«' && text[index + 1] !== '\u202f') return false;
    if (mark === '»' && text[index - 1] !== '\u202f') return false;
  }
  return true;
}

export function safeCopy(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 ||
      value.length > 320 || /\p{Cc}/u.test(value)) return false;
  return !forbiddenMarkup.test(value) && !forbiddenPrivate.test(value) &&
    !unsupportedCopy.test(value);
}

export function safeBilingual(value) {
  return isRecord(value) && Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'en') && Object.hasOwn(value, 'fr') &&
    safeCopy(value.en) && safeCopy(value.fr) && frenchSpacing(value.fr);
}

export function isoDateWithin(value, asOf, maxAgeDays) {
  const current = dayNumber(asOf);
  const observed = dayNumber(value);
  return current !== null && observed !== null && observed <= current &&
    current - observed <= maxAgeDays;
}

/** Strict mode rejects unexpected knobs rather than quietly ignoring them. */
export function normaliseReviewPolicy(input, asOf) {
  const issues = [];
  const add = (code, path) => issues.push(diagnostic(code, path));
  const fail = () => Object.freeze({ ok: false, value: null, issues: orderIssues(issues) });
  if (!isDate(asOf) || !isRecord(input)) {
    add('ROOT', '$.reviewPolicy');
    return fail();
  }
  const keys = ['asOf', 'silo', 'maxAgeDays', 'minimumTier', 'allowUnknown',
    'maximumDistanceMetres', 'maximumHops', 'alternatives', 'avoidFeatures',
    'requireIndependentSources', 'includeReturn', 'maxFindings'];
  if (Object.keys(input).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(input, key))) {
    add('ROOT', '$.reviewPolicy.fields');
    return fail();
  }
  if (input.asOf !== asOf || (input.silo !== 'open' && input.silo !== 'odbl') ||
      !Number.isSafeInteger(input.maxAgeDays) || input.maxAgeDays < 0 ||
      input.maxAgeDays > REVIEW_LIMITS.maxAgeDays) add('ROOT', '$.reviewPolicy.window');
  if (!Number.isInteger(input.minimumTier) || input.minimumTier < 0 || input.minimumTier > 3 ||
      typeof input.allowUnknown !== 'boolean' || typeof input.requireIndependentSources !== 'boolean' ||
      typeof input.includeReturn !== 'boolean') add('ROOT', '$.reviewPolicy.flags');
  if (!Number.isSafeInteger(input.maximumDistanceMetres) || input.maximumDistanceMetres <= 0 ||
      input.maximumDistanceMetres > REVIEW_LIMITS.maxDistanceMetres ||
      !Number.isSafeInteger(input.maximumHops) || input.maximumHops < 1 || input.maximumHops > 500 ||
      !Number.isSafeInteger(input.alternatives) || input.alternatives < 1 ||
      input.alternatives > 5) add('LIMIT', '$.reviewPolicy.route');
  if (!Number.isSafeInteger(input.maxFindings) || input.maxFindings < 1 ||
      input.maxFindings > REVIEW_LIMITS.maxFindings) add('LIMIT', '$.reviewPolicy.maxFindings');
  if (!Array.isArray(input.avoidFeatures) || input.avoidFeatures.length > FEATURES.length ||
      !input.avoidFeatures.every((v) => FEATURES.includes(v)) ||
      new Set(input.avoidFeatures).size !== input.avoidFeatures.length) {
    add('ROOT', '$.reviewPolicy.avoidFeatures');
  }
  if (issues.length) return fail();
  return Object.freeze({ ok: true, value: Object.freeze({
    ...input, avoidFeatures: Object.freeze([...input.avoidFeatures].sort(sortId)),
  }), issues: Object.freeze([]) });
}

export function defaultReviewPolicy(asOf, changes = {}) {
  return {
    asOf, silo: 'open', maxAgeDays: 90, minimumTier: 2,
    allowUnknown: true, maximumDistanceMetres: 25000, maximumHops: 30,
    alternatives: 3, avoidFeatures: [], requireIndependentSources: false,
    includeReturn: true, maxFindings: 2000, ...changes,
  };
}

export function sourceView(source, asOf, maxAgeDays) {
  if (!isRecord(source) || !isId(source.id) || !OPEN_LICENCES.includes(source.licence) ||
      !safeBilingual(source.name) || !isDate(source.observedOn)) return null;
  const ageDays = dayNumber(asOf) - dayNumber(source.observedOn);
  return Object.freeze({
    id: source.id,
    name: Object.freeze({ en: source.name.en, fr: source.name.fr }),
    licence: source.licence,
    observedOn: source.observedOn,
    silo: source.silo,
    ageDays,
    current: ageDays >= 0 && ageDays <= maxAgeDays,
    reference: source.reference,
  });
}

export function stableFindings(findings, limit = REVIEW_LIMITS.maxFindings) {
  const seen = new Set();
  const result = [];
  for (const entry of findings) {
    const key = `${entry.code}|${entry.path}|${entry.en}|${entry.fr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  result.sort((a, b) => sortId(a.path, b.path) || sortId(a.code, b.code));
  if (result.length > limit) return null;
  return Object.freeze(result.map((item) => Object.freeze({ ...item })));
}

export function boundedSourceIndex(snapshot, policy) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.sources) ||
      snapshot.sources.length > REVIEW_LIMITS.sources) return null;
  const map = new Map();
  for (const raw of snapshot.sources) {
    const value = sourceView(raw, policy.asOf, policy.maxAgeDays);
    if (!value || map.has(value.id)) return null;
    map.set(value.id, value);
  }
  return map;
}

export function assessDate(value, source, policy) {
  if (!source || !isoDateWithin(value, policy.asOf, policy.maxAgeDays)) return 'UNKNOWN';
  const observed = dayNumber(value);
  const sourceDate = dayNumber(source.observedOn);
  if (observed === null || sourceDate === null || observed < sourceDate) return 'UNKNOWN';
  return source.current ? 'CURRENT' : 'UNKNOWN';
}

export function selectLocale(locale) {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Locale must be en or fr');
  return locale;
}

export const REVIEW_COPY = Object.freeze({
  en: Object.freeze({
    heading: 'Route evidence coverage',
    summary: 'Source dates and observations for routes in this offline snapshot.',
    unknown: 'UNKNOWN',
    dated: 'Observation date',
    source: 'Source',
    licence: 'Licence',
    gaps: 'Information to check',
    blocked: 'Review blocked by incomplete data.',
    ready: 'Report assembled from supplied offline records.',
    conflict: 'Conflicting observations leave access UNKNOWN.',
    controls: 'Route evidence controls',
    showAll: 'Show all segments',
    showGaps: 'Show information gaps',
    outbound: 'Outbound',
    return: 'Return',
    noRoutes: 'No supported route was found in the supplied snapshot.',
    alternative: 'Route option',
    notes: 'This report does not determine whether a route suits a person.',
  }),
  fr: Object.freeze({
    heading: 'Couverture des observations du parcours',
    summary: 'Dates et observations des sources pour les parcours dans les données hors ligne.',
    unknown: 'UNKNOWN',
    dated: 'Date de l’observation',
    source: 'Source',
    licence: 'Licence',
    gaps: 'Renseignements à contrôler',
    blocked: 'Contrôle bloqué par des données incomplètes.',
    ready: 'Rapport assemblé à partir des fiches hors ligne fournies.',
    conflict: 'Des observations contradictoires laissent l’accès UNKNOWN.',
    controls: 'Commandes des observations du parcours',
    showAll: 'Afficher tous les segments',
    showGaps: 'Afficher les renseignements manquants',
    outbound: 'Aller',
    return: 'Retour',
    noRoutes: 'Aucun parcours soutenu par les données fournies.',
    alternative: 'Option de parcours',
    notes: 'Ce rapport ne détermine pas si un parcours convient à une personne.',
  }),
});

export function reviewCopy(locale) {
  return REVIEW_COPY[selectLocale(locale)];
}
