import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { assembleOfflineManifest, manifestText } from './p15o-offline-manifest.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const payload = 'local-asset-payload';
const source = { id: 'city', name: 'City open data', licence: 'OGL-ON-1.0',
  reference: 'sources/city.json', observedOn: '2026-11-15' };
const base = {
  schemaVersion: 1, asOf: '2026-11-19', maxAgeDays: 30, silo: 'open',
  sources: [source],
  assets: [{ id: 'guide', path: 'files/guide.json', sourceIds: ['city'], silo: 'open',
    bytes: Buffer.byteLength(payload), sha256: digest(payload) }],
  records: [{ id: 'library', en: 'Library', fr: 'Bibliothèque', feature: 'entrance',
    access: 'UNKNOWN', tier: 1, sourceIds: ['city'], assetIds: ['guide'],
    evidence: [], silo: 'open' }],
};
const inputs = { 'files/guide.json': payload };
const copy = () => structuredClone(base);
const run = (candidate = copy(), files = inputs) => assembleOfflineManifest(candidate, files);
const has = (report, code) => report.findings.some(f => f.code === code);
const mutate = change => { const candidate = copy(); change(candidate); return run(candidate); };
const marked = (tier = 2) => ({ sourceId: 'city', feature: 'entrance',
  access: 'YES', observedOn: '2026-11-16', tier });
const twoSources = () => {
  const candidate = copy();
  candidate.sources.push({ ...source, id: 'province', name: 'Provincial open data',
    reference: 'sources/province.json' });
  candidate.records[0].sourceIds.push('province');
  candidate.records[0].access = 'YES';
  candidate.records[0].tier = 3;
  candidate.records[0].evidence = [marked(3), { ...marked(3), sourceId: 'province' }];
  return candidate;
};

describe('P15O local offline manifest', () => {
  it('accepts a complete UNKNOWN package', () => assert.equal(run().ok, true));
  it('returns no manifest on any issue', () => assert.equal(run({}).manifest, null));
  it('rejects null input', () => assert.ok(has(run(null), 'ROOT')));
  it('rejects array input', () => assert.ok(has(run([]), 'ROOT')));
  it('rejects foreign root fields', () => assert.ok(has(mutate(x => { x.extra = true; }), 'ROOT')));
  it('rejects missing schema version', () => assert.ok(has(mutate(x => { delete x.schemaVersion; }), 'ROOT')));
  it('rejects unknown schema version', () => assert.ok(has(mutate(x => { x.schemaVersion = 4; }), 'ROOT')));
  it('rejects invalid target silo', () => assert.ok(has(mutate(x => { x.silo = 'other'; }), 'ROOT')));
  it('rejects invalid retention days', () => assert.ok(has(mutate(x => { x.maxAgeDays = -1; }), 'ROOT')));
  it('rejects invalid date', () => assert.ok(has(mutate(x => { x.asOf = '2026-02-30'; }), 'DATE')));
  it('rejects missing date', () => assert.ok(has(mutate(x => { x.asOf = ''; }), 'DATE')));
  it('rejects old sources', () => assert.ok(has(mutate(x => { x.sources[0].observedOn = '2025-01-01'; }), 'DATE')));
  it('rejects future sources', () => assert.ok(has(mutate(x => { x.sources[0].observedOn = '2026-12-01'; }), 'DATE')));
  it('accepts source on retention boundary', () => assert.equal(mutate(x => { x.maxAgeDays = 4; }).ok, true));
  it('rejects source just past retention boundary', () => assert.ok(has(mutate(x => { x.maxAgeDays = 3; }), 'DATE')));
  it('rejects source with closed licence', () => assert.ok(has(mutate(x => { x.sources[0].licence = 'proprietary'; }), 'LICENCE')));
  it('rejects duplicate source id', () => assert.ok(has(mutate(x => { x.sources.push({ ...source }); }), 'DUPLICATE')));
  it('rejects unsafe source path', () => assert.ok(has(mutate(x => { x.sources[0].reference = '../secret'; }), 'SOURCE')));
  it('rejects absolute source path', () => assert.ok(has(mutate(x => { x.sources[0].reference = '/tmp/a'; }), 'SOURCE')));
  it('rejects source control characters', () => assert.ok(has(mutate(x => { x.sources[0].name = 'City\u0001'; }), 'SOURCE')));
  it('rejects held operator feed', () => assert.ok(has(mutate(x => { x.sources[0].name = 'MiWay feed'; }), 'SOURCE')));
  it('rejects source email in display name', () => assert.ok(has(mutate(x => { x.sources[0].name = 'x@example.org'; }), 'SOURCE')));
  it('rejects duplicate asset identifiers', () => assert.ok(has(mutate(x => { x.assets.push({ ...x.assets[0] }); }), 'DUPLICATE')));
  it('rejects duplicate asset paths', () => assert.ok(has(mutate(x => { x.assets.push({ ...x.assets[0], id: 'another' }); }), 'DUPLICATE')));
  it('rejects wrong asset digest', () => assert.ok(has(mutate(x => { x.assets[0].sha256 = 'a'.repeat(64); }), 'BYTES')));
  it('rejects declared byte mismatch', () => assert.ok(has(mutate(x => { x.assets[0].bytes++; }), 'BYTES')));
  it('rejects missing bytes', () => assert.ok(has(run(copy(), {}), 'BYTES')));
  it('accepts Uint8Array bytes', () => assert.equal(run(copy(), { 'files/guide.json': new TextEncoder().encode(payload) }).ok, true));
  it('rejects unsafe asset path', () => assert.ok(has(mutate(x => { x.assets[0].path = '../up'; }), 'PATH')));
  it('rejects invalid asset digest', () => assert.ok(has(mutate(x => { x.assets[0].sha256 = 'broken'; }), 'PATH')));
  it('rejects missing asset source', () => assert.ok(has(mutate(x => { x.assets[0].sourceIds = ['absent']; }), 'LINK')));
  it('rejects wrong asset silo', () => assert.ok(has(mutate(x => { x.assets[0].silo = 'odbl'; }), 'SILO')));
  it('rejects missing record source', () => assert.ok(has(mutate(x => { x.records[0].sourceIds = ['absent']; }), 'LINK')));
  it('rejects missing referenced asset', () => assert.ok(has(mutate(x => { x.records[0].assetIds = ['absent']; }), 'LINK')));
  it('rejects duplicate asset references', () => assert.ok(has(mutate(x => { x.records[0].assetIds = ['guide', 'guide']; }), 'TEXT')));
  it('rejects duplicate record ids', () => assert.ok(has(mutate(x => { x.records.push({ ...x.records[0] }); }), 'DUPLICATE')));
  it('rejects missing French display text', () => assert.ok(has(mutate(x => { x.records[0].fr = ''; }), 'TEXT')));
  it('rejects missing English display text', () => assert.ok(has(mutate(x => { x.records[0].en = ''; }), 'TEXT')));
  it('rejects unsafe markup', () => assert.ok(has(mutate(x => { x.records[0].en = '<script>'; }), 'TEXT')));
  it('rejects control codes in text', () => assert.ok(has(mutate(x => { x.records[0].en = 'Library\nX'; }), 'TEXT')));
  it('rejects unspaced French colon', () => assert.ok(has(mutate(x => { x.records[0].fr = 'Lieu: entrée'; }), 'TEXT')));
  it('accepts French colon with nonbreaking space', () => assert.equal(mutate(x => { x.records[0].fr = 'Lieu\u00a0: entrée'; }).ok, true));
  it('rejects an unsupported feature', () => assert.ok(has(mutate(x => { x.records[0].feature = 'unknown-feature'; }), 'TEXT')));
  it('rejects an unsupported tier', () => assert.ok(has(mutate(x => { x.records[0].tier = 9; }), 'TEXT')));
  it('rejects a positive claim without observations', () => assert.ok(has(mutate(x => { x.records[0].access = 'YES'; }), 'ACCESS')));
  it('rejects a tier-zero positive claim', () => assert.ok(has(mutate(x => { x.records[0].tier = 0; x.records[0].access = 'YES'; }), 'TIER')));
  it('accepts tier-zero UNKNOWN with no evidence', () => assert.equal(mutate(x => { x.records[0].tier = 0; }).ok, true));
  it('rejects tier-one positive claim even with evidence', () => assert.ok(has(mutate(x => { x.records[0].tier = 1; x.records[0].access = 'YES'; x.records[0].evidence = [marked(1)]; }), 'TIER')));
  it('accepts supported tier-two positive claim', () => assert.equal(mutate(x => { x.records[0].tier = 2; x.records[0].access = 'YES'; x.records[0].evidence = [marked()]; }).ok, true));
  it('rejects stale positive evidence', () => assert.ok(has(mutate(x => { x.records[0].tier = 2; x.records[0].access = 'YES'; x.records[0].evidence = [{ ...marked(), observedOn: '2025-01-01' }]; }), 'ACCESS')));
  it('rejects mismatched evidence feature', () => assert.ok(has(mutate(x => { x.records[0].tier = 2; x.records[0].access = 'YES'; x.records[0].evidence = [{ ...marked(), feature: 'parking' }]; }), 'ACCESS')));
  it('rejects unsupported evidence source', () => assert.ok(has(mutate(x => { x.records[0].tier = 2; x.records[0].access = 'YES'; x.records[0].evidence = [{ ...marked(), sourceId: 'absent' }]; }), 'ACCESS')));
  it('rejects conflicting positive and negative statements', () => assert.ok(has(mutate(x => { x.records[0].tier = 2; x.records[0].access = 'YES'; x.records[0].evidence = [marked(), { ...marked(), access: 'NO' }]; }), 'CONFLICT')));
  it('rejects tier three with only one source', () => assert.ok(has(mutate(x => { x.records[0].tier = 3; x.records[0].access = 'YES'; x.records[0].evidence = [marked(3)]; }), 'TIER')));
  it('accepts tier three with two independent sources', () => assert.equal(run(twoSources()).ok, true));
  it('rejects tier three without matching tier-three evidence', () => assert.ok(has(mutate(x => { x.records[0].tier = 3; x.records[0].access = 'YES'; x.records[0].evidence = [marked(2)]; }), 'TIER')));
  it('rejects unknown access at upper tiers', () => assert.ok(has(mutate(x => { x.records[0].tier = 2; }), 'TIER')));
  it('sorts records by id deterministically', () => {
    const candidate = copy();
    candidate.records.push({ ...candidate.records[0], id: 'archive' });
    const result = run(candidate);
    assert.equal(result.ok, true);
    assert.deepEqual(result.manifest.records.map(x => x.id), ['archive', 'library']);
  });
  it('sorts sourceIds without mutating caller', () => {
    const candidate = twoSources();
    const oldIds = [...candidate.records[0].sourceIds];
    const result = run(candidate);
    assert.equal(result.ok, true);
    assert.deepEqual(candidate.records[0].sourceIds, oldIds);
    assert.deepEqual(result.manifest.records[0].sourceIds, ['city', 'province']);
  });
  it('leaves caller assets untouched', () => {
    const candidate = copy();
    const result = run(candidate);
    assert.equal(result.ok, true);
    assert.deepEqual(candidate, base);
  });
  it('provides bilingual diagnostics', () => {
    const result = run({});
    assert.ok(result.findings.every(x => x.en.length && x.fr.length));
    assert.match(manifestText(result, 'en'), /Package blocked/u);
    assert.match(manifestText(result, 'fr'), /Paquet bloqué/u);
  });
  it('renders successful bilingual reports', () => {
    assert.match(manifestText(run(), 'en'), /Check passed/u);
    assert.match(manifestText(run(), 'fr'), /Contrôle réussi/u);
  });
  it('rejects unsupported report locales', () => assert.throws(() => manifestText(run(), 'es'), RangeError));
  it('includes stable byte totals', () => assert.equal(run().manifest.totalBytes, Buffer.byteLength(payload)));
  it('does not read files from the host filesystem', () => assert.ok(has(run(copy(), {}), 'BYTES')));
  it('rejects null local file table', () => assert.ok(has(run(copy(), null), 'ROOT')));
  it('rejects a source with extra fields', () => assert.ok(has(mutate(x => { x.sources[0].url = 'https://example.org'; }), 'SOURCE')));
  it('rejects a record with extra fields', () => assert.ok(has(mutate(x => { x.records[0].extra = true; }), 'TEXT')));
  it('rejects an asset with extra fields', () => assert.ok(has(mutate(x => { x.assets[0].extra = true; }), 'PATH')));
  it('rejects an evidence item with extra fields', () => assert.ok(has(mutate(x => { x.records[0].tier = 2; x.records[0].access = 'YES'; x.records[0].evidence = [{ ...marked(), extra: true }]; }), 'ACCESS')));
  it('does not silently skip malformed records', () => assert.ok(has(mutate(x => { x.records.push(null); }), 'TEXT')));
  it('does not silently skip malformed assets', () => assert.ok(has(mutate(x => { x.assets.push(null); }), 'PATH')));
  it('does not silently skip malformed sources', () => assert.ok(has(mutate(x => { x.sources.push(null); }), 'SOURCE')));
  it('produces stable ordered diagnostics', () => {
    const candidate = copy();
    candidate.sources[0].licence = 'closed';
    candidate.records[0].fr = '';
    assert.deepEqual(run(candidate).findings, run(candidate).findings);
  });
  it('accepts an empty record and asset list', () => {
    const candidate = copy();
    candidate.records = [];
    candidate.assets = [];
    assert.equal(run(candidate).ok, true);
  });
  it('rejects missing source in empty export only when present', () => {
    const candidate = copy(); candidate.sources = []; candidate.assets = []; candidate.records = [];
    assert.equal(run(candidate).ok, true);
  });
  it('rejects an ODbL source in open export', () => assert.ok(has(mutate(x => { x.sources[0].licence = 'ODbL-1.0'; }), 'SILO')));
  it('accepts a separately labelled ODbL export', () => {
    const candidate = copy(); candidate.silo = 'odbl'; candidate.sources[0].licence = 'ODbL-1.0';
    candidate.assets[0].silo = 'odbl'; candidate.records[0].silo = 'odbl';
    assert.equal(run(candidate).ok, true);
  });
  it('rejects an open-licence source in ODbL-only export', () => assert.ok(has(mutate(x => { x.silo = 'odbl'; x.assets[0].silo = 'odbl'; x.records[0].silo = 'odbl'; }), 'SILO')));
});
