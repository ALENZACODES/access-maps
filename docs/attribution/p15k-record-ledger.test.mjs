import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditRecordLedger, ledgerText } from './p15k-record-ledger.mjs';

const digest = 'a'.repeat(64);
const source = { id: 'municipal', licence: 'OGL-ON-1.0', observedOn: '2026-11-15',
  reference: 'sources/municipal.json', tier: 2 };
const proof = { sourceId: 'municipal', observedOn: '2026-11-15', feature: 'entrance',
  access: 'YES', tier: 2 };
const place = { id: 'library', en: 'Library entrance', fr: 'Entrée de la bibliothèque',
  feature: 'entrance', access: 'YES', tier: 2, silo: 'open', sourceIds: ['municipal'],
  evidence: [proof], offline: { path: 'offline/library.json', bytes: 128, sha256: digest },
  targetPx: 44 };
const local = { 'offline/library.json': { bytes: 128, sha256: digest } };
const catalogue = (changes = {}) => ({ asOf: '2026-11-18', maxAgeDays: 30,
  sources: [source], records: [place], ...changes });
const modify = (changes = {}) => ({ ...place, ...changes });
const audit = (data = catalogue(), assets = local) => auditRecordLedger(data, assets);
const codes = (data, assets = local) => audit(data, assets).findings.map(f => f.code);

describe('P15K offline source-and-tier ledger', () => {
  it('accepts an attributed bilingual candidate', () => assert.equal(audit().ok, true));
  it('returns record metadata without altering source input', () => {
    const original = catalogue();
    const before = JSON.stringify(original);
    assert.equal(audit(original).records[0].id, 'library');
    assert.equal(JSON.stringify(original), before);
  });
  it('reports deterministic bilingual findings', () => {
    const invalid = catalogue({ records: [modify({ targetPx: 21 })] });
    assert.deepEqual(audit(invalid), audit(invalid));
    assert.ok(audit(invalid).findings.every(f => f.en.length > 0 && f.fr.length > 0));
  });
  it('blocks an absent catalogue', () => assert.ok(codes(null).includes('ROOT')));
  it('blocks malformed collections', () => assert.ok(codes({}).includes('ROOT')));
  it('blocks an invalid calendar day', () => assert.ok(codes(catalogue({ asOf: '2026-02-30' })).includes('DATE')));
  it('blocks a negative retention age', () => assert.ok(codes(catalogue({ maxAgeDays: -1 })).includes('POLICY')));
  it('blocks an excessive retention age', () => assert.ok(codes(catalogue({ maxAgeDays: 9000 })).includes('POLICY')));
  it('blocks an unknown licence', () => assert.ok(codes(catalogue({ sources: [{ ...source, licence: 'private' }] })).includes('LICENCE')));
  it('blocks missing source metadata', () => assert.ok(codes(catalogue({ sources: [{}] })).includes('SOURCE')));
  it('blocks duplicate source identifiers', () => assert.ok(codes(catalogue({ sources: [source, source] })).includes('DUPLICATE')));
  it('blocks stale sources', () => assert.ok(codes(catalogue({ sources: [{ ...source, observedOn: '2020-01-01' }] })).includes('AGE')));
  it('blocks future source observations', () => assert.ok(codes(catalogue({ sources: [{ ...source, observedOn: '2027-01-01' }] })).includes('AGE')));
  it('blocks nonlocal source references', () => assert.ok(codes(catalogue({ sources: [{ ...source, reference: '../other' }] })).includes('REFERENCE')));
  it('blocks duplicate record identifiers', () => assert.ok(codes(catalogue({ records: [place, place] })).includes('DUPLICATE')));
  it('blocks incomplete record metadata', () => assert.ok(codes(catalogue({ records: [{ id: 'library' }] })).includes('RECORD')));
  it('blocks missing English text', () => assert.ok(codes(catalogue({ records: [modify({ en: '' })] })).includes('TEXT')));
  it('blocks missing French text', () => assert.ok(codes(catalogue({ records: [modify({ fr: '' })] })).includes('TEXT')));
  it('blocks unsafe label markup', () => assert.ok(codes(catalogue({ records: [modify({ en: '<script>' })] })).includes('TEXT')));
  it('blocks personal identifiers in labels', () => assert.ok(codes(catalogue({ records: [modify({ en: 'contact@example.test' })] })).includes('TEXT')));
  it('blocks unsupported French colon spacing', () => assert.ok(codes(catalogue({ records: [modify({ fr: 'Entrée: accessible' })] })).includes('TYPOGRAPHY')));
  it('accepts French nonbreaking colon spacing', () => assert.equal(codes(catalogue({ records: [modify({ fr: 'Entrée\u00a0: accessible' })] })).length, 0));
  it('blocks undersized interaction targets', () => assert.ok(codes(catalogue({ records: [modify({ targetPx: 30 })] })).includes('TARGET')));
  it('blocks absent source lineage', () => assert.ok(codes(catalogue({ records: [modify({ sourceIds: [] })] })).includes('PROVENANCE')));
  it('blocks missing referenced sources', () => assert.ok(codes(catalogue({ records: [modify({ sourceIds: ['unknown'] })] })).includes('PROVENANCE')));
  it('blocks duplicate lineage references', () => assert.ok(codes(catalogue({ records: [modify({ sourceIds: ['municipal','municipal'] })] })).includes('PROVENANCE')));
  it('blocks an invalid observation', () => assert.ok(codes(catalogue({ records: [modify({ evidence: [{}] })] })).includes('EVIDENCE')));
  it('blocks evidence for another feature', () => assert.ok(codes(catalogue({ records: [modify({ evidence: [{ ...proof, feature: 'lift' }] })] })).includes('EVIDENCE')));
  it('blocks evidence exceeding its source tier', () => assert.ok(codes(catalogue({ records: [modify({ evidence: [{ ...proof, tier: 3 }] })] })).includes('EVIDENCE')));
  it('blocks observations before the source date', () => assert.ok(codes(catalogue({ records: [modify({ evidence: [{ ...proof, observedOn: '2026-11-14' }] })] })).includes('AGE')));
  it('blocks conflicting accessibility claims', () => assert.ok(codes(catalogue({ records: [modify({ evidence: [proof, { ...proof, access: 'NO' }] })] })).includes('CONFLICT')));
  it('blocks YES without supporting evidence', () => assert.ok(codes(catalogue({ records: [modify({ evidence: [] })] })).includes('ACCESS')));
  it('allows a tier-zero UNKNOWN with no observation', () => assert.equal(codes(catalogue({ records: [modify({ access: 'UNKNOWN', tier: 0, evidence: [] })] })).length, 0));
  it('blocks tier-zero asserted access', () => assert.ok(codes(catalogue({ records: [modify({ tier: 0 })] })).includes('ACCESS')));
  it('blocks a higher tier than matching evidence', () => assert.ok(codes(catalogue({ records: [modify({ tier: 3 })] })).includes('TIER')));
  it('blocks ODbL evidence in an open export', () => {
    const odbl = { ...source, licence: 'ODbL-1.0' };
    assert.ok(codes(catalogue({ sources: [odbl] })).includes('SILO'));
  });
  it('allows a segregated ODbL export', () => {
    const odbl = { ...source, licence: 'ODbL-1.0' };
    assert.equal(codes(catalogue({ sources: [odbl], records: [modify({ silo: 'odbl' })] })).length, 0);
  });
  it('blocks missing offline metadata', () => assert.ok(codes(catalogue({ records: [modify({ offline: {} })] })).includes('OFFLINE')));
  it('blocks unsafe offline paths', () => assert.ok(codes(catalogue({ records: [modify({ offline: { ...place.offline, path: '../escape' } })] })).includes('OFFLINE')));
  it('blocks an incorrect offline digest', () => assert.ok(codes(catalogue(), { 'offline/library.json': { bytes: 128, sha256: 'b'.repeat(64) } }).includes('ASSET')));
  it('blocks offline byte mismatches', () => assert.ok(codes(catalogue(), { 'offline/library.json': { bytes: 129, sha256: digest } }).includes('ASSET')));
  it('allows an explicitly absent optional offline asset', () => assert.equal(codes(catalogue({ records: [modify({ offline: null })] })).length, 0));
  it('reports the count of declared offline assets', () => assert.equal(audit().summary.assets, 1));
  it('formats English outcomes', () => assert.match(ledgerText(audit()), /Check passed/));
  it('formats French outcomes', () => assert.match(ledgerText(audit(), 'fr'), /Contrôle réussi/));
  it('rejects unsupported output languages', () => assert.throws(() => ledgerText(audit(), 'es'), TypeError));
  it('never emits a release-ready result on unsafe input', () => {
    const report = audit(catalogue({ records: [modify({ targetPx: 10, evidence: [] })] }));
    assert.equal(report.ok, false);
    assert.ok(report.findings.length >= 2);
  });
});
