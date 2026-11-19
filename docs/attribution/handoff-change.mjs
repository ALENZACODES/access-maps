/** Field-level release comparisons; no assumptions about omitted records. */
import { auditHandoffPack } from './handoff-audit.mjs';

const SOURCE_FIELDS = [
  'provider', 'name', 'sourceUrl', 'licenceName', 'licenceUrl', 'permission',
  'tier', 'datasetDate', 'acquiredDate', 'termsDate', 'notice', 'status', 'evidenceUrl',
];
const SURFACE_FIELDS = [
  'mode', 'locale', 'sourceIds', 'offline', 'keyboard', 'screenReader',
  'mapCredit', 'targetPx', 'publicationDate',
];
const HANDOFF_FIELDS = [
  'surfaceIds', 'sourceIds', 'recipient', 'purpose', 'format', 'scope',
  'approval', 'approvedDate', 'expiresDate', 'digest',
];
const SOURCE_CRITICAL = new Set([
  'provider', 'sourceUrl', 'licenceName', 'licenceUrl', 'permission',
  'tier', 'termsDate', 'notice', 'status', 'evidenceUrl',
]);
const SURFACE_CRITICAL = new Set([
  'locale', 'sourceIds', 'offline', 'keyboard', 'screenReader', 'mapCredit', 'targetPx',
]);
const HANDOFF_CRITICAL = new Set([
  'surfaceIds', 'sourceIds', 'recipient', 'scope', 'approval',
  'approvedDate', 'expiresDate', 'digest',
]);
export const CHANGE_KINDS = Object.freeze([
  'source-added', 'source-removed', 'source-field',
  'surface-added', 'surface-removed', 'surface-field',
  'handoff-added', 'handoff-removed', 'handoff-field', 'policy-field',
  'new-finding', 'resolved-finding',
]);
function valueText(value) {
  if (Array.isArray(value)) return [...value].sort().join(', ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value === undefined ? 'UNKNOWN' : JSON.stringify(value);
}
function same(left, right) { return valueText(left) === valueText(right); }
function changed(kind, severity, id, field, before, after, affected) {
  return {
    kind, severity, id, field,
    before: valueText(before),
    after: valueText(after),
    affected: [...new Set(affected)].sort(),
  };
}
function surfacesForSource(pack, sourceId) {
  return pack.surfaces.filter((surface) => surface.sourceIds.includes(sourceId)).map((surface) => surface.id);
}
function handoffsForSurface(pack, surfaceId) {
  return pack.handoffs.filter((handoff) => handoff.surfaceIds.includes(surfaceId)).map((handoff) => handoff.id);
}
function handoffsForSource(pack, sourceId) {
  return pack.handoffs.filter((handoff) => handoff.sourceIds.includes(sourceId) ||
    handoff.surfaceIds.some((id) => pack.surfaces.some((surface) =>
      surface.id === id && surface.sourceIds.includes(sourceId)))).map((handoff) => handoff.id);
}
function severityForSource(field, before, after) {
  if (!SOURCE_CRITICAL.has(field)) return 'review';
  if (before === after) return 'information';
  if (field === 'tier' && before === 'UNKNOWN' && after !== 'UNKNOWN') return 'review';
  if (field === 'permission' && before !== 'YES' && after === 'YES') return 'review';
  if (field === 'status' && before !== 'included' && after === 'included') return 'review';
  return 'block';
}
function severityForSurface(field, before, after) {
  if (!SURFACE_CRITICAL.has(field)) return 'review';
  if (field === 'targetPx' && typeof before === 'number' &&
      typeof after === 'number' && after >= before && after >= 44) return 'information';
  if (['offline', 'keyboard', 'screenReader', 'mapCredit'].includes(field) && before !== 'YES' && after === 'YES') return 'review';
  return 'block';
}
function severityForHandoff(field, before, after) {
  if (!HANDOFF_CRITICAL.has(field)) return 'review';
  if (field === 'approval' && before !== 'YES' && after === 'YES') return 'review';
  if (field === 'expiresDate' && before !== 'UNKNOWN' && after !== 'UNKNOWN' && after > before) return 'information';
  return 'block';
}
function diffGroup(before, after, key, fields, prefix, classify, affected) {
  const oldMap = new Map(before.map((item) => [item.id, item]));
  const newMap = new Map(after.map((item) => [item.id, item]));
  const entries = [];
  for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const previous = oldMap.get(id);
    const current = newMap.get(id);
    if (!previous && current) {
      entries.push(changed(`${prefix}-added`, 'review', id, 'record', 'UNKNOWN', 'added', affected(id)));
      continue;
    }
    if (!current && previous) {
      entries.push(changed(`${prefix}-removed`, 'block', id, 'record', 'present', 'removed', affected(id)));
      continue;
    }
    if (!previous || !current) continue;
    for (const field of fields) {
      if (!same(previous[field], current[field])) {
        entries.push(changed(`${prefix}-field`, classify(field, previous[field], current[field]),
          id, field, previous[field], current[field], affected(id)));
      }
    }
  }
  return entries;
}
function findingFingerprint(item) {
  return `${item.code}|${item.path}|${item.sourceId ?? ''}|${item.handoffId ?? ''}`;
}
export function compareHandoffPacks(before, after, options = {}) {
  const beforeAudit = auditHandoffPack(before, options);
  const afterAudit = auditHandoffPack(after, options);
  const changes = [];
  changes.push(...diffGroup(before.sources, after.sources, 'id', SOURCE_FIELDS,
    'source', severityForSource,
    (id) => [...surfacesForSource(before, id), ...surfacesForSource(after, id),
      ...handoffsForSource(before, id), ...handoffsForSource(after, id)]));
  changes.push(...diffGroup(before.surfaces, after.surfaces, 'id', SURFACE_FIELDS,
    'surface', severityForSurface,
    (id) => [...handoffsForSurface(before, id), ...handoffsForSurface(after, id)]));
  changes.push(...diffGroup(before.handoffs, after.handoffs, 'id', HANDOFF_FIELDS,
    'handoff', severityForHandoff, (id) => [id]));
  for (const field of ['audience', 'purposeEn', 'purposeFr', 'retention', 'contact', 'reviewDate']) {
    if (!same(before.policy[field], after.policy[field])) {
      changes.push(changed('policy-field', ['audience', 'retention'].includes(field) ? 'block' : 'review',
        'policy', field, before.policy[field], after.policy[field], []));
    }
  }
  const beforeFindings = new Map(beforeAudit.findings.map((entry) => [findingFingerprint(entry), entry]));
  const afterFindings = new Map(afterAudit.findings.map((entry) => [findingFingerprint(entry), entry]));
  for (const [key, entry] of afterFindings) {
    if (!beforeFindings.has(key)) {
      changes.push(changed('new-finding', entry.level === 'block' ? 'block' : 'review',
        entry.handoffId ?? entry.sourceId ?? 'release', entry.code, 'absent', 'present', []));
    }
  }
  for (const [key, entry] of beforeFindings) {
    if (!afterFindings.has(key)) {
      changes.push(changed('resolved-finding', 'information',
        entry.handoffId ?? entry.sourceId ?? 'release', entry.code, 'present', 'absent', []));
    }
  }
  changes.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.field.localeCompare(b.field));
  return {
    beforeReleaseId: before.releaseId,
    afterReleaseId: after.releaseId,
    beforeAudit,
    afterAudit,
    changes,
    blocked: afterAudit.blocked || changes.some((entry) => entry.severity === 'block'),
    blockingChanges: changes.filter((entry) => entry.severity === 'block').length,
    reviewChanges: changes.filter((entry) => entry.severity === 'review').length,
  };
}
export function changesForSource(comparison, sourceId) {
  return comparison.changes.filter((entry) => entry.id === sourceId || entry.affected.includes(sourceId));
}
export function changesForHandoff(comparison, handoffId) {
  return comparison.changes.filter((entry) => entry.id === handoffId || entry.affected.includes(handoffId));
}
export function summarizedChanges(comparison) {
  return comparison.changes.reduce((acc, change) => {
    acc[change.kind] = (acc[change.kind] ?? 0) + 1;
    return acc;
  }, {});
}
