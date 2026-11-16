import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNKNOWN, emptyRecord, parseInventory } from './provenance-core.mjs';
import {
  RULES, SEVERITIES, finding, auditInventory, assertReleaseReady,
  reportAsText, reportAsJson,
} from './provenance-audit.mjs';
import {
  METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
} from './attribution-utils.mjs';

const record = (changes = {}) => ({
  ...emptyRecord('sample'),
  title: 'Sample record',
  provider: 'osm',
  use: 'map',
  status: 'included',
  sourceName: 'OpenStreetMap',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  licence: 'ODbL-1.0',
  licenceUrl: 'https://www.openstreetmap.org/copyright',
  acquiredOn: '2026-09-01',
  datasetAsOf: UNKNOWN,
  termsReviewedOn: '2026-09-02',
  notice: '© OpenStreetMap contributors — ODbL 1.0',
  notes: '',
  containsOdbl: true,
  derivedFromOdbl: false,
  redistributionAllowed: true,
  ...changes,
});
const register = (...records) => ({ version: 1, records });
const check = (input) => auditInventory(register(input), { referenceDate: '2026-11-15' });
const codes = (report) => report.findings.map((item) => item.code);
const hasError = (report, name) => report.findings.some((item) =>
  item.code === name && item.severity === 'error');

describe('release gate', () => {
  it('blocks an empty release', () => {
    assert.equal(auditInventory(register()).passed, false);
    assert.equal(hasError(auditInventory(register()), 'EMPTY_RELEASE'), true);
  });
  it('accepts a fully described OSM source while retaining unknown dataset date', () => {
    const result = check(record());
    assert.equal(result.passed, true);
    assert.ok(codes(result).includes('UNKNOWN_DATASET_DATE'));
    assert.equal(result.includedCount, 1);
  });
  it('blocks missing source URL', () => {
    assert.equal(hasError(check(record({ sourceUrl: UNKNOWN })), 'MISSING_SOURCE'), true);
  });
  it('blocks missing source name', () => {
    assert.equal(hasError(check(record({ sourceName: UNKNOWN })), 'MISSING_SOURCE_CREDIT'), true);
  });
  it('blocks unknown licence', () => {
    assert.equal(hasError(check(record({ licence: UNKNOWN })), 'MISSING_LICENCE'), true);
  });
  it('blocks missing licence URL', () => {
    assert.equal(hasError(check(record({ licenceUrl: UNKNOWN })), 'MISSING_LICENCE_LINK'), true);
  });
  it('blocks missing acquisition date', () => {
    assert.equal(hasError(check(record({ acquiredOn: UNKNOWN })), 'MISSING_ACQUISITION_DATE'), true);
  });
  it('blocks missing terms review date', () => {
    assert.equal(hasError(check(record({ termsReviewedOn: UNKNOWN })), 'MISSING_TERMS_DATE'), true);
  });
  it('blocks missing notice', () => {
    assert.equal(hasError(check(record({ notice: UNKNOWN })), 'MISSING_NOTICE'), true);
  });
  it('blocks unknown permission', () => {
    assert.equal(hasError(check(record({ redistributionAllowed: UNKNOWN })), 'REDISTRIBUTION_UNKNOWN'), true);
  });
  it('blocks explicit denied permission', () => {
    assert.equal(hasError(check(record({ redistributionAllowed: false })), 'REDISTRIBUTION_DENIED'), true);
  });
  it('blocks unknown ODbL containment', () => {
    assert.equal(hasError(check(record({ containsOdbl: UNKNOWN })), 'ODBL_DERIVATION'), true);
  });
  it('blocks unknown ODbL derivation', () => {
    assert.equal(hasError(check(record({ derivedFromOdbl: UNKNOWN })), 'ODBL_DERIVATION'), true);
  });
  it('blocks OSM containment falsely marked absent', () => {
    assert.equal(hasError(check(record({ containsOdbl: false })), 'INCORRECT_ODBL_FLAG'), true);
  });
  it('blocks an OSM licence mismatch', () => {
    assert.equal(hasError(check(record({ licence: 'OTHER-OPEN' })), 'LICENCE_PROVIDER_MISMATCH'), true);
  });
  it('blocks an omitted OSM credit', () => {
    assert.equal(hasError(check(record({ notice: 'source credit missing' })), 'ODBL_MAP_CREDIT'), true);
  });
  it('warns when included ODbL data needs isolation review', () => {
    const result = check(record({ derivedFromOdbl: true }));
    assert.ok(result.findings.some((item) =>
      item.code === 'ODBL_MIXED_DATA' && item.severity === 'warning'));
  });
  it('blocks ODbL-derived data mixed into another provider', () => {
    const result = check(record({ provider: 'other', use: 'place',
      sourceName: 'Independent source', licence: 'OTHER-OPEN',
      derivedFromOdbl: true }));
    assert.equal(hasError(result, 'ODBL_MIXED_DATA'), true);
  });
  it('blocks intended use left as other', () => {
    assert.equal(hasError(check(record({ use: 'other' })), 'MISSING_DATA_USE'), true);
  });
  it('blocks dates after the supplied reference date', () => {
    assert.equal(hasError(check(record({ acquiredOn: '2027-01-01' })), 'FUTURE_DATE'), true);
  });
  it('does not use a clock when the reference date is UNKNOWN', () => {
    const result = auditInventory(register(record({ acquiredOn: '2027-01-01' })));
    assert.equal(codes(result).includes('FUTURE_DATE'), false);
  });
  it('rejects an invalid reference date', () => {
    assert.throws(() => auditInventory(register(record()), { referenceDate: 'today' }));
  });
  it('warns when terms were reviewed before acquisition', () => {
    const result = check(record({ termsReviewedOn: '2026-08-31' }));
    assert.ok(codes(result).includes('TERMS_BEFORE_ACQUISITION'));
  });
  it('marks a held record as not a release candidate', () => {
    const result = auditInventory(register(record({ status: 'held' })));
    assert.equal(result.includedCount, 0);
    assert.ok(codes(result).includes('HELD_RELEASE'));
    assert.ok(codes(result).includes('EMPTY_RELEASE'));
  });
  it('does not count excluded records as included', () => {
    const result = auditInventory(register(record({ status: 'excluded' })));
    assert.equal(result.includedCount, 0);
    assert.ok(codes(result).includes('EMPTY_RELEASE'));
  });
  it('ignores excluded record incompleteness', () => {
    const result = auditInventory(register(
      record(), record({ ...emptyRecord('not-used'), status: 'excluded' }),
    ));
    assert.equal(result.passed, true);
  });
  it('downgrades missing held information to warnings', () => {
    const result = auditInventory(register(record(),
      record({ ...emptyRecord('held-item'), status: 'held' })));
    assert.equal(result.passed, true);
    assert.ok(result.findings.some((entry) =>
      entry.recordId === 'held-item' && entry.severity === 'warning'));
  });
  it('warns for duplicated included feed URLs', () => {
    const result = auditInventory(register(record(), record({ id: 'other' })));
    assert.ok(codes(result).includes('DUPLICATE_FEED'));
  });
  it('does not treat shared UNKNOWN URLs as duplicate feeds', () => {
    const result = auditInventory(register(record({ sourceUrl: UNKNOWN }),
      record({ id: 'other', sourceUrl: UNKNOWN })));
    assert.ok(!codes(result).includes('DUPLICATE_FEED'));
  });
  it('does not compare unknown dataset dates', () => {
    const result = check(record({ datasetAsOf: UNKNOWN }));
    assert.ok(!codes(result).includes('FUTURE_DATE'));
  });
  it('blocks a future supplied dataset date', () => {
    assert.equal(hasError(check(record({ datasetAsOf: '2027-01-01' })), 'FUTURE_DATE'), true);
  });
  it('counts blocking, review and informational findings separately', () => {
    const result = check(record({ sourceUrl: UNKNOWN, datasetAsOf: UNKNOWN }));
    assert.ok(result.counts.error > 0);
    assert.ok(result.counts.info > 0);
    assert.equal(result.counts.error + result.counts.warning + result.counts.info,
      result.findings.length);
  });
  it('rejects an unrecognised rule code', () => {
    assert.throws(() => finding('not-a-rule', 'error'));
  });
  it('rejects an unrecognised severity', () => {
    assert.throws(() => finding('MISSING_SOURCE', 'fatal'));
  });
  it('keeps all codes backed by explanatory text', () => {
    assert.ok(Object.values(RULES).every((value) => value.length > 15));
    assert.deepEqual(SEVERITIES, ['error', 'warning', 'info']);
  });
  it('throws when a release gate has errors', () => {
    assert.throws(() => assertReleaseReady(register(record({ licence: UNKNOWN }))),
      /Provenance gate failed/u);
  });
  it('returns a report for a passing register', () => {
    assert.equal(assertReleaseReady(register(record())).passed, true);
  });
  it('includes code and record identifier in gate exceptions', () => {
    assert.throws(() => assertReleaseReady(register(record({ licence: UNKNOWN }))),
      /sample:MISSING_LICENCE/u);
  });
  it('sorts findings for reproducible output', () => {
    const result = check(record({ sourceUrl: UNKNOWN, licence: UNKNOWN }));
    assert.deepEqual(result.findings, [...result.findings].sort((a, b) =>
      (a.recordId ?? '').localeCompare(b.recordId ?? '') ||
      a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity)));
  });
  it('returns immutable findings', () => {
    const report = check(record());
    assert.equal(Object.isFrozen(report.findings), true);
    assert.equal(Object.isFrozen(report.findings[0]), true);
  });
  it('does not change incoming records', () => {
    const source = register(record());
    const snapshot = JSON.stringify(source);
    auditInventory(source);
    assert.equal(JSON.stringify(source), snapshot);
  });
});

describe('provider-specific checks', () => {
  const metrolinx = (updates = {}) => record({
    provider: 'metrolinx',
    use: 'transit',
    sourceName: 'Metrolinx',
    licence: 'Metrolinx-AUA',
    notice: METROLINX_AUA_LEGEND,
    containsOdbl: false,
    derivedFromOdbl: false,
    ...updates,
  });
  const ltc = (updates = {}) => record({
    provider: 'ltc',
    use: 'transit',
    sourceName: 'London Transit Commission',
    licence: 'LTC-Open-Data-Terms',
    notice: 'Data provided by London Transit Commission',
    containsOdbl: false,
    ...updates,
  });
  it('accepts the exact Metrolinx AUA legend', () => {
    assert.equal(check(metrolinx()).passed, true);
  });
  it('blocks a shortened Metrolinx AUA legend', () => {
    assert.equal(hasError(check(metrolinx({ notice: 'Metrolinx data' })), 'METROLINX_LEGEND'), true);
  });
  it('does not accept the OGL line as the AUA legend', () => {
    assert.equal(hasError(check(metrolinx({ notice: METROLINX_OGL_NOTICE })), 'METROLINX_LEGEND'), true);
  });
  it('accepts the Metrolinx OGL line with its own licence selection', () => {
    assert.equal(check(metrolinx({ licence: 'OGL-Ontario-Metrolinx',
      notice: METROLINX_OGL_NOTICE })).passed, true);
  });
  it('blocks missing Metrolinx OGL notice', () => {
    assert.equal(hasError(check(metrolinx({ licence: 'OGL-Ontario-Metrolinx',
      notice: METROLINX_AUA_LEGEND })), 'METROLINX_OGL'), true);
  });
  it('blocks unresolved Metrolinx licence choice', () => {
    assert.equal(hasError(check(metrolinx({ licence: UNKNOWN })),
      'METROLINX_AGREEMENT_CHOICE'), true);
  });
  it('does not join distinct Metrolinx obligations automatically', () => {
    const result = check(metrolinx());
    assert.equal(codes(result).includes('METROLINX_OGL'), false);
  });
  it('accepts the London Transit Commission notice', () => {
    assert.equal(check(ltc()).passed, true);
  });
  it('warns if the LTC acknowledgement is absent', () => {
    const result = check(ltc({ notice: 'Unspecified transit feed' }));
    assert.ok(result.findings.some((item) =>
      item.code === 'LTC_CREDIT' && item.severity === 'warning'));
  });
  it('blocks an LTC licence mismatch', () => {
    assert.equal(hasError(check(ltc({ licence: 'ODbL-1.0' })),
      'LICENCE_PROVIDER_MISMATCH'), true);
  });
  it('can classify a generic open source explicitly', () => {
    const result = check(record({ provider: 'other', use: 'place',
      licence: 'OTHER-OPEN', containsOdbl: false, sourceName: 'Example provider' }));
    assert.equal(result.passed, true);
  });
});

describe('audit outputs', () => {
  it('provides plain-text counts and failures', () => {
    const report = check(record({ licence: UNKNOWN }));
    const text = reportAsText(report);
    assert.match(text, /Provenance audit: FAIL/u);
    assert.match(text, /MISSING_LICENCE/u);
    assert.match(text, /Included: 1/u);
    assert.match(text, /Reference date: 2026-11-15/u);
  });
  it('provides machine-readable JSON', () => {
    const report = check(record({ licence: UNKNOWN }));
    const output = JSON.parse(reportAsJson(report));
    assert.equal(output.passed, false);
    assert.ok(output.findings.some((item) => item.code === 'MISSING_LICENCE'));
  });
  it('does not silently change UNKNOWN dates in reports', () => {
    const output = JSON.parse(reportAsJson(auditInventory(register(record()))));
    assert.equal(output.referenceDate, UNKNOWN);
  });
  it('does not include supplied notes in machine-readable audit findings', () => {
    const output = reportAsJson(check(record({ notes: 'local private example note' })));
    assert.ok(!output.includes('local private example note'));
  });
  it('only includes actual errors as blockers', () => {
    const report = check(record({ derivedFromOdbl: true }));
    assert.equal(report.passed, true);
    assert.ok(report.counts.warning > 0);
  });
  it('counts all records including exclusions', () => {
    const report = auditInventory(register(record(), record({ id: 'skip', status: 'excluded' })));
    assert.equal(report.totalCount, 2);
    assert.equal(report.includedCount, 1);
  });
  it('rejects malformed records before an audit', () => {
    assert.throws(() => auditInventory({ version: 1, records: [{}] }));
  });
  it('preserves parsed source identifiers', () => {
    assert.equal(parseInventory(register(record())).records[0].id, 'sample');
  });
});
