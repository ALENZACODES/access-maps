import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessObservation, assessRecord, assessSegment, assessRoutePath,
  collectEvidenceGaps, createCoverageContext, coverageIssue,
} from './p15ac-coverage.mjs';
import { boundedSourceIndex, defaultReviewPolicy } from './p15ac-policy.mjs';
import {
  fictionalOntario, copy, node, evidence, request,
} from './p15v-fixtures.mjs';
import { planOntarioRoutes } from './p15v-ontario-routing.mjs';

const policy = (changes = {}) => defaultReviewPolicy('2026-11-19', changes);
function environment(changes = {}) {
  const snapshot = fictionalOntario();
  const current = policy(changes);
  const sources = boundedSourceIndex(snapshot, current);
  const nodes = new Map(snapshot.nodes.map((entry) => [entry.id, entry]));
  return { snapshot, current, sources, nodes };
}
function observation(overrides = {}) {
  return { ...evidence('path'), ...overrides };
}
function assessEdge(edgeChanges = {}, policyChanges = {}) {
  const { snapshot, sources, current } = environment(policyChanges);
  const item = { ...snapshot.edges[0], ...edgeChanges };
  return assessRecord(item, sources, current, `edges.${item.id}`);
}

describe('P15AC: observation-level evidence', () => {
  it('keeps the returned record free of incoming object aliases', () => {
    const { snapshot, sources, current } = environment();
    const raw = snapshot.edges[0].evidence[0];
    const r = assessObservation(raw, snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(r.ok, true);
    assert.notEqual(r.observation, raw);
    assert.equal(Object.isFrozen(r.observation), true);
  });
  it('accepts an observation with a matching source, date and feature', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation(), snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.status, 'YES');
    assert.equal(result.problems.length, 0);
  });
  it('keeps access UNKNOWN when the source does not exist', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ sourceId: 'missing' }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.status, 'UNKNOWN');
    assert.ok(result.problems.some((entry) => entry.code === 'MISSING'));
  });
  it('keeps source date UNKNOWN for missing source', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ sourceId: 'missing' }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.observation.sourceDate, 'UNKNOWN');
    assert.equal(result.observation.licence, 'UNKNOWN');
  });
  it('rejects a malformed observation shape without throwing', () => {
    const { snapshot, sources, current } = environment();
    for (const bad of [null, 2, {}, [], 'evidence']) {
      const result = assessObservation(bad, snapshot.edges[0], sources, current, 'obs.0');
      assert.equal(result.ok, false);
      assert.equal(result.observation, null);
    }
  });
  it('rejects an unsupported evidence tier', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ tier: 7 }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.status, 'UNKNOWN');
  });
  it('rejects a tier-zero YES observation', () => {
    const { snapshot, sources, current } = environment({ minimumTier: 0 });
    const result = assessObservation(observation({ tier: 0 }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.ok(result.problems.some((item) => item.code === 'LOW'));
  });
  it('rejects evidence tier below the requested threshold', () => {
    const { snapshot, sources, current } = environment({ minimumTier: 3 });
    const result = assessObservation(observation({ tier: 2 }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.ok(result.problems.some((item) => item.code === 'LOW'));
  });
  it('accepts a tier-three observation when required', () => {
    const { snapshot, sources, current } = environment({ minimumTier: 3 });
    const result = assessObservation(observation({ tier: 3 }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.ok, true);
  });
  it('rejects an observation before its source date', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ observedOn: '2026-10-01' }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.ok(result.problems.some((item) => item.code === 'OLD'));
  });
  it('rejects an observation in the future', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ observedOn: '2026-11-20' }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.ok, false);
  });
  it('rejects evidence of another feature', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ feature: 'lift' }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.ok(result.problems.some((item) => item.code === 'INVALID'));
  });
  it('does not allow evidence from another licence partition', () => {
    const { snapshot, sources } = environment();
    const current = policy({ silo: 'odbl' });
    const result = assessObservation(observation(), snapshot.edges[0], sources, current, 'obs.0');
    assert.ok(result.problems.some((item) => item.code === 'SILO'));
  });
  it('treats a valid UNKNOWN observation as unsupported', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation({ access: 'UNKNOWN' }),
      snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.ok, false);
    assert.equal(result.status, 'UNKNOWN');
  });
  for (const access of ['YES', 'NO']) {
    it(`retains a supported ${access} observation without changing its meaning`, () => {
      const { snapshot, sources, current } = environment();
      const result = assessObservation(observation({ access }),
        snapshot.edges[0], sources, current, 'obs.0');
      assert.equal(result.status, access);
    });
  }
  it('preserves source licence and date in the explanation', () => {
    const { snapshot, sources, current } = environment();
    const result = assessObservation(observation(), snapshot.edges[0], sources, current, 'obs.0');
    assert.equal(result.observation.licence, 'OGL-ON-1.0');
    assert.equal(result.observation.sourceDate, '2026-11-01');
  });
  it('never mutates the source record or its evidence array', () => {
    const { snapshot, sources, current } = environment();
    const before = copy(snapshot.edges[0]);
    assessObservation(snapshot.edges[0].evidence[0], snapshot.edges[0], sources, current, 'obs.0');
    assert.deepEqual(snapshot.edges[0], before);
  });
});

describe('P15AC: accessibility record assessment', () => {
  it('accepts well-attributed segment evidence', () => {
    const result = assessEdge();
    assert.equal(result.supported, true);
    assert.equal(result.access, 'YES');
    assert.equal(result.coverage, 100);
  });
  it('keeps a record without observations at UNKNOWN', () => {
    const result = assessEdge({ access: 'UNKNOWN', tier: 1, evidence: [] });
    assert.equal(result.access, 'UNKNOWN');
    assert.equal(result.supported, false);
    assert.equal(result.coverage, 0);
  });
  it('does not turn missing evidence into YES', () => {
    const result = assessEdge({ evidence: [] });
    assert.equal(result.access, 'UNKNOWN');
    assert.ok(result.problems.some((item) => item.code === 'EMPTY'));
  });
  it('retains a reported NO barrier', () => {
    const result = assessEdge({ access: 'NO', evidence: [observation({ access: 'NO' })] });
    assert.equal(result.access, 'NO');
    assert.equal(result.supported, false);
  });
  it('does not choose YES when YES and NO evidence coexist', () => {
    const result = assessEdge({ evidence: [observation(), observation({ access: 'NO' })] });
    assert.equal(result.access, 'NO');
    assert.ok(result.problems.some((p) => p.code === 'CONFLICT'));
  });
  it('lists no unsupported source identifiers as accepted citations', () => {
    const result = assessEdge({ sourceIds: ['municipal', 'outside'], evidence: [observation()] });
    assert.equal(result.supported, true);
    assert.deepEqual(result.sourceIds, ['municipal', 'outside']);
  });
  it('blocks a record with repeated evidence observations', () => {
    const obs = observation();
    const result = assessEdge({ evidence: [obs, structuredClone(obs)] });
    assert.ok(result.problems.some((p) => p.code === 'DUPLICATE'));
  });
  it('keeps result immutable', () => {
    const result = assessEdge();
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.observations), true);
  });
  it('blocks a malformed record without throwing', () => {
    const { sources, current } = environment();
    for (const bad of [null, [], { id: 'a' }, 12]) {
      const result = assessRecord(bad, sources, current, 'records.bad');
      assert.equal(result.access, 'UNKNOWN');
      assert.equal(result.supported, false);
    }
  });
  it('does not accept an outdated source as support', () => {
    const result = assessEdge({}, { maxAgeDays: 3 });
    assert.equal(result.access, 'UNKNOWN');
  });
  it('rejects a higher review tier without corresponding evidence', () => {
    const result = assessEdge({ tier: 3 });
    assert.equal(result.access, 'UNKNOWN');
  });
  it('counts independent sources deterministically', () => {
    const result = assessEdge();
    assert.equal(result.citedSources, 1);
  });
  it('does not claim two independent sources from duplicate reports', () => {
    const result = assessEdge({ tier: 3, evidence: [observation({ tier: 3 }),
      observation({ tier: 3, observedOn: '2026-11-03' })] },
    { requireIndependentSources: true });
    assert.equal(result.access, 'UNKNOWN');
    assert.ok(result.problems.some((p) => p.code === 'LOW'));
  });
  it('counts only usable observations in the coverage score', () => {
    const result = assessEdge({ evidence: [observation(), observation({ tier: 1 })] });
    assert.equal(result.coverage, 50);
  });
  it('returns a stable ordering of observations', () => {
    const result = assessEdge({ evidence: [observation({ observedOn: '2026-11-05' }),
      observation({ observedOn: '2026-11-02' })] });
    assert.equal(result.observations[0].observedOn, '2026-11-02');
  });
  it('retains UNKNOWN for a nonmatching observation', () => {
    const result = assessEdge({ evidence: [observation({ access: 'NO' })] });
    assert.equal(result.access, 'NO');
    assert.equal(result.supported, false);
  });
  it('supplies bilingual diagnostics for missing evidence', () => {
    const result = assessEdge({ evidence: [] });
    assert.ok(result.problems.every((p) => p.en.length > 0 && p.fr.length > 0));
  });
  it('uses U+202F before French semicolon in conflict diagnostic', () => {
    assert.ok(coverageIssue('CONFLICT', 'x').fr.includes('\u202f;'));
  });
});

describe('P15AC: route segment and full-path coverage', () => {
  it('counts evidence from both end nodes and the edge', () => {
    const { snapshot, sources, current, nodes } = environment();
    const result = assessSegment(snapshot.edges[0], nodes, sources, current);
    assert.equal(result.access, 'YES');
    assert.equal(result.supported, true);
    assert.equal(result.sourceIds.length, 1);
  });
  it('provides source names and dates for each route segment', () => {
    const { snapshot, sources, current, nodes } = environment();
    const result = assessSegment(snapshot.edges[0], nodes, sources, current);
    assert.equal(result.sources[0].licence, 'OGL-ON-1.0');
    assert.equal(result.sources[0].observedOn, '2026-11-01');
  });
  it('keeps missing endpoint at UNKNOWN', () => {
    const { snapshot, sources, current, nodes } = environment();
    const result = assessSegment({ ...snapshot.edges[0], to: 'missing' }, nodes, sources, current);
    assert.equal(result.access, 'UNKNOWN');
    assert.equal(result.supported, false);
  });
  it('marks a NO endpoint as a barrier', () => {
    const { snapshot, sources, current, nodes } = environment();
    nodes.set('b', node('b', 'library', 43.751, -79.441,
      { access: 'NO', evidence: [observation({ access: 'NO' })] }));
    const result = assessSegment(snapshot.edges[0], nodes, sources, current);
    assert.equal(result.access, 'NO');
  });
  it('does not upgrade an UNKNOWN endpoint', () => {
    const { snapshot, sources, current, nodes } = environment();
    nodes.set('b', node('b', 'library', 43.751, -79.441,
      { access: 'UNKNOWN', tier: 1, evidence: [] }));
    const result = assessSegment(snapshot.edges[0], nodes, sources, current);
    assert.equal(result.access, 'UNKNOWN');
  });
  it('reports the weakest evidence tier across a segment', () => {
    const { snapshot, sources, current, nodes } = environment();
    nodes.set('b', node('b', 'library', 43.751, -79.441,
      { access: 'UNKNOWN', tier: 1, evidence: [] }));
    const result = assessSegment(snapshot.edges[0], nodes, sources, current);
    assert.equal(result.tier, 1);
  });
  it('uses the merged planner for route candidate selection', () => {
    const { snapshot, sources, current } = environment();
    const planned = planOntarioRoutes(snapshot, request());
    assert.equal(planned.status, 'found');
    const report = assessRoutePath(snapshot, planned.routes[0], sources, current);
    assert.equal(report.status, 'YES');
    assert.ok(report.segments.length > 0);
  });
  it('reports route segment order', () => {
    const { snapshot, sources, current } = environment();
    const planned = planOntarioRoutes(snapshot, request());
    const result = assessRoutePath(snapshot, planned.routes[0], sources, current);
    assert.equal(result.segments[0].from, 'a');
    assert.equal(result.segments.at(-1).to, 'd');
  });
  it('does not treat a missing route edge as a successful route', () => {
    const { snapshot, sources, current } = environment();
    const fake = { rank: 1, edgeIds: ['missing'], nodeIds: ['a', 'd'], metres: 100 };
    const result = assessRoutePath(snapshot, fake, sources, current);
    assert.equal(result.status, 'UNKNOWN');
  });
  it('flags a disconnected route', () => {
    const { snapshot, sources, current } = environment();
    const fake = { rank: 1, edgeIds: ['ab'], nodeIds: ['a', 'd'], metres: 100 };
    const result = assessRoutePath(snapshot, fake, sources, current);
    assert.equal(result.status, 'UNKNOWN');
    assert.ok(result.findings.some((p) => p.code === 'DISCONNECTED'));
  });
  it('accepts a reversible edge when travelled backwards', () => {
    const { snapshot, sources, current } = environment();
    const reverse = { rank: 1, edgeIds: ['ab'], nodeIds: ['b', 'a'], metres: 100 };
    const result = assessRoutePath(snapshot, reverse, sources, current);
    assert.equal(result.status, 'YES');
  });
  it('finds unique gap tasks instead of repeating the same edge', () => {
    const { snapshot, sources, current } = environment();
    const missing = { ...snapshot.edges[0], access: 'UNKNOWN', tier: 1, evidence: [] };
    snapshot.edges[0] = missing;
    const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const segment = assessSegment(missing, nodes, sources, current);
    const route = { rank: 1, segments: [segment, segment] };
    const tasks = collectEvidenceGaps([route], current);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].access, 'UNKNOWN');
  });
  it('keeps gap tasks anchored to source dates', () => {
    const { snapshot, sources, current } = environment();
    const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const missing = { ...snapshot.edges[0], evidence: [] };
    const segment = assessSegment(missing, nodes, sources, current);
    const tasks = collectEvidenceGaps([{ rank: 1, segments: [segment] }], current);
    assert.equal(tasks[0].sourceDates[0].observedOn, '2026-11-01');
  });
  it('blocks too many review tasks', () => {
    const current = policy({ maxFindings: 1 });
    const tasks = [
      { id: 'a', access: 'UNKNOWN', problems: [], sourceIds: [], sources: [], name: { en: 'A', fr: 'A' } },
      { id: 'b', access: 'UNKNOWN', problems: [], sourceIds: [], sources: [], name: { en: 'B', fr: 'B' } },
    ];
    assert.equal(collectEvidenceGaps([{ rank: 1, segments: tasks }], current), null);
  });
  it('fails closed for malformed snapshot collections', () => {
    for (const key of ['sources', 'places', 'nodes', 'edges', 'assets']) {
      const snap = fictionalOntario();
      snap[key] = [null];
      const result = createCoverageContext(snap, policy());
      assert.equal(result.ok, false, key);
    }
  });
  it('returns a canonical context when all data passes', () => {
    const context = createCoverageContext(fictionalOntario(), policy());
    assert.equal(context.ok, true);
    assert.equal(context.sources.size, 1);
    assert.equal(context.issues.length, 0);
  });
  it('rejects policy date mismatch at the context boundary', () => {
    const context = createCoverageContext(fictionalOntario(),
      defaultReviewPolicy('2026-11-20'));
    assert.equal(context.ok, false);
  });
  it('returns a frozen diagnostic shape', () => {
    const issue = coverageIssue('MISSING', 'sources.x');
    assert.equal(Object.isFrozen(issue), true);
    assert.equal(issue.path, 'sources.x');
  });
  it('does not mutate supplied route snapshot', () => {
    const snap = fictionalOntario();
    const original = copy(snap);
    const context = createCoverageContext(snap, policy());
    assert.equal(context.ok, true);
    assert.deepEqual(snap, original);
  });
});
