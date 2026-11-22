import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutReviewCursor, compareReviewBranches } from './p15am-history.mts';
import { traceReviewItem } from './p15am-queue.mts';
import { candidate, desk, errorCode, item, queue, step } from './p15am-fixtures.mjs';

test('exact ancestor checkout reconstructs the historical owner and permits isolated follow-up', () => {
  const opened = queue();
  const claimed = step(opened, 'claim');
  const offered = step(claimed, 'offer', { payload: { to: 'desk-02' } });
  const accepted = step(offered, 'accept', { actor: 'desk-02' });
  const atClaim = checkoutReviewCursor(accepted, claimed.cursor);
  assert.deepEqual(atClaim, claimed);
  const released = step(atClaim, 'release');
  assert.equal(item(released).phase, 'ready');
  assert.equal(item(accepted).owner, 'desk-02');
  assert.deepEqual(checkoutReviewCursor(accepted, opened.cursor), opened);
  assert.deepEqual(checkoutReviewCursor(accepted, accepted.cursor), accepted);
});

test('historic checkout checks the entire received journal before returning an ancestor', () => {
  const opened = queue();
  const claimed = step(opened, 'claim');
  claimed.events[0].command.action = { kind: 'release' };
  errorCode('CHECKSUM', () => checkoutReviewCursor(claimed, opened.cursor));
  errorCode('GAP', () => checkoutReviewCursor(opened, claimed.cursor));
  const wrong = { ...opened.cursor, head: 'f'.repeat(64) };
  errorCode('FORK', () => checkoutReviewCursor(opened, wrong));
});

test('branch comparison identifies prefix relationships and only lists post-ancestor proposals', () => {
  const second = candidate('beta');
  const opened = queue([candidate(), second]);
  const older = step(opened, 'claim');
  const newer = step(older, 'claim', { proposalId: second.proposalId, actor: 'desk-02' });
  const id = compareReviewBranches(newer, structuredClone(newer));
  assert.deepEqual(id, {
    relationship: 'identical', common: newer.cursor, left: newer.cursor, right: newer.cursor,
    proposals: [], reusedCommandIds: []
  });
  const forward = compareReviewBranches(older, newer);
  assert.equal(forward.relationship, 'right-ahead');
  assert.deepEqual(forward.common, older.cursor);
  assert.deepEqual(forward.proposals, [{
    proposalId: second.proposalId, left: null,
    right: { count: 1, firstRevision: 2, lastRevision: 2, actors: ['desk-02'] }
  }]);
  const back = compareReviewBranches(newer, older);
  assert.equal(back.relationship, 'left-ahead');
  assert.deepEqual(back.proposals[0].left, forward.proposals[0].right);
  assert.equal(back.proposals[0].right, null);
});

test('a fork summary records shared command IDs, ordering and all affected proposals', () => {
  const second = candidate('beta');
  const common = step(queue([candidate(), second]), 'claim');
  const op = 'op-1234567890abcdef';
  const given = step(common, 'offer', { id: op, payload: { to: 'desk-02' } });
  const left = step(given, 'accept', { actor: 'desk-02' });
  const submitted = step(common, 'submit', { id: op });
  const right = step(submitted, 'claim', { proposalId: second.proposalId });
  const comparison = compareReviewBranches(left, right);
  assert.deepEqual(comparison.common, common.cursor);
  assert.deepEqual(comparison.reusedCommandIds, [op]);
  assert.equal(comparison.relationship, 'diverged');
  const alpha = comparison.proposals.find(row => row.proposalId === candidate().proposalId);
  assert.deepEqual(alpha.left, { count: 2, firstRevision: 2, lastRevision: 3, actors: ['desk-01', 'desk-02'] });
  assert.deepEqual(alpha.right, { count: 1, firstRevision: 2, lastRevision: 2, actors: ['desk-01'] });
  assert.equal(comparison.proposals.find(row => row.proposalId === second.proposalId).left, null);
  assert.deepEqual(checkoutReviewCursor(left, comparison.common), checkoutReviewCursor(right, comparison.common));
});

test('disjoint proposal sets can still represent an incompatible double booking', () => {
  const second = candidate('beta');
  const q = queue([candidate(), second], [desk(1, 1)]);
  const left = step(q, 'claim');
  const right = step(q, 'claim', { proposalId: second.proposalId });
  const comparison = compareReviewBranches(left, right);
  assert.equal(comparison.relationship, 'diverged');
  assert.equal(comparison.proposals.length, 2);
  assert.deepEqual(comparison.common, q.cursor);
  assert.ok(comparison.proposals.every(p => Boolean(p.left) !== Boolean(p.right)));
  errorCode('BASE', () => compareReviewBranches(left, queue([second])));
});

test('a proposal timeline preserves global revision gaps, accepted ownership and blockers', () => {
  const second = candidate('beta');
  const q = queue([candidate(), second]);
  const first = step(q, 'claim');
  const other = step(first, 'claim', { proposalId: second.proposalId, actor: 'desk-03' });
  const offer = step(other, 'offer', { payload: { to: 'desk-02' } });
  const moved = step(offer, 'accept', { actor: 'desk-02' });
  const blocked = step(moved, 'block', { actor: 'desk-02', payload: { reason: 'rights-unclear' } });
  const trace = traceReviewItem(blocked, candidate().proposalId);
  assert.deepEqual(trace.moments.map(m => m.cursor.revision), [1, 3, 4, 5]);
  assert.deepEqual(trace.moments.map(m => m.owner), ['desk-01', 'desk-01', 'desk-02', null]);
  assert.deepEqual(trace.moments.map(m => m.offeredTo), [null, 'desk-02', null, null]);
  assert.equal(trace.moments.at(-1).obstacle, 'rights-unclear');
  assert.equal(trace.moments[1].phase, 'handoff');
  assert.deepEqual(trace.cursor, blocked.cursor);
  assert.deepEqual(trace.item, item(blocked));
  assert.deepEqual(traceReviewItem(q, second.proposalId).moments, []);
  errorCode('ITEM', () => traceReviewItem(q, candidate('missing').proposalId));
});
