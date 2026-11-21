import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { auditResume } from './p15j-resume.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const ITEM = { id: 'asset-a', path: 'offline/data.json', operation: 'ADD',
  phase: 'COMMITTED', dependsOn: [] as string[], beforeSha256: null as string | null,
  afterSha256: HASH_A as string | null, bytes: 100 };
const FIRST = { sequence: 1, itemId: 'asset-a', next: 'STAGED',
  observedOn: '2026-11-17', previousDigest: null as string | null, digest: HASH_B };
const SECOND = { sequence: 2, itemId: 'asset-a', next: 'COMMITTED',
  observedOn: '2026-11-18', previousDigest: HASH_B as string | null, digest: HASH_C };
function base() {
  return { schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
    availableBytes: 1000, items: [{ ...ITEM, dependsOn: [...ITEM.dependsOn] }],
    entries: [{ ...FIRST }, { ...SECOND }] };
}
function check(input: unknown) { return auditResume(input); }
function fail(input: unknown, code: string) {
  const result = check(input);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result.findings));
}
function itemField(key: string, value: unknown) {
  const input = base();
  (input.items[0] as Record<string, unknown>)[key] = value;
  return input;
}
function eventField(which: 0 | 1, key: string, value: unknown) {
  const input = base();
  (input.entries[which] as Record<string, unknown>)[key] = value;
  return input;
}

describe('P15J offline resume and rollback journal', () => {
  it('accepts a two-stage committed addition', () => {
    const result = check(base());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.totals.items, 1);
    assert.equal(result.totals.events, 2);
    assert.equal(result.totals.committed, 1);
    assert.equal(result.totals.reservedBytes, 100);
  });
  it('accepts a staged but incomplete local download', () => {
    const input = base();
    input.items[0]!.phase = 'STAGED';
    input.entries.pop();
    const result = check(input);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.totals.staged, 1);
  });
  it('accepts a pending operation with no events', () => {
    const input = base();
    input.items[0]!.phase = 'PENDING';
    input.entries = [];
    assert.equal(check(input).ok, true);
  });
  it('accepts a rollback after staging', () => {
    const input = base();
    input.items[0]!.phase = 'ROLLED_BACK';
    input.entries[1]!.next = 'ROLLED_BACK';
    const result = check(input);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.totals.rolledBack, 1);
  });
  it('accepts a valid asset replacement with distinct hashes', () => {
    const input = base();
    input.items[0]!.operation = 'REPLACE';
    input.items[0]!.beforeSha256 = HASH_D;
    assert.equal(check(input).ok, true);
  });
  it('accepts a valid committed removal with before hash', () => {
    const input = base();
    input.items[0]!.operation = 'REMOVE';
    input.items[0]!.beforeSha256 = HASH_A;
    input.items[0]!.afterSha256 = null;
    assert.equal(check(input).ok, true);
  });
  it('does not reserve bytes for a completed removal', () => {
    const input = base();
    input.items[0]!.operation = 'REMOVE';
    input.items[0]!.beforeSha256 = HASH_A;
    input.items[0]!.afterSha256 = null;
    assert.equal(check(input).totals.reservedBytes, 0);
  });
  it('rejects committed state without events', () => {
    const input = base();
    input.entries = [];
    fail(input, 'EMPTY');
  });
  it('rejects final phase mismatches', () => {
    fail(itemField('phase', 'STAGED'), 'STATE');
  });
  it('rejects an event that commits directly from pending', () => {
    fail(eventField(0, 'next', 'COMMITTED'), 'PHASE');
  });
  it('rejects an event rolling back from pending', () => {
    fail(eventField(0, 'next', 'ROLLED_BACK'), 'ROLLBACK');
  });
  it('rejects committing twice', () => {
    fail(eventField(1, 'next', 'STAGED'), 'PHASE');
  });
  it('rejects staging twice without finishing', () => {
    const input = base();
    input.entries[1]!.next = 'STAGED';
    fail(input, 'PHASE');
  });
  it('rejects duplicate sequence identifiers', () => {
    fail(eventField(1, 'sequence', 1), 'ORDER');
  });
  it('rejects a sequence with a gap', () => {
    fail(eventField(1, 'sequence', 4), 'ORDER');
  });
  it('rejects a missing previous digest link', () => {
    fail(eventField(1, 'previousDigest', null), 'CHAIN');
  });
  it('rejects a wrong previous digest link', () => {
    fail(eventField(1, 'previousDigest', HASH_A), 'CHAIN');
  });
  it('rejects a non-null digest on the first event', () => {
    fail(eventField(0, 'previousDigest', HASH_D), 'CHAIN');
  });
  it('rejects unknown event item ids', () => {
    fail(eventField(1, 'itemId', 'unknown-asset'), 'MISSING');
  });
  it('rejects future event dates', () => {
    fail(eventField(1, 'observedOn', '2026-12-01'), 'CLOCK');
  });
  it('rejects stale event dates', () => {
    fail(eventField(1, 'observedOn', '2025-11-01'), 'CLOCK');
  });
  it('rejects event dates moving backwards', () => {
    fail(eventField(1, 'observedOn', '2026-11-16'), 'CLOCK');
  });
  it('accepts two events on the same calendar date', () => {
    const input = base();
    input.entries[1]!.observedOn = input.entries[0]!.observedOn;
    assert.equal(check(input).ok, true);
  });
  it('rejects invalid calendar dates', () => {
    fail(eventField(1, 'observedOn', '2026-02-30'), 'ENTRY');
  });
  it('rejects duplicate item identifiers', () => {
    const input = base();
    input.items.push({ ...ITEM, path: 'offline/other.json' });
    fail(input, 'DUPLICATE');
  });
  it('rejects duplicate destination paths', () => {
    const input = base();
    input.items.push({ ...ITEM, id: 'asset-b' });
    fail(input, 'DUPLICATE');
  });
  it('rejects duplicate dependencies', () => {
    fail(itemField('dependsOn', ['asset-b', 'asset-b']), 'DUPLICATE');
  });
  it('rejects an unknown dependency', () => {
    fail(itemField('dependsOn', ['asset-b']), 'DEPENDENCY');
  });
  it('rejects self-dependency cycles', () => {
    fail(itemField('dependsOn', ['asset-a']), 'CYCLE');
  });
  it('rejects a two-item dependency cycle', () => {
    const input = base();
    input.items[0]!.dependsOn = ['asset-b'];
    input.items.push({ ...ITEM, id: 'asset-b', path: 'offline/other.json', dependsOn: ['asset-a'] });
    fail(input, 'CYCLE');
  });
  it('rejects a committed item depending on a pending item', () => {
    const input = base();
    input.items[0]!.dependsOn.push('asset-b');
    input.items.push({ ...ITEM, id: 'asset-b', path: 'offline/other.json', phase: 'PENDING' });
    fail(input, 'DEPENDENCY');
  });
  it('rejects a committed item depending on a rolled-back item', () => {
    const input = base();
    input.items[0]!.dependsOn.push('asset-b');
    input.items.push({ ...ITEM, id: 'asset-b', path: 'offline/other.json', phase: 'ROLLED_BACK' });
    fail(input, 'DEPENDENCY');
  });
  it('rejects removal that breaks a committed dependent', () => {
    const input = base();
    input.items[0]!.operation = 'REMOVE';
    input.items[0]!.beforeSha256 = HASH_A;
    input.items[0]!.afterSha256 = null;
    input.items.push({ ...ITEM, id: 'asset-b', path: 'offline/other.json', dependsOn: ['asset-a'] });
    fail(input, 'REMOVE');
  });
  it('rejects a replacement missing previous hash', () => {
    fail(itemField('operation', 'REPLACE'), 'SOURCE');
  });
  it('rejects a removal missing previous hash', () => {
    fail(itemField('operation', 'REMOVE'), 'SOURCE');
  });
  it('rejects an addition with a previous hash', () => {
    fail(itemField('beforeSha256', HASH_A), 'SOURCE');
  });
  it('rejects an addition without a target hash', () => {
    fail(itemField('afterSha256', null), 'TARGET');
  });
  it('rejects a removal retaining target hash', () => {
    const input = base();
    input.items[0]!.operation = 'REMOVE';
    input.items[0]!.beforeSha256 = HASH_D;
    fail(input, 'TARGET');
  });
  it('rejects replacing a file with the same hash', () => {
    const input = base();
    input.items[0]!.operation = 'REPLACE';
    input.items[0]!.beforeSha256 = HASH_A;
    fail(input, 'SAME');
  });
  it('rejects a non-hexadecimal target hash', () => {
    fail(itemField('afterSha256', 'z'.repeat(64)), 'ITEM');
  });
  it('rejects uppercase SHA-256 representation', () => {
    fail(itemField('afterSha256', 'A'.repeat(64)), 'ITEM');
  });
  it('rejects an unsafe absolute local path', () => {
    fail(itemField('path', '/etc/passwd'), 'ITEM');
  });
  it('rejects a path traversal segment', () => {
    fail(itemField('path', '../private/file'), 'ITEM');
  });
  it('rejects a URL where local path is required', () => {
    fail(itemField('path', 'https://example.org/asset'), 'ITEM');
  });
  it('rejects a Windows-style file path', () => {
    fail(itemField('path', 'C:\\private\\asset'), 'ITEM');
  });
  it('rejects unsupported operation types', () => {
    fail(itemField('operation', 'EXECUTE'), 'ITEM');
  });
  it('rejects unsupported phase names', () => {
    fail(itemField('phase', 'FETCHING'), 'ITEM');
  });
  it('rejects negative byte size', () => {
    fail(itemField('bytes', -1), 'ITEM');
  });
  it('rejects fractional byte size', () => {
    fail(itemField('bytes', 1.2), 'ITEM');
  });
  it('rejects a duplicate or malformed event digest', () => {
    fail(eventField(0, 'digest', 'short'), 'ENTRY');
  });
  it('rejects a journal exceeding remaining storage', () => {
    const input = base();
    input.availableBytes = 99;
    fail(input, 'BYTES');
  });
  it('accepts a journal exactly meeting storage limit', () => {
    const input = base();
    input.availableBytes = 100;
    assert.equal(check(input).ok, true);
  });
  it('rejects a missing root collection', () => {
    const input = base() as Record<string, unknown>;
    delete input.entries;
    fail(input, 'ROOT');
  });
  it('rejects an unsupported schema version', () => {
    fail({ ...base(), schemaVersion: 2 }, 'ROOT');
  });
  it('rejects an extra root field', () => {
    fail({ ...base(), tracking: 'unsafe' }, 'ROOT');
  });
  it('rejects invalid maximum age', () => {
    fail({ ...base(), maxAgeDays: 9999 }, 'POLICY');
  });
  it('rejects invalid available bytes', () => {
    fail({ ...base(), availableBytes: -1 }, 'POLICY');
  });
  it('rejects malformed event arrays', () => {
    fail({ ...base(), entries: 'oops' }, 'LIMIT');
  });
  it('rejects an event missing required fields', () => {
    const input = base();
    input.entries = [{}] as unknown as typeof input.entries;
    fail(input, 'ENTRY');
  });
  it('rejects an item missing required fields', () => {
    const input = base();
    input.items = [{}] as unknown as typeof input.items;
    fail(input, 'ITEM');
  });
  it('preserves deterministic issue ordering', () => {
    const input = base();
    input.availableBytes = 1;
    input.entries[1]!.previousDigest = HASH_A;
    assert.deepEqual(check(input), check(input));
  });
});
