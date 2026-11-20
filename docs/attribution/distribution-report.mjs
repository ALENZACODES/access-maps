/** Escaped, self-contained EN/FR publication evidence reports. */
import { UNKNOWN } from './distribution-core.mjs';
import { impactSummary } from './distribution-change.mjs';
export const REPORT_MESSAGES = Object.freeze({
  en: Object.freeze({ title: 'Attribution distribution-chain report', release: 'Release', status: 'Status', blocked: 'Publication blocked by evidence gaps', clear: 'No blocking findings in the supplied records', sources: 'Recorded sources', assets: 'Packaged assets', views: 'Publication views', findings: 'Audit findings', changes: 'Release changes', empty: 'No findings', source: 'Source', licence: 'Licence', dataset: 'Dataset date', acquired: 'Acquired on', terms: 'Terms reviewed on', permission: 'Permission', tier: 'Evidence tier', view: 'View', paths: 'Asset paths', dependencies: 'Dependency chain', before: 'Before', after: 'After', impact: 'Affected views', unknown: UNKNOWN, note: 'The report describes supplied evidence only. It does not assess conditions at physical locations.', budget: 'Install budget', total: 'Total asset bytes', missing: 'Missing evidence', reference: 'Source terms', notice: 'Attribution notice' }),
  fr: Object.freeze({ title: 'Rapport de diffusion des sources et licences', release: 'Version', status: 'État', blocked: 'Publication bloquée par des renseignements manquants', clear: 'Aucun point bloquant dans les renseignements fournis', sources: 'Sources consignées', assets: 'Fichiers inclus', views: 'Vues publiées', findings: 'Points à examiner', changes: 'Changements entre versions', empty: 'Aucun point à signaler', source: 'Source', licence: 'Licence', dataset: 'Données en date du', acquired: 'Date d’acquisition', terms: 'Conditions consultées le', permission: 'Permission', tier: 'Niveau de preuve', view: 'Vue', paths: 'Chemins des fichiers', dependencies: 'Chaîne de dépendances', before: 'Avant', after: 'Après', impact: 'Vues touchées', unknown: UNKNOWN, note: 'Ce rapport décrit les renseignements fournis. Il n’évalue pas les conditions des lieux.', budget: 'Budget d’installation', total: 'Octets des fichiers', missing: 'Renseignements manquants', reference: 'Conditions de la source', notice: 'Mention de source' }),
});
const label = (locale, key) => REPORT_MESSAGES[locale === 'fr' ? 'fr' : 'en'][key];
const colon = locale => locale === 'fr' ? '\u00a0: ' : ': ';
export const escapeHtml = value => String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
export function formatField(locale, key, value) { return `${label(locale, key)}${colon(locale)}${String(value)}`; }
export function reportData(manifest, audit, comparison = null) {
  return {
    schema: 'attribution-distribution-report/1', releaseId: manifest.releaseId,
    blocked: audit.blocked || Boolean(comparison?.blocked),
    totals: { sources: manifest.sources.length, assets: manifest.assets.length, views: manifest.views.length, installBytes: audit.installBytes, budgetBytes: audit.budgetBytes },
    sources: manifest.sources, views: manifest.views, assets: manifest.assets,
    findings: audit.findings, matrix: audit.matrix,
    comparison: comparison ? { blocked: comparison.blocked, beforeId: comparison.beforeId, changes: comparison.changes, newlyBlocking: comparison.newlyBlocking, resolved: comparison.resolved, impacts: impactSummary(comparison) } : null,
  };
}
export function renderDistributionJson(manifest, audit, comparison = null) { return `${JSON.stringify(reportData(manifest, audit, comparison), null, 2)}\n`; }
export function renderDistributionText(manifest, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = REPORT_MESSAGES[lang];
  const lines = [t.title, formatField(lang, 'release', manifest.releaseId), formatField(lang, 'status', audit.blocked || comparison?.blocked ? t.blocked : t.clear), formatField(lang, 'total', audit.installBytes), formatField(lang, 'budget', audit.budgetBytes), '', t.note, '', t.sources];
  for (const source of manifest.sources) {
    lines.push('', `## ${source.name} (${source.id})`, formatField(lang, 'source', source.sourceUrl), formatField(lang, 'licence', `${source.licenceName} — ${source.licenceUrl}`), formatField(lang, 'permission', source.permission), formatField(lang, 'tier', source.tier), formatField(lang, 'dataset', source.datasetDate), formatField(lang, 'acquired', source.acquiredDate), formatField(lang, 'terms', source.termsDate), formatField(lang, 'notice', source.notice));
  }
  lines.push('', t.views);
  for (const row of audit.matrix) {
    lines.push('', `## ${row.viewId} (${row.locale})`, formatField(lang, 'paths', row.assetIds.join(', ') || UNKNOWN), formatField(lang, 'source', row.sources.map(x => x.id).join(', ') || UNKNOWN));
  }
  lines.push('', t.findings);
  if (!audit.findings.length) lines.push(t.empty);
  for (const f of audit.findings) lines.push(`[${f.level}] ${f.code} — ${f.path} — ${f.detail}`);
  if (comparison) {
    lines.push('', t.changes);
    if (!comparison.changes.length) lines.push(t.empty);
    for (const change of comparison.changes) lines.push(`[${change.severity}] ${change.kind}/${change.id}/${change.field} — ${t.before}${colon(lang)}${change.before} — ${t.after}${colon(lang)}${change.after} — ${t.impact}${colon(lang)}${change.affectedViews.join(', ') || UNKNOWN}`);
  }
  return `${lines.join('\n')}\n`;
}
function htmlList(items, render, empty) { return items.length ? `<ul>${items.map(item => `<li>${render(item)}</li>`).join('')}</ul>` : `<p>${escapeHtml(empty)}</p>`; }
export function renderDistributionHtml(manifest, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = REPORT_MESSAGES[lang];
  const field = (key, value) => `<dt>${escapeHtml(label(lang, key))}${lang === 'fr' ? '\u00a0' : ''}:</dt><dd>${escapeHtml(value)}</dd>`;
  const sources = manifest.sources.map(source => `<article><h3>${escapeHtml(source.name)}</h3><dl>${field('source', source.sourceUrl)}${field('licence', `${source.licenceName} — ${source.licenceUrl}`)}${field('permission', source.permission)}${field('tier', source.tier)}${field('dataset', source.datasetDate)}${field('acquired', source.acquiredDate)}${field('terms', source.termsDate)}${field('notice', source.notice)}</dl></article>`).join('');
  const views = htmlList(audit.matrix, row => `<strong>${escapeHtml(row.viewId)} (${escapeHtml(row.locale)})</strong><p>${escapeHtml(row.path)}</p><p>${escapeHtml(row.assetIds.join(', ') || UNKNOWN)}</p>`, t.empty);
  const findings = htmlList(audit.findings, f => `<strong>${escapeHtml(f.code)}</strong> (${escapeHtml(f.level)}) — ${escapeHtml(f.path)} — ${escapeHtml(f.detail)}`, t.empty);
  const changes = comparison ? `<section aria-labelledby="changes-title"><h2 id="changes-title">${escapeHtml(t.changes)}</h2>${htmlList(comparison.changes, c => `<strong>${escapeHtml(c.kind)} / ${escapeHtml(c.field)}</strong> (${escapeHtml(c.severity)}) — ${escapeHtml(c.id)} — ${escapeHtml(c.before)} → ${escapeHtml(c.after)}<p>${escapeHtml(c.affectedViews.join(', ') || UNKNOWN)}</p>`, t.empty)}</section>` : '';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; img-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"><title>${escapeHtml(t.title)}</title><style>:root{color-scheme:light dark}html{font:100%/1.55 system-ui,sans-serif}body{max-width:80rem;margin:auto;padding:1rem;background:Canvas;color:CanvasText}h1,h2,h3{line-height:1.25}section,article{margin-block:1rem;padding:1rem;border:1px solid GrayText}dl{display:grid;grid-template-columns:minmax(10rem,1fr) minmax(0,3fr);gap:.4rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}a{display:inline-flex;min-width:44px;min-height:44px;align-items:center}:focus-visible{outline:3px solid Highlight;outline-offset:3px}.skip{position:absolute;top:-6rem}.skip:focus{top:0}@media(max-width:40rem){dl{display:block}dd{margin-bottom:.6rem}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{section,article{break-inside:avoid}}</style></head><body><a class="skip" href="#main">${lang === 'fr' ? 'Aller au contenu principal' : 'Skip to main content'}</a><header><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(t.note)}</p></header><main id="main"><p>${escapeHtml(formatField(lang, 'release', manifest.releaseId))}</p><p>${escapeHtml(audit.blocked || comparison?.blocked ? t.blocked : t.clear)}</p><p>${escapeHtml(formatField(lang, 'total', audit.installBytes))}</p><p>${escapeHtml(formatField(lang, 'budget', audit.budgetBytes))}</p><section aria-labelledby="sources-title"><h2 id="sources-title">${escapeHtml(t.sources)}</h2>${sources}</section><section aria-labelledby="views-title"><h2 id="views-title">${escapeHtml(t.views)}</h2>${views}</section><section aria-labelledby="findings-title"><h2 id="findings-title">${escapeHtml(t.findings)}</h2>${findings}</section>${changes}</main></body></html>\n`;
}
export function renderDistributionReport(manifest, audit, locale = 'en', comparison = null) {
  return { text: renderDistributionText(manifest, audit, locale, comparison), html: renderDistributionHtml(manifest, audit, locale, comparison), json: renderDistributionJson(manifest, audit, comparison) };
}
