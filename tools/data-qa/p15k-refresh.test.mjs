import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assetShape, auditRefresh, expectedOperations, journalShape, operationShape } from './p15k-refresh.mjs';
import {
  ONE_HASH, TWO_HASH, ZERO_HASH, asset, clone, fallback, journal,
  operation, reason, refresh, replacingRefresh, source,
} from './p15k-fixtures.mjs';

function fail(value, code) {
  const report = auditRefresh(value);
  assert.equal(report.ok, false, JSON.stringify(report));
  assert.ok(report.findings.some(item => item.code === code), JSON.stringify(report));
}
function patchOp(patch) { return replacingRefresh({ operations: [operation(patch)] }); }
function patchAsset(patch) {
  const before = [asset(patch)];
  return refresh({ before, after: clone(before), fallback: fallback(before) });
}
function patchJournal(index, patch) {
  const events = journal();
  events[index] = { ...events[index], ...patch };
  return replacingRefresh({ journal: events });
}

describe('P15K refresh shapes and expected delta', () => {
  it('accepts a valid offline asset', () => {
    assert.equal(assetShape(asset()), true);
  });
  it('rejects missing asset digests', () => {
    assert.equal(assetShape(asset({ sha256: null })), false);
  });
  it('rejects outside-root asset paths', () => {
    assert.equal(assetShape(asset({ path: '../secret' })), false);
  });
  it('rejects remote asset URLs', () => {
    assert.equal(assetShape(asset({ path: 'https://remote.invalid/data' })), false);
  });
  it('rejects an unknown asset format', () => {
    assert.equal(assetShape(asset({ kind: 'remote-tiles' })), false);
  });
  it('rejects negative file sizes', () => {
    assert.equal(assetShape(asset({ bytes: -1 })), false);
  });
  it('rejects nonintegral file sizes', () => {
    assert.equal(assetShape(asset({ bytes: 44.5 })), false);
  });
  it('rejects an unspecified licence silo', () => {
    assert.equal(assetShape(asset({ silo: 'any' })), false);
  });
  it('rejects undeclared extra fields', () => {
    assert.equal(assetShape(asset({ privateNotes: 'not for release' })), false);
  });
  it('accepts an explicit replacement operation', () => {
    assert.equal(operationShape(operation()), true);
  });
  it('rejects operations with malformed reason objects', () => {
    assert.equal(operationShape(operation({ reason: null })), false);
  });
  it('rejects unsupported operation kinds', () => {
    assert.equal(operationShape(operation({ kind: 'PATCH' })), false);
  });
  it('rejects non-array dependencies', () => {
    assert.equal(operationShape(operation({ dependsOn: 'operation-two' })), false);
  });
  it('rejects an invalid prior digest', () => {
    assert.equal(operationShape(operation({ previous: 'abc' })), false);
  });
  it('accepts an initial pending event', () => {
    assert.equal(journalShape(journal()[0]), true);
  });
  it('rejects invalid journal phases', () => {
    assert.equal(journalShape({ ...journal()[0], phase: 'FETCHING' }), false);
  });
  it('rejects non-calendar journal dates', () => {
    assert.equal(journalShape({ ...journal()[0], at: '2026-11-31' }), false);
  });
  it('rejects fractional journal storage sizes', () => {
    assert.equal(journalShape({ ...journal()[0], bytesOnDisk: 3.1 }), false);
  });
  it('returns empty changes when assets remain identical', () => {
    assert.equal(expectedOperations([asset()], [clone(asset())]).size, 0);
  });
  it('detects added local assets', () => {
    const delta = expectedOperations([], [asset()]);
    assert.deepEqual(delta.get('asset-one'), { kind: 'ADD', previous: null, next: ONE_HASH });
  });
  it('detects removed local assets', () => {
    const delta = expectedOperations([asset()], []);
    assert.deepEqual(delta.get('asset-one'), { kind: 'REMOVE', previous: ONE_HASH, next: null });
  });
  it('detects a changed asset digest', () => {
    const delta = expectedOperations([asset()], [asset({ sha256: TWO_HASH })]);
    assert.equal(delta.get('asset-one').kind, 'REPLACE');
  });
  it('detects a changed source stamp even with unchanged bytes', () => {
    const delta = expectedOperations([asset()], [asset({ source: source({ observedOn: '2026-11-16' }) })]);
    assert.equal(delta.get('asset-one').kind, 'REPLACE');
  });
  it('detects a changed path for the same id', () => {
    const delta = expectedOperations([asset()], [asset({ path: 'data/moved.json' })]);
    assert.equal(delta.get('asset-one').kind, 'REPLACE');
  });
});

describe('P15K offline refresh safety', () => {
  it('accepts a no-change transaction', () => {
    const report = auditRefresh(refresh());
    assert.equal(report.ok, true, JSON.stringify(report));
  });
  it('accepts a completed replacement transaction', () => {
    const report = auditRefresh(replacingRefresh());
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.summary.committed, 1);
  });
  it('rejects an absent root', () => {
    fail(null, 'SHAPE');
  });
  it('rejects invalid policy date', () => {
    fail(refresh({ asOf: '2026-02-30' }), 'SHAPE');
  });
  it('rejects a malformed byte budget', () => {
    fail(refresh({ maxTotalBytes: -1 }), 'SHAPE');
  });
  it('rejects an absent rollback manifest', () => {
    fail(refresh({ fallback: null }), 'SHAPE');
  });
  it('rejects a malformed new asset', () => {
    fail(refresh({ after: [asset({ path: '../invalid' })] }), 'SHAPE');
  });
  it('rejects duplicate asset ids', () => {
    fail(refresh({ before: [asset(), asset()] }), 'DUPLICATE');
  });
  it('rejects colliding offline paths', () => {
    const another = asset({ id: 'asset-two' });
    fail(refresh({ before: [asset(), another], fallback: fallback([asset(), another]) }), 'DUPLICATE');
  });
  it('rejects a file larger than policy', () => {
    fail(patchAsset({ bytes: 12000 }), 'BYTES');
  });
  it('rejects a total package larger than policy', () => {
    fail(refresh({ maxTotalBytes: 50 }), 'BYTES');
  });
  it('rejects a stale source in the new package', () => {
    fail(patchAsset({ source: source({ observedOn: '2026-01-01' }) }), 'STALE');
  });
  it('rejects ODbL content in an open silo', () => {
    fail(patchAsset({ source: source({ licence: 'ODbL-1.0' }) }), 'SILO');
  });
  it('accepts isolated ODbL content', () => {
    const item = asset({ silo: 'odbl', source: source({ licence: 'ODbL-1.0' }) });
    const report = auditRefresh(refresh({ before: [item], after: [clone(item)], fallback: fallback([item]) }));
    assert.equal(report.ok, true, JSON.stringify(report));
  });
  it('rejects missing operations for changed bytes', () => {
    fail(replacingRefresh({ operations: [], journal: [] }), 'REFERENCE');
  });
  it('rejects operations with unmatched targets', () => {
    fail(patchOp({ assetId: 'ghost' }), 'DRIFT');
  });
  it('rejects duplicate target operations', () => {
    fail(replacingRefresh({ operations: [operation(), operation({ id: 'operation-two' })] }), 'DUPLICATE');
  });
  it('rejects incorrectly marked removal', () => {
    fail(patchOp({ kind: 'REMOVE' }), 'DRIFT');
  });
  it('rejects an incorrect old digest', () => {
    fail(patchOp({ previous: ZERO_HASH }), 'DRIFT');
  });
  it('rejects an incorrect new digest', () => {
    fail(patchOp({ next: ZERO_HASH }), 'DRIFT');
  });
  it('rejects an operation depending on itself', () => {
    fail(patchOp({ dependsOn: ['operation-one'] }), 'ORDER');
  });
  it('rejects a missing operation dependency', () => {
    fail(patchOp({ dependsOn: ['missing-operation'] }), 'REFERENCE');
  });
  it('rejects duplicate operation dependencies', () => {
    fail(patchOp({ dependsOn: ['ghost', 'ghost'] }), 'ORDER');
  });
  it('rejects private notes in a reason string', () => {
    fail(patchOp({ reason: reason({ en: 'person@example.org' }) }), 'UNSAFE');
  });
  it('rejects malformed French reason punctuation', () => {
    fail(patchOp({ reason: reason({ fr: 'Changement : affiché' }) }), 'TYPOGRAPHY');
  });
  it('rejects a journal referencing a nonexistent operation', () => {
    fail(patchJournal(0, { operationId: 'missing-operation' }), 'REFERENCE');
  });
  it('rejects a journal starting in CHECKED state', () => {
    fail(patchJournal(0, { phase: 'CHECKED' }), 'ORDER');
  });
  it('rejects direct pending-to-committed changes', () => {
    fail(patchJournal(1, { phase: 'COMMITTED' }), 'ORDER');
  });
  it('rejects a clock that moves backwards', () => {
    fail(patchJournal(1, { at: '2026-11-14' }), 'ORDER');
  });
  it('rejects future journal dates', () => {
    fail(patchJournal(3, { at: '2026-11-21' }), 'DATE');
  });
  it('rejects shrinking disk footprint without a rollback', () => {
    fail(patchJournal(2, { bytesOnDisk: 90 }), 'BYTES');
  });
  it('rejects nonterminal update journals', () => {
    fail(replacingRefresh({ journal: journal().slice(0, 3) }), 'ROLLBACK');
  });
  it('rejects a transaction with no journal', () => {
    fail(replacingRefresh({ journal: [] }), 'REFERENCE');
  });
  it('rejects a rollback manifest that omits the original asset', () => {
    fail(refresh({ fallback: fallback([asset()], { assetIds: [] }) }), 'ROLLBACK');
  });
  it('rejects an incorrect rollback checksum', () => {
    fail(refresh({ fallback: fallback([asset()], { manifestDigest: ZERO_HASH }) }), 'HASH');
  });
  it('rejects duplicated fallback assets', () => {
    fail(refresh({ fallback: fallback([asset()], { assetIds: ['asset-one', 'asset-one'] }) }), 'DUPLICATE');
  });
  it('rejects a stale source on the before side', () => {
    fail(patchAsset({ source: source({ observedOn: '2020-01-01' }) }), 'STALE');
  });
  it('does not fetch remote assets during audit', () => {
    const result = auditRefresh(refresh());
    assert.equal(result.summary.bytes, 100);
    assert.equal(result.ok, true);
  });
  it('includes French details for blocked violations', () => {
    const report = auditRefresh(refresh({ maxTotalBytes: 50 }));
    assert.ok(report.findings.every(item => item.en && item.fr));
  });
  it('does not mutate caller transaction input', () => {
    const value = replacingRefresh();
    const before = clone(value);
    auditRefresh(value);
    assert.deepEqual(value, before);
  });
});
