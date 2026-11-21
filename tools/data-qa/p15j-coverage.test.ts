import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditCoverage } from './p15j-coverage.js';

const SOURCE = { id: 'source-a', source: 'Ontario open data', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-15', reference: 'sources/ontario.txt' };
const POINT = { id: 'point-a', feature: 'entrance', access: 'UNKNOWN',
  sourceIds: ['source-a'], labelEn: 'Entrance', labelFr: 'Entrée',
  descriptionEn: 'No recorded access conclusion', descriptionFr: 'Accès inconnu', silo: 'open' };
const EN = { id: 'region-a', locale: 'en', path: 'en/region-a.html',
  pointIds: ['point-a'], sizeBytes: 1024 };
const FR = { id: 'region-a', locale: 'fr', path: 'fr/region-a.html',
  pointIds: ['point-a'], sizeBytes: 1024 };
function base() {
  return { schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 30,
    sources: [{ ...SOURCE }], points: [{ ...POINT, sourceIds: [...POINT.sourceIds] }],
    regions: [{ ...EN, pointIds: [...EN.pointIds] }, { ...FR, pointIds: [...FR.pointIds] }] };
}
function check(input: unknown, limit?: number) { return auditCoverage(input, limit); }
function fail(input: unknown, code: string, limit?: number) {
  const result = check(input, limit);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(item => item.code === code), JSON.stringify(result.findings));
}
function point(key: string, value: unknown) {
  const input = base();
  (input.points[0] as Record<string, unknown>)[key] = value;
  return input;
}
function source(key: string, value: unknown) {
  const input = base();
  (input.sources[0] as Record<string, unknown>)[key] = value;
  return input;
}
function region(index: number, key: string, value: unknown) {
  const input = base();
  (input.regions[index] as Record<string, unknown>)[key] = value;
  return input;
}

describe('P15J bilingual offline coverage parity', () => {
  it('accepts a complete bilingual region with explicit UNKNOWN', () => {
    const result = check(base());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.totals.regions, 1);
    assert.equal(result.totals.regionPairs, 1);
    assert.equal(result.totals.unknown, 1);
    assert.equal(result.totals.known, 0);
    assert.equal(result.totals.sources, 1);
  });
  it('accepts known access with documented source', () => {
    const input = base();
    input.points[0]!.access = 'YES';
    const result = check(input);
    assert.equal(result.ok, true);
    assert.equal(result.totals.known, 1);
  });
  it('accepts NO access with documented source', () => {
    const input = base();
    input.points[0]!.access = 'NO';
    assert.equal(check(input).ok, true);
  });
  it('accepts explicit UNKNOWN without any source', () => {
    const input = base();
    input.points[0]!.sourceIds = [];
    assert.equal(check(input).ok, true);
  });
  it('rejects known YES without provenance', () => {
    const input = point('sourceIds', []);
    input.points[0]!.access = 'YES';
    fail(input, 'SOURCELESS');
  });
  it('rejects known NO without provenance', () => {
    const input = point('sourceIds', []);
    input.points[0]!.access = 'NO';
    fail(input, 'SOURCELESS');
  });
  it('rejects a source reference that is absent', () => {
    fail(point('sourceIds', ['missing-source']), 'MISSING');
  });
  it('rejects duplicate point source references', () => {
    fail(point('sourceIds', ['source-a', 'source-a']), 'DUPLICATE');
  });
  it('rejects duplicate point identifiers', () => {
    const input = base();
    input.points.push({ ...POINT });
    fail(input, 'DUPLICATE');
  });
  it('rejects duplicate source identifiers', () => {
    const input = base();
    input.sources.push({ ...SOURCE });
    fail(input, 'DUPLICATE');
  });
  it('rejects duplicate region-language entries', () => {
    const input = base();
    input.regions.push({ ...EN, path: 'en/other.html' });
    fail(input, 'DUPLICATE');
  });
  it('rejects duplicate region file paths', () => {
    fail(region(1, 'path', 'en/region-a.html'), 'DUPLICATE');
  });
  it('rejects missing French region', () => {
    const input = base();
    input.regions.pop();
    fail(input, 'LANGUAGE');
  });
  it('rejects missing English region', () => {
    const input = base();
    input.regions.shift();
    fail(input, 'LANGUAGE');
  });
  it('rejects an English-only second region', () => {
    const input = base();
    input.regions.push({ ...EN, id: 'region-b', path: 'en/region-b.html' });
    fail(input, 'LANGUAGE');
  });
  it('rejects a French-only second region', () => {
    const input = base();
    input.regions.push({ ...FR, id: 'region-b', path: 'fr/region-b.html' });
    fail(input, 'LANGUAGE');
  });
  it('accepts a second complete bilingual region', () => {
    const input = base();
    input.regions.push({ ...EN, id: 'region-b', path: 'en/region-b.html' });
    input.regions.push({ ...FR, id: 'region-b', path: 'fr/region-b.html' });
    assert.equal(check(input).totals.regionPairs, 2);
    assert.equal(check(input).ok, true);
  });
  it('rejects a point included only on the English page', () => {
    fail(region(1, 'pointIds', []), 'PARITY');
  });
  it('rejects a point included only on the French page', () => {
    fail(region(0, 'pointIds', []), 'PARITY');
  });
  it('rejects an unknown point id in an English region', () => {
    fail(region(0, 'pointIds', ['point-a', 'missing']), 'MISSING');
  });
  it('rejects an unknown point id in a French region', () => {
    fail(region(1, 'pointIds', ['point-a', 'missing']), 'MISSING');
  });
  it('rejects duplicate point references on a page', () => {
    fail(region(0, 'pointIds', ['point-a', 'point-a']), 'DUPLICATE');
  });
  it('rejects points that are absent from every region', () => {
    const input = base();
    input.points.push({ ...POINT, id: 'point-extra' });
    fail(input, 'UNPUBLISHED');
  });
  it('accepts a second point in both language variants', () => {
    const input = base();
    input.points.push({ ...POINT, id: 'point-b' });
    input.regions[0]!.pointIds.push('point-b');
    input.regions[1]!.pointIds.push('point-b');
    assert.equal(check(input).ok, true);
  });
  it('rejects ODbL material mislabelled as open', () => {
    fail(source('licence', 'ODbL-1.0'), 'SILO');
  });
  it('accepts an ODbL-only point in the separate silo', () => {
    const input = base();
    input.sources[0]!.licence = 'ODbL-1.0';
    input.points[0]!.silo = 'odbl';
    assert.equal(check(input).ok, true);
  });
  it('rejects a non-ODbL point in the ODbL silo', () => {
    fail(point('silo', 'odbl'), 'SILO');
  });
  it('rejects a held source', () => {
    fail(source('source', 'MiWay transit'), 'SOURCE');
  });
  it('rejects a held source with hyphenation', () => {
    fail(source('source', 'mi-way feed'), 'SOURCE');
  });
  it('rejects a closed source licence', () => {
    fail(source('licence', 'private'), 'SOURCE');
  });
  it('rejects missing observed date', () => {
    fail(source('observedOn', ''), 'SOURCE');
  });
  it('rejects invalid leap day', () => {
    fail(source('observedOn', '2025-02-29'), 'SOURCE');
  });
  it('accepts valid leap day with wide enough age', () => {
    const input = base();
    input.sources[0]!.observedOn = '2024-02-29';
    input.maxAgeDays = 1000;
    assert.equal(check(input).ok, true);
  });
  it('rejects a stale source', () => {
    fail(source('observedOn', '2025-11-01'), 'DATE');
  });
  it('rejects a future source', () => {
    fail(source('observedOn', '2026-12-01'), 'DATE');
  });
  it('rejects a remote source path', () => {
    fail(source('reference', 'https://example.org/item'), 'SOURCE');
  });
  it('rejects a traversal source path', () => {
    fail(source('reference', '../private/record'), 'SOURCE');
  });
  it('rejects an external English page URL', () => {
    fail(region(0, 'path', 'https://example.org/region'), 'REGION');
  });
  it('rejects traversal in a French page path', () => {
    fail(region(1, 'path', '../fr/region.html'), 'REGION');
  });
  it('rejects an over-budget English page', () => {
    fail(region(0, 'sizeBytes', 2000), 'TOO_LARGE', 1000);
  });
  it('rejects an over-budget French page', () => {
    fail(region(1, 'sizeBytes', 2000), 'TOO_LARGE', 1000);
  });
  it('accepts offline pages that exactly match byte budget', () => {
    assert.equal(check(base(), 1024).ok, true);
  });
  it('rejects a zero byte budget', () => {
    fail(base(), 'POLICY', 0);
  });
  it('rejects an invalid byte budget', () => {
    fail(base(), 'POLICY', -1);
  });
  it('rejects oversized region byte declaration', () => {
    fail(region(0, 'sizeBytes', Number.MAX_SAFE_INTEGER), 'REGION');
  });
  it('rejects a fractional region byte declaration', () => {
    fail(region(1, 'sizeBytes', 1.5), 'REGION');
  });
  it('rejects missing French label', () => {
    fail(point('labelFr', ''), 'POINT');
  });
  it('rejects missing English label', () => {
    fail(point('labelEn', ''), 'POINT');
  });
  it('rejects missing French description', () => {
    fail(point('descriptionFr', ''), 'POINT');
  });
  it('rejects missing English description', () => {
    fail(point('descriptionEn', ''), 'POINT');
  });
  it('rejects a French punctuation error', () => {
    fail(point('descriptionFr', 'Accès : inconnu'), 'POINT');
  });
  it('accepts the French nonbreaking colon', () => {
    const input = base();
    input.points[0]!.descriptionFr = 'Accès\u00a0: inconnu';
    assert.equal(check(input).ok, true);
  });
  it('rejects French apostrophe formatting error', () => {
    fail(point('descriptionFr', "L'acces"), 'POINT');
  });
  it('accepts typographic French apostrophe', () => {
    const input = base();
    input.points[0]!.descriptionFr = 'L’accès';
    assert.equal(check(input).ok, true);
  });
  it('rejects French question mark without narrow space', () => {
    fail(point('descriptionFr', 'Accès ?'), 'POINT');
  });
  it('accepts French narrow space before question mark', () => {
    const input = base();
    input.points[0]!.descriptionFr = 'Accès\u202f?';
    assert.equal(check(input).ok, true);
  });
  it('rejects unsafe HTML markup in English', () => {
    fail(point('descriptionEn', '<script>alert(1)</script>'), 'POINT');
  });
  it('rejects unsafe HTML markup in French', () => {
    fail(point('descriptionFr', '<iframe src=x></iframe>'), 'POINT');
  });
  it('rejects embedded email addresses in descriptions', () => {
    fail(point('descriptionEn', 'Email person@example.org'), 'POINT');
  });
  it('rejects missing top-level field', () => {
    const input = base() as Record<string, unknown>;
    delete input.points;
    fail(input, 'ROOT');
  });
  it('rejects extra root fields', () => {
    fail({ ...base(), sideChannel: true }, 'ROOT');
  });
  it('rejects an unsupported schema version', () => {
    fail({ ...base(), schemaVersion: 2 }, 'ROOT');
  });
  it('rejects invalid observation age policy', () => {
    fail({ ...base(), maxAgeDays: -5 }, 'POLICY');
  });
  it('rejects an invalid review date', () => {
    fail({ ...base(), asOf: '2026-02-30' }, 'POLICY');
  });
  it('rejects oversized point inventories', () => {
    fail({ ...base(), points: Array.from({ length: 10001 }, () => POINT) }, 'LIMIT');
  });
  it('reports a source not referenced by a point as a notice', () => {
    const input = base();
    input.sources.push({ ...SOURCE, id: 'source-b' });
    const result = check(input);
    assert.equal(result.ok, true);
    assert.ok(result.findings.some(f => f.code === 'UNUSED' && f.severity === 'NOTICE'));
  });
  it('produces stable issue ordering', () => {
    const input = point('sourceIds', ['missing-source']);
    assert.deepEqual(check(input), check(input));
  });
});

describe('P15J coverage input shape hardening', () => {
  it('rejects an unexpected point key', () => {
    fail(point('privateFlag', true), 'POINT');
  });
  it('rejects an unexpected source key', () => {
    fail(source('sourceToken', 'secret'), 'SOURCE');
  });
  it('rejects an unexpected language-region key', () => {
    fail(region(0, 'remoteEndpoint', 'example.org'), 'REGION');
  });
  it('rejects a fractional max age', () => {
    fail({ ...base(), maxAgeDays: 3.5 }, 'POLICY');
  });
  it('rejects a negative page size', () => {
    fail(region(1, 'sizeBytes', -10), 'REGION');
  });
  it('rejects incorrect access state case', () => {
    fail(point('access', 'unknown'), 'POINT');
  });
  it('rejects a record with a whitespace-only feature', () => {
    fail(point('feature', ' '), 'POINT');
  });
  it('rejects a region without a language code', () => {
    fail(region(0, 'locale', undefined), 'REGION');
  });
  it('rejects unsupported language codes', () => {
    fail(region(1, 'locale', 'es'), 'REGION');
  });
  it('rejects object-instead-of-array point references', () => {
    fail(region(0, 'pointIds', { 'point-a': true }), 'REGION');
  });
  it('rejects object-instead-of-array source references', () => {
    fail(point('sourceIds', { 'source-a': true }), 'POINT');
  });
  it('rejects null catalogue sources', () => {
    fail({ ...base(), sources: null }, 'LIMIT');
  });
  it('rejects null catalogue points', () => {
    fail({ ...base(), points: null }, 'LIMIT');
  });
  it('rejects null language-region collection', () => {
    fail({ ...base(), regions: null }, 'LIMIT');
  });
  it('reports exactly one unknown coverage point in its totals', () => {
    const result = check(base());
    assert.equal(result.totals.unknown, 1);
    assert.equal(result.totals.known, 0);
  });
});
