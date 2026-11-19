import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoticeRelease, LEGAL_NOTICES, UNKNOWN } from './notice-diff-core.mjs';
import { auditNoticeRelease, ISSUE_CODES } from './notice-diff-audit.mjs';
import {
  release, source, notice, surface, auaRelease, oglRelease, ltcRelease,
  mutateSource, mutateNotice, mutateSurface, duplicate,
} from './notice-diff-fixtures.mjs';
function audit(value, options) { return auditNoticeRelease(parseNoticeRelease(value), options); }
function codes(value, options) { return audit(value, options).findings.map(x => x.code); }
function has(value, code, options) { assert.ok(codes(value, options).includes(code), `${code}: ${codes(value, options).join(', ')}`); }
function lacks(value, code, options) { assert.ok(!codes(value, options).includes(code), `${code}: ${codes(value, options).join(', ')}`); }

test('the ordinary map notice manifest has no release blockers', () => {
  const result = audit(release());
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
  assert.equal(result.sourceCount, 1);
  assert.equal(result.noticeCount, 2);
  assert.equal(result.surfaceCount, 1);
});
test('results retain the release ID and structured findings', () => {
  const result = audit(mutateSource(release(), { permission: UNKNOWN }));
  assert.equal(result.releaseId, 'release-one');
  const item = result.findings.find(v => v.code === 'PERMISSION_UNKNOWN');
  assert.equal(item.level, 'block');
  assert.equal(item.sourceId, 'map-source');
  assert.equal(item.surfaceId, null);
});
test('all issue codes are distinct', () => assert.equal(new Set(ISSUE_CODES).size, ISSUE_CODES.length));
test('empty sources block a release', () => has(release({ sources: [] }), 'NO_SOURCES'));
test('empty surfaces block a release', () => has(release({ surfaces: [] }), 'NO_SURFACES'));
test('empty surface attribution blocks release', () => has(mutateSurface(release(), { sourceIds: [] }), 'EMPTY_SURFACE'));
test('missing source reference blocks release', () => has(mutateSurface(release(), { sourceIds: ['missing'] }), 'SOURCE_MISSING'));
test('missing notice reference blocks release', () => has(mutateSurface(release(), { noticeIds: ['missing-notice'] }), 'NOTICE_MISSING'));
test('held source linked to a surface blocks', () => has(mutateSource(release(), { state: 'held' }), 'SOURCE_HELD'));
test('excluded source linked to a surface blocks', () => has(mutateSource(release(), { state: 'excluded' }), 'SOURCE_EXCLUDED'));
test('held source is not assumed to be included', () => lacks(mutateSource(release(), { state: 'held', permission: UNKNOWN }), 'PERMISSION_UNKNOWN'));
test('excluded source is not assumed to be included', () => lacks(mutateSource(release(), { state: 'excluded', permission: 'NO' }), 'PERMISSION_NO'));
for (const [key, value, code] of [
  ['sourceUrl', UNKNOWN, 'SOURCE_URL_UNKNOWN'],
  ['licenceUrl', UNKNOWN, 'LICENCE_URL_UNKNOWN'],
  ['permission', UNKNOWN, 'PERMISSION_UNKNOWN'],
  ['permission', 'NO', 'PERMISSION_NO'],
  ['licenceEvidence', UNKNOWN, 'LICENCE_EVIDENCE_UNKNOWN'],
  ['licenceEvidence', 'NO', 'LICENCE_EVIDENCE_NO'],
  ['tier', UNKNOWN, 'TIER_UNKNOWN'],
  ['licence', UNKNOWN, 'UNKNOWN_LICENCE'],
  ['acquiredDate', UNKNOWN, 'ACQUISITION_UNKNOWN'],
  ['termsDate', UNKNOWN, 'TERMS_DATE_UNKNOWN'],
  ['datasetDate', UNKNOWN, 'DATASET_DATE_UNKNOWN'],
]) {
  test(`source ${key}=${value} produces ${code}`, () => has(mutateSource(release(), { [key]: value }), code));
}
test('unknown dataset date remains informational', () => {
  const result = audit(mutateSource(release(), { datasetDate: UNKNOWN }));
  const item = result.findings.find(v => v.code === 'DATASET_DATE_UNKNOWN');
  assert.equal(item.level, 'information');
  assert.equal(result.blocked, false);
});
test('wrong provider licence blocks', () => has(mutateSource(release(), { licence: 'Metrolinx-AUA' }), 'PROVIDER_LICENCE_MISMATCH'));
test('unrecorded provider does not establish licence rights', () => has(mutateSource(release(), { provider: 'other' }), 'PROVIDER_LICENCE_MISMATCH'));
test('a source URL alone never establishes permission', () => has(mutateSource(release(), { permission: UNKNOWN }), 'PERMISSION_UNKNOWN'));
test('acquisition before dataset is an attention item', () => {
  const result = audit(mutateSource(release(), { acquiredDate: '2026-01-09' }));
  assert.equal(result.findings.find(v => v.code === 'DATE_ORDER').level, 'attention');
});
test('terms after acquisition is an attention item', () => has(mutateSource(release(), { termsDate: '2026-01-15' }), 'DATE_ORDER'));
test('dates beyond explicitly supplied today block', () => has(mutateSource(release(), { datasetDate: '2026-12-01' }), 'DATE_FUTURE', { today: '2026-06-01' }));
test('future dates are not inferred from current clock', () => lacks(mutateSource(release(), { datasetDate: '2099-01-01' }), 'DATE_FUTURE'));
test('explicit today rejects invalid format', () => assert.throws(() => audit(release(), { today: 'tomorrow' }), /today/u));
test('target threshold cannot undercut 44', () => assert.throws(() => audit(release(), { minimumTargetPx: 40 }), /minimum target/u));
test('target threshold can be stricter', () => has(release(), 'TARGET_TOO_SMALL', { minimumTargetPx: 48 }));
for (const [key, value, code] of [
  ['offline', 'NO', 'OFFLINE_MISSING'], ['offline', UNKNOWN, 'OFFLINE_UNKNOWN'],
  ['keyboard', 'NO', 'KEYBOARD_MISSING'], ['keyboard', UNKNOWN, 'KEYBOARD_UNKNOWN'],
  ['screenReader', 'NO', 'SCREEN_READER_MISSING'], ['screenReader', UNKNOWN, 'SCREEN_READER_UNKNOWN'],
  ['targetPx', 43, 'TARGET_TOO_SMALL'], ['targetPx', UNKNOWN, 'TARGET_UNKNOWN'],
  ['publishedDate', UNKNOWN, 'SURFACE_DATE_UNKNOWN'],
]) {
  test(`surface ${key}=${value} produces ${code}`, () => has(mutateSurface(release(), { [key]: value }), code));
}
test('allow-online opt-out does not block only because offline is NO', () => lacks(mutateSurface(release(), { offline: 'NO' }), 'OFFLINE_MISSING', { requireOffline: false }));
test('allow-online opt-out does not erase keyboard requirements', () => has(mutateSurface(release(), { offline: 'NO', keyboard: 'NO' }), 'KEYBOARD_MISSING', { requireOffline: false }));
test('target exactly 44 passes', () => lacks(mutateSurface(release(), { targetPx: 44 }), 'TARGET_TOO_SMALL'));
test('target 45 passes', () => lacks(mutateSurface(release(), { targetPx: 45 }), 'TARGET_TOO_SMALL'));
test('a notice with no source blocks', () => has(mutateNotice(release(), { sourceId: 'other-source' }), 'NOTICE_SOURCE_MISMATCH'));
test('a notice whose source is not listed on the surface blocks', () => has(mutateSurface(release(), { sourceIds: [] }), 'NOTICE_SOURCE_MISMATCH'));
test('notice locale differing from surface blocks', () => has(mutateNotice(release(), { locale: 'fr' }), 'NOTICE_LANGUAGE_MISMATCH'));
for (const [key, value, code] of [
  ['visible', 'NO', 'NOTICE_NOT_VISIBLE'], ['visible', UNKNOWN, 'NOTICE_VISIBILITY_UNKNOWN'],
  ['termsUrl', UNKNOWN, 'NOTICE_TERMS_MISSING'], ['recordedDate', UNKNOWN, 'NOTICE_DATE_UNKNOWN'],
]) {
  test(`notice ${key}=${value} produces ${code}`, () => has(mutateNotice(release(), { [key]: value }), code));
}
test('unknown notice date is attention not block', () => {
  const result = audit(mutateNotice(release(), { recordedDate: UNKNOWN }));
  assert.equal(result.findings.find(v => v.code === 'NOTICE_DATE_UNKNOWN').level, 'attention');
});
test('OSM credit is independently required', () => has(mutateNotice(release(), { text: 'unrelated credit' }), 'OSM_CREDIT_MISSING'));
test('ODbL licence text is independently required', () => has(release({ notices: [notice()] }), 'OSM_ODBL_MISSING'));
test('OSM credit must be near map', () => has(mutateNotice(release(), { nearMap: 'NO' }), 'OSM_MAP_CREDIT_MISSING'));
test('OSM map proximity UNKNOWN remains a blocker', () => has(mutateNotice(release(), { nearMap: UNKNOWN }), 'OSM_MAP_CREDIT_UNKNOWN'));
test('OSM credit outside a map surface does not need nearMap', () => lacks(mutateSurface(release(), { mode: 'list' }), 'OSM_MAP_CREDIT_MISSING'));
test('hidden OSM credit is not accepted', () => has(mutateNotice(release(), { visible: 'NO' }), 'OSM_CREDIT_MISSING'));
test('hidden ODbL statement is not accepted', () => has(mutateNotice(release(), { id: 'map-credit', text: 'not a licence' }), 'OSM_CREDIT_MISSING'));
test('AUA legend and laws are supplied as separate notices', () => {
  const result = audit(auaRelease());
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
});
test('AUA missing section 3 legend blocks', () => has(auaRelease({ notices: auaRelease().notices.slice(1) }), 'AUA_LEGEND_MISSING'));
test('AUA missing English applicable-law line blocks', () => has(auaRelease({ notices: [auaRelease().notices[0], auaRelease().notices[2]] }), 'AUA_LAWS_MISSING'));
test('AUA missing French applicable-law line blocks', () => has(auaRelease({ notices: auaRelease().notices.slice(0, 2) }), 'AUA_LAWS_MISSING'));
test('AUA does not silently substitute OGL notice', () => has(auaRelease({ notices: [notice({ id: 'ogl-credit', sourceId: 'aua-feed', text: LEGAL_NOTICES.ogl })] }), 'AUA_LEGEND_MISSING'));
test('OGL line is required for OGL family', () => has(oglRelease({ notices: [] }), 'OGL_NOTICE_MISSING'));
test('OGL record with matching line passes', () => assert.equal(audit(oglRelease()).blocked, false));
test('AUA legend is incompatible with explicit OGL family', () => has(oglRelease({ notices: [notice({ id: 'ogl-credit', sourceId: 'ogl-feed', text: LEGAL_NOTICES.aua[0] })] }), 'OGL_NOTICE_MISSING'));
test('LTC source notice is explicitly required in the display record', () => has(ltcRelease({ notices: [] }), 'LTC_NOTICE_MISSING'));
test('LTC source notice in EN passes', () => assert.equal(audit(ltcRelease()).blocked, false));
test('LTC source notice is language-specific', () => has(ltcRelease({ notices: [notice({ id: 'ltc-credit', sourceId: 'ltc-feed', text: LEGAL_NOTICES.ltcFr })] }), 'LTC_NOTICE_MISSING'));
test('unreferenced included source produces attention item', () => has(release({ sources: [source(), source({ id: 'extra-source' })] }), 'SOURCE_UNUSED'));
test('unreferenced notice produces attention item', () => has(release({ notices: [...release().notices, notice({ id: 'extra-credit' })] }), 'NOTICE_UNUSED'));
test('language pairing is optional by default', () => lacks(release(), 'LANGUAGE_PAIR_MISSING'));
test('required language pairing creates finding', () => has(release(), 'LANGUAGE_PAIR_MISSING', { requireLanguagePairs: true }));
test('required language pairing fails closed without a companion route', () => {
  const result = audit(release(), { requireLanguagePairs: true });
  assert.equal(result.findings.find(v => v.code === 'LANGUAGE_PAIR_MISSING').level, 'block');
  assert.equal(result.blocked, true);
});
test('findings have deterministic order', () => {
  const input = parseNoticeRelease(mutateSource(release(), { permission: UNKNOWN, tier: UNKNOWN, datasetDate: UNKNOWN }));
  assert.deepEqual(auditNoticeRelease(input).findings, auditNoticeRelease(input).findings);
});
test('no restricted provider appears in the supported catalogue', async () => {
  const { SOURCE_IDS } = await import('./attribution-utils.mjs');
  assert.deepEqual(SOURCE_IDS, ['osm', 'metrolinx', 'ltc']);
});
