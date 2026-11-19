import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PROFILE, profile, adjacency, edgeDecision, findRoute, findAlternatives,
  routeEvidence, nearbyNodes, routeGeometry, routeFromInput,
} from './p15w-planner.mjs';
import { auditNetwork } from './p15w-network.mjs';
import { sampleNetwork, clone, sampleNode, sampleEdge, observation, POSITIONS } from './p15w-fixtures.mjs';

const prepared = () => auditNetwork(sampleNetwork()).network;
const take = (snapshot = sampleNetwork(), options = {}, origin = 'alpha', destination = 'charlie') => {
  const audited = auditNetwork(snapshot);
  assert.equal(audited.ok, true, JSON.stringify(audited.findings));
  return findRoute(audited.network, origin, destination, options);
};

describe('P15W route mobility profiles', () => {
  it('defaults to conservative wheelchair navigation', () => {
    assert.equal(DEFAULT_PROFILE.mobility, 'wheelchair');
    assert.equal(DEFAULT_PROFILE.allowUnknown, false);
  });
  it('accepts an empty profile', () => assert.ok(profile({})));
  it('accepts a valid walking profile', () => assert.equal(profile({ mobility: 'walking' }).mobility, 'walking'));
  it('accepts a valid mobility aid profile', () => assert.equal(profile({ mobility: 'walker' }).mobility, 'walker'));
  it('rejects a fictional mobility category', () => assert.equal(profile({ mobility: 'flight' }), null));
  it('rejects unknown settings rather than ignoring them', () => assert.equal(profile({ autoUpload: true }), null));
  it('rejects an unsupported maximum slope', () => assert.equal(profile({ maximumGradePercent: 99 }), null));
  it('accepts a strict zero slope', () => assert.equal(profile({ maximumGradePercent: 0 }).maximumGradePercent, 0));
  it('rejects zero maximum route length', () => assert.equal(profile({ maximumDistanceMetres: 0 }), null));
  it('rejects fractional maximum legs', () => assert.equal(profile({ maximumLegs: 3.5 }), null));
  it('rejects negative unknown penalties', () => assert.equal(profile({ unknownPenaltyMetres: -1 }), null));
  it('rejects negative transfer penalties', () => assert.equal(profile({ transferPenaltyMetres: -1 }), null));
  it('rejects invalid excluded edge identifiers', () => assert.equal(profile({ avoidEdgeIds: ['/unsafe'] }), null));
  it('rejects duplicated exclusions', () => assert.equal(profile({ avoidEdgeIds: ['ab', 'ab'] }), null));
  it('rejects missing exclusions array', () => assert.equal(profile({ avoidNodeIds: null }), null));
  it('accepts edge and node exclusions', () => {
    assert.deepEqual(profile({ avoidEdgeIds: ['ab'], avoidNodeIds: ['delta'] }).avoidEdgeIds, ['ab']);
  });
  it('does not mutate the caller exclusion arrays', () => {
    const ids = ['ab'];
    const value = profile({ avoidEdgeIds: ids });
    ids.push('bc');
    assert.deepEqual(value.avoidEdgeIds, ['ab']);
  });
});

describe('P15W adjacency construction', () => {
  it('creates a node entry for every in-silo node', () => {
    assert.equal(adjacency(prepared(), 'open').size, 5);
  });
  it('creates both directions for bidirectional links', () => {
    const graph = adjacency(prepared(), 'open');
    assert.ok(graph.get('alpha').some(x => x.to === 'bravo'));
    assert.ok(graph.get('bravo').some(x => x.to === 'alpha'));
  });
  it('does not create a reverse link for one-way edges', () => {
    const snapshot = sampleNetwork();
    snapshot.edges[0].bidirectional = false;
    const graph = adjacency(auditNetwork(snapshot).network, 'open');
    assert.ok(graph.get('alpha').some(x => x.edgeId === 'ab'));
    assert.ok(!graph.get('bravo').some(x => x.edgeId === 'ab'));
  });
  it('returns null for unsupported licence silo', () => assert.equal(adjacency(prepared(), 'other'), null));
  it('returns null for a malformed graph', () => assert.equal(adjacency(null, 'open'), null));
  it('keeps connections deterministic by edge identifiers', () => {
    const edges = adjacency(prepared(), 'open').get('bravo').map(x => x.edgeId);
    assert.deepEqual(edges, [...edges].sort());
  });
  it('does not permit YES access through NO edge', () => {
    const net = prepared();
    const edge = { ...net.edges.get('ab'), access: 'NO' };
    assert.equal(edgeDecision(edge, net.nodes.get('alpha'), net.nodes.get('bravo'), profile()).code, 'BARRIER');
  });
  it('disallows UNKNOWN by default', () => {
    const net = prepared();
    const edge = { ...net.edges.get('ab'), access: 'UNKNOWN' };
    assert.equal(edgeDecision(edge, net.nodes.get('alpha'), net.nodes.get('bravo'), profile()).code, 'UNKNOWN');
  });
  it('allows UNKNOWN conditionally with a weighted penalty', () => {
    const net = prepared();
    const edge = { ...net.edges.get('ab'), access: 'UNKNOWN' };
    const outcome = edgeDecision(edge, net.nodes.get('alpha'), net.nodes.get('bravo'),
      profile({ allowUnknown: true }));
    assert.equal(outcome.allowed, true);
    assert.equal(outcome.penaltyMetres, 1000);
  });
  it('blocks a gradient beyond the wheelchair threshold', () => {
    const net = prepared();
    const edge = { ...net.edges.get('ab'), gradientPercent: 12 };
    assert.equal(edgeDecision(edge, net.nodes.get('alpha'), net.nodes.get('bravo'), profile()).code, 'GRADE');
  });
  it('lets walking profiles handle steeper links', () => {
    const net = prepared();
    const edge = { ...net.edges.get('ab'), gradientPercent: 12 };
    assert.equal(edgeDecision(edge, net.nodes.get('alpha'), net.nodes.get('bravo'),
      profile({ mobility: 'walking' })).allowed, true);
  });
  it('honours explicit exclusions', () => {
    const net = prepared();
    const edge = net.edges.get('ab');
    assert.equal(edgeDecision(edge, net.nodes.get('alpha'), net.nodes.get('bravo'),
      profile({ avoidEdgeIds: ['ab'] })).code, 'AVOIDED');
  });
});

describe('P15W local Ontario route planning', () => {
  it('finds a two-leg route on a connected graph', () => {
    const response = take();
    assert.equal(response.ok, true);
    assert.equal(response.route.legCount, 2);
  });
  it('retains the exact origin and destination', () => {
    const result = take();
    assert.equal(result.route.origin, 'alpha');
    assert.equal(result.route.destination, 'charlie');
  });
  it('selects the shorter direct via-bravo path', () => {
    assert.deepEqual(take().route.legs.map(x => x.id), ['ab', 'bc']);
  });
  it('does not introduce an unknown status for known evidence', () => {
    const result = take();
    assert.equal(result.route.status, 'YES');
    assert.deepEqual(result.route.unknownIds, []);
  });
  it('keeps source identifiers associated with the route', () => {
    assert.deepEqual(take().route.sourceIds, ['city']);
  });
  it('reports the actual distance in metres', () => {
    const result = take();
    assert.ok(result.route.distanceMetres > 180);
    assert.ok(result.route.distanceMetres < 220);
  });
  it('rejects malformed profile settings before route search', () => {
    assert.equal(findRoute(prepared(), 'alpha', 'bravo', { allowUnknown: 1 }).code, 'PROFILE');
  });
  it('rejects a missing origin', () => {
    assert.equal(findRoute(prepared(), 'missing', 'bravo').code, 'ENDPOINT');
  });
  it('rejects a missing destination', () => {
    assert.equal(findRoute(prepared(), 'alpha', 'missing').code, 'ENDPOINT');
  });
  it('blocks a declared inaccessible origin', () => {
    const snapshot = sampleNetwork();
    const node = snapshot.nodes.find(x => x.id === 'alpha');
    node.access = 'NO';
    node.evidence = [observation('NO', 'entrance')];
    assert.equal(take(snapshot).code, 'BARRIER');
  });
  it('blocks a declared inaccessible destination', () => {
    const snapshot = sampleNetwork();
    const node = snapshot.nodes.find(x => x.id === 'charlie');
    node.access = 'NO';
    node.evidence = [observation('NO', 'entrance')];
    assert.equal(take(snapshot).code, 'BARRIER');
  });
  it('finds a detour around an excluded edge', () => {
    const response = take(sampleNetwork(), { avoidEdgeIds: ['ab'] });
    assert.equal(response.ok, true);
    assert.ok(!response.route.legs.some(x => x.id === 'ab'));
  });
  it('finds a detour around an excluded node', () => {
    const response = take(sampleNetwork(), { avoidNodeIds: ['bravo'] });
    assert.equal(response.ok, true);
    assert.ok(!response.route.nodeIds.includes('bravo'));
  });
  it('blocks when all outward connections are excluded', () => {
    const result = take(sampleNetwork(), { avoidEdgeIds: ['ab', 'ad'] });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NO_ROUTE');
  });
  it('blocks route when maximum distance is too small', () => {
    const result = take(sampleNetwork(), { maximumDistanceMetres: 50 });
    assert.equal(result.code, 'NO_ROUTE');
  });
  it('blocks routes exceeding the leg count', () => {
    const result = take(sampleNetwork(), { maximumLegs: 1 });
    assert.equal(result.code, 'NO_ROUTE');
  });
  it('permits a one-leg route when limited to one leg', () => {
    const result = take(sampleNetwork(), { maximumLegs: 1 }, 'alpha', 'bravo');
    assert.equal(result.ok, true);
    assert.equal(result.route.legCount, 1);
  });
  it('rejects unknown road surface by default', () => {
    const snapshot = sampleNetwork();
    const edge = snapshot.edges.find(x => x.id === 'ab');
    edge.access = 'UNKNOWN'; edge.tier = 1; edge.evidence = [];
    const result = take(snapshot);
    assert.equal(result.ok, true);
    assert.ok(!result.route.legs.some(x => x.id === 'ab'));
  });
  it('labels unknown when use of unknown edge is explicitly permitted', () => {
    const snapshot = sampleNetwork();
    const edge = snapshot.edges.find(x => x.id === 'ab');
    edge.access = 'UNKNOWN'; edge.tier = 1; edge.evidence = [];
    const result = take(snapshot, { allowUnknown: true, unknownPenaltyMetres: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.route.status, 'UNKNOWN');
    assert.ok(result.route.unknownIds.includes('edge:ab'));
  });
  it('honours wheelchair gradient limit when an alternative exists', () => {
    const snapshot = sampleNetwork();
    snapshot.edges.find(x => x.id === 'ab').gradientPercent = 20;
    assert.ok(!take(snapshot).route.legs.some(x => x.id === 'ab'));
  });
  it('uses a source-attributed change of direction', () => {
    const result = take(sampleNetwork(), {}, 'charlie', 'alpha');
    assert.equal(result.ok, true);
    assert.deepEqual(result.route.nodeIds, ['charlie', 'bravo', 'alpha']);
  });
  it('never exports an unrelated licence silo', () => {
    assert.equal(findRoute(prepared(), 'alpha', 'charlie', {}, 'odbl').code, 'ENDPOINT');
  });
  it('has deterministic path selection across repeated calls', () => {
    const network = prepared();
    const first = findRoute(network, 'alpha', 'charlie');
    const next = findRoute(network, 'alpha', 'charlie');
    assert.deepEqual(first, next);
  });
  it('returns a bounded number of alternative paths', () => {
    const response = findAlternatives(prepared(), 'alpha', 'charlie', {}, 'open', 3);
    assert.equal(response.ok, true);
    assert.ok(response.routes.length >= 1);
    assert.ok(response.routes.length <= 3);
  });
  it('rejects an invalid alternative count', () => {
    assert.equal(findAlternatives(prepared(), 'alpha', 'charlie', {}, 'open', 0).code, 'COUNT');
  });
  it('provides a source and licence evidence summary for a route', () => {
    const network = prepared();
    const route = findRoute(network, 'alpha', 'charlie').route;
    const evidence = routeEvidence(network, route);
    assert.equal(evidence.sources[0].licence, 'OGL-ON-1.0');
    assert.equal(evidence.status, 'YES');
  });
  it('does not accept malformed route evidence input', () => {
    assert.equal(routeEvidence(prepared(), {}), null);
  });
  it('finds nearby Ontario nodes without inventing positions', () => {
    const points = nearbyNodes(prepared(), POSITIONS.alpha, 200);
    assert.ok(points.some(item => item.id === 'alpha'));
    assert.ok(points.every(item => item.distanceMetres <= 200));
  });
  it('does not include distant nodes in a tiny radius', () => {
    const points = nearbyNodes(prepared(), POSITIONS.alpha, 1);
    assert.deepEqual(points.map(x => x.id), ['alpha']);
  });
  it('rejects negative search radius', () => assert.equal(nearbyNodes(prepared(), POSITIONS.alpha, -5), null));
  it('reconstructs the actual route geometry', () => {
    const network = prepared();
    const route = findRoute(network, 'alpha', 'charlie').route;
    const line = routeGeometry(network, route);
    assert.deepEqual(line[0], POSITIONS.alpha);
    assert.deepEqual(line.at(-1), POSITIONS.charlie);
  });
  it('does not allow malformed snapshots into the route planner', () => {
    const source = sampleNetwork();
    source.edges[0].lengthMetres = -5;
    assert.equal(routeFromInput(source, 'alpha', 'charlie').code, 'AUDIT');
  });
  it('supports direct audited route planning from a snapshot', () => {
    assert.equal(routeFromInput(sampleNetwork(), 'alpha', 'charlie').ok, true);
  });
});
