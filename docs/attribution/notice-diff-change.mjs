/** Deterministic semantic change detection for attribution notice releases. */
import { auditNoticeRelease } from './notice-diff-audit.mjs';
import { UNKNOWN } from './notice-diff-core.mjs';

export const CHANGE_FIELDS = Object.freeze({
  source: Object.freeze(['provider', 'licence', 'sourceUrl', 'licenceUrl', 'licenceName', 'permission', 'licenceEvidence', 'tier', 'acquiredDate', 'datasetDate', 'termsDate', 'state', 'note']),
  notice: Object.freeze(['sourceId', 'locale', 'kind', 'text', 'visible', 'nearMap', 'termsUrl', 'recordedDate']),
  surface: Object.freeze(['route', 'locale', 'mode', 'sourceIds', 'noticeIds', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedDate']),
});

const HIGH_RISK_SOURCE_FIELDS = new Set(['provider', 'licence', 'sourceUrl', 'licenceUrl', 'licenceName', 'permission', 'licenceEvidence', 'tier', 'termsDate', 'state']);
const HIGH_RISK_NOTICE_FIELDS = new Set(['sourceId', 'locale', 'kind', 'text', 'visible', 'nearMap', 'termsUrl']);
const HIGH_RISK_SURFACE_FIELDS = new Set(['route', 'locale', 'mode', 'sourceIds', 'noticeIds', 'offline', 'keyboard', 'screenReader']);

function valueLabel(value) {
  if (Array.isArray(value)) return [...value].sort().join(', ');
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return UNKNOWN;
  return JSON.stringify(value);
}
function isEqual(before, after) {
  if (Array.isArray(before) && Array.isArray(after)) return before.length === after.length && before.every(v => after.includes(v));
  return before === after;
}
function make(kind, severity, entity, field, before, after, surfaces = []) {
  return Object.freeze({ kind, severity, entity, field, before: valueLabel(before), after: valueLabel(after), affectedSurfaces: Object.freeze([...new Set(surfaces)].sort()) });
}
function indexed(records) { return new Map(records.map(v => [v.id, v])); }
function relatedSurfaces(release, category, identifier) {
  if (category === 'surface') return [identifier];
  if (category === 'source') return release.surfaces.filter(s => s.sourceIds.includes(identifier)).map(s => s.id);
  const notice = release.notices.find(n => n.id === identifier);
  if (!notice) return [];
  return release.surfaces.filter(s => s.noticeIds.includes(identifier) || s.sourceIds.includes(notice.sourceId)).map(s => s.id);
}
function severity(category, field, before, after) {
  if (category === 'source') {
    if (field === 'permission' || field === 'licenceEvidence') return after !== 'YES' ? 'block' : 'review';
    if (field === 'state') return before === 'included' && after !== 'included' ? 'block' : 'review';
    if (field === 'datasetDate') return after === UNKNOWN && before !== UNKNOWN ? 'block' : 'information';
    if (field === 'termsDate') return 'block';
    if (field === 'acquiredDate') return after === UNKNOWN ? 'block' : 'review';
    return HIGH_RISK_SOURCE_FIELDS.has(field) ? 'block' : 'review';
  }
  if (category === 'notice') {
    if (field === 'visible') return after === 'YES' ? 'review' : 'block';
    if (field === 'nearMap') return before === 'YES' && after !== 'YES' ? 'block' : 'review';
    return HIGH_RISK_NOTICE_FIELDS.has(field) ? 'block' : 'review';
  }
  if (category === 'surface') {
    if (field === 'targetPx') {
      if (after === UNKNOWN || (typeof after === 'number' && after < 44)) return 'block';
      if (before === UNKNOWN || (typeof before === 'number' && after >= before)) return 'information';
      return 'review';
    }
    if (field === 'offline' || field === 'keyboard' || field === 'screenReader') return after === 'YES' ? 'information' : 'block';
    if (field === 'publishedDate') return after === UNKNOWN && before !== UNKNOWN ? 'review' : 'information';
    return HIGH_RISK_SURFACE_FIELDS.has(field) ? 'block' : 'review';
  }
  return 'review';
}
function comparisonKey(finding) {
  return `${finding.path}|${finding.code}|${finding.sourceId ?? ''}|${finding.surfaceId ?? ''}`;
}
function entityChanges(kind, previous, current, fields, beforeRelease, afterRelease) {
  const changes = [];
  const before = indexed(previous);
  const after = indexed(current);
  for (const [entity, old] of before) {
    if (!after.has(entity)) {
      const surfaces = relatedSurfaces(beforeRelease, kind, entity);
      changes.push(make(`${kind}-removed`, kind === 'source' && old.state !== 'included' ? 'review' : 'block', entity, 'id', entity, '', surfaces));
    }
  }
  for (const [entity, now] of after) {
    if (!before.has(entity)) {
      changes.push(make(`${kind}-added`, 'review', entity, 'id', '', entity, relatedSurfaces(afterRelease, kind, entity)));
      continue;
    }
    const old = before.get(entity);
    for (const field of fields) {
      if (isEqual(old[field], now[field])) continue;
      const affected = new Set([...relatedSurfaces(beforeRelease, kind, entity), ...relatedSurfaces(afterRelease, kind, entity)]);
      changes.push(make(`${kind}-changed`, severity(kind, field, old[field], now[field]), entity, field, old[field], now[field], [...affected]));
    }
  }
  return changes;
}
export function compareNoticeReleases(previous, current, options = {}) {
  const beforeAudit = auditNoticeRelease(previous, options);
  const afterAudit = auditNoticeRelease(current, options);
  const changes = [
    ...entityChanges('source', previous.sources, current.sources, CHANGE_FIELDS.source, previous, current),
    ...entityChanges('notice', previous.notices, current.notices, CHANGE_FIELDS.notice, previous, current),
    ...entityChanges('surface', previous.surfaces, current.surfaces, CHANGE_FIELDS.surface, previous, current),
  ];
  const priorIssues = new Set(beforeAudit.findings.filter(v => v.level === 'block').map(comparisonKey));
  const nextIssues = new Set(afterAudit.findings.filter(v => v.level === 'block').map(comparisonKey));
  for (const item of afterAudit.findings.filter(v => v.level === 'block')) {
    if (!priorIssues.has(comparisonKey(item))) {
      changes.push(make('new-release-blocker', 'block', item.surfaceId ?? item.sourceId ?? current.releaseId, item.code, '', item.detail, item.surfaceId ? [item.surfaceId] : []));
    }
  }
  for (const item of beforeAudit.findings.filter(v => v.level === 'block')) {
    if (!nextIssues.has(comparisonKey(item))) {
      changes.push(make('resolved-release-blocker', 'information', item.surfaceId ?? item.sourceId ?? previous.releaseId, item.code, item.detail, '', item.surfaceId ? [item.surfaceId] : []));
    }
  }
  changes.sort((a, b) => a.entity.localeCompare(b.entity) || a.field.localeCompare(b.field) || a.kind.localeCompare(b.kind));
  const blocked = afterAudit.blocked || changes.some(v => v.severity === 'block');
  return Object.freeze({
    fromRelease: previous.releaseId, toRelease: current.releaseId, blocked,
    blockCount: changes.filter(v => v.severity === 'block').length,
    reviewCount: changes.filter(v => v.severity === 'review').length,
    informationCount: changes.filter(v => v.severity === 'information').length,
    beforeAudit, afterAudit, changes: Object.freeze(changes),
  });
}
export function impactsForSurface(comparison, surfaceId) {
  return comparison.changes.filter(c => c.affectedSurfaces.includes(surfaceId));
}
export function impactsForSource(comparison, sourceId) {
  return comparison.changes.filter(c => c.entity === sourceId || c.kind === 'notice-changed' && c.affectedSurfaces.length > 0);
}
export function summarizeNoticeChanges(comparison) {
  const counts = { source: 0, notice: 0, surface: 0, other: 0 };
  for (const change of comparison.changes) {
    const category = change.kind.split('-')[0];
    if (Object.hasOwn(counts, category)) counts[category] += 1;
    else counts.other += 1;
  }
  return Object.freeze({ ...counts });
}
