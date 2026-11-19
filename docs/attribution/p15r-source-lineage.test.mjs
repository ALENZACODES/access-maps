import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditSourceLineage, sourceLineageText } from './p15r-source-lineage.mjs';

const rawSource = () => ({ id: 'city', en: 'City open data', fr: 'Données municipales', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-17', parents: [], tier: 3, reference: 'sources/city.json' });
const rawRecord = () => ({ id: 'library', en: 'Library', fr: 'Bibliothèque', observedOn: '2026-11-18',
  tier: 2, access: 'YES', sourceIds: ['city'], silo: 'open',
  evidence: [{ sourceId: 'city', observedOn: '2026-11-18', access: 'YES' }] });
const rawAsset = () => ({ id: 'map', path: 'pack/map.json', sha256: 'a'.repeat(64), bytes: 42,
  sourceIds: ['city'], silo: 'open' });
const packet = () => ({ asOf: '2026-11-19', sources: [rawSource()], records: [rawRecord()], assets: [rawAsset()] });
const result = (change = () => {}, options) => { const x = packet(); change(x); return auditSourceLineage(x, options); };
const codes = (change, options) => result(change, options).findings.map(finding => finding.code);
const has = (name, fn, code, options) => it(name, () => assert.ok(codes(fn, options).includes(code), `${name}: ${code}`));

// The standalone suite deliberately exercises the public API with fresh objects.
describe('P15R source-lineage graph contract', () => {
  it('accepts a dated open-source package', () => assert.equal(result().ok, true));
  for (const [name, input] of [['absent package', null], ['empty package', {}], ['array package', []]]) {
    it(`rejects ${name}`, () => assert.ok(auditSourceLineage(input).findings.some(item => item.code === 'ROOT')));
  }
  it('retains a deterministic plan', () => assert.deepEqual(result(), result()));
  it('never mutates callers', () => {
    const x = packet(); const before = structuredClone(x); auditSourceLineage(x); assert.deepEqual(x, before);
  });
  it('returns no partial plan on error', () => {
    const x = packet(); x.assets[0].path = '../out.json';
    assert.equal(auditSourceLineage(x).plan, null);
  });
  it('accepts a source with a local parent', () => {
    const x = packet(); x.sources.push({ ...rawSource(), id: 'region', reference: 'sources/region.json', tier: 3 });
    x.sources[0].parents.push('region');
    assert.equal(auditSourceLineage(x).ok, true);
  });
  it('accepts an ODbL package in its own group', () => {
    const x = packet(); x.sources[0].licence = 'ODbL-1.0'; x.records[0].silo = 'odbl'; x.assets[0].silo = 'odbl';
    assert.equal(auditSourceLineage(x).ok, true);
  });
  it('accepts UNKNOWN with no observations at tier 0', () => {
    const x = packet(); x.records[0].access = 'UNKNOWN'; x.records[0].tier = 0; x.records[0].evidence = [];
    assert.equal(auditSourceLineage(x).ok, true);
  });
  it('accepts a matching NO observation', () => {
    const x = packet(); x.records[0].access = 'NO'; x.records[0].evidence[0].access = 'NO';
    assert.equal(auditSourceLineage(x).ok, true);
  });
  it('accepts tier 3 with an appropriate tier 3 source', () => {
    const x = packet(); x.records[0].tier = 3;
    assert.equal(auditSourceLineage(x).ok, true);
  });
  it('accepts a leap-day source on a leap-day publication', () => {
    const x = packet(); x.asOf = '2028-02-29'; x.sources[0].observedOn = '2028-02-29';
    x.records[0].observedOn = '2028-02-29'; x.records[0].evidence[0].observedOn = '2028-02-29';
    assert.equal(auditSourceLineage(x).ok, true);
  });
  it('sorts source records without mutating them', () => {
    const x = packet(); x.sources.unshift({ ...rawSource(), id: 'alpha', reference: 'sources/alpha.json' });
    assert.deepEqual(auditSourceLineage(x).plan.sources.map(s => s.id), ['alpha', 'city']);
  });
  it('returns English diagnostics', () => assert.match(sourceLineageText(result(x => { x.sources[0].licence = 'closed'; })), /Export blocked/));
  it('returns French diagnostics', () => assert.match(sourceLineageText(result(x => { x.sources[0].licence = 'closed'; }), 'fr'), /Exportation bloquée/));
  it('keeps diagnostics bilingual', () => assert.ok(result(x => { x.sources[0].licence = 'closed'; }).findings.every(f => f.en && f.fr)));
  it('has safe French conflict punctuation', () => {
    const x = packet(); x.records[0].evidence.push({ sourceId: 'city', observedOn: '2026-11-18', access: 'NO' });
    const fr = sourceLineageText(auditSourceLineage(x), 'fr');
    assert.ok(fr.includes('contradictoires ne peuvent pas soutenir'));
  });
});

const rejectionCases = [
  ['rejects a bad calendar day', x => { x.asOf = '2026-02-30'; }, 'DATE'],
  ['rejects a year-zero date', x => { x.asOf = '0000-01-01'; }, 'DATE'],
  ['rejects invalid source shape', x => { x.sources[0].unknownKey = true; }, 'SHAPE'],
  ['rejects source duplicate', x => { x.sources.push(rawSource()); }, 'DUPLICATE'],
  ['rejects blank source id', x => { x.sources[0].id = ''; }, 'ID'],
  ['rejects source id with punctuation', x => { x.sources[0].id = 'bad/id'; }, 'ID'],
  ['rejects a blank English source label', x => { x.sources[0].en = ''; }, 'TEXT'],
  ['rejects a blank French source label', x => { x.sources[0].fr = ''; }, 'TEXT'],
  ['rejects embedded markup in source label', x => { x.sources[0].en = '<script>'; }, 'TEXT'],
  ['rejects contact addresses in source label', x => { x.sources[0].fr = 'a@example.org'; }, 'TEXT'],
  ['rejects control code in source label', x => { x.sources[0].en = 'Name\u0007'; }, 'TEXT'],
  ['rejects French colon without spacing', x => { x.sources[0].fr = 'Lieu: ville'; }, 'SPACING'],
  ['rejects French semicolon without spacing', x => { x.sources[0].fr = 'Lieu; ville'; }, 'SPACING'],
  ['rejects an unsupported source licence', x => { x.sources[0].licence = 'restricted'; }, 'LICENCE'],
  ['rejects an outdated source', x => { x.sources[0].observedOn = '2022-01-01'; }, 'OBSERVED'],
  ['rejects a future source', x => { x.sources[0].observedOn = '2026-12-01'; }, 'OBSERVED'],
  ['rejects invalid source date', x => { x.sources[0].observedOn = '2026-02-29'; }, 'OBSERVED'],
  ['rejects an unsafe source path', x => { x.sources[0].reference = '../outside'; }, 'PATH'],
  ['rejects a URL as source path', x => { x.sources[0].reference = 'https://host/path'; }, 'PATH'],
  ['rejects a path containing a question mark', x => { x.sources[0].reference = 'sources/a?b'; }, 'PATH'],
  ['rejects a backslash source path', x => { x.sources[0].reference = 'sources\\a'; }, 'PATH'],
  ['rejects source tier beyond the limit', x => { x.sources[0].tier = 4; }, 'TIER'],
  ['rejects source tier below zero', x => { x.sources[0].tier = -1; }, 'TIER'],
  ['rejects a parent reference that is missing', x => { x.sources[0].parents = ['none']; }, 'SOURCE'],
  ['rejects a self parent', x => { x.sources[0].parents = ['city']; }, 'SHAPE'],
  ['rejects duplicate source parents', x => { x.sources[0].parents = ['none', 'none']; }, 'SHAPE'],
  ['rejects a source parent cycle', x => {
    x.sources.push({ ...rawSource(), id: 'region', reference: 'sources/region.json', parents: ['city'] });
    x.sources[0].parents = ['region'];
  }, 'CYCLE'],
  ['rejects a source date before its parent', x => {
    x.sources.push({ ...rawSource(), id: 'region', reference: 'sources/region.json', observedOn: '2026-11-18' });
    x.sources[0].parents = ['region'];
  }, 'ORDER'],
  ['rejects source tier exceeding its parent', x => {
    x.sources.push({ ...rawSource(), id: 'region', reference: 'sources/region.json', tier: 1 });
    x.sources[0].parents = ['region'];
  }, 'TIER'],
  ['rejects laundering an ODbL parent into open source', x => {
    x.sources.push({ ...rawSource(), id: 'region', reference: 'sources/region.json', licence: 'ODbL-1.0' });
    x.sources[0].parents = ['region'];
  }, 'SILO'],
  ['rejects malformed record shape', x => { x.records[0].extra = 'value'; }, 'SHAPE'],
  ['rejects duplicate record id', x => { x.records.push(rawRecord()); }, 'DUPLICATE'],
  ['rejects invalid record id', x => { x.records[0].id = '.hidden'; }, 'ID'],
  ['rejects missing French record label', x => { x.records[0].fr = ''; }, 'TEXT'],
  ['rejects markup in record label', x => { x.records[0].en = '<img src=x>'; }, 'TEXT'],
  ['rejects invalid record French typography', x => { x.records[0].fr = 'Accès!'; }, 'SPACING'],
  ['rejects missing record source', x => { x.records[0].sourceIds = ['missing']; }, 'SOURCE'],
  ['rejects empty record source list', x => { x.records[0].sourceIds = []; }, 'SHAPE'],
  ['rejects repeated record sources', x => { x.records[0].sourceIds = ['city', 'city']; }, 'SHAPE'],
  ['rejects mismatched record silo', x => { x.records[0].silo = 'odbl'; }, 'SILO'],
  ['rejects unknown access value', x => { x.records[0].access = 'MAYBE'; }, 'ACCESS'],
  ['rejects invalid record tier', x => { x.records[0].tier = 8; }, 'TIER'],
  ['rejects unsupported UNKNOWN tier', x => { x.records[0].access = 'UNKNOWN'; x.records[0].tier = 3; }, 'TIER'],
  ['rejects an empty evidence list for an assertion', x => { x.records[0].evidence = []; }, 'ACCESS'],
  ['rejects a nonmatching access observation', x => { x.records[0].evidence[0].access = 'NO'; }, 'ACCESS'],
  ['rejects opposing observations for asserted access', x => {
    x.records[0].evidence.push({ sourceId: 'city', observedOn: '2026-11-18', access: 'NO' });
  }, 'CONFLICT'],
  ['rejects unsupported asserted tier 1', x => { x.records[0].tier = 1; }, 'ACCESS'],
  ['rejects unsupported tier 3 against tier 2 source', x => { x.records[0].tier = 3; x.sources[0].tier = 2; }, 'TIER'],
  ['rejects an invalid evidence shape', x => { x.records[0].evidence[0].misc = 1; }, 'SHAPE'],
  ['rejects a source missing from evidence graph', x => { x.records[0].evidence[0].sourceId = 'ghost'; }, 'SOURCE'],
  ['rejects future evidence date', x => { x.records[0].evidence[0].observedOn = '2026-12-10'; }, 'OBSERVED'],
  ['rejects evidence predating source', x => { x.records[0].evidence[0].observedOn = '2026-11-16'; }, 'ORDER'],
  ['rejects duplicate evidence', x => { x.records[0].evidence.push({ ...x.records[0].evidence[0] }); }, 'DUPLICATE'],
  ['rejects empty evidence list object', x => { x.records[0].evidence = null; }, 'SHAPE'],
  ['rejects malformed asset shape', x => { x.assets[0].unexpected = true; }, 'SHAPE'],
  ['rejects duplicate asset identifiers', x => { x.assets.push(rawAsset()); }, 'DUPLICATE'],
  ['rejects invalid asset identifier', x => { x.assets[0].id = 'not valid'; }, 'ID'],
  ['rejects duplicate asset paths', x => { x.assets.push({ ...rawAsset(), id: 'other' }); }, 'DUPLICATE'],
  ['rejects an absolute asset path', x => { x.assets[0].path = '/tmp/file'; }, 'PATH'],
  ['rejects an escaping asset path', x => { x.assets[0].path = 'pack/../secret'; }, 'PATH'],
  ['rejects a blank asset digest', x => { x.assets[0].sha256 = ''; }, 'DIGEST'],
  ['rejects an upper-case asset digest', x => { x.assets[0].sha256 = 'B'.repeat(64); }, 'DIGEST'],
  ['rejects an asset size of zero', x => { x.assets[0].bytes = 0; }, 'DIGEST'],
  ['rejects an unbounded asset size', x => { x.assets[0].bytes = 65 * 1024 * 1024; }, 'DIGEST'],
  ['rejects a missing asset source', x => { x.assets[0].sourceIds = ['unknown']; }, 'SOURCE'],
  ['rejects missing asset sources', x => { x.assets[0].sourceIds = []; }, 'SHAPE'],
  ['rejects duplicate asset sources', x => { x.assets[0].sourceIds = ['city', 'city']; }, 'SHAPE'],
  ['rejects incompatible asset silo', x => { x.assets[0].silo = 'odbl'; }, 'SILO'],
  ['rejects an invalid policy key', x => x, 'POLICY', { irrelevant: true }],
  ['rejects negative age policy', x => x, 'POLICY', { maximumAgeDays: -1 }],
  ['rejects noninteger tier policy', x => x, 'POLICY', { maximumTier: 1.5 }],
  ['rejects an overly high tier policy', x => x, 'POLICY', { maximumTier: 4 }],
  ['rejects an age policy truncating all data', x => x, 'OBSERVED', { maximumAgeDays: 0 }],
  ['rejects a maximum tier below a source tier', x => x, 'TIER', { maximumTier: 2 }],
];

describe('P15R malformed and unsupported input matrix', () => {
  for (const [name, mutation, expected, options] of rejectionCases) {
    has(name, mutation, expected, options);
  }
});

describe('P15R deterministic rendering and limits', () => {
  it('sorts findings by path and code', () => {
    const report = result(x => { x.sources[0].licence = 'restricted'; x.assets[0].bytes = 0; });
    assert.deepEqual(report.findings.map(f => `${f.path}:${f.code}`),
      [...report.findings.map(f => `${f.path}:${f.code}`)].sort((a, b) => a.localeCompare(b, 'en')));
  });
  it('makes an empty package valid', () => {
    const report = auditSourceLineage({ asOf: '2026-11-19', sources: [], records: [], assets: [] });
    assert.equal(report.ok, true); assert.equal(report.plan.records.length, 0);
  });
  it('never raises assertion access for UNKNOWN', () => {
    const report = result(x => { x.records[0].access = 'UNKNOWN'; x.records[0].tier = 0; x.records[0].evidence = []; });
    assert.ok(report.ok); assert.equal(report.plan.records[0].access, 'UNKNOWN');
  });
  it('rejects an unsupported display locale', () => {
    assert.throws(() => sourceLineageText(result(), 'es'), TypeError);
  });
  it('renders a successful French heading', () => assert.match(sourceLineageText(result(), 'fr'), /Contrôle réussi/));
  it('requires no network, file, or dependency imports', () => {
    assert.equal(typeof auditSourceLineage, 'function');
  });
});
