import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareOfflineReleases, releaseText,
  type ReleaseAsset, type ReleasePolicy, type ReleaseSnapshot,
} from './p15d-release.js';

const policy: ReleasePolicy = {
  asOf: '2026-11-15', maxAgeDays: 90, maxLossOfPresentCells: 0,
  maxUnexplainedAssetRemoval: 0, maxBytes: 5000,
};
const asset: ReleaseAsset = {
  id: 'a1', path: 'data/a1.json', sha256: 'a'.repeat(64), bytes: 40,
  source: 'Town open data', licence: 'OGL-ON-1.0', observedOn: '2026-11-10',
  silo: 'open',
  lineage: [{ source: 'Town open data', licence: 'OGL-ON-1.0', observedOn: '2026-11-10' }],
};
const before: ReleaseSnapshot = {
  schemaVersion: 1, generatedOn: '2026-11-11', assets: [asset],
  regions: [{ id: 'r1', cells: [
    { id: 'c1', status: 'PRESENT', assetId: 'a1' },
    { id: 'c2', status: 'UNKNOWN' },
  ] }],
};
const updatedAsset: ReleaseAsset = {
  ...asset, sha256: 'b'.repeat(64), observedOn: '2026-11-12',
  lineage: [{ source: 'Town open data', licence: 'OGL-ON-1.0', observedOn: '2026-11-12' }],
};
const after: ReleaseSnapshot = {
  ...before, generatedOn: '2026-11-13', assets: [updatedAsset],
};
function copy(snapshot: ReleaseSnapshot, edits: Partial<ReleaseSnapshot>): ReleaseSnapshot {
  return { ...snapshot, ...edits };
}
function codes(previous: unknown, current: unknown, options: ReleasePolicy = policy): string[] {
  return compareOfflineReleases(previous, current, options).findings.map(item => item.code);
}
function altered(change: Partial<ReleaseAsset>): ReleaseSnapshot {
  return copy(after, { assets: [{ ...updatedAsset, ...change }] });
}
function changedCells(
  cells: ReleaseSnapshot['regions'][number]['cells'],
  snapshot: ReleaseSnapshot = after,
): ReleaseSnapshot {
  return copy(snapshot, { regions: [{ id: 'r1', cells }] });
}

describe('release inventory comparisons', () => {
  it('accepts a dated change with full lineage', () => {
    const result = compareOfflineReleases(before, after, policy);
    assert.equal(result.ok, true);
    assert.equal(result.summary.previousPresent, 1);
    assert.equal(result.summary.currentPresent, 1);
    assert.equal(result.summary.currentUnknown, 1);
    assert.equal(result.summary.changedCells, 0);
    assert.equal(result.summary.totalBytes, 40);
    assert.equal(result.findings.length, 0);
  });

  it('reports a bad previous schema without crashing', () => {
    assert.deepEqual(codes({}, after), ['INPUT']);
    assert.deepEqual(codes(null, after), ['INPUT']);
    assert.deepEqual(codes([], after), ['INPUT']);
  });

  it('reports a bad current schema without crashing', () => {
    assert.deepEqual(codes(before, { schemaVersion: 9 }), ['INPUT']);
    assert.deepEqual(codes(before, false), ['INPUT']);
  });

  it('rejects malformed dates including leap-day errors', () => {
    assert.ok(codes(copy(before, { generatedOn: '2026-02-29' }), after).includes('INPUT'));
    assert.ok(codes(before, copy(after, { generatedOn: '2026-13-01' })).includes('INPUT'));
    assert.ok(codes(before, copy(after, { generatedOn: '2026-10-01' })).includes('DATE'));
    assert.ok(codes(before, copy(after, { generatedOn: '2027-01-01' })).includes('DATE'));
  });

  it('rejects missing and non-open licences', () => {
    assert.ok(codes(before, altered({ licence: '' })).includes('INPUT'));
    assert.ok(codes(before, altered({ licence: 'private' })).includes('INPUT'));
  });

  it('rejects held sources regardless of punctuation or case', () => {
    assert.ok(codes(before, altered({ source: 'Mi-Way operations' })).includes('HELD'));
    assert.ok(codes(before, altered({ lineage: [
      { source: 'MI WAY', licence: 'OGL-ON-1.0', observedOn: '2026-11-12' },
    ] })).includes('HELD'));
  });

  it('rejects incomplete top-level provenance', () => {
    assert.ok(codes(before, altered({ lineage: [
      { source: 'Other town', licence: 'OGL-ON-1.0', observedOn: '2026-11-12' },
    ] })).includes('LINEAGE'));
    assert.ok(codes(before, altered({ lineage: [] })).includes('INPUT'));
  });

  it('keeps ODbL material in the ODbL silo', () => {
    const changed = altered({ licence: 'ODbL-1.0', silo: 'open', lineage: [
      { source: 'Town open data', licence: 'ODbL-1.0', observedOn: '2026-11-12' },
    ] });
    assert.ok(codes(before, changed).includes('SILO'));
  });

  it('rejects a declared ODbL silo with no ODbL source', () => {
    assert.ok(codes(before, altered({ silo: 'odbl' })).includes('SILO'));
  });

  it('blocks an unexplained change of ODbL silo', () => {
    const changed = altered({ silo: 'odbl', licence: 'ODbL-1.0', lineage: [
      { source: 'Town open data', licence: 'ODbL-1.0', observedOn: '2026-11-12' },
    ] });
    assert.ok(codes(before, changed).includes('ODBL_MOVED'));
  });

  it('rejects release observations beyond configured age', () => {
    assert.ok(codes(before, altered({ observedOn: '2026-06-01', lineage: [
      { source: 'Town open data', licence: 'OGL-ON-1.0', observedOn: '2026-06-01' },
    ] })).includes('DATE'));
  });

  it('rejects observations in the future', () => {
    assert.ok(codes(before, altered({ observedOn: '2026-12-01', lineage: [
      { source: 'Town open data', licence: 'OGL-ON-1.0', observedOn: '2026-12-01' },
    ] })).includes('DATE'));
  });

  it('rejects duplicate asset identifiers', () => {
    const duplicate = copy(after, { assets: [updatedAsset, { ...updatedAsset, path: 'data/other.json' }] });
    assert.ok(codes(before, duplicate).includes('DUPLICATE'));
  });

  it('rejects duplicate asset paths', () => {
    const duplicate = copy(after, { assets: [updatedAsset, { ...updatedAsset, id: 'a2' }] });
    assert.ok(codes(before, duplicate).includes('DUPLICATE'));
  });

  it('rejects duplicate region identifiers', () => {
    const duplicate = copy(after, { regions: [after.regions[0]!, after.regions[0]!] });
    assert.ok(codes(before, duplicate).includes('DUPLICATE'));
  });

  it('rejects duplicate cell identifiers', () => {
    const duplicate = changedCells([
      { id: 'c1', status: 'PRESENT', assetId: 'a1' },
      { id: 'c1', status: 'UNKNOWN' },
    ]);
    assert.ok(codes(before, duplicate).includes('DUPLICATE'));
  });

  it('blocks unexplained loss of regions', () => {
    assert.ok(codes(before, copy(after, { regions: [] })).includes('REMOVED_REGION'));
  });

  it('allows a named retired region only when configured', () => {
    const next = copy(after, { regions: [] });
    assert.ok(!codes(before, next, { ...policy, allowRemovedRegionIds: ['r1'],
      maxUnexplainedAssetRemoval: 0 }).includes('REMOVED_REGION'));
  });

  it('blocks unexplained loss of a cell', () => {
    assert.ok(codes(before, changedCells([{ id: 'c2', status: 'UNKNOWN' }])).includes('REMOVED_CELL'));
  });

  it('allows a named removed cell but counts removed coverage', () => {
    const next = changedCells([{ id: 'c2', status: 'UNKNOWN' }]);
    const result = compareOfflineReleases(before, next, { ...policy,
      allowRemovedCellKeys: ['r1/c1'], maxLossOfPresentCells: 1 });
    assert.equal(result.summary.removedCells, 1);
    assert.ok(!result.findings.some(item => item.code === 'REMOVED_CELL'));
  });

  it('blocks known cell becoming UNKNOWN even with a relaxed loss threshold', () => {
    const next = changedCells([
      { id: 'c1', status: 'UNKNOWN' }, { id: 'c2', status: 'UNKNOWN' },
    ]);
    assert.ok(codes(before, next, { ...policy, maxLossOfPresentCells: 5 })
      .includes('REGRESSION_UNKNOWN'));
  });

  it('reports loss threshold separately from UNKNOWN regression', () => {
    const next = changedCells([
      { id: 'c1', status: 'UNKNOWN' }, { id: 'c2', status: 'UNKNOWN' },
    ]);
    const result = codes(before, next);
    assert.ok(result.includes('CHURN'));
    assert.ok(result.includes('REGRESSION_UNKNOWN'));
  });

  it('blocks UNKNOWN-to-PRESENT when the source is not more recent', () => {
    const next = changedCells([
      { id: 'c1', status: 'PRESENT', assetId: 'a1' },
      { id: 'c2', status: 'PRESENT', assetId: 'a1' },
    ], copy(before, { generatedOn: '2026-11-13' }));
    assert.ok(codes(before, next).includes('STATE_WITHOUT_EVIDENCE'));
  });

  it('accepts UNKNOWN-to-PRESENT with a later dated source', () => {
    const next = changedCells([
      { id: 'c1', status: 'PRESENT', assetId: 'a1' },
      { id: 'c2', status: 'PRESENT', assetId: 'a1' },
    ]);
    assert.ok(!codes(before, next).includes('STATE_WITHOUT_EVIDENCE'));
  });

  it('rejects an asset reference that does not exist', () => {
    const next = changedCells([{ id: 'c1', status: 'PRESENT', assetId: 'ghost' }]);
    assert.ok(codes(before, next).includes('UNDECLARED_ASSET'));
  });

  it('flags an unreferenced asset as a notice', () => {
    const next = copy(after, { assets: [updatedAsset, { ...asset, id: 'not-used',
      path: 'data/not-used.json' }] });
    const report = compareOfflineReleases(before, next, policy);
    assert.equal(report.ok, true);
    assert.ok(report.findings.some(item => item.code === 'ASSET_WITHOUT_CELL' && item.level === 'NOTICE'));
  });

  it('rejects the offline byte budget being exceeded', () => {
    const next = altered({ bytes: 5001 });
    assert.ok(codes(before, next).includes('BUDGET'));
  });

  it('rejects a reused identifier with identical content but changed source', () => {
    const next = altered({ source: 'Elsewhere', sha256: asset.sha256,
      lineage: [{ source: 'Elsewhere', licence: 'OGL-ON-1.0', observedOn: '2026-11-12' }] });
    assert.ok(codes(before, next).includes('ASSET_ID_REUSED'));
  });

  it('rejects a licence change with no new observation', () => {
    const next = altered({ licence: 'CC-BY-4.0', observedOn: '2026-11-10', lineage: [
      { source: 'Town open data', licence: 'CC-BY-4.0', observedOn: '2026-11-10' },
    ] });
    assert.ok(codes(before, next).includes('LICENCE_CHANGE'));
  });

  it('rejects an observation age regression', () => {
    const next = altered({ observedOn: '2026-11-09', lineage: [
      { source: 'Town open data', licence: 'OGL-ON-1.0', observedOn: '2026-11-09' },
    ] });
    assert.ok(codes(before, next).includes('AGE_REGRESSION'));
  });

  it('blocks removed assets over threshold', () => {
    const next = copy(after, { assets: [], regions: [{ id: 'r1', cells: [
      { id: 'c1', status: 'UNKNOWN' }, { id: 'c2', status: 'UNKNOWN' },
    ] }] });
    assert.ok(codes(before, next).includes('REMOVED_ASSET'));
  });

  it('renders English and French explanations', () => {
    const next = copy(after, { regions: [] });
    const report = compareOfflineReleases(before, next, policy);
    assert.match(releaseText(report, 'en'), /A region disappeared/);
    assert.match(releaseText(report, 'fr'), /Une région a disparu/);
    assert.doesNotMatch(releaseText(report, 'fr'), /A region disappeared/);
  });

  it('rejects nonsensical policy values', () => {
    assert.throws(() => compareOfflineReleases(before, after, { ...policy, maxBytes: -1 }), RangeError);
    assert.throws(() => compareOfflineReleases(before, after, { ...policy, maxAgeDays: 1.4 }), RangeError);
    assert.throws(() => compareOfflineReleases(before, after, { ...policy, asOf: 'tomorrow' }), RangeError);
  });
});
