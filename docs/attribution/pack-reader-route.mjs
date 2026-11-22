// @ts-check
import { MAX_MANIFEST_BYTES, TRANCHES, readPack, selectCoverage } from './pack-reader-model.mjs';
import { coverageText, issueText, sourceNotices } from './pack-reader-report.mjs';
import { exampleManifestText } from './pack-reader-example.mjs';
import {
  READER_COPY, numberLabel, sourceCountLabel, sourcesRange, unlocatedLabel,
} from './pack-reader-copy.mjs';

/** @typedef {import('./pack-reader-copy.mjs').ReaderLocale} Locale */
/** @typedef {ReturnType<typeof readPack>} Pack */
/** @typedef {ReturnType<typeof selectCoverage>} View */
/** @typedef {View['rows'][number]} Source */
/** @typedef {keyof typeof READER_COPY.en.messages | 'filtered' | 'page'} Status */
/** @typedef {keyof typeof READER_COPY.en.errors} ReaderError */

const PAGE_SIZE = 12;

/** @param {unknown} thrown @returns {ReaderError} */
function modelError(thrown) {
  const code = typeof thrown === 'object' && thrown !== null && 'code' in thrown ? thrown.code : null;
  switch (code) {
    case 'limit':
    case 'json':
    case 'format':
    case 'version':
      return code;
    default:
      return 'read';
  }
}

/**
 * Open one reader inside its own document. All file and filter state belongs
 * to that document, including pending reads that may complete out of order.
 * @param {Document} document
 */
export function mountReader(document) {
  const window = document.defaultView;
  if (!window) throw new Error('The map pack reader needs a document with a window.');

  /** @param {string} id */
  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing map pack reader element: ${id}`);
    return node;
  }

  /** @template {keyof HTMLElementTagNameMap} K @param {string} id @param {K} tag */
  function control(id, tag) {
    const node = document.querySelector(`${tag}#${id}`);
    if (!node) throw new Error(`Missing map pack reader control: ${id}`);
    return /** @type {HTMLElementTagNameMap[K]} */ (node);
  }

  /** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} text */
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  /** @param {string} id @param {string} text */
  function label(id, text) {
    byId(id).textContent = text;
  }

  /** @param {string} value @param {string} text */
  function option(value, text) {
    const node = element('option', text);
    node.value = value;
    return node;
  }

  /** @param {string} term @param {string} value */
  function field(term, value) {
    const pair = document.createElement('div');
    pair.append(element('dt', term), element('dd', value));
    return pair;
  }

  const picker = control('pack-file', 'input');
  const regions = control('pack-region', 'select');
  const layers = control('pack-tranche', 'select');
  const clear = control('pack-clear', 'button');
  const example = control('pack-example', 'button');
  const switchLanguage = control('pack-language', 'button');
  const save = control('pack-export', 'button');
  const previous = control('pack-prev', 'button');
  const next = control('pack-next', 'button');
  const back = control('pack-back', 'a');
  const statusNode = byId('pack-status');
  const errorNode = byId('pack-error');

  /** @type {Locale} */
  let locale = new URLSearchParams(window.location.search).get('lang') === 'fr' ? 'fr' : 'en';
  /** @type {Pack | null} */
  let pack = null;
  /** @type {View | null} */
  let view = null;
  /** @type {keyof typeof READER_COPY.en.layers | ''} */
  let layer = '';
  let region = '';
  let page = 0;
  let readSequence = 0;
  let sample = false;
  /** @type {Status} */
  let status = 'empty';
  /** @type {ReaderError | null} */
  let error = null;

  function localize() {
    const copy = READER_COPY[locale];
    document.documentElement.lang = locale;
    document.title = `${copy.title} — ${copy.app}`;
    back.href = `index.html?lang=${locale}`;
    back.textContent = copy.back;
    switchLanguage.lang = locale === 'en' ? 'fr' : 'en';
    switchLanguage.textContent = copy.switchTo;
    label('pack-skip', copy.skip);
    label('pack-title', copy.title);
    label('pack-intro', copy.intro);
    label('pack-open-heading', copy.open);
    label('pack-file-hint', copy.hint);
    label('pack-file-label', copy.file);
    example.textContent = copy.example;
    clear.textContent = copy.clear;
    label('pack-scope-heading', copy.scope);
    label('pack-region-label', copy.region);
    label('pack-tranche-label', copy.layer);
    label('pack-totals-heading', copy.totals);
    label('pack-count-hint', copy.countHint);
    label('pack-issues-heading', copy.notes);
    label('pack-sources-heading', copy.sources);
    label('pack-source-help', copy.sourceHint);
    save.textContent = copy.download;
    byId('pack-pager').setAttribute('aria-label', copy.pageLabel);
    previous.textContent = copy.previous;
    next.textContent = copy.next;
  }

  function messages() {
    const copy = READER_COPY[locale];
    const total = view?.rows.length ?? 0;
    if (status === 'filtered') {
      statusNode.textContent = sourceCountLabel(locale, total);
    } else if (status === 'page') {
      statusNode.textContent = sourcesRange(locale, page * PAGE_SIZE + 1, Math.min((page + 1) * PAGE_SIZE, total), total);
    } else if (status === 'sample' || status === 'loaded') {
      statusNode.textContent = `${copy.messages[status]} ${sourceCountLabel(locale, total)}`;
    } else {
      statusNode.textContent = copy.messages[status];
    }
    errorNode.textContent = error ? copy.errors[error] : '';
    if (error && error !== 'download') {
      picker.setAttribute('aria-invalid', 'true');
      picker.setAttribute('aria-describedby', 'pack-file-hint pack-error');
    } else {
      picker.removeAttribute('aria-invalid');
      picker.setAttribute('aria-describedby', 'pack-file-hint');
    }
    clear.hidden = pack === null && status !== 'loading' && error === null;
  }

  function filterOptions() {
    if (!pack) return;
    const copy = READER_COPY[locale];
    regions.replaceChildren(option('', copy.allRegions));
    for (const entry of pack.regions) {
      regions.append(option(entry.id, entry.label[locale]));
    }
    regions.value = region;
    layers.replaceChildren(option('', copy.allLayers));
    for (const key of TRANCHES) {
      layers.append(option(key, copy.layers[key]));
    }
    layers.value = layer;
  }

  /** @param {Source} row */
  function sourceCard(row) {
    const copy = READER_COPY[locale];
    const card = document.createElement('article');
    card.className = 'source-record';
    card.append(element('h3', row.source === 'UNKNOWN' && row.sourceId !== 'UNKNOWN'
      ? `${row.sourceId} · UNKNOWN` : row.source));
    const fields = document.createElement('dl');
    fields.className = 'record-fields';
    fields.append(
      field(copy.id, row.sourceId),
      field(copy.licence, row.licence),
      field(copy.retrieved, row.retrievedOn),
      field(copy.tier, row.tier),
      field(copy.partCount, numberLabel(locale, row.partCount)),
      field(copy.recordCount, numberLabel(locale, row.recordCount)),
      field(copy.withheldCount, numberLabel(locale, row.withheldCount)),
    );
    card.append(fields);
    const notices = sourceNotices(row, locale);
    if (notices.length) {
      const list = document.createElement('ul');
      for (const notice of notices) {
        const li = document.createElement('li');
        if (notice.lang !== 'und') li.lang = notice.lang;
        if (notice.href) {
          const link = element('a', notice.text);
          link.href = notice.href;
          li.append(link);
        } else {
          li.textContent = notice.text;
        }
        list.append(li);
      }
      card.append(element('h4', copy.notices), list);
    }
    if (row.issues.length) {
      const list = document.createElement('ul');
      for (const code of row.issues) list.append(element('li', issueText(code, locale)));
      card.append(element('h4', copy.sourceNotes), list);
    }
    return card;
  }

  function results() {
    if (!view) {
      byId('pack-results').hidden = true;
      byId('pack-sources').replaceChildren();
      byId('pack-totals').replaceChildren();
      byId('pack-issue-list').replaceChildren();
      regions.replaceChildren();
      layers.replaceChildren();
      return;
    }
    const copy = READER_COPY[locale];
    byId('pack-results').hidden = false;
    label('pack-origin', sample ? copy.exampleOrigin : copy.localOrigin);
    const total = view.rows.length;
    byId('pack-totals').replaceChildren(
      field(copy.sources, numberLabel(locale, total)),
      field(copy.partCount, numberLabel(locale, view.partCount)),
      field(copy.recordCount, numberLabel(locale, view.recordCount)),
      field(copy.withheldCount, numberLabel(locale, view.withheldCount)),
    );
    const unlocated = byId('pack-unlocated');
    unlocated.hidden = view.unlocatedCount === 0;
    unlocated.textContent = unlocated.hidden ? '' : unlocatedLabel(locale, view.unlocatedCount);
    byId('pack-issues').hidden = view.issues.length === 0;
    byId('pack-issue-list').replaceChildren(...view.issues.map(code => element('li', issueText(code, locale))));

    const offset = page * PAGE_SIZE;
    const visible = view.rows.slice(offset, offset + PAGE_SIZE);
    const range = byId('pack-range');
    range.hidden = total > 0 && total <= PAGE_SIZE;
    range.textContent = total ? sourcesRange(locale, offset + 1, offset + visible.length, total) : copy.noSources;
    byId('pack-sources').replaceChildren(...visible.map(sourceCard));
    byId('pack-pager').hidden = total <= PAGE_SIZE;
    previous.disabled = page === 0;
    next.disabled = offset + PAGE_SIZE >= total;
  }

  function resetData() {
    pack = null;
    view = null;
    page = 0;
    region = '';
    layer = '';
    sample = false;
    error = null;
  }

  /** @param {string} text @param {boolean} isExample */
  function openText(text, isExample) {
    try {
      const parsed = readPack(text);
      const selected = selectCoverage(parsed, '', '');
      pack = parsed;
      view = selected;
      sample = isExample;
      status = sample ? 'sample' : 'loaded';
      filterOptions();
    } catch (thrown) {
      status = 'empty';
      error = modelError(thrown);
    }
    results();
    messages();
  }

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    const operation = ++readSequence;
    resetData();
    // The retained File can still be read after clearing the native control.
    // Resetting its value allows the same file to trigger a later change event.
    picker.value = '';
    status = 'loading';
    results();
    messages();
    if (file.size > MAX_MANIFEST_BYTES) {
      status = 'empty';
      error = 'limit';
      messages();
      return;
    }
    let bytes;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      if (operation !== readSequence) return;
      status = 'empty';
      error = 'read';
      messages();
      return;
    }
    if (operation !== readSequence) return;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      status = 'empty';
      error = 'encoding';
      messages();
      return;
    }
    openText(text, false);
  });

  example.addEventListener('click', () => {
    readSequence++;
    resetData();
    picker.value = '';
    openText(exampleManifestText(), true);
  });

  clear.addEventListener('click', () => {
    readSequence++;
    resetData();
    picker.value = '';
    status = 'cleared';
    results();
    messages();
    picker.focus();
  });

  function changeFilters() {
    if (!pack) return;
    region = regions.value;
    layer = TRANCHES.find(key => key === layers.value) ?? '';
    view = selectCoverage(pack, region, layer);
    page = 0;
    status = 'filtered';
    error = null;
    results();
    messages();
  }
  regions.addEventListener('change', changeFilters);
  layers.addEventListener('change', changeFilters);

  /** @param {number} number */
  function changePage(number) {
    if (!view || number < 0 || number * PAGE_SIZE >= view.rows.length) return;
    page = number;
    status = 'page';
    results();
    messages();
    // The pager follows the cards. Start reading at the newly displayed page.
    byId('pack-sources-heading').focus();
  }
  previous.addEventListener('click', () => changePage(page - 1));
  next.addEventListener('click', () => changePage(page + 1));

  switchLanguage.addEventListener('click', () => {
    locale = locale === 'en' ? 'fr' : 'en';
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', locale);
      window.history.replaceState(null, '', url);
    } catch {
      // Some embedded and file viewers cannot update their address.
    }
    localize();
    filterOptions();
    results();
    messages();
  });

  save.addEventListener('click', () => {
    if (!view) return;
    const copy = READER_COPY[locale];
    const regionLabel = regions.selectedOptions.item(0)?.textContent ?? copy.allRegions;
    const layerLabel = layer ? copy.layers[layer] : copy.allLayers;
    const report = coverageText(view, locale, regionLabel, layerLabel);
    const contents = sample ? `${copy.exampleOrigin}\n\n${report}` : report;
    let url;
    const link = document.createElement('a');
    try {
      url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
      link.href = url;
      link.download = `map-pack-sources-${locale}.txt`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      status = 'saved';
      error = null;
    } catch {
      status = 'empty';
      error = 'download';
    } finally {
      link.remove();
      // Allow the browser to claim the URL before releasing its backing bytes.
      if (url) window.setTimeout(URL.revokeObjectURL, 0, url);
    }
    messages();
  });

  localize();
  switchLanguage.hidden = false;
  byId('pack-open').hidden = false;
}

if (typeof document !== 'undefined') mountReader(document);
