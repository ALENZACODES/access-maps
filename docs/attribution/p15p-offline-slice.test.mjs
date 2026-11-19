import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planOfflineSlice, sliceReportText } from './p15p-offline-slice.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SRC = { id: 'city', name: 'Municipal open data', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-14', reference: 'sources/city.json' };
const SRC2 = { id: 'city2', name: 'Regional open data', licence: 'CC-BY-4.0',
  observedOn: '2026-11-14', reference: 'sources/region.json' };
const OSM = { id: 'osm', name: 'OpenStreetMap extract', licence: 'ODbL-1.0',
  observedOn: '2026-11-15', reference: 'sources/osm.json' };
const ASSET = { id: 'guide', path: 'offline/guide.json', sha256: SHA_A,
  bytes: 120, sourceIds: ['city'], silo: 'open' };
const ASSET2 = { id: 'photo', path: 'offline/photo.json', sha256: SHA_B,
  bytes: 200, sourceIds: ['city'], silo: 'open' };
const OSM_ASSET = { id: 'odblguide', path: 'offline/map.json', sha256: SHA_C,
  bytes: 400, sourceIds: ['osm'], silo: 'odbl' };
const EVIDENCE = { sourceId: 'city', observedOn: '2026-11-15',
  feature: 'entrance', access: 'YES', tier: 2 };
const RECORD = { id: 'library', en: 'Library entrance', fr: 'Entrée de bibliothèque',
  feature: 'entrance', access: 'YES', tier: 2, silo: 'open',
  sourceIds: ['city'], assetIds: ['guide'], evidence: [EVIDENCE] };
const RECORD2 = { id: 'museum', en: 'Museum entrance', fr: 'Entrée du musée',
  feature: 'entrance', access: 'YES', tier: 2, silo: 'open',
  sourceIds: ['city'], assetIds: ['guide', 'photo'], evidence: [EVIDENCE] };
const OSM_RECORD = { id: 'park', en: 'Park entrance', fr: 'Entrée du parc',
  feature: 'entrance', access: 'UNKNOWN', tier: 1, silo: 'odbl',
  sourceIds: ['osm'], assetIds: ['odblguide'], evidence: [] };
function catalog(changes = {}) {
  return { schemaVersion: 1, asOf: '2026-11-16', maxAgeDays: 90,
    sources: [SRC, SRC2, OSM], records: [RECORD, RECORD2, OSM_RECORD],
    assets: [ASSET, ASSET2, OSM_ASSET], ...changes };
}
function query(changes = {}) {
  return { ids: ['library'], silo: 'open', maximumRecords: 50,
    maximumBytes: 10000, ...changes };
}
function result(c = catalog(), q = query()) { return planOfflineSlice(c, q); }
function codes(c = catalog(), q = query()) { return result(c, q).issues.map(x => x.code); }
function has(code, c = catalog(), q = query()) { assert.ok(codes(c, q).includes(code), `Missing ${code}`); }
function sourceChange(patch) { return catalog({ sources: [{ ...SRC, ...patch }, SRC2, OSM] }); }
function recordChange(patch) { return catalog({ records: [{ ...RECORD, ...patch }, RECORD2, OSM_RECORD] }); }
function assetChange(patch) { return catalog({ assets: [{ ...ASSET, ...patch }, ASSET2, OSM_ASSET] }); }

describe('P15P dependency-closed offline slices', () => {
  it('selects only requested records', () => {
    const r = result(); assert.equal(r.ok, true);
    assert.deepEqual(r.slice.records.map(x => x.id), ['library']);
  });
  it('includes only needed open sources', () => {
    const r = result(); assert.deepEqual(r.slice.sources.map(x => x.id), ['city']);
  });
  it('includes only needed assets', () => {
    const r = result(); assert.deepEqual(r.slice.assets.map(x => x.id), ['guide']);
  });
  it('includes exact total asset bytes', () => { assert.equal(result().slice.bytes, 120); });
  it('includes a stable 64-character digest', () => {
    assert.match(result().slice.digest, /^[a-f0-9]{64}$/u);
  });
  it('is deterministic across repeated calls', () => {
    assert.deepEqual(result(), result());
  });
  it('does not mutate supplied catalogue', () => {
    const c = catalog(); const before = structuredClone(c); result(c); assert.deepEqual(c, before);
  });
  it('does not mutate supplied request', () => {
    const q = query(); const before = structuredClone(q); result(catalog(), q); assert.deepEqual(q, before);
  });
  it('produces independent output objects', () => {
    const c = catalog(); const r = result(c); r.slice.records[0].en = 'Modified';
    assert.equal(c.records[0].en, 'Library entrance');
  });
  it('ignores request ordering in output and digest', () => {
    const a = result(catalog(), query({ ids: ['library', 'museum'] }));
    const b = result(catalog(), query({ ids: ['museum', 'library'] }));
    assert.equal(a.slice.digest, b.slice.digest);
  });
  it('deduplicates shared assets and source dependencies', () => {
    const r = result(catalog(), query({ ids: ['library', 'museum'] }));
    assert.deepEqual(r.slice.assets.map(x => x.id), ['guide', 'photo']);
    assert.equal(r.slice.bytes, 320);
  });
  it('permits the independent ODbL export', () => {
    const r = result(catalog(), query({ ids: ['park'], silo: 'odbl' }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.slice.sources.map(x => x.id), ['osm']);
  });
  it('does not combine open and ODbL records', () => {
    has('SILO', catalog(), query({ ids: ['library', 'park'] }));
  });
  it('returns no partial slice after any failure', () => {
    const r = result(catalog(), query({ ids: ['missing'] }));
    assert.equal(r.ok, false); assert.equal(Object.hasOwn(r, 'slice'), false);
  });
  it('rejects absent catalogue', () => { has('ROOT', null); });
  it('rejects array catalogue', () => { has('ROOT', []); });
  it('rejects unknown top-level keys', () => { has('ROOT', catalog({ custom: 1 })); });
  it('rejects wrong schema version', () => { has('ROOT', catalog({ schemaVersion: 2 })); });
  it('rejects non-array sources', () => { has('ROOT', catalog({ sources: null })); });
  it('rejects non-array assets', () => { has('ROOT', catalog({ assets: null })); });
  it('rejects non-array records', () => { has('ROOT', catalog({ records: null })); });
  it('rejects absent request', () => { has('OPTION', catalog(), null); });
  it('rejects request extras', () => { has('OPTION', catalog(), query({ action: 'fetch' })); });
  it('rejects empty requested ids', () => { has('OPTION', catalog(), query({ ids: [] })); });
  it('rejects duplicate requested ids', () => { has('OPTION', catalog(), query({ ids: ['library', 'library'] })); });
  it('rejects invalid requested ids', () => { has('OPTION', catalog(), query({ ids: ['../../oops'] })); });
  it('rejects invalid silo', () => { has('OPTION', catalog(), query({ silo: 'mixed' })); });
  it('rejects non-integer record quota', () => { has('OPTION', catalog(), query({ maximumRecords: 1.2 })); });
  it('rejects zero record quota', () => { has('OPTION', catalog(), query({ maximumRecords: 0 })); });
  it('rejects invalid byte quota', () => { has('OPTION', catalog(), query({ maximumBytes: -10 })); });
  it('rejects too many requested records', () => { has('LIMIT', catalog(), query({ ids: ['library', 'museum'], maximumRecords: 1 })); });
  it('rejects too many asset bytes', () => { has('LIMIT', catalog(), query({ maximumBytes: 119 })); });
  it('accepts a quota equal to bytes', () => {
    assert.equal(result(catalog(), query({ maximumBytes: 120 })).ok, true);
  });
  it('rejects unavailable record ids', () => { has('MISSING', catalog(), query({ ids: ['unlisted'] })); });
  it('rejects malformed reference date', () => { has('DATE', catalog({ asOf: '2026-02-30' })); });
  it('accepts leap day', () => {
    const c = catalog({ asOf: '2024-02-29', maxAgeDays: 365,
      sources: [{ ...SRC, observedOn: '2024-02-28' }, SRC2, OSM].map(x => ({ ...x, observedOn: '2024-02-28' })),
      records: [{ ...RECORD, evidence: [{ ...EVIDENCE, observedOn: '2024-02-29' }] }], assets: [ASSET] });
    assert.equal(result(c).ok, true);
  });
  it('rejects old source dates', () => { has('DATE', sourceChange({ observedOn: '2020-01-01' })); });
  it('rejects future source dates', () => { has('DATE', sourceChange({ observedOn: '2026-11-17' })); });
  it('rejects unsupported source licence', () => { has('SOURCE', sourceChange({ licence: 'commercial' })); });
  it('rejects missing source label', () => { has('SOURCE', sourceChange({ name: '' })); });
  it('rejects held operator names', () => { has('HELD', sourceChange({ name: 'Mi Way transit' })); });
  it('rejects source paths with traversal', () => { has('PATH', sourceChange({ reference: '../sources/input.json' })); });
  it('rejects source paths with URL schemes', () => { has('PATH', sourceChange({ reference: 'https://example.org/file' })); });
  it('rejects source paths with query fragments', () => { has('PATH', sourceChange({ reference: 'sources/a.json?x=1' })); });
  it('rejects duplicate source ids', () => { has('DUPLICATE', catalog({ sources: [SRC, SRC, OSM] })); });
  it('rejects duplicate asset ids', () => { has('DUPLICATE', catalog({ assets: [ASSET, ASSET, OSM_ASSET] })); });
  it('rejects duplicate record ids', () => { has('DUPLICATE', catalog({ records: [RECORD, RECORD, OSM_RECORD] })); });
  it('rejects missing asset provenance', () => { has('MISSING', assetChange({ sourceIds: ['absent'] })); });
  it('rejects asset licence-silo conflicts', () => { has('SILO', assetChange({ silo: 'odbl' })); });
  it('rejects invalid asset digests', () => { has('ASSET', assetChange({ sha256: 'invalid' })); });
  it('rejects zero-sized assets', () => { has('ASSET', assetChange({ bytes: 0 })); });
  it('rejects absolute asset paths', () => { has('PATH', assetChange({ path: '/offline/guide.json' })); });
  it('rejects control characters in asset paths', () => { has('PATH', assetChange({ path: 'offline/a\u0001.json' })); });
  it('rejects duplicate asset source references', () => { has('ASSET', assetChange({ sourceIds: ['city', 'city'] })); });
  it('rejects missing record sources', () => { has('MISSING', recordChange({ sourceIds: ['no-source'] })); });
  it('rejects missing record assets', () => { has('MISSING', recordChange({ assetIds: ['absent'] })); });
  it('rejects record and asset silo conflicts', () => { has('SILO', recordChange({ silo: 'odbl' })); });
  it('rejects record text containing HTML', () => { has('TEXT', recordChange({ en: '<script>bad</script>' })); });
  it('rejects personal contact text', () => { has('TEXT', recordChange({ en: 'person@example.com' })); });
  it('rejects missing French text', () => { has('TEXT', recordChange({ fr: '' })); });
  it('rejects incorrect French punctuation spacing', () => { has('TYPOGRAPHY', recordChange({ fr: 'Accès: entrée' })); });
  it('accepts correct French punctuation spacing', () => {
    assert.equal(result(recordChange({ fr: 'Accès\u00a0: entrée' })).ok, true);
  });
  it('rejects malformed evidence date', () => { has('DATE', recordChange({ evidence: [{ ...EVIDENCE, observedOn: '2026-13-01' }] })); });
  it('rejects old evidence date', () => { has('DATE', recordChange({ evidence: [{ ...EVIDENCE, observedOn: '2021-11-15' }] })); });
  it('rejects evidence older than its source', () => { has('DATE', recordChange({ evidence: [{ ...EVIDENCE, observedOn: '2026-11-13' }] })); });
  it('rejects evidence referencing another source', () => { has('EVIDENCE', recordChange({ evidence: [{ ...EVIDENCE, sourceId: 'osm' }] })); });
  it('rejects evidence referencing another feature', () => { has('EVIDENCE', recordChange({ evidence: [{ ...EVIDENCE, feature: 'lift' }] })); });
  it('rejects unsupported evidence access', () => { has('EVIDENCE', recordChange({ evidence: [{ ...EVIDENCE, access: 'MAYBE' }] })); });
  it('rejects asserted access without matching evidence', () => { has('EVIDENCE', recordChange({ evidence: [{ ...EVIDENCE, access: 'NO' }] })); });
  it('requires UNKNOWN for conflicting observations', () => {
    has('CONFLICT', recordChange({ evidence: [EVIDENCE, { ...EVIDENCE, access: 'NO' }] }));
  });
  it('rejects positive assertions at tier zero', () => { has('TIER', recordChange({ tier: 0 })); });
  it('rejects positive assertions at tier one', () => { has('TIER', recordChange({ tier: 1 })); });
  it('rejects UNKNOWN access at tier two', () => { has('TIER', recordChange({ access: 'UNKNOWN' })); });
  it('rejects tier three with one source', () => { has('TIER', recordChange({ tier: 3 })); });
  it('accepts tier three with independent sources', () => {
    const second = { ...EVIDENCE, sourceId: 'city2', tier: 3 };
    const first = { ...EVIDENCE, tier: 3 };
    const c = recordChange({ tier: 3, sourceIds: ['city', 'city2'], evidence: [first, second] });
    assert.equal(result(c).ok, true);
  });
  it('accepts an UNKNOWN tier-one entry with no observations', () => {
    const c = recordChange({ access: 'UNKNOWN', tier: 1, evidence: [] });
    assert.equal(result(c).ok, true);
  });
  it('rejects a tier-zero record with observations', () => {
    has('TIER', recordChange({ access: 'UNKNOWN', tier: 0 }));
  });
  it('rejects unrecognized record features', () => { has('FIELD', recordChange({ feature: 'unknown-feature' })); });
  it('rejects malformed record ids', () => { has('FIELD', recordChange({ id: 'bad id' })); });
  it('sorts selected records by identifier', () => {
    const r = result(catalog(), query({ ids: ['museum', 'library'] }));
    assert.deepEqual(r.slice.records.map(x => x.id), ['library', 'museum']);
  });
  it('sorts selected sources by identifier', () => {
    const c = recordChange({ sourceIds: ['city2', 'city'], evidence: [EVIDENCE] });
    const r = result(c); assert.deepEqual(r.slice.sources.map(x => x.id), ['city', 'city2']);
  });
  it('contains bilingual issues on failure', () => {
    const r = result(catalog(), query({ ids: ['absent'] }));
    assert.ok(r.issues.every(x => x.en.length > 0 && x.fr.length > 0));
  });
  it('renders English failure text', () => {
    assert.match(sliceReportText(result(catalog(), query({ ids: ['absent'] })), 'en'), /Selection blocked/u);
  });
  it('renders French failure text', () => {
    assert.match(sliceReportText(result(catalog(), query({ ids: ['absent'] })), 'fr'), /Sélection bloquée/u);
  });
  it('rejects unsupported report locale', () => {
    assert.throws(() => sliceReportText(result(), 'es'), TypeError);
  });
  it('orders failure diagnostics deterministically', () => {
    assert.deepEqual(result(catalog(), query({ ids: ['absent'] })), result(catalog(), query({ ids: ['absent'] })));
  });
});
