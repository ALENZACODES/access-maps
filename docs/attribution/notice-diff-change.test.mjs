import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoticeRelease, UNKNOWN } from './notice-diff-core.mjs';
import { compareNoticeReleases, impactsForSurface, impactsForSource, summarizeNoticeChanges, CHANGE_FIELDS } from './notice-diff-change.mjs';
import { release, source, notice, licenceNotice, surface, mutateSource, mutateNotice, mutateSurface } from './notice-diff-fixtures.mjs';
function compare(a, b) { return compareNoticeReleases(parseNoticeRelease(a), parseNoticeRelease(b)); }
function changed(result, kind, field) { return result.changes.find(c => c.kind === kind && c.field === field); }
function severity(result, kind, field) { return changed(result, kind, field)?.severity; }

test('identical releases have no semantic changes', () => {
  const result = compare(release(), release());
  assert.equal(result.changes.length, 0);
  assert.equal(result.blocked, false);
});
test('comparison retains release identities', () => {
  const result = compare(release(), release({ releaseId: 'release-two' }));
  assert.equal(result.fromRelease, 'release-one');
  assert.equal(result.toRelease, 'release-two');
});
test('new included source is a review item', () => {
  const next = release({ sources: [source(), source({ id: 'another-source', state: 'held' })] });
  const result = compare(release(), next);
  assert.equal(severity(result, 'source-added', 'id'), 'review');
});
test('removing a used source blocks', () => {
  const result = compare(release(), release({ sources: [] }));
  assert.equal(severity(result, 'source-removed', 'id'), 'block');
});
test('removing an excluded source is review only', () => {
  const earlier = release({ sources: [source(), source({ id: 'archived-source', state: 'excluded' })] });
  const result = compare(earlier, release());
  const change = result.changes.find(c => c.entity === 'archived-source' && c.kind === 'source-removed');
  assert.equal(change.severity, 'review');
});
test('removing a notice blocks', () => {
  const result = compare(release(), release({ notices: [notice()] }));
  assert.equal(severity(result, 'notice-removed', 'id'), 'block');
});
test('removing a publication surface blocks', () => {
  const result = compare(release(), release({ surfaces: [] }));
  assert.equal(severity(result, 'surface-removed', 'id'), 'block');
});
test('adding a publication surface requires review', () => {
  const next = release({ surfaces: [surface(), surface({ id: 'second-view', route: 'pages/second.html' })] });
  assert.equal(severity(compare(release(), next), 'surface-added', 'id'), 'review');
});
test('source permission loss blocks', () => assert.equal(severity(compare(release(), mutateSource(release(), { permission: 'NO' })), 'source-changed', 'permission'), 'block'));
test('source permission UNKNOWN blocks', () => assert.equal(severity(compare(release(), mutateSource(release(), { permission: UNKNOWN })), 'source-changed', 'permission'), 'block'));
test('permission improvement is a review', () => {
  const older = mutateSource(release(), { permission: UNKNOWN });
  assert.equal(severity(compare(older, release()), 'source-changed', 'permission'), 'review');
});
test('licence evidence loss blocks', () => assert.equal(severity(compare(release(), mutateSource(release(), { licenceEvidence: 'NO' })), 'source-changed', 'licenceEvidence'), 'block'));
test('licence evidence improvement is review', () => {
  const older = mutateSource(release(), { licenceEvidence: UNKNOWN });
  assert.equal(severity(compare(older, release()), 'source-changed', 'licenceEvidence'), 'review');
});
for (const field of ['provider', 'licence', 'sourceUrl', 'licenceUrl', 'licenceName', 'tier', 'termsDate']) {
  test(`source change ${field} blocks publication`, () => {
    const next = field === 'provider' ? 'other' : field === 'licence' ? 'OTHER-OPEN' : field === 'tier' ? 'secondary' :
      field === 'termsDate' ? '2026-01-09' : field.endsWith('Url') ? 'https://example.org/changed' : 'Changed terms';
    const result = compare(release(), mutateSource(release(), { [field]: next }));
    assert.equal(severity(result, 'source-changed', field), 'block');
  });
}
test('source state regression blocks', () => assert.equal(severity(compare(release(), mutateSource(release(), { state: 'held' })), 'source-changed', 'state'), 'block'));
test('dataset date becoming UNKNOWN blocks change audit', () => assert.equal(severity(compare(release(), mutateSource(release(), { datasetDate: UNKNOWN })), 'source-changed', 'datasetDate'), 'block'));
test('dataset date advancing is informational change', () => assert.equal(severity(compare(release(), mutateSource(release(), { datasetDate: '2026-01-12' })), 'source-changed', 'datasetDate'), 'information'));
test('acquisition date disappearing blocks', () => assert.equal(severity(compare(release(), mutateSource(release(), { acquiredDate: UNKNOWN })), 'source-changed', 'acquiredDate'), 'block'));
test('source note change is review', () => assert.equal(severity(compare(release(), mutateSource(release(), { note: 'Additional citation' })), 'source-changed', 'note'), 'review'));
for (const field of ['sourceId', 'locale', 'kind', 'text', 'termsUrl']) {
  test(`changed notice ${field} is release blocking`, () => {
    const value = field === 'sourceId' ? 'other-source' : field === 'locale' ? 'fr' : field === 'kind' ? 'other' : field === 'termsUrl' ? 'https://example.org/new' : 'New notice text';
    assert.equal(severity(compare(release(), mutateNotice(release(), { [field]: value })), 'notice-changed', field), 'block');
  });
}
test('hiding a previously visible notice blocks', () => assert.equal(severity(compare(release(), mutateNotice(release(), { visible: 'NO' })), 'notice-changed', 'visible'), 'block'));
test('visibility improvement is review', () => {
  const before = mutateNotice(release(), { visible: 'NO' });
  assert.equal(severity(compare(before, release()), 'notice-changed', 'visible'), 'review');
});
test('loss of near-map credit blocks', () => assert.equal(severity(compare(release(), mutateNotice(release(), { nearMap: UNKNOWN })), 'notice-changed', 'nearMap'), 'block'));
test('increase in evidence proximity is review', () => {
  const before = mutateNotice(release(), { nearMap: UNKNOWN });
  assert.equal(severity(compare(before, release()), 'notice-changed', 'nearMap'), 'review');
});
test('notice recorded date change is review', () => assert.equal(severity(compare(release(), mutateNotice(release(), { recordedDate: '2026-01-13' })), 'notice-changed', 'recordedDate'), 'review'));
for (const field of ['route', 'locale', 'mode', 'sourceIds', 'noticeIds']) {
  test(`surface ${field} mutation blocks`, () => {
    const value = field === 'route' ? 'pages/new.html' : field === 'locale' ? 'fr' : field === 'mode' ? 'list' : ['another-source'];
    assert.equal(severity(compare(release(), mutateSurface(release(), { [field]: value })), 'surface-changed', field), 'block');
  });
}
for (const key of ['offline', 'keyboard', 'screenReader']) {
  test(`surface ${key} loss blocks`, () => assert.equal(severity(compare(release(), mutateSurface(release(), { [key]: 'NO' })), 'surface-changed', key), 'block'));
  test(`surface ${key} UNKNOWN blocks`, () => assert.equal(severity(compare(release(), mutateSurface(release(), { [key]: UNKNOWN })), 'surface-changed', key), 'block'));
  test(`surface ${key} improvement does not block change`, () => {
    const old = mutateSurface(release(), { [key]: UNKNOWN });
    assert.equal(severity(compare(old, release()), 'surface-changed', key), 'information');
  });
}
test('target 44 to 43 blocks', () => assert.equal(severity(compare(release(), mutateSurface(release(), { targetPx: 43 })), 'surface-changed', 'targetPx'), 'block'));
test('target 44 to UNKNOWN blocks', () => assert.equal(severity(compare(release(), mutateSurface(release(), { targetPx: UNKNOWN })), 'surface-changed', 'targetPx'), 'block'));
test('target 44 to 48 is informational', () => assert.equal(severity(compare(release(), mutateSurface(release(), { targetPx: 48 })), 'surface-changed', 'targetPx'), 'information'));
test('target 48 to 44 is review not block', () => {
  const before = mutateSurface(release(), { targetPx: 48 });
  assert.equal(severity(compare(before, release()), 'surface-changed', 'targetPx'), 'review');
});
test('target UNKNOWN to 44 is informational', () => {
  const before = mutateSurface(release(), { targetPx: UNKNOWN });
  assert.equal(severity(compare(before, release()), 'surface-changed', 'targetPx'), 'information');
});
test('missing publication date becomes review item', () => assert.equal(severity(compare(release(), mutateSurface(release(), { publishedDate: UNKNOWN })), 'surface-changed', 'publishedDate'), 'review'));
test('changes list is deterministic across comparisons', () => {
  const next = mutateSource(release(), { permission: UNKNOWN, tier: 'secondary' });
  assert.deepEqual(compare(release(), next).changes, compare(release(), next).changes);
});
test('source changes include affected surface IDs', () => {
  const result = compare(release(), mutateSource(release(), { sourceUrl: 'https://example.org/new' }));
  assert.deepEqual(changed(result, 'source-changed', 'sourceUrl').affectedSurfaces, ['map-view']);
});
test('notice changes include affected surface IDs', () => {
  const result = compare(release(), mutateNotice(release(), { text: 'New text' }));
  assert.deepEqual(changed(result, 'notice-changed', 'text').affectedSurfaces, ['map-view']);
});
test('surface changes include their own ID', () => {
  const result = compare(release(), mutateSurface(release(), { route: 'pages/new.html' }));
  assert.deepEqual(changed(result, 'surface-changed', 'route').affectedSurfaces, ['map-view']);
});
test('impact lookup for surface includes affected changes', () => {
  const result = compare(release(), mutateSource(release(), { permission: UNKNOWN }));
  assert.ok(impactsForSurface(result, 'map-view').length > 0);
});
test('impact lookup for unknown surface is empty', () => {
  const result = compare(release(), mutateSource(release(), { permission: UNKNOWN }));
  assert.deepEqual(impactsForSurface(result, 'not-a-surface'), []);
});
test('impact lookup for source includes its own changes', () => {
  const result = compare(release(), mutateSource(release(), { permission: UNKNOWN }));
  assert.ok(impactsForSource(result, 'map-source').some(c => c.field === 'permission'));
});
test('summary groups changes by entity type', () => {
  const result = compare(release(), mutateSource(release(), { permission: UNKNOWN }));
  assert.ok(summarizeNoticeChanges(result).source >= 1);
});
test('change summary has defined keys', () => {
  const result = compare(release(), release());
  assert.deepEqual(Object.keys(summarizeNoticeChanges(result)), ['source', 'notice', 'surface', 'other']);
});
test('change field tables cover rights and language', () => {
  assert.ok(CHANGE_FIELDS.source.includes('licence'));
  assert.ok(CHANGE_FIELDS.notice.includes('locale'));
  assert.ok(CHANGE_FIELDS.surface.includes('screenReader'));
});
test('new blocking findings appear as changes', () => {
  const result = compare(release(), mutateSource(release(), { permission: UNKNOWN }));
  assert.ok(result.changes.some(c => c.kind === 'new-release-blocker' && c.severity === 'block'));
});
test('resolved blocking findings appear as information', () => {
  const result = compare(mutateSource(release(), { permission: UNKNOWN }), release());
  assert.ok(result.changes.some(c => c.kind === 'resolved-release-blocker' && c.severity === 'information'));
});
test('comparison stores before and after release audits', () => {
  const result = compare(release(), mutateSource(release(), { permission: UNKNOWN }));
  assert.equal(result.beforeAudit.blocked, false);
  assert.equal(result.afterAudit.blocked, true);
});
