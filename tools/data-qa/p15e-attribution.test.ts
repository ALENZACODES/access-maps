import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditAttribution, type AttributionLedger } from './p15e-attribution.js';

const source = {
  source: 'Ontario open mapping', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'sources/municipal.json',
};
const asset = { id: 'stop-1', path: 'records/stop-1.json', silo: 'open' as const, sources: [source] };
const notice = { id: 'credit-1', assetIds: ['stop-1'],
  en: 'Ontario open mapping data', fr: 'Données cartographiques de l’Ontario',
  licence: 'OGL-ON-1.0', sourceReference: source.reference,
};
const base: AttributionLedger = {
  schemaVersion: 1, asOf: '2026-11-15', assets: [asset], notices: [notice],
};
function check(change: Record<string, unknown> = {}) {
  return auditAttribution({ ...base, ...change });
}
function fail(change: Record<string, unknown>, code: string) {
  const result = check(change);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result.findings));
  return result;
}
describe('offline source attribution ledger', () => {
  it('accepts complete dated bilingual source attribution', () => {
    const result = check();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.sources, 1);
    assert.equal(result.summary.uncreditedAssets, 0);
  });
  it('blocks missing notices for published assets', () => {
    const result = fail({ notices: [] }, 'CREDIT');
    assert.equal(result.summary.uncreditedAssets, 1);
  });
  it('blocks changed source references with an old credit', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, reference: 'sources/changed.json' }] }] }, 'CREDIT');
  });
  it('blocks changed licences with an old credit', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, licence: 'CC-BY-4.0' }] }] }, 'CREDIT');
  });
  it('blocks credit for an unknown asset', () => {
    fail({ notices: [{ ...notice, assetIds: ['stop-2'] }] }, 'UNKNOWN_ASSET');
  });
  it('blocks notices claiming unrelated source references', () => {
    fail({ notices: [{ ...notice, sourceReference: 'sources/unrelated.json' }] }, 'WRONG_SOURCE');
  });
  it('blocks notices claiming unrelated licences', () => {
    fail({ notices: [{ ...notice, licence: 'CC0-1.0' }] }, 'WRONG_SOURCE');
  });
  it('blocks duplicate assets', () => {
    fail({ assets: [asset, asset] }, 'DUPLICATE');
  });
  it('blocks duplicate asset paths with distinct IDs', () => {
    fail({ assets: [asset, { ...asset, id: 'stop-2' }] }, 'DUPLICATE');
  });
  it('blocks duplicate notice IDs', () => {
    fail({ notices: [notice, notice] }, 'DUPLICATE');
  });
  it('blocks duplicate notice asset references', () => {
    fail({ notices: [{ ...notice, assetIds: ['stop-1', 'stop-1'] }] }, 'DUPLICATE');
  });
  it('blocks held MiWay sources', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, source: 'MiWay GTFS' }] }] }, 'HELD');
  });
  it('blocks closed-source licences', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, licence: 'proprietary' }] }] }, 'ASSET');
  });
  it('blocks source URLs requiring network access', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, reference: 'https://example.org/data' }] }] }, 'ASSET');
  });
  it('blocks source dates in the future', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, observedOn: '2027-01-01' }] }] }, 'DATE');
  });
  it('blocks invalid calendar dates', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, observedOn: '2026-02-30' }] }] }, 'ASSET');
  });
  it('keeps ODbL assets in a distinct silo', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, licence: 'ODbL-1.0' }] }] }, 'SILO');
  });
  it('accepts an attributed ODbL asset in its own silo', () => {
    const odbl = { ...source, licence: 'ODbL-1.0' };
    const result = check({ assets: [{ ...asset, silo: 'odbl', sources: [odbl] }],
      notices: [{ ...notice, licence: 'ODbL-1.0' }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.odblAssets, 1);
  });
  it('requires attribution for each lineage source', () => {
    const second = { ...source, source: 'Neighbourhood data', reference: 'sources/area.json' };
    fail({ assets: [{ ...asset, sources: [source, second] }] }, 'CREDIT');
  });
  it('accepts separate attribution for each lineage source', () => {
    const second = { ...source, source: 'Neighbourhood data', reference: 'sources/area.json' };
    const result = check({ assets: [{ ...asset, sources: [source, second] }], notices: [notice,
      { ...notice, id: 'credit-2', sourceReference: second.reference }] });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('blocks unsafe HTML in a public attribution notice', () => {
    fail({ notices: [{ ...notice, en: '<script>alert(1)</script>' }] }, 'CONTENT');
  });
  it('blocks email addresses in public attribution notices', () => {
    fail({ notices: [{ ...notice, en: 'Contact somebody@example.com for data' }] }, 'CONTENT');
  });
  it('blocks non-typographic French apostrophes', () => {
    fail({ notices: [{ ...notice, fr: "Données de l'Ontario" }] }, 'PAIR');
  });
  it('blocks improperly spaced French colons', () => {
    fail({ notices: [{ ...notice, fr: 'Données : Ontario' }] }, 'PAIR');
  });
  it('accepts French nonbreaking colon spaces', () => {
    const report = check({ notices: [{ ...notice, fr: 'Données\u00a0: Ontario' }] });
    assert.equal(report.ok, true, JSON.stringify(report));
  });
  it('blocks missing translated credit text', () => {
    fail({ notices: [{ ...notice, fr: '' }] }, 'NOTICE');
  });
  it('blocks unexpected data fields', () => {
    fail({ assets: [{ ...asset, personalEmail: 'person@example.org' }] }, 'ASSET');
  });
  it('blocks malformed root structures', () => {
    for (const value of [null, [], 1, {}, 'invalid']) {
      assert.equal(auditAttribution(value).ok, false);
    }
  });
  it('does not mutate input records', () => {
    const previous = JSON.stringify(base);
    check();
    assert.equal(JSON.stringify(base), previous);
  });
  it('returns bilingual findings with stable ordering', () => {
    const input = { notices: [] };
    const result = check(input);
    assert.deepEqual(result, check(input));
    assert.ok(result.findings.every(f => f.en && f.fr));
  });
});

describe('multi-asset credits and provenance boundaries', () => {
  it('permits one notice to credit two assets using the same licensed source', () => {
    const other = { ...asset, id: 'stop-2', path: 'records/stop-2.json' };
    const report = check({ assets: [asset, other], notices: [
      { ...notice, assetIds: ['stop-1', 'stop-2'] },
    ] });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.summary.sources, 2);
  });
  it('blocks a notice mixing separate open and ODbL silos', () => {
    const odbl = { ...asset, id: 'osm-2', path: 'odbl/osm-2.json',
      silo: 'odbl', sources: [{ ...source, licence: 'ODbL-1.0' }] };
    fail({ assets: [asset, odbl], notices: [
      { ...notice, assetIds: ['stop-1', 'osm-2'] },
    ] }, 'REUSED');
  });
  it('counts multiple missing credits once per asset', () => {
    const additional = { ...source, reference: 'sources/secondary.json' };
    const result = fail({ assets: [{ ...asset, sources: [source, additional] }],
      notices: [] }, 'CREDIT');
    assert.equal(result.summary.uncreditedAssets, 1);
  });
  it('rejects duplicate lineage stamps on the same asset', () => {
    fail({ assets: [{ ...asset, sources: [source, source] }] }, 'DUPLICATE');
  });
  it('rejects an asset without any source provenance', () => {
    fail({ assets: [{ ...asset, sources: [] }] }, 'ASSET');
  });
  it('rejects absolute file paths', () => {
    fail({ assets: [{ ...asset, path: '/private/data.json' }] }, 'ASSET');
  });
  it('rejects a file source that escapes the offline root', () => {
    fail({ assets: [{ ...asset, sources: [{ ...source, reference: '../secret.json' }] }] }, 'ASSET');
  });
  it('rejects an unknown attribute in a notice', () => {
    fail({ notices: [{ ...notice, ownerName: 'Someone' }] }, 'NOTICE');
  });
});
