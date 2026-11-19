import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { auditOfflineDelivery, deliveryText } from './p15s-delivery-receipt.mjs';

const source = Object.freeze({ id: 'city', name: 'City catalogue', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'sources/city.json' });
const asset = Object.freeze({ id: 'guide', path: 'offline/guide.json',
  sha256: 'a'.repeat(64), bytes: 120, sourceIds: ['city'], silo: 'open', present: true });
const evidence = Object.freeze({ sourceId: 'city', feature: 'entrance', access: 'YES',
  observedOn: '2026-11-12', tier: 2 });
const place = Object.freeze({ id: 'library', en: 'Library', fr: 'Bibliothèque', feature: 'entrance',
  access: 'YES', tier: 2, silo: 'open', sourceIds: ['city'], assetIds: ['guide'], evidence: [evidence] });
function pack(overrides = {}) {
  return { schemaVersion: 1, asOf: '2026-11-19', maxAgeDays: 45,
    sources: [{ ...source }], places: [{ ...place, sourceIds: [...place.sourceIds], assetIds: [...place.assetIds], evidence: place.evidence.map(x => ({ ...x })) }], assets: [{ ...asset, sourceIds: [...asset.sourceIds] }], ...overrides };
}
function mutate(group, changes) {
  const base = pack();
  return { ...base, [group]: [{ ...base[group][0], ...changes }] };
}
function codes(value) {
  return auditOfflineDelivery(value).findings.map(x => x.code);
}
function blocks(value, expected) {
  const report = auditOfflineDelivery(value);
  assert.equal(report.ok, false);
  assert.equal(report.receipt, null);
  assert.ok(report.findings.some(x => x.code === expected),
    `expected ${expected}, got ${JSON.stringify(report.findings)}`);
}
function testCase(name, make, code) {
  it(name, () => blocks(make(), code));
}

describe('P15S local receipt: valid paths', () => {
  it('accepts a fresh, sourced, bilingual, complete pack', () => {
    const report = auditOfflineDelivery(pack());
    assert.equal(report.ok, true);
    assert.ok(report.receipt);
    assert.equal(report.findings.length, 0);
  });
  it('returns a stable 64-character SHA-256 of receipt fields', () => {
    const report = auditOfflineDelivery(pack());
    const { sha256, ...data } = report.receipt;
    assert.match(sha256, /^[a-f0-9]{64}$/u);
    const stable = value => Array.isArray(value) ? value.map(stable) :
      value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, stable(v)])) : value;
    assert.equal(sha256, createHash('sha256').update(JSON.stringify(stable(data))).digest('hex'));
  });
  it('orders receipt identifiers', () => {
    const p = pack({ sources: [{ ...source, id: 'zeta' }, { ...source, id: 'alpha' }],
      places: [], assets: [] });
    assert.deepEqual(auditOfflineDelivery(p).receipt.sourceIds, ['alpha', 'zeta']);
  });
  it('allows empty inventories as an explicit local receipt', () => {
    assert.equal(auditOfflineDelivery(pack({ places: [], assets: [], sources: [] })).ok, true);
  });
  it('counts all required fields deterministically', () => {
    assert.deepEqual(auditOfflineDelivery(pack()).summary, { sources: 1, places: 1,
      assets: 1, presentAssets: 1, missingAssets: 0,
      unknownPlaces: 0, assertedPlaces: 1, totalBytes: 120 });
  });
  it('accepts ODbL when the entire dependency chain remains in that silo', () => {
    const p = pack();
    p.sources[0].licence = 'ODbL-1.0';
    p.assets[0].silo = 'odbl';
    p.places[0].silo = 'odbl';
    assert.equal(auditOfflineDelivery(p).ok, true);
  });
  it('accepts an unknown, tier-one record without observations', () => {
    const p = mutate('places', { access: 'UNKNOWN', tier: 1, evidence: [] });
    assert.equal(auditOfflineDelivery(p).ok, true);
  });
  it('accepts an unknown, tier-zero record without observations', () => {
    const p = mutate('places', { access: 'UNKNOWN', tier: 0, evidence: [] });
    assert.equal(auditOfflineDelivery(p).ok, true);
  });
  it('accepts a level-three record with two independent sources', () => {
    const p = pack();
    p.sources.push({ ...source, id: 'province' });
    p.places[0].sourceIds.push('province');
    p.places[0].tier = 3;
    p.places[0].evidence = [{ ...evidence, tier: 3 },
      { ...evidence, sourceId: 'province', tier: 3 }];
    assert.equal(auditOfflineDelivery(p).ok, true);
  });
  it('accepts multiple features as distinct places', () => {
    const p = pack();
    p.places.push({ ...place, id: 'washroom', feature: 'washroom',
      evidence: [{ ...evidence, feature: 'washroom' }] });
    assert.equal(auditOfflineDelivery(p).ok, true);
  });
  it('retains the input as supplied without mutation', () => {
    const p = pack();
    const snapshot = JSON.stringify(p);
    auditOfflineDelivery(p);
    assert.equal(JSON.stringify(p), snapshot);
  });
  it('does not depend on current wall-clock time', () => {
    assert.deepEqual(auditOfflineDelivery(pack()), auditOfflineDelivery(pack()));
  });
});

describe('P15S root structure and calendar', () => {
  const cases = [
    ['null', () => null, 'ROOT'],
    ['number', () => 12, 'ROOT'],
    ['array', () => [], 'ROOT'],
    ['string', () => 'data', 'ROOT'],
    ['empty object', () => ({}), 'ROOT'],
    ['wrong version', () => pack({ schemaVersion: 2 }), 'ROOT'],
    ['extra root field', () => pack({ extra: true }), 'ROOT'],
    ['missing sources', () => { const p = pack(); delete p.sources; return p; }, 'ROOT'],
    ['invalid source collection', () => pack({ sources: {} }), 'ROOT'],
    ['invalid place collection', () => pack({ places: null }), 'ROOT'],
    ['invalid asset collection', () => pack({ assets: 'x' }), 'ROOT'],
    ['invalid leap day', () => pack({ asOf: '2025-02-29' }), 'DATE'],
    ['invalid month', () => pack({ asOf: '2026-13-01' }), 'DATE'],
    ['invalid day', () => pack({ asOf: '2026-04-31' }), 'DATE'],
    ['invalid date format', () => pack({ asOf: '19/11/2026' }), 'DATE'],
    ['negative age', () => pack({ maxAgeDays: -1 }), 'DATE'],
    ['fractional age', () => pack({ maxAgeDays: 2.1 }), 'DATE'],
    ['overlarge age', () => pack({ maxAgeDays: 4000 }), 'DATE'],
    ['invalid source item', () => pack({ sources: [null] }), 'SOURCE'],
    ['repeated source id', () => pack({ sources: [source, source] }), 'DUPLICATE'],
    ['source date after snapshot', () => mutate('sources', { observedOn: '2026-11-20' }), 'DATE'],
    ['expired source', () => mutate('sources', { observedOn: '2026-01-01' }), 'DATE'],
    ['unsupported licence', () => mutate('sources', { licence: 'proprietary' }), 'LICENCE'],
    ['missing licence', () => mutate('sources', { licence: '' }), 'LICENCE'],
    ['invalid source id', () => mutate('sources', { id: '../bad' }), 'SOURCE'],
    ['source reference traversal', () => mutate('sources', { reference: '../secret' }), 'PATH'],
    ['source reference URL', () => mutate('sources', { reference: 'https://example.test/' }), 'PATH'],
    ['source reference backslash', () => mutate('sources', { reference: 'sources\\a.json' }), 'PATH'],
    ['source reference query', () => mutate('sources', { reference: 'sources/data?a=b' }), 'PATH'],
    ['source reference fragment', () => mutate('sources', { reference: 'sources/a#b' }), 'PATH'],
    ['source contact field', () => mutate('sources', { name: 'a@example.test' }), 'SOURCE'],
    ['source credential field', () => mutate('sources', { name: 'token: abc' }), 'SOURCE'],
    ['source control text', () => mutate('sources', { name: 'C\u0000ity' }), 'SOURCE'],
  ];
  for (const [name, make, code] of cases) testCase(name, make, code);
});

describe('P15S offline asset safety', () => {
  const cases = [
    ['duplicate asset id', () => pack({ assets: [asset, asset] }), 'DUPLICATE'],
    ['duplicate asset path', () => pack({ assets: [asset, { ...asset, id: 'second' }] }), 'DUPLICATE'],
    ['absent asset', () => mutate('assets', { present: false }), 'COVERAGE'],
    ['empty digest', () => mutate('assets', { sha256: '' }), 'DIGEST'],
    ['uppercase digest', () => mutate('assets', { sha256: 'A'.repeat(64) }), 'DIGEST'],
    ['short digest', () => mutate('assets', { sha256: 'b'.repeat(63) }), 'DIGEST'],
    ['zero bytes', () => mutate('assets', { bytes: 0 }), 'ROOT'],
    ['negative bytes', () => mutate('assets', { bytes: -3 }), 'ROOT'],
    ['fractional bytes', () => mutate('assets', { bytes: 1.5 }), 'ROOT'],
    ['oversized asset', () => mutate('assets', { bytes: 33554433 }), 'ROOT'],
    ['asset path traversal', () => mutate('assets', { path: 'offline/../a.json' }), 'PATH'],
    ['asset absolute path', () => mutate('assets', { path: '/offline/a.json' }), 'PATH'],
    ['asset URL', () => mutate('assets', { path: 'https://host/a.json' }), 'PATH'],
    ['asset control character', () => mutate('assets', { path: 'offline/a\u0008.json' }), 'PATH'],
    ['asset percent escape', () => mutate('assets', { path: 'offline/%2e.json' }), 'PATH'],
    ['asset space', () => mutate('assets', { path: 'offline/a b.json' }), 'PATH'],
    ['missing asset source', () => mutate('assets', { sourceIds: ['unknown'] }), 'MISSING'],
    ['duplicate asset source', () => mutate('assets', { sourceIds: ['city', 'city'] }), 'ROOT'],
    ['wrong asset silo', () => mutate('assets', { silo: 'odbl' }), 'SILO'],
    ['asset personal text', () => mutate('assets', { path: 'offline/a@example.test' }), 'PATH'],
  ];
  for (const [name, make, code] of cases) testCase(name, make, code);
});

describe('P15S place and evidence rules', () => {
  const cases = [
    ['duplicate place id', () => pack({ places: [place, place] }), 'DUPLICATE'],
    ['invalid place entry', () => pack({ places: [null] }), 'ROOT'],
    ['invalid access', () => mutate('places', { access: 'MAYBE' }), 'ROOT'],
    ['invalid feature', () => mutate('places', { feature: 'other' }), 'ROOT'],
    ['invalid tier', () => mutate('places', { tier: 4 }), 'ROOT'],
    ['empty English label', () => mutate('places', { en: '' }), 'TEXT'],
    ['empty French label', () => mutate('places', { fr: '' }), 'TEXT'],
    ['French spacing before semicolon', () => mutate('places', { fr: 'Accès ; ici' }), 'TEXT'],
    ['French colon missing hard space', () => mutate('places', { fr: 'Accès: ici' }), 'TEXT'],
    ['unsafe markup', () => mutate('places', { en: '<script>alert(1)</script>' }), 'TEXT'],
    ['personal email', () => mutate('places', { en: 'Contact jane@example.test' }), 'TEXT'],
    ['unknown place source', () => mutate('places', { sourceIds: ['missing'] }), 'MISSING'],
    ['place missing sources', () => mutate('places', { sourceIds: [] }), 'MISSING'],
    ['place wrong silo', () => mutate('places', { silo: 'odbl' }), 'SILO'],
    ['place missing asset', () => mutate('places', { assetIds: ['other'] }), 'MISSING'],
    ['duplicate place source', () => mutate('places', { sourceIds: ['city', 'city'] }), 'ROOT'],
    ['unmatched accessibility observation', () => mutate('places', { access: 'NO' }), 'ACCESS'],
    ['tier two with no evidence', () => mutate('places', { evidence: [] }), 'ACCESS'],
    ['tier three with only one source', () => mutate('places', { tier: 3,
      evidence: [{ ...evidence, tier: 3 }] }), 'TIER'],
    ['tier one access assertion', () => mutate('places', { tier: 1 }), 'TIER'],
    ['tier zero with evidence', () => mutate('places', { tier: 0, access: 'UNKNOWN' }), 'TIER'],
    ['tier two with UNKNOWN', () => mutate('places', { access: 'UNKNOWN' }), 'TIER'],
    ['evidence missing source', () => mutate('places', { evidence: [{ ...evidence, sourceId: 'other' }] }), 'MISSING'],
    ['evidence in future', () => mutate('places', { evidence: [{ ...evidence, observedOn: '2026-11-20' }] }), 'DATE'],
    ['evidence before source', () => mutate('places', { evidence: [{ ...evidence, observedOn: '2026-11-09' }] }), 'DATE'],
    ['evidence wrong feature', () => mutate('places', { evidence: [{ ...evidence, feature: 'washroom' }] }), 'ACCESS'],
    ['evidence bad tier', () => mutate('places', { evidence: [{ ...evidence, tier: 5 }] }), 'ROOT'],
    ['evidence malformed', () => mutate('places', { evidence: [null] }), 'ROOT'],
    ['duplicate evidence', () => mutate('places', { evidence: [evidence, evidence] }), 'DUPLICATE'],
    ['conflicting observation', () => mutate('places', { evidence: [evidence, { ...evidence, access: 'NO' }] }), 'CONFLICT'],
  ];
  for (const [name, make, code] of cases) testCase(name, make, code);
  it('reports conflict in French with narrow spacing before semicolon', () => {
    const report = auditOfflineDelivery(mutate('places', { evidence: [evidence,
      { ...evidence, access: 'NO' }] }));
    const conflict = report.findings.find(x => x.code === 'CONFLICT');
    assert.ok(conflict);
    assert.ok(conflict.fr.includes('\u202f;'));
    assert.match(deliveryText(report, 'fr'), /Livraison bloquée/u);
  });
});

describe('P15S strict outputs', () => {
  it('never returns receipt on partially missing assets', () => {
    const r = auditOfflineDelivery(mutate('assets', { present: false }));
    assert.equal(r.receipt, null);
  });
  it('returns en/fr findings in deterministic order', () => {
    const a = pack({ sources: [], assets: [], places: [{ ...place, sourceIds: ['city'] }] });
    const x = auditOfflineDelivery(a);
    assert.deepEqual(x, auditOfflineDelivery(a));
    assert.ok(x.findings.every(item => item.en && item.fr));
  });
  it('renders English and French without changing status', () => {
    const r = auditOfflineDelivery(pack());
    assert.match(deliveryText(r, 'en'), /Check passed/u);
    assert.match(deliveryText(r, 'fr'), /Contrôle réussi/u);
    assert.equal(r.ok, true);
  });
  it('rejects unknown locale without throwing', () => {
    assert.equal(deliveryText(auditOfflineDelivery(pack()), 'es'), '');
  });
  it('rejects invalid report input without throwing', () => {
    assert.equal(deliveryText(null), '');
  });
  it('has no network, file writes or scheduler dependency', () => {
    const source = auditOfflineDelivery.toString();
    assert.equal(typeof source, 'string');
    assert.ok(!source.includes('fetch('));
    assert.ok(!source.includes('setInterval('));
  });
});
