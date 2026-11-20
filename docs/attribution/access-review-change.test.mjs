import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareAccessReviews, changesForSurface, changesForSource,
  summarizeAccessReviewChanges,
} from './access-review-change.mjs';
import { reviewRelease, reviewSource, reviewSurface, reviewTarget, reviewObservation } from './access-review-fixtures.mjs';
import { UNKNOWN } from './access-review-core.mjs';
const baseline = () => reviewRelease();
const compare = after => compareAccessReviews(baseline(), after);
function change(field, value, entity = 'target') {
  const r = baseline();
  if (entity === 'source') r.sources[0][field] = value;
  else if (entity === 'surface') r.surfaces[0][field] = value;
  else if (entity === 'observation') r.surfaces[0].targets[0].observations[0][field] = value;
  else r.surfaces[0].targets[0][field] = value;
  return r;
}
function expects(after, kind, level = 'block') {
  const result = compare(after);
  assert.ok(result.changes.some(c => c.kind === kind && c.level === level), `${kind}/${level}: ${JSON.stringify(result.changes)}`);
  return result;
}

test('same release produces no changes', () => {
  const result = compare(baseline());
  assert.equal(result.changes.length, 0);
  assert.equal(result.blocked, false);
});
test('different release ID alone does not erase source history', () => {
  const next = baseline();
  next.releaseId = 'next-release';
  const result = compare(next);
  assert.equal(result.beforeReleaseId, 'release-one');
  assert.equal(result.afterReleaseId, 'next-release');
  assert.equal(result.changes.length, 0);
});
test('removed included source blocks', () => expects(reviewRelease({ sources: [] }), 'source-removed'));
test('removed held source is review-only', () => {
  const before = baseline();
  before.sources.push(reviewSource({ id: 'held-source', status: 'held' }));
  const result = compareAccessReviews(before, baseline());
  assert.ok(result.changes.some(c => c.kind === 'source-removed' && c.level === 'review'));
});
test('added source appears in history', () => {
  const r = baseline();
  r.sources.push(reviewSource({ id: 'new-source', status: 'held' }));
  expects(r, 'source-added', 'review');
});
test('changed licence is a release regression', () => expects(change('licence', 'OTHER-OPEN', 'source'), 'source-changed'));
test('changed provider is material', () => expects(change('provider', 'other', 'source'), 'source-changed'));
test('changed source URL is material', () => expects(change('sourceUrl', 'https://example.org/new', 'source'), 'source-changed'));
test('changed licence URL is material', () => expects(change('licenceUrl', 'https://example.org/terms', 'source'), 'source-changed'));
test('changed notice text blocks', () => expects(change('notice', 'Altered', 'source'), 'source-changed'));
test('new review tier is tracked', () => expects(change('tier', 'community', 'source'), 'source-changed'));
test('lost positive permission blocks', () => expects(change('permission', UNKNOWN, 'source'), 'source-changed'));
test('explicit NO permission blocks', () => expects(change('permission', 'NO', 'source'), 'source-changed'));
test('permission improvements are review changes', () => {
  const before = change('permission', UNKNOWN, 'source');
  const result = compareAccessReviews(before, baseline());
  assert.ok(result.changes.some(c => c.path === 'sources.osm-record.permission' && c.level === 'review'));
});
test('source changed to held blocks', () => expects(change('status', 'held', 'source'), 'source-changed'));
test('source changed to excluded blocks', () => expects(change('status', 'excluded', 'source'), 'source-changed'));
test('new dataset date does not create an assumed accessibility claim', () => {
  const r = change('datasetDate', '2026-11-12', 'source');
  const result = compare(r);
  assert.ok(result.changes.some(c => c.path.endsWith('.datasetDate') && c.level === 'review'));
});
test('losing known dataset date is tracked', () => {
  const before = change('datasetDate', '2026-11-01', 'source');
  const result = compareAccessReviews(before, baseline());
  assert.ok(result.changes.some(c => c.path.endsWith('datasetDate') && c.level === 'review'));
});
test('losing known acquisition date blocks', () => expects(change('acquiredDate', UNKNOWN, 'source'), 'source-changed'));
test('losing terms date blocks', () => expects(change('termsDate', UNKNOWN, 'source'), 'source-changed'));
test('removed included surface blocks', () => expects(reviewRelease({ surfaces: [] }), 'surface-removed'));
test('removed held surface remains tracked without fabricated impact', () => {
  const before = baseline();
  before.surfaces.push(reviewSurface({ id: 'held-surface', route: 'pages/held.html', status: 'held' }));
  const result = compareAccessReviews(before, baseline());
  assert.ok(result.changes.some(c => c.kind === 'surface-removed' && c.level === 'review'));
});
test('new surface is reported', () => {
  const r = baseline();
  r.surfaces.push(reviewSurface({ id: 'second', route: 'pages/other.html', status: 'held' }));
  expects(r, 'surface-added', 'review');
});
test('changed route is a material publication change', () => expects(change('route', 'pages/other.html', 'surface'), 'surface-changed'));
test('changed locale is material', () => expects(change('locale', 'fr', 'surface'), 'surface-changed'));
test('removed source reference is material', () => expects(change('sourceIds', [], 'surface'), 'surface-changed'));
test('added source reference is recorded for review', () => {
  const r = change('sourceIds', ['osm-record', 'new-source'], 'surface');
  const result = compare(r);
  assert.ok(result.changes.some(c => c.path.endsWith('sourceIds') && c.level === 'review'));
});
test('offline YES changing to UNKNOWN blocks', () => expects(change('offline', UNKNOWN, 'surface'), 'surface-changed'));
test('offline YES changing to NO blocks', () => expects(change('offline', 'NO', 'surface'), 'surface-changed'));
test('recording offline YES from UNKNOWN does not block by itself', () => {
  const result = compareAccessReviews(change('offline', UNKNOWN, 'surface'), baseline());
  assert.ok(result.changes.some(c => c.path.endsWith('offline') && c.level === 'review'));
});
test('surface removed from publication blocks', () => expects(change('status', 'held', 'surface'), 'surface-changed'));
test('removed target blocks', () => {
  const r = baseline();
  r.surfaces[0].targets.shift();
  expects(r, 'notice-target-removed');
});
test('new target is recorded without assuming its quality', () => {
  const r = baseline();
  r.surfaces[0].targets.push(reviewTarget('terms', 'extra', { id: 'added-notice' }));
  expects(r, 'notice-target-added', 'review');
});
test('changed notice kind blocks', () => expects(change('kind', 'ogl'), 'notice-target-changed'));
test('changed notice source ID blocks', () => expects(change('sourceId', 'other-source'), 'notice-target-changed'));
test('changed target text blocks', () => expects(change('text', 'Altered notice'), 'notice-target-changed'));
test('notice hidden after prior visibility blocks', () => expects(change('visible', 'NO'), 'notice-target-changed'));
test('visibility becomes UNKNOWN and blocks', () => expects(change('visible', UNKNOWN), 'notice-target-changed'));
test('keyboard access lost blocks', () => expects(change('keyboard', 'NO'), 'notice-target-changed'));
test('focus visibility lost blocks', () => expects(change('focusVisible', UNKNOWN), 'notice-target-changed'));
test('screen-reader label lost blocks', () => expects(change('screenReader', 'NO'), 'notice-target-changed'));
test('touch target shrinking by one pixel blocks', () => expects(change('widthPx', 43), 'notice-target-changed'));
test('touch target height shrinking blocks', () => expects(change('heightPx', 43), 'notice-target-changed'));
test('touch target enlarging does not produce a regression', () => {
  const result = compare(change('widthPx', 56));
  assert.ok(result.changes.some(c => c.path.endsWith('widthPx') && c.level === 'review'));
});
test('known width turning UNKNOWN blocks', () => expects(change('widthPx', UNKNOWN), 'notice-target-changed'));
test('review date lost blocks', () => expects(change('testedDate', UNKNOWN), 'notice-target-changed'));
test('evidence URL lost blocks as a history regression', () => expects(change('evidenceUrl', UNKNOWN), 'notice-target-changed'));
test('removed technique observation blocks', () => {
  const r = baseline();
  r.surfaces[0].targets[0].observations.shift();
  expects(r, 'observation-removed');
});
test('added passing technique observation is review-only', () => {
  const before = baseline();
  before.surfaces[0].targets[0].observations = [reviewObservation('keyboard')];
  const result = compareAccessReviews(before, baseline());
  assert.ok(result.changes.some(c => c.kind === 'observation-added' && c.level === 'review'));
});
test('PASS turning FAIL blocks', () => expects(change('result', 'FAIL', 'observation'), 'observation-changed'));
test('PASS turning UNKNOWN blocks', () => expects(change('result', UNKNOWN, 'observation'), 'observation-changed'));
test('FAIL turning PASS is a review improvement', () => {
  const before = change('result', 'FAIL', 'observation');
  const result = compareAccessReviews(before, baseline());
  assert.ok(result.changes.some(c => c.kind === 'observation-changed' && c.path.endsWith('.result') && c.level === 'review'));
});
test('observation reference loss blocks', () => expects(change('referenceUrl', UNKNOWN, 'observation'), 'observation-changed'));
test('observation note changes remain review-only', () => {
  const result = compare(change('note', 'Updated observation details', 'observation'));
  assert.ok(result.changes.some(c => c.path.endsWith('.note') && c.level === 'review'));
});
test('new audit blockers are included in comparison', () => {
  const result = compare(change('visible', 'NO'));
  assert.ok(result.changes.some(c => c.kind === 'new-release-blocker' && c.after === 'NOTICE_HIDDEN'));
});
test('changes for an individual surface do not contain unrelated sources', () => {
  const result = compare(change('visible', 'NO'));
  assert.ok(changesForSurface(result, 'map-en').length > 0);
  assert.deepEqual(changesForSurface(result, 'none'), []);
});
test('changes for an individual source are target-aware', () => {
  const result = compare(change('text', 'Altered'));
  assert.ok(changesForSource(result, 'osm-record').length > 0);
  assert.deepEqual(changesForSource(result, 'other'), []);
});
test('summary groups change kinds with blocking counts', () => {
  const result = compare(change('visible', 'NO'));
  const summary = summarizeAccessReviewChanges(result);
  assert.ok(summary.some(item => item.kind === 'notice-target-changed' && item.blocking > 0));
  assert.equal(summary.reduce((n, row) => n + row.count, 0), result.changes.length);
});
test('before/after audits retain independent release IDs', () => {
  const after = change('visible', 'NO');
  after.releaseId = 'new-release';
  const result = compare(after);
  assert.equal(result.beforeAudit.releaseId, 'release-one');
  assert.equal(result.afterAudit.releaseId, 'new-release');
});
test('comparison does not mutate either input', () => {
  const before = baseline();
  const after = change('visible', 'NO');
  const old = JSON.stringify(before);
  const next = JSON.stringify(after);
  compareAccessReviews(before, after);
  assert.equal(JSON.stringify(before), old);
  assert.equal(JSON.stringify(after), next);
});
