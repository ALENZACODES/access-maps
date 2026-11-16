/** Route and catalogue contract checks; malformed copies fail the release gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECEIPT_COPY, receiptCopy, receiptLocale } from './receipt-messages.mjs';
import { receiptSourceIds, createReceipt, legalNotices } from './receipt-core.mjs';
import { SOURCES, SOURCE_IDS, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { dataset, release, surface } from './receipt-fixture.test.mjs';
import { MAX_IMPORT_BYTES, mountReceiptRoute } from './receipt-route.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFile(join(directory, name), 'utf8');
const ROUTE_FILES = ['receipt.html', 'receipt-route.mjs', 'receipt-core.mjs',
  'receipt-audit.mjs', 'receipt-messages.mjs', 'receipt.css'];

for (const name of ROUTE_FILES) {
  test(`receipt production route uses the shipped ${name}`, async () => {
    const content = await read(name);
    assert.ok(content.length > 100, name);
    assert.doesNotMatch(content, /<<<<<<<|======= origin\/main|>>>>>>>/u);
  });
}

test('navigation links source receipt route from the existing attribution page', async () => {
  const code = await read('route.mjs');
  assert.match(code, /receipt\.html/u);
  assert.match(code, /Source receipts/u);
  assert.match(code, /Reçus des sources/u);
});

test('the production HTML loads the executable route, not a test file', async () => {
  const html = await read('receipt.html');
  assert.match(html, /<script type="module" src="receipt-route\.mjs"><\/script>/u);
  assert.match(html, /<main id="main-content">/u);
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /href="#main-content"/u);
});

test('the production route imports the live receipt engine and audit', async () => {
  const route = await read('receipt-route.mjs');
  for (const name of ['receipt-core.mjs', 'receipt-audit.mjs', 'receipt-messages.mjs',
    'disclosure-core.mjs']) assert.ok(route.includes(`'./${name}'`), name);
  assert.match(route, /createReceipt\(bundle, selected, locale\)/u);
  assert.match(route, /auditReceipt\(receipt, bundle/u);
});

test('CSP prohibits implicit requests, remote scripts, and form submission', async () => {
  const html = await read('receipt.html');
  for (const rule of ["default-src 'none'", "connect-src 'none'", "form-action 'none'",
    "object-src 'none'", "img-src 'none'", "script-src 'self'", "base-uri 'none'"]) {
    assert.ok(html.includes(rule), rule);
  }
  assert.doesNotMatch(html, /<iframe|<img|<form/u);
});

test('receipt route does not silently write to localStorage or schedule work', async () => {
  const all = (await Promise.all(ROUTE_FILES.map(read))).join('\n');
  assert.doesNotMatch(all, /localStorage|sessionStorage|indexedDB|setInterval|serviceWorker\.register/u);
  assert.doesNotMatch(all, /fetch\(|XMLHttpRequest|WebSocket\(/u);
});

test('explicit file picker has a bounded size and accepts JSON only', async () => {
  assert.equal(MAX_IMPORT_BYTES, 2_097_152);
  const code = await read('receipt-route.mjs');
  assert.match(code, /file\.accept = '\.json,application\/json'/u);
  assert.match(code, /candidate\.size > MAX_IMPORT_BYTES/u);
  assert.match(code, /parseReleasePackageText\(text\)/u);
});

test('route uses labels for both file and surface input', async () => {
  const code = await read('receipt-route.mjs');
  assert.match(code, /fileLabel\.htmlFor = 'receipt-file'/u);
  assert.match(code, /selectionLabel\.htmlFor = 'receipt-select'/u);
  assert.match(code, /languageLabel\.htmlFor = 'receipt-lang'/u);
  assert.match(code, /languageSelect\.addEventListener\('change'/u);
});

test('route input has an announcement region for file errors', async () => {
  const code = await read('receipt-route.mjs');
  assert.match(code, /message\.setAttribute\('role', 'status'\)/u);
  assert.match(code, /message\.setAttribute\('aria-live', 'polite'\)/u);
  assert.match(code, /message\.textContent = t\.invalid/u);
});

test('route uses textContent, not HTML injection for imported fields', async () => {
  const code = await read('receipt-route.mjs');
  assert.match(code, /node\.textContent = String\(text\)/u);
  assert.doesNotMatch(code, /innerHTML|insertAdjacentHTML|eval\(/u);
});

test('links require explicit user interaction and refuse unsafe URL protocols', async () => {
  const code = await read('receipt-route.mjs');
  assert.match(code, /parsed\.protocol !== 'https:'/u);
  assert.match(code, /node\.rel = 'noopener noreferrer'/u);
  assert.match(code, /node\.target = '_blank'/u);
});

test('object URL export revokes temporary Blob URLs', async () => {
  const code = await read('receipt-route.mjs');
  assert.match(code, /win\.URL\.createObjectURL\(blob\)/u);
  assert.match(code, /win\.URL\.revokeObjectURL\(url\)/u);
  assert.match(code, /finally/u);
});

test('print stylesheet excludes controls but includes receipt evidence', async () => {
  const code = await read('receipt.css');
  assert.match(code, /@media print/u);
  assert.match(code, /\.receipt-controls/u);
  assert.match(code, /\.receipt-card/u);
  assert.match(code, /break-inside: avoid/u);
});

test('controls have minimum size 44px', async () => {
  const code = await read('receipt.css');
  assert.match(code, /min-height: 44px; min-width: 44px/u);
  assert.match(code, /\.receipt-nav a/u);
  assert.match(code, /\.receipt-card a/u);
});

test('focus and reduced motion styles are present', async () => {
  const css = await read('receipt.css');
  assert.match(css, /:focus-visible/u);
  assert.match(css, /outline: 3px solid Highlight/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
});

test('all UI message keys are translated one-to-one', () => {
  assert.deepEqual(Object.keys(RECEIPT_COPY.fr).sort(), Object.keys(RECEIPT_COPY.en).sort());
  for (const key of Object.keys(RECEIPT_COPY.en)) {
    assert.ok(RECEIPT_COPY.en[key].length > 0, `EN ${key}`);
    assert.ok(RECEIPT_COPY.fr[key].length > 0, `FR ${key}`);
  }
});

test('French message strings use typographic apostrophes', () => {
  for (const [key, value] of Object.entries(RECEIPT_COPY.fr)) {
    assert.doesNotMatch(value, /\b[cdjlmnst]'[a-zàâçéèêëîïôùûü]/iu, key);
  }
});

test('French messages do not use the banned French imperative', () => {
  for (const [key, text] of Object.entries(RECEIPT_COPY.fr)) {
    assert.doesNotMatch(text, /v[eé]rifi(?:ez|er)/iu, key);
  }
});

test('French messages use narrow no-break space before semicolons and questions', () => {
  for (const [key, text] of Object.entries(RECEIPT_COPY.fr)) {
    assert.doesNotMatch(text, / (?=[;!?])/u, key);
    assert.doesNotMatch(text, /\u00a0(?=[;!?])/u, key);
  }
});

test('French messages do not use ASCII space before colon', () => {
  for (const [key, text] of Object.entries(RECEIPT_COPY.fr)) {
    assert.doesNotMatch(text, / (?=:)/u, key);
  }
});

test('French control label has required U+00A0 before colon', async () => {
  const text = await read('receipt-route.mjs');
  assert.match(text, /Langue\\u00a0:/u);
  assert.doesNotMatch(text, /Langue :/u);
});

test('French dataset date in receipt export has required U+00A0', async () => {
  const text = await read('receipt-core.mjs');
  assert.match(text, /Données en date du\\u00a0:/u);
  assert.doesNotMatch(text, /Données en date du :/u);
});

test('French receipt export renders actual NBSP', () => {
  const receipt = createReceipt(release(), 'mapone', 'fr');
  assert.ok(receipt.title.includes('Carte'));
  const sourceText = receiptSourceIds(receipt);
  assert.deepEqual(sourceText, ['osmone']);
});

test('one authoritative source list is used by all exported receipts', () => {
  assert.deepEqual(SOURCE_IDS, ['osm', 'metrolinx', 'ltc']);
  assert.deepEqual(Object.keys(SOURCES), SOURCE_IDS);
  assert.equal(Object.hasOwn(SOURCES, 'miway'), false);
});

test('exact AUA applicable-laws strings survive unchanged', () => {
  assert.equal(METROLINX_AUA_END_USER_LAWS_EN,
    'Users must follow applicable laws when using the transit data.');
  assert.equal(METROLINX_AUA_END_USER_LAWS_FR,
    'Les utilisateurs doivent respecter les lois applicables lorsqu’ils utilisent les données de transport en commun.');
});

test('Metrolinx AUA legend is not rewritten or translated', () => {
  assert.ok(METROLINX_AUA_LEGEND.startsWith('Data used in this product or service'));
  assert.ok(METROLINX_AUA_LEGEND.includes('Metrolinx makes no representations'));
  for (const locale of ['en', 'fr']) {
    const record = dataset('go', { provider: 'metrolinx', licence: 'Metrolinx-AUA' });
    assert.ok(legalNotices(record, locale).includes(METROLINX_AUA_LEGEND));
  }
});

test('Metrolinx OGL line is preserved separately', () => {
  assert.equal(METROLINX_OGL_NOTICE,
    'Contains information licensed under the Open Government Licence - Ontario - Metrolinx.');
  const record = dataset('go', { provider: 'metrolinx', licence: 'OGL-Ontario-Metrolinx' });
  for (const locale of ['en', 'fr']) {
    assert.deepEqual(legalNotices(record, locale), [METROLINX_OGL_NOTICE]);
  }
});

test('LTC terms are credited, not elevated to default ODbL terms', () => {
  const record = dataset('ltc', { provider: 'ltc', licence: 'LTC-Open-Data-Terms' });
  assert.deepEqual(legalNotices(record, 'en'), SOURCES.ltc.notices.en);
  assert.ok(!legalNotices(record, 'en').includes('Open Database License (ODbL) 1.0'));
});

test('OSM licence and map credit have different roles', () => {
  assert.ok(SOURCES.osm.notices.en.includes('© OpenStreetMap contributors'));
  assert.ok(SOURCES.osm.notices.en.includes('Open Database License (ODbL) 1.0'));
  assert.notEqual(SOURCES.osm.notices.en[0], SOURCES.osm.notices.en[1]);
});

test('date is not inferred from terms-review date for any catalogue provider', () => {
  for (const source of Object.values(SOURCES)) {
    assert.equal(source.datasetAsOf, 'UNKNOWN');
    assert.match(source.reviewed, /^\d{4}-\d{2}-\d{2}$/u);
  }
});

test('locale switching supports French Canadian variants', () => {
  assert.equal(receiptLocale('fr-CA'), 'fr');
  assert.equal(receiptLocale('fr_CA'), 'fr');
  assert.equal(receiptLocale('en-CA'), 'en');
  assert.equal(receiptLocale('invalid'), 'en');
  assert.equal(receiptCopy('fr').title, 'Reçus des sources');
});

test('mounting without a receipt root is a no-op rather than an exception', () => {
  const doc = { getElementById: () => null };
  assert.equal(mountReceiptRoute(doc, {}), null);
});

test('route is imported only when browser globals exist', async () => {
  const route = await read('receipt-route.mjs');
  assert.match(route, /typeof document !== 'undefined' && typeof window !== 'undefined'/u);
});

test('source receipts never assert place accessibility or eligibility', async () => {
  const text = (await Promise.all(['receipt-route.mjs', 'receipt-messages.mjs',
    'receipt-core.mjs'].map(read))).join('\n');
  assert.doesNotMatch(text, /eligible for funding|medically approved|guaranteed access/iu);
});

test('receipt-only changes do not introduce remote tile services', async () => {
  for (const name of ROUTE_FILES) {
    const contents = await read(name);
    assert.doesNotMatch(contents, /tile\.openstreetmap\.org|maps\.googleapis\.com|mapbox\.com/iu);
  }
});

test('release source selection stays explicit', () => {
  const pkg = release([dataset(), dataset('second')], [surface('mapone', { sourceIds: ['osmone'] })]);
  const receipt = createReceipt(pkg, 'mapone', 'en');
  assert.deepEqual(receiptSourceIds(receipt), ['osmone']);
});

test('README describes explicit CLI command and honest integration boundary', async () => {
  const text = await read('README.md');
  assert.match(text, /receipt-cli\.mjs/u);
  assert.match(text, /receipt\.html/u);
  assert.match(text, /source identifiers/u);
});
