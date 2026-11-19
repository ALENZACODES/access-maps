import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_IDS, SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';
import { DOCKET_SCHEMA, parseDocket } from './docket-core.mjs';
import { fixtureDocket, docketFromVariants } from './docket-fixtures.mjs';
import { auditDocket } from './docket-audit.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const source = (name) => readFile(join(dir, name), 'utf8');
test('the single pre-existing catalogue has three supported providers', () => {
  assert.deepEqual([...SOURCE_IDS], ['osm', 'metrolinx', 'ltc']);
});
test('docket uses the existing provider IDs', () => {
  const input = docketFromVariants('aua', 'ogl', 'ltc');
  for (const record of input.sources) assert.ok(SOURCE_IDS.includes(record.provider));
});
test('Metrolinx notices are not interchangeable', () => {
  assert.notEqual(METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE);
});
test('OSM credit and ODbL terms are separate catalogue entries', () => {
  assert.equal(SOURCES.osm.notices.en.length, 2);
  assert.ok(SOURCES.osm.notices.en[0].includes('OpenStreetMap'));
  assert.ok(SOURCES.osm.notices.en[1].includes('ODbL'));
});
test('the browser entrypoint is referenced by the page', async () => {
  const html = await source('docket.html');
  assert.match(html, /src="\.\/docket-route\.mjs"/u);
});
test('stylesheet exists and is loaded by the page', async () => {
  const html = await source('docket.html');
  assert.match(html, /href="\.\/docket\.css"/u);
  assert.ok((await source('docket.css')).length > 100);
});
test('browser route imports the same modules as CLI', async () => {
  const route = await source('docket-route.mjs');
  const cli = await source('docket-cli.mjs');
  for (const module of ['docket-core.mjs', 'docket-audit.mjs', 'docket-change.mjs', 'docket-report.mjs']) {
    assert.ok(route.includes(`'./${module}'`), module);
    assert.ok(cli.includes(`'./${module}'`), module);
  }
});
test('HTML has main and skip navigation', async () => {
  const html = await source('docket.html');
  assert.match(html, /href="#main"/u);
  assert.match(html, /<main id="main">/u);
});
test('HTML has a restrictive no-network CSP', async () => {
  const html = await source('docket.html');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "object-src 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
});
test('HTML has a live status region', async () => {
  assert.match(await source('docket.html'), /role="status" aria-live="polite"/u);
});
test('all file inputs have labels', async () => {
  const html = await source('docket.html');
  for (const id of ['locale', 'current', 'previous']) {
    assert.match(html, new RegExp(`for="${id}"`, 'u'));
    assert.match(html, new RegExp(`id="${id}"`, 'u'));
  }
});
test('export controls start disabled before a docket is loaded', async () => {
  const html = await source('docket.html');
  for (const id of ['save-text', 'save-json', 'save-html', 'print']) {
    assert.match(html, new RegExp(`id="${id}" disabled`, 'u'));
  }
});
test('offline page is free of remote executable and stylesheet resources', async () => {
  const html = await source('docket.html');
  assert.doesNotMatch(html, /<script[^>]+https?:/iu);
  assert.doesNotMatch(html, /<link[^>]+https?:/iu);
  assert.doesNotMatch(html, /<iframe\b/iu);
});
test('static page does not include a remote form', async () => {
  const html = await source('docket.html');
  assert.doesNotMatch(html, /<form\b/iu);
});
test('styles declare 44 px control targets', async () => {
  const css = await source('docket.css');
  assert.match(css, /min-height:\s*44px/u);
  assert.match(css, /min-width:\s*44px/u);
});
test('styles include visible focus indicator', async () => {
  assert.match(await source('docket.css'), /:focus-visible/u);
});
test('styles respond to forced colors', async () => {
  assert.match(await source('docket.css'), /forced-colors:\s*active/u);
});
test('styles respond to reduced motion', async () => {
  assert.match(await source('docket.css'), /prefers-reduced-motion:\s*reduce/u);
});
test('styles have mobile layout', async () => {
  assert.match(await source('docket.css'), /max-width:\s*42rem/u);
});
test('browser avoids raw HTML insertion', async () => {
  const route = await source('docket-route.mjs');
  assert.match(route, /textContent/u);
  assert.doesNotMatch(route, /\.innerHTML\s*=/u);
});
test('browser does not contact external services', async () => {
  const route = await source('docket-route.mjs');
  assert.doesNotMatch(route, /\bfetch\s*\(/u);
  assert.doesNotMatch(route, /XMLHttpRequest/u);
});
test('browser does not persist local user files', async () => {
  const route = await source('docket-route.mjs');
  for (const term of ['localStorage', 'sessionStorage', 'indexedDB']) assert.ok(!route.includes(term));
});
test('browser displays comparison findings, not status alone', async () => {
  const route = await source('docket-route.mjs');
  assert.ok(route.includes('comparison.changes'));
});
test('browser parser does not use Node-only Buffer', async () => {
  const code = await source('docket-core.mjs');
  assert.ok(!code.includes('Buffer.'));
  assert.ok(code.includes('TextEncoder'));
});
test('the new route does not create a separate provider catalogue', async () => {
  const audit = await source('docket-audit.mjs');
  assert.match(audit, /from '\.\/attribution-utils\.mjs'/u);
  assert.doesNotMatch(audit, /const SOURCES = Object/u);
});
test('each new relative import points to a local file or merged catalogue', async () => {
  const names = ['docket-core.mjs', 'docket-audit.mjs', 'docket-change.mjs', 'docket-report.mjs',
    'docket-fixtures.mjs', 'docket-cli.mjs', 'docket-route.mjs'];
  for (const name of names) {
    const content = await source(name);
    for (const match of content.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)) {
      await assert.doesNotReject(() => source(match[1].slice(2)), `${name}: ${match[1]}`);
    }
  }
});
test('README describes exact release schema and CLI entry', async () => {
  const readme = await source('DOCKET_README.md');
  assert.ok(readme.includes(DOCKET_SCHEMA));
  assert.match(readme, /node docs\/attribution\/docket-cli\.mjs/u);
});
test('README includes direct offline HTML path', async () => {
  const readme = await source('DOCKET_README.md');
  assert.ok(readme.includes('docs/attribution/docket.html'));
});
test('root test runner discovers the docket test files', async () => {
  const pkg = JSON.parse(await readFile(resolve(dir, '../..', 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.test.includes('node --test docs/attribution/*.test.mjs'));
});
test('docket requires explicit source and licence evidence', () => {
  const result = auditDocket(parseDocket(fixtureDocket()));
  assert.equal(result.blocked, false);
});
