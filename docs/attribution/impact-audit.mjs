/** A change-aware release gate shared by offline route and CLI. */
import { UNKNOWN } from './provenance-core.mjs';
import { auditDisclosures } from './disclosure-audit.mjs';
import { compareReleasePackages, normalizeDate, impactSummary } from './impact-core.mjs';

export const IMPACT_RULES = Object.freeze({
  CANDIDATE_BLOCKED: 'Candidate publication has blocking attribution findings.',
  BASELINE_BLOCKED: 'Previous package contains blocking evidence gaps.',
  REMOVED_INCLUDED_DATASET: 'An included dataset has been removed.',
  REMOVED_INCLUDED_SURFACE: 'An included publication surface has been removed.',
  DATASET_SOURCE_CHANGED: 'A dataset source has changed; review its scope.',
  DATASET_LICENCE_CHANGED: 'A dataset licence has changed; review the legal notice.',
  DATASET_LICENCE_URL_CHANGED: 'The licence reference has changed.',
  DATASET_PROVIDER_CHANGED: 'The source provider has changed.',
  DATASET_PERMISSION_LOST: 'A source lost its recorded redistribution permission.',
  DATASET_PERMISSION_UNKNOWN: 'Source permission became UNKNOWN.',
  DATASET_STATUS_LOST: 'A previously included source is no longer included.',
  DATASET_DATE_REVERSED: 'The recorded dataset date moved backwards.',
  DATASET_DATE_UNKNOWN: 'The recorded dataset date became UNKNOWN.',
  TERMS_REVIEW_UNKNOWN: 'The source terms review date became UNKNOWN.',
  TERMS_REVIEW_REVERSED: 'The terms review date moved backwards.',
  SOURCE_NOTICE_CHANGED: 'The source notice has changed.',
  ODBL_FLAG_CHANGED: 'The recorded ODbL derivation or inclusion has changed.',
  NEW_INCLUDED_DATASET: 'A newly included dataset needs a release review.',
  NEW_INCLUDED_SURFACE: 'A newly included surface needs a release review.',
  SURFACE_PATH_CHANGED: 'A published route has changed.',
  SURFACE_CREDIT_CHANGED: 'A published source credit has changed.',
  SURFACE_NOTICE_CHANGED: 'A published licence notice has changed.',
  SURFACE_DATE_REVERSED: 'A published source date moved backwards.',
  SURFACE_DATE_UNKNOWN: 'A published source date became UNKNOWN.',
  SURFACE_REVIEW_DATE_UNKNOWN: 'A publication review date became UNKNOWN.',
  SURFACE_REVIEW_DATE_REVERSED: 'The publication review date moved backwards.',
  SURFACE_ACCESS_LOST: 'An accessibility assessment has regressed.',
  SURFACE_ACCESS_UNKNOWN: 'An accessibility assessment became UNKNOWN.',
  SURFACE_TARGET_REDUCED: 'The smallest documented interaction target decreased.',
  SURFACE_TARGET_UNKNOWN: 'The documented target size became UNKNOWN.',
  SURFACE_OFFLINE_LOST: 'An offline surface is now online-only.',
  SURFACE_DELIVERY_UNKNOWN: 'A delivery mode became UNKNOWN.',
  SURFACE_STATE_LOST: 'A published surface is no longer included.',
  LINK_REMOVED: 'An existing dataset-to-surface link was removed.',
  LINK_ADDED: 'A dataset-to-surface link was added.',
  NEW_SOURCE_REFERENCE: 'A published surface references a previously unused dataset.',
  NO_CHANGES: 'There are no changes between the supplied packages.',
  REVIEW_DATE_UNKNOWN: 'No reference date was supplied for the comparison.',
});

const criticalFields = new Set([
  'sourceUrl', 'licence', 'licenceUrl', 'provider', 'redistributionAllowed',
  'containsOdbl', 'derivedFromOdbl', 'notice',
]);
const surfaceCreditFields = new Set(['creditEn', 'creditFr']);
const surfaceNoticeFields = new Set(['noticeEn', 'noticeFr']);
const accessFields = new Set(['supportsKeyboard', 'supportsScreenReader']);

export function impactFinding(code, severity, target, field = null, related = []) {
  if (!Object.hasOwn(IMPACT_RULES, code)) throw new Error(`Unsupported impact rule ${code}`);
  if (!['error', 'warning', 'info'].includes(severity)) throw new Error(`Unsupported severity ${severity}`);
  return Object.freeze({ code, severity, target, field,
    related: Object.freeze([...new Set(related)].sort()) });
}

function dateRegressed(before, after) {
  return before !== UNKNOWN && after !== UNKNOWN && after < before;
}

function assessDataset(change, add, previous) {
  const { id, kind, field, before, after, surfaceIds } = change;
  const oldIncluded = previous.inventory.records.find((record) => record.id === id)?.status === 'included';
  if (kind === 'removed') {
    if (oldIncluded) add('REMOVED_INCLUDED_DATASET', 'error', id, null, surfaceIds);
    return;
  }
  if (kind === 'added') {
    if (after.status === 'included') add('NEW_INCLUDED_DATASET', 'warning', id, null, surfaceIds);
    return;
  }
  if (field === 'status' && before === 'included' && after !== 'included') {
    add('DATASET_STATUS_LOST', 'error', id, field, surfaceIds);
  }
  if (field === 'sourceUrl') add('DATASET_SOURCE_CHANGED', 'warning', id, field, surfaceIds);
  if (field === 'licence') add('DATASET_LICENCE_CHANGED', 'warning', id, field, surfaceIds);
  if (field === 'licenceUrl') add('DATASET_LICENCE_URL_CHANGED', 'warning', id, field, surfaceIds);
  if (field === 'provider') add('DATASET_PROVIDER_CHANGED', 'warning', id, field, surfaceIds);
  if (field === 'redistributionAllowed') {
    if (before === true && after === UNKNOWN) add('DATASET_PERMISSION_UNKNOWN', 'error', id, field, surfaceIds);
    else if (before === true && after !== true) add('DATASET_PERMISSION_LOST', 'error', id, field, surfaceIds);
    else if (after !== true) add('DATASET_PERMISSION_UNKNOWN', 'warning', id, field, surfaceIds);
  }
  if (field === 'datasetAsOf') {
    if (before !== UNKNOWN && after === UNKNOWN) add('DATASET_DATE_UNKNOWN', 'error', id, field, surfaceIds);
    if (dateRegressed(before, after)) add('DATASET_DATE_REVERSED', 'warning', id, field, surfaceIds);
  }
  if (field === 'termsReviewedOn') {
    if (before !== UNKNOWN && after === UNKNOWN) add('TERMS_REVIEW_UNKNOWN', 'error', id, field, surfaceIds);
    if (dateRegressed(before, after)) add('TERMS_REVIEW_REVERSED', 'warning', id, field, surfaceIds);
  }
  if (field === 'notice') add('SOURCE_NOTICE_CHANGED', 'warning', id, field, surfaceIds);
  if (field === 'containsOdbl' || field === 'derivedFromOdbl') {
    add('ODBL_FLAG_CHANGED', 'warning', id, field, surfaceIds);
  }
}

function assessSurface(change, add, previous) {
  const { id, kind, field, before, after } = change;
  const oldIncluded = previous.register.surfaces.find((surface) => surface.id === id)?.state === 'included';
  if (kind === 'removed') {
    if (oldIncluded) add('REMOVED_INCLUDED_SURFACE', 'error', id);
    return;
  }
  if (kind === 'added') {
    if (after.state === 'included') add('NEW_INCLUDED_SURFACE', 'warning', id);
    return;
  }
  if (field === 'state' && before === 'included' && after !== 'included') {
    add('SURFACE_STATE_LOST', 'error', id, field);
  }
  if (field === 'path' && oldIncluded) add('SURFACE_PATH_CHANGED', 'warning', id, field);
  if (surfaceCreditFields.has(field)) add('SURFACE_CREDIT_CHANGED', 'warning', id, field);
  if (surfaceNoticeFields.has(field)) add('SURFACE_NOTICE_CHANGED', 'warning', id, field);
  if (field === 'sourceDate') {
    if (before !== UNKNOWN && after === UNKNOWN) add('SURFACE_DATE_UNKNOWN', 'error', id, field);
    if (dateRegressed(before, after)) add('SURFACE_DATE_REVERSED', 'warning', id, field);
  }
  if (field === 'lastReviewedOn') {
    if (before !== UNKNOWN && after === UNKNOWN) add('SURFACE_REVIEW_DATE_UNKNOWN', 'error', id, field);
    if (dateRegressed(before, after)) add('SURFACE_REVIEW_DATE_REVERSED', 'warning', id, field);
  }
  if (accessFields.has(field)) {
    if (before === 'yes' && after === UNKNOWN) add('SURFACE_ACCESS_UNKNOWN', 'error', id, field);
    if (before === 'yes' && after === 'no') add('SURFACE_ACCESS_LOST', 'error', id, field);
  }
  if (field === 'minimumTargetPx') {
    if (before !== UNKNOWN && after === UNKNOWN) add('SURFACE_TARGET_UNKNOWN', 'error', id, field);
    if (typeof before === 'number' && typeof after === 'number' && after < before) {
      add('SURFACE_TARGET_REDUCED', after < 44 ? 'error' : 'warning', id, field);
    }
  }
  if (field === 'delivery') {
    if (before !== UNKNOWN && after === UNKNOWN) add('SURFACE_DELIVERY_UNKNOWN', 'error', id, field);
    if (['offline', 'both'].includes(before) && after === 'online') {
      add('SURFACE_OFFLINE_LOST', 'error', id, field);
    }
  }
}

/** Includes regular release audit as well as change-specific regressions. */
export function auditImpact(previousInput, candidateInput, options = {}) {
  const referenceDate = normalizeDate(options.referenceDate ?? UNKNOWN);
  const comparison = compareReleasePackages(previousInput, candidateInput);
  const previousAudit = auditDisclosures(comparison.previous, { referenceDate });
  const candidateAudit = auditDisclosures(comparison.candidate, { referenceDate });
  const findings = [];
  const add = (code, severity, target = null, field = null, related = []) => {
    findings.push(impactFinding(code, severity, target, field, related));
  };
  if (!candidateAudit.passed) add('CANDIDATE_BLOCKED', 'error');
  if (!previousAudit.passed) add('BASELINE_BLOCKED', 'info');
  if (!comparison.changes.length) add('NO_CHANGES', 'info');
  if (referenceDate === UNKNOWN) add('REVIEW_DATE_UNKNOWN', 'info');
  for (const change of comparison.changes) {
    if (change.scope === 'dataset') assessDataset(change, add, comparison.previous);
    if (change.scope === 'surface') assessSurface(change, add, comparison.previous);
    if (change.scope === 'link') {
      const surfaceId = change.surfaceIds[0] ?? null;
      add(change.kind === 'linked' ? 'LINK_ADDED' : 'LINK_REMOVED',
        change.kind === 'linked' ? 'info' : 'warning', surfaceId, 'sourceIds', [change.id]);
    }
  }
  const prevUsed = new Set(comparison.previous.register.surfaces
    .filter((surface) => surface.state === 'included').flatMap((surface) => surface.sourceIds));
  for (const surface of comparison.candidate.register.surfaces) {
    if (surface.state !== 'included') continue;
    for (const sourceId of surface.sourceIds) {
      if (!prevUsed.has(sourceId)) add('NEW_SOURCE_REFERENCE', 'warning', surface.id, 'sourceIds', [sourceId]);
    }
  }
  findings.sort((a, b) =>
    (a.target ?? '').localeCompare(b.target ?? '') ||
    a.code.localeCompare(b.code) ||
    (a.field ?? '').localeCompare(b.field ?? ''));
  const counts = Object.freeze({
    error: findings.filter((f) => f.severity === 'error').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  });
  return Object.freeze({
    passed: counts.error === 0 && candidateAudit.passed,
    referenceDate, comparison,
    summary: impactSummary(comparison),
    counts, findings: Object.freeze(findings),
    previousAudit, candidateAudit,
  });
}

export function assertImpact(previous, candidate, options = {}) {
  const result = auditImpact(previous, candidate, options);
  if (!result.passed) {
    throw new Error(`Change gate blocked: ${result.findings
      .filter((finding) => finding.severity === 'error')
      .map((finding) => finding.code).join(', ')}`);
  }
  return result;
}

export function impactReportObject(report) {
  return {
    version: 1,
    passed: report.passed,
    referenceDate: report.referenceDate,
    counts: report.counts,
    summary: report.summary,
    candidate: {
      passed: report.candidateAudit.passed,
      counts: report.candidateAudit.counts,
      provenance: report.candidateAudit.provenance.counts,
    },
    findings: report.findings,
    changes: report.comparison.changes,
  };
}

export function impactReportJson(report) {
  return `${JSON.stringify(impactReportObject(report), null, 2)}\n`;
}

export function impactReportText(report) {
  const output = [
    `Change gate: ${report.passed ? 'PASS' : 'BLOCKED'}`,
    `Reference date: ${report.referenceDate}`,
    `Changes: ${report.summary.total}`,
    `Affected surfaces: ${report.summary.affectedSurfaces.length}`,
    `Blocking findings: ${report.counts.error}`,
    `Warnings: ${report.counts.warning}`,
    `Candidate publication: ${report.candidateAudit.passed ? 'PASS' : 'BLOCKED'}`,
  ];
  for (const finding of report.findings) {
    output.push(`${finding.severity.toUpperCase()} ${finding.code} ${finding.target ?? '-'} ${finding.field ?? '-'}`);
  }
  for (const change of report.comparison.changes) {
    output.push(`CHANGE ${change.scope} ${change.kind} ${change.id} ${change.field ?? '-'}`);
  }
  return `${output.join('\n')}\n`;
}

export function findingsForSurface(report, surfaceId) {
  const links = new Set(report.comparison.changes
    .filter((change) => change.surfaceIds.includes(surfaceId))
    .map((change) => change.id.split('/').at(-1)));
  return report.findings.filter((finding) => finding.target === surfaceId ||
    (finding.target !== null && links.has(finding.target)) ||
    finding.related.includes(surfaceId));
}

export function releaseRegressionCounts(report) {
  return Object.freeze({
    attribution: report.findings.filter((finding) =>
      /CREDIT|NOTICE|LICENCE|SOURCE|ODBL|PERMISSION/u.test(finding.code)).length,
    accessibility: report.findings.filter((finding) =>
      /ACCESS|TARGET|OFFLINE|DELIVERY/u.test(finding.code)).length,
    dates: report.findings.filter((finding) => /DATE|REVIEW|TERMS/u.test(finding.code)).length,
    removal: report.findings.filter((finding) =>
      /REMOVED|STATE_LOST|STATUS_LOST|LINK_REMOVED/u.test(finding.code)).length,
  });
}

export function restrictedChangeFields() {
  return Object.freeze([...criticalFields].sort());
}
