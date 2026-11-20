import { TRACE_SCHEMA, UNKNOWN, emptyTrace, parseTrace, jsonTrace, replaceRecord, removeRecord, traceStats, STATES, TIERS, MODES, PLACEMENTS, STATUS, LOCALES } from './trace-core.mjs';
import { auditTrace, compareTraces } from './trace-audit.mjs';
import { localeCopy, findingLabel } from './trace-copy.mjs';
import { buildTraceMatrix, matrixBySurface, matrixTsv } from './trace-matrix.mjs';

/** Explicit local UI. No use of storage, network requests, timers or generated source facts. */
const root = document.getElementById('trace-root');
let state = emptyTrace();
let older = null;
let locale = location.search === '?lang=fr' ? 'fr' : 'en';
let active = 'sources';
let editId = null;
let filter = 'all';
let matrixSource = '';
let matrixSurface = '';
const collectionFields = Object.freeze({
  sources: ['id','name','sourceUrl','licence','licenceUrl','retrievedOn','tier','credit','permission','notes'],
  surfaces: ['id','label','route','locale','mapShown','keyboard','screenReader','focusVisible','minimumTargetPx','notes'],
  layers: ['id','label','mode','status','sourceIds','geometrySourceIds','surfaceIds','notes'],
  notices: ['id','layerId','surfaceId','sourceId','locale','text','placement','visible','focusable','readable','observedOn','notes'],
});
const options = Object.freeze({
  tier: TIERS, permission: STATES, mode: MODES, status: STATUS, locale: LOCALES,
  mapShown: STATES, keyboard: STATES, screenReader: STATES, focusVisible: STATES,
  placement: PLACEMENTS, visible: STATES, focusable: STATES, readable: STATES,
});
const longFields = new Set(['notes','text']);
const listFields = new Set(['sourceIds','geometrySourceIds','surfaceIds']);
const DEFAULT = Object.freeze({
  sourceUrl: UNKNOWN, licence: UNKNOWN, licenceUrl: UNKNOWN, retrievedOn: UNKNOWN,
  tier: UNKNOWN, credit: UNKNOWN, permission: UNKNOWN, route: UNKNOWN, mapShown: UNKNOWN,
  keyboard: UNKNOWN, screenReader: UNKNOWN, focusVisible: UNKNOWN, minimumTargetPx: UNKNOWN,
  mode: UNKNOWN, placement: UNKNOWN, visible: UNKNOWN, focusable: UNKNOWN, readable: UNKNOWN,
  observedOn: UNKNOWN, notes: '', text: UNKNOWN, status: 'draft', locale: 'en',
});

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attributes)) {
    if (key === 'text') node.textContent = val;
    else if (key === 'class') node.className = val;
    else if (key === 'value') node.value = val;
    else if (key === 'checked') node.checked = !!val;
    else if (key === 'selected') node.selected = !!val;
    else if (key === 'type') node.type = val;
    else if (key === 'htmlFor') node.htmlFor = val;
    else if (val !== undefined && val !== null) node.setAttribute(key, String(val));
  }
  for (const child of children) node.append(child);
  return node;
}
function text(tag, value, className = '') { return el(tag, {text: String(value), ...(className ? {class: className} : {})}); }
function button(label, onClick, className = 'trace-button') {
  const node = el('button', {type: 'button', class: className, text: label});
  node.addEventListener('click', onClick);
  return node;
}
function heading(t, key) { return text('h2', t[key]); }
function noticeMessage(value, danger = false) {
  const status = document.getElementById('trace-announcer');
  if (!status) return;
  status.textContent = value;
  status.className = danger ? 'trace-alert' : 'trace-status';
}
function fieldLabel(key, t) { return t[key] ?? key; }
function row(t, name, value) {
  return el('div', {class: 'trace-meta'}, [text('dt', fieldLabel(name, t)), text('dd', Array.isArray(value) ? value.join(', ') || UNKNOWN : value)]);
}
function download(name, data, type) {
  const blob = new Blob([data], {type});
  const url = URL.createObjectURL(blob);
  const anchor = el('a', {href: url, download: name});
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  noticeMessage(localeCopy(locale).exported);
}
async function readFile(file) {
  if (!file || file.size > 1024 * 1024) throw new Error('File size exceeds 1 MiB');
  return parseTrace(await file.text());
}
function filePicker(t, label, callback) {
  const id = `file-${label === t.import ? 'import' : 'compare'}`;
  const wrap = el('div', {class: 'trace-file'});
  const input = el('input', {id, type: 'file', accept: 'application/json,.json'});
  input.addEventListener('change', async () => {
    try {
      const file = input.files?.[0];
      if (!file) return;
      const parsed = await readFile(file);
      callback(parsed);
    } catch (error) {
      noticeMessage(`${t.invalid} ${error.message}`, true);
    } finally { input.value = ''; }
  });
  wrap.append(el('label', {htmlFor: id, text: label}), input);
  return wrap;
}
function report() { return older ? compareTraces(older, state) : auditTrace(state); }
function reportText(t, output) {
  const rows = [t.title, state.title, '', output.publication, `${t.block}: ${output.counts.block}; ${t.caution}: ${output.counts.caution}; ${t.info}: ${output.counts.info}`, ''];
  for (const f of output.findings) rows.push(`${f.severity.toUpperCase()} | ${findingLabel(locale, f.code)} | ${f.path} | ${f.detail}`);
  rows.push('', t.noData, t.noEndorsement);
  return `${rows.join('\n')}\n`;
}
function controls(t) {
  const section = el('section', {class: 'trace-panel', 'aria-labelledby': 'trace-actions'});
  section.append(el('h2', {id: 'trace-actions', text: t.summary}), text('p', t.local), text('p', t.importHelp));
  const actions = el('div', {class: 'trace-actions'});
  actions.append(
    button(t.create, () => { state = emptyTrace(); older = null; editId = null; render(); noticeMessage(t.started); }),
    button(t.export, () => download('map-notice-trace.json', jsonTrace(state), 'application/json')),
    button(t.exportFindings, () => download(`map-notice-findings-${locale}.txt`, reportText(t, report()), 'text/plain;charset=utf-8')),
  );
  section.append(actions,
    filePicker(t, t.import, newState => { state = newState; older = null; editId = null; render(); noticeMessage(t.loaded); }),
    filePicker(t, t.compare, previous => { older = previous; render(); noticeMessage(t.loaded); }));
  const titleForm = el('form', {class: 'trace-title-form'});
  const titleId = 'trace-document-title';
  const label = el('label', {htmlFor: titleId, text: t.titleField});
  const titleInput = el('input', {id: titleId, value: state.title, maxlength: 200, required: 'required'});
  titleForm.append(label, titleInput, button(t.save, () => {
    try { state = parseTrace({...state, title: titleInput.value}); render(); noticeMessage(t.saved); }
    catch (error) { noticeMessage(`${t.error} ${error.message}`, true); }
  }));
  titleForm.addEventListener('submit', event => { event.preventDefault(); titleForm.querySelector('button').click(); });
  section.append(titleForm);
  return section;
}
function stats(t) {
  const stats = traceStats(state);
  const section = el('section', {class:'trace-panel','aria-labelledby':'trace-stats-head'});
  section.append(el('h2',{id:'trace-stats-head',text:t.stats}));
  const dl = el('dl', {class: 'trace-stat-grid'});
  const keys = [['sources','sourceCount'],['layers','layerCount'],['surfaces','surfaceCount'],['notices','noticeCount'],['includedLayers','included'],['missingSlots','missing']];
  for (const [key,label] of keys) dl.append(row(t,label,stats[key]));
  section.append(dl);
  return section;
}
function optionsFor(field, t) {
  if (field === 'sourceIds' || field === 'geometrySourceIds') return state.sources.map(row => [row.id, row.name]);
  if (field === 'surfaceIds') return state.surfaces.map(row => [row.id, `${row.label} (${row.locale})`]);
  if (field === 'sourceId') return state.sources.map(row => [row.id, row.name]);
  if (field === 'layerId') return state.layers.map(row => [row.id, row.label]);
  if (field === 'surfaceId') return state.surfaces.map(row => [row.id, `${row.label} (${row.locale})`]);
  return options[field]?.map(value => [value, t[value] ?? value]) ?? [];
}
function selector(t, field, value, multi) {
  const node = el('select', {multiple: multi ? 'multiple' : undefined, size: multi ? 5 : undefined});
  const choices = optionsFor(field, t);
  if (!multi && ['sourceId','surfaceId','layerId'].includes(field)) choices.unshift(['', t.choose]);
  for (const [id,label] of choices) node.append(el('option', {value: id, text: label, ...(multi ? {selected: value.includes(id)} : {selected: value === id})}));
  return node;
}
function editor(t, collection, initial = null) {
  const details = el('section', {class: 'trace-editor','aria-labelledby':'trace-editor-title'});
  details.append(el('h3', {id:'trace-editor-title',text: `${initial ? t.edit : t.new} — ${t[collection]}`}));
  const form = el('form');
  const values = new Map();
  for (const field of collectionFields[collection]) {
    const fieldId = `trace-field-${field}`;
    const label = el('label',{htmlFor:fieldId,text:fieldLabel(field,t)});
    const value = initial?.[field] ?? DEFAULT[field] ?? (listFields.has(field) ? [] : '');
    let input;
    if (options[field] || listFields.has(field) || ['sourceId','layerId','surfaceId'].includes(field)) input = selector(t,field,value,listFields.has(field));
    else if (longFields.has(field)) input = el('textarea',{rows:field === 'text' ? 4 : 2});
    else input = el('input',{type:'text',maxlength:field === 'id' ? 80 : 2000});
    input.id = fieldId;
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') input.value = value;
    if (field === 'id' && initial) input.readOnly = true;
    if (['id','label','name','sourceId','layerId','surfaceId'].includes(field)) input.required = true;
    values.set(field,input);
    form.append(el('div',{class:'trace-form-field'},[label,input]));
  }
  form.append(el('div',{class:'trace-actions'},[
    el('button',{type:'submit',class:'trace-button',text:t.save}),
    button(t.cancel,()=> {editId = null; render();}),
  ]));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data = {};
    for (const [field,input] of values) {
      if (listFields.has(field)) data[field] = [...input.selectedOptions].map(option => option.value);
      else data[field] = input.value;
      if (field === 'minimumTargetPx' && /^\d+$/u.test(data[field])) data[field] = Number(data[field]);
    }
    try { state = replaceRecord(state,collection,data); editId = null; render(); noticeMessage(t.saved); }
    catch (error) { noticeMessage(`${t.error} ${error.message}`,true); }
  });
  details.append(form);
  return details;
}
function openNew(t) {
  if (active === 'sources') return editor(t, active, null);
  if (active === 'surfaces') return editor(t, active, null);
  if (active === 'layers') return editor(t, active, null);
  return editor(t, active, null);
}
function renderRecord(t, collection, entry) {
  const article = el('article',{class:'trace-record','aria-labelledby':`trace-record-${collection}-${entry.id}`});
  const title = entry.label ?? entry.name ?? `${entry.id}`;
  article.append(el('h3',{id:`trace-record-${collection}-${entry.id}`,text:title}));
  const list = el('dl',{class:'trace-record-info'});
  for (const field of collectionFields[collection]) list.append(row(t,field,entry[field]));
  article.append(list);
  const controls = el('div',{class:'trace-actions'});
  controls.append(button(`${t.edit}: ${title}`,()=>{editId = entry.id; render(); document.getElementById('trace-editor-title')?.scrollIntoView({block:'nearest'});}));
  controls.append(button(`${t.remove}: ${title}`,()=>{
    if (!window.confirm(t.confirmRemoval)) return;
    try {state = removeRecord(state,collection,entry.id); editId = null; render(); noticeMessage(t.deleted);}
    catch(error){noticeMessage(`${t.error} ${error.message}`,true);}
  }));
  article.append(controls);
  return article;
}
function register(t) {
  const section = el('section',{class:'trace-panel','aria-labelledby':'trace-register-head'});
  section.append(el('h2',{id:'trace-register-head',text:t.choose}));
  const tabs = el('div',{class:'trace-tabs','aria-label':t.choose});
  for (const name of Object.keys(collectionFields)) {
    const item = button(`${t[name]} (${state[name].length})`,()=>{active=name;editId=null;render();});
    if (active === name) item.setAttribute('aria-current','true');
    tabs.append(item);
  }
  section.append(tabs);
  const actions = el('div',{class:'trace-actions'});
  actions.append(button(t[`add${active.charAt(0).toUpperCase()}${active.slice(1,-1)}`] ?? t.new,()=>{editId = '__new__';render();}));
  section.append(actions);
  if (editId === '__new__') section.append(openNew(t));
  else if (editId) {
    const found = state[active].find(row => row.id === editId);
    if (found) section.append(editor(t,active,found));
  }
  const list = el('div',{class:'trace-record-grid'});
  for (const entry of state[active]) list.append(renderRecord(t,active,entry));
  if (!state[active].length) list.append(text('p',t.empty));
  section.append(list);
  return section;
}
function matrix(t) {
  const section = el('section',{class:'trace-panel','aria-labelledby':'trace-matrix-head'});
  section.append(el('h2',{id:'trace-matrix-head',text:t.matrix}), text('p',t.matrixIntro));
  const controls = el('div',{class:'trace-actions'});
  function choice(fieldId,label,options,value,callback) {
    const group = el('div',{class:'trace-form-field'});
    const fieldLabel = el('label',{htmlFor:fieldId,text:label});
    const select = el('select',{id:fieldId});
    for(const [id,title] of options) select.append(el('option',{value:id,text:title,selected:value===id}));
    select.addEventListener('change',()=>{callback(select.value);render();});
    group.append(fieldLabel,select);
    return group;
  }
  const sources = [['',t.anySource],...state.sources.map(item=>[item.id,item.name])];
  const surfaces = [['',t.anySurface],...state.surfaces.map(item=>[item.id,item.label])];
  controls.append(choice('trace-matrix-source',t.filterSource,sources,matrixSource,next=>{matrixSource=next;}));
  controls.append(choice('trace-matrix-surface',t.filterSurface,surfaces,matrixSurface,next=>{matrixSurface=next;}));
  const options = {sourceId:matrixSource || null,surfaceId:matrixSurface || null};
  const rows = buildTraceMatrix(state,options);
  controls.append(button(t.matrixExport,()=>download('map-notice-coverage.tsv',matrixTsv(rows),'text/tab-separated-values;charset=utf-8')));
  section.append(controls);
  const rollups = matrixBySurface(state,options);
  const stats = el('dl',{class:'trace-stat-grid'});
  for(const group of rollups) {
    stats.append(row(t,'surface',group.surface),row(t,'matrixDocumented',group.documented),row(t,'matrixMissing',group.missing),row(t,'matrixIncomplete',group.incomplete));
  }
  if(rollups.length) section.append(stats);
  if (!rows.length) {section.append(text('p',t.matrixNoRows));return section;}
  const list = el('ol',{class:'trace-matrix-list'});
  for (const entry of rows) {
    const item = el('li',{class:'trace-matrix-row'});
    const dl = el('dl',{class:'trace-record-info'});
    for (const [label,value] of [
      ['layer',entry.layer],['source',entry.source],['surface',entry.surface],
      ['locale',entry.locale],['licence',entry.licence],['retrievedOn',entry.retrievedOn],
      ['tier',entry.tier],['matrixCredit',entry.creditState],['matrixDisplay',entry.displayState],
      ['matrixAdjacency',entry.adjacency],['placement',entry.placement],
    ]) dl.append(row(t,label,value));
    item.append(dl);list.append(item);
  }
  section.append(list);
  return section;
}
function findings(t) {
  const result = report();
  const section = el('section',{class:'trace-panel','aria-labelledby':'trace-findings-head'});
  section.append(el('h2',{id:'trace-findings-head',text:t.findings}));
  section.append(text('p',`${t.block}: ${result.counts.block}; ${t.caution}: ${result.counts.caution}; ${t.info}: ${result.counts.info}`));
  section.append(text('p',result.publication === 'blocked' ? t.publicationBlocked : result.publication === 'no-candidates' ? t.noCandidates : t.reviewNeeded));
  const selection = el('div',{class:'trace-form-field'});
  const label = el('label',{htmlFor:'trace-findings-filter',text:t.filterLevel});
  const select = el('select',{id:'trace-findings-filter'});
  for (const code of ['all','block','caution','info']) select.append(el('option',{value:code,text:t[code],selected:filter===code}));
  select.addEventListener('change',()=>{filter=select.value;render();document.getElementById('trace-findings-head')?.scrollIntoView({block:'nearest'});});
  selection.append(label,select);
  section.append(selection);
  const visible = result.findings.filter(issue => filter === 'all' || issue.severity === filter);
  if (!visible.length) section.append(text('p',t.noResult));
  else {
    const list = el('ol',{class:'trace-findings'});
    for (const f of visible) list.append(el('li',{class:`trace-finding trace-${f.severity}`},[
      text('strong',`${t[f.severity]}: ${findingLabel(locale,f.code)}`),
      text('p',`${t.path}: ${f.path}`),
      text('p',`${t.detail}: ${f.detail}`),
    ]));
    section.append(list);
  }
  section.append(text('p',t.noData));
  return section;
}
function render() {
  const t = localeCopy(locale);
  document.documentElement.lang = locale;
  document.title = `${t.title} — the App`;
  const fragment = document.createDocumentFragment();
  const skip = el('a',{href:'#trace-main',class:'trace-skip',text:t.skip});
  const header = el('header',{class:'trace-head'});
  header.append(text('h1',t.title),text('p',t.subtitle));
  const lang = el('div',{class:'trace-language'});
  lang.append(el('label',{htmlFor:'trace-lang',text:t.language}));
  const selector = el('select',{id:'trace-lang'});
  for (const item of LOCALES) selector.append(el('option',{value:item,text:item === 'en' ? t.english : t.french,selected:locale===item}));
  selector.addEventListener('change',()=>{locale=selector.value;render();});
  lang.append(selector);header.append(lang);
  const main = el('main',{id:'trace-main'});
  main.append(controls(t),stats(t),register(t),matrix(t),findings(t));
  fragment.append(skip,header,main,el('footer',{class:'trace-foot'},[text('p',t.noEndorsement),text('p',t.links)]),el('div',{id:'trace-announcer',role:'status','aria-live':'polite',class:'trace-status'}));
  root.replaceChildren(fragment);
}
if (root) render();
export { TRACE_SCHEMA };
