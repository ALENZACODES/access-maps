/** Field-level change tracking with release gates and downstream blast radius. */
import { graphIndex, impactedViews } from './distribution-graph.mjs';
import { auditDistribution } from './distribution-audit.mjs';
import { UNKNOWN } from './distribution-core.mjs';

const SOURCE_FIELDS = ['provider', 'name', 'sourceUrl', 'licenceName', 'licenceUrl', 'permission', 'licenceEvidence', 'tier', 'datasetDate', 'acquiredDate', 'termsDate', 'notice', 'state'];
const ASSET_FIELDS = ['path', 'kind', 'sourceIds', 'dependencyIds', 'state', 'bytes', 'sha256'];
const VIEW_FIELDS = ['path', 'locale', 'assetIds', 'sourceIds', 'noticeText', 'noticeVisible', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedDate'];
const blockingSource = new Set(['provider', 'sourceUrl', 'licenceName', 'licenceUrl', 'permission', 'licenceEvidence', 'tier', 'termsDate', 'notice', 'state']);
const blockingAsset = new Set(['path', 'kind', 'sourceIds', 'dependencyIds', 'state', 'bytes', 'sha256']);
const blockingView = new Set(['path', 'locale', 'assetIds', 'sourceIds', 'noticeText', 'noticeVisible', 'offline', 'keyboard', 'screenReader']);
const comparable = value => Array.isArray(value) ? [...value].sort().join(', ') : String(value);
const differs = (a, b) => comparable(a) !== comparable(b);
function comparisonSeverity(kind, field, before, after) {
  if (kind === 'source' && blockingSource.has(field)) return 'block';
  if (kind === 'asset' && blockingAsset.has(field)) return 'block';
  if (kind === 'view' && blockingView.has(field)) return 'block';
  if (field === 'targetPx') return before === UNKNOWN || after === UNKNOWN || after < before ? 'block' : 'info';
  if (field === 'datasetDate' || field === 'publishedDate') return after === UNKNOWN && before !== UNKNOWN ? 'block' : 'review';
  return 'review';
}
function collect(kind, beforeRecords, afterRecords, fields, changes, affected) {
  const before = new Map(beforeRecords.map(item => [item.id, item]));
  const after = new Map(afterRecords.map(item => [item.id, item]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of [...ids].sort()) {
    const left = before.get(id);
    const right = after.get(id);
    const dependent = affected(kind, id);
    if (!left) {
      changes.push({ kind, id, field: 'record', severity: 'review', before: UNKNOWN, after: 'ADDED', affectedViews: dependent });
      continue;
    }
    if (!right) {
      changes.push({ kind, id, field: 'record', severity: 'block', before: 'PRESENT', after: 'REMOVED', affectedViews: dependent });
      continue;
    }
    for (const field of fields) {
      if (!differs(left[field], right[field])) continue;
      changes.push({ kind, id, field, severity: comparisonSeverity(kind, field, left[field], right[field]), before: comparable(left[field]), after: comparable(right[field]), affectedViews: dependent });
    }
  }
}
export function compareDistributions(before, after, options = {}) {
  const earlier = auditDistribution(before, options);
  const current = auditDistribution(after, options);
  const changes = [];
  const viewUses = (kind, id) => {
    if (kind === 'view') return [id];
    return [...new Set([...impactedViews(before, kind === 'source' ? [id] : [], kind === 'asset' ? [id] : []), ...impactedViews(after, kind === 'source' ? [id] : [], kind === 'asset' ? [id] : [])])].sort();
  };
  collect('source', before.sources, after.sources, SOURCE_FIELDS, changes, viewUses);
  collect('asset', before.assets, after.assets, ASSET_FIELDS, changes, viewUses);
  collect('view', before.views, after.views, VIEW_FIELDS, changes, viewUses);
  const oldBlocks = new Set(earlier.findings.filter(f => f.level === 'block').map(f => `${f.code}|${f.path}|${f.sourceId ?? ''}`));
  const newBlocks = new Set(current.findings.filter(f => f.level === 'block').map(f => `${f.code}|${f.path}|${f.sourceId ?? ''}`));
  const newlyBlocking = [...newBlocks].filter(key => !oldBlocks.has(key)).sort();
  const resolved = [...oldBlocks].filter(key => !newBlocks.has(key)).sort();
  changes.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.field.localeCompare(b.field));
  return {
    beforeId: before.releaseId, afterId: after.releaseId,
    blocked: current.blocked || changes.some(c => c.severity === 'block') || newlyBlocking.length > 0,
    changes, newlyBlocking, resolved, previousAudit: earlier, currentAudit: current,
  };
}
export function affectedSourceUsage(manifest, sourceId) {
  const index = graphIndex(manifest);
  if (!index.sources.has(sourceId)) return [];
  return impactedViews(manifest, [sourceId]);
}
export function impactSummary(comparison) {
  const result = new Map();
  for (const change of comparison.changes) {
    for (const viewId of change.affectedViews) {
      if (!result.has(viewId)) result.set(viewId, { viewId, blocks: 0, reviews: 0, information: 0, affectedSources: new Set(), affectedAssets: new Set() });
      const entry = result.get(viewId);
      if (change.severity === 'block') entry.blocks += 1;
      else if (change.severity === 'review') entry.reviews += 1;
      else entry.information += 1;
      if (change.kind === 'source') entry.affectedSources.add(change.id);
      if (change.kind === 'asset') entry.affectedAssets.add(change.id);
    }
  }
  return [...result.values()].map(entry => ({ ...entry, affectedSources: [...entry.affectedSources].sort(), affectedAssets: [...entry.affectedAssets].sort() })).sort((a, b) => a.viewId.localeCompare(b.viewId));
}
