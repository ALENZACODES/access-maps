/** Directly served, offline-first tier-ledger page; no server or storage. */
import { MAX_DOCUMENT_BYTES, parseTierLedgerJson, UNKNOWN } from './tier-ledger.mjs';
import { auditTierLedger, compareTierLedgers } from './tier-audit.mjs';
import { renderTierHtml, renderTierText, renderTierJson, translations, displayValue } from './tier-report.mjs';
const COPY={
  en:{heading:'Attribution evidence tiers',intro:'Review locally supplied source and licence evidence. Unknown information stays UNKNOWN.',language:'Language',current:'Current release JSON',previous:'Previous release JSON (optional)',review:'Review release',text:'Save text report',html:'Save HTML report',json:'Save JSON report',start:'Choose a local JSON file. Nothing is sent to a server.',empty:'No report loaded.',summary:'Summary',findings:'Findings',sources:'Source records',surfaces:'Publication surfaces',ready:'Report prepared locally',blocked:'Release blocked by missing evidence',error:'Unable to read the selected file',max:'Selected file exceeds size limit',none:'No findings',disclaimer:'This page describes source evidence. It does not assess the accessibility of places or services.',unknown:UNKNOWN,source:'Source',licence:'Licence',date:'Dataset date',tier:'Evidence tier',permission:'Permission',attribution:'Attribution',offline:'Offline',target:'Minimum target',records:'Records'},
  fr:{heading:'Niveaux de preuve des sources',intro:'Consultez les renseignements locaux sur les sources et licences. Les renseignements inconnus restent UNKNOWN.',language:'Langue',current:'Fichier JSON de la version actuelle',previous:'Fichier JSON de la version précédente (facultatif)',review:'Examiner la version',text:'Enregistrer le rapport texte',html:'Enregistrer le rapport HTML',json:'Enregistrer le rapport JSON',start:'Choisissez un fichier JSON local. Aucune donnée n’est transmise à un serveur.',empty:'Aucun rapport chargé.',summary:'Résumé',findings:'Points à examiner',sources:'Fiches de source',surfaces:'Vues publiées',ready:'Rapport préparé localement',blocked:'Publication bloquée en raison de renseignements manquants',error:'Impossible de lire le fichier sélectionné',max:'Le fichier sélectionné dépasse la limite de taille',none:'Aucun point à signaler',disclaimer:'Cette page présente des renseignements sur les sources. Elle n’évalue pas l’accessibilité des lieux ou des services.',unknown:UNKNOWN,source:'Source',licence:'Licence',date:'Données en date du',tier:'Niveau de preuve',permission:'Permission',attribution:'Mention de source',offline:'Hors connexion',target:'Cible minimale',records:'Fiches'},
};
function node(doc,tag,text,className){const element=doc.createElement(tag);if(text!==undefined)element.textContent=String(text);if(className)element.className=className;return element;}
function replace(target,children){target.replaceChildren(...children);}
function label(locale,text,value){return `${text}${locale==='fr'?'\u00a0:':':'} ${displayValue(value,locale)}`;}
function status(doc,text,isError=false){const target=doc.getElementById('status');target.textContent=text;target.classList.toggle('error',isError);}
function pairs(doc,items,locale){const dl=node(doc,'dl');for(const [caption,value] of items){const dt=node(doc,'dt',caption),dd=node(doc,'dd',displayValue(value,locale));dl.append(dt,dd);}return dl;}
function setLocale(doc,locale){
  const copy=COPY[locale];doc.documentElement.lang=locale;doc.title=copy.heading;
  const skip=doc.querySelector('.skip');if(skip)skip.textContent=locale==='fr'?'Aller au contenu principal':'Skip to main content';
  const options=doc.getElementById('language').options;for(const option of options){option.textContent=option.value==='fr'?'Français':'English';}
  for(const [element,key] of [['heading','heading'],['intro','intro'],['language-label','language'],['current-label','current'],['previous-label','previous'],['review','review'],['save-text','text'],['save-html','html'],['save-json','json'],['summary-title','summary'],['details-title','findings'],['sources-title','sources'],['surfaces-title','surfaces'],['disclaimer','disclaimer']]){
    const target=doc.getElementById(element);target.textContent=key==='language'&&locale==='fr'?`${copy.language}\u00a0:`:copy[key];
  }
  return copy;
}
async function readFile(file){
  if(!file)throw new Error('No file chosen');
  if(file.size>MAX_DOCUMENT_BYTES)throw new RangeError('File exceeds size limit');
  const value=await file.text();
  if(new TextEncoder().encode(value).byteLength>MAX_DOCUMENT_BYTES)throw new RangeError('File exceeds size limit');
  return parseTierLedgerJson(value);
}
function fillFindingList(doc,audit,locale,comparison=null){
  const list=doc.getElementById('finding-list');
  const findings=audit.findings.map(f=>node(doc,'li',`${f.code} — ${f.path}: ${f.detail}`));
  for(const change of comparison?.changes??[]){
    findings.push(node(doc,'li',`${change.kind} — ${change.id}: ${change.field} (${change.severity})`));
  }
  replace(list,findings.length?findings:[node(doc,'li',COPY[locale].none)]);
}
function fillRecordList(doc,ledger,locale){
  const m=COPY[locale];
  replace(doc.getElementById('source-list'),ledger.records.map(record=>{
    const article=node(doc,'article');article.append(node(doc,'h3',record.name));
    article.append(pairs(doc,[[m.source,record.id],[m.licence,record.licenceName],[m.date,record.sourceDate],[m.tier,record.tier],[m.permission,record.permission],[m.attribution,record.attribution]],locale));
    return article;
  }));
  replace(doc.getElementById('surface-list'),ledger.surfaces.map(surface=>{
    const article=node(doc,'article');article.append(node(doc,'h3',`${surface.id} (${surface.locale})`));
    article.append(pairs(doc,[[m.records,surface.recordIds],[m.offline,surface.offline],[m.target,surface.targetPx]],locale));return article;
  }));
}
function save(doc,contents,mime,filename){
  const win=doc.defaultView;const url=win.URL.createObjectURL(new Blob([contents],{type:mime}));
  try{const link=node(doc,'a');link.href=url;link.download=filename;link.click();}
  finally{win.URL.revokeObjectURL(url);}
}
export function createTierPage(doc){
  let current=null,previous=null,audit=null;
  let locale=doc.getElementById('language').value==='fr'?'fr':'en';
  setLocale(doc,locale);
  const controls=doc.getElementById('controls');
  const update=()=>{
    const copy=setLocale(doc,locale);
    if(!current){status(doc,copy.start);doc.getElementById('summary-body').textContent=copy.empty;return;}
    audit=auditTierLedger(current);
    const comparison=previous?compareTierLedgers(previous,current):null;
    const blocked=audit.blocked||Boolean(comparison?.blocked);
    status(doc,blocked?copy.blocked:copy.ready,blocked);
    doc.getElementById('summary-body').textContent=label(locale,copy.records,current.records.length);
    fillFindingList(doc,audit,locale,comparison);fillRecordList(doc,current,locale);
  };
  doc.getElementById('language').addEventListener('change',event=>{locale=event.target.value==='fr'?'fr':'en';update();});
  controls.addEventListener('submit',async event=>{
    event.preventDefault();const copy=COPY[locale];
    try{
      const chosen=doc.getElementById('current').files?.[0];
      const old=doc.getElementById('previous').files?.[0];
      const next=await readFile(chosen);
      const prior=old?await readFile(old):null;
      current=next;previous=prior;update();
      for(const id of ['save-text','save-html','save-json'])doc.getElementById(id).disabled=false;
    }catch(error){status(doc,error instanceof RangeError?copy.max:copy.error,true);}
  });
  for(const [id,kind,mime,ext] of [['save-text','text','text/plain;charset=utf-8','txt'],['save-html','html','text/html;charset=utf-8','html'],['save-json','json','application/json;charset=utf-8','json']]){
    doc.getElementById(id).addEventListener('click',()=>{
      if(!current)return;
      const output=kind==='text'?renderTierText(current,locale,audit):kind==='html'?renderTierHtml(current,locale,audit):renderTierJson(current);
      save(doc,output,mime,`attribution-tiers-${current.release}.${ext}`);
    });
  }
  return Object.freeze({getCurrent:()=>current,getPrevious:()=>previous,getLocale:()=>locale,refresh:update});
}
if(typeof document!=='undefined'&&document.getElementById('controls'))createTierPage(document);
