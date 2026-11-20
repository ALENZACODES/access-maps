import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditObligationRegister, requiredKinds, buildObligationChecklist,
  OBLIGATION_MIN_TARGET,
} from './obligation-audit.mjs';
import { parseObligationRegister } from './obligation-core.mjs';
import {
  obligation, source, page, placement, witness, frenchPair, aua, ogl, ltc, providerRecord,
} from './obligation-fixtures.mjs';
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
const clone = x => structuredClone(x);
function findings(input, code) {
  return auditObligationRegister(parseObligationRegister(input)).findings.filter(x => x.code === code);
}
function expectBlock(input, code) {
  const audit = auditObligationRegister(parseObligationRegister(input));
  assert.equal(audit.blocked, true, `Expected release block for ${code}`);
  assert.ok(audit.findings.some(x => x.code === code && x.level === 'block'), `Expected ${code} in ${JSON.stringify(audit.findings)}`);
  return audit;
}
function expectClear(input) {
  const audit = auditObligationRegister(parseObligationRegister(input));
  assert.equal(audit.blocked, false, JSON.stringify(audit.findings));
  return audit;
}
function modified(section, patch) {
  const input = obligation();
  input[section][0] = { ...input[section][0], ...patch };
  return input;
}
test('minimum declared target for this lane is 44 pixels', () => {
  assert.equal(OBLIGATION_MIN_TARGET, 44);
});
test('complete OSM page passes release-blocking audit', () => {
  const audit = expectClear(obligation());
  assert.equal(audit.blocking, 0);
});
test('passing audit keeps unknown dataset and publication dates informational', () => {
  const audit = expectClear(obligation());
  assert.ok(audit.findings.some(x => x.code === 'DATASET_DATE_UNKNOWN' && x.level === 'info'));
  assert.ok(audit.findings.some(x => x.code === 'PUBLICATION_DATE_UNKNOWN' && x.level === 'info'));
});
test('french pair passes EN/FR companion requirement', () => {
  const audit = auditObligationRegister(parseObligationRegister(frenchPair()), { requirePairs: true });
  assert.equal(audit.blocked, false, JSON.stringify(audit.findings));
});
test('missing companion language fails only when explicitly required', () => {
  const data = parseObligationRegister(obligation());
  assert.equal(auditObligationRegister(data).blocked, false);
  const audit = auditObligationRegister(data, { requirePairs: true });
  assert.equal(audit.blocked, true);
  assert.ok(audit.findings.some(x => x.code === 'LANGUAGE_COMPANION_MISSING'));
});
test('OSM obligation kinds are credit and licence independently', () => {
  assert.deepEqual(requiredKinds(source()), ['credit', 'licence']);
});
test('AUA obligation kinds are terms and applicable laws', () => {
  assert.deepEqual(requiredKinds(aua()), ['terms', 'laws']);
});
test('OGL obligation requires its own licence line', () => {
  assert.deepEqual(requiredKinds(ogl()), ['licence']);
});
test('LTC obligation requires its identifiable source notice', () => {
  assert.deepEqual(requiredKinds(ltc()), ['credit']);
});
test('other sources require explicit credit and licence records', () => {
  assert.deepEqual(requiredKinds(source({ provider: 'other' })), ['credit', 'licence']);
});
test('catalogue OSM credit is unchanged', () => {
  assert.equal(SOURCES.osm.notices.en[0], '© OpenStreetMap contributors');
});
test('catalogue ODbL line is not the OSM credit', () => {
  assert.notEqual(SOURCES.osm.notices.en[0], SOURCES.osm.notices.en[1]);
});
test('catalogue AUA and OGL notices are distinct', () => {
  assert.notEqual(METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE);
});
test('catalogue applicable-law statements remain bilingual', () => {
  assert.ok(METROLINX_AUA_END_USER_LAWS_EN.includes('applicable laws'));
  assert.ok(METROLINX_AUA_END_USER_LAWS_FR.includes('lois applicables'));
});
test('all four supported provider variants can pass an explicit register', () => {
  for (const item of [source(), aua(), ogl(), ltc()]) {
    expectClear(providerRecord(item));
  }
});
test('French AUA applicable-law placement is language-specific', () => {
  expectClear(providerRecord(aua(), 'fr'));
});
test('French LTC credit placement is language-specific', () => {
  expectClear(providerRecord(ltc(), 'fr'));
});
test('unknown permission blocks release', () => {
  expectBlock(modified('sources', { permission: 'UNKNOWN' }), 'PERMISSION_NOT_GRANTED');
});
test('explicit denial blocks release', () => {
  expectBlock(modified('sources', { permission: 'NO' }), 'PERMISSION_NOT_GRANTED');
});
test('missing source URL blocks release', () => {
  expectBlock(modified('sources', { sourceUrl: 'UNKNOWN' }), 'SOURCE_URL_UNKNOWN');
});
test('missing licence URL blocks release', () => {
  expectBlock(modified('sources', { licenceUrl: 'UNKNOWN' }), 'LICENCE_URL_UNKNOWN');
});
test('missing licence code blocks release', () => {
  expectBlock(modified('sources', { licenceId: 'UNKNOWN' }), 'LICENCE_UNSUPPORTED');
});
test('wrong OSM licence code blocks release', () => {
  expectBlock(modified('sources', { licenceId: 'CC0-1.0' }), 'LICENCE_UNSUPPORTED');
});
test('wrong ODbL licence name blocks release', () => {
  expectBlock(modified('sources', { licenceName: 'Something Else' }), 'LICENCE_UNSUPPORTED');
});
test('missing acquisition date blocks release', () => {
  expectBlock(modified('sources', { acquiredOn: 'UNKNOWN' }), 'ACQUISITION_UNKNOWN');
});
test('missing terms review date blocks release', () => {
  expectBlock(modified('sources', { termsReviewedOn: 'UNKNOWN' }), 'TERMS_REVIEW_UNKNOWN');
});
test('missing evidence tier blocks release', () => {
  expectBlock(modified('sources', { tier: 'UNKNOWN' }), 'EVIDENCE_TIER_UNKNOWN');
});
test('missing source attribution text blocks release', () => {
  expectBlock(modified('sources', { attribution: '' }), 'ATTRIBUTION_EMPTY');
});
test('source held from publication does not receive source-only blocking findings', () => {
  const input = modified('sources', { state: 'held', permission: 'UNKNOWN' });
  const audit = auditObligationRegister(parseObligationRegister(input));
  assert.ok(!audit.findings.some(x => x.code === 'PERMISSION_NOT_GRANTED'));
  assert.ok(audit.findings.some(x => x.code === 'PAGE_SOURCE_NOT_INCLUDED'));
});
test('excluded source is not silently allowed on a published page', () => {
  expectBlock(modified('sources', { state: 'excluded' }), 'PAGE_SOURCE_NOT_INCLUDED');
});
test('source listed but unused receives a nonblocking notice', () => {
  const input = obligation();
  input.sources.push(source({ id: 'unused-source' }));
  const audit = expectClear(input);
  assert.ok(audit.findings.some(x => x.code === 'SOURCE_UNUSED' && x.level === 'attention'));
});
test('dataset date later than acquisition raises an attention finding', () => {
  const audit = expectClear(modified('sources', { datasetAsOf: '2026-02-01' }));
  assert.ok(audit.findings.some(x => x.code === 'DATE_ORDER' && x.level === 'attention'));
});
test('review date after acquisition raises an attention finding', () => {
  const audit = expectClear(modified('sources', { termsReviewedOn: '2026-02-01' }));
  assert.ok(audit.findings.some(x => x.code === 'TERMS_AFTER_ACQUISITION' && x.level === 'attention'));
});
test('offline UNKNOWN blocks page publication', () => {
  expectBlock(modified('pages', { offline: 'UNKNOWN' }), 'OFFLINE_NOT_RECORDED');
});
test('offline NO blocks page publication', () => {
  expectBlock(modified('pages', { offline: 'NO' }), 'OFFLINE_NOT_RECORDED');
});
test('keyboard UNKNOWN blocks page publication', () => {
  expectBlock(modified('pages', { keyboard: 'UNKNOWN' }), 'KEYBOARD_NOT_RECORDED');
});
test('keyboard NO blocks page publication', () => {
  expectBlock(modified('pages', { keyboard: 'NO' }), 'KEYBOARD_NOT_RECORDED');
});
test('screen-reader label UNKNOWN blocks page publication', () => {
  expectBlock(modified('pages', { screenReader: 'UNKNOWN' }), 'LABELS_NOT_RECORDED');
});
test('screen-reader label NO blocks page publication', () => {
  expectBlock(modified('pages', { screenReader: 'NO' }), 'LABELS_NOT_RECORDED');
});
test('unknown target dimension blocks page publication', () => {
  expectBlock(modified('pages', { targetPx: 'UNKNOWN' }), 'TARGET_UNKNOWN');
});
test('43px target blocks page publication', () => {
  expectBlock(modified('pages', { targetPx: 43 }), 'TARGET_BELOW_MINIMUM');
});
test('44px target passes the boundary', () => {
  expectClear(modified('pages', { targetPx: 44 }));
});
test('larger targets pass the boundary', () => {
  for (const targetPx of [45, 48, 56, 64, 88]) expectClear(modified('pages', { targetPx }));
});
test('empty page source list blocks publication', () => {
  const input = modified('pages', { sourceIds: [] });
  expectBlock(input, 'PAGE_SOURCE_EMPTY');
});
test('missing page source record blocks publication', () => {
  expectBlock(modified('pages', { sourceIds: ['missing-source'] }), 'PAGE_SOURCE_MISSING');
});
test('unknown publication date is informational', () => {
  const result = expectClear(obligation());
  assert.ok(result.findings.some(x => x.code === 'PUBLICATION_DATE_UNKNOWN' && x.level === 'info'));
});
test('missing OSM credit placement blocks publication', () => {
  const input = obligation();
  input.placements = input.placements.filter(x => x.kind !== 'credit');
  expectBlock(input, 'REQUIRED_NOTICE_MISSING');
});
test('missing ODbL placement blocks publication', () => {
  const input = obligation();
  input.placements = input.placements.filter(x => x.kind !== 'licence');
  expectBlock(input, 'REQUIRED_NOTICE_MISSING');
});
test('duplicate OSM credits produce an attention finding', () => {
  const input = obligation();
  input.placements.push(placement({ id: 'extra-credit', elementId: 'extra-credit' }));
  const audit = expectClear(input);
  assert.ok(audit.findings.some(x => x.code === 'DUPLICATE_NOTICE_PLACEMENT'));
});
test('a placement referencing an unknown page blocks', () => {
  expectBlock(modified('placements', { pageId: 'missing-page' }), 'PLACEMENT_PAGE_MISSING');
});
test('a placement referencing an unknown source blocks', () => {
  expectBlock(modified('placements', { sourceId: 'missing-source' }), 'PLACEMENT_SOURCE_MISSING');
});
test('a placement cannot use a source undeclared on its page', () => {
  const input = obligation();
  input.sources.push(source({ id: 'second-source' }));
  input.placements[0].sourceId = 'second-source';
  expectBlock(input, 'PLACEMENT_UNDECLARED_SOURCE');
});
test('hidden notice blocks publication', () => {
  expectBlock(modified('placements', { visibility: 'visually-hidden' }), 'NOTICE_NOT_VISIBLE');
});
test('absent notice blocks publication', () => {
  expectBlock(modified('placements', { visibility: 'absent' }), 'NOTICE_NOT_VISIBLE');
});
test('unknown notice visibility blocks publication', () => {
  expectBlock(modified('placements', { visibility: 'UNKNOWN' }), 'NOTICE_NOT_VISIBLE');
});
test('empty notice text blocks publication', () => {
  expectBlock(modified('placements', { notice: '' }), 'NOTICE_EMPTY');
});
test('tampered OSM credit blocks publication', () => {
  expectBlock(modified('placements', { notice: 'Map information provided.' }), 'NOTICE_TEXT_MISMATCH');
});
test('an OSM credit cannot be substituted by ODbL name alone', () => {
  expectBlock(modified('placements', { notice: 'Open Database License (ODbL) 1.0' }), 'NOTICE_TEXT_MISMATCH');
});
test('OSM map credit must be adjacent to map', () => {
  expectBlock(modified('placements', { nearMap: 'UNKNOWN' }), 'MAP_CREDIT_NOT_NEAR_MAP');
});
test('OSM map credit marked not near map blocks publication', () => {
  expectBlock(modified('placements', { nearMap: 'NO' }), 'MAP_CREDIT_NOT_NEAR_MAP');
});
test('OSM list-page credit does not assert map adjacency', () => {
  const input = obligation();
  input.pages[0].display = 'list';
  input.placements[0].nearMap = 'UNKNOWN';
  expectClear(input);
});
test('missing placement witness IDs block publication', () => {
  expectBlock(modified('placements', { witnessIds: [] }), 'PLACEMENT_WITNESS_EMPTY');
});
test('unresolvable placement witness IDs block publication', () => {
  expectBlock(modified('placements', { witnessIds: ['missing-proof'] }), 'PLACEMENT_WITNESS_MISSING');
});
test('witness for another source cannot support placement', () => {
  const input = obligation();
  input.sources.push(source({ id: 'second-source' }));
  input.witnesses[0].sourceId = 'second-source';
  expectBlock(input, 'PLACEMENT_WITNESS_WRONG_SOURCE');
});
test('orphaned witness source blocks publication', () => {
  expectBlock(modified('witnesses', { sourceId: 'missing-source' }), 'WITNESS_SOURCE_MISSING');
});
test('unknown witness date blocks publication', () => {
  expectBlock(modified('witnesses', { recordedOn: 'UNKNOWN' }), 'WITNESS_DATE_UNKNOWN');
});
test('unknown witness evidence tier blocks publication', () => {
  expectBlock(modified('witnesses', { tier: 'UNKNOWN' }), 'WITNESS_TIER_UNKNOWN');
});
test('source document with UNKNOWN URL blocks publication', () => {
  expectBlock(modified('witnesses', { url: 'UNKNOWN' }), 'WITNESS_URL_UNKNOWN');
});
test('editor note permits unavailable external URL but retains dates', () => {
  const input = modified('witnesses', { type: 'editor-note', url: 'UNKNOWN' });
  expectClear(input);
});
test('witness timestamp before acquisition is a review finding', () => {
  const input = modified('witnesses', { recordedOn: '2026-01-01' });
  const audit = expectClear(input);
  assert.ok(audit.findings.some(x => x.code === 'WITNESS_BEFORE_ACQUISITION' && x.level === 'attention'));
});
test('unreferenced witness remains informational', () => {
  const input = obligation();
  input.witnesses.push(witness({ id: 'unused-proof' }));
  const audit = expectClear(input);
  assert.ok(audit.findings.some(x => x.code === 'WITNESS_UNUSED' && x.level === 'info'));
});
test('missing AUA section 3 terms notice blocks', () => {
  const input = providerRecord(aua());
  input.placements = input.placements.filter(x => x.kind !== 'terms');
  expectBlock(input, 'REQUIRED_NOTICE_MISSING');
});
test('missing AUA applicable laws notice blocks', () => {
  const input = providerRecord(aua());
  input.placements = input.placements.filter(x => x.kind !== 'laws');
  expectBlock(input, 'REQUIRED_NOTICE_MISSING');
});
test('incorrect AUA terms legend blocks', () => {
  const input = providerRecord(aua());
  input.placements.find(x => x.kind === 'terms').notice = METROLINX_OGL_NOTICE;
  expectBlock(input, 'NOTICE_TEXT_MISMATCH');
});
test('French AUA page requires French applicable law line', () => {
  const input = providerRecord(aua(), 'fr');
  input.placements.find(x => x.kind === 'laws').notice = METROLINX_AUA_END_USER_LAWS_EN;
  expectBlock(input, 'NOTICE_TEXT_MISMATCH');
});
test('English AUA page requires English applicable law line', () => {
  const input = providerRecord(aua(), 'en');
  input.placements.find(x => x.kind === 'laws').notice = METROLINX_AUA_END_USER_LAWS_FR;
  expectBlock(input, 'NOTICE_TEXT_MISMATCH');
});
test('OGL statement cannot be replaced by AUA legend', () => {
  const input = providerRecord(ogl());
  input.placements[0].notice = METROLINX_AUA_LEGEND;
  expectBlock(input, 'NOTICE_TEXT_MISMATCH');
});
test('OGL source with wrong licence ID blocks', () => {
  const input = providerRecord(ogl());
  input.sources[0].licenceId = 'Metrolinx-AUA';
  expectBlock(input, 'LICENCE_UNSUPPORTED');
});
test('LTC notice must be source-specific', () => {
  const input = providerRecord(ltc());
  input.placements[0].notice = 'This service offers transit data.';
  expectBlock(input, 'NOTICE_TEXT_MISMATCH');
});
test('AUA source may not be relabelled with OGL licence ID', () => {
  const input = providerRecord(aua());
  input.sources[0].licenceId = 'OGL-Ontario-Metrolinx';
  expectBlock(input, 'LICENCE_UNSUPPORTED');
});
test('other open-licence source with no open evidence blocks', () => {
  const input = providerRecord(source({ provider: 'other', licenceId: 'UNKNOWN', licenceName: 'Proprietary terms' }));
  expectBlock(input, 'LICENCE_UNSUPPORTED');
});
test('empty audit receives source and page errors', () => {
  const input = obligation({ sources: [], pages: [], placements: [], witnesses: [] });
  const audit = auditObligationRegister(parseObligationRegister(input));
  assert.ok(audit.findings.some(x => x.code === 'NO_SOURCES'));
  assert.ok(audit.findings.some(x => x.code === 'NO_PAGES'));
});
test('audit is deterministic with identical inputs', () => {
  const parsed = parseObligationRegister(obligation());
  assert.deepEqual(auditObligationRegister(parsed), auditObligationRegister(parsed));
});
test('audit does not mutate a submitted register', () => {
  const parsed = parseObligationRegister(frenchPair());
  const before = clone(parsed);
  auditObligationRegister(parsed);
  assert.deepEqual(parsed, before);
});
test('findings have stable codes, levels and paths', () => {
  const result = expectBlock(modified('sources', { permission: 'UNKNOWN' }), 'PERMISSION_NOT_GRANTED');
  const found = result.findings.find(x => x.code === 'PERMISSION_NOT_GRANTED');
  assert.equal(found.path, 'sources.osm-source.permission');
  assert.equal(found.sourceId, 'osm-source');
});
test('checklist contains only blocking issues', () => {
  const input = obligation();
  input.sources[0].permission = 'UNKNOWN';
  const audit = auditObligationRegister(parseObligationRegister(input));
  const checklist = buildObligationChecklist(input, audit);
  assert.ok(checklist.some(x => x.code === 'PERMISSION_NOT_GRANTED'));
  assert.ok(!checklist.some(x => x.code === 'DATASET_DATE_UNKNOWN'));
});
test('checklist deduplicates repeated evidence issues', () => {
  const input = obligation();
  input.sources[0].permission = 'NO';
  const audit = auditObligationRegister(parseObligationRegister(input));
  const checklist = buildObligationChecklist(input, audit);
  assert.equal(new Set(checklist.map(x => x.id)).size, checklist.length);
});
test('checklist returns no actions for a passing register', () => {
  const input = obligation();
  assert.deepEqual(buildObligationChecklist(input), []);
});
test('unpaired EN page is blocked when pair flag is on', () => {
  const parsed = parseObligationRegister(obligation());
  const audit = auditObligationRegister(parsed, { requirePairs: true });
  assert.ok(audit.findings.some(x => x.code === 'LANGUAGE_COMPANION_MISSING'));
});
test('pair with nonmatching source lists blocks when pair flag is on', () => {
  const input = frenchPair();
  input.pages[1].sourceIds = [];
  const audit = auditObligationRegister(parseObligationRegister(input), { requirePairs: true });
  assert.ok(audit.findings.some(x => x.code === 'LANGUAGE_SOURCE_MISMATCH'));
});
test('page source omissions remain visible even if pair check is off', () => {
  const input = frenchPair();
  input.pages[1].sourceIds = [];
  const audit = auditObligationRegister(parseObligationRegister(input));
  assert.ok(audit.findings.some(x => x.code === 'PAGE_SOURCE_EMPTY'));
});
test('multiple valid placements keep source and page count correct', () => {
  const audit = expectClear(frenchPair());
  assert.deepEqual(audit.counts, { sources: 1, pages: 2, placements: 4, witnesses: 1 });
});
test('audit does not assert physical accessibility of a place', () => {
  const result = expectClear(obligation());
  assert.equal(Object.hasOwn(result, 'accessibilityRating'), false);
});
