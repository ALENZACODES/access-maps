/** Compare explicitly supplied release documents without guessing changes. */
import { auditClaimTrace } from './claim-trace-audit.mjs';

function asMap(items) { return new Map(items.map((item) => [item.id, item])); }
function stringValue(value) { return Array.isArray(value) ? [...value].sort().join(', ') : String(value); }
function assess(before, after, field, entity) {
  if (before === after) return 'info';
  if (field === 'state' || field === 'status') return after === 'included' ? 'attention' : 'block';
  if (field === 'permission') return after === 'YES' ? 'attention' : 'block';
  if (field === 'tier') return after === 'UNKNOWN' ? 'block' : 'attention';
  if (field === 'sourceIds' || field === 'referenceIds' || field === 'claimIds') {
    const old = new Set(before);
    return [...old].some((id) => !after.includes(id)) ? 'block' : 'attention';
  }
  if (field === 'targetPx') {
    if (after === 'UNKNOWN') return 'block';
    if (before === 'UNKNOWN') return 'attention';
    return after < before ? 'block' : 'attention';
  }
  if (['offline', 'keyboard', 'screenReader', 'mapCredit'].includes(field)) return after === 'YES' ? 'attention' : 'block';
  if (['notice', 'licence', 'licenceUrl', 'url', 'observedDate', 'acquiredDate', 'termsDate', 'datasetDate'].includes(field)) {
    return after === 'UNKNOWN' || after === '' ? 'block' : entity === 'source' ? 'attention' : 'block';
  }
  if (field === 'language' || field === 'route' || field === 'text') return 'block';
  return 'attention';
}

function compareGroup(before, after, kind, changes) {
  const past = asMap(before);
  const next = asMap(after);
  const allIds = [...new Set([...past.keys(), ...next.keys()])].sort();
  for (const id of allIds) {
    const old = past.get(id);
    const newer = next.get(id);
    if (!old) { changes.push({ kind: `${kind}-added`, id, field: '*', before: 'UNKNOWN', after: 'present', level: 'attention' }); continue; }
    if (!newer) { changes.push({ kind: `${kind}-removed`, id, field: '*', before: 'present', after: 'absent', level: 'block' }); continue; }
    for (const key of Object.keys(old)) {
      if (key === 'id') continue;
      if (JSON.stringify(old[key]) === JSON.stringify(newer[key])) continue;
      changes.push({ kind: `${kind}-changed`, id, field: key, before: stringValue(old[key]), after: stringValue(newer[key]), level: assess(old[key], newer[key], key, kind) });
    }
  }
}

export function compareClaimTraces(before, after) {
  const beforeAudit = auditClaimTrace(before);
  const afterAudit = auditClaimTrace(after);
  const changes = [];
  compareGroup(before.sources, after.sources, 'source', changes);
  compareGroup(before.references, after.references, 'reference', changes);
  compareGroup(before.claims, after.claims, 'claim', changes);
  compareGroup(before.surfaces, after.surfaces, 'surface', changes);
  const beforeFindings = new Set(beforeAudit.findings.filter((f) => f.level === 'block').map((f) => `${f.code}|${f.path}`));
  const afterFindings = new Set(afterAudit.findings.filter((f) => f.level === 'block').map((f) => `${f.code}|${f.path}`));
  const introduced = [...afterFindings].filter((key) => !beforeFindings.has(key)).sort();
  const resolved = [...beforeFindings].filter((key) => !afterFindings.has(key)).sort();
  changes.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.field.localeCompare(b.field));
  return {
    schema: 'attribution-claim-change/1', beforeReleaseId: before.releaseId,
    afterReleaseId: after.releaseId,
    blocked: afterAudit.blocked || changes.some((item) => item.level === 'block') || introduced.length > 0,
    changes, introduced, resolved, beforeAudit, afterAudit,
  };
}

export function summaryByKind(comparison) {
  const totals = {};
  for (const item of comparison.changes) totals[item.kind] = (totals[item.kind] ?? 0) + 1;
  return totals;
}
