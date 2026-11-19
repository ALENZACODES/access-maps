import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { auditOfflineAssetBytes, assetByteReportText } from './p15t-asset-bytes.mjs';

const DATA = Buffer.from('{"status":"UNKNOWN"}', 'utf8');
const DIGEST = createHash('sha256').update(DATA).digest('hex');
const SOURCE = Object.freeze({ id: 'city-data', name: 'Municipal open data',
  licence: 'OGL-ON-1.0', observedOn: '2026-11-12', reference: 'sources/city.json' });
const ASSET = Object.freeze({ id: 'local-guide', path: 'offline/guide.json',
  en: 'Offline access guide', fr: 'Guide d’accès hors ligne', sha256: DIGEST,
  bytes: DATA.length, sourceIds: ['city-data'], silo: 'open' });
function fixture(changes = {}) {
  return { schemaVersion: 1, asOf: '2026-11-19', sources: [{ ...SOURCE }],
    assets: [{ ...ASSET }], ...changes };
}
function payload(id = 'local-guide', contents = DATA) {
  return new Map([[id, contents]]);
}
function audit(inventory = fixture(), entries = payload(), policy) {
  return auditOfflineAssetBytes(inventory, entries, policy);
}
function codes(result) { return result.findings.map((item) => item.code); }
function assetChange(changes) { return fixture({ assets: [{ ...ASSET, ...changes }] }); }
function sourceChange(changes) { return fixture({ sources: [{ ...SOURCE, ...changes }] }); }
function failing(inventory, expected, bytes = payload(), policy) {
  const result = audit(inventory, bytes, policy);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes(expected), `${expected} not found in ${codes(result).join(',')}`);
  return result;
}

describe('P15T in-memory asset-byte gate', () => {
  it('accepts matching source, asset and supplied bytes', () => {
    const result = audit();
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
  });
  it('provides deterministic summary counters', () => {
    assert.deepEqual(audit().summary, { sources: 1, assets: 1, matched: 1,
      declaredBytes: DATA.length, suppliedBytes: DATA.length });
  });
  it('accepts Uint8Array instead of Buffer', () => {
    assert.equal(audit(fixture(), payload('local-guide', new Uint8Array(DATA))).ok, true);
  });
  it('handles an empty, well formed manifest', () => {
    assert.equal(audit(fixture({ sources: [], assets: [] }), new Map()).ok, true);
  });
  it('keeps diagnostics free of supplied payloads', () => {
    const secretlike = Buffer.from('some private payload');
    const report = failing(fixture(), 'DIGEST', payload('local-guide', secretlike));
    assert.equal(JSON.stringify(report).includes(secretlike.toString()), false);
  });
  it('does not mutate the inventory', () => {
    const inv = fixture();
    const orig = structuredClone(inv);
    audit(inv);
    assert.deepEqual(inv, orig);
  });
  it('does not mutate supplied bytes', () => {
    const bytes = payload();
    const before = Buffer.from(bytes.get('local-guide'));
    audit(fixture(), bytes);
    assert.deepEqual(bytes.get('local-guide'), before);
  });
  it('prints English success', () => {
    assert.match(assetByteReportText(audit()), /^Asset check passed\n$/u);
  });
  it('prints French success', () => {
    assert.match(assetByteReportText(audit(), 'fr'), /^Contrôle des fichiers réussi\n$/u);
  });
  it('prints English failure', () => {
    assert.match(assetByteReportText(failing(fixture(), 'MISSING', new Map())), /^Asset check blocked/u);
  });
  it('prints French failure', () => {
    assert.match(assetByteReportText(failing(fixture(), 'MISSING', new Map()), 'fr'), /^Contrôle des fichiers bloqué/u);
  });
  it('does not return raw bytes or typed arrays', () => {
    assert.equal(JSON.stringify(audit()).includes('"data"'), false);
  });
});

describe('P15T root and date checks', () => {
  const invalidRoots = [null, undefined, '', [], 10, {}, { schemaVersion: 2 },
    { schemaVersion: 1, asOf: '2026-11-19', sources: {}, assets: [] },
    { ...fixture(), extra: true }];
  for (const [index, value] of invalidRoots.entries()) {
    it(`rejects invalid root shape ${index + 1}`, () => {
      const result = auditOfflineAssetBytes(value, payload());
      assert.equal(result.ok, false);
      assert.ok(codes(result).includes('ROOT'));
    });
  }
  for (const date of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01',
    '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01', 'invalid']) {
    it(`rejects invalid inventory date ${date}`, () => failing(fixture({ asOf: date }), 'DATE'));
  }
  it('accepts real leap-day dates with matching retention', () => {
    const inv = fixture({ asOf: '2024-02-29', sources: [{ ...SOURCE, observedOn: '2024-02-29' }] });
    assert.equal(audit(inv).ok, true);
  });
  it('blocks a future source date', () => failing(sourceChange({ observedOn: '2026-11-20' }), 'FUTURE'));
  it('blocks stale sources', () => failing(sourceChange({ observedOn: '2024-11-12' }), 'STALE'));
  it('permits a zero-day retention window for same-day observation', () => {
    const inv = fixture({ sources: [{ ...SOURCE, observedOn: '2026-11-19' }] });
    assert.equal(audit(inv, payload(), { maxAssetBytes: 1024, maxTotalBytes: 4096,
      maxAgeDays: 0 }).ok, true);
  });
  it('blocks an observation one day old under zero-day retention', () => {
    failing(fixture(), 'STALE', payload(), { maxAssetBytes: 1024,
      maxTotalBytes: 4096, maxAgeDays: 0 });
  });
});

describe('P15T source provenance and licence boundaries', () => {
  for (const licence of ['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0']) {
    it(`accepts open licence ${licence}`, () => {
      assert.equal(audit(sourceChange({ licence })).ok, true);
    });
  }
  for (const licence of ['', 'private', 'proprietary', null, 'ODC-BY', 'GPL-3.0']) {
    it(`blocks unsuitable licence ${String(licence)}`, () => failing(sourceChange({ licence }), 'LICENCE'));
  }
  it('accepts an ODbL source in the separate ODbL export', () => {
    const inv = sourceChange({ licence: 'ODbL-1.0' });
    inv.assets[0].silo = 'odbl';
    assert.equal(audit(inv).ok, true);
  });
  it('blocks ODbL source when asset is in open export', () => {
    failing(sourceChange({ licence: 'ODbL-1.0' }), 'SILO');
  });
  it('blocks open source when asset is in ODbL export', () => {
    failing(assetChange({ silo: 'odbl' }), 'SILO');
  });
  it('blocks missing source references', () => failing(assetChange({ sourceIds: ['missing'] }), 'SOURCE_LINK'));
  it('blocks repeated source IDs', () => failing(fixture({ sources: [{ ...SOURCE }, { ...SOURCE }] }), 'DUPLICATE'));
  it('blocks repeated asset source IDs', () => failing(assetChange({ sourceIds: ['city-data', 'city-data'] }), 'ASSET'));
  it('blocks source without attribution name', () => failing(sourceChange({ name: '' }), 'SOURCE'));
  it('blocks source with unsafe reference', () => failing(sourceChange({ reference: '../source.json' }), 'SOURCE'));
  it('blocks source with personal contact in title', () => failing(sourceChange({ name: 'person@example.com' }), 'SOURCE'));
  it('blocks source with script element in title', () => failing(sourceChange({ name: '<script>' }), 'SOURCE'));
  it('blocks invalid source observation date', () => failing(sourceChange({ observedOn: '2026-02-30' }), 'DATE'));
  it('blocks an unexpected source property', () => failing(sourceChange({ extra: true }), 'SOURCE'));
  it('blocks a missing source identifier', () => failing(sourceChange({ id: '' }), 'SOURCE'));
  it('blocks invalid case for identifiers', () => failing(sourceChange({ id: 'City-Data' }), 'SOURCE'));
  it('blocks a missing source collection', () => failing(fixture({ sources: undefined }), 'ROOT'));
});

describe('P15T path, text, and metadata checks', () => {
  for (const path of ['../outside.json', '/absolute.json', 'offline\\win.json',
    'offline//empty.json', 'offline/./file.json', 'offline/.hidden',
    'offline/file?query=1', 'offline/file#hash', 'offline/file%20.json',
    'offline/file:scheme', 'offline/file\u0000name', 'offline/file\nname']) {
    it(`blocks unsafe path ${JSON.stringify(path)}`, () => failing(assetChange({ path }), 'PATH'));
  }
  it('rejects zero-byte declaration', () => failing(assetChange({ bytes: 0 }), 'ASSET'));
  it('rejects fractional byte declaration', () => failing(assetChange({ bytes: 1.5 }), 'ASSET'));
  it('rejects negative byte declaration', () => failing(assetChange({ bytes: -2 }), 'ASSET'));
  it('rejects missing SHA-256', () => failing(assetChange({ sha256: '' }), 'ASSET'));
  it('rejects uppercase SHA-256', () => failing(assetChange({ sha256: DIGEST.toUpperCase() }), 'ASSET'));
  it('rejects wrong-length SHA-256', () => failing(assetChange({ sha256: 'a'.repeat(63) }), 'ASSET'));
  it('rejects missing English title', () => failing(assetChange({ en: '' }), 'ASSET'));
  it('rejects missing French title', () => failing(assetChange({ fr: '' }), 'ASSET'));
  it('rejects unsafe title HTML', () => failing(assetChange({ en: '<script>' }), 'ASSET'));
  it('rejects French colon without nonbreaking space', () => failing(assetChange({ fr: 'Guide: local' }), 'ASSET'));
  it('accepts French colon with nonbreaking space', () => {
    assert.equal(audit(assetChange({ fr: 'Guide\u00a0: local' })).ok, true);
  });
  it('rejects French semicolon without narrow nonbreaking space', () => {
    failing(assetChange({ fr: 'Guide; local' }), 'ASSET');
  });
  it('accepts French semicolon with narrow nonbreaking space', () => {
    assert.equal(audit(assetChange({ fr: 'Guide\u202f; local' })).ok, true);
  });
  it('rejects unsafe local description copy', () => failing(assetChange({ en: 'real-time guaranteed' }), 'ASSET'));
  it('rejects repeated paths', () => {
    failing(fixture({ assets: [{ ...ASSET }, { ...ASSET, id: 'another' }] }), 'DUPLICATE');
  });
  it('rejects repeated asset IDs', () => {
    failing(fixture({ assets: [{ ...ASSET }, { ...ASSET, path: 'offline/another.json' }] }), 'DUPLICATE');
  });
  it('rejects unexpected asset property', () => failing(assetChange({ extraneous: 1 }), 'ASSET'));
});

describe('P15T actual byte integrity', () => {
  it('blocks missing bytes', () => failing(fixture(), 'MISSING', new Map()));
  it('blocks undeclared bytes', () => failing(fixture(), 'EXTRA', new Map([['other', DATA]])));
  it('blocks a non-byte-array value', () => failing(fixture(), 'BYTE_TYPE', payload('local-guide', 'text')));
  it('blocks a plain numeric array', () => failing(fixture(), 'BYTE_TYPE', payload('local-guide', [1, 2, 3])));
  it('blocks an ArrayBuffer value', () => failing(fixture(), 'BYTE_TYPE', payload('local-guide', DATA.buffer)));
  it('blocks size mismatch', () => failing(assetChange({ bytes: DATA.length + 1 }), 'SIZE'));
  it('blocks digest mismatch with same byte count', () => {
    const different = Buffer.from(DATA);
    different[0] ^= 1;
    failing(fixture(), 'DIGEST', payload('local-guide', different));
  });
  it('blocks a declared digest not matching actual bytes', () => {
    failing(assetChange({ sha256: 'a'.repeat(64) }), 'DIGEST');
  });
  it('accepts multiple assets with correct bytes', () => {
    const another = Buffer.from('Second local file');
    const assets = [{ ...ASSET }, { ...ASSET, id: 'other-file', path: 'offline/second.txt',
      bytes: another.length, sha256: createHash('sha256').update(another).digest('hex') }];
    const result = audit(fixture({ assets }), new Map([['local-guide', DATA], ['other-file', another]]));
    assert.equal(result.ok, true);
    assert.equal(result.summary.matched, 2);
  });
  it('does not falsely match a second asset by hash only', () => {
    const assets = [{ ...ASSET }, { ...ASSET, id: 'other-file', path: 'offline/second.txt' }];
    failing(fixture({ assets }), 'MISSING');
  });
});

describe('P15T fail-closed allocation and policy', () => {
  it('rejects non-map supplied content', () => failing(fixture(), 'ROOT', {}));
  for (const policy of [null, {}, { maxAssetBytes: 0, maxTotalBytes: 4096, maxAgeDays: 10 },
    { maxAssetBytes: 1024, maxTotalBytes: -1, maxAgeDays: 10 },
    { maxAssetBytes: 1024, maxTotalBytes: 4096, maxAgeDays: 4000 },
    { maxAssetBytes: 1024, maxTotalBytes: 4096, maxAgeDays: 10, extra: true }]) {
    it('blocks invalid resource policy', () => failing(fixture(), 'POLICY', payload(), policy));
  }
  it('blocks declared asset larger than resource policy', () => {
    failing(fixture(), 'LIMIT', payload(), { maxAssetBytes: 4, maxTotalBytes: 100,
      maxAgeDays: 365 });
  });
  it('blocks actual asset larger than resource policy', () => {
    failing(assetChange({ bytes: 3 }), 'LIMIT', payload(),
      { maxAssetBytes: 4, maxTotalBytes: 100, maxAgeDays: 365 });
  });
  it('blocks declared total above budget', () => {
    failing(fixture(), 'LIMIT', payload(), { maxAssetBytes: 1024,
      maxTotalBytes: 4, maxAgeDays: 365 });
  });
  it('blocks extra unexpected input under otherwise valid inventory', () => {
    failing(fixture(), 'EXTRA', new Map([['local-guide', DATA], ['unexpected', Buffer.from('x')]]));
  });
  it('reports bilingual, deterministic ordered diagnostics', () => {
    const inv = fixture({ assets: [{ ...ASSET, id: 'z-name', path: 'offline/one.json' },
      { ...ASSET, id: 'a-name', path: 'offline/two.json' }] });
    const one = audit(inv, new Map());
    assert.deepEqual(one, audit(inv, new Map()));
    assert.ok(one.findings.every((item) => item.en.length > 0 && item.fr.length > 0));
    assert.ok(one.findings[0].path.localeCompare(one.findings[1].path, 'en') <= 0);
  });
  it('rejects an invalid printable report', () => {
    assert.throws(() => assetByteReportText({}, 'en'), TypeError);
  });
  it('rejects an unsupported display language', () => {
    assert.throws(() => assetByteReportText(audit(), 'xx'), TypeError);
  });
});
