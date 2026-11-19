import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareObligationRegisters, affectedPages, OBLIGATION_CHANGE_FIELDS,
} from './obligation-change.mjs';
import { parseObligationRegister } from './obligation-core.mjs';
import { obligation, frenchPair, source, placement, witness, page } from './obligation-fixtures.mjs';
function compare(before, after) {
  return compareObligationRegisters(parseObligationRegister(before), parseObligationRegister(after));
}
function changed(after, section, patch) {
  after[section][0] = { ...after[section][0], ...patch };
  return after;
}
function check(before, after, kind, field, severity) {
  const result = compare(before, after);
  const entry = result.changes.find(x => x.kind === kind && x.field === field);
  assert.ok(entry, `${kind}/${field} missing from ${JSON.stringify(result.changes)}`);
  assert.equal(entry.severity, severity);
  return result;
}
test('same register produces no change findings', () => {
  const input = obligation();
  assert.deepEqual(compare(input, structuredClone(input)).changes, []);
});
test('identical source reordered without field changes yields no diff', () => {
  const before = frenchPair();
  const after = structuredClone(before);
  after.pages.reverse();
  after.placements.reverse();
  assert.deepEqual(compare(before, after).changes, []);
});
test('different release IDs remain in comparison metadata', () => {
  const before = obligation();
  const after = { ...obligation(), releaseId: 'release-next' };
  const result = compare(before, after);
  assert.equal(result.beforeRelease, 'release-example');
  assert.equal(result.afterRelease, 'release-next');
});
test('source removed is a blocker even when page is also edited', () => {
  const before = obligation();
  const after = obligation({ sources: [] });
  check(before, after, 'source-removed', 'id', 'block');
});
test('new source alone is review-only', () => {
  const before = obligation();
  const after = obligation();
  after.sources.push(source({ id: 'new-source', state: 'held' }));
  check(before, after, 'source-added', 'id', 'review');
});
test('page removal blocks release', () => {
  const before = obligation();
  const after = obligation({ pages: [] });
  check(before, after, 'page-removed', 'id', 'block');
});
test('page addition is visible as review', () => {
  const before = obligation();
  const after = obligation();
  after.pages.push(page({ id: 'second-page', path: 'pages/second.html', sourceIds: [] }));
  check(before, after, 'page-added', 'id', 'review');
});
test('placement removal blocks release', () => {
  const before = obligation();
  const after = obligation();
  after.placements.pop();
  check(before, after, 'placement-removed', 'id', 'block');
});
test('placement addition is visible as review', () => {
  const before = obligation();
  const after = obligation();
  after.placements.push(placement({ id: 'extra-credit', elementId: 'extra-credit' }));
  check(before, after, 'placement-added', 'id', 'review');
});
test('witness removal blocks release', () => {
  const before = obligation();
  const after = obligation({ witnesses: [] });
  check(before, after, 'witness-removed', 'id', 'block');
});
test('witness addition is visible as review', () => {
  const before = obligation();
  const after = obligation();
  after.witnesses.push(witness({ id: 'second-witness' }));
  check(before, after, 'witness-added', 'id', 'review');
});
test('lost permission blocks and is visible as source change', () => {
  check(obligation(), changed(obligation(), 'sources', { permission: 'UNKNOWN' }), 'source-changed', 'permission', 'block');
});
test('permission denial blocks and is visible as source change', () => {
  check(obligation(), changed(obligation(), 'sources', { permission: 'NO' }), 'source-changed', 'permission', 'block');
});
test('permission improvement is review instead of regression', () => {
  const before = changed(obligation(), 'sources', { permission: 'UNKNOWN' });
  const after = obligation();
  check(before, after, 'source-changed', 'permission', 'review');
});
test('licence code changed blocks release comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { licenceId: 'different-code' }), 'source-changed', 'licenceId', 'block');
});
test('licence name changed blocks release comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { licenceName: 'Another Licence' }), 'source-changed', 'licenceName', 'block');
});
test('licence URL changed blocks release comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { licenceUrl: 'https://example.org/terms' }), 'source-changed', 'licenceUrl', 'block');
});
test('source origin changed blocks release comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { sourceUrl: 'https://example.org/source' }), 'source-changed', 'sourceUrl', 'block');
});
test('source name changed is not a licence-rights regression', () => {
  check(obligation(), changed(obligation(), 'sources', { title: 'Different source title' }), 'source-changed', 'title', 'review');
});
test('source provider changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { provider: 'other' }), 'source-changed', 'provider', 'block');
});
test('source evidence tier becoming UNKNOWN blocks comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { tier: 'UNKNOWN' }), 'source-changed', 'tier', 'block');
});
test('source evidence tier improvement is nonblocking review', () => {
  const before = changed(obligation(), 'sources', { tier: 'UNKNOWN' });
  check(before, obligation(), 'source-changed', 'tier', 'review');
});
test('terms review date changed is a blocker for inspection', () => {
  check(obligation(), changed(obligation(), 'sources', { termsReviewedOn: '2026-01-06' }), 'source-changed', 'termsReviewedOn', 'block');
});
test('acquisition date changed is a blocker for inspection', () => {
  check(obligation(), changed(obligation(), 'sources', { acquiredOn: '2026-01-06' }), 'source-changed', 'acquiredOn', 'block');
});
test('dataset date change is visible but not treated as lost permission', () => {
  check(obligation(), changed(obligation(), 'sources', { datasetAsOf: '2026-01-02' }), 'source-changed', 'datasetAsOf', 'review');
});
test('source attribution text altered blocks comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { attribution: 'Different notice' }), 'source-changed', 'attribution', 'block');
});
test('included source becoming held blocks comparison', () => {
  check(obligation(), changed(obligation(), 'sources', { state: 'held' }), 'source-changed', 'state', 'block');
});
test('held source becoming included is review', () => {
  const before = changed(obligation(), 'sources', { state: 'held' });
  check(before, obligation(), 'source-changed', 'state', 'review');
});
test('route changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { path: 'pages/another.html' }), 'page-changed', 'path', 'block');
});
test('page locale changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { locale: 'fr' }), 'page-changed', 'locale', 'block');
});
test('page display mode changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { display: 'download' }), 'page-changed', 'display', 'block');
});
test('removed page source ID blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { sourceIds: [] }), 'page-changed', 'sourceIds', 'block');
});
test('page offline status lost blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { offline: 'UNKNOWN' }), 'page-changed', 'offline', 'block');
});
test('offline status improved from unknown is review', () => {
  const before = changed(obligation(), 'pages', { offline: 'UNKNOWN' });
  check(before, obligation(), 'page-changed', 'offline', 'review');
});
test('page keyboard evidence lost blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { keyboard: 'NO' }), 'page-changed', 'keyboard', 'block');
});
test('page screen-reader evidence lost blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { screenReader: 'UNKNOWN' }), 'page-changed', 'screenReader', 'block');
});
test('target reduced from 44 to 43 blocks comparison', () => {
  check(obligation(), changed(obligation(), 'pages', { targetPx: 43 }), 'page-changed', 'targetPx', 'block');
});
test('target increased from 44 to 56 is a nonblocking review', () => {
  check(obligation(), changed(obligation(), 'pages', { targetPx: 56 }), 'page-changed', 'targetPx', 'review');
});
test('target unchanged produces no target finding', () => {
  const result = compare(obligation(), obligation());
  assert.ok(!result.changes.some(x => x.field === 'targetPx'));
});
test('published-on date change remains visible without speculation', () => {
  check(obligation(), changed(obligation(), 'pages', { publishedOn: '2026-01-06' }), 'page-changed', 'publishedOn', 'review');
});
test('placement notice text mutation blocks comparison', () => {
  check(obligation(), changed(obligation(), 'placements', { notice: 'Updated notice' }), 'placement-changed', 'notice', 'block');
});
test('placement visibility lost blocks comparison', () => {
  check(obligation(), changed(obligation(), 'placements', { visibility: 'absent' }), 'placement-changed', 'visibility', 'block');
});
test('placement visibility improves without regression block', () => {
  const before = changed(obligation(), 'placements', { visibility: 'UNKNOWN' });
  check(before, obligation(), 'placement-changed', 'visibility', 'review');
});
test('placement map adjacency lost blocks comparison', () => {
  check(obligation(), changed(obligation(), 'placements', { nearMap: 'UNKNOWN' }), 'placement-changed', 'nearMap', 'block');
});
test('placement map adjacency improves without regression block', () => {
  const before = changed(obligation(), 'placements', { nearMap: 'UNKNOWN' });
  check(before, obligation(), 'placement-changed', 'nearMap', 'review');
});
test('placement witness removed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'placements', { witnessIds: [] }), 'placement-changed', 'witnessIds', 'block');
});
test('placement element ID changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'placements', { elementId: 'different-element' }), 'placement-changed', 'elementId', 'block');
});
test('witness source link changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'witnesses', { sourceId: 'different-source' }), 'witness-changed', 'sourceId', 'block');
});
test('witness source URL changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'witnesses', { url: 'https://example.org/evidence' }), 'witness-changed', 'url', 'block');
});
test('witness evidence date changed blocks comparison', () => {
  check(obligation(), changed(obligation(), 'witnesses', { recordedOn: '2026-01-06' }), 'witness-changed', 'recordedOn', 'block');
});
test('witness note-only edit remains review', () => {
  check(obligation(), changed(obligation(), 'witnesses', { note: 'Additional context' }), 'witness-changed', 'note', 'review');
});
test('comparison identifies newly introduced release blockers', () => {
  const result = compare(obligation(), changed(obligation(), 'sources', { permission: 'UNKNOWN' }));
  assert.ok(result.changes.some(x => x.kind === 'new-blocker'));
});
test('comparison identifies resolved release blockers', () => {
  const result = compare(changed(obligation(), 'sources', { permission: 'UNKNOWN' }), obligation());
  assert.ok(result.changes.some(x => x.kind === 'resolved-blocker'));
});
test('comparison blocked state includes audit of candidate', () => {
  const result = compare(obligation(), changed(obligation(), 'sources', { permission: 'NO' }));
  assert.equal(result.afterAudit.blocked, true);
  assert.equal(result.blocked, true);
});
test('comparison never silently clears an unresolved current blocker', () => {
  const bad = changed(obligation(), 'sources', { permission: 'NO' });
  const result = compare(bad, structuredClone(bad));
  assert.equal(result.blocked, true);
});
test('affected page index traces source licence change', () => {
  const pages = affectedPages(obligation(), changed(obligation(), 'sources', { licenceId: 'other' }));
  assert.deepEqual(pages, ['map-en']);
});
test('affected page index traces witness changes through placements', () => {
  const pages = affectedPages(obligation(), changed(obligation(), 'witnesses', { recordedOn: '2026-02-02' }));
  assert.deepEqual(pages, ['map-en']);
});
test('affected page index traces placement changes', () => {
  const pages = affectedPages(obligation(), changed(obligation(), 'placements', { notice: 'Different' }));
  assert.deepEqual(pages, ['map-en']);
});
test('affected page index returns no pages for identical registers', () => {
  assert.deepEqual(affectedPages(obligation(), obligation()), []);
});
test('all declared change fields are deduplicated', () => {
  for (const fields of Object.values(OBLIGATION_CHANGE_FIELDS)) {
    assert.equal(new Set(fields).size, fields.length);
  }
});
test('comparison inputs remain unchanged', () => {
  const before = frenchPair();
  const after = structuredClone(before);
  after.sources[0].datasetAsOf = '2026-01-02';
  const saveBefore = structuredClone(before);
  const saveAfter = structuredClone(after);
  compare(before, after);
  assert.deepEqual(before, saveBefore);
  assert.deepEqual(after, saveAfter);
});
