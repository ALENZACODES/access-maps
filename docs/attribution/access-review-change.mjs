/** Release comparison for manual attribution-notice accessibility evidence. */
import { parseAccessReview, UNKNOWN } from './access-review-core.mjs';
import { auditAccessReview } from './access-review-audit.mjs';

const SOURCE_FIELDS = [
  'provider', 'licence', 'sourceUrl', 'licenceUrl', 'datasetDate',
  'acquiredDate', 'termsDate', 'permission', 'tier', 'notice', 'status',
];
const SURFACE_FIELDS = ['route', 'locale', 'sourceIds', 'offline', 'status'];
const TARGET_FIELDS = [
  'sourceId', 'kind', 'text', 'visible', 'keyboard', 'focusVisible',
  'screenReader', 'widthPx', 'heightPx', 'testedDate', 'evidenceUrl',
];
const OBSERVATION_FIELDS = ['result', 'date', 'referenceUrl', 'note'];
const BLOCK_SOURCE = new Set(['provider', 'licence', 'sourceUrl', 'licenceUrl', 'permission', 'tier', 'notice', 'status', 'acquiredDate', 'termsDate']);
const BLOCK_SURFACE = new Set(['route', 'locale', 'sourceIds', 'offline', 'status']);
const BLOCK_TARGET = new Set(['sourceId', 'kind', 'text', 'visible', 'keyboard', 'focusVisible', 'screenReader', 'widthPx', 'heightPx', 'testedDate', 'evidenceUrl']);
const BLOCK_OBSERVATION = new Set(['result', 'date', 'referenceUrl']);
function val(value) {
  if (Array.isArray(value)) return [...value].sort().join(', ');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : UNKNOWN;
}
function describe(kind, level, path, before, after, sourceId = null, surfaceId = null) {
  return { kind, level, path, before: val(before), after: val(after), sourceId, surfaceId };
}
function statuses(before, after) {
  if (after === 'YES' && before !== 'YES') return 'review';
  if (before === 'YES' && after !== 'YES') return 'block';
  if (after === UNKNOWN && before !== UNKNOWN) return 'block';
  if (after === 'NO' && before !== 'NO') return 'block';
  return 'review';
}
function fieldLevel(field, before, after, blockingFields) {
  if (!blockingFields.has(field)) return 'review';
  if (field === 'widthPx' || field === 'heightPx') {
    if (after === UNKNOWN || before !== UNKNOWN && after < before) return 'block';
    return 'review';
  }
  if (['permission', 'visible', 'keyboard', 'focusVisible', 'screenReader', 'offline'].includes(field)) return statuses(before, after);
  if (field === 'date' || field.endsWith('Date') || field === 'testedDate') {
    if (after === UNKNOWN && before !== UNKNOWN) return 'block';
    return 'review';
  }
  if (field === 'sourceIds' && Array.isArray(before) && Array.isArray(after)) {
    return before.some(id => !after.includes(id)) ? 'block' : 'review';
  }
  if (field === 'status' && before === 'included' && after !== 'included') return 'block';
  if (field === 'result') {
    if (before === 'PASS' && after !== 'PASS') return 'block';
    if (after === 'PASS') return 'review';
    return 'block';
  }
  return 'block';
}
function compareFields(changes, kind, before, after, fields, blocking, path, sourceId, surfaceId) {
  for (const field of fields) {
    const b = before[field];
    const a = after[field];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    changes.push(describe(kind, fieldLevel(field, b, a, blocking), `${path}.${field}`, b, a, sourceId, surfaceId));
  }
}
function identityMap(rows) { return new Map(rows.map(row => [row.id, row])); }
function compareObservations(changes, previous, candidate, path, sourceId, surfaceId) {
  const b = new Map(previous.observations.map(o => [o.technique, o]));
  const a = new Map(candidate.observations.map(o => [o.technique, o]));
  for (const [technique, old] of b) {
    const current = a.get(technique);
    if (!current) { changes.push(describe('observation-removed', 'block', `${path}.observations.${technique}`, old.result, UNKNOWN, sourceId, surfaceId)); continue; }
    compareFields(changes, 'observation-changed', old, current, OBSERVATION_FIELDS, BLOCK_OBSERVATION, `${path}.observations.${technique}`, sourceId, surfaceId);
  }
  for (const [technique, current] of a) {
    if (!b.has(technique)) changes.push(describe('observation-added', current.result === 'PASS' ? 'review' : 'block', `${path}.observations.${technique}`, UNKNOWN, current.result, sourceId, surfaceId));
  }
}
function compareTargets(changes, previous, candidate, path, surfaceId) {
  const oldTargets = identityMap(previous.targets);
  const newTargets = identityMap(candidate.targets);
  for (const [id, before] of oldTargets) {
    const after = newTargets.get(id);
    if (!after) { changes.push(describe('notice-target-removed', 'block', `${path}.targets.${id}`, id, UNKNOWN, before.sourceId, surfaceId)); continue; }
    compareFields(changes, 'notice-target-changed', before, after, TARGET_FIELDS, BLOCK_TARGET, `${path}.targets.${id}`, before.sourceId, surfaceId);
    compareObservations(changes, before, after, `${path}.targets.${id}`, before.sourceId, surfaceId);
  }
  for (const [id, after] of newTargets) {
    if (!oldTargets.has(id)) changes.push(describe('notice-target-added', 'review', `${path}.targets.${id}`, UNKNOWN, id, after.sourceId, surfaceId));
  }
}
export function compareAccessReviews(beforeInput, afterInput, options = {}) {
  const before = parseAccessReview(beforeInput);
  const after = parseAccessReview(afterInput);
  const beforeAudit = auditAccessReview(before, options);
  const afterAudit = auditAccessReview(after, options);
  const changes = [];
  const oldSources = identityMap(before.sources);
  const newSources = identityMap(after.sources);
  for (const [id, source] of oldSources) {
    const candidate = newSources.get(id);
    if (!candidate) { changes.push(describe('source-removed', source.status === 'included' ? 'block' : 'review', `sources.${id}`, id, UNKNOWN, id)); continue; }
    compareFields(changes, 'source-changed', source, candidate, SOURCE_FIELDS, BLOCK_SOURCE, `sources.${id}`, id, null);
  }
  for (const [id] of newSources) {
    if (!oldSources.has(id)) changes.push(describe('source-added', 'review', `sources.${id}`, UNKNOWN, id, id));
  }
  const oldSurfaces = identityMap(before.surfaces);
  const newSurfaces = identityMap(after.surfaces);
  for (const [id, surface] of oldSurfaces) {
    const candidate = newSurfaces.get(id);
    if (!candidate) { changes.push(describe('surface-removed', surface.status === 'included' ? 'block' : 'review', `surfaces.${id}`, id, UNKNOWN, null, id)); continue; }
    compareFields(changes, 'surface-changed', surface, candidate, SURFACE_FIELDS, BLOCK_SURFACE, `surfaces.${id}`, null, id);
    compareTargets(changes, surface, candidate, `surfaces.${id}`, id);
  }
  for (const [id] of newSurfaces) {
    if (!oldSurfaces.has(id)) changes.push(describe('surface-added', 'review', `surfaces.${id}`, UNKNOWN, id, null, id));
  }
  const oldCodes = new Set(beforeAudit.findings.filter(f => f.level === 'block').map(f => `${f.path}|${f.code}`));
  for (const issue of afterAudit.findings.filter(f => f.level === 'block')) {
    const key = `${issue.path}|${issue.code}`;
    if (!oldCodes.has(key)) changes.push(describe('new-release-blocker', 'block', issue.path, UNKNOWN, issue.code, issue.sourceId, issue.surfaceId));
  }
  changes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  return {
    beforeReleaseId: before.releaseId,
    afterReleaseId: after.releaseId,
    beforeAudit,
    afterAudit,
    changes,
    blocked: afterAudit.blocked || changes.some(item => item.level === 'block'),
    regressionCount: changes.filter(item => item.level === 'block').length,
  };
}
export function changesForSurface(comparison, surfaceId) {
  return comparison.changes.filter(item => item.surfaceId === surfaceId);
}
export function changesForSource(comparison, sourceId) {
  return comparison.changes.filter(item => item.sourceId === sourceId);
}
export function summarizeAccessReviewChanges(comparison) {
  const categories = [...new Set(comparison.changes.map(change => change.kind))].sort();
  return categories.map(kind => ({
    kind,
    count: comparison.changes.filter(change => change.kind === kind).length,
    blocking: comparison.changes.filter(change => change.kind === kind && change.level === 'block').length,
  }));
}
