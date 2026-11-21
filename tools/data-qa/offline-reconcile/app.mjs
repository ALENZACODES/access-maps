/** Browser-only UI. Runs exclusively in the local origin supplied by serve.mjs. */
import { audit } from './audit.mjs';
import { compare } from './compare.mjs';
import { copy, exportFilename, findingCounts, groupedFindings,
  localeKeys, reportCsv, reportJson, visibleFindings } from './report.mjs';

const MAX_UPLOAD = 6 * 1024 * 1024;
const DEFAULT_POLICY = { removedDecisions: [], maxRemovals: 0 };
const MAX_OUTPUT_ROWS = 1000;

export function createModel() {
  return { locale: 'en', mode: 'audit', filter: 'ALL', current: null, previous: null,
    policy: structuredClone(DEFAULT_POLICY), result: null, error: '', focusCode: null };
}
export function applyFile(model, target, value) {
  if (!['current', 'previous', 'policy'].includes(target)) throw new TypeError('Invalid upload target');
  return { ...model, [target]: value, result: null, error: '' };
}
export function chooseMode(model, mode) {
  if (!['audit', 'compare'].includes(mode)) throw new TypeError('Invalid mode');
  return { ...model, mode, result: null, error: '' };
}
export function chooseLocale(model, locale) {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Invalid language');
  return { ...model, locale };
}
export function chooseFilter(model, filter) {
  if (!['ALL', 'ERROR', 'NOTICE'].includes(filter)) throw new TypeError('Invalid filter');
  return { ...model, filter };
}
export function perform(model) {
  if (model.current === null || (model.mode === 'compare' && model.previous === null)) {
    return { ...model, result: null, error: 'noFile' };
  }
  try {
    const result = model.mode === 'compare' ? compare(model.previous, model.current, model.policy) :
      audit(model.current);
    return { ...model, result, error: '', focusCode: null };
  } catch {
    return { ...model, result: null, error: 'loadError' };
  }
}
export function clear(model) {
  return { ...createModel(), locale: model.locale };
}
export function renderModel(model) {
  const dict = copy(model.locale);
  const rows = visibleFindings(model.result, model.filter).slice(0, MAX_OUTPUT_ROWS);
  return { dict, status: model.result ? (model.result.ok ? dict.pass : dict.fail) : '',
    rows, count: findingCounts(model.result), groups: groupedFindings(model.result),
    totals: model.result?.totals ?? {}, error: model.error ? dict[model.error] ?? dict.loadError : '',
    showPrevious: model.mode === 'compare', locale: model.locale, filter: model.filter,
    mode: model.mode, more: visibleFindings(model.result, model.filter).length > MAX_OUTPUT_ROWS };
}
export function fileOptions(file) {
  return Boolean(file && typeof file === 'object' && typeof file.size === 'number' &&
    file.size > 0 && file.size <= MAX_UPLOAD &&
    typeof file.name === 'string' && /\.json$/iu.test(file.name));
}
export async function readLocalJson(file) {
  if (!fileOptions(file)) throw new TypeError('Invalid local JSON file');
  const raw = await file.text();
  if (new TextEncoder().encode(raw).length > MAX_UPLOAD) throw new RangeError('File too large');
  return JSON.parse(raw);
}
export function exportPayload(model, format) {
  if (!model.result || !['json', 'csv'].includes(format)) return null;
  return { filename: exportFilename(model.mode, format), content: format === 'json' ?
    reportJson(model.result) : reportCsv(model.result, model.locale),
  mime: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' };
}

function el(doc, type, text, attrs = {}) {
  const node = doc.createElement(type);
  if (text !== null) node.textContent = String(text);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, String(value));
  }
  return node;
}
function replaceText(doc, id, value) {
  const node = doc.getElementById(id);
  if (node) node.textContent = value;
}
function appendText(doc, parent, type, value, attrs) {
  const node = el(doc, type, value, attrs);
  parent.append(node);
  return node;
}
function addSummary(doc, data) {
  const root = doc.getElementById('summary');
  if (!root) return;
  root.replaceChildren();
  for (const [key, value] of Object.entries(data.totals)) {
    const label = data.dict[key] ?? key;
    const item = appendText(doc, root, 'li', null);
    appendText(doc, item, 'strong', `${label}${data.locale === 'fr' ? '\u00a0:' : ':'} `);
    item.append(doc.createTextNode(String(value)));
  }
}
function addFindings(doc, data) {
  const root = doc.getElementById('findings');
  if (!root) return;
  root.replaceChildren();
  if (!data.rows.length) {
    appendText(doc, root, 'li', data.dict.empty);
    return;
  }
  for (const finding of data.rows) {
    const item = appendText(doc, root, 'li', null, { className: `finding ${finding.severity.toLowerCase()}` });
    appendText(doc, item, 'strong', `${finding.severity} · ${finding.code}`);
    appendText(doc, item, 'p', finding[data.locale]);
    appendText(doc, item, 'code', finding.path);
  }
  if (data.more) appendText(doc, root, 'li', `${MAX_OUTPUT_ROWS} / ${data.count.all}`);
}
function updateLabels(doc, data) {
  doc.documentElement.lang = data.locale;
  for (const id of ['heading', 'intro', 'disclaimer', 'privacy', 'offline', 'summary',
    'current', 'previous', 'policy', 'language', 'filter', 'report']) {
    if (id === 'summary' || id === 'report') continue;
    replaceText(doc, `${id}-label`, data.dict[id]);
  }
  replaceText(doc, 'heading', data.dict.heading);
  replaceText(doc, 'input-heading', data.dict.localFiles);
  replaceText(doc, 'report-heading', data.dict.reviewFindings);
  replaceText(doc, 'skip-link', data.dict.skip);
  replaceText(doc, 'intro', data.dict.intro);
  replaceText(doc, 'disclaimer', data.dict.disclaimer);
  replaceText(doc, 'privacy', data.dict.privacy);
  replaceText(doc, 'offline', data.dict.offline);
  replaceText(doc, 'status', data.status);
  replaceText(doc, 'error', data.error);
  for (const key of ['audit', 'compare', 'exportJson', 'exportCsv', 'reset']) {
    replaceText(doc, `action-${key}`, data.dict[key]);
  }
  const previous = doc.getElementById('previous-field');
  if (previous) previous.hidden = !data.showPrevious;
  const policy = doc.getElementById('policy-field');
  if (policy) policy.hidden = !data.showPrevious;
  const filter = doc.getElementById('filter-select');
  if (filter) {
    filter.value = data.filter;
    for (const option of filter.options) {
      option.textContent = option.value === 'ALL' ? data.dict.findAll :
        option.value === 'ERROR' ? data.dict.findErrors : data.dict.findNotices;
    }
  }
  const language = doc.getElementById('language-select');
  if (language) language.value = data.locale;
}
function save(doc, payload) {
  if (!payload) return;
  const BlobConstructor = doc.defaultView?.Blob ?? Blob;
  const blob = new BlobConstructor([payload.content], { type: payload.mime });
  const url = doc.defaultView.URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = payload.filename;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  doc.defaultView.URL.revokeObjectURL(url);
}

/** Mount once after DOMContentLoaded; all mutations are derived from the model. */
export function mount(doc, initial = createModel()) {
  let model = initial;
  const render = () => {
    const view = renderModel(model);
    updateLabels(doc, view);
    addSummary(doc, view);
    addFindings(doc, view);
    return view;
  };
  const listen = (id, name, callback) => {
    const node = doc.getElementById(id);
    if (node) node.addEventListener(name, callback);
  };
  listen('language-select', 'change', event => {
    model = chooseLocale(model, event.currentTarget.value);
    render();
  });
  listen('filter-select', 'change', event => {
    model = chooseFilter(model, event.currentTarget.value);
    render();
  });
  for (const field of ['current', 'previous', 'policy']) {
    listen(`${field}-file`, 'change', async event => {
      const file = event.currentTarget.files?.[0];
      try {
        const data = await readLocalJson(file);
        model = applyFile(model, field, data);
      } catch {
        model = { ...model, result: null, error: 'loadError' };
      }
      render();
    });
  }
  listen('action-audit', 'click', () => { model = perform(chooseMode(model, 'audit')); render(); });
  listen('action-compare', 'click', () => { model = perform(chooseMode(model, 'compare')); render(); });
  listen('action-exportJson', 'click', () => save(doc, exportPayload(model, 'json')));
  listen('action-exportCsv', 'click', () => save(doc, exportPayload(model, 'csv')));
  listen('action-reset', 'click', () => { model = clear(model); render(); });
  render();
  return { getModel: () => model, render, dispose: () => { /* page lifetime owns listeners */ } };
}

export function keysAligned() {
  const keys = localeKeys();
  return JSON.stringify(keys.en) === JSON.stringify(keys.fr);
}
if (typeof document !== 'undefined' && document.getElementById('reconcile-app')) {
  mount(document);
}
