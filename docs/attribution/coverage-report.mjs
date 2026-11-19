/** Local reports; never substitute missing facts with implied assertions. */
import { UNKNOWN, SOURCES } from './attribution-utils.mjs';
import { coverageMatrix, coverageCountsByProvider } from './coverage-audit.mjs';

const COPY = Object.freeze({
  en: Object.freeze({title:'Attribution coverage', release:'Release', result:'Publication gate', blocked:'Blocked', clear:'No blocking findings in supplied evidence',
    source:'Source', sources:'Sources', views:'Views', records:'Coverage records', findings:'Findings', changes:'Changes', none:'None',
    view:'View', licence:'Licence', tier:'Evidence tier', permission:'Permission', date:'Dataset date', origin:'Source URL',
    terms:'Licence URL', review:'Terms reviewed', acquisition:'Acquired', notice:'Attribution notice',
    path:'Location', level:'Level', code:'Code', detail:'Details', previous:'Before', candidate:'After',
    intro:'This report describes supplied records, not conditions at a destination.', print:'Print report'}),
  fr: Object.freeze({title:'Couverture des sources et des licences',release:'Version',result:'État de publication',blocked:'Publication bloquée',
    clear:'Aucun élément bloquant dans les renseignements fournis',source:'Source',sources:'Sources',views:'Vues',records:'Registre de couverture',
    findings:'Points à examiner',changes:'Changements',none:'Aucun',view:'Vue',licence:'Licence',tier:'Niveau de preuve',
    permission:'Permission',date:'Données en date du',origin:'Adresse de la source',terms:'Adresse de la licence',
    review:'Conditions consultées le',acquisition:'Date d’acquisition',notice:'Mention de source',path:'Emplacement',
    level:'Niveau',code:'Code',detail:'Détails',previous:'Avant',candidate:'Après',
    intro:'Ce rapport décrit les renseignements fournis, pas les conditions à destination.',print:'Imprimer le rapport'}),
});
export const coverageCopy = (locale) => COPY[locale === 'fr' ? 'fr' : 'en'];
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
export function cleanUrl(value) {
  if (value === UNKNOWN) return null;
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) return null; return url.href; }
  catch { return null; }
}
function pair(locale, key, value) { const t = coverageCopy(locale); return `${t[key]}${locale === 'fr' ? '\u00a0' : ''}: ${value}`; }
function summaryLine(locale, audit) { const t = coverageCopy(locale); return pair(locale, 'result', audit.blocked ? t.blocked : t.clear); }
export function coverageText(register, audit, locale = 'en', comparison = null) {
  const t = coverageCopy(locale);
  const lines = [t.title, '', pair(locale, 'release', register.releaseId), summaryLine(locale, audit),
    pair(locale, 'sources', audit.sources), pair(locale, 'views', audit.views), '', t.intro, '', t.sources];
  for (const source of register.sources) {
    lines.push('', `## ${source.title}`, pair(locale, 'source', source.id), pair(locale, 'licence', source.licenceName),
      pair(locale, 'tier', source.evidenceTier), pair(locale, 'permission', source.permission), pair(locale, 'date', source.datasetAsOf),
      pair(locale, 'origin', source.sourceUrl), pair(locale, 'terms', source.licenceUrl),
      pair(locale, 'acquisition', source.acquiredOn), pair(locale, 'review', source.termsReviewedOn),
      pair(locale, 'notice', source.attribution));
  }
  lines.push('', t.records);
  for (const row of coverageMatrix(register)) {
    lines.push('', `## ${row.viewId} (${row.language})`);
    for (const source of row.sources) lines.push(`${source.id}: ${source.provider}, ${source.licence}, ${source.tier}, ${source.date}`);
  }
  lines.push('', t.findings);
  for (const finding of audit.findings) lines.push(`${finding.level}: ${finding.path}: ${finding.code}: ${finding.detail}`);
  if (!audit.findings.length) lines.push(t.none);
  if (comparison) {
    lines.push('', t.changes);
    for (const change of comparison.changes) lines.push(`${change.kind}.${change.id}.${change.field}: ${change.before} → ${change.after}`);
    if (!comparison.changes.length) lines.push(t.none);
  }
  return `${lines.join('\n')}\n`;
}
function cell(text) { return `<td>${escapeHtml(text)}</td>`; }
function link(value) {
  const safe = cleanUrl(value);
  return safe ? `<a href="${escapeHtml(safe)}" rel="noopener noreferrer" target="_blank">${escapeHtml(value)}</a>` : escapeHtml(value);
}
function sourceRows(register, locale) {
  return register.sources.map((s) => `<tr>${cell(s.id)}${cell(s.title)}${cell(s.licenceName)}${cell(s.permission)}${cell(s.evidenceTier)}` +
    `${cell(s.datasetAsOf)}<td>${link(s.sourceUrl)}</td><td>${link(s.licenceUrl)}</td></tr>`).join('\n');
}
function findingRows(audit) { return audit.findings.map((f) => `<tr>${cell(f.level)}${cell(f.path)}${cell(f.code)}${cell(f.detail)}</tr>`).join('\n'); }
function changeRows(comparison) {
  return comparison?.changes.map((c) => `<tr>${cell(c.kind)}${cell(c.id)}${cell(c.field)}${cell(c.before)}${cell(c.after)}</tr>`).join('\n') ?? '';
}
export function coverageHtml(register, audit, locale = 'en', comparison = null) {
  const lang = locale === 'fr' ? 'fr' : 'en'; const t = coverageCopy(lang); const fr = lang === 'fr';
  const headings = (keys) => keys.map((key) => `<th scope="col">${escapeHtml(t[key])}</th>`).join('');
  const table = (keys, rows) => `<div class="scroll"><table><thead><tr>${headings(keys)}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const sources = table(['source','source','licence','permission','tier','date','origin','terms'], sourceRows(register, lang));
  const findings = table(['level','path','code','detail'], findingRows(audit));
  const changed = comparison ? `<section aria-labelledby="changes"><h2 id="changes">${t.changes}</h2>${table(['level','source','code','previous','candidate'], changeRows(comparison))}</section>` : '';
  const matrix = coverageMatrix(register).map((row) => `<li><strong>${escapeHtml(row.viewId)}</strong> (${row.language}) — ${row.sources.map((s) => escapeHtml(`${s.id} [${s.licence}; ${s.tier}; ${s.date}]`)).join(', ') || UNKNOWN}</li>`).join('');
  const badge = audit.blocked ? t.blocked : t.clear;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">` +
    `<title>${escapeHtml(t.title)}</title><style>body{font:1rem/1.5 system-ui,sans-serif;max-width:80rem;margin:auto;padding:1rem;color:#182b26;background:#fff}` +
    `a{min-width:44px;min-height:44px;display:inline-flex;align-items:center;color:#064b75}a:focus-visible{outline:3px solid #c45105;outline-offset:3px}` +
    `.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}td,th{padding:.75rem;border:1px solid #555;text-align:left;vertical-align:top}` +
    `h1,h2{line-height:1.3}li{padding:.3rem}button{min-height:44px;min-width:44px}@media print{body{max-width:none}a{color:inherit}}` +
    `@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body>` +
    `<header><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(pair(lang,'release',register.releaseId))}</p></header>` +
    `<main id="main"><p role="status">${escapeHtml(badge)}</p><p>${escapeHtml(t.intro)}</p>` +
    `<section aria-labelledby="sources"><h2 id="sources">${t.sources}</h2>${sources}</section>` +
    `<section aria-labelledby="views"><h2 id="views">${t.views}</h2><ul>${matrix}</ul></section>` +
    `<section aria-labelledby="findings"><h2 id="findings">${t.findings}</h2>${findings}</section>${changed}</main>` +
    `<footer>${escapeHtml(pair(lang,'date',UNKNOWN))} · ${escapeHtml(String(coverageCountsByProvider(register).length))}</footer></body></html>`;
}
export function coverageJson(register, audit, comparison = null) {
  return `${JSON.stringify({schema: 'attribution-coverage-report/1', releaseId: register.releaseId,
    blocked: audit.blocked || Boolean(comparison?.blocked), audit, comparison, matrix: coverageMatrix(register),
    providers: coverageCountsByProvider(register)}, null, 2)}\n`;
}
export function renderCoverage(register, audit, locale, comparison = null) {
  return Object.freeze({text: coverageText(register, audit, locale, comparison),
    html: coverageHtml(register, audit, locale, comparison), json: coverageJson(register, audit, comparison)});
}
