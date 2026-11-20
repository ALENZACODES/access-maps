/** Progressively enhanced local-only browser entry point. */
import {
  RIGHTS_MAX_BYTES, parseRightsMatrixJson, auditRightsMatrix,
  compareRightsMatrices, renderRightsReport, RIGHTS_COPY,
} from './rights-index.mjs';
const doc = document;
const $ = id => doc.getElementById(id);
const labels = {
  en: {
    title: 'Publication rights decision matrix',
    intro: 'Read locally supplied source and licence records without transmitting them.',
    language: 'Language:', current: 'Current JSON matrix',
    previous: 'Earlier JSON matrix (optional)', run: 'Examine rights evidence',
    saveText: 'Save text', saveJson: 'Save JSON', saveHtml: 'Save HTML',
    print: 'Print', hint: 'UNKNOWN means no information was supplied, not permission.',
    empty: 'Choose a local JSON file to begin.', error: 'The local file could not be read.',
    disclaimer: 'This page examines supplied evidence only; it does not assess actual accessibility or grant permission.',
  },
  fr: {
    title: 'Matrice des droits de publication',
    intro: 'Consultez les renseignements locaux sur les sources et les licences sans les transmettre.',
    language: 'Langue\u00a0:', current: 'Matrice JSON actuelle',
    previous: 'Matrice JSON précédente (facultative)', run: 'Examiner les droits',
    saveText: 'Enregistrer le texte', saveJson: 'Enregistrer le JSON',
    saveHtml: 'Enregistrer le HTML', print: 'Imprimer',
    hint: 'UNKNOWN signifie qu’aucun renseignement n’a été fourni, pas qu’une permission existe.',
    empty: 'Choisissez un fichier JSON local pour commencer.',
    error: 'Le fichier local n’a pas pu être lu.',
    disclaimer: 'Cette page examine uniquement les renseignements fournis. Elle n’évalue pas l’accessibilité des lieux et n’accorde aucune permission.',
  },
};
const query = new URL(location.href).searchParams;
const state = {locale: query.get('lang') === 'fr' ? 'fr' : 'en', matrix: null, audit: null, comparison: null};
function el(tag, value, properties = {}) {
  const node = doc.createElement(tag);
  if (value !== undefined) node.textContent = String(value);
  for (const [key, attribute] of Object.entries(properties)) node.setAttribute(key, String(attribute));
  return node;
}
function announce(message) { $('status').textContent = message; }
function list(parent, findings, empty) {
  const ul = el('ul');
  if (!findings.length) ul.append(el('li', empty));
  for (const finding of findings) {
    const li = el('li');
    li.append(el('strong', `${finding.code ?? finding.field} [${finding.level}]`),
      el('p', [finding.path ?? finding.id, finding.detail ?? finding.after].filter(Boolean).join(' · ')));
    ul.append(li);
  }
  parent.append(ul);
}
function render() {
  const root = $('report');
  root.replaceChildren();
  if (!state.matrix || !state.audit) return;
  const copy = RIGHTS_COPY[state.locale];
  root.append(el('h2', copy.findings));
  list(root, state.audit.findings, copy.noFindings);
  root.append(el('h2', copy.details));
  for (const source of state.matrix.sources) {
    const article = el('article');
    article.append(el('h3', source.name));
    const dl = el('dl');
    for (const [label, value] of [
      [copy.licence, source.licenceName], [copy.source, source.sourceUrl],
      [copy.licenceLink, source.licenceUrl], [copy.termsLink, source.termsUrl],
      [copy.tier, source.evidenceTier], [copy.permission, source.permission],
      [copy.dataset, source.datasetAsOf], [copy.acquired, source.acquiredOn],
    ]) dl.append(el('dt', label), el('dd', value));
    article.append(dl, el('pre', source.attribution));
    root.append(article);
  }
  root.append(el('h2', copy.outputDetail));
  for (const output of state.matrix.outputs) {
    const article = el('article');
    article.append(el('h3', output.name),
      el('p', `${copy.route}${state.locale === 'fr' ? '\u00a0' : ''}: ${output.route}`),
      el('p', `${copy.target}${state.locale === 'fr' ? '\u00a0' : ''}: ${output.minimumTargetPx}`),
      el('pre', output.attribution));
    root.append(article);
  }
  if (state.comparison) {
    root.append(el('h2', copy.changes));
    list(root, state.comparison.changes.map(item => ({...item, code: `${item.collection}.${item.field}`, path: item.id, detail: item.after})), copy.noFindings);
  }
}
function language(value) {
  state.locale = value === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.locale;
  const t = labels[state.locale];
  for (const [id, key] of [
    ['title', 'title'], ['intro', 'intro'], ['language-label', 'language'],
    ['current-label', 'current'], ['previous-label', 'previous'], ['run', 'run'],
    ['save-text', 'saveText'], ['save-json', 'saveJson'], ['save-html', 'saveHtml'],
    ['print', 'print'], ['hint', 'hint'], ['disclaimer', 'disclaimer'],
  ]) $(id).textContent = t[key];
  $('language').value = state.locale;
  if (state.matrix) {
    render();
    announce(state.audit.blocked || state.comparison?.blocked ? RIGHTS_COPY[state.locale].blocked : RIGHTS_COPY[state.locale].clear);
  } else announce(t.empty);
  const url = new URL(location.href);
  url.searchParams.set('lang', state.locale);
  history.replaceState(null, '', url);
}
async function load(file) {
  if (!file || file.size > RIGHTS_MAX_BYTES) throw new Error('A bounded local JSON file is required');
  return parseRightsMatrixJson(await file.text());
}
async function review() {
  const file = $('current').files?.[0];
  const earlier = $('previous').files?.[0];
  try {
    const matrix = await load(file);
    const prior = earlier ? await load(earlier) : null;
    const audit = auditRightsMatrix(matrix);
    const comparison = prior ? compareRightsMatrices(prior, matrix) : null;
    state.matrix = matrix;
    state.audit = audit;
    state.comparison = comparison;
    render();
    announce(audit.blocked || comparison?.blocked ? RIGHTS_COPY[state.locale].blocked : RIGHTS_COPY[state.locale].clear);
    for (const id of ['save-text', 'save-json', 'save-html', 'print']) $(id).disabled = false;
  } catch (error) {
    announce(`${labels[state.locale].error} ${error instanceof Error ? error.message : ''}`);
  }
}
function download(kind) {
  if (!state.matrix || !state.audit) return;
  const report = renderRightsReport(state.matrix, state.audit, state.locale, state.comparison);
  const mime = kind === 'html' ? 'text/html' : kind === 'json' ? 'application/json' : 'text/plain';
  const blobUrl = URL.createObjectURL(new Blob([report[kind]], {type: `${mime};charset=utf-8`}));
  const link = el('a');
  link.href = blobUrl;
  link.download = `rights-report-${state.locale}.${kind === 'text' ? 'txt' : kind}`;
  link.click();
  URL.revokeObjectURL(blobUrl);
}
$('language').addEventListener('change', event => language(event.target.value));
$('run').addEventListener('click', () => { void review(); });
for (const kind of ['text', 'json', 'html']) $('save-' + kind).addEventListener('click', () => download(kind));
$('print').addEventListener('click', () => window.print());
language(state.locale);
