import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { copy, localeKeys } from './report.mjs';
import { keysAligned } from './app.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const app = readFileSync(join(ROOT, 'app.mjs'), 'utf8');

function hasId(id) { return html.includes(`id="${id}"`); }

describe('offline page accessibility and locale coverage', () => {
  it('includes a document language', () => assert.match(html, /<html lang="en">/u));
  it('includes viewport for small screens', () => assert.match(html, /name="viewport"/u));
  it('includes native page landmark', () => assert.match(html, /<main id="review">/u));
  it('includes a first-level heading', () => assert.match(html, /<h1 id="heading">/u));
  it('includes a keyboard skip link', () => assert.match(html, /class="skip"/u));
  it('skip link targets main element', () => assert.match(html, /href="#review"/u));
  it('loads source as an ES module', () => assert.match(html, /type="module" src="\.\/app\.mjs"/u));
  it('loads only local stylesheet', () => assert.match(html, /href="\.\/styles\.css"/u));
  it('uses strict default CSP', () => assert.match(html, /default-src 'none'/u));
  it('does not allow browser connection requests', () => assert.match(html, /connect-src 'none'/u));
  it('does not allow external iframe content', () => assert.match(html, /frame-src 'none'/u));
  it('does not allow form posts', () => assert.match(html, /form-action 'none'/u));
  it('does not include remote script hosts', () => assert.doesNotMatch(html, /<script[^>]+https?:/u));
  it('does not include embedded images', () => assert.doesNotMatch(html, /<img\b/u));
  for (const field of ['current', 'previous', 'policy']) {
    it(`provides a labelled ${field} file input`, () => {
      assert.ok(hasId(`${field}-file`));
      assert.ok(html.includes(`for="${field}-file"`));
    });
  }
  for (const action of ['audit', 'compare', 'reset', 'exportJson', 'exportCsv']) {
    it(`provides a native ${action} button`, () => {
      assert.match(html, new RegExp(`<button id="action-${action}" type="button">`, 'u'));
    });
  }
  it('provides an aria-live report status', () => assert.match(html, /id="status" role="status" aria-live="polite"/u));
  it('provides a report error surface', () => assert.match(html, /id="error" role="alert"/u));
  it('provides a findings list', () => assert.match(html, /<ol id="findings"/u));
  it('provides a source summary', () => assert.match(html, /<ul id="summary"/u));
  it('exposes a native language selector', () => assert.ok(hasId('language-select')));
  it('exposes a native finding filter', () => assert.ok(hasId('filter-select')));
  it('hides previous-release controls during initial audit', () => assert.match(html, /id="previous-field" hidden/u));
  it('hides removal policy input during initial audit', () => assert.match(html, /id="policy-field" hidden/u));
  it('requires 44px minimum targets', () => assert.match(css, /min-height: 44px; min-width: 44px;/u));
  it('uses visible keyboard focus', () => assert.match(css, /:focus-visible/u));
  it('uses a three-pixel focus outline', () => assert.match(css, /outline: 3px/u));
  it('supports reduced-motion settings', () => assert.match(css, /prefers-reduced-motion/u));
  it('supports forced-colour settings', () => assert.match(css, /forced-colors: active/u));
  it('does not provide a remote upload API', () => assert.doesNotMatch(app, /fetch\(/u));
  it('does not use background polling', () => assert.doesNotMatch(app, /setInterval\(/u));
  it('does not store user notes persistently', () => assert.doesNotMatch(app, /localStorage|sessionStorage/u));
  it('uses document textContent for findings', () => assert.match(app, /node\.textContent = String\(text\)/u));
  it('does not insert HTML from source data', () => assert.doesNotMatch(app, /innerHTML\s*=/u));
  it('includes all locale keys', () => assert.equal(keysAligned(), true));
  it('has one English local-files heading', () => assert.equal(copy('en').localFiles, 'Local files'));
  it('has a French local-files heading', () => assert.equal(copy('fr').localFiles, 'Fichiers locaux'));
  it('has a French skip-link label', () => assert.equal(copy('fr').skip, 'Aller à l’examen'));
  it('has a French report heading', () => assert.equal(copy('fr').reviewFindings, 'Examiner les résultats'));
  it('updates all three page headings', () => {
    for (const key of ['heading', 'input-heading', 'report-heading']) {
      assert.ok(app.includes(`replaceText(doc, '${key}',`));
    }
  });
  it('updates the page language when switched', () => assert.match(app, /doc\.documentElement\.lang = data\.locale/u));
  it('preserves literal UNKNOWN in both locales', () => {
    assert.equal(copy('en').unknown, 'UNKNOWN');
    assert.equal(copy('fr').unknown, 'UNKNOWN');
  });
  it('preserves the same locale key order', () => assert.deepEqual(localeKeys().en, localeKeys().fr));
});
