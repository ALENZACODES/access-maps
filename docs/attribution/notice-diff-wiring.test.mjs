import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_IDS, SOURCES } from './attribution-utils.mjs';
const dir = dirname(fileURLToPath(import.meta.url));
const file = name => readFile(join(dir, name), 'utf8');
test('standalone HTML loads the real browser entry', async () => assert.match(await file('notice-diff.html'), /notice-diff-route\.mjs/u));
test('standalone HTML links to its local stylesheet', async () => assert.match(await file('notice-diff.html'), /notice-diff\.css/u));
test('offline HTML blocks network connections', async () => assert.match(await file('notice-diff.html'), /connect-src 'none'/u));
test('offline HTML blocks form submission', async () => assert.match(await file('notice-diff.html'), /form-action 'none'/u));
test('offline HTML prohibits remote embedded images', async () => assert.match(await file('notice-diff.html'), /img-src 'none'/u));
test('offline HTML uses only local executable module', async () => assert.doesNotMatch(await file('notice-diff.html'), /<script[^>]*https?:/iu));
test('offline HTML has no form posting data', async () => assert.doesNotMatch(await file('notice-diff.html'), /<form\b/iu));
test('offline HTML has a skip link', async () => assert.match(await file('notice-diff.html'), /href="#main"/u));
test('offline HTML has the matching main landmark', async () => assert.match(await file('notice-diff.html'), /<main id="main">/u));
test('offline HTML has a polite status region', async () => assert.match(await file('notice-diff.html'), /aria-live="polite"/u));
test('offline HTML has labelled file pickers', async () => {
  const html = await file('notice-diff.html');
  for (const id of ['current', 'previous']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}" type="file"`));
  }
});
test('offline HTML has labelled language control', async () => {
  const html = await file('notice-diff.html');
  assert.ok(html.includes('for="language"'));
  assert.ok(html.includes('id="language"'));
});
test('offline HTML begins with disabled report actions', async () => {
  const html = await file('notice-diff.html');
  for (const id of ['save-text', 'save-html', 'save-json', 'print']) assert.match(html, new RegExp(`id="${id}"[^>]*disabled`, 'u'));
});
test('CSS has 44px minimum height', async () => assert.match(await file('notice-diff.css'), /min-height: 44px/u));
test('CSS has 44px minimum width', async () => assert.match(await file('notice-diff.css'), /min-width: 44px/u));
test('CSS has visible keyboard focus', async () => assert.match(await file('notice-diff.css'), /:focus-visible/u));
test('CSS respects reduced motion', async () => assert.match(await file('notice-diff.css'), /prefers-reduced-motion/u));
test('CSS supports high contrast', async () => assert.match(await file('notice-diff.css'), /forced-colors/u));
test('CSS supports narrow layouts', async () => assert.match(await file('notice-diff.css'), /max-width: 48rem/u));
test('CSS includes print treatment', async () => assert.match(await file('notice-diff.css'), /@media print/u));
test('browser route uses actual parser, audit, change and report modules', async () => {
  const route = await file('notice-diff-route.mjs');
  for (const item of ['core', 'audit', 'change', 'report']) assert.ok(route.includes(`./notice-diff-${item}.mjs`));
});
test('browser route uses text-only DOM updates', async () => {
  const route = await file('notice-diff-route.mjs');
  assert.match(route, /textContent/u);
  assert.doesNotMatch(route, /\binnerHTML\b/u);
});
test('browser route does not make network requests', async () => {
  const route = await file('notice-diff-route.mjs');
  assert.doesNotMatch(route, /\bfetch\s*\(/u);
  assert.doesNotMatch(route, /XMLHttpRequest/u);
});
test('browser route does not persist imported evidence', async () => {
  const route = await file('notice-diff-route.mjs');
  assert.doesNotMatch(route, /localStorage|sessionStorage|indexedDB/u);
});
test('browser route French language label has U+00A0 before colon', async () => assert.match(await file('notice-diff-route.mjs'), /Langue\\u00a0:/u));
test('CLI uses real executable files and imports no browser modules', async () => {
  const code = await file('notice-diff-cli.mjs');
  assert.doesNotMatch(code, /from ['"]\.\/notice-diff-route/u);
  for (const item of ['core', 'audit', 'change', 'report']) assert.ok(code.includes(`./notice-diff-${item}.mjs`));
});
test('no new test requires an absent README', async () => {
  const readme = await file('NOTICE_DIFF_README.md');
  assert.match(readme, /notice-diff-cli\.mjs/u);
  assert.match(readme, /notice-diff-\*\.test\.mjs/u);
});
test('all new relative module imports are included or pre-existing', async () => {
  const modules = ['core', 'audit', 'change', 'report', 'cli', 'route', 'fixtures'].map(n => `notice-diff-${n}.mjs`);
  for (const name of modules) {
    const code = await file(name);
    for (const match of code.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)) await assert.doesNotReject(() => file(match[1].slice(2)), `${name}: ${match[1]}`);
  }
});
test('all standalone test file reads exist on disk', async () => {
  for (const name of ['notice-diff.html', 'notice-diff.css', 'NOTICE_DIFF_README.md']) await assert.doesNotReject(() => file(name));
});
test('source catalogue remains limited to the existing three providers', () => assert.deepEqual(SOURCE_IDS, ['osm', 'metrolinx', 'ltc']));
test('no catalogue is copied into this package', async () => {
  const core = await file('notice-diff-core.mjs');
  assert.match(core, /from '\.\/attribution-utils\.mjs'/u);
  assert.doesNotMatch(core, /const SOURCES\s*=/u);
  assert.deepEqual(Object.keys(SOURCES).sort(), ['ltc', 'metrolinx', 'osm']);
});
test('the existing root test command discovers the new Node test files', async () => {
  const path = resolve(dir, '../..', 'package.json');
  const pkg = JSON.parse(await readFile(path, 'utf8'));
  assert.ok(pkg.scripts.test.includes('node --test docs/attribution/*.test.mjs'));
});
