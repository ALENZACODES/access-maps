import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  observationIdentity, comparisonEntry, compareSources, compareNodes,
  compareEdges, compareAssets, compareNetworks, routeImpact, impactText,
} from './p15w-reconcile.mjs';
import { auditNetwork } from './p15w-network.mjs';
import { sampleNetwork, observation, clone, POSITIONS } from './p15w-fixtures.mjs';

const audit = data => {
  const result = auditNetwork(data);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  return result.network;
};
const changed = (before, after) => compareNetworks(before, after).changes.map(x => x.code);
const request = (options = {}) => ({ from: 'alpha', to: 'charlie', options, silo: 'open' });

describe('P15W deterministic snapshot comparison', () => {
  it('compares identical valid networks without findings', () => {
    const sample = sampleNetwork();
    assert.deepEqual(compareNetworks(sample, clone(sample)).changes, []);
  });
  it('rejects malformed old snapshots without exposing a network', () => {
    const result = compareNetworks({}, sampleNetwork());
    assert.equal(result.ok, false);
    assert.equal(result.before, null);
  });
  it('rejects malformed new snapshots', () => {
    assert.equal(compareNetworks(sampleNetwork(), {}).code, 'INVALID');
  });
  it('captures stable observation identity', () => {
    const source = observation();
    assert.equal(observationIdentity(source), observationIdentity({ ...source }));
  });
  it('distinguishes different evidence dates', () => {
    const a = observation();
    assert.notEqual(observationIdentity(a), observationIdentity({ ...a, observedOn: '2026-11-12' }));
  });
  it('creates bilingual findings for known change codes', () => {
    const item = comparisonEntry('SOURCE_REMOVED', '$.sources.city');
    assert.ok(item.en.length && item.fr.length);
  });
  it('rejects unknown comparison codes', () => {
    assert.equal(comparisonEntry('BAD_CODE', '$'), null);
  });
  it('detects a removed source', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.sources.delete('city');
    assert.ok(compareSources(a, b).some(x => x.code === 'SOURCE_REMOVED'));
  });
  it('detects a changed source name', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.sources.set('city', { ...b.sources.get('city'), name: 'City revised' });
    assert.ok(compareSources(a, b).some(x => x.code === 'SOURCE_CHANGED'));
  });
  it('detects an older source observation', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.sources.set('city', { ...b.sources.get('city'), observedOn: '2026-11-09' });
    assert.ok(compareSources(a, b).some(x => x.code === 'SOURCE_OLDER'));
  });
  it('detects changed bilingual source copy', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.sources.set('city', { ...b.sources.get('city'), fr: 'Données nouvelles' });
    assert.ok(compareSources(a, b).some(x => x.code === 'TRANSLATION_CHANGED'));
  });
  it('detects a removed graph node', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.nodes.delete('bravo');
    assert.ok(compareNodes(a, b).some(x => x.code === 'NODE_REMOVED'));
  });
  it('detects a moved node', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.nodes.set('alpha', { ...b.nodes.get('alpha'), coordinate: POSITIONS.bravo });
    assert.ok(compareNodes(a, b).some(x => x.code === 'NODE_MOVED'));
  });
  it('detects decreased evidence tiers', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.nodes.set('alpha', { ...b.nodes.get('alpha'), tier: 1 });
    assert.ok(compareNodes(a, b).some(x => x.code === 'TIER_LOWERED'));
  });
  it('detects a changed node-access label', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.nodes.set('alpha', { ...b.nodes.get('alpha'), access: 'UNKNOWN' });
    assert.ok(compareNodes(a, b).some(x => x.code === 'NODE_ACCESS'));
  });
  it('detects a removed edge', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.edges.delete('ab');
    assert.ok(compareEdges(a, b).some(x => x.code === 'EDGE_REMOVED'));
  });
  it('detects a changed edge length', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.edges.set('ab', { ...b.edges.get('ab'), lengthMetres: 111 });
    assert.ok(compareEdges(a, b).some(x => x.code === 'EDGE_CHANGED'));
  });
  it('detects a changed connection direction', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.edges.set('ab', { ...b.edges.get('ab'), bidirectional: false });
    assert.ok(compareEdges(a, b).some(x => x.code === 'EDGE_CHANGED'));
  });
  it('detects a changed edge access state', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.edges.set('ab', { ...b.edges.get('ab'), access: 'NO' });
    assert.ok(compareEdges(a, b).some(x => x.code === 'EDGE_ACCESS'));
  });
  it('detects removed dated evidence', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.edges.set('ab', { ...b.edges.get('ab'), evidence: [] });
    assert.ok(compareEdges(a, b).some(x => x.code === 'EVIDENCE_REMOVED'));
  });
  it('detects newly introduced observations', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.edges.set('ab', { ...b.edges.get('ab'), evidence: [
      ...b.edges.get('ab').evidence, { ...observation(), observedOn: '2026-11-13' },
    ] });
    assert.ok(compareEdges(a, b).some(x => x.code === 'EVIDENCE_CHANGED'));
  });
  it('detects removed asset references', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.assets.delete('map');
    assert.ok(compareAssets(a, b).some(x => x.code === 'ASSET_REMOVED'));
  });
  it('detects an asset digest revision', () => {
    const a = audit(sampleNetwork());
    const b = audit(sampleNetwork());
    b.assets.set('map', { ...b.assets.get('map'), sha256: 'b'.repeat(64) });
    assert.ok(compareAssets(a, b).some(x => x.code === 'ASSET_CHANGED'));
  });
  it('detects a newer snapshot date that moves backwards', () => {
    const previous = sampleNetwork();
    const next = sampleNetwork();
    next.asOf = '2026-11-18';
    assert.ok(changed(previous, next).includes('CLOCK'));
  });
  it('sorts changes by record path and code', () => {
    const previous = sampleNetwork();
    const next = sampleNetwork();
    next.assets = [];
    next.nodes = next.nodes.filter(x => x.id !== 'delta');
    next.edges = next.edges.filter(x => !['ad', 'bd', 'de'].includes(x.id));
    const entries = compareNetworks(previous, next).changes;
    assert.deepEqual(entries.map(x => x.path), [...entries.map(x => x.path)].sort());
  });
});

describe('P15W route change impact assessment', () => {
  it('accepts a known route with no difference', () => {
    const network = sampleNetwork();
    const result = routeImpact(network, clone(network), [request()]);
    assert.equal(result.ok, true);
    assert.equal(result.routes.length, 1);
    assert.deepEqual(result.changes, []);
  });
  it('blocks an invalid route-impact request', () => {
    assert.equal(routeImpact(sampleNetwork(), sampleNetwork(), [{}]).code, 'REQUEST');
  });
  it('blocks duplicate route-impact requests', () => {
    const result = routeImpact(sampleNetwork(), sampleNetwork(), [request(), request()]);
    assert.equal(result.code, 'DUPLICATE');
  });
  it('blocks excessive route-impact requests', () => {
    const items = Array.from({ length: 1001 }, () => request());
    assert.equal(routeImpact(sampleNetwork(), sampleNetwork(), items).code, 'INPUT');
  });
  it('finds a route lost after removing all exits', () => {
    const before = sampleNetwork();
    const after = sampleNetwork();
    after.edges = after.edges.filter(x => x.id !== 'ab' && x.id !== 'ad');
    const report = routeImpact(before, after, [request()]);
    assert.ok(report.changes.some(x => x.code === 'ROUTE_LOST'));
    assert.equal(report.routes[0].after, null);
  });
  it('finds a newly gained route', () => {
    const before = sampleNetwork();
    before.edges = before.edges.filter(x => x.id !== 'ab' && x.id !== 'ad');
    const report = routeImpact(before, sampleNetwork(), [request()]);
    assert.ok(report.changes.some(x => x.code === 'ROUTE_GAINED'));
  });
  it('reports a detour after removing a direct edge', () => {
    const before = sampleNetwork();
    const after = sampleNetwork();
    after.edges = after.edges.filter(x => x.id !== 'ab');
    const report = routeImpact(before, after, [request()]);
    assert.ok(report.changes.some(x => x.code === 'ROUTE_REPLACED'));
    assert.ok(report.changes.some(x => x.code === 'ROUTE_LONGER'));
  });
  it('reports a shorter route after reopening a direct link', () => {
    const after = sampleNetwork();
    const before = clone(after);
    before.edges = before.edges.filter(x => x.id !== 'ab');
    const report = routeImpact(before, after, [request()]);
    assert.ok(report.changes.some(x => x.code === 'ROUTE_SHORTER'));
  });
  it('preserves the source evidence for unchanged routes', () => {
    const same = sampleNetwork();
    const report = routeImpact(same, clone(same), [request()]);
    assert.equal(report.routes[0].before.sources[0].id, 'city');
    assert.equal(report.routes[0].after.sources[0].id, 'city');
  });
  it('does not allow an invalid candidate network to appear publishable', () => {
    const old = sampleNetwork();
    const next = sampleNetwork();
    next.sources[0].licence = 'private';
    const report = routeImpact(old, next, [request()]);
    assert.equal(report.ok, false);
    assert.deepEqual(report.routes, []);
  });
  it('renders English change diagnostics without dropping paths', () => {
    const before = sampleNetwork();
    const after = sampleNetwork();
    after.edges = after.edges.filter(x => x.id !== 'ab');
    const text = impactText(routeImpact(before, after, [request()]), 'en');
    assert.match(text, /Route changes/);
    assert.match(text, /ROUTE_REPLACED/);
  });
  it('renders French change diagnostics without translated source IDs', () => {
    const before = sampleNetwork();
    const after = sampleNetwork();
    after.edges = after.edges.filter(x => x.id !== 'ab');
    const text = impactText(routeImpact(before, after, [request()]), 'fr');
    assert.match(text, /Modifications du parcours/);
    assert.match(text, /\$\.edges\.ab/);
  });
  it('rejects an unsupported impact-report language', () => {
    const result = routeImpact(sampleNetwork(), sampleNetwork(), []);
    assert.equal(impactText(result, 'es'), null);
  });
});
