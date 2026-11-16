import { describe, expect, it } from 'vitest';
import {
  reportStaleAndMissingLicences,
  isHeldSource,
  type LicencePolicy,
} from './stale-licence-report';

const options = { asOf: '2026-11-15', maxAgeDays: 30 };
const record = {
  id: 'location-1',
  source: 'Municipal open data',
  licence: 'OGL-ON-1.0',
  observedOn: '2026-10-16',
  accessibility: 'UNKNOWN',
};

describe('stale-date and licence report', () => {
  it('accepts the exact age boundary and does not change UNKNOWN or the input', () => {
    const before = JSON.stringify(record);
    const report = reportStaleAndMissingLicences([record], options);
    expect(report).toMatchObject({ checked: 1, clean: true, blocking: [], review: [] });
    expect(JSON.stringify(record)).toBe(before);
    expect(record.accessibility).toBe('UNKNOWN');
  });

  it('fails on a missing licence and does not treat the date as a review when the licence is invalid', () => {
    const report = reportStaleAndMissingLicences([
      { ...record, licence: ' ', observedOn: '2026-10-15' },
    ], options);
    expect(report.issues.map(issue => issue.code)).toEqual(['LICENCE_MISSING']);
    expect(report.blocking).toHaveLength(1);
    expect(report.review).toHaveLength(0);
    expect(report.clean).toBe(false);
  });

  it('reports unsupported licences, missing source and invalid or future dates as failures', () => {
    const report = reportStaleAndMissingLicences([
      { ...record, source: '', licence: 'proprietary', observedOn: '2026-02-30' },
      { ...record, observedOn: '2026-11-16' },
      { ...record, observedOn: null },
      null,
    ], options);
    expect(report.issues.map(issue => issue.code)).toEqual([
      'SOURCE_MISSING', 'LICENCE_UNSUPPORTED', 'DATE_INVALID',
      'DATE_FUTURE', 'DATE_MISSING', 'RECORD_INVALID',
    ]);
    expect(report.issues.every(issue => issue.severity === 'fail')).toBe(true);
    expect(report.clean).toBe(false);
  });

  it('treats a still-valid licence past the review window as informational only', () => {
    const report = reportStaleAndMissingLicences([
      { ...record, observedOn: '2026-10-15' },
    ], options);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      code: 'LICENCE_REVIEW_DUE',
      severity: 'review',
    });
    expect(report.issues[0]?.en).toMatch(/Informational: the licence is still valid/);
    expect(report.issues[0]?.fr).toMatch(/toujours valide/);
    expect(report.review).toHaveLength(1);
    expect(report.blocking).toHaveLength(0);
    expect(report.clean).toBe(true);
  });

  it('fails on an expired licence even when the observation date is recent', () => {
    const policies: Record<string, LicencePolicy> = {
      'OGL-ON-1.0': { id: 'OGL-ON-1.0', expiresOn: '2026-11-01', reviewEveryDays: 365 },
    };
    const report = reportStaleAndMissingLicences([record], { ...options, policies });
    expect(report.issues.map(issue => issue.code)).toEqual(['LICENCE_EXPIRED']);
    expect(report.blocking).toHaveLength(1);
    expect(report.clean).toBe(false);
  });

  it('does not block an invalid licence when the source is already held', () => {
    expect(isHeldSource('gtfs-miway')).toBe(true);
    const report = reportStaleAndMissingLicences([
      { ...record, source: 'gtfs-miway', licence: 'proprietary' },
    ], options);
    expect(report.issues.some(issue => issue.code === 'LICENCE_UNSUPPORTED')).toBe(true);
    expect(report.blocking).toHaveLength(0);
    expect(report.clean).toBe(true);
  });

  it('recognizes documented Metrolinx AUA and LTC licences as valid, not unsupported', () => {
    const report = reportStaleAndMissingLicences([
      { ...record, source: 'metrolinx-go', licence: 'Metrolinx Access and Use Agreement (accepted 2026-11-15)' },
      { ...record, source: 'gtfs-ltc', licence: 'LTC Open Data Terms of Use' },
    ], options);
    expect(report.issues.map((issue) => issue.code)).not.toContain('LICENCE_UNSUPPORTED');
    expect(report.issues).toEqual([]);
    expect(report.blocking).toHaveLength(0);
    expect(report.clean).toBe(true);
  });

  it('accepts documented redistribution licences that are outside the strict export allowlist', () => {
    const report = reportStaleAndMissingLicences([
      { ...record, licence: 'OGL-Toronto-1.0' },
    ], options);
    expect(report.clean).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('requires deterministic, valid reporting options', () => {
    expect(() => reportStaleAndMissingLicences([], { ...options, asOf: '2026-02-29' }))
      .toThrow(RangeError);
    expect(() => reportStaleAndMissingLicences([], { ...options, maxAgeDays: -1 }))
      .toThrow(RangeError);
    expect(() => reportStaleAndMissingLicences({}, options)).toThrow(TypeError);
  });
});
