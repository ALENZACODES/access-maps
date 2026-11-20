/** Offline bilingual reports of recorded notice-access observations. */
import { parseAccessReview, UNKNOWN } from './access-review-core.mjs';
import { auditAccessReview, reviewCoverageByTechnique } from './access-review-audit.mjs';

export const ACCESS_REVIEW_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Attribution notice accessibility review',
    description: 'This report describes submitted observations of attribution notices. It does not assess a place, trip or service.',
    release: 'Release', status: 'Review status', blocked: 'Publication blocked by evidence gaps', clear: 'No blocking findings in submitted records',
    sources: 'Source records', surfaces: 'Publication surfaces', targets: 'Notice targets', findings: 'Review findings', changes: 'Changes',
    evidence: 'Evidence', source: 'Source', licence: 'Licence', permission: 'Redistribution permission', date: 'Dataset date',
    acquired: 'Acquired on', terms: 'Terms reviewed on', tier: 'Evidence tier', route: 'Publication route', locale: 'Language',
    offline: 'Offline delivery', notice: 'Notice text', technique: 'Review technique', observation: 'Recorded observation',
    tested: 'Notice examined on', observationDate: 'Observation date', reference: 'Evidence link', target: 'Target dimensions',
    unknown: UNKNOWN, none: 'No findings', links: 'Source and licence links', disclaimer: 'Manual review evidence is not an accessibility certification.',
    navigation: 'Report navigation', skip: 'Skip to main content', summary: 'Summary', included: 'Included', excluded: 'Not included',
    regression: 'Release changes', before: 'Before', after: 'After', noChanges: 'No recorded changes',
    methods: 'Coverage by observation method', reviewed: 'Recorded', passed: 'Pass entries', failed: 'Fail entries',
    note: 'Observation note', visible: 'Visible', keyboard: 'Keyboard access', focus: 'Visible focus', screenReader: 'Screen-reader label',
  }),
  fr: Object.freeze({
    title: 'Examen de l’accessibilité des mentions de sources',
    description: 'Ce rapport décrit les observations fournies sur les mentions de sources. Il n’évalue pas un lieu, un trajet ou un service.',
    release: 'Version', status: 'État de l’examen', blocked: 'Publication bloquée par des renseignements manquants', clear: 'Aucun point bloquant dans les renseignements fournis',
    sources: 'Fiches de sources', surfaces: 'Vues publiées', targets: 'Cibles des mentions', findings: 'Points à examiner', changes: 'Changements',
    evidence: 'Renseignements', source: 'Source', licence: 'Licence', permission: 'Permission de redistribution', date: 'Données en date du',
    acquired: 'Date d’acquisition', terms: 'Conditions consultées le', tier: 'Niveau des renseignements', route: 'Chemin de publication', locale: 'Langue',
    offline: 'Disponibilité hors connexion', notice: 'Texte de la mention', technique: 'Méthode d’examen', observation: 'Observation consignée',
    tested: 'Mention examinée le', observationDate: 'Date de l’observation', reference: 'Lien vers les renseignements', target: 'Dimensions de la cible',
    unknown: UNKNOWN, none: 'Aucun point à signaler', links: 'Liens vers les sources et les licences', disclaimer: 'Les observations manuelles ne constituent pas une attestation d’accessibilité.',
    navigation: 'Navigation du rapport', skip: 'Aller au contenu principal', summary: 'Résumé', included: 'Inclus', excluded: 'Non inclus',
    regression: 'Changements entre les versions', before: 'Avant', after: 'Après', noChanges: 'Aucun changement consigné',
    methods: 'Couverture par méthode d’observation', reviewed: 'Consignées', passed: 'Observations positives', failed: 'Observations négatives',
    note: 'Note d’observation', visible: 'Visible', keyboard: 'Accès au clavier', focus: 'Focus visible', screenReader: 'Libellé pour lecteur d’écran',
  }),
});
export function reviewLabel(locale, key) {
  return ACCESS_REVIEW_COPY[locale === 'fr' ? 'fr' : 'en'][key];
}
export function escapeReviewHtml(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function colon(locale) { return locale === 'fr' ? '\u00a0: ' : ': '; }
function rowText(locale, label, value) { return `${label}${colon(locale)}${value}`; }
function stable(value) { return value === null || value === undefined || value === '' ? UNKNOWN : String(value); }
export function renderAccessReviewText(input, auditInput = null, locale = 'en', comparison = null) {
  const review = parseAccessReview(input);
  const audit = auditInput ?? auditAccessReview(review);
  const lang = locale === 'fr' ? 'fr' : 'en';
  const c = ACCESS_REVIEW_COPY[lang];
  const lines = [c.title, '', c.description, '', rowText(lang, c.release, review.releaseId), rowText(lang, c.status, audit.blocked || comparison?.blocked ? c.blocked : c.clear), ''];
  lines.push(`## ${c.summary}`, rowText(lang, c.sources, review.sources.length), rowText(lang, c.surfaces, review.surfaces.length), rowText(lang, c.targets, audit.reviewedTargets), '');
  lines.push(`## ${c.methods}`);
  for (const item of reviewCoverageByTechnique(review)) lines.push(`${item.technique}${colon(lang)}${c.reviewed} ${item.recordedCount}/${item.targetCount}, ${c.passed} ${item.passCount}, ${c.failed} ${item.failCount}, UNKNOWN ${item.unknownCount}`);
  lines.push('', `## ${c.sources}`);
  for (const source of review.sources) {
    lines.push(`### ${source.id}`);
    for (const [key, value] of [
      [c.source, source.provider], [c.licence, source.licence], [c.permission, source.permission],
      [c.tier, source.tier], [c.date, source.datasetDate], [c.acquired, source.acquiredDate],
      [c.terms, source.termsDate], ['Source URL', source.sourceUrl], ['Licence URL', source.licenceUrl],
      [c.notice, source.notice], [c.status, source.status],
    ]) lines.push(rowText(lang, key, stable(value)));
    lines.push('');
  }
  lines.push(`## ${c.surfaces}`);
  for (const surface of review.surfaces) {
    lines.push(`### ${surface.id}`, rowText(lang, c.route, surface.route), rowText(lang, c.locale, surface.locale), rowText(lang, c.offline, surface.offline), rowText(lang, c.sources, surface.sourceIds.join(', ') || UNKNOWN), rowText(lang, c.status, surface.status));
    for (const target of surface.targets) {
      lines.push(`- ${target.id}: ${target.kind} (${target.sourceId})`, rowText(lang, c.notice, target.text), rowText(lang, c.visible, target.visible), rowText(lang, c.keyboard, target.keyboard), rowText(lang, c.focus, target.focusVisible), rowText(lang, c.screenReader, target.screenReader), rowText(lang, c.target, `${target.widthPx} × ${target.heightPx}`), rowText(lang, c.tested, target.testedDate), rowText(lang, c.reference, target.evidenceUrl));
      const separator = lang === 'fr' ? '\u202f; ' : '; ';
      for (const observation of target.observations) lines.push(`  ${observation.technique}${colon(lang)}${observation.result}${separator}${c.observationDate} ${observation.date}${separator}${c.reference} ${observation.referenceUrl}${separator}${c.note} ${observation.note || UNKNOWN}`);
    }
    lines.push('');
  }
  lines.push(`## ${c.findings}`);
  if (!audit.findings.length) lines.push(c.none);
  for (const finding of audit.findings) lines.push(`[${finding.level}] ${finding.code}${colon(lang)}${finding.path} — ${stable(finding.detail)}`);
  if (comparison) {
    lines.push('', `## ${c.regression}`);
    if (!comparison.changes.length) lines.push(c.noChanges);
    for (const change of comparison.changes) lines.push(`[${change.level}] ${change.kind}${colon(lang)}${change.path}; ${c.before} ${change.before}; ${c.after} ${change.after}`);
  }
  lines.push('', c.disclaimer);
  return `${lines.join('\n')}\n`;
}
function definition(locale, key, value) {
  return `<dt>${escapeReviewHtml(key)}</dt><dd>${escapeReviewHtml(stable(value))}</dd>`;
}
function safeLink(url, label) {
  if (url === UNKNOWN) return `<span>${UNKNOWN}</span>`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return `<span>${UNKNOWN}</span>`;
    return `<a href="${escapeReviewHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeReviewHtml(label)}</a>`;
  } catch { return `<span>${UNKNOWN}</span>`; }
}
export function renderAccessReviewHtml(input, auditInput = null, locale = 'en', comparison = null) {
  const review = parseAccessReview(input);
  const audit = auditInput ?? auditAccessReview(review);
  const lang = locale === 'fr' ? 'fr' : 'en';
  const c = ACCESS_REVIEW_COPY[lang];
  const sources = review.sources.map(source => `<article><h3>${escapeReviewHtml(source.id)}</h3><dl>${definition(lang, c.source, source.provider)}${definition(lang, c.licence, source.licence)}${definition(lang, c.permission, source.permission)}${definition(lang, c.tier, source.tier)}${definition(lang, c.date, source.datasetDate)}${definition(lang, c.acquired, source.acquiredDate)}${definition(lang, c.terms, source.termsDate)}</dl><p>${safeLink(source.sourceUrl, c.source)} · ${safeLink(source.licenceUrl, c.licence)}</p><pre>${escapeReviewHtml(source.notice || UNKNOWN)}</pre></article>`).join('');
  const surfaces = review.surfaces.map(surface => {
    const targets = surface.targets.map(target => {
      const observations = target.observations.map(o => `<li><strong>${escapeReviewHtml(o.technique)}</strong>${escapeReviewHtml(colon(lang))}${escapeReviewHtml(o.result)} (${escapeReviewHtml(o.date)}) — ${safeLink(o.referenceUrl, c.reference)}<p>${escapeReviewHtml(o.note || UNKNOWN)}</p></li>`).join('');
      return `<article><h4>${escapeReviewHtml(target.id)} — ${escapeReviewHtml(target.kind)}</h4><pre>${escapeReviewHtml(target.text || UNKNOWN)}</pre><dl>${definition(lang, c.source, target.sourceId)}${definition(lang, c.visible, target.visible)}${definition(lang, c.keyboard, target.keyboard)}${definition(lang, c.focus, target.focusVisible)}${definition(lang, c.screenReader, target.screenReader)}${definition(lang, c.target, `${target.widthPx} × ${target.heightPx}`)}${definition(lang, c.tested, target.testedDate)}</dl><ul>${observations}</ul></article>`;
    }).join('');
    return `<section><h3>${escapeReviewHtml(surface.id)}</h3><dl>${definition(lang, c.route, surface.route)}${definition(lang, c.locale, surface.locale)}${definition(lang, c.offline, surface.offline)}${definition(lang, c.status, surface.status)}</dl>${targets}</section>`;
  }).join('');
  const findings = audit.findings.map(f => `<li><strong>${escapeReviewHtml(f.code)}</strong> (${escapeReviewHtml(f.level)}) — ${escapeReviewHtml(f.path)}${escapeReviewHtml(colon(lang))}${escapeReviewHtml(f.detail)}</li>`).join('') || `<li>${escapeReviewHtml(c.none)}</li>`;
  const changes = comparison ? `<section id="changes"><h2>${escapeReviewHtml(c.regression)}</h2><ul>${comparison.changes.map(change => `<li>${escapeReviewHtml(change.kind)} (${escapeReviewHtml(change.level)}) ${escapeReviewHtml(change.path)}${escapeReviewHtml(colon(lang))}${escapeReviewHtml(change.before)} → ${escapeReviewHtml(change.after)}</li>`).join('') || `<li>${escapeReviewHtml(c.noChanges)}</li>`}</ul></section>` : '';
  const coverage = reviewCoverageByTechnique(review).map(item => `<li>${escapeReviewHtml(item.technique)}${escapeReviewHtml(colon(lang))}${item.passCount} / ${item.targetCount}</li>`).join('');
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeReviewHtml(c.title)}</title><style>:root{color-scheme:light dark}body{font:1rem/1.5 system-ui,sans-serif;max-width:76rem;margin:auto;padding:1rem;background:Canvas;color:CanvasText}h1,h2,h3,h4{line-height:1.3}a{min-height:44px;min-width:44px;display:inline-flex;align-items:center;overflow-wrap:anywhere}a:focus-visible{outline:3px solid Highlight;outline-offset:3px}article,section{border:1px solid GrayText;border-radius:.5rem;padding:1rem;margin:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(9rem,1fr) 2fr;gap:.3rem}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}.skip{position:absolute;top:-8rem}.skip:focus{top:0;background:Canvas;padding:.5rem}@media(max-width:45rem){dl{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition-duration:0s!important}}@media print{nav,.skip{display:none}}</style></head><body><a class="skip" href="#main">${escapeReviewHtml(c.skip)}</a><header><h1>${escapeReviewHtml(c.title)}</h1><p>${escapeReviewHtml(c.description)}</p></header><nav aria-label="${escapeReviewHtml(c.navigation)}"><a href="#summary">${escapeReviewHtml(c.summary)}</a> <a href="#sources">${escapeReviewHtml(c.sources)}</a> <a href="#surfaces">${escapeReviewHtml(c.surfaces)}</a> <a href="#findings">${escapeReviewHtml(c.findings)}</a></nav><main id="main"><section id="summary"><h2>${escapeReviewHtml(c.summary)}</h2><p>${escapeReviewHtml(c.release)}${escapeReviewHtml(colon(lang))}${escapeReviewHtml(review.releaseId)}</p><p role="status">${escapeReviewHtml(audit.blocked || comparison?.blocked ? c.blocked : c.clear)}</p><ul>${coverage}</ul></section><section id="sources"><h2>${escapeReviewHtml(c.sources)}</h2>${sources}</section><section id="surfaces"><h2>${escapeReviewHtml(c.surfaces)}</h2>${surfaces}</section><section id="findings"><h2>${escapeReviewHtml(c.findings)}</h2><ul>${findings}</ul></section>${changes}</main><footer><p>${escapeReviewHtml(c.disclaimer)}</p></footer></body></html>\n`;
}
export function renderAccessReviewJson(input, auditInput = null, comparison = null) {
  const review = parseAccessReview(input);
  const audit = auditInput ?? auditAccessReview(review);
  return `${JSON.stringify({ schema: 'attribution-access-review-report/1', releaseId: review.releaseId, sourceCount: review.sources.length, surfaceCount: review.surfaces.length, blocked: audit.blocked || Boolean(comparison?.blocked), findings: audit.findings, coverage: reviewCoverageByTechnique(review), changes: comparison?.changes ?? [] }, null, 2)}\n`;
}
export function buildAccessReviewReport(input, locale = 'en', comparison = null, options = {}) {
  const review = parseAccessReview(input);
  const audit = auditAccessReview(review, options);
  return { locale: locale === 'fr' ? 'fr' : 'en', audit, text: renderAccessReviewText(review, audit, locale, comparison), html: renderAccessReviewHtml(review, audit, locale, comparison), json: renderAccessReviewJson(review, audit, comparison) };
}
