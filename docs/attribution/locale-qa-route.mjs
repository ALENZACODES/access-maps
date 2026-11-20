/** Standalone local-first entry point for bilingual attribution publication review. */
import {
  MAX_BYTES, parseLocaleQaJson, auditLocaleQa, compareLocaleQa,
  renderLocaleQaReport, localeCopy,
} from './locale-qa-index.mjs';

const doc = document;
const get = id => doc.getElementById(id);
const startLocale = new URL(location.href).searchParams.get('lang');
const state = { locale: startLocale === 'fr' ? 'fr' : 'en', release: null, audit: null, comparison: null };
const VIEW_COPY = {
  en: {
    title: 'Bilingual attribution quality review',
    intro: 'Inspect source, licence and notice records from local files without uploading them.',
    language: 'Language', current: 'Choose a release record', previous: 'Choose an earlier record (optional)',
    run: 'Review notices', saveText: 'Save text', saveJson: 'Save JSON', saveHtml: 'Save HTML',
    print: 'Print', empty: 'Choose a local release record to begin.',
    error: 'The selected local file could not be read.',
    hint: 'Records remain in this page until it is closed. Nothing is transmitted.',
    disclaimer: 'This page checks recorded metadata, not conditions at a physical location.',
    sources: 'Sources', pages: 'Publication pages', evidence: 'Evidence', changes: 'Changes',
  },
  fr: {
    title: 'Examen de qualité des mentions bilingues',
    intro: 'Examinez les sources, les licences et les mentions à partir de fichiers locaux, sans les transmettre.',
    language: 'Langue\u00a0:', current: 'Choisir un registre de publication', previous: 'Choisir un registre précédent (facultatif)',
    run: 'Examiner les mentions', saveText: 'Enregistrer le texte', saveJson: 'Enregistrer le JSON', saveHtml: 'Enregistrer le HTML',
    print: 'Imprimer', empty: 'Choisissez un registre local pour commencer.',
    error: 'Impossible de lire le fichier local sélectionné.',
    hint: 'Les données restent dans cette page jusqu’à sa fermeture. Aucun envoi n’est effectué.',
    disclaimer: 'Cette page examine les renseignements consignés, et non les conditions d’un lieu physique.',
    sources: 'Sources', pages: 'Pages publiées', evidence: 'Preuve', changes: 'Changements',
  },
};
function node(tag, value, attrs = {}) {
  const n = doc.createElement(tag);
  if (value !== undefined) n.textContent = String(value);
  for (const [key, val] of Object.entries(attrs)) n.setAttribute(key, String(val));
  return n;
}
function setStatus(value) { get('status').textContent = String(value); }
function copy() { return VIEW_COPY[state.locale]; }
function appendDefinition(dl, label, value) {
  dl.append(node('dt', label), node('dd', value));
}
function noticeView(notice, t) {
  const li = node('li');
  li.append(node('strong', `${notice.id} — ${notice.kind}`));
  li.append(node('p', notice.text));
  li.append(node('p', `${notice.review} · ${notice.reviewDate} · ${notice.targetPx}`));
  li.append(node('p', `${t.evidence}${state.locale === 'fr' ? '\u00a0' : ''}: ${notice.evidenceUrl}`));
  return li;
}
function pageView(page, t) {
  const section = node('article');
  section.append(node('h3', `${page.id} (${page.locale})`));
  const dl = node('dl');
  appendDefinition(dl, 'Route', page.route);
  appendDefinition(dl, 'Offline', page.offline);
  appendDefinition(dl, 'Target', page.targetPx);
  appendDefinition(dl, 'Sources', page.sourceIds.join(', ') || 'UNKNOWN');
  section.append(dl);
  const notices = node('ul');
  for (const notice of page.notices) notices.append(noticeView(notice, t));
  section.append(notices);
  return section;
}
function findingsView(list, empty) {
  const ul = node('ul');
  if (!list.length) ul.append(node('li', empty));
  for (const finding of list) {
    const li = node('li');
    li.append(node('strong', `${finding.code} (${finding.severity})`));
    li.append(node('p', finding.path));
    li.append(node('p', finding.detail));
    ul.append(li);
  }
  return ul;
}
function changesView(list, empty) {
  const ul = node('ul');
  if (!list.length) ul.append(node('li', empty));
  for (const entry of list) {
    const li = node('li');
    li.append(node('strong', `${entry.kind} — ${entry.entity}.${entry.field}`));
    li.append(node('p', `${entry.before} → ${entry.after}`));
    ul.append(li);
  }
  return ul;
}
function render() {
  const root = get('results');
  root.replaceChildren();
  if (!state.release || !state.audit) return;
  const copy = localeCopy(state.locale);
  const t = VIEW_COPY[state.locale];
  root.append(node('h2', copy.findings), findingsView(state.audit.findings, copy.noFindings));
  root.append(node('h2', t.pages));
  for (const page of state.release.pages) root.append(pageView(page, t));
  if (state.comparison) root.append(node('h2', t.changes), changesView(state.comparison.changes, copy.noChanges));
}
function statusFromAudit() {
  const t = localeCopy(state.locale);
  return state.audit?.blocked || state.comparison?.blocked ? t.blocked : t.clear;
}
function setLanguage(input) {
  state.locale = input === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.locale;
  const t = copy();
  const selectors = [
    ['title','title'],['intro','intro'],['language-label','language'],
    ['current-label','current'],['previous-label','previous'],['run','run'],
    ['save-text','saveText'],['save-json','saveJson'],['save-html','saveHtml'],
    ['print','print'],['hint','hint'],['disclaimer','disclaimer'],
  ];
  for (const [id, key] of selectors) get(id).textContent = t[key];
  get('language').value = state.locale;
  render();
  setStatus(state.release ? statusFromAudit() : t.empty);
  const url = new URL(location.href);
  url.searchParams.set('lang', state.locale);
  history.replaceState(null, '', url);
}
async function readLocal(file) {
  if (!file) throw new Error('Select a local file');
  if (file.size > MAX_BYTES) throw new Error('File exceeds the input limit');
  return parseLocaleQaJson(await file.text());
}
async function review() {
  const current = get('current').files?.[0];
  const previous = get('previous').files?.[0];
  try {
    const next = await readLocal(current);
    const before = previous ? await readLocal(previous) : null;
    state.release = next;
    state.audit = auditLocaleQa(next);
    state.comparison = before ? compareLocaleQa(before, next) : null;
    render();
    setStatus(statusFromAudit());
    for (const id of ['save-text','save-json','save-html','print']) get(id).disabled = false;
  } catch (error) {
    setStatus(`${copy().error} ${error instanceof Error ? error.message : ''}`);
  }
}
function download(format) {
  if (!state.release || !state.audit) return;
  const report = renderLocaleQaReport(state.release, state.audit, state.locale, state.comparison);
  const mime = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/plain';
  const url = URL.createObjectURL(new Blob([report[format]], { type: `${mime};charset=utf-8` }));
  const a = node('a');
  a.href = url;
  a.download = `attribution-quality-${state.locale}.${format === 'text' ? 'txt' : format}`;
  a.click();
  URL.revokeObjectURL(url);
}
get('language').addEventListener('change', event => setLanguage(event.target.value));
get('run').addEventListener('click', () => { void review(); });
for (const format of ['text','json','html']) get(`save-${format}`).addEventListener('click', () => download(format));
get('print').addEventListener('click', () => window.print());
setLanguage(state.locale);
