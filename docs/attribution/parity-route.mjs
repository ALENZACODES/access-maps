import { emptyPairs, parsePairs, parsePair, parseInputs, newPair, putPair, dropPair, serializePairs, prospectivePairs, PAIR_STATES, RECORD_STATES, REVIEW_TIERS } from './parity-core.mjs';
import { emptyTrace, parseTrace, UNKNOWN } from './trace-core.mjs';
import { auditParity, compareParity } from './parity-audit.mjs';
import { COPY, findingText, localeFromSearch, labeled, findingReport, findingsTsv } from './parity-copy.mjs';

/** All edits are local and volatile. Nothing is submitted or persisted automatically. */
function elem(doc,tag,text,attributes={}) {
  const node=doc.createElement(tag);
  if(text!==null&&text!==undefined)node.textContent=text;
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
}
function add(parent,...nodes){for(const n of nodes)parent.appendChild(n);return parent;}
function button(doc,text,action){const b=elem(doc,'button',text,{type:'button'});b.addEventListener('click',action);return b;}
function control(doc,text,value,change,options=null) {
  const label=elem(doc,'label',text);
  const input=options?elem(doc,'select'):elem(doc,'input');
  if(options){for(const [key,title] of options)add(input,elem(doc,'option',title,{value:key}));}
  else input.type='text';
  input.value=value;
  input.addEventListener('change',()=>change(input.value));
  add(label,input);
  return label;
}
function fileChoice(doc,title,action) {
  const label=elem(doc,'label',title);
  const field=elem(doc,'input');field.type='file';field.accept='.json,application/json';
  field.addEventListener('change',async()=>{
    const file=field.files?.[0];
    if(!file)return;
    try {if(file.size>1024*1024)throw new Error('File too large');await action(await file.text());}
    catch(error){action(null,error);}
    field.value='';
  });
  add(label,field);return label;
}
function download(doc,filename,text,type='text/plain;charset=utf-8') {
  const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);
  const link=elem(doc,'a');link.href=url;link.download=filename;link.hidden=true;
  doc.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
function normalizedError(err){return err instanceof Error?err.message:String(err);}
export function mountParityInspector(doc,root=doc.getElementById('parity-main'),query='') {
  if(!root)throw new Error('Missing main landmark');
  let locale=localeFromSearch(query),trace=emptyTrace(),hasTrace=false,register=emptyPairs(),earlier=null;
  let selected='all',draft=null;
  const announcer=elem(doc,'p','',{role:'status','aria-live':'polite','aria-atomic':'true',class:'parity-status'});
  function t(){return COPY[locale];}
  function announce(message){announcer.textContent=message;}
  function report(){return hasTrace?auditParity(trace,register):null;}
  function storeTrace(text,error) {
    if(error){announce(`${t().invalid} ${normalizedError(error)}`);return;}
    try {const next=parseTrace(text);parseInputs(next,register);trace=next;hasTrace=true;render();announce(t().loadedTrace);}
    catch(err){announce(`${t().invalid} ${normalizedError(err)}`);}
  }
  function storePairs(text,error) {
    if(error){announce(`${t().invalid} ${normalizedError(error)}`);return;}
    try {const next=parsePairs(text);if(hasTrace)parseInputs(trace,next);register=next;render();announce(t().loadedPairs);}
    catch(err){announce(`${t().invalid} ${normalizedError(err)}`);}
  }
  function pairOptions(side){
    if(!hasTrace)return [];
    return trace.surfaces.filter(s=>s.locale===side).map(s=>[s.id,`${s.label} (${s.id})`]);
  }
  function beginPair(){
    if(!hasTrace){announce(t().traceMissing);return;}
    const free=prospectivePairs(trace,register);
    if(!free.en.length||!free.fr.length){announce(t().empty);return;}
    let i=1;const ids=new Set(register.pairs.map(x=>x.id));while(ids.has(`pair${i}`))i++;
    draft=newPair(`pair${i}`,free.en[0].id,free.fr[0].id);render();doc.querySelector('#parity-editor h2')?.focus();
  }
  function formForPair(){
    const section=elem(doc,'section',null,{id:'parity-editor',class:'parity-card'});
    add(section,elem(doc,'h2',t().add,{tabindex:'-1'}));
    const fields=elem(doc,'div',null,{class:'parity-grid'});
    function update(key,value){draft={...draft,[key]:value};}
    const stringFields=[['id','pairId'],['reviewedOn','date'],['evidenceUrl','reference'],['notes','notes']];
    for(const [key,label] of stringFields)add(fields,control(doc,t()[label],draft[key],value=>update(key,value)));
    add(fields,control(doc,t().selectEnglish,draft.enSurfaceId,value=>update('enSurfaceId',value),pairOptions('en')));
    add(fields,control(doc,t().selectFrench,draft.frSurfaceId,value=>update('frSurfaceId',value),pairOptions('fr')));
    add(fields,control(doc,t().state,draft.state,value=>update('state',value),PAIR_STATES.map(x=>[x,x])));
    add(fields,control(doc,t().tier,draft.reviewTier,value=>update('reviewTier',value),REVIEW_TIERS.map(x=>[x,x])));
    add(fields,control(doc,t().observation,draft.parityObserved,value=>update('parityObserved',value),RECORD_STATES.map(x=>[x,x])));
    const actions=elem(doc,'div',null,{class:'parity-actions'});
    add(actions,button(doc,t().update,()=>{
      try {const next=putPair(register,parsePair(draft));parseInputs(trace,next);register=next;draft=null;render();announce(t().saved);}
      catch(error){announce(`${t().invalid} ${normalizedError(error)}`);}
    }),button(doc,locale==='fr'?'Annuler':'Cancel',()=>{draft=null;render();}));
    add(section,fields,actions);return section;
  }
  function pairList(){
    const section=elem(doc,'section',null,{class:'parity-card'});
    add(section,elem(doc,'h2',t().paired));
    if(!register.pairs.length)add(section,elem(doc,'p',t().empty));
    const list=elem(doc,'ul',null,{class:'parity-list'});
    for(const row of register.pairs){
      const li=elem(doc,'li');
      add(li,elem(doc,'strong',row.id),elem(doc,'p',`${row.enSurfaceId} / ${row.frSurfaceId} · ${row.state}`));
      const group=elem(doc,'div',null,{class:'parity-actions'});
      add(group,button(doc,`${locale==='fr'?'Modifier':'Edit'} ${row.id}`,()=>{draft={...row};render();doc.querySelector('#parity-editor h2')?.focus();}),button(doc,`${t().remove} ${row.id}`,()=>{
        register=dropPair(register,row.id);render();announce(t().removed);
      }));add(li,group);list.appendChild(li);
    }add(section,list);return section;
  }
  function findingsView(result){
    const section=elem(doc,'section',null,{class:'parity-card'});
    add(section,elem(doc,'h2',t().findings));
    const pairChoices=[['all',t().all],...register.pairs.map(x=>[x.id,x.id])];
    add(section,control(doc,t().filter,selected,value=>{selected=value;render();},pairChoices));
    if(!result){add(section,elem(doc,'p',t().traceMissing));return section;}
    add(section,elem(doc,'p',`${labeled(locale,t().blocking,result.counts.blocking)} · ${labeled(locale,t().attention,result.counts.attention)}`));
    const issues=result.findings.filter(x=>selected==='all'||x.pairId===selected);
    if(!issues.length)add(section,elem(doc,'p',t().none));
    const list=elem(doc,'ol',null,{class:'parity-list'});
    for(const issue of issues){
      const li=elem(doc,'li',null,{class:`parity-finding ${issue.severity}`});
      add(li,elem(doc,'strong',`${issue.pairId} · ${issue.side} · ${issue.sourceId}`),elem(doc,'p',findingText(locale,issue.code)));
      list.appendChild(li);
    }
    add(section,list);return section;
  }
  function unpaired(){
    const section=elem(doc,'section',null,{class:'parity-card'});
    add(section,elem(doc,'h2',t().unpaired));
    if(!hasTrace){add(section,elem(doc,'p',t().traceMissing));return section;}
    const rows=prospectivePairs(trace,register);
    for(const language of ['en','fr']){
      add(section,elem(doc,'h3',language==='fr'?'Français':'English'));
      if(!rows[language].length)add(section,elem(doc,'p',t().none));
      const list=elem(doc,'ul');
      for(const row of rows[language])add(list,elem(doc,'li',`${row.label} (${row.id}) · ${row.route}`));
      add(section,list);
    }
    return section;
  }
  function tools(result){
    const section=elem(doc,'section',null,{class:'parity-card'});
    add(section,elem(doc,'h2',t().report),elem(doc,'p',t().instructions));
    const inputs=elem(doc,'div',null,{class:'parity-grid'});
    add(inputs,fileChoice(doc,t().importTrace,storeTrace),fileChoice(doc,t().importPairs,storePairs));
    if(hasTrace)add(inputs,fileChoice(doc,t().comparison,async(text,error)=>{
      if(error){announce(t().invalid);return;}
      try {const old=parsePairs(text);parseInputs(trace,old);earlier=old;render();announce(t().loaded);}
      catch(e){announce(`${t().invalid} ${normalizedError(e)}`);}
    }));
    add(section,inputs);
    const actions=elem(doc,'div',null,{class:'parity-actions'});
    add(actions,button(doc,t().add,beginPair),button(doc,t().exportPairs,()=>download(doc,'locale-pairs.json',serializePairs(register),'application/json')));
    if(result){
      add(actions,button(doc,t().exportFindings,()=>download(doc,`locale-parity-${locale}.txt`,findingReport(result,locale))),
        button(doc,t().exportTsv,()=>download(doc,'locale-parity-findings.tsv',findingsTsv(result),'text/tab-separated-values')));
    }
    add(section,actions);
    if(earlier&&hasTrace){const change=compareParity(trace,earlier,trace,register);
      add(section,elem(doc,'h3',t().comparisonTitle),elem(doc,'p',`${labeled(locale,t().introduced,change.introduced.length)} · ${labeled(locale,t().resolved,change.resolved.length)}`));
    }
    return section;
  }
  function render(){
    const result=report();
    const heading=elem(doc,'header',null,{class:'parity-header'});
    add(heading,elem(doc,'h1',t().title),elem(doc,'p',t().intro),elem(doc,'p',t().caution));
    const localeSelect=control(doc,t().language,locale,val=>{locale=val==='fr'?'fr':'en';render();},[['en','English'],['fr','Français']]);
    add(heading,localeSelect,elem(doc,'a',t().back,{href:'index.html'}));
    const sections=[heading,announcer,tools(result)];
    if(draft)sections.push(formForPair());
    sections.push(pairList(),unpaired(),findingsView(result));
    root.replaceChildren(...sections);doc.documentElement.lang=locale;
  }
  render();
  return {getPairs:()=>parsePairs(register),getTrace:()=>parseTrace(trace),getReport:()=>report(),setTrace:input=>storeTrace(input),setPairs:input=>storePairs(input),getLocale:()=>locale};
}
if(typeof document!=='undefined')mountParityInspector(document,document.getElementById('parity-main'),window.location.search);
