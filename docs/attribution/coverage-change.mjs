/** Field-level comparison, with regressions requiring explicit review. */
import { auditCoverage } from './coverage-audit.mjs';

const SOURCE_FIELDS = ['provider', 'title', 'sourceUrl', 'licenceUrl', 'licenceKind', 'licenceName', 'permission',
  'evidenceTier', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'attribution', 'notes', 'state'];
const VIEW_FIELDS = ['title', 'kind', 'language', 'sourceIds', 'state', 'offline', 'keyboard', 'screenReader',
  'mapCredit', 'minimumTargetPx', 'publishedOn', 'notes'];
const SOURCE_CRITICAL = new Set(['provider', 'sourceUrl', 'licenceUrl', 'licenceKind', 'licenceName', 'permission',
  'evidenceTier', 'acquiredOn', 'termsReviewedOn', 'attribution', 'state']);
const VIEW_CRITICAL = new Set(['sourceIds', 'state', 'offline', 'keyboard', 'screenReader', 'mapCredit', 'minimumTargetPx']);
const stringify = (value) => Array.isArray(value) ? [...value].sort().join(', ') : String(value);

export function compareCoverage(previous, candidate, options = {}) {
  const before = auditCoverage(previous, options);
  const after = auditCoverage(candidate, options);
  const changes = [];
  const push = (kind, id, field, from, to, blocking) => {
    changes.push(Object.freeze({kind, id, field, before: from, after: to, blocking}));
  };
  for (const [kind, beforeItems, afterItems, fields, critical] of [
    ['source', previous.sources, candidate.sources, SOURCE_FIELDS, SOURCE_CRITICAL],
    ['view', previous.views, candidate.views, VIEW_FIELDS, VIEW_CRITICAL],
  ]) {
    const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
    const afterById = new Map(afterItems.map((item) => [item.id, item]));
    for (const item of beforeItems) {
      const updated = afterById.get(item.id);
      if (!updated) { push(kind, item.id, 'removed', 'present', 'missing', item.state === 'included'); continue; }
      for (const field of fields) {
        const a = stringify(item[field]);
        const b = stringify(updated[field]);
        if (a === b) continue;
        const disappearing = item.state === 'included' && (b === 'UNKNOWN' || b === 'NO' || b === 'excluded' || b === 'held' || b === '');
        const smaller = field === 'minimumTargetPx' && typeof item[field] === 'number' &&
          (typeof updated[field] !== 'number' || updated[field] < item[field]);
        const lostReferences = field === 'sourceIds' && item[field].some((value) => !updated[field].includes(value));
        const blocking = (disappearing || smaller || lostReferences) ||
          (item.state === 'included' && updated.state === 'included' && critical.has(field) &&
            !['title', 'notes', 'datasetAsOf', 'minimumTargetPx'].includes(field));
        push(kind, item.id, field, a, b, blocking);
      }
    }
    for (const item of afterItems) if (!beforeById.has(item.id)) push(kind, item.id, 'added', 'missing', 'present', false);
  }
  const beforeCodes = new Set(before.findings.filter((f) => f.level === 'block').map((f) => `${f.path}/${f.code}`));
  const introduced = after.findings.filter((f) => f.level === 'block' && !beforeCodes.has(`${f.path}/${f.code}`));
  changes.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.field.localeCompare(b.field));
  return Object.freeze({beforeReleaseId: previous.releaseId, afterReleaseId: candidate.releaseId,
    blocked: after.blocked || changes.some((c) => c.blocking) || introduced.length > 0,
    before, after, newBlockers: Object.freeze(introduced), changes: Object.freeze(changes)});
}
