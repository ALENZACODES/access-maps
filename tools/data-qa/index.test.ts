import { describe, expect, it } from 'vitest';
import { checkStrictData, type DataRecord } from './index';

const base: DataRecord = {
  id: 'stop-1',
  source: 'Municipal open data',
  licence: 'OGL-ON-1.0',
  observedOn: '2026-11-15',
  accessibility: 'UNKNOWN',
  silo: 'open',
  lineage: [{ source: 'Municipal open data', licence: 'OGL-ON-1.0', observedOn: '2026-11-15' }],
};

function errorsFor(record: unknown, silo: 'open' | 'odbl' = 'open'): string {
  const result = checkStrictData([record], silo);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.errors.join(' | ');
}

describe('static map data gate', () => {
  it('preserves explicit UNKNOWN rather than inferring access', () => {
    const result = checkStrictData([base], 'open');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]?.accessibility).toBe('UNKNOWN');
    expect(errorsFor({ ...base, accessibility: undefined })).toMatch(/accessibility/);
  });

  it('rejects invalid provenance and non-open licences', () => {
    expect(errorsFor({ ...base, licence: 'proprietary' })).toMatch(/licence/);
    expect(errorsFor({ ...base, observedOn: '2026-02-30' })).toMatch(/observedOn/);
    expect(errorsFor({ ...base, lineage: [] })).toMatch(/lineage/);
    expect(errorsFor({ ...base, lineage: [{ source: 'Unknown', licence: 'CC0-1.0' }] }))
      .toMatch(/observedOn/);
    expect(errorsFor({ ...base, inferredRamp: true })).toMatch(/unexpected field/);
  });

  it('blocks held MiWay sources through direct and upstream lineage', () => {
    expect(errorsFor({ ...base, source: 'MiWay GTFS' })).toMatch(/held feed/);
    expect(errorsFor({ ...base, lineage: [{ ...base.lineage[0], source: 'mi-way' }] }))
      .toMatch(/held feed/);
  });

  it('keeps ODbL inputs out of the general open export', () => {
    const derived = {
      ...base,
      lineage: [{ source: 'OpenStreetMap', licence: 'ODbL-1.0', observedOn: '2026-11-15' }],
    };
    expect(errorsFor(derived)).toMatch(/ODbL lineage/);
    expect(errorsFor({ ...derived, silo: 'odbl' }, 'odbl')).toMatch(/remain labelled ODbL/);
    const isolated = { ...derived, silo: 'odbl', licence: 'ODbL-1.0' };
    expect(checkStrictData([isolated], 'odbl').ok).toBe(true);
    expect(errorsFor(isolated)).toMatch(/wrong export silo/);
  });

  it('rejects duplicate identifiers and untrusted input shape', () => {
    const result = checkStrictData([base, base], 'open');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/duplicate/);
    expect(checkStrictData({}, 'open').ok).toBe(false);
  });
});
