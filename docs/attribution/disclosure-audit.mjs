/** A deterministic release check for how individual app surfaces credit sources. */
import { UNKNOWN, parseInventory, isKnownDate } from './provenance-core.mjs';
import { auditInventory } from './provenance-audit.mjs';
import { parseRegister } from './disclosure-core.mjs';
import { METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';

export const DISCLOSURE_RULES = Object.freeze({
  EMPTY_SURFACES: 'At least one included surface is needed for publication.',
  NO_SOURCES: 'A published surface must list its source identifiers.',
  ORPHAN_SOURCE: 'The surface references a source not in the inventory.',
  HELD_SOURCE: 'A published surface uses a source that is on hold.',
  EXCLUDED_SOURCE: 'A published surface uses an excluded source.',
  UNUSED_SOURCE: 'An included dataset is not linked to a published surface.',
  MISSING_TITLE_EN: 'An English surface title is needed.',
  MISSING_TITLE_FR: 'A French surface title is needed.',
  MISSING_CREDIT_EN: 'An English source credit is needed.',
  MISSING_CREDIT_FR: 'A French source credit is needed.',
  MISSING_NOTICE_EN: 'An English notice is needed.',
  MISSING_NOTICE_FR: 'A French notice is needed.',
  MISSING_SOURCE_NAME_EN: 'The English credit must identify every included source.',
  MISSING_SOURCE_NAME_FR: 'The French credit must identify every included source.',
  MISSING_LICENCE_EN: 'The English notice must identify each licence.',
  MISSING_LICENCE_FR: 'The French notice must identify each licence.',
  MISSING_AUA_NOTICE: 'The section 3 GTFS notice must be displayed without changes.',
  MISSING_OGL_NOTICE: 'The required OGL notice must be displayed without changes.',
  MISSING_ODBL_CREDIT: 'OSM-derived maps must display an OpenStreetMap credit.',
  MISSING_LTC_CREDIT: 'A surface using LTC data must display its provider name.',
  MISSING_REVIEW_DATE: 'The surface review date must be recorded.',
  FUTURE_REVIEW_DATE: 'The review date is later than the reference date.',
  UNKNOWN_SOURCE_DATE: 'The visible dataset date is UNKNOWN.',
  WRONG_SOURCE_DATE: 'A surface date conflicts with its only source date.',
  UNKNOWN_DELIVERY: 'The delivery mode is UNKNOWN.',
  ONLINE_ONLY: 'The published surface has no documented offline delivery.',
  KEYBOARD_UNKNOWN: 'Keyboard support has not been assessed.',
  KEYBOARD_NO: 'The surface is marked as not keyboard accessible.',
  SCREEN_READER_UNKNOWN: 'Screen reader support has not been assessed.',
  SCREEN_READER_NO: 'The surface is marked as not screen reader accessible.',
  TARGET_UNKNOWN: 'The control target dimension is UNKNOWN.',
  TARGET_TOO_SMALL: 'The documented target dimension is less than 44 pixels.',
  HELD_SURFACE: 'This surface is on hold and cannot be published.',
  EXCLUDED_SURFACE: 'This surface is excluded from the release.',
  MIXED_ODBL: 'Source licences require separation when ODbL-derived data is combined.',
  SOURCE_AUDIT: 'The included source has a blocking provenance finding.',
  SOURCE_LICENCE_UNKNOWN: 'The linked source licence is UNKNOWN.',
  SOURCE_PERMISSION_UNKNOWN: 'Source redistribution permission is UNKNOWN.',
  SOURCE_PERMISSION_NO: 'Source redistribution is marked as not allowed.',
  MISSING_USE_CLASS: 'Classify the surface rather than using other.',
  SOURCE_USE_MISMATCH: 'The surface and source uses differ; review the scope.',
  NO_DATASET_DATE: 'The displayed source date was not supplied.',
});

export const DISCLOSURE_SEVERITIES = Object.freeze(['error', 'warning', 'info']);

export function disclosureFinding(code, severity, surfaceId = null, sourceId = null, field = null) {
  if (!Object.hasOwn(DISCLOSURE_RULES, code)) throw new Error(`Unsupported code ${code}`);
  if (!DISCLOSURE_SEVERITIES.includes(severity)) throw new Error(`Unsupported severity ${severity}`);
  return Object.freeze({ code, severity, surfaceId, sourceId, field });
}

function includesText(text, phrase) {
  return typeof text === 'string' && text.includes(phrase);
}

function hasProviderName(text, record) {
  return record.sourceName !== UNKNOWN && includesText(text, record.sourceName);
}

/**
 * The required legal text must be literal. Translation may surround it,
 * but not substitute for the original notice under its applicable terms.
 */
function requiredLegalText(surface, record, add) {
  const texts = `${surface.noticeEn}\n${surface.noticeFr}`;
  if (record.provider === 'metrolinx' && record.licence === 'Metrolinx-AUA' &&
      !texts.includes(METROLINX_AUA_LEGEND)) {
    add('MISSING_AUA_NOTICE', 'error', record.id, 'noticeEn');
  }
  if (record.provider === 'metrolinx' && record.licence === 'OGL-Ontario-Metrolinx' &&
      !texts.includes(METROLINX_OGL_NOTICE)) {
    add('MISSING_OGL_NOTICE', 'error', record.id, 'noticeEn');
  }
  if ((record.provider === 'osm' || record.containsOdbl === true) &&
      !texts.includes('OpenStreetMap')) {
    add('MISSING_ODBL_CREDIT', 'error', record.id, 'noticeEn');
  }
  if (record.provider === 'ltc' && !texts.includes('London Transit Commission')) {
    add('MISSING_LTC_CREDIT', 'error', record.id, 'noticeEn');
  }
}

function singleSurface(surface, records, referenceDate, blocked) {
  const findings = [];
  const add = (code, severity, sourceId = null, field = null) =>
    findings.push(disclosureFinding(code, severity, surface.id, sourceId, field));
  if (surface.state === 'excluded') {
    add('EXCLUDED_SURFACE', 'info', null, 'state');
    return findings;
  }
  if (surface.state === 'held') {
    add('HELD_SURFACE', 'info', null, 'state');
    return findings;
  }
  if (!surface.sourceIds.length) add('NO_SOURCES', 'error', null, 'sourceIds');
  for (const [field, code] of [
    ['titleEn', 'MISSING_TITLE_EN'], ['titleFr', 'MISSING_TITLE_FR'],
    ['creditEn', 'MISSING_CREDIT_EN'], ['creditFr', 'MISSING_CREDIT_FR'],
    ['noticeEn', 'MISSING_NOTICE_EN'], ['noticeFr', 'MISSING_NOTICE_FR'],
  ]) {
    if (surface[field] === UNKNOWN) add(code, 'error', null, field);
  }
  if (surface.lastReviewedOn === UNKNOWN) add('MISSING_REVIEW_DATE', 'error', null, 'lastReviewedOn');
  if (referenceDate !== UNKNOWN && surface.lastReviewedOn !== UNKNOWN &&
      surface.lastReviewedOn > referenceDate) add('FUTURE_REVIEW_DATE', 'error', null, 'lastReviewedOn');
  if (surface.sourceDate === UNKNOWN) {
    add('UNKNOWN_SOURCE_DATE', 'info', null, 'sourceDate');
  }
  if (surface.delivery === UNKNOWN) add('UNKNOWN_DELIVERY', 'error', null, 'delivery');
  else if (surface.delivery === 'online') add('ONLINE_ONLY', 'warning', null, 'delivery');
  if (surface.supportsKeyboard === UNKNOWN) add('KEYBOARD_UNKNOWN', 'error', null, 'supportsKeyboard');
  else if (surface.supportsKeyboard === 'no') add('KEYBOARD_NO', 'error', null, 'supportsKeyboard');
  if (surface.supportsScreenReader === UNKNOWN) add('SCREEN_READER_UNKNOWN', 'error', null, 'supportsScreenReader');
  else if (surface.supportsScreenReader === 'no') add('SCREEN_READER_NO', 'error', null, 'supportsScreenReader');
  if (surface.minimumTargetPx === UNKNOWN) add('TARGET_UNKNOWN', 'error', null, 'minimumTargetPx');
  else if (surface.minimumTargetPx < 44) add('TARGET_TOO_SMALL', 'error', null, 'minimumTargetPx');
  if (surface.kind === 'other') add('MISSING_USE_CLASS', 'warning', null, 'kind');
  const selected = [];
  for (const id of surface.sourceIds) {
    const record = records.get(id);
    if (!record) {
      add('ORPHAN_SOURCE', 'error', id, 'sourceIds');
      continue;
    }
    selected.push(record);
    if (record.status === 'held') add('HELD_SOURCE', 'error', id, 'sourceIds');
    if (record.status === 'excluded') add('EXCLUDED_SOURCE', 'error', id, 'sourceIds');
    if (blocked.has(id)) add('SOURCE_AUDIT', 'error', id, 'sourceIds');
    if (record.licence === UNKNOWN) add('SOURCE_LICENCE_UNKNOWN', 'error', id, 'sourceIds');
    if (record.redistributionAllowed === UNKNOWN) add('SOURCE_PERMISSION_UNKNOWN', 'error', id, 'sourceIds');
    if (record.redistributionAllowed === false) add('SOURCE_PERMISSION_NO', 'error', id, 'sourceIds');
    if (!hasProviderName(surface.creditEn, record)) add('MISSING_SOURCE_NAME_EN', 'error', id, 'creditEn');
    if (!hasProviderName(surface.creditFr, record)) add('MISSING_SOURCE_NAME_FR', 'error', id, 'creditFr');
    if (record.licence !== UNKNOWN && !includesText(surface.noticeEn, record.licence)) {
      add('MISSING_LICENCE_EN', 'error', id, 'noticeEn');
    }
    if (record.licence !== UNKNOWN && !includesText(surface.noticeFr, record.licence)) {
      add('MISSING_LICENCE_FR', 'error', id, 'noticeFr');
    }
    requiredLegalText(surface, record, add);
    if (record.use !== 'other' && surface.kind !== 'other' && record.use !== surface.kind &&
        !(record.use === 'transit' && surface.kind === 'journey')) {
      add('SOURCE_USE_MISMATCH', 'warning', id, 'kind');
    }
  }
  if (selected.length === 1 && selected[0].datasetAsOf !== UNKNOWN &&
      surface.sourceDate !== UNKNOWN && selected[0].datasetAsOf !== surface.sourceDate) {
    add('WRONG_SOURCE_DATE', 'error', selected[0].id, 'sourceDate');
  }
  const odbl = selected.some((record) => record.containsOdbl === true ||
    record.derivedFromOdbl === true || record.licence === 'ODbL-1.0');
  const other = selected.some((record) => record.licence !== 'ODbL-1.0' &&
    record.containsOdbl !== true && record.derivedFromOdbl !== true);
  if (odbl && other) add('MIXED_ODBL', 'error', null, 'sourceIds');
  return findings;
}

/**
 * One release audit covers both the inventory and the surfaces that consume
 * it. A result is a finding about supplied evidence, not a claim about the
 * actual current conditions of any location or service.
 */
export function auditDisclosures(input, options = {}) {
  const inventory = parseInventory(input.inventory);
  const register = parseRegister(input.register);
  const referenceDate = options.referenceDate ?? UNKNOWN;
  if (referenceDate !== UNKNOWN && !isKnownDate(referenceDate)) {
    throw new Error('Invalid reference date');
  }
  const provenance = auditInventory(inventory, { referenceDate });
  const blocked = new Set(provenance.findings.filter((item) => item.severity === 'error' && item.recordId)
    .map((item) => item.recordId));
  const records = new Map(inventory.records.map((record) => [record.id, record]));
  const included = register.surfaces.filter((surface) => surface.state === 'included');
  const findings = [];
  if (!included.length) findings.push(disclosureFinding('EMPTY_SURFACES', 'error'));
  for (const surface of register.surfaces) {
    findings.push(...singleSurface(surface, records, referenceDate, blocked));
  }
  const used = new Set(included.flatMap((surface) => surface.sourceIds));
  for (const record of inventory.records) {
    if (record.status === 'included' && !used.has(record.id)) {
      findings.push(disclosureFinding('UNUSED_SOURCE', 'warning', null, record.id, 'sourceIds'));
    }
  }
  findings.sort((a, b) =>
    (a.surfaceId ?? '').localeCompare(b.surfaceId ?? '') ||
    (a.sourceId ?? '').localeCompare(b.sourceId ?? '') ||
    a.code.localeCompare(b.code));
  const counts = Object.freeze({
    error: findings.filter((item) => item.severity === 'error').length,
    warning: findings.filter((item) => item.severity === 'warning').length,
    info: findings.filter((item) => item.severity === 'info').length,
  });
  return Object.freeze({
    passed: provenance.passed && counts.error === 0,
    counts, findings: Object.freeze(findings), provenance,
    includedSurfaces: included.length, totalSurfaces: register.surfaces.length,
    referenceDate,
  });
}

export function assertDisclosures(input, options = {}) {
  const result = auditDisclosures(input, options);
  if (!result.passed) {
    const codes = result.findings.filter((item) => item.severity === 'error')
      .map((item) => `${item.surfaceId ?? 'release'}:${item.code}`);
    const upstream = result.provenance.findings.filter((item) => item.severity === 'error')
      .map((item) => `${item.recordId ?? 'release'}:${item.code}`);
    throw new Error(`Disclosure gate blocked: ${[...upstream, ...codes].join(', ')}`);
  }
  return result;
}

export function disclosureReportText(report) {
  const rows = [
    `Disclosure gate: ${report.passed ? 'PASS' : 'BLOCKED'}`,
    `Reference date: ${report.referenceDate}`,
    `Included surfaces: ${report.includedSurfaces}`,
    `Total surfaces: ${report.totalSurfaces}`,
    `Surface errors: ${report.counts.error}`,
    `Surface warnings: ${report.counts.warning}`,
    `Provenance errors: ${report.provenance.counts.error}`,
  ];
  for (const finding of report.provenance.findings) {
    rows.push(`SOURCE ${finding.severity.toUpperCase()} ${finding.recordId ?? 'release'} ${finding.code}`);
  }
  for (const finding of report.findings) {
    rows.push(`SURFACE ${finding.severity.toUpperCase()} ${finding.surfaceId ?? 'release'} ${finding.sourceId ?? '-'} ${finding.code}`);
  }
  return `${rows.join('\n')}\n`;
}

export function disclosureReportJson(report) {
  return `${JSON.stringify({
    passed: report.passed, counts: report.counts,
    referenceDate: report.referenceDate,
    totalSurfaces: report.totalSurfaces,
    includedSurfaces: report.includedSurfaces,
    provenance: {
      passed: report.provenance.passed,
      counts: report.provenance.counts,
      findings: report.provenance.findings.map(({ code, severity, recordId, field }) =>
        ({ code, severity, recordId, field })),
    },
    findings: report.findings,
  }, null, 2)}\n`;
}
