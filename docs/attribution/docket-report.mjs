/** EN/FR local reports; source legal text remains untouched. */
export const LOCALES = Object.freeze(['en', 'fr']);
export const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Licence evidence recheck docket', release: 'Release', asOf: 'Review date',
    status: 'Status', blocked: 'Publication blocked', clear: 'No blocking findings in supplied records',
    sources: 'Sources', views: 'Publication views', evidence: 'Evidence records', decisions: 'Decisions',
    findings: 'Findings', changes: 'Changes', none: 'None', id: 'Identifier',
    source: 'Source URL', licence: 'Licence', licenceUrl: 'Licence terms',
    dataset: 'Dataset date', acquired: 'Acquired on', terms: 'Terms reviewed on', due: 'Review due on',
    permission: 'Redistribution permission', tier: 'Evidence tier', notice: 'Attribution notice',
    offline: 'Offline', target: 'Minimum target size', language: 'Language',
    affected: 'Related sources', info: 'A report of supplied evidence, not an assessment of places or services.',
    unknown: 'UNKNOWN', from: 'Before', to: 'After', evidenceLink: 'Evidence URL',
    headingNavigation: 'Report navigation', skip: 'Skip to main content',
    controls: 'Report controls', empty: 'No records supplied',
  }),
  fr: Object.freeze({
    title: 'Registre de réexamen des sources et licences', release: 'Version', asOf: 'Date d’examen',
    status: 'État', blocked: 'Publication bloquée', clear: 'Aucun élément bloquant dans les données fournies',
    sources: 'Sources', views: 'Vues publiées', evidence: 'Références', decisions: 'Décisions',
    findings: 'Points à examiner', changes: 'Changements', none: 'Aucun', id: 'Identifiant',
    source: 'Adresse de la source', licence: 'Licence', licenceUrl: 'Conditions de la licence',
    dataset: 'Données en date du', acquired: 'Date d’acquisition', terms: 'Conditions consultées le',
    due: 'Prochain examen prévu le', permission: 'Permission de redistribution', tier: 'Niveau de preuve',
    notice: 'Mention de source', offline: 'Hors connexion', target: 'Dimension minimale des cibles',
    language: 'Langue', affected: 'Sources associées', info: 'Ce rapport présente les données fournies. Il n’évalue pas les lieux ou services.',
    unknown: 'UNKNOWN', from: 'Avant', to: 'Après', evidenceLink: 'Adresse de la référence',
    headingNavigation: 'Navigation du rapport', skip: 'Aller au contenu principal',
    controls: 'Actions du rapport', empty: 'Aucune donnée fournie',
  }),
});
const msg = (locale) => COPY[locale === 'fr' ? 'fr' : 'en'];
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const field = (key, value, locale) => `${key}${locale === 'fr' ? '\u00a0' : ''}: ${value}`;
const safe = (value) => value === '' || value == null ? 'UNKNOWN' : String(value);
function findingLines(audit, locale) {
  const t = msg(locale);
  return audit.findings.length ? audit.findings.map((f) => `${f.severity.toUpperCase()} ${f.code} — ${f.path} — ${f.subject}: ${f.detail}`) : [t.none];
}
export function renderDocketText(docket, audit, locale = 'en', comparison = null) {
  const language = locale === 'fr' ? 'fr' : 'en';
  const t = msg(language);
  const lines = [t.title, field(t.release, docket.releaseId, language),
    field(t.asOf, audit.asOf, language), field(t.status, audit.blocked || comparison?.blocked ? t.blocked : t.clear, language),
    t.info, '', field(t.sources, docket.sources.length, language),
    field(t.views, docket.surfaces.length, language), field(t.evidence, docket.evidence.length, language),
    field(t.decisions, docket.decisions.length, language), '', t.findings, ...findingLines(audit, language)];
  if (comparison) {
    lines.push('', t.changes);
    for (const item of comparison.changes) {
      lines.push(`${item.severity.toUpperCase()} ${item.kind} ${item.recordId} ${item.field}: ${t.from}=${item.before} | ${t.to}=${item.after}`);
    }
    if (!comparison.changes.length) lines.push(t.none);
  }
  lines.push('', t.sources);
  for (const source of docket.sources) {
    lines.push('', `## ${source.id} — ${source.name}`,
      field(t.source, source.sourceUrl, language),
      field(t.licence, source.licenceName, language),
      field(t.licenceUrl, source.licenceUrl, language),
      field(t.dataset, source.datasetDate, language),
      field(t.acquired, source.acquiredOn, language),
      field(t.terms, source.termsReviewedOn, language),
      field(t.due, source.reviewDueOn, language),
      field(t.permission, source.permission, language),
      field(t.tier, source.tier, language),
      t.notice, source.notice || t.unknown);
  }
  lines.push('', t.views);
  for (const surface of docket.surfaces) {
    lines.push(`- ${surface.id} (${surface.locale})`,
      field(t.affected, surface.sourceIds.join(', ') || t.unknown, language),
      field(t.offline, surface.offline, language),
      field(t.target, surface.targetPx, language));
  }
  return `${lines.join('\n')}\n`;
}
function listHtml(rows) {
  return rows.length ? `<ul>${rows.map((item) => `<li>${item}</li>`).join('')}</ul>` : '<p>UNKNOWN</p>';
}
function detailsHtml(source, locale) {
  const t = msg(locale);
  const cells = [
    [t.source, source.sourceUrl, true], [t.licence, source.licenceName],
    [t.licenceUrl, source.licenceUrl, true], [t.dataset, source.datasetDate],
    [t.acquired, source.acquiredOn], [t.terms, source.termsReviewedOn],
    [t.due, source.reviewDueOn], [t.permission, source.permission], [t.tier, source.tier],
  ];
  return `<article><h3>${escape(source.name)} (${escape(source.id)})</h3><dl>${cells.map(([key, value, link]) => {
    const url = link && typeof value === 'string' && value.startsWith('https://');
    return `<dt>${escape(key)}</dt><dd>${url ? `<a href="${escape(value)}" rel="noopener noreferrer">${escape(value)}</a>` : escape(value)}</dd>`;
  }).join('')}</dl><h4>${escape(t.notice)}</h4><pre>${escape(source.notice || 'UNKNOWN')}</pre></article>`;
}
export function renderDocketHtml(docket, audit, locale = 'en', comparison = null) {
  const language = locale === 'fr' ? 'fr' : 'en';
  const t = msg(language);
  const findings = audit.findings.map((f) => `<li><strong>${escape(f.severity)}: ${escape(f.code)}</strong> ${escape(f.path)} — ${escape(f.detail)}</li>`);
  const changes = comparison?.changes.map((item) => `<li><strong>${escape(item.severity)}: ${escape(item.kind)}</strong> ${escape(item.recordId)} / ${escape(item.field)} — ${escape(item.before)} → ${escape(item.after)}</li>`) ?? [];
  const styles = `body{font:1rem/1.55 system-ui,sans-serif;margin:0 auto;max-width:74rem;padding:1rem;background:#fffdf9;color:#17221b}h1,h2,h3{line-height:1.25}a{color:#174d75;min-height:44px;min-width:44px;display:inline-flex;align-items:center;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #ae6100;outline-offset:3px}nav a{margin-right:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}dt{font-weight:bold}dd{margin:0 0 .8rem}section,article{margin:1.2rem 0;padding:1rem;border:1px solid #606d63;border-radius:.4rem}.skip{position:absolute;top:-5rem}.skip:focus{top:0;background:white}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{nav,.skip{display:none}section{break-inside:avoid}}@media(forced-colors:active){a:focus-visible{outline:3px solid Highlight}}`;
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'"><title>${escape(t.title)}</title><style>${styles}</style></head><body><a class="skip" href="#main">${escape(t.skip)}</a><header><h1>${escape(t.title)}</h1><p>${escape(t.info)}</p><nav aria-label="${escape(t.headingNavigation)}"><a href="#findings">${escape(t.findings)}</a><a href="#sources">${escape(t.sources)}</a><a href="#views">${escape(t.views)}</a></nav></header><main id="main"><section aria-labelledby="summary"><h2 id="summary">${escape(t.status)}</h2><p>${escape(audit.blocked || comparison?.blocked ? t.blocked : t.clear)}</p><p>${escape(t.release)}${language === 'fr' ? '\u00a0' : ''}: ${escape(docket.releaseId)}</p><p>${escape(t.asOf)}${language === 'fr' ? '\u00a0' : ''}: ${escape(audit.asOf)}</p></section><section id="findings"><h2>${escape(t.findings)}</h2>${listHtml(findings)}</section>${comparison ? `<section id="changes"><h2>${escape(t.changes)}</h2>${listHtml(changes)}</section>` : ''}<section id="sources"><h2>${escape(t.sources)}</h2>${docket.sources.map((source) => detailsHtml(source, language)).join('')}</section><section id="views"><h2>${escape(t.views)}</h2>${listHtml(docket.surfaces.map((view) => `<span>${escape(view.id)} (${escape(view.locale)}): ${escape(view.sourceIds.join(', ') || 'UNKNOWN')}</span>`))}</section></main></body></html>\n`;
}
export function renderDocketJson(docket, audit, comparison = null) {
  return `${JSON.stringify({ schema: 'attribution-docket-report/1', releaseId: docket.releaseId,
    blocked: audit.blocked || Boolean(comparison?.blocked), audit, comparison, docket }, null, 2)}\n`;
}
