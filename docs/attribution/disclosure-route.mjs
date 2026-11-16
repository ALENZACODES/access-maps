/** Standalone, offline-safe browser route for the publication surface register. */
import {
  UNKNOWN, MAX_DOCUMENT_BYTES, parseInventoryText, emptyInventory,
} from './provenance-core.mjs';
import {
  MAX_SURFACE_BYTES, SURFACE_KINDS, SURFACE_STATES, DELIVERY, ACCESS_STATES,
  blankSurface, emptyRegister, parseSurface, parseRegisterText,
  parseReleasePackageText, parseReleasePackage, encodeRegister,
  encodeReleasePackage, upsertSurface, removeSurface, copySurface,
  updateSurfaceState, searchSurfaces, registerCounts, surfaceCreditRows,
} from './disclosure-core.mjs';
import {
  auditDisclosures, disclosureReportText,
} from './disclosure-audit.mjs';
import {
  disclosureLocale, disclosureWords, disclosureRule, disclosureSeverity,
} from './disclosure-messages.mjs';

function node(doc, tag, options = {}) {
  const element = doc.createElement(tag);
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.id) element.id = options.id;
  if (options.className) element.className = options.className;
  if (options.type) element.type = options.type;
  return element;
}

function add(parent, ...items) {
  for (const item of items) parent.appendChild(item);
  return parent;
}

function labelled(doc, tag, key, title) {
  const label = node(doc, 'label', { text: title });
  label.htmlFor = key;
  return { label, field: node(doc, tag, { id: key }) };
}

function button(doc, label, action, extra = '') {
  const element = node(doc, 'button', { text: label, type: 'button', className: extra });
  element.addEventListener('click', action);
  return element;
}

function heading(doc, level, value, id) {
  return node(doc, `h${level}`, { text: value, id });
}

function paragraph(doc, value, className = '') {
  return node(doc, 'p', { text: value, className });
}

function labelledText(doc, key, title, value, multiline = false) {
  const row = node(doc, 'div', { className: 'disclosure-field' });
  const { label, field } = labelled(doc, multiline ? 'textarea' : 'input', `surface-${key}`, title);
  if (!multiline) field.type = 'text';
  field.name = key;
  field.value = value;
  field.maxLength = multiline ? 4000 : 1000;
  add(row, label, field);
  return row;
}

function labelledSelect(doc, key, title, options, value, display) {
  const row = node(doc, 'div', { className: 'disclosure-field' });
  const { label, field } = labelled(doc, 'select', `surface-${key}`, title);
  field.name = key;
  for (const option of options) {
    const item = node(doc, 'option', { text: display(option) });
    item.value = String(option);
    item.selected = option === value;
    field.appendChild(item);
  }
  add(row, label, field);
  return row;
}

function getValue(form, key) {
  const control = form.elements.namedItem(key);
  if (!control || typeof control.value !== 'string') throw new Error(`Missing ${key}`);
  return control.value;
}

export function readSurfaceForm(form) {
  const raw = blankSurface(getValue(form, 'id'));
  for (const field of [
    'titleEn', 'titleFr', 'kind', 'state', 'path', 'delivery',
    'lastReviewedOn', 'creditEn', 'creditFr', 'noticeEn',
    'noticeFr', 'sourceDate', 'notesEn', 'notesFr',
    'supportsKeyboard', 'supportsScreenReader',
  ]) raw[field] = getValue(form, field);
  raw.sourceIds = getValue(form, 'sourceIds').split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  const size = getValue(form, 'minimumTargetPx');
  raw.minimumTargetPx = size === UNKNOWN ? UNKNOWN : size.trim() === '' ? Number.NaN : Number(size);
  return parseSurface(raw);
}

function editor(doc, words, surface, submit, cancel) {
  const section = node(doc, 'section', { className: 'disclosure-editor', id: 'surface-editor' });
  section.setAttribute('aria-labelledby', 'surface-editor-heading');
  add(section, heading(doc, 2, surface ? words.editorTitle : words.editorNew, 'surface-editor-heading'),
    paragraph(doc, words.editorHelp));
  const form = node(doc, 'form', { id: 'surface-form' });
  form.noValidate = true;
  const fieldset = node(doc, 'fieldset');
  fieldset.appendChild(node(doc, 'legend', { text: words.fields }));
  const current = surface ?? blankSurface();
  for (const field of ['id', 'titleEn', 'titleFr', 'path', 'lastReviewedOn', 'sourceDate']) {
    fieldset.appendChild(labelledText(doc, field, words[field], current[field]));
  }
  for (const [key, values] of [
    ['kind', SURFACE_KINDS], ['state', SURFACE_STATES], ['delivery', DELIVERY],
    ['supportsKeyboard', ACCESS_STATES], ['supportsScreenReader', ACCESS_STATES],
  ]) {
    fieldset.appendChild(labelledSelect(doc, key, words[key], values, current[key],
      (value) => words[value] ?? (value === UNKNOWN ? words.unknown : value)));
  }
  fieldset.appendChild(labelledText(doc, 'minimumTargetPx', words.minimumTargetPx,
    String(current.minimumTargetPx)));
  const sourceRow = labelledText(doc, 'sourceIds', words.sourceIds, current.sourceIds.join('\n'), true);
  const sourceHelp = paragraph(doc, words.sourceIdsHelp, 'help');
  sourceHelp.id = 'surface-sources-help';
  sourceRow.querySelector('textarea').setAttribute('aria-describedby', sourceHelp.id);
  add(sourceRow, sourceHelp);
  fieldset.appendChild(sourceRow);
  for (const field of ['creditEn', 'creditFr', 'noticeEn', 'noticeFr', 'notesEn', 'notesFr']) {
    fieldset.appendChild(labelledText(doc, field, words[field], current[field], true));
  }
  form.appendChild(fieldset);
  const actions = node(doc, 'div', { className: 'disclosure-actions' });
  add(actions, node(doc, 'button', { type: 'submit', text: words.save }),
    button(doc, words.cancel, cancel));
  form.appendChild(actions);
  const error = paragraph(doc, '', 'disclosure-error');
  error.id = 'surface-editor-error';
  error.setAttribute('role', 'alert');
  form.appendChild(error);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try { submit(readSurfaceForm(form)); } catch (cause) {
      error.textContent = `${words.invalid} ${cause instanceof Error ? cause.message : ''}`;
      const key = cause?.path?.split('.').at(-1);
      form.elements.namedItem(key)?.focus?.();
    }
  });
  section.appendChild(form);
  return section;
}

function fact(doc, label, value) {
  const item = node(doc, 'div', { className: 'disclosure-fact' });
  add(item, node(doc, 'dt', { text: label }), node(doc, 'dd', { text: value }));
  return item;
}

function summary(doc, words, register) {
  const counts = registerCounts(register);
  const section = node(doc, 'section', { className: 'disclosure-summary' });
  section.setAttribute('aria-labelledby', 'surface-summary-heading');
  section.appendChild(heading(doc, 2, words.summary, 'surface-summary-heading'));
  const dl = node(doc, 'dl', { className: 'disclosure-facts' });
  for (const [label, value] of [
    [words.total, counts.total], [words.published, counts.included],
    [words.awaiting, counts.held], [words.linked, counts.linkedSources],
    [words.offlineCount, counts.offline],
  ]) dl.appendChild(fact(doc, label, value));
  section.appendChild(dl);
  return section;
}

function sourceList(doc, words, surface, inventory) {
  const section = node(doc, 'section', { className: 'disclosure-sources' });
  section.appendChild(heading(doc, 4, words.details));
  const list = node(doc, 'ul', { className: 'disclosure-source-list' });
  for (const row of surfaceCreditRows(surface, inventory)) {
    const item = node(doc, 'li');
    add(item, paragraph(doc, `${row.id} — ${row.name}`),
      paragraph(doc, `${words.licence}: ${row.licence}`),
      paragraph(doc, `${words.sourceDateLabel}: ${row.date}`));
    if (row.url) {
      const link = node(doc, 'a', { text: words.sourceUrlLabel });
      link.href = row.url;
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      item.appendChild(link);
    } else item.appendChild(paragraph(doc, words.missingSource));
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function card(doc, words, surface, inventory, actions) {
  const article = node(doc, 'article', { className: 'disclosure-card' });
  article.id = `card-${surface.id}`;
  const title = words === null ? surface.titleEn :
    (actions.locale === 'fr' ? surface.titleFr : surface.titleEn);
  add(article, heading(doc, 3, title), paragraph(doc, `${surface.path} · ${surface.state}`));
  const dl = node(doc, 'dl', { className: 'disclosure-facts' });
  for (const [label, value] of [
    [words.kind, surface.kind], [words.delivery, surface.delivery],
    [words.lastReviewedOn, surface.lastReviewedOn], [words.sourceDate, surface.sourceDate],
    [words.minimumTargetPx, surface.minimumTargetPx],
  ]) dl.appendChild(fact(doc, label, value));
  article.appendChild(dl);
  for (const [label, value] of [
    [words.creditEn, surface.creditEn], [words.creditFr, surface.creditFr],
    [words.noticeEn, surface.noticeEn], [words.noticeFr, surface.noticeFr],
  ]) {
    const block = node(doc, 'div', { className: 'disclosure-text' });
    add(block, heading(doc, 4, label), paragraph(doc, value));
    article.appendChild(block);
  }
  article.appendChild(sourceList(doc, words, surface, inventory));
  const toolbar = node(doc, 'div', { className: 'disclosure-actions' });
  add(toolbar,
    button(doc, words.edit, () => actions.edit(surface)),
    button(doc, words.duplicate, () => actions.copy(surface)),
    button(doc, words.delete, () => actions.remove(surface)),
    button(doc, words.hold, () => actions.mark(surface, 'held')),
  );
  article.appendChild(toolbar);
  return article;
}

function filteredList(doc, words, state, actions) {
  const section = node(doc, 'section', { className: 'disclosure-list' });
  section.setAttribute('aria-labelledby', 'surface-list-heading');
  section.appendChild(heading(doc, 2, words.list, 'surface-list-heading'));
  const controls = node(doc, 'div', { className: 'disclosure-filters' });
  const search = labelled(doc, 'input', 'surface-filter-text', words.search);
  search.field.type = 'search';
  search.field.value = state.filter.text;
  search.field.addEventListener('input', () => actions.filter({ text: search.field.value }));
  const searchRow = node(doc, 'div', { className: 'disclosure-field' });
  add(searchRow, search.label, search.field);
  controls.appendChild(searchRow);
  for (const [key, choices, label] of [
    ['state', ['all', ...SURFACE_STATES], words.stateFilter],
    ['kind', ['all', ...SURFACE_KINDS], words.kindFilter],
  ]) {
    const row = node(doc, 'div', { className: 'disclosure-field' });
    const { label: labelNode, field } = labelled(doc, 'select', `surface-filter-${key}`, label);
    for (const option of choices) {
      const child = node(doc, 'option', { text: words[option] ?? option });
      child.value = option;
      child.selected = option === state.filter[key];
      field.appendChild(child);
    }
    field.addEventListener('change', () => actions.filter({ [key]: field.value }));
    add(row, labelNode, field);
    controls.appendChild(row);
  }
  section.appendChild(controls);
  const items = searchSurfaces(state.register, state.filter);
  if (!items.length) section.appendChild(paragraph(doc, words.noRecords));
  else {
    const list = node(doc, 'div', { className: 'disclosure-cards' });
    for (const surface of items) list.appendChild(card(doc, words, surface, state.inventory,
      { ...actions, locale: state.locale }));
    section.appendChild(list);
  }
  return section;
}

function auditView(doc, words, report, locale) {
  const section = node(doc, 'section', { className: 'disclosure-audit', id: 'disclosure-audit' });
  section.setAttribute('aria-labelledby', 'surface-audit-heading');
  section.tabIndex = -1;
  section.appendChild(heading(doc, 2, words.auditTitle, 'surface-audit-heading'));
  const status = paragraph(doc, report.passed ? words.auditPass : words.auditFail,
    report.passed ? 'disclosure-pass' : 'disclosure-fail');
  status.setAttribute('role', 'status');
  add(section, status, paragraph(doc, words.explanations));
  const counts = node(doc, 'dl', { className: 'disclosure-facts' });
  for (const [label, value] of [
    [words.errors, report.counts.error], [words.warnings, report.counts.warning],
    [words.infos, report.counts.info],
  ]) counts.appendChild(fact(doc, label, value));
  section.appendChild(counts);
  const list = node(doc, 'ul', { className: 'disclosure-findings' });
  for (const item of report.findings) {
    const row = node(doc, 'li');
    add(row, paragraph(doc, `${disclosureSeverity(locale, item.severity)} — ${item.surfaceId ?? 'release'} — ${item.sourceId ?? ''}`),
      paragraph(doc, disclosureRule(locale, item.code)),
      paragraph(doc, `${words.field}: ${item.field ?? '—'}`));
    list.appendChild(row);
  }
  section.appendChild(list);
  section.appendChild(heading(doc, 3, words.upstream));
  const provenance = node(doc, 'ul', { className: 'disclosure-findings' });
  for (const item of report.provenance.findings) {
    const row = node(doc, 'li', { text: `${item.severity} · ${item.recordId ?? 'release'} · ${item.code}` });
    provenance.appendChild(row);
  }
  section.appendChild(provenance);
  return section;
}

function saveFile(win, doc, filename, content, type) {
  const blob = new win.Blob([content], { type });
  const objectUrl = win.URL.createObjectURL(blob);
  const anchor = node(doc, 'a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  win.URL.revokeObjectURL(objectUrl);
}

async function pickFile(doc, maxBytes, parser) {
  return new Promise((resolve, reject) => {
    const input = node(doc, 'input', { type: 'file' });
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      if (file.size > maxBytes) { reject(new Error('File size limit exceeded')); return; }
      try { resolve(parser(await file.text())); } catch (cause) { reject(cause); }
    }, { once: true });
    input.click();
  });
}

export function mountDisclosureRoute(doc = document, win = window) {
  const root = doc.getElementById('disclosure-root');
  if (!root) throw new Error('Missing disclosure root');
  const state = {
    locale: disclosureLocale(doc.documentElement.lang),
    inventory: emptyInventory(),
    register: emptyRegister(),
    inventoryLoaded: false,
    filter: { state: 'all', kind: 'all', text: '' },
    editor: null,
    report: null,
    message: '',
  };
  const words = () => disclosureWords(state.locale);
  function announce(text) {
    state.message = text;
    const status = doc.getElementById('disclosure-status');
    if (status) status.textContent = text;
  }
  function rerender() {
    const w = words();
    doc.documentElement.lang = state.locale;
    doc.title = `${w.title} — ${w.app}`;
    root.replaceChildren();
    const header = node(doc, 'header');
    const nav = node(doc, 'nav');
    nav.setAttribute('aria-label', w.home);
    for (const [path, label] of [['index.html', w.home], ['provenance.html', w.provenance]]) {
      const link = node(doc, 'a', { text: label });
      link.href = path;
      nav.appendChild(link);
    }
    const languages = node(doc, 'div', { className: 'disclosure-actions' });
    languages.setAttribute('role', 'group');
    languages.setAttribute('aria-label', w.language);
    const en = button(doc, w.switchToEnglish, () => switchLocale('en'));
    const fr = button(doc, w.switchToFrench, () => switchLocale('fr'));
    en.setAttribute('aria-pressed', String(state.locale === 'en'));
    fr.setAttribute('aria-pressed', String(state.locale === 'fr'));
    add(languages, en, fr);
    add(header, nav, languages);
    const main = node(doc, 'main', { id: 'main-content' });
    main.tabIndex = -1;
    add(main, heading(doc, 1, w.title), paragraph(doc, w.intro), paragraph(doc, w.offlineCaution));
    const status = paragraph(doc, state.message, 'disclosure-status');
    status.id = 'disclosure-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    main.appendChild(status);
    const io = node(doc, 'section', { className: 'disclosure-io' });
    io.setAttribute('aria-labelledby', 'disclosure-io-heading');
    io.appendChild(heading(doc, 2, w.inputs, 'disclosure-io-heading'));
    const actions = node(doc, 'div', { className: 'disclosure-actions' });
    for (const [label, max, parser, apply] of [
      [w.uploadInventory, MAX_DOCUMENT_BYTES, parseInventoryText, (value) => {
        state.inventory = value; state.inventoryLoaded = true;
      }],
      [w.uploadRegister, MAX_SURFACE_BYTES, parseRegisterText, (value) => {
        state.register = value;
      }],
      [w.uploadPackage, MAX_DOCUMENT_BYTES * 2, parseReleasePackageText, (value) => {
        state.inventory = value.inventory; state.register = value.register; state.inventoryLoaded = true;
      }],
    ]) {
      actions.appendChild(button(doc, label, async () => {
        try {
          const value = await pickFile(doc, max, parser);
          apply(value);
          state.report = null;
          state.editor = null;
          rerender();
          announce(w.importSuccess);
        } catch (cause) {
          announce(`${w.importFailure} ${cause instanceof Error ? cause.message : ''}`);
        }
      }));
    }
    actions.appendChild(button(doc, w.saveRegister, () => {
      saveFile(win, doc, 'surface-register.json', encodeRegister(state.register), 'application/json');
      announce(w.exportSuccess);
    }));
    actions.appendChild(button(doc, w.savePackage, () => {
      const value = parseReleasePackage({ inventory: state.inventory, register: state.register });
      saveFile(win, doc, 'publication-package.json', encodeReleasePackage(value), 'application/json');
      announce(w.exportSuccess);
    }));
    io.appendChild(actions);
    main.appendChild(io);
    main.appendChild(summary(doc, w, state.register));
    const toolbar = node(doc, 'div', { className: 'disclosure-actions' });
    toolbar.appendChild(button(doc, w.add, () => openEditor(null)));
    toolbar.appendChild(button(doc, w.audit, () => {
      if (!state.inventoryLoaded) { announce(w.missingInventory); return; }
      state.report = auditDisclosures({ inventory: state.inventory, register: state.register });
      rerender();
      doc.getElementById('disclosure-audit')?.focus?.();
    }));
    if (state.report) toolbar.appendChild(button(doc, w.saveReport, () => {
      saveFile(win, doc, 'publication-audit.txt', disclosureReportText(state.report), 'text/plain');
      announce(w.exportSuccess);
    }));
    main.appendChild(toolbar);
    if (state.editor !== undefined && state.editor !== null) {
      main.appendChild(editor(doc, w, state.editor === 'new' ? null : state.editor,
        (value) => {
          state.register = upsertSurface(state.register, value);
          state.editor = null;
          state.report = null;
          rerender();
        }, () => { state.editor = null; rerender(); }));
    }
    main.appendChild(filteredList(doc, w, state, {
      filter(change) {
        const focusedId = doc.activeElement?.id;
        const previous = doc.activeElement;
        const position = typeof previous?.selectionStart === 'number' ? previous.selectionStart : null;
        state.filter = { ...state.filter, ...change };
        rerender();
        const next = focusedId ? doc.getElementById(focusedId) : null;
        next?.focus?.();
        if (position !== null && typeof next?.setSelectionRange === 'function') {
          next.setSelectionRange(position, position);
        }
      },
      edit(value) { openEditor(value); },
      copy(value) {
        const id = `${value.id}-copy`;
        try { state.register = copySurface(state.register, value.id, id); state.report = null; rerender(); }
        catch (cause) { announce(cause.message); }
      },
      remove(value) {
        if (!win.confirm(w.removeQuestion)) return;
        state.register = removeSurface(state.register, value.id); state.report = null; rerender();
      },
      mark(value, statusValue) {
        state.register = updateSurfaceState(state.register, value.id, statusValue);
        state.report = null;
        rerender();
      },
    }));
    if (state.report) main.appendChild(auditView(doc, w, state.report, state.locale));
    add(root, header, main);
  }
  function switchLocale(locale) { state.locale = disclosureLocale(locale); rerender(); }
  function openEditor(surface) {
    state.editor = surface ?? 'new';
    rerender();
    doc.getElementById('surface-id')?.focus?.();
  }
  rerender();
  return Object.freeze({
    setLocale: switchLocale,
    importInventory(value) {
      state.inventory = parseInventoryText(value);
      state.inventoryLoaded = true;
      state.report = null; rerender();
    },
    importRegister(value) { state.register = parseRegisterText(value); state.report = null; rerender(); },
    report() { return state.report; },
    inventory() { return state.inventory; },
    register() { return state.register; },
  });
}

if (typeof document !== 'undefined' && document.getElementById('disclosure-root')) {
  mountDisclosureRoute();
}
