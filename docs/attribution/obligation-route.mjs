/** Offline-only browser entry point, shared pure contract/audit/report with CLI. */
import {
  parseObligationJson, MAX_OBLIGATION_BYTES, auditObligationRegister,
  buildObligationChecklist, compareObligationRegisters,
  renderObligationReport, OBLIGATION_COPY,
} from './obligation-index.mjs';
const doc = document;
const get = id => doc.getElementById(id);
const params = new URL(location.href).searchParams;
const state = { locale: params.get('lang') === 'fr' ? 'fr' : 'en', current: null, before: null, audit: null, comparison: null };
const copy = {
  en: { title: 'Attribution placement review', intro: 'Inspect source notices and the pages where they appear using local files.', language: 'Language:', current: 'Current register JSON', previous: 'Earlier register JSON (optional)', pairs: 'Require EN/FR companion pages', run: 'Inspect placements', privacy: 'Records remain in this browser session. No files are uploaded.', empty: 'Choose the current register to begin.', bad: 'The supplied record could not be read.', saveText: 'Save text', saveJson: 'Save JSON', saveHtml: 'Save HTML', print: 'Print', disclaimer: 'These findings describe submitted evidence, not actual accessibility conditions.', findings: 'Audit findings', actions: 'Open actions', changes: 'Changes since the earlier register' },
  fr: { title: 'Examen des mentions de source', intro: 'Examinez les mentions et leurs emplacements avec des fichiers locaux.', language: 'Langue\u00a0:', current: 'Registre actuel en JSON', previous: 'Registre précédent en JSON (facultatif)', pairs: 'Exiger les pages correspondantes en français et en anglais', run: 'Examiner les mentions', privacy: 'Les fichiers restent dans cette session. Aucun fichier n’est transmis.', empty: 'Choisissez le registre actuel pour commencer.', bad: 'Impossible de lire le registre fourni.', saveText: 'Enregistrer le texte', saveJson: 'Enregistrer le JSON', saveHtml: 'Enregistrer le HTML', print: 'Imprimer', disclaimer: 'Ces résultats décrivent les renseignements fournis et non les conditions réelles d’accès.', findings: 'Points à examiner', actions: 'Actions à traiter', changes: 'Changements depuis le registre précédent' },
};
function el(tag, value, attributes = {}) {
  const node = doc.createElement(tag);
  if (value !== undefined) node.textContent = String(value);
  for (const [key, attr] of Object.entries(attributes)) node.setAttribute(key, String(attr));
  return node;
}
function setStatus(value) { get('status').textContent = value; }
function populateList(parent, items, describe, empty) {
  const list = el('ul');
  if (!items.length) list.append(el('li', empty));
  for (const item of items) {
    const entry = el('li');
    const [heading, detail] = describe(item);
    entry.append(el('strong', heading), el('p', detail));
    list.append(entry);
  }
  parent.append(list);
}
function render() {
  const root = get('report');
  root.replaceChildren();
  if (!state.current || !state.audit) return;
  const t = OBLIGATION_COPY[state.locale];
  root.append(el('h2', t.title), el('p', state.audit.blocked || state.comparison?.blocked ? t.blocked : t.clear));
  const summary = el('dl');
  for (const [label, value] of [[t.release, state.current.releaseId], [t.sources, state.audit.counts.sources], [t.pages, state.audit.counts.pages], [t.placements, state.audit.counts.placements], [t.witnesses, state.audit.counts.witnesses]]) {
    summary.append(el('dt', label), el('dd', value));
  }
  root.append(summary, el('h2', t.findings));
  populateList(root, state.audit.findings, x => [`${x.level}: ${x.code}`, `${x.path} · ${x.detail}`], t.none);
  root.append(el('h2', t.actions));
  populateList(root, buildObligationChecklist(state.current, state.audit), x => [x.code, `${x.context} · ${x.detail}`], t.none);
  root.append(el('h2', t.sources));
  populateList(root, state.current.sources, x => [x.title, `${x.id} · ${x.licenceName} · ${x.permission} · ${x.datasetAsOf}`], t.none);
  root.append(el('h2', t.placements));
  populateList(root, state.current.placements, x => [x.id, `${x.pageId} · ${x.sourceId} · ${x.kind} · ${x.visibility} · ${x.notice}`], t.none);
  if (state.comparison) {
    root.append(el('h2', t.changes));
    populateList(root, state.comparison.changes, x => [`${x.kind}: ${x.field}`, `${x.recordId} · ${x.before} → ${x.after}`], t.none);
  }
}
function language(locale) {
  state.locale = locale === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.locale;
  get('language').value = state.locale;
  const t = copy[state.locale];
  for (const [id, key] of [['title', 'title'], ['intro', 'intro'], ['language-label', 'language'], ['current-label', 'current'], ['previous-label', 'previous'], ['pairs-label', 'pairs'], ['run', 'run'], ['privacy', 'privacy'], ['save-text', 'saveText'], ['save-json', 'saveJson'], ['save-html', 'saveHtml'], ['print', 'print'], ['disclaimer', 'disclaimer']]) get(id).textContent = t[key];
  if (state.current) {
    render();
    setStatus(state.audit.blocked || state.comparison?.blocked ? OBLIGATION_COPY[state.locale].blocked : OBLIGATION_COPY[state.locale].clear);
  } else setStatus(t.empty);
  const url = new URL(location.href);
  url.searchParams.set('lang', state.locale);
  history.replaceState(null, '', url);
}
async function readLocal(file) {
  if (!file) throw new Error('Choose a local JSON file');
  if (file.size > MAX_OBLIGATION_BYTES) throw new Error('File size exceeds limit');
  return parseObligationJson(await file.text());
}
async function inspect() {
  const candidate = get('current').files?.[0];
  const earlier = get('previous').files?.[0];
  try {
    const current = await readLocal(candidate);
    const before = earlier ? await readLocal(earlier) : null;
    const options = { requirePairs: get('pairs').checked };
    const audit = auditObligationRegister(current, options);
    const comparison = before ? compareObligationRegisters(before, current, options) : null;
    state.current = current;
    state.before = before;
    state.audit = audit;
    state.comparison = comparison;
    render();
    setStatus(audit.blocked || comparison?.blocked ? OBLIGATION_COPY[state.locale].blocked : OBLIGATION_COPY[state.locale].clear);
    for (const key of ['save-text', 'save-json', 'save-html', 'print']) get(key).disabled = false;
  } catch (error) {
    setStatus(`${copy[state.locale].bad} ${error instanceof Error ? error.message : ''}`);
  }
}
function download(kind) {
  if (!state.current || !state.audit) return;
  const report = renderObligationReport(state.current, state.audit, state.locale, state.comparison);
  const mime = kind === 'html' ? 'text/html' : kind === 'json' ? 'application/json' : 'text/plain';
  const blob = new Blob([report[kind]], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = `obligation-report-${state.locale}.${kind === 'text' ? 'txt' : kind}`;
  a.click();
  URL.revokeObjectURL(url);
}
get('language').addEventListener('change', event => language(event.target.value));
get('run').addEventListener('click', () => { void inspect(); });
get('pairs').addEventListener('change', () => {
  if (!state.current) return;
  const option = { requirePairs: get('pairs').checked };
  state.audit = auditObligationRegister(state.current, option);
  state.comparison = state.before ? compareObligationRegisters(state.before, state.current, option) : null;
  render();
  setStatus(state.audit.blocked || state.comparison?.blocked ? OBLIGATION_COPY[state.locale].blocked : OBLIGATION_COPY[state.locale].clear);
});
for (const kind of ['text', 'json', 'html']) get(`save-${kind}`).addEventListener('click', () => download(kind));
get('print').addEventListener('click', () => window.print());
language(state.locale);
