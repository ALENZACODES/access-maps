import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditPublicationRegression, regressionText } from './p15h-regression.js';

const source = { id: 'municipal', name: 'Municipal open data', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'sources/municipal.json' };
const observation = { feature: 'entrance', access: 'YES', sourceId: 'municipal', observedOn: '2026-11-10' };
const place = { id: 'library', en: 'Library', fr: 'Bibliothèque', feature: 'entrance',
  access: 'UNKNOWN', sourceIds: ['municipal'], evidence: [], assetIds: [], targetPx: 44, silo: 'open' };
const asset = { id: 'guide', path: 'offline/guide.json', sha256: 'a'.repeat(64),
  bytes: 20, sourceIds: ['municipal'], silo: 'open' };
function packageOf(changes: Record<string, unknown> = {}) {
  return { schemaVersion: 1, asOf: '2026-11-15', maxAgeDays: 90, sources: [source],
    places: [place], assets: [asset], ...changes };
}
function find(before: unknown, after: unknown, options?: unknown): string[] {
  return auditPublicationRegression(before, after, options).findings.map(f => f.code);
}
describe('P15H offline publication regression checks', () => {
  it('accepts unchanged packages', () => {
    assert.equal(auditPublicationRegression(packageOf(), packageOf()).ok, true);
  });
  it('returns a deterministic report', () => {
    const a = packageOf(); const b = packageOf({ places: [] });
    assert.deepEqual(auditPublicationRegression(a, b), auditPublicationRegression(a, b));
  });
  it('blocks invalid earlier package', () => {
    assert.ok(find({}, packageOf()).includes('INPUT'));
  });
  it('blocks invalid next package', () => {
    assert.ok(find(packageOf(), null).includes('INPUT'));
  });
  it('rejects a publication date moving backwards', () => {
    assert.ok(find(packageOf(), packageOf({ asOf: '2026-11-14' })).includes('CLOCK'));
  });
  it('allows forward dates', () => {
    assert.equal(find(packageOf(), packageOf({ asOf: '2026-11-16' })).length, 0);
  });
  it('requires explicit place removal', () => {
    assert.ok(find(packageOf(), packageOf({ places: [] })).includes('REMOVAL'));
  });
  it('allows an approved place removal within limit', () => {
    assert.equal(find(packageOf(), packageOf({ places: [] }),
      { removedPlaces: ['library'], maximumRemovals: 1 }).length, 0);
  });
  it('does not allow approved removal beyond limit', () => {
    assert.ok(find(packageOf(), packageOf({ places: [] }),
      { removedPlaces: ['library'], maximumRemovals: 0 }).includes('LIMIT'));
  });
  it('rejects bogus removal exception', () => {
    assert.ok(find(packageOf(), packageOf(),
      { removedPlaces: ['library'], maximumRemovals: 1 }).includes('UNMATCHED'));
  });
  it('rejects duplicated removal exceptions', () => {
    assert.ok(find(packageOf(), packageOf(),
      { removedPlaces: ['library', 'library'] }).includes('POLICY'));
  });
  it('rejects unknown removal policy keys', () => {
    assert.ok(find(packageOf(), packageOf(), { disableAudits: true }).includes('POLICY'));
  });
  it('rejects negative removal limits', () => {
    assert.ok(find(packageOf(), packageOf(), { maximumRemovals: -1 }).includes('POLICY'));
  });
  it('rejects removing a source', () => {
    assert.ok(find(packageOf(), packageOf({ sources: [] })).includes('INPUT'));
  });
  it('rejects removing an asset without approval', () => {
    assert.ok(find(packageOf(), packageOf({ assets: [] })).includes('REMOVAL'));
  });
  it('permits an explicitly removed unreferenced asset', () => {
    assert.equal(find(packageOf(), packageOf({ assets: [] }),
      { removedAssets: ['guide'], maximumRemovals: 1 }).length, 0);
  });
  it('blocks unsupported licence changes upstream', () => {
    assert.ok(find(packageOf(), packageOf({ sources: [{ ...source, licence: 'private' }] })).includes('INPUT'));
  });
  it('blocks an altered source reference with reused id', () => {
    assert.ok(find(packageOf(), packageOf({ sources: [{ ...source, reference: 'sources/changed.json' }] }))
      .includes('SOURCE'));
  });
  it('blocks a changed source name with reused id', () => {
    assert.ok(find(packageOf(), packageOf({ sources: [{ ...source, name: 'Other municipal data' }] }))
      .includes('SOURCE'));
  });
  it('blocks an observation date moving backwards', () => {
    assert.ok(find(packageOf(), packageOf({ sources: [{ ...source, observedOn: '2026-11-09' }] }))
      .includes('AGE'));
  });
  it('allows a source date moving forward', () => {
    assert.equal(find(packageOf(), packageOf({ sources: [{ ...source, observedOn: '2026-11-11' }] })).length, 0);
  });
  it('does not promote UNKNOWN without evidence', () => {
    assert.ok(find(packageOf(), packageOf({ places: [{ ...place, access: 'YES' }] })).includes('INPUT'));
  });
  it('allows a new supported observation', () => {
    const next = packageOf({ places: [{ ...place, access: 'YES', evidence: [observation] }] });
    assert.equal(find(packageOf(), next).length, 0);
  });
  it('blocks removing existing evidence', () => {
    const old = packageOf({ places: [{ ...place, access: 'YES', evidence: [observation] }] });
    assert.ok(find(old, packageOf()).includes('EVIDENCE'));
  });
  it('rejects decreasing the touch target', () => {
    assert.ok(find(packageOf({ places: [{ ...place, targetPx: 48 }] }), packageOf()).includes('TARGET'));
  });
  it('allows increasing touch target', () => {
    assert.equal(find(packageOf(), packageOf({ places: [{ ...place, targetPx: 48 }] })).length, 0);
  });
  it('blocks an asset content change without source or id revision', () => {
    assert.ok(find(packageOf(), packageOf({ assets: [{ ...asset, sha256: 'b'.repeat(64) }] })).includes('ASSET'));
  });
  it('blocks an asset path change without source or id revision', () => {
    assert.ok(find(packageOf(), packageOf({ assets: [{ ...asset, path: 'offline/updated.json' }] })).includes('ASSET'));
  });
  it('allows adding a new offline asset', () => {
    assert.equal(find(packageOf({ assets: [] }), packageOf()).length, 0);
  });
  it('allows a newly added place that leaves UNKNOWN explicit', () => {
    assert.equal(find(packageOf({ places: [] }), packageOf()).length, 0);
  });
  it('keeps diagnostics bilingual', () => {
    const result = auditPublicationRegression(packageOf(), packageOf({ places: [] }));
    assert.ok(result.findings.every(item => item.en.length && item.fr.length));
    assert.match(regressionText(result, 'fr'), /Publication bloquée/);
    assert.match(regressionText(result, 'en'), /Publication blocked/);
  });
  it('preserves deterministic summary counts', () => {
    const report = auditPublicationRegression(packageOf(), packageOf());
    assert.deepEqual(report.summary, { oldPlaces: 1, newPlaces: 1, oldSources: 1,
      newSources: 1, oldAssets: 1, newAssets: 1, approvedRemovals: 0 });
  });
});
