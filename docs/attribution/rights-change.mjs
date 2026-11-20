/** Detect publication rights regressions between two explicitly supplied releases. */
import { auditRightsMatrix } from './rights-audit.mjs';
const SOURCE_FIELDS = Object.freeze([
  'provider', 'name', 'licenceId', 'licenceName', 'sourceUrl', 'licenceUrl',
  'termsUrl', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'evidenceTier',
  'evidenceUrl', 'permission', 'redistribution', 'derivativeUse',
  'openLicenceEvidence', 'shareAlikeRequired', 'attribution', 'publication',
]);
const OUTPUT_FIELDS = Object.freeze([
  'name', 'locale', 'kind', 'distribution', 'transformation', 'sourceIds',
  'route', 'state', 'attribution', 'mapCredit', 'licenceLink',
  'redistributionNotice', 'shareAlikePublished', 'separatedDatasets',
  'offlineAvailable', 'keyboardAccessible', 'screenReaderLabelled',
  'minimumTargetPx', 'publishedOn',
]);
const EXCEPTION_FIELDS = Object.freeze([
  'sourceId', 'outputId', 'issue', 'evidenceUrl', 'recordedOn', 'reviewer',
  'disposition', 'reason',
]);
const HIGH_RISK_SOURCE = new Set([
  'licenceId', 'licenceName', 'sourceUrl', 'licenceUrl', 'termsUrl',
  'evidenceUrl', 'permission', 'redistribution', 'derivativeUse',
  'openLicenceEvidence', 'shareAlikeRequired', 'attribution', 'publication',
  'termsReviewedOn',
]);
const HIGH_RISK_OUTPUT = new Set([
  'sourceIds', 'route', 'distribution', 'transformation', 'state',
  'attribution', 'mapCredit', 'licenceLink', 'redistributionNotice',
  'shareAlikePublished', 'separatedDatasets', 'offlineAvailable',
  'keyboardAccessible', 'screenReaderLabelled', 'minimumTargetPx',
]);
function printable(value) { return Array.isArray(value) ? [...value].sort().join(', ') : String(value); }
function change(collection, id, field, before, after, level, affectedOutputs) {
  return {collection, id, field, before: printable(before), after: printable(after), level, affectedOutputs};
}
function associated(matrix, id) {
  return matrix.outputs.filter(output => output.sourceIds.includes(id)).map(output => output.id).sort();
}
function compareCollection(result, name, oldRecords, newRecords, fields, highRisk, oldMatrix, newMatrix) {
  const oldMap = new Map(oldRecords.map(item => [item.id, item]));
  const newMap = new Map(newRecords.map(item => [item.id, item]));
  for (const oldItem of oldRecords) {
    const newItem = newMap.get(oldItem.id);
    const impacted = name === 'sources' ? [...new Set([...associated(oldMatrix, oldItem.id), ...associated(newMatrix, oldItem.id)])].sort()
      : name === 'outputs' ? [oldItem.id] : [oldItem.outputId];
    if (!newItem) {
      result.push(change(name, oldItem.id, 'removed', 'present', 'absent',
        name === 'exceptions' && oldItem.disposition !== 'open' ? 'note' : 'block', impacted));
      continue;
    }
    for (const field of fields) {
      if (printable(oldItem[field]) === printable(newItem[field])) continue;
      let level = highRisk.has(field) ? 'block' : 'note';
      if (field === 'minimumTargetPx' && typeof oldItem[field] === 'number'
        && typeof newItem[field] === 'number' && newItem[field] >= oldItem[field]) level = 'note';
      if (field === 'permission' || field === 'redistribution' || field === 'derivativeUse'
        || field === 'openLicenceEvidence' || field === 'offlineAvailable'
        || field === 'keyboardAccessible' || field === 'screenReaderLabelled') {
        if (oldItem[field] !== 'YES' && newItem[field] === 'YES') level = 'note';
      }
      if (field === 'publication' || field === 'state') {
        if (oldItem[field] !== 'included' && newItem[field] === 'included') level = 'note';
      }
      result.push(change(name, oldItem.id, field, oldItem[field], newItem[field], level, impacted));
    }
  }
  for (const item of newRecords) {
    if (!oldMap.has(item.id)) {
      const impacted = name === 'sources' ? associated(newMatrix, item.id) : name === 'outputs' ? [item.id] : [item.outputId];
      result.push(change(name, item.id, 'added', 'absent', 'present', 'note', impacted));
    }
  }
}
export function compareRightsMatrices(before, after) {
  const changes = [];
  compareCollection(changes, 'sources', before.sources, after.sources, SOURCE_FIELDS,
    HIGH_RISK_SOURCE, before, after);
  compareCollection(changes, 'outputs', before.outputs, after.outputs, OUTPUT_FIELDS,
    HIGH_RISK_OUTPUT, before, after);
  compareCollection(changes, 'exceptions', before.exceptions, after.exceptions,
    EXCEPTION_FIELDS, new Set(['sourceId', 'outputId', 'disposition', 'evidenceUrl']), before, after);
  const previousAudit = auditRightsMatrix(before);
  const currentAudit = auditRightsMatrix(after);
  const previousBlocks = new Set(previousAudit.findings.filter(f => f.level === 'block')
    .map(f => `${f.code}/${f.sourceId}/${f.outputId}`));
  const newBlockingCodes = [...new Set(currentAudit.findings.filter(f => f.level === 'block')
    .filter(f => !previousBlocks.has(`${f.code}/${f.sourceId}/${f.outputId}`)).map(f => f.code))].sort();
  changes.sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id)
    || a.field.localeCompare(b.field));
  return {
    previousRelease: before.releaseId,
    currentRelease: after.releaseId,
    blocked: currentAudit.blocked || changes.some(item => item.level === 'block'),
    changes, newBlockingCodes, previousAudit, currentAudit,
  };
}
