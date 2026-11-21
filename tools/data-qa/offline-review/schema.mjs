/** Deterministic, offline-only manifest validation. No network, browser, or storage APIs. */
export const LICENCES = Object.freeze([
  'CC0-1.0', 'CC-BY-4.0', 'OGL-ON-1.0', 'OGL-Canada-2.0', 'ODbL-1.0',
]);
export const STATES = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const CATEGORIES = Object.freeze([
  'entrance', 'washroom', 'lift', 'path', 'parking', 'stop', 'surface', 'crossing',
]);
export const LIMITS = Object.freeze({
  bytes: 2 * 1024 * 1024, sources: 2000, places: 10000, observations: 40000,
  assets: 20000, notes: 400, label: 160, id: 96, maxAge: 3650,
});

const lexicalId = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const sha256 = /^[a-f0-9]{64}$/;
const nonPrintable = /[\u0000-\u001f\u007f]/;
const privateText = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b(?:password|access[_ -]?token|api[_ -]?key|authorization)\s*[:=])/i;
const markup = /<\/?(?:script|iframe|embed|object|form|style)\b|\bon\w+\s*=|javascript:|data:text\/html/i;
const held = /mi[\s._-]*way/i;

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validId(value) {
  return typeof value === 'string' && value.length <= LIMITS.id && lexicalId.test(value);
}

export function cleanText(value, max = LIMITS.notes) {
  return typeof value === 'string' && value.length > 0 && value.length <= max &&
    value === value.trim() && !nonPrintable.test(value) &&
    !markup.test(value) && !privateText.test(value);
}

export function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(year, month - 1, day);
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day) return null;
  return Math.trunc(result.getTime() / 86400000);
}

export function ageInDays(observedOn, asOf) {
  const first = dateNumber(observedOn);
  const last = dateNumber(asOf);
  return first === null || last === null ? null : last - first;
}

export function validLocalPath(value) {
  if (typeof value !== 'string' || !value || value.length > 256) return false;
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') ||
    value.includes('%') || value.includes('?') || value.includes('#') ||
    value.includes('//') || /^(?:[a-z][a-z\d+.-]*:)/i.test(value)) return false;
  return value.split('/').every(part => part !== '.' && part !== '..' &&
    part.length > 0 && !nonPrintable.test(part) && !part.includes(':'));
}

export function isHeldSource(value) {
  return typeof value === 'string' &&
    (held.test(value) || value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway'));
}

export function isFrenchTypography(text) {
  if (typeof text !== 'string') return false;
  if (/[a-zà-ÿ]'[a-zà-ÿ]/iu.test(text)) return false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    if ((current === ':' || current === '?' || current === '!') && text[index - 1] !== '\u00a0') return false;
    if (current === ';' && text[index - 1] !== '\u202f') return false;
    if (current === '«' && text[index + 1] !== '\u00a0') return false;
    if (current === '»' && text[index - 1] !== '\u00a0') return false;
  }
  return true;
}

export function exactFields(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const present = Object.keys(value);
  return required.every(field => Object.hasOwn(value, field)) &&
    present.every(field => required.includes(field) || optional.includes(field));
}

export function issue(code, path, severity = 'ERROR', details = undefined) {
  return Object.freeze({ code, path, severity, ...(details === undefined ? {} : { details }) });
}

function addFindings(findings, code, path, details) {
  findings.push(issue(code, path, 'ERROR', details));
}

function arrays(input, findings) {
  const names = [['sources', LIMITS.sources], ['places', LIMITS.places],
    ['observations', LIMITS.observations], ['assets', LIMITS.assets]];
  const result = {};
  for (const [name, limit] of names) {
    if (!Array.isArray(input[name]) || input[name].length > limit) {
      addFindings(findings, 'COLLECTION', `$.${name}`);
      result[name] = [];
      continue;
    }
    result[name] = input[name];
  }
  return result;
}

function uniqueIds(items, path, findings) {
  const map = new Map();
  items.forEach((item, index) => {
    if (!isRecord(item) || !validId(item.id)) return;
    if (map.has(item.id)) addFindings(findings, 'DUPLICATE', `${path}[${index}].id`);
    else map.set(item.id, item);
  });
  return map;
}

export function validTier(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

function validSource(source) {
  return exactFields(source, ['id', 'name', 'licence', 'observedOn', 'reference', 'retrievedOn', 'tier']) &&
    validId(source.id) && cleanText(source.name, LIMITS.label) &&
    !isHeldSource(source.name) && LICENCES.includes(source.licence) &&
    dateNumber(source.observedOn) !== null && dateNumber(source.retrievedOn) !== null &&
    validTier(source.tier) && validLocalPath(source.reference);
}

function validPlace(place) {
  return exactFields(place, ['id', 'nameEn', 'nameFr', 'region', 'category'], ['sourceIds']) &&
    validId(place.id) && validId(place.region) && CATEGORIES.includes(place.category) &&
    cleanText(place.nameEn, LIMITS.label) && cleanText(place.nameFr, LIMITS.label) &&
    isFrenchTypography(place.nameFr);
}

function validObservation(observation) {
  return exactFields(observation, [
    'id', 'placeId', 'state', 'sourceIds', 'observedOn', 'descriptionEn', 'descriptionFr',
  ], ['replacesId']) && validId(observation.id) && validId(observation.placeId) &&
    STATES.includes(observation.state) && Array.isArray(observation.sourceIds) &&
    observation.sourceIds.length <= 64 && observation.sourceIds.every(validId) &&
    dateNumber(observation.observedOn) !== null &&
    cleanText(observation.descriptionEn) && cleanText(observation.descriptionFr) &&
    isFrenchTypography(observation.descriptionFr) &&
    (observation.replacesId === undefined || validId(observation.replacesId));
}

function validAsset(asset) {
  return exactFields(asset, [
    'id', 'path', 'sha256', 'bytes', 'sourceIds', 'silo', 'kind',
  ]) && validId(asset.id) && validLocalPath(asset.path) && sha256.test(asset.sha256) &&
    Number.isSafeInteger(asset.bytes) && asset.bytes >= 0 &&
    asset.bytes <= LIMITS.bytes && Array.isArray(asset.sourceIds) &&
    asset.sourceIds.length > 0 && asset.sourceIds.length <= 64 &&
    asset.sourceIds.every(validId) && ['open', 'odbl'].includes(asset.silo) &&
    ['html', 'json', 'image', 'text', 'tiles'].includes(asset.kind);
}

function sourceReferences(ids, sources, path, findings) {
  if (ids.length === 0) addFindings(findings, 'SOURCE_REQUIRED', path);
  const used = new Set();
  for (const [index, id] of ids.entries()) {
    if (used.has(id)) addFindings(findings, 'SOURCE_DUPLICATE', `${path}[${index}]`);
    used.add(id);
    if (!sources.has(id)) addFindings(findings, 'SOURCE_MISSING', `${path}[${index}]`);
  }
  const licences = ids.map(id => sources.get(id)?.licence).filter(Boolean);
  return { includesOdbl: licences.includes('ODbL-1.0'), licences };
}

function observationLinks(observations, places, sources, asOf, maxAgeDays, findings) {
  const byId = uniqueIds(observations, '$.observations', findings);
  const byPlace = new Map();
  for (const [index, observation] of observations.entries()) {
    const path = `$.observations[${index}]`;
    if (!validObservation(observation)) {
      addFindings(findings, 'OBSERVATION_SCHEMA', path);
      continue;
    }
    if (!places.has(observation.placeId)) addFindings(findings, 'PLACE_MISSING', `${path}.placeId`);
    sourceReferences(observation.sourceIds, sources,
      `${path}.sourceIds`, findings);
    if (observation.state !== 'UNKNOWN' && !observation.sourceIds.some(id => validSource(sources.get(id)))) {
      addFindings(findings, 'UNKNOWN_REQUIRED', `${path}.state`);
    }
    const age = ageInDays(observation.observedOn, asOf);
    if (age === null || age < 0 || age > maxAgeDays) {
      addFindings(findings, 'DATE_POLICY', `${path}.observedOn`);
    }
    for (const sourceId of observation.sourceIds) {
      const source = sources.get(sourceId);
      if (!source || !validSource(source)) continue;
      const sourceAge = ageInDays(source.observedOn, asOf);
      if (sourceAge === null || sourceAge < 0 || sourceAge > maxAgeDays) {
        addFindings(findings, 'DATE_POLICY', `${path}.sourceIds`, sourceId);
      }
      if ((dateNumber(source.observedOn) ?? Infinity) >
        (dateNumber(observation.observedOn) ?? -Infinity)) {
        addFindings(findings, 'SOURCE_AFTER_OBSERVATION', path, sourceId);
      }
    }
    if (observation.replacesId === observation.id) {
      addFindings(findings, 'HISTORY_CYCLE', `${path}.replacesId`);
    }
    const group = byPlace.get(observation.placeId) ?? [];
    group.push(observation);
    byPlace.set(observation.placeId, group);
  }
  for (const [id, observation] of byId) {
    if (!validObservation(observation)) continue;
    const seen = new Set([id]);
    let current = observation;
    while (current.replacesId) {
      const predecessor = byId.get(current.replacesId);
      if (!predecessor || !validObservation(predecessor)) {
        addFindings(findings, 'HISTORY_MISSING', `$.observations.${id}`);
        break;
      }
      if (seen.has(predecessor.id)) {
        addFindings(findings, 'HISTORY_CYCLE', `$.observations.${id}`);
        break;
      }
      if (predecessor.placeId !== observation.placeId ||
        (dateNumber(predecessor.observedOn) ?? Infinity) >
        (dateNumber(current.observedOn) ?? -Infinity)) {
        addFindings(findings, 'HISTORY_ORDER', `$.observations.${id}`);
        break;
      }
      seen.add(predecessor.id);
      current = predecessor;
    }
  }
  for (const [placeId, grouped] of byPlace) {
    const replaced = new Set(grouped.map(item => item.replacesId).filter(Boolean));
    const active = grouped.filter(item => !replaced.has(item.id));
    const known = new Set(active.map(item => item.state).filter(item => item !== 'UNKNOWN'));
    if (known.has('YES') && known.has('NO')) {
      findings.push(issue('CONFLICT', `$.places.${placeId}`, 'NOTICE'));
    }
  }
  return { byId, byPlace };
}

function assetLinks(assets, sources, findings) {
  const ids = uniqueIds(assets, '$.assets', findings);
  const paths = new Set();
  for (const [index, asset] of assets.entries()) {
    const path = `$.assets[${index}]`;
    if (!validAsset(asset)) {
      addFindings(findings, 'ASSET_SCHEMA', path);
      continue;
    }
    if (paths.has(asset.path)) addFindings(findings, 'ASSET_PATH_DUPLICATE', `${path}.path`);
    paths.add(asset.path);
    const references = sourceReferences(asset.sourceIds, sources, `${path}.sourceIds`, findings);
    if (references.includesOdbl !== (asset.silo === 'odbl')) {
      addFindings(findings, 'ODBL_SILO', `${path}.silo`);
    }
    if (asset.kind === 'tiles' && asset.silo !== 'odbl') {
      // The check does not assume tiles are ODbL, but requires provenance on any tile export.
      if (references.licences.length === 0) addFindings(findings, 'SOURCE_REQUIRED', path);
    }
  }
  return ids;
}

export function reviewManifest(input, policy = {}) {
  const findings = [];
  const asOf = policy.asOf;
  const maxAgeDays = policy.maxAgeDays ?? 365;
  if (dateNumber(asOf) === null || !Number.isSafeInteger(maxAgeDays) ||
    maxAgeDays < 0 || maxAgeDays > LIMITS.maxAge) {
    addFindings(findings, 'POLICY', '$.policy');
  }
  if (!exactFields(input, [
    'schemaVersion', 'generatedOn', 'sources', 'places', 'observations', 'assets',
  ]) || input.schemaVersion !== 1) {
    addFindings(findings, 'ROOT_SCHEMA', '$');
    return summarize(findings, [], [], [], [], asOf);
  }
  if (dateNumber(input.generatedOn) === null ||
    ageInDays(input.generatedOn, asOf) === null ||
    ageInDays(input.generatedOn, asOf) < 0) {
    addFindings(findings, 'GENERATED_DATE', '$.generatedOn');
  }
  const { sources, places, observations, assets } = arrays(input, findings);
  const sourceIndex = uniqueIds(sources, '$.sources', findings);
  const placeIndex = uniqueIds(places, '$.places', findings);
  for (const [index, source] of sources.entries()) {
    const path = `$.sources[${index}]`;
    if (isRecord(source)) {
      if (dateNumber(source.retrievedOn) === null) addFindings(findings, 'RETRIEVAL_DATE', `${path}.retrievedOn`);
      if (!validTier(source.tier)) addFindings(findings, 'SOURCE_TIER', `${path}.tier`);
    }
    if (!validSource(source)) addFindings(findings, 'SOURCE_SCHEMA', path);
    else {
      const retrieved = dateNumber(source.retrievedOn);
      if (retrieved < dateNumber(source.observedOn) || retrieved > dateNumber(input.generatedOn)) {
        addFindings(findings, 'RETRIEVAL_DATE', `${path}.retrievedOn`);
      }
      const age = ageInDays(source.observedOn, asOf);
      if (age === null || age < 0 || age > maxAgeDays) {
        addFindings(findings, 'DATE_POLICY', `$.sources[${index}].observedOn`);
      }
    }
  }
  for (const [index, place] of places.entries()) {
    const path = `$.places[${index}]`;
    if (!validPlace(place)) {
      addFindings(findings, 'PLACE_SCHEMA', path);
    } else if (!Array.isArray(place.sourceIds) || place.sourceIds.length > 64 || !place.sourceIds.every(validId)) {
      addFindings(findings, 'SOURCE_REQUIRED', `${path}.sourceIds`);
    } else {
      sourceReferences(place.sourceIds, sourceIndex, `${path}.sourceIds`, findings);
    }
  }
  observationLinks(observations, placeIndex, sourceIndex, asOf, maxAgeDays, findings);
  assetLinks(assets, sourceIndex, findings);
  return summarize(findings, sources, places, observations, assets, asOf);
}

function summarize(findings, sources, places, observations, assets, asOf) {
  const sorted = [...findings].sort((a, b) =>
    a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
  const counts = {
    sources: sources.length, places: places.length, observations: observations.length,
    assets: assets.length, unknown: observations.filter(item => item?.state === 'UNKNOWN').length,
    known: observations.filter(item => item?.state === 'YES' || item?.state === 'NO').length,
    errors: sorted.filter(item => item.severity === 'ERROR').length,
    notices: sorted.filter(item => item.severity === 'NOTICE').length,
  };
  return Object.freeze({
    ok: counts.errors === 0, asOf, counts: Object.freeze(counts),
    findings: Object.freeze(sorted),
  });
}

export function parseJsonText(text, policy) {
  if (typeof text !== 'string' || BufferLikeByteLength(text) > LIMITS.bytes) {
    return summarize([issue('INPUT_SIZE', '$')], [], [], [], [], policy?.asOf);
  }
  try {
    return reviewManifest(JSON.parse(text), policy);
  } catch {
    return summarize([issue('INPUT_JSON', '$')], [], [], [], [], policy?.asOf);
  }
}

export function BufferLikeByteLength(text) {
  // TextEncoder is supported by browsers and modern Node, without Node-only imports.
  return new TextEncoder().encode(text).length;
}
