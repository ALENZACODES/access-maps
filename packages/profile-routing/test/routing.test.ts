import { describe, expect, it } from 'vitest';
import { approach, assess, route, type Fact, type MobilityProfile, type Segment } from '../src/index.js';
import { strings } from '../src/strings.js';

const fact = <T>(value: T | 'UNKNOWN', tier: 0 | 1 | 2 | 3 = 1): Fact<T> => ({
  value, source_id: 'synthetic-fixture', licence: 'CC0', retrieved_at: '2026-11-15', tier,
});
const profile: MobilityProfile = { maxSlopePercent: 5, minWidthMm: 800, surfacesAllowed: ['asphalt'] };
const segment = (id: string, from = 'A', to = 'B'): Segment => ({
  id, from, to, lengthM: fact(100), slopePercent: fact(2), widthMm: fact(1000),
  surface: fact('asphalt'), stepCount: fact(0),
});

describe('profile routing (synthetic fixtures)', () => {
  it('refuses 10% slope when maximum is 5%', () => {
    const s = { ...segment('s'), slopePercent: fact(10) };
    const result = route(profile, 'A', 'B', [s]);
    expect(result.found).toBe(false);
    expect(result.refused).toEqual([{ segmentId: 's', reasons: ['too-steep'] }]);
  });
  it('refuses 700 mm width when minimum is 800 mm', () => {
    const result = route(profile, 'A', 'B', [{ ...segment('s'), widthMm: fact(700) }]);
    expect(result.refused[0]?.reasons).toContain('too-narrow');
  });
  it('flags UNKNOWN slope and does not traverse it without explicit opt-in', () => {
    const s = { ...segment('s'), slopePercent: fact<number>('UNKNOWN') };
    const blocked = route(profile, 'A', 'B', [s]);
    expect(blocked.found).toBe(false);
    expect(blocked.flaggedUnknown).toEqual([{ segmentId: 's', reasons: ['unknown-slope'], used: false }]);
    const allowed = route({ ...profile, allowUnknownSegments: true }, 'A', 'B', [s]);
    expect(allowed.found).toBe(true);
    expect(allowed.flaggedUnknown[0]).toMatchObject({ used: true });
    expect(allowed.legs[0]?.assessments[0]?.fit).toBe('Unknown');
  });
  it('never infers incline from two elevations', () => {
    const s = { ...segment('s'), slopePercent: undefined,
      geometry: [{ lat: 43, lon: -79, elevationM: 100 }, { lat: 43.001, lon: -79, elevationM: 120 }] };
    expect(assess(profile, s)[0]?.fit).toBe('Unknown');
    expect(route(profile, 'A', 'B', [s]).found).toBe(false);
  });
  it('refuses steps and disallowed surfaces even with UNKNOWN opt-in', () => {
    const s = { ...segment('s'), stepCount: fact(1), surface: fact('gravel') };
    expect(route({ ...profile, allowUnknownSegments: true }, 'A', 'B', [s]).refused[0]?.reasons)
      .toEqual(expect.arrayContaining(['steps', 'surface-not-allowed']));
  });
  it('prefers the shorter valid path, estimates duration at configurable pace', () => {
    const via = [segment('a', 'A', 'B'), segment('b', 'B', 'C'),
      { ...segment('direct', 'A', 'C'), lengthM: fact(300) }];
    const result = route(profile, 'A', 'C', via, { paceMps: 0.5 });
    expect(result.legs.map(leg => leg.segmentId)).toEqual(['a', 'b']);
    expect(result.distanceM).toBe(200);
    expect(result.durationSeconds).toBe(400);
    expect(route(profile, 'C', 'A', via).found).toBe(true);
  });
  it('holds tier-0 drafts as Unknown, even with a numeric value', () => {
    const s = { ...segment('draft'), slopePercent: fact(2, 0) };
    expect(assess(profile, s)[0]?.fit).toBe('Unknown');
    expect(route(profile, 'A', 'B', [s]).found).toBe(false);
  });
  it('reports door approach per need, not as a numeric score', () => {
    const s = { ...segment('door'), widthMm: fact(700), surface: fact<string>('UNKNOWN') };
    const result = approach(profile, { id: 'place', doorNodeId: 'B' }, [s]);
    expect(result.byNeed).toEqual({ slope: 'known-yes', width: 'known-no', surface: 'Unknown', steps: 'known-yes' });
    expect(result.segments).toHaveLength(1);
    expect(approach(profile, { id: 'place', doorNodeId: 'B' }, [s], 50).segments).toEqual([]);
  });
  it('has EN and FR labels for every refusal and unknown reason', () => {
    const keys = route(profile, 'A', 'B', [{ ...segment('s'), slopePercent: fact<number>('UNKNOWN') }])
      .flaggedUnknown[0]?.reasons ?? [];
    for (const lang of ['en', 'fr'] as const) {
      expect(strings[lang].reasons['too-steep']).toBeTruthy();
      expect(strings[lang].reasons['too-narrow']).toBeTruthy();
      expect(keys.every(key => Boolean(strings[lang].reasons[key]))).toBe(true);
    }
  });
});
