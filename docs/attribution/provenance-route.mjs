/**
 * Directly loadable, offline-first local provenance workbench. This browser
 * module only reads user-selected files and never transmits record contents.
 */
import {
  UNKNOWN, MAX_DOCUMENT_BYTES, PROVIDERS, LICENCES, USES, STATUSES,
  emptyRecord, emptyInventory, parseRecord, parseInventoryText,
  upsertRecord, removeRecord, cloneRecord, filterRecords, inventoryStats,
  encodeInventory,
} from './provenance-core.mjs';
import {
  auditInventory, reportAsText,
} from './provenance-audit.mjs';
import {
  localeFor, wordsFor, severityName, providerName, useName, ruleDescription,
} from './provenance-messages.mjs';

function create(doc, tag, props = {}) {
  const node = doc.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = String(props.text);
  if (props.type) node.type = props.type;
  return node;
}

function append(parent, ...nodes) {
  for (const node of nodes) parent.appendChild(node);
  return parent;
}

function labelled(doc, tag, text, id, extra = {}) {
  const label = create(doc, 'label', { text });
  label.htmlFor = id;
  const input = create(doc, tag, { id, ...extra });
  return { label, input };
}

function announce(doc, message) {
  const status = doc.getElementById('provenance-status');
  if (status) status.textContent = message;
}

function makeButton(doc, text, onClick, className = '') {
  const button = create(doc, 'button', { text, type: 'button', className });
  button.addEventListener('click', onClick);
  return button;
}

function description(doc, label, value) {
  const wrapper = create(doc, 'div', { className: 'provenance-detail' });
  append(wrapper, create(doc, 'dt', { text: label }), create(doc, 'dd', { text: value }));
  return wrapper;
}

function choose(doc, id, options, value, labelFor) {
  const select = create(doc, 'select', { id });
  for (const optionValue of options) {
    const option = create(doc, 'option', { text: labelFor(optionValue) });
    option.value = optionValue;
    option.selected = optionValue === value;
    select.appendChild(option);
  }
  return select;
}

function inputRow(doc, key, label, value, kind, help) {
  const row = create(doc, 'div', { className: 'provenance-field' });
  const id = `field-${key}`;
  const input = kind === 'long' ? create(doc, 'textarea', { id })
    : create(doc, 'input', { id });
  if (kind !== 'long') input.type = 'text';
  input.name = key;
  input.value = value;
  input.maxLength = kind === 'long' ? 4000 : key.endsWith('Url') ? 2048 : 500;
  const labelNode = create(doc, 'label', { text: label });
  labelNode.htmlFor = id;
  append(row, labelNode, input);
  if (help) {
    const helpNode = create(doc, 'p', { text: help, className: 'help', id: `${id}-help` });
    input.setAttribute('aria-describedby', helpNode.id);
    row.appendChild(helpNode);
  }
  return row;
}

function selectRow(doc, key, label, values, selected, display) {
  const row = create(doc, 'div', { className: 'provenance-field' });
  const labelNode = create(doc, 'label', { text: label });
  labelNode.htmlFor = `field-${key}`;
  const select = choose(doc, `field-${key}`, values, selected, display);
  select.name = key;
  append(row, labelNode, select);
  return row;
}

function triStateRow(doc, key, label, value, words) {
  const options = [UNKNOWN, 'true', 'false'];
  const display = (item) => item === UNKNOWN ? words.unknown
    : item === 'true' ? words.yes : words.no;
  return selectRow(doc, key, label, options, value === UNKNOWN ? UNKNOWN : String(value), display);
}

function formValue(form, key) {
  const node = form.elements.namedItem(key);
  if (!node || typeof node.value !== 'string') throw new Error(`Missing field: ${key}`);
  return node.value;
}

/** User text stays textContent; no HTML templating is used. */
export function readRecordForm(form) {
  const raw = emptyRecord(formValue(form, 'id'));
  for (const key of ['title', 'sourceName', 'sourceUrl', 'licenceUrl',
    'acquiredOn', 'datasetAsOf', 'termsReviewedOn', 'notice', 'notes',
    'provider', 'use', 'status', 'licence']) {
    raw[key] = formValue(form, key);
  }
  for (const key of ['containsOdbl', 'derivedFromOdbl', 'redistributionAllowed']) {
    const value = formValue(form, key);
    raw[key] = value === UNKNOWN ? UNKNOWN : value === 'true';
  }
  return parseRecord(raw);
}

function createRecordForm(doc, words, record, onSubmit, onCancel) {
  const section = create(doc, 'section', { className: 'provenance-editor', id: 'record-editor' });
  section.setAttribute('aria-labelledby', 'editor-heading');
  const heading = create(doc, 'h2', {
    text: record ? words.formTitleEdit : words.formTitleNew,
    id: 'editor-heading',
  });
  const form = create(doc, 'form', { id: 'record-form' });
  form.noValidate = true;
  const current = record ?? emptyRecord();
  const fieldset = create(doc, 'fieldset');
  const legend = create(doc, 'legend', { text: words.legend });
  append(fieldset, legend, create(doc, 'p', { text: words.formHelp }));
  const shortFields = [
    ['id', words.id, words.idHelp],
    ['title', words.titleField, null],
    ['sourceName', words.sourceName, null],
    ['sourceUrl', words.sourceUrl, words.inputHelp],
    ['licenceUrl', words.licenceUrl, words.inputHelp],
    ['acquiredOn', words.acquiredOn, words.dateHelp],
    ['datasetAsOf', words.datasetAsOf, words.dateHelp],
    ['termsReviewedOn', words.termsReviewedOn, words.dateHelp],
  ];
  for (const [key, label, help] of shortFields) {
    fieldset.appendChild(inputRow(doc, key, label, current[key], 'short', help));
  }
  fieldset.appendChild(selectRow(doc, 'provider', words.provider,
    PROVIDERS, current.provider, (value) => words[value] ?? value));
  fieldset.appendChild(selectRow(doc, 'use', words.use, USES,
    current.use, (value) => value === 'other' ? words.useOther : words[value]));
  fieldset.appendChild(selectRow(doc, 'status', words.status, STATUSES,
    current.status, (value) => value === 'included' ? words.include
      : value === 'held' ? words.hold : words.exclude));
  fieldset.appendChild(selectRow(doc, 'licence', words.licence,
    LICENCES, current.licence, (value) => value));
  fieldset.appendChild(triStateRow(doc, 'containsOdbl', words.containsOdbl,
    current.containsOdbl, words));
  fieldset.appendChild(triStateRow(doc, 'derivedFromOdbl', words.derivedFromOdbl,
    current.derivedFromOdbl, words));
  fieldset.appendChild(triStateRow(doc, 'redistributionAllowed',
    words.redistributionAllowed, current.redistributionAllowed, words));
  fieldset.appendChild(inputRow(doc, 'notice', words.notice, current.notice, 'long'));
  fieldset.appendChild(inputRow(doc, 'notes', words.notes, current.notes, 'long'));
  form.appendChild(fieldset);
  const actions = create(doc, 'div', { className: 'provenance-actions' });
  const save = create(doc, 'button', { text: words.save, type: 'submit' });
  append(actions, save, makeButton(doc, words.cancel, onCancel));
  form.appendChild(actions);
  const validation = create(doc, 'p', { className: 'provenance-error', id: 'editor-error' });
  validation.setAttribute('role', 'alert');
  form.appendChild(validation);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const value = readRecordForm(form);
      onSubmit(value);
    } catch (cause) {
      validation.textContent = `${words.invalid} ${cause instanceof Error ? cause.message : ''}`;
      const field = cause && typeof cause.path === 'string'
        ? cause.path.split('.').at(-1) : null;
      if (field) form.elements.namedItem(field)?.focus?.();
    }
  });
  append(section, heading, form);
  return section;
}

function download(win, doc, filename, content, mime) {
  const blob = new win.Blob([content], { type: mime });
  const url = win.URL.createObjectURL(blob);
  const anchor = create(doc, 'a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  win.URL.revokeObjectURL(url);
}

function makeSummary(doc, inventory, words) {
  const stats = inventoryStats(inventory);
  const section = create(doc, 'section', { className: 'provenance-summary' });
  section.setAttribute('aria-labelledby', 'summary-heading');
  section.appendChild(create(doc, 'h2', { text: words.summary, id: 'summary-heading' }));
  const list = create(doc, 'dl', { className: 'provenance-facts' });
  append(list,
    description(doc, words.count, stats.total),
    description(doc, words.include, stats.byStatus.included),
    description(doc, words.hold, stats.byStatus.held),
    description(doc, words.exclude, stats.byStatus.excluded),
    description(doc, words.datasetAsOf, stats.missingDates),
  );
  section.appendChild(list);
  return section;
}

function makeFilters(doc, state, words, rerender) {
  const wrapper = create(doc, 'section', { className: 'provenance-filters' });
  wrapper.setAttribute('aria-label', words.filters);
  const status = labelled(doc, 'select', words.filterStatus, 'filter-status');
  const provider = labelled(doc, 'select', words.filterProvider, 'filter-provider');
  const search = labelled(doc, 'input', words.filterText, 'filter-text');
  const statusSelect = choose(doc, 'filter-status', ['all', ...STATUSES],
    state.filter.status, (value) => value === 'all' ? words.all : value === 'included'
      ? words.include : value === 'held' ? words.hold : words.exclude);
  const providerSelect = choose(doc, 'filter-provider', ['all', ...PROVIDERS],
    state.filter.provider, (value) => value === 'all' ? words.all : words[value]);
  search.input.value = state.filter.text;
  search.input.type = 'search';
  search.input.maxLength = 100;
  const apply = (key, value) => {
    state.filter[key] = value;
    rerender('filters');
  };
  statusSelect.addEventListener('change', () => apply('status', statusSelect.value));
  providerSelect.addEventListener('change', () => apply('provider', providerSelect.value));
  search.input.addEventListener('change', () => apply('text', search.input.value));
  for (const [label, input] of [
    [status.label, statusSelect], [provider.label, providerSelect],
    [search.label, search.input],
  ]) {
    const row = create(doc, 'div', { className: 'provenance-field' });
    append(row, label, input);
    wrapper.appendChild(row);
  }
  return wrapper;
}

function makeRecords(doc, state, words, rerender) {
  const section = create(doc, 'section', { id: 'record-list' });
  section.setAttribute('aria-labelledby', 'record-list-title');
  section.appendChild(create(doc, 'h2', { text: words.list, id: 'record-list-title' }));
  section.appendChild(makeFilters(doc, state, words, rerender));
  const items = filterRecords(state.inventory, state.filter);
  if (items.length === 0) {
    section.appendChild(create(doc, 'p', { text: state.inventory.records.length
      ? words.noMatches : words.noRecords }));
    return section;
  }
  const list = create(doc, 'ul', { className: 'provenance-list' });
  for (const record of items) {
    const item = create(doc, 'li', { className: 'provenance-card' });
    const heading = create(doc, 'h3', { text: record.title });
    const facts = create(doc, 'dl', { className: 'provenance-facts' });
    append(facts,
      description(doc, words.id, record.id),
      description(doc, words.provider, providerName(state.locale, record.provider)),
      description(doc, words.use, useName(state.locale, record.use)),
      description(doc, words.status, record.status),
      description(doc, words.licence, record.licence),
      description(doc, words.datasetAsOf, record.datasetAsOf),
    );
    const actions = create(doc, 'div', { className: 'provenance-actions' });
    append(actions,
      makeButton(doc, words.edit, () => {
        state.editing = record;
        rerender('editor');
      }),
      makeButton(doc, words.duplicate, () => {
        let suffix = 2;
        let copyId = `${record.id}-${suffix}`;
        while (state.inventory.records.some((entry) => entry.id === copyId)) {
          suffix += 1;
          copyId = `${record.id}-${suffix}`;
        }
        state.inventory = upsertRecord(state.inventory, cloneRecord(record, copyId));
        state.editing = state.inventory.records.find((entry) => entry.id === copyId);
        rerender('editor');
      }),
      makeButton(doc, words.delete, () => {
        if (!state.win.confirm(words.deleteConfirm)) return;
        state.inventory = removeRecord(state.inventory, record.id);
        rerender('list');
        announce(doc, words.removed);
      }),
    );
    append(item, heading, facts, actions);
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function makeAudit(doc, state, words) {
  const report = auditInventory(state.inventory, { referenceDate: state.referenceDate });
  const section = create(doc, 'section', { id: 'audit-output' });
  section.setAttribute('aria-labelledby', 'audit-heading');
  section.appendChild(create(doc, 'h2', { text: words.audit, id: 'audit-heading' }));
  section.appendChild(create(doc, 'p', {
    text: report.passed ? words.pass : words.fail,
    className: report.passed ? 'provenance-pass' : 'provenance-fail',
  }));
  section.appendChild(create(doc, 'p', { text: words.gateHelp }));
  const totals = create(doc, 'dl', { className: 'provenance-facts' });
  append(totals,
    description(doc, words.errors, report.counts.error),
    description(doc, words.warnings, report.counts.warning),
    description(doc, words.information, report.counts.info),
  );
  section.appendChild(totals);
  if (report.findings.length === 0) return section;
  const table = create(doc, 'table', { className: 'provenance-table' });
  const caption = create(doc, 'caption', { text: words.output });
  const head = create(doc, 'thead');
  const headings = create(doc, 'tr');
  for (const text of [words.findingRecord, words.findingCode, words.findingMessage]) {
    headings.appendChild(create(doc, 'th', { text }));
  }
  head.appendChild(headings);
  const body = create(doc, 'tbody');
  for (const item of report.findings) {
    const row = create(doc, 'tr');
    const message = `${severityName(state.locale, item.severity)} — ` +
      ruleDescription(state.locale, item.code);
    for (const text of [item.recordId ?? '—', item.code, message]) {
      row.appendChild(create(doc, 'td', { text }));
    }
    body.appendChild(row);
  }
  append(table, caption, head, body);
  section.appendChild(table);
  return section;
}

export function mountProvenance(doc, win) {
  const root = doc.getElementById('provenance-root');
  if (!root) throw new Error('Missing provenance-root');
  const state = {
    locale: localeFor(new URLSearchParams(win.location.search).get('lang') ?? doc.documentElement.lang),
    inventory: emptyInventory(),
    editing: null,
    referenceDate: UNKNOWN,
    filter: { status: 'all', provider: 'all', text: '' },
    win,
  };
  function render(focus = '') {
    const words = wordsFor(state.locale);
    doc.documentElement.lang = state.locale;
    doc.title = `${words.title} — ${words.app}`;
    root.replaceChildren();
    const header = create(doc, 'header', { className: 'page-header' });
    const language = labelled(doc, 'select', words.language, 'provenance-language');
    const switcher = choose(doc, 'provenance-language', ['en', 'fr'], state.locale,
      (value) => value === 'en' ? words.english : words.french);
    switcher.addEventListener('change', () => {
      state.locale = switcher.value;
      render('language');
    });
    const switchRow = create(doc, 'div', { className: 'language-switch' });
    append(switchRow, language.label, switcher);
    const nav = create(doc, 'nav');
    nav.setAttribute('aria-label', words.navigation);
    const attribution = create(doc, 'a', { text: words.attribution });
    attribution.href = 'index.html';
    const publication = create(doc, 'a', { text: state.locale === 'fr' ? 'Registre des surfaces' : 'Publication surfaces' });
    publication.href = 'disclosure.html';
    append(nav, attribution, publication);
    append(header, switchRow, nav,
      create(doc, 'h1', { text: words.title }),
      create(doc, 'p', { text: words.introduction }),
      create(doc, 'p', { text: words.caution }),
      create(doc, 'p', { text: words.offline, className: 'help' }),
    );
    const main = create(doc, 'main', { id: 'main-content', className: 'content' });
    main.tabIndex = -1;
    const actions = create(doc, 'section', { className: 'provenance-actions-panel' });
    actions.setAttribute('aria-label', words.actions);
    const row = create(doc, 'div', { className: 'provenance-actions' });
    append(row,
      makeButton(doc, words.add, () => {
        state.editing = emptyRecord(`dataset-${state.inventory.records.length + 1}`);
        render('editor');
      }),
      makeButton(doc, words.export, () => {
        download(win, doc, 'provenance-inventory.json', encodeInventory(state.inventory),
          'application/json;charset=utf-8');
      }),
      makeButton(doc, words.exportAudit, () => {
        const report = auditInventory(state.inventory, { referenceDate: state.referenceDate });
        download(win, doc, 'provenance-audit.txt', reportAsText(report),
          'text/plain;charset=utf-8');
      }),
      makeButton(doc, words.clear, () => {
        if (!win.confirm(words.clearConfirm)) return;
        state.inventory = emptyInventory();
        state.editing = null;
        render();
        announce(doc, words.cleared);
      }),
    );
    actions.appendChild(row);
    const importRow = create(doc, 'div', { className: 'provenance-field' });
    const fileLabel = create(doc, 'label', { text: words.import });
    fileLabel.htmlFor = 'inventory-file';
    const file = create(doc, 'input', { id: 'inventory-file' });
    file.type = 'file';
    file.accept = '.json,application/json';
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      if (chosen.size > MAX_DOCUMENT_BYTES) {
        announce(doc, words.fileTooLarge);
        file.value = '';
        return;
      }
      try {
        const parsed = parseInventoryText(await chosen.text());
        state.inventory = parsed;
        state.editing = null;
        render();
        announce(doc, words.imported);
      } catch (error) {
        announce(doc, `${words.importedFailure} ${error instanceof Error ? error.message : ''}`);
        file.value = '';
      }
    });
    append(importRow, fileLabel, file,
      create(doc, 'p', { text: words.importHelp, className: 'help' }));
    actions.appendChild(importRow);
    const reference = inputRow(doc, 'referenceDate', words.referenceDate,
      state.referenceDate, 'short', words.referenceHelp);
    const referenceInput = reference.querySelector('input');
    referenceInput.id = 'audit-reference-date';
    reference.querySelector('label').htmlFor = referenceInput.id;
    referenceInput.addEventListener('change', () => {
      state.referenceDate = referenceInput.value || UNKNOWN;
      try {
        auditInventory(state.inventory, { referenceDate: state.referenceDate });
        render('audit');
      } catch {
        state.referenceDate = UNKNOWN;
        referenceInput.value = UNKNOWN;
        announce(doc, words.formatError);
      }
    });
    actions.appendChild(reference);
    main.appendChild(actions);
    main.appendChild(makeSummary(doc, state.inventory, words));
    if (state.editing) {
      main.appendChild(createRecordForm(doc, words, state.editing,
        (record) => {
          state.inventory = upsertRecord(state.inventory, record);
          state.editing = null;
          render('list');
          announce(doc, words.saved);
        }, () => {
          state.editing = null;
          render('list');
        }));
    }
    main.appendChild(makeRecords(doc, state, words, render));
    main.appendChild(makeAudit(doc, state, words));
    main.appendChild(create(doc, 'p', { text: words.noStorage, className: 'help' }));
    main.appendChild(create(doc, 'p', { text: words.downloadLocal, className: 'help' }));
    const status = create(doc, 'p', { id: 'provenance-status', className: 'status' });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    append(root, header, main, status);
    if (focus === 'editor') doc.getElementById('field-id')?.focus();
    else if (focus === 'list') {
      const heading = doc.getElementById('record-list-title');
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    }
    else if (focus === 'language') doc.getElementById('provenance-language')?.focus();
    else if (focus === 'audit') {
      const heading = doc.getElementById('audit-heading');
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    }
  }
  render();
  return { getInventory: () => state.inventory, getLocale: () => state.locale, destroy: () => root.replaceChildren() };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' &&
    document.getElementById('provenance-root')) {
  mountProvenance(document, window);
}
