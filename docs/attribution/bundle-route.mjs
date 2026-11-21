import {parseBundle,emptyBundle,serializeBundle,putRecord,deleteRecord,nextId,defaultSource,defaultView,
 defaultAsset,defaultUse,defaultNotice,defaultObservation,UNKNOWN,TIERS,FAMILIES,RIGHTS,
 PLACEMENTS,DELIVERY,METHODS,REQUIRED} from './bundle-core.mjs';
import {auditBundle,missingNoticeSlots,viewCoverage,compareBundles} from './bundle-audit.mjs';
import {disclosureHtml,disclosureModel,manifestJson,findingsText,coverageTsv,defaultFilename} from './bundle-export.mjs';
import {COPY,queryLocale} from './bundle-copy.mjs';

/** Progressive local editor. No network, storage, polling, or implicit writes. */
export function element(doc,tag,text=null,attrs={}) {
  const item=doc.createElement(tag);
  if(text!==null)item.textContent=String(text);
  for(const [key,value] of Object.entries(attrs))item.setAttribute(key,String(value));
  return item;
}
export function downloadFile(doc,text,filename,contentType='text/plain;charset=utf-8') {
  const blob=new Blob([text],{type:contentType});
  const href=URL.createObjectURL(blob);
  const anchor=element(doc,'a');
  anchor.href=href;anchor.download=filename;anchor.hidden=true;
  doc.body.appendChild(anchor);
  anchor.click();anchor.remove();URL.revokeObjectURL(href);
}
export function readFields(form) {
  const fields={};
  for(const child of form.elements)if(child.name)fields[child.name]=child.value;
  return fields;
}
export function decodeForm(collection,values) {
  const record={...values};
  if(collection==='assets') {
    record.sourceIds=String(values.sourceIds??'').split(',').map(s=>s.trim()).filter(Boolean);
    record.geometrySourceIds=String(values.geometrySourceIds??'').split(',').map(s=>s.trim()).filter(Boolean);
  }
  if(collection==='observations')record.minimumTargetPx=values.minimumTargetPx===UNKNOWN?UNKNOWN:Number(values.minimumTargetPx);
  return record;
}
export function fieldSchema(collection) {
  const aliases={
    id:'fieldId',name:'sourceName',sourceUrl:'fieldUrl',licence:'licence',licenceUrl:'licenceLink',family:'fieldFamily',
    retrievedOn:'retrieved',tier:'tier',permission:'fieldPermission',credit:'fieldCredit',datasetAsOf:'dataDate',
    titleEn:'fieldViewEn',titleFr:'fieldViewFr',route:'fieldRoute',delivery:'fieldDelivery',included:'fieldInclude',
    notesEn:'fieldNotes',notesFr:'fieldNotes',label:'fieldTitle',viewId:'fieldView',sourceIds:'fieldSourceIds',
    geometrySourceIds:'fieldGeometryIds',notes:'fieldNotes',assetId:'fieldAsset',sourceId:'fieldSource',
    required:'fieldRequired',useId:'fieldId',locale:'fieldLocale',text:'fieldText',placement:'fieldPlacement',
    visible:'fieldVisible',keyboard:'fieldKeyboard',screenReader:'fieldReader',observedOn:'fieldDate',
    method:'fieldObservation',result:'fieldResult',minimumTargetPx:'fieldTarget',evidence:'fieldEvidence',
  };
  const fields=REQUIRED[collection.slice(0,-1)];
  if(!fields)throw new RangeError('Unsupported editor collection');
  const select={family:FAMILIES,tier:TIERS,permission:RIGHTS,included:RIGHTS,required:RIGHTS,
    delivery:DELIVERY,locale:['en','fr'],placement:PLACEMENTS,visible:RIGHTS,keyboard:RIGHTS,
    screenReader:RIGHTS,method:METHODS,result:RIGHTS};
  return fields.map(name=>({name,label:aliases[name]??name,options:select[name]??null,
    multiline:['credit','text','notes','notesEn','notesFr','evidence'].includes(name)}));
}
function filePicker(doc,label,callback) {
  const wrapper=element(doc,'label',label,{class:'file'});
  const picker=element(doc,'input',null,{type:'file',accept:'.json,application/json'});
  picker.addEventListener('change',async()=>{
    const file=picker.files?.[0];if(!file)return;
    try {
      if(file.size>1024*1024)throw new Error('File is too large');
      callback(parseBundle(await file.text()));
    } catch(err) {callback(null,err);}
    picker.value='';
  });
  wrapper.appendChild(picker);return wrapper;
}
function button(doc,label,click) {
  const item=element(doc,'button',label,{type:'button'});
  item.addEventListener('click',click);return item;
}
function section(doc,title) {
  const root=element(doc,'section',null,{class:'panel'});
  root.appendChild(element(doc,'h2',title));return root;
}
function choices(doc,title,value,options,onChange) {
  const wrapper=element(doc,'label',title);
  const select=element(doc,'select');
  for(const option of options) {
    const item=element(doc,'option',option.label??option.value,{value:option.value});
    select.appendChild(item);
  }
  select.value=value;
  select.addEventListener('change',()=>onChange(select.value));
  wrapper.appendChild(select);return wrapper;
}
function metadata(doc,data,t,language) {
  const dl=element(doc,'dl');
  for(const [label,value] of data) {
    const line=element(doc,'div');
    line.append(element(doc,'dt',label),element(doc,'dd',String(value)));
    dl.appendChild(line);
  }
  return dl;
}
export function mountBundleComposer(doc,main=doc.getElementById('bundle-main'),search='') {
  if(!main)throw new Error('Main landmark required');
  let language=queryLocale(search),bundle=emptyBundle(),earlier=null;
  let viewId='',previewLanguage='en',editing=null,filter='';
  const status=element(doc,'p','',{class:'status',role:'status','aria-live':'polite','aria-atomic':'true'});
  const t=()=>COPY[language];
  const announce=message=>{status.textContent=message;};
  const update=(candidate,message)=>{
    try {bundle=parseBundle(candidate);editing=null;render();announce(message??t().saved);}
    catch(err){announce(`${t().validation} ${err.message}`);}
  };
  const next=(collection,stem)=>nextId(bundle,collection,stem);
  function startRecord(collection) {
    if(collection==='sources')return defaultSource(next(collection,'source'));
    if(collection==='views')return defaultView(next(collection,'view'));
    if(collection==='assets')return defaultAsset(next(collection,'asset'),bundle.views[0]?.id??'view1');
    if(collection==='uses') {
      const asset=bundle.assets[0];
      return defaultUse(next(collection,'use'),asset?.viewId??'view1',asset?.id??'asset1',asset?.sourceIds[0]??'source1');
    }
    if(collection==='notices')return defaultNotice(next(collection,'notice'),bundle.uses[0]?.id??'use1','en');
    if(collection==='observations')return defaultObservation(next(collection,'observation'),bundle.views[0]?.id??'view1','visual');
    throw new RangeError('Unknown collection');
  }
  function editorForm() {
    const panel=section(doc,`${t().edit} — ${t()[editing.collection]}`);
    panel.classList.add('editor');
    const form=element(doc,'form');
    const fields=element(doc,'div',null,{class:'fields'});
    for(const field of fieldSchema(editing.collection)) {
      const wrapper=element(doc,'label',t()[field.label]??field.name);
      const item=field.options?element(doc,'select'):element(doc,field.multiline?'textarea':'input');
      item.name=field.name;
      if(!field.options&&!field.multiline)item.type='text';
      if(field.options)for(const option of field.options)item.appendChild(element(doc,'option',option,{value:option}));
      const value=editing.record[field.name];
      item.value=Array.isArray(value)?value.join(', '):String(value??UNKNOWN);
      wrapper.appendChild(item);
      if(field.multiline)wrapper.classList.add('wide');
      fields.appendChild(wrapper);
    }
    form.appendChild(element(doc,'p',t().formHelp,{class:'note'}));
    form.appendChild(fields);
    const actions=element(doc,'div',null,{class:'toolbar'});
    const submit=element(doc,'button',t().save,{type:'submit'});
    actions.append(submit,button(doc,t().cancel,()=>{editing=null;render();}));
    form.appendChild(actions);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try {update(putRecord(bundle,editing.collection,decodeForm(editing.collection,readFields(form))));}
      catch(err) {announce(`${t().validation} ${err.message}`);}
    });
    panel.appendChild(form);return panel;
  }
  function recordsPanel(collection) {
    const panel=section(doc,t()[collection]);
    panel.appendChild(button(doc,t().add,()=>{editing={collection,record:startRecord(collection)};render();main.querySelector('.editor h2')?.focus();}));
    if(!bundle[collection].length)panel.appendChild(element(doc,'p',t().none));
    for(const item of bundle[collection]) {
      const article=element(doc,'article',null,{class:'record'});
      article.appendChild(element(doc,'h3',item.id));
      const summary=Object.entries(item).filter(([key])=>key!=='id').slice(0,3)
        .map(([key,value])=>`${key}: ${Array.isArray(value)?value.join(', '):value}`).join(' · ');
      article.appendChild(element(doc,'div',summary));
      const actions=element(doc,'div',null,{class:'record-actions'});
      actions.append(button(doc,`${t().edit} ${item.id}`,()=>{editing={collection,record:item};render();}),
        button(doc,`${t().remove} ${item.id}`,()=>{
          if(!doc.defaultView.confirm(t().confirmRemove))return;
          try {update(deleteRecord(bundle,collection,item.id),t().removed);}
          catch(err) {announce(`${t().validation} ${err.message}`);}
        }));
      article.appendChild(actions);panel.appendChild(article);
    }
    return panel;
  }
  function toolsPanel() {
    const panel=section(doc,t().summary);
    const toolbar=element(doc,'div',null,{class:'toolbar'});
    toolbar.appendChild(filePicker(doc,t().import,(next,err)=>{
      if(err){announce(`${t().uploadFailed} ${err.message}`);return;}
      bundle=next;editing=null;earlier=null;viewId='';render();announce(t().uploadDone);
    }));
    toolbar.appendChild(filePicker(doc,t().oldImport,(previous,err)=>{
      if(err){announce(`${t().uploadFailed} ${err.message}`);return;}
      earlier=previous;render();announce(t().comparison);
    }));
    toolbar.appendChild(button(doc,t().export,()=>downloadFile(doc,serializeBundle(bundle),'notice-bundle-register.json','application/json')));
    toolbar.appendChild(button(doc,t().report,()=>downloadFile(doc,findingsText(bundle,language,viewId||null),`notice-gaps-${language}.txt`)));
    toolbar.appendChild(button(doc,t().matrix,()=>downloadFile(doc,coverageTsv(bundle),'notice-coverage.tsv','text/tab-separated-values')));
    toolbar.appendChild(button(doc,t().manifest,()=>{
      if(!viewId){announce(t().noView);return;}
      downloadFile(doc,manifestJson(bundle,viewId,previewLanguage),defaultFilename(viewId,previewLanguage,'json'),'application/json');
    }));
    toolbar.appendChild(button(doc,t().download,()=>{
      if(!viewId){announce(t().noView);return;}
      downloadFile(doc,disclosureHtml(bundle,viewId,previewLanguage),defaultFilename(viewId,previewLanguage,'html'),'text/html;charset=utf-8');
    }));
    panel.appendChild(toolbar);
    const allViews=[{value:'',label:t().selectView},...bundle.views.map(x=>({value:x.id,label:`${x.titleEn} (${x.id})`}))];
    const picker=element(doc,'div',null,{class:'toolbar'});
    picker.append(choices(doc,t().chooseView,viewId,allViews,value=>{viewId=value;render();}),
      choices(doc,t().chooseLanguage,previewLanguage,[{value:'en',label:t().english},{value:'fr',label:t().french}],value=>{previewLanguage=value;render();}));
    panel.appendChild(picker);
    return panel;
  }
  function findingsPanel() {
    const report=auditBundle(bundle);
    const panel=section(doc,t().findings);
    panel.appendChild(element(doc,'p',`${t().status}${language==='fr'?'\u00a0:':':'} ${report.status}`));
    panel.appendChild(element(doc,'p',`${t().blocked}${language==='fr'?'\u00a0:':':'} ${report.totals.block}`));
    const list=element(doc,'ul',null,{class:'findings'});
    const find=element(doc,'label',t().findings);
    const input=element(doc,'input',null,{type:'search',value:filter});
    input.value=filter;
    input.addEventListener('input',()=>{filter=input.value;refresh();});
    find.appendChild(input);panel.appendChild(find);
    function refresh() {
      list.replaceChildren();
      const items=report.findings.filter(x=>!filter||[x.code,x.viewId,x.assetId,x.sourceId,x.locale].join(' ').toLowerCase().includes(filter.toLowerCase()));
      for(const item of items)list.appendChild(element(doc,'li',`${item.severity.toUpperCase()} — ${item.code} — ${item.viewId} / ${item.assetId} / ${item.sourceId} / ${item.locale}`,{class:item.severity}));
      if(!items.length)list.appendChild(element(doc,'li',t().none));
    }
    refresh();panel.appendChild(list);
    const missing=missingNoticeSlots(bundle);
    const details=element(doc,'details');details.appendChild(element(doc,'summary',`${t().missing} (${missing.length})`));
    const missingList=element(doc,'ul');
    if(!missing.length)missingList.appendChild(element(doc,'li',t().noMissing));
    for(const item of missing)missingList.appendChild(element(doc,'li',`${item.viewId} / ${item.sourceId} / ${item.locale}`));
    details.appendChild(missingList);panel.appendChild(details);
    if(earlier) {
      const diff=compareBundles(earlier,bundle);
      panel.appendChild(element(doc,'h3',t().comparison));
      panel.appendChild(element(doc,'p',`${t().introduced}${language==='fr'?'\u00a0:':':'} ${diff.added.length}; ${t().resolved}${language==='fr'?'\u00a0:':':'} ${diff.resolved.length}`));
    }
    return panel;
  }
  function previewPanel() {
    const panel=section(doc,t().preview);
    const container=element(doc,'div',null,{class:'notice-preview'});
    if(!viewId)container.appendChild(element(doc,'p',t().emptyPreview));
    else {
      const model=disclosureModel(bundle,viewId,previewLanguage);
      container.appendChild(element(doc,'h3',model.title));
      container.appendChild(element(doc,'p',model.blocking.length?t().blockedMessage:t().passMessage,{class:'note'}));
      for(const {asset,source,notice} of model.noticeRows) {
        const article=element(doc,'article');
        article.appendChild(element(doc,'h3',`${asset.label} — ${source.name}`));
        article.appendChild(metadata(doc,[[t().licence,source.licence],[t().retrieved,source.retrievedOn],
          [t().dataDate,source.datasetAsOf],[t().tier,source.tier],[t().noticePlacement,notice?.placement??UNKNOWN]],t(),language));
        article.appendChild(element(doc,'pre',notice?.text??UNKNOWN));
        container.appendChild(article);
      }
    }
    panel.appendChild(container);return panel;
  }
  function coveragePanel() {
    const panel=section(doc,t().coverage),wrap=element(doc,'div',null,{class:'table-wrap'});
    const table=element(doc,'table');
    const head=element(doc,'thead'),headRow=element(doc,'tr');
    for(const value of ['View','Assets','Sources','Expected','Recorded','Blocking'])headRow.appendChild(element(doc,'th',value,{scope:'col'}));
    head.appendChild(headRow);table.appendChild(head);
    const body=element(doc,'tbody');
    for(const row of viewCoverage(bundle)) {
      const tr=element(doc,'tr');
      for(const value of [row.viewId,row.assetCount,row.sourceCount,row.expectedNotices,row.recordedNotices,row.blockingGaps])tr.appendChild(element(doc,'td',value));
      body.appendChild(tr);
    }
    table.appendChild(body);wrap.appendChild(table);panel.appendChild(wrap);return panel;
  }
  function render() {
    const header=element(doc,'header');
    header.append(element(doc,'h1',t().title),element(doc,'p',t().subtitle,{class:'note'}),
      element(doc,'p',t().caution));
    const lang=choices(doc,t().language,language,[{value:'en',label:t().english},{value:'fr',label:t().french}],value=>{language=value;render();});
    const nav=element(doc,'div',null,{class:'toolbar'});nav.append(lang,element(doc,'a',t().back,{href:'index.html'}));
    header.appendChild(nav);
    const sections=element(doc,'div',null,{class:'columns'});
    sections.append(toolsPanel(),findingsPanel(),previewPanel(),coveragePanel());
    const details=element(doc,'div',null,{class:'columns'});
    for(const collection of ['sources','views','assets','uses','notices','observations'])details.appendChild(recordsPanel(collection));
    const all=[header,status,sections];
    if(editing)all.push(editorForm());
    all.push(details,element(doc,'p',t().localOnly,{class:'note'}));
    main.replaceChildren(...all);
    doc.documentElement.lang=language;
    main.lang=language;
  }
  render();
  return {getBundle:()=>parseBundle(bundle),setBundle:value=>update(value),getLocale:()=>language,getAudit:()=>auditBundle(bundle),getSelectedView:()=>viewId};
}
if(typeof document!=='undefined')mountBundleComposer(document,document.getElementById('bundle-main'),window.location.search);
