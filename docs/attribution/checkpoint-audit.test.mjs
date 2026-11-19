import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCheckpoint, compareCheckpoints } from './checkpoint-audit.mjs';
import { checkpointFixture, mutatedSource, mutatedSurface, sourceFixture, surfaceFixture } from './checkpoint-fixtures.mjs';
const codes = document => new Set(auditCheckpoint(document).findings.map(f => f.code));
const isBlocked = value => auditCheckpoint(value).blocked;
test('complete supplied record passes with an informational unknown date', () => {
  const result = auditCheckpoint(checkpointFixture());
  assert.equal(result.blocked, false);
  assert.equal(result.blockingCount, 0);
  assert.ok(result.findings.some(f => f.code === 'DATASET_DATE_UNKNOWN'));
});
test('missing source inventory blocks', () => assert.equal(isBlocked(checkpointFixture({ sources: [] })), true));
test('missing publication inventory blocks', () => assert.equal(isBlocked(checkpointFixture({ surfaces: [] })), true));
test('included source without permission blocks', () => {
  for (const value of ['NO', 'UNKNOWN']) assert.ok(codes(mutatedSource({ permission: value })).has('PERMISSION_NOT_YES'));
});
test('accepted decision is mandatory for included sources', () => {
  for (const decision of ['needs-review', 'held']) assert.ok(codes(mutatedSource({ decision })).has('DECISION_PENDING'));
});
test('unknown evidence tier blocks, without inventing a stronger tier', () => assert.ok(codes(mutatedSource({ evidenceTier: 'UNKNOWN' })).has('TIER_UNKNOWN')));
test('source, licence and supporting evidence URLs are mandatory when included', () => {
  for (const [key, code] of [['sourceUrl', 'SOURCE_URL_UNKNOWN'], ['licenceUrl', 'LICENCE_URL_UNKNOWN'], ['evidenceUrl', 'EVIDENCE_URL_UNKNOWN']]) {
    assert.ok(codes(mutatedSource({ [key]: 'UNKNOWN' })).has(code));
  }
});
test('known date evidence is required for terms and decisions', () => {
  for (const [key, code] of [['termsDate', 'TERMS_DATE_UNKNOWN'], ['acquisitionDate', 'ACQUISITION_DATE_UNKNOWN'], ['decisionDate', 'DECISION_DATE_UNKNOWN']]) assert.ok(codes(mutatedSource({ [key]: 'UNKNOWN' })).has(code));
});
test('empty attribution and decision rationale block publication', () => {
  assert.ok(codes(mutatedSource({ notice: '' })).has('NOTICE_MISSING'));
  assert.ok(codes(mutatedSource({ decisionReason: ' ' })).has('DECISION_REASON_MISSING'));
});
test('held and excluded records are not falsely described as included', () => {
  for (const publication of ['held', 'excluded']) {
    const result = auditCheckpoint(mutatedSource({ publication, permission: 'UNKNOWN' }));
    assert.ok(!result.findings.some(f => f.code === 'PERMISSION_NOT_YES'));
    assert.ok(result.findings.some(f => f.code === 'SOURCE_NOT_INCLUDED'));
  }
});
test('missing surface linkage blocks', () => assert.ok(codes(mutatedSurface({ sourceIds: [] })).has('SURFACE_NO_SOURCES')));
test('unknown linked source blocks', () => assert.ok(codes(mutatedSurface({ sourceIds: ['absent-source'] })).has('SOURCE_NOT_FOUND')));
test('explicit offline permission required by default', () => {
  for (const offline of ['UNKNOWN', 'NO']) assert.ok(codes(mutatedSurface({ offline })).has('OFFLINE_NOT_YES'));
});
test('offline requirement can be disabled only explicitly', () => {
  const result = auditCheckpoint(mutatedSurface({ offline: 'UNKNOWN' }), { requireOffline: false });
  assert.ok(!result.findings.some(f => f.code === 'OFFLINE_NOT_YES'));
});
test('keyboard and screen-reader evidence must be YES', () => {
  assert.ok(codes(mutatedSurface({ keyboard: 'UNKNOWN' })).has('KEYBOARD_NOT_YES'));
  assert.ok(codes(mutatedSurface({ screenReader: 'NO' })).has('SCREEN_READER_NOT_YES'));
});
test('target dimensions block at 43 and allow 44', () => {
  assert.ok(codes(mutatedSurface({ targetPx: 43 })).has('TARGET_TOO_SMALL'));
  assert.ok(!codes(mutatedSurface({ targetPx: 44 })).has('TARGET_TOO_SMALL'));
  assert.ok(codes(mutatedSurface({ targetPx: 'UNKNOWN' })).has('TARGET_UNKNOWN'));
});
test('configured threshold cannot relax below 44', () => {
  for (const size of [0, 20, 43, -1, 44.3]) assert.throws(() => auditCheckpoint(checkpointFixture(), { minimumTargetPx: size }), RangeError);
});
test('manual comparison date flags future evidence only when supplied', () => {
  assert.ok(codes(mutatedSource({ termsDate: '2026-12-01' })).has('FUTURE_EVIDENCE_DATE'));
  const value = checkpointFixture({ comparisonDate: 'UNKNOWN', sources: [sourceFixture({ termsDate: '2026-12-01' })] });
  assert.ok(!codes(value).has('FUTURE_EVIDENCE_DATE'));
});
test('decisions predating reviewed terms block', () => {
  assert.ok(codes(mutatedSource({ termsDate: '2026-10-20', decisionDate: '2026-10-11' })).has('DECISION_PRECEDES_TERMS'));
});
test('matching evidence and source URLs produce attention rather than fake proof', () => {
  const result = auditCheckpoint(mutatedSource({ evidenceUrl: 'https://example.org/data' }));
  assert.ok(result.findings.some(f => f.code === 'SAME_REFERENCE_URL' && f.level === 'attention'));
});
test('surface publication dates remain unknown unless provided', () => {
  assert.ok(codes(checkpointFixture()).has('PUBLICATION_DATE_UNKNOWN'));
});
test('map credit is requested only for explicitly map-labelled surfaces', () => {
  assert.ok(codes(mutatedSurface({ mode: 'map', title: 'Map of stations', mapCredit: 'UNKNOWN' })).has('MAP_CREDIT_NOT_YES'));
  assert.ok(!codes(mutatedSurface({ mode: 'list', title: 'Map of stations', mapCredit: 'UNKNOWN' })).has('MAP_CREDIT_NOT_YES'));
});
test('included sources without linked surfaces create attention', () => {
  const checkpoint = checkpointFixture({ sources: [sourceFixture(), sourceFixture({ id: 'unlinked-source' })] });
  assert.ok(auditCheckpoint(checkpoint).findings.some(f => f.code === 'INCLUDED_SOURCE_UNUSED' && f.level === 'attention'));
});
test('regression comparison starts clean on matching documents', () => {
  const result = compareCheckpoints(checkpointFixture(), checkpointFixture());
  assert.equal(result.blocked, false);
  assert.equal(result.changes.length, 0);
});
test('removing an included source is blocking regression', () => {
  const result = compareCheckpoints(checkpointFixture(), checkpointFixture({ sources: [] }));
  assert.ok(result.changes.some(c => c.code === 'SOURCE_REMOVED' && c.blocking));
});
test('revoking permission is blocking regression', () => {
  const result = compareCheckpoints(checkpointFixture(), mutatedSource({ permission: 'UNKNOWN' }));
  assert.ok(result.changes.some(c => c.code === 'SOURCE_PERMISSION' && c.blocking));
});
test('licence changes are visible and blocking for included records', () => {
  const result = compareCheckpoints(checkpointFixture(), mutatedSource({ licenceUrl: 'https://example.org/other-terms' }));
  assert.ok(result.changes.some(c => c.code === 'SOURCE_LICENCEURL' && c.blocking));
});
test('surface removal is a regression', () => {
  const result = compareCheckpoints(checkpointFixture(), checkpointFixture({ surfaces: [] }));
  assert.ok(result.changes.some(c => c.code === 'SURFACE_REMOVED' && c.blocking));
});
test('reordering a source ID set is not a regression', () => {
  const before = checkpointFixture({ sources: [sourceFixture(), sourceFixture({ id: 'other-source' })], surfaces: [surfaceFixture({ sourceIds: ['sample-source', 'other-source'] })] });
  const after = checkpointFixture({ sources: before.sources, surfaces: [surfaceFixture({ sourceIds: ['other-source', 'sample-source'] })] });
  assert.equal(compareCheckpoints(before, after).changes.filter(c => c.code === 'SURFACE_SOURCEIDS').length, 0);
});
test('increasing a control target does not block', () => {
  const result = compareCheckpoints(checkpointFixture(), mutatedSurface({ targetPx: 48 }));
  assert.ok(result.changes.some(c => c.code === 'SURFACE_TARGETPX' && !c.blocking));
});
test('decreasing a target does block', () => {
  const result = compareCheckpoints(mutatedSurface({ targetPx: 48 }), checkpointFixture());
  assert.ok(result.changes.some(c => c.code === 'SURFACE_TARGETPX' && c.blocking));
});
