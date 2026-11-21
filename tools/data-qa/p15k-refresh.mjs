/** Validate offline refresh transactions before any client-side swap. */
import {
  ageWithin, array, calendar, digest, hasExactly, identifier, inspectBilingual,
  inspectSource, label, makeAudit, maxInput, object, offlinePath, safeInteger,
  sha256, siloOf, unique, validRoot,
} from './p15k-core.mjs';

const PHASES = ['PENDING', 'DOWNLOADED', 'CHECKED', 'COMMITTED', 'REVERTED'];
const OPERATIONS = ['ADD', 'REPLACE', 'REMOVE'];
const MAX_ASSETS = 5000;
const MAX_ENTRIES = 10000;

export function assetShape(value) {
  return hasExactly(value, ['id', 'path', 'sha256', 'bytes', 'source', 'silo', 'kind']) &&
    identifier(value.id) && offlinePath(value.path) && digest(value.sha256) &&
    safeInteger(value.bytes, 1024 * 1024 * 1024) && object(value.source) &&
    ['open', 'odbl'].includes(value.silo) && ['text', 'records', 'map', 'metadata'].includes(value.kind);
}
export function operationShape(value) {
  return hasExactly(value, ['id', 'kind', 'assetId', 'previous', 'next', 'reason', 'dependsOn']) &&
    identifier(value.id) && OPERATIONS.includes(value.kind) && identifier(value.assetId) &&
    (value.previous === null || digest(value.previous)) &&
    (value.next === null || digest(value.next)) &&
    hasExactly(value.reason, ['en', 'fr']) && array(value.dependsOn, MAX_ASSETS) !== null && value.dependsOn.every(identifier);
}
export function journalShape(value) {
  return hasExactly(value, ['operationId', 'phase', 'at', 'bytesOnDisk', 'digest']) &&
    identifier(value.operationId) && PHASES.includes(value.phase) &&
    calendar(value.at) !== null && safeInteger(value.bytesOnDisk, Number.MAX_SAFE_INTEGER) &&
    digest(value.digest);
}
function rootShape(input) {
  return validRoot(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'maxTotalBytes', 'maxFileBytes',
    'before', 'after', 'operations', 'journal', 'fallback']) &&
    calendar(input.asOf) !== null && safeInteger(input.maxAgeDays, 36500) &&
    safeInteger(input.maxTotalBytes) && safeInteger(input.maxFileBytes) &&
    array(input.before, MAX_ASSETS) && array(input.after, MAX_ASSETS) &&
    array(input.operations, MAX_ENTRIES) && array(input.journal, MAX_ENTRIES) &&
    hasExactly(input.fallback, ['assetIds', 'manifestDigest', 'reason']) &&
    array(input.fallback.assetIds, MAX_ASSETS) && input.fallback.assetIds.every(identifier) &&
    digest(input.fallback.manifestDigest);
}
function inspectAsset(asset, audit, path, input) {
  if (!assetShape(asset)) { audit.add('SHAPE', path); return false; }
  if (asset.bytes > input.maxFileBytes) audit.add('BYTES', `${path}.bytes`);
  inspectSource(asset.source, audit, `${path}.source`, input);
  if (asset.silo !== siloOf([asset.source])) audit.add('SILO', `${path}.silo`);
  return true;
}
function byId(items, audit, path) {
  const map = new Map();
  items.forEach((item, i) => {
    if (!object(item) || !identifier(item.id)) return;
    if (map.has(item.id)) audit.add('DUPLICATE', `${path}[${i}].id`);
    map.set(item.id, item);
  });
  return map;
}
function dependencyCycle(operations) {
  const byOperation = new Map(operations.map(op => [op.id, op]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const op = byOperation.get(id);
    if (op) for (const dependency of op.dependsOn) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return operations.some(op => visit(op.id));
}
function validTransition(previous, next) {
  const transitions = {
    PENDING: ['PENDING', 'DOWNLOADED', 'REVERTED'],
    DOWNLOADED: ['DOWNLOADED', 'CHECKED', 'REVERTED'],
    CHECKED: ['CHECKED', 'COMMITTED', 'REVERTED'],
    COMMITTED: ['COMMITTED'],
    REVERTED: ['REVERTED'],
  };
  return transitions[previous]?.includes(next) ?? false;
}
function compareAssets(a, b) {
  return a.id === b.id && a.path === b.path && a.sha256 === b.sha256 && a.bytes === b.bytes &&
    a.kind === b.kind && a.silo === b.silo && JSON.stringify(a.source) === JSON.stringify(b.source);
}
export function expectedOperations(before, after) {
  const old = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  const expected = new Map();
  for (const [id, item] of old) {
    const replacement = next.get(id);
    if (!replacement) expected.set(id, { kind: 'REMOVE', previous: item.sha256, next: null });
    else if (!compareAssets(item, replacement)) {
      expected.set(id, { kind: 'REPLACE', previous: item.sha256, next: replacement.sha256 });
    }
  }
  for (const [id, item] of next) {
    if (!old.has(id)) expected.set(id, { kind: 'ADD', previous: null, next: item.sha256 });
  }
  return expected;
}
export function auditRefresh(input) {
  const audit = makeAudit();
  const summary = { before: 0, after: 0, operations: 0, committed: 0, reverted: 0, bytes: 0 };
  if (!rootShape(input)) { audit.add('SHAPE', '$'); return audit.finish(summary); }
  if (!maxInput(input, audit)) return audit.finish(summary);
  summary.before = input.before.length;
  summary.after = input.after.length;
  summary.operations = input.operations.length;
  const old = byId(input.before, audit, '$.before');
  const next = byId(input.after, audit, '$.after');
  input.before.forEach((asset, i) => inspectAsset(asset, audit, `$.before[${i}]`, input));
  input.after.forEach((asset, i) => inspectAsset(asset, audit, `$.after[${i}]`, input));
  for (const assets of [input.before, input.after]) {
    const paths = assets.filter(assetShape).map(item => item.path);
    if (!unique(paths)) audit.add('DUPLICATE', '$.assets.path');
  }
  summary.bytes = input.after.reduce((sum, asset) => sum + (safeInteger(asset?.bytes) ? asset.bytes : 0), 0);
  if (summary.bytes > input.maxTotalBytes) audit.add('BYTES', '$.after');
  const expected = expectedOperations(input.before.filter(assetShape), input.after.filter(assetShape));
  const operations = byId(input.operations, audit, '$.operations');
  const touched = new Set();
  input.operations.forEach((op, i) => {
    const path = `$.operations[${i}]`;
    if (!operationShape(op)) { audit.add('SHAPE', path); return; }
    inspectBilingual(op.reason, audit, `${path}.reason`, 280);
    if (touched.has(op.assetId)) audit.add('DUPLICATE', `${path}.assetId`);
    touched.add(op.assetId);
    const required = expected.get(op.assetId);
    if (!required || required.kind !== op.kind || required.previous !== op.previous ||
        required.next !== op.next) audit.add('DRIFT', path);
    if (op.dependsOn.includes(op.id) || !unique(op.dependsOn)) audit.add('ORDER', `${path}.dependsOn`);
    for (const dep of op.dependsOn) if (!operations.has(dep)) audit.add('REFERENCE', `${path}.dependsOn`);
    if (op.kind === 'REMOVE' && !old.has(op.assetId)) audit.add('REFERENCE', path);
    if (op.kind !== 'REMOVE' && !next.has(op.assetId)) audit.add('REFERENCE', path);
  });
  for (const id of expected.keys()) if (!touched.has(id)) audit.add('REFERENCE', `$.operations.${id}`);
  if (input.operations.every(operationShape) && dependencyCycle(input.operations)) audit.add('ORDER', '$.operations');
  const journalById = new Map();
  input.journal.forEach((event, i) => {
    const path = `$.journal[${i}]`;
    if (!journalShape(event)) { audit.add('SHAPE', path); return; }
    if (calendar(event.at) > calendar(input.asOf)) audit.add('DATE', `${path}.at`);
    if (!operations.has(event.operationId)) audit.add('REFERENCE', path);
    const history = journalById.get(event.operationId) ?? [];
    if (history.length) {
      const previous = history[history.length - 1];
      if (!validTransition(previous.phase, event.phase)) audit.add('ORDER', path);
      if (calendar(event.at) < calendar(previous.at)) audit.add('ORDER', `${path}.at`);
      if (event.bytesOnDisk < previous.bytesOnDisk && event.phase !== 'REVERTED') audit.add('BYTES', path);
    } else if (event.phase !== 'PENDING') audit.add('ORDER', path);
    journalById.set(event.operationId, [...history, event]);
  });
  for (const op of input.operations.filter(operationShape)) {
    const history = journalById.get(op.id);
    if (!history?.length) { audit.add('REFERENCE', `$.journal.${op.id}`); continue; }
    const last = history[history.length - 1];
    if (last.phase === 'COMMITTED') summary.committed++;
    if (last.phase === 'REVERTED') summary.reverted++;
    if (!['COMMITTED', 'REVERTED'].includes(last.phase)) audit.add('ROLLBACK', `$.journal.${op.id}`);
    if (last.phase === 'COMMITTED') {
      for (const id of op.dependsOn) {
        const dependency = journalById.get(id)?.at(-1);
        if (!dependency || dependency.phase !== 'COMMITTED') audit.add('ORDER', `$.journal.${op.id}`);
      }
    }
  }
  if (!unique(input.fallback.assetIds)) audit.add('DUPLICATE', '$.fallback.assetIds');
  inspectBilingual(input.fallback.reason, audit, '$.fallback.reason', 280);
  if (input.fallback.assetIds.length !== old.size ||
      input.fallback.assetIds.some(id => !old.has(id))) audit.add('ROLLBACK', '$.fallback.assetIds');
  const previousDigest = sha256(JSON.stringify([...old.values()].sort((a, b) => a.id.localeCompare(b.id))));
  if (input.fallback.manifestDigest !== previousDigest) audit.add('HASH', '$.fallback.manifestDigest');
  if (summary.reverted > 0 && summary.committed > 0) audit.add('ROLLBACK', '$.journal');
  return audit.finish(summary);
}
