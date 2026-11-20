import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_IDS, SOURCES } from './attribution-utils.mjs';
import { OBLIGATION_SCHEMA } from './obligation-core.mjs';
import { auditObligationRegister } from './obligation-audit.mjs';
import { obligation } from './obligation-fixtures.mjs';
const directory = dirname(fileURLToPath(import.meta.url));
const repo = resolve(directory, '../..');
const file = name => readFile(join(directory, name), 'utf8');
const files = [
  'obligation-core.mjs', 'obligation-index.mjs', 'obligation-audit.mjs', 'obligation-change.mjs',
  'obligation-report.mjs', 'obligation-cli.mjs', 'obligation-route.mjs',
  'obligation-fixtures.mjs', 'obligation-core.test.mjs', 'obligation-audit.test.mjs',
  'obligation-change.test.mjs', 'obligation-report.test.mjs',
  'obligation-cli.test.mjs', 'obligation-wiring.test.mjs',
  'obligation.html', 'obligation.css', 'OBLIGATION_README.md',
];
test('all files the feature claims to ship exist', async () => {
  for (const name of files) await assert.doesNotReject(() => file(name), name);
});
test('all packaged files are regular files, not symlinks', async () => {
  for (const name of files) {
    const info = await lstat(join(directory, name));
    assert.equal(info.isFile(), true, name);
    assert.equal(info.isSymbolicLink(), false, name);
  }
});
test('standalone HTML route loads the actual module', async () => {
  assert.match(await file('obligation.html'), /src="\.\/obligation-route\.mjs"/u);
});
test('standalone HTML route loads its local stylesheet', async () => {
  assert.match(await file('obligation.html'), /href="\.\/obligation\.css"/u);
});
test('direct browser entry imports the stable public barrel', async () => {
  const text = await file('obligation-route.mjs');
  assert.ok(text.includes('./obligation-index.mjs'));
});
test('public barrel exports each executable production module', async () => {
  const text = await file('obligation-index.mjs');
  for (const name of ['obligation-core.mjs', 'obligation-audit.mjs', 'obligation-change.mjs', 'obligation-report.mjs']) assert.ok(text.includes(`./${name}`), name);
});
test('CLI imports the same real logic as the browser entry', async () => {
  const text = await file('obligation-cli.mjs');
  for (const name of ['obligation-core.mjs', 'obligation-audit.mjs', 'obligation-change.mjs', 'obligation-report.mjs']) assert.ok(text.includes(`./${name}`), name);
});
test('audit imports the authoritative merged catalogue', async () => {
  assert.match(await file('obligation-audit.mjs'), /from '\.\/attribution-utils\.mjs'/u);
});
test('core does not embed a competing legal notice catalogue', async () => {
  const text = await file('obligation-core.mjs');
  assert.doesNotMatch(text, /const METROLINX_AUA_LEGEND/u);
  assert.doesNotMatch(text, /const METROLINX_OGL_NOTICE/u);
});
test('supported catalogue contains only OSM, Metrolinx and LTC', () => {
  assert.deepEqual([...SOURCE_IDS], ['osm', 'metrolinx', 'ltc']);
  assert.deepEqual(Object.keys(SOURCES).sort(), ['ltc', 'metrolinx', 'osm']);
});
test('contract schema is exposed and versioned', () => {
  assert.equal(OBLIGATION_SCHEMA, 'attribution-obligation-register/1');
});
test('audit result is actually exercised by tests', () => {
  assert.equal(auditObligationRegister(obligation()).blocked, false);
});
test('HTML has explicit offline-only CSP', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
  assert.ok(html.includes("object-src 'none'"));
});
test('HTML cannot load external executable scripts', async () => {
  const html = await file('obligation.html');
  assert.doesNotMatch(html, /<script[^>]+https?:/iu);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/iu);
});
test('HTML cannot load remote stylesheets or images', async () => {
  const html = await file('obligation.html');
  assert.doesNotMatch(html, /<link[^>]+https?:/iu);
  assert.doesNotMatch(html, /<img\b/iu);
});
test('HTML includes the expected skip-navigation target', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('id="main"'));
});
test('HTML includes semantic main and header', async () => {
  const html = await file('obligation.html');
  assert.match(html, /<main\b/u);
  assert.match(html, /<header\b/u);
});
test('HTML has a labelled language control', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes('for="language"'));
  assert.ok(html.includes('id="language"'));
});
test('HTML has labelled local current register picker', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes('for="current"'));
  assert.ok(html.includes('type="file" id="current"'));
});
test('HTML has labelled local optional baseline picker', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes('for="previous"'));
  assert.ok(html.includes('type="file" id="previous"'));
});
test('HTML has labelled optional EN/FR pair control', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes('for="pairs"'));
  assert.ok(html.includes('type="checkbox" id="pairs"'));
});
test('HTML has status announcement with polite updates', async () => {
  const html = await file('obligation.html');
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('HTML contains no remote data submission form', async () => {
  assert.doesNotMatch(await file('obligation.html'), /<form\b/iu);
});
test('HTML disables all export actions before a file is chosen', async () => {
  const html = await file('obligation.html');
  for (const id of ['save-text', 'save-json', 'save-html', 'print']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*disabled`, 'u'));
  }
});
test('HTML includes English and French language options', async () => {
  const html = await file('obligation.html');
  assert.match(html, /English/u);
  assert.match(html, /Français/u);
});
test('CSS defines minimum 44px target height', async () => {
  assert.match(await file('obligation.css'), /min-height:44px/u);
});
test('CSS defines minimum 44px target width', async () => {
  assert.match(await file('obligation.css'), /min-width:44px/u);
});
test('CSS gives checkbox controls explicit 44px dimensions', async () => {
  const css = await file('obligation.css');
  assert.match(css, /width: 44px/u);
  assert.match(css, /height: 44px/u);
});
test('CSS defines visible keyboard focus', async () => {
  assert.match(await file('obligation.css'), /:focus-visible/u);
});
test('CSS supports reduced motion', async () => {
  assert.match(await file('obligation.css'), /prefers-reduced-motion/u);
});
test('CSS supports forced colours', async () => {
  assert.match(await file('obligation.css'), /forced-colors/u);
});
test('CSS handles small screens', async () => {
  assert.match(await file('obligation.css'), /max-width/u);
});
test('CSS includes print treatment', async () => {
  assert.match(await file('obligation.css'), /@media print/u);
});
test('route uses textContent rather than unsanitised HTML', async () => {
  const script = await file('obligation-route.mjs');
  assert.match(script, /textContent/u);
  assert.doesNotMatch(script, /innerHTML/u);
});
test('route uses File.text rather than remote fetch', async () => {
  const script = await file('obligation-route.mjs');
  assert.match(script, /file\.text\(\)/u);
  assert.doesNotMatch(script, /\bfetch\s*\(/u);
});
test('route does not retain imported evidence in local storage', async () => {
  const script = await file('obligation-route.mjs');
  assert.doesNotMatch(script, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u);
});
test('route uses French no-break space before language colon', async () => {
  assert.ok((await file('obligation-route.mjs')).includes('Langue\\u00a0:'));
});
test('route preserves comparison when language changes', async () => {
  const script = await file('obligation-route.mjs');
  assert.ok(script.includes('state.comparison'));
  assert.ok(script.includes('if (state.current)'));
});
test('changing pair check recalculates audit and comparison', async () => {
  const script = await file('obligation-route.mjs');
  assert.ok(script.includes("get('pairs').addEventListener('change'"));
  assert.ok(script.includes('compareObligationRegisters(state.before, state.current, option)'));
});
test('CLI has exact source executable rather than an absent compiled .js file', async () => {
  assert.ok((await file('obligation-cli.mjs')).includes('isEntry()'));
});
test('local relative imports exist throughout all executable modules', async () => {
  const names = files.filter(name => name.endsWith('.mjs'));
  for (const name of names) {
    const text = await file(name);
    for (const match of text.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)) {
      await assert.doesNotReject(() => file(match[1].slice(2)), `${name} -> ${match[1]}`);
    }
  }
});
test('README references the actual local CLI and route names', async () => {
  const markdown = await file('OBLIGATION_README.md');
  assert.ok(markdown.includes('obligation-cli.mjs'));
  assert.ok(markdown.includes('obligation.html'));
});
test('README documents the existing root Node test pattern', async () => {
  const markdown = await file('OBLIGATION_README.md');
  assert.ok(markdown.includes('node --test docs/attribution/*.test.mjs'));
});
test('root test script discovers these tests automatically', async () => {
  const packageText = await readFile(join(repo, 'package.json'), 'utf8');
  const pkg = JSON.parse(packageText);
  assert.ok(pkg.scripts.test.includes('node --test docs/attribution/*.test.mjs'));
});
test('no package edit or new external dependency is required', async () => {
  const packageText = await readFile(join(repo, 'package.json'), 'utf8');
  const pkg = JSON.parse(packageText);
  assert.equal(pkg.type, 'module');
});

test('public barrel exports contract and audit functions for the live route', async () => {
  const module = await import('./obligation-index.mjs');
  assert.equal(typeof module.parseObligationRegister, 'function');
  assert.equal(typeof module.auditObligationRegister, 'function');
});
test('public barrel exports change and report functions', async () => {
  const module = await import('./obligation-index.mjs');
  assert.equal(typeof module.compareObligationRegisters, 'function');
  assert.equal(typeof module.renderObligationReport, 'function');
});
test('importing the public barrel performs no automatic file reading', () => {
  const script = `import('./obligation-index.mjs')`;
  assert.doesNotMatch(script, /readFile/u);
});
