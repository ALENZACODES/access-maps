import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditOfflineUpdate, type OfflineEntry, type OfflinePlan } from './p15e-updates.js';

const source = {
  source: 'Community open inventory', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'sources/community.json',
};
const item: OfflineEntry = {
  id: 'entrance-1', path: 'data/entrance-1.json', sha256: 'a'.repeat(64), bytes: 100,
  silo: 'open', source, access: 'UNKNOWN', locale: 'neutral',
};
const nextItem: OfflineEntry = {
  ...item, sha256: 'b'.repeat(64), source: { ...source, observedOn: '2026-11-12' },
};
const oldState = { revision: 'release-1', generatedOn: '2026-11-11', entries: [item] };
const newState = { revision: 'release-2', generatedOn: '2026-11-13', entries: [nextItem] };
const operation = {
  op: 'REPLACE' as const, id: item.id, oldSha256: item.sha256, next: nextItem,
  reason: 'An updated dated municipal observation was received',
};
const baseline: OfflinePlan = {
  schemaVersion: 1, asOf: '2026-11-15', maxBytes: 20000, maxAgeDays: 40,
  before: oldState, after: newState, operations: [operation],
};
function check(change: Record<string, unknown> = {}) {
  return auditOfflineUpdate({ ...baseline, ...change });
}
function fail(change: Record<string, unknown>, code: string) {
  const result = check(change);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result.findings));
  assert.ok(result.findings.every(f => f.en && f.fr));
  return result;
}
describe('atomic offline update gate', () => {
  it('accepts an explicit replacement with preserved provenance', () => {
    const report = check();
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.summary.replacements, 1);
    assert.equal(report.summary.unknownAfter, 1);
  });
  it('rejects changed bytes without a declared operation', () => {
    fail({ operations: [] }, 'MISSING_OP');
  });
  it('rejects a changed digest with old operation type', () => {
    fail({ operations: [{ ...operation, op: 'ADD', oldSha256: undefined }] }, 'NEXT');
  });
  it('requires the previous digest for replacement', () => {
    fail({ operations: [{ ...operation, oldSha256: '0'.repeat(64) }] }, 'OLD_SHA');
  });
  it('rejects a target digest that differs from the published snapshot', () => {
    fail({ operations: [{ ...operation, next: { ...nextItem, sha256: 'c'.repeat(64) } }] }, 'NEXT');
  });
  it('rejects duplicate operation ids', () => {
    fail({ operations: [operation, operation] }, 'DUPLICATE');
  });
  it('rejects duplicate entries in a state', () => {
    fail({ after: { ...newState, entries: [nextItem, nextItem] } }, 'DUPLICATE');
  });
  it('rejects duplicate offline file paths', () => {
    fail({ after: { ...newState, entries: [nextItem, { ...nextItem, id: 'other' }] } }, 'DUPLICATE');
  });
  it('rejects release reuse without a new revision', () => {
    fail({ after: { ...newState, revision: oldState.revision } }, 'ROLLBACK');
  });
  it('rejects a future generated-on date', () => {
    fail({ after: { ...newState, generatedOn: '2027-11-13' } }, 'DATE');
  });
  it('rejects generated-on date earlier than previous release', () => {
    fail({ after: { ...newState, generatedOn: '2026-11-01' } }, 'DATE');
  });
  it('rejects stale source observations', () => {
    fail({ after: { ...newState, entries: [
      { ...nextItem, source: { ...source, observedOn: '2018-01-01' } },
    ] } }, 'AGE');
  });
  it('rejects future source observations', () => {
    fail({ after: { ...newState, entries: [
      { ...nextItem, source: { ...source, observedOn: '2028-11-01' } },
    ] } }, 'AGE');
  });
  it('rejects absent licence metadata', () => {
    fail({ after: { ...newState, entries: [
      { ...nextItem, source: { ...source, licence: '' } },
    ] } }, 'ENTRY');
  });
  it('rejects held MiWay source data', () => {
    fail({ after: { ...newState, entries: [
      { ...nextItem, source: { ...source, source: 'MiWay' } },
    ] } }, 'ENTRY');
  });
  it('rejects an ODbL entry inside the open silo', () => {
    fail({ after: { ...newState, entries: [
      { ...nextItem, source: { ...source, licence: 'ODbL-1.0' } },
    ] } }, 'SILO');
  });
  it('rejects unrecorded silo movement', () => {
    const moved = { ...nextItem, source: { ...source, licence: 'ODbL-1.0' }, silo: 'odbl' };
    fail({ after: { ...newState, entries: [moved] },
      operations: [{ ...operation, next: moved }] }, 'SILO');
  });
  it('rejects byte budget overruns', () => {
    fail({ maxBytes: 99 }, 'BUDGET');
  });
  it('rejects malformed hash strings', () => {
    fail({ after: { ...newState, entries: [{ ...nextItem, sha256: 'not-a-sha' }] } }, 'ENTRY');
  });
  it('rejects path escapes', () => {
    fail({ after: { ...newState, entries: [{ ...nextItem, path: '../private.json' }] } }, 'ENTRY');
  });
  it('rejects remote file paths', () => {
    fail({ after: { ...newState, entries: [{ ...nextItem, path: 'https://tiles.example/a' }] } }, 'ENTRY');
  });
  it('rejects arbitrary new export fields', () => {
    fail({ after: { ...newState, entries: [{ ...nextItem, personalEmail: 'user@example.org' }] } }, 'ENTRY');
  });
  it('rejects sudden positive access claims without newer evidence', () => {
    const asserted = { ...nextItem, access: 'YES', source };
    fail({ after: { ...newState, entries: [asserted] },
      operations: [{ ...operation, next: asserted }] }, 'ASSERTION');
  });
  it('accepts new access information when source observation is newer', () => {
    const asserted = { ...nextItem, access: 'YES' };
    assert.equal(check({ after: { ...newState, entries: [asserted] },
      operations: [{ ...operation, next: asserted }] }).ok, true);
  });
  it('does not require source inference when access stays UNKNOWN', () => {
    assert.equal(check().summary.unknownAfter, 1);
  });
  it('rejects silent removal of an existing entry', () => {
    fail({ after: { ...newState, entries: [] }, operations: [] }, 'MISSING_OP');
  });
  it('allows an explicit removal with a meaningful reason', () => {
    const result = check({ after: { ...newState, entries: [] }, operations: [{
      op: 'DELETE', id: item.id, oldSha256: item.sha256,
      reason: 'Data source withdrew this dated file',
    }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.removals, 1);
  });
  it('rejects deletion with a placeholder reason', () => {
    fail({ after: { ...newState, entries: [] }, operations: [{
      op: 'DELETE', id: item.id, oldSha256: item.sha256, reason: 'delete',
    }] }, 'DELETE');
  });
  it('allows explicit addition of neutral offline data', () => {
    const added = { ...nextItem, id: 'new-entrance', path: 'data/new-entrance.json' };
    const result = check({ after: { ...newState, entries: [item, added] }, operations: [{
      op: 'ADD', id: added.id, next: added, reason: 'New source entry with a dated observation',
    }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.additions, 1);
  });
  it('blocks an undeclared added file', () => {
    const added = { ...nextItem, id: 'new-entrance', path: 'data/new-entrance.json' };
    fail({ after: { ...newState, entries: [item, added] }, operations: [] }, 'MISSING_OP');
  });
  it('blocks missing French companion asset', () => {
    const english = { ...nextItem, id: 'guide-en', path: 'en/guide.json', locale: 'en' };
    fail({ after: { ...newState, entries: [english] },
      operations: [{ op: 'DELETE', id: item.id, oldSha256: item.sha256,
        reason: 'Retired legacy offline format' },
        { op: 'ADD', id: english.id, next: english, reason: 'Added English guide' }] }, 'LOCALE');
  });
  it('allows a paired English and French offline update', () => {
    const english = { ...nextItem, id: 'guide-en', path: 'en/guide.json', locale: 'en' as const };
    const french = { ...nextItem, id: 'guide-fr', path: 'fr/guide.json', locale: 'fr' as const };
    const result = check({ after: { ...newState, entries: [english, french] }, operations: [
      { op: 'DELETE', id: item.id, oldSha256: item.sha256, reason: 'Retired legacy offline format' },
      { op: 'ADD', id: english.id, next: english, reason: 'Added English guide' },
      { op: 'ADD', id: french.id, next: french, reason: 'Added French guide' },
    ] });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('rejects unsupported operation names', () => {
    fail({ operations: [{ ...operation, op: 'PATCH' }] }, 'OPERATION');
  });
  it('rejects extra fields inside operations', () => {
    fail({ operations: [{ ...operation, apiKey: 'secret' }] }, 'OPERATION');
  });
  it('rejects non-JSON root values', () => {
    for (const raw of [null, [], 42, 'hello', {}]) {
      assert.equal(auditOfflineUpdate(raw).ok, false);
    }
  });
  it('does not mutate input snapshots', () => {
    const before = JSON.stringify(baseline);
    check();
    assert.equal(JSON.stringify(baseline), before);
  });
  it('emits deterministic bilingual diagnostics', () => {
    const data = { maxBytes: 20 };
    assert.deepEqual(check(data), check(data));
  });
});
