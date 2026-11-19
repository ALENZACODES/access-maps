import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deltaText, impactOnRoute, inspectOntarioDelta, licenceChanges,
  potentiallyLostAccess, routeStatistics, sourceDateChanges } from './p15v-ontario-impact.mjs';
import { planOntarioRoutes } from './p15v-ontario-routing.mjs';
import { copy, edge, evidence, fictionalOntario, request, source } from './p15v-fixtures.mjs';

function difference(change) {
  const before = fictionalOntario();
  const after = copy(before);
  change(after);
  return inspectOntarioDelta(before, after);
}
function events(change) {
  const report = difference(change);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  return report.events;
}
function eventTypes(change) { return events(change).map((item) => item.type); }

describe('P15V snapshot-delta safety and deterministic change tracking', () => {
  it('accepts an identical snapshot with no events', () => {
    const report = difference(() => {});
    assert.equal(report.ok, true);
    assert.deepEqual(report.events, []);
  });
  it('rejects malformed previous snapshot', () => {
    const report = inspectOntarioDelta(null, fictionalOntario());
    assert.equal(report.ok, false);
    assert.ok(report.issues[0].path.startsWith('before.'));
  });
  it('rejects malformed next snapshot', () => {
    const report = inspectOntarioDelta(fictionalOntario(), null);
    assert.equal(report.ok, false);
    assert.ok(report.issues[0].path.startsWith('after.'));
  });
  it('rejects both malformed snapshots', () => {
    const report = inspectOntarioDelta({}, {});
    assert.equal(report.ok, false);
    assert.equal(report.events.length, 0);
  });
  it('blocks rollback in the snapshot clock', () => {
    const report = difference((next) => { next.asOf = '2026-11-18'; });
    assert.equal(report.ok, false);
    assert.ok(report.issues.some((item) => item.code === 'TIME'));
  });
  it('allows snapshot date to advance', () => {
    const report = difference((next) => { next.asOf = '2026-11-20'; });
    assert.equal(report.ok, true);
  });
  it('detects newly added source records', () => {
    assert.ok(eventTypes((next) => { next.sources.push(source('county')); }).includes('added'));
  });
  it('detects deleted source records in a complete snapshot', () => {
    const before = fictionalOntario();
    before.sources.push(source('county'));
    const after = copy(before);
    after.sources.pop();
    const report = inspectOntarioDelta(before, after);
    assert.ok(report.events.some((item) => item.type === 'removed' && item.id === 'county'));
  });
  it('detects source reference changes', () => {
    assert.ok(eventTypes((next) => { next.sources[0].reference = 'sources/other.json'; }).includes('source'));
  });
  it('detects source observation date changes', () => {
    const report = difference((next) => {
      next.sources[0].observedOn = '2026-11-03';
      for (const collection of [next.places, next.nodes, next.edges]) {
        for (const item of collection) for (const record of item.evidence) record.observedOn = '2026-11-04';
      }
    });
    assert.equal(sourceDateChanges(report).length, 1);
  });
  it('filters licence-related events from other events', () => {
    const report = difference((next) => { next.sources[0].observedOn = '2026-11-03'; });
    assert.equal(licenceChanges(report).length, 0);
  });
  it('detects changed bilingual source labels', () => {
    assert.ok(eventTypes((next) => { next.sources[0].name.en = 'Updated fictional city source'; })
      .includes('language'));
  });
  it('detects added valid offline assets', () => {
    const report = difference((next) => { next.assets.push({ ...next.assets[0],
      id: 'appendix', path: 'offline/appendix.json' }); });
    assert.ok(report.events.some((item) => item.type === 'added' && item.collection === 'assets'));
  });
  it('detects changed offline asset hashes', () => {
    assert.ok(eventTypes((next) => { next.assets[0].sha256 = 'b'.repeat(64); }).includes('asset'));
  });
  it('detects changed offline asset size declarations', () => {
    assert.ok(eventTypes((next) => { next.assets[0].bytes = 100; }).includes('asset'));
  });
  it('detects increased edge length', () => {
    assert.ok(eventTypes((next) => { next.edges[0].metres = 200; }).includes('geometry'));
  });
  it('detects changed segment direction', () => {
    assert.ok(eventTypes((next) => { next.edges[0].direction = 'forward'; }).includes('direction'));
  });
  it('detects changed node latitude', () => {
    assert.ok(eventTypes((next) => { next.nodes[0].lat = 43.75 + 0.01; }).includes('geometry'));
  });
  it('detects changed access values supported by evidence', () => {
    assert.ok(eventTypes((next) => {
      next.edges[0].access = 'NO';
      next.edges[0].evidence[0].access = 'NO';
    }).includes('access'));
  });
  it('detects lost positive access', () => {
    const report = difference((next) => {
      next.edges[0].access = 'UNKNOWN';
      next.edges[0].tier = 1;
      next.edges[0].evidence = [];
    });
    assert.equal(potentiallyLostAccess(report).length, 1);
  });
  it('does not classify a preserved access state as a loss', () => {
    assert.deepEqual(potentiallyLostAccess(difference(() => {})), []);
  });
  it('returns no licence events on blocked snapshots', () => {
    assert.deepEqual(licenceChanges(inspectOntarioDelta({}, {})), []);
  });
  it('returns no observation date events on blocked snapshots', () => {
    assert.deepEqual(sourceDateChanges(inspectOntarioDelta({}, {})), []);
  });
  it('returns no access losses on blocked snapshots', () => {
    assert.deepEqual(potentiallyLostAccess(inspectOntarioDelta({}, {})), []);
  });
  it('preserves source and event identifiers', () => {
    const report = difference((next) => {
      next.sources[0].observedOn = '2026-11-03';
      for (const collection of [next.places, next.nodes, next.edges]) {
        for (const item of collection) for (const record of item.evidence) record.observedOn = '2026-11-04';
      }
    });
    const changedSource = report.events.find((item) => item.collection === 'sources');
    assert.equal(changedSource.id, 'municipal');
    assert.equal(changedSource.collection, 'sources');
  });
  it('prints an English delta report', () => {
    const report = difference((next) => { next.edges[0].metres = 110; });
    assert.match(deltaText(report, 'en'), /Offline change report/u);
  });
  it('prints a French delta report', () => {
    const report = difference((next) => { next.edges[0].metres = 110; });
    assert.match(deltaText(report, 'fr'), /Rapport des changements/u);
  });
  it('prints blocked delta diagnostics', () => {
    assert.match(deltaText(inspectOntarioDelta({}, {}), 'en'), /blocked/u);
  });
  it('rejects unsupported locale for delta output', () => {
    assert.throws(() => deltaText(difference(() => {}), 'es'), TypeError);
  });
  it('does not mutate either snapshot during comparisons', () => {
    const a = fictionalOntario(); const b = copy(a);
    b.edges[0].metres = 111;
    const aBefore = JSON.stringify(a); const bBefore = JSON.stringify(b);
    inspectOntarioDelta(a, b);
    assert.equal(JSON.stringify(a), aBefore);
    assert.equal(JSON.stringify(b), bBefore);
  });
  it('returns events sorted by collection and identifier', () => {
    const report = difference((next) => {
      next.edges[4].metres = 300;
      next.edges[0].metres = 150;
      next.nodes[2].lat = 43.755;
    });
    const actual = report.events.map((item) => `${item.collection}:${item.id}`);
    assert.deepEqual(actual, [...actual].sort());
  });
});

describe('P15V route impact from a newer complete snapshot', () => {
  it('reports an unchanged supported route', () => {
    const before = fictionalOntario();
    const result = impactOnRoute(before, copy(before), request());
    assert.equal(result.ok, true);
    assert.equal(result.impact.routeChanged, false);
    assert.equal(result.impact.changedStatus, false);
  });
  it('reports invalid input without a partial impact', () => {
    const result = impactOnRoute({}, fictionalOntario(), request());
    assert.equal(result.ok, false);
    assert.equal(result.impact, null);
  });
  it('reports invalid request without a partial impact', () => {
    const before = fictionalOntario();
    const result = impactOnRoute(before, before, { start: 'missing' });
    assert.equal(result.ok, false);
    assert.equal(result.impact, null);
  });
  it('reports route changes after a new barrier appears', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.edges[0].access = 'NO';
    after.edges[0].evidence[0].access = 'NO';
    const result = impactOnRoute(before, after, request());
    assert.equal(result.ok, true);
    assert.equal(result.impact.routeChanged, true);
    assert.ok(result.impact.changes.some((item) => item.type === 'access'));
  });
  it('reports a route becoming unavailable', () => {
    const before = fictionalOntario(); const after = copy(before);
    for (const edgeRecord of after.edges) {
      edgeRecord.access = 'NO';
      edgeRecord.evidence[0].access = 'NO';
    }
    const result = impactOnRoute(before, after, request());
    assert.equal(result.impact.currentStatus, 'absent');
    assert.equal(result.impact.currentRouteCount, 0);
  });
  it('reports a route becoming conditional when explicitly permitted', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.edges[0].access = 'UNKNOWN';
    after.edges[0].tier = 1;
    after.edges[0].evidence = [];
    const result = impactOnRoute(before, after, request({ alternatives: 1, allowUnknown: true }));
    assert.equal(result.ok, true);
    assert.equal(result.impact.currentStatus, 'conditional');
  });
  it('does not report unrelated asset changes as route evidence changes', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.assets[0].bytes += 1;
    const result = impactOnRoute(before, after, request());
    assert.equal(result.impact.changes.length, 0);
  });
  it('does not report unrelated source additions as route evidence changes', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.sources.push(source('county'));
    const result = impactOnRoute(before, after, request());
    assert.equal(result.impact.changes.length, 0);
  });
  it('reports source-date changes relied on by the route', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.sources[0].observedOn = '2026-11-03';
    for (const collection of [after.places, after.nodes, after.edges]) {
      for (const item of collection) item.evidence = item.evidence.map((entry) =>
        ({ ...entry, observedOn: '2026-11-04' }));
    }
    const result = impactOnRoute(before, after, request());
    assert.equal(result.ok, true);
    assert.ok(result.impact.changes.some((item) => item.type === 'date'));
  });
  it('returns route statistics for an empty result', () => {
    const plan = planOntarioRoutes(fictionalOntario(), request({ maximumHops: 1 }));
    assert.deepEqual(routeStatistics(plan), { count: 0, shortestMetres: null,
      longestMetres: null, unknownRouteCount: 0, sourceCount: 0 });
  });
  it('returns bounded route statistics for multiple alternatives', () => {
    const plan = planOntarioRoutes(fictionalOntario(), request());
    const stats = routeStatistics(plan);
    assert.equal(stats.count, 3);
    assert.equal(stats.shortestMetres, 220);
    assert.equal(stats.longestMetres, 330);
    assert.equal(stats.sourceCount, 1);
  });
  it('counts conditional routes without pretending access is known', () => {
    const snapshot = fictionalOntario();
    snapshot.edges[0].access = 'UNKNOWN';
    snapshot.edges[0].tier = 1;
    snapshot.edges[0].evidence = [];
    const plan = planOntarioRoutes(snapshot, request({ allowUnknown: true }));
    assert.ok(routeStatistics(plan).unknownRouteCount > 0);
  });
  it('preserves the requested locale in bilingual change events', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.edges[0].metres += 5;
    const report = inspectOntarioDelta(before, after);
    assert.ok(report.events.every((item) => item.en.length && item.fr.length));
  });
  it('never claims route availability when all links are removed', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.edges = [];
    const result = impactOnRoute(before, after, request());
    assert.equal(result.impact.currentRouteCount, 0);
    assert.equal(result.impact.currentStatus, 'absent');
  });
  it('records the previous route count after a graph change', () => {
    const before = fictionalOntario(); const after = copy(before);
    after.edges = after.edges.filter((item) => item.id !== 'bd');
    const result = impactOnRoute(before, after, request());
    assert.equal(result.impact.priorRouteCount, 3);
    assert.ok(result.impact.currentRouteCount <= 3);
  });
});
