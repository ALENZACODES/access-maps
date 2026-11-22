import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditRouteChoices, compareRouteReviews, decisionMatrix, groupReviewTasks,
  makeReviewChecklist, rankReviewedRoutes, scoreRoute, summarizeRouteStatus,
} from './p15ac-comparison.mjs';
import { defaultReviewPolicy } from './p15ac-policy.mjs';
import {
  fictionalOntario, copy, edge, evidence, node,
} from './p15v-fixtures.mjs';

const policy = (changes = {}) => defaultReviewPolicy('2026-11-19', changes);
const endpoints = (changes = {}) => ({ start: 'a', end: 'd', ...changes });
const audit = (snapshot = fictionalOntario(), changes = {}, pair = endpoints()) =>
  auditRouteChoices(snapshot, pair, policy(changes));
function withUnknownEdge(edgeId = 'ab') {
  const snapshot = fictionalOntario();
  const target = snapshot.edges.find((item) => item.id === edgeId);
  Object.assign(target, { access: 'UNKNOWN', tier: 1, evidence: [] });
  return snapshot;
}
function withReportedBarrier(edgeId = 'ab') {
  const snapshot = fictionalOntario();
  const target = snapshot.edges.find((item) => item.id === edgeId);
  Object.assign(target, { access: 'NO', tier: 2,
    evidence: [evidence('path', 'NO')] });
  return snapshot;
}

describe('P15AC: merged-planner choices', () => {
  it('uses the shared Ontario planner for an unchanged snapshot', () => {
    const result = audit();
    assert.equal(result.ok, true);
    assert.equal(result.status, 'found');
    assert.ok(result.routes.length >= 2);
  });
  it('preserves the as-of date supplied by the underlying snapshot', () => {
    const result = audit();
    assert.equal(result.asOf, '2026-11-19');
  });
  it('preserves the actual licence partition', () => {
    const result = audit();
    assert.equal(result.policy.silo, 'open');
  });
  it('does not invent routes between missing endpoints', () => {
    const result = audit(fictionalOntario(), {}, endpoints({ end: 'missing' }));
    assert.equal(result.ok, false);
    assert.deepEqual(result.routes, []);
  });
  it('blocks invalid endpoint identifier', () => {
    const result = audit(fictionalOntario(), {}, endpoints({ start: '../a' }));
    assert.equal(result.ok, false);
  });
  it('blocks unexpected request fields', () => {
    const result = audit(fictionalOntario(), {}, endpoints({ ignoreRisks: true }));
    assert.equal(result.ok, false);
  });
  it('rejects missing endpoint request', () => {
    const result = audit(fictionalOntario(), {}, null);
    assert.equal(result.ok, false);
  });
  it('uses the configured alternatives cap', () => {
    const result = audit(fictionalOntario(), { alternatives: 1 });
    assert.equal(result.routes.length, 1);
  });
  it('allows route searches with no alternatives when none are present', () => {
    const snapshot = fictionalOntario();
    snapshot.edges = [];
    const result = audit(snapshot);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'absent');
    assert.deepEqual(result.routes, []);
  });
  it('does not claim a route across the wrong licence partition', () => {
    const result = audit(fictionalOntario(), { silo: 'odbl' });
    assert.equal(result.status, 'absent');
  });
  it('retains optional UNKNOWN routes without claiming YES', () => {
    const snapshot = withUnknownEdge('ab');
    const result = audit(snapshot, { allowUnknown: true });
    assert.equal(result.ok, true);
    const chosen = result.routes.find((route) => route.edgeIds.includes('ab'));
    assert.equal(chosen?.status, 'UNKNOWN');
  });
  it('excludes UNKNOWN routes when requested', () => {
    const snapshot = withUnknownEdge('ab');
    const result = audit(snapshot, { allowUnknown: false });
    assert.equal(result.ok, true);
    assert.ok(result.routes.every((route) => !route.edgeIds.includes('ab')));
  });
  it('includes a gap task for an UNKNOWN route segment', () => {
    const result = audit(withUnknownEdge('ab'), { allowUnknown: true });
    assert.ok(result.tasks.some((task) => task.id === 'ab'));
  });
  it('avoids a reported NO barrier on the shared routing graph', () => {
    const result = audit(withReportedBarrier('ab'));
    assert.ok(result.routes.every((route) => !route.edgeIds.includes('ab')));
  });
  it('allows exclusion of the ramp feature', () => {
    const snapshot = fictionalOntario();
    snapshot.edges[0] = edge('ab', 'a', 'b', 100, { feature: 'ramp',
      evidence: [evidence('ramp')] });
    const result = audit(snapshot, { avoidFeatures: ['ramp'] });
    assert.ok(result.routes.every((route) => !route.edgeIds.includes('ab')));
  });
  it('blocks source catalogue that has malformed entries', () => {
    const snap = fictionalOntario();
    snap.sources = [null];
    const result = audit(snap);
    assert.equal(result.ok, false);
  });
  it('does not export partially evaluated routes when the snapshot fails', () => {
    const snapshot = fictionalOntario();
    snapshot.edges.push(null);
    const result = audit(snapshot);
    assert.deepEqual(result.routes, []);
    assert.deepEqual(result.tasks, []);
  });
  it('blocks an invalid review policy before routing', () => {
    const result = audit(fictionalOntario(), { autoTrust: true });
    assert.equal(result.ok, false);
  });
  it('keeps route source and review statuses distinct', () => {
    const result = audit(withUnknownEdge());
    assert.equal(typeof result.routeSourceStatus, 'string');
    assert.ok(result.routes.some((route) => route.status === 'UNKNOWN'));
  });
  it('does not mutate the source snapshot', () => {
    const snap = fictionalOntario();
    const original = copy(snap);
    audit(snap);
    assert.deepEqual(snap, original);
  });
  it('keeps returned routes immutable', () => {
    const result = audit();
    assert.equal(Object.isFrozen(result.routes), true);
    assert.equal(Object.isFrozen(result.routes[0]), true);
  });
  it('preserves actual source identifiers in route citations', () => {
    const result = audit();
    assert.deepEqual(result.routes[0].sourceIds, ['municipal']);
  });
  it('does not treat return-path absence as support', () => {
    const snapshot = fictionalOntario();
    for (const entry of snapshot.edges) entry.direction = 'forward';
    const forward = audit(snapshot);
    const reverse = audit(snapshot, {}, { start: 'd', end: 'a' });
    assert.equal(forward.status, 'found');
    assert.equal(reverse.status, 'absent');
  });
  it('does not claim an unlinked node can be reached', () => {
    const snapshot = fictionalOntario();
    snapshot.nodes.push(node('orphan', 'market', 43.76, -79.45));
    snapshot.places[1].nodeIds.push('orphan');
    const result = audit(snapshot, {}, { start: 'a', end: 'orphan' });
    assert.equal(result.status, 'absent');
  });
});

describe('P15AC: deterministic ranking and review choices', () => {
  it('ranks a supported alternative before UNKNOWN when possible', () => {
    const review = audit(withUnknownEdge());
    const choices = rankReviewedRoutes(review);
    assert.equal(choices[0].status, 'YES');
  });
  it('returns empty ranking for blocked review', () => {
    assert.deepEqual(rankReviewedRoutes({ ok: false }), []);
  });
  it('applies sequential review ranks without modifying original ranks', () => {
    const choices = rankReviewedRoutes(audit());
    assert.deepEqual(choices.map((c) => c.reviewRank),
      choices.map((_, index) => index + 1));
  });
  it('calculates an integer coverage percentage', () => {
    const review = audit();
    const metrics = scoreRoute(review.routes[0], review.policy);
    assert.equal(Number.isInteger(metrics.coveragePercent), true);
    assert.equal(metrics.coveragePercent, 100);
  });
  it('penalizes an UNKNOWN alternative', () => {
    const supported = audit();
    const conditional = audit(withUnknownEdge());
    const a = supported.routes[0];
    const b = conditional.routes.find((r) => r.status === 'UNKNOWN');
    assert.ok(scoreRoute(b, conditional.policy).score >
      scoreRoute(a, supported.policy).score);
  });
  it('assigns higher cost to recorded barriers than supported routes', () => {
    const current = policy();
    const sample = { totalSegments: 2, supportedSegments: 2,
      metres: 100, status: 'YES', unresolvedCount: 0, blockedCount: 0 };
    assert.ok(scoreRoute({ ...sample, status: 'NO', blockedCount: 1 }, current).score >
      scoreRoute(sample, current).score);
  });
  it('never calls an UNKNOWN route supported', () => {
    const current = policy({ allowUnknown: true });
    const sample = { totalSegments: 1, supportedSegments: 0,
      metres: 100, status: 'UNKNOWN', unresolvedCount: 1, blockedCount: 0 };
    assert.equal(scoreRoute(sample, current).supported, false);
  });
  it('is deterministic across repeated ranking calls', () => {
    const review = audit();
    assert.deepEqual(rankReviewedRoutes(review), rankReviewedRoutes(review));
  });
  it('constructs a decision matrix with metres and evidence sources', () => {
    const rows = decisionMatrix(audit());
    assert.ok(rows.length > 0);
    assert.ok(rows[0].metres > 0);
    assert.ok(rows[0].evidenceSources >= 1);
  });
  it('reports explicit UNKNOWN route counts', () => {
    const report = summarizeRouteStatus(audit(withUnknownEdge()));
    assert.ok(report.unknown >= 1);
  });
  it('counts route segments without claiming unique physical segments', () => {
    const result = audit();
    const summary = summarizeRouteStatus(result);
    assert.equal(summary.segments, result.routes.reduce((a, r) => a + r.segments.length, 0));
  });
  it('returns a blocked summary for invalid review', () => {
    const summary = summarizeRouteStatus({ ok: false });
    assert.equal(summary.status, 'blocked');
    assert.equal(summary.routes, 0);
  });
  it('groups tasks by diagnostic code', () => {
    const result = audit(withUnknownEdge());
    const groups = groupReviewTasks(result);
    assert.ok(groups.groups.length > 0);
    assert.ok(groups.groups.every((g) => g.count > 0));
  });
  it('does not count one segment twice in the task checklist', () => {
    const checklist = makeReviewChecklist(audit(withUnknownEdge()));
    assert.equal(new Set(checklist.map((item) => item.segmentId)).size, checklist.length);
  });
  it('does not automatically complete a task', () => {
    const checklist = makeReviewChecklist(audit(withUnknownEdge()));
    assert.ok(checklist.every((task) => task.completion === 'UNKNOWN'));
  });
  it('labels every task as a manual review', () => {
    const checklist = makeReviewChecklist(audit(withUnknownEdge()));
    assert.ok(checklist.every((task) => task.action === 'manual-review'));
  });
  it('keeps source dates in the review checklist', () => {
    const checklist = makeReviewChecklist(audit(withUnknownEdge()));
    assert.ok(checklist[0].sourceDates.every((entry) => entry.observedOn));
  });
  it('returns empty checklist for blocked review', () => {
    assert.deepEqual(makeReviewChecklist({ ok: false }), []);
  });
  it('returns no matrix entries for absent routes', () => {
    const snap = fictionalOntario();
    snap.edges = [];
    assert.deepEqual(decisionMatrix(audit(snap)), []);
  });
  it('keeps all task group labels bilingual', () => {
    const groups = groupReviewTasks(audit(withUnknownEdge()));
    assert.ok(groups.groups.every((item) => item.en && item.fr));
  });
});

describe('P15AC: cross-snapshot route review differences', () => {
  it('accepts identical route reviews', () => {
    const current = audit();
    const changes = compareRouteReviews(current, current);
    assert.equal(changes.ok, true);
    assert.equal(changes.changes.length, 0);
  });
  it('blocks comparison of invalid reviews', () => {
    const changes = compareRouteReviews({ ok: false }, audit());
    assert.equal(changes.ok, false);
  });
  it('blocks date-window mismatch', () => {
    const first = audit();
    const second = { ...first, asOf: '2026-11-18' };
    assert.equal(compareRouteReviews(first, second).ok, false);
  });
  it('blocks comparison across licence exports', () => {
    const first = audit();
    const second = { ...first, policy: { ...first.policy, silo: 'odbl' } };
    assert.equal(compareRouteReviews(first, second).ok, false);
  });
  it('detects removed route when an edge disappears', () => {
    const before = audit();
    const next = fictionalOntario();
    next.edges = next.edges.filter((item) => item.id !== 'bd');
    const after = audit(next);
    const changes = compareRouteReviews(before, after);
    assert.equal(changes.ok, true);
    assert.ok(changes.changes.some((c) => c.kind === 'removed'));
  });
  it('detects a newly added route', () => {
    const beforeSnap = fictionalOntario();
    beforeSnap.edges = beforeSnap.edges.filter((item) => item.id !== 'bd');
    const before = audit(beforeSnap);
    const after = audit();
    const changes = compareRouteReviews(before, after);
    assert.ok(changes.changes.some((c) => c.kind === 'added'));
  });
  it('reports change signature using ordered edge ids', () => {
    const before = audit();
    const after = audit(withUnknownEdge());
    const changes = compareRouteReviews(before, after);
    assert.ok(changes.changes.every((c) => typeof c.signature === 'string'));
  });
  it('does not convert absent prior status into an affirmative claim', () => {
    const before = audit();
    const after = audit(withUnknownEdge());
    const changes = compareRouteReviews(before, after);
    assert.ok(changes.changes.every((c) => ['YES', 'NO', 'UNKNOWN'].includes(c.beforeStatus)));
  });
  it('reports uncertainty changes explicitly', () => {
    const before = audit();
    const after = audit(withUnknownEdge());
    const changes = compareRouteReviews(before, after);
    assert.ok(changes.changes.some((c) =>
      ['status-changed', 'uncertainty-changed', 'added', 'removed'].includes(c.kind)));
  });
  it('returns stable change ordering across calls', () => {
    const before = audit();
    const after = audit(withUnknownEdge());
    assert.deepEqual(compareRouteReviews(before, after), compareRouteReviews(before, after));
  });
  it('does not mutate the before review during comparison', () => {
    const before = audit();
    const snapshot = structuredClone(before.routes);
    compareRouteReviews(before, audit(withUnknownEdge()));
    assert.deepEqual(before.routes, snapshot);
  });
  it('does not change the route policy during comparison', () => {
    const before = audit();
    compareRouteReviews(before, audit());
    assert.equal(before.policy.minimumTier, 2);
  });
});
