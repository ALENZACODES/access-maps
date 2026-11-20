import {emptyConflicts,newConflict,parseConflicts,upsertConflict,removeConflict,filterConflicts,serializeConflicts,CATEGORIES,SEVERITIES,DECISIONS,EVIDENCE,UNKNOWN} from './conflict-core.mjs';
import {auditConflicts,reconcileAgainstBaseline,summarizeBySource} from './conflict-audit.mjs';
import {COPY,normalizeLocale,reportText,changesText,rowsTsv} from './conflict-copy.mjs';

/** Explicit local-file interactions only. No storage, timers, or requests. */
const root=document.querySelector('#conflict-root');
const params=new URLSearchParams(location.search);
let locale=normalizeLocale(params.get('lang'));
let current=emptyConflicts();
let previous=null;
let selected=null;
let decisionFilter='all';
let severityFilter='all';
let query='';
const el=(tag,text='',className='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
const append=(parent,...children)=>{for(const c of children)parent.append(c);return parent;};
const t=()=>COPY[locale];
function status(message){const node=document.querySelector('#conflict-status');if(node)node.textContent=message;}
function button(label,fn){const n=el('button',label);n.type='button';n.addEventListener('click',fn);return n;}
function labelControl(label,control){const wrap=el('label');append(wrap,el('span',label),control);return wrap;}
function select(options,value,onChange){const n=el('select');for(const [id,title] of options){const o=el('option',title);o.value=id;n.append(o);}n.value=value;n.addEventListener('change',()=>onChange(n.value));return n;}
function input(value,onChange){const n=el('input');n.type='text';n.value=value;n.addEventListener('change',()=>onChange(n.value));return n;}
function download(name,content,mime='text/plain;charset=utf-8'){
 const file=new Blob([content],{type:mime});const url=URL.createObjectURL(file);const a=el('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);status(t().exported);
}
async function readFile(file){if(!file||file.size>1048576)throw Error('File missing or too large');return file.text();}
function picker(text,handle){const label=el('label');const inp=el('input');inp.type='file';inp.accept='.json,application/json';inp.addEventListener('change',async()=>{try{const raw=await readFile(inp.files?.[0]);const parsed=parseConflicts(raw);handle(parsed);status(t().loaded);}catch{status(t().fileError);}finally{inp.value='';}});append(label,el('span',text),inp);return label;}
function fieldset(fields,record,changes){const box=el('fieldset');box.append(el('legend',t().record));for(const [key,title,kind] of fields){const value=changes[key]??record[key];let control;if(kind==='choice'){const options=key==='category'?CATEGORIES:key==='severity'?SEVERITIES:key==='decision'?DECISIONS:EVIDENCE;control=select(options.map(o=>[o,o]),value,v=>changes[key]=v);}else{control= input(value,v=>changes[key]=v);}box.append(labelControl(title,control));}return box;}
function recordForm(){const area=el('section');area.setAttribute('aria-labelledby','form-heading');area.append(el('h2',t().record));area.lastChild.id='form-heading';const row=current.conflicts.find(r=>r.id===selected)??newConflict(selected??`item-${String(current.conflicts.length+1).padStart(2,'0')}`);const changes={};
 const fields=[['id','ID'],['surfaceId',t().surface],['layerId',t().layer],['sourceId',t().source],['category',t().category,'choice'],['current',t().current],['proposed',t().proposed],['source',t().link],['licence',t().licence],['retrievedOn',t().retrieved],['tier',t().tier,'choice'],['reason',t().reason],['severity',t().severity,'choice'],['decision',t().decision,'choice'],['reviewedOn',t().reviewed],['note',t().note]];
 const form=el('form');form.append(fieldset(fields,row,changes));form.addEventListener('submit',e=>{e.preventDefault();try{const next={...row,...changes};if(next.id!==row.id && current.conflicts.some(r=>r.id===next.id))throw Error('duplicate id');const base=removeConflict(current,row.id);current=upsertConflict(base,next);selected=next.id;render();status(t().saved);}catch(error){status(`${t().fileError} ${error.message}`);}});const save=el('button',t().save);save.type='submit';form.append(save);area.append(form);return area;}
function listView(){const pane=el('section');pane.setAttribute('aria-labelledby','records-heading');const heading=el('h2',t().filter);heading.id='records-heading';pane.append(heading);
 const controls=el('div',undefined,'filters');append(controls,labelControl(t().decision,select([['all',t().all],...DECISIONS.map(x=>[x,t()[x]??x])],decisionFilter,v=>{decisionFilter=v;render();})),labelControl(t().severity,select([['all',t().all],...SEVERITIES.map(x=>[x,t()[x]??x])],severityFilter,v=>{severityFilter=v;render();})),labelControl(t().filter,input(query,v=>{query=v;render();})));pane.append(controls);
 const rows=filterConflicts(current,{decision:decisionFilter,severity:severityFilter,query});const list=el('ul');for(const row of rows){const li=el('li');const name=`${row.id} · ${row.sourceId} · ${row.category} · ${row.decision}`;const b=button(name,()=>{selected=row.id;render();document.querySelector('#form-heading')?.scrollIntoView({block:'start'});});if(selected===row.id)b.setAttribute('aria-current','true');li.append(b);list.append(li);}if(!rows.length)list.append(el('li',t().none));pane.append(list);return pane;}
function summaries(){const area=el('section');area.setAttribute('aria-labelledby','summary-heading');const heading=el('h2',t().summary);heading.id='summary-heading';area.append(heading);const a=auditConflicts(current);area.append(el('p',`${current.conflicts.length} ${t().count} · ${a.blocking} ${t().blocking}`));const summary=el('ul');for(const s of summarizeBySource(current))summary.append(el('li',`${s.sourceId}: ${s.total} · ${s.open} ${t().open} · ${s.resolved} ${t().resolved}`));area.append(summary);const h=el('h3',t().findings);area.append(h);const ul=el('ul');for(const f of a.findings)ul.append(el('li',`${f.id} — ${f.code} (${f.severity})`));if(!a.findings.length)ul.append(el('li',t().none));area.append(ul);return area;}
function comparisonView() {
 const section=el('section');
 section.setAttribute('aria-labelledby','comparison-heading');
 const heading=el('h2',t().changes);
 heading.id='comparison-heading';
 section.append(heading);
 if(!previous){section.append(el('p',t().pending));return section;}
 const result=reconcileAgainstBaseline(previous,current);
 const summary=el('p',`${result.changes.length} ${t().count} · ${result.regressions.length} ${t().blocking}`);
 section.append(summary);
 const list=el('ul');
 for(const change of result.changes){
  const li=el('li');
  const critical=result.regressions.some(item=>item.id===change.id && item.field===change.field);
  const prefix=critical?`${t().blocking}: `:'';
  li.textContent=`${prefix}${change.id} · ${change.kind} · ${change.field} · ${change.before} → ${change.after}`;
  list.append(li);
 }
 if(!result.changes.length)list.append(el('li',t().none));
 section.append(list);
 return section;
}
function render(){if(!root)return;document.documentElement.lang=locale;document.title=`${t().title} — the App`;root.replaceChildren();const main=el('main');main.id='main';append(main,el('h1',t().title),el('p',t().intro),el('p',t().warning));
 const tools=el('section',undefined,'tools');tools.setAttribute('aria-label',t().language);append(tools,labelControl(t().language,select([['en',t().english],['fr',t().french]],locale,v=>{locale=normalizeLocale(v);history.replaceState(null,'',`?lang=${locale}`);render();})),picker(t().import,x=>{current=x;selected=null;render();}),picker(t().previous,x=>{previous=x;render();}),button(t().add,()=>{selected=null;render();document.querySelector('#form-heading')?.scrollIntoView({block:'start'});}),button(t().export,()=>download('attribution-conflicts.json',serializeConflicts(current),'application/json')),button(t().report,()=>download(`attribution-conflicts-${locale}.txt`,reportText(current,locale))),button('TSV',()=>download('attribution-conflicts.tsv',rowsTsv(current),'text/tab-separated-values')));
 if(selected)tools.append(button(t().remove,()=>{current=removeConflict(current,selected);selected=null;render();status(t().removed);}));
 if(previous)tools.append(button(t().changes,()=>{const result=reconcileAgainstBaseline(previous,current);download(`attribution-conflict-changes-${locale}.txt`,changesText(previous,current,locale));status(`${t().changes}: ${result.changes.length}`);}));
 main.append(tools);const columns=el('div',undefined,'columns');append(columns,listView(),recordForm());main.append(columns,summaries(),comparisonView());const footer=el('p');const link=el('a',t().close);link.href='index.html';footer.append(link);main.append(footer);root.append(main);}
render();
