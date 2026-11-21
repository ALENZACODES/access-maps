import {emptyInventory, parseInventory, serializeInventory, MAX_INPUT_BYTES, UNKNOWN} from './dependency-core.mjs';
import {auditInventory, compareInventories, surfaceProjection} from './dependency-audit.mjs';
import {COPY, localeFromSearch, labelValue, coverageTsv, dependencyTsv,
  reportText, comparisonText} from './dependency-report.mjs';
import {sourceImpact, sourceImpactTsv, sourceImpactText} from './dependency-impact.mjs';

/** Browser-only inspector. No network, storage, timers or external data sources. */
function element(doc, tag, text, attrs = {}) {
  const out = doc.createElement(tag);
  if (text !== undefined && text !== null) out.textContent = String(text);
  for (const [key, value] of Object.entries(attrs)) out.setAttribute(key, String(value));
  return out;
}
function append(parent, ...nodes) { for (const node of nodes) parent.appendChild(node); return parent; }
function action(doc, title, callback) {
  const button = element(doc, 'button', title, {type:'button'});
  button.addEventListener('click', callback);
  return button;
}
function field(doc, labelText, type = 'file') {
  const label = element(doc, 'label', labelText);
  const input = element(doc, 'input', null, {type});
  label.appendChild(input);
  return {label, input};
}
function dlItem(doc, key, value) {
  const wrap = element(doc, 'div', null, {class:'dependency-definition'});
  append(wrap, element(doc, 'dt', key), element(doc, 'dd', value));
  return wrap;
}
export function fileName(locale, extension, category = 'dependency') {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const safe = /^[a-z-]{1,48}$/u.test(category) ? category : 'dependency';
  return `${safe}-${lang}.${extension}`;
}
function download(doc, contents, name, mime) {
  const data = new Blob([contents], {type:mime});
  const url = URL.createObjectURL(data);
  const link = element(doc, 'a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
export function mountDependencyInspector(doc, root = doc.getElementById('dependency-main'), search = '') {
  if (!root) throw new Error('Main landmark is required');
  let locale = localeFromSearch(search);
  let current = emptyInventory();
  let before = null;
  let selected = '';
  let selectedSource = '';
  let filter = 'all';
  let query = '';
  const status = element(doc, 'p', '', {role:'status','aria-live':'polite','aria-atomic':'true',class:'dependency-status'});
  const labels = () => COPY[locale];
  const announce = message => {status.textContent = message;};
  function replace(value) {
    current = parseInventory(value);
    selected = '';
    selectedSource = '';
    filter = 'all';
    query = '';
    render();
    announce(labels().importGood);
  }
  async function readJson(file, callback) {
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {announce(labels().fileLimit);return;}
    try {
      const content = await file.text();
      callback(parseInventory(content));
    } catch (error) {
      announce(`${labels().importBad} ${error instanceof Error ? error.message : ''}`);
    }
  }
  function downloadSafe(writer, name, mime) {
    try {download(doc, writer(), name, mime);} catch (error) {announce(`${labels().error} ${error.message}`);}
  }
  function chooseData() {
    const section = element(doc, 'section', null, {class:'dependency-tools'});
    section.appendChild(element(doc,'h2',labels().summary));
    const picker = field(doc, labels().open);
    picker.input.accept = '.json,application/json';
    picker.input.addEventListener('change', () => {
      void readJson(picker.input.files?.[0], replace);
      picker.input.value = '';
    });
    const previous = field(doc, labels().prior);
    previous.input.accept = '.json,application/json';
    previous.input.addEventListener('change', () => {
      void readJson(previous.input.files?.[0], value => {before=value;render();announce(labels().comparisonGood);});
      previous.input.value='';
    });
    const operations = element(doc,'div',null,{class:'dependency-actions'});
    append(operations,
      action(doc,labels().exportJson,()=>downloadSafe(()=>serializeInventory(current),fileName(locale,'json','dependency-inventory'),'application/json')),
      action(doc,labels().exportReport,()=>downloadSafe(()=>reportText(current,locale),fileName(locale,'txt','dependency-findings'),'text/plain;charset=utf-8')),
      action(doc,labels().exportTsv,()=>downloadSafe(()=>coverageTsv(current),fileName(locale,'tsv','dependency-coverage'),'text/tab-separated-values')),
      action(doc,labels().exportGraph,()=>downloadSafe(()=>dependencyTsv(current),fileName(locale,'tsv','dependency-edges'),'text/tab-separated-values')),
      action(doc,labels().exportImpactTable,()=>downloadSafe(()=>sourceImpactTsv(current),fileName(locale,'tsv','source-impact'),'text/tab-separated-values')));
    if (before) operations.appendChild(action(doc,labels().exportComparison,()=>downloadSafe(()=>comparisonText(before,current,locale),fileName(locale,'txt','dependency-comparison'),'text/plain;charset=utf-8')));
    operations.appendChild(action(doc,labels().reset,()=>{
      current=emptyInventory();before=null;selected='';selectedSource='';render();announce(labels().resetDone);
    }));
    append(section, picker.label, previous.label, operations);
    return section;
  }
  function makeHeader() {
    const header = element(doc,'header');
    append(header,element(doc,'h1',labels().title),element(doc,'p',labels().intro));
    const langs = element(doc,'div',null,{class:'dependency-language'});
    append(langs,element(doc,'span',labels().language));
    for (const lang of ['en','fr']) {
      const button = action(doc,lang==='en'?labels().english:labels().french,()=>{locale=lang;render();});
      button.setAttribute('aria-pressed',String(lang===locale));
      langs.appendChild(button);
    }
    append(header,langs,element(doc,'p',labels().warning,{class:'dependency-warning'}),
      element(doc,'a',locale==='fr'?'Sources et licences':'Sources and licences',{href:'index.html'}));
    return header;
  }
  function summary() {
    const audit = auditInventory(current);
    const section = element(doc,'section');
    section.appendChild(element(doc,'h2',labels().summary));
    const list = element(doc,'dl',null,{class:'dependency-summary'});
    append(list,dlItem(doc,labels().included,current.assets.filter(asset=>asset.mode==='included').length),
      dlItem(doc,labels().referenced,current.sources.length),
      dlItem(doc,labels().surfaces,current.surfaces.length),
      dlItem(doc,labels().blocking,audit.counts.block),
      dlItem(doc,labels().status,audit.status));
    section.appendChild(list);
    return section;
  }
  function selectView() {
    const label = element(doc,'label',labels().selected);
    const choice = element(doc,'select');
    choice.appendChild(element(doc,'option',labels().noSelection,{value:''}));
    for (const surface of current.surfaces) choice.appendChild(element(doc,'option',`${surface.label} (${surface.locale})`,{value:surface.id}));
    choice.value=selected;
    choice.addEventListener('change',()=>{selected=choice.value;render();});
    label.appendChild(choice);
    return label;
  }
  function makeSurfaceDetail(projection) {
    const wrap=element(doc,'article',null,{class:'dependency-surface'});
    append(wrap,element(doc,'h3',`${projection.surface.label} (${projection.surface.locale})`),
      element(doc,'p',labelValue(labels().path,projection.surface.route,locale)));
    const byId=new Map(current.sources.map(item=>[item.id,item]));
    if(!projection.assets.length)wrap.appendChild(element(doc,'p',labels().noSurfaces));
    for(const asset of projection.assets) {
      const details=element(doc,'details');
      const summary=element(doc,'summary',`${asset.label} · ${asset.kind} · ${asset.mode}`);
      const list=element(doc,'dl');
      append(list,dlItem(doc,labels().path,asset.path),
        dlItem(doc,labels().included,asset.mode),
        dlItem(doc,labels().dependencies,asset.dependsOn.join(', ')||UNKNOWN));
      for (const id of asset.sourceIds) {
        const source=byId.get(id);
        append(list,dlItem(doc,labels().source,source.name),dlItem(doc,labels().licence,source.licence),
          dlItem(doc,labels().retrieved,source.retrievedOn),dlItem(doc,labels().tier,source.tier));
      }
      append(details,summary,list);
      wrap.appendChild(details);
    }
    for (const source of projection.sources) {
      const notice=projection.surface.notices.find(item=>item.sourceId===source.id);
      const details=element(doc,'details');
      append(details,element(doc,'summary',`${labels().source} · ${source.name}`),
        element(doc,'p',labelValue(labels().licence,source.licence,locale)),
        element(doc,'p',labelValue(labels().notices,notice?.text??UNKNOWN,locale)),
        element(doc,'p',labelValue(labels().position,notice?.position??UNKNOWN,locale)));
      wrap.appendChild(details);
    }
    return wrap;
  }
  function displaySurfaces() {
    const section=element(doc,'section');
    section.appendChild(element(doc,'h2',labels().dependencies));
    section.appendChild(selectView());
    const chosen=current.surfaces.filter(surface=>!selected||surface.id===selected);
    if(!chosen.length)section.appendChild(element(doc,'p',labels().noSurfaces));
    for(const surface of chosen)section.appendChild(makeSurfaceDetail(surfaceProjection(current,surface.id)));
    return section;
  }
  function displaySourceImpact() {
    const section=element(doc,'section');
    section.appendChild(element(doc,'h2',labels().sourceImpact));
    const label=element(doc,'label',labels().chooseSource);
    const choice=element(doc,'select');
    choice.appendChild(element(doc,'option',labels().chooseSource,{value:''}));
    for(const source of current.sources) {
      choice.appendChild(element(doc,'option',source.name,{value:source.id}));
    }
    choice.value=selectedSource;
    choice.addEventListener('change',()=>{selectedSource=choice.value;render();});
    label.appendChild(choice);
    section.appendChild(label);
    if(!selectedSource)return section;
    const report=sourceImpact(current,selectedSource);
    section.appendChild(element(doc,'p',labelValue(labels().impactSummary,report.affectedSurfaces.length,locale)));
    if(!report.paths.length)section.appendChild(element(doc,'p',labels().noImpact));
    const list=element(doc,'ul');
    for(const path of report.paths) {
      list.appendChild(element(doc,'li',`${path.surfaceId} · ${path.chain.join(' > ')} · ${path.assetPath}`));
    }
    section.appendChild(list);
    section.appendChild(action(doc,labels().exportImpact,()=>downloadSafe(
      ()=>sourceImpactText(current,selectedSource,locale),fileName(locale,'txt','source-impact'),'text/plain;charset=utf-8')));
    return section;
  }
  function displayFindings() {
    const audit=auditInventory(current);
    const section=element(doc,'section');
    section.appendChild(element(doc,'h2',labels().findings));
    const controls=element(doc,'div',null,{class:'dependency-filters'});
    const severityLabel=element(doc,'label',labels().severity);
    const severitySelect=element(doc,'select');
    for(const option of ['all','block','attention','information']) severitySelect.appendChild(element(doc,'option',option,{value:option}));
    severitySelect.value=filter;
    severitySelect.addEventListener('change',()=>{filter=severitySelect.value;render();});
    severityLabel.appendChild(severitySelect);
    const searchLabel=element(doc,'label',labels().reason);
    const searchInput=element(doc,'input',null,{type:'search'});
    searchInput.value=query;
    searchInput.addEventListener('input',()=>{
      query=searchInput.value;
      const currentFocus=doc.activeElement;
      // Update only the findings list so focus and the cursor are retained.
      const list=root.querySelector('#dependency-findings-list');
      if(list) fillFindings(list,audit);
      if(currentFocus===searchInput)searchInput.focus();
    });
    searchLabel.appendChild(searchInput);
    append(controls,severityLabel,searchLabel);
    section.appendChild(controls);
    const list=element(doc,'div',null,{id:'dependency-findings-list'});
    fillFindings(list,audit);
    section.appendChild(list);
    return section;
  }
  function fillFindings(list,audit) {
    list.replaceChildren();
    const matches=audit.findings.filter(f=>(!selected||f.surfaceId===selected||f.surfaceId===UNKNOWN) &&
      (filter==='all'||f.severity===filter) &&
      (!query||[f.code,f.surfaceId,f.assetId,f.sourceId,f.detail].join(' ').toLowerCase().includes(query.toLowerCase())));
    if(!matches.length)list.appendChild(element(doc,'p',labels().noFindings));
    for(const finding of matches) {
      const item=element(doc,'article',null,{class:`dependency-finding ${finding.severity}`});
      append(item,element(doc,'strong',`${finding.severity.toUpperCase()} · ${finding.code}`),
        element(doc,'p',`${finding.surfaceId} / ${finding.assetId} / ${finding.sourceId}`));
      if(finding.detail!==UNKNOWN)item.appendChild(element(doc,'p',finding.detail));
      list.appendChild(item);
    }
  }
  function displayComparison() {
    const section=element(doc,'section');
    section.appendChild(element(doc,'h2',labels().changed));
    if(!before) {section.appendChild(element(doc,'p',labels().comparisonEmpty));return section;}
    const result=compareInventories(before,current);
    const list=element(doc,'dl');
    append(list,dlItem(doc,labels().changed,result.alerts.length),
      dlItem(doc,labels().newGaps,result.introduced.length),
      dlItem(doc,labels().resolved,result.resolved.length));
    section.appendChild(list);
    for(const change of result.alerts)section.appendChild(element(doc,'p',`${change.code} · ${change.id} · ${change.field}`));
    return section;
  }
  function render() {
    root.replaceChildren(makeHeader(),status,chooseData(),summary(),displaySurfaces(),displaySourceImpact(),displayFindings(),displayComparison(),
      element(doc,'p',labels().offline));
    root.lang=locale;
    doc.documentElement.lang=locale;
  }
  render();
  return {getInventory:()=>parseInventory(current),setInventory:replace,getLocale:()=>locale,getAudit:()=>auditInventory(current)};
}
if(typeof document!=='undefined')mountDependencyInspector(document,document.getElementById('dependency-main'),window.location.search);
