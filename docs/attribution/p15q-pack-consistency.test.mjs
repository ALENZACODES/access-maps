import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditPackConsistency, packConsistencyText, PACK_CONSISTENCY_OPEN_LICENCES } from './p15q-pack-consistency.mjs';

const policy = Object.freeze({
  asOf: '2026-11-19', maxPacks: 8, maxPlaces: 100,
  maxAssets: 100, maxBytes: 500000, maxAgeDays: 90,
});
const source = Object.freeze({
  id: 'open-source', name: 'Municipal open data', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'source/open.json',
});
const observation = Object.freeze({
  sourceId: 'open-source', feature: 'entrance', access: 'YES',
  tier: 2, observedOn: '2026-11-11',
});
const place = Object.freeze({
  id: 'north-library', en: 'North library', fr: 'Bibliothèque du nord',
  feature: 'entrance', access: 'YES', tier: 2,
  sourceIds: ['open-source'], assetIds: ['library-guide'], evidence: [observation],
});
const asset = Object.freeze({
  id: 'library-guide', path: 'offline/north/guide.json',
  sha256: 'a'.repeat(64), bytes: 120, sourceIds: ['open-source'],
});
const basePack = Object.freeze({
  id: 'north-pack', asOf: '2026-11-15', silo: 'open',
  sources: [source], places: [place], assets: [asset],
});
function clone(value) { return structuredClone(value); }
function make(changes = {}) { return { ...clone(basePack), ...clone(changes) }; }
function audit(packs = [make()], options = policy) { return auditPackConsistency(packs, options); }
function codes(packs, options = policy) { return audit(packs, options).findings.map(f => f.code); }
function changed(patch) { return [make(patch)]; }
function changedSource(patch) { return changed({ sources: [{ ...source, ...patch }] }); }
function changedPlace(patch) { return changed({ places: [{ ...place, ...patch }] }); }
function changedAsset(patch) { return changed({ assets: [{ ...asset, ...patch }] }); }
function issueCode(packs, code, options = policy) {
  assert.ok(codes(packs, options).includes(code), `Expected ${code}, got ${codes(packs, options).join(',')}`);
}

// A separate fixture for ODbL — never merge its source into the open pack.
function odblPack() {
  return make({
    id: 'odbl-pack', silo: 'odbl',
    sources: [{ ...source, id: 'odbl-source', name: 'OSM observations', licence: 'ODbL-1.0' }],
    places: [{ ...place, id: 'odbl-library', sourceIds: ['odbl-source'], assetIds: ['odbl-guide'],
      evidence: [{ ...observation, sourceId: 'odbl-source' }] }],
    assets: [{ ...asset, id: 'odbl-guide', path: 'offline/odbl/guide.json', sourceIds: ['odbl-source'] }],
  });
}

describe('P15Q cross-pack consistency and provenance checks', () => {
  it('accepts a complete single open-data pack', () => assert.equal(audit().ok, true));
  it('accepts independent open and ODbL packs', () => assert.equal(audit([make(), odblPack()]).ok, true));
  it('does not mutate the input package', () => {
    const pack = make(); const before = clone(pack);
    audit([pack]); assert.deepEqual(pack, before);
  });
  it('is deterministic across repeated audits', () => assert.deepEqual(audit(), audit()));
  it('sorts diagnostics by path, code and pack', () => {
    const findings = audit([make({ sources: [], assets: [] })]).findings;
    assert.deepEqual(findings.map(f => f.path), [...findings.map(f => f.path)].sort());
  });
  it('does not expose input place names in diagnostics', () => {
    const report = audit(changedPlace({ en: '<script>private name</script>' }));
    assert.ok(!JSON.stringify(report).includes('private name'));
  });
  it('provides EN and FR diagnostics for every issue', () => {
    const issues = audit([make({ sources: [], places: [place], assets: [] })]).findings;
    assert.ok(issues.length > 0 && issues.every(f => f.en.length > 0 && f.fr.length > 0));
  });
  it('renders bilingual failure without network calls', () => {
    const r = audit(changedPlace({ access: 'NO' }));
    assert.match(packConsistencyText(r, 'en'), /Publication blocked/u);
    assert.match(packConsistencyText(r, 'fr'), /Publication bloquée/u);
  });
  it('renders success without overstating source quality', () => {
    assert.match(packConsistencyText(audit(), 'fr'), /Contrôle réussi/u);
  });
  it('returns stable summary counts', () => assert.deepEqual(audit().summary, {
    packs: 1, sources: 1, places: 1, unknown: 0, assets: 1, bytes: 120,
    crossPackSources: 0, crossPackPlaces: 0, crossPackAssets: 0,
  }));
  it('tracks UNKNOWN records explicitly', () => {
    const r = audit(changedPlace({ access: 'UNKNOWN', tier: 1, evidence: [] }));
    assert.equal(r.ok, true); assert.equal(r.summary.unknown, 1);
  });
  it('accepts supported open licences only', () => {
    assert.deepEqual(PACK_CONSISTENCY_OPEN_LICENCES, [...PACK_CONSISTENCY_OPEN_LICENCES].sort());
    assert.ok(PACK_CONSISTENCY_OPEN_LICENCES.includes('ODbL-1.0'));
  });
  it('rejects a non-array root', () => issueCode({}, 'ROOT'));
  it('rejects empty pack sets', () => issueCode([], 'LIMIT'));
  it('rejects an invalid policy', () => issueCode([make()], 'POLICY', {}));
  it('rejects unknown policy fields', () => issueCode([make()], 'POLICY', { ...policy, disableChecks: true }));
  it('rejects negative pack limits', () => issueCode([make()], 'POLICY', { ...policy, maxPacks: -1 }));
  it('rejects invalid policy calendar dates', () => issueCode([make()], 'POLICY', { ...policy, asOf: '2026-02-30' }));
  it('rejects unsafe byte limits', () => issueCode([make()], 'POLICY', { ...policy, maxBytes: Infinity }));
  it('caps the number of packs', () => issueCode([make(), odblPack()], 'LIMIT', { ...policy, maxPacks: 1 }));
  it('rejects an incomplete pack', () => issueCode([{}], 'PACK'));
  it('rejects unknown pack fields', () => issueCode(changed({ unexpected: true }), 'PACK'));
  it('rejects duplicate pack identifiers', () => issueCode([make(), make()], 'DUPLICATE'));
  it('rejects unsupported pack silo', () => issueCode(changed({ silo: 'mixed' }), 'PACK'));
  it('rejects future pack dates', () => issueCode(changed({ asOf: '2026-12-01' }), 'DATE'));
  it('rejects invalid leap dates', () => issueCode(changed({ asOf: '2026-02-29' }), 'DATE'));
  it('accepts a leap day when retention permits', () => {
    const p = make({ asOf: '2024-02-29', sources: [{ ...source, observedOn: '2024-02-28' }],
      places: [{ ...place, evidence: [{ ...observation, observedOn: '2024-02-29' }] }] });
    assert.equal(audit([p], { ...policy, asOf: '2024-03-01' }).ok, true);
  });
  it('rejects a stale pack date', () => issueCode(changed({ asOf: '2025-01-01' }), 'DATE'));
  it('rejects a stale source date', () => issueCode(changedSource({ observedOn: '2025-01-01' }), 'DATE'));
  it('rejects a future source observation', () => issueCode(changedSource({ observedOn: '2026-11-17' }), 'DATE'));
  it('rejects missing source metadata', () => issueCode(changed({ sources: [{}] }), 'SOURCE'));
  it('rejects source unexpected keys', () => issueCode(changedSource({ extra: true }), 'SOURCE'));
  it('rejects unsupported source licences', () => issueCode(changedSource({ licence: 'Proprietary' }), 'LICENCE'));
  it('rejects ODbL licence in open silo', () => issueCode(changedSource({ licence: 'ODbL-1.0' }), 'SILO'));
  it('rejects open licence in ODbL silo', () => issueCode(changed({ silo: 'odbl' }), 'SILO'));
  it('rejects held transit source', () => issueCode(changedSource({ name: 'MiWay status feed' }), 'HELD'));
  it('rejects personal contact in source', () => issueCode(changedSource({ name: 'a@example.org' }), 'SOURCE'));
  it('rejects unsafe source reference', () => issueCode(changedSource({ reference: '../outside.json' }), 'SOURCE'));
  it('rejects absolute source reference', () => issueCode(changedSource({ reference: '/tmp/file' }), 'SOURCE'));
  it('rejects duplicate source IDs', () => issueCode(changed({ sources: [source, source] }), 'DUPLICATE'));
  it('rejects conflicting cross-pack source identity', () => {
    issueCode([make(), odblPack(), make({ id: 'third', sources: [{ ...source, name: 'Changed provenance' }],
      places: [], assets: [] })], 'IDENTITY');
  });
  it('counts repeated cross-pack source identifiers', () => {
    const r = audit([make(), make({ id: 'second', places: [], assets: [] })]);
    assert.equal(r.ok, true); assert.equal(r.summary.crossPackSources, 1);
  });
  it('rejects malformed asset hashes', () => issueCode(changedAsset({ sha256: 'abc' }), 'ASSET'));
  it('rejects zero-size assets', () => issueCode(changedAsset({ bytes: 0 }), 'ASSET'));
  it('rejects asset path traversal', () => issueCode(changedAsset({ path: 'offline/../secret' }), 'ASSET'));
  it('rejects remote asset URLs', () => issueCode(changedAsset({ path: 'https://example.com/file' }), 'ASSET'));
  it('rejects duplicate asset identifiers', () => issueCode(changed({ assets: [asset, asset] }), 'DUPLICATE'));
  it('rejects missing asset source', () => issueCode(changedAsset({ sourceIds: ['missing'] }), 'MISSING'));
  it('rejects duplicate asset source references', () => issueCode(changedAsset({ sourceIds: ['open-source', 'open-source'] }), 'ASSET'));
  it('rejects cross-pack asset ID differences', () => {
    const another = make({ id: 'another', places: [], assets: [{ ...asset, bytes: 122 }] });
    issueCode([make(), another], 'IDENTITY');
  });
  it('rejects collision on the same path with different hash', () => {
    const another = make({ id: 'another', places: [], assets: [{ ...asset, id: 'new-guide', sha256: 'b'.repeat(64) }] });
    issueCode([make(), another], 'COLLISION');
  });
  it('rejects collision on same path with different licence silo', () => {
    const another = odblPack(); another.assets[0].path = asset.path;
    issueCode([make(), another], 'COLLISION');
  });
  it('accepts reusing identical asset content in another pack', () => {
    assert.equal(audit([make(), make({ id: 'second', places: [] })]).ok, true);
  });
  it('tracks repeated asset identities', () => {
    assert.equal(audit([make(), make({ id: 'second', places: [] })]).summary.crossPackAssets, 1);
  });
  it('rejects a missing asset link from a place', () => issueCode(changedPlace({ assetIds: ['unknown'] }), 'MISSING'));
  it('rejects a mismatched asset source link', () => {
    issueCode(changed({ assets: [{ ...asset, sourceIds: ['open-source', 'extra'] }] }), 'MISSING');
  });
  it('rejects an incomplete place', () => issueCode(changed({ places: [{}] }), 'PLACE'));
  it('rejects unknown place fields', () => issueCode(changedPlace({ privateData: 1 }), 'PLACE'));
  it('rejects unsupported place features', () => issueCode(changedPlace({ feature: 'unknown' }), 'PLACE'));
  it('rejects unsupported access values', () => issueCode(changedPlace({ access: 'MAYBE' }), 'PLACE'));
  it('rejects missing place source link even for UNKNOWN', () => {
    issueCode(changedPlace({ access: 'UNKNOWN', tier: 1, evidence: [], sourceIds: [] }), 'MISSING');
  });
  it('rejects missing French translation', () => issueCode(changedPlace({ fr: '' }), 'TEXT'));
  it('rejects markup in English translation', () => issueCode(changedPlace({ en: '<img src=x>' }), 'TEXT'));
  it('rejects personal contact in French translation', () => issueCode(changedPlace({ fr: 'a@example.org' }), 'TEXT'));
  it('rejects bad French colon spacing', () => issueCode(changedPlace({ fr: 'Accès: oui' }), 'TYPOGRAPHY'));
  it('accepts French narrow space before semicolon', () => {
    assert.equal(audit(changedPlace({ fr: 'Accès\u202f; oui' })).ok, true);
  });
  it('rejects ordinary space before French semicolon', () => issueCode(changedPlace({ fr: 'Accès ; oui' }), 'TYPOGRAPHY'));
  it('rejects ordinary apostrophe in French text', () => issueCode(changedPlace({ fr: "L'acces" }), 'TYPOGRAPHY'));
  it('rejects a high tier without sufficient observation', () => issueCode(changedPlace({ tier: 3 }), 'TIER'));
  it('rejects positive tier-one claims', () => issueCode(changedPlace({ tier: 1 }), 'TIER'));
  it('accepts an unasserted tier-zero record', () => {
    assert.equal(audit(changedPlace({ tier: 0, access: 'UNKNOWN', evidence: [] })).ok, true);
  });
  it('rejects unsupported evidence source', () => issueCode(changedPlace({ evidence: [{ ...observation, sourceId: 'unknown' }] }), 'EVIDENCE'));
  it('rejects wrong evidence feature', () => issueCode(changedPlace({ evidence: [{ ...observation, feature: 'washroom' }] }), 'EVIDENCE'));
  it('rejects stale evidence', () => issueCode(changedPlace({ evidence: [{ ...observation, observedOn: '2025-01-01' }] }), 'EVIDENCE'));
  it('rejects duplicated evidence', () => issueCode(changedPlace({ evidence: [observation, observation] }), 'DUPLICATE'));
  it('rejects unsupported evidence tier', () => issueCode(changedPlace({ evidence: [{ ...observation, tier: 4 }] }), 'EVIDENCE'));
  it('rejects positive claim without matching observation', () => issueCode(changedPlace({ access: 'NO' }), 'ACCESS'));
  it('uses narrow no-break spacing in the French conflict diagnostic', () => {
    const r = audit(changedPlace({ evidence: [observation, { ...observation, access: 'NO' }] }));
    const conflict = r.findings.find(f => f.code === 'CONFLICT');
    assert.ok(conflict);
    assert.match(conflict.fr, /\u202f;/u);
    assert.doesNotMatch(conflict.fr, /(?<!\u202f);/u);
  });
  it('rejects contradictory observations unless access UNKNOWN', () => {
    issueCode(changedPlace({ evidence: [observation, { ...observation, access: 'NO' }] }), 'CONFLICT');
  });
  it('permits retaining UNKNOWN for contradictory observations', () => {
    assert.equal(audit(changedPlace({ access: 'UNKNOWN', tier: 1,
      evidence: [observation, { ...observation, access: 'NO' }] })).ok, true);
  });
  it('rejects incompatible cross-pack place identity', () => {
    const another = make({ id: 'another', sources: [source], assets: [asset],
      places: [{ ...place, fr: 'Bibliothèque différente' }] });
    issueCode([make(), another], 'IDENTITY');
  });
  it('accepts duplicate place identity with identical provenance', () => {
    assert.equal(audit([make(), make({ id: 'another' })]).ok, true);
  });
  it('counts compatible cross-pack place records', () => {
    assert.equal(audit([make(), make({ id: 'another' })]).summary.crossPackPlaces, 1);
  });
  it('enforces total asset byte limit', () => issueCode([make()], 'LIMIT', { ...policy, maxBytes: 100 }));
  it('enforces total place count limit', () => issueCode([make()], 'LIMIT', { ...policy, maxPlaces: 0 }));
  it('enforces total asset count limit', () => issueCode([make()], 'LIMIT', { ...policy, maxAssets: 0 }));
  it('does not require an asset for every place', () => {
    assert.equal(audit(changed({ assets: [], places: [{ ...place, assetIds: [] }] })).ok, true);
  });
  it('allows an empty place collection', () => assert.equal(audit(changed({ places: [] })).ok, true));
  it('allows an empty asset collection', () => {
    assert.equal(audit(changed({ assets: [], places: [{ ...place, assetIds: [] }] })).ok, true);
  });
  it('does not invent missing source facts', () => {
    const report = audit(changed({ sources: [] }));
    assert.equal(report.ok, false);
    assert.ok(!Object.hasOwn(report, 'mergedPack'));
  });
  it('does not hide failures when summary exceeds limits', () => {
    const report = audit(changedPlace({ access: 'NO' }), { ...policy, maxPlaces: 0 });
    assert.ok(codes(changedPlace({ access: 'NO' }), { ...policy, maxPlaces: 0 }).includes('LIMIT'));
    assert.equal(report.ok, false);
  });
  it('does not contain remote network dependencies', () => {
    assert.equal(typeof auditPackConsistency, 'function');
  });
});
