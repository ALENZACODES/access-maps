/** Stable, field-level comparison of evidence dockets; missing values remain explicit. */
import { auditDocket } from './docket-audit.mjs';

const SOURCE_FIELDS = ['provider', 'name', 'licence', 'licenceName', 'sourceUrl', 'licenceUrl',
  'permission', 'licenceEvidence', 'datasetDate', 'acquiredOn', 'termsReviewedOn',
  'reviewDueOn', 'notice', 'tier', 'state', 'evidenceIds'];
const EVIDENCE_FIELDS = ['sourceId', 'title', 'url', 'tier', 'observedOn', 'recordedOn', 'licenceUrl', 'summary'];
const SURFACE_FIELDS = ['title', 'locale', 'kind', 'sourceIds', 'offline', 'mapCredit',
  'keyboard', 'screenReader', 'targetPx', 'publishedOn'];
const DECISION_FIELDS = ['sourceId', 'state', 'decidedOn', 'reason', 'evidenceIds', 'actorRole'];
const IMPORTANT_FIELDS = new Set(['licence', 'licenceName', 'licenceUrl', 'permission',
  'licenceEvidence', 'notice', 'state', 'sourceId', 'sourceIds', 'evidenceIds',
  'offline', 'mapCredit', 'keyboard', 'screenReader', 'targetPx', 'tier', 'url', 'sourceUrl', 'reviewDueOn']);
const snapshot = (value) => Array.isArray(value) ? [...value].sort().join(', ') : String(value);
const mapById = (items) => new Map(items.map((item) => [item.id, item]));
function change(kind, severity, recordId, field, before, after) {
  return { kind, severity, recordId, field, before, after };
}
function compareCollection(kind, before, after, fields, output) {
  const old = mapById(before);
  const next = mapById(after);
  const ids = [...new Set([...old.keys(), ...next.keys()])].sort();
  for (const id of ids) {
    const former = old.get(id);
    const current = next.get(id);
    if (!former) {
      output.push(change(`${kind}-added`, 'review', id, 'id', 'UNKNOWN', id));
      continue;
    }
    if (!current) {
      output.push(change(`${kind}-removed`, 'block', id, 'id', id, 'UNKNOWN'));
      continue;
    }
    for (const field of fields) {
      const left = snapshot(former[field]);
      const right = snapshot(current[field]);
      if (left === right) continue;
      let severity = IMPORTANT_FIELDS.has(field) ? 'block' : 'review';
      if (field === 'targetPx' && typeof current.targetPx === 'number' &&
          typeof former.targetPx === 'number' && current.targetPx >= former.targetPx) {
        severity = 'review';
      }
      if (field === 'reviewDueOn' && right > left && left !== 'UNKNOWN') severity = 'review';
      if (field === 'datasetDate' && right > left && left !== 'UNKNOWN') severity = 'review';
      if (field === 'publishedOn' && right > left && left !== 'UNKNOWN') severity = 'review';
      if (field === 'termsReviewedOn' && right > left && left !== 'UNKNOWN') severity = 'review';
      if (field === 'permission' && right === 'YES' && left !== 'YES') severity = 'review';
      if (field === 'licenceEvidence' && right === 'YES' && left !== 'YES') severity = 'review';
      if (field === 'offline' && right === 'YES' && left !== 'YES') severity = 'review';
      if (field === 'keyboard' && right === 'YES' && left !== 'YES') severity = 'review';
      if (field === 'screenReader' && right === 'YES' && left !== 'YES') severity = 'review';
      if (field === 'mapCredit' && right === 'YES' && left !== 'YES') severity = 'review';
      output.push(change(`${kind}-field`, severity, id, field, left, right));
    }
  }
}
export function compareDockets(before, after) {
  const changes = [];
  compareCollection('source', before.sources, after.sources, SOURCE_FIELDS, changes);
  compareCollection('evidence', before.evidence, after.evidence, EVIDENCE_FIELDS, changes);
  compareCollection('surface', before.surfaces, after.surfaces, SURFACE_FIELDS, changes);
  compareCollection('decision', before.decisions, after.decisions, DECISION_FIELDS, changes);
  const baseline = auditDocket(before);
  const candidate = auditDocket(after);
  const beforeFindingKeys = new Set(baseline.findings.filter((f) => f.severity === 'block')
    .map((f) => `${f.code}:${f.path}:${f.subject}`));
  const newBlockers = candidate.findings.filter((f) => f.severity === 'block' &&
    !beforeFindingKeys.has(`${f.code}:${f.path}:${f.subject}`));
  for (const f of newBlockers) {
    changes.push(change('new-blocker', 'block', f.subject, f.code, 'UNKNOWN', f.detail));
  }
  changes.sort((a, b) => a.recordId.localeCompare(b.recordId) || a.field.localeCompare(b.field) || a.kind.localeCompare(b.kind));
  return {
    beforeReleaseId: before.releaseId,
    afterReleaseId: after.releaseId,
    blocked: candidate.blocked || changes.some((item) => item.severity === 'block'),
    changes,
    newBlockers: newBlockers.length,
    baselineBlocked: baseline.blocked,
    candidateBlocked: candidate.blocked,
  };
}
