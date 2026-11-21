import { describe, expect, it } from 'vitest';
import { calendarDay, dateFromProvenance, provenanceQuality, parseNumericFact, normalizeProfile,
  DEFAULT_PROFILE, REQUIREMENTS, combineEvidence, withChoice } from '../src/routeNeeds.js';
import { provenance } from './routeNeedsFixtures.js';

describe('P15AD ISO calendar and observation windows', () => {
  it('accepts a normal date without using a local timezone', () => {
    expect(calendarDay('2026-11-19')).not.toBeNull();
  });
  it('accepts a leap day only in a leap year', () => {
    expect(calendarDay('2024-02-29')).not.toBeNull();
    expect(calendarDay('2023-02-29')).toBeNull();
  });
  it('accepts 2000 as a century leap year', () => {
    expect(calendarDay('2000-02-29')).not.toBeNull();
  });
  it('rejects 1900 as a leap year', () => {
    expect(calendarDay('1900-02-29')).toBeNull();
  });
  it('rejects missing leading zero on the month', () => {
    expect(calendarDay('2026-1-19')).toBeNull();
  });
  it('rejects missing leading zero on the day', () => {
    expect(calendarDay('2026-11-9')).toBeNull();
  });
  it('rejects month thirteen', () => {
    expect(calendarDay('2026-13-01')).toBeNull();
  });
  it('rejects day zero', () => {
    expect(calendarDay('2026-11-00')).toBeNull();
  });
  it('rejects a nonexistent November day', () => {
    expect(calendarDay('2026-11-31')).toBeNull();
  });
  it('rejects a timezone suffix on a calendar date', () => {
    expect(calendarDay('2026-11-19Z')).toBeNull();
  });
  it('rejects whitespace inside a date', () => {
    expect(calendarDay(' 2026-11-19')).toBeNull();
    expect(calendarDay('2026-11-19 ')).toBeNull();
  });
  it('keeps day differences stable at month boundaries', () => {
    expect((calendarDay('2026-12-01') ?? 0) - (calendarDay('2026-11-30') ?? 0)).toBe(1);
  });
  it('keeps day differences stable across years', () => {
    expect((calendarDay('2027-01-01') ?? 0) - (calendarDay('2026-12-31') ?? 0)).toBe(1);
  });
  it('extracts the day from a dated ISO timestamp', () => {
    expect(dateFromProvenance(provenance({ retrievedAt: '2026-11-18T21:22:00Z' }))).toBe('2026-11-18');
  });
  it('prefers an explicitly supplied retrievedOn field', () => {
    expect(dateFromProvenance(provenance({ retrievedOn: '2026-11-17' }))).toBe('2026-11-17');
  });
  it('does not reinterpret an explicitly unusable retrievedOn field', () => {
    expect(dateFromProvenance(provenance({ retrievedOn: 'UNKNOWN' }))).toBe('UNKNOWN');
  });
  it('treats absent observation date as UNKNOWN', () => {
    expect(dateFromProvenance(provenance({ retrievedAt: 'UNKNOWN' }))).toBe('UNKNOWN');
  });
  it('does not infer a missing observation date from the system clock', () => {
    expect(provenanceQuality(provenance({ retrievedAt: 'UNKNOWN' }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('accepts open-licensed dated source at the age boundary', () => {
    expect(provenanceQuality(provenance({ retrievedAt: '2026-11-18' }), '2026-11-19', 1)).toBe('YES');
  });
  it('rejects source just beyond the age boundary', () => {
    expect(provenanceQuality(provenance({ retrievedAt: '2026-11-17' }), '2026-11-19', 1)).toBe('UNKNOWN');
  });
  it('does not accept future observations as current', () => {
    expect(provenanceQuality(provenance({ retrievedAt: '2026-11-20' }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('returns UNKNOWN for malformed assessment date', () => {
    expect(provenanceQuality(provenance(), 'not-a-date', 180)).toBe('UNKNOWN');
  });
  it('returns UNKNOWN for missing source identifier', () => {
    expect(provenanceQuality(provenance({ sourceId: '' }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('returns UNKNOWN for placeholder source identifier', () => {
    expect(provenanceQuality(provenance({ sourceId: 'UNKNOWN' }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('returns UNKNOWN for unsupported source licence', () => {
    expect(provenanceQuality(provenance({ licence: 'other' }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('accepts a separate ODbL source without merging its licence', () => {
    expect(provenanceQuality(provenance({ licence: 'ODbL-1.0' }), '2026-11-19', 180)).toBe('YES');
  });
  it('returns UNKNOWN for an unranked observation', () => {
    expect(provenanceQuality(provenance({ tier: null }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('returns UNKNOWN for tier zero observation', () => {
    expect(provenanceQuality(provenance({ tier: 0 }), '2026-11-19', 180)).toBe('UNKNOWN');
  });
  it('recognizes all currently enumerated requirement identifiers', () => {
    expect(new Set(REQUIREMENTS).size).toBe(9);
  });
  it('does not silently erase an unselected profile preference', () => {
    const next = withChoice(DEFAULT_PROFILE, 'distance', { limit: 300 });
    expect(next.choices.find((entry) => entry.id === 'slope')?.limit).toBe(6);
  });
  it('updates a priority and its limit without mutating the original', () => {
    const next = withChoice(DEFAULT_PROFILE, 'distance', { priority: 'essential', limit: 700 });
    expect(next.choices.find((entry) => entry.id === 'distance')).toEqual({ id: 'distance', priority: 'essential', limit: 700 });
    expect(DEFAULT_PROFILE.choices.find((entry) => entry.id === 'distance')?.priority).toBe('preferred');
  });
  it('keeps the order of preferences when editing a single choice', () => {
    const next = withChoice(DEFAULT_PROFILE, 'entrance', { priority: 'off' });
    expect(next.choices.map((entry) => entry.id)).toEqual(REQUIREMENTS);
  });
  it('does not convert a NO into an UNKNOWN during aggregation', () => {
    expect(combineEvidence(['YES', 'UNKNOWN', 'NO'])).toBe('NO');
  });
  it('does not convert a missing observation list into YES', () => {
    expect(combineEvidence([])).toBe('UNKNOWN');
  });
  it('leaves a partly UNKNOWN collection UNKNOWN', () => {
    expect(combineEvidence(['YES', 'UNKNOWN'])).toBe('UNKNOWN');
  });
  it('accepts all YES evidence as YES', () => {
    expect(combineEvidence(['YES', 'YES', 'YES'])).toBe('YES');
  });
});

describe('P15AD numeric limits from supplied data', () => {
  it('reads an integer percentage', () => { expect(parseNumericFact('6%')).toBe(6); });
  it('reads a decimal percentage', () => { expect(parseNumericFact('6.25%')).toBe(6.25); });
  it('reads a French decimal comma', () => { expect(parseNumericFact('6,25%')).toBe(6.25); });
  it('reads a distance in metres', () => { expect(parseNumericFact('500 m')).toBe(500); });
  it('reads metres with the full unit', () => { expect(parseNumericFact('500 metres')).toBe(500); });
  it('reads zero as a numeric measurement', () => { expect(parseNumericFact('0')).toBe(0); });
  it('rejects negative measurements', () => { expect(parseNumericFact('-2')).toBeNull(); });
  it('rejects scientific notation instead of guessing', () => { expect(parseNumericFact('1e2')).toBeNull(); });
  it('rejects absent information', () => { expect(parseNumericFact('UNKNOWN')).toBeNull(); });
  it('rejects descriptive surfaces as gradients', () => { expect(parseNumericFact('steep')).toBeNull(); });
  it('rejects mixed units', () => { expect(parseNumericFact('5% metres')).toBeNull(); });
  it('rejects non-finite values', () => { expect(parseNumericFact('Infinity')).toBeNull(); });
});

describe('P15AD complete preference envelope', () => {
  it('accepts the complete defaults', () => { expect(normalizeProfile(DEFAULT_PROFILE)).not.toBeNull(); });
  it('rejects null profile', () => { expect(normalizeProfile(null)).toBeNull(); });
  it('rejects a plain string', () => { expect(normalizeProfile('all')).toBeNull(); });
  it('rejects a partial preference set', () => {
    expect(normalizeProfile({ ...DEFAULT_PROFILE, choices: DEFAULT_PROFILE.choices.slice(1) })).toBeNull();
  });
  it('rejects duplicate requirement identifiers', () => {
    const choices = DEFAULT_PROFILE.choices.map((choice) => ({ ...choice }));
    choices[1] = { ...choices[0]! };
    expect(normalizeProfile({ ...DEFAULT_PROFILE, choices })).toBeNull();
  });
  it('rejects an unsupported priority', () => {
    const choices = DEFAULT_PROFILE.choices.map((choice) => ({ ...choice }));
    choices[0]!.priority = 'anything' as never;
    expect(normalizeProfile({ ...DEFAULT_PROFILE, choices })).toBeNull();
  });
  it('rejects a negative distance limit', () => {
    expect(normalizeProfile(withChoice(DEFAULT_PROFILE, 'distance', { limit: -1 }))).toBeNull();
  });
  it('rejects limit greater than policy upper bound', () => {
    expect(normalizeProfile(withChoice(DEFAULT_PROFILE, 'distance', { limit: 1_000_001 }))).toBeNull();
  });
  it('rejects an invalid date', () => {
    expect(normalizeProfile({ ...DEFAULT_PROFILE, asOf: '2026-02-29' })).toBeNull();
  });
  it('rejects negative source-retention window', () => {
    expect(normalizeProfile({ ...DEFAULT_PROFILE, maximumSourceAgeDays: -1 })).toBeNull();
  });
  it('rejects an unbounded source-retention window', () => {
    expect(normalizeProfile({ ...DEFAULT_PROFILE, maximumSourceAgeDays: 3651 })).toBeNull();
  });
  it('rejects nonboolean return requirement', () => {
    expect(normalizeProfile({ ...DEFAULT_PROFILE, includeReturn: 'yes' })).toBeNull();
  });
  it('rejects nonboolean blocked-route inclusion', () => {
    expect(normalizeProfile({ ...DEFAULT_PROFILE, includeBlocked: null })).toBeNull();
  });
  it('returns a separate copy of the choices', () => {
    const next = normalizeProfile(DEFAULT_PROFILE);
    expect(next).not.toBe(DEFAULT_PROFILE);
    expect(next?.choices).not.toBe(DEFAULT_PROFILE.choices);
  });
});
