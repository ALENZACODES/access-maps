/**
 * Deterministic, fail-closed provenance checks. All facts must be supplied by
 * the producer; no missing date, licence or access fact is inferred.
 */
import {
  UNKNOWN, LICENCES, parseInventory, isKnownDate, isSafeUrl,
} from './provenance-core.mjs';
import {
  METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
} from './attribution-utils.mjs';

export const SEVERITIES = Object.freeze(['error', 'warning', 'info']);
export const RULES = Object.freeze({
  MISSING_SOURCE: 'A source name and HTTPS source URL are needed.',
  MISSING_LICENCE: 'The applicable open licence must be recorded.',
  MISSING_LICENCE_LINK: 'A link to the applicable licence must be recorded.',
  MISSING_ACQUISITION_DATE: 'The acquisition date must be recorded.',
  MISSING_TERMS_DATE: 'The date the terms were reviewed must be recorded.',
  UNKNOWN_DATASET_DATE: 'The dataset date is UNKNOWN and must remain labelled UNKNOWN.',
  MISSING_NOTICE: 'The applicable attribution notice must be supplied.',
  ODBL_MAP_CREDIT: 'OSM map use needs a credit beside the map.',
  ODBL_MIXED_DATA: 'ODbL source isolation needs an explicit review.',
  ODBL_DERIVATION: 'ODbL derivation cannot be assumed absent.',
  REDISTRIBUTION_UNKNOWN: 'Redistribution permission is UNKNOWN.',
  REDISTRIBUTION_DENIED: 'Redistribution is not permitted for this record.',
  LICENCE_PROVIDER_MISMATCH: 'The selected licence may not match the source provider.',
  METROLINX_LEGEND: 'The applicable Metrolinx section 3 legend is missing.',
  METROLINX_OGL: 'The applicable Metrolinx OGL notice is missing.',
  METROLINX_AGREEMENT_CHOICE: 'Select the actual licence for this particular feed.',
  LTC_CREDIT: 'Show the LTC acknowledgement alongside the feed.',
  FUTURE_DATE: 'A supplied date cannot be later than the release reference date.',
  EXCLUDED_RELEASE: 'Excluded records must not be published.',
  HELD_RELEASE: 'Held records must not be published.',
  EMPTY_RELEASE: 'At least one included record is required for a nonempty release.',
  DUPLICATE_FEED: 'Multiple included records share the same source URL.',
  UNSUPPORTED_LICENCE: 'The stated licence has not been classified as open.',
  MISSING_DATA_USE: 'Classify the intended dataset use before release.',
  INCORRECT_ODBL_FLAG: 'ODbL data must be marked explicitly.',
  MISSING_SOURCE_CREDIT: 'The source credit cannot be UNKNOWN.',
  TERMS_BEFORE_ACQUISITION: 'Terms should be reviewed on or after acquisition.',
});

export function finding(code, severity, recordId = null, field = null) {
  if (!Object.hasOwn(RULES, code)) throw new Error(`Unknown rule: ${code}`);
  if (!SEVERITIES.includes(severity)) throw new Error(`Unknown severity: ${severity}`);
  return Object.freeze({ code, severity, recordId, field, message: RULES[code] });
}

function isOpenLicence(licence) {
  return LICENCES.includes(licence) && licence !== UNKNOWN;
}

function auditRecord(record, referenceDate) {
  const result = [];
  const add = (code, severity, field = null) =>
    result.push(finding(code, severity, record.id, field));

  if (record.status === 'excluded') return result;
  if (record.status === 'held') {
    add('HELD_RELEASE', 'info', 'status');
  }
  const strict = record.status === 'included';
  const severity = strict ? 'error' : 'warning';
  if (record.sourceName === UNKNOWN || record.sourceUrl === UNKNOWN) {
    add('MISSING_SOURCE', severity, record.sourceUrl === UNKNOWN ? 'sourceUrl' : 'sourceName');
  }
  if (record.sourceName === UNKNOWN) add('MISSING_SOURCE_CREDIT', severity, 'sourceName');
  if (record.licence === UNKNOWN) add('MISSING_LICENCE', severity, 'licence');
  if (record.licenceUrl === UNKNOWN) add('MISSING_LICENCE_LINK', severity, 'licenceUrl');
  if (record.acquiredOn === UNKNOWN) add('MISSING_ACQUISITION_DATE', severity, 'acquiredOn');
  if (record.termsReviewedOn === UNKNOWN) add('MISSING_TERMS_DATE', severity, 'termsReviewedOn');
  if (record.datasetAsOf === UNKNOWN) add('UNKNOWN_DATASET_DATE', 'info', 'datasetAsOf');
  if (record.notice === UNKNOWN) add('MISSING_NOTICE', severity, 'notice');
  if (record.redistributionAllowed === UNKNOWN) add('REDISTRIBUTION_UNKNOWN', severity, 'redistributionAllowed');
  if (record.redistributionAllowed === false) add('REDISTRIBUTION_DENIED', severity, 'redistributionAllowed');
  if (!isOpenLicence(record.licence) && record.licence !== UNKNOWN) {
    add('UNSUPPORTED_LICENCE', severity, 'licence');
  }
  if (record.use === 'other') add('MISSING_DATA_USE', severity, 'use');
  if (record.containsOdbl === UNKNOWN || record.derivedFromOdbl === UNKNOWN) {
    add('ODBL_DERIVATION', severity, 'derivedFromOdbl');
  }
  if (record.derivedFromOdbl === true && record.provider !== 'osm') {
    add('ODBL_MIXED_DATA', severity, 'derivedFromOdbl');
  } else if (record.containsOdbl === true || record.derivedFromOdbl === true) {
    add('ODBL_MIXED_DATA', 'warning', 'derivedFromOdbl');
  }
  if (record.provider === 'osm') {
    if (record.containsOdbl !== true) add('INCORRECT_ODBL_FLAG', severity, 'containsOdbl');
    if (record.licence !== 'ODbL-1.0') add('LICENCE_PROVIDER_MISMATCH', severity, 'licence');
    if (record.use === 'map' && !record.notice.includes('OpenStreetMap')) {
      add('ODBL_MAP_CREDIT', severity, 'notice');
    }
  }
  if (record.provider === 'metrolinx') {
    if (record.licence === 'Metrolinx-AUA') {
      if (!record.notice.includes(METROLINX_AUA_LEGEND)) {
        add('METROLINX_LEGEND', severity, 'notice');
      }
    } else if (record.licence === 'OGL-Ontario-Metrolinx') {
      if (!record.notice.includes(METROLINX_OGL_NOTICE)) {
        add('METROLINX_OGL', severity, 'notice');
      }
    } else {
      add('METROLINX_AGREEMENT_CHOICE', severity, 'licence');
    }
  }
  if (record.provider === 'ltc') {
    if (record.licence !== 'LTC-Open-Data-Terms') {
      add('LICENCE_PROVIDER_MISMATCH', severity, 'licence');
    }
    if (!record.notice.includes('London Transit Commission')) {
      add('LTC_CREDIT', 'warning', 'notice');
    }
  }
  if (record.provider === 'other' && record.licence !== UNKNOWN &&
      record.licence !== 'OTHER-OPEN' && record.licence !== 'ODbL-1.0') {
    add('LICENCE_PROVIDER_MISMATCH', 'warning', 'licence');
  }
  if (referenceDate !== UNKNOWN) {
    for (const key of ['acquiredOn', 'termsReviewedOn', 'datasetAsOf']) {
      if (record[key] !== UNKNOWN && record[key] > referenceDate) {
        add('FUTURE_DATE', severity, key);
      }
    }
  }
  if (record.acquiredOn !== UNKNOWN && record.termsReviewedOn !== UNKNOWN &&
      record.termsReviewedOn < record.acquiredOn) {
    add('TERMS_BEFORE_ACQUISITION', 'warning', 'termsReviewedOn');
  }
  return result;
}

/**
 * Reference date is explicitly supplied, not taken from the system clock;
 * UNKNOWN suppresses chronological future-date judgements.
 */
export function auditInventory(input, options = {}) {
  const inventory = parseInventory(input);
  const referenceDate = options.referenceDate ?? UNKNOWN;
  if (referenceDate !== UNKNOWN && !isKnownDate(referenceDate)) {
    throw new Error('Invalid audit reference date');
  }
  const findings = [];
  const included = inventory.records.filter((item) => item.status === 'included');
  if (included.length === 0) findings.push(finding('EMPTY_RELEASE', 'error'));
  const urls = new Map();
  for (const record of inventory.records) {
    findings.push(...auditRecord(record, referenceDate));
    if (record.status !== 'included' || !isSafeUrl(record.sourceUrl) ||
        record.sourceUrl === UNKNOWN) continue;
    const previous = urls.get(record.sourceUrl);
    if (previous) {
      findings.push(finding('DUPLICATE_FEED', 'warning', record.id, 'sourceUrl'));
    } else urls.set(record.sourceUrl, record.id);
  }
  findings.sort((a, b) =>
    (a.recordId ?? '').localeCompare(b.recordId ?? '') ||
    a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity));
  const counts = Object.freeze({
    error: findings.filter((entry) => entry.severity === 'error').length,
    warning: findings.filter((entry) => entry.severity === 'warning').length,
    info: findings.filter((entry) => entry.severity === 'info').length,
  });
  return Object.freeze({
    passed: counts.error === 0,
    counts,
    findings: Object.freeze(findings),
    referenceDate,
    includedCount: included.length,
    totalCount: inventory.records.length,
  });
}

export function assertReleaseReady(input, options = {}) {
  const report = auditInventory(input, options);
  if (!report.passed) {
    const codes = report.findings.filter((entry) => entry.severity === 'error')
      .map((entry) => `${entry.recordId ?? 'release'}:${entry.code}`);
    throw new Error(`Provenance gate failed: ${codes.join(', ')}`);
  }
  return report;
}

/**
 * An inventory is only an evidence register. Passing it cannot determine
 * whether an external provider has changed its terms or a route is usable.
 */
export function reportAsText(report) {
  const rows = [
    `Provenance audit: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Included: ${report.includedCount}`,
    `Records: ${report.totalCount}`,
    `Reference date: ${report.referenceDate}`,
    `Errors: ${report.counts.error}`,
    `Warnings: ${report.counts.warning}`,
    `Information: ${report.counts.info}`,
    '',
  ];
  for (const item of report.findings) {
    rows.push(`${item.severity.toUpperCase()} ${item.recordId ?? 'release'} ${item.code} ${item.field ?? '-'}: ${item.message}`);
  }
  return `${rows.join('\n')}\n`;
}

export function reportAsJson(report) {
  return `${JSON.stringify({
    passed: report.passed,
    counts: report.counts,
    referenceDate: report.referenceDate,
    includedCount: report.includedCount,
    totalCount: report.totalCount,
    findings: report.findings.map(({ code, severity, recordId, field }) => ({
      code, severity, recordId, field,
    })),
  }, null, 2)}\n`;
}
