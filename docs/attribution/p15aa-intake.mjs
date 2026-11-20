/** Strict, deterministic intake of an offline Ontario evidence register. */
import {
  FEATURES, KINDS, LIMITS, ROLES, accepted, blocked, dateDistance,
  diagnostic, independentSources, isAccess, isBilingual, isDate, isDigest,
  isFeature, isId, isLicence, isObject, isSafePath, isSilo, isText,
  isTier, isUniqueIds, licenceSilo, sortedIssues, stableDigest,
  validateTimeWindow,
} from './p15aa-contract.mjs';

const ROOT_KEYS = ['version', 'asOf', 'maxAgeDays', 'sources', 'features', 'observations', 'assets'];
const SOURCE_KEYS = ['id', 'name', 'kind', 'licence', 'observedOn', 'reference', 'silo', 'independenceGroup'];
const FEATURE_KEYS = ['id', 'name', 'kind', 'access', 'tier', 'silo', 'sourceIds', 'observationIds', 'assetIds'];
const OBSERVATION_KEYS = ['id', 'featureId', 'sourceId', 'access', 'observedOn', 'tier', 'role', 'note'];
const ASSET_KEYS = ['id', 'path', 'sourceIds', 'silo', 'bytes', 'sha256', 'name'];
const exact = (row, keys) => isObject(row) && keys.length === Object.keys(row).length &&
  keys.every((key) => Object.hasOwn(row, key));
const sortById = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id, 'en'));
const hasForbiddenOperator = (name) => name.toLowerCase().replace(/[^a-z0-9]/gu, '').includes('miway');
const countBy = (rows, property) => Object.fromEntries([...new Set(rows.map((x) => x[property]))]
  .sort().map((key) => [key, rows.filter((x) => x[property] === key).length]));

export function validateSource(row, i, asOf, maxAge, add) {
  const at = `sources[${i}]`;
  if (!exact(row, SOURCE_KEYS) || !isId(row.id) || !isBilingual(row.name) ||
      !KINDS.includes(row.kind) || !isSafePath(row.reference) ||
      !isId(row.independenceGroup)) {
    add('SOURCE', at);
    return false;
  }
  if (!isLicence(row.licence)) add('LICENCE', `${at}.licence`);
  if (!isSilo(row.silo) || row.silo !== licenceSilo(row.licence)) add('SILO', `${at}.silo`);
  if (!isDate(row.observedOn)) add('DATE', `${at}.observedOn`);
  else if (!validateTimeWindow(row.observedOn, asOf, maxAge)) add('AGE', `${at}.observedOn`);
  if (hasForbiddenOperator(row.name.en) || hasForbiddenOperator(row.name.fr)) add('HOLD', `${at}.name`);
  if (row.kind === 'open-map' && row.licence !== 'ODbL-1.0') add('LICENCE', `${at}.licence`);
  return true;
}

export function validateFeature(row, i, add) {
  const at = `features[${i}]`;
  if (!exact(row, FEATURE_KEYS) || !isId(row.id) || !isBilingual(row.name) ||
      !isFeature(row.kind) || !isAccess(row.access) || !isTier(row.tier) ||
      !isSilo(row.silo) || !isUniqueIds(row.sourceIds) ||
      !isUniqueIds(row.observationIds) || !isUniqueIds(row.assetIds)) {
    add('FEATURE', at);
    return false;
  }
  if (row.tier === 0 && row.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
  if (row.tier === 1 && row.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
  if (row.tier > 1 && row.sourceIds.length === 0) add('CLAIM', `${at}.sourceIds`);
  if (row.access !== 'UNKNOWN' && row.observationIds.length === 0) add('CLAIM', `${at}.observationIds`);
  return true;
}

export function validateObservation(row, i, asOf, maxAge, add) {
  const at = `observations[${i}]`;
  if (!exact(row, OBSERVATION_KEYS) || !isId(row.id) || !isId(row.featureId) ||
      !isId(row.sourceId) || !isAccess(row.access) || !isTier(row.tier) ||
      !ROLES.includes(row.role) || !isText(row.note, LIMITS.notes)) {
    add('OBSERVATION', at);
    return false;
  }
  if (!isDate(row.observedOn)) add('DATE', `${at}.observedOn`);
  else if (!validateTimeWindow(row.observedOn, asOf, maxAge)) add('AGE', `${at}.observedOn`);
  if (row.tier === 0 && row.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
  if (row.tier === 3 && !['maintainer', 'operator'].includes(row.role)) add('TIER', `${at}.role`);
  return true;
}

export function validateAsset(row, i, add) {
  const at = `assets[${i}]`;
  if (!exact(row, ASSET_KEYS) || !isId(row.id) || !isSafePath(row.path) ||
      !isUniqueIds(row.sourceIds) || row.sourceIds.length === 0 ||
      !isSilo(row.silo) || !Number.isSafeInteger(row.bytes) ||
      row.bytes <= 0 || row.bytes > 32 * 1024 * 1024 || !isDigest(row.sha256) ||
      !isBilingual(row.name)) {
    add('ASSET', at);
    return false;
  }
  return true;
}

function indexRows(rows, category, add) {
  const byId = new Map();
  rows.forEach((row, index) => {
    if (!isObject(row) || !isId(row.id)) return;
    if (byId.has(row.id)) add('DUPLICATE', `${category}[${index}].id`);
    else byId.set(row.id, row);
  });
  return byId;
}

function checkSourceDependencies(features, sources, add) {
  for (const [i, feature] of features.entries()) {
    if (!isObject(feature) || !Array.isArray(feature.sourceIds)) continue;
    for (const id of feature.sourceIds) {
      const source = sources.get(id);
      if (!source) add('REFERENCE', `features[${i}].sourceIds`);
      else if (source.silo !== feature.silo) add('SILO', `features[${i}].sourceIds`);
    }
    if (feature.silo === 'odbl' && !feature.sourceIds.some((id) => sources.get(id)?.licence === 'ODbL-1.0')) {
      add('LICENCE', `features[${i}].sourceIds`);
    }
  }
}

function checkObservationDependencies(features, observations, sources, add) {
  const referenced = new Set();
  const byId = new Map(observations.filter((o) => isObject(o) && isId(o.id)).map((o) => [o.id, o]));
  for (const [i, feature] of features.entries()) {
    if (!isObject(feature) || !Array.isArray(feature.observationIds)) continue;
    const selected = [];
    for (const observationId of feature.observationIds) {
      referenced.add(observationId);
      const evidence = byId.get(observationId);
      if (!evidence) {
        add('REFERENCE', `features[${i}].observationIds`);
        continue;
      }
      if (evidence.featureId !== feature.id) add('REFERENCE', `features[${i}].observationIds`);
      if (!feature.sourceIds.includes(evidence.sourceId)) add('REFERENCE', `features[${i}].sourceIds`);
      const source = sources.get(evidence.sourceId);
      if (!source) add('REFERENCE', `observations.${evidence.id}.sourceId`);
      else {
        if (source.silo !== feature.silo) add('SILO', `observations.${evidence.id}.sourceId`);
        const delta = dateDistance(source.observedOn, evidence.observedOn);
        if (delta === null || delta < 0) add('AGE', `observations.${evidence.id}.observedOn`);
      }
      selected.push(evidence);
    }
    const yes = selected.some((o) => o.access === 'YES');
    const no = selected.some((o) => o.access === 'NO');
    if (yes && no && feature.access !== 'UNKNOWN') add('CONFLICT', `features[${i}].access`);
    if (feature.access !== 'UNKNOWN' && !selected.some((o) => o.access === feature.access)) {
      add('CLAIM', `features[${i}].access`);
    }
    if (feature.tier >= 2 && feature.access !== 'UNKNOWN' &&
        !selected.some((o) => o.access === feature.access && o.tier >= feature.tier)) {
      add('TIER', `features[${i}].tier`);
    }
    if (feature.tier === 3 && feature.access !== 'UNKNOWN' &&
        independentSources(selected.filter((o) => o.access === feature.access), sources) < 2) {
      add('INDEPENDENCE', `features[${i}].tier`);
    }
  }
  for (const row of observations) {
    if (!isObject(row)) continue;
    if (!features.some((feature) => feature.id === row.featureId)) add('REFERENCE', `observations.${row.id}.featureId`);
    if (!referenced.has(row.id)) add('REFERENCE', `observations.${row.id}.id`);
    if (!sources.has(row.sourceId)) add('REFERENCE', `observations.${row.id}.sourceId`);
  }
}

function checkAssets(features, assets, sources, add) {
  const byId = new Map(assets.filter((a) => isObject(a) && isId(a.id)).map((a) => [a.id, a]));
  const pathOwner = new Map();
  for (const [i, asset] of assets.entries()) {
    if (!isObject(asset) || typeof asset.path !== 'string') continue;
    if (pathOwner.has(asset.path)) add('DUPLICATE', `assets[${i}].path`);
    else pathOwner.set(asset.path, asset.id);
    if (!Array.isArray(asset.sourceIds)) continue;
    for (const id of asset.sourceIds) {
      const source = sources.get(id);
      if (!source) add('REFERENCE', `assets[${i}].sourceIds`);
      else if (source.silo !== asset.silo) add('SILO', `assets[${i}].sourceIds`);
    }
  }
  for (const [i, feature] of features.entries()) {
    if (!isObject(feature) || !Array.isArray(feature.assetIds)) continue;
    for (const id of feature.assetIds) {
      const asset = byId.get(id);
      if (!asset) add('REFERENCE', `features[${i}].assetIds`);
      else {
        if (asset.silo !== feature.silo) add('SILO', `features[${i}].assetIds`);
        for (const sourceId of asset.sourceIds) {
          if (!feature.sourceIds.includes(sourceId)) add('REFERENCE', `features[${i}].sourceIds`);
        }
      }
    }
  }
}

function copySorted(rows) {
  return Object.freeze(sortById(rows).map((row) => Object.freeze(structuredClone(row))));
}

/** No partially accepted package can escape this function. */
export function parseEvidenceRegister(input) {
  const issues = [];
  const add = (code, path) => issues.push(diagnostic(code, path));
  const counters = { sources: 0, features: 0, observations: 0, assets: 0 };
  if (!exact(input, ROOT_KEYS) || input.version !== 1 ||
      !Array.isArray(input.sources) || !Array.isArray(input.features) ||
      !Array.isArray(input.observations) || !Array.isArray(input.assets)) {
    add('ROOT', '$');
    return blocked(issues, counters);
  }
  if (!isDate(input.asOf) || !Number.isInteger(input.maxAgeDays) ||
      input.maxAgeDays < 0 || input.maxAgeDays > 3650) {
    add('DATE', '$.asOf');
    return blocked(issues, counters);
  }
  const names = ['sources', 'features', 'observations', 'assets'];
  for (const name of names) {
    counters[name] = input[name].length;
    if (input[name].length > LIMITS[name]) add('LIMIT', `$.${name}`);
  }
  if (issues.length) return blocked(issues, counters);
  input.sources.forEach((s, i) => validateSource(s, i, input.asOf, input.maxAgeDays, add));
  input.features.forEach((s, i) => validateFeature(s, i, add));
  input.observations.forEach((s, i) => validateObservation(s, i, input.asOf, input.maxAgeDays, add));
  input.assets.forEach((s, i) => validateAsset(s, i, add));
  // Do not traverse cross-record references until every required shape passes.
  // This also prevents malformed user input from causing a runtime exception.
  if (issues.length) return blocked(issues, counters);
  const sources = indexRows(input.sources, 'sources', add);
  indexRows(input.features, 'features', add);
  indexRows(input.observations, 'observations', add);
  indexRows(input.assets, 'assets', add);
  checkSourceDependencies(input.features, sources, add);
  checkObservationDependencies(input.features, input.observations, sources, add);
  checkAssets(input.features, input.assets, sources, add);
  if (issues.length) return blocked(issues, counters);
  const value = Object.freeze({
    version: 1,
    asOf: input.asOf,
    maxAgeDays: input.maxAgeDays,
    sources: copySorted(input.sources),
    features: copySorted(input.features),
    observations: copySorted(input.observations),
    assets: copySorted(input.assets),
  });
  return accepted(value, {
    ...counters,
    access: countBy(value.features, 'access'),
    tiers: countBy(value.features, 'tier'),
    digest: stableDigest(value),
  });
}

export function evidenceByFeature(register) {
  const byId = new Map(register.observations.map((row) => [row.id, row]));
  const result = new Map();
  for (const feature of register.features) {
    result.set(feature.id, feature.observationIds.map((id) => byId.get(id)).filter(Boolean));
  }
  return result;
}

export function provenanceForFeature(register, id) {
  const feature = register.features.find((row) => row.id === id);
  if (!feature) return null;
  const sources = new Map(register.sources.map((row) => [row.id, row]));
  const observations = new Map(register.observations.map((row) => [row.id, row]));
  return Object.freeze({
    featureId: id,
    access: feature.access,
    tier: feature.tier,
    sources: Object.freeze(feature.sourceIds.map((sourceId) => sources.get(sourceId)).filter(Boolean)),
    observations: Object.freeze(feature.observationIds.map((observationId) => observations.get(observationId)).filter(Boolean)),
  });
}

export function dependenciesForFeature(register, id) {
  const feature = register.features.find((row) => row.id === id);
  if (!feature) return null;
  const sourceIds = new Set(feature.sourceIds);
  const assets = register.assets.filter((row) => feature.assetIds.includes(row.id));
  for (const asset of assets) for (const sourceId of asset.sourceIds) sourceIds.add(sourceId);
  return Object.freeze({
    feature,
    sourceIds: Object.freeze([...sourceIds].sort()),
    observationIds: Object.freeze([...feature.observationIds].sort()),
    assetIds: Object.freeze([...feature.assetIds].sort()),
  });
}

export function filterEvidenceRegister(register, selectedIds) {
  if (!isUniqueIds(selectedIds, LIMITS.features)) return blocked([diagnostic('POLICY', '$.selectedIds')]);
  const featuresById = new Map(register.features.map((row) => [row.id, row]));
  if (selectedIds.some((id) => !featuresById.has(id))) return blocked([diagnostic('REFERENCE', '$.selectedIds')]);
  const features = sortById(selectedIds.map((id) => featuresById.get(id)));
  const observationIds = new Set(features.flatMap((row) => row.observationIds));
  const assetIds = new Set(features.flatMap((row) => row.assetIds));
  const assets = register.assets.filter((row) => assetIds.has(row.id));
  const sourceIds = new Set([...features.flatMap((row) => row.sourceIds),
    ...assets.flatMap((row) => row.sourceIds)]);
  return parseEvidenceRegister({
    version: register.version,
    asOf: register.asOf,
    maxAgeDays: register.maxAgeDays,
    features,
    observations: register.observations.filter((row) => observationIds.has(row.id)),
    assets,
    sources: register.sources.filter((row) => sourceIds.has(row.id)),
  });
}
