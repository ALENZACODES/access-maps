import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocket } from './docket-core.mjs';
import { auditDocket } from './docket-audit.mjs';
import { fixtureDocket, fixtureSource, fixtureSurface, fixtureEvidence, fixtureDecision,
  licenceVariant, docketFromVariants } from './docket-fixtures.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';

const audited = (value) => auditDocket(parseDocket(value));
const codes = (value) => audited(value).findings.map((item) => item.code);
const blocked = (value, expected) => {
  const result = audited(value);
  assert.equal(result.blocked, true, `Expected blocked release: ${JSON.stringify(result.findings)}`);
  assert.ok(result.findings.some((item) => item.code === expected), `Missing ${expected}: ${JSON.stringify(result.findings)}`);
};
test('minimal coherent docket passes all blocking checks', () => {
  const result = audited(fixtureDocket());
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
  assert.ok(result.findings.some((f) => f.code === 'DATASET_DATE_UNKNOWN'));
});
test('missing dataset date is informational, never fabricated', () => {
  const result = audited(fixtureDocket());
  assert.equal(result.findings.find((f) => f.code === 'DATASET_DATE_UNKNOWN').severity, 'info');
});
test('counts are stable and include nonblocking findings', () => {
  const result = audited(fixtureDocket());
  assert.equal(result.counts.sources, 1);
  assert.equal(result.counts.evidence, 1);
  assert.equal(result.counts.decisions, 1);
  assert.equal(result.counts.surfaces, 1);
  assert.equal(result.counts.block, 0);
});
test('audit outputs are sorted deterministically', () => {
  const findings = audited(fixtureDocket()).findings;
  assert.deepEqual(findings, [...findings].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject)));
});
test('no sources blocks', () => blocked(fixtureDocket({ sources: [] }), 'NO_SOURCES'));
test('no surfaces blocks', () => blocked(fixtureDocket({ surfaces: [] }), 'NO_SURFACES'));
test('explicit unknown as-of does not invent today', () => {
  const result = audited(fixtureDocket({ asOf: 'UNKNOWN' }));
  assert.equal(result.asOf, 'UNKNOWN');
  assert.ok(result.findings.some((f) => f.code === 'AS_OF_UNKNOWN'));
});
test('explicit as-of override controls recheck deadline', () => {
  const result = auditDocket(parseDocket(fixtureDocket()), { asOf: '2027-01-01' });
  assert.ok(result.findings.some((f) => f.code === 'REVIEW_OVERDUE'));
});
for (const licence of ['aua', 'ogl', 'ltc', 'other']) {
  test(`${licence} record passes with recorded terms`, () => {
    const result = audited(docketFromVariants(licence));
    assert.equal(result.blocked, false, JSON.stringify(result.findings));
  });
}
test('AUA and OGL remain distinct even in same docket', () => {
  const result = audited(docketFromVariants('aua', 'ogl'));
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
});
test('multiple source families have independent decisions', () => {
  const result = audited(docketFromVariants('aua', 'ogl', 'ltc', 'other'));
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
});
for (const [field, value, code] of [
  ['sourceUrl', 'UNKNOWN', 'SOURCE_URL_UNKNOWN'],
  ['licenceUrl', 'UNKNOWN', 'LICENCE_URL_UNKNOWN'],
  ['permission', 'UNKNOWN', 'PERMISSION_NOT_YES'],
  ['permission', 'NO', 'PERMISSION_NOT_YES'],
  ['licenceEvidence', 'UNKNOWN', 'LICENCE_EVIDENCE_NOT_YES'],
  ['licenceEvidence', 'NO', 'LICENCE_EVIDENCE_NOT_YES'],
  ['tier', 'UNKNOWN', 'TIER_UNKNOWN'],
  ['acquiredOn', 'UNKNOWN', 'ACQUISITION_UNKNOWN'],
  ['termsReviewedOn', 'UNKNOWN', 'TERMS_DATE_UNKNOWN'],
  ['reviewDueOn', '2026-10-20', 'REVIEW_OVERDUE'],
  ['acquiredOn', '2027-01-01', 'SOURCE_DATE_FUTURE'],
  ['termsReviewedOn', '2027-01-01', 'SOURCE_DATE_FUTURE'],
]) {
  test(`included source ${field}=${value} produces ${code}`, () => {
    blocked(fixtureDocket({ sources: [fixtureSource({ [field]: value })] }), code);
  });
}
test('unknown recheck date creates attention finding', () => {
  const result = audited(fixtureDocket({ sources: [fixtureSource({ reviewDueOn: 'UNKNOWN' })] }));
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some((f) => f.code === 'REVIEW_DUE_UNKNOWN' && f.severity === 'attention'));
});
test('recheck date exactly today creates attention', () => {
  const result = audited(fixtureDocket({ sources: [fixtureSource({ reviewDueOn: '2026-11-19' })] }));
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some((f) => f.code === 'REVIEW_DUE'));
});
test('future recheck date does not create overdue finding', () => {
  assert.ok(!codes(fixtureDocket()).includes('REVIEW_OVERDUE'));
});
test('future dataset date creates attention, not inferred source currency', () => {
  const result = audited(fixtureDocket({ sources: [fixtureSource({ datasetDate: '2026-10-10' })] }));
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some((f) => f.code === 'DATASET_AFTER_ACQUISITION'));
});
test('missing linked evidence blocks', () => blocked(fixtureDocket({ evidence: [] }), 'SOURCE_EVIDENCE_MISSING'));
test('empty source reference list blocks', () => blocked(fixtureDocket({ sources: [fixtureSource({ evidenceIds: [] })] }), 'SOURCE_NO_EVIDENCE'));
test('foreign source evidence blocks', () => {
  blocked(fixtureDocket({ evidence: [fixtureEvidence({ sourceId: 'other-source' })] }), 'SOURCE_EVIDENCE_MISMATCH');
});
test('orphan evidence blocks independently', () => {
  blocked(fixtureDocket({ evidence: [fixtureEvidence({ sourceId: 'orphan' })] }), 'ORPHAN_EVIDENCE');
});
test('evidence observed after recorded blocks', () => {
  blocked(fixtureDocket({ evidence: [fixtureEvidence({ observedOn: '2026-09-15' })] }), 'EVIDENCE_DATE_ORDER');
});
test('evidence timestamp after review date blocks', () => {
  blocked(fixtureDocket({ evidence: [fixtureEvidence({ recordedOn: '2027-01-01' })] }), 'EVIDENCE_IN_FUTURE');
});
test('unknown evidence URL creates attention', () => {
  const result = audited(fixtureDocket({ evidence: [fixtureEvidence({ url: 'UNKNOWN' })] }));
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some((f) => f.code === 'EVIDENCE_URL_UNKNOWN'));
});
test('unknown evidence tier creates attention', () => {
  const result = audited(fixtureDocket({ evidence: [fixtureEvidence({ tier: 'UNKNOWN' })] }));
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some((f) => f.code === 'EVIDENCE_TIER_UNKNOWN'));
});
test('missing accepted review decision blocks', () => blocked(fixtureDocket({ decisions: [] }), 'SOURCE_NO_ACCEPTANCE'));
test('pending review decision cannot enable publication', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ state: 'pending' })] }), 'SOURCE_NO_ACCEPTANCE');
});
test('rejected decision does not confer acceptance', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ state: 'rejected' })] }), 'SOURCE_NO_ACCEPTANCE');
});
test('accepted decision without a reason blocks', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ reason: '' })] }), 'DECISION_RATIONALE_MISSING');
});
test('accepted decision with unknown date blocks', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ decidedOn: 'UNKNOWN' })] }), 'DECISION_RATIONALE_MISSING');
});
test('accepted decision without linked reference blocks', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ evidenceIds: [] })] }), 'ACCEPTANCE_NO_EVIDENCE');
});
test('decision links to an absent reference block', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ evidenceIds: ['unknown-proof'] })] }), 'DECISION_EVIDENCE_MISSING');
});
test('decision links to a different source reference block', () => {
  blocked(fixtureDocket({ evidence: [fixtureEvidence({ sourceId: 'other-source' })] }), 'DECISION_EVIDENCE_MISMATCH');
});
test('accepted decision for absent source blocks', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ sourceId: 'gone' })] }), 'DECISION_SOURCE_MISSING');
});
test('multiple accepted decisions for source block', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision(), fixtureDecision({ id: 'second' })] }), 'MULTIPLE_ACCEPTED_DECISIONS');
});
test('rejected and accepted decisions conflict', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision(), fixtureDecision({ id: 'second', state: 'rejected' })] }), 'DECISION_CONFLICT');
});
test('future accepted decision blocks', () => {
  blocked(fixtureDocket({ decisions: [fixtureDecision({ decidedOn: '2027-01-01' })] }), 'DECISION_IN_FUTURE');
});
test('missing surface source blocks', () => {
  blocked(fixtureDocket({ surfaces: [fixtureSurface({ sourceIds: ['unknown-source'] })] }), 'SURFACE_SOURCE_MISSING');
});
test('held source on surface blocks', () => {
  blocked(fixtureDocket({ sources: [fixtureSource({ state: 'held' })] }), 'SURFACE_SOURCE_NOT_INCLUDED');
});
test('excluded source on surface blocks', () => {
  blocked(fixtureDocket({ sources: [fixtureSource({ state: 'excluded' })] }), 'SURFACE_SOURCE_NOT_INCLUDED');
});
test('surface without sources blocks', () => {
  blocked(fixtureDocket({ surfaces: [fixtureSurface({ sourceIds: [] })] }), 'SURFACE_NO_SOURCES');
});
for (const [field, value, code] of [
  ['keyboard', 'NO', 'KEYBOARD_NOT_YES'], ['keyboard', 'UNKNOWN', 'KEYBOARD_NOT_YES'],
  ['screenReader', 'NO', 'SCREEN_READER_NOT_YES'], ['screenReader', 'UNKNOWN', 'SCREEN_READER_NOT_YES'],
  ['offline', 'UNKNOWN', 'OFFLINE_NOT_YES'], ['offline', 'NO', 'OFFLINE_NOT_YES'],
  ['targetPx', 'UNKNOWN', 'TARGET_UNKNOWN'], ['targetPx', 43, 'TARGET_TOO_SMALL'],
  ['publishedOn', '2027-01-01', 'SURFACE_IN_FUTURE'],
  ['mapCredit', 'UNKNOWN', 'MAP_CREDIT_NOT_YES'], ['mapCredit', 'NO', 'MAP_CREDIT_NOT_YES'],
]) {
  test(`surface ${field}=${value} triggers ${code}`, () => {
    blocked(fixtureDocket({ surfaces: [fixtureSurface({ [field]: value })] }), code);
  });
}
test('a 44 px target passes', () => assert.equal(audited(fixtureDocket()).blocked, false));
test('a larger target passes', () => {
  assert.equal(audited(fixtureDocket({ surfaces: [fixtureSurface({ targetPx: 56 })] })).blocked, false);
});
test('map credit only required for map using OSM', () => {
  const result = audited(fixtureDocket({ surfaces: [fixtureSurface({ kind: 'list', mapCredit: 'UNKNOWN' })] }));
  assert.equal(result.blocked, false);
});
test('included source unused is attention, not inferred as published', () => {
  const result = audited(fixtureDocket({ surfaces: [fixtureSurface({ sourceIds: [] })] }));
  assert.ok(result.findings.some((f) => f.code === 'INCLUDED_SOURCE_UNUSED'));
});
test('missing OSM credit blocks', () => {
  blocked(fixtureDocket({ sources: [fixtureSource({ notice: 'Open Database License (ODbL) 1.0' })] }), 'OSM_CREDIT_MISSING');
});
test('missing ODbL line blocks separately', () => {
  blocked(fixtureDocket({ sources: [fixtureSource({ notice: SOURCES.osm.notices.en[0] })] }), 'ODBL_TERMS_MISSING');
});
test('AUA missing legend blocks', () => {
  const variant = licenceVariant('aua');
  variant.source.notice = variant.source.notice.replace(METROLINX_AUA_LEGEND, '');
  const docket = docketFromVariants('aua'); docket.sources[0].notice = variant.source.notice;
  blocked(docket, 'AUA_LEGEND_MISSING');
});
test('AUA mixed with OGL notice blocks', () => {
  const docket = docketFromVariants('aua');
  docket.sources[0].notice += `\n${METROLINX_OGL_NOTICE}`;
  blocked(docket, 'AUA_OGL_MIXED');
});
test('OGL missing exact notice blocks', () => {
  const docket = docketFromVariants('ogl'); docket.sources[0].notice = '';
  blocked(docket, 'OGL_NOTICE_MISSING');
});
test('OGL mixed with AUA legend blocks', () => {
  const docket = docketFromVariants('ogl'); docket.sources[0].notice += `\n${METROLINX_AUA_LEGEND}`;
  blocked(docket, 'OGL_AUA_MIXED');
});
test('LTC missing source acknowledgement blocks', () => {
  const docket = docketFromVariants('ltc'); docket.sources[0].notice = '';
  blocked(docket, 'LTC_CREDIT_MISSING');
});
test('provider and licence mismatch blocks', () => {
  blocked(fixtureDocket({ sources: [fixtureSource({ provider: 'ltc' })] }), 'PROVIDER_LICENCE_MISMATCH');
});
test('unknown licence blocks', () => blocked(fixtureDocket({ sources: [fixtureSource({ licence: 'UNKNOWN' })] }), 'LICENCE_UNKNOWN'));
test('other open licence must have a named open licence', () => {
  const docket = docketFromVariants('other'); docket.sources[0].licenceName = 'Open Data Licence';
  blocked(docket, 'OPEN_LICENCE_UNSPECIFIED');
});
test('other provider cannot claim OSM licence without change of provider', () => {
  blocked(fixtureDocket({ sources: [fixtureSource({ provider: 'other' })] }), 'OTHER_LICENCE_MISMATCH');
});
