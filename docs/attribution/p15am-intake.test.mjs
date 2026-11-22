import assert from 'node:assert/strict';
import test from 'node:test';
import { openReviewQueue, validateReviewQueue, applyReviewCommands } from './p15am-queue.mts';
import { candidate, command, desk, errorCode, queue, seed, step } from './p15am-fixtures.mjs';

test('equivalent keys, arrays and roster order yield the same canonical genesis', () => {
  const a = candidate('alpha', { recordIds: ['record-z', 'record-a'] });
  const b = candidate('beta');
  b.provenance.verificationTier = 0;
  const desks = [desk(3, 2, ['sample-z', 'sample-a']), desk(1)];
  const normal = queue([a, b], desks);
  const otherSourceOrder = {
    ...a, priority: a.priority, provenance: Object.fromEntries(Object.entries(a.provenance).reverse()),
    recordIds: [...a.recordIds].reverse()
  };
  const alternate = queue([b, otherSourceOrder], [
    desk(1), desk(3, 2, ['sample-a', 'sample-z'])
  ]);
  assert.deepEqual(normal, alternate);
  assert.deepEqual(normal.seed.desks.map(d => d.deskId), ['desk-01', 'desk-03']);
  assert.equal(normal.seed.candidates.find(c => c.sourceId === b.sourceId).provenance.verificationTier, 0);
  const changedTerms = structuredClone(a);
  changedTerms.provenance.licence = 'Version 2';
  assert.notEqual(queue([changedTerms, b], desks).genesis, normal.genesis);
});

test('records with no coverage remain reviewable without manufacturing record IDs', () => {
  const c = candidate('unlinked', { recordIds: [], reason: 'source-unavailable' });
  const q = queue([c]);
  assert.deepEqual(q.seed.candidates[0], c);
  assert.deepEqual(queue([]).seed.candidates, []);
  assert.equal(q.cursor.revision, 0);
});

test('the roster requires anonymous unique desk handles, positive bounded capacity and unique exclusions', () => {
  errorCode('LIMIT', () => queue([], []));
  errorCode('VALUE', () => queue([], [desk(1, 0)]));
  errorCode('VALUE', () => queue([], [desk(1, 33)]));
  errorCode('VALUE', () => queue([], [desk(1, 1.5)]));
  errorCode('ID', () => queue([], [{ ...desk(1), deskId: 'desk-fictional-person' }]));
  errorCode('DUPLICATE', () => queue([], [desk(1), desk(1)]));
  errorCode('DUPLICATE', () => queue([], [desk(1, 2, ['sample-a', 'sample-a'])]));
  errorCode('SHAPE', () => queue([], [{ ...desk(1), reviewerEmail: 'withheld' }]));
});

test('calendar validation rejects a future retrieval, overflow day and under-specified opening time', () => {
  function dated(date) {
    const c = candidate();
    c.provenance.retrievedOn = date;
    return seed([c]);
  }
  errorCode('DATE', () => openReviewQueue(dated('2025-02-29')));
  errorCode('DATE', () => openReviewQueue(dated('2026-01-06')));
  errorCode('DATE', () => openReviewQueue({ ...dated('2024-02-29'), openedAt: '2026-01-05T12:00:00Z' }));
  const good = openReviewQueue(dated('2024-02-29'));
  assert.equal(good.seed.candidates[0].provenance.retrievedOn, '2024-02-29');
  errorCode('DATE', () => step(good, 'claim', { at: '2026-02-30T12:00:00.000Z' }));
});

test('a proposal requires source-bound provenance and rejects invented levels and evidence payloads', () => {
  const c = candidate();
  errorCode('SHAPE', () => queue([{ ...c, access: 'YES' }]));
  errorCode('SHAPE', () => queue([{ ...c, provenance: { ...c.provenance, userName: 'redacted' } }]));
  errorCode('VALUE', () => queue([{ ...c, provenance: { ...c.provenance, source: 'other' } }]));
  for (const tier of [-1, 5, 1.5, '4', null]) {
    errorCode('VALUE', () => queue([{ ...c, provenance: { ...c.provenance, verificationTier: tier } }]));
  }
  assert.equal(queue([{ ...c, provenance: { ...c.provenance, verificationTier: 4 } }])
    .seed.candidates[0].provenance.verificationTier, 4);
});

test('duplicate proposal IDs, record references and source/reason pairs are distinct input collisions', () => {
  const c = candidate();
  const b = candidate('beta');
  errorCode('DUPLICATE', () => queue([c, { ...b, proposalId: c.proposalId }]));
  errorCode('DUPLICATE', () => queue([{ ...c, recordIds: ['record-a', 'record-a'] }]));
  errorCode('DUPLICATE', () => queue([c, { ...c, proposalId: b.proposalId }]));
  const independent = queue([c, { ...c, reason: 'tier-changed', proposalId: b.proposalId }]);
  assert.equal(independent.seed.candidates.length, 2);
});

test('data containers reject extra keys, sparse entries and computed commands without invoking getters', () => {
  const c = candidate();
  const sparse = Array(3);
  sparse[2] = c;
  errorCode('SHAPE', () => queue(sparse));
  const tagged = [c];
  tagged.flag = 'untracked';
  errorCode('SHAPE', () => queue(tagged));
  const hidden = [c];
  Object.defineProperty(hidden, 'note', { value: 'untracked' });
  errorCode('SHAPE', () => queue(hidden));
  const q = queue();
  const entry = command(q, 'claim');
  let called = false;
  const trap = { get kind() { called = true; return 'claim'; } };
  errorCode('SHAPE', () => applyReviewCommands(q, [{ ...entry, action: trap }]));
  const list = [entry];
  Object.defineProperty(list, '0', { get() { called = true; return entry; } });
  errorCode('SHAPE', () => applyReviewCommands(q, list));
  assert.equal(called, false);
});

test('event rows and cursors round-trip independently of JSON property insertion order', () => {
  const q = step(queue(), 'claim');
  function reordered(value) {
    if (Array.isArray(value)) return value.map(reordered);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reordered(value[key])]));
  }
  assert.deepEqual(validateReviewQueue(reordered(q)), q);
  const shortened = { ...q, events: [] };
  errorCode('CURSOR', () => validateReviewQueue(shortened));
  const changedHead = { ...q, cursor: { revision: 1, head: q.genesis } };
  errorCode('CHECKSUM', () => validateReviewQueue(changedHead));
  const unexpectedSummary = { ...q, assignments: [] };
  errorCode('SHAPE', () => validateReviewQueue(unexpectedSummary));
});
