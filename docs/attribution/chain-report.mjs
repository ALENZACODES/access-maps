/** Human-readable outputs; all supplied data is escaped or spreadsheet-safe. */
import {parseChain,UNKNOWN} from './chain-core.mjs';
import {auditChain,reviewBySurface,missingNoticeQueue,missingReceiptQueue} from './chain-audit.mjs';
import {disclosurePaths,graphMetrics} from './chain-graph.mjs';
import {compareChains,changedSurfaces,compareCoverage} from './chain-diff.mjs';
export const COPY=Object.freeze({
  en:Object.freeze({title:'Attribution evidence chain',intro:'Review supplied source, file, notice and receipt evidence. A completed record is not a certification.',
    source:'Source',asset:'Asset',surface:'Publication view',notice:'Displayed credit',receipt:'Custody receipt',licence:'Licence',
    retrieved:'Retrieved on',tier:'Evidence tier',credit:'Required credit',permission:'Distribution permission',
    hash:'Recorded SHA-256',observed:'Observed on',placement:'Placement',evidence:'Evidence reference',
    findings:'Evidence gaps',blocks:'Blocking findings',cautions:'Items to review',summary:'Review summary',
    unknown:'UNKNOWN',status:'Status',noRecords:'No records supplied.',disclaimer:'The App does not establish source authenticity, legal permission or accessibility of a place.',
    before:'Previous evidence package',after:'Candidate evidence package',change:'Change',route:'Local route',
    missingNotices:'Missing notice placements',missingReceipts:'Missing source receipts',
    comparison:'Changes between evidence packages',noChange:'No recorded change',methods:'Recorded interaction checks'}),
  fr:Object.freeze({title:'Chaîne des preuves d’attribution',intro:'Examinez les preuves fournies sur les sources, fichiers, mentions et reçus. Une fiche complète n’est pas une certification.',
    source:'Source',asset:'Fichier',surface:'Vue publiée',notice:'Mention affichée',receipt:'Reçu de traçabilité',licence:'Licence',
    retrieved:'Date de récupération',tier:'Niveau de preuve',credit:'Mention requise',permission:'Autorisation de diffusion',
    hash:'SHA-256 consigné',observed:'Observation le',placement:'Emplacement',evidence:'Référence de preuve',
    findings:'Lacunes dans les preuves',blocks:'Constats bloquants',cautions:'Points à examiner',summary:'Résumé de l’examen',
    unknown:'UNKNOWN',status:'État',noRecords:'Aucune fiche fournie.',disclaimer:'L’App n’établit ni l’authenticité des sources, ni les droits juridiques, ni l’accessibilité des lieux.',
    before:'Dossier précédent',after:'Dossier candidat',change:'Changement',route:'Chemin local',
    missingNotices:'Mentions manquantes',missingReceipts:'Reçus manquants',
    comparison:'Changements entre dossiers de preuves',noChange:'Aucun changement consigné',methods:'Contrôles d’interaction consignés'})
});
const localeOf=x=>x==='fr'?'fr':'en';
const colon=locale=>locale==='fr'?'\u00a0: ':': ';
function label(locale,text,value){return `${text}${colon(locale)}${value}`;}
export function reportText(input,locale='en'){
  const lang=localeOf(locale),c=COPY[lang],chain=parseChain(input),audit=auditChain(chain),graph=graphMetrics(chain);
  const lines=[c.title,chain.title,c.intro,c.disclaimer,'',label(lang,c.status,audit.status),
    label(lang,c.blocks,audit.counts.block),label(lang,c.cautions,audit.counts.caution),
    `Graph nodes: ${graph.nodes}; edges: ${graph.edges}`,''];
  for(const source of chain.sources){lines.push(label(lang,c.source,`${source.label} (${source.id})`),
    label(lang,c.licence,source.licence),label(lang,c.retrieved,source.retrievedOn),
    label(lang,c.tier,source.tier),label(lang,c.credit,source.credit),
    label(lang,c.permission,source.permission),'');}
  for(const asset of chain.assets){lines.push(label(lang,c.asset,`${asset.label} (${asset.id})`),
    label(lang,c.hash,asset.sha256),label(lang,c.status,asset.state),
    label(lang,c.source,asset.sourceIds.join(', ')||UNKNOWN),'');}
  for(const row of disclosurePaths(chain)){lines.push(label(lang,c.surface,`${row.surfaceId} (${row.surfaceLocale})`),
    label(lang,c.source,row.sourceId),label(lang,c.asset,row.assetId),
    label(lang,c.notice,row.noticeText),label(lang,c.placement,row.placement),
    label(lang,c.observed,row.observedOn),label(lang,c.evidence,row.evidenceRef),'');}
  for(const receipt of chain.receipts){lines.push(label(lang,c.receipt,receipt.id),label(lang,c.asset,receipt.assetId),
    label(lang,c.source,receipt.sourceId),label(lang,c.hash,receipt.contentHash),
    label(lang,c.retrieved,receipt.issuedOn),'');}
  lines.push(c.findings);
  for(const item of audit.findings)lines.push(`${item.severity.toUpperCase()} ${item.code} — ${item.path} (${item.detail})`);
  if(!audit.findings.length)lines.push(c.noRecords);
  return `${lines.join('\n')}\n`;
}
export function diffText(previous,candidate,locale='en'){
  const lang=localeOf(locale),c=COPY[lang],diff=compareChains(previous,candidate),impacted=changedSurfaces(previous,candidate),coverage=compareCoverage(previous,candidate);
  const lines=[c.comparison,label(lang,c.before,diff.beforeId),label(lang,c.after,diff.afterId),
    label(lang,c.blocks,diff.counts.block),label(lang,c.change,diff.changes.length),
    label(lang,c.surface,impacted.surfaceIds.join(', ')||UNKNOWN),c.disclaimer,''];
  for(const item of diff.changes)lines.push(`${item.severity.toUpperCase()} ${item.collection}.${item.id}.${item.field} — ${item.kind}`);
  for(const row of coverage)lines.push(`${row.surfaceId}: notices ${row.oldNotices} -> ${row.newNotices}; blocking ${row.oldBlocking} -> ${row.newBlocking}`);
  if(!diff.changes.length)lines.push(c.noChange);
  return `${lines.join('\n')}\n`;
}
function escapeHtml(value){return String(value??UNKNOWN).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function h(tag,content){return `<${tag}>${escapeHtml(content)}</${tag}>`;}
const row=(...cells)=>`<tr>${cells.map((v,i)=>h(i?'td':'th',v)).join('')}</tr>`;
export function reportHtml(input,locale='en'){
  const lang=localeOf(locale),c=COPY[lang],chain=parseChain(input),audit=auditChain(chain),surfaces=reviewBySurface(chain);
  const sourceRows=chain.sources.map(x=>row(x.label,x.licence,x.retrievedOn,x.credit,x.permission)).join('');
  const assetRows=chain.assets.map(x=>row(x.label,x.sha256,x.state,x.sourceIds.join(', '))).join('');
  const surfaceRows=surfaces.map(x=>row(x.surfaceId,x.locale,x.route,x.noticeCount,x.blocking)).join('');
  const issues=audit.findings.map(x=>`<li>${h('strong',x.code)} ${h('code',x.path)} ${escapeHtml(x.detail)}</li>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';img-src 'none';connect-src 'none';base-uri 'none';form-action 'none'"><title>${escapeHtml(c.title)} — the App</title><style>body{font:1rem/1.6 system-ui;max-width:76rem;margin:auto;padding:1rem}table{border-collapse:collapse;width:100%;overflow-wrap:anywhere}th,td{padding:.5rem;border:1px solid currentColor;text-align:left}li{padding:.25rem}*:focus-visible{outline:3px solid currentColor;outline-offset:3px}</style></head><body><main><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(chain.title)}</p><p>${escapeHtml(c.intro)}</p><p>${escapeHtml(c.disclaimer)}</p><h2>${escapeHtml(c.source)}</h2><table><tbody>${sourceRows}</tbody></table><h2>${escapeHtml(c.asset)}</h2><table><tbody>${assetRows}</tbody></table><h2>${escapeHtml(c.surface)}</h2><table><tbody>${surfaceRows}</tbody></table><h2>${escapeHtml(c.findings)} (${audit.counts.block})</h2><ul>${issues}</ul></main></body></html>`;
}
function safeCell(value){
  let result=String(value??UNKNOWN).replace(/[\u0000-\u001f\u007f]/gu,' ');
  if(/^[\s]*[=+@-]/u.test(result))result=`'${result}`;
  return `"${result.replaceAll('"','""')}"`;
}
export function tsvMatrix(input){
  const rows=[['Asset','State','Hash','Source ID','Source','Licence','Retrieved','Tier','Permission','Notices','Receipts']];
  for(const row of parseChain(input).assets){
    const chain=parseChain(input);
    for(const sourceId of row.sourceIds){
      const source=chain.sources.find(x=>x.id===sourceId);
      rows.push([row.id,row.state,row.sha256,source.id,source.label,source.licence,source.retrievedOn,source.tier,source.permission,
        chain.notices.filter(x=>x.assetId===row.id&&x.sourceId===sourceId).length,
        chain.receipts.filter(x=>x.assetId===row.id&&x.sourceId===sourceId).length]);
    }
  }
  return `${rows.map(row=>row.map(safeCell).join('\t')).join('\n')}\n`;
}
export function tsvFindings(input){
  const audit=auditChain(input),rows=[['Severity','Code','Path','Detail'],...audit.findings.map(x=>[x.severity,x.code,x.path,x.detail])];
  return `${rows.map(row=>row.map(safeCell).join('\t')).join('\n')}\n`;
}
export function summaryJson(input){
  const chain=parseChain(input);
  return `${JSON.stringify({schema:'map-evidence-chain-summary/1',chainId:chain.id,audit:auditChain(chain),
    surfaces:reviewBySurface(chain),missingNotices:missingNoticeQueue(chain),missingReceipts:missingReceiptQueue(chain),
    graph:graphMetrics(chain)},null,2)}\n`;
}
export function languageMessages(locale){return COPY[localeOf(locale)];}
