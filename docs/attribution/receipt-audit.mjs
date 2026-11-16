/** Independent receipt audit: checks printed evidence against release inputs. */
import { UNKNOWN } from './provenance-core.mjs';
import { parseReleasePackage } from './disclosure-core.mjs';
import { auditDisclosures } from './disclosure-audit.mjs';
import { createReceipt, parseReceipt, legalNotices, receiptAsText } from './receipt-core.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';

export const RECEIPT_RULES = Object.freeze({
  NOT_PUBLISHED: 'Only included publication surfaces may be released.',
  SOURCE_NOT_INCLUDED: 'The surface source is not included in the release.',
  UNKNOWN_PERMISSION: 'Redistribution permission has not been recorded.',
  DENIED_PERMISSION: 'The recorded redistribution permission is no.',
  UNKNOWN_LICENCE: 'The source licence remains UNKNOWN.',
  UNSUPPORTED_PROVIDER_LICENCE: 'The provider licence is not mapped to a required notice.',
  LICENCE_TERMS_UNKNOWN: 'The terms review date remains UNKNOWN.',
  ACQUISITION_UNKNOWN: 'The acquisition date remains UNKNOWN.',
  SOURCE_URL_UNKNOWN: 'The source URL remains UNKNOWN.',
  LICENCE_URL_UNKNOWN: 'The licence URL remains UNKNOWN.',
  DATASET_DATE_UNKNOWN: 'The source dataset date remains UNKNOWN.',
  SURFACE_DATE_UNKNOWN: 'The displayed dataset date remains UNKNOWN.',
  SURFACE_REVIEW_UNKNOWN: 'The surface review date remains UNKNOWN.',
  NO_SOURCES: 'A published surface lacks source identifiers.',
  MISSING_CREDIT: 'The printed credit is missing.',
  MISSING_NOTICE: 'The printed notice is missing.',
  OSM_MAP_CREDIT: 'An OSM map must show its map attribution.',
  ODBL_MIXING: 'ODbL-derived content is combined with an incompatible source.',
  AUA_LEGEND: 'The required section 3 English legend is missing.',
  AUA_LAWS: 'An applicable-laws line is missing.',
  OGL_LINE: 'The Open Government Licence line is missing.',
  LTC_NOTICE: 'The London Transit Commission source line is missing.',
  UNEXPECTED_AUA: 'An AUA notice appears without an AUA-labelled source.',
  UNEXPECTED_OGL: 'An OGL notice appears without an OGL-labelled source.',
  UNKNOWN_KEYBOARD: 'Keyboard support evidence remains UNKNOWN.',
  NO_KEYBOARD: 'Keyboard use is marked no.',
  UNKNOWN_SCREEN_READER: 'Screen reader evidence remains UNKNOWN.',
  NO_SCREEN_READER: 'Screen reader use is marked no.',
  UNKNOWN_TARGET: 'The minimum target dimension remains UNKNOWN.',
  SMALL_TARGET: 'The recorded minimum target is below 44 pixels.',
  UNKNOWN_DELIVERY: 'The documented delivery mode remains UNKNOWN.',
  ONLINE_DELIVERY: 'The surface has no documented offline delivery.',
  RECEIPT_DRIFT: 'The receipt differs from the originating release package.',
  RECEIPT_SOURCE_DRIFT: 'The receipt source order or membership has changed.',
  RECEIPT_DATE_DRIFT: 'The receipt displays a date not found in the release package.',
  RECEIPT_NOTICE_DRIFT: 'A required notice is absent or altered.',
  RECEIPT_LOCALE_DRIFT: 'The receipt language differs from the requested language.',
  RELEASE_AUDIT: 'A related publication release audit reports a blocking issue.',
});

export function finding(code, severity, surfaceId, datasetId = null) {
  if (!Object.hasOwn(RECEIPT_RULES, code)) throw new Error(`Unknown rule: ${code}`);
  if (!['error', 'warning', 'info'].includes(severity)) throw new Error(`Unknown severity: ${severity}`);
  return Object.freeze({ code, severity, surfaceId, datasetId });
}

function has(text, phrase) { return typeof text === 'string' && text.includes(phrase); }
function noticeText(receipt) {
  return [receipt.sourceNotices, ...receipt.datasets.flatMap((dataset) => dataset.notices)].join('\n');
}
function addIf(add, condition, code, severity, id = null) {
  if (condition) add(code, severity, id);
}

/**
 * A receipt is a document of observed metadata, not an approval token.
 * The audit fails closed where relevant provenance is missing.
 */
export function auditReceipt(receiptInput, releaseInput, options = {}) {
  const receipt = parseReceipt(receiptInput);
  const bundle = parseReleasePackage(releaseInput);
  const findings = [];
  const add = (code, severity, id = null) => findings.push(finding(code, severity, receipt.surfaceId, id));
  const surface = bundle.register.surfaces.find((item) => item.id === receipt.surfaceId);
  if (!surface) {
    add('RECEIPT_DRIFT', 'error');
    return finish(receipt, findings);
  }
  addIf(add, surface.state !== 'included', 'NOT_PUBLISHED', 'error');
  addIf(add, surface.sourceIds.length === 0, 'NO_SOURCES', 'error');
  addIf(add, receipt.credits === UNKNOWN, 'MISSING_CREDIT', 'error');
  addIf(add, receipt.sourceNotices === UNKNOWN, 'MISSING_NOTICE', 'error');
  addIf(add, receipt.surfaceDate === UNKNOWN, 'SURFACE_DATE_UNKNOWN', 'info');
  addIf(add, receipt.reviewedOn === UNKNOWN, 'SURFACE_REVIEW_UNKNOWN', 'error');
  addIf(add, receipt.keyboard === UNKNOWN, 'UNKNOWN_KEYBOARD', 'error');
  addIf(add, receipt.keyboard === 'no', 'NO_KEYBOARD', 'error');
  addIf(add, receipt.screenReader === UNKNOWN, 'UNKNOWN_SCREEN_READER', 'error');
  addIf(add, receipt.screenReader === 'no', 'NO_SCREEN_READER', 'error');
  addIf(add, receipt.minimumTargetPx === UNKNOWN, 'UNKNOWN_TARGET', 'error');
  addIf(add, receipt.minimumTargetPx !== UNKNOWN && receipt.minimumTargetPx < 44, 'SMALL_TARGET', 'error');
  addIf(add, receipt.delivery === UNKNOWN, 'UNKNOWN_DELIVERY', 'error');
  addIf(add, receipt.delivery === 'online', 'ONLINE_DELIVERY', 'warning');
  addIf(add, receipt.language !== options.locale && options.locale !== undefined,
    'RECEIPT_LOCALE_DRIFT', 'error');
  const sourceIds = receipt.datasets.map((item) => item.id);
  if (JSON.stringify(sourceIds) !== JSON.stringify(surface.sourceIds)) add('RECEIPT_SOURCE_DRIFT', 'error');
  const records = new Map(bundle.inventory.records.map((item) => [item.id, item]));
  for (const dataset of receipt.datasets) {
    const record = records.get(dataset.id);
    if (!record) {
      add('RECEIPT_SOURCE_DRIFT', 'error', dataset.id);
      continue;
    }
    addIf(add, record.status !== 'included', 'SOURCE_NOT_INCLUDED', 'error', record.id);
    addIf(add, dataset.permission === UNKNOWN, 'UNKNOWN_PERMISSION', 'error', record.id);
    addIf(add, dataset.permission === false, 'DENIED_PERMISSION', 'error', record.id);
    addIf(add, dataset.licence === UNKNOWN, 'UNKNOWN_LICENCE', 'error', record.id);
    addIf(add, dataset.termsReviewedOn === UNKNOWN, 'LICENCE_TERMS_UNKNOWN', 'error', record.id);
    addIf(add, dataset.acquiredOn === UNKNOWN, 'ACQUISITION_UNKNOWN', 'error', record.id);
    addIf(add, dataset.sourceUrl === UNKNOWN, 'SOURCE_URL_UNKNOWN', 'error', record.id);
    addIf(add, dataset.licenceUrl === UNKNOWN, 'LICENCE_URL_UNKNOWN', 'error', record.id);
    addIf(add, dataset.datasetAsOf === UNKNOWN, 'DATASET_DATE_UNKNOWN', 'info', record.id);
    addIf(add, ['osm', 'metrolinx', 'ltc'].includes(dataset.provider) &&
      legalNotices(record, receipt.language).length === 0,
    'UNSUPPORTED_PROVIDER_LICENCE', 'error', record.id);
    for (const text of legalNotices(record, receipt.language)) {
      if (!dataset.notices.includes(text)) add('RECEIPT_NOTICE_DRIFT', 'error', record.id);
    }
    if (dataset.datasetAsOf !== record.datasetAsOf) add('RECEIPT_DATE_DRIFT', 'error', record.id);
    for (const field of ['name', 'provider', 'licence', 'sourceUrl', 'licenceUrl', 'acquiredOn',
      'termsReviewedOn', 'permission', 'status']) {
      const original = field === 'name' ? record.sourceName
        : field === 'permission' ? record.redistributionAllowed : record[field];
      if (dataset[field] !== original) add('RECEIPT_DRIFT', 'error', record.id);
    }
  }
  const combined = noticeText(receipt);
  const hasAua = receipt.datasets.some((record) => record.licence === 'Metrolinx-AUA');
  const hasOgl = receipt.datasets.some((record) => record.licence === 'OGL-Ontario-Metrolinx');
  if (hasAua) {
    addIf(add, !has(combined, METROLINX_AUA_LEGEND), 'AUA_LEGEND', 'error');
    addIf(add, !has(combined, METROLINX_AUA_END_USER_LAWS_EN) ||
      !has(combined, METROLINX_AUA_END_USER_LAWS_FR), 'AUA_LAWS', 'error');
  }
  if (hasOgl) addIf(add, !has(combined, METROLINX_OGL_NOTICE), 'OGL_LINE', 'error');
  if (!hasAua) addIf(add, has(receipt.sourceNotices, METROLINX_AUA_LEGEND), 'UNEXPECTED_AUA', 'error');
  if (!hasOgl) addIf(add, has(receipt.sourceNotices, METROLINX_OGL_NOTICE), 'UNEXPECTED_OGL', 'error');
  if (receipt.datasets.some((record) => record.provider === 'osm') && surface.kind === 'map') {
    addIf(add, !has(receipt.credits, SOURCES.osm.notices.en[0]), 'OSM_MAP_CREDIT', 'error');
  }
  if (receipt.datasets.some((record) => record.provider === 'ltc')) {
    addIf(add, !has(combined, 'London Transit Commission'), 'LTC_NOTICE', 'error');
  }
  const odblRecords = receipt.datasets.filter((dataset) => records.get(dataset.id)?.derivedFromOdbl === true || dataset.licence === 'ODbL-1.0');
  if (odblRecords.length && receipt.datasets.some((dataset) => !odblRecords.includes(dataset) &&
    records.get(dataset.id)?.containsOdbl !== true)) {
    add('ODBL_MIXING', 'error');
  }
  let canonical;
  try { canonical = createReceipt(bundle, receipt.surfaceId, receipt.language); }
  catch { add('RECEIPT_DRIFT', 'error'); }
  if (canonical && JSON.stringify(canonical) !== JSON.stringify(receipt)) add('RECEIPT_DRIFT', 'error');
  if (options.withReleaseAudit === true) {
    const audit = auditDisclosures(bundle, options);
    if (!audit.passed) add('RELEASE_AUDIT', 'error');
  }
  return finish(receipt, findings);
}

function finish(receipt, findings) {
  const ordered = findings.sort((a, b) =>
    a.code.localeCompare(b.code) || (a.datasetId ?? '').localeCompare(b.datasetId ?? ''));
  return Object.freeze({
    receipt,
    findings: Object.freeze(ordered),
    blocked: findings.some((item) => item.severity === 'error'),
    errors: findings.filter((item) => item.severity === 'error').length,
    warnings: findings.filter((item) => item.severity === 'warning').length,
    info: findings.filter((item) => item.severity === 'info').length,
  });
}

export function auditAllReceipts(release, language = 'en', options = {}) {
  const bundle = parseReleasePackage(release);
  const results = bundle.register.surfaces.map((surface) =>
    auditReceipt(createReceipt(bundle, surface.id, language), bundle, { ...options, locale: language }));
  return Object.freeze({
    language,
    results: Object.freeze(results),
    blocked: results.some((item) => item.blocked),
    errors: results.reduce((sum, item) => sum + item.errors, 0),
    warnings: results.reduce((sum, item) => sum + item.warnings, 0),
  });
}

export function auditReportAsJson(report) {
  const { receipt, ...rest } = report;
  return `${JSON.stringify({ ...rest, surfaceId: receipt.surfaceId }, null, 2)}\n`;
}

export function auditReportAsText(report, locale = report.receipt.language) {
  const fr = locale === 'fr';
  const lines = [fr ? 'Examen des mentions de source' : 'Source notice review',
    receiptAsText(report.receipt).split('\n')[0],
    `${fr ? 'Statut\u00a0:' : 'Status:'} ${report.blocked ? 'BLOCKED' : 'READY'}`];
  for (const item of report.findings) {
    lines.push(`${item.severity.toUpperCase()} ${item.code}${item.datasetId ? ` (${item.datasetId})` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}
