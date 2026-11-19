import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeLinkStatus, planTimeAwareRoutes, routeDecisionReceipt,
  routeEventTimeline, routeSupportChanges, validateRoutingNetwork,
} from './p15z-routing.mjs';
import {
  copy, event, feed, link, network, node, odblFeed,
  odblNetwork, request, source, evidence,
} from './p15z-fixtures.mjs';

function reasons(result) { return result.issues?.map(item => item.code) ?? []; }
function invalidNetwork(mutate) {
  const value = network();
  mutate(value);
  return validateRoutingNetwork(value);
}
function plan(input = network(), events = feed(), requirements = request()) {
  return planTimeAwareRoutes(input, events, requirements);
}
function blocked(result, reason) {
  assert.equal(result.ok, false);
  assert.ok(reasons(result).includes(reason), JSON.stringify(reasons(result)));
  assert.equal(result.value, null);
}

describe('P15Z routing: complete, dated network intake', () => {
  it('accepts the fictional Ontario test network', () => {
    const result = validateRoutingNetwork(network());
    assert.equal(result.ok, true);
    assert.equal(result.value.nodes.length, 4);
  });
  it('preserves the number of declared connections', () => {
    assert.equal(validateRoutingNetwork(network()).value.links.length, 5);
  });
  it('does not mutate the supplied network', () => {
    const original = network();
    const before = copy(original);
    validateRoutingNetwork(original);
    assert.deepEqual(original, before);
  });
  it('rejects a missing root object', () => {
    blocked(validateRoutingNetwork(null), 'ROOT');
  });
  it('rejects an unsupported schema version', () => {
    blocked(invalidNetwork(value => { value.version = 0; }), 'ROOT');
  });
  it('rejects absent node arrays', () => {
    blocked(invalidNetwork(value => { delete value.nodes; }), 'ROOT');
  });
  it('rejects absent edge arrays', () => {
    blocked(invalidNetwork(value => { delete value.links; }), 'ROOT');
  });
  it('rejects malformed publication dates', () => {
    blocked(invalidNetwork(value => { value.asOf = '2026-02-29'; }), 'ROOT');
  });
  it('rejects a stale source when the retention window narrows', () => {
    blocked(invalidNetwork(value => { value.maxAgeDays = 3; }), 'AGE');
  });
  it('rejects duplicate node identifiers', () => {
    blocked(invalidNetwork(value => { value.nodes.push(copy(value.nodes[0])); }), 'DUPLICATE');
  });
  it('rejects duplicate link identifiers', () => {
    blocked(invalidNetwork(value => { value.links.push(copy(value.links[0])); }), 'DUPLICATE');
  });
  it('rejects an unsafe bilingual node name', () => {
    blocked(invalidNetwork(value => { value.nodes[0].name.fr = 'État: oui'; }), 'ROOT');
  });
  it('rejects node identifiers with traversal punctuation', () => {
    blocked(invalidNetwork(value => { value.nodes[0].id = '../node'; }), 'ROOT');
  });
  it('rejects ungrounded positive access on nodes', () => {
    blocked(invalidNetwork(value => { value.nodes[0].evidence = []; }), 'EVIDENCE');
  });
  it('rejects ungrounded positive access on links', () => {
    blocked(invalidNetwork(value => { value.links[0].evidence = []; }), 'EVIDENCE');
  });
  it('rejects high-tier claims with only one source', () => {
    blocked(invalidNetwork(value => {
      value.nodes[0].tier = 3;
      value.nodes[0].evidence = [evidence('YES', 'city', 3)];
    }), 'TIER');
  });
  it('rejects a link to an absent node', () => {
    blocked(invalidNetwork(value => { value.links[0].to = 'absent'; }), 'REF');
  });
  it('rejects a self-referential connection', () => {
    blocked(invalidNetwork(value => { value.links[0].to = 'a'; }), 'ROOT');
  });
  it('rejects a negative segment length', () => {
    blocked(invalidNetwork(value => { value.links[0].metres = -2; }), 'ROOT');
  });
  it('rejects zero-length segments', () => {
    blocked(invalidNetwork(value => { value.links[0].metres = 0; }), 'ROOT');
  });
  it('rejects impossible gradient percentages', () => {
    blocked(invalidNetwork(value => { value.links[0].gradient = 101; }), 'ROOT');
  });
  it('rejects nonfinite gradients', () => {
    blocked(invalidNetwork(value => { value.links[0].gradient = Infinity; }), 'ROOT');
  });
  it('rejects unsupported routing direction metadata', () => {
    blocked(invalidNetwork(value => { value.links[0].direction = 'anywhere'; }), 'ROOT');
  });
  it('rejects unsupported link kinds', () => {
    blocked(invalidNetwork(value => { value.links[0].kind = 'car'; }), 'ROOT');
  });
  it('rejects a mixed-silo endpoint', () => {
    blocked(invalidNetwork(value => { value.nodes[0].silo = 'odbl'; }), 'SILO');
  });
  it('rejects an unsupported licence', () => {
    blocked(invalidNetwork(value => { value.sources[0].licence = 'closed-licence'; }), 'SOURCE');
  });
  it('accepts an explicit UNKNOWN node with no asserted access', () => {
    const input = network();
    input.nodes[0] = node('a', 'UNKNOWN');
    assert.equal(validateRoutingNetwork(input).ok, true);
  });
  it('rejects a tier-one YES node', () => {
    blocked(invalidNetwork(value => { value.nodes[0].tier = 1; }), 'TIER');
  });
  it('accepts a separate ODbL-only routing component', () => {
    assert.equal(validateRoutingNetwork(odblNetwork()).ok, true);
  });
  it('rejects a mismatched source reference from ODbL into open', () => {
    blocked(invalidNetwork(value => { value.links[0].sourceIds = ['osm']; }), 'REF');
  });
  it('does not silently drop malformed nodes', () => {
    const result = invalidNetwork(value => { value.nodes.push({ id: 'bad' }); });
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
});

describe('P15Z routing: temporary barrier overlays', () => {
  it('finds the shortest alternate when a direct link closes', () => {
    const result = plan();
    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'found');
    assert.deepEqual(result.value.routes[0].linkIds, ['ac', 'cd']);
  });
  it('returns the original shortest route before the closure begins', () => {
    const result = plan(network(), feed(), request({ when: '2026-11-19T09:00:00Z' }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.routes[0].linkIds, ['ab', 'bd']);
  });
  it('returns the original shortest route after the closure ends', () => {
    const result = plan(network(), feed(), request({ when: '2026-11-19T13:00:00Z' }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.routes[0].linkIds, ['ab', 'bd']);
  });
  it('avoids a reported obstruction', () => {
    const report = feed([event('obstruct', 'ab', 'obstruction')]);
    assert.deepEqual(plan(network(), report).value.routes[0].linkIds, ['ac', 'cd']);
  });
  it('keeps maintenance access UNKNOWN', () => {
    const report = feed([event('maint', 'ab', 'maintenance')]);
    const result = plan(network(), report);
    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'conditional');
    assert.deepEqual(result.value.routes[0].linkIds, ['ab', 'bd']);
    assert.equal(result.value.routes[0].unknownSegments, 1);
  });
  it('excludes UNKNOWN overlays when the user disallows uncertainty', () => {
    const report = feed([event('maint', 'ab', 'maintenance')]);
    const result = plan(network(), report, request({ allowUnknown: false }));
    assert.equal(result.value.status, 'found');
    assert.deepEqual(result.value.routes[0].linkIds, ['ac', 'cd']);
  });
  it('does not infer that an absent event feed proves accessibility', () => {
    const input = network();
    input.links[0] = link('ab', 'a', 'b', 100, { access: 'UNKNOWN' });
    const result = plan(input, feed([]));
    assert.equal(result.value.status, 'conditional');
  });
  it('treats contradictory active reports as UNKNOWN', () => {
    const report = feed([event('closed', 'ab', 'closure'), event('open', 'ab', 'reopening')]);
    const result = plan(network(), report);
    assert.equal(result.value.routes[0].unknownSegments, 1);
    assert.equal(result.value.status, 'conditional');
  });
  it('does not select a reported negative access link', () => {
    const input = network();
    input.links[0] = link('ab', 'a', 'b', 100, { access: 'NO' });
    assert.deepEqual(plan(input, feed([])).value.routes[0].linkIds, ['ac', 'cd']);
  });
  it('counts routed evidence events separately', () => {
    assert.equal(plan().value.eventCount, 1);
  });
  it('lists the event IDs on affected segments', () => {
    const report = feed([event('maint', 'ab', 'maintenance')]);
    const result = plan(network(), report);
    assert.deepEqual(result.value.routes[0].segments[0].eventIds, ['maint']);
  });
  it('preserves source identifiers on route segments', () => {
    const report = feed([event('maint', 'ab', 'maintenance')]);
    const result = plan(network(), report);
    assert.deepEqual(result.value.routes[0].segments[0].sourceIds, ['city']);
  });
  it('returns a bounded number of alternatives', () => {
    assert.ok(plan(network(), feed([]), request({ alternatives: 2 })).value.routes.length <= 2);
  });
  it('orders alternatives by distance', () => {
    const routes = plan(network(), feed([])).value.routes;
    for (let index = 1; index < routes.length; index++) {
      assert.ok(routes[index].metres >= routes[index - 1].metres);
    }
  });
  it('preserves route rank across deterministically sorted paths', () => {
    assert.deepEqual(plan(network(), feed([])).value.routes.map(route => route.rank), [1, 2, 3]);
  });
  it('does not include cycles in individual routes', () => {
    const routes = plan(network(), feed([])).value.routes;
    assert.ok(routes.every(route => new Set(route.nodeIds).size === route.nodeIds.length));
  });
  it('blocks routes requiring too many hops', () => {
    const result = plan(network(), feed([]), request({ maximumHops: 1 }));
    assert.equal(result.value.status, 'absent');
  });
  it('blocks routes exceeding a maximum distance', () => {
    const result = plan(network(), feed([]), request({ maximumMetres: 50 }));
    assert.equal(result.value.status, 'absent');
  });
  it('filters paths with unsupported gradient', () => {
    const input = network();
    input.links[0].gradient = 12;
    const result = plan(input, feed([]), request({ maximumGradient: 8 }));
    assert.deepEqual(result.value.routes[0].linkIds, ['ac', 'cd']);
  });
  it('accepts a stricter zero-gradient profile for flat edges', () => {
    const input = network();
    input.links.forEach(value => { value.gradient = 0; });
    assert.equal(plan(input, feed([]), request({ maximumGradient: 0 })).value.status, 'found');
  });
  it('excludes an entire kind of link', () => {
    const result = plan(network(), feed([]), request({ avoidKinds: ['path'] }));
    assert.equal(result.value.status, 'absent');
  });
  it('honours forward-only connections', () => {
    const input = network();
    input.links.forEach(value => { value.direction = 'forward'; });
    const backwards = plan(input, feed([]), request({ start: 'd', end: 'a' }));
    assert.equal(backwards.value.status, 'absent');
  });
  it('keeps UNKNOWN endpoint access conditional', () => {
    const input = network();
    input.nodes[0] = node('a', 'UNKNOWN');
    assert.equal(plan(input, feed([])).value.status, 'conditional');
  });
  it('returns no result if all approaches have reported barriers', () => {
    const input = network();
    input.links[0] = link('ab', 'a', 'b', 100, { access: 'NO' });
    input.links[2] = link('ac', 'a', 'c', 140, { access: 'NO' });
    assert.equal(plan(input, feed([])).value.status, 'absent');
  });
  it('does not mix a neighbouring licence group', () => {
    const input = odblNetwork();
    const report = odblFeed();
    const result = plan(input, report, request({ start: 'e', end: 'f', silo: 'odbl' }));
    assert.equal(result.value.status, 'conditional');
    assert.deepEqual(result.value.routes[0].linkIds, ['ef']);
  });
});

describe('P15Z routing: request and failure boundaries', () => {
  it('rejects an absent request', () => {
    blocked(plan(network(), feed(), null), 'ROUTE');
  });
  it('rejects identical start and end', () => {
    blocked(plan(network(), feed(), request({ end: 'a' })), 'ROUTE');
  });
  it('rejects start nodes missing from the graph', () => {
    blocked(plan(network(), feed(), request({ start: 'unknown-node' })), 'ROUTE');
  });
  it('rejects end nodes missing from the graph', () => {
    blocked(plan(network(), feed(), request({ end: 'unknown-node' })), 'ROUTE');
  });
  it('rejects negative limits', () => {
    blocked(plan(network(), feed(), request({ maximumMetres: -1 })), 'ROUTE');
  });
  it('rejects a zero hop limit', () => {
    blocked(plan(network(), feed(), request({ maximumHops: 0 })), 'ROUTE');
  });
  it('rejects excess route alternatives', () => {
    blocked(plan(network(), feed(), request({ alternatives: 7 })), 'ROUTE');
  });
  it('rejects invalid requested gradients', () => {
    blocked(plan(network(), feed(), request({ maximumGradient: 150 })), 'ROUTE');
  });
  it('rejects duplicate avoided segment kinds', () => {
    blocked(plan(network(), feed(), request({ avoidKinds: ['ramp', 'ramp'] })), 'ROUTE');
  });
  it('rejects unknown extra request fields', () => {
    blocked(plan(network(), feed(), request({ ignoreBarriers: true })), 'ROUTE');
  });
  it('rejects a disallowed export group', () => {
    blocked(plan(network(), feed(), request({ silo: 'mixed' })), 'ROUTE');
  });
  it('rejects incomplete network inputs before route search', () => {
    blocked(plan({ version: 1 }, feed()), 'ROOT');
  });
  it('rejects incomplete event inputs before route search', () => {
    blocked(plan(network(), { version: 1 }), 'ROOT');
  });
  it('never returns an array of routes on failed validation', () => {
    const result = plan({ version: 0 }, feed());
    assert.equal(result.value, null);
  });
  it('requires a boolean allowUnknown setting', () => {
    blocked(plan(network(), feed(), request({ allowUnknown: 'yes' })), 'ROUTE');
  });
  it('rejects source-silo mismatches rather than silently skipping them', () => {
    const input = network();
    input.links[0].silo = 'odbl';
    blocked(plan(input, feed()), 'SILO');
  });
});

describe('P15Z routing: timeline, receipts, and comparison', () => {
  it('returns a time window for each selected route segment', () => {
    const result = plan(network(), feed([]));
    const timeline = routeEventTimeline(network(), feed(), result.value.routes[0],
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z');
    assert.equal(timeline.ok, true);
    assert.equal(timeline.value.segments.length, result.value.routes[0].segments.length);
  });
  it('does not invent an event for an unaffected segment', () => {
    const result = plan(network(), feed());
    const timeline = routeEventTimeline(network(), feed(), result.value.routes[0],
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z');
    assert.ok(timeline.value.segments.every(x => x.windows.every(w => w.access === 'UNKNOWN')));
  });
  it('rejects invalid timeline ranges', () => {
    const result = plan(network(), feed());
    blocked(routeEventTimeline(network(), feed(), result.value.routes[0],
      'bad', '2026-11-19T13:00:00Z'), 'TIME');
  });
  it('rejects a malformed route segment reference', () => {
    blocked(routeEventTimeline(network(), feed(), { segments: [{ id: 'absent' }] },
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z'), 'REF');
  });
  it('creates a deterministic English decision receipt', () => {
    const result = plan();
    assert.deepEqual(routeDecisionReceipt(result), routeDecisionReceipt(copy(result)));
  });
  it('creates a French decision receipt', () => {
    const result = plan();
    const report = routeDecisionReceipt(result, 'fr');
    assert.equal(report.ok, true);
    assert.equal(report.value.receipt.title, 'Parcours soutenu');
  });
  it('retains UNKNOWN in the French conditional summary', () => {
    const events = feed([event('maintenance', 'ab', 'maintenance')]);
    const report = routeDecisionReceipt(plan(network(), events), 'fr');
    assert.ok(report.value.receipt.title.includes('UNKNOWN'));
  });
  it('does not permit a receipt for blocked results', () => {
    blocked(routeDecisionReceipt(plan({ version: 0 }, feed())), 'ROUTE');
  });
  it('rejects unsupported receipt locales', () => {
    blocked(routeDecisionReceipt(plan(), 'zz'), 'ROUTE');
  });
  it('reports no route changes across identical snapshots', () => {
    const initial = plan();
    const next = plan(copy(network()), copy(feed()));
    const comparison = routeSupportChanges(initial, next);
    assert.equal(comparison.ok, true);
    assert.deepEqual(comparison.value.lost, []);
    assert.deepEqual(comparison.value.gained, []);
  });
  it('finds a lost route after a new closure', () => {
    const old = plan(network(), feed([]));
    const next = plan(network(), feed());
    const comparison = routeSupportChanges(old, next);
    assert.equal(comparison.ok, true);
    assert.ok(comparison.value.lost.includes('ab|bd'));
  });
  it('finds regained routes after the event period ends', () => {
    const old = plan(network(), feed());
    const next = plan(network(), feed(), request({ when: '2026-11-19T13:00:00Z' }));
    const comparison = routeSupportChanges(old, next);
    assert.equal(comparison.ok, true);
    assert.ok(comparison.value.gained.includes('ab|bd'));
  });
  it('rejects comparisons involving invalid route results', () => {
    blocked(routeSupportChanges(plan(network(), feed()), { ok: false, issues: [] }), 'ROUTE');
  });
  it('does not modify earlier route receipts when computing changes', () => {
    const first = plan();
    const snapshot = copy(first);
    routeSupportChanges(first, plan(network(), feed([])));
    assert.deepEqual(first, snapshot);
  });
  it('preserves route evidence identifiers in the receipt', () => {
    const record = routeDecisionReceipt(plan());
    assert.ok(record.value.receipt.routes[0].segments[0].sourceIds.includes('city'));
  });
  it('emits a complete SHA-256 digest for reports', () => {
    assert.match(routeDecisionReceipt(plan()).value.sha256, /^[a-f0-9]{64}$/u);
  });
  it('exposes no private network inputs in an invalid report', () => {
    const report = plan(null, feed());
    assert.equal(report.ok, false);
    assert.equal(report.value, null);
  });
});
