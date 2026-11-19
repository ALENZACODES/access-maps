/** Human-reviewed local changes. The module never publishes or uploads data. */
import {
  accepted, blocked, checksum, dateDistance, diagnostic, isAccess, isDate,
  isId, isObject, isSilo, isText, isTier, isUniqueIds, jsonBytes,
  sortedIssues, stableDigest,
} from './p15aa-contract.mjs';
import { parseEvidenceRegister, provenanceForFeature } from './p15aa-intake.mjs';

const POLICY_KEYS = ['removedSources', 'removedFeatures', 'removedObservations', 'removedAssets', 'maximumRemovals', 'allowTierDecrease'];
const AUTH_KEYS = ['featureId', 'reviewer', 'reviewedOn', 'decision', 'reason', 'sourceIds'];
const REVIEWERS = new Set(['maintainer', 'editor', 'operator']);
const REVIEW_ACTIONS = new Set(['accept', 'reject', 'defer']);
const sorted = (rows) => [...rows].sort((a, b) => a.localeCompare(b, 'en'));
const rowsById = (rows) => new Map(rows.map((row) => [row.id, row]));
const observationKey = (row) => JSON.stringify([row.sourceId, row.featureId, row.access, row.observedOn, row.tier]);
const sourceIdentity = (row) => JSON.stringify([row.name, row.kind, row.licence, row.reference, row.silo, row.independenceGroup]);
const assetIdentity = (row) => JSON.stringify([row.path, row.bytes, row.sha256, row.silo, row.sourceIds]);
const nameIdentity = (row) => JSON.stringify(row.name);

export function validateRemovalPolicy(policy) {
  if (!isObject(policy) || Object.keys(policy).some((key) => !POLICY_KEYS.includes(key))) return false;
  for (const key of POLICY_KEYS.slice(0, 4)) {
    if (!isUniqueIds(policy[key] ?? [])) return false;
  }
  return Number.isSafeInteger(policy.maximumRemovals) &&
    policy.maximumRemovals >= 0 && policy.maximumRemovals <= 5000 &&
    typeof policy.allowTierDecrease === 'boolean';
}

export function validateReviewAuthorization(row, asOf) {
  if (!isObject(row) || Object.keys(row).length !== AUTH_KEYS.length ||
      !AUTH_KEYS.every((key) => Object.hasOwn(row, key))) return false;
  if (!isId(row.featureId) || !REVIEWERS.has(row.reviewer) ||
      !REVIEW_ACTIONS.has(row.decision) || !isDate(row.reviewedOn) ||
      !isText(row.reason, 250) || !isUniqueIds(row.sourceIds)) return false;
  return dateDistance(row.reviewedOn, asOf) >= 0;
}

export function changesBetween(beforeRows, afterRows, entityName) {
  const oldMap = rowsById(beforeRows);
  const newMap = rowsById(afterRows);
  const ids = sorted([...new Set([...oldMap.keys(), ...newMap.keys()])]);
  return ids.map((id) => {
    const oldRow = oldMap.get(id);
    const newRow = newMap.get(id);
    const kind = !oldRow ? 'added' : !newRow ? 'removed' :
      stableDigest(oldRow) === stableDigest(newRow) ? 'unchanged' : 'changed';
    return Object.freeze({ entity: entityName, id, kind, before: oldRow ?? null, after: newRow ?? null });
  });
}

export function summarizeChanges(changes) {
  const result = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const row of changes) result[row.kind]++;
  return Object.freeze(result);
}

function validateChanges(before, after, changes, policy, add) {
  const aliases = {
    sources: policy.removedSources,
    features: policy.removedFeatures,
    observations: policy.removedObservations,
    assets: policy.removedAssets,
  };
  let removals = 0;
  for (const [category, list] of Object.entries(aliases)) {
    const removed = changes.filter((row) => row.entity === category && row.kind === 'removed');
    const removedIds = new Set(removed.map((row) => row.id));
    for (const row of removed) {
      removals++;
      if (!list.includes(row.id)) add('REMOVAL', `${category}.${row.id}`);
    }
    for (const id of list) {
      if (!removedIds.has(id)) add('UNMATCHED', `policy.${category}.${id}`);
    }
  }
  if (removals > policy.maximumRemovals) add('LIMIT', 'policy.maximumRemovals');
  const oldSources = rowsById(before.sources);
  const newSources = rowsById(after.sources);
  const oldFeatures = rowsById(before.features);
  const newFeatures = rowsById(after.features);
  const oldObservations = rowsById(before.observations);
  const newObservations = rowsById(after.observations);
  const oldAssets = rowsById(before.assets);
  const newAssets = rowsById(after.assets);
  for (const [id, oldRow] of oldSources) {
    const newRow = newSources.get(id);
    if (!newRow) continue;
    if (sourceIdentity(oldRow) !== sourceIdentity(newRow)) add('IDENTITY', `sources.${id}`);
    if (dateDistance(oldRow.observedOn, newRow.observedOn) < 0) add('ROLLBACK', `sources.${id}.observedOn`);
  }
  for (const [id, oldRow] of oldObservations) {
    const next = newObservations.get(id);
    if (!next) continue;
    if (observationKey(oldRow) !== observationKey(next)) add('IDENTITY', `observations.${id}`);
  }
  for (const [id, oldRow] of oldAssets) {
    const current = newAssets.get(id);
    if (!current) continue;
    if (assetIdentity(oldRow) !== assetIdentity(current)) add('ASSET', `assets.${id}`);
  }
  for (const [id, oldRow] of oldFeatures) {
    const current = newFeatures.get(id);
    if (!current) continue;
    if (oldRow.silo !== current.silo || oldRow.kind !== current.kind) add('IDENTITY', `features.${id}`);
    if (nameIdentity(oldRow) !== nameIdentity(current)) add('TEXT', `features.${id}.name`);
    if (oldRow.tier > current.tier && !policy.allowTierDecrease) add('TIER', `features.${id}.tier`);
    if (oldRow.access !== current.access && current.access !== 'UNKNOWN') {
      const newIds = current.observationIds.filter((obsId) => !oldRow.observationIds.includes(obsId));
      const supporting = newIds.some((obsId) => newObservations.get(obsId)?.access === current.access);
      if (!supporting) add('TRANSITION', `features.${id}.access`);
    }
    if (oldRow.access !== current.access && current.access === 'UNKNOWN' && current.tier >= 2) {
      add('TIER', `features.${id}.tier`);
    }
    for (const observationId of oldRow.observationIds) {
      if (!current.observationIds.includes(observationId) && newObservations.has(observationId)) {
        add('ROLLBACK', `features.${id}.observationIds`);
      }
    }
    if (oldRow.sourceIds.some((sourceId) => !current.sourceIds.includes(sourceId) && newSources.has(sourceId))) {
      add('ROLLBACK', `features.${id}.sourceIds`);
    }
  }
}

/** Comparison is fail closed even when a single input is incomplete. */
export function compareEvidenceRegisters(previousInput, currentInput, policy) {
  const before = parseEvidenceRegister(previousInput);
  const after = parseEvidenceRegister(currentInput);
  const issues = [];
  const add = (code, path) => issues.push(diagnostic(code, path));
  if (!before.ok || !after.ok) {
    add('ROOT', '$');
    for (const issue of before.issues) issues.push(diagnostic(issue.code, `before.${issue.path}`));
    for (const issue of after.issues) issues.push(diagnostic(issue.code, `after.${issue.path}`));
    return blocked(issues);
  }
  if (!validateRemovalPolicy(policy)) return blocked([diagnostic('POLICY', '$.policy')]);
  if (dateDistance(before.value.asOf, after.value.asOf) < 0) add('ROLLBACK', '$.asOf');
  const keys = ['sources', 'features', 'observations', 'assets'];
  const changes = keys.flatMap((name) => changesBetween(before.value[name], after.value[name], name));
  validateChanges(before.value, after.value, changes, policy, add);
  if (issues.length) return blocked(issues, { changes: summarizeChanges(changes) });
  return accepted(Object.freeze({
    previousDigest: stableDigest(before.value),
    candidateDigest: stableDigest(after.value),
    changes: Object.freeze(changes),
    summary: summarizeChanges(changes),
  }), { changes: changes.length });
}

export function createReviewQueue(before, after, comparison) {
  if (!comparison.ok) return blocked([diagnostic('POLICY', '$.comparison')]);
  const previous = rowsById(before.features);
  const current = rowsById(after.features);
  const queue = [];
  for (const change of comparison.value.changes) {
    if (change.entity !== 'features' || change.kind === 'unchanged') continue;
    const featureId = change.id;
    const oldRow = previous.get(featureId);
    const next = current.get(featureId);
    const oldEvidence = oldRow ? provenanceForFeature(before, featureId) : null;
    const nextEvidence = next ? provenanceForFeature(after, featureId) : null;
    const urgency = !next ? 'removal' : next.access === 'UNKNOWN' ? 'uncertainty' :
      oldRow?.access !== next.access ? 'access-change' : 'metadata-change';
    queue.push(Object.freeze({
      featureId, urgency,
      beforeAccess: oldRow?.access ?? 'UNKNOWN',
      nextAccess: next?.access ?? 'UNKNOWN',
      beforeTier: oldRow?.tier ?? 0,
      nextTier: next?.tier ?? 0,
      beforeSourceIds: Object.freeze(oldEvidence?.sources.map((s) => s.id) ?? []),
      nextSourceIds: Object.freeze(nextEvidence?.sources.map((s) => s.id) ?? []),
      nextObservationIds: Object.freeze(nextEvidence?.observations.map((o) => o.id) ?? []),
    }));
  }
  queue.sort((a, b) => a.featureId.localeCompare(b.featureId, 'en'));
  return accepted(Object.freeze(queue), { queued: queue.length });
}

export function decideReviewQueue(queueResult, authorizations, asOf) {
  if (!queueResult.ok || !isDate(asOf) || !Array.isArray(authorizations)) {
    return blocked([diagnostic('POLICY', '$.authorizations')]);
  }
  if (authorizations.length > 20000) return blocked([diagnostic('LIMIT', '$.authorizations')]);
  const issues = [];
  const queue = new Map(queueResult.value.map((row) => [row.featureId, row]));
  const decisions = new Map();
  for (const [i, row] of authorizations.entries()) {
    if (!validateReviewAuthorization(row, asOf)) {
      issues.push(diagnostic('POLICY', `authorizations[${i}]`));
      continue;
    }
    if (decisions.has(row.featureId)) issues.push(diagnostic('DUPLICATE', `authorizations[${i}].featureId`));
    if (!queue.has(row.featureId)) issues.push(diagnostic('UNMATCHED', `authorizations[${i}].featureId`));
    const requested = queue.get(row.featureId);
    if (requested && row.decision === 'accept' && requested.nextAccess !== 'UNKNOWN' &&
        requested.nextSourceIds.some((id) => !row.sourceIds.includes(id))) {
      issues.push(diagnostic('REFERENCE', `authorizations[${i}].sourceIds`));
    }
    decisions.set(row.featureId, row);
  }
  for (const row of queueResult.value) {
    if (!decisions.has(row.featureId)) issues.push(diagnostic('EMPTY', `features.${row.featureId}`));
  }
  if (issues.length) return blocked(issues);
  const sorted = [...decisions.values()].sort((a, b) => a.featureId.localeCompare(b.featureId, 'en'));
  const result = Object.freeze({
    asOf,
    decisions: Object.freeze(sorted),
    accepted: Object.freeze(sorted.filter((row) => row.decision === 'accept').map((row) => row.featureId)),
    rejected: Object.freeze(sorted.filter((row) => row.decision === 'reject').map((row) => row.featureId)),
    deferred: Object.freeze(sorted.filter((row) => row.decision === 'defer').map((row) => row.featureId)),
    digest: stableDigest(sorted),
  });
  return accepted(result, { count: sorted.length });
}

export function reviewQueueText(queue, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Unsupported locale');
  if (!queue.ok) return locale === 'fr' ? 'Contrôle bloqué\n' : 'Check blocked\n';
  const heading = locale === 'fr' ? 'Fiches à contrôler' : 'Records needing review';
  const labels = locale === 'fr' ? {
    removal: 'retrait', uncertainty: 'UNKNOWN', 'access-change': 'changement d’accès',
    'metadata-change': 'changement de fiche',
  } : {
    removal: 'removal', uncertainty: 'UNKNOWN', 'access-change': 'access change',
    'metadata-change': 'record change',
  };
  return [heading, ...queue.value.map((row) =>
    `${row.featureId}: ${labels[row.urgency]} (${row.beforeAccess} → ${row.nextAccess})`)].join('\n') + '\n';
}

export function digestReviewPlan(result) {
  if (!result.ok) return null;
  const bytes = jsonBytes(result.value);
  return Object.freeze({ bytes, sha256: checksum(bytes), length: bytes.length });
}
