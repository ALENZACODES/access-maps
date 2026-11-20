/** Local attribution notice review route. Files stay in memory until explicit export. */
import {
  REVIEW_MAX_BYTES, parseAccessReviewJson, auditAccessReview,
  compareAccessReviews, reviewCoverageByTechnique, ACCESS_REVIEW_COPY,
  renderAccessReviewText, renderAccessReviewHtml, renderAccessReviewJson,
} from './access-review-index.mjs';

const doc = document;
const byId = id => doc.getElementById(id);
const state = { locale: new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en', release: null, previous: null, audit: null, comparison: null, options: { requireOffline: false, requirePaired: false, requireEvidenceUrls: false } };
const UI_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Attribution notice review', intro: 'Examine evidence recorded for attribution notices. Files stay on this device.',
    current: 'Current review JSON', previous: 'Earlier review JSON (optional)', language: 'Language:',
    run: 'Review local evidence', print: 'Print report', saveText: 'Export text', saveHtml: 'Export HTML', saveJson: 'Export JSON',
    requireOffline: 'Require offline delivery', requirePaired: 'Require English and French companions', requireEvidenceUrls: 'Require review evidence links',
    empty: 'Choose a local JSON file to start.', invalid: 'The selected file could not be examined.', noChanges: 'No earlier release supplied.',
    findings: 'Review findings', sources: 'Recorded sources', surfaces: 'Published views', methods: 'Observation coverage', changes: 'Release changes',
    fileHelp: 'Choose files from this device. No upload is performed.', disclaimer: 'This is a record review, not an assessment of a location or service.',
  }),
  fr: Object.freeze({
    title: 'Examen des mentions de sources', intro: 'Examinez les renseignements sur les mentions de sources. Les fichiers restent sur cet appareil.',
    current: 'Fichier JSON de l’examen actuel', previous: 'Fichier JSON précédent (facultatif)', language: 'Langue\u00a0:',
    run: 'Examiner les renseignements', print: 'Imprimer le rapport', saveText: 'Exporter le texte', saveHtml: 'Exporter le HTML', saveJson: 'Exporter le JSON',
    requireOffline: 'Exiger la disponibilité hors connexion', requirePaired: 'Exiger les versions anglaise et française', requireEvidenceUrls: 'Exiger les liens vers les renseignements',
    empty: 'Choisissez un fichier JSON local pour commencer.', invalid: 'Le fichier sélectionné n’a pas pu être examiné.', noChanges: 'Aucune version antérieure fournie.',
    findings: 'Points à examiner', sources: 'Sources consignées', surfaces: 'Vues publiées', methods: 'Couverture des observations', changes: 'Changements entre les versions',
    fileHelp: 'Choisissez des fichiers sur cet appareil. Aucun téléversement n’est effectué.', disclaimer: 'Il s’agit d’un examen de fiches, pas d’une évaluation d’un lieu ou d’un service.',
  }),
});
function node(tag, content, attrs = {}) {
  const item = doc.createElement(tag);
  if (content !== undefined && content !== null) item.textContent = String(content);
  for (const [name, value] of Object.entries(attrs)) item.setAttribute(name, String(value));
  return item;
}
function appendRows(root, rows, locale) {
  const list = node('ul');
  for (const row of rows) {
    const entry = node('li');
    entry.append(node('strong', row.name), node('span', ` — ${row.value}`));
    list.append(entry);
  }
  if (!rows.length) list.append(node('li', ACCESS_REVIEW_COPY[locale].none));
  root.append(list);
}
function findingRows(findings) {
  return findings.map(item => ({ name: `[${item.level}] ${item.code}`, value: `${item.path} — ${item.detail}` }));
}
function render() {
  const root = byId('results');
  root.replaceChildren();
  if (!state.release || !state.audit) return;
  const lang = state.locale;
  const ui = UI_COPY[lang];
  const copy = ACCESS_REVIEW_COPY[lang];
  root.append(node('h2', ui.findings));
  appendRows(root, findingRows(state.audit.findings), lang);
  root.append(node('h2', ui.methods));
  appendRows(root, reviewCoverageByTechnique(state.release).map(item => ({ name: item.technique, value: `${item.passCount}/${item.targetCount} PASS, ${item.failCount} FAIL, ${item.unknownCount} UNKNOWN` })), lang);
  root.append(node('h2', ui.sources));
  for (const source of state.release.sources) {
    const article = node('article');
    article.append(node('h3', source.id));
    appendRows(article, [
      { name: copy.source, value: source.provider }, { name: copy.licence, value: source.licence },
      { name: copy.permission, value: source.permission }, { name: copy.date, value: source.datasetDate },
      { name: copy.terms, value: source.termsDate }, { name: copy.tier, value: source.tier },
    ], lang);
    const description = node('pre', source.notice || 'UNKNOWN');
    article.append(description);
    root.append(article);
  }
  root.append(node('h2', ui.surfaces));
  for (const surface of state.release.surfaces) {
    const article = node('article');
    article.append(node('h3', surface.id), node('p', `${surface.route} · ${surface.locale} · ${surface.offline}`));
    appendRows(article, surface.targets.map(target => ({ name: target.kind, value: `${target.text} · ${target.widthPx} × ${target.heightPx} · ${target.testedDate}` })), lang);
    root.append(article);
  }
  root.append(node('h2', ui.changes));
  if (state.comparison) appendRows(root, state.comparison.changes.map(item => ({ name: `[${item.level}] ${item.kind}`, value: `${item.path} — ${item.before} → ${item.after}` })), lang);
  else root.append(node('p', ui.noChanges));
}
function status() {
  const el = byId('status');
  if (!state.audit) el.textContent = UI_COPY[state.locale].empty;
  else el.textContent = state.audit.blocked || state.comparison?.blocked ? ACCESS_REVIEW_COPY[state.locale].blocked : ACCESS_REVIEW_COPY[state.locale].clear;
}
function translate(lang) {
  state.locale = lang === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.locale;
  const text = UI_COPY[state.locale];
  const ids = [
    ['title', 'title'], ['intro', 'intro'], ['current-label', 'current'], ['previous-label', 'previous'],
    ['language-label', 'language'], ['run', 'run'], ['print', 'print'], ['save-text', 'saveText'],
    ['save-html', 'saveHtml'], ['save-json', 'saveJson'], ['offline-label', 'requireOffline'],
    ['paired-label', 'requirePaired'], ['evidence-label', 'requireEvidenceUrls'],
    ['file-help', 'fileHelp'], ['disclaimer', 'disclaimer'],
  ];
  for (const [id, key] of ids) byId(id).textContent = text[key];
  byId('language').value = state.locale;
  render(); status();
  const url = new URL(location.href);
  url.searchParams.set('lang', state.locale);
  history.replaceState(null, '', url);
}
async function readLocal(file) {
  if (!file || file.size > REVIEW_MAX_BYTES) throw new Error('Local file unavailable or too large');
  return parseAccessReviewJson(await file.text());
}
function options() {
  return {
    requireOffline: byId('require-offline').checked,
    requirePaired: byId('require-paired').checked,
    requireEvidenceUrls: byId('require-evidence').checked,
  };
}
async function inspect() {
  const current = byId('current').files?.[0];
  const old = byId('previous').files?.[0];
  try {
    const release = await readLocal(current);
    const earlier = old ? await readLocal(old) : null;
    const opts = options();
    const audit = auditAccessReview(release, opts);
    const comparison = earlier ? compareAccessReviews(earlier, release, opts) : null;
    state.release = release;
    state.previous = earlier;
    state.options = opts;
    state.audit = audit;
    state.comparison = comparison;
    render(); status();
    for (const id of ['save-text', 'save-json', 'save-html', 'print']) byId(id).disabled = false;
  } catch (error) {
    byId('status').textContent = `${UI_COPY[state.locale].invalid} ${error instanceof Error ? error.message : ''}`;
  }
}
function refresh() {
  if (!state.release) return;
  state.options = options();
  state.audit = auditAccessReview(state.release, state.options);
  state.comparison = state.previous ? compareAccessReviews(state.previous, state.release, state.options) : null;
  render(); status();
}
function save(format) {
  if (!state.release || !state.audit) return;
  const outputs = {
    text: () => renderAccessReviewText(state.release, state.audit, state.locale, state.comparison),
    html: () => renderAccessReviewHtml(state.release, state.audit, state.locale, state.comparison),
    json: () => renderAccessReviewJson(state.release, state.audit, state.comparison),
  };
  const payload = outputs[format]();
  const kind = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/plain';
  const url = URL.createObjectURL(new Blob([payload], { type: `${kind};charset=utf-8` }));
  try {
    const link = node('a');
    link.href = url;
    link.download = `attribution-access-review-${state.locale}.${format === 'text' ? 'txt' : format}`;
    link.click();
  } finally { URL.revokeObjectURL(url); }
}
byId('run').addEventListener('click', () => { void inspect(); });
byId('language').addEventListener('change', event => translate(event.target.value));
for (const id of ['require-offline', 'require-paired', 'require-evidence']) byId(id).addEventListener('change', refresh);
for (const format of ['text', 'json', 'html']) byId(`save-${format}`).addEventListener('click', () => save(format));
byId('print').addEventListener('click', () => window.print());
translate(state.locale);
