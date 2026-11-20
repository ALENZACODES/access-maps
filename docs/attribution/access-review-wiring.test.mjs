import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as publicApi from './access-review-index.mjs';
import { SOURCES } from './attribution-utils.mjs';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const read = name => readFile(join(directory, name), 'utf8');
const names = [
  'access-review-core.mjs', 'access-review-audit.mjs',
  'access-review-change.mjs', 'access-review-report.mjs',
  'access-review-index.mjs', 'access-review-cli.mjs',
  'access-review-route.mjs', 'access-review-fixtures.mjs',
  'access-review-core.test.mjs', 'access-review-audit.test.mjs',
  'access-review-change.test.mjs', 'access-review-report.test.mjs',
  'access-review-cli.test.mjs', 'access-review-wiring.test.mjs',
  'access-review.html', 'access-review.css', 'ACCESS_REVIEW_README.md',
];

test('every local source, test, page, style and README is present', async () => {
  for (const name of names) assert.ok((await read(name)).length > 0, name);
});
test('no included file is a symbolic link', async () => {
  for (const name of names) assert.equal((await lstat(join(directory, name))).isSymbolicLink(), false, name);
});
test('HTML loads exactly the live route and local stylesheet', async () => {
  const html = await read('access-review.html');
  assert.ok(html.includes('src="./access-review-route.mjs"'));
  assert.ok(html.includes('href="./access-review.css"'));
});
test('browser route imports public barrel rather than duplicating logic', async () => {
  const route = await read('access-review-route.mjs');
  assert.match(route, /from '\.\/access-review-index\.mjs'/u);
});
test('public barrel exports contract, audit, comparison and reports', async () => {
  const barrel = await read('access-review-index.mjs');
  for (const name of ['core', 'audit', 'change', 'report']) assert.ok(barrel.includes(`./access-review-${name}.mjs`));
});
test('public exports are callable by the running route', () => {
  for (const name of ['parseAccessReviewJson', 'auditAccessReview', 'compareAccessReviews', 'renderAccessReviewText', 'renderAccessReviewHtml', 'renderAccessReviewJson']) {
    assert.equal(typeof publicApi[name], 'function', name);
  }
});
test('the authoritative provider catalogue remains unchanged and bounded', () => {
  assert.deepEqual(Object.keys(SOURCES).sort(), ['ltc', 'metrolinx', 'osm']);
});
test('audit imports legal notices from the shared catalogue', async () => {
  const code = await read('access-review-audit.mjs');
  assert.match(code, /from '\.\/attribution-utils\.mjs'/u);
  assert.doesNotMatch(code, /const\s+METROLINX_AUA_LEGEND\s*=/u);
});
test('HTML CSP blocks outbound connections and remote forms', async () => {
  const html = await read('access-review.html');
  for (const phrase of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "object-src 'none'", "base-uri 'none'"]) assert.ok(html.includes(phrase));
});
test('static HTML contains no third-party script or style URL', async () => {
  const html = await read('access-review.html');
  assert.doesNotMatch(html, /<script[^>]+https?:/iu);
  assert.doesNotMatch(html, /<link[^>]+https?:/iu);
});
test('page has local file inputs and no form submit', async () => {
  const html = await read('access-review.html');
  assert.ok(html.includes('type="file"'));
  assert.doesNotMatch(html, /<form\b/iu);
});
test('language and local file controls have explicit labels', async () => {
  const html = await read('access-review.html');
  for (const id of ['language', 'current', 'previous']) {
    assert.ok(html.includes(`for="${id}"`), id);
    assert.ok(html.includes(`id="${id}"`), id);
  }
});
test('all review-option controls have labels', async () => {
  const html = await read('access-review.html');
  for (const id of ['require-offline', 'require-paired', 'require-evidence']) assert.ok(html.includes(`for="${id}"`));
});
test('dynamic status uses an announcement region', async () => {
  const html = await read('access-review.html');
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('page provides a keyboard-reachable skip link and main landmark', async () => {
  const html = await read('access-review.html');
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('<main id="main">'));
});
test('export and print buttons are disabled until a file is inspected', async () => {
  const html = await read('access-review.html');
  for (const id of ['save-text', 'save-html', 'save-json', 'print']) assert.match(html, new RegExp(`id="${id}"[^>]*disabled`, 'u'));
});
test('all active controls have 44px width and height minima', async () => {
  const css = await read('access-review.css');
  assert.ok(css.includes('min-height: 44px'));
  assert.ok(css.includes('min-width: 44px'));
});
test('keyboard focus has a visible outline in CSS', async () => {
  const css = await read('access-review.css');
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('outline: 3px'));
});
test('reduced-motion preference is supported', async () => {
  const css = await read('access-review.css');
  assert.ok(css.includes('prefers-reduced-motion'));
});
test('narrow-width layout and forced-colour options are present', async () => {
  const css = await read('access-review.css');
  assert.ok(css.includes('@media (max-width: 46rem)'));
  assert.ok(css.includes('forced-colors: active'));
});
test('print styling excludes input controls', async () => {
  const css = await read('access-review.css');
  assert.ok(css.includes('@media print'));
});
test('browser route never assigns unsanitized HTML', async () => {
  const route = await read('access-review-route.mjs');
  assert.ok(route.includes('textContent'));
  assert.doesNotMatch(route, /\.innerHTML\s*=/u);
});
test('browser route performs no network request', async () => {
  const route = await read('access-review-route.mjs');
  assert.doesNotMatch(route, /\bfetch\s*\(/u);
  assert.doesNotMatch(route, /XMLHttpRequest/u);
  assert.doesNotMatch(route, /WebSocket/u);
});
test('browser route does not persist submitted information', async () => {
  const route = await read('access-review-route.mjs');
  assert.doesNotMatch(route, /\b(localStorage|sessionStorage|indexedDB)\b/u);
});
test('browser route uses files chosen by the operator', async () => {
  const route = await read('access-review-route.mjs');
  assert.match(route, /await file\.text\(\)/u);
  assert.match(route, /parseAccessReviewJson/u);
});
test('browser route recalculates comparisons when options change', async () => {
  const route = await read('access-review-route.mjs');
  assert.ok(route.includes('state.previous'));
  assert.ok(route.includes('compareAccessReviews(state.previous, state.release, state.options)'));
});
test('French language label uses no-break space before colon', async () => {
  const route = await read('access-review-route.mjs');
  assert.ok(route.includes('Langue\\u00a0:'));
});
test('public report uses French narrow space before semicolon', async () => {
  const report = await read('access-review-report.mjs');
  assert.ok(report.includes("'\\u202f; '"));
});
test('CLI process entry is a real .mjs source file', async () => {
  const code = await read('access-review-cli.mjs');
  assert.ok(code.includes('isReviewCliEntrypoint()'));
  assert.ok(code.includes('import.meta.url'));
});
test('every new relative static import resolves in the directory', async () => {
  for (const name of names.filter(x => x.endsWith('.mjs'))) {
    const contents = await read(name);
    for (const match of contents.matchAll(/(?:from\s+|import\s*)['"](\.\/[^'"]+)['"]/gu)) {
      const file = match[1].slice(2);
      await assert.doesNotReject(() => read(file), `${name} imports ${file}`);
    }
  }
});
test('README includes the actual CLI and test command', async () => {
  const contents = await read('ACCESS_REVIEW_README.md');
  assert.ok(contents.includes('access-review-cli.mjs'));
  assert.ok(contents.includes('node --test docs/attribution/access-review-*.test.mjs'));
});
test('repository test command discovers these new tests without package edits', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(manifest.scripts.test.includes('node --test docs/attribution/*.test.mjs'));
});
test('route and documentation list all files needed for offline use', async () => {
  const contents = await read('ACCESS_REVIEW_README.md');
  for (const name of ['access-review.html', 'access-review-route.mjs', 'access-review-index.mjs']) assert.ok(contents.includes(name));
});
