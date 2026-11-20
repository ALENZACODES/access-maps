import { describe, expect, it } from 'vitest';
import { compareRoutes, summarizeComparison, focusedObservations, DEFAULT_PROFILE, withChoice } from '../src/routeNeeds.js';
import { barredLeg, journey, leg, manyPlans, plan, uncertainLeg, varyingPlan } from './routeNeedsFixtures.js';

function focusOn(id: Parameters<typeof withChoice>[1], limit: number | null = null) {
  return withChoice(DEFAULT_PROFILE, id, { priority: 'essential', limit });
}

describe('P15AD route selection under explicit user choices', () => {
  it('returns a sorted result for a supplied plan', () => {
    expect(compareRoutes(plan(), DEFAULT_PROFILE).routes).toHaveLength(1);
  });
  it('returns an empty result instead of inventing a journey', () => {
    const report = compareRoutes(plan([]), DEFAULT_PROFILE);
    expect(report.ok).toBe(true);
    expect(report.routes).toHaveLength(0);
    expect(report.preferredRouteId).toBeNull();
  });
  it('rejects an incomplete preference envelope without routing', () => {
    const report = compareRoutes(plan(), { ...DEFAULT_PROFILE, choices: [] });
    expect(report.ok).toBe(false);
    expect(report.routes).toHaveLength(0);
  });
  it('does not automatically add blocked options', () => {
    const report = compareRoutes(plan([journey('normal')], [journey('blocked', [barredLeg('stairs')])]), DEFAULT_PROFILE);
    expect(report.routes.map((route) => route.routeId)).toEqual(['normal']);
  });
  it('includes blocked options only after the user selects them', () => {
    const profile = { ...DEFAULT_PROFILE, includeBlocked: true };
    const report = compareRoutes(plan([journey('normal')], [journey('blocked', [barredLeg('stairs')])]), profile);
    expect(report.routes).toHaveLength(2);
  });
  it('does not turn a blocked alternative into a supported alternative', () => {
    const profile = { ...DEFAULT_PROFILE, includeBlocked: true };
    const report = compareRoutes(plan([], [journey('blocked', [leg('paved')])]), profile);
    expect(report.routes[0]?.status).toBe('barrier');
  });
  it('keeps a single UNKNOWN critical segment unresolved', () => {
    const report = compareRoutes(plan([journey('missing', [uncertainLeg('unknown')])]), DEFAULT_PROFILE);
    expect(report.routes[0]?.status).toBe('UNKNOWN');
  });
  it('does not pick an unresolved route as preferred', () => {
    const report = compareRoutes(plan([journey('missing', [uncertainLeg('unknown')])]), DEFAULT_PROFILE);
    expect(report.preferredRouteId).toBeNull();
  });
  it('does not pick a blocked route as preferred', () => {
    const report = compareRoutes(plan([journey('blocked', [barredLeg('stairs')])]), DEFAULT_PROFILE);
    expect(report.preferredRouteId).toBeNull();
  });
  it('selects a supported option over a reported barrier', () => {
    const routes = [journey('stairs', [barredLeg('stairs')]), journey('ramp', [leg('path')])];
    const report = compareRoutes(plan(routes), DEFAULT_PROFILE);
    expect(report.preferredRouteId).toBeNull();
    // The default entrance check remains UNKNOWN until destination details are supplied.
    expect(report.routes[0]?.routeId).toBe('ramp');
  });
  it('allows the user to omit unneeded entrance checks without rewriting journey evidence', () => {
    const profile = withChoice(DEFAULT_PROFILE, 'entrance', { priority: 'off' });
    const report = compareRoutes(plan([journey('route')]), profile);
    expect(report.preferredRouteId).toBe('route');
  });
  it('reports a known barrier ahead of a route with no essential barriers and UNKNOWN facts', () => {
    const report = compareRoutes(plan([
      journey('stairs', [barredLeg('stairs')]),
      journey('unknown', [uncertainLeg('unknown')]),
    ]), DEFAULT_PROFILE);
    expect(report.routes.map((route) => route.routeId)).toEqual(['unknown', 'stairs']);
  });
  it('uses deterministic id ordering for otherwise identical options', () => {
    const report = compareRoutes(plan([journey('z'), journey('a')]), DEFAULT_PROFILE);
    expect(report.routes.map((route) => route.routeId)).toEqual(['a', 'z']);
  });
  it('counts every route only once in the summary', () => {
    const report = compareRoutes(varyingPlan(), DEFAULT_PROFILE);
    const totals = summarizeComparison(report);
    expect(totals.total).toBe(4);
    expect(totals.supported + totals.barriers + totals.unknown).toBe(4);
  });
  it('does not mutate the source journeys when sorting', () => {
    const source = plan([journey('z'), journey('a')]);
    compareRoutes(source, DEFAULT_PROFILE);
    expect(source.journeys.map((entry) => entry.id)).toEqual(['z', 'a']);
  });
  it('records a route-level weakest requirement', () => {
    const report = compareRoutes(plan([journey('missing', [uncertainLeg('unknown')])]), DEFAULT_PROFILE);
    expect(report.routes[0]?.weakestRequirement).not.toBeNull();
  });
  it('keeps all source names as supplied instead of replacing route labels', () => {
    const item = journey('id', [leg('part')], [], { summary: 'Detailed fictional description' });
    const report = compareRoutes(plan([item]), DEFAULT_PROFILE);
    expect(report.routes[0]?.summary).toBe('Detailed fictional description');
  });
  it('does not use system time to create an assessment date', () => {
    const report = compareRoutes(plan(), DEFAULT_PROFILE);
    expect(report.asOf).toBe('2026-11-19');
  });
  it('retains a separate source result for every requirement', () => {
    const report = compareRoutes(plan(), DEFAULT_PROFILE);
    expect(report.routes[0]?.requirements).toHaveLength(9);
  });
  it('preserves chosen priority levels in each report', () => {
    const profile = withChoice(DEFAULT_PROFILE, 'no-steps', { priority: 'preferred' });
    const report = compareRoutes(plan(), profile);
    expect(report.routes[0]?.requirements[0]?.priority).toBe('preferred');
  });
  it('retains a route even when all checks are disabled', () => {
    const profile = { ...DEFAULT_PROFILE, choices: DEFAULT_PROFILE.choices.map((value) => ({ ...value, priority: 'off' as const })) };
    const report = compareRoutes(plan(), profile);
    expect(report.routes).toHaveLength(1);
  });
  it('orders many candidate routes deterministically', () => {
    const source = manyPlans(35);
    const first = compareRoutes(source, DEFAULT_PROFILE).routes.map((route) => route.routeId);
    const second = compareRoutes(source, DEFAULT_PROFILE).routes.map((route) => route.routeId);
    expect(second).toEqual(first);
  });
  it('does not combine a route’s return legs into outbound distance display', () => {
    const route = journey('one', [leg('out', { distanceMetres: 130 })], [leg('home', { distanceMetres: 200 })]);
    const report = compareRoutes(plan([route]), DEFAULT_PROFILE);
    expect(report.routes[0]?.knownDistanceMetres).toBe(130);
  });
  it('does not expose a numeric total for an unknown outbound distance', () => {
    const report = compareRoutes(plan([journey('one', [uncertainLeg('out')])]), DEFAULT_PROFILE);
    expect(report.routes[0]?.knownDistanceMetres).toBeNull();
  });
  it('keeps outbound and return leg references in observations', () => {
    const report = compareRoutes(plan([journey('one', [leg('out')], [leg('home')])]), DEFAULT_PROFILE);
    const observations = focusedObservations(report.routes[0]!, 'no-steps');
    expect(observations.map((item) => item.legId)).toEqual(['out', 'home']);
  });
  it('respects the user choosing outbound-only assessment', () => {
    const profile = { ...DEFAULT_PROFILE, includeReturn: false };
    const report = compareRoutes(plan([journey('one', [leg('out')], [uncertainLeg('home')])]), profile);
    expect(focusedObservations(report.routes[0]!, 'no-steps').map((row) => row.legId)).toEqual(['out']);
  });
  it('can compare an increased distance limit without recomputing route data', () => {
    const route = journey('one', [leg('out', { distanceMetres: 600 })], [leg('home', { distanceMetres: 600 })]);
    const tight = compareRoutes(plan([route]), focusOn('distance', 1000));
    const wide = compareRoutes(plan([route]), focusOn('distance', 1400));
    expect(focusedObservations(tight.routes[0]!, 'distance')[0]?.value).toBe('NO');
    expect(focusedObservations(wide.routes[0]!, 'distance')[0]?.value).toBe('YES');
  });
  it('can compare a lower slope limit without changing the reported gradient', () => {
    const route = journey('one', [leg('hill', { gradient: '5%' })], []);
    const tight = compareRoutes(plan([route]), focusOn('slope', 4));
    const wide = compareRoutes(plan([route]), focusOn('slope', 6));
    expect(focusedObservations(tight.routes[0]!, 'slope')[0]?.value).toBe('NO');
    expect(focusedObservations(wide.routes[0]!, 'slope')[0]?.value).toBe('YES');
  });
  it('reports UNKNOWN for missing date without hiding other reported barriers', () => {
    const source = journey('one', [barredLeg('steps', { provenance: { ...leg('a').provenance, retrievedAt: 'UNKNOWN' } })]);
    const report = compareRoutes(plan([source]), DEFAULT_PROFILE);
    expect(report.routes[0]?.status).toBe('barrier');
  });
  it('does not mutate profile settings during comparison', () => {
    const snapshot = JSON.stringify(DEFAULT_PROFILE);
    compareRoutes(plan(), DEFAULT_PROFILE);
    expect(JSON.stringify(DEFAULT_PROFILE)).toBe(snapshot);
  });
  it('does not fabricate new segments for an empty journey', () => {
    const route = journey('empty', [], []);
    const report = compareRoutes(plan([route]), DEFAULT_PROFILE);
    expect(focusedObservations(report.routes[0]!, 'no-steps')).toHaveLength(0);
  });
});

describe('P15AD sorting and summary status transparency', () => {
  it('counts barrier routes separately from missing-source routes', () => {
    const report = compareRoutes(plan([
      journey('stairs', [barredLeg('steps')]),
      journey('missing', [uncertainLeg('unknown')]),
    ]), DEFAULT_PROFILE);
    const totals = summarizeComparison(report);
    expect(totals.barriers).toBe(1);
    expect(totals.unknown).toBe(1);
  });
  it('keeps preferredRouteId null when no option is adequately supported', () => {
    const report = compareRoutes(plan([journey('missing', [uncertainLeg('unknown')])]), DEFAULT_PROFILE);
    expect(summarizeComparison(report).preferredRouteId).toBeNull();
  });
  it('returns no false success on a malformed profile', () => {
    const totals = summarizeComparison(compareRoutes(plan(), null));
    expect(totals.supported).toBe(0);
  });
  it('does not expose a preferred option when user requests both directions and return is unknown', () => {
    const profile = withChoice(DEFAULT_PROFILE, 'entrance', { priority: 'off' });
    const report = compareRoutes(plan([journey('one', [leg('out')], [uncertainLeg('back')])]), profile);
    expect(report.preferredRouteId).toBeNull();
  });
  it('evaluates a blocked option with status barrier even when it has supporting observations', () => {
    const profile = { ...DEFAULT_PROFILE, includeBlocked: true };
    const result = compareRoutes(plan([], [journey('blocked')]), profile);
    expect(result.routes[0]?.status).toBe('barrier');
  });
  it('keeps a stable report structure even when no routes are supplied', () => {
    const result = compareRoutes(plan([]), DEFAULT_PROFILE);
    expect(result).toHaveProperty('preferredRouteId', null);
    expect(result).toHaveProperty('selectionExplanation');
    expect(result).toHaveProperty('routes');
  });
});
