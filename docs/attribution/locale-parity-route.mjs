// @ts-check
import { parseCatalog } from './locale-parity-core.mjs';
import { auditCatalog, pairCoverage } from './locale-parity-audit.mjs';
import { comparisonText, findingText, reportHtml, reportJson, reportText, reportTsv } from './locale-parity-report.mjs';
import { localizedLabel, localeFromSearch, supportedLocale } from './locale-parity-copy.mjs';

/** @typedef {ReturnType<typeof parseCatalog>} Catalog */
/** @typedef {'current' | 'previous'} FileSlot */

/** @param {unknown} error @returns {{key:string, value?:string}} */
function fileError(error) {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') {
    return { key: 'readFailed' };
  }
  if (error.code === 'JSON') return { key: 'invalidJson' };
  if (error.code === 'SCHEMA') return { key: 'unsupported' };
  if (error.code === 'LIMIT') return { key: 'tooLarge' };
  // Show the field reference without surfacing parser-generated English.
  const field = 'message' in error && typeof error.message === 'string'
    ? /^((?:entries(?:\[\d+\])?|root|label|catalogId)(?:\.[a-zA-Z][a-zA-Z0-9]*)*): /u.exec(error.message)
    : null;
  return field ? { key: 'invalidField', value: field[1] } : { key: 'malformed' };
}

/** @param {Document} doc */
export function mountLocaleParity(doc) {
  const win = doc.defaultView;
  const root = doc.getElementById('locale-parity-root');
  const status = doc.getElementById('locale-parity-status');
  const skip = doc.getElementById('locale-parity-skip');
  if (!win || !root || !status || !skip) throw new Error('Page landmarks missing');

  let locale = localeFromSearch(win.location.search);
  /** @type {Record<FileSlot, Catalog | null>} */
  const catalogs = { current: null, previous: null };
  const revisions = { current: 0, previous: 0 };
  /** @type {{key:string, value?:string} | null} */
  let message = null;
  let audited = false;
  let compared = false;
  /** @type {Array<[HTMLElement, string]>} */
  const labels = [[skip, 'skip']];

  /** @param {string} key @param {string | number} [value] */
  const label = (key, value) => localizedLabel(key, value, locale);

  /** @template {keyof HTMLElementTagNameMap} T @param {T} tag @param {string} key */
  function caption(tag, key) {
    const node = doc.createElement(tag);
    labels.push([node, key]);
    return node;
  }

  /** @param {string} key @param {string} [value] */
  function announce(key, value) {
    message = { key, value };
    if (status) status.textContent = label(key, value);
  }

  /** @param {string} id @param {string} key @param {() => void} activate */
  function action(id, key, activate) {
    const button = caption('button', key);
    button.id = id;
    button.type = 'button';
    button.addEventListener('click', activate);
    return button;
  }

  /** @param {string} key */
  function section(key) {
    const node = doc.createElement('section');
    node.append(caption('h2', key));
    return node;
  }

  /** @param {HTMLElement} parent @param {string} text */
  function line(parent, text) {
    const para = doc.createElement('p');
    para.textContent = text;
    parent.append(para);
  }

  /** @param {FileSlot} slot @param {string} id @param {string} key */
  function fileField(slot, id, key) {
    const name = caption('label', key);
    name.htmlFor = id;
    const input = doc.createElement('input');
    input.type = 'file';
    input.id = id;
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const revision = ++revisions[slot];
      catalogs[slot] = null;
      if (slot === 'current') audited = false;
      compared = false;
      renderResults();
      // Clearing the picker permits retrying the same file after correcting it.
      input.value = '';
      announce('loading', file.name);
      if (file.size > 2_000_000) {
        announce('tooLarge');
        return;
      }
      try {
        const text = await file.text();
        if (revisions[slot] !== revision) return;
        const loaded = parseCatalog(text);
        catalogs[slot] = loaded;
        announce(slot === 'current' ? 'loaded' : 'previousLoaded', file.name);
      } catch (error) {
        if (revisions[slot] !== revision) return;
        const entry = fileError(error);
        announce(entry.key, entry.value);
      }
    });
    return [name, input];
  }

  const language = doc.createElement('select');
  language.id = 'locale-parity-language';
  const languageLabel = caption('label', 'language');
  languageLabel.htmlFor = language.id;
  for (const lang of /** @type {const} */ (['en', 'fr'])) {
    const option = doc.createElement('option');
    option.lang = lang;
    option.value = lang;
    option.textContent = localizedLabel(lang === 'en' ? 'english' : 'french', undefined, lang);
    language.append(option);
  }
  language.addEventListener('change', () => {
    locale = supportedLocale(language.value);
    localize();
  });

  const load = section('load');
  load.append(...fileField('current', 'locale-parity-file', 'currentFile'));
  const audit = section('audit');
  const results = doc.createElement('div');
  results.id = 'locale-parity-results';
  audit.append(action('locale-parity-audit', 'audit', () => {
    if (!catalogs.current) return announce('needCatalog');
    audited = true;
    renderResults();
    announce('auditDone');
  }), results);

  const compare = section('compare');
  const changes = doc.createElement('div');
  changes.id = 'locale-parity-changes';
  compare.append(...fileField('previous', 'locale-parity-previous-file', 'previousFile'));
  compare.append(action('locale-parity-compare', 'compare', () => {
    if (!catalogs.current || !catalogs.previous) return announce('needBoth');
    compared = true;
    renderResults();
    announce('comparisonDone');
  }), changes);

  /** Build downloads locally; every human-readable format uses the active locale.
   * @param {string} filename @param {string} type @param {string} data */
  function download(filename, type, data) {
    const link = doc.createElement('a');
    const url = URL.createObjectURL(new Blob([data], { type }));
    try {
      link.href = url;
      link.download = filename;
      doc.body.append(link);
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  }

  const exp = section('export');
  exp.append(action('locale-parity-export', 'export', () => {
    const catalog = catalogs.current;
    if (!catalog) return announce('needCatalog');
    download('locale-parity.json', 'application/json', reportJson(catalog));
    download('locale-parity.txt', 'text/plain;charset=utf-8', reportText(catalog, locale));
    download('locale-parity.html', 'text/html;charset=utf-8', reportHtml(catalog, locale));
    download('locale-parity.tsv', 'text/tab-separated-values;charset=utf-8', reportTsv(catalog));
  }));

  function renderResults() {
    results.replaceChildren();
    changes.replaceChildren();
    if (audited && catalogs.current) {
      const summary = auditCatalog(catalogs.current);
      const coverage = pairCoverage(catalogs.current);
      line(results, label('coverage', `${coverage.complete}/${coverage.total}`));
      line(results, label('decision', label(summary.decision)));
      for (const id of coverage.missingFrench) line(results, label('missingFrench', id));
      for (const id of coverage.missingEnglish) line(results, label('missingEnglish', id));
      for (const finding of summary.findings) line(results, findingText(finding, locale));
    }
    if (compared && catalogs.previous && catalogs.current) {
      for (const change of comparisonText(catalogs.previous, catalogs.current, locale).split('\n')) line(changes, change);
    }
  }

  function localize() {
    doc.documentElement.lang = locale;
    doc.title = label('title') + ' — ' + label('app');
    for (const [node, key] of labels) node.textContent = label(key);
    language.value = locale;
    if (status) status.textContent = message ? label(message.key, message.value) : '';
    renderResults();
  }
  root.replaceChildren(caption('h1', 'title'), caption('p', 'intro'), languageLabel, language,
    load, audit, compare, exp, caption('p', 'disclaimer'));
  localize();
}

if (typeof document !== 'undefined') mountLocaleParity(document);
