import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compare, decisionKey, releasePolicy, summarizeDelta } from './compare.mjs';
import { base, blocksDelta, allows, clone, known, corrected, withdrawn, secondFeature,
  secondSource, issue, source, observation, decision } from './fixtures.mjs';

const POLICY = Object.freeze({ removedDecisions: [], maxRemovals: 0 });
const COPY = () => clone(POLICY);

describe('release comparison policy', () => {
  it('accepts default policy', () => assert.equal(releasePolicy(POLICY), true));
  it('accepts a finite authorized removal list', () => {
    assert.equal(releasePolicy({ removedDecisions: ['place-a/entrance'], maxRemovals: 1 }), true);
  });
  for (const value of [null, {}, [], { removedDecisions: [], maxRemovals: -1 },
    { removedDecisions: [], maxRemovals: .5 }, { removedDecisions: [], maxRemovals: 1001 },
    { removedDecisions: ['../../etc'], maxRemovals: 1 },
    { removedDecisions: ['a/b', 'a/b'], maxRemovals: 2 },
    { removedDecisions: [], maxRemovals: 0, secret: 'x' },
    { removedDecisions: 'place-a/entrance', maxRemovals: 1 }]) {
    it(`rejects invalid policy ${JSON.stringify(value)}`, () => assert.equal(releasePolicy(value), false));
  }
  it('blocks comparison when policy is absent', () => {
    const result = compare(base(), base(), null);
    assert.equal(result.ok, false);
    assert.ok(issue(result, 'POLICY'));
  });
  it('allows zero removals under zero-removal policy', () => {
    assert.equal(compare(base(), base(), COPY()).ok, true);
  });
  it('returns stable decision keys', () => assert.equal(decisionKey(decision), 'place-a/entrance'));
});

describe('identical release snapshots', () => {
  it('accepts an identical base package', () => {
    const result = compare(base(), base());
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('reports unchanged decision count', () => {
    const result = compare(base(), base());
    assert.equal(result.totals.unchanged, 1);
  });
  it('reports zero changed decisions', () => assert.equal(compare(base(), base()).totals.changed, 0));
  it('reports zero new observations', () => assert.equal(compare(base(), base()).totals.addedObservations, 0));
  it('reports zero removed observations', () => assert.equal(compare(base(), base()).totals.removedObservations, 0));
  it('accepts known YES repeated with original provenance', () => assert.equal(compare(known('YES'), known('YES')).ok, true));
  it('accepts known NO repeated with original provenance', () => assert.equal(compare(known('NO'), known('NO')).ok, true));
  it('does not modify original snapshots', () => {
    const old = known('YES'); const next = clone(old);
    const snapshot = clone(old); compare(old, next);
    assert.deepEqual(old, snapshot); assert.deepEqual(next, snapshot);
  });
  it('uses deterministic serialization for repeated calls', () => {
    const old = base(); const next = base();
    assert.deepEqual(compare(old, next), compare(old, next));
  });
});

describe('release root constraints', () => {
  it('blocks malformed before package', () => blocksDelta({}, base(), 'INPUT'));
  it('blocks malformed after package', () => blocksDelta(base(), {}, 'INPUT'));
  it('blocks source licence failure before comparison', () => {
    const old = base(); old.sources[0].licence = 'private';
    blocksDelta(old, base(), 'INPUT');
  });
  it('blocks unsafe new observation data', () => {
    const next = base(); next.observations[0].noteFr = '<script>unsafe</script>';
    blocksDelta(base(), next, 'INPUT');
  });
  it('blocks a release whose date is earlier', () => {
    const next = base(); next.policy.asOf = '2026-11-19';
    blocksDelta(base(), next, 'DATE');
  });
  it('accepts a release that moves forward one day', () => {
    const next = base(); next.policy.asOf = '2026-11-21';
    assert.equal(compare(base(), next).ok, true);
  });
  it('accepts same calendar date for two builds', () => {
    assert.equal(compare(base(), base()).ok, true);
  });
  it('does not allow stale source as a shortcut to change', () => {
    const next = base(); next.sources[0].observedOn = '2024-01-01';
    blocksDelta(base(), next, 'INPUT');
  });
});

describe('explicit removal governance', () => {
  it('rejects silent removal of an existing decision', () => {
    const old = base(); const next = base(); next.decisions = []; next.observations = [];
    blocksDelta(old, next, 'REMOVED');
  });
  it('rejects a removal even when maxRemovals is nonzero without its identifier', () => {
    const next = base(); next.decisions = []; next.observations = [];
    blocksDelta(base(), next, 'REMOVED', { removedDecisions: [], maxRemovals: 1 });
  });
  it('rejects removal count exceeding policy limit', () => {
    const next = base(); next.decisions = []; next.observations = [];
    blocksDelta(base(), next, 'POLICY', { removedDecisions: ['place-a/entrance'], maxRemovals: 0 });
  });
  it('rejects policy referring to a still-present decision', () => {
    blocksDelta(base(), base(), 'UNUSED', { removedDecisions: ['place-a/entrance'], maxRemovals: 1 });
  });
  it('rejects policy referring to a never-present decision', () => {
    blocksDelta(base(), base(), 'UNUSED', { removedDecisions: ['place-b/entrance'], maxRemovals: 1 });
  });
  it('counts removed records without hiding them', () => {
    const next = base(); next.decisions = []; next.observations = [];
    const result = compare(base(), next);
    assert.equal(result.totals.removed, 1);
  });
  it('rejects lost observation history even if decision removal is authorized', () => {
    const next = base(); next.decisions = []; next.observations = [];
    blocksDelta(base(), next, 'HISTORY', { removedDecisions: ['place-a/entrance'], maxRemovals: 1 });
  });
  it('accepts addition of a new complete feature without removals', () => {
    const next = secondFeature(base(), 'washroom');
    const result = compare(base(), next);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.totals.added, 1);
  });
  it('counts two independent additions', () => {
    const next = secondFeature(secondFeature(base(), 'washroom'), 'parking');
    const result = compare(base(), next);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.totals.added, 2);
  });
});

describe('observation continuity', () => {
  it('blocks removed observation even if state stays UNKNOWN', () => {
    const next = base(); next.observations = [];
    next.decisions[0].observationIds = [];
    blocksDelta(base(), next, 'HISTORY');
  });
  it('blocks rewriting prior observation state under same ID', () => {
    const old = known('YES'); const next = clone(old);
    next.observations[0].state = 'NO'; next.decisions[0].state = 'NO';
    blocksDelta(old, next, 'HISTORY');
  });
  it('blocks rewriting earlier observation source list', () => {
    const next = secondSource(base(), 'other-source');
    next.observations[0].sourceIds = ['other-source'];
    next.decisions[0].sourceIds = ['other-source'];
    blocksDelta(base(), next, 'HISTORY');
  });
  it('blocks rewriting earlier recorded date', () => {
    const next = base(); next.observations[0].observedOn = '2026-11-11';
    blocksDelta(base(), next, 'HISTORY');
  });
  it('blocks rewriting earlier feature', () => {
    const next = base(); next.observations[0].feature = 'parking';
    next.decisions[0].feature = 'parking';
    blocksDelta(base(), next, 'HISTORY');
  });
  it('accepts a new dated correction without rewriting predecessor', () => {
    const old = known('YES');
    const next = corrected(clone(old), 'NO');
    const result = compare(old, next);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.totals.changed, 1);
    assert.equal(result.totals.addedObservations, 1);
  });
  it('accepts a new withdrawal changing known state to UNKNOWN', () => {
    const old = known('YES');
    const next = withdrawn(clone(old));
    const result = compare(old, next);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
  });
  it('blocks UNKNOWN promotion without new evidence', () => {
    const old = base(); const next = known('YES');
    blocksDelta(old, next, 'UNKNOWN');
  });
  it('blocks a change from known YES to NO without new observation', () => {
    const old = known('YES'); const next = known('NO');
    blocksDelta(old, next, 'ACCESS');
  });
  it('counts an unchanged observation inventory', () => {
    const result = compare(base(), base());
    assert.equal(result.totals.addedObservations, 0);
    assert.equal(result.totals.removedObservations, 0);
  });
});

describe('source history and licence continuity', () => {
  it('blocks source licence changes under stable ID', () => {
    const old = known('YES'); const next = clone(old);
    next.sources[0].licence = 'ODbL-1.0'; next.decisions[0].silo = 'odbl';
    blocksDelta(old, next, 'SOURCE');
  });
  it('blocks source name changes under stable ID', () => {
    const next = base(); next.sources[0].name = 'Different municipal source';
    blocksDelta(base(), next, 'SOURCE');
  });
  it('blocks source reference changes under stable ID', () => {
    const next = base(); next.sources[0].reference = 'sources/other.txt';
    blocksDelta(base(), next, 'SOURCE');
  });
  it('blocks source dates moving backwards', () => {
    const next = base(); next.sources[0].observedOn = '2026-11-09';
    blocksDelta(base(), next, 'CLOCK');
  });
  it('accepts same source date', () => assert.equal(compare(base(), base()).ok, true));
  it('accepts updated source date when not preceding its recorded observation', () => {
    const old = base(); const next = base();
    next.sources[0].observedOn = '2026-11-11';
    assert.equal(compare(old, next).ok, true);
  });
  it('allows new separate source with distinct identifier', () => {
    const next = secondSource(base());
    const result = compare(base(), next);
    assert.equal(result.ok, true);
  });
  it('does not change source count in identical release', () => {
    const result = compare(base(), base());
    assert.equal(result.totals.beforeDecisions, result.totals.afterDecisions);
  });
});

describe('structured delta report', () => {
  it('summarizes changed vs unchanged decisions', () => {
    const old = known('YES'); const next = corrected(clone(old), 'NO');
    const report = summarizeDelta(old, next, POLICY);
    assert.equal(report.totals.changed, 1);
    assert.equal(report.totals.unchanged, 0);
  });
  it('includes issue categories for blocked snapshots', () => {
    const report = summarizeDelta(base(), {}, POLICY);
    assert.deepEqual(report.categories, ['INPUT']);
  });
  it('returns empty categories for matching releases', () => {
    assert.deepEqual(summarizeDelta(base(), base(), POLICY).categories, []);
  });
  it('does not mutate supplied removal policy', () => {
    const p = COPY(); const snapshot = clone(p);
    compare(base(), base(), p);
    assert.deepEqual(p, snapshot);
  });
  it('has deterministic issue order', () => {
    const old = known('YES'); const next = known('NO');
    assert.deepEqual(compare(old, next), compare(old, next));
  });
  it('findings have human-readable English and French', () => {
    const report = blocksDelta(base(), {}, 'INPUT');
    assert.ok(report.findings.every(f => f.en && f.fr));
  });
});

it('detects evidence tier changes and backdated retrievals under a published source ID', () => {
  const older = base();
  const current = base();
  current.sources[0].tier = 4;
  blocksDelta(older, current, 'SOURCE');
  current.sources[0].tier = 0;
  current.sources[0].retrievedOn = '2026-11-11';
  blocksDelta(older, current, 'CLOCK');
  current.sources[0].retrievedOn = '2026-11-13';
  assert.equal(compare(older, current).ok, true);
});
