/** Bilingual, standalone output of recorded obligations; no external resources. */
import { buildObligationChecklist } from './obligation-audit.mjs';
export const OBLIGATION_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Attribution placement review', subtitle: 'Local source and notice evidence', release: 'Release', status: 'Status', blocked: 'Publication blocked by missing evidence', clear: 'No blocking findings in the submitted register', sources: 'Sources', pages: 'Pages', placements: 'Notice placements', witnesses: 'Evidence records', findings: 'Audit findings', changes: 'Changes since earlier register', actions: 'Open actions', none: 'None', source: 'Source', licence: 'Licence', terms: 'Terms reviewed', dataset: 'Dataset as of', acquired: 'Acquired', permission: 'Permission', tier: 'Evidence tier', notice: 'Notice', visible: 'Display state', route: 'Page route', language: 'Language', difference: 'Changed field', before: 'Earlier', after: 'Current', unknown: 'UNKNOWN', disclaimer: 'The report describes submitted records. It does not assess actual access conditions or confer permission to use a dataset.', skip: 'Skip to report', kind: 'Type', context: 'Location', linked: 'Linked pages', offline: 'Offline', witness: 'Evidence reference', count: 'Count', print: 'Print', statusInfo: 'The release gate reads only supplied evidence.',
  }),
  fr: Object.freeze({
    title: 'Examen des mentions de source', subtitle: 'Renseignements locaux sur les sources et les mentions', release: 'Version', status: 'État', blocked: 'Publication bloquée en raison de renseignements manquants', clear: 'Aucun point bloquant dans le registre fourni', sources: 'Sources', pages: 'Pages', placements: 'Emplacements des mentions', witnesses: 'Pièces justificatives', findings: 'Points à examiner', changes: 'Changements depuis le registre précédent', actions: 'Actions à traiter', none: 'Aucun', source: 'Source', licence: 'Licence', terms: 'Conditions consultées le', dataset: 'Données en date du', acquired: 'Date d’acquisition', permission: 'Permission', tier: 'Niveau des renseignements', notice: 'Mention', visible: 'État d’affichage', route: 'Adresse de la page', language: 'Langue', difference: 'Champ modifié', before: 'Avant', after: 'Après', unknown: 'UNKNOWN', disclaimer: 'Le rapport décrit les renseignements fournis. Il n’évalue pas les conditions réelles d’accès et n’accorde aucune permission d’utiliser les données.', skip: 'Aller au rapport', kind: 'Type', context: 'Emplacement', linked: 'Pages liées', offline: 'Hors ligne', witness: 'Pièce justificative', count: 'Nombre', print: 'Imprimer', statusInfo: 'Le contrôle de publication utilise uniquement les renseignements fournis.',
  }),
});
export function escapeObligationHtml(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function label(locale, key) { return OBLIGATION_COPY[locale === 'fr' ? 'fr' : 'en'][key]; }
export function obligationPair(locale, key, value) {
  const separator = locale === 'fr' ? '\u00a0: ' : ': ';
  return `${label(locale, key)}${separator}${value}`;
}
function textIssues(lines, issues, locale) {
  lines.push('', label(locale, 'findings'));
  if (issues.length === 0) lines.push(label(locale, 'none'));
  for (const item of issues) lines.push(`${item.level.toUpperCase()} | ${item.code} | ${item.path} | ${item.detail}`);
}
export function renderObligationText(register, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = OBLIGATION_COPY[lang];
  const lines = [t.title, '', obligationPair(lang, 'release', register.releaseId), obligationPair(lang, 'status', audit.blocked || comparison?.blocked ? t.blocked : t.clear), obligationPair(lang, 'sources', audit.counts.sources), obligationPair(lang, 'pages', audit.counts.pages), obligationPair(lang, 'placements', audit.counts.placements), obligationPair(lang, 'witnesses', audit.counts.witnesses), '', t.disclaimer];
  for (const source of register.sources) {
    lines.push('', `## ${source.id} — ${source.title}`, obligationPair(lang, 'source', source.sourceUrl), obligationPair(lang, 'licence', `${source.licenceName} (${source.licenceId})`), obligationPair(lang, 'terms', source.termsReviewedOn), obligationPair(lang, 'dataset', source.datasetAsOf), obligationPair(lang, 'acquired', source.acquiredOn), obligationPair(lang, 'permission', source.permission), obligationPair(lang, 'tier', source.tier), obligationPair(lang, 'notice', source.attribution));
  }
  for (const page of register.pages) {
    lines.push('', `## ${page.id}`, obligationPair(lang, 'route', page.path), obligationPair(lang, 'language', page.locale), obligationPair(lang, 'offline', page.offline), obligationPair(lang, 'linked', page.sourceIds.join(', ') || t.none));
  }
  for (const placement of register.placements) {
    lines.push('', `## ${placement.id}`, obligationPair(lang, 'kind', placement.kind), obligationPair(lang, 'context', `${placement.pageId} / ${placement.sourceId}`), obligationPair(lang, 'notice', placement.notice), obligationPair(lang, 'visible', placement.visibility), obligationPair(lang, 'witness', placement.witnessIds.join(', ') || t.none));
  }
  textIssues(lines, audit.findings, lang);
  const checklist = buildObligationChecklist(register, audit);
  lines.push('', t.actions);
  if (!checklist.length) lines.push(t.none);
  for (const item of checklist) lines.push(`${item.code} | ${item.context} | ${item.detail}`);
  if (comparison) {
    lines.push('', t.changes);
    if (!comparison.changes.length) lines.push(t.none);
    for (const item of comparison.changes) {
      lines.push(`${item.severity.toUpperCase()} | ${item.kind} | ${item.recordId} | ${item.field} | ${item.before} -> ${item.after}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
function htmlRow(name, value) {
  return `<dt>${escapeObligationHtml(name)}</dt><dd>${escapeObligationHtml(value)}</dd>`;
}
function itemList(values, render) {
  if (!values.length) return '<p class="empty">UNKNOWN</p>';
  return `<ul>${values.map(x => `<li>${render(x)}</li>`).join('')}</ul>`;
}
export function renderObligationHtml(register, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = OBLIGATION_COPY[lang];
  const E = escapeObligationHtml;
  const heading = (name, value) => `<h2>${E(name)}</h2>${value}`;
  const stats = ['sources', 'pages', 'placements', 'witnesses'].map(k => htmlRow(t[k], audit.counts[k])).join('');
  const sources = itemList(register.sources, source => `<article><h3>${E(source.title)} (${E(source.id)})</h3><dl>${htmlRow(t.source, source.sourceUrl)}${htmlRow(t.licence, source.licenceName)}${htmlRow(t.permission, source.permission)}${htmlRow(t.terms, source.termsReviewedOn)}${htmlRow(t.dataset, source.datasetAsOf)}${htmlRow(t.acquired, source.acquiredOn)}${htmlRow(t.tier, source.tier)}</dl><pre>${E(source.attribution)}</pre></article>`);
  const pages = itemList(register.pages, page => `<article><h3>${E(page.id)}</h3><dl>${htmlRow(t.route, page.path)}${htmlRow(t.language, page.locale)}${htmlRow(t.offline, page.offline)}${htmlRow(t.linked, page.sourceIds.join(', ') || t.unknown)}</dl></article>`);
  const placements = itemList(register.placements, x => `<article><h3>${E(x.id)}</h3><dl>${htmlRow(t.context, `${x.pageId} / ${x.sourceId}`)}${htmlRow(t.kind, x.kind)}${htmlRow(t.visible, x.visibility)}${htmlRow(t.witness, x.witnessIds.join(', ') || t.unknown)}</dl><pre>${E(x.notice)}</pre></article>`);
  const findings = itemList(audit.findings, x => `<strong>${E(x.level)} | ${E(x.code)}</strong> <span>${E(x.path)}</span><p>${E(x.detail)}</p>`);
  const actions = itemList(buildObligationChecklist(register, audit), x => `<strong>${E(x.code)}</strong> <span>${E(x.context)}</span><p>${E(x.detail)}</p>`);
  const changes = comparison ? heading(t.changes, itemList(comparison.changes, x => `<strong>${E(x.severity)} | ${E(x.kind)}</strong> <span>${E(x.recordId)} / ${E(x.field)}</span><p>${E(x.before)} → ${E(x.after)}</p>`)) : '';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; object-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"><title>${E(t.title)}</title><style>:root{color-scheme:light dark}body{font:1rem/1.6 system-ui,sans-serif;max-width:76rem;margin:auto;padding:1rem}h1,h2,h3{line-height:1.25}a{min-height:44px;min-width:44px;display:inline-flex;align-items:center}a:focus-visible{outline:3px solid Highlight;outline-offset:3px}li{margin:.8rem 0}article{border:1px solid GrayText;padding:1rem;margin:.5rem}dl{display:grid;grid-template-columns:minmax(10rem,1fr) minmax(0,2fr)}dt{font-weight:bold}dd{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}ul{padding-left:1.5rem}@media(max-width:42rem){dl{display:block}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{a.skip{display:none}}</style></head><body><a class="skip" href="#main">${E(t.skip)}</a><header><h1>${E(t.title)}</h1><p>${E(t.subtitle)}</p></header><main id="main"><p role="status">${E(audit.blocked || comparison?.blocked ? t.blocked : t.clear)}</p><dl>${htmlRow(t.release, register.releaseId)}${stats}</dl><p>${E(t.disclaimer)}</p>${heading(t.sources, sources)}${heading(t.pages, pages)}${heading(t.placements, placements)}${heading(t.findings, findings)}${heading(t.actions, actions)}${changes}</main></body></html>\n`;
}
export function renderObligationJson(register, audit, comparison = null) {
  return `${JSON.stringify({ schema: 'attribution-obligation-report/1', releaseId: register.releaseId, audit, checklist: buildObligationChecklist(register, audit), comparison }, null, 2)}\n`;
}
export function renderObligationReport(register, audit, locale = 'en', comparison = null) {
  return {
    text: renderObligationText(register, audit, locale, comparison),
    html: renderObligationHtml(register, audit, locale, comparison),
    json: renderObligationJson(register, audit, comparison),
  };
}
