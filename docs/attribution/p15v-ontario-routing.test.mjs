import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAdjacency, planOntarioRoutes, routeProvenance, routeText,
  compareRouteSupport } from './p15v-ontario-routing.mjs';
import { parseOntarioSnapshot } from './p15v-ontario-model.mjs';
import { copy, edge, fictionalOntario, node, place, request } from './p15v-fixtures.mjs';

function planned(options, mutate = () => {}) {
  const snapshot = fictionalOntario();
  mutate(snapshot);
  return planOntarioRoutes(snapshot, request(options));
}
function statuses(options, mutate) { return planned(options, mutate).status; }
const short = () => planned({ alternatives: 1 });

describe('P15V deterministic route planning', () => {
  it('finds one supported route with declared evidence', () => {
    const result = short();
    assert.equal(result.status, 'found');
    assert.equal(result.routes.length, 1);
    assert.deepEqual(result.routes[0].edgeIds, ['ab', 'bd']);
    assert.equal(result.routes[0].metres, 220);
  });
  it('preserves three distinct candidate paths', () => {
    const result = planned({ alternatives: 3 });
    assert.equal(result.status, 'found');
    assert.equal(result.routes.length, 3);
    assert.deepEqual(result.routes.map((r) => r.metres), [220, 290, 330]);
  });
  it('sorts candidates by distance before unknown evidence', () => {
    const result = planned({ alternatives: 3 });
    assert.deepEqual(result.routes.map((r) => r.rank), [1, 2, 3]);
  });
  it('includes stable route node identifiers', () => {
    assert.deepEqual(short().routes[0].nodeIds, ['a', 'b', 'd']);
  });
  it('includes both affected place identifiers', () => {
    assert.deepEqual(short().routes[0].placeIds, ['library', 'market']);
  });
  it('does not invent a route from a disconnected graph', () => {
    const result = planned({}, (data) => { data.edges = []; });
    assert.equal(result.status, 'absent');
    assert.deepEqual(result.routes, []);
  });
  it('does not cross an access=NO segment', () => {
    const result = planned({ alternatives: 1 }, (data) => {
      data.edges[0].access = 'NO';
      data.edges[0].evidence[0].access = 'NO';
    });
    assert.equal(result.status, 'found');
    assert.deepEqual(result.routes[0].edgeIds, ['ac', 'cd']);
  });
  it('does not cross a node reporting NO', () => {
    const result = planned({ alternatives: 1 }, (data) => {
      data.nodes[1].access = 'NO';
      data.nodes[1].evidence[0].access = 'NO';
    });
    assert.deepEqual(result.routes[0].edgeIds, ['ac', 'cd']);
  });
  it('does not infer YES from UNKNOWN', () => {
    const result = planned({ alternatives: 1 }, (data) => {
      data.edges[0].access = 'UNKNOWN';
      data.edges[0].tier = 1;
      data.edges[0].evidence = [];
    });
    assert.equal(result.status, 'found');
    assert.deepEqual(result.routes[0].edgeIds, ['ac', 'cd']);
  });
  it('permits conditional routes only with explicit opt-in', () => {
    const result = planned({ alternatives: 1, allowUnknown: true }, (data) => {
      data.edges[0].access = 'UNKNOWN';
      data.edges[0].tier = 1;
      data.edges[0].evidence = [];
    });
    assert.equal(result.status, 'conditional');
    assert.equal(result.routes[0].unknownSegments, 1);
  });
  it('never converts an unknown segment to YES in the output', () => {
    const result = planned({ allowUnknown: true, alternatives: 1 }, (data) => {
      data.nodes[1].access = 'UNKNOWN';
      data.nodes[1].tier = 1;
      data.nodes[1].evidence = [];
    });
    assert.equal(result.routes[0].segments[0].access, 'UNKNOWN');
  });
  it('rejects a start node reporting an access barrier', () => {
    const result = planned({}, (data) => {
      data.nodes[0].access = 'NO'; data.nodes[0].evidence[0].access = 'NO';
    });
    assert.equal(result.status, 'absent');
  });
  it('rejects an end node reporting an access barrier', () => {
    const result = planned({}, (data) => {
      data.nodes[3].access = 'NO'; data.nodes[3].evidence[0].access = 'NO';
    });
    assert.equal(result.status, 'absent');
  });
  it('honours distance limits', () => {
    const result = planned({ maximumMetres: 219 });
    assert.equal(result.status, 'absent');
  });
  it('honours edge-count limits', () => {
    const result = planned({ maximumHops: 1 });
    assert.equal(result.status, 'absent');
  });
  it('supports a longer alternative within a tighter distance limit', () => {
    const result = planned({ maximumMetres: 300, alternatives: 5 });
    assert.deepEqual(result.routes.map((route) => route.metres), [220, 290]);
  });
  it('excludes avoided features without modifying graph data', () => {
    const result = planned({ avoidFeatures: ['ramp'] }, (data) => {
      data.edges[0].feature = 'ramp';
      data.edges[0].evidence[0].feature = 'ramp';
    });
    assert.deepEqual(result.routes[0].edgeIds, ['ac', 'cd']);
  });
  it('supports a one-way segment in its forward direction', () => {
    const result = planned({}, (data) => { data.edges[0].direction = 'forward'; });
    assert.equal(result.status, 'found');
  });
  it('does not use a one-way segment in reverse', () => {
    const result = planned({ start: 'b', end: 'a', alternatives: 1 }, (data) => {
      data.edges[0].direction = 'forward';
    });
    assert.notDeepEqual(result.routes[0].edgeIds, ['ab']);
  });
  it('creates a symmetric adjacency for two-way segments', () => {
    const snapshot = fictionalOntario();
    const graph = createAdjacency(snapshot, request());
    assert.ok(graph.get('a').some((row) => row.to === 'b'));
    assert.ok(graph.get('b').some((row) => row.to === 'a'));
  });
  it('creates only forward adjacency for directed segments', () => {
    const snapshot = fictionalOntario();
    snapshot.edges[0].direction = 'forward';
    const graph = createAdjacency(snapshot, request());
    assert.ok(graph.get('a').some((row) => row.to === 'b' && row.edge.id === 'ab'));
    assert.equal(graph.get('b').some((row) => row.to === 'a' && row.edge.id === 'ab'), false);
  });
  it('does not mutate route input objects', () => {
    const data = fictionalOntario();
    const args = request();
    const oldData = JSON.stringify(data);
    const oldArgs = JSON.stringify(args);
    planOntarioRoutes(data, args);
    assert.equal(JSON.stringify(data), oldData);
    assert.equal(JSON.stringify(args), oldArgs);
  });
  it('returns blocked when data is invalid', () => {
    const result = planOntarioRoutes({}, request());
    assert.equal(result.status, 'blocked');
    assert.equal(result.routes.length, 0);
    assert.ok(result.issues.length);
  });
  it('returns invalid when request is null', () => {
    assert.equal(planOntarioRoutes(fictionalOntario(), null).status, 'invalid');
  });
  it('returns invalid for identical endpoints', () => {
    assert.equal(statuses({ end: 'a' }), 'invalid');
  });
  it('returns invalid for missing end node', () => {
    assert.equal(statuses({ end: 'missing' }), 'invalid');
  });
  it('returns invalid for invalid silo', () => {
    assert.equal(statuses({ silo: 'mixed' }), 'invalid');
  });
  it('returns invalid for unbounded distances', () => {
    assert.equal(statuses({ maximumMetres: Infinity }), 'invalid');
  });
  it('returns invalid for fractional hop limits', () => {
    assert.equal(statuses({ maximumHops: 1.5 }), 'invalid');
  });
  it('returns invalid for too many requested alternatives', () => {
    assert.equal(statuses({ alternatives: 6 }), 'invalid');
  });
  it('returns invalid for an unexpected request field', () => {
    assert.equal(statuses({ autoPublish: true }), 'invalid');
  });
  it('returns invalid for duplicate avoidance flags', () => {
    assert.equal(statuses({ avoidFeatures: ['lift', 'lift'] }), 'invalid');
  });
  it('never connects across licence-separated groups', () => {
    const data = fictionalOntario();
    const report = planned({ silo: 'odbl' });
    assert.equal(report.status, 'absent');
    assert.equal(data.nodes[0].silo, 'open');
  });
});

describe('P15V bilingual route explanations and citation closure', () => {
  it('renders English route summary', () => {
    assert.match(routeText(short(), 'en'), /Route available/u);
  });
  it('renders French route summary', () => {
    assert.match(routeText(short(), 'fr'), /Parcours disponible/u);
  });
  it('renders absent result in English', () => {
    assert.match(routeText(planned({ maximumHops: 1 }), 'en'), /No supported route/u);
  });
  it('renders absent result in French', () => {
    assert.match(routeText(planned({ maximumHops: 1 }), 'fr'), /Aucun parcours/u);
  });
  it('labels conditional access without claiming success', () => {
    const result = planned({ allowUnknown: true, alternatives: 1 }, (data) => {
      data.edges[0].access = 'UNKNOWN'; data.edges[0].tier = 1; data.edges[0].evidence = [];
    });
    assert.match(routeText(result, 'en'), /UNKNOWN/u);
    assert.match(routeText(result, 'fr'), /UNKNOWN/u);
  });
  it('rejects unsupported locale', () => {
    assert.throws(() => routeText(short(), 'es'), TypeError);
  });
  it('retains source labels in route segment details', () => {
    const route = short().routes[0];
    assert.equal(route.segments[0].sources[0].id, 'municipal');
  });
  it('includes dated evidence for segments', () => {
    const route = short().routes[0];
    assert.equal(route.segments[0].evidence[0].observedOn, '2026-11-02');
  });
  it('deduplicates source identifiers in the route', () => {
    const provenance = routeProvenance(short().routes[0]);
    assert.deepEqual(provenance.sourceIds, ['municipal']);
  });
  it('associates observations with segment identifiers', () => {
    const provenance = routeProvenance(short().routes[0]);
    assert.ok(provenance.observations.every((entry) => ['ab', 'bd'].includes(entry.segmentId)));
  });
  it('returns route support for unchanged snapshot', () => {
    const before = short().routes[0];
    const after = fictionalOntario();
    assert.equal(compareRouteSupport(before, after).supported, true);
  });
  it('reports loss of a previously used segment', () => {
    const before = short().routes[0];
    const after = fictionalOntario();
    after.edges.splice(0, 1);
    const result = compareRouteSupport(before, after);
    assert.equal(result.supported, false);
    assert.ok(result.issues.some((item) => item.code === 'REF'));
  });
  it('reports a changed direction that invalidates reverse travel', () => {
    const prior = planned({ start: 'b', end: 'a', alternatives: 1 }).routes[0];
    const after = fictionalOntario();
    after.edges[0].direction = 'forward';
    const result = compareRouteSupport(prior, after);
    assert.equal(result.supported, false);
    assert.ok(result.issues.some((item) => item.code === 'DIRECTION'));
  });
  it('reports a new barrier affecting the old route', () => {
    const before = short().routes[0];
    const after = fictionalOntario();
    after.edges[0].access = 'NO';
    const result = compareRouteSupport(before, after);
    assert.equal(result.supported, false);
  });
  it('reports a reduction in the evidence tier', () => {
    const before = short().routes[0];
    const after = fictionalOntario();
    after.edges[0].tier = 1;
    const result = compareRouteSupport(before, after);
    assert.equal(result.supported, false);
  });
  it('reports removal of a relied-upon source', () => {
    const before = short().routes[0];
    const after = fictionalOntario();
    after.sources = [];
    assert.equal(compareRouteSupport(before, after).supported, false);
  });
  it('does not replace original route evidence in a support comparison', () => {
    const original = short().routes[0];
    const backup = copy(original);
    compareRouteSupport(original, fictionalOntario());
    assert.deepEqual(original, backup);
  });
  it('has complete dates in validated route facts', () => {
    const result = parseOntarioSnapshot(fictionalOntario());
    assert.equal(result.ok, true);
    for (const edgeRecord of result.snapshot.edges) {
      assert.ok(edgeRecord.evidence.every((entry) => /^2026-11-\d{2}$/u.test(entry.observedOn)));
    }
  });
  it('preserves explicit UNKNOWN in conditional results', () => {
    const result = planned({ allowUnknown: true, alternatives: 1 }, (data) => {
      data.edges[0].access = 'UNKNOWN'; data.edges[0].tier = 1; data.edges[0].evidence = [];
    });
    assert.equal(result.routes[0].segments[0].access, 'UNKNOWN');
    assert.equal(result.status, 'conditional');
  });
});
