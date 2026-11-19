/** Regression-aware before/after comparison: no source facts inferred. */
import { auditObligationRegister } from './obligation-audit.mjs';
export const OBLIGATION_CHANGE_FIELDS = Object.freeze({
  source: ['provider', 'title', 'sourceUrl', 'licenceUrl', 'licenceName', 'licenceId', 'permission', 'tier', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'attribution', 'state'],
  page: ['path', 'locale', 'display', 'sourceIds', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedOn'],
  placement: ['pageId', 'sourceId', 'kind', 'notice', 'elementId', 'visibility', 'nearMap', 'witnessIds'],
  witness: ['sourceId', 'url', 'recordedOn', 'tier', 'type', 'note'],
});
const RISKY_SOURCE = new Set(['provider', 'sourceUrl', 'licenceUrl', 'licenceName', 'licenceId', 'permission', 'tier', 'acquiredOn', 'termsReviewedOn', 'attribution', 'state']);
const RISKY_PAGE = new Set(['path', 'locale', 'display', 'sourceIds', 'offline', 'keyboard', 'screenReader', 'targetPx']);
const RISKY_PLACEMENT = new Set(['pageId', 'sourceId', 'kind', 'notice', 'elementId', 'visibility', 'nearMap', 'witnessIds']);
const RISKY_WITNESS = new Set(['sourceId', 'url', 'recordedOn', 'tier', 'type']);
function display(value) {
  if (Array.isArray(value)) return [...value].sort().join(', ');
  return value === undefined || value === null ? 'UNKNOWN' : String(value);
}
function same(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) return display(left) === display(right);
  return left === right;
}
function severity(type, field, before, after) {
  if (type === 'source') {
    if (field === 'permission' && before !== 'YES' && after === 'YES') return 'review';
    if (field === 'state' && before !== 'included' && after === 'included') return 'review';
    if (field === 'tier' && before === 'UNKNOWN' && after !== 'UNKNOWN') return 'review';
    if (field === 'datasetAsOf') return 'review';
    return RISKY_SOURCE.has(field) ? 'block' : 'review';
  }
  if (type === 'page') {
    if (field === 'targetPx' && typeof before === 'number' && typeof after === 'number' && after >= before) return 'review';
    if (field === 'publishedOn') return 'review';
    if (['offline', 'keyboard', 'screenReader'].includes(field) && before !== 'YES' && after === 'YES') return 'review';
    return RISKY_PAGE.has(field) ? 'block' : 'review';
  }
  if (type === 'placement') {
    if (field === 'visibility' && before !== 'visible' && after === 'visible') return 'review';
    if (field === 'nearMap' && before !== 'YES' && after === 'YES') return 'review';
    return RISKY_PLACEMENT.has(field) ? 'block' : 'review';
  }
  if (type === 'witness') return RISKY_WITNESS.has(field) ? 'block' : 'review';
  return 'review';
}
function auditMap(audit) {
  const result = new Map();
  for (const finding of audit.findings) {
    const key = `${finding.code}:${finding.path}:${finding.sourceId ?? ''}:${finding.pageId ?? ''}`;
    result.set(key, finding);
  }
  return result;
}
function compareCollection(beforeItems, afterItems, type, fields, changes) {
  const beforeMap = new Map(beforeItems.map(x => [x.id, x]));
  const afterMap = new Map(afterItems.map(x => [x.id, x]));
  const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  for (const id of ids) {
    const left = beforeMap.get(id);
    const right = afterMap.get(id);
    if (!left) {
      changes.push({ kind: `${type}-added`, severity: 'review', recordId: id, field: 'id', before: 'UNKNOWN', after: id });
      continue;
    }
    if (!right) {
      changes.push({ kind: `${type}-removed`, severity: 'block', recordId: id, field: 'id', before: id, after: 'UNKNOWN' });
      continue;
    }
    for (const field of fields) {
      if (!same(left[field], right[field])) {
        changes.push({ kind: `${type}-changed`, severity: severity(type, field, left[field], right[field]), recordId: id, field, before: display(left[field]), after: display(right[field]) });
      }
    }
  }
}
export function compareObligationRegisters(before, after, options = {}) {
  const beforeAudit = auditObligationRegister(before, options);
  const afterAudit = auditObligationRegister(after, options);
  const changes = [];
  compareCollection(before.sources, after.sources, 'source', OBLIGATION_CHANGE_FIELDS.source, changes);
  compareCollection(before.pages, after.pages, 'page', OBLIGATION_CHANGE_FIELDS.page, changes);
  compareCollection(before.placements, after.placements, 'placement', OBLIGATION_CHANGE_FIELDS.placement, changes);
  compareCollection(before.witnesses, after.witnesses, 'witness', OBLIGATION_CHANGE_FIELDS.witness, changes);
  const priorIssues = auditMap(beforeAudit);
  const currentIssues = auditMap(afterAudit);
  for (const [key, finding] of currentIssues) {
    if (finding.level === 'block' && !priorIssues.has(key)) {
      changes.push({ kind: 'new-blocker', severity: 'block', recordId: finding.sourceId ?? finding.pageId ?? 'release', field: finding.code, before: 'UNKNOWN', after: finding.detail });
    }
  }
  for (const [key, finding] of priorIssues) {
    if (finding.level === 'block' && !currentIssues.has(key)) {
      changes.push({ kind: 'resolved-blocker', severity: 'review', recordId: finding.sourceId ?? finding.pageId ?? 'release', field: finding.code, before: finding.detail, after: 'UNKNOWN' });
    }
  }
  changes.sort((a, b) => a.recordId.localeCompare(b.recordId) || a.kind.localeCompare(b.kind) || a.field.localeCompare(b.field));
  return {
    beforeRelease: before.releaseId,
    afterRelease: after.releaseId,
    blocked: afterAudit.blocked || changes.some(x => x.severity === 'block'),
    beforeAudit,
    afterAudit,
    changes,
    counts: { blocking: changes.filter(x => x.severity === 'block').length, review: changes.filter(x => x.severity === 'review').length },
  };
}
export function affectedPages(before, after) {
  const changes = compareObligationRegisters(before, after).changes;
  const pages = new Set();
  for (const change of changes) {
    if (change.kind.startsWith('page')) pages.add(change.recordId);
    else if (change.kind.startsWith('source')) {
      for (const page of [...before.pages, ...after.pages]) {
        if (page.sourceIds.includes(change.recordId)) pages.add(page.id);
      }
    } else if (change.kind.startsWith('placement')) {
      for (const placement of [...before.placements, ...after.placements]) {
        if (placement.id === change.recordId) pages.add(placement.pageId);
      }
    } else if (change.kind.startsWith('witness')) {
      for (const placement of [...before.placements, ...after.placements]) {
        if (placement.witnessIds.includes(change.recordId)) pages.add(placement.pageId);
      }
    }
  }
  return [...pages].sort();
}
