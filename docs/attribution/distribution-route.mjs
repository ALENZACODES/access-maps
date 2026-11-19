/** Direct browser entry point. Local file selection only; no network or persistence. */
import { DISTRIBUTION_MAX_BYTES, parseDistributionJson, UNKNOWN } from './distribution-core.mjs';
import { auditDistribution } from './distribution-audit.mjs';
import { compareDistributions } from './distribution-change.mjs';
import { renderDistributionReport, REPORT_MESSAGES } from './distribution-report.mjs';

const doc = document;
const get = id => doc.getElementById(id);
const copy = {
  en: { heading: 'Attribution distribution chain', intro: 'Inspect local publication evidence without uploading files.', language: 'Language:', current: 'Current distribution manifest', previous: 'Previous manifest (optional)', pairs: 'Require English/French route pairs', run: 'Inspect distribution', note: 'Input files stay on this device and are not retained by the page.', results: 'Local results', empty: 'Choose a local JSON file to begin.', error: 'The supplied file could not be read.', text: 'Save text', html: 'Save HTML', json: 'Save JSON', print: 'Print results', disclaimer: 'These checks describe supplied evidence only, not conditions at places or on trips.', findings: 'Audit findings', changes: 'Release changes', views: 'Publication views' },
  fr: { heading: 'Chaîne de diffusion des sources et licences', intro: 'Examinez les renseignements locaux de publication sans transmettre les fichiers.', language: 'Langue\u00a0:', current: 'Manifest de diffusion actuel', previous: 'Manifest précédent (facultatif)', pairs: 'Exiger les vues en anglais et en français', run: 'Examiner la diffusion', note: 'Les fichiers restent sur cet appareil et ne sont pas conservés par la page.', results: 'Résultats locaux', empty: 'Choisissez un fichier JSON local pour commencer.', error: 'Le fichier fourni n’a pas pu être lu.', text: 'Enregistrer le texte', html: 'Enregistrer le HTML', json: 'Enregistrer le JSON', print: 'Imprimer les résultats', disclaimer: 'Ces contrôles décrivent les renseignements fournis, pas les conditions des lieux ou des trajets.', findings: 'Points à examiner', changes: 'Changements entre versions', views: 'Vues publiées' },
};
const state = { locale: new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en', current: null, audit: null, comparison: null };
function element(name, text = undefined) { const item = doc.createElement(name); if (text !== undefined) item.textContent = String(text); return item; }
function announce(value) { get('status').textContent = value; }
function addList(target, entries, label, line) {
  target.append(element('h3', label));
  const list = element('ul');
  if (!entries.length) list.append(element('li', REPORT_MESSAGES[state.locale].empty));
  else for (const entry of entries) list.append(element('li', line(entry)));
  target.append(list);
}
function render() {
  const root = get('report'); root.replaceChildren();
  if (!state.current || !state.audit) return;
  const c = copy[state.locale];
  const summary = element('article');
  summary.append(element('h3', state.current.releaseId), element('p', state.audit.blocked || state.comparison?.blocked ? REPORT_MESSAGES[state.locale].blocked : REPORT_MESSAGES[state.locale].clear));
  root.append(summary);
  addList(root, state.audit.findings, c.findings, finding => `${finding.code} (${finding.level}) — ${finding.path} — ${finding.detail}`);
  addList(root, state.audit.matrix, c.views, row => `${row.viewId} (${row.locale}) — ${row.assetIds.join(', ') || UNKNOWN} — ${row.sources.map(item => item.id).join(', ') || UNKNOWN}`);
  if (state.comparison) addList(root, state.comparison.changes, c.changes, change => `${change.kind} / ${change.id} / ${change.field} (${change.severity}) — ${change.before} → ${change.after}`);
}
function language(value) {
  state.locale = value === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.locale;
  const t = copy[state.locale];
  const pairs = [['heading', 'heading'], ['intro', 'intro'], ['language-label', 'language'], ['current-label', 'current'], ['previous-label', 'previous'], ['pairs-label', 'pairs'], ['run', 'run'], ['local-note', 'note'], ['results-heading', 'results'], ['download-text', 'text'], ['download-html', 'html'], ['download-json', 'json'], ['print', 'print'], ['disclaimer', 'disclaimer']];
  for (const [id, key] of pairs) get(id).textContent = t[key];
  get('language').value = state.locale;
  if (state.current) render(); else announce(t.empty);
  const uri = new URL(location.href); uri.searchParams.set('lang', state.locale); history.replaceState(null, '', uri);
}
async function readChosen(file) {
  if (!file || file.size > DISTRIBUTION_MAX_BYTES) throw new Error('Expected a bounded local file');
  return parseDistributionJson(await file.text());
}
async function inspect() {
  const file = get('current').files?.[0];
  const beforeFile = get('previous').files?.[0];
  try {
    const current = await readChosen(file);
    const previous = beforeFile ? await readChosen(beforeFile) : null;
    const flags = { requirePairs: get('pairs').checked };
    const audit = auditDistribution(current, flags);
    const comparison = previous ? compareDistributions(previous, current, flags) : null;
    state.current = current; state.audit = audit; state.comparison = comparison;
    render();
    announce(audit.blocked || comparison?.blocked ? REPORT_MESSAGES[state.locale].blocked : REPORT_MESSAGES[state.locale].clear);
    for (const id of ['download-text', 'download-html', 'download-json', 'print']) get(id).disabled = false;
  } catch (error) { announce(`${copy[state.locale].error} ${error instanceof Error ? error.message : ''}`); }
}
function download(format) {
  if (!state.current) return;
  const result = renderDistributionReport(state.current, state.audit, state.locale, state.comparison)[format];
  const kind = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/plain';
  const uri = URL.createObjectURL(new Blob([result], { type: `${kind};charset=utf-8` }));
  const link = element('a'); link.href = uri;
  link.download = `distribution-${state.locale}.${format === 'text' ? 'txt' : format}`;
  link.click(); URL.revokeObjectURL(uri);
}
get('language').addEventListener('change', event => language(event.target.value));
get('run').addEventListener('click', () => { void inspect(); });
for (const format of ['text', 'html', 'json']) get(`download-${format}`).addEventListener('click', () => download(format));
get('print').addEventListener('click', () => window.print());
language(state.locale);
