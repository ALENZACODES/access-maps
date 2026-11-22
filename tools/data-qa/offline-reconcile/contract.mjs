/** Deterministic, offline-only input contract for the reconciliation workbench. */
export const LICENCES = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'OGL-ON-1.0', 'OGL-Canada-2.0', 'ODbL-1.0']);
export const STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const FEATURES = Object.freeze(['entrance', 'washroom', 'parking', 'lift', 'path', 'surface', 'gradient', 'boarding']);
export const ACTIONS = Object.freeze(['OBSERVE', 'CORRECT', 'WITHDRAW']);
export const MAX_RECORDS = 3000;
export const MAX_SOURCES = 1000;
export const MAX_TEXT = 480;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const BLOCKED = /mi[\s._-]*way|miway/iu;
const PRIVATE = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\b(?:api.?key|authorization|password|secret|token)\s*[:=])/iu;
const MARKUP = /<\s*\/?\s*(?:script|iframe|object|embed|form|style|svg)\b|\bon\w+\s*=|javascript:|data:text\/html/iu;

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exact(value, required, optional = []) {
  return object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
export function id(value) {
  return typeof value === 'string' && value.length <= 96 && IDENTIFIER.test(value);
}
export function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(0);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ?
    Math.floor(d.getTime() / 86_400_000) : null;
}
export function safePath(value) {
  return safeText(value, 300) &&
    !/[\\?#%\u0000-\u001f]/u.test(value) && !value.startsWith('/') &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(value) &&
    value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..' && !segment.includes(':'));
}
export function safeText(value, limit = MAX_TEXT) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value) &&
    !PRIVATE.test(value) && !MARKUP.test(value);
}
export function frenchText(value) {
  if (!safeText(value)) return false;
  if (/[a-zà-ÿ]'[a-zà-ÿ]/iu.test(value)) return false;
  for (let n = 0; n < value.length; n++) {
    const char = value[n];
    if ((char === ':' || char === '?' || char === '!') && value[n - 1] !== '\u00a0') return false;
    if (char === ';' && value[n - 1] !== '\u202f') return false;
    if (char === '«' && value[n + 1] !== '\u00a0') return false;
    if (char === '»' && value[n - 1] !== '\u00a0') return false;
  }
  return true;
}
export function validTier(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

export function validSource(value) {
  return exact(value, ['id', 'name', 'licence', 'observedOn', 'reference', 'retrievedOn', 'tier']) &&
    id(value.id) && safeText(value.name, 200) &&
    ![value.name, value.id, value.reference].some(field => typeof field === 'string' && BLOCKED.test(field)) &&
    LICENCES.includes(value.licence) && dayNumber(value.observedOn) !== null && dayNumber(value.retrievedOn) !== null &&
    validTier(value.tier) && safePath(value.reference);
}
export function validObservation(value) {
  return exact(value, ['id', 'placeId', 'feature', 'state', 'kind', 'sourceIds', 'observedOn', 'noteEn', 'noteFr'], ['supersedes']) &&
    id(value.id) && id(value.placeId) && FEATURES.includes(value.feature) &&
    STATES.includes(value.state) && ACTIONS.includes(value.kind) &&
    Array.isArray(value.sourceIds) && value.sourceIds.length <= 30 &&
    value.sourceIds.every(id) && new Set(value.sourceIds).size === value.sourceIds.length &&
    dayNumber(value.observedOn) !== null && safeText(value.noteEn) && frenchText(value.noteFr) &&
    (value.supersedes === undefined || id(value.supersedes));
}
export function validDecision(value) {
  return exact(value, ['placeId', 'feature', 'state', 'sourceIds', 'observationIds', 'silo'], ['noteEn', 'noteFr']) &&
    id(value.placeId) && FEATURES.includes(value.feature) && STATES.includes(value.state) &&
    ['open', 'odbl'].includes(value.silo) && Array.isArray(value.sourceIds) &&
    value.sourceIds.every(id) && Array.isArray(value.observationIds) &&
    value.observationIds.every(id) && new Set(value.sourceIds).size === value.sourceIds.length &&
    new Set(value.observationIds).size === value.observationIds.length &&
    (value.noteEn === undefined || safeText(value.noteEn)) &&
    (value.noteFr === undefined || frenchText(value.noteFr));
}
export function validPolicy(input) {
  return exact(input, ['asOf', 'maxAgeDays', 'maxSourceAgeDays', 'maxObservations', 'maxSources']) &&
    dayNumber(input.asOf) !== null &&
    [input.maxAgeDays, input.maxSourceAgeDays].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 36500) &&
    Number.isSafeInteger(input.maxObservations) && input.maxObservations >= 0 && input.maxObservations <= MAX_RECORDS &&
    Number.isSafeInteger(input.maxSources) && input.maxSources >= 0 && input.maxSources <= MAX_SOURCES;
}
export function isLocalInput(input) {
  return exact(input, ['schemaVersion', 'policy', 'sources', 'observations', 'decisions']) &&
    input.schemaVersion === 1 && validPolicy(input.policy) &&
    Array.isArray(input.sources) && Array.isArray(input.observations) && Array.isArray(input.decisions);
}
export function dateWithin(date, asOf, ageDays) {
  const observed = dayNumber(date);
  const current = dayNumber(asOf);
  return observed !== null && current !== null && Number.isSafeInteger(ageDays) && ageDays >= 0 &&
    observed <= current && current - observed <= ageDays;
}
export function stableSort(items, key) {
  return [...items].sort((a, b) => key(a).localeCompare(key(b), 'en'));
}
export function unique(items) {
  return new Set(items).size === items.length;
}
export function sourceSilo(sources) {
  if (!sources.some(source => source.licence === 'ODbL-1.0')) return 'open';
  return sources.every(source => source.licence === 'ODbL-1.0') ? 'odbl' : 'mixed';
}
export function contractSummary(input) {
  if (!isLocalInput(input)) return null;
  return { sources: input.sources.length, observations: input.observations.length,
    decisions: input.decisions.length, asOf: input.policy.asOf };
}
