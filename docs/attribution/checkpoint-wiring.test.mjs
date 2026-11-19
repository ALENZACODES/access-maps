import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
async function local(name) { return readFile(join(directory, name), 'utf8'); }
test('all route imports exist within this package', async () => {
  const files = ['checkpoint-route.mjs', 'checkpoint-core.mjs', 'checkpoint-audit.mjs', 'checkpoint-report.mjs', 'checkpoint-cli.mjs', 'checkpoint-fixtures.mjs'];
  for (const name of files) {
    const content = await local(name);
    for (const [, imported] of content.matchAll(/from\s+['"]\.\/(.*?)['"]/gu)) {
      await assert.doesNotReject(() => local(imported), `${name} imports ${imported}`);
    }
  }
});
test('the root test command discovers new tests without editing scripts', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /node --test docs\/attribution\/\*\.test\.mjs/u);
});
test('the bilingual npm script is kept', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['audit:bilingual-attribution'], 'tsx docs/attribution/offline-parity-cli.ts');
});
test('the previously missing reference README is explicitly included', async () => {
  const readme = await local('REFERENCE_PACK_README.md');
  assert.ok(readme.includes('reference-cli.mjs'));
  assert.ok(readme.includes('reference-*.test.mjs'));
});
test('HTML route has an exact local stylesheet and script', async () => {
  const html = await local('checkpoint.html');
  assert.ok(html.includes('src="./checkpoint-route.mjs"'));
  assert.ok(html.includes('href="./checkpoint.css"'));
});
test('route includes labelled input and language selectors', async () => {
  const html = await local('checkpoint.html');
  for (const id of ['language', 'current', 'previous']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
});
test('HTML has skip link, main landmark, and live announcement', async () => {
  const html = await local('checkpoint.html');
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('<main id="main">'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('HTML uses local assets and CSP denies outbound requests', async () => {
  const html = await local('checkpoint.html');
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
  assert.ok(!/<script[^>]*https?:/iu.test(html));
});
test('controls meet 44px minimum and display visible keyboard focus', async () => {
  const css = await local('checkpoint.css');
  for (const expected of ['min-height:44px', 'min-width:44px', ':focus-visible', 'outline:3px']) assert.ok(css.includes(expected));
});
test('CSS contains reduced-motion, responsive and high-contrast treatments', async () => {
  const css = await local('checkpoint.css');
  for (const expected of ['prefers-reduced-motion', 'forced-colors:active', '@media print', '@media(max-width:48rem)']) assert.ok(css.includes(expected));
});
test('the route never uploads or persists selected records', async () => {
  const js = await local('checkpoint-route.mjs');
  assert.ok(!/\bfetch\s*\(/u.test(js));
  for (const term of ['localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest', 'setInterval']) assert.ok(!js.includes(term), term);
});
test('the route uses safe textContent instead of innerHTML', async () => {
  const js = await local('checkpoint-route.mjs');
  assert.ok(js.includes('textContent'));
  assert.ok(!js.includes('innerHTML'));
});
test('the route French label has a no-break space before colon', async () => {
  const js = await local('checkpoint-route.mjs');
  assert.ok(js.includes('Langue\\u00a0:'));
});
test('every output file in the README exists', async () => {
  const readme = await local('CHECKPOINT_README.md');
  for (const file of ['checkpoint-cli.mjs', 'checkpoint.html', 'checkpoint-route.mjs', 'checkpoint.css']) assert.ok(readme.includes(file));
});
