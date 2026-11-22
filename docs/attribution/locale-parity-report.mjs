// @ts-check
import { parseCatalog, pairEntries, UNKNOWN } from './locale-parity-core.mjs';
import { auditCatalog, pairCoverage, compareCatalogs } from './locale-parity-audit.mjs';
import { localizedLabel, supportedLocale } from './locale-parity-copy.mjs';

/** @param {{severity: string, code: string, path: string}} finding @param {string} locale */
export function findingText(finding, locale) {
  const severity = localizedLabel(finding.severity, undefined, locale);
  return severity + ' — ' + localizedLabel(finding.code, finding.path, locale) + ' [' + finding.code + ']';
}

/** @param {unknown} input @param {string} [locale] */
export function reportText(input, locale = 'en') {
  const catalog = parseCatalog(input);
  const audit = auditCatalog(catalog);
  const coverage = pairCoverage(catalog);
  /** @param {string} key @param {string} [value] */
  const label = (key, value) => localizedLabel(key, value, locale);
  const lines = [
    label('reportTitle'),
    label('catalog', catalog.label),
    label('date', catalog.createdOn),
    label('decision', label(audit.decision)),
    label('complete', `${coverage.complete}/${coverage.total}`),
    '',
  ];
  for (const pair of pairEntries(catalog)) {
    lines.push(pair.pairId, label('english', pair.en?.text ?? UNKNOWN), label('french', pair.fr?.text ?? UNKNOWN), '');
  }
  lines.push(label('findings'));
  if (!audit.findings.length) lines.push(label('noFindings'));
  for (const finding of audit.findings) lines.push(findingText(finding, locale));
  return lines.join('\n') + '\n';
}

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? UNKNOWN).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** @param {unknown} input @param {string} [locale] */
export function reportHtml(input, locale = 'en') {
  const lang = supportedLocale(locale);
  const catalog = parseCatalog(input);
  const audit = auditCatalog(catalog);
  /** @param {string} key */
  const label = key => escapeHtml(localizedLabel(key, undefined, lang));
  const title = label('reportTitle');
  const rows = pairEntries(catalog).map(pair =>
    `<tr><th scope="row">${escapeHtml(pair.pairId)}</th><td lang="en">${escapeHtml(pair.en?.text)}</td><td lang="fr">${escapeHtml(pair.fr?.text)}</td></tr>`
  ).join('');
  const findings = audit.findings.length
    ? '<ul>' + audit.findings.map((/** @type {{severity:string, code:string, path:string}} */ item) =>
      '<li>' + escapeHtml(findingText(item, lang)) + '</li>'
    ).join('') + '</ul>'
    : '<p>' + label('noFindings') + '</p>';
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';base-uri 'none';form-action 'none'">
  <title>${title} — ${label('app')}</title>
  <style>body{font:1rem/1.5 system-ui;max-width:70rem;margin:auto;padding:1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid currentColor;padding:.5rem;text-align:left;overflow-wrap:anywhere}li{margin:.4rem 0}</style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${escapeHtml(catalog.label)}</p>
    <table><thead><tr><th scope="col">${label('pairId')}</th><th scope="col">${label('english')}</th><th scope="col">${label('french')}</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>${label('findings')}</h2>${findings}
  </main>
</body>
</html>`;
}

/** Schema keys and submitted values in machine-readable exports are language-independent.
 * @param {unknown} input */
export function reportJson(input) {
  return JSON.stringify({
    catalog: parseCatalog(input), audit: auditCatalog(input), coverage: pairCoverage(input),
  }, null, 2) + '\n';
}

/** @param {unknown} input */
export function reportTsv(input) {
  const rows = [['pairId', 'entryId', 'locale', 'kind', 'text', 'licence', 'sourceId']];
  for (const entry of parseCatalog(input).entries) {
    rows.push([entry.pairId, entry.id, entry.locale, entry.kind, entry.text, entry.licence, entry.sourceId]);
  }
  return rows.map(row => row.map(value => {
    const text = String(value ?? UNKNOWN).replace(/[\t\r\n]/gu, ' ');
    return /^\s*[=+@-]/u.test(text) ? "'" + text : text;
  }).join('\t')).join('\n') + '\n';
}

/** @param {unknown} before @param {unknown} after @param {string} [locale] */
export function comparisonText(before, after, locale = 'en') {
  const changes = compareCatalogs(before, after);
  if (!changes.length) return localizedLabel('noChanges', undefined, locale);
  return changes.map(change =>
    localizedLabel(change.severity, undefined, locale) + ' — ' + localizedLabel(change.kind, change.id, locale)
  ).join('\n');
}
