/** HTML, JSON and text output for explicit manual terms checkpoints. */
export const CHECKPOINT_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Source and licence checkpoint', release: 'Release', status: 'Status', blocked: 'Publication blocked',
    clear: 'No blocking findings in supplied records', findings: 'Findings', changes: 'Changes',
    source: 'Source', licence: 'Licence', permission: 'Permission', terms: 'Terms date', data: 'Dataset date',
    tier: 'Evidence tier', decision: 'Decision', reason: 'Decision reason', surface: 'Publication view',
    offline: 'Offline', target: 'Minimum target', noFindings: 'No findings', unknown: 'UNKNOWN',
    skip: 'Skip to main content', notice: 'Recorded notice', noChanges: 'No changes',
    provenance: 'Recorded provenance', readOnly: 'This report describes supplied records. It does not assess any place or route.',
    before: 'Previous', after: 'Current', category: 'Category', level: 'Severity',
  }),
  fr: Object.freeze({
    title: 'Examen des sources et des licences', release: 'Version', status: 'État', blocked: 'Publication bloquée',
    clear: 'Aucun élément bloquant dans les renseignements fournis', findings: 'Constats', changes: 'Changements',
    source: 'Source', licence: 'Licence', permission: 'Permission', terms: 'Date des conditions', data: 'Données en date du',
    tier: 'Niveau des renseignements', decision: 'Décision', reason: 'Motif de la décision', surface: 'Vue publiée',
    offline: 'Hors connexion', target: 'Dimension minimale', noFindings: 'Aucun constat', unknown: 'UNKNOWN',
    skip: 'Aller au contenu principal', notice: 'Mention enregistrée', noChanges: 'Aucun changement',
    provenance: 'Provenance enregistrée', readOnly: 'Ce rapport présente les renseignements fournis. Il n’évalue aucun lieu ni trajet.',
    before: 'Avant', after: 'Après', category: 'Catégorie', level: 'Gravité',
  }),
});
export function checkpointLabel(locale, label) { return CHECKPOINT_COPY[locale === 'fr' ? 'fr' : 'en'][label]; }
export function checkpointField(locale, label, value) { return `${checkpointLabel(locale, label)}${locale === 'fr' ? '\u00a0:' : ':'} ${value}`; }
export function escapeCheckpointHtml(raw) {
  return String(raw).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
function findingLine(item) { return `${item.level.toUpperCase()} ${item.code} ${item.path}: ${item.detail}`; }
export function renderCheckpointText(checkpoint, audit, locale = 'en', comparison = null) {
  const l = locale === 'fr' ? 'fr' : 'en';
  const copy = CHECKPOINT_COPY[l];
  const lines = [copy.title, checkpointField(l, 'release', checkpoint.releaseId), checkpointField(l, 'status', audit.blocked || comparison?.blocked ? copy.blocked : copy.clear), copy.readOnly, '', copy.provenance];
  for (const source of checkpoint.sources) {
    lines.push('', `## ${source.name} (${source.id})`, checkpointField(l, 'source', source.sourceUrl), checkpointField(l, 'licence', `${source.licenceName} — ${source.licenceUrl}`), checkpointField(l, 'terms', source.termsDate), checkpointField(l, 'data', source.datasetDate), checkpointField(l, 'permission', source.permission), checkpointField(l, 'tier', source.evidenceTier), checkpointField(l, 'decision', source.decision), checkpointField(l, 'reason', source.decisionReason), checkpointField(l, 'notice', source.notice), `Evidence URL: ${source.evidenceUrl}`);
  }
  for (const surface of checkpoint.surfaces) lines.push('', `## ${copy.surface}: ${surface.title} (${surface.id})`, checkpointField(l, 'offline', surface.offline), checkpointField(l, 'target', `${surface.targetPx} px`), `Source IDs: ${surface.sourceIds.join(', ')}`);
  lines.push('', copy.findings);
  if (audit.findings.length) lines.push(...audit.findings.map(findingLine)); else lines.push(copy.noFindings);
  if (comparison) {
    lines.push('', copy.changes);
    if (!comparison.changes.length) lines.push(copy.noChanges);
    else lines.push(...comparison.changes.map(c => `${c.blocking ? 'BLOCK' : 'INFO'} ${c.code} ${c.path}: ${c.before} → ${c.after}`));
  }
  return `${lines.join('\n')}\n`;
}
function htmlField(locale, key, value) { return `<dt>${escapeCheckpointHtml(checkpointLabel(locale, key))}</dt><dd>${escapeCheckpointHtml(value)}</dd>`; }
function htmlList(items, map, empty) { return items.length ? `<ul>${items.map(item => `<li>${map(item)}</li>`).join('')}</ul>` : `<p>${escapeCheckpointHtml(empty)}</p>`; }
export function renderCheckpointHtml(checkpoint, audit, locale = 'en', comparison = null) {
  const l = locale === 'fr' ? 'fr' : 'en';
  const m = CHECKPOINT_COPY[l];
  const status = audit.blocked || comparison?.blocked ? m.blocked : m.clear;
  const sources = checkpoint.sources.map(source => `<article><h3>${escapeCheckpointHtml(source.name)}</h3><dl>${htmlField(l, 'source', source.sourceUrl)}${htmlField(l, 'licence', source.licenceName)}${htmlField(l, 'terms', source.termsDate)}${htmlField(l, 'data', source.datasetDate)}${htmlField(l, 'tier', source.evidenceTier)}${htmlField(l, 'permission', source.permission)}${htmlField(l, 'decision', source.decision)}${htmlField(l, 'notice', source.notice)}</dl><p><a rel="noopener noreferrer" href="${escapeCheckpointHtml(source.sourceUrl === 'UNKNOWN' ? '#' : source.sourceUrl)}">${escapeCheckpointHtml(m.source)}</a></p><p><a rel="noopener noreferrer" href="${escapeCheckpointHtml(source.licenceUrl === 'UNKNOWN' ? '#' : source.licenceUrl)}">${escapeCheckpointHtml(m.licence)}</a></p></article>`).join('');
  const findings = htmlList(audit.findings, f => `<strong>${escapeCheckpointHtml(f.code)}</strong> (${escapeCheckpointHtml(f.level)}): ${escapeCheckpointHtml(f.path)} — ${escapeCheckpointHtml(f.detail)}`, m.noFindings);
  const changes = comparison ? `<section><h2>${escapeCheckpointHtml(m.changes)}</h2>${htmlList(comparison.changes, c => `<strong>${escapeCheckpointHtml(c.code)}</strong>: ${escapeCheckpointHtml(c.before)} → ${escapeCheckpointHtml(c.after)}`, m.noChanges)}</section>` : '';
  return `<!doctype html>\n<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; script-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"><title>${escapeCheckpointHtml(m.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;color:#191919;background:#fff;max-width:75rem;margin:auto;padding:1rem}a{display:inline-flex;min-width:44px;min-height:44px;align-items:center}a:focus-visible{outline:3px solid #154ba0;outline-offset:3px}dt{font-weight:bold}dd{margin:0 0 1rem}article{border-block-end:1px solid #555;padding:1rem 0}.skip{position:absolute;left:-100vw}.skip:focus{left:1rem;top:1rem;background:#fff}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{a{color:inherit}}</style></head><body><a class="skip" href="#main">${escapeCheckpointHtml(m.skip)}</a><main id="main"><h1>${escapeCheckpointHtml(m.title)}</h1><p>${escapeCheckpointHtml(m.readOnly)}</p><p>${escapeCheckpointHtml(status)}</p><h2>${escapeCheckpointHtml(m.provenance)}</h2>${sources}<section><h2>${escapeCheckpointHtml(m.findings)}</h2>${findings}</section>${changes}</main></body></html>\n`;
}
export function renderCheckpointJson(checkpoint, audit, comparison = null) {
  return `${JSON.stringify({ schema: 'attribution-checkpoint-report/1', releaseId: checkpoint.releaseId, blocked: audit.blocked || comparison?.blocked || false, audit, comparison, sources: checkpoint.sources, surfaces: checkpoint.surfaces }, null, 2)}\n`;
}
