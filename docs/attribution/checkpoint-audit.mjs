/** Licence and editorial checkpoint audit. No provider status is inferred. */
import { parseCheckpoint } from './checkpoint-core.mjs';
export const CHECKPOINT_LEVELS = Object.freeze(['block', 'attention', 'info']);
const NOTICE_CODES = Object.freeze(['NOTICE_MISSING', 'NOTICE_NOT_SHOWN']);
function finding(code, level, path, detail, sourceId = null, surfaceId = null) {
  return { code, level, path, detail, sourceId, surfaceId };
}
function known(value) { return value !== 'UNKNOWN'; }
function emitUnknown(add, field, value, path, sourceId) {
  if (!known(value)) add(`${field.toUpperCase()}_UNKNOWN`, 'block', path, 'Required evidence is UNKNOWN', sourceId);
}
export function auditCheckpoint(input, options = {}) {
  const checkpoint = parseCheckpoint(input);
  const findings = [];
  const add = (code, level, path, detail, sourceId = null, surfaceId = null) => findings.push(finding(code, level, path, detail, sourceId, surfaceId));
  const requireOffline = options.requireOffline !== false;
  const minTarget = options.minimumTargetPx ?? 44;
  if (!Number.isSafeInteger(minTarget) || minTarget < 44 || minTarget > 1000) throw new RangeError('minimumTargetPx must be an integer >=44');
  const bySource = new Map(checkpoint.sources.map(s => [s.id, s]));
  const referenced = new Set();
  if (!checkpoint.sources.length) add('NO_SOURCES', 'block', 'sources', 'No source evidence was supplied');
  if (!checkpoint.surfaces.length) add('NO_SURFACES', 'block', 'surfaces', 'No publication surfaces were supplied');
  for (const [i, source] of checkpoint.sources.entries()) {
    const path = `sources[${i}]`;
    if (source.publication !== 'included') continue;
    if (source.permission !== 'YES') add('PERMISSION_NOT_YES', 'block', `${path}.permission`, source.permission, source.id);
    if (source.decision !== 'accepted') add('DECISION_PENDING', 'block', `${path}.decision`, source.decision, source.id);
    if (source.evidenceTier === 'UNKNOWN') add('TIER_UNKNOWN', 'block', `${path}.evidenceTier`, 'Evidence tier is UNKNOWN', source.id);
    emitUnknown(add, 'source_url', source.sourceUrl, `${path}.sourceUrl`, source.id);
    emitUnknown(add, 'licence_url', source.licenceUrl, `${path}.licenceUrl`, source.id);
    emitUnknown(add, 'evidence_url', source.evidenceUrl, `${path}.evidenceUrl`, source.id);
    emitUnknown(add, 'terms_date', source.termsDate, `${path}.termsDate`, source.id);
    emitUnknown(add, 'acquisition_date', source.acquisitionDate, `${path}.acquisitionDate`, source.id);
    emitUnknown(add, 'decision_date', source.decisionDate, `${path}.decisionDate`, source.id);
    if (!source.notice.trim()) add('NOTICE_MISSING', 'block', `${path}.notice`, 'Attribution notice missing', source.id);
    if (!source.decisionReason.trim()) add('DECISION_REASON_MISSING', 'block', `${path}.decisionReason`, 'Reason for decision missing', source.id);
    if (source.datasetDate === 'UNKNOWN') add('DATASET_DATE_UNKNOWN', 'info', `${path}.datasetDate`, 'Dataset date UNKNOWN', source.id);
    if (checkpoint.comparisonDate !== 'UNKNOWN') {
      for (const field of ['termsDate', 'acquisitionDate', 'decisionDate', 'datasetDate']) {
        if (known(source[field]) && source[field] > checkpoint.comparisonDate) add('FUTURE_EVIDENCE_DATE', 'block', `${path}.${field}`, 'Evidence date later than supplied comparison date', source.id);
      }
    }
    if (known(source.termsDate) && known(source.decisionDate) && source.decisionDate < source.termsDate) {
      add('DECISION_PRECEDES_TERMS', 'block', `${path}.decisionDate`, 'Decision predates recorded terms review', source.id);
    }
    if (source.sourceUrl !== 'UNKNOWN' && source.evidenceUrl === source.sourceUrl) {
      add('SAME_REFERENCE_URL', 'attention', `${path}.evidenceUrl`, 'Evidence URL matches source URL; inspect supporting record', source.id);
    }
  }
  for (const [i, surface] of checkpoint.surfaces.entries()) {
    const path = `surfaces[${i}]`;
    if (!surface.sourceIds.length) add('SURFACE_NO_SOURCES', 'block', `${path}.sourceIds`, 'No linked sources', null, surface.id);
    if (requireOffline && surface.offline !== 'YES') add('OFFLINE_NOT_YES', 'block', `${path}.offline`, surface.offline, null, surface.id);
    if (surface.keyboard !== 'YES') add('KEYBOARD_NOT_YES', 'block', `${path}.keyboard`, surface.keyboard, null, surface.id);
    if (surface.screenReader !== 'YES') add('SCREEN_READER_NOT_YES', 'block', `${path}.screenReader`, surface.screenReader, null, surface.id);
    if (surface.targetPx === 'UNKNOWN') add('TARGET_UNKNOWN', 'block', `${path}.targetPx`, 'Target size UNKNOWN', null, surface.id);
    else if (surface.targetPx < minTarget) add('TARGET_TOO_SMALL', 'block', `${path}.targetPx`, `${surface.targetPx} < ${minTarget}`, null, surface.id);
    if (surface.publicationDate === 'UNKNOWN') add('PUBLICATION_DATE_UNKNOWN', 'info', `${path}.publicationDate`, 'Publication date UNKNOWN', null, surface.id);
    if (checkpoint.comparisonDate !== 'UNKNOWN' && known(surface.publicationDate) && surface.publicationDate > checkpoint.comparisonDate) add('FUTURE_PUBLICATION_DATE', 'block', `${path}.publicationDate`, surface.publicationDate, null, surface.id);
    for (const sourceId of surface.sourceIds) {
      const record = bySource.get(sourceId);
      if (!record) { add('SOURCE_NOT_FOUND', 'block', `${path}.sourceIds`, sourceId, sourceId, surface.id); continue; }
      referenced.add(sourceId);
      if (record.publication !== 'included') add('SOURCE_NOT_INCLUDED', 'block', `${path}.sourceIds`, record.publication, sourceId, surface.id);
      // Map-credit evidence only applies when explicit map display evidence exists;
      // a provider name cannot establish that a surface includes a map.
      if (surface.mode === 'map' && surface.mapCredit !== 'YES') add('MAP_CREDIT_NOT_YES', 'block', `${path}.mapCredit`, surface.mapCredit, sourceId, surface.id);
    }
  }
  for (const source of checkpoint.sources) if (source.publication === 'included' && !referenced.has(source.id)) {
    add('INCLUDED_SOURCE_UNUSED', 'attention', `sources.${source.id}`, 'Included source has no surface', source.id);
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  return {
    releaseId: checkpoint.releaseId,
    blocked: findings.some(f => f.level === 'block'),
    blockingCount: findings.filter(f => f.level === 'block').length,
    attentionCount: findings.filter(f => f.level === 'attention').length,
    informationCount: findings.filter(f => f.level === 'info').length,
    sourceCount: checkpoint.sources.length,
    surfaceCount: checkpoint.surfaces.length,
    findings,
  };
}

export function compareCheckpoints(beforeInput, afterInput, options = {}) {
  const before = parseCheckpoint(beforeInput);
  const after = parseCheckpoint(afterInput);
  const changes = [];
  const append = (code, blocking, path, earlier, later) => changes.push({ code, blocking, path, before: String(earlier), after: String(later) });
  const oldSources = new Map(before.sources.map(s => [s.id, s]));
  const newSources = new Map(after.sources.map(s => [s.id, s]));
  for (const oldSource of before.sources) {
    const current = newSources.get(oldSource.id);
    if (!current) { append('SOURCE_REMOVED', oldSource.publication === 'included', `sources.${oldSource.id}`, 'present', 'absent'); continue; }
    for (const key of ['sourceUrl', 'licenceUrl', 'licenceName', 'evidenceUrl', 'permission', 'evidenceTier', 'termsDate', 'decision', 'notice', 'publication']) {
      if (oldSource[key] !== current[key]) {
        const critical = ['licenceUrl', 'licenceName', 'permission', 'notice', 'decision', 'publication', 'sourceUrl'].includes(key);
        const downgrade = key === 'permission' ? oldSource.permission === 'YES' && current.permission !== 'YES'
          : key === 'decision' ? oldSource.decision === 'accepted' && current.decision !== 'accepted'
          : key === 'evidenceTier' ? oldSource.evidenceTier !== 'UNKNOWN' && current.evidenceTier === 'UNKNOWN'
          : oldSource[key] !== 'UNKNOWN' && current[key] === 'UNKNOWN';
        append('SOURCE_' + key.toUpperCase(), oldSource.publication === 'included' && (critical || downgrade), `sources.${oldSource.id}.${key}`, oldSource[key], current[key]);
      }
    }
  }
  for (const source of after.sources) if (!oldSources.has(source.id)) append('SOURCE_ADDED', false, `sources.${source.id}`, 'absent', 'present');
  const oldSurfaces = new Map(before.surfaces.map(s => [s.id, s]));
  const newSurfaces = new Map(after.surfaces.map(s => [s.id, s]));
  for (const oldSurface of before.surfaces) {
    const current = newSurfaces.get(oldSurface.id);
    if (!current) { append('SURFACE_REMOVED', true, `surfaces.${oldSurface.id}`, 'present', 'absent'); continue; }
    for (const key of ['sourceIds', 'mode', 'locale', 'offline', 'keyboard', 'screenReader', 'targetPx', 'mapCredit']) {
      const oldValue = Array.isArray(oldSurface[key]) ? [...oldSurface[key]].sort().join(',') : oldSurface[key];
      const newValue = Array.isArray(current[key]) ? [...current[key]].sort().join(',') : current[key];
      if (oldValue === newValue) continue;
      let blocking = key === 'sourceIds' || key === 'locale' || key === 'mode';
      if (['offline', 'keyboard', 'screenReader', 'mapCredit'].includes(key)) blocking = oldValue === 'YES' && newValue !== 'YES';
      if (key === 'targetPx') blocking = typeof oldValue === 'number' && (typeof newValue !== 'number' || newValue < oldValue);
      append('SURFACE_' + key.toUpperCase(), blocking, `surfaces.${oldSurface.id}.${key}`, oldValue, newValue);
    }
  }
  for (const surface of after.surfaces) if (!oldSurfaces.has(surface.id)) append('SURFACE_ADDED', false, `surfaces.${surface.id}`, 'absent', 'present');
  const audit = auditCheckpoint(after, options);
  return {
    beforeId: before.releaseId,
    afterId: after.releaseId,
    blocked: audit.blocked || changes.some(c => c.blocking),
    audit,
    changes,
  };
}
export { NOTICE_CODES };
