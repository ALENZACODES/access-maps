/** Offline browser entry: explicit file picker, local-only review and export. */
import { CORRECTION_MAX_BYTES, parseCorrectionJson } from './correction-core.mjs';
import { auditCorrections } from './correction-audit.mjs';
import { compareCorrections } from './correction-change.mjs';
import { correctionFormats, correctionCopy } from './correction-report.mjs';
const doc=document;
const byId=id=>doc.getElementById(id);
const state={locale:new URL(location.href).searchParams.get('lang')==='fr'?'fr':'en',current:null,audit:null,comparison:null};
const labels={
  en:{title:'Attribution correction review',intro:'Review local source-correction records. No files are uploaded.',
    language:'Language:',current:'Choose current register',previous:'Choose earlier register (optional)',
    run:'Review cases',saveText:'Export text report',saveHtml:'Export HTML report',saveJson:'Export JSON report',
    print:'Print report',help:'These records do not assess access conditions at places or services.',
    status:'Choose a local JSON register to begin.',error:'Unable to read local register.',
    findings:'Audit findings',cases:'Correction cases',sources:'Recorded sources',changes:'Release changes',
    noFindings:'No findings',noChanges:'No changes',review:'Review results'},
  fr:{title:'Examen des corrections d’attribution',intro:'Consultez les dossiers locaux de correction. Aucun fichier n’est transmis.',
    language:'Langue\u00a0:',current:'Choisir le registre actuel',previous:'Choisir le registre précédent (facultatif)',
    run:'Examiner les dossiers',saveText:'Exporter le rapport texte',saveHtml:'Exporter le rapport HTML',saveJson:'Exporter le rapport JSON',
    print:'Imprimer le rapport',help:'Ces dossiers ne servent pas à évaluer les conditions d’accès aux lieux ou aux services.',
    status:'Choisissez un registre JSON local pour commencer.',error:'Impossible de lire le registre local.',
    findings:'Points à examiner',cases:'Dossiers de correction',sources:'Sources consignées',changes:'Changements entre les versions',
    noFindings:'Aucun point à signaler',noChanges:'Aucun changement',review:'Résultats de l’examen'},
};
function element(tag,content,attributes={}) {
  const node=doc.createElement(tag);
  if(content!==undefined) node.textContent=String(content);
  for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
  return node;
}
function listItems(parent,entries,empty) {
  const list=element('ul');
  if(!entries.length) list.append(element('li',empty));
  for(const entry of entries) list.append(element('li',entry));
  parent.append(list);
}
function render() {
  const root=byId('report'); root.replaceChildren();
  if(!state.current||!state.audit) return;
  const msg=labels[state.locale],copy=correctionCopy(state.locale);
  root.append(element('h2',msg.review));
  root.append(element('p',state.audit.blocked||state.comparison?.blocked?copy.blocked:copy.ready));
  root.append(element('h3',msg.findings));
  listItems(root,state.audit.findings.map(f=>`${f.level}: ${f.code} (${f.path}) — ${f.detail}`),msg.noFindings);
  root.append(element('h3',msg.sources));
  for(const source of state.current.sources) {
    const article=element('article');
    article.append(element('h4',source.name));
    listItems(article,[`${copy.licence}: ${source.licence}`,`${copy.permission}: ${source.permission}`,
      `${copy.datasetDate}: ${source.datasetDate}`,`${copy.tier}: ${source.tier}`,source.notice],msg.noFindings);
    root.append(article);
  }
  root.append(element('h3',msg.cases));
  for(const item of state.current.cases) {
    const article=element('article');
    article.append(element('h4',item.id),element('p',item.summary));
    listItems(article,[`${copy.source}: ${item.sourceId}`,`${copy.decision}: ${item.decision}`,
      `${copy.proposed}: ${item.proposedText || 'UNKNOWN'}`,`${copy.decisionNote}: ${item.decisionNote || 'UNKNOWN'}`],msg.noFindings);
    root.append(article);
  }
  if(state.comparison) {
    root.append(element('h3',msg.changes));
    listItems(root,state.comparison.changes.map(c=>`${c.level}: ${c.kind} (${c.entity}.${c.field}) ${c.before} → ${c.after}`),msg.noChanges);
  }
}
function setStatus(message) { byId('status').textContent=message; }
function language(value) {
  state.locale=value==='fr'?'fr':'en';
  doc.documentElement.lang=state.locale;
  for(const [id,key] of [['title','title'],['intro','intro'],['language-label','language'],
    ['current-label','current'],['previous-label','previous'],['run','run'],
    ['save-text','saveText'],['save-html','saveHtml'],['save-json','saveJson'],
    ['print','print'],['help','help']]) byId(id).textContent=labels[state.locale][key];
  byId('language').value=state.locale;
  if(state.current) {
    render();setStatus(state.audit.blocked||state.comparison?.blocked?correctionCopy(state.locale).blocked:correctionCopy(state.locale).ready);
  } else setStatus(labels[state.locale].status);
  const url=new URL(location.href);url.searchParams.set('lang',state.locale);history.replaceState(null,'',url);
}
async function readLocal(file) {
  if(!file) throw new Error('File required');
  if(file.size>CORRECTION_MAX_BYTES) throw new Error('File too large');
  return parseCorrectionJson(await file.text());
}
async function review() {
  const current=byId('current').files?.[0],previous=byId('previous').files?.[0];
  try {
    const next=await readLocal(current);
    const prior=previous?await readLocal(previous):null;
    const audit=auditCorrections(next);
    const comparison=prior?compareCorrections(prior,next):null;
    state.current=next;state.audit=audit;state.comparison=comparison;
    render();setStatus(audit.blocked||comparison?.blocked?correctionCopy(state.locale).blocked:correctionCopy(state.locale).ready);
    for(const id of ['save-text','save-html','save-json','print']) byId(id).disabled=false;
  } catch(error) {setStatus(`${labels[state.locale].error} ${error instanceof Error?error.message:''}`);}
}
function save(format) {
  if(!state.current||!state.audit) return;
  const report=correctionFormats(state.current,state.audit,state.locale,state.comparison);
  const mime=format==='html'?'text/html':format==='json'?'application/json':'text/plain';
  const url=URL.createObjectURL(new Blob([report[format]],{type:`${mime};charset=utf-8`}));
  const link=element('a');link.href=url;
  link.download=`attribution-corrections-${state.locale}.${format==='text'?'txt':format}`;
  link.click();URL.revokeObjectURL(url);
}
byId('language').addEventListener('change',event=>language(event.target.value));
byId('run').addEventListener('click',()=>{void review();});
for(const format of ['text','html','json']) byId(`save-${format}`).addEventListener('click',()=>save(format));
byId('print').addEventListener('click',()=>window.print());
language(state.locale);
