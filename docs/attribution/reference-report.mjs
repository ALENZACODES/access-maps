/** Bilingual offline report. All user input is escaped or emitted as text. */
import { UNKNOWN } from './attribution-utils.mjs';
import { describeSource } from './reference-core.mjs';

export const REFERENCE_COPY = Object.freeze({
  en:Object.freeze({title:'Offline source reference register',release:'Release',status:'Status',blocked:'Publication blocked by missing evidence',clear:'No blocking findings in the supplied register',sources:'Sources',references:'Reference records',surfaces:'Publication surfaces',findings:'Findings',changes:'Changes since the earlier register',none:'None',source:'Source',licence:'Licence',sourceUrl:'Source URL',licenceUrl:'Licence URL',date:'Dataset date',acquired:'Acquired on',terms:'Terms reviewed on',tier:'Evidence tier',permission:'Redistribution permission',reference:'Reference',collected:'Collected on',digest:'Local capture digest',route:'Page route',offline:'Offline',target:'Minimum target size',details:'Details',unknown:'UNKNOWN',skip:'Skip to main content',language:'Language',report:'Export report',open:'Open source link',notice:'Attribution notice',mapCredit:'Credit beside map',warning:'A record does not describe current conditions at a place or service.',before:'Before',after:'After',severity:'Severity',empty:'No records supplied',show:'Show reference details',links:'Source information'}),
  fr:Object.freeze({title:'Registre local des références de sources',release:'Version',status:'État',blocked:'Publication bloquée par des renseignements manquants',clear:'Aucun élément bloquant dans le registre fourni',sources:'Sources',references:'Références',surfaces:'Vues publiées',findings:'Points à examiner',changes:'Changements depuis le registre précédent',none:'Aucun',source:'Source',licence:'Licence',sourceUrl:'Adresse de la source',licenceUrl:'Adresse de la licence',date:'Données en date du',acquired:'Date d’acquisition',terms:'Conditions consultées le',tier:'Niveau de preuve',permission:'Permission de redistribution',reference:'Référence',collected:'Date de collecte',digest:'Empreinte de la copie locale',route:'Chemin de la page',offline:'Hors connexion',target:'Dimension minimale des cibles',details:'Détails',unknown:'UNKNOWN',skip:'Aller au contenu principal',language:'Langue',report:'Exporter le rapport',open:'Ouvrir le lien de la source',notice:'Mention de source',mapCredit:'Crédit près de la carte',warning:'Un enregistrement ne décrit pas les conditions actuelles d’un lieu ou d’un service.',before:'Avant',after:'Après',severity:'Gravité',empty:'Aucun enregistrement fourni',show:'Afficher les détails de la référence',links:'Renseignements sur la source'}),
});
export function escapeReferenceHtml(value) {
  return String(value).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');
}
const e=escapeReferenceHtml;
function line(label, value, locale) {return `${label}${locale==='fr'?'\u00a0:':':'} ${value}`;}
function usableLink(value){
  if(value===UNKNOWN) return false;
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}
function link(value,label) {return usableLink(value)?`<a href="${e(value)}" rel="noopener noreferrer" target="_blank">${e(label)}</a>`:`<span>${e(UNKNOWN)}</span>`;}
function dl(label,value){return `<div class="field"><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;}
function list(items,render,empty){return items.length?items.map(render).join('\n'):`<li>${e(empty)}</li>`;}
export function renderReferenceText(pack,audit,locale='en',comparison=null){
  const t=REFERENCE_COPY[locale]??REFERENCE_COPY.en;
  const parts=[t.title,line(t.release,pack.releaseId,locale),line(t.status,audit.blocked?t.blocked:t.clear,locale),line(t.sources,pack.sources.length,locale),line(t.references,pack.references.length,locale),line(t.surfaces,pack.surfaces.length,locale),t.warning,''];
  parts.push(t.sources);
  for(const source of pack.sources){
    const title=describeSource(source,locale);
    parts.push(`- ${title.id} — ${title.name}`);
    for(const [key,value] of [[t.licence,source.licence],[t.sourceUrl,source.sourceUrl],[t.licenceUrl,source.licenceUrl],[t.date,source.datasetDate],[t.acquired,source.acquiredDate],[t.terms,source.termsDate],[t.tier,source.tier],[t.permission,source.permission],[t.notice,source.notice]])parts.push(`  ${line(key,value,locale)}`);
  }
  parts.push('',t.references);
  for(const ref of pack.references){
    parts.push(`- ${ref.id} (${ref.sourceId}) — ${ref.title}`);
    for(const [key,value] of [[t.sourceUrl,ref.url],[t.licenceUrl,ref.licenceUrl],[t.collected,ref.collectedDate],[t.terms,ref.termsDate],[t.tier,ref.tier],[t.digest,ref.sha256]]) parts.push(`  ${line(key,value,locale)}`);
  }
  parts.push('',t.surfaces);
  for(const surface of pack.surfaces){parts.push(`- ${surface.id} (${surface.language}) ${surface.route}`);parts.push(`  ${line(t.source,surface.sourceIds.join(', ')||UNKNOWN,locale)}`);parts.push(`  ${line(t.reference,surface.referenceIds.join(', ')||UNKNOWN,locale)}`);parts.push(`  ${line(t.offline,surface.offline,locale)}`);parts.push(`  ${line(t.target,surface.targetPx,locale)}`);}
  parts.push('',t.findings);
  for(const finding of audit.findings)parts.push(`- [${finding.level}] ${finding.code} — ${finding.path} — ${finding.subject}${finding.detail?' — '+finding.detail:''}`);
  if(!audit.findings.length)parts.push(t.none);
  if(comparison){parts.push('',t.changes);for(const c of comparison.changes)parts.push(`- ${c.code}: ${c.id} — ${line(t.before,c.before,locale)} — ${line(t.after,c.after,locale)}`);if(!comparison.changes.length)parts.push(t.none);}
  return parts.join('\n')+'\n';
}
export function renderReferenceHtml(pack,audit,locale='en',comparison=null){
  const t=REFERENCE_COPY[locale]??REFERENCE_COPY.en;
  const heading=(id,label)=>`<h2 id="${e(id)}">${e(label)}</h2>`;
  const sources=list(pack.sources,(s)=>`<li><article aria-labelledby="source-${e(s.id)}"><h3 id="source-${e(s.id)}">${e(describeSource(s,locale).name)} (${e(s.id)})</h3><dl>${dl(t.licence,s.licence)}${dl(t.tier,s.tier)}${dl(t.date,s.datasetDate)}${dl(t.acquired,s.acquiredDate)}${dl(t.terms,s.termsDate)}${dl(t.permission,s.permission)}</dl><p>${link(s.sourceUrl,t.sourceUrl)} · ${link(s.licenceUrl,t.licenceUrl)}</p><h4>${e(t.notice)}</h4><pre class="notice">${e(s.notice||UNKNOWN)}</pre></article></li>`,t.empty);
  const refs=list(pack.references,(r)=>`<li><article aria-labelledby="ref-${e(r.id)}"><h3 id="ref-${e(r.id)}">${e(r.title)} (${e(r.id)})</h3><dl>${dl(t.source,r.sourceId)}${dl(t.collected,r.collectedDate)}${dl(t.terms,r.termsDate)}${dl(t.tier,r.tier)}${dl(t.digest,r.sha256)}</dl><p>${link(r.url,t.open)} · ${link(r.licenceUrl,t.licenceUrl)}</p><p>${e(r.offlineNote||UNKNOWN)}</p></article></li>`,t.empty);
  const surfaces=list(pack.surfaces,(s)=>`<li><article><h3>${e(s.id)} (${e(s.language)})</h3><dl>${dl(t.route,s.route)}${dl(t.source,s.sourceIds.join(', ')||UNKNOWN)}${dl(t.reference,s.referenceIds.join(', ')||UNKNOWN)}${dl(t.offline,s.offline)}${dl(t.mapCredit,s.mapCredit)}${dl(t.target,s.targetPx)}</dl></article></li>`,t.empty);
  const findings=list(audit.findings,(f)=>`<li><strong>${e(f.level)} · ${e(f.code)}</strong><p>${e(f.path)} · ${e(f.subject)}${f.detail?` · ${e(f.detail)}`:''}</p></li>`,t.none);
  const changeHtml=comparison?`${heading('changes',t.changes)}<ul>${list(comparison.changes,(c)=>`<li><strong>${e(c.code)}</strong><p>${e(c.id)} · ${e(t.before)} ${e(c.before)} · ${e(t.after)} ${e(c.after)}</p></li>`,t.none)}</ul>`:'';
  return `<!doctype html>\n<html lang="${locale==='fr'?'fr':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>${e(t.title)}</title><style>:root{color-scheme:light dark;font-family:system-ui,sans-serif;line-height:1.55}body{max-width:76rem;margin:auto;padding:1rem}a{display:inline-flex;min-width:44px;min-height:44px;align-items:center}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}ul{padding-inline-start:1.5rem}li{margin-block:1rem}article{border:1px solid currentColor;border-radius:.5rem;padding:1rem;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem}.field{display:contents}dd{margin:0}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media print{body{max-width:none}a{color:inherit;text-decoration:underline}}</style></head><body><a href="#main">${e(t.skip)}</a><header><h1>${e(t.title)}</h1><p>${e(t.warning)}</p></header><main id="main"><p role="status">${e(t.release)}${locale==='fr'?'\u00a0:':':'} ${e(pack.releaseId)}. ${e(audit.blocked?t.blocked:t.clear)}.</p>${heading('sources',t.sources)}<ul>${sources}</ul>${heading('refs',t.references)}<ul>${refs}</ul>${heading('surfaces',t.surfaces)}<ul>${surfaces}</ul>${heading('findings',t.findings)}<ul>${findings}</ul>${changeHtml}</main></body></html>`;
}
export function renderReferenceJson(pack,audit,comparison=null){return JSON.stringify({schema:'attribution-reference-report/1',releaseId:pack.releaseId,blocked:audit.blocked||Boolean(comparison?.blocked),audit,comparison,pack},null,2)+'\n';}
