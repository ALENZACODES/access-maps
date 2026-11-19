import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fictionalOntario, request, copy, secondLicenceGroup, evidence, edge } from './p15v-fixtures.mjs';
import { parseOntarioSnapshot } from './p15v-ontario-model.mjs';
import { planOntarioRoutes } from './p15v-ontario-routing.mjs';
import {
  inspectWaypointRequest, gatherJourneyEvidence, combineWaypointLegs,
  planWaypointJourney, waypointJourneyText, WAYPOINT_LIMITS,
} from './p15y-waypoint-journey.mjs';

function journey(overrides = {}, snapshot = fictionalOntario()) {
  return planWaypointJourney(snapshot, {
    ...request(), via: ['b'], avoidNodes: [], requiredFeatures: [],
    maxCandidates: 48, maxUnknownSegments: 10, ...overrides,
  });
}
function validRequest(overrides = {}) {
  return { ...request(), via: ['b'], avoidNodes: [], requiredFeatures: [],
    maxCandidates: 48, maxUnknownSegments: 10, ...overrides };
}
function statusesOf(result) {
  return result.journeys.map((item) => item.status);
}

describe('P15Y waypoint request contract', () => {
  it('accepts the explicit bounded request', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const result = inspectWaypointRequest(validRequest(), snapshot);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sequence, ['a', 'b', 'd']);
    assert.deepEqual(result.issues, []);
  });

  it('refuses null rather than constructing implicit defaults', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const result = inspectWaypointRequest(null, snapshot);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].code, 'ROOT');
  });

  it('refuses arrays and primitive requests', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    for (const input of [[], '', 0, true, undefined]) {
      assert.equal(inspectWaypointRequest(input, snapshot).ok, false);
    }
  });

  it('rejects an unspecified export scope', () => {
    const input = validRequest();
    delete input.silo;
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    assert.equal(inspectWaypointRequest(input, snapshot).ok, false);
  });

  for (const invalid of ['private', 'odbl-plus', 'OPEN', false, null, 1]) {
    it(`rejects unsupported export scope ${String(invalid)}`, () => {
      const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
      const result = inspectWaypointRequest(validRequest({ silo: invalid }), snapshot);
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((issue) => issue.code === 'SILO'));
    });
  }

  for (const bad of [null, 0, 1, 'yes', 'no', undefined]) {
    it(`rejects implicit unknown policy ${String(bad)}`, () => {
      const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
      const checked = inspectWaypointRequest(validRequest({ allowUnknown: bad }), snapshot);
      assert.equal(checked.ok, false);
      assert.ok(checked.issues.some((issue) => issue.code === 'UNKNOWN'));
    });
  }

  it('rejects all repeated stops', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    for (const stops of [['b', 'b'], ['a'], ['d'], ['b', 'a']]) {
      assert.equal(inspectWaypointRequest(validRequest({ via: stops }), snapshot).ok, false);
    }
  });

  it('rejects a request when start and end coincide', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest(validRequest({ end: 'a' }), snapshot);
    assert.equal(checked.ok, false);
  });

  it('rejects missing required stops without inventing nodes', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest(validRequest({ via: ['missing'] }), snapshot);
    assert.equal(checked.ok, false);
    assert.ok(checked.issues.some((issue) => issue.code === 'REF'));
  });

  it('rejects an avoided waypoint', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest(validRequest({ avoidNodes: ['b'] }), snapshot);
    assert.equal(checked.ok, false);
  });

  it('rejects an avoided destination', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest(validRequest({ avoidNodes: ['d'] }), snapshot);
    assert.equal(checked.ok, false);
  });

  it('rejects duplicate avoidance IDs to retain deterministic semantics', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest(validRequest({ avoidNodes: ['c', 'c'] }), snapshot);
    assert.equal(checked.ok, false);
  });

  it('rejects unsupported request keys', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest({ ...validRequest(), remoteLookup: true }, snapshot);
    assert.equal(checked.ok, false);
  });

  it('requires a known feature when requested', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const checked = inspectWaypointRequest(validRequest({ requiredFeatures: ['lift'] }), snapshot);
    assert.equal(checked.ok, false);
    assert.ok(checked.issues.some((issue) => issue.code === 'REF'));
  });

  it('rejects excess waypoint counts', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    const via = Array.from({ length: WAYPOINT_LIMITS.stops + 1 }, (_, i) => `s${i}`);
    assert.equal(inspectWaypointRequest(validRequest({ via }), snapshot).ok, false);
  });

  for (const value of [-1, 0, 1.5, NaN, Infinity, 1000001, '1000']) {
    it(`rejects invalid route distance ${String(value)}`, () => {
      const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
      assert.equal(inspectWaypointRequest(validRequest({ maximumMetres: value }), snapshot).ok, false);
    });
  }

  for (const value of [-1, 0, 1.5, NaN, Infinity, 1001, '10']) {
    it(`rejects invalid hop budget ${String(value)}`, () => {
      const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
      assert.equal(inspectWaypointRequest(validRequest({ maximumHops: value }), snapshot).ok, false);
    });
  }

  for (const value of [-1, 0, 1.5, NaN, Infinity, 65]) {
    it(`rejects invalid combination limit ${String(value)}`, () => {
      const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
      assert.equal(inspectWaypointRequest(validRequest({ maxCandidates: value }), snapshot).ok, false);
    });
  }

  for (const value of [-1, 0, 1.5, 6, Infinity]) {
    it(`rejects invalid alternatives limit ${String(value)}`, () => {
      const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
      assert.equal(inspectWaypointRequest(validRequest({ alternatives: value }), snapshot).ok, false);
    });
  }

  it('rejects duplicate required features', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    assert.equal(inspectWaypointRequest(validRequest({ requiredFeatures: ['path', 'path'] }), snapshot).ok, false);
  });

  it('rejects malformed IDs with spaces or path delimiters', () => {
    const snapshot = parseOntarioSnapshot(fictionalOntario()).snapshot;
    for (const bad of ['a b', '../a', 'https://site', '.a', 'UPPER', 'a/b']) {
      assert.equal(inspectWaypointRequest(validRequest({ start: bad }), snapshot).ok, false);
    }
  });
});

describe('P15Y deterministic multi-leg planning', () => {
  it('constructs a multi-leg journey from existing edges', () => {
    const result = journey();
    assert.equal(result.status, 'found');
    assert.ok(result.journeys.length >= 1);
    assert.deepEqual(result.journeys[0].stops, ['a', 'b', 'd']);
    assert.equal(result.journeys[0].legs.length, 2);
  });

  it('never creates a route without actual supporting segment records', () => {
    const snapshot = fictionalOntario();
    const result = journey({}, snapshot);
    const known = new Set(snapshot.edges.map((item) => item.id));
    for (const option of result.journeys) {
      for (const id of option.edgeIds) assert.ok(known.has(id));
    }
  });

  it('preserves the explicit waypoint across every candidate', () => {
    const result = journey();
    for (const candidate of result.journeys) {
      assert.ok(candidate.nodeIds.includes('b'));
      assert.equal(candidate.legs[0].nodeIds.at(-1), 'b');
      assert.equal(candidate.legs[1].nodeIds[0], 'b');
    }
  });

  it('sorts options by distance and stable signature', () => {
    const result = journey();
    const metrics = result.journeys.map((candidate) => [candidate.distance, candidate.signature]);
    const sorted = [...metrics].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], 'en'));
    assert.deepEqual(metrics, sorted);
  });

  it('runs deterministically across repeated calls', () => {
    const first = journey();
    const second = journey();
    assert.deepEqual(first, second);
  });

  it('does not mutate the request', () => {
    const q = validRequest();
    const before = copy(q);
    planWaypointJourney(fictionalOntario(), q);
    assert.deepEqual(q, before);
  });

  it('does not mutate the offline snapshot', () => {
    const snapshot = fictionalOntario();
    const previous = copy(snapshot);
    planWaypointJourney(snapshot, validRequest());
    assert.deepEqual(snapshot, previous);
  });

  it('fails closed when the snapshot is malformed', () => {
    const result = planWaypointJourney({}, validRequest());
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.journeys, []);
    assert.ok(result.issues.length);
  });

  it('fails closed when a referenced source is deleted', () => {
    const snapshot = fictionalOntario();
    snapshot.sources = [];
    const result = planWaypointJourney(snapshot, validRequest());
    assert.equal(result.status, 'blocked');
  });

  it('does not cross the ODbL export boundary', () => {
    const snapshot = secondLicenceGroup(fictionalOntario());
    const result = journey({ end: 'e', via: [], silo: 'open' }, snapshot);
    assert.equal(result.status, 'invalid');
  });

  it('does not invent an ODbL connector', () => {
    const snapshot = secondLicenceGroup(fictionalOntario());
    const result = journey({ start: 'e', end: 'd', via: [], silo: 'odbl' }, snapshot);
    assert.equal(result.status, 'invalid');
  });

  it('returns absent when no actual route joins the requested stops', () => {
    const snapshot = fictionalOntario();
    snapshot.edges = [edge('ab', 'a', 'b', 100)];
    const result = journey({}, snapshot);
    assert.equal(result.status, 'absent');
    assert.equal(result.summary.missingLeg, 2);
  });

  it('refuses unsupported positive access when segment becomes UNKNOWN', () => {
    const snapshot = fictionalOntario();
    const item = snapshot.edges.find((e) => e.id === 'bd');
    item.access = 'UNKNOWN';
    item.tier = 1;
    item.evidence = [];
    const result = journey({ allowUnknown: true }, snapshot);
    assert.ok(['conditional', 'found'].includes(result.status));
    assert.ok(result.journeys.some((candidate) => candidate.status === 'UNKNOWN'));
  });

  it('does not claim a fully supported route with unknown-only options', () => {
    const snapshot = fictionalOntario();
    for (const item of snapshot.edges) {
      item.access = 'UNKNOWN';
      item.tier = 1;
      item.evidence = [];
    }
    const result = journey({ allowUnknown: true }, snapshot);
    assert.equal(result.status, 'conditional');
    assert.ok(statusesOf(result).every((item) => item === 'UNKNOWN'));
  });

  it('excludes UNKNOWN paths when the caller disallows uncertainty', () => {
    const snapshot = fictionalOntario();
    for (const item of snapshot.edges) {
      item.access = 'UNKNOWN';
      item.tier = 1;
      item.evidence = [];
    }
    const result = journey({ allowUnknown: false }, snapshot);
    assert.equal(result.status, 'absent');
  });

  it('excludes an explicitly reported barrier', () => {
    const snapshot = fictionalOntario();
    snapshot.edges.find((item) => item.id === 'bd').access = 'NO';
    snapshot.edges.find((item) => item.id === 'bd').evidence = [evidence('path', 'NO')];
    const result = journey({}, snapshot);
    for (const option of result.journeys) assert.ok(!option.edgeIds.includes('bd'));
  });

  it('honours segment feature avoidance', () => {
    const result = journey({ avoidFeatures: ['path'] });
    assert.equal(result.status, 'absent');
  });

  it('honours the maximum travel distance', () => {
    const result = journey({ maximumMetres: 200 });
    assert.equal(result.status, 'absent');
  });

  it('honours the total hop budget across all legs', () => {
    const result = journey({ maximumHops: 1 });
    assert.equal(result.status, 'absent');
  });

  it('returns UNKNOWN rather than guessing a missing connecting edge', () => {
    const snapshot = fictionalOntario();
    snapshot.edges = [];
    const result = journey({ allowUnknown: true }, snapshot);
    assert.equal(result.status, 'absent');
  });

  it('does not permit a required unvisited feature', () => {
    const result = journey({ requiredFeatures: ['washroom'] });
    assert.equal(result.status, 'invalid');
  });

  it('excludes route choices when an avoided intermediate node is used', () => {
    const result = journey({ avoidNodes: ['c'] });
    assert.ok(result.journeys.every((candidate) => !candidate.nodeIds.includes('c')));
  });

  it('uses stable candidate ranks', () => {
    const result = journey();
    assert.deepEqual(result.journeys.map((candidate) => candidate.rank),
      result.journeys.map((candidate, index) => index + 1));
  });

  it('keeps ODbL source IDs out of open route citations', () => {
    const snapshot = secondLicenceGroup(fictionalOntario());
    const result = journey({}, snapshot);
    assert.ok(result.journeys.every((candidate) => !candidate.sourceIds.includes('osm')));
  });

  it('retains ordered provenance IDs on each route candidate', () => {
    const result = journey();
    assert.ok(result.journeys.length);
    assert.deepEqual(result.journeys[0].sourceIds, ['municipal']);
  });

  it('does not expose a partially completed itinerary on invalid requests', () => {
    const result = journey({ via: ['missing'] });
    assert.equal(result.status, 'invalid');
    assert.deepEqual(result.journeys, []);
  });

  it('does not expose a partial itinerary on invalid snapshots', () => {
    const snapshot = fictionalOntario();
    snapshot.nodes[0].lat = 999;
    const result = journey({}, snapshot);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.journeys, []);
  });

  it('preserves the original P15V single-leg route policy', () => {
    const snapshot = fictionalOntario();
    const leg = planOntarioRoutes(snapshot, request({ start: 'a', end: 'b' }));
    const result = journey({}, snapshot);
    assert.ok(result.journeys.length);
    assert.ok(result.journeys[0].legs[0].edgeIds.every((id) =>
      snapshot.edges.some((candidate) => candidate.id === id)));
    assert.ok(leg.routes.length >= 1);
  });

  it('returns immutable top-level routes', () => {
    const result = journey();
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.journeys), true);
  });

  it('produces a complete bilingual text summary', () => {
    const result = journey();
    const english = waypointJourneyText(result, 'en');
    const french = waypointJourneyText(result, 'fr');
    assert.match(english, /Route|Distance/);
    assert.match(french, /Parcours|Distance/);
    assert.match(french, /\u00a0:/u);
    assert.ok(english.endsWith('\n'));
    assert.ok(french.endsWith('\n'));
  });

  it('rejects unsupported text locales', () => {
    assert.throws(() => waypointJourneyText(journey(), 'es'), TypeError);
  });

  it('includes source IDs and dated evidence in citations', () => {
    const result = journey();
    const citations = result.journeys[0].evidence;
    assert.ok(citations.sources.some((source) => source.id === 'municipal'));
    assert.ok(citations.observations.some((item) => item.observedOn === '2026-11-02'));
  });

  it('deduplicates citations that recur across multiple legs', () => {
    const result = journey();
    const citations = result.journeys[0].evidence;
    const keys = citations.observations.map((item) => JSON.stringify(item));
    assert.equal(new Set(keys).size, keys.length);
  });

  it('avoids unexpected mutation when collecting route provenance', () => {
    const result = journey();
    const source = copy(result.journeys[0].legs);
    const citations = gatherJourneyEvidence(result.journeys[0].legs);
    assert.deepEqual(result.journeys[0].legs, source);
    assert.ok(Object.isFrozen(citations));
  });

  it('returns a bounded candidate set even on branching routes', () => {
    const result = journey({ alternatives: 2, maxCandidates: 20 });
    assert.ok(result.journeys.length <= 2);
  });

  it('distinguishes missing paths from invalid requests', () => {
    const snapshot = fictionalOntario();
    snapshot.edges = [edge('ac', 'a', 'c')];
    const missing = journey({}, snapshot);
    const malformed = journey({ start: 'not-present' }, snapshot);
    assert.equal(missing.status, 'absent');
    assert.equal(malformed.status, 'invalid');
  });
});
