/** Bounded offline reports. No uploads, timers, hidden persistence or network calls. */
import { createHash } from 'node:crypto';
import { reviewCopy, safeCopy, selectLocale, sortId } from './p15ac-policy.mjs';
import { decisionMatrix, groupReviewTasks, makeReviewChecklist, summarizeRouteStatus } from './p15ac-comparison.mjs';

const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const safeLine = (value) => String(value ?? 'UNKNOWN').replace(/[\r\n\t]/gu, ' ').slice(0, 4096);
const quoteCsv = (value) => {
  const safe = safeLine(value);
  // Avoid formula interpretation when CSV is opened in spreadsheet software.
  const protectedValue = /^[=+@-]/u.test(safe) ? `'${safe}` : safe;
  return `"${protectedValue.replace(/"/gu, '""')}"`;
};

export function canonicalObject(input) {
  if (Array.isArray(input)) return input.map(canonicalObject);
  if (input !== null && typeof input === 'object') {
    const entries = Object.keys(input).sort(sortId).map((key) => [key, canonicalObject(input[key])]);
    return Object.fromEntries(entries);
  }
  if (typeof input === 'number' && !Number.isFinite(input)) throw new TypeError('Nonfinite values are not allowed');
  if (typeof input === 'bigint' || typeof input === 'function' ||
      typeof input === 'symbol' || typeof input === 'undefined') throw new TypeError('Unsupported value');
  return input;
}

export function deterministicJson(value) {
  const serialized = JSON.stringify(canonicalObject(value));
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REPORT_BYTES) throw new RangeError('Report is too large');
  return `${serialized}\n`;
}

export function byteDigest(value) {
  const content = typeof value === 'string' ? value : deterministicJson(value);
  return createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
}

function staticSummary(review) {
  return {
    ...summarizeRouteStatus(review),
    asOf: review.asOf,
    sourceCount: review.sourceCount,
    silo: review.policy.silo,
    maxAgeDays: review.policy.maxAgeDays,
    minimumTier: review.policy.minimumTier,
  };
}

/** No record is included unless the review has passed structural checks. */
export function createEvidenceReport(review, locale = 'en') {
  selectLocale(locale);
  if (!review?.ok) return Object.freeze({ ok: false, report: null, json: null,
    sha256: null, bytes: 0 });
  const copy = reviewCopy(locale);
  const report = {
    kind: 'ontario-route-evidence-report',
    version: 1,
    locale,
    heading: copy.heading,
    summaryText: copy.summary,
    caution: copy.notes,
    summary: staticSummary(review),
    decisions: decisionMatrix(review),
    groups: groupReviewTasks(review).groups,
    tasks: makeReviewChecklist(review),
    routes: review.routes.map((route) => ({
      rank: route.rank,
      access: route.status,
      metres: route.metres,
      segments: route.segments.map((segment) => ({
        id: segment.id,
        from: segment.from,
        to: segment.to,
        metres: segment.metres,
        name: segment.name,
        access: segment.access,
        tier: segment.tier,
        sourceIds: segment.sourceIds,
        sources: segment.sources,
        observations: segment.edge.observations,
        problems: segment.problems,
      })),
    })),
  };
  const json = deterministicJson(report);
  return Object.freeze({ ok: true, report: Object.freeze(report), json,
    sha256: byteDigest(json), bytes: Buffer.byteLength(json, 'utf8') });
}

export function reportText(review, locale = 'en') {
  selectLocale(locale);
  const copy = reviewCopy(locale);
  if (!review?.ok) return `${copy.blocked}\n`;
  const summary = summarizeRouteStatus(review);
  const lines = [copy.heading, copy.summary, copy.notes];
  lines.push(`${copy.alternative}: ${summary.routes}`);
  lines.push(`${copy.gaps}: ${summary.tasks}`);
  for (const route of review.routes) {
    lines.push(`${copy.alternative} ${route.rank}: ${route.status} — ${route.metres} m`);
    for (const segment of route.segments) {
      lines.push(`  ${segment.id}: ${segment.access} — ${segment.name[locale]}`);
      for (const source of segment.sources) {
        lines.push(`    ${copy.source}: ${source.id} — ${copy.licence}: ${source.licence}`);
        lines.push(`    ${copy.dated}: ${source.observedOn}`);
      }
      for (const issue of segment.problems) lines.push(`    ${issue.code}: ${issue[locale]}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function reportCsv(review, locale = 'en') {
  selectLocale(locale);
  if (!review?.ok) return null;
  const rows = [[
    'route', 'segment', 'from', 'to', 'access', 'tier', 'metres',
    'sources', 'licences', 'source_dates', 'issues', 'name',
  ]];
  for (const route of review.routes) {
    for (const segment of route.segments) {
      rows.push([
        route.rank, segment.id, segment.from, segment.to,
        segment.access, segment.tier, segment.metres,
        segment.sourceIds.join('|'),
        segment.sources.map((s) => s.licence).join('|'),
        segment.sources.map((s) => s.observedOn).join('|'),
        segment.problems.map((p) => p.code).join('|'), segment.name[locale],
      ]);
    }
  }
  const csv = `${rows.map((row) => row.map(quoteCsv).join(',')).join('\n')}\n`;
  if (Buffer.byteLength(csv, 'utf8') > MAX_REPORT_BYTES) return null;
  return csv;
}

export function reportAuditTrail(review) {
  if (!review?.ok) return Object.freeze([]);
  const rows = [];
  for (const route of review.routes) {
    for (const segment of route.segments) {
      for (const observation of segment.edge.observations) {
        rows.push(Object.freeze({
          route: route.rank,
          segmentId: segment.id,
          sourceId: observation.sourceId,
          observedOn: observation.observedOn,
          sourceDate: observation.sourceDate,
          licence: observation.licence,
          access: observation.usable ? observation.access : 'UNKNOWN',
          tier: observation.tier,
        }));
      }
    }
  }
  rows.sort((a, b) => a.route - b.route || sortId(a.segmentId, b.segmentId) ||
    sortId(a.sourceId, b.sourceId) || sortId(a.observedOn, b.observedOn));
  return Object.freeze(rows);
}

export function checkReportText(report) {
  if (!report?.ok || typeof report.json !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(report.sha256) || !Number.isSafeInteger(report.bytes)) return false;
  if (Buffer.byteLength(report.json, 'utf8') !== report.bytes) return false;
  if (byteDigest(report.json) !== report.sha256) return false;
  try {
    const parsed = JSON.parse(report.json);
    return parsed.kind === 'ontario-route-evidence-report' && parsed.version === 1 &&
      ['en', 'fr'].includes(parsed.locale) && safeCopy(parsed.heading) &&
      Array.isArray(parsed.routes) && Array.isArray(parsed.tasks);
  } catch {
    return false;
  }
}

export function localFilePlan(report, locale = 'en') {
  selectLocale(locale);
  if (!report?.ok || !checkReportText(report)) return null;
  const base = `ontario-route-evidence-${report.report.summary.asOf}-${locale}`;
  const csv = reportCsv({ ok: true, routes: report.report.routes }, locale);
  return Object.freeze({
    json: Object.freeze({ fileName: `${base}.json`, mime: 'application/json',
      content: report.json, sha256: report.sha256 }),
    csv: csv === null ? null : Object.freeze({ fileName: `${base}.csv`,
      mime: 'text/csv', content: csv, sha256: byteDigest(csv) }),
  });
}
