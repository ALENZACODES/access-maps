// @ts-check

import { FieldInputError, readFieldSnapshot } from './field-review-input.mjs';
import { KINDS, compareSnapshots, pageRows, selectRows } from './field-review-compare.mjs';
import { dimensionLabel, kindLabel, reviewLabel } from './field-review-labels.mjs';
import { fieldReport } from './field-review-report.mjs';

/** @typedef {import('./field-review-compare.mjs').Comparison} Comparison */
/** @typedef {import('./field-review-compare.mjs').ReviewFilters} ReviewFilters */
/** @typedef {import('./field-review-compare.mjs').ReviewRow} ReviewRow */
/** @typedef {import('./field-review-compare.mjs').Selection} Selection */
/** @typedef {import('./field-review-input.mjs').FieldRecord} FieldRecord */
/** @typedef {import('./field-review-input.mjs').FieldEvidence} FieldEvidence */
/** @typedef {import('./field-review-input.mjs').InputCode} InputCode */
/** @typedef {import('./field-review-labels.mjs').Locale} Locale */
/** @typedef {import('./field-review-labels.mjs').LabelKey} LabelKey */
/** @typedef {'before'|'after'} Side */
/** @typedef {{name:string, records:FieldRecord[]}} Loaded */
/** @typedef {{name:string, code:InputCode, row:number|null}} ReadError */
/** @typedef {{loaded:Loaded|null, pending:{controller:AbortController,name:string}|null, error:ReadError|null}} SlotState */

const pageSize = 12;
const sides = /** @type {const} */ (['before', 'after']);
/** @type {Record<Side,SlotState>} */
const slots = {
  before: { loaded: null, pending: null, error: null },
  after: { loaded: null, pending: null, error: null },
};

/** @template {keyof HTMLElementTagNameMap} T @param {string} id @param {T} tag */
function element(id, tag) {
  const result = document.getElementById(id);
  if (!result || result.localName !== tag) throw new Error(id);
  return /** @type {HTMLElementTagNameMap[T]} */ (result);
}

/** @template {keyof HTMLElementTagNameMap} T @param {T} tag @param {string} [text] */
function make(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

const languageButton = element('language', 'button');
const kindInput = element('kind', 'select');
const trancheInput = element('tranche', 'select');
const sourceInput = element('source', 'input');
const fieldInput = element('field', 'input');
const sideInput = element('side', 'select');
const queryInput = element('query', 'input');
const download = element('download', 'button');
const rowsNode = element('rows', 'div');
const position = element('page-position', 'h3');

const requested = new URLSearchParams(location.search).get('lang');
/** @type {Locale} */
let locale = requested === 'en' || requested === 'fr' ? requested
  : navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
/** @type {Comparison|null} */
let comparison = null;
/** @type {Selection|null} */
let selection = null;
/** @type {ReviewFilters} */
let applied = {};
/** @type {LabelKey|null} */
let exportMessage = null;
let page = 1;

/** @param {LabelKey} key @param {...(string|number)} values */
function label(key, ...values) {
  return reviewLabel(key, locale, ...values);
}

/** @param {string} value */
function layerLabel(value) {
  if (value === 'venue' || value === 'washroom' || value === 'path' || value === 'transit') {
    return label(value);
  }
  return value;
}

/** @param {string} value @param {string} text */
function option(value, text) {
  const node = make('option', text);
  node.value = value;
  return node;
}

/** @param {Side} side */
function updateSlot(side) {
  const { loaded, pending, error } = slots[side];
  const control = element(side + '-file', 'input');
  const status = element(side + '-status', 'p');
  const alert = element(side + '-error', 'p');
  if (pending) {
    status.textContent = loaded
      ? label('readWithOriginal', pending.name, loaded.name)
      : label('reading', pending.name);
  } else {
    status.textContent = loaded ? label('loaded', loaded.name, loaded.records.length) : label('noneLoaded');
  }
  if (error) {
    const keys = /** @type {const} */ ({
      format: 'errFormat', record: 'errRecord', field: 'errField', duplicate: 'errDuplicate',
      limit: 'errLimit', encoding: 'errEncoding', compression: 'errCompression', read: 'errRead',
    });
    const message = [label('errorPrefix', error.name), label(keys[error.code])];
    if (error.row !== null) message.push(label('inputRow', error.row));
    if (loaded) message.push(label('previousKept'));
    alert.textContent = message.join(' ');
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', 'file-help ' + status.id + ' ' + alert.id);
  } else {
    alert.textContent = '';
    control.removeAttribute('aria-invalid');
    control.setAttribute('aria-describedby', 'file-help ' + status.id);
  }
  element(side + '-clear', 'button').disabled = !loaded && !pending && !error;
}

function requiredFiles() {
  const needed = element('needed', 'p');
  const before = Boolean(slots.before.loaded);
  const after = Boolean(slots.after.loaded);
  needed.hidden = before && after;
  needed.textContent = before && after ? '' : label(before ? 'needAfter' : after ? 'needBefore' : 'bothNeeded');
}

/** @param {string} id @param {string[]} values */
function hints(id, values) {
  // Keep native suggestions small. The input still accepts any exact name.
  const list = element(id, 'datalist');
  const suggestions = [];
  for (const value of values) {
    if (value.length <= 256) suggestions.push(option(value, value));
    if (suggestions.length === 96) break;
  }
  list.replaceChildren(...suggestions);
}

function refreshOptions() {
  const kind = kindInput.value || 'changes';
  const tranche = trancheInput.value;
  kindInput.replaceChildren(
    option('changes', label('changes')),
    option('all', label('all')),
    ...KINDS.map(key => option(key, kindLabel(key, locale))),
  );
  kindInput.value = kind;
  const layers = comparison?.facets.tranches ?? [];
  trancheInput.replaceChildren(option('', label('allTranches')), ...layers.map(key => option(key, layerLabel(key))));
  trancheInput.value = layers.includes(tranche) ? tranche : '';
}

/** @returns {ReviewFilters} */
function draftFilters() {
  const kind = kindInput.value;
  return {
    changesOnly: kind === 'changes',
    kind: kind === 'changes' || kind === 'all' ? '' : kind,
    recordSide: sideInput.value,
    tranche: trancheInput.value,
    field: fieldInput.value,
    source: sourceInput.value,
    query: queryInput.value.trim(),
  };
}

function clearFilterFields() {
  kindInput.value = 'changes';
  trancheInput.value = '';
  sideInput.value = '';
  sourceInput.value = '';
  fieldInput.value = '';
  queryInput.value = '';
}

function actions() {
  const edited = comparison !== null && JSON.stringify(draftFilters()) !== JSON.stringify(applied);
  element('pending', 'p').hidden = !edited;
  download.disabled = !comparison || edited || Boolean(slots.before.pending || slots.after.pending);
  element('notice-status', 'p').textContent = exportMessage ? label(exportMessage) : '';
}

/** @param {string} value */
function literal(value) {
  const isolated = make('bdi', value);
  isolated.lang = '';
  return isolated;
}

/** @param {HTMLDListElement} list @param {string} name @param {string|Node} value */
function pair(list, name, value) {
  const dt = make('dt', name);
  const dd = make('dd');
  dd.append(value);
  list.append(dt, dd);
}

/** @param {string} text @param {() => void} action */
function button(text, action) {
  const control = make('button', text);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}

/**
 * Mount only the visible slice of an ordered point sequence. The numerical
 * labels count pairs from the start of the reported geometry.
 * @param {number[][]} points
 * @param {number} offset
 */
function pointList(points, offset) {
  const holder = make('div');
  const caption = make('p');
  caption.tabIndex = -1;
  const controls = make('div');
  controls.className = 'actions';
  const list = make('ol');
  const size = 24;
  const previous = button(label('previousPoints'), () => move(-size));
  const next = button(label('nextPoints'), () => move(size));
  if (points.length > size) controls.append(previous, next);

  /** @param {number} delta */
  function move(delta) {
    offset += delta;
    render();
    caption.focus();
  }
  function render() {
    const end = Math.min(offset + size, points.length);
    holder.dataset.offset = String(offset);
    caption.textContent = label('pointPosition', offset + 1, end, points.length);
    previous.disabled = offset === 0;
    next.disabled = end === points.length;
    list.start = offset + 1;
    list.replaceChildren(...points.slice(offset, end).map(point => make('li', point.join(', '))));
  }
  holder.append(caption, controls, list);
  render();
  return holder;
}

/**
 * Empty text and spacing-only values are legitimate string tokens. Give them
 * readable names so the before/after panels do not announce a blank cell.
 * @param {string} text
 */
function visibleText(text) {
  if (!text.length) return label('emptyText');
  if (text.trim().length) return text;
  const quoted = JSON.stringify(text).replace(/[^\x20-\x7e]/gu,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
  return label('whitespaceText', text.length, quoted);
}

/**
 * Source strings are inserted as text. Number and string tokens keep their
 * type in the display, and an absent original token stays distinguishable
 * from the explicit null token.
 * @param {HTMLDListElement} list
 * @param {FieldEvidence} evidence
 * @param {number} offset
 */
function evidenceFields(list, evidence, offset) {
  const dim = (/** @type {import('./field-review-compare.mjs').Dimension} */ key) => dimensionLabel(key, locale);
  const { value, raw } = evidence;
  if (Array.isArray(value)) {
    const points = make('details');
    points.className = 'geometry';
    const title = make('summary', label('points', value.length));
    points.append(title);
    points.addEventListener('toggle', () => {
      if (points.open && points.children.length === 1) points.append(pointList(value, offset));
    });
    pair(list, dim('value'), points);
    pair(list, label('dataType'), label('geometry'));
  } else {
    pair(list, dim('value'), literal(typeof value === 'string' ? visibleText(value) : String(value)));
    if (value !== 'UNKNOWN') {
      pair(list, label('dataType'), label(typeof value === 'number' ? 'scalarNumber' : 'scalarText'));
    }
  }
  pair(list, dim('source'), literal(evidence.source));
  pair(list, dim('licence'), literal(evidence.licence));
  pair(list, dim('retrievedOn'), literal(evidence.retrievedOn));
  pair(list, dim('tier'), String(evidence.tier));
  pair(list, dim('sourceKey'), literal(evidence.sourceKey));
  let rawToken = 'UNKNOWN';
  if (evidence.rawPresent) {
    rawToken = raw === null ? 'null' : label('token', typeof raw === 'string' ? visibleText(raw) : String(raw), label(typeof raw === 'number' ? 'scalarNumber' : 'scalarText'));
  }
  pair(list, dim('raw'), literal(rawToken));
  pair(list, dim('derived'), evidence.derived === null ? 'UNKNOWN' : label(evidence.derived ? 'yes' : 'no'));
}

/** @typedef {{open:boolean,offset:number}} GeometryPosition */
/** @typedef {Partial<Record<Side,GeometryPosition>>} OpenSides */

/** @param {ReviewRow} row @param {Side} side @param {GeometryPosition} [saved] */
function evidencePanel(row, side, saved) {
  const panel = make('div');
  panel.className = 'evidence';
  panel.dataset.side = side;
  const heading = make('h5', label(side === 'before' ? 'beforeFile' : 'afterFile'));
  heading.className = 'details-heading';
  panel.append(heading);
  const region = side === 'before' ? row.regionBefore : row.regionAfter;
  if (region === null) {
    panel.append(make('p', label('noRecord')));
    return panel;
  }
  const list = make('dl');
  panel.append(list);
  pair(list, dimensionLabel('region', locale), literal(region));
  const evidence = row[side];
  if (evidence) {
    evidenceFields(list, evidence, saved?.offset ?? 0);
    const points = panel.querySelector('details');
    if (saved?.open && points) points.open = true;
  } else if (row.kind !== 'region') {
    panel.append(make('p', label(row.field === null ? 'noFields' : 'noField')));
  }
  return panel;
}

/** @param {ReviewRow} row @param {number} index @param {OpenSides|undefined} saved */
function rowItem(row, index, saved) {
  const li = make('li');
  li.dataset.row = String(index);
  const title = make('h4');
  const kind = kindLabel(row.kind, locale);
  if (row.field === null) title.textContent = kind;
  else title.append(literal(row.field), ' · ', kind);
  const id = make('p', label('identity', row.id));
  id.id = 'identity-' + index;
  title.id = 'row-title-' + index;
  const side = row.recordSide === 'both' ? 'both' : row.recordSide === 'before' ? 'beforeOnly' : 'afterOnly';
  const context = make('p', label('context', layerLabel(row.tranche), label(side)));
  li.append(title, id, context);
  if (row.dimensions.length) {
    li.append(make('p', label('differences', row.dimensions.map(key => dimensionLabel(key, locale)).join(', '))));
  }
  const details = make('details');
  details.className = 'row-details';
  const toggle = make('summary', label(row.kind === 'region' ? 'compareRegions' : row.kind === 'empty' ? 'compareRecords' : 'details'));
  toggle.setAttribute('aria-describedby', title.id + ' ' + id.id);
  details.append(toggle);
  // Evidence and coordinate controls are allocated on demand. Keep the
  // loaded details while the same disclosure is opened and closed.
  details.addEventListener('toggle', () => {
    if (!details.open || details.children.length !== 1) return;
    const panels = make('div');
    panels.className = 'pair';
    for (const side of sides) panels.append(evidencePanel(row, side, saved?.[side]));
    details.append(panels);
  });
  details.open = saved !== undefined;
  li.append(details);
  return li;
}

/** Save visible disclosure positions before translating the result page. */
function openRows() {
  /** @type {Map<number,OpenSides>} */
  const result = new Map();
  for (const row of rowsNode.querySelectorAll('li[data-row]')) {
    if (!row.querySelector('details.row-details[open]')) continue;
    /** @type {OpenSides} */
    const state = {};
    for (const side of sides) {
      const points = row.querySelector('div[data-side="' + side + '"] details.geometry');
      const offset = points?.querySelector('[data-offset]')?.getAttribute('data-offset');
      state[side] = { open: Boolean(points?.hasAttribute('open')), offset: Number(offset ?? 0) };
    }
    result.set(Number(row.getAttribute('data-row')), state);
  }
  return result;
}

/** @param {Map<number,OpenSides>} [saved] */
function refreshResults(saved = new Map()) {
  if (!comparison || !selection) return;
  const totals = comparison.totals;
  element('summary', 'p').textContent = label('summary', selection.totals.rows, totals.rows, selection.totals.records, totals.changed);
  const slice = pageRows(selection.rows, page, pageSize);
  page = slice.page;
  element('pagination', 'div').hidden = slice.pages < 2;
  element('previous', 'button').disabled = slice.page <= 1;
  element('next', 'button').disabled = slice.page >= slice.pages;
  if (!slice.total) {
    position.textContent = label('noRows');
    const emptyKey = totals.rows === 0 ? 'bothEmpty'
      : applied.changesOnly && !totals.changed ? 'unchangedEmpty' : 'filtersEmpty';
    rowsNode.replaceChildren(make('p', label(emptyKey)));
    return;
  }
  position.textContent = label('page', slice.page, slice.pages, slice.first, slice.last);
  const list = make('ol');
  list.className = 'review-list';
  list.start = slice.first;
  for (const [offset, item] of slice.rows.entries()) {
    const index = slice.first + offset;
    list.append(rowItem(item, index, saved.get(index)));
  }
  rowsNode.replaceChildren(list);
}

/** @param {boolean} focus */
function applyFilters(focus) {
  if (!comparison) return;
  applied = draftFilters();
  selection = selectRows(comparison, applied);
  page = 1;
  exportMessage = null;
  refreshResults();
  actions();
  if (focus) element('results-heading', 'h2').focus();
}

function filesChanged() {
  const earlier = slots.before.loaded;
  const later = slots.after.loaded;
  comparison = earlier && later ? compareSnapshots(earlier.records, later.records) : null;
  selection = null;
  exportMessage = null;
  requiredFiles();
  element('ready', 'div').hidden = !comparison;
  clearFilterFields();
  refreshOptions();
  hints('source-hints', comparison?.facets.sources ?? []);
  hints('field-hints', comparison?.facets.fields ?? []);
  if (comparison) applyFilters(false);
  else {
    rowsNode.replaceChildren();
    position.textContent = '';
    element('summary', 'p').textContent = '';
    applied = {};
    actions();
  }
}

/** @param {Side} side @param {File} file */
async function read(side, file) {
  const slot = slots[side];
  slot.pending?.controller.abort();
  const controller = new AbortController();
  slot.pending = { controller, name: file.name };
  slot.error = null;
  updateSlot(side);
  actions();
  let records;
  try {
    records = await readFieldSnapshot(file, controller.signal);
  } catch (error) {
    if (slot.pending?.controller !== controller) return;
    slot.pending = null;
    slot.error = {
      name: file.name,
      code: error instanceof FieldInputError ? error.code : 'read',
      row: error instanceof FieldInputError ? error.row : null,
    };
    element(side + '-file', 'input').value = '';
    updateSlot(side);
    actions();
    return;
  }
  if (slot.pending?.controller !== controller) return;
  slot.loaded = { name: file.name, records };
  slot.pending = null;
  updateSlot(side);
  filesChanged();
}

for (const side of sides) {
  const input = element(side + '-file', 'input');
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void read(side, file);
  });
  element(side + '-clear', 'button').addEventListener('click', () => {
    const slot = slots[side];
    slot.pending?.controller.abort();
    slot.pending = null;
    slot.loaded = null;
    slot.error = null;
    input.value = '';
    updateSlot(side);
    filesChanged();
    input.focus();
  });
}

element('filter-form', 'form').addEventListener('submit', event => {
  event.preventDefault();
  applyFilters(true);
});
element('filter-form', 'form').addEventListener('input', () => {
  exportMessage = null;
  actions();
});
element('reset', 'button').addEventListener('click', () => {
  clearFilterFields();
  applyFilters(true);
});

for (const [id, delta] of /** @type {const} */ ([['previous', -1], ['next', 1]])) {
  element(id, 'button').addEventListener('click', () => {
    page += delta;
    refreshResults();
    position.focus();
  });
}

download.addEventListener('click', () => {
  if (!comparison || download.disabled) return;
  try {
    const url = URL.createObjectURL(fieldReport(comparison, applied, locale));
    const link = make('a');
    link.download = 'field-review-' + locale + '.txt';
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportMessage = 'downloaded';
  } catch (error) {
    exportMessage = error instanceof RangeError && error.message === 'report-limit' ? 'largeReport' : 'downloadError';
  }
  actions();
});

function translate() {
  document.documentElement.lang = locale;
  document.title = label('title');
  for (const node of document.querySelectorAll('[data-copy]')) {
    const key = /** @type {LabelKey} */ (node.getAttribute('data-copy'));
    node.textContent = label(key);
  }
  const second = locale === 'fr' ? 'en' : 'fr';
  languageButton.lang = second;
  languageButton.textContent = reviewLabel('language', second);
  for (const side of sides) updateSlot(side);
  requiredFiles();
  refreshOptions();
  refreshResults(openRows());
  actions();
}

languageButton.addEventListener('click', () => {
  locale = locale === 'en' ? 'fr' : 'en';
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  history.replaceState(null, '', url);
  translate();
});

translate();
element('fallback', 'div').hidden = true;
element('workspace', 'div').hidden = false;
languageButton.hidden = false;
