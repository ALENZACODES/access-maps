/** Browser entry for explicit, offline handoff inspection. */
import { MAX_HANDOFF_BYTES, parseHandoffJson } from './handoff-core.mjs';
import { auditHandoffPack } from './handoff-audit.mjs';
import { compareHandoffPacks } from './handoff-change.mjs';
import { renderHandoffReport, reportFilename, REPORT_COPY } from './handoff-report.mjs';

const doc = document;
const get = (id) => doc.getElementById(id);
const COPY = {
  en: {
    title: 'Attribution handoff audit', intro: 'Inspect local handoff records without transmitting or storing them.',
    language: 'Language:', current: 'Current handoff JSON', previous: 'Earlier handoff JSON (optional)',
    review: 'Review records', inputNote: 'UNKNOWN values remain UNKNOWN. Imported files stay in browser memory only.',
    saveText: 'Save text report', saveJson: 'Save JSON report', saveHtml: 'Save HTML report',
    print: 'Print report', empty: 'Choose a local file to begin.', error: 'The file could not be read.',
    disclaimer: 'This page describes source records. It does not assess any location or service.',
    sources: 'Sources', handoffs: 'Handoffs', findings: 'Findings', changes: 'Changes',
  },
  fr: {
    title: 'Examen des transmissions de sources', intro: 'Examinez les renseignements locaux sans les transmettre ni les conserver.',
    language: 'Langue\u00a0:', current: 'Fichier JSON actuel', previous: 'Fichier JSON précédent (facultatif)',
    review: 'Examiner les renseignements', inputNote: 'Les valeurs UNKNOWN restent UNKNOWN. Les fichiers restent en mémoire locale.',
    saveText: 'Enregistrer le rapport texte', saveJson: 'Enregistrer le rapport JSON',
    saveHtml: 'Enregistrer le rapport HTML', print: 'Imprimer le rapport',
    empty: 'Choisissez un fichier local pour commencer.', error: 'Le fichier n’a pas pu être lu.',
    disclaimer: 'Cette page présente les renseignements sur les sources. Elle n’évalue aucun lieu ni service.',
    sources: 'Sources', handoffs: 'Transmissions', findings: 'Points à examiner', changes: 'Changements',
  },
};
const initial = new URL(location.href).searchParams.get('lang');
const state = { locale: initial === 'fr' ? 'fr' : 'en', pack: null, audit: null, comparison: null };
function element(tag, value, attributes = {}) {
  const item = doc.createElement(tag);
  if (value !== undefined) item.textContent = String(value);
  for (const [name, content] of Object.entries(attributes)) item.setAttribute(name, String(content));
  return item;
}
function status(value) { get('status').textContent = value; }
function updateLocale(input) {
  state.locale = input === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = state.locale;
  get('language').value = state.locale;
  const t = COPY[state.locale];
  for (const [id, key] of [
    ['title', 'title'], ['introduction', 'intro'], ['language-label', 'language'],
    ['current-label', 'current'], ['previous-label', 'previous'], ['review', 'review'],
    ['input-note', 'inputNote'], ['save-text', 'saveText'], ['save-json', 'saveJson'],
    ['save-html', 'saveHtml'], ['print', 'print'], ['disclaimer', 'disclaimer'],
  ]) get(id).textContent = t[key];
  if (state.audit) {
    render();
    status(state.audit.blocked || state.comparison?.blocked ? REPORT_COPY[state.locale].blocked : REPORT_COPY[state.locale].clear);
  } else status(t.empty);
  const url = new URL(location.href);
  url.searchParams.set('lang', state.locale);
  history.replaceState(null, '', url);
}
function findingNode(item) {
  const li = element('li', undefined, { 'data-level': item.level ?? item.severity ?? 'information' });
  li.append(element('strong', `${item.code ?? item.kind} (${item.level ?? item.severity})`));
  li.append(element('p', [item.path ?? item.id, item.detail ?? item.field, item.before, item.after].filter((part) => part !== undefined && part !== null).join(' · ')));
  return li;
}
function findingList(items, empty) {
  const list = element('ul');
  for (const item of items) list.append(findingNode(item));
  if (!items.length) list.append(element('li', empty));
  return list;
}
function recordTable(fields) {
  const list = element('dl');
  for (const [key, value] of fields) {
    list.append(element('dt', key), element('dd', String(value)));
  }
  return list;
}
function render() {
  const root = get('report');
  root.replaceChildren();
  if (!state.pack || !state.audit) return;
  const t = COPY[state.locale];
  const report = REPORT_COPY[state.locale];
  root.append(element('h3', report.summary));
  root.append(recordTable([
    [report.release, state.pack.releaseId], [report.status, state.audit.blocked ? report.blocked : report.clear],
    [report.audience, state.pack.policy.audience], [report.retention, state.pack.policy.retention],
    [report.reviewDate, state.pack.policy.reviewDate],
  ]));
  root.append(element('h3', t.findings), findingList(state.audit.findings, report.noFindings));
  if (state.comparison) root.append(element('h3', t.changes), findingList(state.comparison.changes, report.noChanges));
  root.append(element('h3', t.sources));
  for (const source of state.pack.sources) {
    const article = element('article');
    article.append(element('h4', `${source.name} (${source.id})`));
    article.append(recordTable([
      [report.licence, source.licenceName], [report.sourceUrl, source.sourceUrl],
      [report.licenceUrl, source.licenceUrl], [report.permission, source.permission],
      [report.tier, source.tier], [report.datasetDate, source.datasetDate],
      [report.termsDate, source.termsDate], [report.notice, source.notice],
    ]));
    root.append(article);
  }
  root.append(element('h3', t.handoffs));
  for (const handoff of state.pack.handoffs) {
    const article = element('article');
    article.append(element('h4', handoff.id));
    article.append(recordTable([
      [report.recipient, handoff.recipient], [report.approval, handoff.approval],
      [report.scope, handoff.scope], [report.expiry, handoff.expiresDate],
      [report.sources, handoff.sourceIds.join(', ')], [report.surfaces, handoff.surfaceIds.join(', ')],
    ]));
    root.append(article);
  }
}
async function readLocalFile(file) {
  if (!file) throw new Error('A file must be chosen');
  if (file.size > MAX_HANDOFF_BYTES) throw new Error('File exceeds limit');
  return parseHandoffJson(await file.text());
}
async function review() {
  const chosen = get('current').files?.[0];
  const previousFile = get('previous').files?.[0];
  try {
    const next = await readLocalFile(chosen);
    const previous = previousFile ? await readLocalFile(previousFile) : null;
    const audit = auditHandoffPack(next);
    const comparison = previous ? compareHandoffPacks(previous, next) : null;
    state.pack = next;
    state.audit = audit;
    state.comparison = comparison;
    render();
    status(audit.blocked || comparison?.blocked ? REPORT_COPY[state.locale].blocked : REPORT_COPY[state.locale].clear);
    for (const id of ['save-text', 'save-json', 'save-html', 'print']) get(id).disabled = false;
  } catch (error) {
    status(`${COPY[state.locale].error} ${error instanceof Error ? error.message : ''}`);
  }
}
function save(format) {
  if (!state.pack || !state.audit) return;
  const result = renderHandoffReport(state.pack, state.audit, state.locale, state.comparison);
  const mime = format === 'html' ? 'text/html' : format === 'json' ? 'application/json' : 'text/plain';
  const url = URL.createObjectURL(new Blob([result[format]], { type: `${mime};charset=utf-8` }));
  const link = element('a');
  link.href = url;
  link.download = reportFilename(state.locale, format);
  link.click();
  URL.revokeObjectURL(url);
}
get('language').addEventListener('change', (event) => updateLocale(event.target.value));
get('review').addEventListener('click', () => { void review(); });
for (const kind of ['text', 'html', 'json']) get(`save-${kind}`).addEventListener('click', () => save(kind));
get('print').addEventListener('click', () => window.print());
updateLocale(state.locale);
