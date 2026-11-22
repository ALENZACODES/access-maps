import {parseChecklist,emptyChecklist,newSource,newView,newObservation,mutateChecklist,removeChecklistRecord,serializeChecklist,UNKNOWN,STATES,TIERS,METHODS,PLACEMENTS,ChecklistError,MAX_BYTES} from './checklist-core.mjs';
import {auditChecklist,missingChecklistSlots,checklistMatrix,matrixTsv,compareChecklists} from './checklist-audit.mjs';
import {COPY,FIELD_LABELS,localeFromSearch,labelled,reportText} from './checklist-copy.mjs';

/** Progressive standalone editor. All untrusted content uses textContent. */
function el(doc,tag,content,attributes={}){
  const item=doc.createElement(tag);
  if(content!==undefined&&content!==null)item.textContent=String(content);
  for(const [key,value] of Object.entries(attributes))item.setAttribute(key,String(value));
  return item;
}
function append(parent,...nodes){for(const node of nodes)parent.appendChild(node);return parent;}
function action(doc,caption,callback){const item=el(doc,'button',caption,{type:'button'});item.addEventListener('click',callback);return item;}
function field(doc,caption,key,value,options=null){
  const label=el(doc,'label',caption,{class:'checklist-field'});
  const control=options?el(doc,'select'):key==='credit'||key==='noticeText'||key==='evidence'?el(doc,'textarea'):el(doc,'input');
  control.name=key;
  if(options){for(const option of options)control.appendChild(el(doc,'option',option,{value:option}));}
  else if(control.tagName==='INPUT')control.type='text';
  control.value=Array.isArray(value)?value.join(', '):String(value??UNKNOWN);
  label.appendChild(control);return label;
}
function download(doc,content,filename,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const link=el(doc,'a');link.href=url;link.download=filename;link.hidden=true;doc.body.appendChild(link);
  link.click();link.remove();URL.revokeObjectURL(url);
}
function formValues(form){const value={};for(const element of form.elements)if(element.name)value[element.name]=element.value;return value;}
const SOURCE_FIELDS=['id','name','sourceUrl','licence','licenceUrl','retrievedOn','datasetDate','tier','permission','credit'];
const VIEW_FIELDS=['id','title','route','locale','kind','included','sourceIds','mapCreditNearMap'];
const OBSERVATION_FIELDS=['id','viewId','sourceId','method','observedOn','noticeText','placement','noticePresent','licenceAvailable','keyboardReachable','screenReaderReadable','focusVisible','targetPx','evidence'];
const OPTIONS={tier:TIERS,permission:STATES,locale:['en','fr'],kind:['map','list','journey'],included:STATES,mapCreditNearMap:STATES,method:METHODS,placement:PLACEMENTS,noticePresent:STATES,licenceAvailable:STATES,keyboardReachable:STATES,screenReaderReadable:STATES,focusVisible:STATES};
const COLLECTIONS={source:'sources',view:'views',observation:'observations'};
const FIELDS={source:SOURCE_FIELDS,view:VIEW_FIELDS,observation:OBSERVATION_FIELDS};
export function parseEditorRecord(kind,form){
  if(!FIELDS[kind])throw new ChecklistError('COLLECTION','form','Unknown record type');
  const result={};
  for(const key of FIELDS[kind])result[key]=form[key];
  if(kind==='view')result.sourceIds=String(result.sourceIds).split(',').map(x=>x.trim()).filter(Boolean);
  if(kind==='observation'&&result.targetPx!==UNKNOWN)result.targetPx=Number(result.targetPx);
  return result;
}
export function mountChecklist(doc,root=doc.querySelector('main'),search=''){
  if(!root)throw new Error('Main landmark required');
  let locale=localeFromSearch(search);
  let state=emptyChecklist();
  let baseline=null;
  let editor=null;
  let selectedView='';
  const live=el(doc,'p','',{role:'status','aria-live':'polite','aria-atomic':'true',class:'checklist-status'});
  const t=()=>COPY[locale];
  const f=()=>FIELD_LABELS[locale];
  const announce=value=>{live.textContent=value;};
  function tryUpdate(next,message){
    try{state=parseChecklist(next);editor=null;render();announce(message??t().saved);}
    catch(error){announce(`${t().error} ${error.message}`);}
  }
  function heading(text,level=2){return el(doc,`h${level}`,text);}
  function controls(){
    const section=el(doc,'section',null,{class:'checklist-panel'});
    append(section,heading(t().help),el(doc,'p',t().status));
    const language=field(doc,t().language,'language',locale,['en','fr']);
    language.querySelector('select').addEventListener('change',event=>{locale=event.target.value;render();});
    section.appendChild(language);
    const label=el(doc,'label',t().name,{class:'checklist-field'});
    const title=el(doc,'input',null,{type:'text',maxlength:'200'});title.value=state.title;
    title.addEventListener('change',()=>tryUpdate({...state,title:title.value}));label.appendChild(title);section.appendChild(label);
    const tools=el(doc,'div',null,{class:'checklist-actions'});
    const pickerLabel=el(doc,'label',t().import,{class:'checklist-field'});
    const picker=el(doc,'input',null,{type:'file',accept:'.json,application/json'});
    picker.addEventListener('change',()=>{const file=picker.files?.[0];picker.value='';if(!file)return;
      if(file.size>MAX_BYTES){announce(t().error);return;}
      file.text().then(value=>tryUpdate(value,t().loaded)).catch(()=>announce(t().error));
    });pickerLabel.appendChild(picker);tools.appendChild(pickerLabel);
    const compareLabel=el(doc,'label',t().compare,{class:'checklist-field'});
    const comparePicker=el(doc,'input',null,{type:'file',accept:'.json,application/json'});
    comparePicker.addEventListener('change',()=>{const file=comparePicker.files?.[0];comparePicker.value='';if(!file)return;
      if(file.size>MAX_BYTES){announce(t().error);return;}
      file.text().then(value=>{try{baseline=parseChecklist(value);render();announce(t().loaded);}catch(error){announce(`${t().error} ${error.message}`);}}).catch(()=>announce(t().error));
    });compareLabel.appendChild(comparePicker);tools.appendChild(compareLabel);
    append(tools,
      action(doc,t().export,()=>download(doc,serializeChecklist(state),'notice-publication-checklist.json','application/json')),
      action(doc,t().report,()=>download(doc,reportText(auditChecklist(state),locale),`notice-findings-${locale}.txt`,'text/plain;charset=utf-8')),
      action(doc,t().matrix,()=>download(doc,matrixTsv(checklistMatrix(state)),'notice-coverage.tsv','text/tab-separated-values;charset=utf-8')),
      action(doc,t().new,()=>tryUpdate(emptyChecklist(),t().saved)));
    section.appendChild(tools);
    return section;
  }
  function defaultRecord(kind){
    const next=state[COLLECTIONS[kind]].length+1;
    const value=kind==='source'?newSource(`source${next}`):kind==='view'?newView(`view${next}`):newObservation(`observation${next}`,state.views[0]?.id??'view1',state.views[0]?.sourceIds[0]??'source1','visual');
    return value;
  }
  function recordEditor(){
    if(!editor)return null;
    const section=el(doc,'section',null,{class:'checklist-panel',id:'checklist-editor'});
    const h=heading(labelled(t().edit,editor.kind,locale));h.tabIndex=-1;section.appendChild(h);
    const form=el(doc,'form');const fields=el(doc,'div',null,{class:'checklist-fields'});
    for(const key of FIELDS[editor.kind])fields.appendChild(field(doc,f()[key]??key,key,editor.value[key],OPTIONS[key]));
    form.appendChild(fields);
    const actions=el(doc,'div',null,{class:'checklist-actions'});
    const submit=el(doc,'button',t().save,{type:'submit'});actions.appendChild(submit);
    actions.appendChild(action(doc,t().cancel,()=>{editor=null;render();}));form.appendChild(actions);
    form.addEventListener('submit',event=>{event.preventDefault();try{
      const record=parseEditorRecord(editor.kind,formValues(form));
      const collection=COLLECTIONS[editor.kind];
      const cleaned=editor.oldId&&editor.oldId!==record.id?{...state,[collection]:state[collection].filter(x=>x.id!==editor.oldId)}:state;
      tryUpdate(mutateChecklist(cleaned,collection,record));
    }catch(error){announce(`${t().error} ${error.message}`);}});
    section.appendChild(form);return section;
  }
  function startEdit(kind,value,oldId=null){editor={kind,value,oldId};render();root.querySelector('#checklist-editor h2')?.focus();}
  function records(kind){
    const section=el(doc,'section',null,{class:'checklist-panel'});
    append(section,heading(t()[COLLECTIONS[kind]]),action(doc,`${t().add} ${t()[COLLECTIONS[kind]]}`,()=>startEdit(kind,defaultRecord(kind))));
    if(!state[COLLECTIONS[kind]].length)section.appendChild(el(doc,'p',t().none));
    for(const record of state[COLLECTIONS[kind]]){
      const article=el(doc,'article',null,{class:'checklist-record'});
      const summary=kind==='source'?`${record.name} · ${record.licence} · ${record.retrievedOn} · ${record.tier}`:kind==='view'?`${record.title} · ${record.route} · ${record.locale}`:`${record.viewId} / ${record.sourceId} / ${record.method}`;
      append(article,heading(record.id,3),el(doc,'p',summary));
      const actions=el(doc,'div',null,{class:'checklist-actions'});
      append(actions,action(doc,labelled(t().edit,record.id,locale),()=>startEdit(kind,record,record.id)),
        action(doc,labelled(t().remove,record.id,locale),()=>tryUpdate(removeChecklistRecord(state,COLLECTIONS[kind],record.id),t().removed)));
      article.appendChild(actions);section.appendChild(article);
    }
    return section;
  }
  function missing(){
    const section=el(doc,'section',null,{class:'checklist-panel'});section.appendChild(heading(t().missing));
    const slots=missingChecklistSlots(state);
    if(!slots.length)section.appendChild(el(doc,'p',t().none));
    for(const slot of slots){
      const row=el(doc,'div',null,{class:'checklist-record'});
      row.appendChild(el(doc,'p',`${slot.viewId} / ${slot.sourceId} / ${slot.method}`));
      const ids=new Set(state.observations.map(x=>x.id));let n=state.observations.length+1;while(ids.has(`observation${n}`))n++;
      row.appendChild(action(doc,labelled(t().add,slot.method,locale),()=>startEdit('observation',newObservation(`observation${n}`,slot.viewId,slot.sourceId,slot.method))));
      section.appendChild(row);
    }
    return section;
  }
  function findings(){
    const result=auditChecklist(state);
    const section=el(doc,'section',null,{class:'checklist-panel'});
    append(section,heading(labelled(t().findings,result.totals.block,locale)));
    const choices=['',...state.views.map(x=>x.id)];const selector=field(doc,t().filter,'viewFilter',selectedView,choices);
    selector.querySelector('option').textContent=t().all;
    selector.querySelector('select').addEventListener('change',event=>{selectedView=event.target.value;render();});
    section.appendChild(selector);
    const filtered=result.findings.filter(issue=>!selectedView||issue.viewId===selectedView);
    if(!filtered.length)section.appendChild(el(doc,'p',t().ready));
    const list=el(doc,'ul',null,{class:'checklist-issues'});
    for(const issue of filtered)list.appendChild(el(doc,'li',`${issue.severity.toUpperCase()} · ${issue.code} · ${issue.viewId} / ${issue.sourceId} / ${issue.method}`));
    section.appendChild(list);
    if(baseline){const comparison=compareChecklists(baseline,state);
      section.appendChild(heading(t().comparison,3));
      append(section,el(doc,'p',labelled(t().introduced,comparison.introduced.length,locale)),
        el(doc,'p',labelled(t().resolved,comparison.resolved.length,locale)),
        el(doc,'p',labelled(t().dropped,comparison.droppedViews.join(', ')||UNKNOWN,locale)));
    }
    return section;
  }
  function render(){
    const header=el(doc,'header',null,{class:'checklist-header'});
    append(header,el(doc,'h1',t().title),el(doc,'p',t().subtitle),el(doc,'p',t().caution),el(doc,'a',t().back,{href:'index.html'}));
    const sections=[header,live,controls()];
    const edit=recordEditor();if(edit)sections.push(edit);
    sections.push(records('source'),records('view'),records('observation'),missing(),findings());
    root.replaceChildren(...sections);root.lang=locale;doc.documentElement.lang=locale;
  }
  render();return {getState:()=>parseChecklist(state),setState:value=>tryUpdate(value),getLocale:()=>locale,getAudit:()=>auditChecklist(state)};
}
if(typeof document!=='undefined')mountChecklist(document,document.querySelector('main'),window.location.search);
