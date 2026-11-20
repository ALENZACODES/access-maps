import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRightsMatrix} from './rights-core.mjs';
import {auditRightsMatrix} from './rights-audit.mjs';
import {
  matrix, source, output, exception, auaSource, oglSource, ltcSource, otherSource,
} from './rights-fixtures.mjs';
import {
  SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';
function examine(input = matrix()) { return auditRightsMatrix(parseRightsMatrix(input)); }
function codes(input = matrix()) { return examine(input).findings.map(item => item.code); }
function changedSource(key, value) { return matrix({sources: [source({[key]: value})]}); }
function changedOutput(key, value) { return matrix({outputs: [output({[key]: value})]}); }
function expectCode(input, code) { assert.ok(codes(input).includes(code), `${code} absent: ${codes(input).join(', ')}`); }
function noCode(input, code) { assert.ok(!codes(input).includes(code), `Unexpected ${code}`); }

test('an explicitly permissioned source and view has no blockers', () => {
  const result = examine();
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
  assert.equal(result.blockingCount, 0);
  assert.deepEqual(result.sourceToOutputs, {'osm-base': ['map-en']});
});
test('UNKNOWN dataset date is an attention finding, not fabricated', () => {
  const result = examine();
  assert.ok(result.findings.some(item => item.code === 'SOURCE_DATASET_DATE_UNKNOWN' && item.level === 'note'));
  assert.equal(result.noteCount, 2);
});
test('findings are deterministically sorted', () => {
  const result = examine(matrix({sources: [source({permission: 'NO', licenceUrl: 'UNKNOWN'})]}));
  const ordered = [...result.findings].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  assert.deepEqual(result.findings, ordered);
});
test('audit does not mutate the supplied record', () => {
  const input = parseRightsMatrix(matrix());
  const before = JSON.stringify(input);
  auditRightsMatrix(input);
  assert.equal(JSON.stringify(input), before);
});
test('audit refuses an unrelated unparsed object', () => assert.throws(() => auditRightsMatrix({}), TypeError));
test('an empty source register blocks publication', () => expectCode(matrix({sources: []}), 'RELEASE_NO_SOURCES'));
test('an empty output register blocks publication', () => expectCode(matrix({outputs: []}), 'RELEASE_NO_OUTPUTS'));
test('included unused source is reported as attention', () => {
  const result = examine(matrix({sources: [source(), otherSource()]}));
  assert.ok(result.findings.some(item => item.code === 'SOURCE_UNUSED' && item.level === 'note'));
});
test('held source is not required to be release-ready independently', () => {
  const result = examine(matrix({sources: [source({publication: 'held', permission: 'UNKNOWN'})], outputs: [output({state: 'held'})]}));
  assert.ok(!result.findings.some(item => item.code === 'SOURCE_PERMISSION_MISSING'));
});
test('output cannot use a held source', () => expectCode(
  matrix({sources: [source({publication: 'held'})]}), 'OUTPUT_SOURCE_NOT_INCLUDED'));
test('output cannot use an excluded source', () => expectCode(
  matrix({sources: [source({publication: 'excluded'})]}), 'OUTPUT_SOURCE_NOT_INCLUDED'));
for (const [field, code] of [
  ['sourceUrl', 'SOURCE_ORIGIN_UNKNOWN'],
  ['licenceUrl', 'SOURCE_LICENCE_LINK_UNKNOWN'],
  ['termsUrl', 'SOURCE_TERMS_LINK_UNKNOWN'],
  ['evidenceUrl', 'SOURCE_EVIDENCE_LINK_UNKNOWN'],
  ['acquiredOn', 'SOURCE_ACQUISITION_UNKNOWN'],
  ['termsReviewedOn', 'SOURCE_TERMS_DATE_UNKNOWN'],
  ['evidenceTier', 'SOURCE_EVIDENCE_TIER_UNKNOWN'],
]) {
  test(`${field} UNKNOWN blocks a source as ${code}`, () => expectCode(changedSource(field, 'UNKNOWN'), code));
  test(`${field} known avoids ${code}`, () => noCode(matrix(), code));
}
for (const field of ['permission', 'redistribution', 'openLicenceEvidence']) {
  for (const value of ['NO', 'UNKNOWN']) {
    test(`${field} ${value} blocks a source`, () => {
      const result = examine(changedSource(field, value));
      assert.equal(result.blocked, true);
      assert.ok(result.findings.some(item => item.path.endsWith(`.${field}`) && item.level === 'block'));
    });
  }
}
test('blank source attribution blocks publication', () => expectCode(changedSource('attribution', ''), 'SOURCE_ATTRIBUTION_MISSING'));
test('missing OSM contributor credit blocks even with an ODbL label', () => expectCode(
  changedSource('attribution', 'Open Database License (ODbL) 1.0'), 'OSM_CREDIT_MISSING'));
test('missing ODbL notice blocks even with contributor credit', () => expectCode(
  changedSource('attribution', '© OpenStreetMap contributors'), 'ODBL_TERMS_MISSING'));
test('OSM share-alike UNKNOWN produces a finding', () => expectCode(
  changedSource('shareAlikeRequired', 'UNKNOWN'), 'ODBL_SHARE_ALIKE_UNKNOWN'));
test('OSM with a different licence identifier is rejected', () => expectCode(
  changedSource('licenceId', 'OTHER-OPEN'), 'SOURCE_LICENCE_CONFLICT'));
test('Metrolinx cannot use the ODbL source licence identifier', () => expectCode(
  matrix({sources: [auaSource({licenceId: 'ODbL-1.0'})]}), 'SOURCE_LICENCE_CONFLICT'));
test('LTC cannot use a Metrolinx licence identifier', () => expectCode(
  matrix({sources: [ltcSource({licenceId: 'Metrolinx-AUA'})]}), 'SOURCE_LICENCE_CONFLICT'));
test('other provider cannot borrow LTC-only rights', () => expectCode(
  matrix({sources: [otherSource({licenceId: 'LTC-Open-Data-Terms'})]}), 'SOURCE_LICENCE_CONFLICT'));
test('AUA complete notice remains separate from OGL', () => {
  const input = matrix({sources: [auaSource()], outputs: [output({sourceIds: ['transit-aua'], kind: 'journey', attribution: auaSource().attribution})]});
  const result = examine(input);
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
});
test('OGL complete notice does not require the AUA legend', () => {
  const input = matrix({sources: [oglSource()], outputs: [output({sourceIds: ['transit-ogl'], kind: 'journey', attribution: oglSource().attribution})]});
  const result = examine(input);
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
});
for (const notice of [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR]) {
  test(`AUA notice omission blocks independently: ${notice.slice(0, 35)}`, () => {
    expectCode(matrix({sources: [auaSource({attribution: auaSource().attribution.replace(notice, '')})]}), 'AUA_NOTICE_MISSING');
  });
}
test('AUA source cannot silently include OGL notice', () => expectCode(matrix({sources: [auaSource({
  attribution: `${auaSource().attribution}\n${METROLINX_OGL_NOTICE}`,
})]}), 'AUA_OGL_COMBINED'));
test('OGL source cannot silently include AUA legend', () => expectCode(matrix({sources: [oglSource({
  attribution: `${oglSource().attribution}\n${METROLINX_AUA_LEGEND}`,
})]}), 'OGL_AUA_COMBINED'));
test('OGL notice absence blocks', () => expectCode(
  matrix({sources: [oglSource({attribution: 'Metrolinx data'})]}), 'OGL_NOTICE_MISSING'));
test('LTC attribution identifies the provider in source record', () => noCode(
  matrix({sources: [ltcSource()], outputs: [output({sourceIds: ['ltc-base'], kind: 'journey', attribution: ltcSource().attribution})]}), 'LTC_ATTRIBUTION_MISSING'));
test('LTC provider credit omission blocks', () => expectCode(
  matrix({sources: [ltcSource({attribution: 'Transit'})]}), 'LTC_ATTRIBUTION_MISSING'));
test('other open provider requires a named open licence', () => noCode(
  matrix({sources: [otherSource()], outputs: [output({sourceIds: ['independent-open'], kind: 'list', attribution: otherSource().attribution})]}), 'OTHER_LICENCE_NOT_IDENTIFIED'));
for (const value of ['Proprietary', 'All rights reserved', 'UNKNOWN', 'Commercial data', 'Generic Open Data']) {
  test(`unidentified other licence ${value} blocks`, () => expectCode(
    matrix({sources: [otherSource({licenceName: value})]}), 'OTHER_LICENCE_NOT_IDENTIFIED'));
}
test('included output with no source links blocks', () => expectCode(changedOutput('sourceIds', []), 'OUTPUT_NO_SOURCES'));
test('missing source identifier blocks without inventing data', () => expectCode(
  changedOutput('sourceIds', ['not-recorded']), 'OUTPUT_SOURCE_ABSENT'));
for (const field of ['keyboardAccessible', 'screenReaderLabelled', 'licenceLink']) {
  for (const state of ['NO', 'UNKNOWN']) {
    test(`included output ${field}=${state} blocks`, () => {
      const result = examine(changedOutput(field, state));
      assert.ok(result.blocked);
      assert.ok(result.findings.some(f => f.path.endsWith(`.${field}`) && f.level === 'block'));
    });
  }
}
for (const number of [0, 20, 43, 'UNKNOWN']) {
  test(`touch target ${number} blocks`, () => expectCode(changedOutput('minimumTargetPx', number), 'OUTPUT_TARGET_SMALL'));
}
for (const number of [44, 48, 64, 100]) {
  test(`touch target ${number} is within the recorded minimum`, () => noCode(changedOutput('minimumTargetPx', number), 'OUTPUT_TARGET_SMALL'));
}
test('offline output with unavailable offline status blocks', () => expectCode(changedOutput('offlineAvailable', 'NO'), 'OUTPUT_OFFLINE_UNKNOWN'));
test('offline output with unknown offline status blocks', () => expectCode(changedOutput('offlineAvailable', 'UNKNOWN'), 'OUTPUT_OFFLINE_UNKNOWN'));
test('online-only output need not declare offline access', () => noCode(
  matrix({outputs: [output({distribution: 'online', offlineAvailable: 'NO'})]}), 'OUTPUT_OFFLINE_UNKNOWN'));
test('published date UNKNOWN remains an informational finding', () => {
  const result = examine();
  assert.ok(result.findings.some(f => f.code === 'OUTPUT_DATE_UNKNOWN' && f.level === 'note'));
});
test('blank view attribution cannot cover recorded source notice', () => expectCode(changedOutput('attribution', ''), 'OUTPUT_SOURCE_NOTICE_MISSING'));
test('changed source notice not displayed on view blocks', () => expectCode(
  matrix({sources: [source({attribution: `${source().attribution}\nExtra source line`})]}), 'OUTPUT_SOURCE_NOTICE_MISSING'));
for (const state of ['NO', 'UNKNOWN']) {
  test(`source redistribution ${state} blocks downstream output`, () => expectCode(
    matrix({sources: [source({redistribution: state})]}), 'OUTPUT_REDISTRIBUTION_UNSUPPORTED'));
  test(`derived output source permission ${state} blocks`, () => expectCode(
    matrix({sources: [source({derivativeUse: state})], outputs: [output({transformation: 'derived'})]}), 'OUTPUT_DERIVATIVE_UNSUPPORTED'));
  test(`derived output share alike ${state} blocks`, () => expectCode(
    matrix({outputs: [output({transformation: 'derived', shareAlikePublished: state})]}), 'OUTPUT_SHARE_ALIKE_MISSING'));
}
test('unaltered output does not require derivative-use evidence', () => noCode(
  matrix({sources: [source({derivativeUse: 'UNKNOWN'})]}), 'OUTPUT_DERIVATIVE_UNSUPPORTED'));
test('derived output with recorded share-alike passes', () => {
  const input = matrix({outputs: [output({transformation: 'derived', shareAlikePublished: 'YES'})]});
  noCode(input, 'OUTPUT_SHARE_ALIKE_MISSING');
});
test('OSM map without visible nearby credit is blocked', () => expectCode(changedOutput('mapCredit', 'NO'), 'OUTPUT_MAP_CREDIT_MISSING'));
test('OSM data on list view is not mistaken for a map', () => noCode(
  changedOutput('kind', 'list'), 'OUTPUT_MAP_CREDIT_MISSING'));
test('AUA delivery needs separate redistribution notice evidence', () => expectCode(
  matrix({sources: [auaSource()], outputs: [output({kind: 'journey', sourceIds: ['transit-aua'], attribution: auaSource().attribution, redistributionNotice: 'NO'})]}),
  'OUTPUT_AUA_NOTICE_MISSING'));
test('AUA with explicit redistribution notice can pass', () => noCode(
  matrix({sources: [auaSource()], outputs: [output({kind: 'journey', sourceIds: ['transit-aua'], attribution: auaSource().attribution})]}),
  'OUTPUT_AUA_NOTICE_MISSING'));
test('combining ODbL and other licence without separation blocks', () => {
  const combined = `${source().attribution}\n${otherSource().attribution}`;
  expectCode(matrix({sources: [source(), otherSource()], outputs: [output({
    kind: 'list', sourceIds: ['osm-base', 'independent-open'],
    attribution: combined, transformation: 'combined', separatedDatasets: 'UNKNOWN',
  })]}), 'OUTPUT_MIXED_LICENCE_UNRESOLVED');
});
test('combined output with explicit separation avoids mixing finding', () => {
  const combined = `${source().attribution}\n${otherSource().attribution}`;
  noCode(matrix({sources: [source(), otherSource()], outputs: [output({
    kind: 'list', sourceIds: ['osm-base', 'independent-open'],
    attribution: combined, transformation: 'combined', separatedDatasets: 'YES',
  })]}), 'OUTPUT_MIXED_LICENCE_UNRESOLVED');
});
test('no mixing check for independent outputs', () => {
  const input = matrix({sources: [source(), otherSource()], outputs: [output(), output({
    id: 'other-page', route: 'pages/other.html', kind: 'list',
    sourceIds: ['independent-open'], attribution: otherSource().attribution,
  })]});
  noCode(input, 'OUTPUT_MIXED_LICENCE_UNRESOLVED');
});
test('open exception on included output blocks', () => expectCode(
  matrix({exceptions: [exception({disposition: 'open'})]}), 'EXCEPTION_UNRESOLVED'));
test('open exception on held output does not block as an included output', () => noCode(
  matrix({outputs: [output({state: 'held'})], exceptions: [exception({disposition: 'open'})]}), 'EXCEPTION_UNRESOLVED'));
test('exception referencing an absent source blocks', () => expectCode(
  matrix({exceptions: [exception({sourceId: 'absent'})]}), 'EXCEPTION_SOURCE_ABSENT'));
test('exception referencing an absent view blocks', () => expectCode(
  matrix({exceptions: [exception({outputId: 'absent'})]}), 'EXCEPTION_OUTPUT_ABSENT'));
test('exception source must be linked to the referenced output', () => expectCode(
  matrix({exceptions: [exception({sourceId: 'other'})]}), 'EXCEPTION_NOT_LINKED'));
test('resolved exception without URL evidence blocks', () => expectCode(
  matrix({exceptions: [exception({evidenceUrl: 'UNKNOWN'})]}), 'EXCEPTION_RESOLUTION_EVIDENCE_MISSING'));
test('resolved exception without recorded date blocks', () => expectCode(
  matrix({exceptions: [exception({recordedOn: 'UNKNOWN'})]}), 'EXCEPTION_RESOLUTION_EVIDENCE_MISSING'));
test('resolved exception without reason blocks', () => expectCode(
  matrix({exceptions: [exception({reason: ''})]}), 'EXCEPTION_RESOLUTION_EVIDENCE_MISSING'));
test('resolved exception does not bypass missing redistribution rights', () => {
  const result = examine(matrix({sources: [source({redistribution: 'NO'})], exceptions: [exception()]}));
  assert.ok(result.blocked);
  assert.ok(result.findings.some(f => f.code === 'SOURCE_REDISTRIBUTION_MISSING'));
});
test('identical exception subjects produce a nonblocking attention item', () => {
  const result = examine(matrix({exceptions: [exception(), exception({id: 'decision-two'})]}));
  assert.ok(result.findings.some(f => f.code === 'EXCEPTION_DUPLICATED' && f.level === 'note'));
});
test('an excluded output does not trigger output-specific blocks', () => {
  const input = matrix({outputs: [output({state: 'excluded', keyboardAccessible: 'NO', minimumTargetPx: 20})]});
  const result = examine(input);
  assert.ok(!result.findings.some(f => f.code === 'OUTPUT_KEYBOARD_MISSING'));
});
test('each finding includes machine-readable provenance', () => {
  const result = examine(changedSource('permission', 'NO'));
  for (const finding of result.findings) {
    assert.equal(typeof finding.code, 'string');
    assert.equal(typeof finding.path, 'string');
    assert.ok(['block', 'note'].includes(finding.level));
    assert.ok(Object.hasOwn(finding, 'sourceId'));
    assert.ok(Object.hasOwn(finding, 'outputId'));
  }
});
test('audit code preserves source and page associations', () => {
  const result = examine(changedOutput('mapCredit', 'NO'));
  const item = result.findings.find(f => f.code === 'OUTPUT_MAP_CREDIT_MISSING');
  assert.equal(item.sourceId, 'osm-base');
  assert.equal(item.outputId, 'map-en');
});
test('source notices use the single authoritative shared catalogue', () => {
  assert.equal(SOURCES.osm.notices.en[0], '© OpenStreetMap contributors');
  assert.ok(SOURCES.osm.notices.en[1].includes('ODbL'));
  assert.ok(METROLINX_AUA_LEGEND.length > 100);
  assert.ok(METROLINX_OGL_NOTICE.startsWith('Contains information'));
});
