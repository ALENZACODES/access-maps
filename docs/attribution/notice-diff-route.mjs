/** Offline browser entry. No network calls, persistent state, or scheduled work. */
import { parseNoticeReleaseJson, MAX_DOCUMENT_BYTES } from './notice-diff-core.mjs';
import { auditNoticeRelease } from './notice-diff-audit.mjs';
import { compareNoticeReleases } from './notice-diff-change.mjs';
import { renderNoticeReport, COPY } from './notice-diff-report.mjs';

const doc = document;
const get = id => doc.getElementById(id);
const messages = Object.freeze({
  en: Object.freeze({
    title: 'Attribution notice change review', intro: 'Inspect locally supplied source notices and their recorded rights.',
    skip: 'Skip to main content', language: 'Language:', current: 'Current notice release (JSON)',
    previous: 'Earlier notice release (optional)', pairs: 'Require EN/FR route pairs',
    online: 'Allow a route without offline evidence', run: 'Inspect notices',
    hint: 'Files stay on this device. Missing dates remain UNKNOWN.', report: 'Review results',
    saveText: 'Save text', saveJson: 'Save JSON', saveHtml: 'Save HTML', print: 'Print',
    empty: 'Choose a local JSON file.', error: 'The supplied file could not be read.',
    disclaimer: 'This page reports the supplied evidence. It does not assess access conditions.',
    changes: 'Changes', sources: 'Sources', notices: 'Notices', surfaces: 'Publication surfaces',
  }),
  fr: Object.freeze({
    title: 'Examen des changements des mentions de source', intro: 'Examinez les mentions des sources et les droits consignés dans des fichiers locaux.',
    skip: 'Aller au contenu principal', language: 'Langue\u00a0:', current: 'Version actuelle des mentions (JSON)',
    previous: 'Version précédente des mentions (facultative)', pairs: 'Exiger les pages correspondantes en anglais et en français',
    online: 'Permettre une page sans preuve de consultation hors connexion', run: 'Examiner les mentions',
    hint: 'Les fichiers restent sur cet appareil. Les dates manquantes restent UNKNOWN.', report: 'Résultats de l’examen',
    saveText: 'Enregistrer le texte', saveJson: 'Enregistrer le JSON', saveHtml: 'Enregistrer le HTML', print: 'Imprimer',
    empty: 'Choisissez un fichier JSON local.', error: 'Le fichier fourni n’a pas pu être lu.',
    disclaimer: 'Cette page présente les renseignements fournis sans évaluer les conditions d’accès.',
    changes: 'Changements', sources: 'Sources', notices: 'Mentions', surfaces: 'Vues publiées',
  }),
});
const params = new URL(location.href).searchParams;
const state = { language: params.get('lang') === 'fr' ? 'fr' : 'en', release: null, audit: null, comparison: null };
function make(tag, text = '', attributes = {}) {
  const element = doc.createElement(tag);
  element.textContent = String(text);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}
function status(text) { get('status').textContent = text; }
function listOf(parent, items, render, empty) {
  const list = make('ul');
  if (items.length === 0) list.append(make('li', empty));
  else for (const item of items) list.append(render(item));
  parent.append(list);
}
function findingItem(item) {
  const li = make('li', '', { class: item.level ?? item.severity ?? 'information' });
  li.append(make('strong', `${item.code ?? item.kind} (${item.level ?? item.severity})`));
  li.append(make('p', [item.path ?? item.entity, item.detail ?? item.field].filter(Boolean).join(' · ')));
  return li;
}
function recordItem(record, type) {
  const item = make('li');
  item.append(make('strong', record.id));
  const pieces = type === 'source' ? [record.licence, record.permission, record.tier, record.datasetDate] :
    type === 'notice' ? [record.sourceId, record.locale, record.kind, record.visible] :
      [record.route, record.locale, record.offline, record.targetPx];
  item.append(make('p', pieces.join(' · ')));
  if (type === 'notice') item.append(make('pre', record.text));
  return item;
}
function addSection(root, title, items, callback, empty) {
  const section = make('section');
  section.append(make('h3', title));
  listOf(section, items, callback, empty);
  root.append(section);
}
function render() {
  const root = get('results');
  root.replaceChildren();
  if (!state.release || !state.audit) return;
  const t = COPY[state.language];
  root.append(make('h3', state.audit.blocked || state.comparison?.blocked ? t.blocked : t.clear));
  addSection(root, t.findings, state.audit.findings, findingItem, t.noFindings);
  if (state.comparison) addSection(root, messages[state.language].changes, state.comparison.changes, findingItem, t.noChanges);
  addSection(root, messages[state.language].sources, state.release.sources, s => recordItem(s, 'source'), t.noSources);
  addSection(root, messages[state.language].notices, state.release.notices, n => recordItem(n, 'notice'), t.noNotices);
  addSection(root, messages[state.language].surfaces, state.release.surfaces, s => recordItem(s, 'surface'), t.noSurfaces);
}
function changeLocale(value) {
  state.language = value === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.language;
  const t = messages[state.language];
  const targets = [['title', 'title'], ['intro', 'intro'], ['skip', 'skip'], ['language-label', 'language'],
    ['current-label', 'current'], ['previous-label', 'previous'], ['pairs-label', 'pairs'], ['online-label', 'online'],
    ['run', 'run'], ['hint', 'hint'], ['report-heading', 'report'], ['save-text', 'saveText'], ['save-json', 'saveJson'],
    ['save-html', 'saveHtml'], ['print', 'print'], ['disclaimer', 'disclaimer']];
  for (const [id, key] of targets) get(id).textContent = t[key];
  get('language').value = state.language;
  render();
  status(state.release ? state.audit.blocked || state.comparison?.blocked ? COPY[state.language].blocked : COPY[state.language].clear : t.empty);
  const next = new URL(location.href);
  next.searchParams.set('lang', state.language);
  history.replaceState(null, '', next);
}
async function readLocal(file) {
  if (!file) throw new Error('A local file is required');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('File exceeds size limit');
  return parseNoticeReleaseJson(await file.text());
}
async function examine() {
  const chosen = get('current').files?.[0];
  const older = get('previous').files?.[0];
  try {
    const release = await readLocal(chosen);
    const previous = older ? await readLocal(older) : null;
    const options = { requireOffline: !get('allow-online').checked, requireLanguagePairs: get('require-pairs').checked };
    const audit = auditNoticeRelease(release, options);
    const comparison = previous ? compareNoticeReleases(previous, release, options) : null;
    state.release = release;
    state.audit = audit;
    state.comparison = comparison;
    render();
    status(audit.blocked || comparison?.blocked ? COPY[state.language].blocked : COPY[state.language].clear);
    for (const key of ['save-text', 'save-json', 'save-html', 'print']) get(key).disabled = false;
  } catch (error) {
    status(`${messages[state.language].error} ${error instanceof Error ? error.message : ''}`);
  }
}
function download(format) {
  if (!state.release || !state.audit) return;
  const rendered = renderNoticeReport(state.release, state.audit, state.language, state.comparison);
  const mime = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/plain';
  const url = URL.createObjectURL(new Blob([rendered[format]], { type: `${mime};charset=utf-8` }));
  const link = make('a');
  link.href = url;
  link.download = `notice-change-${state.language}.${format === 'text' ? 'txt' : format}`;
  link.click();
  URL.revokeObjectURL(url);
}
get('language').addEventListener('change', e => changeLocale(e.target.value));
get('run').addEventListener('click', () => { void examine(); });
for (const format of ['text', 'json', 'html']) get(`save-${format}`).addEventListener('click', () => download(format));
get('print').addEventListener('click', () => window.print());
changeLocale(state.language);
