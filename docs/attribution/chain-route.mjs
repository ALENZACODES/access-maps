import {emptyChain,parseChain,addRow,replaceRow,removeRow,toJson,UNKNOWN} from './chain-core.mjs';
import {auditChain,missingNoticeQueue,missingReceiptQueue,reviewBySurface} from './chain-audit.mjs';
import {sourceReach,disclosurePaths,graphMetrics,explainPath} from './chain-graph.mjs';
import {measureFile,matchMeasurement,canonicalChainHash,receiptMerkleRoot,explainHashLimitations} from './chain-crypto.mjs';
import {compareChains,changedSurfaces,compareCoverage} from './chain-diff.mjs';
import {reportText,reportHtml,summaryJson,tsvMatrix,diffText} from './chain-report.mjs';
import {planFromAudit,repairMetrics} from './chain-repair.mjs';
import {UI,parseLanguage,labelValue} from './chain-copy.mjs';
import {handoffJson,handoffText,handoffCoverage} from './chain-handoff.mjs';
import {evidenceHealth,explicitLanguagePairs} from './chain-coverage.mjs';
/** No external I/O, persistence, analytics, background tasks, or inferred provenance. */
const root=document.getElementById('chain-root');
const live=document.getElementById('chain-status');
if(!root||!live)throw new Error('Evidence chain landmarks are required');
let language=parseLanguage(location.search);
let current=emptyChain();
let previous=null;
let selectedCollection='sources';
let selectedAsset='';
let selectedSource='';
let editing=null;
let filter='all';
let query='';
let measurement=null;
const collections=['sources','assets','surfaces','notices','receipts'];
const t=key=>UI[language][key]??key;
function element(tag,attributes={},text){
  const node=document.createElement(tag);
  for(const [key,value]of Object.entries(attributes)){
    if(key==='className')node.className=value;
    else if(key==='id')node.id=value;
    else if(key==='value')node.value=value;
    else if(key==='type')node.type=value;
    else node.setAttribute(key,String(value));
  }
  if(text!==undefined)node.textContent=String(text);
  return node;
}
const para=(content,cls)=>element('p',cls?{className:cls}:{},content);
const heading=(level,content)=>element(`h${level}`,{},content);
function announce(text){live.textContent=text;}
function action(text,handler){const button=element('button',{type:'button'},text);button.addEventListener('click',handler);return button;}
function group(...children){const div=element('div',{className:'controls'});div.append(...children);return div;}
function field(labelText,control){const label=element('label');label.append(element('span',{},labelText),control);return label;}
function select(options,value,handler){
  const control=element('select');
  for(const option of options){
    const item=element('option',{value:option.value??option},option.label??option);
    control.append(item);
  }
  control.value=value;
  control.addEventListener('change',()=>handler(control.value));
  return control;
}
function download(filename,mime,content){
  try{
    const url=URL.createObjectURL(new Blob([content],{type:mime}));
    const link=element('a',{href:url,download:filename});
    link.hidden=true;document.body.append(link);link.click();link.remove();
    URL.revokeObjectURL(url);
  }catch{announce(t('downloadFailed'));}
}
function safeSet(next,message){
  try{current=parseChain(next);measurement=null;editing=null;render();announce(message??t('update'));}
  catch(error){announce(`${t('importBad')} ${error.message}`);}
}
async function readLocalJson(file,callback){
  if(!file)return;
  if(file.size>1_500_000){announce(t('importBad'));return;}
  try{callback(parseChain(await file.text()));}
  catch(error){announce(`${t('importBad')} ${error.message}`);}
}
function imports(){
  const section=element('section');section.setAttribute('aria-labelledby','chain-import-heading');
  section.append(heading(2,t('import')));section.lastChild.id='chain-import-heading';
  const input=element('input',{type:'file',accept:'application/json,.json'});
  input.addEventListener('change',()=>{
    const file=input.files?.[0];readLocalJson(file,next=>safeSet(next,t('importOk')));
    input.value='';
  });
  const older=element('input',{type:'file',accept:'application/json,.json'});
  older.addEventListener('change',()=>{
    const file=older.files?.[0];readLocalJson(file,next=>{previous=next;render();announce(t('compareOk'));});
    older.value='';
  });
  section.append(group(field(t('import'),input),field(t('compareImport'),older)));
  section.append(group(action(t('new'),()=>{previous=null;safeSet(emptyChain(),t('update'));}),
    action(t('save'),()=>download('evidence-chain.json','application/json',toJson(current))),
    action(t('text'),()=>download(`evidence-findings-${language}.txt`,'text/plain',reportText(current,language))),
    action(t('html'),()=>download(`evidence-report-${language}.html`,'text/html',reportHtml(current,language))),
    action(t('matrix'),()=>download('evidence-coverage.tsv','text/tab-separated-values',tsvMatrix(current))),
    action(t('summary'),()=>download('evidence-audit.json','application/json',summaryJson(current))),
    action(t('repairs'),()=>download('evidence-repairs.json','application/json',JSON.stringify(planFromAudit(current),null,2)+'\n'))));
  return section;
}
function summary(){
  const audit=auditChain(current),metrics=graphMetrics(current),repairs=repairMetrics(planFromAudit(current));
  const section=element('section');section.append(heading(2,t('status')));
  section.append(para(audit.status,'status'),
    para(`${labelValue(language,t('block'),audit.counts.block)} · ${labelValue(language,t('caution'),audit.counts.caution)} · ${labelValue(language,t('info'),audit.counts.info)}`),
    para(`${current.sources.length} ${t('source')} · ${current.assets.length} ${t('asset')} · ${current.notices.length} ${t('notice')} · ${current.receipts.length} ${t('receipt')}`),
    para(`${t('graph')}: ${metrics.nodes} nodes / ${metrics.edges} edges`),
    para(`${t('missingNotices')}: ${missingNoticeQueue(current).length} · ${t('missingReceipts')}: ${missingReceiptQueue(current).length}`),
    para(`Repair items: ${repairs.total}`, 'muted'));
  return section;
}
function defaultRecord(collection){
  const next=(current[collection].length+1).toString();
  if(collection==='sources')return {id:`source-${next}`,label:UNKNOWN,url:UNKNOWN,licence:UNKNOWN,licenceUrl:UNKNOWN,retrievedOn:UNKNOWN,tier:UNKNOWN,credit:UNKNOWN,permission:UNKNOWN,notes:''};
  if(collection==='assets')return {id:`asset-${next}`,label:UNKNOWN,kind:'other',state:'draft',sourceIds:[],parentIds:[],sha256:UNKNOWN,bytes:UNKNOWN,retrievedOn:UNKNOWN,notes:''};
  if(collection==='surfaces')return {id:`view-${next}`,label:UNKNOWN,route:UNKNOWN,locale:language,kind:'map',included:UNKNOWN,mapShown:UNKNOWN,keyboard:UNKNOWN,screenReader:UNKNOWN,focusVisible:UNKNOWN,minimumTargetPx:UNKNOWN};
  if(collection==='notices')return {id:`notice-${next}`,assetId:current.assets[0]?.id??'asset-1',sourceId:current.sources[0]?.id??'source-1',surfaceId:current.surfaces[0]?.id??'view-1',text:UNKNOWN,placement:UNKNOWN,observedOn:UNKNOWN,visible:UNKNOWN,readable:UNKNOWN,keyboard:UNKNOWN,evidenceRef:UNKNOWN};
  return {id:`receipt-${next}`,assetId:current.assets[0]?.id??'asset-1',sourceId:current.sources[0]?.id??'source-1',parentIds:[],contentHash:UNKNOWN,issuedOn:UNKNOWN,tier:UNKNOWN,status:'draft',reviewerRef:UNKNOWN,evidenceRef:UNKNOWN,notes:''};
}
function editor(){
  if(!editing)return null;
  const box=element('section',{id:'chain-editor'});
  const title=heading(2,`${t('json')} — ${editing.collection}`);title.tabIndex=-1;box.append(title);
  const area=element('textarea',{spellcheck:'false',rows:'16'});
  area.value=JSON.stringify(editing.record,null,2);
  box.append(field(t('recordJson'),area));
  const result=para('', 'warning');result.setAttribute('role','status');
  box.append(group(action(t('saveRecord'),()=>{
    try{
      const record=JSON.parse(area.value);
      const next=editing.isNew?addRow(current,editing.collection,record):replaceRow(current,editing.collection,record);
      safeSet(next,t('update'));
    }catch(error){result.textContent=error.message;}
  }),action(t('cancel'),()=>{editing=null;render();})),result);
  return box;
}
function recordList(){
  const box=element('section');box.append(heading(2,t('selected')));
  const tabs=select(collections.map(c=>({value:c,label:t(c.slice(0,-1))||c})),selectedCollection,next=>{selectedCollection=next;editing=null;render();});
  box.append(group(field(t('chooseCollection'),tabs),action(t('add'),()=>{editing={collection:selectedCollection,record:defaultRecord(selectedCollection),isNew:true};render();document.querySelector('#chain-editor h2')?.focus();})));
  if(!current[selectedCollection].length)box.append(para(t('empty')));
  for(const record of current[selectedCollection]){
    const card=element('article');card.append(heading(3,record.label??record.id),para(record.id));
    const meta=element('dl');
    const included=Object.entries(record).filter(([key])=>['licence','retrievedOn','tier','sha256','state','sourceIds','locale','placement','contentHash','issuedOn','status'].includes(key));
    for(const [key,value]of included)meta.append(element('dt',{},key),element('dd',{},Array.isArray(value)?value.join(', ')||UNKNOWN:value));
    card.append(meta,group(action(`${t('edit')}: ${record.id}`,()=>{editing={collection:selectedCollection,record,isNew:false};render();document.querySelector('#chain-editor h2')?.focus();}),
      action(`${t('remove')}: ${record.id}`,()=>{
        if(!window.confirm(t('confirmRemoval')))return;
        try{safeSet(removeRow(current,selectedCollection,record.id));}catch(error){announce(error.message);}
      })));
    box.append(card);
  }
  return box;
}
function findingsPanel(){
  const audit=auditChain(current),box=element('section');box.append(heading(2,t('findings')));
  const finder=element('input',{type:'search',placeholder:t('search'),value:query});
  finder.addEventListener('input',()=>{query=finder.value;refresh();});
  box.append(group(field(t('search'),finder),field(t('filters'),select(['all','block','caution','info'].map(x=>({value:x,label:x==='all'?t('all'):x})),filter,value=>{filter=value;refresh();}))));
  const list=element('div');box.append(list);
  function refresh(){
    list.replaceChildren();
    const entries=audit.findings.filter(x=>(filter==='all'||x.severity===filter)&&(!query||`${x.code} ${x.path} ${x.detail}`.toLowerCase().includes(query.toLowerCase())));
    if(!entries.length)list.append(para(t('noFindings')));
    for(const entry of entries){const item=element('article',{className:`finding-${entry.severity}`});item.append(heading(3,`${entry.severity.toUpperCase()} ${entry.code}`),para(`${entry.path} — ${entry.detail}`));list.append(item);}
  }
  refresh();return box;
}
function missingPanel(){
  const box=element('section'),grid=element('div',{className:'grid'});
  const notices=element('div'),receipts=element('div');
  notices.append(heading(2,t('missingNotices')));
  for(const item of missingNoticeQueue(current))notices.append(para(`${item.assetId} / ${item.sourceId}`));
  if(!missingNoticeQueue(current).length)notices.append(para(t('empty')));
  receipts.append(heading(2,t('missingReceipts')));
  for(const item of missingReceiptQueue(current))receipts.append(para(`${item.assetId} / ${item.sourceId}`));
  if(!missingReceiptQueue(current).length)receipts.append(para(t('empty')));
  grid.append(notices,receipts);box.append(grid);return box;
}
function provenancePanel(){
  const box=element('section');box.append(heading(2,t('sourceImpact')));
  const sources=current.sources.map(x=>({value:x.id,label:x.label}));
  if(!sources.length){box.append(para(t('noSource')));return box;}
  if(!sources.some(x=>x.value===selectedSource))selectedSource=sources[0].value;
  const results=element('div');
  box.append(field(t('chooseSource'),select(sources,selectedSource,value=>{selectedSource=value;refresh();})),results);
  function refresh(){
    results.replaceChildren();
    const impact=sourceReach(current,selectedSource);
    if(!impact){results.append(para(t('noSource')));return;}
    results.append(para(`Assets: ${impact.assetIds.join(', ')||UNKNOWN}`),
      para(`Views: ${impact.surfaceIds.join(', ')||UNKNOWN}`),
      para(`Receipts: ${impact.receiptIds.join(', ')||UNKNOWN}`));
    const paths=disclosurePaths(current,{sourceId:selectedSource});
    for(const path of paths){
      const card=element('article');card.append(heading(3,`${path.sourceId} → ${path.assetId} → ${path.surfaceId}`),
        para(`${t('placement')}: ${path.placement}`),para(path.noticeText));results.append(card);
    }
  }
  refresh();return box;
}
function coveragePanel(){
  const box=element('section');box.append(heading(2,t('viewCoverage')));
  const wrapper=element('div',{className:'table-wrap'}),table=element('table');
  const head=element('thead'),headRow=element('tr');
  for(const key of ['surfaceId','locale','route','noticeCount','blocking'])headRow.append(element('th',{scope:'col'},key));
  head.append(headRow);table.append(head);
  const body=element('tbody');
  for(const row of reviewBySurface(current)){
    const tr=element('tr');
    for(const key of ['surfaceId','locale','route','noticeCount','blocking'])tr.append(element('td',{},row[key]));
    body.append(tr);
  }
  table.append(body);wrapper.append(table);box.append(wrapper);return box;
}
function handoffPanel(){
  const section=element('section');section.append(heading(2,language==='fr'?'Dossier de transmission':'Evidence handoff'));
  const options=current.surfaces.filter(s=>s.included==='yes').map(s=>({value:s.id,label:`${s.label} (${s.locale})`}));
  if(!options.length){section.append(para(t('empty')));return section;}
  let selected=options[0].value;
  const details=element('div');
  const control=select(options,selected,value=>{selected=value;draw();});
  section.append(field(t('surface'),control),details);
  function draw(){
    details.replaceChildren();
    const coverage=handoffCoverage(current,{surfaceIds:[selected]})[0];
    if(!coverage){details.append(para(t('empty')));return;}
    details.append(para(`${t('source')}: ${coverage.sourceIds.join(', ')||UNKNOWN}`),
      para(`${t('notice')}: ${coverage.noticeIds.join(', ')||UNKNOWN}`),
      para(`${t('receipt')}: ${coverage.receipts.join(', ')||UNKNOWN}`));
  }
  draw();
  section.append(group(action(language==='fr'?'Exporter le dossier JSON':'Export handoff JSON',()=>download('evidence-handoff.json','application/json',handoffJson(current,{surfaceIds:[selected]}))),
    action(language==='fr'?'Exporter le dossier en texte':'Export handoff text',()=>download(`evidence-handoff-${language}.txt`,'text/plain',handoffText(current,{surfaceIds:[selected]},language)))));
  const health=evidenceHealth(current);
  section.append(para(`${t('status')}: ${health.publicationStatus} · ${t('block')}: ${health.blocking}`));
  return section;
}
function measurementPanel(){
  const box=element('section');box.append(heading(2,t('measurement')),
    para(explainHashLimitations(), 'warning'));
  const assetOptions=current.assets.map(x=>({value:x.id,label:x.label}));
  if(!assetOptions.length){box.append(para(t('empty')));return box;}
  if(!assetOptions.some(x=>x.value===selectedAsset))selectedAsset=assetOptions[0].value;
  const chosen=select(assetOptions,selectedAsset,value=>{selectedAsset=value;measurement=null;render();});
  const upload=element('input',{type:'file'});
  const output=element('output');output.setAttribute('aria-live','polite');
  box.append(field(t('selectAsset'),chosen),field(t('file'),upload),
    action(t('measure'),async()=>{
      const file=upload.files?.[0];if(!file){announce(t('fileUnknown'));return;}
      try{
        const measured=await measureFile(file),result=matchMeasurement(current,selectedAsset,measured);
        measurement={measured,result};
        output.textContent=`${t('measuredHash')}: ${measured.sha256}\n${result.state} (${result.hash}, ${result.size})`;
        announce(result.state==='matches-record'?t('fileMatch'):result.state==='different'?t('fileDifferent'):t('fileIncomplete'));
      }catch(error){announce(error.message);}
    }),output);
  return box;
}
function comparisonPanel(){
  const box=element('section');box.append(heading(2,t('change')));
  if(!previous){box.append(para(t('noEarlier')));return box;}
  const compared=compareChains(previous,current),affected=changedSurfaces(previous,current);
  box.append(para(`${t('regression')}: ${compared.counts.block}`),
    para(`${t('viewCoverage')}: ${affected.surfaceIds.join(', ')||UNKNOWN}`),
    action(t('text'),()=>download(`evidence-diff-${language}.txt`,'text/plain',diffText(previous,current,language))),
    action(t('summary'),()=>download('evidence-diff.json','application/json',JSON.stringify(compared,null,2)+'\n')));
  for(const change of compared.changes){const card=element('article');card.append(heading(3,`${change.severity.toUpperCase()} ${change.collection}.${change.id}`),para(`${change.kind} — ${change.field}`));box.append(card);}
  if(!compared.changes.length)box.append(para(t('empty')));
  return box;
}
function header(){
  const header=element('header');header.append(heading(1,t('title')),para(t('intro')),para(t('safety'),'warning'));
  const langs=select([{value:'en',label:'English'},{value:'fr',label:'Français'}],language,value=>{language=value;render();});
  const back=element('a',{href:'index.html'},t('back'));
  header.append(group(field(t('language'),langs),back));return header;
}
function render(){
  const sections=[header(),imports(),summary(),recordList()];
  if(editing)sections.push(editor());
  sections.push(findingsPanel(),missingPanel(),provenancePanel(),coveragePanel(),handoffPanel(),measurementPanel(),comparisonPanel(),para(t('note'),'muted'));
  root.replaceChildren(...sections.filter(Boolean));
  document.documentElement.lang=language;
}
render();
