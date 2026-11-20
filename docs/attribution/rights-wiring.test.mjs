import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, lstat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from './rights-index.mjs';
import {SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE} from './attribution-utils.mjs';
import {matrix} from './rights-fixtures.mjs';
const dir = dirname(fileURLToPath(import.meta.url));
const read = name => readFile(join(dir, name), 'utf8');
const files = [
  'rights-core.mjs', 'rights-audit.mjs', 'rights-change.mjs',
  'rights-report.mjs', 'rights-cli.mjs', 'rights-index.mjs',
  'rights-route.mjs', 'rights.html', 'rights.css',
  'rights-fixtures.mjs', 'rights-core.test.mjs', 'rights-audit.test.mjs',
  'rights-change.test.mjs', 'rights-report.test.mjs',
  'rights-cli.test.mjs', 'rights-wiring.test.mjs',
  'RIGHTS_MATRIX_README.md',
];

test('public barrel exposes the executable contract and audit', () => {
  for (const name of ['parseRightsMatrix', 'parseRightsMatrixJson',
    'auditRightsMatrix', 'compareRightsMatrices', 'renderRightsReport']) {
    assert.equal(typeof api[name], 'function');
  }
});
test('public barrel works on a real supplied record', () => {
  const result = api.auditRightsMatrix(api.parseRightsMatrix(matrix()));
  assert.equal(result.blocked, false);
});
test('the live browser entry imports the public barrel', async () => {
  const source = await read('rights-route.mjs');
  assert.ok(source.includes("from './rights-index.mjs'"));
});
test('the browser route imports no unmerged sibling modules', async () => {
  const source = await read('rights-route.mjs');
  assert.ok(!source.includes('notice-diff-'));
  assert.ok(!source.includes('obligation-'));
  assert.ok(!source.includes('reconcile-'));
});
test('direct HTML route includes exactly the local script entry point', async () => {
  const html = await read('rights.html');
  assert.ok(html.includes('src="./rights-route.mjs"'));
  assert.ok(!html.includes('rights-cli.mjs'));
});
test('direct HTML route includes its local stylesheet', async () => {
  const html = await read('rights.html');
  assert.ok(html.includes('href="./rights.css"'));
});
test('HTML includes a restrictive offline content security policy', async () => {
  const html = await read('rights.html');
  for (const policy of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "object-src 'none'", "base-uri 'none'"]) {
    assert.ok(html.includes(policy), policy);
  }
});
test('HTML does not request remote scripts, styles, or images', async () => {
  const html = await read('rights.html');
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+https?:/iu);
});
test('HTML does not ship inline executable script tags', async () => {
  const html = await read('rights.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/iu);
});
test('HTML has skip navigation and main landmark', async () => {
  const html = await read('rights.html');
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('<main id="main">'));
});
test('HTML uses local file pickers and no transmitting form', async () => {
  const html = await read('rights.html');
  assert.ok(html.includes('type="file"'));
  assert.doesNotMatch(html, /<form\b/iu);
});
test('local file pickers have explicit labels', async () => {
  const html = await read('rights.html');
  for (const id of ['language', 'current', 'previous']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
});
test('status region is announced politely', async () => {
  const html = await read('rights.html');
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('downloads are initially disabled until an audit runs', async () => {
  const html = await read('rights.html');
  for (const id of ['save-text', 'save-json', 'save-html', 'print']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*disabled`, 'u'));
  }
});
test('CSS declares both touch dimensions at 44px', async () => {
  const css = await read('rights.css');
  assert.ok(css.includes('min-height: 44px'));
  assert.ok(css.includes('min-width: 44px'));
});
test('CSS gives a visible keyboard focus outline', async () => {
  const css = await read('rights.css');
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('outline: 3px'));
});
test('CSS handles reduced motion', async () => {
  assert.ok((await read('rights.css')).includes('prefers-reduced-motion'));
});
test('CSS handles high-contrast forced colours', async () => {
  assert.ok((await read('rights.css')).includes('forced-colors'));
});
test('CSS includes responsive and print alternatives', async () => {
  const css = await read('rights.css');
  assert.ok(css.includes('@media (max-width:'));
  assert.ok(css.includes('@media print'));
});
test('browser route writes supplied values as text, not HTML', async () => {
  const source = await read('rights-route.mjs');
  assert.ok(source.includes('textContent'));
  assert.ok(source.includes('replaceChildren'));
  assert.doesNotMatch(source, /\.innerHTML\s*=/u);
});
test('browser route never fetches a remote feed', async () => {
  const source = await read('rights-route.mjs');
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /XMLHttpRequest/u);
});
test('browser route does not persist user-selected evidence', async () => {
  const source = await read('rights-route.mjs');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/u);
});
test('browser route reads a chosen file only on explicit action', async () => {
  const source = await read('rights-route.mjs');
  assert.ok(source.includes('file.text()'));
  assert.ok(source.includes("$('run').addEventListener('click'"));
});
test('browser route displays historical change findings, not status alone', async () => {
  const source = await read('rights-route.mjs');
  assert.ok(source.includes('state.comparison.changes'));
  assert.ok(source.includes('compareRightsMatrices(prior, matrix)'));
});
test('browser route French language label uses U+00A0 before colon', async () => {
  assert.ok((await read('rights-route.mjs')).includes('Langue\\u00a0:'));
});
test('authoritative provider catalogue remains limited to recorded options', () => {
  assert.deepEqual(Object.keys(SOURCES).sort(), ['ltc', 'metrolinx', 'osm']);
});
test('legal notices are imported, not rewritten in the audit', async () => {
  const source = await read('rights-audit.mjs');
  assert.ok(source.includes("from './attribution-utils.mjs'"));
  assert.ok(!source.includes('const METROLINX_AUA_LEGEND ='));
  assert.ok(!source.includes('const METROLINX_OGL_NOTICE ='));
  assert.ok(METROLINX_AUA_LEGEND.length > 100);
  assert.ok(METROLINX_OGL_NOTICE.startsWith('Contains information'));
});
test('all named local runtime and test files exist and are regular files', async () => {
  for (const name of files) {
    const info = await lstat(join(dir, name));
    assert.ok(info.isFile(), name);
    assert.ok(!info.isSymbolicLink(), name);
  }
});
test('all ESM relative imports resolve to actual local files', async () => {
  const modules = files.filter(name => name.endsWith('.mjs'));
  for (const name of modules) {
    const source = await read(name);
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.\/[^'"]+)['"]/gu)) {
      const target = resolve(dir, match[1]);
      assert.ok(target.startsWith(`${dir}/`));
      const info = await lstat(target);
      assert.ok(info.isFile(), `${name} imports ${match[1]}`);
      assert.ok(!info.isSymbolicLink(), `${name} imports symlink ${match[1]}`);
    }
  }
});
test('README documents the actual executable and test glob', async () => {
  const readme = await read('RIGHTS_MATRIX_README.md');
  assert.ok(readme.includes('rights-cli.mjs'));
  assert.ok(readme.includes('rights-*.test.mjs'));
  assert.ok(readme.includes('rights.html'));
});
test('new modules contain no persistence or scheduled execution', async () => {
  for (const name of ['rights-core.mjs', 'rights-audit.mjs', 'rights-change.mjs',
    'rights-report.mjs', 'rights-cli.mjs', 'rights-index.mjs', 'rights-route.mjs']) {
    const source = await read(name);
    assert.doesNotMatch(source, /\bsetInterval\s*\(/u);
    assert.doesNotMatch(source, /\bcron\b|\bnode-schedule\b/u);
  }
});
test('new user copy does not claim automatic external confirmation', async () => {
  const sources = await Promise.all(['rights-route.mjs', 'rights-report.mjs', 'rights.html'].map(read));
  for (const source of sources) {
    assert.doesNotMatch(source, /\b(?:verified|verify|guaranteed|real-time|partnership)\b|v[ée]rif/iu);
  }
});
test('reporter and offline UI have the same bilingual keys', () => {
  assert.deepEqual(Object.keys(api.RIGHTS_COPY.fr).sort(), Object.keys(api.RIGHTS_COPY.en).sort());
});
test('root test command includes new Node test discovery without a script edit', async () => {
  // This test intentionally reads the current-main package at integration time.
  const packageText = await readFile(resolve(dir, '../..', 'package.json'), 'utf8');
  const manifest = JSON.parse(packageText);
  assert.match(manifest.scripts.test, /node --test docs\/attribution\/\*\.test\.mjs/u);
});
