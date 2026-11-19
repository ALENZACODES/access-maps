/** Text, standalone HTML and structured JSON from the same local correction audit. */
export const CORRECTION_COPY = Object.freeze({
  en: Object.freeze({
    title:'Attribution correction review',release:'Release',status:'Status',blocked:'Publication blocked',
    ready:'No blocking evidence gaps in supplied records',sources:'Sources',cases:'Correction cases',
    evidence:'Supporting references',surfaces:'Publication surfaces',findings:'Audit findings',
    changes:'Changes since previous release',none:'No entries',unknown:'UNKNOWN',case:'Case',
    source:'Source',licence:'Licence',permission:'Permission',tier:'Evidence tier',
    datasetDate:'Dataset date',acquired:'Acquisition date',reviewed:'Terms reviewed',
    notice:'Attribution notice',url:'Source URL',licenceUrl:'Licence URL',issue:'Issue type',
    decision:'Decision',decisionNote:'Decision rationale',opened:'Opened on',updated:'Updated on',
    decisionOn:'Decided on',language:'Language',recorded:'Recorded evidence',
    proposed:'Proposed replacement',current:'Current statement',route:'Publication route',
    target:'Minimum control target',offline:'Offline delivery',keyboard:'Keyboard evidence',
    screenReader:'Screen reader evidence',affected:'Affected surfaces',before:'Before',after:'After',
    disclaimer:'This report records supplied evidence and decisions. It does not assess physical access conditions.',
    skip:'Skip to main report',count:'Findings',noChanges:'No changes',local:'Local report',
  }),
  fr: Object.freeze({
    title:'Examen des corrections d’attribution',release:'Version',status:'État',blocked:'Publication bloquée',
    ready:'Aucun élément bloquant dans les dossiers fournis',sources:'Sources',cases:'Dossiers de correction',
    evidence:'Références à l’appui',surfaces:'Vues publiées',findings:'Points à examiner',
    changes:'Changements depuis la version précédente',none:'Aucune entrée',unknown:'UNKNOWN',case:'Dossier',
    source:'Source',licence:'Licence',permission:'Permission',tier:'Niveau de preuve',
    datasetDate:'Données en date du',acquired:'Date d’acquisition',reviewed:'Conditions consultées le',
    notice:'Mention de source',url:'Adresse de la source',licenceUrl:'Adresse de la licence',issue:'Type de problème',
    decision:'Décision',decisionNote:'Motif de la décision',opened:'Ouverture le',updated:'Mise à jour le',
    decisionOn:'Décision du',language:'Langue',recorded:'Renseignements consignés',
    proposed:'Texte proposé',current:'Texte actuel',route:'Page de publication',
    target:'Dimension minimale des cibles',offline:'Hors connexion',keyboard:'Utilisation au clavier',
    screenReader:'Description pour lecteur d’écran',affected:'Vues concernées',before:'Avant',after:'Après',
    disclaimer:'Ce rapport présente les renseignements et les décisions fournis. Il n’évalue pas les conditions d’accès aux lieux.',
    skip:'Aller au rapport principal',count:'Points',noChanges:'Aucun changement',local:'Rapport local',
  }),
});
export function correctionCopy(locale) { return CORRECTION_COPY[locale==='fr'?'fr':'en']; }
export function fieldLabel(locale, name) { return correctionCopy(locale)[name] ?? name; }
export function formatField(locale, name, value) {
  return `${fieldLabel(locale,name)}${locale==='fr'?'\u00a0':''}: ${String(value)}`;
}
export function formatValue(value) { return value === undefined || value === null ? 'UNKNOWN' : Array.isArray(value) ? value.join(', ') : String(value); }
export function escapeHtml(value) {
  return String(value).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');
}
export function listFindingText(findings,locale) {
  const t=correctionCopy(locale);
  if (findings.length===0) return `- ${t.none}`;
  return findings.map(f=>`- [${f.level}] ${f.code} (${f.path}) — ${f.detail}`).join('\n');
}
export function caseText(item,locale) {
  const fields = [
    ['case',item.id],['source',item.sourceId],['issue',item.issue],['status',item.state],
    ['opened',item.openedOn],['updated',item.updatedOn],['language',item.locale],
    ['current',item.currentText],['proposed',item.proposedText],['permission',item.permission],
    ['evidence',item.evidenceIds.join(', ') || 'UNKNOWN'],['decision',item.decision],
    ['decisionOn',item.decisionOn],['decisionNote',item.decisionNote || 'UNKNOWN'],
  ];
  return fields.map(([name,value])=>formatField(locale,name,value)).join('\n');
}
export function sourceText(item,locale) {
  const fields=[['source',item.id],['url',item.sourceUrl],['licence',item.licence],
    ['licenceUrl',item.licenceUrl],['permission',item.permission],['tier',item.tier],
    ['datasetDate',item.datasetDate],['acquired',item.acquisitionDate],['reviewed',item.termsDate],['notice',item.notice]];
  return fields.map(([name,value])=>formatField(locale,name,value)).join('\n');
}
export function surfaceText(item,locale) {
  const fields=[['route',item.route],['language',item.locale],['sources',item.sourceIds.join(', ')],
    ['cases',item.caseIds.join(', ')],['offline',item.offline],['keyboard',item.keyboard],
    ['screenReader',item.screenReader],['target',item.minimumTargetPx],['datasetDate',item.publishedOn]];
  return fields.map(([name,value])=>formatField(locale,name,value)).join('\n');
}
export function renderCorrectionText(register,audit,locale='en',comparison=null) {
  const t=correctionCopy(locale), lines=[t.title,formatField(locale,'release',register.releaseId),
    formatField(locale,'status',audit.blocked||comparison?.blocked?t.blocked:t.ready),'',t.disclaimer,'',
    `${t.findings} (${audit.findings.length})`,listFindingText(audit.findings,locale),'',t.sources];
  if (!register.sources.length) lines.push(t.none);
  for (const item of register.sources) lines.push('',sourceText(item,locale));
  lines.push('',t.cases);
  if (!register.cases.length) lines.push(t.none);
  for (const item of register.cases) lines.push('',caseText(item,locale));
  lines.push('',t.surfaces);
  if (!register.surfaces.length) lines.push(t.none);
  for (const item of register.surfaces) lines.push('',surfaceText(item,locale));
  if (comparison) {
    lines.push('',t.changes);
    if (!comparison.changes.length) lines.push(t.noChanges);
    for (const item of comparison.changes)
      lines.push(`[${item.level}] ${item.kind} — ${item.entity}.${item.field}: ${item.before} → ${item.after}`);
  }
  return `${lines.join('\n')}\n`;
}
export function renderCorrectionJson(register,audit,comparison=null) {
  return `${JSON.stringify({schema:'attribution-correction-report/1',release:register.releaseId,audit,
    comparison,register},null,2)}\n`;
}
function dlRow(locale,name,value) {
  return `<dt>${escapeHtml(fieldLabel(locale,name))}</dt><dd>${escapeHtml(formatValue(value))}</dd>`;
}
function findingList(items,locale) {
  const t=correctionCopy(locale);
  if (!items.length) return `<p>${escapeHtml(t.none)}</p>`;
  return `<ol>${items.map(f=>`<li><strong>${escapeHtml(f.code)}</strong> <span>(${escapeHtml(f.level)})</span><p>${escapeHtml(f.path)} — ${escapeHtml(f.detail)}</p></li>`).join('')}</ol>`;
}
function sourceArticle(item,locale) {
  const keys=['url','licence','licenceUrl','permission','tier','datasetDate','acquired','reviewed','notice'];
  const values={url:item.sourceUrl,licence:item.licence,licenceUrl:item.licenceUrl,permission:item.permission,
    tier:item.tier,datasetDate:item.datasetDate,acquired:item.acquisitionDate,reviewed:item.termsDate,notice:item.notice};
  return `<article><h3>${escapeHtml(item.name)}</h3><dl>${keys.map(k=>dlRow(locale,k,values[k])).join('')}</dl></article>`;
}
function caseArticle(item,locale) {
  const fields=[['source',item.sourceId],['issue',item.issue],['status',item.state],['current',item.currentText],
    ['proposed',item.proposedText],['opened',item.openedOn],['updated',item.updatedOn],['decision',item.decision],
    ['decisionOn',item.decisionOn],['decisionNote',item.decisionNote],['evidence',item.evidenceIds.join(', ')]];
  return `<article><h3>${escapeHtml(item.id)}</h3><p>${escapeHtml(item.summary)}</p><dl>${fields.map(([k,v])=>dlRow(locale,k,v)).join('')}</dl></article>`;
}
function surfaceArticle(item,locale) {
  const fields=[['route',item.route],['language',item.locale],['sources',item.sourceIds.join(', ')],
    ['cases',item.caseIds.join(', ')],['offline',item.offline],['keyboard',item.keyboard],
    ['screenReader',item.screenReader],['target',item.minimumTargetPx]];
  return `<article><h3>${escapeHtml(item.id)}</h3><dl>${fields.map(([k,v])=>dlRow(locale,k,v)).join('')}</dl></article>`;
}
export function renderCorrectionHtml(register,audit,locale='en',comparison=null) {
  const t=correctionCopy(locale),lang=locale==='fr'?'fr':'en';
  const status=audit.blocked||comparison?.blocked?t.blocked:t.ready;
  const css=`:root{color-scheme:light dark}html{font-family:system-ui,sans-serif;line-height:1.55}`+
    `body{background:Canvas;color:CanvasText;margin:auto;max-width:74rem;padding:1rem}`+
    `main{display:block}section,article{margin:1rem 0;padding:.8rem;border:1px solid GrayText}`+
    `dl{display:grid;grid-template-columns:minmax(9rem,1fr) minmax(0,2fr);gap:.4rem}`+
    `dd{margin:0;overflow-wrap:anywhere}a{display:inline-flex;min-width:44px;min-height:44px;align-items:center}`+
    `:focus-visible{outline:3px solid Highlight;outline-offset:3px}`+
    `@media(max-width:45rem){dl{grid-template-columns:1fr}}`+
    `@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`+
    `@media print{a[href='#main']{display:none}}`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">`+
    `<meta name="viewport" content="width=device-width,initial-scale=1">`+
    `<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;">`+
    `<title>${escapeHtml(t.title)}</title><style>${css}</style></head><body>`+
    `<a href="#main">${escapeHtml(t.skip)}</a><header><h1>${escapeHtml(t.title)}</h1>`+
    `<p>${escapeHtml(t.disclaimer)}</p></header><main id="main">`+
    `<p role="status">${escapeHtml(status)}</p><p>${escapeHtml(formatField(lang,'release',register.releaseId))}</p>`+
    `<section aria-labelledby="findings"><h2 id="findings">${escapeHtml(t.findings)}</h2>${findingList(audit.findings,lang)}</section>`+
    `<section aria-labelledby="sources"><h2 id="sources">${escapeHtml(t.sources)}</h2>`+
    `${register.sources.length?register.sources.map(s=>sourceArticle(s,lang)).join(''):`<p>${escapeHtml(t.none)}</p>`}</section>`+
    `<section aria-labelledby="cases"><h2 id="cases">${escapeHtml(t.cases)}</h2>`+
    `${register.cases.length?register.cases.map(s=>caseArticle(s,lang)).join(''):`<p>${escapeHtml(t.none)}</p>`}</section>`+
    `<section aria-labelledby="surfaces"><h2 id="surfaces">${escapeHtml(t.surfaces)}</h2>`+
    `${register.surfaces.length?register.surfaces.map(s=>surfaceArticle(s,lang)).join(''):`<p>${escapeHtml(t.none)}</p>`}</section>`+
    (comparison?`<section aria-labelledby="changes"><h2 id="changes">${escapeHtml(t.changes)}</h2>`+
      `${findingList(comparison.changes.map(c=>({code:c.kind,level:c.level,path:`${c.entity}.${c.field}`,detail:`${c.before} → ${c.after}`})),lang)}</section>`:'')+
    `</main></body></html>\n`;
}
export function correctionFormats(register,audit,locale='en',comparison=null) {
  return {text:renderCorrectionText(register,audit,locale,comparison),
    html:renderCorrectionHtml(register,audit,locale,comparison),
    json:renderCorrectionJson(register,audit,comparison)};
}
