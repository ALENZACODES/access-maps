/** Local page entry point; imports pure audit helpers and never contacts a server. */
import { COPY, issueMessage, message } from './copy.mjs';
import { compareManifests } from './compare.mjs';
import { LIMITS, BufferLikeByteLength, parseJsonText, reviewManifest, dateNumber } from './schema.mjs';
import {
  categories, combinedFindings, findingsCsv, paginateFindings, safeReportJson,
  searchFindings, sourceInventory, summarizeChanges, summaryForScreen,
} from './report.mjs';

export function initialState() {
  return {
    locale: 'en', audit: null, comparison: null, current: null,
    allFindings: [], page: 1, level: 'all', code: 'all', query: '',
    perPage: 10, sourceQuery: '', helpOpen: false, sourcesOpen: false,
  };
}

export function preferredDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function validPolicy(asOf, maxAge) {
  const days = Number(maxAge);
  return dateNumber(asOf) !== null && /^\d+$/.test(String(maxAge)) &&
    Number.isSafeInteger(days) && days >= 0 && days <= LIMITS.maxAge;
}

export async function readLocalFile(file, limit = LIMITS.bytes) {
  if (!file || typeof file.text !== 'function') throw new Error('FILE_MISSING');
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > limit) {
    throw new Error('FILE_SIZE');
  }
  const text = await file.text();
  if (BufferLikeByteLength(text) > limit) throw new Error('FILE_SIZE');
  try { return JSON.parse(text); }
  catch { throw new Error('FILE_JSON'); }
}

export function reviewInputs(current, older, policy) {
  const audit = reviewManifest(current, policy);
  const comparison = older === null ? null : compareManifests(older, current, {
    asOf: policy.asOf, validation: policy, policy: { maximumRemovals: 0 },
  });
  return { audit, comparison, findings: combinedFindings(audit, comparison) };
}

export function createNode(doc, tag, text = '', className = '') {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text);
  return element;
}

export function localizedPage(doc, locale) {
  const selected = locale === 'fr' ? 'fr' : 'en';
  doc.documentElement.lang = selected;
  doc.title = message(selected, 'title');
  for (const element of doc.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    if (key && Object.hasOwn(COPY[selected], key)) element.textContent = message(selected, key);
  }
  return selected;
}

function appendSummary(doc, target, label, value) {
  const wrapper = createNode(doc, 'dl', '', 'summary-item');
  wrapper.append(createNode(doc, 'dt', label), createNode(doc, 'dd', value));
  target.append(wrapper);
}

function fillSummary(doc, state) {
  const panel = doc.getElementById('review-summary');
  panel.replaceChildren();
  if (!state.audit) { panel.hidden = true; return; }
  const t = key => message(state.locale, key);
  const status = summaryForScreen(state.audit, state.comparison);
  appendSummary(doc, panel, t('status'), t(status.ok ? 'passedStatus' : 'blockedStatus'));
  appendSummary(doc, panel, t('errorCount'), status.errors);
  appendSummary(doc, panel, t('noticeCount'), status.notices);
  for (const key of ['sources', 'places', 'observations', 'assets', 'unknown', 'known']) {
    appendSummary(doc, panel, t(key), state.audit.counts[key] ?? 0);
  }
  panel.hidden = false;
}

function fillChanges(doc, state) {
  const panel = doc.getElementById('changes-panel');
  const output = doc.getElementById('changes-output');
  output.replaceChildren();
  if (!state.comparison) { panel.hidden = true; return; }
  const counts = summarizeChanges(state.comparison);
  if (counts) {
    for (const key of ['addedPlaces', 'removedPlaces', 'updatedSources', 'changedAssets', 'changedStatus']) {
      appendSummary(doc, output, message(state.locale, key), counts[key]);
    }
  }
  panel.hidden = false;
}

function fillCategories(doc, state) {
  const select = doc.getElementById('category-filter');
  select.replaceChildren();
  const all = createNode(doc, 'option', message(state.locale, 'all'));
  all.value = 'all';
  select.append(all);
  for (const code of categories(state.allFindings)) {
    const option = createNode(doc, 'option', code);
    option.value = code;
    select.append(option);
  }
  select.value = categories(state.allFindings).includes(state.code) ? state.code : 'all';
}

function findingCard(doc, finding, locale) {
  const article = createNode(doc, 'article', '', `finding finding-${finding.severity.toLowerCase()}`);
  const header = createNode(doc, 'header');
  header.append(createNode(doc, 'h4', finding.code));
  header.append(createNode(doc, 'span', finding.severity));
  article.append(header);
  article.append(createNode(doc, 'p', issueMessage(locale, finding.code)));
  const details = createNode(doc, 'dl');
  details.append(createNode(doc, 'dt', message(locale, 'location')));
  const path = createNode(doc, 'dd');
  path.append(createNode(doc, 'code', finding.path));
  details.append(path);
  details.append(createNode(doc, 'dt', message(locale, 'category')));
  details.append(createNode(doc, 'dd', finding.origin));
  article.append(details);
  return article;
}

function fillFindings(doc, state) {
  const container = doc.getElementById('findings-output');
  container.replaceChildren();
  const visible = searchFindings(state.allFindings, {
    level: state.level, code: state.code, query: state.query,
  });
  const paging = paginateFindings(visible, state.page, state.perPage);
  state.page = paging.page;
  if (visible.length === 0) {
    container.append(createNode(doc, 'p', message(state.locale, 'noMatches')));
  } else {
    for (const item of paging.items) container.append(findingCard(doc, item, state.locale));
  }
  doc.getElementById('page-count').textContent =
    `${message(state.locale, 'page')} ${paging.page} / ${paging.pages}`;
  doc.getElementById('previous-page').disabled = paging.page <= 1;
  doc.getElementById('next-page').disabled = paging.page >= paging.pages;
  doc.getElementById('findings-panel').hidden = state.audit === null;
}

function fillSources(doc, state) {
  const output = doc.getElementById('source-output');
  output.replaceChildren();
  if (!state.current) return;
  const sources = sourceInventory(state.current, state.sourceQuery);
  if (sources.length === 0) {
    output.append(createNode(doc, 'p', message(state.locale, 'noSources')));
    return;
  }
  for (const source of sources) {
    const wrapper = createNode(doc, 'article', '', 'source-item');
    wrapper.append(createNode(doc, 'h4', source.id));
    const details = createNode(doc, 'dl');
    for (const [key, value] of [
      ['sourceName', source.name], ['licence', source.licence],
      ['observedOn', source.observedOn], ['reference', source.reference],
    ]) {
      details.append(createNode(doc, 'dt', message(state.locale, key)));
      details.append(createNode(doc, 'dd', value));
    }
    wrapper.append(details);
    output.append(wrapper);
  }
}

function fillStatus(doc, state) {
  const region = doc.getElementById('review-status');
  if (!state.audit) {
    region.textContent = message(state.locale, 'noResults');
    region.removeAttribute('data-outcome');
    return;
  }
  const result = summaryForScreen(state.audit, state.comparison);
  region.textContent = message(state.locale, result.ok ? 'pass' : 'blocked');
  region.dataset.outcome = result.ok ? 'passed' : 'blocked';
}

function render(doc, state) {
  localizedPage(doc, state.locale);
  doc.getElementById('locale').value = state.locale;
  fillStatus(doc, state);
  fillSummary(doc, state);
  fillChanges(doc, state);
  fillCategories(doc, state);
  fillFindings(doc, state);
  fillSources(doc, state);
  doc.getElementById('sources-panel').hidden = !state.current;
  doc.getElementById('source-content').hidden = !state.sourcesOpen;
  doc.getElementById('toggle-sources').setAttribute('aria-expanded', String(state.sourcesOpen));
  doc.getElementById('toggle-sources').textContent =
    message(state.locale, state.sourcesOpen ? 'hideSources' : 'showSources');
  doc.getElementById('help-content').hidden = !state.helpOpen;
  doc.getElementById('toggle-help').setAttribute('aria-expanded', String(state.helpOpen));
  doc.getElementById('toggle-help').textContent =
    message(state.locale, state.helpOpen ? 'closeHelp' : 'help');
  doc.getElementById('exports').hidden = !state.audit;
}

export function downloadFile(doc, name, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  doc.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function mountOfflineReview(doc) {
  const state = initialState();
  const form = doc.getElementById('review-form');
  doc.getElementById('as-of').value = preferredDate();
  doc.getElementById('locale').addEventListener('change', event => {
    state.locale = event.target.value === 'fr' ? 'fr' : 'en';
    render(doc, state);
  });
  doc.getElementById('toggle-help').addEventListener('click', () => {
    state.helpOpen = !state.helpOpen;
    render(doc, state);
  });
  doc.getElementById('toggle-sources').addEventListener('click', () => {
    state.sourcesOpen = !state.sourcesOpen;
    render(doc, state);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const currentFile = doc.getElementById('current').files?.[0];
    const olderFile = doc.getElementById('previous-file').files?.[0];
    const asOf = doc.getElementById('as-of').value;
    const age = doc.getElementById('max-age').value;
    const status = doc.getElementById('input-status');
    if (!currentFile) { status.textContent = message(state.locale, 'fileMissing'); return; }
    if (!validPolicy(asOf, age)) { status.textContent = message(state.locale, 'invalidDate'); return; }
    status.textContent = message(state.locale, 'loading');
    try {
      const current = await readLocalFile(currentFile);
      const older = olderFile ? await readLocalFile(olderFile) : null;
      const result = reviewInputs(current, older, { asOf, maxAgeDays: Number(age) });
      Object.assign(state, { current, audit: result.audit, comparison: result.comparison,
        allFindings: result.findings, page: 1 });
      status.textContent = '';
      render(doc, state);
      doc.getElementById('results').focus();
    } catch {
      status.textContent = message(state.locale, 'inputError');
    }
  });
  form.addEventListener('reset', () => {
    Object.assign(state, initialState(), { locale: state.locale });
    doc.getElementById('input-status').textContent = '';
    doc.getElementById('as-of').value = preferredDate();
    doc.getElementById('max-age').value = '365';
    render(doc, state);
  });
  for (const [id, field] of [['level-filter', 'level'], ['category-filter', 'code'],
    ['page-size', 'perPage'], ['finding-search', 'query'], ['source-search', 'sourceQuery']]) {
    doc.getElementById(id).addEventListener(id.includes('search') ? 'input' : 'change', event => {
      state[field] = field === 'perPage' ? Number(event.target.value) : event.target.value;
      if (field !== 'sourceQuery') state.page = 1;
      render(doc, state);
    });
  }
  doc.getElementById('clear-filters').addEventListener('click', () => {
    Object.assign(state, { level: 'all', code: 'all', query: '', page: 1, perPage: 10 });
    for (const [id, value] of [['level-filter', 'all'], ['category-filter', 'all'],
      ['finding-search', ''], ['page-size', '10']]) doc.getElementById(id).value = value;
    render(doc, state);
  });
  doc.getElementById('previous-page').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    render(doc, state);
  });
  doc.getElementById('next-page').addEventListener('click', () => {
    state.page += 1;
    render(doc, state);
  });
  doc.getElementById('export-json').addEventListener('click', () => {
    if (!state.audit) return;
    downloadFile(doc, 'offline-review.json', safeReportJson(state.audit, state.comparison, state.locale),
      'application/json');
  });
  doc.getElementById('export-csv').addEventListener('click', () => {
    if (!state.audit) return;
    downloadFile(doc, 'offline-findings.csv', findingsCsv(state.allFindings), 'text/csv;charset=utf-8');
  });
  render(doc, state);
  return state;
}

if (typeof document !== 'undefined' && document.getElementById('review-form')) {
  mountOfflineReview(document);
}
