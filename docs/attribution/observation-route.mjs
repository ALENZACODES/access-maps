import { parseJournal, parseSource, parseView, parseObservation, emptyJournal, serializeJournal,
  UNKNOWN, STATES, TIERS, METHOD, PLACEMENTS, newObservation } from './observation-core.mjs';
import { auditJournal, renderAuditText, auditComparison, observationsNeeded, FINDING_TEXT } from './observation-audit.mjs';
import { COPY, localeFromSearch } from './observation-copy.mjs';
import { buildObservationMatrix, matrixTsv } from './observation-matrix.mjs';

/** Standalone local-only editor. All displayed user text is assigned as textContent. */
function node(doc, tag, text, attrs = {}) {
  const item = doc.createElement(tag);
  if (text !== undefined && text !== null) item.textContent = text;
  for (const [name, value] of Object.entries(attrs)) item.setAttribute(name, value);
  return item;
}
function append(parent, ...children) { children.forEach(child => parent.appendChild(child)); return parent; }
function button(doc, text, handler) {
  const item = node(doc, 'button', text, {type:'button'});
  item.addEventListener('click', handler);
  return item;
}
function field(doc, title, key, value, multiline = false) {
  const label = node(doc, 'label', title);
  const input = node(doc, multiline ? 'textarea' : 'input');
  input.name = key;
  if (!multiline) input.type = 'text';
  input.value = String(value ?? UNKNOWN);
  label.appendChild(input);
  return label;
}
function selectField(doc, title, key, value, options) {
  const label = node(doc, 'label', title);
  const select = node(doc, 'select');
  select.name = key;
  for (const option of options) {
    const item = node(doc, 'option', option, {value:option});
    select.appendChild(item);
  }
  select.value = value;
  label.appendChild(select);
  return label;
}
function download(doc, content, filename, type) {
  const blob = new Blob([content], {type});
  const href = URL.createObjectURL(blob);
  const a = node(doc, 'a');
  a.href = href; a.download = filename; a.hidden = true;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
function formValues(form) {
  const result = {};
  for (const item of form.elements) {
    if (item.name) result[item.name] = item.value;
  }
  return result;
}
function defaultSource() { return {id:'source1',provider:UNKNOWN,sourceUrl:UNKNOWN,licence:UNKNOWN,
  licenceUrl:UNKNOWN,retrievedOn:UNKNOWN,tier:UNKNOWN,credit:UNKNOWN,permission:UNKNOWN}; }
function defaultView() { return {id:'view1',title:UNKNOWN,route:UNKNOWN,locale:'en',kind:'map',sourceIds:[],included:UNKNOWN}; }
function valuesFor(kind, input) {
  const value = {...input};
  if (kind === 'view') value.sourceIds = input.sourceIds.split(',').map(x => x.trim()).filter(Boolean);
  if (kind === 'observation') value.targetPx = input.targetPx === UNKNOWN ? UNKNOWN : Number(input.targetPx);
  return kind === 'source' ? parseSource(value) : kind === 'view' ? parseView(value) : parseObservation(value);
}
function editFields(doc, model, kind, t) {
  const div = node(doc, 'div', null, {class:'fields'});
  const schema = kind === 'source' ? [
    ['id','sourceId'], ['provider','sourceName'], ['sourceUrl','sourceUrl'], ['licence','licence'],
    ['licenceUrl','licenceUrl'], ['retrievedOn','retrieved'], ['tier','tier',TIERS],
    ['credit','credit',null,true], ['permission','permission',STATES],
  ] : kind === 'view' ? [
    ['id','viewId'], ['title','viewTitle'], ['route','route'], ['locale','locale',['en','fr']],
    ['kind','kind',['map','list','journey']], ['included','included',STATES],
    ['sourceIds','sourceIds'],
  ] : [
    ['id','observationId'], ['viewId','observationView'], ['sourceId','observationSource'],
    ['method','method',METHOD], ['date','date'], ['placement','placement',PLACEMENTS],
    ['creditSeen','creditSeen',STATES], ['licenceSeen','licenceSeen',STATES],
    ['legible','legible',STATES], ['focusVisible','focus',STATES], ['targetPx','target'],
    ['noticeText','notice',null,true], ['evidence','evidence',null,true], ['notes','notes',null,true],
  ];
  for (const [name, translation, options, multiline] of schema) {
    const value = Array.isArray(model[name]) ? model[name].join(', ') : model[name];
    const widget = options ? selectField(doc, t[translation], name, value, options) : field(doc, t[translation], name, value, multiline);
    if (multiline) widget.classList.add('full');
    div.appendChild(widget);
  }
  return div;
}
export function mountObservationJournal(doc, root = doc.querySelector('main'), search = '') {
  if (!root) throw new Error('Main landmark is required');
  let locale = localeFromSearch(search);
  let journal = emptyJournal();
  let editing = null;
  let earlier = null;
  let selectedView = '';
  let query = '';
  const status = node(doc, 'p', '', {role:'status','aria-live':'polite',class:'status'});
  function t() { return COPY[locale]; }
  function announce(message) { status.textContent = message; }
  function safeUpdate(candidate, success) {
    try { journal = parseJournal(candidate); editing = null; render(); announce(success ?? t().saved); }
    catch (error) { announce(`${t().validationFailed} ${error.message}`); }
  }
  function remove(kind, id) {
    const field = kind === 'source' ? 'sources' : kind === 'view' ? 'views' : 'observations';
    const candidate = {...journal, [field]:journal[field].filter(x => x.id !== id)};
    safeUpdate(candidate, t().removed);
  }
  function openEditor(kind, model, previousId = null) { editing = {kind, model, previousId}; render(); doc.querySelector('#observation-editor h2')?.focus(); }
  function colon() { return locale === 'fr' ? '\u00a0:' : ':'; }
  function makeEditor() {
    const section = node(doc,'section',null,{id:'observation-editor'});
    const heading = node(doc,'h2',`${t().edit}${colon()} ${editing.kind}`,{tabindex:'-1'});
    const form = node(doc,'form');
    append(form, editFields(doc, editing.model, editing.kind, t()));
    const actions = node(doc,'div',null,{class:'controls'});
    const submit = node(doc,'button',t().save,{type:'submit'});
    append(actions,submit,button(doc,t().cancel,()=>{editing=null;render();}));
    form.appendChild(actions);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try {
        const record=valuesFor(editing.kind,formValues(form));
        const collection=editing.kind==='source'?'sources':editing.kind==='view'?'views':'observations';
        const rest=journal[collection].filter(x=>x.id!==editing.previousId);
        safeUpdate({...journal,[collection]:[...rest,record]});
      } catch(error) { announce(`${t().validationFailed} ${error.message}`); }
    });
    append(section,heading,form);
    return section;
  }
  function makeCollection(kind, heading, empty) {
    const collection = kind === 'source' ? journal.sources : kind === 'view' ? journal.views : journal.observations;
    const section = node(doc,'section');
    section.appendChild(node(doc,'h2',heading));
    const add = kind === 'source' ? defaultSource() : kind === 'view' ? defaultView() :
      newObservation(journal.views[0]?.id ?? 'view1',journal.views[0]?.sourceIds[0] ?? 'source1','visual','observation1');
    const action = kind === 'source' ? t().addSource : kind === 'view' ? t().addView : t().addObservation;
    section.appendChild(button(doc,action,()=>openEditor(kind,add)));
    if (!collection.length) section.appendChild(node(doc,'p',empty));
    for (const item of collection) {
      const row=node(doc,'article',null,{class:'row'});
      const details=node(doc,'div');
      details.appendChild(node(doc,'h3',item.id));
      details.appendChild(node(doc,'p',kind==='source'?`${item.provider} · ${item.licence} · ${item.retrievedOn} · ${item.tier}`:
        kind==='view'?`${item.title} · ${item.route} · ${item.locale} · ${item.included}`:
          `${item.viewId} / ${item.sourceId} / ${item.method} · ${item.date}`));
      const actions=node(doc,'div',null,{class:'row-actions'});
      append(actions,button(doc,`${t().edit}${locale === 'fr' ? '\u00a0:' : ':'} ${item.id}`,()=>openEditor(kind,item,item.id)),
        button(doc,`${t().delete}${locale === 'fr' ? '\u00a0:' : ':'} ${item.id}`,()=>remove(kind,item.id)));
      append(row,details,actions);section.appendChild(row);
    }
    return section;
  }
  function makeMissingQueue() {
    const missing = observationsNeeded(journal);
    const section = node(doc, 'section');
    section.appendChild(node(doc, 'h2', locale === 'fr' ? 'Contrôles à consigner' : 'Checks to record'));
    if (!missing.length) section.appendChild(node(doc, 'p', locale === 'fr' ?
      'Chaque méthode possède au moins une fiche.' : 'Each required method has at least one record.'));
    for (const item of missing) {
      const row = node(doc, 'div', null, {class:'row'});
      row.appendChild(node(doc, 'p', `${item.viewId} / ${item.sourceId} / ${item.method}`));
      const candidate = `check${journal.observations.length + 1}`;
      row.appendChild(button(doc, `${t().addObservation}${locale === 'fr' ? '\u00a0:' : ':'} ${item.method}`, () => {
        const used = new Set(journal.observations.map(x => x.id));
        let index = journal.observations.length + 1;
        while (used.has(`check${index}`)) index++;
        openEditor('observation', newObservation(item.viewId, item.sourceId, item.method, `check${index}`));
      }));
      section.appendChild(row);
    }
    return section;
  }
  function makeFindings() {
    const report=auditJournal(journal);
    const section=node(doc,'section');
    section.appendChild(node(doc,'h2',`${t().findings} — ${t().issueCount}${colon()} ${report.totals.blocking}`));
    const filter=selectField(doc,t().selectView,'findingView',selectedView,['',...journal.views.map(x=>x.id)]);
    filter.querySelector('option').textContent=t().allViews;
    filter.querySelector('select').addEventListener('change',event=>{selectedView=event.target.value;render();});
    const search=field(doc,t().search,'findingSearch',query);
    search.querySelector('input').addEventListener('input',event=>{query=event.target.value;refreshFindings();});
    append(section,filter,search);
    const list=node(doc,'div',null,{id:'observation-findings'});
    section.appendChild(list);
    function refreshFindings() {
      list.replaceChildren();
      const issues=report.findings.filter(x=>(!selectedView||x.viewId===selectedView)&&
        (!query||[x.code,x.viewId,x.sourceId,x.method].join(' ').toLowerCase().includes(query.toLowerCase())));
      if (!issues.length) list.appendChild(node(doc,'p',t().noFindings));
      for (const issue of issues) {
        const item=node(doc,'article',null,{class:`finding ${issue.severity}`});
        item.appendChild(node(doc,'strong',`${issue.severity.toUpperCase()} · ${issue.viewId} / ${issue.sourceId} / ${issue.method}`));
        item.appendChild(node(doc,'p',FINDING_TEXT[issue.code]?.[locale==='fr'?1:0] ?? issue.code));
        list.appendChild(item);
      }
    }
    refreshFindings();return section;
  }
  function importFile(file, callback) {
    if (!file) return;
    if (file.size > 1024*1024) {announce(t().validationFailed);return;}
    file.text().then(text=>{try {callback(parseJournal(text));}catch(error){announce(`${t().validationFailed} ${error.message}`);}})
      .catch(()=>announce(t().validationFailed));
  }
  function makeTools() {
    const section=node(doc,'section');
    section.appendChild(node(doc,'h2',t().titleLabel));
    const title=field(doc,t().titleLabel,'title',journal.title);
    title.querySelector('input').addEventListener('change',event=>safeUpdate({...journal,title:event.target.value}));
    section.appendChild(title);
    section.appendChild(node(doc,'p',t().uploadHelp,{class:'muted'}));
    const controls=node(doc,'div',null,{class:'controls'});
    const fileLabel=node(doc,'label',t().import);
    const picker=node(doc,'input',null,{type:'file',accept:'.json,application/json'});
    picker.addEventListener('change',()=>{importFile(picker.files?.[0],value=>safeUpdate(value,t().importSuccess));picker.value='';});
    append(fileLabel,picker);
    append(controls,fileLabel,button(doc,t().export,()=>download(doc,serializeJournal(journal),'map-observation-journal.json','application/json')),
      button(doc,t().report,()=>download(doc,renderAuditText(journal,locale),`map-observation-gaps-${locale}.txt`,'text/plain')),
      button(doc,t().coverage,()=>download(doc,matrixTsv(buildObservationMatrix(journal)),`map-observation-coverage-${locale}.tsv`,'text/tab-separated-values')));
    section.appendChild(controls);
    const compareLabel=node(doc,'label',t().compare);
    const comparePicker=node(doc,'input',null,{type:'file',accept:'.json,application/json'});
    comparePicker.addEventListener('change',()=>{importFile(comparePicker.files?.[0],value=>{earlier=value;render();announce(t().comparisonSuccess);});comparePicker.value='';});
    append(compareLabel,comparePicker);
    section.appendChild(compareLabel);
    if (earlier) {
      const comparison=auditComparison(earlier,journal);
      section.appendChild(node(doc,'h3',t().comparison));
      section.appendChild(node(doc,'p',`${t().introduced}${locale === 'fr' ? '\u00a0:' : ':'} ${comparison.introduced.length}; ${t().resolved}${locale === 'fr' ? '\u00a0:' : ':'} ${comparison.resolved.length}`));
    }
    section.appendChild(button(doc,t().reset,()=>{journal=emptyJournal();earlier=null;editing=null;render();announce(t().resetDone);}));
    return section;
  }
  function render() {
    const header=node(doc,'header');
    header.appendChild(node(doc,'h1',t().title));
    header.appendChild(node(doc,'p',t().subtitle));
    const language=selectField(doc,t().language,'language',locale,['en','fr']);
    language.querySelector('select').addEventListener('change',event=>{locale=event.target.value;render();});
    header.appendChild(language);
    const back=node(doc,'a',t().back,{href:'index.html'});
    header.appendChild(back);
    header.appendChild(node(doc,'p',t().caution,{class:'note'}));
    const children=[header,status,makeTools()];
    if(editing) children.push(makeEditor());
    children.push(makeCollection('source',t().sources,t().emptySources),
      makeCollection('view',t().views,t().emptyViews),
      makeCollection('observation',t().observation,t().emptyObservations), makeMissingQueue(),
      node(doc,'p',t().allMethods,{class:'note'}),makeFindings(),node(doc,'p',t().footer));
    root.replaceChildren(...children);
    root.lang=locale;
    doc.documentElement.lang=locale;
  }
  render();
  return {getJournal:()=>parseJournal(journal),setJournal:value=>safeUpdate(value),getLocale:()=>locale,getReport:()=>auditJournal(journal)};
}
if(typeof document!=='undefined') mountObservationJournal(document,document.querySelector('main'),window.location.search);
