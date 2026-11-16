import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNKNOWN, emptyRecord,
} from './provenance-core.mjs';
import {
  blankSurface, parseRegister,
} from './disclosure-core.mjs';
import {
  DISCLOSURE_RULES, DISCLOSURE_SEVERITIES, disclosureFinding,
  auditDisclosures, assertDisclosures, disclosureReportText,
  disclosureReportJson,
} from './disclosure-audit.mjs';
import {
  METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
} from './attribution-utils.mjs';

function record(overrides = {}) {
  return {
    ...emptyRecord('roads'), id: 'roads', title: 'Public roads',
    provider: 'other', use: 'place', status: 'included',
    sourceName: 'Municipal open source',
    sourceUrl: 'https://example.org/roads',
    licence: 'OTHER-OPEN', licenceUrl: 'https://example.org/terms',
    acquiredOn: '2026-09-01', datasetAsOf: '2026-08-01',
    termsReviewedOn: '2026-09-01', notice: 'Municipal open source',
    containsOdbl: false, derivedFromOdbl: false,
    redistributionAllowed: true,
    ...overrides,
  };
}
function surface(overrides = {}) {
  return {
    ...blankSurface('places'), titleEn: 'Places', titleFr: 'Lieux',
    kind: 'place', state: 'included', path: '/places',
    delivery: 'both', lastReviewedOn: '2026-09-01',
    sourceIds: ['roads'], creditEn: 'Municipal open source',
    creditFr: 'Municipal open source',
    noticeEn: 'OTHER-OPEN Municipal open source',
    noticeFr: 'OTHER-OPEN Municipal open source',
    sourceDate: '2026-08-01', supportsKeyboard: 'yes',
    supportsScreenReader: 'yes', minimumTargetPx: 44,
    ...overrides,
  };
}
function packageWith(surfaces = [surface()], records = [record()]) {
  return {
    inventory: { version: 1, records },
    register: { version: 1, surfaces },
  };
}
function report(surfaces = [surface()], records = [record()], referenceDate = '2026-11-15') {
  return auditDisclosures(packageWith(surfaces, records), { referenceDate });
}
function codes(value) {
  return value.findings.map((item) => item.code);
}
function expectBlocked(code, surfaces = [surface()], records = [record()]) {
  const result = report(surfaces, records);
  assert.equal(result.passed, false, code);
  assert.ok(codes(result).includes(code), `${code} missing from ${codes(result)}`);
  assert.ok(result.findings.find((item) => item.code === code && item.severity === 'error'));
  assert.throws(() => assertDisclosures(packageWith(surfaces, records),
    { referenceDate: '2026-11-15' }), /Disclosure gate blocked/u);
}

describe('publication gate control cases', () => {
  it('passes when source and surface evidence is complete', () => {
    const value = report();
    assert.equal(value.passed, true);
    assert.equal(value.counts.error, 0);
    assert.equal(value.provenance.passed, true);
    assert.equal(value.includedSurfaces, 1);
  });
  it('accepts the exact minimum target of 44 pixels', () => {
    assert.equal(report([surface({ minimumTargetPx: 44 })]).passed, true);
  });
  it('accepts a larger documented target', () => {
    assert.equal(report([surface({ minimumTargetPx: 60 })]).passed, true);
  });
  it('accepts documented offline mode', () => {
    assert.equal(report([surface({ delivery: 'offline' })]).passed, true);
  });
  it('also accepts explicit online and offline delivery', () => {
    assert.equal(report([surface({ delivery: 'both' })]).passed, true);
  });
  it('blocks an empty release', () => {
    expectBlocked('EMPTY_SURFACES', []);
  });
  it('blocks a published surface without a linked source', () => {
    expectBlocked('NO_SOURCES', [surface({ sourceIds: [] })]);
  });
  it('blocks a published surface referring to an absent source', () => {
    expectBlocked('ORPHAN_SOURCE', [surface({ sourceIds: ['missing'] })]);
  });
  it('blocks a surface using a held source', () => {
    expectBlocked('HELD_SOURCE', [surface()], [record({ status: 'held' })]);
  });
  it('blocks a surface using an excluded source', () => {
    expectBlocked('EXCLUDED_SOURCE', [surface()], [record({ status: 'excluded' })]);
  });
  it('warns when an included dataset is unused', () => {
    const value = report([surface()], [record(), record({
      id: 'unused', sourceUrl: 'https://example.org/unused',
    })]);
    assert.ok(codes(value).includes('UNUSED_SOURCE'));
    assert.equal(value.findings.find((item) => item.code === 'UNUSED_SOURCE').severity, 'warning');
  });
  it('blocks a missing English title', () => {
    expectBlocked('MISSING_TITLE_EN', [surface({ titleEn: UNKNOWN })]);
  });
  it('blocks a missing French title', () => {
    expectBlocked('MISSING_TITLE_FR', [surface({ titleFr: UNKNOWN })]);
  });
  it('blocks a missing English credit', () => {
    expectBlocked('MISSING_CREDIT_EN', [surface({ creditEn: UNKNOWN })]);
  });
  it('blocks a missing French credit', () => {
    expectBlocked('MISSING_CREDIT_FR', [surface({ creditFr: UNKNOWN })]);
  });
  it('blocks a missing English notice', () => {
    expectBlocked('MISSING_NOTICE_EN', [surface({ noticeEn: UNKNOWN })]);
  });
  it('blocks a missing French notice', () => {
    expectBlocked('MISSING_NOTICE_FR', [surface({ noticeFr: UNKNOWN })]);
  });
  it('blocks English credit that does not name the source', () => {
    expectBlocked('MISSING_SOURCE_NAME_EN', [surface({ creditEn: 'Unknown publisher' })]);
  });
  it('blocks French credit that does not name the source', () => {
    expectBlocked('MISSING_SOURCE_NAME_FR', [surface({ creditFr: 'Autre organisme' })]);
  });
  it('blocks a notice without the English licence identifier', () => {
    expectBlocked('MISSING_LICENCE_EN', [surface({ noticeEn: 'Municipal open source' })]);
  });
  it('blocks a notice without the French licence identifier', () => {
    expectBlocked('MISSING_LICENCE_FR', [surface({ noticeFr: 'Municipal open source' })]);
  });
  it('blocks a missing review date', () => {
    expectBlocked('MISSING_REVIEW_DATE', [surface({ lastReviewedOn: UNKNOWN })]);
  });
  it('blocks a review date after the explicit release date', () => {
    expectBlocked('FUTURE_REVIEW_DATE', [surface({ lastReviewedOn: '2027-01-01' })]);
  });
  it('allows unknown dataset date as information rather than inventing it', () => {
    const value = report([surface({ sourceDate: UNKNOWN })], [record({ datasetAsOf: UNKNOWN })]);
    assert.equal(value.passed, true);
    assert.ok(codes(value).includes('UNKNOWN_SOURCE_DATE'));
    assert.equal(value.findings.find((item) => item.code === 'UNKNOWN_SOURCE_DATE').severity, 'info');
  });
  it('blocks conflicting dates for a single linked dataset', () => {
    expectBlocked('WRONG_SOURCE_DATE', [surface({ sourceDate: '2026-08-02' })]);
  });
  it('does not invent a date from an unknown source', () => {
    const value = report([surface({ sourceDate: UNKNOWN })], [record({ datasetAsOf: UNKNOWN })]);
    assert.equal(value.passed, true);
    assert.ok(value.findings.some((item) => item.code === 'UNKNOWN_SOURCE_DATE'));
  });
  it('blocks unknown delivery mode', () => {
    expectBlocked('UNKNOWN_DELIVERY', [surface({ delivery: UNKNOWN })]);
  });
  it('warns when the source is only available online', () => {
    const value = report([surface({ delivery: 'online' })]);
    assert.equal(value.passed, true);
    assert.ok(codes(value).includes('ONLINE_ONLY'));
  });
  it('blocks unassessed keyboard support', () => {
    expectBlocked('KEYBOARD_UNKNOWN', [surface({ supportsKeyboard: UNKNOWN })]);
  });
  it('blocks an explicit keyboard support failure', () => {
    expectBlocked('KEYBOARD_NO', [surface({ supportsKeyboard: 'no' })]);
  });
  it('blocks unassessed screen reader support', () => {
    expectBlocked('SCREEN_READER_UNKNOWN', [surface({ supportsScreenReader: UNKNOWN })]);
  });
  it('blocks an explicit screen reader support failure', () => {
    expectBlocked('SCREEN_READER_NO', [surface({ supportsScreenReader: 'no' })]);
  });
  it('blocks unknown target dimensions', () => {
    expectBlocked('TARGET_UNKNOWN', [surface({ minimumTargetPx: UNKNOWN })]);
  });
  it('blocks a 43-pixel minimum', () => {
    expectBlocked('TARGET_TOO_SMALL', [surface({ minimumTargetPx: 43 })]);
  });
  it('blocks a zero-pixel target', () => {
    expectBlocked('TARGET_TOO_SMALL', [surface({ minimumTargetPx: 0 })]);
  });
  it('held surfaces never count as a release', () => {
    const value = report([surface({ state: 'held' })]);
    assert.equal(value.passed, false);
    assert.ok(codes(value).includes('HELD_SURFACE'));
    assert.ok(codes(value).includes('EMPTY_SURFACES'));
  });
  it('excluded surfaces never count as a release', () => {
    const value = report([surface({ state: 'excluded' })]);
    assert.equal(value.passed, false);
    assert.ok(codes(value).includes('EXCLUDED_SURFACE'));
    assert.ok(codes(value).includes('EMPTY_SURFACES'));
  });
  it('held surfaces do not receive critical findings for incomplete fields', () => {
    const value = report([surface({ state: 'held', titleFr: UNKNOWN })]);
    assert.ok(!codes(value).includes('MISSING_TITLE_FR'));
  });
  it('does not automatically infer use when kind is other', () => {
    const value = report([surface({ kind: 'other' })]);
    assert.ok(codes(value).includes('MISSING_USE_CLASS'));
  });
  it('warns on a data use mismatch', () => {
    const value = report([surface({ kind: 'map' })]);
    assert.ok(codes(value).includes('SOURCE_USE_MISMATCH'));
  });
  it('supports unknown reference date without guessing from system time', () => {
    const value = auditDisclosures(packageWith(), { referenceDate: UNKNOWN });
    assert.equal(value.referenceDate, UNKNOWN);
  });
  it('rejects invalid supplied reference dates', () => {
    assert.throws(() => auditDisclosures(packageWith(), { referenceDate: '2026-02-30' }), /Invalid reference date/u);
  });
  it('exposes actionable and deterministic audit results', () => {
    assert.deepEqual(report().findings, report().findings);
    assert.ok(Object.isFrozen(report().findings));
  });
  it('returns all declared finding codes', () => {
    for (const code of Object.keys(DISCLOSURE_RULES)) {
      assert.equal(disclosureFinding(code, 'info').code, code);
    }
  });
  it('rejects unknown finding codes', () => {
    assert.throws(() => disclosureFinding('NO_SUCH_RULE', 'info'), /Unsupported code/u);
  });
  it('rejects unknown severity', () => {
    assert.throws(() => disclosureFinding('NO_SOURCES', 'fatal'), /Unsupported severity/u);
  });
  it('supports only known finding severities', () => {
    assert.deepEqual(DISCLOSURE_SEVERITIES, ['error', 'warning', 'info']);
  });
  it('does not mutate supplied inventory or register', () => {
    const bundle = packageWith();
    const before = JSON.stringify(bundle);
    auditDisclosures(bundle);
    assert.equal(JSON.stringify(bundle), before);
  });
  it('serializes a useful text report', () => {
    const text = disclosureReportText(report([surface({ minimumTargetPx: 12 })]));
    assert.match(text, /TARGET_TOO_SMALL/u);
    assert.match(text, /BLOCKED/u);
  });
  it('serializes a structured JSON report', () => {
    const value = JSON.parse(disclosureReportJson(report()));
    assert.equal(value.passed, true);
    assert.equal(value.includedSurfaces, 1);
    assert.equal(value.provenance.passed, true);
  });
  it('reports upstream errors even without surface errors', () => {
    const value = report([surface()], [record({ licenceUrl: UNKNOWN })]);
    assert.equal(value.passed, false);
    assert.ok(value.provenance.findings.some((item) => item.code === 'MISSING_LICENCE_LINK'));
  });
  it('blocks a linked source with upstream errors', () => {
    expectBlocked('SOURCE_AUDIT', [surface()], [record({ licenceUrl: UNKNOWN })]);
  });
  it('blocks an unknown linked source licence', () => {
    expectBlocked('SOURCE_LICENCE_UNKNOWN', [surface()], [record({ licence: UNKNOWN })]);
  });
  it('blocks unknown source redistribution permissions', () => {
    expectBlocked('SOURCE_PERMISSION_UNKNOWN', [surface()], [record({ redistributionAllowed: UNKNOWN })]);
  });
  it('blocks denied source redistribution permissions', () => {
    expectBlocked('SOURCE_PERMISSION_NO', [surface()], [record({ redistributionAllowed: false })]);
  });
  it('counts two included surfaces separately', () => {
    const bundle = packageWith([
      surface({ path: '/places' }),
      surface({ id: 'details', path: '/details' }),
    ]);
    assert.equal(auditDisclosures(bundle).includedSurfaces, 2);
  });
});

describe('provider-specific source credit and mixing', () => {
  it('blocks an incomplete GTFS section 3 legend', () => {
    const data = record({
      provider: 'metrolinx', licence: 'Metrolinx-AUA',
      notice: METROLINX_AUA_LEGEND,
    });
    const entry = surface({ noticeEn: 'Metrolinx-AUA', noticeFr: 'Metrolinx-AUA' });
    expectBlocked('MISSING_AUA_NOTICE', [entry], [data]);
  });
  it('accepts the literal AUA text on the surface', () => {
    const data = record({ provider: 'metrolinx', licence: 'Metrolinx-AUA',
      notice: METROLINX_AUA_LEGEND });
    const entry = surface({ noticeEn: `Metrolinx-AUA ${METROLINX_AUA_LEGEND}`,
      noticeFr: 'Metrolinx-AUA', kind: 'place' });
    assert.equal(report([entry], [data]).passed, true);
  });
  it('blocks an incomplete OGL notice', () => {
    const data = record({ provider: 'metrolinx', licence: 'OGL-Ontario-Metrolinx',
      notice: METROLINX_OGL_NOTICE });
    expectBlocked('MISSING_OGL_NOTICE', [surface({ noticeEn: 'OGL-Ontario-Metrolinx',
      noticeFr: 'OGL-Ontario-Metrolinx' })], [data]);
  });
  it('accepts a complete OGL notice', () => {
    const data = record({ provider: 'metrolinx', licence: 'OGL-Ontario-Metrolinx',
      notice: METROLINX_OGL_NOTICE });
    const entry = surface({ noticeEn: `OGL-Ontario-Metrolinx ${METROLINX_OGL_NOTICE}`,
      noticeFr: 'OGL-Ontario-Metrolinx' });
    assert.equal(report([entry], [data]).passed, true);
  });
  it('blocks a missing OpenStreetMap credit', () => {
    const data = record({ provider: 'osm', use: 'map', licence: 'ODbL-1.0',
      containsOdbl: true, notice: '© OpenStreetMap contributors' });
    const entry = surface({ kind: 'map', noticeEn: 'ODbL-1.0', noticeFr: 'ODbL-1.0' });
    expectBlocked('MISSING_ODBL_CREDIT', [entry], [data]);
  });
  it('allows a complete OpenStreetMap credit', () => {
    const data = record({ provider: 'osm', use: 'map', licence: 'ODbL-1.0',
      containsOdbl: true, notice: '© OpenStreetMap contributors' });
    const entry = surface({ kind: 'map', noticeEn: 'ODbL-1.0 © OpenStreetMap contributors',
      noticeFr: 'ODbL-1.0 © OpenStreetMap contributors' });
    assert.equal(report([entry], [data]).passed, true);
  });
  it('blocks missing London Transit Commission credit', () => {
    const data = record({ provider: 'ltc', licence: 'LTC-Open-Data-Terms',
      notice: 'London Transit Commission' });
    expectBlocked('MISSING_LTC_CREDIT', [surface({
      noticeEn: 'LTC-Open-Data-Terms', noticeFr: 'LTC-Open-Data-Terms',
    })], [data]);
  });
  it('accepts London Transit Commission credit', () => {
    const data = record({ provider: 'ltc', licence: 'LTC-Open-Data-Terms',
      notice: 'London Transit Commission' });
    const entry = surface({ noticeEn: 'LTC-Open-Data-Terms London Transit Commission',
      noticeFr: 'LTC-Open-Data-Terms London Transit Commission' });
    assert.equal(report([entry], [data]).passed, true);
  });
  it('blocks mixing ODbL records with unrelated licences', () => {
    const osm = record({ id: 'osm', provider: 'osm', licence: 'ODbL-1.0',
      use: 'map', containsOdbl: true, notice: '© OpenStreetMap contributors' });
    const other = record({ id: 'roads', sourceUrl: 'https://example.org/roads' });
    const entry = surface({ sourceIds: ['osm', 'roads'], kind: 'map',
      creditEn: 'Municipal open source', creditFr: 'Municipal open source',
      noticeEn: 'ODbL-1.0 OTHER-OPEN OpenStreetMap',
      noticeFr: 'ODbL-1.0 OTHER-OPEN OpenStreetMap' });
    expectBlocked('MIXED_ODBL', [entry], [osm, other]);
  });
  it('never infers that missing ODbL indicators mean no derivation', () => {
    const value = report([surface()], [record({ containsOdbl: UNKNOWN })]);
    assert.equal(value.passed, false);
    assert.ok(value.provenance.findings.some((item) => item.code === 'ODBL_DERIVATION'));
  });
});
