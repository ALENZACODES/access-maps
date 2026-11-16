import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { UNKNOWN, emptyRecord } from './provenance-core.mjs';
import { blankSurface } from './disclosure-core.mjs';
import {
  IMPACT_RULES, impactFinding, auditImpact, assertImpact,
  impactReportObject, impactReportJson, impactReportText,
  findingsForSurface, releaseRegressionCounts, restrictedChangeFields,
} from './impact-audit.mjs';

function makeSource(overrides = {}) {
  return {
    ...emptyRecord('source'), title: 'Municipal data', status: 'included',
    use: 'place', sourceName: 'Open municipal data',
    sourceUrl: 'https://example.org/data', licence: 'OTHER-OPEN',
    licenceUrl: 'https://example.org/terms',
    acquiredOn: '2026-10-01', datasetAsOf: '2026-09-01',
    termsReviewedOn: '2026-10-01', notice: 'Open municipal data, OTHER-OPEN',
    containsOdbl: false, derivedFromOdbl: false, redistributionAllowed: true,
    ...overrides,
  };
}

function makeSurface(overrides = {}) {
  return {
    ...blankSurface('places'), titleEn: 'Places', titleFr: 'Lieux',
    state: 'included', kind: 'place', path: '/places', delivery: 'offline',
    lastReviewedOn: '2026-10-01', sourceDate: '2026-09-01',
    sourceIds: ['source'], creditEn: 'Open municipal data',
    creditFr: 'Open municipal data', noticeEn: 'OTHER-OPEN',
    noticeFr: 'OTHER-OPEN', supportsKeyboard: 'yes',
    supportsScreenReader: 'yes', minimumTargetPx: 48,
    ...overrides,
  };
}

function pkg(sourceOverrides = {}, surfaceOverrides = {}) {
  return { inventory: { version: 1, records: [makeSource(sourceOverrides)] },
    register: { version: 1, surfaces: [makeSurface(surfaceOverrides)] } };
}

function codes(before, after, options = {}) {
  return auditImpact(before, after, options).findings.map((item) => item.code);
}

function reportFor(sourceChanges = {}, surfaceChanges = {}) {
  return auditImpact(pkg(), pkg(sourceChanges, surfaceChanges),
    { referenceDate: '2026-11-15' });
}

describe('change gate baseline', () => {
  test('valid unchanged package passes', () => {
    const report = reportFor();
    assert.equal(report.passed, true);
    assert.equal(report.counts.error, 0);
    assert.ok(report.findings.some((row) => row.code === 'NO_CHANGES'));
  });
  test('reference date is explicit', () => {
    const result = auditImpact(pkg(), pkg());
    assert.equal(result.referenceDate, UNKNOWN);
    assert.ok(result.findings.some((row) => row.code === 'REVIEW_DATE_UNKNOWN'));
  });
  test('invalid reference date throws', () => {
    assert.throws(() => auditImpact(pkg(), pkg(), { referenceDate: '2026-13-01' }));
  });
  test('valid report is immutable', () => {
    const result = reportFor();
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.findings));
    assert.ok(Object.isFrozen(result.counts));
  });
  test('assert gate returns a passing report', () => {
    assert.equal(assertImpact(pkg(), pkg()).passed, true);
  });
  test('assert gate rejects blocked candidate', () => {
    assert.throws(() => assertImpact(pkg(), pkg({}, { minimumTargetPx: 25 })),
      /Change gate blocked/u);
  });
  test('output includes the changed records', () => {
    const result = reportFor({ sourceUrl: 'https://example.org/other' });
    assert.equal(result.summary.total, 1);
    assert.deepEqual(result.summary.affectedSurfaces, ['places']);
  });
  test('unchanged candidate does not add a new date', () => {
    const result = auditImpact(pkg({ datasetAsOf: UNKNOWN }, { sourceDate: UNKNOWN }),
      pkg({ datasetAsOf: UNKNOWN }, { sourceDate: UNKNOWN }));
    assert.equal(result.comparison.candidate.inventory.records[0].datasetAsOf, UNKNOWN);
    assert.equal(result.comparison.candidate.register.surfaces[0].sourceDate, UNKNOWN);
  });
  test('finding factory rejects unknown rules', () => {
    assert.throws(() => impactFinding('OTHER_RULE', 'error', null));
  });
  test('finding factory rejects unknown severity', () => {
    assert.throws(() => impactFinding('NO_CHANGES', 'severe', null));
  });
  test('factory deduplicates and sorts related ids', () => {
    const finding = impactFinding('NO_CHANGES', 'info', null, null, ['b', 'a', 'a']);
    assert.deepEqual(finding.related, ['a', 'b']);
    assert.ok(Object.isFrozen(finding.related));
  });
});

describe('dataset regressions', () => {
  for (const [field, next, expected] of [
    ['sourceUrl', 'https://example.org/new', 'DATASET_SOURCE_CHANGED'],
    ['licence', 'LTC-Open-Data-Terms', 'DATASET_LICENCE_CHANGED'],
    ['licenceUrl', 'https://example.org/new-terms', 'DATASET_LICENCE_URL_CHANGED'],
    ['provider', 'ltc', 'DATASET_PROVIDER_CHANGED'],
    ['notice', 'Changed notice', 'SOURCE_NOTICE_CHANGED'],
    ['containsOdbl', true, 'ODBL_FLAG_CHANGED'],
    ['derivedFromOdbl', true, 'ODBL_FLAG_CHANGED'],
    ['status', 'held', 'DATASET_STATUS_LOST'],
    ['redistributionAllowed', UNKNOWN, 'DATASET_PERMISSION_UNKNOWN'],
    ['redistributionAllowed', false, 'DATASET_PERMISSION_LOST'],
    ['datasetAsOf', UNKNOWN, 'DATASET_DATE_UNKNOWN'],
    ['datasetAsOf', '2026-08-01', 'DATASET_DATE_REVERSED'],
    ['termsReviewedOn', UNKNOWN, 'TERMS_REVIEW_UNKNOWN'],
    ['termsReviewedOn', '2026-09-01', 'TERMS_REVIEW_REVERSED'],
  ]) {
    test(`${field} yields ${expected}`, () => {
      assert.ok(codes(pkg(), pkg({ [field]: next })).includes(expected));
    });
  }
  test('dataset rights loss blocks release', () => {
    const result = reportFor({ redistributionAllowed: false });
    assert.equal(result.passed, false);
    assert.ok(result.counts.error > 0);
  });
  test('unknown rights never become true automatically', () => {
    const result = reportFor({ redistributionAllowed: UNKNOWN });
    assert.equal(result.comparison.candidate.inventory.records[0].redistributionAllowed, UNKNOWN);
    assert.equal(result.passed, false);
  });
  test('source URL change is reviewable even when otherwise passing', () => {
    const result = reportFor({ sourceUrl: 'https://example.org/new' });
    assert.ok(result.findings.some((finding) => finding.severity === 'warning'));
  });
  test('removing included dataset is blocked', () => {
    const candidate = pkg();
    candidate.inventory.records = [];
    const result = auditImpact(pkg(), candidate);
    assert.equal(result.passed, false);
    assert.ok(result.findings.some((finding) => finding.code === 'REMOVED_INCLUDED_DATASET'));
  });
  test('adding a valid included dataset creates review finding', () => {
    const candidate = pkg();
    candidate.inventory.records.push(makeSource({ id: 'newsource', sourceUrl: 'https://example.org/new' }));
    const result = auditImpact(pkg(), candidate);
    assert.ok(result.findings.some((finding) => finding.code === 'NEW_INCLUDED_DATASET'));
  });
  test('adding a held dataset does not claim it is included', () => {
    const candidate = pkg();
    candidate.inventory.records.push(makeSource({ id: 'newsource', status: 'held' }));
    const result = auditImpact(pkg(), candidate);
    assert.ok(!result.findings.some((finding) => finding.code === 'NEW_INCLUDED_DATASET'));
  });
  test('permission change to true is not treated as loss', () => {
    const result = auditImpact(pkg({ redistributionAllowed: UNKNOWN }), pkg());
    assert.ok(!result.findings.some((finding) => finding.code === 'DATASET_PERMISSION_LOST'));
  });
  test('chronology moving ahead is not a regression', () => {
    const result = reportFor({ datasetAsOf: '2026-10-01' }, { sourceDate: '2026-10-01' });
    assert.ok(!result.findings.some((finding) => finding.code === 'DATASET_DATE_REVERSED'));
  });
});

describe('publication surface regressions', () => {
  for (const [field, next, expected] of [
    ['state', 'held', 'SURFACE_STATE_LOST'],
    ['path', '/changed', 'SURFACE_PATH_CHANGED'],
    ['creditEn', 'Different credit', 'SURFACE_CREDIT_CHANGED'],
    ['creditFr', 'Autre crédit', 'SURFACE_CREDIT_CHANGED'],
    ['noticeEn', 'New mention', 'SURFACE_NOTICE_CHANGED'],
    ['noticeFr', 'Autre mention', 'SURFACE_NOTICE_CHANGED'],
    ['sourceDate', UNKNOWN, 'SURFACE_DATE_UNKNOWN'],
    ['sourceDate', '2026-08-01', 'SURFACE_DATE_REVERSED'],
    ['lastReviewedOn', UNKNOWN, 'SURFACE_REVIEW_DATE_UNKNOWN'],
    ['lastReviewedOn', '2026-09-01', 'SURFACE_REVIEW_DATE_REVERSED'],
    ['supportsKeyboard', UNKNOWN, 'SURFACE_ACCESS_UNKNOWN'],
    ['supportsKeyboard', 'no', 'SURFACE_ACCESS_LOST'],
    ['supportsScreenReader', UNKNOWN, 'SURFACE_ACCESS_UNKNOWN'],
    ['supportsScreenReader', 'no', 'SURFACE_ACCESS_LOST'],
    ['minimumTargetPx', UNKNOWN, 'SURFACE_TARGET_UNKNOWN'],
    ['minimumTargetPx', 36, 'SURFACE_TARGET_REDUCED'],
    ['delivery', UNKNOWN, 'SURFACE_DELIVERY_UNKNOWN'],
    ['delivery', 'online', 'SURFACE_OFFLINE_LOST'],
  ]) {
    test(`${field} yields ${expected}`, () => {
      assert.ok(codes(pkg(), pkg({}, { [field]: next })).includes(expected));
    });
  }
  test('target shrinks but remains 44 or above creates warning', () => {
    const result = reportFor({}, { minimumTargetPx: 44 });
    assert.ok(result.findings.some((f) => f.code === 'SURFACE_TARGET_REDUCED' && f.severity === 'warning'));
    assert.equal(result.passed, true);
  });
  test('target shrinks below 44 causes release failure', () => {
    const result = reportFor({}, { minimumTargetPx: 43 });
    assert.equal(result.passed, false);
    assert.ok(result.findings.some((f) => f.code === 'SURFACE_TARGET_REDUCED' && f.severity === 'error'));
  });
  test('target increases without regression finding', () => {
    assert.ok(!codes(pkg(), pkg({}, { minimumTargetPx: 60 })).includes('SURFACE_TARGET_REDUCED'));
  });
  test('an offline and online surface retains offline delivery', () => {
    assert.ok(!codes(pkg(), pkg({}, { delivery: 'both' })).includes('SURFACE_OFFLINE_LOST'));
  });
  test('deletion of included surface blocks', () => {
    const candidate = pkg();
    candidate.register.surfaces = [];
    const result = auditImpact(pkg(), candidate);
    assert.ok(result.findings.some((f) => f.code === 'REMOVED_INCLUDED_SURFACE'));
    assert.equal(result.passed, false);
  });
  test('addition of included surface requires review', () => {
    const candidate = pkg();
    candidate.register.surfaces.push(makeSurface({ id: 'another', path: '/another' }));
    const result = auditImpact(pkg(), candidate);
    assert.ok(result.findings.some((f) => f.code === 'NEW_INCLUDED_SURFACE'));
  });
  test('held surface added is not classified as published', () => {
    const candidate = pkg();
    candidate.register.surfaces.push(makeSurface({ id: 'another', path: '/another', state: 'held' }));
    const result = auditImpact(pkg(), candidate);
    assert.ok(!result.findings.some((f) => f.code === 'NEW_INCLUDED_SURFACE'));
  });
  test('a previously unknown access assessment is not assumed yes', () => {
    const result = auditImpact(pkg({}, { supportsKeyboard: UNKNOWN }),
      pkg({}, { supportsKeyboard: UNKNOWN }));
    assert.equal(result.passed, false);
    assert.equal(result.comparison.candidate.register.surfaces[0].supportsKeyboard, UNKNOWN);
  });
});

describe('link and release package checks', () => {
  test('removed source link raises a finding', () => {
    const result = reportFor({}, { sourceIds: [] });
    assert.ok(result.findings.some((f) => f.code === 'LINK_REMOVED'));
    assert.equal(result.passed, false);
  });
  test('added source link raises a finding', () => {
    const candidate = pkg();
    candidate.inventory.records.push(makeSource({ id: 'second', sourceUrl: 'https://example.org/second' }));
    candidate.register.surfaces[0].sourceIds.push('second');
    candidate.register.surfaces[0].creditEn += ' Open municipal data';
    candidate.register.surfaces[0].creditFr += ' Open municipal data';
    const result = auditImpact(pkg(), candidate);
    assert.ok(result.findings.some((f) => f.code === 'LINK_ADDED'));
    assert.ok(result.findings.some((f) => f.code === 'NEW_SOURCE_REFERENCE'));
  });
  test('candidate errors block even when there is no change to dataset', () => {
    const result = reportFor({}, { minimumTargetPx: 35 });
    assert.ok(result.findings.some((f) => f.code === 'CANDIDATE_BLOCKED'));
  });
  test('previous errors are surfaced, not silently dropped', () => {
    const result = auditImpact(pkg({}, { minimumTargetPx: 35 }), pkg());
    assert.ok(result.findings.some((f) => f.code === 'BASELINE_BLOCKED'));
  });
  test('new source references mention affected surface', () => {
    const candidate = pkg();
    candidate.inventory.records.push(makeSource({ id: 'second', sourceUrl: 'https://example.org/second' }));
    candidate.register.surfaces[0].sourceIds.push('second');
    const result = auditImpact(pkg(), candidate);
    assert.ok(result.findings.some((f) => f.code === 'NEW_SOURCE_REFERENCE' && f.target === 'places'));
  });
  test('notices are enforced by upstream audit', () => {
    const result = reportFor({}, { noticeEn: UNKNOWN });
    assert.ok(result.candidateAudit.findings.some((f) => f.code === 'MISSING_NOTICE_EN'));
    assert.equal(result.passed, false);
  });
  test('missing licence is blocked in combined gate', () => {
    const result = reportFor({ licence: UNKNOWN });
    assert.equal(result.passed, false);
    assert.ok(result.candidateAudit.provenance.findings.some((f) => f.code === 'MISSING_LICENCE'));
  });
  test('source date mismatch is blocked', () => {
    const result = reportFor({ datasetAsOf: '2026-10-01' });
    assert.ok(result.candidateAudit.findings.some((f) => f.code === 'WRONG_SOURCE_DATE'));
  });
});

describe('reporting, localization safety and indexing', () => {
  test('exports a bounded machine-readable report', () => {
    const report = reportFor({}, { minimumTargetPx: 36 });
    const data = JSON.parse(impactReportJson(report));
    assert.equal(data.passed, false);
    assert.equal(data.version, 1);
    assert.ok(data.findings.some((f) => f.code === 'SURFACE_TARGET_REDUCED'));
  });
  test('JSON is deterministic', () => {
    const report = reportFor({ sourceUrl: 'https://example.org/different' });
    assert.equal(impactReportJson(report), impactReportJson(report));
  });
  test('JSON ends with newline', () => {
    assert.ok(impactReportJson(reportFor()).endsWith('\n'));
  });
  test('text export identifies release blockage', () => {
    assert.match(impactReportText(reportFor({}, { minimumTargetPx: 10 })), /BLOCKED/u);
  });
  test('text export identifies pass', () => {
    assert.match(impactReportText(reportFor()), /Change gate: PASS/u);
  });
  test('text export shows affected changes', () => {
    assert.match(impactReportText(reportFor({ sourceUrl: 'https://example.org/new' })), /sourceUrl/u);
  });
  test('report object contains no raw package data', () => {
    const data = impactReportObject(reportFor());
    assert.ok(!Object.hasOwn(data, 'previous'));
    assert.ok(!Object.hasOwn(data, 'candidatePackage'));
    assert.ok(!Object.hasOwn(data, 'inventory'));
  });
  test('findings for surface include direct regression', () => {
    const report = reportFor({}, { minimumTargetPx: 15 });
    assert.ok(findingsForSurface(report, 'places').some((f) => f.code === 'SURFACE_TARGET_REDUCED'));
  });
  test('missing surface returns no direct findings', () => {
    assert.equal(findingsForSurface(reportFor(), 'absent').length, 0);
  });
  test('regression groups count accessibility changes', () => {
    const counts = releaseRegressionCounts(reportFor({}, { supportsKeyboard: 'no' }));
    assert.ok(counts.accessibility >= 1);
  });
  test('regression groups count rights changes', () => {
    const counts = releaseRegressionCounts(reportFor({ licence: 'LTC-Open-Data-Terms' }));
    assert.ok(counts.attribution >= 1);
  });
  test('regression groups count dates', () => {
    const counts = releaseRegressionCounts(reportFor({ datasetAsOf: UNKNOWN }, { sourceDate: UNKNOWN }));
    assert.ok(counts.dates >= 1);
  });
  test('critical fields include licence and source', () => {
    assert.ok(restrictedChangeFields().includes('licence'));
    assert.ok(restrictedChangeFields().includes('sourceUrl'));
  });
  test('no report mutates the candidate', () => {
    const candidate = pkg();
    const original = JSON.stringify(candidate);
    auditImpact(pkg(), candidate);
    assert.equal(JSON.stringify(candidate), original);
  });
  test('every finding has a stable recognized code', () => {
    const report = reportFor({}, { minimumTargetPx: 20 });
    for (const finding of report.findings) {
      assert.ok(Object.hasOwn(IMPACT_RULES, finding.code));
    }
  });
});
