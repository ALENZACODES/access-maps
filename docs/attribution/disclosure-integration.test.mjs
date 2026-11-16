import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DISCLOSURE_WORDS, DISCLOSURE_RULES_FR, disclosureLocale,
  disclosureWords, disclosureRule, disclosureSeverity,
} from './disclosure-messages.mjs';
import { DISCLOSURE_RULES } from './disclosure-audit.mjs';
import { SURFACE_KINDS, SURFACE_STATES, DELIVERY } from './disclosure-core.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const source = (name) => readFile(join(directory, name), 'utf8');

function failOnForbiddenText(text) {
  assert.ok(!/\b(?:verified|verify|vérifié|real-time|partnership|guarantee)\b/iu.test(text));
  assert.ok(!/\bscio\b|sciontario|Spinal Cord Injury Ontario/iu.test(text));
}

describe('browser route deployment wiring', () => {
  it('exposes an actual standalone HTML route', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /id="disclosure-root"/u);
    assert.match(html, /id="main-content"/u);
  });
  it('loads the route module as an ES module', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /type="module" src="disclosure-route\.mjs"/u);
  });
  it('loads page-specific and shared style sheets', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /href="attribution\.css"/u);
    assert.match(html, /href="disclosure\.css"/u);
  });
  it('does not require a network connection to start', async () => {
    const html = await source('disclosure.html');
    assert.ok(!/<script[^>]+src="https?:/iu.test(html));
    assert.ok(!/<link[^>]+href="https?:/iu.test(html));
  });
  it('blocks connections in the page CSP', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /connect-src 'none'/u);
    assert.match(html, /form-action 'none'/u);
    assert.match(html, /object-src 'none'/u);
    assert.match(html, /base-uri 'none'/u);
  });
  it('offers a keyboard skip link', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /class="skip"/u);
    assert.match(html, /href="#main-content"/u);
  });
  it('includes a non-script bilingual fallback', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /Publication surface register/u);
    assert.match(html, /Registre des surfaces de publication/u);
    assert.match(html, /lang="fr"/u);
  });
  it('is linked from the source page navigation', async () => {
    const route = await source('route.mjs');
    assert.match(route, /publication\.href = 'disclosure\.html'/u);
  });
  it('is linked from the dataset workbench navigation', async () => {
    const route = await source('provenance-route.mjs');
    assert.match(route, /publication\.href = 'disclosure\.html'/u);
  });
  it('imports live source contracts into the new route', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /from '\.\/provenance-core\.mjs'/u);
    assert.match(route, /from '\.\/disclosure-core\.mjs'/u);
    assert.match(route, /from '\.\/disclosure-audit\.mjs'/u);
    assert.match(route, /from '\.\/disclosure-messages\.mjs'/u);
  });
  it('wires the release gate to user interaction', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /state\.report = auditDisclosures\(/u);
    assert.match(route, /button\(doc, w\.audit/u);
  });
  it('wires text-only reports to an explicit export', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /disclosureReportText\(state\.report\)/u);
    assert.match(route, /saveFile\(/u);
  });
  it('wires local import to the strict parser', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /parseInventoryText/u);
    assert.match(route, /parseRegisterText/u);
    assert.match(route, /parseReleasePackageText/u);
  });
  it('does not request data from a remote service', async () => {
    for (const name of ['disclosure-route.mjs', 'disclosure-core.mjs', 'disclosure-audit.mjs']) {
      const route = await source(name);
      assert.ok(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b/u.test(route), name);
    }
  });
  it('does not use browser storage', async () => {
    const route = await source('disclosure-route.mjs');
    assert.ok(!/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u.test(route));
  });
  it('does not introduce script-driven HTML injection', async () => {
    const route = await source('disclosure-route.mjs');
    assert.ok(!/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/u.test(route));
  });
  it('uses a constrained local app route schema', async () => {
    const core = await source('disclosure-core.mjs');
    assert.match(core, /ROUTE_PATH/u);
    assert.match(core, /INVALID_ROUTE/u);
  });
  it('does not automatically include a newly created surface', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /blankSurface\(\)/u);
    const core = await source('disclosure-core.mjs');
    assert.match(core, /state: 'held'/u);
  });
  it('does not submit user data to a server', async () => {
    const route = await source('disclosure-route.mjs');
    assert.ok(!/method\s*=\s*['"]post|\.submit\(\)|action\s*=\s*['"]https?:/iu.test(route));
  });
  it('refuses oversized selected files', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /file\.size > maxBytes/u);
  });
  it('provides clear selection and audit actions', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /addEventListener\('submit'/u);
    assert.match(route, /addEventListener\('click'/u);
  });
  it('does not insert tracking or tile servers', async () => {
    const html = await source('disclosure.html');
    assert.ok(!/maps\.googleapis|tile\.openstreetmap|mapbox|analytics/u.test(html));
  });
});

describe('language and interaction audits', () => {
  it('has identical English and French key sets', () => {
    assert.deepEqual(Object.keys(DISCLOSURE_WORDS.en).sort(), Object.keys(DISCLOSURE_WORDS.fr).sort());
  });
  it('has a French translation for every finding code', () => {
    assert.deepEqual(Object.keys(DISCLOSURE_RULES).sort(), Object.keys(DISCLOSURE_RULES_FR).sort());
  });
  it('has no empty UI string', () => {
    for (const [locale, values] of Object.entries(DISCLOSURE_WORDS)) {
      for (const [key, value] of Object.entries(values)) {
        assert.equal(typeof value, 'string', `${locale}.${key}`);
        assert.ok(value.trim().length > 0, `${locale}.${key}`);
      }
    }
  });
  it('has no empty translated rule', () => {
    for (const value of Object.values(DISCLOSURE_RULES_FR)) {
      assert.ok(value.trim().length > 0);
    }
  });
  it('normalizes French regional locales', () => {
    assert.equal(disclosureLocale('fr-CA'), 'fr');
    assert.equal(disclosureLocale('en-CA'), 'en');
  });
  it('does not change UNKNOWN when switching languages', () => {
    assert.equal(disclosureWords('en').UNKNOWN, 'UNKNOWN');
    assert.equal(disclosureWords('fr').UNKNOWN, 'UNKNOWN');
  });
  it('retrieves the selected language for a finding', () => {
    assert.equal(disclosureRule('fr', 'TARGET_TOO_SMALL'), DISCLOSURE_RULES_FR.TARGET_TOO_SMALL);
    assert.equal(disclosureRule('en', 'TARGET_TOO_SMALL'), DISCLOSURE_RULES.TARGET_TOO_SMALL);
  });
  it('translates finding severities', () => {
    assert.equal(disclosureSeverity('fr', 'error'), DISCLOSURE_WORDS.fr.errors);
    assert.equal(disclosureSeverity('en', 'warning'), DISCLOSURE_WORDS.en.warnings);
  });
  it('uses typographic apostrophes for French words', () => {
    const phrases = [...Object.values(DISCLOSURE_WORDS.fr), ...Object.values(DISCLOSURE_RULES_FR)];
    assert.ok(phrases.every((value) => !/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/u.test(value)));
  });
  it('uses required nonbreaking spaces before French colons', () => {
    const phrases = [...Object.values(DISCLOSURE_WORDS.fr), ...Object.values(DISCLOSURE_RULES_FR)];
    assert.ok(phrases.every((value) => !/(?<!\u00a0):/u.test(value)));
  });
  it('uses narrow nonbreaking space before French question marks', () => {
    const phrases = [...Object.values(DISCLOSURE_WORDS.fr), ...Object.values(DISCLOSURE_RULES_FR)];
    assert.ok(phrases.every((value) => !/(?<!\u202f)[;!?]/u.test(value)));
  });
  it('never uses prohibited language in user-facing copy', () => {
    failOnForbiddenText([...Object.values(DISCLOSURE_WORDS.en),
      ...Object.values(DISCLOSURE_WORDS.fr),
      ...Object.values(DISCLOSURE_RULES_FR)].join(' '));
  });
  it('has 44-pixel button dimensions', async () => {
    const css = await source('disclosure.css');
    assert.match(css, /min-height: 44px/u);
    assert.match(css, /min-width: 44px/u);
  });
  it('gives links a 44-pixel target', async () => {
    const css = await source('disclosure.css');
    assert.match(css, /nav a \{ min-height: 44px/u);
  });
  it('has keyboard focus indicators', async () => {
    const css = await source('disclosure.css');
    assert.match(css, /:focus-visible/u);
    assert.match(css, /outline: 3px/u);
  });
  it('supports reduced-motion preferences', async () => {
    const css = await source('disclosure.css');
    assert.match(css, /prefers-reduced-motion/u);
  });
  it('supports high-contrast platform colors without remote fonts', async () => {
    const html = await source('disclosure.html');
    assert.match(html, /color-scheme/u);
    assert.match(html, /font-src 'none'/u);
  });
  it('allows full wrapping rather than viewport overflow for long licences', async () => {
    const css = await source('disclosure.css');
    assert.match(css, /overflow-wrap: anywhere/u);
  });
  it('shows source dates explicitly in the live cards', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /words\.sourceDateLabel/u);
    assert.match(route, /surface\.sourceDate/u);
  });
  it('keeps user-generated text in textContent', async () => {
    const route = await source('disclosure-route.mjs');
    assert.match(route, /element\.textContent = String\(options\.text\)/u);
  });
  it('renders every kind and state with a label', () => {
    for (const locale of ['en', 'fr']) {
      const words = disclosureWords(locale);
      for (const kind of SURFACE_KINDS) assert.ok(words[kind]);
      for (const state of SURFACE_STATES) assert.ok(words[state]);
      for (const mode of DELIVERY) assert.ok(words[mode]);
    }
  });
});
