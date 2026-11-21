/** Offline publication history: no network, storage, or implicit access inference. */
import {
  ACCESS, ageWithin, array, calendar, digest, hasExactly, held, identifier,
  inspectBilingual, inspectSource, label, makeAudit, maxInput, object, safeInteger,
  sameStamp, siloOf, stamp, stampKey, unique, validRoot,
} from './p15k-core.mjs';

const FEATURES = Object.freeze(['entrance', 'washroom', 'parking', 'lift', 'path', 'surface', 'transfer']);
const EVENTS = Object.freeze(['OBSERVED', 'CORRECTED', 'WITHDRAWN']);
const STATES = Object.freeze(['DRAFT', 'READY', 'PUBLISHED', 'RETIRED']);

export function observationShape(value) {
  return hasExactly(value, ['id', 'placeId', 'feature', 'kind', 'access', 'recordedOn', 'source', 'silo', 'reason'], ['supersedes']) &&
    identifier(value.id) && identifier(value.placeId) && FEATURES.includes(value.feature) &&
    EVENTS.includes(value.kind) && ACCESS.includes(value.access) && calendar(value.recordedOn) !== null &&
    stamp(value.source) && ['open', 'odbl'].includes(value.silo) &&
    hasExactly(value.reason, ['en', 'fr']) &&
    (value.supersedes === undefined || identifier(value.supersedes));
}
export function decisionShape(value) {
  return hasExactly(value, ['placeId', 'feature', 'access', 'observationIds', 'source', 'silo']) &&
    identifier(value.placeId) && FEATURES.includes(value.feature) && ACCESS.includes(value.access) &&
    array(value.observationIds, 1000) !== null && value.observationIds.every(identifier) &&
    (value.source === null || stamp(value.source)) && ['open', 'odbl'].includes(value.silo);
}
export function eventShape(value) {
  return hasExactly(value, ['id', 'state', 'at', 'sourceDigest', 'reason']) &&
    identifier(value.id) && STATES.includes(value.state) && calendar(value.at) !== null &&
    digest(value.sourceDigest) && hasExactly(value.reason, ['en', 'fr']);
}
function scope(record) { return `${record.placeId}/${record.feature}`; }
function recordPolicy(input) {
  return validRoot(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'observations', 'decisions', 'events']) &&
    calendar(input.asOf) !== null && safeInteger(input.maxAgeDays, 36500) &&
    array(input.observations) && array(input.decisions) && array(input.events);
}
function activeObservations(records) {
  const replaced = new Set(records.map(item => item.supersedes).filter(Boolean));
  return records.filter(item => !replaced.has(item.id) && item.kind !== 'WITHDRAWN');
}
function expectedAccess(records) {
  if (!records.length) return 'UNKNOWN';
  const states = new Set(records.map(item => item.access));
  return states.size === 1 ? records[0].access : 'UNKNOWN';
}
function chainIssue(record, byId) {
  const seen = new Set([record.id]);
  let current = record;
  while (current.supersedes) {
    const previous = byId.get(current.supersedes);
    if (!previous || seen.has(previous.id)) return true;
    seen.add(previous.id);
    if (scope(previous) !== scope(record)) return true;
    if (calendar(previous.recordedOn) > calendar(current.recordedOn)) return true;
    if (current.kind === 'OBSERVED') return true;
    current = previous;
  }
  return record.kind !== 'OBSERVED' && !record.supersedes;
}
export function auditHistory(input) {
  const audit = makeAudit();
  const totals = { observations: 0, decisions: 0, events: 0, unknown: 0, conflicts: 0, held: 0 };
  if (!recordPolicy(input)) { audit.add('SHAPE', '$'); return audit.finish(totals); }
  if (!maxInput(input, audit)) return audit.finish(totals);
  totals.observations = input.observations.length;
  totals.decisions = input.decisions.length;
  totals.events = input.events.length;
  const byId = new Map();
  const groups = new Map();
  input.observations.forEach((record, index) => {
    const path = `$.observations[${index}]`;
    if (!observationShape(record)) { audit.add('SHAPE', path); return; }
    if (byId.has(record.id)) audit.add('DUPLICATE', `${path}.id`);
    byId.set(record.id, record);
    inspectBilingual(record.reason, audit, `${path}.reason`, 280);
    if (held(record.source.source)) { audit.add('HELD', path); totals.held++; }
    inspectSource(record.source, audit, `${path}.source`, input);
    if (!ageWithin(record.recordedOn, input.asOf, input.maxAgeDays)) audit.add('STALE', `${path}.recordedOn`);
    if (calendar(record.source.observedOn) > calendar(record.recordedOn)) audit.add('ORDER', `${path}.source`);
    if (record.silo !== siloOf([record.source])) audit.add('SILO', `${path}.silo`);
    if (record.kind === 'WITHDRAWN' && record.access !== 'UNKNOWN') audit.add('UNKNOWN', path);
    const key = scope(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  for (const record of byId.values()) {
    if (chainIssue(record, byId)) audit.add('ORDER', `$.observations.${record.id}.supersedes`);
  }
  const decisions = new Map();
  input.decisions.forEach((decision, index) => {
    const path = `$.decisions[${index}]`;
    if (!decisionShape(decision)) { audit.add('SHAPE', path); return; }
    const key = scope(decision);
    if (decisions.has(key)) audit.add('DUPLICATE', path);
    decisions.set(key, decision);
    if (!unique(decision.observationIds)) audit.add('DUPLICATE', `${path}.observationIds`);
    const records = decision.observationIds.map(id => byId.get(id));
    if (records.some(record => !record || scope(record) !== key)) {
      audit.add('REFERENCE', path); return;
    }
    const scoped = records.filter(Boolean);
    if (scoped.length !== (groups.get(key) ?? []).length) audit.add('REFERENCE', `${path}.observationIds`);
    const active = activeObservations(scoped);
    const expected = expectedAccess(active);
    if (expected === 'UNKNOWN') totals.unknown++;
    if (active.some(item => item.access === 'YES') && active.some(item => item.access === 'NO')) totals.conflicts++;
    if (decision.access !== expected) audit.add(expected === 'UNKNOWN' ? 'UNKNOWN' : 'EVIDENCE', `${path}.access`);
    if (decision.silo !== siloOf(scoped.map(item => item.source))) audit.add('SILO', `${path}.silo`);
    if (decision.access === 'UNKNOWN') {
      if (decision.source && !active.some(item => sameStamp(item.source, decision.source))) audit.add('EVIDENCE', `${path}.source`);
    } else if (!decision.source || !active.some(item => item.access === decision.access && sameStamp(item.source, decision.source))) {
      audit.add('EVIDENCE', `${path}.source`);
    }
  });
  for (const key of groups.keys()) if (!decisions.has(key)) audit.add('REFERENCE', `$.decisions.${key}`);
  let lastDate = null;
  let previous = null;
  const eventIds = new Set();
  input.events.forEach((event, index) => {
    const path = `$.events[${index}]`;
    if (!eventShape(event)) { audit.add('SHAPE', path); return; }
    inspectBilingual(event.reason, audit, `${path}.reason`, 280);
    if (eventIds.has(event.id)) audit.add('DUPLICATE', path);
    eventIds.add(event.id);
    if (calendar(event.at) > calendar(input.asOf)) audit.add('DATE', `${path}.at`);
    if (lastDate !== null && calendar(event.at) < lastDate) audit.add('ORDER', path);
    if (previous === 'PUBLISHED' && event.state === 'DRAFT') audit.add('ORDER', path);
    if (previous === 'RETIRED') audit.add('ORDER', path);
    if (previous === null && event.state !== 'DRAFT') audit.add('ORDER', path);
    if (previous === 'DRAFT' && !['DRAFT', 'READY'].includes(event.state)) audit.add('ORDER', path);
    if (previous === 'READY' && !['READY', 'PUBLISHED', 'DRAFT'].includes(event.state)) audit.add('ORDER', path);
    lastDate = calendar(event.at);
    previous = event.state;
  });
  return audit.finish(totals);
}
export function compareHistory(before, after) {
  const audit = makeAudit();
  const oldReport = auditHistory(before);
  const newReport = auditHistory(after);
  if (!oldReport.ok || !newReport.ok) {
    audit.add('SHAPE', '$'); return audit.finish({ before: oldReport, after: newReport });
  }
  if (calendar(after.asOf) < calendar(before.asOf)) audit.add('ORDER', '$.asOf');
  const oldRecords = new Map(before.observations.map(item => [item.id, item]));
  const nextRecords = new Map(after.observations.map(item => [item.id, item]));
  for (const [id, item] of oldRecords) {
    const current = nextRecords.get(id);
    if (!current) { audit.add('REMOVAL', `$.observations.${id}`); continue; }
    if (JSON.stringify(item) !== JSON.stringify(current)) audit.add('DRIFT', `$.observations.${id}`);
  }
  const oldDecisions = new Map(before.decisions.map(item => [scope(item), item]));
  const nextDecisions = new Map(after.decisions.map(item => [scope(item), item]));
  for (const [key, item] of oldDecisions) {
    const current = nextDecisions.get(key);
    if (!current) { audit.add('REMOVAL', `$.decisions.${key}`); continue; }
    if (item.access === 'UNKNOWN' && current.access !== 'UNKNOWN') {
      const previousIds = new Set(item.observationIds);
      const novel = current.observationIds.some(id => !previousIds.has(id));
      if (!novel) audit.add('EVIDENCE', `$.decisions.${key}.access`);
    }
  }
  for (const [key, item] of nextDecisions) {
    if (!oldDecisions.has(key) && item.access !== 'UNKNOWN' && !item.observationIds.length) {
      audit.add('EVIDENCE', `$.decisions.${key}`);
    }
  }
  return audit.finish({ oldObservations: oldRecords.size, newObservations: nextRecords.size,
    oldDecisions: oldDecisions.size, newDecisions: nextDecisions.size });
}
