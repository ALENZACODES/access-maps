/** Safe, deterministic EN/FR reports for local handoff evidence. */
export const REPORT_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Attribution handoff audit', release: 'Release', status: 'Status',
    blocked: 'Publication blocked by evidence gaps', clear: 'No blocking findings in the supplied records',
    sources: 'Sources', surfaces: 'Publication surfaces', handoffs: 'Handoffs',
    findings: 'Findings', noFindings: 'No findings', changes: 'Changes from previous release',
    noChanges: 'No recorded changes', licence: 'Licence', sourceUrl: 'Source URL',
    licenceUrl: 'Licence URL', permission: 'Permission', tier: 'Evidence tier',
    termsDate: 'Terms date', datasetDate: 'Dataset date', acquiredDate: 'Acquisition date',
    reviewDate: 'Policy review date', audience: 'Audience', retention: 'Retention',
    purpose: 'Purpose', notice: 'Attribution notice', evidence: 'Evidence URL',
    offline: 'Offline', language: 'Language', recipient: 'Recipient', approval: 'Approval',
    scope: 'Scope', format: 'Format', expiry: 'Expiry', approved: 'Approved',
    digest: 'Digest', before: 'Before', after: 'After', affected: 'Affected records',
    references: 'Source references', summary: 'Audit summary',
    disclaimer: 'This report describes supplied source evidence. It does not assess conditions at a physical location.',
    unknown: 'UNKNOWN', blockedLabel: 'Block', attentionLabel: 'Attention', informationLabel: 'Information',
    noSurfaces: 'No publication surfaces', noHandoffs: 'No handoffs',
  }),
  fr: Object.freeze({
    title: 'Examen des transmissions de sources', release: 'Version', status: 'État',
    blocked: 'Publication bloquée par des renseignements manquants',
    clear: 'Aucun élément bloquant dans les renseignements fournis',
    sources: 'Sources', surfaces: 'Vues publiées', handoffs: 'Transmissions',
    findings: 'Points à examiner', noFindings: 'Aucun point à signaler',
    changes: 'Changements depuis la version précédente', noChanges: 'Aucun changement consigné',
    licence: 'Licence', sourceUrl: 'Adresse de la source', licenceUrl: 'Adresse de la licence',
    permission: 'Permission', tier: 'Niveau de preuve', termsDate: 'Date des conditions',
    datasetDate: 'Données en date du', acquiredDate: 'Date d’acquisition',
    reviewDate: 'Date d’examen de la politique', audience: 'Public visé',
    retention: 'Conservation', purpose: 'Objet', notice: 'Mention de source',
    evidence: 'Adresse de la preuve', offline: 'Hors connexion', language: 'Langue',
    recipient: 'Destinataire', approval: 'Approbation', scope: 'Portée', format: 'Format',
    expiry: 'Expiration', approved: 'Date d’approbation', digest: 'Empreinte',
    before: 'Avant', after: 'Après', affected: 'Éléments concernés',
    references: 'Références des sources', summary: 'Résumé de l’examen',
    disclaimer: 'Ce rapport décrit les renseignements fournis. Il n’évalue pas les conditions d’un lieu.',
    unknown: 'UNKNOWN', blockedLabel: 'Blocage', attentionLabel: 'À examiner',
    informationLabel: 'Information', noSurfaces: 'Aucune vue publiée',
    noHandoffs: 'Aucune transmission',
  }),
});
function copyFor(locale) { return REPORT_COPY[locale === 'fr' ? 'fr' : 'en']; }
export function escapeHtml(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
export function labelLine(label, value, locale) {
  return `${label}${locale === 'fr' ? '\u00a0' : ''}: ${value}`;
}
function secureLink(value, locale) {
  if (value === 'UNKNOWN') return escapeHtml(value);
  let parsed;
  try { parsed = new URL(value); } catch { return escapeHtml('UNKNOWN'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return escapeHtml('UNKNOWN');
  return `<a href="${escapeHtml(parsed.href)}" rel="noopener noreferrer" target="_blank" aria-label="${escapeHtml(locale === 'fr' ? 'Source externe' : 'External source')}">${escapeHtml(value)}</a>`;
}
export function statusText(audit, locale) {
  const t = copyFor(locale);
  return audit.blocked ? t.blocked : t.clear;
}
function valuesForSource(source, t) {
  return [[t.sourceUrl, source.sourceUrl], [t.licence, source.licenceName],
    [t.licenceUrl, source.licenceUrl], [t.permission, source.permission],
    [t.tier, source.tier], [t.datasetDate, source.datasetDate],
    [t.acquiredDate, source.acquiredDate], [t.termsDate, source.termsDate],
    [t.evidence, source.evidenceUrl], [t.notice, source.notice]];
}
function valuesForSurface(surface, t) {
  return [[t.language, surface.locale], [t.offline, surface.offline],
    [t.sources, surface.sourceIds.join(', ')], [t.status, surface.mode],
    [t.approved, surface.publicationDate], [t.scope, surface.targetPx]];
}
function valuesForHandoff(handoff, t) {
  return [[t.recipient, handoff.recipient], [t.purpose, handoff.purpose],
    [t.approval, handoff.approval], [t.scope, handoff.scope],
    [t.format, handoff.format], [t.approved, handoff.approvedDate],
    [t.expiry, handoff.expiresDate], [t.digest, handoff.digest],
    [t.sources, handoff.sourceIds.join(', ')], [t.surfaces, handoff.surfaceIds.join(', ')]];
}
export function renderHandoffText(pack, audit, locale = 'en', comparison = null) {
  const t = copyFor(locale);
  const lines = [t.title, '', labelLine(t.release, pack.releaseId, locale),
    labelLine(t.status, statusText(audit, locale), locale),
    labelLine(t.sources, pack.sources.length, locale),
    labelLine(t.surfaces, pack.surfaces.length, locale),
    labelLine(t.handoffs, pack.handoffs.length, locale), '', t.disclaimer, '',
    `## ${t.summary}`, labelLine(t.audience, pack.policy.audience, locale),
    labelLine(t.purpose, locale === 'fr' ? pack.policy.purposeFr : pack.policy.purposeEn, locale),
    labelLine(t.retention, pack.policy.retention, locale),
    labelLine(t.reviewDate, pack.policy.reviewDate, locale), '', `## ${t.sources}`];
  for (const source of pack.sources) {
    lines.push(`### ${source.id} — ${source.name}`);
    for (const [label, value] of valuesForSource(source, t)) lines.push(labelLine(label, value, locale));
    lines.push('');
  }
  lines.push(`## ${t.surfaces}`);
  if (!pack.surfaces.length) lines.push(t.noSurfaces);
  for (const surface of pack.surfaces) {
    lines.push(`### ${surface.id}`);
    for (const [label, value] of valuesForSurface(surface, t)) lines.push(labelLine(label, value, locale));
    lines.push('');
  }
  lines.push(`## ${t.handoffs}`);
  if (!pack.handoffs.length) lines.push(t.noHandoffs);
  for (const handoff of pack.handoffs) {
    lines.push(`### ${handoff.id}`);
    for (const [label, value] of valuesForHandoff(handoff, t)) lines.push(labelLine(label, value, locale));
    lines.push('');
  }
  lines.push(`## ${t.findings}`);
  if (!audit.findings.length) lines.push(t.noFindings);
  for (const item of audit.findings) {
    lines.push(`[${item.level.toUpperCase()}] ${item.code} ${item.path}: ${item.detail}`);
  }
  if (comparison) {
    lines.push('', `## ${t.changes}`);
    if (!comparison.changes.length) lines.push(t.noChanges);
    for (const change of comparison.changes) {
      lines.push(`[${change.severity}] ${change.kind} ${change.id}.${change.field}`);
      lines.push(labelLine(t.before, change.before, locale));
      lines.push(labelLine(t.after, change.after, locale));
      if (change.affected.length) lines.push(labelLine(t.affected, change.affected.join(', '), locale));
    }
  }
  return `${lines.join('\n')}\n`;
}
function htmlFields(fields, locale) {
  return `<dl>${fields.map(([label, value]) => {
    const v = String(value);
    const output = /^https:\/\//u.test(v) ? secureLink(v, locale) : escapeHtml(v);
    return `<dt>${escapeHtml(label)}${locale === 'fr' ? '\u00a0' : ''}:</dt><dd>${output}</dd>`;
  }).join('')}</dl>`;
}
function htmlList(items, empty) {
  if (!items.length) return `<p>${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}
export function renderHandoffHtml(pack, audit, locale = 'en', comparison = null) {
  const language = locale === 'fr' ? 'fr' : 'en';
  const t = copyFor(language);
  const sourceSections = pack.sources.map((source) => `<article><h3>${escapeHtml(source.name)} (${escapeHtml(source.id)})</h3>${htmlFields(valuesForSource(source, t), language)}</article>`).join('');
  const surfaceSections = pack.surfaces.map((surface) => `<article><h3>${escapeHtml(surface.id)}</h3>${htmlFields(valuesForSurface(surface, t), language)}</article>`).join('');
  const handoffSections = pack.handoffs.map((handoff) => `<article><h3>${escapeHtml(handoff.id)}</h3>${htmlFields(valuesForHandoff(handoff, t), language)}</article>`).join('');
  const findings = htmlList(audit.findings.map((item) => `<strong>${escapeHtml(item.level)} — ${escapeHtml(item.code)}</strong> <span>${escapeHtml(item.path)}: ${escapeHtml(item.detail)}</span>`), t.noFindings);
  const changes = comparison ? `<section aria-labelledby="change-heading"><h2 id="change-heading">${escapeHtml(t.changes)}</h2>${htmlList(comparison.changes.map((item) => `<strong>${escapeHtml(item.kind)} (${escapeHtml(item.severity)})</strong> ${escapeHtml(item.id)}.${escapeHtml(item.field)}<p>${escapeHtml(t.before)}${language === 'fr' ? '\u00a0' : ''}: ${escapeHtml(item.before)}</p><p>${escapeHtml(t.after)}${language === 'fr' ? '\u00a0' : ''}: ${escapeHtml(item.after)}</p>`), t.noChanges)}</section>` : '';
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(t.title)}</title>
<style>:root{color-scheme:light dark}html{font:1rem/1.6 system-ui,sans-serif}body{max-width:76rem;margin:auto;padding:1rem;background:Canvas;color:CanvasText}a{min-width:44px;min-height:44px;display:inline-flex;align-items:center;overflow-wrap:anywhere}a:focus-visible{outline:3px solid Highlight;outline-offset:3px}h1,h2,h3{line-height:1.3}section{margin:1rem 0;border-top:1px solid GrayText}article{padding:1rem 0;border-bottom:1px solid GrayText}dl{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,2fr);gap:.4rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}li{padding:.4rem 0;overflow-wrap:anywhere}.skip{position:absolute;top:-8rem}.skip:focus{top:0}@media(max-width:46rem){dl{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media(forced-colors:active){a:focus-visible{outline:3px solid Highlight}}@media print{body{max-width:none}}</style>
</head><body><a class="skip" href="#main">${escapeHtml(language === 'fr' ? 'Aller au contenu principal' : 'Skip to main content')}</a><header><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(t.disclaimer)}</p></header>
<main id="main"><p role="status">${escapeHtml(statusText(audit, language))}</p>
<section aria-labelledby="summary-heading"><h2 id="summary-heading">${escapeHtml(t.summary)}</h2>${htmlFields([[t.release, pack.releaseId], [t.audience, pack.policy.audience], [t.purpose, language === 'fr' ? pack.policy.purposeFr : pack.policy.purposeEn], [t.retention, pack.policy.retention], [t.reviewDate, pack.policy.reviewDate]], language)}</section>
<section aria-labelledby="source-heading"><h2 id="source-heading">${escapeHtml(t.sources)}</h2>${sourceSections}</section>
<section aria-labelledby="surface-heading"><h2 id="surface-heading">${escapeHtml(t.surfaces)}</h2>${surfaceSections || `<p>${escapeHtml(t.noSurfaces)}</p>`}</section>
<section aria-labelledby="handoff-heading"><h2 id="handoff-heading">${escapeHtml(t.handoffs)}</h2>${handoffSections || `<p>${escapeHtml(t.noHandoffs)}</p>`}</section>
<section aria-labelledby="finding-heading"><h2 id="finding-heading">${escapeHtml(t.findings)}</h2>${findings}</section>${changes}</main></body></html>\n`;
}
export function renderHandoffJson(pack, audit, comparison = null) {
  return `${JSON.stringify({ schema: 'attribution-handoff-report/1', pack, audit, comparison }, null, 2)}\n`;
}
export function renderHandoffReport(pack, audit, locale = 'en', comparison = null) {
  return {
    text: renderHandoffText(pack, audit, locale, comparison),
    html: renderHandoffHtml(pack, audit, locale, comparison),
    json: renderHandoffJson(pack, audit, comparison),
  };
}
export function reportFilename(locale, format) {
  return `attribution-handoff-${locale === 'fr' ? 'fr' : 'en'}.${format === 'text' ? 'txt' : format}`;
}
