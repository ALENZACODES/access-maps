/** Local report formatting. Exact legal text is not reconstructed here. */
const WORDS = Object.freeze({
  en: Object.freeze({title: 'Static attribution page audit', release: 'Release', status: 'Status',
    blocked: 'Blocked by attribution gaps', passed: 'No blocking findings in supplied files',
    pages: 'Pages', findings: 'Findings', detail: 'Detail', page: 'Page',
    changes: 'Changes since previous release', none: 'No findings', unknown: 'UNKNOWN'}),
  fr: Object.freeze({title: 'Audit local des mentions de sources', release: 'Version', status: 'État',
    blocked: 'Publication bloquée par des renseignements manquants',
    passed: 'Aucun élément bloquant dans les fichiers fournis', pages: 'Pages',
    findings: 'Points à examiner', detail: 'Détail', page: 'Page',
    changes: 'Changements depuis la version précédente', none: 'Aucun point à signaler',
    unknown: 'UNKNOWN'}),
});
function lang(locale) { return locale === 'fr' ? 'fr' : 'en'; }
function colon(locale) { return locale === 'fr' ? '\u00a0:' : ':'; }
function label(locale, key) { return WORDS[lang(locale)][key]; }
function esc(value) { return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;'); }
export function renderStaticText(report, locale = 'en', comparison = null) {
  const language = lang(locale);
  const lines = [label(language, 'title'), `${label(language, 'release')}${colon(language)} ${report.releaseId}`,
    `${label(language, 'status')}${colon(language)} ${report.blocked ? label(language, 'blocked') : label(language, 'passed')}`,
    `${label(language, 'pages')}${colon(language)} ${report.results.length}`, ''];
  for (const result of report.results) {
    lines.push(`${label(language, 'page')}${colon(language)} ${result.pageId} — ${result.file}`);
    if (!result.findings.length) lines.push(label(language, 'none'));
    for (const finding of result.findings) lines.push(`  ${finding.severity} ${finding.code} [${finding.creditId ?? 'UNKNOWN'}] ${finding.detail}`);
    lines.push('');
  }
  if (comparison) {
    lines.push(label(language, 'changes'));
    if (!comparison.changes.length) lines.push(label(language, 'none'));
    for (const change of comparison.changes) lines.push(`${change.code} ${change.pageId} ${change.finding ?? ''}`);
  }
  return `${lines.join('\n')}\n`;
}
export function renderStaticJson(report, comparison = null) {
  return `${JSON.stringify({schema: 'attribution-static-report/1', release: report,
    comparison}, null, 2)}\n`;
}
export function renderStaticHtml(report, locale = 'en', comparison = null) {
  const language = lang(locale);
  const heading = label(language, 'title');
  const summary = report.blocked ? label(language, 'blocked') : label(language, 'passed');
  const items = report.results.map(result => {
    const findings = result.findings.length ? `<ul>${result.findings.map(finding =>
      `<li>${esc(finding.code)} (${esc(finding.severity)}): ${esc(finding.detail)} [${esc(finding.creditId ?? 'UNKNOWN')}]</li>`).join('')}</ul>` : `<p>${esc(label(language, 'none'))}</p>`;
    return `<section aria-labelledby="page-${esc(result.pageId)}"><h2 id="page-${esc(result.pageId)}">${esc(result.pageId)}</h2><p>${esc(result.file)}</p>${findings}</section>`;
  }).join('\n');
  const changes = comparison ? `<section aria-labelledby="changes"><h2 id="changes">${esc(label(language, 'changes'))}</h2>${comparison.changes.length ? `<ul>${comparison.changes.map(c => `<li>${esc(c.code)}: ${esc(c.pageId)} ${esc(c.finding ?? '')}</li>`).join('')}</ul>` : `<p>${esc(label(language, 'none'))}</p>`}</section>` : '';
  return `<!doctype html>\n<html lang="${language}">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'">\n<title>${esc(heading)}</title><style>body{max-width:72ch;margin:auto;padding:1rem;font:1rem/1.6 system-ui,sans-serif;color:#182320;background:#fff}a{min-height:44px;min-width:44px;display:inline-flex;align-items:center}a:focus-visible{outline:3px solid #1547aa;outline-offset:3px}section{border-top:1px solid #666;padding-block:1rem}li{overflow-wrap:anywhere}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head>\n<body><a href="#main">${language === 'fr' ? 'Aller au contenu principal' : 'Skip to main content'}</a><main id="main"><h1>${esc(heading)}</h1><p>${esc(label(language, 'release'))}${colon(language)} ${esc(report.releaseId)}</p><p>${esc(label(language, 'status'))}${colon(language)} ${esc(summary)}</p>${items}${changes}</main></body></html>\n`;
}
