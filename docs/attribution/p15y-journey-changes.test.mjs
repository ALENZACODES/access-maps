import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { fictionalOntario, request, copy, evidence, edge } from './p15v-fixtures.mjs';
import { planWaypointJourney } from './p15y-waypoint-journey.mjs';
import {
  compareJourneyLists, compareNetworkEvidence, auditWaypointChanges,
  serializeWaypointChangeReport, waypointChangeText,
} from './p15y-journey-changes.mjs';

function q(overrides = {}) {
  return { ...request(), via: ['b'], avoidNodes: [], requiredFeatures: [],
    maxCandidates: 48, maxUnknownSegments: 10, ...overrides };
}
function compare(before = fictionalOntario(), after = fictionalOntario(), options = q()) {
  return auditWaypointChanges(before, after, options);
}
function routeList(snapshot = fictionalOntario()) {
  return planWaypointJourney(snapshot, q()).journeys;
}
function changeCodes(report) {
  return report.findings.map((item) => item.code);
}
function policy(overrides = {}) {
  return { minimumTier: 1, maximumAgeDays: 45, asOf: '2026-11-19',
    includeUnknown: true, includeBarriers: true, maximumNotes: 1000,
    minimumIndependentSources: 1, ...overrides };
}

describe('P15Y individual journey comparison', () => {
  it('reports no changes for matching journeys', () => {
    const routes = routeList();
    assert.deepEqual(compareJourneyLists(routes, routes), []);
  });

  it('reports a lost path without inventing another connection', () => {
    const routes = routeList();
    const changes = compareJourneyLists(routes, []);
    assert.equal(changes.length, routes.length);
    assert.ok(changes.every((item) => item.code === 'PATH_LOST'));
  });

  it('reports a gained path without presenting it as previously available', () => {
    const routes = routeList();
    const changes = compareJourneyLists([], routes);
    assert.equal(changes.length, routes.length);
    assert.ok(changes.every((item) => item.code === 'PATH_GAINED'));
  });

  it('detects changed distance under stable route identifiers', () => {
    const routes = routeList();
    const next = routes.map((item) => ({ ...item, distance: item.distance + 5 }));
    const changes = compareJourneyLists(routes, next);
    assert.ok(changes.some((item) => item.code === 'DISTANCE'));
  });

  it('detects UNKNOWN replacing a previous supported statement', () => {
    const routes = routeList();
    const next = routes.map((item) => ({ ...item, status: 'UNKNOWN' }));
    const changes = compareJourneyLists(routes, next);
    assert.ok(changes.some((item) => item.code === 'UNKNOWN'));
  });

  it('detects an access state change in either direction', () => {
    const routes = routeList();
    const next = routes.map((item) => ({ ...item, status: 'NO' }));
    const changes = compareJourneyLists(routes, next);
    assert.ok(changes.some((item) => item.code === 'ACCESS'));
  });

  it('detects lost source attribution', () => {
    const routes = routeList();
    const next = routes.map((item) => ({ ...item, sourceIds: [] }));
    const changes = compareJourneyLists(routes, next);
    assert.ok(changes.some((item) => item.code === 'SOURCE'));
  });

  it('detects downgraded confidence tier', () => {
    const routes = routeList();
    const next = routes.map((item) => ({ ...item, tier: 1 }));
    const changes = compareJourneyLists(routes, next);
    assert.ok(changes.some((item) => item.code === 'UNKNOWN'));
  });

  it('maintains deterministic change ordering', () => {
    const routes = routeList();
    const changed = routes.map((item) => ({ ...item,
      sourceIds: [], tier: 1, status: 'UNKNOWN', distance: item.distance + 12 }));
    assert.deepEqual(compareJourneyLists(routes, changed), compareJourneyLists(routes, changed));
  });

  it('does not modify either input collection', () => {
    const routes = routeList();
    const next = routes.map((item) => ({ ...item, distance: item.distance + 1 }));
    const oldCopy = copy(routes);
    const nextCopy = copy(next);
    compareJourneyLists(routes, next);
    assert.deepEqual(routes, oldCopy);
    assert.deepEqual(next, nextCopy);
  });
});

describe('P15Y source, node and segment evidence changes', () => {
  it('has no changes for identical snapshots', () => {
    const snapshot = fictionalOntario();
    assert.deepEqual(compareNetworkEvidence(snapshot, copy(snapshot)), []);
  });

  it('reports a removed segment', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges.pop();
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'PATH_LOST' && item.path.startsWith('edges.')));
  });

  it('reports an added segment', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges.push(edge('ad', 'a', 'd', 300));
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'PATH_GAINED' && item.path === 'edges.ad'));
  });

  it('reports an altered segment length', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].metres = 210;
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'DISTANCE' && item.path === 'edges.ab.metres'));
  });

  it('reports changed segment endpoint', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].to = 'c';
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'EDGE'));
  });

  it('reports changed traversal direction', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].direction = 'forward';
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'EDGE'));
  });

  it('reports an access promotion and does not silently trust it', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].access = 'UNKNOWN';
    assert.ok(compareNetworkEvidence(earlier, later).some((item) => item.code === 'UNKNOWN'));
  });

  it('detects source identity removal', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.sources = [];
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.path === 'sources.municipal'));
  });

  it('detects removed source support on an edge', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].sourceIds = [];
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'SOURCE'));
  });

  it('detects an export-boundary change', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].silo = 'odbl';
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'SCOPE'));
  });

  it('detects a historical source date moving backwards', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.sources[0].observedOn = '2026-10-01';
    const changes = compareNetworkEvidence(earlier, later);
    assert.ok(changes.some((item) => item.code === 'AGE'));
  });

  it('detects a removed place', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.places.pop();
    assert.ok(compareNetworkEvidence(earlier, later).some((item) => item.path.startsWith('places.')));
  });

  it('detects a missing routing node', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.nodes.pop();
    assert.ok(compareNetworkEvidence(earlier, later).some((item) => item.path.startsWith('nodes.')));
  });

  it('produces stable issue ordering', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges.reverse();
    later.edges[0].metres += 10;
    const changes = compareNetworkEvidence(earlier, later);
    const paths = changes.map((item) => item.path);
    assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('P15Y full journey-change audit', () => {
  it('returns unchanged for the same current facts', () => {
    const result = compare();
    assert.equal(result.status, 'unchanged');
    assert.deepEqual(result.findings, []);
  });

  it('refuses an invalid earlier snapshot', () => {
    const result = compare({}, fictionalOntario());
    assert.equal(result.status, 'blocked');
    assert.equal(result.before, null);
  });

  it('refuses an invalid new snapshot', () => {
    const result = compare(fictionalOntario(), {});
    assert.equal(result.status, 'blocked');
    assert.equal(result.after, null);
  });

  it('does not claim success when a source disappears', () => {
    const next = fictionalOntario();
    next.sources = [];
    assert.equal(compare(fictionalOntario(), next).status, 'blocked');
  });

  it('detects an added independently attributed segment', () => {
    const next = fictionalOntario();
    next.edges.push(edge('ad', 'a', 'd', 300));
    const result = compare(fictionalOntario(), next);
    assert.equal(result.status, 'changed');
    assert.ok(changeCodes(result).includes('PATH_GAINED'));
  });

  it('detects an updated edge distance', () => {
    const next = fictionalOntario();
    next.edges[0].metres = 150;
    const result = compare(fictionalOntario(), next);
    assert.equal(result.status, 'changed');
    assert.ok(changeCodes(result).includes('DISTANCE'));
  });

  it('rejects a snapshot date moving backward', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.asOf = '2026-11-18';
    const result = compare(earlier, later);
    assert.equal(result.status, 'blocked');
    assert.ok(result.findings.some((item) => item.code === 'AGE'));
  });

  it('permits a later snapshot date when observations remain within the policy window', () => {
    const later = fictionalOntario();
    later.asOf = '2026-11-20';
    assert.equal(compare(fictionalOntario(), later).status, 'unchanged');
  });

  it('refuses malformed journey requests', () => {
    const result = compare(fictionalOntario(), fictionalOntario(), q({ via: ['not-found'] }));
    assert.equal(result.status, 'blocked');
  });

  it('includes optional evidence assessments without mutating the snapshots', () => {
    const before = fictionalOntario();
    const after = copy(before);
    const original = copy(before);
    const result = auditWaypointChanges(before, after, q(), policy());
    assert.equal(result.status, 'unchanged');
    assert.ok(result.evidence);
    assert.equal(result.evidence.before.status, 'found');
    assert.deepEqual(before, original);
  });

  it('blocks an invalid evidence-review policy rather than assuming defaults', () => {
    const result = auditWaypointChanges(fictionalOntario(), fictionalOntario(), q(),
      policy({ minimumTier: 8 }));
    assert.equal(result.status, 'blocked');
  });

  it('produces deterministic change results', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].metres = 150;
    assert.deepEqual(compare(earlier, later), compare(earlier, later));
  });

  it('never silently rewrites a source licence', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.sources[0].licence = 'private';
    assert.equal(compare(earlier, later).status, 'blocked');
  });

  it('refuses mismatched source evidence', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].evidence = [evidence('path', 'YES', 'missing')];
    assert.equal(compare(earlier, later).status, 'blocked');
  });

  it('does not invent a replacement route for an absent connection', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges = [edge('ab', 'a', 'b')];
    const result = compare(earlier, later);
    assert.equal(result.status, 'changed');
    assert.equal(result.after.status, 'absent');
  });

  it('produces meaningful English and French change text', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.edges[0].metres += 10;
    const report = compare(earlier, later);
    assert.match(waypointChangeText(report, 'en'), /Changes/);
    assert.match(waypointChangeText(report, 'fr'), /Changements/);
    assert.match(waypointChangeText(report, 'fr'), /\u00a0:/u);
  });

  it('preserves UNKNOWN as a literal token in diagnostics', () => {
    const changed = compareNetworkEvidence(fictionalOntario(), (() => {
      const snapshot = fictionalOntario();
      snapshot.edges[0].access = 'UNKNOWN';
      return snapshot;
    })());
    assert.ok(changed.some((item) => item.code === 'UNKNOWN'));
    assert.ok(changed.every((item) => item.fr.length > 0));
  });

  it('does not fall back to a different language without consent', () => {
    assert.throws(() => waypointChangeText(compare(), 'es'), TypeError);
  });

  it('serializes the same report to the same bytes', () => {
    const report = compare();
    const first = serializeWaypointChangeReport(report);
    const second = serializeWaypointChangeReport(report);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.digest, second.digest);
  });

  it('computes SHA-256 from the exact emitted bytes', () => {
    const report = compare();
    const result = serializeWaypointChangeReport(report);
    const computed = createHash('sha256').update(result.bytes).digest('hex');
    assert.equal(result.digest, computed);
  });

  it('fails closed when asked to serialize a blocked report', () => {
    const report = compare({}, fictionalOntario());
    const result = serializeWaypointChangeReport(report);
    assert.equal(result.ok, false);
    assert.equal(result.bytes, null);
    assert.equal(result.digest, null);
  });

  it('rejects unsupported content on new offline assets', () => {
    const earlier = fictionalOntario();
    const later = copy(earlier);
    later.assets[0].path = '../escape.json';
    assert.equal(compare(earlier, later).status, 'blocked');
  });

  it('does not claim a realtime traffic or accessibility feed', () => {
    const report = compare();
    const json = new TextDecoder().decode(serializeWaypointChangeReport(report).bytes);
    assert.equal(JSON.parse(json).schemaVersion, 1);
    assert.equal(Object.hasOwn(JSON.parse(json), 'liveFeed'), false);
  });
});
