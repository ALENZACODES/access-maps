import assert from 'node:assert/strict';
import test from 'node:test';
import { planReviewAssignments } from './p15am-dispatch.mts';
import { candidate, desk, errorCode, queue, step } from './p15am-fixtures.mjs';

const alpha = candidate('alpha', { priority: 'urgent' });
const beta = candidate('beta', { priority: 'high' });
const gamma = candidate('gamma', { priority: 'normal' });

test('reassigns a tentative generalist task to keep a source-restricted slot available', () => {
  const roster = [desk(1, 1), desk(2, 1, [beta.sourceId])];
  const q = queue([alpha, beta], roster);
  const result = planReviewAssignments(q);
  assert.deepEqual(result.assignments, [
    { proposalId: alpha.proposalId, deskId: 'desk-02' },
    { proposalId: beta.proposalId, deskId: 'desk-01' }
  ]);
  assert.deepEqual(result.deferred, []);
  assert.deepEqual(result.cursor, q.cursor);
  assert.equal(q.events.length, 0);
});

test('moves two tentative claims along a path when the last proposal has only one desk', () => {
  const roster = [
    desk(1, 1, [beta.sourceId]),
    desk(2, 1, [gamma.sourceId]),
    desk(3, 1, [alpha.sourceId, gamma.sourceId])
  ];
  const q = queue([alpha, beta, gamma], roster);
  const { assignments, deferred } = planReviewAssignments(q);
  assert.deepEqual(assignments, [
    { proposalId: alpha.proposalId, deskId: 'desk-02' },
    { proposalId: beta.proposalId, deskId: 'desk-03' },
    { proposalId: gamma.proposalId, deskId: 'desk-01' }
  ]);
  assert.deepEqual(deferred, []);
});

test('a real claim cannot be moved even if moving it would cover an additional source', () => {
  const roster = [desk(1, 1), desk(2, 1, [beta.sourceId])];
  const opened = queue([alpha, beta], roster);
  const assigned = step(opened, 'claim', { proposalId: alpha.proposalId });
  const result = planReviewAssignments(assigned);
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.deferred, [{ proposalId: beta.proposalId, why: 'capacity' }]);
  const released = step(assigned, 'release', { proposalId: alpha.proposalId });
  assert.equal(planReviewAssignments(released).assignments.length, 2);
});

test('deferred reasons distinguish desk conflicts, an exhausted slot budget and the operator limit', () => {
  const blocked = [alpha.sourceId];
  const roster = [desk(1, 1, blocked), desk(2, 2, blocked)];
  const q = queue([alpha, beta, gamma], roster);
  const zero = planReviewAssignments(q, 0);
  assert.deepEqual(zero.deferred.map(d => d.why), ['excluded', 'limit', 'limit']);
  const one = planReviewAssignments(q, 1);
  assert.equal(one.assignments[0].proposalId, beta.proposalId);
  assert.deepEqual(one.deferred.map(d => d.why), ['excluded', 'limit']);
  const small = queue([alpha, beta, gamma], [desk(1, 1, blocked)]);
  const bounded = planReviewAssignments(small);
  assert.deepEqual(bounded.deferred.map(d => d.why), ['excluded', 'capacity']);
  errorCode('VALUE', () => planReviewAssignments(q, -1));
  errorCode('VALUE', () => planReviewAssignments(q, Infinity));
});

test('priority then oldest retrieval then largest associated record set orders the next claim', () => {
  const older = candidate('older');
  older.provenance.retrievedOn = '2025-12-31';
  const wider = candidate('wider', { recordIds: ['north', 'south', 'east'] });
  const later = candidate('later', { recordIds: ['north'] });
  const q = queue([later, wider, alpha, older], [desk(1, 8)]);
  assert.deepEqual(planReviewAssignments(q).assignments.map(row => row.proposalId), [
    alpha.proposalId, older.proposalId, wider.proposalId, later.proposalId
  ]);
});

test('projected occupancy spreads equivalent work proportionately across uneven capacities', () => {
  const candidates = Array.from({ length: 5 }, (_, index) => candidate('s' + index));
  const roster = [desk(1, 2), desk(2, 4)];
  const forward = planReviewAssignments(queue(candidates, roster));
  const reversed = planReviewAssignments(queue([...candidates].reverse(), [...roster].reverse()));
  assert.deepEqual(reversed, forward);
  assert.equal(forward.assignments.filter(a => a.deskId === 'desk-01').length, 2);
  assert.equal(forward.assignments.filter(a => a.deskId === 'desk-02').length, 3);
});

test('an offered proposal consumes its donor slot while the recipient remains free to claim', () => {
  const roster = [desk(1, 1), desk(2, 1)];
  const claimed = step(queue([alpha, beta], roster), 'claim', { proposalId: alpha.proposalId });
  const offered = step(claimed, 'offer', { proposalId: alpha.proposalId, payload: { to: 'desk-02' } });
  const plan = planReviewAssignments(offered);
  assert.deepEqual(plan.assignments, [{ proposalId: beta.proposalId, deskId: 'desk-02' }]);
  const [a] = plan.assignments;
  const next = step(offered, 'claim', { actor: a.deskId, proposalId: a.proposalId });
  errorCode('CAPACITY', () => step(next, 'accept', { actor: 'desk-02', proposalId: alpha.proposalId }));
});

// Exhaustively enumerate the small independent matching problem. The production
// planner uses capacity-aware augmenting paths, not a brute-force search.
function independentBest(candidates, roster, limit) {
  const remaining = roster.map(d => d.capacity);
  let bestScore = -1;
  function visit(index, assigned, score) {
    if (index === candidates.length) {
      bestScore = Math.max(bestScore, score);
      return;
    }
    const c = candidates[index];
    visit(index + 1, assigned, score);
    if (assigned === limit) return;
    for (let i = 0; i < roster.length; i++) {
      if (remaining[i] === 0 || roster[i].excludedSources.includes(c.sourceId)) continue;
      remaining[i]--;
      visit(index + 1, assigned + 1, score + 2 ** (candidates.length - 1 - index));
      remaining[i]++;
    }
  }
  visit(0, 0, 0);
  return bestScore;
}

test('every three-source, two-desk conflict graph selects the highest feasible priority set', () => {
  const candidates = [alpha, beta, gamma];
  const rosterFrom = (mask, n) => desk(n, n, candidates.filter((_, i) => mask & (1 << i)).map(c => c.sourceId));
  for (let a = 0; a < 8; a++) {
    for (let b = 0; b < 8; b++) {
      const roster = [rosterFrom(a, 1), rosterFrom(b, 2)];
      const q = queue(candidates, roster);
      for (const limit of [1, 2, 3]) {
        const plan = planReviewAssignments(q, limit);
        const selected = new Set(plan.assignments.map(row => row.proposalId));
        let score = 0;
        for (const [index, row] of candidates.entries()) {
          if (selected.has(row.proposalId)) score += 2 ** (2 - index);
        }
        assert.equal(score, independentBest(candidates, roster, limit), JSON.stringify({ a, b, limit }));
        // A plan must also be executable through the same transition gate as interactive claims.
        let live = q;
        for (const suggestion of plan.assignments) {
          live = step(live, 'claim', { proposalId: suggestion.proposalId, actor: suggestion.deskId });
        }
        assert.equal(live.events.length, selected.size);
      }
    }
  }
});
