import { describe, expect, it } from 'vitest';
import { reportStaleAndMissingLicences } from './stale-licence-report';

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
    expect(report).toMatchObject({ checked: 1, clean: true, issues: [] });
    expect(JSON.stringify(record)).toBe(before);
    expect(record.accessibility).toBe('UNKNOWN');
  });

  it('reports both missing licence and stale date with English and French text', () => {
    const report = reportStaleAndMissingLicences([
      { ...record, licence: ' ', observedOn: '2026-10-15' },
    ], options);
    expect(report.issues.map(issue => issue.code)).toEqual(['LICENCE_MISSING', 'DATE_STALE']);
    expect(report.issues.every(issue => issue.en.length > 0 && issue.fr.length > 0)).toBe(true);
    expect(report.clean).toBe(false);
  });

  it('reports unsupported licences, missing source and invalid or future dates', () => {
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
  });

  it('requires deterministic, valid reporting options', () => {
    expect(() => reportStaleAndMissingLicences([], { ...options, asOf: '2026-02-29' }))
      .toThrow(RangeError);
    expect(() => reportStaleAndMissingLicences([], { ...options, maxAgeDays: -1 }))
      .toThrow(RangeError);
    expect(() => reportStaleAndMissingLicences({}, options)).toThrow(TypeError);
  });
});
