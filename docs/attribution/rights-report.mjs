/** Offline and bilingual rights decision reports from supplied records only. */
export const RIGHTS_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Publication rights decision matrix', release: 'Release', status: 'Status',
    blocked: 'Publication blocked by missing rights evidence',
    clear: 'No blocking findings in these records', sources: 'Sources',
    outputs: 'Publication outputs', exceptions: 'Decision notes', findings: 'Audit findings',
    changes: 'Changes since earlier release', noFindings: 'No findings',
    source: 'Source', licence: 'Licence', licenceLink: 'Licence text',
    termsLink: 'Source terms', evidence: 'Evidence', tier: 'Evidence tier',
    permission: 'Permission', redistribution: 'Redistribution',
    derivative: 'Derivative use', reviewed: 'Terms reviewed',
    acquired: 'Acquired', dataset: 'Dataset date', unknown: 'UNKNOWN',
    route: 'Route', language: 'Language', target: 'Minimum target',
    distribution: 'Delivery', transformation: 'Transformation',
    attribution: 'Attribution', sourceIds: 'Included source IDs',
    affected: 'Affected outputs', before: 'Before', after: 'After',
    disclaimer: 'This report assesses only supplied records. It does not establish licence permissions or physical accessibility.',
    skip: 'Skip to report', details: 'Source details', outputDetail: 'Output details',
    attention: 'Attention items', blocking: 'Blocking findings',
  }),
  fr: Object.freeze({
    title: 'Matrice des droits de publication', release: 'Version', status: 'État',
    blocked: 'Publication bloquée en raison de renseignements manquants sur les droits',
    clear: 'Aucun point bloquant dans les renseignements fournis', sources: 'Sources',
    outputs: 'Sorties de publication', exceptions: 'Notes de décision',
    findings: 'Points relevés', changes: 'Changements depuis la version précédente',
    noFindings: 'Aucun point relevé', source: 'Source', licence: 'Licence',
    licenceLink: 'Texte de la licence', termsLink: 'Conditions de la source',
    evidence: 'Renseignements justificatifs', tier: 'Niveau de preuve',
    permission: 'Permission', redistribution: 'Redistribution',
    derivative: 'Utilisation dérivée', reviewed: 'Conditions consultées le',
    acquired: 'Date d’acquisition', dataset: 'Données en date du', unknown: 'UNKNOWN',
    route: 'Page', language: 'Langue', target: 'Dimension minimale des cibles',
    distribution: 'Diffusion', transformation: 'Transformation',
    attribution: 'Mention de source', sourceIds: 'Identifiants des sources utilisées',
    affected: 'Sorties concernées', before: 'Avant', after: 'Après',
    disclaimer: 'Ce rapport examine uniquement les renseignements fournis. Il n’établit ni les permissions de licence ni l’accessibilité des lieux.',
    skip: 'Aller au rapport', details: 'Détails des sources', outputDetail: 'Détails des sorties',
    attention: 'Points à examiner', blocking: 'Points bloquants',
  }),
});
function copy(locale) { return RIGHTS_COPY[locale === 'fr' ? 'fr' : 'en']; }
function colon(locale) { return locale === 'fr' ? '\u00a0: ' : ': '; }
function print(value) { return value === null || value === undefined ? 'UNKNOWN' : String(value); }
function line(label, value, locale) { return `${label}${colon(locale)}${print(value)}`; }
function escapeHtml(value) {
  return print(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function formatState(value, locale) {
  if (value === 'UNKNOWN') return value;
  if (locale === 'fr') return value === 'YES' ? 'OUI' : value === 'NO' ? 'NON' : print(value);
  return value;
}
export function renderRightsText(matrix, audit, locale = 'en', comparison = null) {
  const t = copy(locale);
  const lines = [t.title, '', line(t.release, matrix.releaseId, locale),
    line(t.status, audit.blocked || comparison?.blocked ? t.blocked : t.clear, locale),
    line(t.sources, matrix.sources.length, locale), line(t.outputs, matrix.outputs.length, locale),
    '', t.disclaimer, '', t.findings];
  if (!audit.findings.length) lines.push(t.noFindings);
  for (const finding of audit.findings) {
    lines.push(`- ${finding.code} [${finding.level}] ${finding.path}: ${finding.detail}`);
  }
  lines.push('', t.details);
  for (const source of matrix.sources) {
    lines.push('', `## ${source.id} — ${source.name}`,
      line(t.source, source.sourceUrl, locale), line(t.licence, source.licenceName, locale),
      line(t.licenceLink, source.licenceUrl, locale), line(t.termsLink, source.termsUrl, locale),
      line(t.evidence, source.evidenceUrl, locale), line(t.tier, source.evidenceTier, locale),
      line(t.permission, formatState(source.permission, locale), locale),
      line(t.redistribution, formatState(source.redistribution, locale), locale),
      line(t.derivative, formatState(source.derivativeUse, locale), locale),
      line(t.reviewed, source.termsReviewedOn, locale),
      line(t.acquired, source.acquiredOn, locale),
      line(t.dataset, source.datasetAsOf, locale), source.attribution);
  }
  lines.push('', t.outputDetail);
  for (const output of matrix.outputs) {
    lines.push('', `## ${output.id} — ${output.name}`,
      line(t.route, output.route, locale), line(t.language, output.locale, locale),
      line(t.target, output.minimumTargetPx, locale),
      line(t.distribution, output.distribution, locale),
      line(t.transformation, output.transformation, locale),
      line(t.sourceIds, output.sourceIds.join(', ') || 'UNKNOWN', locale),
      line(t.attribution, output.attribution || 'UNKNOWN', locale));
  }
  if (comparison) {
    lines.push('', t.changes);
    if (!comparison.changes.length) lines.push(t.noFindings);
    for (const change of comparison.changes) {
      lines.push(`- ${change.collection}/${change.id}/${change.field} [${change.level}]`,
        line(t.before, change.before, locale), line(t.after, change.after, locale),
        line(t.affected, change.affectedOutputs.join(', ') || 'UNKNOWN', locale));
    }
  }
  return `${lines.join('\n')}\n`;
}
function dt(label, value, locale) {
  return `<dt>${escapeHtml(label)}${locale === 'fr' ? '\u00a0:' : ':'}</dt><dd>${escapeHtml(value)}</dd>`;
}
function externalLink(label, value) {
  if (value === 'UNKNOWN' || !/^https:\/\//u.test(value)) return `<span>${escapeHtml(value)}</span>`;
  return `<a href="${escapeHtml(value)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`;
}
export function renderRightsHtml(matrix, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = copy(lang);
  const status = audit.blocked || comparison?.blocked ? t.blocked : t.clear;
  const findings = audit.findings.map(f => `<li><strong>${escapeHtml(f.code)}</strong> (${escapeHtml(f.level)}) — ${escapeHtml(f.path)} — ${escapeHtml(f.detail)}</li>`).join('');
  const sources = matrix.sources.map(source => `<article><h3>${escapeHtml(source.name)}</h3><dl>${[
    dt(t.source, source.sourceUrl, lang), dt(t.licence, source.licenceName, lang),
    dt(t.tier, source.evidenceTier, lang), dt(t.permission, formatState(source.permission, lang), lang),
    dt(t.redistribution, formatState(source.redistribution, lang), lang),
    dt(t.derivative, formatState(source.derivativeUse, lang), lang),
    dt(t.acquired, source.acquiredOn, lang), dt(t.dataset, source.datasetAsOf, lang),
    dt(t.reviewed, source.termsReviewedOn, lang),
  ].join('')}</dl><p>${externalLink(t.licenceLink, source.licenceUrl)} · ${externalLink(t.termsLink, source.termsUrl)} · ${externalLink(t.evidence, source.evidenceUrl)}</p><pre>${escapeHtml(source.attribution)}</pre></article>`).join('');
  const outputs = matrix.outputs.map(output => `<article><h3>${escapeHtml(output.name)}</h3><dl>${[
    dt(t.route, output.route, lang), dt(t.language, output.locale, lang),
    dt(t.target, output.minimumTargetPx, lang), dt(t.distribution, output.distribution, lang),
    dt(t.transformation, output.transformation, lang),
    dt(t.sourceIds, output.sourceIds.join(', ') || 'UNKNOWN', lang),
  ].join('')}</dl><pre>${escapeHtml(output.attribution)}</pre></article>`).join('');
  const changes = comparison ? `<section><h2>${escapeHtml(t.changes)}</h2><ul>${comparison.changes.map(item => `<li><strong>${escapeHtml(item.field)}</strong> (${escapeHtml(item.level)}) — ${escapeHtml(item.id)} — ${escapeHtml(t.before)}${lang === 'fr' ? '\u00a0:' : ':'} ${escapeHtml(item.before)} — ${escapeHtml(t.after)}${lang === 'fr' ? '\u00a0:' : ':'} ${escapeHtml(item.after)}</li>`).join('') || `<li>${escapeHtml(t.noFindings)}</li>`}</ul></section>` : '';
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;; object-src &#39;none&#39;"><title>${escapeHtml(t.title)}</title><style>:root{color-scheme:light dark}body{max-width:76rem;margin:auto;padding:1rem;font:1rem/1.6 system-ui}a{min-width:44px;min-height:44px;display:inline-flex;align-items:center}a:focus-visible{outline:3px solid Highlight;outline-offset:3px}article{border:1px solid GrayText;padding:1rem;margin:1rem 0;overflow-wrap:anywhere}dt{font-weight:bold}dd{margin:0 0 .5rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{a[href]:after{content:' (' attr(href) ')';font-size:.8em}}</style></head><body><a href="#report">${escapeHtml(t.skip)}</a><header><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(t.disclaimer)}</p></header><main id="report"><h2>${escapeHtml(t.release)}${lang === 'fr' ? '\u00a0:' : ':'} ${escapeHtml(matrix.releaseId)}</h2><p role="status">${escapeHtml(status)}</p><section><h2>${escapeHtml(t.findings)}</h2><ul>${findings || `<li>${escapeHtml(t.noFindings)}</li>`}</ul></section><section><h2>${escapeHtml(t.details)}</h2>${sources}</section><section><h2>${escapeHtml(t.outputDetail)}</h2>${outputs}</section>${changes}</main></body></html>\n`;
}
export function renderRightsJson(matrix, audit, comparison = null) {
  return `${JSON.stringify({schema: 'attribution-rights-report/1', matrix, audit, comparison}, null, 2)}\n`;
}
export function renderRightsReport(matrix, audit, locale = 'en', comparison = null) {
  return {
    text: renderRightsText(matrix, audit, locale, comparison),
    html: renderRightsHtml(matrix, audit, locale, comparison),
    json: renderRightsJson(matrix, audit, comparison),
  };
}
