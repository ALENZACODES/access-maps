import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  SOURCE_IDS,
  SOURCES,
  UNKNOWN,
  MESSAGES,
  MAX_QUERY_LENGTH,
  METROLINX_AUA_LEGEND,
  METROLINX_OGL_NOTICE,
  normalizeLocale,
  isSourceId,
  normalizeSources,
  parseSelection,
  serializeSelection,
  toggleSource,
  presentation,
  countLabel,
  safeExternalUrl,
  exportText,
  exportFilename,
  noNetworkRequired,
} from './attribution-utils.mjs';

const pathToHtml = new URL('./index.html', import.meta.url);
const pathToRoute = new URL('./route.mjs', import.meta.url);
const pathToStyle = new URL('./attribution.css', import.meta.url);
const pathToCatalogue = new URL('./index.ts', import.meta.url);

function sameMembers(a, b) {
  assert.deepEqual(new Set(a), new Set(b));
}

test('catalogue exposes exactly three known providers', () => {
  assert.deepEqual(SOURCE_IDS, ['osm', 'metrolinx', 'ltc']);
  sameMembers(Object.keys(SOURCES), SOURCE_IDS);
  assert.equal(Object.isFrozen(SOURCES), true);
});

test('each provider has permanent explicit source and licence URLs', () => {
  for (const id of SOURCE_IDS) {
    assert.equal(SOURCES[id].id, id);
    assert.ok(SOURCES[id].name.length > 0);
    assert.ok(SOURCES[id].licence.length > 0);
    assert.ok(safeExternalUrl(SOURCES[id].sourceUrl));
    assert.ok(safeExternalUrl(SOURCES[id].licenceUrl));
    assert.equal(SOURCES[id].datasetAsOf, UNKNOWN);
    assert.equal(SOURCES[id].reviewed, '2026-11-15');
  }
});

test('all public interface labels exist in both locales', () => {
  const english = Object.keys(MESSAGES.en);
  const french = Object.keys(MESSAGES.fr);
  assert.deepEqual(english.sort(), french.sort());
  for (const key of english) {
    assert.ok(MESSAGES.en[key].trim().length > 0, `Missing English ${key}`);
    assert.ok(MESSAGES.fr[key].trim().length > 0, `Missing French ${key}`);
  }
});

test('french public strings use typographic apostrophes', () => {
  for (const [key, value] of Object.entries(MESSAGES.fr)) {
    assert.equal(value.includes("'"), false, key);
  }
  for (const id of SOURCE_IDS) {
    assert.equal(SOURCES[id].notes.fr.includes("'"), false, id);
    for (const notice of SOURCES[id].notices.fr) {
      // The prescribed English legal notices are deliberately exempt.
      if (id === 'metrolinx') continue;
      assert.equal(notice.includes("'"), false, id);
    }
  }
});

test('french question and exclamation marks use narrow spaces', () => {
  for (const value of Object.values(MESSAGES.fr)) {
    assert.doesNotMatch(value, /(?<!\u202f)[!?;]/u);
  }
});

test('locale normalisation is deliberately limited to English and French', () => {
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('fr'), 'fr');
  assert.equal(normalizeLocale('fr-CA'), 'fr');
  assert.equal(normalizeLocale('FR_CA'), 'fr');
  assert.equal(normalizeLocale('en-CA'), 'en');
  assert.equal(normalizeLocale('es'), 'en');
  assert.equal(normalizeLocale(''), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(normalizeLocale(null), 'en');
  assert.equal(normalizeLocale({}), 'en');
});

test('source guard rejects prototype keys and synthetic identifiers', () => {
  for (const id of SOURCE_IDS) assert.equal(isSourceId(id), true);
  for (const id of ['constructor', '__proto__', 'prototype', 'OSM', 'other', '', null, 1]) {
    assert.equal(isSourceId(id), false);
  }
});

test('normalising an untrusted source list retains order and deduplicates', () => {
  assert.deepEqual(normalizeSources(['ltc', 'osm', 'ltc', 'metrolinx']), {
    selected: ['ltc', 'osm', 'metrolinx'],
    rejected: [],
  });
});

test('invalid source identifiers are not silently upgraded to known data', () => {
  const result = normalizeSources(['osm', 'other', '__proto__', 99, null]);
  assert.deepEqual(result.selected, ['osm']);
  assert.deepEqual(result.rejected, ['other', '__proto__', '99', 'null']);
});

test('non-array input normalises to an empty selection', () => {
  assert.deepEqual(normalizeSources('osm'), { selected: [], rejected: [] });
  assert.deepEqual(normalizeSources(null), { selected: [], rejected: [] });
  assert.deepEqual(normalizeSources({}), { selected: [], rejected: [] });
});

test('query parses comma-separated identifiers', () => {
  const parsed = parseSelection('?lang=fr&sources=osm%2Cltc');
  assert.equal(parsed.locale, 'fr');
  assert.deepEqual(parsed.selected, ['osm', 'ltc']);
  assert.equal(parsed.explicit, true);
});

test('query parses repeated source keys and removes duplicates', () => {
  const parsed = parseSelection('?sources=osm&sources=ltc&sources=osm');
  assert.deepEqual(parsed.selected, ['osm', 'ltc']);
  assert.deepEqual(parsed.rejected, []);
});

test('query records unknown provider tokens instead of pretending they exist', () => {
  const parsed = parseSelection('?sources=osm,missing,constructor');
  assert.deepEqual(parsed.selected, ['osm']);
  assert.deepEqual(parsed.rejected, ['missing', 'constructor']);
});

test('explicit empty selection is distinguishable from missing parameter', () => {
  const explicit = parseSelection('?sources=&lang=en');
  const absent = parseSelection('?lang=en');
  assert.equal(explicit.explicit, true);
  assert.equal(absent.explicit, false);
  assert.deepEqual(explicit.selected, []);
  assert.deepEqual(absent.selected, []);
});

test('overlong query cannot create a huge selection or status message', () => {
  const parsed = parseSelection('?sources=' + 'a'.repeat(MAX_QUERY_LENGTH));
  assert.deepEqual(parsed.selected, []);
  assert.deepEqual(parsed.rejected, ['invalid-query']);
});

test('non-string query cannot generate provider entries', () => {
  assert.deepEqual(parseSelection(null).selected, []);
  assert.deepEqual(parseSelection({}).selected, []);
});

test('serialization retains locale and selected sources', () => {
  for (const locale of ['en', 'fr']) {
    const query = serializeSelection(locale, ['ltc', 'osm']);
    const parsed = parseSelection(query);
    assert.equal(parsed.locale, locale);
    assert.deepEqual(parsed.selected, ['ltc', 'osm']);
    assert.equal(parsed.explicit, true);
  }
});

test('serialization strips unrecognised provider IDs', () => {
  const parsed = parseSelection(serializeSelection('fr', ['other', 'osm', 'osm']));
  assert.deepEqual(parsed.selected, ['osm']);
  assert.deepEqual(parsed.rejected, []);
});

test('toggle adds a provider once, never infers additional providers', () => {
  assert.deepEqual(toggleSource([], 'osm', true), ['osm']);
  assert.deepEqual(toggleSource(['osm'], 'osm', true), ['osm']);
  assert.deepEqual(toggleSource(['osm'], 'other', true), ['osm']);
});

test('toggle removes only the requested source', () => {
  assert.deepEqual(toggleSource(['osm', 'ltc'], 'osm', false), ['ltc']);
  assert.deepEqual(toggleSource(['osm', 'ltc'], 'metrolinx', false), ['osm', 'ltc']);
});

test('presentation does not mutate caller-owned source arrays', () => {
  const selected = ['osm', 'ltc'];
  const before = [...selected];
  const page = presentation('fr', selected);
  assert.deepEqual(selected, before);
  assert.deepEqual(page.sources.map((s) => s.id), before);
});

test('presentation cannot turn UNKNOWN into a calendar date', () => {
  for (const locale of ['en', 'fr']) {
    const page = presentation(locale, SOURCE_IDS);
    for (const source of page.sources) {
      assert.equal(source.datasetAsOf, 'UNKNOWN');
      assert.equal(source.reviewed, '2026-11-15');
    }
  }
});

test('empty selection does not default to all sources', () => {
  assert.deepEqual(presentation('en', []).sources, []);
  assert.deepEqual(presentation('fr', []).sources, []);
});

test('Metrolinx AUA legend remains exact and unmodified in both locales', () => {
  for (const locale of ['en', 'fr']) {
    const record = presentation(locale, ['metrolinx']).sources[0];
    assert.equal(record.notices[0], METROLINX_AUA_LEGEND);
    assert.equal(record.notices[1], METROLINX_OGL_NOTICE);
  }
});

test('Metrolinx terms and OGL references remain distinct', () => {
  const [record] = presentation('en', ['metrolinx']).sources;
  assert.notEqual(record.sourceUrl, record.licenceUrl);
  assert.match(record.sourceUrl, /software-developers/u);
  assert.match(record.licenceUrl, /Open-Government-Licence/u);
  assert.equal(record.notices.length, 2);
});

test('OpenStreetMap notice remains present in both locales', () => {
  for (const locale of ['en', 'fr']) {
    const [record] = presentation(locale, ['osm']).sources;
    assert.match(record.notices[0], /OpenStreetMap contributors/u);
    assert.match(record.notices[0], /ODbL/u);
  }
});

test('LTC credit does not imply an institutional relationship', () => {
  for (const locale of ['en', 'fr']) {
    const [record] = presentation(locale, ['ltc']).sources;
    assert.match(record.licenceUrl, /ltcs-open-data-terms-of-use/u);
    assert.ok(record.notices.length >= 1);
  }
});

test('count labels are translated and use singular forms', () => {
  assert.equal(countLabel('en', 1), '1 source selected');
  assert.equal(countLabel('en', 2), '2 sources selected');
  assert.equal(countLabel('fr', 1), '1 source sélectionnée');
  assert.equal(countLabel('fr', 0), '0 sources sélectionnées');
});

test('outbound link guard permits only HTTPS URLs without credentials', () => {
  assert.equal(safeExternalUrl('https://example.org/abc'), 'https://example.org/abc');
  for (const url of ['http://example.org', 'javascript:alert(1)',
    'data:text/html,hi', 'file:///etc/passwd', '/relative',
    'https://name:secret@example.org/', '', null, 22]) {
    assert.equal(safeExternalUrl(url), null, String(url));
  }
});

test('export contains only selected source sections', () => {
  const content = exportText('en', ['osm']);
  assert.match(content, /## OpenStreetMap/u);
  assert.doesNotMatch(content, /## Metrolinx/u);
  assert.doesNotMatch(content, /## London Transit/u);
});

test('text export contains full required legal notices', () => {
  for (const locale of ['en', 'fr']) {
    const content = exportText(locale, ['metrolinx']);
    assert.ok(content.includes(METROLINX_AUA_LEGEND));
    assert.ok(content.includes(METROLINX_OGL_NOTICE));
    assert.ok(content.includes('UNKNOWN'));
  }
});

test('exported source sections have complete provenance links', () => {
  const content = exportText('en', SOURCE_IDS);
  for (const id of SOURCE_IDS) {
    assert.ok(content.includes(SOURCES[id].sourceUrl));
    assert.ok(content.includes(SOURCES[id].licenceUrl));
    assert.ok(content.includes(SOURCES[id].reviewed));
  }
});

test('an empty export explicitly says no providers were selected', () => {
  for (const locale of ['en', 'fr']) {
    const content = exportText(locale, []);
    assert.ok(content.includes(MESSAGES[locale].selectedNone));
  }
});

test('export filenames have no dynamic untrusted path fragments', () => {
  assert.equal(exportFilename('en'), 'sources-licences-en.txt');
  assert.equal(exportFilename('fr'), 'sources-licences-fr.txt');
  assert.equal(exportFilename('../../etc'), 'sources-licences-en.txt');
});

test('no direct network request is required for rendering catalogue data', () => {
  assert.equal(noNetworkRequired(), true);
});

test('route is directly linked to the production browser module', async () => {
  const html = await readFile(pathToHtml, 'utf8');
  assert.match(html, /<script type="module" src="route\.mjs"><\/script>/u);
  assert.match(html, /id="attribution-root"/u);
  assert.match(html, /href="attribution\.css"/u);
});

test('browser route imports real shared utilities rather than a test-only copy', async () => {
  const code = await readFile(pathToRoute, 'utf8');
  assert.match(code, /from '\.\/attribution-utils\.mjs'/u);
  assert.match(code, /export function mountAttribution/u);
  assert.match(code, /mountAttribution\(document, window\)/u);
});

test('browser route does not fetch or post source selections', async () => {
  const code = await readFile(pathToRoute, 'utf8');
  assert.doesNotMatch(code, /\bfetch\s*\(/u);
  assert.doesNotMatch(code, /\bXMLHttpRequest\b/u);
  assert.doesNotMatch(code, /\bsendBeacon\s*\(/u);
  assert.doesNotMatch(code, /\blocalStorage\b/u);
});

test('HTML has strict network CSP and explicit no-referrer policy', async () => {
  const html = await readFile(pathToHtml, 'utf8');
  assert.match(html, /connect-src 'none'/u);
  assert.match(html, /object-src 'none'/u);
  assert.match(html, /name="referrer" content="no-referrer"/u);
});

test('route contains an actual landmark and language declaration', async () => {
  const html = await readFile(pathToHtml, 'utf8');
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /<main id="main-content">/u);
  assert.match(html, /class="skip" href="#main-content"/u);
});

test('route styles protect keyboard focus visibility and 44px controls', async () => {
  const css = await readFile(pathToStyle, 'utf8');
  assert.match(css, /min-height: 44px/u);
  assert.match(css, /min-width: 44px/u);
  assert.match(css, /focus-visible/u);
  assert.match(css, /outline: 3px/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /prefers-color-scheme/u);
});

test('original TypeScript catalogue preserves the same required notices', async () => {
  const code = await readFile(pathToCatalogue, 'utf8');
  assert.match(code, /METROLINX_AUA_SECTION_3_LEGEND/u);
  assert.match(code, /METROLINX_OGL_LINE/u);
  assert.ok(METROLINX_AUA_LEGEND.startsWith('Data used in this product or service'));
  assert.ok(METROLINX_OGL_NOTICE.startsWith('Contains information licensed'));
});
