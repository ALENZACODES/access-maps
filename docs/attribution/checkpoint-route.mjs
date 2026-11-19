/** Local-only browser entry point. The UI does not transmit imported documents. */
import { CHECKPOINT_MAX_BYTES, parseCheckpointJson } from './checkpoint-core.mjs';
import { auditCheckpoint, compareCheckpoints } from './checkpoint-audit.mjs';
import { CHECKPOINT_COPY, renderCheckpointHtml, renderCheckpointJson, renderCheckpointText } from './checkpoint-report.mjs';
const state = { locale: new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en', current: null, audit: null, comparison: null };
const $ = id => document.getElementById(id);
const STRINGS = Object.freeze({
  en: Object.freeze({ language: 'Language:', current: 'Current release JSON', previous: 'Earlier release JSON (optional)', run: 'Review records', text: 'Save text report', json: 'Save JSON report', html: 'Save HTML report', print: 'Print report', controls: 'Review controls', introduction: 'Read local source and licence evidence without uploading it.', empty: 'Choose a local file to begin.', error: 'The local document could not be read.', ready: 'Report ready.', findings: 'Findings', changes: 'Changes', none: 'No findings', noChanges: 'No changes' }),
  fr: Object.freeze({ language: 'Langue\u00a0:', current: 'Version courante (JSON)', previous: 'Version précédente (JSON, facultatif)', run: 'Examiner les renseignements', text: 'Enregistrer le rapport texte', json: 'Enregistrer le rapport JSON', html: 'Enregistrer le rapport HTML', print: 'Imprimer le rapport', controls: 'Commandes d’examen', introduction: 'Consultez les renseignements locaux sur les sources et les licences, sans transfert de fichiers.', empty: 'Choisissez un fichier local pour commencer.', error: 'Le fichier local n’a pas pu être lu.', ready: 'Rapport prêt.', findings: 'Constats', changes: 'Changements', none: 'Aucun constat', noChanges: 'Aucun changement' }),
});
function node(tag, value, attrs = {}) {
  const element = document.createElement(tag);
  if (value !== undefined && value !== null) element.textContent = String(value);
  for (const [name, raw] of Object.entries(attrs)) element.setAttribute(name, String(raw));
  return element;
}
function line(parent, tag, value) { const child = node(tag, value); parent.append(child); return child; }
function message(key) { return STRINGS[state.locale][key]; }
function announce(text) { $('status').textContent = text; }
function setControls(enabled) { for (const id of ['download-text', 'download-json', 'download-html', 'print']) $(id).disabled = !enabled; }
function fieldList(parent, data) {
  const list = node('dl');
  for (const [label, value] of data) { line(list, 'dt', label); line(list, 'dd', value); }
  parent.append(list);
}
function findings(parent, items, title, empty) {
  const section = node('section');
  line(section, 'h3', title);
  if (!items.length) line(section, 'p', empty);
  else {
    const list = node('ul');
    for (const item of items) line(list, 'li', `${item.code} — ${item.path}: ${item.detail ?? `${item.before} → ${item.after}`}`);
    section.append(list);
  }
  parent.append(section);
}
function draw() {
  const root = $('results');
  root.replaceChildren();
  if (!state.current || !state.audit) return;
  const m = CHECKPOINT_COPY[state.locale];
  line(root, 'h2', m.title);
  line(root, 'p', state.audit.blocked || state.comparison?.blocked ? m.blocked : m.clear);
  for (const source of state.current.sources) {
    const article = node('article');
    line(article, 'h3', `${source.name} (${source.id})`);
    fieldList(article, [[m.source, source.sourceUrl], [m.licence, source.licenceName], [m.permission, source.permission], [m.tier, source.evidenceTier], [m.terms, source.termsDate], [m.data, source.datasetDate], [m.decision, source.decision], [m.reason, source.decisionReason], [m.notice, source.notice]]);
    root.append(article);
  }
  findings(root, state.audit.findings, message('findings'), message('none'));
  if (state.comparison) findings(root, state.comparison.changes.map(change => ({ ...change, detail: `${change.before} → ${change.after}` })), message('changes'), message('noChanges'));
}
function setLocale(locale) {
  state.locale = locale === 'fr' ? 'fr' : 'en';
  document.documentElement.lang = state.locale;
  $('language').value = state.locale;
  const m = CHECKPOINT_COPY[state.locale];
  const pairs = [['title', m.title], ['language-label', message('language')], ['current-label', message('current')], ['previous-label', message('previous')], ['run', message('run')], ['download-text', message('text')], ['download-json', message('json')], ['download-html', message('html')], ['print', message('print')], ['controls-title', message('controls')], ['introduction', message('introduction')], ['disclaimer', m.readOnly]];
  for (const [id, value] of pairs) $(id).textContent = value;
  if (state.current) draw();
  else announce(message('empty'));
  const target = new URL(location.href);
  target.searchParams.set('lang', state.locale);
  history.replaceState(null, '', target);
}
async function readLocal(file) {
  if (!file || file.size > CHECKPOINT_MAX_BYTES) throw new Error('Select a local JSON file within the size limit');
  return parseCheckpointJson(await file.text());
}
async function review() {
  const latest = $('current').files?.[0];
  const old = $('previous').files?.[0];
  try {
    const current = await readLocal(latest);
    const before = old ? await readLocal(old) : null;
    const audit = auditCheckpoint(current);
    const comparison = before ? compareCheckpoints(before, current) : null;
    Object.assign(state, { current, audit, comparison });
    setControls(true);
    draw();
    announce(`${message('ready')} ${audit.blocked || comparison?.blocked ? CHECKPOINT_COPY[state.locale].blocked : CHECKPOINT_COPY[state.locale].clear}`);
    $('results').focus();
  } catch (error) {
    announce(`${message('error')} ${error instanceof Error ? error.message : ''}`);
  }
}
function save(kind) {
  if (!state.current || !state.audit) return;
  const content = kind === 'html' ? renderCheckpointHtml(state.current, state.audit, state.locale, state.comparison)
    : kind === 'json' ? renderCheckpointJson(state.current, state.audit, state.comparison)
      : renderCheckpointText(state.current, state.audit, state.locale, state.comparison);
  const ext = kind === 'text' ? 'txt' : kind;
  const mime = kind === 'json' ? 'application/json' : kind === 'html' ? 'text/html' : 'text/plain';
  const address = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const anchor = node('a', '', { href: address, download: `source-checkpoint-${state.locale}.${ext}` });
  anchor.click();
  URL.revokeObjectURL(address);
}
$('language').addEventListener('change', event => setLocale(event.target.value));
$('run').addEventListener('click', () => { void review(); });
for (const kind of ['text', 'json', 'html']) $(`download-${kind}`).addEventListener('click', () => save(kind));
$('print').addEventListener('click', () => window.print());
setLocale(state.locale);
