// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { READER_COPY } from './pack-reader-copy.mjs';
import { exampleManifestText } from './pack-reader-example.mjs';
import { MAX_MANIFEST_BYTES } from './pack-reader-model.mjs';
import { mountReader } from './pack-reader-route.mjs';

// Resolve the DOM implementation from the workspace which declares it, even
// when npm installs it below that workspace rather than hoisting the package.
const mapUiRequire = createRequire(new URL('../../packages/map-ui/package.json', import.meta.url));
/** @type {{JSDOM: new (html: string, options: {url: string}) => {window: Window & typeof globalThis}}} */
const { JSDOM } = mapUiRequire('jsdom');
const html = await readFile(new URL('./pack-reader.html', import.meta.url), 'utf8');
const localBytes = new TextEncoder().encode(exampleManifestText()).buffer;

/** @typedef {{size: number, arrayBuffer: () => Promise<ArrayBuffer>}} LocalFile */

/**
 * jsdom lacks a file-picker dialog. Model only the native file selection
 * behaviour: selecting the same file twice does not fire change until the
 * control is cleared. The application supplies all event handlers.
 * @param {import('node:test').TestContext} t
 * @param {'en'|'fr'} [locale]
 */
function openReader(t, locale = 'en') {
  const { window } = new JSDOM(html, { url: `https://map.example/pack-reader.html?lang=${locale}` });
  const doc = window.document;
  t.after(() => window.close());
  /** @param {string} id */
  function node(id) {
    const result = doc.getElementById(id);
    assert.ok(result, id);
    return result;
  }
  const picker = node('pack-file');
  /** @type {LocalFile | null} */
  let currentFile = null;
  Object.defineProperties(picker, {
    files: { get: () => currentFile ? [currentFile] : [] },
    value: {
      get: () => currentFile ? 'local-file.json' : '',
      /** @param {string} next */
      set(next) {
        assert.equal(next, '', 'File input can only be cleared programmatically');
        currentFile = null;
      },
    },
  });
  mountReader(doc);
  /** @param {LocalFile} file */
  function select(file) {
    if (file === currentFile) return false;
    currentFile = file;
    picker.dispatchEvent(new window.Event('change'));
    return true;
  }
  function cancel() {
    picker.dispatchEvent(new window.Event('cancel'));
  }
  return {
    node,
    select,
    cancel,
    doc,
    get status() { return node('pack-status').textContent; },
    get error() { return node('pack-error').textContent; },
    get hasResults() { return !node('pack-results').hidden; },
  };
}

function delayedFile() {
  /** @type {{resolve:(value:ArrayBuffer)=>void, reject:(reason:Error)=>void}} */
  const response = {
    resolve() { assert.fail('Expected a pending file read'); },
    reject() { assert.fail('Expected a pending file read'); },
  };
  /** @type {LocalFile} */
  const file = {
    size: localBytes.byteLength,
    arrayBuffer: () => new Promise((resolve, reject) => {
      response.resolve = resolve;
      response.reject = reject;
    }),
  };
  return { file, response };
}

/** @param {ArrayBuffer} [bytes] @returns {LocalFile} */
function localFile(bytes = localBytes) {
  return { size: bytes.byteLength, arrayBuffer: async () => bytes };
}

test('opening the example invalidates an earlier read even if it completes with valid JSON', async (t) => {
  const ui = openReader(t);
  const slow = delayedFile();
  ui.select(slow.file);
  assert.equal(ui.status, READER_COPY.en.messages.loading);
  assert.equal(ui.hasResults, false);

  ui.node('pack-example').click();
  assert.equal(ui.node('pack-origin').textContent, READER_COPY.en.exampleOrigin);
  slow.response.resolve(localBytes);
  await nextTurn();
  assert.equal(ui.node('pack-origin').textContent, READER_COPY.en.exampleOrigin);
  assert.equal(ui.node('pack-sources').childElementCount, 4);
  assert.equal(ui.error, '');
});

test('an unreadable older file cannot replace a newer file’s successful result', async (t) => {
  const ui = openReader(t);
  const previous = delayedFile();
  ui.select(previous.file);
  ui.select(localFile());
  await nextTurn();
  const success = ui.status;

  previous.response.reject(new Error('Previous read interrupted'));
  await nextTurn();
  assert.equal(ui.status, success);
  assert.equal(ui.error, '');
  assert.equal(ui.node('pack-origin').textContent, READER_COPY.en.localOrigin);
  assert.equal(ui.node('pack-sources').childElementCount, 4);
});

test('a stale success leaves a newer rejected selection visible and actionable', async (t) => {
  const ui = openReader(t);
  const previous = delayedFile();
  ui.select(previous.file);
  ui.select(localFile(new TextEncoder().encode('[').buffer));
  await nextTurn();
  assert.equal(ui.error, READER_COPY.en.errors.json);

  previous.response.resolve(localBytes);
  await nextTurn();
  assert.equal(ui.error, READER_COPY.en.errors.json);
  assert.equal(ui.node('pack-file').getAttribute('aria-invalid'), 'true');
  assert.equal(ui.hasResults, false);
});

test('clearing during a pending read suppresses its completion and restores keyboard focus', async (t) => {
  const ui = openReader(t, 'fr');
  const slow = delayedFile();
  ui.select(slow.file);
  assert.equal(ui.node('pack-clear').hidden, false);
  ui.node('pack-clear').click();
  assert.equal(ui.doc.activeElement, ui.node('pack-file'));
  assert.equal(ui.status, READER_COPY.fr.messages.cleared);

  slow.response.resolve(localBytes);
  await nextTurn();
  assert.equal(ui.status, READER_COPY.fr.messages.cleared);
  assert.equal(ui.hasResults, false);
  assert.equal(ui.node('pack-clear').hidden, true);
  assert.equal(ui.node('pack-sources').childElementCount, 0);
});

test('an oversized file is rejected before its bytes are read and any previous results are cleared', (t) => {
  const ui = openReader(t);
  let calls = 0;
  ui.node('pack-example').click();
  ui.select({
    size: MAX_MANIFEST_BYTES + 1,
    async arrayBuffer() {
      calls++;
      return localBytes;
    },
  });
  assert.equal(calls, 0);
  assert.equal(ui.hasResults, false);
  assert.equal(ui.node('pack-sources').textContent, '');
  assert.equal(ui.error, READER_COPY.en.errors.limit);
  assert.match(ui.node('pack-file').getAttribute('aria-describedby') ?? '', /pack-error/u);
});

test('invalid UTF-8 uses a localized error and a new successful read clears the invalid state', async (t) => {
  const ui = openReader(t);
  // A tolerant decoder would silently turn malformed bytes into U+FFFD.
  ui.select(localFile(Uint8Array.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]).buffer));
  await nextTurn();
  assert.equal(ui.error, READER_COPY.en.errors.encoding);
  ui.node('pack-language').click();
  assert.equal(ui.doc.documentElement.lang, 'fr');
  assert.equal(ui.error, READER_COPY.fr.errors.encoding);

  ui.select(localFile());
  await nextTurn();
  assert.equal(ui.error, '');
  assert.equal(ui.node('pack-file').hasAttribute('aria-invalid'), false);
  assert.equal(ui.node('pack-file').getAttribute('aria-describedby'), 'pack-file-hint');
  assert.equal(ui.hasResults, true);
  assert.equal(ui.node('pack-origin').textContent, READER_COPY.fr.localOrigin);
});

test('read failure can be retried by selecting the very same file object', async (t) => {
  const ui = openReader(t);
  let calls = 0;
  const file = {
    size: localBytes.byteLength,
    async arrayBuffer() {
      if (++calls === 1) throw new Error('Device temporarily busy');
      return localBytes;
    },
  };
  assert.equal(ui.select(file), true);
  await nextTurn();
  assert.equal(ui.error, READER_COPY.en.errors.read);
  assert.equal(ui.select(file), true);
  await nextTurn();
  assert.equal(calls, 2);
  assert.equal(ui.hasResults, true);
  assert.equal(ui.error, '');
});

test('switching interface language during a read uses the new language when it finishes', async (t) => {
  const ui = openReader(t);
  const slow = delayedFile();
  ui.select(slow.file);
  ui.node('pack-language').click();
  assert.equal(ui.status, READER_COPY.fr.messages.loading);
  slow.response.resolve(localBytes);
  await nextTurn();
  assert.ok(ui.status?.startsWith(READER_COPY.fr.messages.loaded));
  assert.equal(ui.node('pack-origin').textContent, READER_COPY.fr.localOrigin);
  assert.equal(ui.node('pack-region').firstElementChild?.textContent, READER_COPY.fr.allRegions);
});

test('cancelling a new file dialog preserves a previously opened selection', (t) => {
  const ui = openReader(t);
  ui.node('pack-example').click();
  const status = ui.status;
  const records = ui.node('pack-totals').textContent;
  ui.cancel();
  assert.equal(ui.status, status);
  assert.equal(ui.node('pack-totals').textContent, records);
  assert.equal(ui.hasResults, true);
  assert.equal(ui.error, '');
});

test('download errors preserve the usable manifest and leave the file input valid', (t) => {
  const ui = openReader(t);
  ui.node('pack-example').click();
  t.mock.method(URL, 'createObjectURL', () => { throw new Error('Download unavailable'); });
  ui.node('pack-export').click();
  assert.equal(ui.error, READER_COPY.en.errors.download);
  assert.equal(ui.hasResults, true);
  assert.equal(ui.node('pack-file').hasAttribute('aria-invalid'), false);

  ui.node('pack-clear').click();
  assert.equal(ui.hasResults, false);
  assert.equal(ui.error, '');
});
