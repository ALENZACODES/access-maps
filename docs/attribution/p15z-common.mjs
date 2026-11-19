/** Shared, side-effect-free rules for Ontario route disruption evidence. */
import { createHash } from 'node:crypto';

export const ACCESS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const LICENCES = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
export const KINDS = Object.freeze(['lift', 'ramp', 'path', 'crossing', 'entrance', 'platform', 'washroom', 'surface', 'door']);
export const EVENT_KINDS = Object.freeze(['closure', 'obstruction', 'maintenance', 'weather', 'inspection', 'reopening']);
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const LINK = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu;
const PERSONAL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|api[-_]?key)\s*[:=]/iu;
const CLAIM = /\b(?:guaranteed|real[- ]time|partnership|guarantee|garanti|temps réel|partenariat)\b/iu;
const collator = new Intl.Collator('en', { usage: 'sort', sensitivity: 'variant' });

export function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function exact(value, required, optional = []) {
  return isRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
export function id(value) { return typeof value === 'string' && value.length <= 96 && IDENTIFIER.test(value); }
export function ordered(values) { return [...values].sort((a, b) => collator.compare(a, b)); }
export function byId(a, b) { return collator.compare(a.id, b.id); }
export function controlFree(value) { return typeof value === 'string' && !/\p{Cc}/u.test(value); }
export function safeText(value) {
  return controlFree(value) && value.length >= 1 && value.length <= 300 &&
    value.trim() === value && !LINK.test(value) && !PERSONAL.test(value) && !CLAIM.test(value);
}
export function frenchSpacing(value) {
  if (typeof value !== 'string' || /[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === ':' && index > 0 && value[index - 1] !== '\u00a0') return false;
    if (';!?'.includes(character) && index > 0 && value[index - 1] !== '\u202f') return false;
    if (character === '«' && value[index + 1] !== '\u202f') return false;
    if (character === '»' && value[index - 1] !== '\u202f') return false;
  }
  return true;
}
export function bilingual(value) {
  return exact(value, ['en', 'fr']) && safeText(value.en) && safeText(value.fr) && frenchSpacing(value.fr);
}
export function calendarDay(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / 86_400_000;
}
export function instant(value) {
  if (typeof value !== 'string' || !INSTANT.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isSafeInteger(time)) return null;
  return new Date(time).toISOString().replace('.000Z', 'Z') === value ? time : null;
}
export function localPath(value) {
  if (!controlFree(value) || value.length < 1 || value.length > 400 ||
    value.startsWith('/') || /[\\%?#:]/u.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' &&
    part.trim() === part && !part.startsWith('.'));
}
export function licenceSilo(value) { return value === 'ODbL-1.0' ? 'odbl' : 'open'; }
export function validLicence(value) { return LICENCES.includes(value); }
export function finiteNonNegative(value, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum;
}
export function integer(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value) { return createHash('sha256').update(stableJson(value), 'utf8').digest('hex'); }
export function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (isRecord(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, immutable(v)])));
  return value;
}

const WORDS = Object.freeze({
  ROOT: ['The input structure is incomplete.', 'La structure des données est incomplète.'],
  DATE: ['An observation date is invalid.', 'Une date d’observation est invalide.'],
  SOURCE: ['The source details are incomplete.', 'Les renseignements de source sont incomplets.'],
  LICENCE: ['An open licence is required.', 'Une licence ouverte est obligatoire.'],
  SILO: ['Licence-separated sources cannot be mixed.', 'Les sources de licences distinctes ne peuvent pas être mélangées.'],
  DUPLICATE: ['An identifier is duplicated.', 'Un identifiant est en double.'],
  TEXT: ['Bilingual wording is missing or unsafe.', 'Le texte bilingue est absent ou non sûr.'],
  LINK: ['A local path is not safe.', 'Un chemin local n’est pas sûr.'],
  EVIDENCE: ['An observation is incomplete.', 'Une observation est incomplète.'],
  TIER: ['The observation tier cannot support this claim.', 'Le niveau d’observation ne soutient pas cet état.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Les observations divergent\u202f; l’état doit rester UNKNOWN.'],
  UNKNOWN: ['Missing information must remain UNKNOWN.', 'Les renseignements absents doivent rester UNKNOWN.'],
  TIME: ['A time window is invalid or unsupported.', 'La période indiquée est invalide ou non soutenue.'],
  AGE: ['An observation is too old or future-dated.', 'Une observation est trop ancienne ou future.'],
  REF: ['A referenced item does not exist.', 'Un élément cité est introuvable.'],
  BOUNDS: ['The bounded processing limit was reached.', 'La limite de traitement permise est atteinte.'],
  ROUTE: ['The route request cannot be evaluated.', 'La demande de parcours ne peut pas être évaluée.'],
  BLOCKED: ['The route has a reported barrier.', 'Un obstacle est signalé sur le parcours.'],
  PATH: ['The declared route has no supported connection.', 'Le parcours indiqué n’a pas de liaison soutenue.'],
  STATE: ['The event state is incomplete.', 'L’état de l’événement est incomplet.'],
  ASSET: ['The offline asset declaration is incomplete.', 'La déclaration du fichier hors ligne est incomplète.'],
  HASH: ['An offline digest is invalid.', 'L’empreinte du fichier hors ligne est invalide.'],
  INTERNAL: ['The supplied input cannot be evaluated.', 'Les données fournies ne peuvent pas être évaluées.'],
});
export function issue(code, path, detail = '') {
  const words = WORDS[code] ?? WORDS.INTERNAL;
  return immutable({ code, path, en: words[0], fr: words[1], detail });
}
export function sortIssues(items) {
  return immutable(items.sort((a, b) => collator.compare(a.path, b.path) || collator.compare(a.code, b.code) || collator.compare(a.detail, b.detail)));
}
export function resultBlocked(items) { return immutable({ ok: false, issues: sortIssues(items), value: null }); }
export function resultOk(value) { return immutable({ ok: true, issues: [], value }); }
export function uniqueStrings(value, maximum = 10000) {
  return Array.isArray(value) && value.length <= maximum && value.every(id) && new Set(value).size === value.length;
}
export function boundedDate(value, reference, maxAgeDays) {
  const observed = calendarDay(value);
  const asOf = calendarDay(reference);
  return observed !== null && asOf !== null && observed <= asOf &&
    asOf - observed <= maxAgeDays;
}
export function sourceIndex(sources, asOf, maxAgeDays, add) {
  const index = new Map();
  for (let position = 0; position < sources.length; position++) {
    const value = sources[position];
    const path = `sources[${position}]`;
    if (!exact(value, ['id', 'name', 'licence', 'silo', 'observedOn', 'reference']) ||
      !id(value.id) || !bilingual(value.name) || !validLicence(value.licence) ||
      !localPath(value.reference) || !['open', 'odbl'].includes(value.silo)) {
      add('SOURCE', path);
      continue;
    }
    if (index.has(value.id)) add('DUPLICATE', `${path}.id`);
    if (licenceSilo(value.licence) !== value.silo) add('SILO', `${path}.silo`);
    if (!boundedDate(value.observedOn, asOf, maxAgeDays)) add('AGE', `${path}.observedOn`);
    index.set(value.id, value);
  }
  return index;
}
export function checkFactSources(fact, sources, add, path) {
  if (!uniqueStrings(fact.sourceIds, 100)) { add('REF', `${path}.sourceIds`); return; }
  for (const key of fact.sourceIds) {
    const source = sources.get(key);
    if (!source) { add('REF', `${path}.sourceIds.${key}`); continue; }
    if (source.silo !== fact.silo) add('SILO', `${path}.sourceIds.${key}`);
  }
}
export function safeObservation(value, sources, fact, asOf, maxAgeDays, add, path) {
  if (!exact(value, ['sourceId', 'access', 'tier', 'observedOn']) || !id(value.sourceId) ||
    !ACCESS.includes(value.access) || !integer(value.tier, 0, 3) || calendarDay(value.observedOn) === null) {
    add('EVIDENCE', path);
    return false;
  }
  const source = sources.get(value.sourceId);
  if (!source || !fact.sourceIds.includes(value.sourceId)) add('REF', `${path}.sourceId`);
  if (source && source.silo !== fact.silo) add('SILO', `${path}.sourceId`);
  if (!boundedDate(value.observedOn, asOf, maxAgeDays) ||
    (source && calendarDay(value.observedOn) < calendarDay(source.observedOn))) add('AGE', `${path}.observedOn`);
  if (value.tier === 0 && value.access !== 'UNKNOWN') add('TIER', `${path}.tier`);
  return true;
}
export function factEvidence(fact, sources, asOf, maxAgeDays, add, path) {
  if (!uniqueStrings(fact.sourceIds, 100) || !Array.isArray(fact.evidence) || fact.evidence.length > 100) {
    add('EVIDENCE', path);
    return;
  }
  checkFactSources(fact, sources, add, path);
  const entries = [];
  fact.evidence.forEach((entry, index) => {
    if (safeObservation(entry, sources, fact, asOf, maxAgeDays, add, `${path}.evidence[${index}]`)) entries.push(entry);
  });
  const positive = entries.filter(e => e.access === 'YES');
  const negative = entries.filter(e => e.access === 'NO');
  if (positive.length && negative.length && fact.access !== 'UNKNOWN') add('CONFLICT', `${path}.access`);
  if (fact.tier <= 1 && fact.access !== 'UNKNOWN') add('TIER', `${path}.tier`);
  if (fact.access !== 'UNKNOWN' && !entries.some(e => e.access === fact.access && e.tier >= fact.tier)) {
    add('EVIDENCE', `${path}.access`);
  }
  if (fact.tier === 3 && fact.access !== 'UNKNOWN' &&
    new Set(entries.filter(e => e.access === fact.access && e.tier >= 3).map(e => e.sourceId)).size < 2) {
    add('TIER', `${path}.tier`);
  }
}
