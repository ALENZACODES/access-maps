/** Dependency-free, offline, bilingual report rendering. */
export const LOCALE_QA_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Bilingual attribution quality report',
    introduction: 'This report describes recorded source and publication evidence. It does not assess a physical location.',
    release: 'Release', status: 'Status', blocked: 'Publication blocked by evidence gaps', clear: 'No blocking findings in the supplied records',
    sources: 'Sources', pages: 'Pages', findings: 'Audit findings', changes: 'Release changes',
    noFindings: 'No findings', noChanges: 'No changes', source: 'Source', licence: 'Licence', permission: 'Redistribution permission',
    acquired: 'Acquisition date', dataset: 'Dataset date', reviewed: 'Terms review date', tier: 'Evidence tier',
    route: 'Page route', notice: 'Notice', offline: 'Offline', target: 'Minimum target', reviewedNotice: 'Notice review date',
    before: 'Before', after: 'After', severity: 'Severity', evidence: 'Evidence', notices: 'Displayed notices',
    openSource: 'Open source terms', openLicence: 'Open licence terms', unknown: 'UNKNOWN', help: 'Open external links only when a connection is available.',
  }),
  fr: Object.freeze({
    title: 'Rapport de qualité des mentions bilingues',
    introduction: 'Ce rapport présente les renseignements consignés sur les sources et la publication. Il n’évalue pas un lieu physique.',
    release: 'Version', status: 'État', blocked: 'Publication bloquée en raison de renseignements manquants', clear: 'Aucun élément bloquant dans les renseignements fournis',
    sources: 'Sources', pages: 'Pages', findings: 'Points à examiner', changes: 'Changements de version',
    noFindings: 'Aucun point à signaler', noChanges: 'Aucun changement', source: 'Source', licence: 'Licence', permission: 'Permission de redistribution',
    acquired: 'Date d’acquisition', dataset: 'Données en date du', reviewed: 'Conditions consultées le', tier: 'Niveau de preuve',
    route: 'Chemin de la page', notice: 'Mention', offline: 'Hors connexion', target: 'Cible minimale', reviewedNotice: 'Date d’examen de la mention',
    before: 'Avant', after: 'Après', severity: 'Gravité', evidence: 'Preuve', notices: 'Mentions affichées',
    openSource: 'Ouvrir les conditions de la source', openLicence: 'Ouvrir la licence', unknown: 'UNKNOWN', help: 'Ouvrez les liens externes uniquement avec une connexion.',
  }),
});
export function localeCopy(locale) { return LOCALE_QA_COPY[locale === 'fr' ? 'fr' : 'en']; }
function colon(locale) { return locale === 'fr' ? '\u00a0: ' : ': '; }
function label(locale, name, value) { return `${name}${colon(locale)}${value}`; }
function escape(value) { return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;'); }
function safeHref(value) { if (value === 'UNKNOWN') return null; try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } }
function findingLine(f, locale) { return `${f.code} [${f.severity}] ${f.path}${colon(locale)}${f.detail}`; }
function changeLine(c, locale) { return `${c.kind} ${c.entity}.${c.field}${colon(locale)}${c.before} → ${c.after}${c.blocking ? ' [block]' : ''}`; }
function evidenceLines(source, copy, locale) {
  return [
    label(locale, copy.source, source.name),
    label(locale, copy.licence, source.licenceName),
    label(locale, copy.permission, source.permission),
    label(locale, copy.acquired, source.acquiredDate),
    label(locale, copy.dataset, source.datasetDate),
    label(locale, copy.reviewed, source.termsDate),
    label(locale, copy.tier, source.evidenceTier),
    `Source URL${colon(locale)}${source.sourceUrl}`,
    `Licence URL${colon(locale)}${source.licenceUrl}`,
  ];
}
export function renderLocaleQaText(release, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const copy = localeCopy(lang);
  const lines = [copy.title, '', copy.introduction, '', label(lang, copy.release, release.releaseId), label(lang, copy.status, audit.blocked || comparison?.blocked ? copy.blocked : copy.clear), label(lang, copy.sources, release.sources.length), label(lang, copy.pages, release.pages.length)];
  for (const source of release.sources) lines.push('', `## ${source.id}`, ...evidenceLines(source, copy, lang));
  for (const page of release.pages) {
    lines.push('', `## ${page.id} (${page.locale})`, label(lang, copy.route, page.route), label(lang, copy.offline, page.offline), label(lang, copy.target, page.targetPx));
    for (const notice of page.notices) lines.push('', `${copy.notice} ${notice.id}`, notice.text, label(lang, copy.reviewedNotice, notice.reviewDate), label(lang, copy.evidence, notice.evidenceUrl));
  }
  lines.push('', `## ${copy.findings}`, ...(audit.findings.length ? audit.findings.map(f => findingLine(f, lang)) : [copy.noFindings]));
  if (comparison) lines.push('', `## ${copy.changes}`, ...(comparison.changes.length ? comparison.changes.map(c => changeLine(c, lang)) : [copy.noChanges]));
  return `${lines.join('\n')}\n`;
}
function dlRow(term, value) { return `<dt>${escape(term)}</dt><dd>${escape(value)}</dd>`; }
function externalLink(url, label) { const href = safeHref(url); return href ? `<a rel="noopener noreferrer" href="${escape(href)}">${escape(label)}</a>` : `<span>UNKNOWN</span>`; }
function sourceSection(source, copy) {
  const fields = [[copy.source, source.name], [copy.licence, source.licenceName], [copy.permission, source.permission], [copy.acquired, source.acquiredDate], [copy.dataset, source.datasetDate], [copy.reviewed, source.termsDate], [copy.tier, source.evidenceTier]];
  return `<section aria-labelledby="source-${escape(source.id)}"><h3 id="source-${escape(source.id)}">${escape(source.id)}</h3><dl>${fields.map(([a,b]) => dlRow(a,b)).join('')}</dl><p>${externalLink(source.sourceUrl, copy.openSource)}</p><p>${externalLink(source.licenceUrl, copy.openLicence)}</p></section>`;
}
function pageSection(page, copy) {
  const noticeHtml = page.notices.map(n => `<li><strong>${escape(n.id)}</strong><p>${escape(n.text)}</p><p>${escape(n.reviewDate)} · ${escape(n.review)} · ${escape(n.targetPx)}</p><p>${externalLink(n.evidenceUrl, copy.evidence)}</p></li>`).join('');
  return `<section aria-labelledby="page-${escape(page.id)}"><h3 id="page-${escape(page.id)}">${escape(page.id)} (${escape(page.locale)})</h3><dl>${dlRow(copy.route,page.route)}${dlRow(copy.offline,page.offline)}${dlRow(copy.target,page.targetPx)}</dl><h4>${escape(copy.notices)}</h4><ul>${noticeHtml}</ul></section>`;
}
function findingItem(f) { return `<li><strong>${escape(f.code)} (${escape(f.severity)})</strong><p>${escape(f.path)}</p><p>${escape(f.detail)}</p></li>`; }
function changeItem(c, copy, locale) { return `<li><strong>${escape(c.kind)} ${escape(c.entity)}</strong><p>${escape(c.field)}</p><p>${escape(copy.before)}${colon(locale)}${escape(c.before)}</p><p>${escape(copy.after)}${colon(locale)}${escape(c.after)}</p></li>`; }
export function renderLocaleQaHtml(release, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = localeCopy(lang);
  const blocked = audit.blocked || comparison?.blocked;
  const findings = audit.findings.length ? audit.findings.map(findingItem).join('') : `<li>${escape(t.noFindings)}</li>`;
  const changes = comparison ? `<section aria-labelledby="changes"><h2 id="changes">${escape(t.changes)}</h2><ul>${comparison.changes.length ? comparison.changes.map(c=>changeItem(c,t,lang)).join('') : `<li>${escape(t.noChanges)}</li>`}</ul></section>` : '';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'"><title>${escape(t.title)}</title><style>html{font-family:system-ui,sans-serif;line-height:1.5}body{max-width:75rem;margin:auto;padding:1rem}a{display:inline-flex;min-height:44px;min-width:44px;align-items:center}a:focus-visible{outline:3px solid Highlight;outline-offset:3px}section{margin-block:1.3rem;border-block-start:1px solid gray;padding-block:1rem}dt{font-weight:bold}dd{overflow-wrap:anywhere;margin-bottom:.5rem}li{overflow-wrap:anywhere;margin-block:.6rem}.skip{position:absolute;top:-8rem}.skip:focus{top:0;background:Canvas;color:CanvasText}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{body{max-width:none}}</style></head><body><a class="skip" href="#main">${lang==='fr'?'Aller au contenu principal':'Skip to main content'}</a><header><h1>${escape(t.title)}</h1><p>${escape(t.introduction)}</p></header><main id="main"><p>${escape(t.release)}${colon(lang)}${escape(release.releaseId)}</p><p role="status">${escape(blocked?t.blocked:t.clear)}</p><section aria-labelledby="sources"><h2 id="sources">${escape(t.sources)}</h2>${release.sources.map(s=>sourceSection(s,t)).join('')}</section><section aria-labelledby="pages"><h2 id="pages">${escape(t.pages)}</h2>${release.pages.map(p=>pageSection(p,t)).join('')}</section><section aria-labelledby="findings"><h2 id="findings">${escape(t.findings)}</h2><ul>${findings}</ul></section>${changes}</main><footer>${escape(t.help)}</footer></body></html>\n`;
}
export function renderLocaleQaJson(release, audit, comparison = null) {
  return `${JSON.stringify({ schema: 'attribution-locale-qa-report/1', releaseId: release.releaseId, blocked: Boolean(audit.blocked || comparison?.blocked), audit, comparison }, null, 2)}\n`;
}
export function renderLocaleQaReport(release, audit, locale = 'en', comparison = null) {
  return { text: renderLocaleQaText(release, audit, locale, comparison), html: renderLocaleQaHtml(release, audit, locale, comparison), json: renderLocaleQaJson(release, audit, comparison) };
}
