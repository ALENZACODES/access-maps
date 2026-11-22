import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

// map-ui declares jsdom; npm may hoist it to the root or keep it in the workspace.
const mapUiRequire = createRequire(new URL('../../packages/map-ui/package.json', import.meta.url));
const { JSDOM } = mapUiRequire('jsdom');
const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');

const requiredRoutes = [
  'placement', 'trace', 'observation', 'conflict', 'parity', 'dependency',
  'integrity', 'bundle', 'checklist', 'presentation', 'locale-parity',
];

test('the attribution home offers one English and one French entry for each maintained route', async (t) => {
  const dom = new JSDOM(await read('index.html'), { url: 'https://example.invalid/docs/attribution/index.html' });
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const anchors = [...doc.querySelectorAll('nav a[href]')];
  for (const name of requiredRoutes) {
    const entries = anchors.filter(link => new URL(link.href).pathname === '/docs/attribution/' + name + '.html');
    assert.equal(entries.length, 2, name);
    assert.equal(entries[0].closest('nav'), entries[1].closest('nav'), name);
    assert.ok(entries[0].closest('nav').getAttribute('aria-label'), name);
    for (const locale of ['en', 'fr']) {
      const matching = entries.filter(link => link.lang === locale);
      assert.equal(matching.length, 1, name + ' ' + locale);
      const [link] = matching;
      const url = new URL(link.href);
      assert.equal(url.origin, doc.location.origin);
      assert.equal(url.hash, '');
      // The historical English trace URL selects English by default.
      assert.equal(url.search, name === 'trace' && locale === 'en' ? '' : '?lang=' + locale);
      assert.ok(link.textContent.trim().length > 0);
    }
  }
  assert.equal(doc.querySelector('a[href="conflict.html?lang=en"]').textContent, 'Open attribution conflict review');
  assert.equal(doc.querySelector('a[href="conflict.html?lang=fr"]').textContent, 'Ouvrir l’examen des divergences d’attribution');
  assert.equal(doc.querySelector('a[href="checklist.html?lang=fr"]').textContent, 'Ouvrir la liste de publication des mentions');
  const styles = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(link => link.getAttribute('href'));
  for (const name of requiredRoutes) {
    assert.equal(styles.filter(style => style === name + '-link.css').length, 1, name);
  }
});

test('restored checklist and presentation destinations load their complete local module graphs', async () => {
  for (const name of ['checklist', 'presentation']) {
    const dom = new JSDOM(await read(name + '.html'));
    try {
      const doc = dom.window.document;
      const stylesheet = doc.querySelector('link[rel="stylesheet"]').getAttribute('href');
      assert.match(await read(stylesheet), /:focus-visible/u, name);
      const graph = new Set([doc.querySelector('script[type="module"]').getAttribute('src')]);
      for (const filename of graph) {
        const text = await read(filename);
        for (const match of text.matchAll(/\bfrom\s*['"]\.\/([\w.-]+\.mjs)['"]/gu)) {
          graph.add(match[1]);
        }
      }
      assert.ok(graph.has(name + '-core.mjs'));
      assert.ok(graph.has(name + '-audit.mjs'));
      assert.ok(graph.has(name + '-copy.mjs'));
    } finally {
      dom.window.close();
    }
  }
});
