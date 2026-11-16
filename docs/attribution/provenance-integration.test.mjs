import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { RULES } from './provenance-audit.mjs';
import { WORDS, RULE_DESCRIPTIONS_FR, EN_RULE_DESCRIPTIONS,
  ruleDescription, localeFor, providerName, useName } from './provenance-messages.mjs';

const source = async (name) => readFile(new URL(name, import.meta.url), 'utf8');

describe('live route wiring', () => {
  it('publishes a standalone HTML page', async () => {
    const html = await source('provenance.html');
    assert.match(html, /<html lang="en">/u);
    assert.match(html, /id="provenance-root"/u);
    assert.match(html, /id="main-content"/u);
  });
  it('loads the actual browser entry point', async () => {
    const html = await source('provenance.html');
    assert.match(html, /src="provenance-route\.mjs"/u);
  });
  it('loads both shared and local CSS files', async () => {
    const html = await source('provenance.html');
    assert.match(html, /href="attribution\.css"/u);
    assert.match(html, /href="provenance\.css"/u);
  });
  it('blocks script network connections through CSP', async () => {
    const html = await source('provenance.html');
    assert.match(html, /connect-src 'none'/u);
    assert.match(html, /form-action 'none'/u);
    assert.match(html, /default-src 'none'/u);
  });
  it('uses only local script references', async () => {
    const html = await source('provenance.html');
    assert.ok(!/<script[^>]+src="https?:/iu.test(html));
  });
  it('provides a keyboard skip target', async () => {
    const html = await source('provenance.html');
    assert.match(html, /href="#main-content"/u);
  });
  it('retains EN and FR no-script fallback content', async () => {
    const html = await source('provenance.html');
    assert.match(html, /Dataset provenance workbench/u);
    assert.match(html, /Atelier de provenance des données/u);
    assert.match(html, /lang="fr"/u);
  });
  it('links back to attribution', async () => {
    const html = await source('provenance.html');
    assert.match(html, /href="index\.html"/u);
  });
  it('links the workbench from the existing attribution route', async () => {
    const route = await source('route.mjs');
    assert.match(route, /workbench\.href = 'provenance\.html'/u);
  });
  it('loads core logic into the live route', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /from '\.\/provenance-core\.mjs'/u);
  });
  it('loads the release audit into the live route', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /from '\.\/provenance-audit\.mjs'/u);
  });
  it('loads bilingual strings into the live route', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /from '\.\/provenance-messages\.mjs'/u);
  });
  it('loads shared audit modules into the CLI', async () => {
    const cli = await source('provenance-cli.mjs');
    assert.match(cli, /from '\.\/provenance-core\.mjs'/u);
    assert.match(cli, /from '\.\/provenance-audit\.mjs'/u);
  });
  it('does not send inventory data via fetch', async () => {
    const route = await source('provenance-route.mjs');
    assert.ok(!/\bfetch\s*\(/u.test(route));
    assert.ok(!/\bXMLHttpRequest\b/u.test(route));
    assert.ok(!/\bsendBeacon\b/u.test(route));
  });
  it('never writes register contents to browser storage', async () => {
    const route = await source('provenance-route.mjs');
    assert.ok(!/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u.test(route));
  });
  it('uses textContent rather than raw HTML injection', async () => {
    const route = await source('provenance-route.mjs');
    assert.ok(!/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/u.test(route));
  });
  it('requires a user-selected local file for import', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /file\.type = 'file'/u);
    assert.match(route, /chosen\.size > MAX_DOCUMENT_BYTES/u);
    assert.match(route, /parseInventoryText\(await chosen\.text\(\)\)/u);
  });
  it('does not automatically include a blank record', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /inventory: emptyInventory\(\)/u);
  });
  it('deliberately exports to a downloadable file', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /anchor\.download = filename/u);
    assert.match(route, /URL\.revokeObjectURL/u);
  });
});

describe('accessibility and translation audits', () => {
  it('every English label also has a French value', () => {
    assert.deepEqual(Object.keys(WORDS.en).sort(), Object.keys(WORDS.fr).sort());
  });
  it('all bilingual labels are nonempty strings', () => {
    for (const language of ['en', 'fr']) {
      for (const [key, value] of Object.entries(WORDS[language])) {
        assert.equal(typeof value, 'string', `${language}.${key}`);
        assert.ok(value.trim().length > 0, `${language}.${key}`);
      }
    }
  });
  it('all audit rule codes have French descriptions', () => {
    assert.deepEqual(Object.keys(RULES).sort(), Object.keys(RULE_DESCRIPTIONS_FR).sort());
  });
  it('all audit rule codes have English descriptions', () => {
    assert.deepEqual(Object.keys(RULES).sort(), Object.keys(EN_RULE_DESCRIPTIONS).sort());
  });
  it('French descriptions do not fall back to English', () => {
    for (const code of Object.keys(RULES)) {
      assert.equal(ruleDescription('fr', code), RULE_DESCRIPTIONS_FR[code]);
    }
  });
  it('English descriptions match release gate explanations', () => {
    for (const [code, text] of Object.entries(RULES)) {
      assert.equal(ruleDescription('en', code), text);
    }
  });
  it('normalizes locale from regional French', () => {
    assert.equal(localeFor('fr-CA'), 'fr');
    assert.equal(localeFor('EN-ca'), 'en');
  });
  it('keeps provider names available in French', () => {
    assert.equal(providerName('fr', 'ltc'), 'London Transit Commission');
  });
  it('translates use categories', () => {
    assert.equal(useName('fr', 'map'), WORDS.fr.map);
    assert.equal(useName('fr', 'other'), WORDS.fr.useOther);
  });
  it('does not include overclaims in new user labels', () => {
    const text = Object.values(WORDS).flatMap((bundle) => Object.values(bundle)).join(' ');
    assert.ok(!/\bverified\b|\bvérifié\b|\breal-time\b|\bpartnership\b|\bguarantee\b/iu.test(text));
  });
  it('uses curly French apostrophes', () => {
    const text = Object.values(WORDS.fr).join(' ');
    assert.ok(!/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/u.test(text));
  });
  it('uses nonbreaking spaces before French colons', () => {
    const values = [...Object.values(WORDS.fr), ...Object.values(RULE_DESCRIPTIONS_FR)];
    assert.ok(values.every((text) => !/(?<!\u00a0):/u.test(text)));
  });
  it('uses narrow nonbreaking spaces before French punctuation', () => {
    const values = [...Object.values(WORDS.fr), ...Object.values(RULE_DESCRIPTIONS_FR)];
    assert.ok(values.every((text) => !/(?<!\u202f)[;!?]/u.test(text)));
  });
  it('styles every interactive input with a 44px minimum', async () => {
    const css = await source('provenance.css');
    assert.match(css, /\.provenance-field input, \.provenance-field select,/u);
    assert.match(css, /min-height: 44px/u);
    assert.match(css, /min-width: 44px/u);
  });
  it('provides explicit focus indicators', async () => {
    const css = await source('provenance.css');
    assert.match(css, /:focus-visible/u);
    assert.match(css, /outline: 3px solid/u);
  });
  it('keeps table semantics on small screens', async () => {
    const css = await source('provenance.css');
    assert.ok(!/\.provenance-table\s*,\s*\.provenance-table tbody/u.test(css));
    assert.match(css, /overflow-x: auto/u);
  });
  it('respects reduced-motion preference', async () => {
    const css = await source('provenance.css');
    assert.match(css, /prefers-reduced-motion: reduce/u);
  });
  it('provides a print mode that hides editing controls', async () => {
    const css = await source('provenance.css');
    assert.match(css, /@media print/u);
    assert.match(css, /\.provenance-editor/u);
  });
  it('builds form labels and associates them with inputs', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /labelNode\.htmlFor = id/u);
    assert.match(route, /label\.htmlFor = id/u);
  });
  it('announces import failures without discarding the register', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /state\.inventory = parsed/u);
    assert.match(route, /words\.importedFailure/u);
    assert.match(route, /aria-live', 'polite'/u);
  });
});
