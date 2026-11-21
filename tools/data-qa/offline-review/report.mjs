/** Presentation-only transformations; never mutates or strengthens source assertions. */
import { issueMessage } from './copy.mjs';
import { isRecord } from './schema.mjs';

export function combinedFindings(audit, comparison = null) {
  const findings = [
    ...(Array.isArray(audit?.findings) ? audit.findings : []),
    ...(Array.isArray(comparison?.findings) ? comparison.findings : []),
  ];
  return findings.map((finding, index) => ({
    ...finding,
    number: index + 1,
    origin: index < (audit?.findings?.length ?? 0) ? 'publication' : 'comparison',
  }));
}

export function findingLevels(findings) {
  return {
    errors: findings.filter(item => item.severity === 'ERROR').length,
    notices: findings.filter(item => item.severity === 'NOTICE').length,
  };
}

export function categories(findings) {
  return [...new Set(findings.map(item => item.code))].sort();
}

export function searchFindings(findings, options = {}) {
  const level = options.level ?? 'all';
  const code = options.code ?? 'all';
  const query = String(options.query ?? '').trim().toLocaleLowerCase('en');
  return findings.filter(item => {
    if (level !== 'all' && item.severity !== level) return false;
    if (code !== 'all' && item.code !== code) return false;
    if (!query) return true;
    return `${item.code} ${item.path} ${item.origin}`.toLocaleLowerCase('en').includes(query);
  });
}

export function paginateFindings(findings, page = 1, perPage = 10) {
  const size = [10, 20, 50].includes(perPage) ? perPage : 10;
  const pages = Math.max(1, Math.ceil(findings.length / size));
  const active = Number.isSafeInteger(page) ? Math.min(Math.max(1, page), pages) : 1;
  const start = (active - 1) * size;
  return {
    page: active, pages, count: findings.length, perPage: size,
    items: findings.slice(start, start + size),
  };
}

function safeCell(value) {
  const string = String(value ?? '');
  // Quoting and prefixing spreadsheet-like formulas prevents CSV injection.
  const protectedValue = /^[\s]*[=+@\-\t\r]/.test(string) ? `'${string}` : string;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function findingsCsv(findings) {
  const lines = [['origin', 'level', 'code', 'location']];
  for (const finding of findings) {
    lines.push([finding.origin, finding.severity, finding.code, finding.path]);
  }
  return `${lines.map(row => row.map(safeCell).join(',')).join('\r\n')}\r\n`;
}

export function safeReport(audit, comparison, locale = 'en') {
  const findings = combinedFindings(audit, comparison);
  return {
    schemaVersion: 1,
    locale: locale === 'fr' ? 'fr' : 'en',
    asOf: typeof audit?.asOf === 'string' ? audit.asOf : 'UNKNOWN',
    ok: Boolean(audit?.ok) && (comparison === null || comparison.ok === true),
    counts: isRecord(audit?.counts) ? { ...audit.counts } : {},
    findings: findings.map(item => ({
      code: item.code, level: item.severity, location: item.path,
      origin: item.origin, message: issueMessage(locale, item.code),
    })),
    changes: comparison ? summarizeChanges(comparison) : null,
  };
}

export function safeReportJson(audit, comparison, locale = 'en') {
  return `${JSON.stringify(safeReport(audit, comparison, locale), null, 2)}\n`;
}

export function summarizeChanges(comparison) {
  if (!isRecord(comparison?.changes)) return null;
  const allowed = [
    'addedPlaces', 'removedPlaces', 'renamedPlaces', 'addedSources', 'removedSources',
    'updatedSources', 'addedObservations', 'removedObservations', 'changedStatus',
    'conflictingPlaces', 'addedAssets', 'removedAssets', 'changedAssets', 'relicensedAssets',
  ];
  return Object.fromEntries(allowed.map(key => [key,
    Array.isArray(comparison.changes[key]) ? comparison.changes[key].length : 0]));
}

export function sourceInventory(manifest, filter = '') {
  const query = String(filter).trim().toLocaleLowerCase('en');
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];
  return sources.filter(source => isRecord(source) &&
    (!query || `${source.id ?? ''} ${source.name ?? ''} ${source.licence ?? ''}`
      .toLocaleLowerCase('en').includes(query)))
    .map(source => ({
      id: String(source.id ?? ''),
      name: String(source.name ?? ''),
      licence: String(source.licence ?? ''),
      observedOn: String(source.observedOn ?? ''),
      reference: String(source.reference ?? ''),
    }));
}

export function groupedFindings(findings) {
  const groups = new Map();
  for (const item of findings) {
    const existing = groups.get(item.code) ?? [];
    existing.push(item);
    groups.set(item.code, existing);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([code, items]) => ({ code, items, count: items.length }));
}

export function summaryForScreen(audit, comparison) {
  const findings = combinedFindings(audit, comparison);
  const levels = findingLevels(findings);
  return {
    ok: Boolean(audit?.ok) && (comparison === null || comparison?.ok === true),
    ...levels,
    total: findings.length,
    uniqueCategories: categories(findings).length,
    hasComparison: comparison !== null,
  };
}

export function sortFindings(findings, order = 'location') {
  const result = [...findings];
  if (order === 'category') result.sort((a, b) =>
    a.code.localeCompare(b.code, 'en') || a.path.localeCompare(b.path, 'en'));
  else if (order === 'severity') result.sort((a, b) =>
    a.severity.localeCompare(b.severity, 'en') || a.path.localeCompare(b.path, 'en'));
  else result.sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en'));
  return result;
}

export function sourceLicenceCounts(manifest) {
  const result = new Map();
  for (const source of Array.isArray(manifest?.sources) ? manifest.sources : []) {
    if (!isRecord(source)) continue;
    const licence = typeof source.licence === 'string' ? source.licence : 'UNKNOWN';
    result.set(licence, (result.get(licence) ?? 0) + 1);
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([licence, count]) => ({ licence, count }));
}
