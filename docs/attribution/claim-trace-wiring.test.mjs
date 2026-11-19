import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './attribution-utils.mjs';
const dir = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFile(join(dir, name), 'utf8');
test('standalone page loads its live module', async () => assert.match(await read('claim-trace.html'), /claim-trace-route\.mjs/u));
test('standalone page ships the local stylesheet', async () => assert.match(await read('claim-trace.html'), /claim-trace\.css/u));
test('standalone route uses the same parser and audit as CLI', async () => {
  const code = await read('claim-trace-route.mjs');
  for (const name of ['claim-trace-core.mjs', 'claim-trace-audit.mjs', 'claim-trace-change.mjs', 'claim-trace-report.mjs']) assert.ok(code.includes(`./${name}`));
});
test('CLI directly imports all source dependencies', async () => {
  const code = await read('claim-trace-cli.mjs');
  for (const name of ['claim-trace-core.mjs', 'claim-trace-audit.mjs', 'claim-trace-change.mjs', 'claim-trace-report.mjs']) assert.ok(code.includes(`./${name}`));
});
test('reference to the authoritative catalogue is an import, not a copy', async () => {
  const code = await read('claim-trace-audit.mjs');
  assert.ok(code.includes("from './attribution-utils.mjs'"));
});
test('the source catalogue is not expanded', () => assert.deepEqual(Object.keys(SOURCES).sort(), ['ltc', 'metrolinx', 'osm']));
test('HTML includes CSP with no network connections', async () => assert.ok((await read('claim-trace.html')).includes("connect-src 'none'")));
test('HTML includes file pickers and no remote form', async () => {
  const html = await read('claim-trace.html');
  assert.ok(html.includes('type="file"'));
  assert.doesNotMatch(html, /<form\b/iu);
});
test('HTML has accessible labels and status region', async () => {
  const html = await read('claim-trace.html');
  for (const id of ['language', 'current', 'previous']) assert.ok(html.includes(`for="${id}"`));
  assert.ok(html.includes('aria-live="polite"'));
});
test('controls are at least 44px across both dimensions', async () => {
  const css = await read('claim-trace.css');
  assert.match(css, /min-height:44px/u);
  assert.match(css, /min-width:44px/u);
});
test('keyboard focus and reduced motion styles exist', async () => {
  const css = await read('claim-trace.css');
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('prefers-reduced-motion'));
});
test('browser route updates content through textContent only', async () => {
  const code = await read('claim-trace-route.mjs');
  assert.ok(code.includes('textContent'));
  assert.ok(!code.includes('innerHTML'));
});
test('browser route does not transmit data', async () => {
  const code = await read('claim-trace-route.mjs');
  assert.doesNotMatch(code, /\bfetch\s*\(/u);
  assert.doesNotMatch(code, /\bXMLHttpRequest\b/u);
});
test('browser route does not persist evidence', async () => {
  const code = await read('claim-trace-route.mjs');
  assert.doesNotMatch(code, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u);
});
test('browser route French label uses nonbreaking space', async () => assert.match(await read('claim-trace-route.mjs'), /Langue\\u00a0:/u));
test('all new local imports exist', async () => {
  const modules = ['claim-trace-core.mjs', 'claim-trace-audit.mjs', 'claim-trace-change.mjs', 'claim-trace-report.mjs', 'claim-trace-route.mjs', 'claim-trace-cli.mjs'];
  for (const file of modules) {
    const code = await read(file);
    for (const match of code.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)) await assert.doesNotReject(() => read(match[1].slice(2)), `${file} imports ${match[1]}`);
  }
});
test('README documents actual file and runner names', async () => {
  const text = await read('CLAIM_TRACE_README.md');
  assert.ok(text.includes('claim-trace-cli.mjs'));
  assert.ok(text.includes('claim-trace-*.test.mjs'));
});
