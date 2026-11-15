import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { toAgencyReport, toOsmChange, previewOsmTags } from '../src/index';
import type { AccessibilityField, OsmEdit } from '../src/index';

const fact: AccessibilityField = {
  value: 'yes', source_id: 'survey-1', licence: 'ODbL', retrieved_at: '2026-11-14', tier: 1,
};
const point: OsmEdit = {
  osmType: 'node', lat: 43.7, lon: -79.4, tags: { wheelchair: fact },
  confirmedFields: ['wheelchair'], personReviewed: true, comment: 'Person checked entrance',
};
const fixture = readFileSync(fileURLToPath(new URL('./fixtures/one-new-point.osc', import.meta.url)), 'utf8');

describe('writeback is file-only', () => {
  it('matches a synthetic golden OSMChange fixture without transport', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network forbidden'); });
    const xhr = globalThis.XMLHttpRequest;
    const xhrSpy = xhr ? vi.spyOn(xhr.prototype, 'open').mockImplementation(() => { throw new Error('network forbidden'); }) : undefined;
    try {
      expect(toOsmChange([point], '2026-11-15')).toBe(fixture);
      expect(fetchSpy).not.toHaveBeenCalled();
      if (xhrSpy) expect(xhrSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); xhrSpy?.mockRestore(); }
  });
  it('requires identity and preserves existing OSM tags on modifications', () => {
    expect(() => toOsmChange([{ ...point, lat: undefined, lon: undefined, osmId: 123 }])).toThrow();
    const update = { ...point, osmId: 123, existingTags: { name: 'Synthetic stop', wheelchair: 'no' } };
    const xml = toOsmChange([update], '2026-11-15');
    expect(xml).toContain('<modify>');
    expect(xml).toContain('k="name" v="Synthetic stop"');
    expect(xml).toContain('k="wheelchair" v="yes"');
  });
  it('rejects unknown, tier-zero, unreviewed, invalid and unselected tags', () => {
    expect(() => toOsmChange([{ ...point, tags: { wheelchair: { ...fact, value: 'UNKNOWN' } } }])).toThrow();
    expect(() => toOsmChange([{ ...point, tags: { wheelchair: { ...fact, tier: 0 } } }])).toThrow();
    expect(() => toOsmChange([{ ...point, personReviewed: false }])).toThrow();
    expect(() => toOsmChange([{ ...point, lat: undefined }])).toThrow();
    expect(() => toOsmChange([{ ...point, tags: { wheelchair: { ...fact, licence: 'private' as 'ODbL' } } }])).toThrow();
    expect(previewOsmTags({ ...point, tags: { ...point.tags, ramp: { ...fact, value: 'no' } } })).toEqual({ wheelchair: 'yes' });
  });
  it('exports a local, attributed factual barrier report', () => {
    const report = toAgencyReport([{
      placeOrStopId: 'stop-7', field: 'wheelchair', fact: { ...fact, value: 'no' },
      lastChecked: '2026-11-14', observation: 'Step at entrance', personReviewed: true,
    }], { name: 'Example Transit' });
    expect(report.csv).toContain('"stop-7","wheelchair","2026-11-14","survey-1","ODbL","1","Step at entrance (no)"');
    expect(report.text).toContain('no affiliation or partnership');
    expect(report.text).toContain('last checked 2026-11-14');
  });
});
