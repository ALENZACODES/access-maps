/** Compare two already-exported inventories without silently advancing access status. */
import { ageInDays, dateNumber, isRecord, issue, reviewManifest, STATES } from './schema.mjs';

function idMap(values) {
  if (!Array.isArray(values)) return new Map();
  return new Map(values.filter(value => isRecord(value) && typeof value.id === 'string')
    .map(value => [value.id, value]));
}

function signature(value, fields) {
  return JSON.stringify(fields.map(field => value?.[field] ?? null));
}

function finding(code, path, details) {
  return issue(code, path, 'ERROR', details);
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    [...a].sort().every((value, index) => value === [...b].sort()[index]);
}

function observationsFor(manifest) {
  const result = new Map();
  for (const observation of manifest.observations) {
    const list = result.get(observation.placeId) ?? [];
    list.push(observation);
    result.set(observation.placeId, list);
  }
  return result;
}

function activeObservations(observations) {
  const replaced = new Set(observations.map(item => item.replacesId).filter(Boolean));
  return observations.filter(item => !replaced.has(item.id));
}

function statusFor(observations) {
  if (observations.length === 0) return 'UNKNOWN';
  const current = activeObservations(observations);
  const known = [...new Set(current.map(item => item.state).filter(state => state !== 'UNKNOWN'))];
  return known.length === 1 && current.every(item => item.state === known[0]) ? known[0] : 'UNKNOWN';
}

function newSupportingObservation(previous, current, target) {
  const ids = new Set(previous.map(item => item.id));
  return current.some(item => !ids.has(item.id) && item.state === target &&
    Array.isArray(item.sourceIds) && item.sourceIds.length > 0);
}

function compareSources(before, after, findings, changes) {
  const oldSources = idMap(before.sources);
  const newSources = idMap(after.sources);
  for (const [id, source] of oldSources) {
    const next = newSources.get(id);
    if (!next) {
      changes.removedSources.push(id);
      continue;
    }
    if (signature(source, ['name', 'licence', 'reference']) !==
      signature(next, ['name', 'licence', 'reference'])) {
      findings.push(finding('SOURCE_ID_REUSED', `$.sources.${id}`));
    }
    if ((dateNumber(next.observedOn) ?? -Infinity) <
      (dateNumber(source.observedOn) ?? Infinity)) {
      findings.push(finding('SOURCE_DATE_REVERSED', `$.sources.${id}.observedOn`));
    }
    if (dateNumber(next.retrievedOn) < dateNumber(source.retrievedOn)) {
      findings.push(finding('SOURCE_DATE_REVERSED', `$.sources.${id}.retrievedOn`));
    }
    if (source.tier !== next.tier) findings.push(finding('SOURCE_ID_REUSED', `$.sources.${id}.tier`));
    if (source.observedOn !== next.observedOn || source.retrievedOn !== next.retrievedOn) {
      changes.updatedSources.push(id);
    }
  }
  for (const id of newSources.keys()) {
    if (!oldSources.has(id)) changes.addedSources.push(id);
  }
}

function comparePlaces(before, after, findings, changes) {
  const older = idMap(before.places);
  const newer = idMap(after.places);
  for (const [id, place] of older) {
    const next = newer.get(id);
    if (!next) {
      changes.removedPlaces.push(id);
      continue;
    }
    if (place.category !== next.category || place.region !== next.region) {
      findings.push(finding('PLACE_ID_REUSED', `$.places.${id}`));
    }
    if (place.nameEn !== next.nameEn || place.nameFr !== next.nameFr) {
      changes.renamedPlaces.push(id);
    }
  }
  for (const id of newer.keys()) {
    if (!older.has(id)) changes.addedPlaces.push(id);
  }
}

function compareObservations(before, after, findings, changes) {
  const oldById = idMap(before.observations);
  const newById = idMap(after.observations);
  for (const [id, observation] of oldById) {
    const next = newById.get(id);
    if (!next) {
      changes.removedObservations.push(id);
      continue;
    }
    const oldSignature = signature(observation, [
      'placeId', 'state', 'observedOn', 'descriptionEn', 'descriptionFr', 'replacesId',
    ]);
    const newSignature = signature(next, [
      'placeId', 'state', 'observedOn', 'descriptionEn', 'descriptionFr', 'replacesId',
    ]);
    if (oldSignature !== newSignature || !sameArray(observation.sourceIds, next.sourceIds)) {
      findings.push(finding('OBSERVATION_MUTATED', `$.observations.${id}`));
    }
  }
  for (const id of newById.keys()) {
    if (!oldById.has(id)) changes.addedObservations.push(id);
  }
  const oldGroups = observationsFor(before);
  const newGroups = observationsFor(after);
  const places = new Set([...oldGroups.keys(), ...newGroups.keys()]);
  for (const placeId of places) {
    const oldItems = oldGroups.get(placeId) ?? [];
    const newItems = newGroups.get(placeId) ?? [];
    const was = statusFor(oldItems);
    const now = statusFor(newItems);
    if (!STATES.includes(now)) continue;
    if (was !== now) {
      changes.changedStatus.push({ placeId, before: was, after: now });
      if (now !== 'UNKNOWN' && !newSupportingObservation(oldItems, newItems, now)) {
        findings.push(finding('STATUS_WITHOUT_EVIDENCE', `$.places.${placeId}`));
      }
    }
    const activeNow = activeObservations(newItems);
    if (activeNow.some(item => item.state === 'YES') &&
      activeNow.some(item => item.state === 'NO')) {
      changes.conflictingPlaces.push(placeId);
    }
  }
}

function compareAssets(before, after, findings, changes) {
  const older = idMap(before.assets);
  const newer = idMap(after.assets);
  for (const [id, asset] of older) {
    const next = newer.get(id);
    if (!next) {
      changes.removedAssets.push(id);
      continue;
    }
    if (asset.path !== next.path || asset.silo !== next.silo || asset.kind !== next.kind) {
      findings.push(finding('ASSET_ID_REUSED', `$.assets.${id}`));
    }
    if (asset.sha256 !== next.sha256 || asset.bytes !== next.bytes) {
      changes.changedAssets.push(id);
      if (sameArray(asset.sourceIds, next.sourceIds)) {
        findings.push(finding('ASSET_CHANGED_WITHOUT_SOURCE', `$.assets.${id}`));
      }
    }
    if (!sameArray(asset.sourceIds, next.sourceIds)) changes.relicensedAssets.push(id);
  }
  for (const id of newer.keys()) {
    if (!older.has(id)) changes.addedAssets.push(id);
  }
}

function checkRemovalPolicy(changes, policy, findings) {
  const collections = [
    ['removedPlaces', 'allowRemovedPlaces'],
    ['removedSources', 'allowRemovedSources'],
    ['removedObservations', 'allowRemovedObservations'],
    ['removedAssets', 'allowRemovedAssets'],
  ];
  for (const [name, permitted] of collections) {
    const allowed = policy[permitted] ?? [];
    if (!Array.isArray(allowed) || !allowed.every(item => typeof item === 'string') ||
      new Set(allowed).size !== allowed.length) {
      findings.push(finding('REMOVAL_POLICY', `$.policy.${permitted}`));
      continue;
    }
    for (const id of changes[name]) {
      if (!allowed.includes(id)) findings.push(finding('UNAPPROVED_REMOVAL', `$.${name}.${id}`));
    }
    for (const id of allowed) {
      if (!changes[name].includes(id)) findings.push(finding('UNMATCHED_APPROVAL', `$.policy.${permitted}.${id}`));
    }
  }
  const count = collections.reduce((total, [name]) => total + changes[name].length, 0);
  if (policy.maximumRemovals !== undefined &&
    (!Number.isSafeInteger(policy.maximumRemovals) || policy.maximumRemovals < 0 ||
      count > policy.maximumRemovals)) {
    findings.push(finding('REMOVAL_LIMIT', '$.policy.maximumRemovals'));
  }
}

export function compareManifests(before, after, options = {}) {
  const policy = options.policy ?? {};
  const validation = options.validation ?? { asOf: options.asOf, maxAgeDays: 365 };
  const oldAudit = reviewManifest(before, validation);
  const newAudit = reviewManifest(after, validation);
  const findings = [];
  if (!oldAudit.ok) findings.push(finding('BEFORE_INVALID', '$.before', oldAudit.findings));
  if (!newAudit.ok) findings.push(finding('AFTER_INVALID', '$.after', newAudit.findings));
  const changes = {
    addedPlaces: [], removedPlaces: [], renamedPlaces: [],
    addedSources: [], removedSources: [], updatedSources: [],
    addedObservations: [], removedObservations: [], changedStatus: [], conflictingPlaces: [],
    addedAssets: [], removedAssets: [], changedAssets: [], relicensedAssets: [],
  };
  if (!oldAudit.ok || !newAudit.ok) return complete(findings, changes);
  const dayDelta = ageInDays(before.generatedOn, after.generatedOn);
  if (dayDelta === null || dayDelta < 0) findings.push(finding('RELEASE_DATE_REVERSED', '$.after.generatedOn'));
  compareSources(before, after, findings, changes);
  comparePlaces(before, after, findings, changes);
  compareObservations(before, after, findings, changes);
  compareAssets(before, after, findings, changes);
  checkRemovalPolicy(changes, policy, findings);
  return complete(findings, changes);
}

function complete(findings, changes) {
  const sorted = [...findings].sort((a, b) =>
    a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
  for (const [key, value] of Object.entries(changes)) {
    if (key !== 'changedStatus') value.sort();
  }
  return Object.freeze({ ok: sorted.length === 0, findings: Object.freeze(sorted), changes });
}

export function countChanges(result) {
  return Object.fromEntries(Object.entries(result.changes).map(([key, value]) => [key, value.length]));
}

export function largestChanges(result, limit = 12) {
  if (!Number.isSafeInteger(limit) || limit < 0) return [];
  return Object.entries(result.changes)
    .flatMap(([category, values]) => values.map(value => ({ category, value })))
    .slice(0, limit);
}
