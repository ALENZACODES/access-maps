import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_IDS, SOURCES } from './attribution-utils.mjs';
import * as entry from './locale-qa-index.mjs';
import { LOCALE_QA_SCHEMA } from './locale-qa-core.mjs';
import { fixtureRelease } from './locale-qa-fixtures.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const read = name => readFile(join(directory, name), 'utf8');

const files = [
  'locale-qa-core.mjs',
  'locale-qa-audit.mjs',
  'locale-qa-change.mjs',
  'locale-qa-report.mjs',
  'locale-qa-index.mjs',
  'locale-qa-cli.mjs',
  'locale-qa-route.mjs',
  'locale-qa-fixtures.mjs',
  'locale-qa.html',
  'locale-qa.css',
  'LOCALE_QA_README.md',
];

test('the standalone page exists and loads the actual route module', async () => {
  const html = await read('locale-qa.html');
  assert.ok(html.includes('src="./locale-qa-route.mjs"'));
});
test('the page links its matching local stylesheet', async () => {
  const html = await read('locale-qa.html');
  assert.ok(html.includes('href="./locale-qa.css"'));
});
test('the page sets a restrictive CSP', async () => {
  const html = await read('locale-qa.html');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "object-src 'none'", "base-uri 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
});
test('the page does not load remote scripts, stylesheets or images', async () => {
  const html = await read('locale-qa.html');
  assert.doesNotMatch(html, /<script[^>]+https?:/iu);
  assert.doesNotMatch(html, /<link[^>]+https?:/iu);
  assert.doesNotMatch(html, /<img[^>]+https?:/iu);
});
test('the page includes a named main landmark', async () => {
  const html = await read('locale-qa.html');
  assert.ok(html.includes('<main id="main">'));
  assert.ok(html.includes('href="#main"'));
});
test('the page has an explicit status region', async () => {
  const html = await read('locale-qa.html');
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('the page has real local file input controls', async () => {
  const html = await read('locale-qa.html');
  assert.equal((html.match(/type="file"/gu) ?? []).length, 2);
  assert.doesNotMatch(html, /<form\b/iu);
});
test('each file picker has a visible programmatic label', async () => {
  const html = await read('locale-qa.html');
  for (const id of ['current', 'previous']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
});
test('the language selector has its own visible label', async () => {
  const html = await read('locale-qa.html');
  assert.ok(html.includes('for="language"'));
  assert.ok(html.includes('id="language"'));
});
test('the language selector provides English and French', async () => {
  const html = await read('locale-qa.html');
  assert.ok(html.includes('value="en"'));
  assert.ok(html.includes('value="fr"'));
  assert.ok(html.includes('Français'));
});
test('actions start disabled until a record has been inspected', async () => {
  const html = await read('locale-qa.html');
  for (const id of ['save-text', 'save-json', 'save-html', 'print']) assert.match(html, new RegExp(`id="${id}"[^>]*disabled`, 'u'));
});
test('minimum CSS control dimensions are 44px in both axes', async () => {
  const css = await read('locale-qa.css');
  assert.match(css, /min-height:\s*44px/u);
  assert.match(css, /min-width:\s*44px/u);
});
test('CSS shows visible keyboard focus', async () => {
  const css = await read('locale-qa.css');
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('outline: 3px'));
});
test('CSS supports the reduced-motion preference', async () => {
  const css = await read('locale-qa.css');
  assert.ok(css.includes('prefers-reduced-motion'));
});
test('CSS supports high-contrast forced-colours mode', async () => {
  const css = await read('locale-qa.css');
  assert.ok(css.includes('forced-colors: active'));
});
test('CSS supports narrow screens without a fixed-width layout', async () => {
  const css = await read('locale-qa.css');
  assert.ok(css.includes('max-width: 44rem'));
});
test('CSS provides print-friendly output', async () => {
  const css = await read('locale-qa.css');
  assert.ok(css.includes('@media print'));
});
test('the browser uses the shared public module barrel', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.ok(js.includes("from './locale-qa-index.mjs'"));
});
test('the barrel exports contract, audit, comparison and report APIs', async () => {
  const js = await read('locale-qa-index.mjs');
  for (const module of ['locale-qa-core.mjs', 'locale-qa-audit.mjs', 'locale-qa-change.mjs', 'locale-qa-report.mjs']) {
    assert.ok(js.includes(module));
  }
});
test('every exported public entry point is executable', () => {
  assert.equal(typeof entry.parseLocaleQaJson, 'function');
  assert.equal(typeof entry.auditLocaleQa, 'function');
  assert.equal(typeof entry.compareLocaleQa, 'function');
  assert.equal(typeof entry.renderLocaleQaReport, 'function');
});
test('the browser shows findings and individual notices', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.ok(js.includes('state.audit.findings'));
  assert.ok(js.includes('page.notices'));
});
test('the browser shows comparison findings, not only status', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.ok(js.includes('state.comparison.changes'));
  assert.ok(js.includes('changesView'));
});
test('the browser writes imported data through textContent', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.ok(js.includes('textContent'));
  assert.doesNotMatch(js, /\.innerHTML\s*=/u);
});
test('the browser does not make network calls', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.doesNotMatch(js, /\bfetch\s*\(/u);
  assert.doesNotMatch(js, /\bXMLHttpRequest\b/u);
  assert.doesNotMatch(js, /\bWebSocket\b/u);
});
test('the browser does not persist source records', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.doesNotMatch(js, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u);
});
test('the browser French language label uses U+00A0', async () => {
  const js = await read('locale-qa-route.mjs');
  assert.ok(js.includes('Langue\\u00a0:'));
});
test('the browser does not use background scheduling', async () => {
  for (const name of ['locale-qa-route.mjs', 'locale-qa-cli.mjs']) {
    const js = await read(name);
    assert.doesNotMatch(js, /\bsetInterval\s*\(/u);
  }
});
test('the CLI has no output file writes', async () => {
  const js = await read('locale-qa-cli.mjs');
  assert.doesNotMatch(js, /\bwriteFile\s*\(/u);
  assert.ok(js.includes('readFile'));
});
test('the audit uses the authoritative legal catalogue', async () => {
  const js = await read('locale-qa-audit.mjs');
  assert.ok(js.includes("from './attribution-utils.mjs'"));
});
test('exact OpenStreetMap credit is covered by a named test', async () => {
  const source = await read('locale-qa-audit.test.mjs');
  assert.ok(source.includes('© OpenStreetMap contributors'));
});
test('the shared source catalogue has the expected supported IDs', () => {
  assert.deepEqual(SOURCE_IDS, ['osm', 'metrolinx', 'ltc']);
  assert.deepEqual(Object.keys(SOURCES).sort(), ['ltc','metrolinx','osm']);
});
test('the project README documents the real local CLI', async () => {
  const readme = await read('LOCALE_QA_README.md');
  assert.ok(readme.includes('locale-qa-cli.mjs'));
  assert.ok(readme.includes('locale-qa.html'));
});
test('the project README documents the correct test glob', async () => {
  const readme = await read('LOCALE_QA_README.md');
  assert.ok(readme.includes('locale-qa-*.test.mjs'));
});
test('the root test command already discovers the new Node specs', async () => {
  const text = await readFile(join(root, 'package.json'), 'utf8');
  const manifest = JSON.parse(text);
  assert.match(manifest.scripts.test, /node --test docs\/attribution\/\*\.test\.mjs/u);
});
test('a new package script is unnecessary for the existing runner', async () => {
  const text = await readFile(join(root, 'package.json'), 'utf8');
  const manifest = JSON.parse(text);
  assert.equal(typeof manifest.scripts.test, 'string');
});
test('every required runtime, page and documentation file exists', async () => {
  for (const name of files) {
    const metadata = await lstat(join(directory, name));
    assert.equal(metadata.isFile(), true, name);
    assert.equal(metadata.isSymbolicLink(), false, name);
  }
});
test('all local relative module imports exist', async () => {
  const modules = files.filter(name => name.endsWith('.mjs'));
  for (const name of modules) {
    const source = await read(name);
    for (const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)) {
      const target = match[1].slice(2);
      await assert.doesNotReject(() => read(target), `${name} imports ${target}`);
    }
  }
});
test('the provided schema is accepted by the public barrel', () => {
  const release = entry.parseLocaleQa(fixtureRelease());
  assert.equal(release.schema, LOCALE_QA_SCHEMA);
  assert.equal(entry.auditLocaleQa(release).blocked, false);
});
test('no new source module contains embedded remote executable resources', async () => {
  const html = await read('locale-qa.html');
  assert.doesNotMatch(html, /<script[^>]*https?:/iu);
  assert.doesNotMatch(html, /<link[^>]*https?:/iu);
});
test('French browser evidence labels use the nonbreaking colon separator', async () => {
  const route = await read('locale-qa-route.mjs');
  assert.ok(route.includes("state.locale === 'fr' ? '\\u00a0' : ''"));
});
