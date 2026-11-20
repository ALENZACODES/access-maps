import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAccessReview, requiredReviewNotices, textContainsNotice,
  ACCESS_REVIEW_MIN_TARGET, ACCESS_REVIEW_KINDS,
  surfaceReviewFindings, sourceReviewFindings,
  reviewCoverageByTechnique, sourceReviewImpact,
} from './access-review-audit.mjs';
import { UNKNOWN, REVIEW_TECHNIQUES } from './access-review-core.mjs';
import {
  reviewRelease, reviewSource, reviewSurface, reviewTarget, reviewObservation,
  addReviewSource, metrolinxReviewSource, metrolinxReviewTargets,
  ltcReviewSource, ltcReviewTargets,
} from './access-review-fixtures.mjs';
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
function codes(review, options) { return auditAccessReview(review, options).findings.map(item => item.code); }
function blocked(review, code, options) {
  const result = auditAccessReview(review, options);
  assert.equal(result.blocked, true, `Expected a blocker: ${code}`);
  assert.ok(result.findings.some(item => item.code === code && item.level === 'block'), `${code} in ${result.findings.map(f => f.code).join(', ')}`);
}
function sourceChange(field, value) {
  const release = reviewRelease();
  release.sources[0][field] = value;
  return release;
}
function surfaceChange(field, value) {
  const release = reviewRelease();
  release.surfaces[0][field] = value;
  return release;
}
function targetChange(field, value) {
  const release = reviewRelease();
  release.surfaces[0].targets[0][field] = value;
  return release;
}
function observationChange(field, value) {
  const release = reviewRelease();
  release.surfaces[0].targets[0].observations[0][field] = value;
  return release;
}

test('baseline has no blocking findings and literal unknown dataset date', () => {
  const result = auditAccessReview(reviewRelease());
  assert.equal(result.blocked, false);
  assert.equal(result.blockingCount, 0);
  assert.equal(result.informationCount, 1);
  assert.ok(result.findings.some(x => x.code === 'DATASET_DATE_UNKNOWN' && x.detail === UNKNOWN));
});
test('audit summary counts active notice targets and surfaces', () => {
  const result = auditAccessReview(reviewRelease());
  assert.equal(result.sourceCount, 1);
  assert.equal(result.surfaceCount, 1);
  assert.equal(result.reviewedTargets, 2);
});
test('minimum target is 44 pixels', () => assert.equal(ACCESS_REVIEW_MIN_TARGET, 44));
test('licence-specific notice kinds are not interchangeable', () => {
  assert.deepEqual(ACCESS_REVIEW_KINDS['ODbL-1.0'], ['credit', 'terms']);
  assert.deepEqual(ACCESS_REVIEW_KINDS['Metrolinx-AUA'], ['aua-legend', 'aua-laws-en', 'aua-laws-fr']);
  assert.deepEqual(ACCESS_REVIEW_KINDS['OGL-Ontario-Metrolinx'], ['ogl']);
});
test('no sources blocks the release', () => blocked(reviewRelease({ sources: [] }), 'NO_SOURCES'));
test('no surfaces blocks the release', () => blocked(reviewRelease({ surfaces: [] }), 'NO_SURFACES'));
test('held records do not claim publication review success', () => {
  const release = reviewRelease();
  release.sources[0].status = 'held';
  release.surfaces[0].status = 'held';
  const result = auditAccessReview(release);
  assert.equal(result.reviewedTargets, 0);
});
test('each omitted current source permission blocks', () => {
  for (const value of ['NO', UNKNOWN]) blocked(sourceChange('permission', value), 'PERMISSION_NOT_YES');
});
test('missing licence evidence blocks instead of inferring from provider', () => {
  blocked(sourceChange('licence', UNKNOWN), 'LICENCE_UNKNOWN');
});
test('missing evidence tier blocks', () => blocked(sourceChange('tier', UNKNOWN), 'TIER_UNKNOWN'));
test('missing source origin blocks', () => blocked(sourceChange('sourceUrl', UNKNOWN), 'SOURCE_URL_UNKNOWN'));
test('missing licence URL blocks', () => blocked(sourceChange('licenceUrl', UNKNOWN), 'LICENCE_URL_UNKNOWN'));
test('unknown acquisition date blocks', () => blocked(sourceChange('acquiredDate', UNKNOWN), 'ACQUIRED_DATE_UNKNOWN'));
test('unknown terms review date blocks', () => blocked(sourceChange('termsDate', UNKNOWN), 'TERMS_DATE_UNKNOWN'));
test('unknown dataset date remains informational', () => {
  const result = auditAccessReview(sourceChange('datasetDate', UNKNOWN));
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some(x => x.code === 'DATASET_DATE_UNKNOWN' && x.level === 'info'));
});
test('known dataset date can be retained', () => {
  const result = auditAccessReview(sourceChange('datasetDate', '2026-11-01'));
  assert.equal(result.blocked, false);
  assert.ok(!codes(sourceChange('datasetDate', '2026-11-01')).includes('DATASET_DATE_UNKNOWN'));
});
test('provider and licence must match explicitly', () => {
  blocked(sourceChange('provider', 'ltc'), 'LICENCE_PROVIDER_MISMATCH');
  blocked(sourceChange('licence', 'LTC-Open-Data-Terms'), 'LICENCE_PROVIDER_MISMATCH');
});
test('empty source notice blocks', () => blocked(sourceChange('notice', ''), 'SOURCE_NOTICE_MISSING'));
test('source notice containing only credit still lacks data terms', () => {
  blocked(sourceChange('notice', SOURCES.osm.notices.en[0]), 'SOURCE_NOTICE_INCOMPLETE');
});
test('source notice containing only ODbL still lacks map credit', () => {
  blocked(sourceChange('notice', SOURCES.osm.notices.en[1]), 'SOURCE_NOTICE_INCOMPLETE');
});
test('safely normalized whitespace can preserve a valid legal notice', () => {
  assert.equal(textContainsNotice('A\n B\t C', 'A B C'), true);
  assert.equal(textContainsNotice('Original', ''), false);
});
test('Metrolinx AUA requires the English legend and both laws lines', () => {
  const source = metrolinxReviewSource('Metrolinx-AUA');
  assert.deepEqual(requiredReviewNotices(source, 'fr').map(x => x.kind), ['aua-legend', 'aua-laws-en', 'aua-laws-fr']);
  assert.ok(source.notice.includes(METROLINX_AUA_LEGEND));
  assert.ok(source.notice.includes(METROLINX_AUA_END_USER_LAWS_EN));
  assert.ok(source.notice.includes(METROLINX_AUA_END_USER_LAWS_FR));
});
test('Metrolinx OGL requires only its own notice', () => {
  const source = metrolinxReviewSource('OGL-Ontario-Metrolinx');
  assert.deepEqual(requiredReviewNotices(source, 'en'), [{ kind: 'ogl', text: METROLINX_OGL_NOTICE }]);
});
test('Metrolinx AUA and OGL are separate source records', () => {
  const aua = metrolinxReviewSource('Metrolinx-AUA');
  const ogl = metrolinxReviewSource('OGL-Ontario-Metrolinx');
  const r = addReviewSource(addReviewSource(reviewRelease(), aua, metrolinxReviewTargets('Metrolinx-AUA')), ogl, metrolinxReviewTargets('OGL-Ontario-Metrolinx'));
  assert.equal(auditAccessReview(r).blocked, false);
});
test('mixing an OGL notice into an AUA source blocks', () => {
  const source = metrolinxReviewSource('Metrolinx-AUA', { notice: `${metrolinxReviewSource('Metrolinx-AUA').notice}\n${METROLINX_OGL_NOTICE}` });
  const r = addReviewSource(reviewRelease(), source, metrolinxReviewTargets('Metrolinx-AUA'));
  blocked(r, 'MIXED_METROLINX_NOTICES');
});
test('mixing an AUA legend into an OGL source blocks', () => {
  const source = metrolinxReviewSource('OGL-Ontario-Metrolinx', { notice: `${METROLINX_OGL_NOTICE}\n${METROLINX_AUA_LEGEND}` });
  const r = addReviewSource(reviewRelease(), source, metrolinxReviewTargets('OGL-Ontario-Metrolinx'));
  blocked(r, 'MIXED_METROLINX_NOTICES');
});
test('Metrolinx GTFS omission blocks even with a positive permission flag', () => {
  const source = metrolinxReviewSource('Metrolinx-AUA', { notice: METROLINX_AUA_LEGEND });
  const r = addReviewSource(reviewRelease(), source, metrolinxReviewTargets('Metrolinx-AUA'));
  blocked(r, 'SOURCE_NOTICE_INCOMPLETE');
});
test('London transit notice is localized per surface', () => {
  const en = addReviewSource(reviewRelease(), ltcReviewSource('en'), ltcReviewTargets('en'));
  assert.equal(auditAccessReview(en).blocked, false);
  const fr = addReviewSource(reviewRelease(), ltcReviewSource('fr'), ltcReviewTargets('fr'), 'fr');
  assert.equal(auditAccessReview(fr).blocked, false);
});
test('French LTC output cannot silently use English text', () => {
  const source = ltcReviewSource('fr');
  const r = addReviewSource(reviewRelease(), source, ltcReviewTargets('en'), 'fr');
  blocked(r, 'NOTICE_TEXT_CHANGED');
});
test('other open source without a recognised licence ID is blocked', () => {
  const s = reviewSource({ id: 'other-source', provider: 'other', licence: 'OTHER-OPEN', notice: 'Explicit open terms', permission: 'YES' });
  const t = reviewTarget('terms', 'Explicit open terms', { id: 'other-terms', sourceId: 'other-source' });
  blocked(addReviewSource(reviewRelease(), s, [t]), 'OPEN_LICENCE_ID_UNSPECIFIED');
});
test('other open source without a notice blocks', () => {
  const s = reviewSource({ id: 'other-source', provider: 'other', licence: 'OTHER-OPEN', notice: '' });
  blocked(addReviewSource(reviewRelease(), s, []), 'SOURCE_NOTICE_MISSING');
});
test('surface referencing an unknown source blocks', () => {
  blocked(surfaceChange('sourceIds', ['unknown-source']), 'SURFACE_SOURCE_MISSING');
});
test('surface with no source references blocks', () => blocked(surfaceChange('sourceIds', []), 'SURFACE_WITHOUT_SOURCES'));
test('held source referenced by active surface blocks', () => blocked(sourceChange('status', 'held'), 'SURFACE_SOURCE_HELD'));
test('excluded source referenced by active surface blocks', () => blocked(sourceChange('status', 'excluded'), 'SURFACE_SOURCE_HELD'));
test('source with no targets blocks each required notice', () => blocked(surfaceChange('targets', []), 'SURFACE_NOTICE_MISSING'));
test('omitting ODbL credit blocks specifically', () => {
  const r = reviewRelease();
  r.surfaces[0].targets = r.surfaces[0].targets.filter(t => t.kind !== 'credit');
  blocked(r, 'SURFACE_NOTICE_MISSING');
});
test('omitting ODbL terms blocks separately', () => {
  const r = reviewRelease();
  r.surfaces[0].targets = r.surfaces[0].targets.filter(t => t.kind !== 'terms');
  blocked(r, 'SURFACE_NOTICE_MISSING');
});
test('an unrecognised notice kind is never enough', () => {
  const r = reviewRelease();
  r.surfaces[0].targets[0].kind = 'ogl';
  blocked(r, 'NOTICE_KIND_UNEXPECTED');
});
test('altering exact notice text is reported', () => blocked(targetChange('text', 'Incorrect credit'), 'NOTICE_TEXT_CHANGED'));
test('a target linked to a source not on its surface blocks', () => {
  blocked(targetChange('sourceId', 'unregistered'), 'TARGET_SOURCE_UNDECLARED');
});
test('hidden notice cannot count as review completion', () => {
  for (const value of ['NO', UNKNOWN]) blocked(targetChange('visible', value), 'NOTICE_HIDDEN');
});
test('unknown keyboard capability blocks', () => blocked(targetChange('keyboard', UNKNOWN), 'KEYBOARD_UNKNOWN_OR_NO'));
test('keyboard failure blocks', () => blocked(targetChange('keyboard', 'NO'), 'KEYBOARD_UNKNOWN_OR_NO'));
test('unknown focus indicator blocks', () => blocked(targetChange('focusVisible', UNKNOWN), 'FOCUS_UNKNOWN_OR_NO'));
test('missing visible focus blocks', () => blocked(targetChange('focusVisible', 'NO'), 'FOCUS_UNKNOWN_OR_NO'));
test('unknown screen-reader text blocks', () => blocked(targetChange('screenReader', UNKNOWN), 'LABEL_UNKNOWN_OR_NO'));
test('no screen-reader text blocks', () => blocked(targetChange('screenReader', 'NO'), 'LABEL_UNKNOWN_OR_NO'));
test('unknown pixel sizes block', () => {
  blocked(targetChange('widthPx', UNKNOWN), 'TARGET_DIMENSIONS_UNKNOWN');
  blocked(targetChange('heightPx', UNKNOWN), 'TARGET_DIMENSIONS_UNKNOWN');
});
test('43px targets are rejected in either dimension', () => {
  blocked(targetChange('widthPx', 43), 'TARGET_TOO_SMALL');
  blocked(targetChange('heightPx', 43), 'TARGET_TOO_SMALL');
});
test('44px targets pass the boundary', () => assert.equal(auditAccessReview(reviewRelease()).blocked, false));
test('more generous targets do not block', () => {
  const r = reviewRelease();
  r.surfaces[0].targets[0].widthPx = 80;
  r.surfaces[0].targets[0].heightPx = 68;
  assert.equal(auditAccessReview(r).blocked, false);
});
test('caller may enforce a higher explicit minimum', () => blocked(reviewRelease(), 'TARGET_TOO_SMALL', { minimumTargetPx: 48 }));
test('unknown notice-examination date blocks', () => blocked(targetChange('testedDate', UNKNOWN), 'REVIEW_DATE_UNKNOWN'));
test('unknown evidence link blocks only when required', () => {
  const r = targetChange('evidenceUrl', UNKNOWN);
  assert.equal(auditAccessReview(r).blocked, false);
  blocked(r, 'REVIEW_EVIDENCE_UNKNOWN', { requireEvidenceUrls: true });
});
test('all five observation techniques are normally required', () => {
  assert.deepEqual(REVIEW_TECHNIQUES, ['keyboard', 'screen-reader', 'contrast', 'reflow', 'touch']);
  const r = targetChange('observations', [reviewObservation('keyboard')]);
  blocked(r, 'OBSERVATION_MISSING');
});
test('a failed technique blocks', () => blocked(observationChange('result', 'FAIL'), 'OBSERVATION_NOT_PASS'));
test('unknown observation result blocks', () => blocked(observationChange('result', UNKNOWN), 'OBSERVATION_NOT_PASS'));
test('unknown technique date blocks', () => blocked(observationChange('date', UNKNOWN), 'OBSERVATION_DATE_UNKNOWN'));
test('technique after target date is signalled for review', () => {
  const r = observationChange('date', '2026-11-13');
  assert.ok(auditAccessReview(r).findings.some(f => f.code === 'OBSERVATION_AFTER_REVIEW' && f.level === 'attention'));
});
test('custom required techniques can explicitly narrow coverage', () => {
  const r = targetChange('observations', [reviewObservation('keyboard')]);
  assert.equal(auditAccessReview(r, { requiredTechniques: ['keyboard'] }).blocked, false);
});
test('offline UNKNOWN is visible but optional by default', () => {
  const r = surfaceChange('offline', UNKNOWN);
  const result = auditAccessReview(r);
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some(f => f.code === 'OFFLINE_UNKNOWN' && f.level === 'info'));
});
test('offline requirement blocks NO and UNKNOWN values', () => {
  for (const value of ['NO', UNKNOWN]) blocked(surfaceChange('offline', value), 'OFFLINE_UNCONFIRMED', { requireOffline: true });
});
test('English/French companion requirement blocks a single-locale release', () => {
  blocked(reviewRelease(), 'LOCALE_COMPANION_MISSING', { requirePaired: true });
});
test('explicit bilingual companion with matching source IDs can pass', () => {
  const r = reviewRelease();
  r.surfaces.push(reviewSurface({ id: 'map-fr', route: 'pages/map-fr.html', locale: 'fr' }));
  assert.equal(auditAccessReview(r, { requirePaired: true }).blocked, false);
});
test('a bilingual companion with different source IDs is not equivalent', () => {
  const r = reviewRelease();
  r.surfaces.push(reviewSurface({ id: 'map-fr', route: 'pages/map-fr.html', locale: 'fr', sourceIds: [] }));
  blocked(r, 'LOCALE_COMPANION_MISSING', { requirePaired: true });
});
test('included source with no active consumer appears as attention', () => {
  const r = reviewRelease();
  r.surfaces[0].status = 'excluded';
  assert.ok(auditAccessReview(r).findings.some(f => f.code === 'INCLUDED_SOURCE_UNUSED' && f.level === 'attention'));
});
test('all blocking findings sort before informational items', () => {
  const result = auditAccessReview(targetChange('visible', 'NO'));
  assert.equal(result.findings[0].level, 'block');
  assert.equal(result.findings.at(-1).level, 'info');
});
test('finding filters preserve source and surface attribution', () => {
  const result = auditAccessReview(targetChange('visible', 'NO'));
  assert.ok(surfaceReviewFindings(result, 'map-en').some(f => f.code === 'NOTICE_HIDDEN'));
  assert.ok(sourceReviewFindings(result, 'osm-record').some(f => f.code === 'NOTICE_HIDDEN'));
});
test('coverage counts all recorded observations without assuming outcomes', () => {
  const coverage = reviewCoverageByTechnique(reviewRelease());
  assert.equal(coverage.length, REVIEW_TECHNIQUES.length);
  assert.ok(coverage.every(f => f.targetCount === 2 && f.passCount === 2));
});
test('coverage registers one FAIL without marking it PASS', () => {
  const coverage = reviewCoverageByTechnique(observationChange('result', 'FAIL'));
  const keyboard = coverage.find(f => f.technique === 'keyboard');
  assert.equal(keyboard.passCount, 1);
  assert.equal(keyboard.failCount, 1);
});
test('coverage registers missing and unknown observations independently', () => {
  const r = reviewRelease();
  r.surfaces[0].targets[0].observations = [reviewObservation('keyboard', { result: UNKNOWN })];
  const coverage = reviewCoverageByTechnique(r);
  assert.equal(coverage.find(f => f.technique === 'keyboard').unknownCount, 1);
  assert.equal(coverage.find(f => f.technique === 'reflow').unknownCount, 1);
});
test('source impact exposes route and individual target IDs', () => {
  const impact = sourceReviewImpact(reviewRelease(), 'osm-record');
  assert.deepEqual(impact, [{ id: 'map-en', route: 'pages/map-en.html', locale: 'en', targetIds: ['notice-credit', 'notice-terms'] }]);
});
test('absent source has no fabricated impact', () => assert.deepEqual(sourceReviewImpact(reviewRelease(), 'missing'), []));
test('source may be held without inventing an accessibility statement', () => {
  const r = reviewRelease();
  r.sources[0].status = 'held';
  r.surfaces[0].status = 'held';
  assert.equal(auditAccessReview(r).reviewedTargets, 0);
});
