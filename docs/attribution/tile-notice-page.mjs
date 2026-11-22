// @ts-check

import { openTileArchive } from './tile-notice-archive.mjs';
import { tileLabel } from './tile-notice-labels.mjs';
import { latitudeLimit, tileAt, tileBounds, tileCenter, neighbor } from './tile-notice-position.mjs';
import { tileReport } from './tile-notice-report.mjs';
import { joinTileSources, parseTileSources, readSourceRegistry } from './tile-notice-sources.mjs';

/** @typedef {Awaited<ReturnType<typeof openTileArchive>>} Archive */
/** @typedef {Awaited<ReturnType<typeof readSourceRegistry>>} Registry */
/** @typedef {ReturnType<typeof tileAt>} Position */
/** @typedef {ReturnType<typeof parseTileSources>} Tile */
/** @typedef {ReturnType<typeof joinTileSources>} Groups */
/** @typedef {'en'|'fr'} Locale */
/** @typedef {'archive'|'registry'} Slot */
/** @typedef {{key:string,args:(string|number)[]}} Message */
/** @typedef {{name:string,controller:AbortController}} Opening */
/** @typedef {{name:string,reason:string,row:number|null}} FileError */
/** @typedef {{name:string|null,pending:Opening|null,error:FileError|null}} SlotState */
/** @typedef {{position:Position,tile:Tile|null,rows:Groups}} Result */

/** @template {keyof HTMLElementTagNameMap} K @param {string} id @param {K} tag */
function element(id, tag) {
  const found = document.getElementById(id);
  if (!found || found.localName !== tag) throw new Error(id);
  return /** @type {HTMLElementTagNameMap[K]} */ (found);
}

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] */
function make(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

const locationURL = new URL(location.href);
const requested = locationURL.searchParams.get('lang');
/** @type {Locale} */
let locale = requested === 'fr' || requested === 'en' ? requested
  : navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
/** @type {Archive|null} */
let archive = null;
/** @type {Registry|null} */
let registry = null;
/** @type {Result|null} */
let result = null;
/** @type {Record<Slot,SlotState>} */
const files = {
  archive: { name: null, pending: null, error: null },
  registry: { name: null, pending: null, error: null },
};
/** @type {{controller:AbortController,position:Position}|null} */
let active = null;
/** @type {Message|null} */
let lookupError = null;
/** @type {string|null} */
let exportFeedback = null;
let groupPage = 0;
const pageSize = 12;
const directions = /** @type {const} */ (['north', 'south', 'west', 'east']);
const lookupForm = element('lookup-form', 'form');
const mode = element('mode', 'select');
const zoom = element('zoom', 'input');
const column = element('x', 'input');
const row = element('y', 'input');
const lon = element('longitude', 'input');
const lat = element('latitude', 'input');
const groups = element('groups', 'div');
const positionHeading = element('position', 'h2');

/** @param {string} key @param {...(string|number)} args */
function label(key, ...args) { return tileLabel(key, locale, ...args); }

/** @param {Element} node @param {string} text */
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** @param {Position} position */
function address({ z, x, y }) { return [z, x, y].join('/'); }

/** @param {string} text */
function literal(text) { return make('bdi', text); }

/** @param {HTMLDListElement} list @param {string} key @param {string|HTMLElement} value */
function addAttribute(list, key, value) {
  const item = make('div');
  const dd = make('dd');
  dd.append(typeof value === 'string' ? literal(value) : value);
  item.append(make('dt', label(key)), dd);
  list.append(item);
}

/** @param {readonly number[]} bounds */
function boundsLabel(bounds) {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 8, useGrouping: false });
  return label('bounds', ...bounds.map(n => formatter.format(n)));
}

/** @param {unknown} error */
function errorKey(error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'format': case 'metadata': case 'directory': case 'compression': case 'coordinate':
    case 'read': case 'cancelled': case 'limit':
      return code;
    case 'bounds': return 'boundsError';
    case 'tile-format': return 'tileFormat';
    case 'registry-format': return 'registryFormat';
    case 'registry-duplicate': return 'duplicate';
    case 'registry-limit': case 'tile-limit': return 'limit';
    default: return 'read';
  }
}

/** @param {Slot} side */
function fileState(side) {
  const state = files[side];
  const status = [];
  if (state.pending) status.push(label('pendingFile', state.pending.name));
  if (state.name !== null) {
    status.push(label(state.pending || state.error ? 'readingOld' : 'loadedFile', state.name));
    if (side === 'registry' && registry) status.push(label('registryCount', registry.size));
  } else if (!state.pending) status.push(label(side === 'archive' ? 'archiveEmpty' : 'registryEmpty'));
  setText(element(side + '-status', 'p'), status.join(' '));
  const failure = [];
  if (state.error) {
    failure.push(label('failedFile', state.error.name), label(state.error.reason));
    if (state.error.row !== null) failure.push(label('item', state.error.row));
  }
  setText(element(side + '-error', 'p'), failure.join(' '));
  const input = element(side + '-file', 'input');
  if (state.error) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-errormessage', side + '-error');
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-errormessage');
  }
  element(side + '-clear', 'button').disabled = !state.pending && !state.error && state.name === null;
}

function showArchive() {
  element('opened', 'div').hidden = archive === null;
  const list = element('archive-info', 'dl');
  list.replaceChildren();
  setText(element('archive-credit', 'p'), archive?.metadata.attribution ?? '');
  if (!archive) return;
  const { header, metadata } = archive;
  addAttribute(list, 'archiveName', metadata.name);
  addAttribute(list, 'archiveDescription', metadata.description);
  addAttribute(list, 'zoomRange', header.minZoom + '–' + header.maxZoom);
  addAttribute(list, 'archiveArea', boundsLabel(header.bounds));
  addAttribute(list, 'reportedCount', header.addressedTiles === 0 ? 'UNKNOWN' : String(header.addressedTiles));
}

class CoordinateError extends Error {
  /** @param {HTMLInputElement} field @param {string} key @param {...number} args */
  constructor(field, key, ...args) {
    super(key);
    this.field = field;
    this.info = { key, args };
  }
}

/** @param {HTMLInputElement} input @param {number} min @param {number} max */
function integer(input, min, max) {
  const value = input.valueAsNumber;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    if (input === zoom) throw new CoordinateError(input, 'invalidZoom', min, max);
    throw new CoordinateError(input, 'invalidAxis', max);
  }
  return value;
}

/** @param {HTMLInputElement} input @param {number} max @param {string} reason */
function decimal(input, max, reason) {
  const text = input.value.trim().replace(/^−/u, '-');
  const normalized = text.replace(',', '.');
  const value = Number(normalized);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(normalized) || !Number.isFinite(value) || Math.abs(value) > max) {
    throw new CoordinateError(input, reason);
  }
  return value;
}

/** @param {string} [method] @returns {Position} */
function formPosition(method = mode.value) {
  if (!archive) throw new Error('archive');
  const z = integer(zoom, archive.header.minZoom, archive.header.maxZoom);
  if (method === 'point') {
    return tileAt(decimal(lon, 180, 'invalidLon'), decimal(lat, latitudeLimit, 'invalidLat'), z);
  }
  const max = 2 ** z - 1;
  return { z, x: integer(column, 0, max), y: integer(row, 0, max) };
}

/** @param {Position} position */
function formMatches(position) {
  try { return address(formPosition()) === address(position); }
  catch { return false; }
}

/** @param {Position} position */
function showAddress(position) {
  zoom.value = String(position.z);
  column.value = String(position.x);
  row.value = String(position.y);
}

/** @param {Position} position */
function showCoordinates(position) {
  const point = tileCenter(position.z, position.x, position.y);
  // Fixed precision here keeps very small center coordinates usable in the
  // decimal text fields, including the tiles adjacent to the prime meridian.
  lon.value = String(Number(point.lon.toFixed(12)));
  lat.value = String(Number(point.lat.toFixed(12)));
  if (/[eE]/u.test(lon.value)) lon.value = point.lon.toFixed(12);
  if (/[eE]/u.test(lat.value)) lat.value = point.lat.toFixed(12);
}

function modeVisibility() {
  element('address-fields', 'div').hidden = mode.value !== 'tile';
  element('point-fields', 'div').hidden = mode.value !== 'point';
}

function clearInvalid() {
  lookupError = null;
  for (const field of [zoom, column, row, lat, lon]) {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-errormessage');
  }
}

function actions() {
  const reading = Boolean(files.archive.pending || files.registry.pending);
  const dirty = result !== null && !formMatches(result.position);
  element('lookup', 'button').disabled = !archive || Boolean(files.archive.pending);
  for (const direction of directions) {
    const pos = result?.position;
    element(direction, 'button').disabled = !pos || reading || Boolean(active) || dirty ||
      !neighbor(pos.z, pos.x, pos.y, direction);
  }
  element('download', 'button').disabled = !result || reading || Boolean(active) || dirty || Boolean(lookupError);
  const status = active ? label('readingTile', address(active.position))
    : dirty ? label('edited') : result ? label('loadedTile', address(result.position)) : '';
  setText(element('tile-status', 'p'), status);
  setText(element('lookup-error', 'p'), lookupError ? label(lookupError.key, ...lookupError.args) : '');
  setText(element('export-status', 'p'), exportFeedback ? label(exportFeedback) : '');
}

/** @param {Groups[number]} group */
function sourceGroup(group) {
  const item = make('li');
  const heading = make('h4');
  heading.append(literal(group.sourceId));
  item.append(heading);
  if (group.match !== 'matched') item.append(make('p', label(group.match)));
  const attributes = make('dl');
  attributes.className = 'attributes';
  addAttribute(attributes, 'layer', group.layer);
  addAttribute(attributes, 'sourceId', group.sourceId);
  addAttribute(attributes, 'features', String(group.count));
  addAttribute(attributes, 'sourceName', group.name);
  addAttribute(attributes, 'licence', group.licence);
  addAttribute(attributes, 'retrieved', group.retrievedOn);
  addAttribute(attributes, 'tier', String(group.tier));
  const credit = literal(group.attribution);
  credit.className = 'credit';
  addAttribute(attributes, 'groupCredit', credit);
  item.append(attributes);
  return item;
}

/** @param {boolean} [focus] */
function renderPage(focus = false) {
  const rows = result?.rows ?? [];
  const pages = Math.ceil(rows.length / pageSize);
  groupPage = Math.max(0, Math.min(groupPage, pages - 1));
  const start = groupPage * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  groups.replaceChildren();
  if (rows.length) {
    const list = make('ul');
    list.className = 'source-list';
    list.setAttribute('role', 'list');
    list.append(...rows.slice(start, end).map(sourceGroup));
    groups.append(list);
  }
  const indicator = element('page-position', 'p');
  indicator.textContent = rows.length ? label('page', start + 1, end, rows.length) : '';
  element('source-help', 'p').textContent = label(rows.length ? 'groupHelp' : 'noGroups');
  element('pager', 'div').hidden = pages < 2;
  element('previous-page', 'button').disabled = groupPage === 0;
  element('next-page', 'button').disabled = groupPage + 1 >= pages;
  if (focus && rows.length) indicator.focus();
}

function showResult() {
  element('result', 'section').hidden = !result;
  const area = element('extent', 'dl');
  area.replaceChildren();
  setText(positionHeading, result ? label('tileTitle', address(result.position)) : '');
  if (result) {
    const { position, tile, rows } = result;
    const summary = tile === null ? label('absent') : tile.featureCount === 0 ? label('presentEmpty')
      : label('counts', tile.featureCount, rows.length);
    setText(element('summary', 'p'), summary);
    addAttribute(area, 'tileArea', boundsLabel(tileBounds(position.z, position.x, position.y)));
    if (tile) {
      const names = make('span');
      if (!tile.layers.length) names.textContent = label('noLayers');
      for (const [index, name] of tile.layers.entries()) {
        if (index) names.append(', ');
        names.append(literal(name));
      }
      addAttribute(area, 'tileLayers', names);
    }
  } else setText(element('summary', 'p'), '');
  renderPage();
  actions();
}

function cancelLookup() {
  active?.controller.abort();
  active = null;
}

/** @param {Position} position @param {boolean} focus */
async function lookup(position, focus) {
  if (!archive) return;
  cancelLookup();
  const controller = new AbortController();
  active = { controller, position };
  clearInvalid();
  exportFeedback = null;
  actions();
  try {
    const bytes = await archive.readTile(position.z, position.x, position.y, controller.signal);
    if (active?.controller !== controller) return;
    const tile = bytes === null ? null : parseTileSources(bytes);
    const rows = tile === null ? [] : joinTileSources(tile, registry);
    result = { position, tile, rows };
    active = null;
    groupPage = 0;
    showResult();
    if (focus && formMatches(position)) positionHeading.focus();
  } catch (error) {
    if (active?.controller !== controller) return;
    active = null;
    lookupError = { key: errorKey(error), args: [] };
    actions();
  }
}

/** @param {Archive} next */
function initializeArchive(next) {
  cancelLookup();
  archive = next;
  result = null;
  groupPage = 0;
  exportFeedback = null;
  clearInvalid();
  showArchive();
  mode.value = 'tile';
  modeVisibility();
  zoom.min = String(next.header.minZoom);
  zoom.max = String(next.header.maxZoom);
  const [longitude, latitude, level] = next.header.center;
  const z = Math.min(next.header.maxZoom, Math.max(next.header.minZoom, level));
  const cursor = tileAt(longitude, Math.min(latitudeLimit, Math.max(-latitudeLimit, latitude)), z);
  showAddress(cursor);
  showCoordinates(cursor);
  showResult();
  void lookup(cursor, false);
}

function updateRegistry() {
  exportFeedback = null;
  if (result?.tile) result.rows = joinTileSources(result.tile, registry);
  showResult();
}

/**
 * Commit a replacement only when its read succeeds and it still owns the slot.
 * A stale read or a rejected replacement leaves the accepted data intact.
 * @template T
 * @param {Slot} side
 * @param {File} file
 * @param {(file:Blob,signal:AbortSignal)=>Promise<T>} reader
 * @param {(next:T)=>void} accept
 */
async function openFile(side, file, reader, accept) {
  const state = files[side];
  state.pending?.controller.abort();
  const controller = new AbortController();
  state.pending = { controller, name: file.name };
  state.error = null;
  fileState(side);
  actions();
  let next;
  try {
    next = await reader(file, controller.signal);
  } catch (error) {
    if (state.pending?.controller !== controller) return;
    const errorRow = error && typeof error === 'object' && 'row' in error && typeof error.row === 'number' ? error.row : null;
    state.pending = null;
    state.error = { name: file.name, row: errorRow, reason: errorKey(error) };
    element(side + '-file', 'input').value = '';
    fileState(side);
    actions();
    return;
  }
  if (state.pending?.controller !== controller) return;
  state.pending = null;
  state.name = file.name;
  accept(next);
  fileState(side);
  actions();
}

/** @param {Slot} side */
function clearFile(side) {
  const state = files[side];
  state.pending?.controller.abort();
  state.pending = null;
  state.name = null;
  state.error = null;
  const input = element(side + '-file', 'input');
  input.value = '';
  if (side === 'archive') {
    cancelLookup();
    archive = null;
    result = null;
    groupPage = 0;
    exportFeedback = null;
    clearInvalid();
    lookupForm.reset();
    showArchive();
    showResult();
  } else {
    registry = null;
    updateRegistry();
  }
  fileState(side);
  input.focus();
}

for (const side of /** @type {const} */ (['archive', 'registry'])) {
  const input = element(side + '-file', 'input');
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (side === 'archive') void openFile(side, file, openTileArchive, initializeArchive);
    else void openFile(side, file, readSourceRegistry, next => {
      registry = next;
      updateRegistry();
    });
  });
  element(side + '-clear', 'button').addEventListener('click', () => clearFile(side));
}

mode.addEventListener('change', () => {
  try {
    const current = formPosition(mode.value === 'point' ? 'tile' : 'point');
    if (mode.value === 'point') showCoordinates(current);
    else showAddress(current);
  } catch {
    // Keep the last values in the destination fields if an unfinished
    // edit in the previous mode could not be converted.
  }
  modeVisibility();
  clearInvalid();
  actions();
});

lookupForm.addEventListener('input', () => {
  clearInvalid();
  exportFeedback = null;
  actions();
});

lookupForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!archive || files.archive.pending) return;
  clearInvalid();
  try {
    const position = formPosition();
    if (mode.value === 'point') showAddress(position);
    else showCoordinates(position);
    void lookup(position, true);
  } catch (error) {
    if (!(error instanceof CoordinateError)) throw error;
    lookupError = error.info;
    error.field.setAttribute('aria-invalid', 'true');
    error.field.setAttribute('aria-errormessage', 'lookup-error');
    actions();
    error.field.focus();
  }
});

for (const direction of directions) {
  element(direction, 'button').addEventListener('click', () => {
    if (!result) return;
    const p = result.position;
    const next = neighbor(p.z, p.x, p.y, direction);
    if (next) {
      showAddress(next);
      showCoordinates(next);
      void lookup(next, true);
    }
  });
}
element('previous-page', 'button').addEventListener('click', () => { groupPage--; renderPage(true); });
element('next-page', 'button').addEventListener('click', () => { groupPage++; renderPage(true); });

element('download', 'button').addEventListener('click', () => {
  if (!archive || !result) return;
  try {
    const blob = tileReport({
      archive,
      position: result.position,
      tile: result.tile,
      rows: result.rows,
      hasRegistry: registry !== null,
    }, locale);
    const url = URL.createObjectURL(blob);
    const link = make('a');
    link.href = url;
    link.download = 'tile-sources-' + address(result.position).replaceAll('/', '-') + '-' + locale + '.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportFeedback = 'saved';
  } catch { exportFeedback = 'exportError'; }
  actions();
});

function applyLocale() {
  document.documentElement.lang = locale;
  document.title = label('title');
  for (const node of document.querySelectorAll('[data-label]')) {
    const key = node.getAttribute('data-label');
    if (key) node.textContent = label(key);
  }
  const language = element('language', 'button');
  const other = locale === 'fr' ? 'en' : 'fr';
  language.textContent = tileLabel('language', other);
  language.lang = other;
  fileState('archive');
  fileState('registry');
  showArchive();
  showResult();
}
element('language', 'button').addEventListener('click', () => {
  locale = locale === 'fr' ? 'en' : 'fr';
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  if (url.protocol === 'https:' || url.protocol === 'http:') history.replaceState(null, '', url);
  applyLocale();
});

applyLocale();
element('fallback', 'div').hidden = true;
element('workspace', 'div').hidden = false;
element('language', 'button').hidden = false;
