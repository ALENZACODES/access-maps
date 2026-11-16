/** Browser-only change review. Supports keyboard and assistive technology. */
import { UNKNOWN } from './provenance-core.mjs';
import {
  IMPACT_MAX_BYTES, IMPACT_SCOPES, IMPACT_KINDS, parseImpactPackageText,
  filterImpactChanges, impactChangesJson, normalizeDate,
} from './impact-core.mjs';
import { auditImpact, impactRule, impactReportJson } from './impact-route-deps.mjs';
import { impactWords, impactLocale } from './impact-messages.mjs';

function element(doc, tag, text = null, className = '') {
  const el = doc.createElement(tag);
  if (text !== null) el.textContent = String(text);
  if (className) el.className = className;
  return el;
}

function append(parent, ...children) {
  for (const child of children) parent.appendChild(child);
  return parent;
}

function labelled(doc, id, label, tag = 'input') {
  const wrapper = element(doc, 'div', null, 'impact-control');
  const title = element(doc, 'label', label);
  title.htmlFor = id;
  const control = element(doc, tag);
  control.id = id;
  append(wrapper, title, control);
  return { wrapper, control };
}

function action(doc, title, callback, className = '') {
  const button = element(doc, 'button', title, className);
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

function link(doc, href, title) {
  const a = element(doc, 'a', title);
  a.href = href;
  return a;
}

function optionList(select, items, selected, words) {
  for (const key of items) {
    const item = select.ownerDocument.createElement('option');
    item.value = key;
    item.textContent = words[key] ?? key;
    item.selected = key === selected;
    select.appendChild(item);
  }
}

function valueText(value) {
  if (value === null || value === undefined) return 'UNKNOWN';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value, null, 2);
}

function reportDownload(win, content, name) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const uri = win.URL.createObjectURL(blob);
  const a = win.document.createElement('a');
  a.href = uri;
  a.download = name;
  a.style.display = 'none';
  win.document.body.appendChild(a);
  try { a.click(); } finally {
    a.remove();
    win.URL.revokeObjectURL(uri);
  }
}

export async function readLocalPackage(file) {
  if (!file || typeof file.size !== 'number' || file.size > IMPACT_MAX_BYTES) {
    throw new Error('INVALID_FILE');
  }
  const text = await file.text();
  return parseImpactPackageText(text);
}

function renderSummary(doc, report, words) {
  const section = element(doc, 'section', null, 'impact-summary');
  const heading = element(doc, 'h2', words.status);
  section.setAttribute('aria-labelledby', 'impact-status-heading');
  heading.id = 'impact-status-heading';
  section.appendChild(heading);
  const outcome = element(doc, 'p', report.passed ? words.ready : words.blocked,
    report.passed ? 'impact-passed' : 'impact-blocked');
  outcome.setAttribute('role', 'status');
  section.appendChild(outcome);
  const details = element(doc, 'dl', null, 'impact-metrics');
  const metrics = [
    [words.total, report.summary.total],
    [words.affected, report.summary.affectedSurfaces.length],
    [words.added, report.summary.added],
    [words.removed, report.summary.removed],
    [words.changed, report.summary.changed],
    [words.linked, report.summary.linked],
    [words.unlinked, report.summary.unlinked],
    [words.blocking, report.counts.error],
    [words.warnings, report.counts.warning],
    [words.candidateStatus, report.candidateAudit.passed ? words.ready : words.blocked],
  ];
  for (const [name, number] of metrics) {
    append(details, element(doc, 'dt', name), element(doc, 'dd', number));
  }
  section.appendChild(details);
  section.appendChild(element(doc, 'p', words.resultsHelp));
  return section;
}

function renderFindings(doc, report, words, locale, filter) {
  const section = element(doc, 'section', null, 'impact-findings');
  const title = element(doc, 'h2', words.findings);
  title.id = 'impact-findings-heading';
  section.setAttribute('aria-labelledby', title.id);
  section.appendChild(title);
  const shown = report.findings.filter((finding) =>
    filter === 'all' || finding.severity === filter);
  if (!shown.length) {
    section.appendChild(element(doc, 'p', words.noFindings));
    return section;
  }
  const list = element(doc, 'ol');
  for (const finding of shown) {
    const li = element(doc, 'li', null, `impact-${finding.severity}`);
    const heading = element(doc, 'h3', impactRule(finding.code, locale));
    const meta = element(doc, 'p', [words[finding.severity], finding.target ?? words.empty,
      finding.field ?? words.empty].join(' · '));
    append(li, heading, meta);
    if (finding.related.length) {
      li.appendChild(element(doc, 'p', `${words.related}${locale === 'fr' ? '\u00a0' : ''}: ${finding.related.join(', ')}`));
    }
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function renderChanges(doc, comparison, words, filter) {
  const section = element(doc, 'section', null, 'impact-changes');
  const title = element(doc, 'h2', words.changes);
  title.id = 'impact-changes-heading';
  section.setAttribute('aria-labelledby', title.id);
  section.appendChild(title);
  const rows = filterImpactChanges(comparison, filter);
  if (!rows.length) {
    section.appendChild(element(doc, 'p', words.noChanges));
    return section;
  }
  const list = element(doc, 'ol');
  for (const change of rows) {
    const li = element(doc, 'li', null, 'impact-change');
    const heading = element(doc, 'h3', `${words[change.scope]}: ${change.id}`);
    const kind = element(doc, 'p', `${words[change.kind]} · ${change.field ?? words.empty}`);
    append(li, heading, kind);
    const values = element(doc, 'dl');
    append(values, element(doc, 'dt', words.before),
      element(doc, 'dd', valueText(change.before)),
      element(doc, 'dt', words.after), element(doc, 'dd', valueText(change.after)));
    li.appendChild(values);
    if (change.surfaceIds.length) {
      li.appendChild(element(doc, 'p', `${words.related}: ${change.surfaceIds.join(', ')}`));
    }
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function createHeader(doc, words, switchLanguage) {
  const header = element(doc, 'header', null, 'impact-header');
  append(header, element(doc, 'p', words.app), element(doc, 'h1', words.title),
    element(doc, 'p', words.intro));
  const navigation = element(doc, 'nav');
  navigation.setAttribute('aria-label', words.home);
  append(navigation,
    link(doc, 'index.html', words.home),
    link(doc, 'provenance.html', words.datasets),
    link(doc, 'disclosure.html', words.surfaces));
  header.appendChild(navigation);
  header.appendChild(action(doc, words.switchLanguage, switchLanguage, 'impact-language'));
  return header;
}

function createDocumentControls(doc, state, words, callbacks) {
  const section = element(doc, 'section', null, 'impact-documents');
  const heading = element(doc, 'h2', words.files);
  heading.id = 'impact-documents-heading';
  section.setAttribute('aria-labelledby', heading.id);
  section.appendChild(heading);
  section.appendChild(element(doc, 'p', words.fileHelp));
  for (const [id, label] of [['previous', words.previous], ['candidate', words.candidate]]) {
    const { wrapper, control } = labelled(doc, `impact-${id}-file`, label);
    control.type = 'file';
    control.accept = 'application/json,.json';
    control.addEventListener('change', async () => {
      const selected = control.files?.[0];
      if (!selected) return;
      try {
        const parsed = await readLocalPackage(selected);
        callbacks.update(id, parsed);
      } catch {
        callbacks.announce(words.invalid);
      }
    });
    section.appendChild(wrapper);
    section.appendChild(element(doc, 'p', state[id] ?
      (id === 'previous' ? words.previousLoaded : words.candidateLoaded) : words.choose));
  }
  const { wrapper, control } = labelled(doc, 'impact-reference-date', words.date);
  control.type = 'text';
  control.inputMode = 'numeric';
  control.value = state.date;
  control.maxLength = 10;
  control.setAttribute('aria-describedby', 'impact-date-help');
  control.addEventListener('change', () => callbacks.setDate(control.value));
  section.appendChild(wrapper);
  const help = element(doc, 'p', words.chooseDate);
  help.id = 'impact-date-help';
  section.appendChild(help);
  const actions = element(doc, 'div', null, 'impact-actions');
  append(actions,
    action(doc, words.compare, () => callbacks.compare(control.value)),
    action(doc, words.reset, callbacks.reset));
  section.appendChild(actions);
  return section;
}

function filterControls(doc, state, words, onFilter) {
  const section = element(doc, 'section', null, 'impact-filters');
  const heading = element(doc, 'h2', words.details);
  section.appendChild(heading);
  for (const [key, name, values] of [
    ['scope', words.scope, ['all', ...IMPACT_SCOPES]],
    ['kind', words.kind, ['all', ...IMPACT_KINDS]],
    ['severity', words.severity, ['all', 'error', 'warning', 'info']],
  ]) {
    const { wrapper, control } = labelled(doc, `impact-filter-${key}`, name, 'select');
    optionList(control, values, state.filters[key], words);
    control.addEventListener('change', () => onFilter({ [key]: control.value }, control.id));
    section.appendChild(wrapper);
  }
  const { wrapper, control } = labelled(doc, 'impact-filter-query', words.search);
  control.type = 'search';
  control.maxLength = 250;
  control.value = state.filters.query;
  control.addEventListener('input', () => {
    const position = control.selectionStart;
    onFilter({ query: control.value }, control.id, position);
  });
  section.appendChild(wrapper);
  return section;
}

/** Entry point for the live standalone route. Nothing is persisted. */
export function mountImpactRoute(doc = document, win = window) {
  const root = doc.getElementById('impact-root');
  if (!root) throw new Error('Missing impact root');
  const state = {
    locale: 'en', previous: null, candidate: null, report: null,
    date: UNKNOWN, notice: '',
    filters: { scope: 'all', kind: 'all', severity: 'all', query: '' },
  };

  function announce(message) {
    state.notice = message;
    const target = doc.getElementById('impact-live-status');
    if (target) target.textContent = message;
  }

  function compare(date) {
    const words = impactWords(state.locale);
    if (!state.previous || !state.candidate) return announce(words.missing);
    try {
      const referenceDate = normalizeDate(date.trim() || UNKNOWN);
      state.date = referenceDate;
      state.report = auditImpact(state.previous, state.candidate, { referenceDate });
      render('impact-status-heading');
      announce(state.report.passed ? words.ready : words.blocked);
    } catch {
      announce(words.failed);
    }
  }

  function update(id, value) {
    state[id] = value;
    state.report = null;
    render(`impact-${id}-file`);
    announce(id === 'previous' ? impactWords(state.locale).previousLoaded :
      impactWords(state.locale).candidateLoaded);
  }

  function reset() {
    state.previous = null;
    state.candidate = null;
    state.report = null;
    state.date = UNKNOWN;
    state.filters = { scope: 'all', kind: 'all', severity: 'all', query: '' };
    render('impact-previous-file');
  }

  function exportReport(changesOnly) {
    if (!state.report) return;
    const data = changesOnly ? impactChangesJson(state.report.comparison) :
      impactReportJson(state.report);
    reportDownload(win, data, changesOnly ? 'publication-changes.json' :
      'publication-change-report.json');
    announce(impactWords(state.locale).saved);
  }

  function render(focus = null, caret = null) {
    const words = impactWords(state.locale);
    doc.documentElement.lang = state.locale;
    doc.title = `${words.title} — ${words.app}`;
    root.replaceChildren();
    const header = createHeader(doc, words, () => {
      state.locale = impactLocale(state.locale === 'en' ? 'fr' : 'en');
      render(null);
    });
    const main = element(doc, 'main', null, 'impact-main');
    main.id = 'main-content';
    main.tabIndex = -1;
    const controls = createDocumentControls(doc, state, words, {
      update, compare, reset, announce,
      setDate(value) { state.date = value; },
    });
    main.appendChild(controls);
    main.appendChild(element(doc, 'p', words.allLocal));
    main.appendChild(element(doc, 'p', words.offline));
    if (state.report) {
      main.appendChild(renderSummary(doc, state.report, words));
      const actions = element(doc, 'div', null, 'impact-actions');
      append(actions,
        action(doc, words.copy, () => exportReport(false)),
        action(doc, words.exportChanges, () => exportReport(true)));
      main.appendChild(actions);
      const filters = filterControls(doc, state, words, (changed, focusId, position = null) => {
        state.filters = { ...state.filters, ...changed };
        render(focusId, position);
      });
      main.appendChild(filters);
      main.appendChild(renderFindings(doc, state.report, words, state.locale, state.filters.severity));
      main.appendChild(renderChanges(doc, state.report.comparison, words, state.filters));
    } else main.appendChild(element(doc, 'p', words.noReview));
    const help = element(doc, 'section');
    append(help, element(doc, 'h2', words.helpTitle), element(doc, 'p', words.help));
    main.appendChild(help);
    const status = element(doc, 'p', state.notice, 'impact-live-status');
    status.id = 'impact-live-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    append(root, header, main, status);
    if (focus) {
      const next = doc.getElementById(focus);
      if (next) {
        next.focus?.();
        if (caret !== null && typeof next.setSelectionRange === 'function') {
          next.setSelectionRange(caret, caret);
        }
      }
    }
  }
  render();
  return Object.freeze({
    compare: () => compare(state.date),
    importPrevious: (value) => update('previous', parseImpactPackageText(value)),
    importCandidate: (value) => update('candidate', parseImpactPackageText(value)),
    report: () => state.report,
    reset,
    setLocale(locale) { state.locale = impactLocale(locale); render(); },
    destroy() { root.replaceChildren(); },
  });
}

if (typeof document !== 'undefined' && document.getElementById('impact-root')) {
  mountImpactRoute();
}
