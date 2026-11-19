/** Directly served browser route; no remote data or background work. */
import { CLAIM_MAX_BYTES, parseClaimTraceJson } from './claim-trace-core.mjs';
import { auditClaimTrace } from './claim-trace-audit.mjs';
import { compareClaimTraces } from './claim-trace-change.mjs';
import { renderClaimReport, TRACE_COPY } from './claim-trace-report.mjs';
const text = {
  en: { title: 'Claim and source trace', intro: 'Review local source evidence without uploading it.', language: 'Language:', current: 'Choose a claim record', previous: 'Choose an earlier record (optional)', run: 'Review evidence', saveText: 'Save text report', saveJson: 'Save JSON report', saveHtml: 'Save HTML report', print: 'Print results', empty: 'Choose a local JSON file to begin.', error: 'The local record could not be read.', disclaimer: 'This page describes submitted evidence. It does not assess actual accessibility or service conditions.', changes: 'Changes' },
  fr: { title: 'Traçabilité des affirmations et des sources', intro: 'Examinez les renseignements locaux sur les sources sans les transmettre.', language: 'Langue\u00a0:', current: 'Choisir un registre des affirmations', previous: 'Choisir un registre précédent (facultatif)', run: 'Examiner les renseignements', saveText: 'Enregistrer le rapport texte', saveJson: 'Enregistrer le rapport JSON', saveHtml: 'Enregistrer le rapport HTML', print: 'Imprimer les résultats', empty: 'Choisissez un fichier JSON local pour commencer.', error: 'Le registre local n’a pas pu être lu.', disclaimer: 'Cette page décrit les renseignements fournis. Elle n’évalue pas les conditions réelles d’accès ou de service.', changes: 'Changements' },
};
const doc = document;
const get = (id) => doc.getElementById(id);
const initial = new URL(location.href).searchParams.get('lang');
const state = { lang: initial === 'fr' ? 'fr' : 'en', trace: null, audit: null, comparison: null };
function node(tag, value, attrs = {}) {
  const item = doc.createElement(tag);
  if (value !== undefined) item.textContent = String(value);
  for (const [key, val] of Object.entries(attrs)) item.setAttribute(key, String(val));
  return item;
}
function setStatus(value) { get('status').textContent = value; }
function addFinding(container, entry) {
  const listItem = node('li');
  listItem.append(node('strong', `${entry.code ?? entry.kind} (${entry.level})`), node('p', [entry.path ?? entry.id, entry.detail ?? entry.field].filter(Boolean).join(' · ')));
  container.append(listItem);
}
function render() {
  const root = get('results');
  root.replaceChildren();
  if (!state.trace || !state.audit) return;
  const copy = TRACE_COPY[state.lang];
  root.append(node('h2', copy.findings));
  const list = node('ul');
  if (state.audit.findings.length) for (const item of state.audit.findings) addFinding(list, item);
  else list.append(node('li', copy.noFindings));
  root.append(list);
  root.append(node('h2', copy.claims));
  for (const claim of state.trace.claims) {
    const article = node('article');
    article.append(node('h3', claim.id), node('p', claim.text));
    article.append(node('p', `${copy.observedDate}${state.lang === 'fr' ? '\u00a0' : ''}: ${claim.observedDate}`));
    const sources = node('ul');
    for (const sid of claim.sourceIds) {
      const source = state.trace.sources.find((item) => item.id === sid);
      const item = node('li');
      if (!source) item.append(node('span', `UNKNOWN: ${sid}`));
      else item.append(node('strong', source.name), node('p', `${source.licence} · ${source.permission} · ${source.tier} · ${source.datasetDate}`), node('pre', source.notice));
      sources.append(item);
    }
    article.append(sources);
    root.append(article);
  }
  if (state.comparison) {
    root.append(node('h2', text[state.lang].changes));
    const list = node('ul');
    if (state.comparison.changes.length) for (const item of state.comparison.changes) addFinding(list, item);
    else list.append(node('li', copy.noFindings));
    root.append(list);
  }
}
function setLanguage(language) {
  state.lang = language === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.lang;
  const copy = text[state.lang];
  for (const [id, key] of [['title','title'], ['intro','intro'], ['language-label','language'], ['current-label','current'], ['previous-label','previous'], ['run','run'], ['save-text','saveText'], ['save-json','saveJson'], ['save-html','saveHtml'], ['print','print'], ['disclaimer','disclaimer']]) get(id).textContent = copy[key];
  get('language').value = state.lang;
  if (state.trace) { render(); setStatus(state.audit.blocked || state.comparison?.blocked ? TRACE_COPY[state.lang].blocked : TRACE_COPY[state.lang].clear); }
  else setStatus(copy.empty);
  const url = new URL(location.href);
  url.searchParams.set('lang', state.lang);
  history.replaceState(null, '', url);
}
async function readLocal(file) {
  if (!file) throw new Error('A local file must be selected');
  if (file.size > CLAIM_MAX_BYTES) throw new Error('File exceeds maximum size');
  return parseClaimTraceJson(await file.text());
}
async function review() {
  const chosen = get('current').files?.[0];
  const previous = get('previous').files?.[0];
  try {
    const trace = await readLocal(chosen);
    const before = previous ? await readLocal(previous) : null;
    state.trace = trace;
    state.audit = auditClaimTrace(trace);
    state.comparison = before ? compareClaimTraces(before, trace) : null;
    render();
    setStatus(state.audit.blocked || state.comparison?.blocked ? TRACE_COPY[state.lang].blocked : TRACE_COPY[state.lang].clear);
    for (const name of ['save-text', 'save-json', 'save-html', 'print']) get(name).disabled = false;
  } catch (error) {
    setStatus(`${text[state.lang].error} ${error instanceof Error ? error.message : ''}`);
  }
}
function save(kind) {
  if (!state.trace || !state.audit) return;
  const report = renderClaimReport(state.trace, state.audit, state.lang, state.comparison);
  const mime = kind === 'html' ? 'text/html' : kind === 'json' ? 'application/json' : 'text/plain';
  const url = URL.createObjectURL(new Blob([report[kind]], { type: `${mime};charset=utf-8` }));
  const link = node('a');
  link.href = url;
  link.download = `claim-trace-${state.lang}.${kind === 'text' ? 'txt' : kind}`;
  link.click();
  URL.revokeObjectURL(url);
}
get('language').addEventListener('change', (event) => setLanguage(event.target.value));
get('run').addEventListener('click', () => { void review(); });
for (const kind of ['text', 'json', 'html']) get(`save-${kind}`).addEventListener('click', () => save(kind));
get('print').addEventListener('click', () => window.print());
setLanguage(state.lang);
