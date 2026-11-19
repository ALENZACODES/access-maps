/** Escaped, offline-ready EN/FR claim evidence reports. */
export const TRACE_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Claim and source trace', introduction: 'This report describes the supplied source evidence. It does not assess conditions at a location.',
    release: 'Release', status: 'Status', blocked: 'Publication blocked by evidence gaps', clear: 'No blocking findings in the supplied records',
    sources: 'Sources', references: 'References', claims: 'Claims', surfaces: 'Publication views', findings: 'Findings',
    changes: 'Changes', noFindings: 'No findings', unknown: 'UNKNOWN', source: 'Source', licence: 'Licence',
    sourceUrl: 'Source URL', licenceUrl: 'Licence URL', permission: 'Redistribution permission', tier: 'Evidence tier',
    acquiredDate: 'Acquired', datasetDate: 'Dataset date', termsDate: 'Terms reviewed', observedDate: 'Observed date',
    evidence: 'Evidence', supporting: 'Supporting references', views: 'Publication views', statement: 'Statement',
    previous: 'Previous', candidate: 'Candidate', attention: 'Attention', information: 'Information', block: 'Block',
    dateRange: 'Evidence dates', none: 'None', code: 'Code', path: 'Path', detail: 'Detail', skip: 'Skip to report',
  }),
  fr: Object.freeze({
    title: 'Traçabilité des affirmations et des sources', introduction: 'Ce rapport décrit les renseignements fournis sur les sources. Il n’évalue pas les conditions d’un lieu.',
    release: 'Version', status: 'État', blocked: 'Publication bloquée par des renseignements manquants', clear: 'Aucun élément bloquant dans les renseignements fournis',
    sources: 'Sources', references: 'Références', claims: 'Affirmations', surfaces: 'Vues de publication', findings: 'Points à examiner',
    changes: 'Changements', noFindings: 'Aucun point à signaler', unknown: 'UNKNOWN', source: 'Source', licence: 'Licence',
    sourceUrl: 'Adresse de la source', licenceUrl: 'Adresse de la licence', permission: 'Permission de redistribution', tier: 'Niveau des renseignements',
    acquiredDate: 'Date d’acquisition', datasetDate: 'Données en date du', termsDate: 'Conditions consultées le', observedDate: 'Date d’observation',
    evidence: 'Renseignements', supporting: 'Références connexes', views: 'Vues de publication', statement: 'Énoncé',
    previous: 'Précédent', candidate: 'Actuel', attention: 'Attention', information: 'Information', block: 'Blocage',
    dateRange: 'Dates des renseignements', none: 'Aucun', code: 'Code', path: 'Emplacement', detail: 'Détail', skip: 'Aller au rapport',
  }),
});
export const TRACE_HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
export const TRACE_HTML_STYLE = `
:root{font-family:system-ui,sans-serif;line-height:1.6;color:#171717;background:#fff}
body{max-width:75rem;margin:auto;padding:1rem}h1,h2,h3{line-height:1.3}
a{display:inline-flex;min-height:44px;min-width:44px;align-items:center;overflow-wrap:anywhere}
a:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.skip{position:absolute;left:-10000px}.skip:focus{left:1rem;top:1rem;background:#fff;padding:.5rem}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:.5rem;text-align:start;vertical-align:top;overflow-wrap:anywhere}
section,article{margin-block:1.5rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:42rem){body{padding:.5rem}table{display:block;overflow-x:auto}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media(forced-colors:active){a:focus-visible{outline:3px solid Highlight}}
@media print{body{max-width:none}.skip{display:none}a{color:inherit;text-decoration:underline}}
`;

function escapeHtml(input) { return String(input).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;'); }
function space(locale) { return locale === 'fr' ? '\u00a0' : ''; }
function colon(locale, label, value) { return `${label}${space(locale)}: ${String(value)}`; }
function locales(locale) { return TRACE_COPY[locale === 'fr' ? 'fr' : 'en']; }
function normal(value) { return value === '' || value === undefined || value === null ? 'UNKNOWN' : String(value); }
function findingRow(finding) { return [finding.code, finding.level, finding.path, finding.detail]; }
function changeRow(change) { return [change.kind, change.id, change.field, change.before, change.after, change.level]; }
function rowsText(rows, locale) { return rows.map((row) => row.map((value) => normal(value)).join(locale === 'fr' ? '  ·  ' : ' | ')).join('\n'); }

export function renderClaimText(trace, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = locales(lang);
  const lines = [t.title, t.introduction, '', colon(lang, t.release, trace.releaseId), colon(lang, t.status, audit.blocked || comparison?.blocked ? t.blocked : t.clear),
    colon(lang, t.sources, trace.sources.length), colon(lang, t.references, trace.references.length), colon(lang, t.claims, trace.claims.length), colon(lang, t.surfaces, trace.surfaces.length), '', t.findings];
  lines.push(audit.findings.length ? rowsText(audit.findings.map(findingRow), lang) : t.noFindings);
  for (const claim of trace.claims) {
    lines.push('', `## ${claim.id}`, colon(lang, t.statement, claim.text), colon(lang, t.observedDate, claim.observedDate),
      colon(lang, t.source, claim.sourceIds.join(', ') || t.unknown), colon(lang, t.supporting, claim.referenceIds.join(', ') || t.unknown));
    for (const id of claim.sourceIds) {
      const source = trace.sources.find((s) => s.id === id);
      if (!source) { lines.push(colon(lang, t.evidence, t.unknown)); continue; }
      lines.push(colon(lang, t.sourceUrl, source.url), colon(lang, t.licence, source.licence), colon(lang, t.licenceUrl, source.licenceUrl),
        colon(lang, t.permission, source.permission), colon(lang, t.tier, source.tier), colon(lang, t.acquiredDate, source.acquiredDate),
        colon(lang, t.datasetDate, source.datasetDate), colon(lang, t.termsDate, source.termsDate), source.notice);
    }
  }
  if (comparison) lines.push('', t.changes, comparison.changes.length ? rowsText(comparison.changes.map(changeRow), lang) : t.noFindings);
  return `${lines.join('\n')}\n`;
}
function dataTable(headings, rows) {
  return `<table><thead><tr>${headings.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(normal(cell))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headings.length}">UNKNOWN</td></tr>`}</tbody></table>`;
}
function linkOrUnknown(url, label) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return '<span>UNKNOWN</span>';
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '<span>UNKNOWN</span>'; } catch { return '<span>UNKNOWN</span>'; }
  return `<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`;
}
export function renderClaimHtml(trace, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = locales(lang);
  const title = escapeHtml(t.title);
  const status = escapeHtml(audit.blocked || comparison?.blocked ? t.blocked : t.clear);
  const claimSections = trace.claims.map((claim) => {
    const sourceRows = claim.sourceIds.map((id) => {
      const source = trace.sources.find((s) => s.id === id);
      return source ? `<li><strong>${escapeHtml(source.name)}</strong> — ${linkOrUnknown(source.url, t.sourceUrl)} — ${linkOrUnknown(source.licenceUrl, t.licenceUrl)}<p>${escapeHtml(source.licence)} · ${escapeHtml(source.tier)} · ${escapeHtml(source.permission)} · ${escapeHtml(source.datasetDate)}</p><pre>${escapeHtml(source.notice)}</pre></li>` : `<li>UNKNOWN: ${escapeHtml(id)}</li>`;
    }).join('');
    return `<article><h3>${escapeHtml(claim.id)}</h3><p>${escapeHtml(claim.text)}</p><p>${escapeHtml(colon(lang, t.observedDate, claim.observedDate))}</p><h4>${escapeHtml(t.sources)}</h4><ul>${sourceRows || '<li>UNKNOWN</li>'}</ul><h4>${escapeHtml(t.supporting)}</h4><p>${escapeHtml(claim.referenceIds.join(', ') || 'UNKNOWN')}</p></article>`;
  }).join('');
  const comparisonSection = comparison ? `<section aria-labelledby="changes"><h2 id="changes">${escapeHtml(t.changes)}</h2>${dataTable(['Type', 'ID', 'Field', t.previous, t.candidate, t.status], comparison.changes.map(changeRow))}</section>` : '';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(TRACE_HTML_CSP)}"><title>${title}</title><style>${TRACE_HTML_STYLE}</style></head><body><a class="skip" href="#main">${escapeHtml(t.skip)}</a><header><h1>${title}</h1><p>${escapeHtml(t.introduction)}</p></header><main id="main"><p role="status">${status}</p><p>${escapeHtml(colon(lang, t.release, trace.releaseId))}</p><section aria-labelledby="findings"><h2 id="findings">${escapeHtml(t.findings)}</h2>${dataTable([t.code, t.status, t.path, t.detail], audit.findings.map(findingRow))}</section><section aria-labelledby="claims"><h2 id="claims">${escapeHtml(t.claims)}</h2>${claimSections || `<p>${escapeHtml(t.none)}</p>`}</section>${comparisonSection}</main></body></html>\n`;
}
export function renderClaimJson(trace, audit, comparison = null) { return `${JSON.stringify({schema: 'attribution-claim-report/1', releaseId: trace.releaseId, trace, audit, comparison}, null, 2)}\n`; }
export function renderClaimReport(trace, audit, locale = 'en', comparison = null) {
  return { text: renderClaimText(trace, audit, locale, comparison), html: renderClaimHtml(trace, audit, locale, comparison), json: renderClaimJson(trace, audit, comparison) };
}
