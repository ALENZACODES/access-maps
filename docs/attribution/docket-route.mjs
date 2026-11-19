/** Progressive local page. Uses only textContent and user-selected local files. */
import { parseDocketJson, MAX_BYTES } from './docket-core.mjs';
import { auditDocket } from './docket-audit.mjs';
import { compareDockets } from './docket-change.mjs';
import { renderDocketHtml, renderDocketText, renderDocketJson, COPY } from './docket-report.mjs';

const $ = (id) => document.getElementById(id);
const state = { locale: 'en', current: null, audit: null, comparison: null };
const MESSAGES = Object.freeze({
  en: Object.freeze({
    title: 'Licence evidence recheck docket', intro: 'Inspect local source, licence and publication evidence without sending files to a service.',
    inputs: 'Local files', locale: 'Language', current: 'Current docket JSON', previous: 'Earlier docket JSON (optional)',
    run: 'Inspect records', hint: 'No file is uploaded or retained. Dates marked UNKNOWN remain UNKNOWN.',
    result: 'Local report', empty: 'Choose a current JSON docket.', saveText: 'Save text',
    saveJson: 'Save JSON', saveHtml: 'Save HTML', print: 'Print',
    disclaimer: 'A record of supplied evidence, not an assessment of locations or services.',
    blocked: 'Publication blocked', clear: 'No blocking findings in the supplied records',
    importError: 'The selected local file could not be inspected.', findings: 'Findings', changes: 'Changes',
    sources: 'Sources', views: 'Publication views', noFindings: 'No findings',
  }),
  fr: Object.freeze({
    title: 'Registre de réexamen des sources et licences', intro: 'Examinez les sources, licences et renseignements de publication à partir de fichiers locaux.',
    inputs: 'Fichiers locaux', locale: 'Langue\u00a0:', current: 'Registre JSON actuel', previous: 'Registre JSON précédent (facultatif)',
    run: 'Examiner les données', hint: 'Aucun fichier n’est transmis ni conservé. Les dates UNKNOWN restent UNKNOWN.',
    result: 'Rapport local', empty: 'Choisissez un registre JSON actuel.', saveText: 'Enregistrer le texte',
    saveJson: 'Enregistrer le JSON', saveHtml: 'Enregistrer le HTML', print: 'Imprimer',
    disclaimer: 'Ce rapport présente uniquement les renseignements fournis, pas les conditions des lieux ou services.',
    blocked: 'Publication bloquée', clear: 'Aucun élément bloquant dans les données fournies',
    importError: 'Impossible de lire le fichier local sélectionné.', findings: 'Points à examiner', changes: 'Changements',
    sources: 'Sources', views: 'Vues publiées', noFindings: 'Aucun point à signaler',
  }),
});
function node(tag, options = {}) {
  const created = document.createElement(tag);
  if (options.text !== undefined) created.textContent = String(options.text);
  if (options.className) created.className = options.className;
  return created;
}
function status(message) { $('status').textContent = message; }
function t(key) { return MESSAGES[state.locale][key]; }
function label(id, key) { const target = $(id); if (target) target.textContent = t(key); }
function setDownloads(active) {
  for (const id of ['save-text', 'save-json', 'save-html', 'print']) $(id).disabled = !active;
}
function list(parent, findings, empty) {
  const ul = node('ul');
  if (!findings.length) ul.append(node('li', { text: empty }));
  for (const finding of findings) {
    const item = node('li');
    item.append(node('strong', { text: `${finding.severity}: ${finding.code ?? finding.kind}` }),
      node('span', { text: ` — ${finding.path ?? finding.recordId} — ${finding.detail ?? finding.field}` }));
    ul.append(item);
  }
  parent.append(ul);
}
function sourceDetails(source) {
  const card = node('article');
  card.append(node('h3', { text: `${source.name} (${source.id})` }));
  const dl = node('dl');
  const labels = COPY[state.locale];
  for (const [key, value] of [
    [labels.source, source.sourceUrl], [labels.licence, source.licenceName],
    [labels.licenceUrl, source.licenceUrl], [labels.dataset, source.datasetDate],
    [labels.acquired, source.acquiredOn], [labels.terms, source.termsReviewedOn],
    [labels.due, source.reviewDueOn], [labels.permission, source.permission],
    [labels.tier, source.tier],
  ]) {
    dl.append(node('dt', { text: key }), node('dd', { text: value }));
  }
  card.append(dl, node('h4', { text: labels.notice }), node('pre', { text: source.notice || 'UNKNOWN' }));
  return card;
}
function show() {
  const report = $('report');
  report.replaceChildren();
  if (!state.current || !state.audit) return;
  const summary = node('p', { text: state.audit.blocked || state.comparison?.blocked ? t('blocked') : t('clear') });
  const findings = node('section');
  findings.append(node('h3', { text: t('findings') }));
  list(findings, state.audit.findings, t('noFindings'));
  report.append(summary, findings);
  if (state.comparison) {
    const section = node('section');
    section.append(node('h3', { text: t('changes') }));
    list(section, state.comparison.changes, t('noFindings'));
    report.append(section);
  }
  report.append(node('h3', { text: t('sources') }));
  for (const source of state.current.sources) report.append(sourceDetails(source));
  report.append(node('h3', { text: t('views') }));
  const views = node('ul');
  for (const surface of state.current.surfaces) views.append(node('li', { text: `${surface.id} (${surface.locale}): ${surface.sourceIds.join(', ') || 'UNKNOWN'}` }));
  report.append(views);
}
function language(locale) {
  state.locale = locale === 'fr' ? 'fr' : 'en';
  document.documentElement.lang = state.locale;
  $('locale').value = state.locale;
  for (const [id, key] of [
    ['title', 'title'], ['intro', 'intro'], ['inputs-title', 'inputs'], ['locale-label', 'locale'],
    ['current-label', 'current'], ['previous-label', 'previous'], ['run', 'run'], ['hint', 'hint'],
    ['result-title', 'result'], ['save-text', 'saveText'], ['save-json', 'saveJson'],
    ['save-html', 'saveHtml'], ['print', 'print'], ['disclaimer', 'disclaimer'],
  ]) label(id, key);
  status(state.current ? (state.audit.blocked || state.comparison?.blocked ? t('blocked') : t('clear')) : t('empty'));
  show();
}
async function chosenFile(input) {
  const file = input.files?.[0];
  if (!file) return null;
  if (file.size > MAX_BYTES) throw new Error('Local file exceeds size limit');
  return parseDocketJson(await file.text());
}
function exportReport(format) {
  if (!state.current || !state.audit) return;
  const contents = format === 'html'
    ? renderDocketHtml(state.current, state.audit, state.locale, state.comparison)
    : format === 'json' ? renderDocketJson(state.current, state.audit, state.comparison)
      : renderDocketText(state.current, state.audit, state.locale, state.comparison);
  const type = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/plain';
  const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
  const link = node('a');
  link.href = url;
  link.download = `docket-${state.current.releaseId}-${state.locale}.${format === 'text' ? 'txt' : format}`;
  link.click();
  URL.revokeObjectURL(url);
}
$('locale').addEventListener('change', (event) => language(event.target.value));
$('run').addEventListener('click', async () => {
  try {
    const current = await chosenFile($('current'));
    if (!current) throw new Error('Current docket is required');
    const previous = await chosenFile($('previous'));
    const audit = auditDocket(current);
    const comparison = previous ? compareDockets(previous, current) : null;
    // No partial state changes on failed import.
    state.current = current;
    state.audit = audit;
    state.comparison = comparison;
    setDownloads(true);
    show();
    status(audit.blocked || comparison?.blocked ? t('blocked') : t('clear'));
  } catch (error) {
    status(`${t('importError')} ${error instanceof Error ? error.message : ''}`);
  }
});
for (const format of ['text', 'json', 'html']) {
  $(`save-${format}`).addEventListener('click', () => exportReport(format));
}
$('print').addEventListener('click', () => window.print());
language(new URL(location.href).searchParams.get('lang'));
