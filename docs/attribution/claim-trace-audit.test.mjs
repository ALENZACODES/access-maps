import test from 'node:test';
import assert from 'node:assert/strict';
import { auditClaimTrace, containsNotice, traceClaim, claimDateRange } from './claim-trace-audit.mjs';
import { source, reference, claim, surface, release, auaSource, oglSource, ltcSource } from './claim-trace-fixture.test.mjs';
import { METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';
function codes(document) { return auditClaimTrace(document).findings.map((f) => f.code); }
function expectCode(document, code) { assert.ok(codes(document).includes(code), `${code} expected: ${codes(document).join(', ')}`); }
function setSource(field, value) { return release({sources: [source({[field]: value})]}); }
function setClaim(field, value) { return release({claims: [claim({[field]: value})]}); }
function setSurface(field, value) { return release({surfaces: [surface({[field]: value})]}); }

test('a fully described map trace has no blocking findings', () => {
  const audit = auditClaimTrace(release());
  assert.equal(audit.blocked, false, JSON.stringify(audit.findings));
  assert.ok(audit.findings.some((f) => f.code === 'DATASET_DATE_UNKNOWN' && f.level === 'info'));
});
test('separate warnings are not equivalent to release blockers', () => {
  const audit = auditClaimTrace(release({sources: [source(), source({id: 'source-unused'})]}));
  assert.equal(audit.blocked, false);
  assert.ok(audit.findings.some((f) => f.code === 'SOURCE_UNUSED' && f.level === 'attention'));
});
test('notice comparison permits newlines and repeated whitespace', () => {
  assert.equal(containsNotice('  Open\n  Database   Licence ', 'Open Database Licence'), true);
  assert.equal(containsNotice('none', 'required notice'), false);
});
for (const [field, value, code] of [
  ['permission', 'UNKNOWN', 'SOURCE_PERMISSION_UNKNOWN'], ['permission', 'NO', 'SOURCE_PERMISSION_DENIED'],
  ['url', 'UNKNOWN', 'SOURCE_URL_UNKNOWN'], ['licenceUrl', 'UNKNOWN', 'SOURCE_LICENCE_UNKNOWN'],
  ['tier', 'UNKNOWN', 'SOURCE_TIER_UNKNOWN'], ['acquiredDate', 'UNKNOWN', 'SOURCE_ACQUIRED_UNKNOWN'],
  ['termsDate', 'UNKNOWN', 'SOURCE_TERMS_UNKNOWN'], ['notice', '', 'SOURCE_NOTICE_MISSING'],
  ['notice', 'unrelated notice', 'OSM_CREDIT_MISSING'], ['licence', 'Proprietary', 'SOURCE_LICENCE_UNKNOWN'],
  ['licence', 'CC BY 4.0', 'OSM_LICENCE_MISSING'], ['family', 'ltc', 'SOURCE_FAMILY_INCOMPATIBLE'],
]) {
  test(`${field}=${value} raises ${code}`, () => expectCode(setSource(field, value), code));
}
test('unknown data date stays informational', () => {
  const audit = auditClaimTrace(setSource('datasetDate', 'UNKNOWN'));
  assert.equal(audit.blocked, false);
  assert.equal(audit.findings.find((f) => f.code === 'DATASET_DATE_UNKNOWN')?.level, 'info');
});
test('AUA legend is preserved for AUA records', () => {
  const trace = release({sources: [auaSource()], references: [reference({sourceId: 'source-aua'})], claims: [claim({sourceIds: ['source-aua']})], surfaces: [surface({sourceIds: ['source-aua'], mapCredit: 'UNKNOWN'})]});
  assert.equal(auditClaimTrace(trace).blocked, false, JSON.stringify(auditClaimTrace(trace).findings));
});
test('AUA section 3 legend is mandatory', () => {
  const s = auaSource({notice: 'Users must follow applicable laws when using the transit data.'});
  expectCode(release({sources: [s]}), 'AUA_LEGEND_MISSING');
});
test('AUA laws in both languages are mandatory', () => {
  const s = auaSource({notice: METROLINX_AUA_LEGEND});
  expectCode(release({sources: [s]}), 'AUA_LAWS_MISSING');
});
test('AUA and OGL notices must not be merged', () => {
  expectCode(release({sources: [auaSource({notice: `${auaSource().notice}\n${METROLINX_OGL_NOTICE}`})]}), 'CROSS_LICENCE_NOTICE');
  expectCode(release({sources: [oglSource({notice: `${METROLINX_OGL_NOTICE}\n${METROLINX_AUA_LEGEND}`})]}), 'CROSS_LICENCE_NOTICE');
});
test('OGL requires its own exact line', () => expectCode(release({sources: [oglSource({notice: 'Other text'})]}), 'OGL_NOTICE_MISSING'));
test('LTC notice cannot be substituted by another source', () => expectCode(release({sources: [ltcSource({notice: 'Metro records'})]}), 'LTC_NOTICE_MISSING'));
for (const [field, value, code] of [
  ['disclosure', 'unsupported', 'CLAIM_UNSUPPORTED'], ['disclosure', 'unknown', 'CLAIM_EVIDENCE_MISSING'],
  ['sourceIds', [], 'CLAIM_EVIDENCE_MISSING'], ['referenceIds', [], 'CLAIM_EVIDENCE_MISSING'],
  ['sourceIds', ['missing'], 'CLAIM_SOURCE_MISSING'], ['referenceIds', ['missing'], 'CLAIM_REFERENCE_MISSING'],
  ['observedDate', '2025-01-01', 'CLAIM_DATE_MISMATCH'],
]) {
  test(`claim ${field} raises ${code}`, () => {
    const doc = setClaim(field, value);
    if (code === 'CLAIM_DATE_MISMATCH') doc.sources[0].datasetDate = '2026-01-05';
    expectCode(doc, code);
  });
}
test('referenced held source blocks a claim', () => expectCode(release({sources: [source({state: 'held'})]}), 'CLAIM_SOURCE_HELD'));
test('reference must belong to a linked source', () => expectCode(release({references: [reference({sourceId: 'another'})]}), 'REFERENCE_UNLINKED'));
for (const [field, value, code] of [
  ['tier', 'UNKNOWN', 'CLAIM_REFERENCE_TIER_UNKNOWN'],
  ['url', 'UNKNOWN', 'CLAIM_REFERENCE_URL_UNKNOWN'],
  ['date', 'UNKNOWN', 'CLAIM_REFERENCE_DATE_UNKNOWN'],
  ['language', 'fr', 'CLAIM_LANGUAGE_MISMATCH'],
]) {
  test(`reference ${field} raises ${code}`, () => expectCode(release({references: [reference({[field]: value})]}), code));
}
test('reference with missing source blocks', () => expectCode(release({references: [reference({sourceId: 'missing'})]}), 'REFERENCE_SOURCE_MISSING'));
for (const [field, value, code] of [
  ['sourceIds', ['missing'], 'SURFACE_SOURCE_MISSING'],
  ['claimIds', [], 'SURFACE_UNSUPPORTED'],
  ['claimIds', ['missing'], 'SURFACE_CLAIM_MISSING'],
  ['language', 'fr', 'SURFACE_LANGUAGE_MISMATCH'],
  ['sourceIds', [], 'CLAIM_SOURCE_UNDISCLOSED'],
  ['offline', 'UNKNOWN', 'SURFACE_OFFLINE_UNKNOWN'],
  ['offline', 'NO', 'SURFACE_OFFLINE_NO'],
  ['keyboard', 'UNKNOWN', 'SURFACE_KEYBOARD_UNKNOWN'],
  ['keyboard', 'NO', 'SURFACE_KEYBOARD_NO'],
  ['screenReader', 'UNKNOWN', 'SURFACE_READER_UNKNOWN'],
  ['screenReader', 'NO', 'SURFACE_READER_NO'],
  ['targetPx', 'UNKNOWN', 'SURFACE_TARGET_UNKNOWN'],
  ['targetPx', 43, 'SURFACE_TARGET_SMALL'],
  ['mapCredit', 'UNKNOWN', 'SURFACE_CREDIT_UNKNOWN'],
  ['mapCredit', 'NO', 'SURFACE_CREDIT_NO'],
]) {
  test(`surface ${field} raises ${code}`, () => expectCode(setSurface(field, value), code));
}
test('offline requirement is configurable without assuming offline capability', () => {
  const audit = auditClaimTrace(setSurface('offline', 'UNKNOWN'), {requireOffline: false});
  assert.equal(audit.blocked, false);
});
test('minimum target can exceed baseline', () => {
  assert.equal(auditClaimTrace(setSurface('targetPx', 48)).blocked, false);
  const audit = auditClaimTrace(setSurface('targetPx', 48), {minimumTargetPx: 48});
  assert.equal(audit.blocked, false);
});
test('claim without publication surface blocks release', () => expectCode(release({surfaces: []}), 'CLAIM_ORPHAN'));
test('tracing a claim links source, reference and surface records', () => {
  const traced = traceClaim(release(), 'claim-map');
  assert.equal(traced.sources[0].id, 'source-map');
  assert.equal(traced.references[0].id, 'reference-map');
  assert.equal(traced.surfaces[0].id, 'surface-map');
  assert.equal(traceClaim(release(), 'absent'), null);
});
test('date ranges preserve UNKNOWN where nothing is known', () => {
  const doc = release({references: [reference({date: 'UNKNOWN'})], sources: [source({acquiredDate: 'UNKNOWN', termsDate: 'UNKNOWN'})]});
  assert.deepEqual(claimDateRange(doc, 'claim-map'), {first: 'UNKNOWN', last: 'UNKNOWN'});
});
test('date range spans source and reference evidence dates', () => {
  assert.deepEqual(claimDateRange(release(), 'claim-map'), {first: '2026-01-02', last: '2026-01-05'});
});
