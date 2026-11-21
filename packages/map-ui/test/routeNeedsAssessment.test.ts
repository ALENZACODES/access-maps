import { describe, expect, it } from 'vitest';
import { assessRequirement, evidenceForLeg, makeObservation, selectLegs,
  DEFAULT_PROFILE, withChoice, focusedObservations, compareRoutes } from '../src/routeNeeds.js';
import { barredLeg, journey, leg, plan, provenance, uncertainLeg } from './routeNeedsFixtures.js';

function assess(id: Parameters<typeof assessRequirement>[1]['id'], changes: Parameters<typeof journey>[3] = {}) {
  const route = journey('option', [leg('start')], [leg('home')], changes);
  const choice = DEFAULT_PROFILE.choices.find((entry) => entry.id === id)!;
  return assessRequirement(route, choice, DEFAULT_PROFILE);
}

describe('P15AD leg evidence is not inferred from labels alone', () => {
  it('reports a complete current step observation', () => {
    expect(evidenceForLeg(leg('path'), DEFAULT_PROFILE)).toBe('YES');
  });
  it('respects a recorded step barrier even without other evidence', () => {
    expect(evidenceForLeg(barredLeg('stairs'), DEFAULT_PROFILE)).toBe('NO');
  });
  it('keeps an unknown leg UNKNOWN', () => {
    expect(evidenceForLeg(uncertainLeg('missing'), DEFAULT_PROFILE)).toBe('UNKNOWN');
  });
  it('does not accept an empty evidence array with a positive status', () => {
    const item = leg('unproven', { stepFree: { status: 'step-free', appVerified: false, tier: 2, evidence: [], reasons: [] } });
    expect(evidenceForLeg(item, DEFAULT_PROFILE)).toBe('UNKNOWN');
  });
  it('does not accept a missing retrieval date', () => {
    expect(evidenceForLeg(leg('dated', { provenance: provenance({ retrievedAt: 'UNKNOWN' }) }), DEFAULT_PROFILE)).toBe('UNKNOWN');
  });
  it('does not accept an unsupported source licence', () => {
    expect(evidenceForLeg(leg('licensed', { provenance: provenance({ licence: 'private' }) }), DEFAULT_PROFILE)).toBe('UNKNOWN');
  });
  it('does not accept tier zero alone', () => {
    expect(evidenceForLeg(leg('tier', { provenance: provenance({ tier: 0 }) }), DEFAULT_PROFILE)).toBe('UNKNOWN');
  });
  it('does not accept a source observed after the comparison date', () => {
    expect(evidenceForLeg(leg('future', { provenance: provenance({ retrievedAt: '2026-11-20' }) }), DEFAULT_PROFILE)).toBe('UNKNOWN');
  });
  it('does not accept a source older than the configured window', () => {
    const profile = { ...DEFAULT_PROFILE, maximumSourceAgeDays: 1 };
    expect(evidenceForLeg(leg('stale', { provenance: provenance({ retrievedAt: '2026-11-17' }) }), profile)).toBe('UNKNOWN');
  });
  it('does not override a NO report with a newer source date', () => {
    expect(evidenceForLeg(barredLeg('barrier', { provenance: provenance({ retrievedAt: '2026-11-19' }) }), DEFAULT_PROFILE)).toBe('NO');
  });
});

describe('P15AD provenance carried through observed route facts', () => {
  it('includes a route identifier and an exact leg reference', () => {
    const entry = makeObservation('route-a', leg('part-a'), 'outbound', 'test', 'YES', 'Fixture statement');
    expect(entry.routeId).toBe('route-a');
    expect(entry.legId).toBe('part-a');
  });
  it('uses an explicit direction instead of guessing', () => {
    expect(makeObservation('r', leg('part'), 'return', 'test', 'UNKNOWN', '').direction).toBe('return');
  });
  it('returns UNKNOWN when the retrieval date is unparseable', () => {
    const item = leg('part', { provenance: provenance({ retrievedAt: 'invalid' }) });
    expect(makeObservation('r', item, 'outbound', 'test', 'UNKNOWN', '').retrievedOn).toBe('UNKNOWN');
  });
  it('retains the source licence on an observation', () => {
    const item = leg('part', { provenance: provenance({ licence: 'ODbL-1.0' }) });
    expect(makeObservation('r', item, 'outbound', 'test', 'YES', '').licence).toBe('ODbL-1.0');
  });
  it('retains null tier as null rather than turning it into zero', () => {
    const item = uncertainLeg('part');
    expect(makeObservation('r', item, 'outbound', 'test', 'UNKNOWN', '').tier).toBeNull();
  });
  it('preserves explicit code for diagnostic rendering', () => {
    expect(makeObservation('r', leg('part'), 'outbound', 'source-UNKNOWN', 'UNKNOWN', '').code).toBe('source-UNKNOWN');
  });
});

describe('P15AD outbound and return evidence ownership', () => {
  it('includes both directions by default', () => {
    const items = selectLegs(journey(), true);
    expect(items.map((item) => item.direction)).toEqual(['outbound', 'return']);
  });
  it('allows an explicitly outbound-only comparison', () => {
    const items = selectLegs(journey(), false);
    expect(items.map((item) => item.direction)).toEqual(['outbound']);
  });
  it('does not manufacture return legs when there are none', () => {
    expect(selectLegs(journey('r', [leg('a')], []), true).map((item) => item.direction)).toEqual(['outbound']);
  });
  it('preserves the input leg order in both directions', () => {
    const route = journey('r', [leg('a'), leg('b')], [leg('c'), leg('d')]);
    expect(selectLegs(route, true).map((item) => item.leg.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not mutate the source journey legs', () => {
    const route = journey('r', [leg('a')], [leg('b')]);
    selectLegs(route, true);
    expect(route.legs.map((item) => item.id)).toEqual(['a']);
    expect(route.returnJourney.legs.map((item) => item.id)).toEqual(['b']);
  });
});

describe('P15AD no-steps preference', () => {
  const choice = DEFAULT_PROFILE.choices.find((value) => value.id === 'no-steps')!;
  it('reports supported route when both directions are supported', () => {
    expect(assessRequirement(journey(), choice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('reports barrier for any outbound barrier', () => {
    expect(assessRequirement(journey('r', [barredLeg('steps')], [leg('return')]), choice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('reports barrier for any return barrier', () => {
    expect(assessRequirement(journey('r', [leg('out')], [barredLeg('steps')]), choice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('reports UNKNOWN when outbound information is absent', () => {
    expect(assessRequirement(journey('r', [uncertainLeg('out')], [leg('back')]), choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('reports UNKNOWN when return information is absent', () => {
    expect(assessRequirement(journey('r', [leg('out')], [uncertainLeg('back')]), choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('does not hide a reported barrier behind an UNKNOWN segment', () => {
    const route = journey('r', [uncertainLeg('first'), barredLeg('second')]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('names the affected outbound segment', () => {
    const route = journey('r', [uncertainLeg('gap')], [leg('back')]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).affectedLegIds).toContain('gap');
  });
  it('names the affected return segment', () => {
    const route = journey('r', [leg('out')], [barredLeg('return-barrier')]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).affectedLegIds).toContain('return-barrier');
  });
  it('supports outbound-only choice without suppressing the underlying return journey', () => {
    const profile = { ...DEFAULT_PROFILE, includeReturn: false };
    const route = journey('r', [leg('out')], [barredLeg('return-barrier')]);
    expect(assessRequirement(route, choice, profile).result).toBe('met');
    expect(route.returnJourney.legs).toHaveLength(1);
  });
});

describe('P15AD route distance preference', () => {
  const choice = withChoice(DEFAULT_PROFILE, 'distance', { priority: 'essential', limit: 300 }).choices[1]!;
  it('accepts known route distance within the chosen threshold', () => {
    const route = journey('r', [leg('a', { distanceMetres: 100 })], [leg('b', { distanceMetres: 200 })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('treats exact boundary as within the selected limit', () => {
    const route = journey('r', [leg('a', { distanceMetres: 150 })], [leg('b', { distanceMetres: 150 })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).reportedValue).toBe(300);
  });
  it('blocks a reported route distance over the chosen threshold', () => {
    const route = journey('r', [leg('a', { distanceMetres: 250 })], [leg('b', { distanceMetres: 250 })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('keeps a straight-line estimate UNKNOWN', () => {
    const route = journey('r', [leg('a', { distanceKind: 'straight-line' })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('keeps missing distance UNKNOWN', () => {
    const route = journey('r', [leg('a', { distanceMetres: null, distanceKind: 'unknown' })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('keeps a route with mixed known and unknown distances UNKNOWN', () => {
    const route = journey('r', [leg('a'), uncertainLeg('b')]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('does not manufacture a total where distance is unknown', () => {
    const route = journey('r', [uncertainLeg('a')]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).reportedValue).toBeNull();
  });
  it('does not treat zero route distance as missing', () => {
    const route = journey('r', [leg('a', { distanceMetres: 0 })], [leg('b', { distanceMetres: 0 })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).reportedValue).toBe(0);
  });
  it('keeps distance UNKNOWN when no limit is selected, if an endpoint is uncertain', () => {
    const route = journey('r', [uncertainLeg('a')]);
    expect(assessRequirement(route, { ...choice, limit: null }, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
});

describe('P15AD route gradient preference', () => {
  const choice = withChoice(DEFAULT_PROFILE, 'slope', { priority: 'essential', limit: 5 }).choices[2]!;
  it('accepts a known two percent gradient', () => {
    expect(assessRequirement(journey(), choice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('blocks a six percent reported gradient', () => {
    expect(assessRequirement(journey('r', [leg('hill', { gradient: '6%' })]), choice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('accepts the exact chosen gradient', () => {
    expect(assessRequirement(journey('r', [leg('hill', { gradient: '5%' })]), choice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('accepts a decimal comma in recorded gradient', () => {
    expect(assessRequirement(journey('r', [leg('hill', { gradient: '4,5%' })]), choice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('preserves UNKNOWN gradient', () => {
    expect(assessRequirement(journey('r', [leg('hill', { gradient: 'UNKNOWN' })]), choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('preserves uncertainty for a missing limit', () => {
    expect(assessRequirement(journey(), { ...choice, limit: null }, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('reports the affected steep segment', () => {
    const route = journey('r', [leg('steep', { gradient: '10%' })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).affectedLegIds).toContain('steep');
  });
  it('does not upgrade an invalid gradient string', () => {
    const route = journey('r', [leg('steep', { gradient: 'roughly steep' })]);
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
});

describe('P15AD surface and transfer information', () => {
  const surfaceChoice = DEFAULT_PROFILE.choices[3]!;
  const transferChoice = withChoice(DEFAULT_PROFILE, 'transfers', { priority: 'essential', limit: 1 }).choices[7]!;
  it('accepts a known paved surface', () => {
    expect(assessRequirement(journey(), surfaceChoice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('treats concrete as a supplied surface description', () => {
    const route = journey('r', [leg('path', { surface: 'concrete' })]);
    expect(assessRequirement(route, surfaceChoice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('treats unclassified surface as UNKNOWN', () => {
    const route = journey('r', [leg('path', { surface: 'unclassified' })]);
    expect(assessRequirement(route, surfaceChoice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('records a loose-gravel surface barrier', () => {
    const route = journey('r', [leg('path', { surface: 'loose gravel' })]);
    expect(assessRequirement(route, surfaceChoice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('records a deep-sand surface barrier', () => {
    const route = journey('r', [leg('path', { surface: 'deep sand' })]);
    expect(assessRequirement(route, surfaceChoice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('does not count a normal roll leg as a transfer', () => {
    expect(assessRequirement(journey(), transferChoice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('flags too many station-access segments', () => {
    const route = journey('r', [leg('a', { mode: 'station-access' }), leg('b', { mode: 'station-access' })], []);
    expect(assessRequirement(route, transferChoice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('counts handoff segments in the selected transfer limit', () => {
    const route = journey('r', [leg('a', { mode: 'handoff' }), leg('b', { mode: 'station-access' })], []);
    expect(assessRequirement(route, transferChoice, DEFAULT_PROFILE).result).toBe('barrier');
  });
  it('leaves transfers UNKNOWN when no transfer limit is supplied', () => {
    const route = journey('r', [leg('a', { mode: 'handoff' })], []);
    expect(assessRequirement(route, { ...transferChoice, limit: null }, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
});

describe('P15AD destination and route source checks', () => {
  it('keeps an undocumented washroom UNKNOWN', () => {
    expect(assess('washroom').result).toBe('UNKNOWN');
  });
  it('keeps a claimed washroom without provenance UNKNOWN', () => {
    const route = journey('r', [leg('washroom', { mode: 'washroom' })], [], {
      depth: { ...journey().depth, washroom: { ...journey().depth.washroom, usable: true, provenance: null } },
    });
    const choice = withChoice(DEFAULT_PROFILE, 'washroom', { priority: 'essential' }).choices[5]!;
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('accepts a current washroom observation tied to a source', () => {
    const route = journey('r', [leg('washroom', { mode: 'washroom' })], [], {
      depth: { ...journey().depth, washroom: { ...journey().depth.washroom, usable: true, provenance: provenance() } },
    });
    const choice = withChoice(DEFAULT_PROFILE, 'washroom', { priority: 'essential' }).choices[5]!;
    expect(assessRequirement(route, choice, DEFAULT_PROFILE).result).toBe('met');
  });
  it('does not accept a claimed entrance with unknown step count', () => {
    const route = journey('r', [leg('door', { mode: 'entrance' })]);
    expect(assessRequirement(route, DEFAULT_PROFILE.choices[6]!, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('accepts an entrance with current evidence and recorded zero steps', () => {
    const route = journey('r', [leg('door', { mode: 'entrance' })], [], {
      depth: { ...journey().depth, entrance: { ...journey().depth.entrance, stepCount: '0' } },
    });
    expect(assessRequirement(route, DEFAULT_PROFILE.choices[6]!, DEFAULT_PROFILE).result).toBe('met');
  });
  it('keeps a source older than the chosen window UNKNOWN', () => {
    const route = journey('r', [leg('old', { provenance: provenance({ retrievedAt: '2025-01-01' }) })]);
    expect(assessRequirement(route, DEFAULT_PROFILE.choices[8]!, DEFAULT_PROFILE).result).toBe('UNKNOWN');
  });
  it('accepts a source with an open licence and current date', () => {
    expect(assessRequirement(journey(), DEFAULT_PROFILE.choices[8]!, DEFAULT_PROFILE).result).toBe('met');
  });
  it('never turns null tier into zero', () => {
    const route = journey('r', [uncertainLeg('part')]);
    const observation = assessRequirement(route, DEFAULT_PROFILE.choices[8]!, DEFAULT_PROFILE).observations[0];
    expect(observation?.tier).toBeNull();
  });
  it('retains the route id in every observation record', () => {
    const report = assessRequirement(journey('r123'), DEFAULT_PROFILE.choices[0]!, DEFAULT_PROFILE);
    expect(report.observations.every((item) => item.routeId === 'r123')).toBe(true);
  });
  it('extracts observations for the requested requirement only', () => {
    const report = compareRoutes(plan(), DEFAULT_PROFILE);
    const route = report.routes[0]!;
    const rows = focusedObservations(route, 'no-steps');
    expect(rows.every((row) => row.code.startsWith('step-'))).toBe(true);
  });
});
