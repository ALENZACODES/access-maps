/** Deterministic, browser-independent EN/FR reports for local evidence ledgers. */
import { parseTierLedger, summarizeTiers, UNKNOWN } from './tier-ledger.mjs';
import { auditTierLedger, compareTierLedgers } from './tier-audit.mjs';
const TRANSLATIONS = Object.freeze({
  en: Object.freeze({title:'Attribution evidence tiers', release:'Release', status:'Status', blocked:'Blocked', clear:'No blocking findings in supplied records', record:'Source record', records:'Source records', surfaces:'Publication surfaces', source:'Source', licence:'Licence', date:'Dataset date', acquired:'Acquired', reviewed:'Terms reviewed', tier:'Evidence tier', permission:'Permission', attribution:'Attribution', links:'Evidence links', details:'Details', findings:'Audit findings', none:'No findings', changes:'Release changes', noChanges:'No changes', before:'Before', after:'After', offline:'Offline', mode:'Surface type', target:'Minimum target', related:'Related records', unknown:'UNKNOWN', skip:'Skip to main content', sourceUrl:'Source URL', licenceUrl:'Licence URL', evidenceUrl:'Evidence URL', accessibility:'Accessibility evidence', keyboard:'Keyboard', labels:'Labels', mapCredit:'Map credit', state:'Publication state', note:'Notes', disclaimer:'Source information does not establish the accessibility or suitability of a place or service.'}),
  fr: Object.freeze({title:'Niveaux de preuve des sources', release:'Version', status:'État', blocked:'Publication bloquée', clear:'Aucun élément bloquant dans les données fournies', record:'Fiche de source', records:'Fiches de source', surfaces:'Vues publiées', source:'Source', licence:'Licence', date:'Données en date du', acquired:'Date d’acquisition', reviewed:'Conditions consultées le', tier:'Niveau de preuve', permission:'Permission', attribution:'Mention de source', links:'Liens de preuve', details:'Détails', findings:'Points à examiner', none:'Aucun point à signaler', changes:'Changements entre versions', noChanges:'Aucun changement', before:'Avant', after:'Après', offline:'Hors connexion', mode:'Type de vue', target:'Cible minimale', related:'Fiches liées', unknown:'UNKNOWN', skip:'Aller au contenu principal', sourceUrl:'Adresse de la source', licenceUrl:'Adresse de la licence', evidenceUrl:'Adresse de la preuve', accessibility:'Éléments d’accessibilité', keyboard:'Clavier', labels:'Étiquettes', mapCredit:'Crédit cartographique', state:'État de publication', note:'Notes', disclaimer:'Ces renseignements n’établissent ni l’accessibilité ni l’adéquation d’un lieu ou d’un service.'}),
});
const TIER_LABELS = Object.freeze({en:{primary:'Primary',secondary:'Secondary',community:'Community',UNKNOWN},fr:{primary:'Primaire',secondary:'Secondaire',community:'Communauté',UNKNOWN}});
const STATE_LABELS = Object.freeze({en:{included:'Included',held:'Held',excluded:'Excluded'},fr:{included:'Inclus',held:'En attente',excluded:'Exclu'}});
const PERMISSION_LABELS = Object.freeze({en:{YES:'Yes',NO:'No',UNKNOWN},fr:{YES:'Oui',NO:'Non',UNKNOWN}});
export function translations(locale) {
  if (!Object.hasOwn(TRANSLATIONS, locale)) throw new TypeError('Unsupported language');
  return TRANSLATIONS[locale];
}
export function escapeHtml(value) {
  return String(value).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');
}
export function displayValue(value, locale) {
  if (value === UNKNOWN) return UNKNOWN;
  if (value === 'YES' || value === 'NO') return PERMISSION_LABELS[locale][value];
  if (Object.hasOwn(TIER_LABELS[locale],value)) return TIER_LABELS[locale][value];
  if (Object.hasOwn(STATE_LABELS[locale],value)) return STATE_LABELS[locale][value];
  if (Array.isArray(value)) return value.map((item)=>displayValue(item,locale)).join(', ');
  if (value === null || value === undefined || value === '') return value === '' ? '' : UNKNOWN;
  return String(value);
}
function kvText(locale, name, value) { return `${name}${locale === 'fr' ? '\u00a0:' : ':'} ${displayValue(value,locale)}`; }
function kvHtml(locale, name, value) { return `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(displayValue(value,locale))}</dd></div>`; }
function safeLink(url, label) {
  if (url === UNKNOWN) return `<span>${UNKNOWN}</span>`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return `<span>${UNKNOWN}</span>`;
    return `<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`;
  } catch { return `<span>${UNKNOWN}</span>`; }
}
function findResult(input, audit) { return audit ?? auditTierLedger(input); }
export function renderTierText(input, locale = 'en', existingAudit) {
  const m = translations(locale);
  const ledger = parseTierLedger(input);
  const audit = findResult(ledger,existingAudit);
  const lines = [m.title, kvText(locale,m.release,ledger.release),kvText(locale,m.status,audit.blocked ? m.blocked : m.clear),'',m.records];
  const summary = summarizeTiers(ledger);
  for (const [tier,count] of Object.entries(summary)) lines.push(kvText(locale,displayValue(tier,locale),count));
  for (const record of ledger.records) {
    lines.push('',`${m.record}: ${record.id}`);
    for (const [key,title] of [['name',m.source],['family',m.details],['licenceName',m.licence],['sourceDate',m.date],['acquiredOn',m.acquired],['termsReviewedOn',m.reviewed],['tier',m.tier],['permission',m.permission],['state',m.state],['sourceUrl',m.sourceUrl],['licenceUrl',m.licenceUrl],['evidenceUrl',m.evidenceUrl],['attribution',m.attribution],['notes',m.note]]) {
      lines.push(kvText(locale,title,record[key]));
    }
  }
  lines.push('',m.surfaces);
  for (const surface of ledger.surfaces) {
    lines.push('',`${surface.id} (${surface.locale})`);
    for (const [key,title] of [['mode',m.mode],['recordIds',m.related],['offline',m.offline],['targetPx',m.target],['mapCredit',m.mapCredit],['keyboard',m.keyboard],['labelled',m.labels],['publicationDate',m.date]]) lines.push(kvText(locale,title,surface[key]));
  }
  lines.push('',m.findings);
  if (!audit.findings.length) lines.push(m.none);
  for (const finding of audit.findings) lines.push(`[${finding.level}] ${finding.code}: ${finding.path} — ${finding.detail}`);
  lines.push('',m.disclaimer);
  return `${lines.join('\n')}\n`;
}
export function renderTierHtml(input, locale = 'en', existingAudit) {
  const m = translations(locale);
  const ledger = parseTierLedger(input);
  const audit = findResult(ledger,existingAudit);
  const records = ledger.records.map((record) => `<article aria-labelledby="record-${escapeHtml(record.id)}"><h3 id="record-${escapeHtml(record.id)}">${escapeHtml(record.name)}</h3><dl>${[
    ['id',m.record],['family',m.details],['licenceName',m.licence],['sourceDate',m.date],['acquiredOn',m.acquired],['termsReviewedOn',m.reviewed],['tier',m.tier],['permission',m.permission],['state',m.state],['attribution',m.attribution],['notes',m.note],
  ].map(([key,title])=>kvHtml(locale,title,record[key])).join('')}</dl><p>${safeLink(record.sourceUrl,m.sourceUrl)} · ${safeLink(record.licenceUrl,m.licenceUrl)} · ${safeLink(record.evidenceUrl,m.evidenceUrl)}</p></article>`).join('\n');
  const surfaces = ledger.surfaces.map((surface)=>`<article><h3>${escapeHtml(surface.id)} (${escapeHtml(surface.locale)})</h3><dl>${[['mode',m.mode],['recordIds',m.related],['offline',m.offline],['targetPx',m.target],['mapCredit',m.mapCredit],['keyboard',m.keyboard],['labelled',m.labels],['publicationDate',m.date]].map(([key,title])=>kvHtml(locale,title,surface[key])).join('')}</dl></article>`).join('\n');
  const findings = audit.findings.length ? `<ol>${audit.findings.map((item)=>`<li><strong>${escapeHtml(item.code)}</strong>: ${escapeHtml(item.path)} — ${escapeHtml(item.detail)}</li>`).join('')}</ol>` : `<p>${escapeHtml(m.none)}</p>`;
  const css = 'body{font:1rem/1.6 system-ui,sans-serif;max-width:70rem;margin:auto;padding:1rem;color:#181818;background:#fff}a{display:inline-flex;min-width:44px;min-height:44px;align-items:center;color:#07518c}a:focus-visible{outline:3px solid #c65d00;outline-offset:3px}article{border:1px solid #555;padding:1rem;margin:1rem 0;border-radius:.4rem}dl>div{display:grid;grid-template-columns:minmax(9rem,1fr) 2fr;padding:.3rem;border-bottom:1px solid #bbb}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}h1,h2,h3{line-height:1.25}.skip{position:absolute;top:-100px}.skip:focus{top:1rem;background:#fff}summary{cursor:pointer;min-height:44px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{a{color:inherit;text-decoration:underline}body{max-width:none}}';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; script-src 'none'; form-action 'none'; base-uri 'none'"><title>${escapeHtml(m.title)}</title><style>${css}</style></head><body><a class="skip" href="#content">${escapeHtml(m.skip)}</a><header><h1>${escapeHtml(m.title)}</h1><p>${escapeHtml(m.disclaimer)}</p></header><main id="content"><p>${escapeHtml(kvText(locale,m.release,ledger.release))}</p><p role="status">${escapeHtml(audit.blocked?m.blocked:m.clear)}</p><section aria-labelledby="records"><h2 id="records">${escapeHtml(m.records)}</h2>${records}</section><section aria-labelledby="surfaces"><h2 id="surfaces">${escapeHtml(m.surfaces)}</h2>${surfaces}</section><section aria-labelledby="findings"><h2 id="findings">${escapeHtml(m.findings)}</h2>${findings}</section></main></body></html>\n`;
}
export function renderTierJson(input, options = {}) {
  const ledger = parseTierLedger(input);
  const audit = auditTierLedger(ledger,options);
  return `${JSON.stringify({schema:'attribution-tier-report/1',ledger,audit},null,2)}\n`;
}
export function renderComparisonText(before, after, locale = 'en', options = {}) {
  const m = translations(locale);
  const result = compareTierLedgers(before,after,options);
  const lines = [m.changes,kvText(locale,m.before,result.before),kvText(locale,m.after,result.after),kvText(locale,m.status,result.blocked?m.blocked:m.clear)];
  if (!result.changes.length) lines.push(m.noChanges);
  for (const change of result.changes) {
    lines.push(`${change.id}: ${change.kind} (${change.severity}) ${change.field}`);
    lines.push(kvText(locale,m.before,JSON.stringify(change.before)));
    lines.push(kvText(locale,m.after,JSON.stringify(change.after)));
  }
  return `${lines.join('\n')}\n`;
}

/** Structured HTML summary for an explicit before/after comparison. */
export function renderComparisonHtml(before, after, locale = 'en', options = {}) {
  const m = translations(locale);
  const comparison = compareTierLedgers(before, after, options);
  const entries = comparison.changes.length
    ? `<ol>${comparison.changes.map((change) => `<li><strong>${escapeHtml(change.id)}</strong> — ${escapeHtml(change.kind)} (${escapeHtml(change.severity)}): ${escapeHtml(change.field)}<dl>${kvHtml(locale,m.before,JSON.stringify(change.before))}${kvHtml(locale,m.after,JSON.stringify(change.after))}</dl></li>`).join('')}</ol>`
    : `<p>${escapeHtml(m.noChanges)}</p>`;
  return `<section aria-label="${escapeHtml(m.changes)}"><h2>${escapeHtml(m.changes)}</h2><p>${escapeHtml(kvText(locale,m.before,comparison.before))}</p><p>${escapeHtml(kvText(locale,m.after,comparison.after))}</p><p role="status">${escapeHtml(comparison.blocked?m.blocked:m.clear)}</p>${entries}</section>`;
}
