/**
 * P15R — deterministic, offline-only provenance-graph gate.
 *
 * Every exported record and asset carries a dated chain of named sources.
 * Unknown values are retained without implying evidence. This module never
 * makes a request, writes a file, starts a timer, or modifies its input.
 */
const OPEN_LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const ACCESS = new Set(['YES', 'NO', 'UNKNOWN']);
const SILOS = new Set(['open', 'odbl']);
const MAX_INPUT = 10_000;
const MAX_GRAPH_DEPTH = 64;
const DAY_MS = 86_400_000;
const DIAGNOSTICS = Object.freeze({
  ROOT: ['The package must contain source, record and asset lists.', 'Le paquet doit contenir les listes de sources, de fiches et de fichiers.'],
  LIMIT: ['The package exceeds the record limit.', 'Le paquet dépasse la limite de fiches.'],
  DATE: ['Use a valid publication date.', 'Utiliser une date de publication valide.'],
  SHAPE: ['The entry has unexpected or missing fields.', 'L’entrée contient des champs inattendus ou manquants.'],
  ID: ['The identifier is missing or invalid.', 'L’identifiant est absent ou non valide.'],
  DUPLICATE: ['An identifier is used more than once.', 'Un identifiant est utilisé plusieurs fois.'],
  TEXT: ['Both language labels must be safe and present.', 'Les libellés des deux langues doivent être présents et sûrs.'],
  SPACING: ['French punctuation spacing is invalid.', 'L’espacement de la ponctuation française est non valide.'],
  SOURCE: ['An entry refers to a missing source.', 'Une entrée renvoie à une source absente.'],
  LICENCE: ['The source licence is absent or unsupported.', 'La licence de la source est absente ou non prise en charge.'],
  SILO: ['Licences from different export groups cannot be combined.', 'Les licences de groupes d’exportation différents ne peuvent être combinées.'],
  CYCLE: ['Source dependencies contain a cycle.', 'Les dépendances des sources contiennent un cycle.'],
  DEPTH: ['The source chain exceeds the depth limit.', 'La chaîne de sources dépasse la profondeur permise.'],
  OBSERVED: ['The observation date is absent or outside the allowed window.', 'La date de l’observation est absente ou hors de la période permise.'],
  ORDER: ['An observation precedes its source evidence.', 'Une observation précède les données de sa source.'],
  TIER: ['The confidence tier is unsupported by sources.', 'Le niveau de confiance n’est pas soutenu par les sources.'],
  ACCESS: ['A stated access value needs dated evidence.', 'Un état d’accès déclaré exige une observation datée.'],
  PATH: ['The offline path is not a safe relative path.', 'Le chemin hors ligne n’est pas un chemin relatif sûr.'],
  DIGEST: ['The asset has an invalid digest or size.', 'Le fichier présente une empreinte ou une taille non valide.'],
  CONFLICT: ['Conflicting evidence cannot support a single access value.', 'Des observations contradictoires ne peuvent pas soutenir un seul état d’accès.'],
  POLICY: ['The evaluation policy is invalid.', 'La politique d’évaluation est non valide.'],
});

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exact(value, fields) {
  return plain(value) && Object.keys(value).every(key => fields.includes(key)) &&
    fields.every(key => Object.hasOwn(value, key));
}
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value);
}
function containsControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    const point = value.charCodeAt(index);
    if (point < 32 || point === 127) return true;
  }
  return false;
}
function safeLabel(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 ||
      value.trim() !== value || containsControl(value)) return false;
  if (/<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu.test(value)) return false;
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(value)) return false;
  if (/\b(?:password|token|api[-_]?key|private[-_]?key)\s*[:=]/iu.test(value)) return false;
  return true;
}
function frenchSpacing(value) {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === ':' && index > 0 && value[index - 1] !== '\u00a0') return false;
    if (char !== undefined && ';!?'.includes(char) && index > 0 && value[index - 1] !== '\u202f') return false;
    if (char === '«' && value[index + 1] !== '\u202f') return false;
    if (char === '»' && value[index - 1] !== '\u202f') return false;
  }
  return true;
}
function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;
  return date.getTime() / DAY_MS;
}
function safePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 ||
      containsControl(value) || value.startsWith('/') || value.includes('\\') ||
      /[%?#:]/u.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' &&
    /^[\p{L}\p{N}_.-]+$/u.test(part));
}
function uniqueIds(value) {
  return Array.isArray(value) && value.length <= MAX_INPUT &&
    value.every(identifier) && new Set(value).size === value.length;
}
function localeCompare(a, b) { return a.localeCompare(b, 'en'); }
function sortById(entries) { return [...entries].sort((a, b) => localeCompare(a.id, b.id)); }
function ageOk(day, asOf, maximum) { return day !== null && day <= asOf && asOf - day <= maximum; }
function matchingSilo(sourceIds, sources) {
  return sourceIds.some(id => sources.get(id)?.licence === 'ODbL-1.0') ? 'odbl' : 'open';
}

/** Return diagnostics and a deterministic export plan, or null when blocked. */
export function auditSourceLineage(input, options = {}) {
  const findings = [];
  const add = (code, path) => {
    const [en, fr] = DIAGNOSTICS[code];
    findings.push({ code, path, en, fr });
  };
  const finish = (plan = null) => ({
    ok: findings.length === 0,
    findings: findings.sort((a, b) => localeCompare(a.path, b.path) || localeCompare(a.code, b.code)),
    plan: findings.length === 0 ? plan : null,
  });
  if (!plain(options) || Object.keys(options).some(key => !['maximumAgeDays', 'maximumTier'].includes(key)) ||
      (options.maximumAgeDays !== undefined && (!Number.isSafeInteger(options.maximumAgeDays) ||
        options.maximumAgeDays < 0 || options.maximumAgeDays > 3650)) ||
      (options.maximumTier !== undefined && (!Number.isInteger(options.maximumTier) ||
        options.maximumTier < 0 || options.maximumTier > 3))) {
    add('POLICY', '$.options'); return finish();
  }
  const maximumAgeDays = options.maximumAgeDays ?? 365;
  const maximumTier = options.maximumTier ?? 3;
  if (!exact(input, ['asOf', 'sources', 'records', 'assets']) ||
      !Array.isArray(input.sources) || !Array.isArray(input.records) || !Array.isArray(input.assets)) {
    add('ROOT', '$'); return finish();
  }
  if ([input.sources, input.records, input.assets].some(items => items.length > MAX_INPUT)) {
    add('LIMIT', '$'); return finish();
  }
  const asOf = dateDay(input.asOf);
  if (asOf === null) { add('DATE', '$.asOf'); return finish(); }
  const sourceFields = ['id', 'en', 'fr', 'licence', 'observedOn', 'parents', 'tier', 'reference'];
  const recordFields = ['id', 'en', 'fr', 'observedOn', 'tier', 'access', 'sourceIds', 'evidence', 'silo'];
  const assetFields = ['id', 'path', 'sourceIds', 'sha256', 'bytes', 'silo'];
  const evidenceFields = ['sourceId', 'observedOn', 'access'];
  const sources = new Map();
  const records = new Map();
  const assets = new Map();
  const paths = new Set();
  for (const [index, value] of input.sources.entries()) {
    const path = `$.sources[${index}]`;
    if (!exact(value, sourceFields)) { add('SHAPE', path); continue; }
    if (!identifier(value.id)) { add('ID', `${path}.id`); continue; }
    if (sources.has(value.id)) { add('DUPLICATE', `${path}.id`); continue; }
    sources.set(value.id, value);
    if (!safeLabel(value.en) || !safeLabel(value.fr)) add('TEXT', path);
    else if (!frenchSpacing(value.fr)) add('SPACING', `${path}.fr`);
    if (!OPEN_LICENCES.has(value.licence)) add('LICENCE', `${path}.licence`);
    if (!safePath(value.reference)) add('PATH', `${path}.reference`);
    if (!ageOk(dateDay(value.observedOn), asOf, maximumAgeDays)) add('OBSERVED', `${path}.observedOn`);
    if (!Number.isInteger(value.tier) || value.tier < 0 || value.tier > maximumTier) add('TIER', `${path}.tier`);
    if (!uniqueIds(value.parents) || value.parents.includes(value.id)) add('SHAPE', `${path}.parents`);
  }
  const chainCache = new Map();
  const visiting = new Set();
  function resolveSource(id, depth) {
    if (chainCache.has(id)) return chainCache.get(id);
    if (depth > MAX_GRAPH_DEPTH) { add('DEPTH', `$.sources.${id}`); return null; }
    const source = sources.get(id);
    if (!source) { add('SOURCE', `$.sources.${id}`); return null; }
    if (visiting.has(id)) { add('CYCLE', `$.sources.${id}`); return null; }
    visiting.add(id);
    const closure = new Set([id]);
    for (const parent of Array.isArray(source.parents) ? source.parents : []) {
      const parentSource = sources.get(parent);
      if (!parentSource) { add('SOURCE', `$.sources.${id}.parents`); continue; }
      if (parentSource.licence === 'ODbL-1.0' && source.licence !== 'ODbL-1.0') {
        add('SILO', `$.sources.${id}.parents`);
      }
      if (dateDay(parentSource.observedOn) !== null && dateDay(source.observedOn) !== null &&
          dateDay(source.observedOn) < dateDay(parentSource.observedOn)) {
        add('ORDER', `$.sources.${id}.observedOn`);
      }
      if (Number.isInteger(parentSource.tier) && Number.isInteger(source.tier) &&
          source.tier > parentSource.tier) add('TIER', `$.sources.${id}.tier`);
      const parentClosure = resolveSource(parent, depth + 1);
      if (parentClosure) for (const value of parentClosure) closure.add(value);
    }
    visiting.delete(id);
    chainCache.set(id, closure);
    return closure;
  }
  for (const id of [...sources.keys()].sort(localeCompare)) resolveSource(id, 0);
  const sourceClosureFor = (ids, path) => {
    const result = new Set();
    for (const id of ids) {
      const closure = chainCache.get(id);
      if (!closure) { add('SOURCE', path); continue; }
      for (const parent of closure) result.add(parent);
    }
    return [...result].sort(localeCompare);
  };
  for (const [index, value] of input.records.entries()) {
    const path = `$.records[${index}]`;
    if (!exact(value, recordFields)) { add('SHAPE', path); continue; }
    if (!identifier(value.id)) { add('ID', `${path}.id`); continue; }
    if (records.has(value.id)) { add('DUPLICATE', `${path}.id`); continue; }
    records.set(value.id, value);
    if (!safeLabel(value.en) || !safeLabel(value.fr)) add('TEXT', path);
    else if (!frenchSpacing(value.fr)) add('SPACING', `${path}.fr`);
    if (!uniqueIds(value.sourceIds) || value.sourceIds.length === 0) {
      add('SHAPE', `${path}.sourceIds`); continue;
    }
    const closure = sourceClosureFor(value.sourceIds, `${path}.sourceIds`);
    if (!SILOS.has(value.silo) || matchingSilo(closure, sources) !== value.silo) add('SILO', `${path}.silo`);
    if (!ACCESS.has(value.access)) add('ACCESS', `${path}.access`);
    if (!Number.isInteger(value.tier) || value.tier < 0 || value.tier > maximumTier ||
        (value.access === 'UNKNOWN' && value.tier > 1)) add('TIER', `${path}.tier`);
    if (!ageOk(dateDay(value.observedOn), asOf, maximumAgeDays)) add('OBSERVED', `${path}.observedOn`);
    if (!Array.isArray(value.evidence) || value.evidence.length > MAX_INPUT) { add('SHAPE', `${path}.evidence`); continue; }
    const seenEvidence = new Set();
    const states = new Set();
    let matched = 0;
    for (const [j, evidence] of value.evidence.entries()) {
      const at = `${path}.evidence[${j}]`;
      if (!exact(evidence, evidenceFields) || !identifier(evidence.sourceId) || !ACCESS.has(evidence.access)) {
        add('SHAPE', at); continue;
      }
      if (!closure.includes(evidence.sourceId)) add('SOURCE', `${at}.sourceId`);
      const day = dateDay(evidence.observedOn);
      const sourceDay = dateDay(sources.get(evidence.sourceId)?.observedOn);
      if (!ageOk(day, asOf, maximumAgeDays)) add('OBSERVED', `${at}.observedOn`);
      if (day !== null && sourceDay !== null && day < sourceDay) add('ORDER', `${at}.observedOn`);
      const key = `${evidence.sourceId}|${evidence.observedOn}|${evidence.access}`;
      if (seenEvidence.has(key)) add('DUPLICATE', at);
      seenEvidence.add(key);
      if (evidence.access !== 'UNKNOWN') states.add(evidence.access);
      if (evidence.access === value.access && day !== null && day <= asOf &&
          day >= (sourceDay ?? Infinity)) matched += 1;
    }
    if (states.size > 1 && value.access !== 'UNKNOWN') add('CONFLICT', `${path}.access`);
    if (value.access !== 'UNKNOWN' && (matched === 0 || value.tier < 2)) add('ACCESS', `${path}.access`);
    if (value.tier >= 2 && value.sourceIds.some(id => (sources.get(id)?.tier ?? -1) < value.tier)) {
      add('TIER', `${path}.tier`);
    }
  }
  for (const [index, value] of input.assets.entries()) {
    const path = `$.assets[${index}]`;
    if (!exact(value, assetFields)) { add('SHAPE', path); continue; }
    if (!identifier(value.id)) { add('ID', `${path}.id`); continue; }
    if (assets.has(value.id)) { add('DUPLICATE', `${path}.id`); continue; }
    assets.set(value.id, value);
    if (!safePath(value.path)) add('PATH', `${path}.path`);
    else if (paths.has(value.path)) add('DUPLICATE', `${path}.path`);
    else paths.add(value.path);
    if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(value.sha256) ||
        !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > 64 * 1024 * 1024) {
      add('DIGEST', path);
    }
    if (!uniqueIds(value.sourceIds) || value.sourceIds.length === 0) {
      add('SHAPE', `${path}.sourceIds`); continue;
    }
    const closure = sourceClosureFor(value.sourceIds, `${path}.sourceIds`);
    if (!SILOS.has(value.silo) || matchingSilo(closure, sources) !== value.silo) add('SILO', `${path}.silo`);
  }
  if (findings.length !== 0) return finish();
  return finish({
    asOf: input.asOf,
    sources: sortById([...sources.values()]).map(source => ({ ...source, parents: [...source.parents].sort(localeCompare) })),
    records: sortById([...records.values()]).map(record => ({
      ...record,
      sourceIds: [...record.sourceIds].sort(localeCompare),
      evidence: [...record.evidence].sort((a, b) => localeCompare(a.sourceId ?? '', b.sourceId ?? '') ||
        localeCompare(a.observedOn ?? '', b.observedOn ?? '') || localeCompare(a.access ?? '', b.access ?? '')),
    })),
    assets: sortById([...assets.values()]).map(asset => ({ ...asset, sourceIds: [...asset.sourceIds].sort(localeCompare) })),
  });
}

/** Provide human-readable diagnostics without disclosing source content. */
export function sourceLineageText(result, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Unsupported language');
  const heading = locale === 'en' ? (result.ok ? 'Check passed' : 'Export blocked') :
    (result.ok ? 'Contrôle réussi' : 'Exportation bloquée');
  return [heading, ...result.findings.map(finding =>
    `${finding.code} ${finding.path}: ${finding[locale]}`)].join('\n') + '\n';
}
