import {
  UNKNOWN,parseRegister,blankRegister,replaceRecord,removeRecord,serializeRegister,
  newSource,newAsset,newCheck,newMeasurement,localeFromSearch,STATES,TIERS,METHODS,
  PLACEMENTS,STATUSES,KINDS,MAX_JSON_BYTES
} from './integrity-core.mjs';
import {auditRegister,compareRegisters,missingSlots,sourceImpact,coverageRows} from './integrity-audit.mjs';
import {digestFile,compareDigest} from './integrity-hash.mjs';
import {COPY,FIELDS,labelled} from './integrity-copy.mjs';
import {reportText,reportTsv,reviewHtml,comparisonText,impactText} from './integrity-report.mjs';

/** Local-only enhancement. Does not store files or register in browser storage. */
function node(doc,tag,text=null,attrs={}) {
  const element=doc.createElement(tag);
  if(text!==null) element.textContent=text;
  for(const [key,value] of Object.entries(attrs)) element.setAttribute(key,String(value));
  return element;
}
function append(parent,...children) {for(const child of children) parent.appendChild(child);return parent;}
function makeButton(doc,label,handler) {
  const button=node(doc,'button',label,{type:'button'});
  button.addEventListener('click',handler);
  return button;
}
function field(doc,labelText,name,value,multiline=false) {
  const label=node(doc,'label',labelText);
  const input=node(doc,multiline?'textarea':'input');
  if(!multiline) input.type='text';
  input.name=name;
  input.value=Array.isArray(value)?value.join(', '):String(value??UNKNOWN);
  label.appendChild(input);
  return label;
}
function optionField(doc,labelText,name,value,values) {
  const label=node(doc,'label',labelText);
  const select=node(doc,'select');
  select.name=name;
  for(const v of values) select.appendChild(node(doc,'option',v,{value:v}));
  select.value=value;
  label.appendChild(select);
  return label;
}
function formValues(form) {
  const result={};
  for(const control of form.elements) if(control.name) result[control.name]=control.value;
  return result;
}
export function editorRecord(collection,values) {
  const record={...values};
  if(collection==='assets') {
    record.sourceIds=String(values.sourceIds??'').split(',').map(s=>s.trim()).filter(Boolean);
    for(const name of ['byteLength']) if(record[name]!==UNKNOWN) record[name]=Number(record[name]);
  }
  if(collection==='checks' && record.targetPx!==UNKNOWN) record.targetPx=Number(record.targetPx);
  if(collection==='measurements' && record.byteLength!==UNKNOWN) record.byteLength=Number(record.byteLength);
  return record;
}
function download(doc,content,filename,mime) {
  const bytes=new Blob([content],{type:mime});
  const url=URL.createObjectURL(bytes);
  const a=node(doc,'a');
  a.href=url;
  a.download=filename;
  a.hidden=true;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export function mountIntegrity(doc,root=doc.getElementById('integrity-root'),search='') {
  if(!root) throw new Error('Integrity page root not found');
  let locale=localeFromSearch(search);
  let register=blankRegister();
  let earlier=null;
  let editing=null;
  let selectedAsset='';
  let selectedSource='';
  let selectedHashAsset='';
  let digest=null;
  let query='';
  const status=node(doc,'p','',{role:'status','aria-live':'polite','aria-atomic':'true',class:'status'});
  const t=()=>COPY[locale];
  const announce=message=>{status.textContent=message;};
  const failure=error=>announce(`${t().error} ${error.message}`);
  function safeUpdate(next) {
    try {
      register=parseRegister(next);
      editing=null;
      render();
      announce(t().saved);
    } catch(error) {failure(error);}
  }
  function openEditor(collection,row) {
    editing={collection,row};
    render();
    root.querySelector('#integrity-editor-title')?.focus();
  }
  function startRow(collection) {
    const nextId=kind=>{
      const existing=new Set(register[collection].map(x=>x.id));
      let index=register[collection].length+1;
      while(existing.has(`${kind}${index}`)) index++;
      return `${kind}${index}`;
    };
    if(collection==='sources') return newSource(nextId('source'));
    if(collection==='assets') return newAsset(nextId('asset'));
    if(collection==='checks') {
      const asset=register.assets.find(x=>x.sourceIds.length>0);
      return newCheck(nextId('check'),asset?.id??'asset1',asset?.sourceIds[0]??'source1','visual');
    }
    return newMeasurement(nextId('measure'),register.assets[0]?.id??'asset1',UNKNOWN,UNKNOWN);
  }
  function choices(fieldName) {
    if(['creditPresent','licenceShown','focusVisible','permission'].includes(fieldName)) return STATES;
    if(fieldName==='tier') return TIERS;
    if(fieldName==='kind') return KINDS;
    if(fieldName==='status') return STATUSES;
    if(fieldName==='method') return METHODS;
    if(fieldName==='placement') return PLACEMENTS;
    return null;
  }
  function editor() {
    if(!editing) return null;
    const section=node(doc,'section',null,{class:'editor',id:'integrity-editor'});
    const heading=node(doc,'h2',`${t().edit}${locale==='fr'?'\u00a0:':':'} ${editing.collection}`,{id:'integrity-editor-title',tabindex:'-1'});
    const form=node(doc,'form');
    const fields=node(doc,'div',null,{class:'fields'});
    for(const name of FIELDS[editing.collection]) {
      const value=editing.row[name];
      const options=choices(name);
      const multiline=['credit','noticeText','evidence','notes'].includes(name);
      const control=options?optionField(doc,t()[name]??name,name,value,options):field(doc,t()[name]??name,name,value,multiline);
      if(multiline) control.classList.add('full');
      fields.appendChild(control);
    }
    const actions=node(doc,'div',null,{class:'actions'});
    actions.appendChild(node(doc,'button',t().save,{type:'submit'}));
    actions.appendChild(makeButton(doc,t().cancel,()=>{editing=null;render();}));
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try {
        const values=editorRecord(editing.collection,formValues(form));
        safeUpdate(replaceRecord(register,editing.collection,values));
      } catch(error) {failure(error);}
    });
    append(form,fields,actions);
    append(section,heading,form);
    return section;
  }
  function remove(collection,id) {
    try {safeUpdate(removeRecord(register,collection,id));}
    catch(error) {failure(error);}
  }
  function collectionSection(collection) {
    const section=node(doc,'section',null,{class:'collection'});
    section.appendChild(node(doc,'h2',t()[{sources:'source',assets:'asset',checks:'check',measurements:'measurement'}[collection]]));
    section.appendChild(makeButton(doc,t()[{sources:'addSource',assets:'addAsset',checks:'addCheck',measurements:'addMeasurement'}[collection]],()=>openEditor(collection,startRow(collection))));
    if(!register[collection].length) section.appendChild(node(doc,'p',t().none));
    const list=node(doc,'ul',null,{class:'records'});
    for(const item of register[collection]) {
      const li=node(doc,'li');
      li.appendChild(node(doc,'strong',item.id));
      const summary=collection==='sources'?`${item.name} · ${item.licence} · ${item.retrievedOn}`:
        collection==='assets'?`${item.label} · ${item.kind} · ${item.status}`:
        collection==='checks'?`${item.assetId} / ${item.sourceId} / ${item.method} · ${item.observedOn}`:
        `${item.assetId} · ${item.sha256} · ${item.checkedOn}`;
      li.appendChild(node(doc,'p',summary));
      const buttons=node(doc,'div',null,{class:'actions'});
      buttons.appendChild(makeButton(doc,`${t().edit}${locale==='fr'?'\u00a0:':':'} ${item.id}`,()=>openEditor(collection,item)));
      buttons.appendChild(makeButton(doc,`${t().remove}${locale==='fr'?'\u00a0:':':'} ${item.id}`,()=>remove(collection,item.id)));
      li.appendChild(buttons);
      list.appendChild(li);
    }
    section.appendChild(list);
    return section;
  }
  function filePicker(labelText,accept,change) {
    const label=node(doc,'label',labelText);
    const input=node(doc,'input');
    input.type='file';
    input.accept=accept;
    input.addEventListener('change',()=>{const file=input.files?.[0]; if(file) change(file); input.value='';});
    label.appendChild(input);
    return label;
  }
  async function importRegister(file,callback) {
    if(file.size>MAX_JSON_BYTES) {announce(t().fileTooLarge);return;}
    try {
      const incoming=parseRegister(await file.text());
      callback(incoming);
    } catch(error) {announce(`${t().invalid} ${error.message}`);}
  }
  function tools() {
    const section=node(doc,'section',null,{class:'tools'});
    section.appendChild(node(doc,'h2',t().actions));
    section.appendChild(filePicker(t().import,'.json',file=>importRegister(file,incoming=>{register=incoming;editing=null;render();announce(t().importOk);} )));
    section.appendChild(filePicker(t().baseline,'.json',file=>importRegister(file,incoming=>{earlier=incoming;render();announce(t().compare);} )));
    const controls=node(doc,'div',null,{class:'actions'});
    controls.appendChild(makeButton(doc,t().export,()=>download(doc,serializeRegister(register),'source-integrity.json','application/json')));
    controls.appendChild(makeButton(doc,t().exportText,()=>download(doc,reportText(register,locale),`source-integrity-${locale}.txt`,'text/plain')));
    controls.appendChild(makeButton(doc,t().exportMatrix,()=>download(doc,reportTsv(register),'source-integrity.tsv','text/tab-separated-values')));
    controls.appendChild(makeButton(doc,t().exportHtml,()=>download(doc,reviewHtml(register,locale),`source-integrity-${locale}.html`,'text/html')));
    controls.appendChild(makeButton(doc,t().clear,()=>{register=blankRegister();earlier=null;digest=null;editing=null;render();announce(t().empty);}));
    section.appendChild(controls);
    return section;
  }
  function measuring() {
    const section=node(doc,'section',null,{class:'measure'});
    section.appendChild(node(doc,'h2',t().measure));
    section.appendChild(node(doc,'p',t().privacy));
    const picker=optionField(doc,t().chooseAsset,'hashAsset',selectedHashAsset,['',...register.assets.map(x=>x.id)]);
    picker.querySelector('select').addEventListener('change',e=>{selectedHashAsset=e.target.value;digest=null;render();});
    section.appendChild(picker);
    const fileLabel=node(doc,'label',t().file);
    const input=node(doc,'input');input.type='file';
    fileLabel.appendChild(input);
    section.appendChild(fileLabel);
    const result=node(doc,'p',digest?`${digest.sha256} · ${digest.byteLength}`:t().pending);
    section.appendChild(result);
    section.appendChild(makeButton(doc,t().measureAction,async()=>{
      const file=input.files?.[0];
      if(!file||!selectedHashAsset) {announce(t().pending);return;}
      try {
        const calculated=await digestFile(file);
        digest=calculated;
        const asset=register.assets.find(x=>x.id===selectedHashAsset);
        const matched=compareDigest(asset,calculated);
        result.textContent=`${calculated.sha256} · ${calculated.byteLength}`;
        announce(`${t().calculated} ${matched==='match'?t().hashMatch:matched==='mismatch'?t().hashMismatch:t().hashUnknown} ${t().notStored}`);
        input.value='';
      } catch(error) {failure(error);}
    }));
    if(digest) section.appendChild(makeButton(doc,t().recordMeasurement,()=>{
      const set=new Set(register.measurements.map(x=>x.id));
      let index=register.measurements.length+1;
      while(set.has(`measure${index}`)) index++;
      const record=newMeasurement(`measure${index}`,selectedHashAsset,digest.sha256,digest.byteLength);
      openEditor('measurements',record);
    }));
    return section;
  }
  function missingSection() {
    const section=node(doc,'section');
    section.appendChild(node(doc,'h2',t().missing));
    const items=missingSlots(register);
    if(!items.length) section.appendChild(node(doc,'p',t().none));
    for(const item of items) {
      const line=node(doc,'div',null,{class:'missing-row'});
      line.appendChild(node(doc,'span',`${item.assetId} / ${item.sourceId} / ${item.method}`));
      line.appendChild(makeButton(doc,t().addCheck,()=>{
        const ids=new Set(register.checks.map(x=>x.id));let i=register.checks.length+1;
        while(ids.has(`check${i}`)) i++;
        openEditor('checks',newCheck(`check${i}`,item.assetId,item.sourceId,item.method));
      }));
      section.appendChild(line);
    }
    return section;
  }
  function findingsSection() {
    const section=node(doc,'section');
    section.appendChild(node(doc,'h2',t().gaps));
    const report=auditRegister(register);
    section.appendChild(node(doc,'p',labelled(locale,'gaps',report.totals.block)));
    section.appendChild(node(doc,'p',report.totals.block?t().statusBlocked:t().statusReview));
    const select=optionField(doc,t().filter,'filterAsset',selectedAsset,['',...register.assets.map(x=>x.id)]);
    select.querySelector('option').textContent=t().all;
    select.querySelector('select').addEventListener('change',e=>{selectedAsset=e.target.value;render();});
    section.appendChild(select);
    const list=node(doc,'ul',null,{class:'findings'});
    const items=report.findings.filter(x=>!selectedAsset||x.assetId===selectedAsset||x.assetId===UNKNOWN);
    if(!items.length) list.appendChild(node(doc,'li',t().noGaps));
    for(const item of items) list.appendChild(node(doc,'li',`${item.severity.toUpperCase()} · ${item.code} · ${item.assetId} / ${item.sourceId} / ${item.method}`));
    section.appendChild(list);
    return section;
  }
  function comparisonSection() {
    if(!earlier) return null;
    const comparison=compareRegisters(earlier,register);
    const section=node(doc,'section');
    section.appendChild(node(doc,'h2',t().compare));
    section.appendChild(node(doc,'p',`${labelled(locale,'introduced',comparison.introduced.length)} · ${labelled(locale,'resolved',comparison.resolved.length)} · ${labelled(locale,'regressions',comparison.regressions.length)}`));
    const list=node(doc,'ul');
    for(const item of comparison.regressions) list.appendChild(node(doc,'li',`${item.code} — ${item.assetId} — ${item.detail}`));
    section.appendChild(list);
    section.appendChild(makeButton(doc,t().exportText,()=>download(doc,comparisonText(earlier,register,locale),`integrity-comparison-${locale}.txt`,'text/plain')));
    return section;
  }
  function impactSection() {
    const section=node(doc,'section');
    section.appendChild(node(doc,'h2',t().impact));
    const select=optionField(doc,t().selectSource,'impactSource',selectedSource,['',...register.sources.map(x=>x.id)]);
    select.querySelector('option').textContent=t().all;
    select.querySelector('select').addEventListener('change',e=>{selectedSource=e.target.value;render();});
    section.appendChild(select);
    if(selectedSource) {
      const result=sourceImpact(register,selectedSource);
      const list=node(doc,'ul');
      for(const item of result.assets) list.appendChild(node(doc,'li',`${item.label} · ${item.route} · ${item.status}`));
      for(const item of result.findings) list.appendChild(node(doc,'li',`${item.severity.toUpperCase()} · ${item.code}`));
      section.appendChild(list);
      section.appendChild(makeButton(doc,t().exportText,()=>download(doc,impactText(register,selectedSource,locale),`source-impact-${locale}.txt`,'text/plain')));
    }
    return section;
  }
  function render() {
    const main=node(doc,'main',null,{id:'integrity-main'});
    const skip=node(doc,'a',locale==='fr'?'Aller au contenu principal':'Skip to main content',{href:'#integrity-main',class:'skip'});
    const header=node(doc,'header');
    header.appendChild(node(doc,'h1',t().title));
    header.appendChild(node(doc,'p',t().intro));
    header.appendChild(node(doc,'p',t().warning,{class:'notice'}));
    const language=optionField(doc,t().language,'language',locale,['en','fr']);
    language.querySelector('select').addEventListener('change',e=>{locale=e.target.value;render();});
    header.appendChild(language);
    header.appendChild(node(doc,'a',t().back,{href:'index.html'}));
    append(main,header,status,tools(),measuring());
    if(editing) main.appendChild(editor());
    const records=node(doc,'section');records.appendChild(node(doc,'h2',t().contents));
    for(const kind of ['sources','assets','checks','measurements']) records.appendChild(collectionSection(kind));
    append(main,records,missingSection(),findingsSection());
    const comparison=comparisonSection();if(comparison)main.appendChild(comparison);
    append(main,impactSection(),node(doc,'p',t().footer));
    root.replaceChildren(skip,main);
    root.lang=locale;
    doc.documentElement.lang=locale;
  }
  render();
  return {getRegister:()=>parseRegister(register),setRegister:candidate=>safeUpdate(candidate),getAudit:()=>auditRegister(register),getLocale:()=>locale,getCoverage:()=>coverageRows(register)};
}
if(typeof document!=='undefined') mountIntegrity(document,document.getElementById('integrity-root'),window.location.search);
