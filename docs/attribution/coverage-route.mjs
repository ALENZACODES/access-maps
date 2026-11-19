/** Offline browser entry point. Only explicit local file input is read. */
import { MAX_DOCUMENT_BYTES, parseCoverageJson } from './coverage-core.mjs';
import { auditCoverage, coverageMatrix } from './coverage-audit.mjs';
import { compareCoverage } from './coverage-change.mjs';
import { renderCoverage, coverageCopy, cleanUrl } from './coverage-report.mjs';

export const ROUTE_COPY = Object.freeze({
  en: Object.freeze({page:'Attribution coverage', intro:'Review source records locally. Missing facts remain UNKNOWN.',
    load:'Local release records',candidate:'Candidate release (JSON)',previous:'Earlier release (optional JSON)',language:'Language',
    review:'Review records',results:'Audit results',sources:'Source and licence evidence',findings:'Release findings',changes:'Changes',
    exports:'Local exports',text:'Export text',json:'Export JSON',html:'Export HTML',print:'Print',
    empty:'No file selected.',noFindings:'No findings in the supplied records.',noChanges:'No differences to display.',
    invalid:'Unable to read the selected file.',disclaimer:'A source record does not establish conditions at any physical location.'}),
  fr: Object.freeze({page:'Couverture des sources et des licences',intro:'Examinez les sources localement. Les renseignements absents restent UNKNOWN.',
    load:'Dossiers locaux de publication',candidate:'Version candidate (JSON)',previous:'Version précédente (JSON, facultative)',
    language:'Langue',review:'Examiner les dossiers',results:'Résultats de l’examen',sources:'Sources et licences',findings:'Points à examiner',
    changes:'Changements',exports:'Exports locaux',text:'Exporter le texte',json:'Exporter le JSON',html:'Exporter le HTML',print:'Imprimer',
    empty:'Aucun fichier sélectionné.',noFindings:'Aucun point à signaler dans les dossiers fournis.',
    noChanges:'Aucune différence à afficher.',invalid:'Lecture du fichier impossible.',
    disclaimer:'Un dossier de source ne décrit pas les conditions d’un lieu.'}),
});

export function createNode(doc, tag, content, className) {
  const node = doc.createElement(tag);
  if (content !== undefined) node.textContent = String(content);
  if (className) node.className = className;
  return node;
}
export function clearNode(element) { while (element.firstChild) element.removeChild(element.firstChild); }
function appendList(doc, parent, items, display) {
  const ul = createNode(doc, 'ul');
  for (const item of items) ul.append(createNode(doc, 'li', display(item)));
  parent.append(ul);
}
function renderSourceTable(doc, parent, register, locale) {
  const labels = coverageCopy(locale);
  const columns = ['source','licence','tier','permission','date','origin','terms'];
  const wrap = createNode(doc,'div',undefined,'scroll'); const table = createNode(doc,'table');
  const thead = createNode(doc,'thead'); const tr = createNode(doc,'tr');
  for (const column of columns) { const th = createNode(doc,'th',labels[column]); th.scope='col'; tr.append(th); }
  thead.append(tr); table.append(thead);
  const tbody = createNode(doc,'tbody');
  for (const item of register.sources) {
    const row = createNode(doc,'tr');
    for (const value of [item.title,item.licenceName,item.evidenceTier,item.permission,item.datasetAsOf]) row.append(createNode(doc,'td',value));
    for (const value of [item.sourceUrl,item.licenceUrl]) {
      const td = createNode(doc,'td'); const safe=cleanUrl(value);
      if (safe) { const a=createNode(doc,'a',value);a.href=safe;a.rel='noopener noreferrer';a.target='_blank';td.append(a); }
      else td.textContent=value;
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(tbody);wrap.append(table);parent.append(wrap);
}

export function renderCoveragePage(doc, register, audit, locale = 'en', comparison = null) {
  const t = ROUTE_COPY[locale === 'fr' ? 'fr' : 'en'];
  const status = doc.getElementById('status');
  if (status) status.textContent = audit.blocked || comparison?.blocked ?
    coverageCopy(locale).blocked : coverageCopy(locale).clear;
  const summary = doc.getElementById('summary');
  if (summary) {
    clearNode(summary);
    summary.append(createNode(doc,'p',`${register.releaseId} · ${audit.sources} / ${audit.views} · ${audit.blocks} / ${audit.attention} / ${audit.info}`,
      audit.blocked ? 'status-block':'status-clear'));
    appendList(doc, summary, coverageMatrix(register), (row) => `${row.viewId} (${row.language}): ` +
      row.sources.map((source) => `${source.id} [${source.licence}; ${source.tier}; ${source.date}]`).join(', '));
  }
  const sources = doc.getElementById('sources');
  if (sources) {clearNode(sources);renderSourceTable(doc,sources,register,locale);}
  const findings = doc.getElementById('findings');
  if (findings) {
    clearNode(findings);
    if (!audit.findings.length) findings.append(createNode(doc,'p',t.noFindings));
    else appendList(doc,findings,audit.findings,(item) => `${item.level}: ${item.path} · ${item.code}: ${item.detail}`);
  }
  const changes = doc.getElementById('changes');
  if (changes) {
    clearNode(changes);
    if (!comparison?.changes.length) changes.append(createNode(doc,'p',t.noChanges));
    else appendList(doc,changes,comparison.changes,(item) => `${item.kind}.${item.id}.${item.field}: ${item.before} → ${item.after}`);
  }
}
export async function loadCoverageFile(file) {
  if (!file || typeof file.size !== 'number' || file.size > MAX_DOCUMENT_BYTES) throw new Error('File too large or unavailable');
  const content = await file.text();
  return parseCoverageJson(content);
}
function download(doc, filename, content, type) {
  const blob = new Blob([content],{type});
  const objectUrl = URL.createObjectURL(blob);
  const a = createNode(doc,'a');a.href=objectUrl;a.download=filename;
  doc.body.append(a);a.click();a.remove();URL.revokeObjectURL(objectUrl);
}
export function startCoverageRoute(doc, win) {
  const form = doc.getElementById('coverage-form');
  if (!form) return;
  const localeSelect = doc.getElementById('locale');
  let current = null;
  const updateLabels = () => {
    const locale = localeSelect.value === 'fr' ? 'fr' : 'en';
    const t = ROUTE_COPY[locale]; doc.documentElement.lang=locale;
    for (const [id,key] of [['page-title','page'],['intro','intro'],['load-title','load'],['result-title','results'],
      ['sources-title','sources'],['findings-title','findings'],['changes-title','changes'],['exports-title','exports'],
      ['disclaimer','disclaimer']]) { const node=doc.getElementById(id);if(node)node.textContent=t[key]; }
    for (const [id,key] of [['candidate','candidate'],['previous','previous'],['locale','language']]) {
      const control = doc.getElementById(id);
      const label = control?.labels?.[0];if(label)label.textContent=key==='language' && locale==='fr' ? 'Langue\u00a0:' : t[key];
    }
    for (const [id,key] of [['audit','review'],['text-export','text'],['json-export','json'],['html-export','html'],['print','print']]) {
      const node=doc.getElementById(id);if(node)node.textContent=t[key];
    }
    if (current) renderCoveragePage(doc,current.register,current.audit,locale,current.comparison);
    else {const status=doc.getElementById('status');if(status)status.textContent=t.empty;}
  };
  localeSelect.addEventListener('change', updateLabels);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const status=doc.getElementById('status');
      try {
        const candidate=await loadCoverageFile(doc.getElementById('candidate').files?.[0]);
        const earlier=doc.getElementById('previous').files?.[0];
        const previous=earlier ? await loadCoverageFile(earlier) : null;
        const audit=auditCoverage(candidate);
        const comparison=previous ? compareCoverage(previous,candidate) : null;
        current={register:candidate,audit,comparison};
        renderCoveragePage(doc,candidate,audit,localeSelect.value,comparison);
        for(const id of ['text-export','json-export','html-export','print'])doc.getElementById(id).disabled=false;
      } catch(error) { current=null;status.textContent=`${ROUTE_COPY[localeSelect.value].invalid} ${error instanceof Error ? error.message : ''}`;
        for(const id of ['text-export','json-export','html-export','print'])doc.getElementById(id).disabled=true; }
    })();
  });
  for (const [id,format,mime,extension] of [['text-export','text','text/plain','txt'],['json-export','json','application/json','json'],
    ['html-export','html','text/html','html']]) {
    doc.getElementById(id).addEventListener('click', () => {
      if(!current)return;
      const report=renderCoverage(current.register,current.audit,localeSelect.value,current.comparison);
      download(doc,`attribution-coverage-${localeSelect.value}.${extension}`,report[format],mime);
    });
  }
  doc.getElementById('print').addEventListener('click',()=>{if(current)win.print();});
  updateLabels();
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') startCoverageRoute(document,window);
