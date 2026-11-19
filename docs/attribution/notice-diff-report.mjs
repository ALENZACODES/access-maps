/** EN/FR reports, including a self-contained offline HTML document. */
export const COPY = Object.freeze({
  en: Object.freeze({
    title: 'Attribution notice change report', release: 'Release', status: 'Status',
    blocked: 'Publication blocked by supplied evidence', clear: 'No blocking findings in the supplied records',
    sources: 'Sources', notices: 'Notices', surfaces: 'Publication surfaces',
    findings: 'Findings', changes: 'Changes since earlier release',
    noFindings: 'No findings', noChanges: 'No changes', path: 'Record path', code: 'Code',
    detail: 'Detail', level: 'Level', source: 'Source', licence: 'Licence',
    sourceUrl: 'Source URL', licenceUrl: 'Licence URL', permission: 'Permission',
    acquired: 'Acquired', datasetDate: 'Dataset date', termsDate: 'Terms reviewed',
    tier: 'Evidence tier', recorded: 'Notice recorded', visible: 'Visible', nearMap: 'Near map',
    route: 'Route', locale: 'Language', offline: 'Offline', keyboard: 'Keyboard',
    reader: 'Screen reader labels', target: 'Minimum target in pixels',
    from: 'Earlier value', to: 'Current value', affected: 'Affected surfaces',
    sourceSection: 'Source evidence', noticeSection: 'Displayed notices',
    surfaceSection: 'Surface evidence', comparison: 'Release comparison',
    skip: 'Skip to main content', note: 'The report describes supplied evidence, not current conditions at any location.',
    dateUnknown: 'UNKNOWN', noSources: 'No sources supplied', noNotices: 'No notices supplied',
    noSurfaces: 'No surfaces supplied', all: 'All findings', blocks: 'Blocking findings',
    nonblocks: 'Other findings', print: 'Print report', count: 'Count',
  }),
  fr: Object.freeze({
    title: 'Rapport sur les changements des mentions de source', release: 'Version', status: 'État',
    blocked: 'Publication bloquée par les renseignements fournis', clear: 'Aucun élément bloquant dans les renseignements fournis',
    sources: 'Sources', notices: 'Mentions', surfaces: 'Vues publiées',
    findings: 'Points à examiner', changes: 'Changements depuis la version précédente',
    noFindings: 'Aucun point à signaler', noChanges: 'Aucun changement', path: 'Chemin du dossier', code: 'Code',
    detail: 'Détail', level: 'Niveau', source: 'Source', licence: 'Licence',
    sourceUrl: 'Adresse de la source', licenceUrl: 'Adresse de la licence', permission: 'Permission',
    acquired: 'Date d’acquisition', datasetDate: 'Données en date du', termsDate: 'Conditions consultées le',
    tier: 'Niveau des renseignements', recorded: 'Mention consignée le', visible: 'Visible', nearMap: 'Près de la carte',
    route: 'Page', locale: 'Langue', offline: 'Hors connexion', keyboard: 'Clavier',
    reader: 'Libellés pour lecteurs d’écran', target: 'Taille minimale des cibles en pixels',
    from: 'Valeur précédente', to: 'Valeur actuelle', affected: 'Vues concernées',
    sourceSection: 'Renseignements sur les sources', noticeSection: 'Mentions affichées',
    surfaceSection: 'Renseignements sur les vues', comparison: 'Comparaison des versions',
    skip: 'Aller au contenu principal', note: 'Ce rapport présente les renseignements fournis, sans décrire les conditions actuelles des lieux.',
    dateUnknown: 'UNKNOWN', noSources: 'Aucune source fournie', noNotices: 'Aucune mention fournie',
    noSurfaces: 'Aucune vue fournie', all: 'Tous les points', blocks: 'Éléments bloquants',
    nonblocks: 'Autres points', print: 'Imprimer le rapport', count: 'Nombre',
  }),
});
export function reportLocale(value) { return value === 'fr' ? 'fr' : 'en'; }
export function safeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function label(locale, key) { return COPY[reportLocale(locale)][key] ?? key; }
function separator(locale) { return reportLocale(locale) === 'fr' ? '\u00a0: ' : ': '; }
function severity(locale, level) {
  if (locale === 'en') return level;
  if (level === 'block') return 'Bloquant';
  if (level === 'attention' || level === 'review') return 'À examiner';
  return 'Information';
}
function field(locale, title, value) { return `${label(locale, title)}${separator(locale)}${value}`; }
function values(locale, entries) { return entries.map(([key, value]) => field(locale, key, value)); }
function sourceLines(locale, record) {
  return values(locale, [
    ['source', record.id], ['licence', record.licenceName], ['sourceUrl', record.sourceUrl],
    ['licenceUrl', record.licenceUrl], ['permission', record.permission], ['tier', record.tier],
    ['acquired', record.acquiredDate], ['datasetDate', record.datasetDate], ['termsDate', record.termsDate],
  ]);
}
function noticeLines(locale, record) {
  return values(locale, [
    ['code', record.id], ['source', record.sourceId], ['locale', record.locale],
    ['visible', record.visible], ['nearMap', record.nearMap], ['recorded', record.recordedDate],
  ]).concat(record.text);
}
function surfaceLines(locale, record) {
  return values(locale, [
    ['route', record.route], ['locale', record.locale], ['sources', record.sourceIds.join(', ')],
    ['notices', record.noticeIds.join(', ')], ['offline', record.offline], ['keyboard', record.keyboard],
    ['reader', record.screenReader], ['target', record.targetPx],
  ]);
}
export function renderNoticeText(release, audit, locale = 'en', comparison = null) {
  const lang = reportLocale(locale);
  const lines = [label(lang, 'title'), '', field(lang, 'release', release.releaseId),
    field(lang, 'status', audit.blocked || comparison?.blocked ? label(lang, 'blocked') : label(lang, 'clear')),
    field(lang, 'sources', release.sources.length), field(lang, 'notices', release.notices.length),
    field(lang, 'surfaces', release.surfaces.length), '', label(lang, 'note'), '', label(lang, 'findings')];
  for (const item of audit.findings) lines.push(`${severity(lang, item.level)} [${item.code}] ${item.path}${separator(lang)}${item.detail}`);
  if (!audit.findings.length) lines.push(label(lang, 'noFindings'));
  if (comparison) {
    lines.push('', label(lang, 'changes'));
    for (const c of comparison.changes) {
      lines.push(`${severity(lang, c.severity)} [${c.kind}] ${c.entity}.${c.field}`, field(lang, 'from', c.before), field(lang, 'to', c.after), field(lang, 'affected', c.affectedSurfaces.join(', ')));
    }
    if (!comparison.changes.length) lines.push(label(lang, 'noChanges'));
  }
  lines.push('', label(lang, 'sourceSection'));
  for (const source of release.sources) lines.push('', ...sourceLines(lang, source));
  if (!release.sources.length) lines.push(label(lang, 'noSources'));
  lines.push('', label(lang, 'noticeSection'));
  for (const notice of release.notices) lines.push('', ...noticeLines(lang, notice));
  if (!release.notices.length) lines.push(label(lang, 'noNotices'));
  lines.push('', label(lang, 'surfaceSection'));
  for (const surface of release.surfaces) lines.push('', ...surfaceLines(lang, surface));
  if (!release.surfaces.length) lines.push(label(lang, 'noSurfaces'));
  return `${lines.join('\n')}\n`;
}
function dl(locale, entries) {
  return `<dl>${entries.map(([key, value]) => `<dt>${safeHtml(label(locale, key))}</dt><dd>${safeHtml(value)}</dd>`).join('')}</dl>`;
}
function sourceHtml(locale, source) {
  return `<article><h3>${safeHtml(source.id)}</h3>${dl(locale, [
    ['licence', source.licenceName], ['sourceUrl', source.sourceUrl], ['licenceUrl', source.licenceUrl],
    ['permission', source.permission], ['tier', source.tier], ['acquired', source.acquiredDate],
    ['datasetDate', source.datasetDate], ['termsDate', source.termsDate],
  ])}</article>`;
}
function noticeHtml(locale, notice) {
  return `<article><h3>${safeHtml(notice.id)}</h3>${dl(locale, [
    ['source', notice.sourceId], ['locale', notice.locale], ['visible', notice.visible],
    ['nearMap', notice.nearMap], ['recorded', notice.recordedDate],
  ])}<pre>${safeHtml(notice.text)}</pre></article>`;
}
function surfaceHtml(locale, surface) {
  return `<article><h3>${safeHtml(surface.id)}</h3>${dl(locale, [
    ['route', surface.route], ['locale', surface.locale], ['sources', surface.sourceIds.join(', ')],
    ['notices', surface.noticeIds.join(', ')], ['offline', surface.offline], ['keyboard', surface.keyboard],
    ['reader', surface.screenReader], ['target', surface.targetPx],
  ])}</article>`;
}
function issueList(locale, items) {
  if (items.length === 0) return `<p>${safeHtml(label(locale, 'noFindings'))}</p>`;
  return `<ol>${items.map(v => `<li><strong>${safeHtml(severity(locale, v.level))} [${safeHtml(v.code)}]</strong><span>${safeHtml(v.path)}</span><p>${safeHtml(v.detail)}</p></li>`).join('')}</ol>`;
}
function changeList(locale, changes) {
  if (!changes.length) return `<p>${safeHtml(label(locale, 'noChanges'))}</p>`;
  return `<ol>${changes.map(c => `<li><h3>${safeHtml(c.kind)} — ${safeHtml(c.entity)} — ${safeHtml(c.field)}</h3>${dl(locale, [
    ['level', severity(locale, c.severity)], ['from', c.before], ['to', c.after],
    ['affected', c.affectedSurfaces.join(', ')],
  ])}</li>`).join('')}</ol>`;
}
export function renderNoticeHtml(release, audit, locale = 'en', comparison = null) {
  const lang = reportLocale(locale);
  const title = safeHtml(label(lang, 'title'));
  const verdict = audit.blocked || comparison?.blocked ? label(lang, 'blocked') : label(lang, 'clear');
  const changes = comparison ? `<section aria-labelledby="changes-title"><h2 id="changes-title">${safeHtml(label(lang, 'changes'))}</h2>${changeList(lang, comparison.changes)}</section>` : '';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; script-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'"><title>${title}</title><style>
:root{color-scheme:light dark}html{font-family:system-ui,sans-serif;line-height:1.6}body{max-width:75rem;margin:auto;padding:1rem;background:Canvas;color:CanvasText}h1,h2,h3{line-height:1.3}main,section,article{display:block}section{margin:1.5rem 0}article{border:1px solid GrayText;padding:1rem;margin:.75rem 0;border-radius:.4rem;overflow-wrap:anywhere}dt{font-weight:700}dd{margin:0 0 .6rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{min-height:44px;min-width:44px;display:inline-flex;align-items:center}:focus-visible{outline:3px solid Highlight;outline-offset:3px}.skip{position:absolute;top:-12rem;background:Canvas;padding:.6rem}.skip:focus{top:0}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media(forced-colors:active){:focus-visible{outline:3px solid Highlight}}
</style></head><body><a href="#main" class="skip">${safeHtml(label(lang, 'skip'))}</a><header><h1>${title}</h1><p>${safeHtml(verdict)}</p><p>${safeHtml(label(lang, 'note'))}</p></header><main id="main"><section aria-labelledby="summary-title"><h2 id="summary-title">${safeHtml(label(lang, 'status'))}</h2>${dl(lang, [['release', release.releaseId], ['sources', release.sources.length], ['notices', release.notices.length], ['surfaces', release.surfaces.length]])}</section><section aria-labelledby="findings-title"><h2 id="findings-title">${safeHtml(label(lang, 'findings'))}</h2>${issueList(lang, audit.findings)}</section>${changes}<section aria-labelledby="sources-title"><h2 id="sources-title">${safeHtml(label(lang, 'sourceSection'))}</h2>${release.sources.map(s => sourceHtml(lang, s)).join('') || `<p>${safeHtml(label(lang, 'noSources'))}</p>`}</section><section aria-labelledby="notices-title"><h2 id="notices-title">${safeHtml(label(lang, 'noticeSection'))}</h2>${release.notices.map(n => noticeHtml(lang, n)).join('') || `<p>${safeHtml(label(lang, 'noNotices'))}</p>`}</section><section aria-labelledby="surfaces-title"><h2 id="surfaces-title">${safeHtml(label(lang, 'surfaceSection'))}</h2>${release.surfaces.map(s => surfaceHtml(lang, s)).join('') || `<p>${safeHtml(label(lang, 'noSurfaces'))}</p>`}</section></main></body></html>\n`;
}
export function renderNoticeJson(release, audit, comparison = null) {
  return `${JSON.stringify({ schema: 'attribution-notice-report/1', release, audit, comparison }, null, 2)}\n`;
}
export function renderNoticeReport(release, audit, locale = 'en', comparison = null) {
  return Object.freeze({ locale: reportLocale(locale), text: renderNoticeText(release, audit, locale, comparison), html: renderNoticeHtml(release, audit, locale, comparison), json: renderNoticeJson(release, audit, comparison) });
}
