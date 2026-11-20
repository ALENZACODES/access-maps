import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLocaleQa, changesByEntity, blockingChanges } from './locale-qa-change.mjs';
import { fixtureRelease, withSource, withPage, withNotice, copyFixture } from './locale-qa-fixtures.mjs';

const before = fixtureRelease();
const compare = next => compareLocaleQa(before, next);
const changed = (next, field) => compare(next).changes.filter(x => x.field === field);
const expected = (next, field, blocking) => {
  const result = changed(next, field);
  assert.ok(result.length > 0, `No change for ${field}`);
  assert.ok(result.some(x => x.blocking === blocking), `Wrong blocking state for ${field}`);
};

test('unchanged releases have no changes', () => {
  const result = compare(copyFixture(before));
  assert.deepEqual(result.changes, []);
  assert.equal(result.blocked, false);
});
test('release comparison records source IDs', () => {
  assert.equal(compare(before).beforeReleaseId, 'release-one');
  assert.equal(compare(before).afterReleaseId, 'release-one');
});
test('a source removal is a blocking change', () => {
  const result = compare({ ...before, sources: [] });
  assert.ok(result.changes.some(x => x.kind === 'source-removed' && x.blocking));
  assert.equal(result.blocked, true);
});
test('adding a source is nonblocking by itself', () => {
  const result = compare({ ...before, sources: [...before.sources, { ...before.sources[0], id: 'new-source', status: 'held' }] });
  assert.ok(result.changes.some(x => x.kind === 'source-added' && !x.blocking));
});
test('source provider changes require release review', () => {
  expected(withSource(before, { provider: 'other' }), 'provider', true);
});
test('source licence family changes are blocking', () => {
  expected(withSource(before, { terms: 'OTHER-OPEN' }), 'terms', true);
});
test('source origin changes are blocking', () => {
  expected(withSource(before, { sourceUrl: 'https://example.org/dataset' }), 'sourceUrl', true);
});
test('source licence URL changes are blocking', () => {
  expected(withSource(before, { licenceUrl: 'https://example.org/terms' }), 'licenceUrl', true);
});
test('source licence name changes are blocking', () => {
  expected(withSource(before, { licenceName: 'Another Open Licence' }), 'licenceName', true);
});
test('permission loss blocks a release', () => {
  expected(withSource(before, { permission: 'UNKNOWN' }), 'permission', true);
  expected(withSource(before, { permission: 'NO' }), 'permission', true);
});
test('licence evidence loss blocks a release', () => {
  expected(withSource(before, { licenceEvidence: 'NO' }), 'licenceEvidence', true);
});
test('losing a known acquisition date blocks', () => {
  expected(withSource(before, { acquiredDate: 'UNKNOWN' }), 'acquiredDate', true);
});
test('moving a terms date earlier blocks', () => {
  expected(withSource(before, { termsDate: '2026-01-01' }), 'termsDate', true);
});
test('moving a terms date later is surfaced but not a regression block', () => {
  expected(withSource(before, { termsDate: '2026-02-12' }), 'termsDate', false);
});
test('loss of source evidence tier is a regression', () => {
  expected(withSource(before, { evidenceTier: 'UNKNOWN' }), 'evidenceTier', true);
});
test('the source display name change is recorded as review', () => {
  expected(withSource(before, { name: 'Updated map data' }), 'name', false);
});
test('known dataset date lost to UNKNOWN blocks regression', () => {
  const previous = withSource(before, { datasetDate: '2026-02-10' });
  const result = compareLocaleQa(previous, before);
  assert.ok(result.changes.some(x => x.field === 'datasetDate' && x.blocking));
});
test('UNKNOWN dataset date becoming known is an improvement', () => {
  expected(withSource(before, { datasetDate: '2026-02-10' }), 'datasetDate', false);
});
test('source removal from included to held blocks', () => {
  expected(withSource(before, { status: 'held' }), 'status', true);
});
test('a page removal blocks release comparisons', () => {
  const result = compare({ ...before, pages: [before.pages[0]] });
  assert.ok(result.changes.some(x => x.kind === 'page-removed' && x.blocking));
});
test('new publication page is recorded but not automatically a regression', () => {
  const page = { ...before.pages[0], id: 'new-page', route: 'pages/new.html', locale: 'en' };
  const result = compare({ ...before, pages: [...before.pages, page] });
  assert.ok(result.changes.some(x => x.kind === 'page-added' && !x.blocking));
});
test('changing the page route is blocking', () => {
  expected(withPage(before, 'page-en', { route: 'pages/new-route.html' }), 'route', true);
});
test('changing the page locale is blocking', () => {
  expected(withPage(before, 'page-en', { locale: 'fr' }), 'locale', true);
});
test('changing page display mode is blocking', () => {
  expected(withPage(before, 'page-en', { display: 'download' }), 'display', true);
});
test('losing a source link on a page blocks', () => {
  expected(withPage(before, 'page-en', { sourceIds: [] }), 'sourceIds', true);
});
test('changing page offline YES to UNKNOWN blocks', () => {
  expected(withPage(before, 'page-en', { offline: 'UNKNOWN' }), 'offline', true);
});
test('changing page offline YES to NO blocks', () => {
  expected(withPage(before, 'page-en', { offline: 'NO' }), 'offline', true);
});
test('reducing a page target from 44 to 43 blocks', () => {
  expected(withPage(before, 'page-en', { targetPx: 43 }), 'targetPx', true);
});
test('increasing a page target from 44 to 64 is not a regression', () => {
  expected(withPage(before, 'page-en', { targetPx: 64 }), 'targetPx', false);
});
test('target dimension becoming UNKNOWN blocks', () => {
  expected(withPage(before, 'page-en', { targetPx: 'UNKNOWN' }), 'targetPx', true);
});
test('publication date lost to UNKNOWN blocks a regression', () => {
  expected(withPage(before, 'page-en', { publishedDate: 'UNKNOWN' }), 'publishedDate', true);
});
test('earlier publication date is flagged as a regression', () => {
  expected(withPage(before, 'page-en', { publishedDate: '2026-01-01' }), 'publishedDate', true);
});
test('publication date moved later is a review change', () => {
  expected(withPage(before, 'page-en', { publishedDate: '2026-03-01' }), 'publishedDate', false);
});
test('included page becoming held blocks', () => {
  expected(withPage(before, 'page-en', { publicStatus: 'held' }), 'publicStatus', true);
});
test('removing a notice from an included page blocks', () => {
  const value = withPage(before, 'page-en', { notices: [before.pages[0].notices[0]] });
  const result = compare(value);
  assert.ok(result.changes.some(x => x.kind === 'notice-removed' && x.blocking));
});
test('adding a notice is recorded for review', () => {
  const next = copyFixture(before);
  next.pages[0].notices.push({ ...next.pages[0].notices[0], id: 'extra-credit' });
  assert.ok(compare(next).changes.some(x => x.kind === 'notice-added' && !x.blocking));
});
test('changing a notice source ID blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { sourceId: 'other-source' }), 'sourceId', true);
});
test('changing notice text blocks, even with same licence family', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { text: 'New attribution text' }), 'text', true);
});
test('changing notice kind blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { kind: 'licence' }), 'kind', true);
});
test('changing notice terms URL blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { licenceUrl: 'https://example.org/terms' }), 'licenceUrl', true);
});
test('notice visibility YES to UNKNOWN blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { visible: 'UNKNOWN' }), 'visible', true);
});
test('notice visibility YES to NO blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { visible: 'NO' }), 'visible', true);
});
test('map credit losing near-content placement blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { nearContent: 'NO' }), 'nearContent', true);
});
test('notice target shrinking blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { targetPx: 43 }), 'targetPx', true);
});
test('notice target increase is a nonblocking improvement', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { targetPx: 56 }), 'targetPx', false);
});
test('notice keyboard evidence regression blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { keyboard: 'NO' }), 'keyboard', true);
});
test('notice screen-reader evidence regression blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { screenReader: 'UNKNOWN' }), 'screenReader', true);
});
test('notice contrast evidence regression blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { contrast: 'NO' }), 'contrast', true);
});
test('accepted review becoming pending blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { review: 'pending' }), 'review', true);
});
test('review date becoming UNKNOWN blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { reviewDate: 'UNKNOWN' }), 'reviewDate', true);
});
test('review date moving earlier blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { reviewDate: '2026-01-01' }), 'reviewDate', true);
});
test('review date moving later is recorded without regression block', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { reviewDate: '2026-03-01' }), 'reviewDate', false);
});
test('losing review evidence URL blocks', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { evidenceUrl: 'UNKNOWN' }), 'evidenceUrl', true);
});
test('review evidence note edits remain nonblocking changes', () => {
  expected(withNotice(before, 'page-en', 'osm-credit', { evidenceNote: 'An expanded local note' }), 'evidenceNote', false);
});
test('reducing the bilingual publication policy blocks', () => {
  const result = compare({ ...before, requireBilingual: false });
  assert.ok(result.changes.some(x => x.field === 'requireBilingual' && x.blocking));
});
test('adding a bilingual requirement is not itself a regression', () => {
  const previous = { ...before, requireBilingual: false };
  const result = compareLocaleQa(previous, before);
  assert.ok(result.changes.some(x => x.field === 'requireBilingual' && !x.blocking));
});
test('blockingChanges returns only true regression changes', () => {
  const result = compare(withNotice(before, 'page-en', 'osm-credit', { targetPx: 43 }));
  assert.ok(blockingChanges(result).length > 0);
  assert.ok(blockingChanges(result).every(x => x.blocking));
});
test('changesByEntity includes notices under their page', () => {
  const result = compare(withNotice(before, 'page-en', 'osm-credit', { visible: 'NO' }));
  assert.ok(changesByEntity(result, 'page-en').length > 0);
});
test('a new blocking finding is recorded by code', () => {
  const result = compare(withSource(before, { permission: 'UNKNOWN' }));
  assert.ok(result.newlyBlockingCodes.includes('SOURCE_PERMISSION_MISSING'));
});
test('comparison cannot claim no blockers when the current audit blocks', () => {
  const result = compare(withNotice(before, 'page-fr', 'credit-fr', { visible: 'NO' }));
  assert.equal(result.blocked, true);
  assert.equal(result.afterAudit.blocked, true);
});
test('changes are deterministically ordered by entity and field', () => {
  const value = withNotice(withSource(before, { permission: 'NO' }), 'page-en', 'osm-credit', { targetPx: 43 });
  const result = compare(value);
  const sorted = [...result.changes].sort((a,b) => a.entity.localeCompare(b.entity) || a.field.localeCompare(b.field) || a.kind.localeCompare(b.kind));
  assert.deepEqual(result.changes, sorted);
});
