import test from 'node:test';
import assert from 'node:assert/strict';
import { dataset, release, surface, withLtc, withMetrolinx } from './receipt-fixture.test.mjs';
import {
  ReceiptError, RECEIPT_FIELDS, DATASET_FIELDS, RECEIPT_VERSION,
  createReceipt, createReceipts, createReceiptFromText, parseReceipt,
  parseReceiptText, encodeReceipt, receiptEqual, receiptAsText,
  receiptSourceIds, receiptSummary, legalNotices,
} from './receipt-core.mjs';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';

const clone = (value) => structuredClone(value);
const create = () => createReceipt(release(), 'mapone', 'en');

test('receipt is generated from a release surface, never from guessed sources', () => {
  const receipt = create();
  assert.equal(receipt.version, 1);
  assert.equal(receipt.surfaceId, 'mapone');
  assert.equal(receipt.route, '/map');
  assert.equal(receipt.title, 'Public map');
  assert.equal(receipt.language, 'en');
  assert.equal(receipt.surfaceDate, 'UNKNOWN');
  assert.deepEqual(receipt.datasets.map((item) => item.id), ['osmone']);
  assert.equal(receipt.datasets[0].datasetAsOf, 'UNKNOWN');
  assert.equal(receipt.datasets[0].permission, true);
});

test('French receipt uses the specific surface translation', () => {
  const value = createReceipt(release(), 'mapone', 'fr');
  assert.equal(value.title, 'Carte publique');
  assert.equal(value.language, 'fr');
  assert.equal(value.credits, SOURCES.osm.notices.fr[0]);
  assert.match(receiptAsText(value), /Données en date du\u00a0: UNKNOWN/u);
  assert.doesNotMatch(receiptAsText(value), /Données en date du :/u);
});

test('round trips receipt preserving source order, text and UNKNOWN', () => {
  const receipt = create();
  const text = encodeReceipt(receipt);
  assert.equal(text.at(-1), '\n');
  assert.deepEqual(parseReceiptText(text), receipt);
  assert.equal(receiptEqual(parseReceiptText(text), receipt), true);
});

test('English text is human-readable without erasing uncertainty', () => {
  const text = receiptAsText(create());
  for (const token of ['Public map', '/map', 'UNKNOWN', 'OpenStreetMap', 'ODbL-1.0',
    '© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright']) {
    assert.ok(text.includes(token), token);
  }
  assert.ok(text.endsWith('\n'));
});

test('receipts preserve explicit source ordering', () => {
  const input = release([dataset(), dataset('osmsecond')],
    [surface('mapone', { sourceIds: ['osmsecond', 'osmone'] })]);
  const result = createReceipt(input, 'mapone', 'en');
  assert.deepEqual(receiptSourceIds(result), ['osmsecond', 'osmone']);
});

test('receipt list follows the publication register order', () => {
  const input = release([dataset()], [surface('one'), surface('two', { path: '/map-two' })]);
  assert.deepEqual(createReceipts(input).map((value) => value.surfaceId), ['one', 'two']);
});

test('unknown or held surface is rejected or marked held, not promoted', () => {
  assert.throws(() => createReceipt(release(), 'absent', 'en'), /SURFACE_MISSING/u);
  assert.equal(createReceipt(release([dataset()], [surface('mapone', { state: 'held' })]),
    'mapone', 'en').status, 'held');
});

test('unknown linked record is rejected rather than dropped', () => {
  assert.throws(() => createReceipt(release([dataset()],
    [surface('mapone', { sourceIds: ['missing'] })]), 'mapone', 'en'), /DATASET_MISSING/u);
});

test('data dates are not copied from the terms review date', () => {
  const receipt = create();
  assert.equal(receipt.datasets[0].termsReviewedOn, '2026-10-10');
  assert.equal(receipt.datasets[0].datasetAsOf, 'UNKNOWN');
  assert.equal(receipt.surfaceDate, 'UNKNOWN');
});

test('recorded exact dataset date is reflected without changing surface date', () => {
  const result = createReceipt(release([dataset('osmone', { datasetAsOf: '2026-09-01' })]),
    'mapone', 'en');
  assert.equal(result.datasets[0].datasetAsOf, '2026-09-01');
  assert.equal(result.surfaceDate, 'UNKNOWN');
});

test('receipt summary counts unknown dates and preserves offline mode', () => {
  const report = receiptSummary(create());
  assert.deepEqual(report, {
    surfaceId: 'mapone', language: 'en', sources: 1,
    datesUnknown: 1, permissionUnknown: 0, offline: true,
  });
});

test('summary shows UNKNOWN redistribution without altering it', () => {
  const receipt = createReceipt(release([dataset('osmone', { redistributionAllowed: 'UNKNOWN' })]),
    'mapone', 'en');
  assert.equal(receipt.datasets[0].permission, 'UNKNOWN');
  assert.equal(receiptSummary(receipt).permissionUnknown, 1);
});

test('Metrolinx AUA notices are distinct from OGL for both languages', () => {
  for (const language of ['en', 'fr']) {
    const receipt = createReceipt(withMetrolinx('Metrolinx-AUA'), 'gojourney', language);
    const text = receipt.datasets[0].notices;
    assert.ok(text.includes(METROLINX_AUA_LEGEND));
    assert.ok(text.includes(METROLINX_AUA_END_USER_LAWS_EN));
    assert.ok(text.includes(METROLINX_AUA_END_USER_LAWS_FR));
    assert.ok(!text.includes(METROLINX_OGL_NOTICE));
  }
});

test('Metrolinx OGL receipt never inherits AUA section 3', () => {
  for (const language of ['en', 'fr']) {
    const receipt = createReceipt(withMetrolinx('OGL-Ontario-Metrolinx'), 'gojourney', language);
    assert.deepEqual(receipt.datasets[0].notices, [METROLINX_OGL_NOTICE]);
  }
});

test('LTC terms use the authoritative catalogued notice', () => {
  const receipt = createReceipt(withLtc(), 'ltcjourney', 'fr');
  assert.deepEqual(receipt.datasets[0].notices, SOURCES.ltc.notices.fr);
});

test('OSM attribution credit and ODbL licence are distinct strings', () => {
  const receipt = create();
  assert.equal(receipt.datasets[0].notices[0], '© OpenStreetMap contributors');
  assert.equal(receipt.datasets[0].notices[1], 'Open Database License (ODbL) 1.0');
});

test('unknown provider terms are not invented', () => {
  const record = dataset('otherone', { provider: 'other', licence: 'OTHER-OPEN' });
  assert.deepEqual(legalNotices(record, 'en'), []);
});

test('unrecognised known-provider licence does not receive legal notice by inference', () => {
  const record = dataset('osmone', { licence: 'UNKNOWN' });
  assert.deepEqual(legalNotices(record, 'en'), []);
});

test('source provider list excludes MiWay', () => {
  assert.deepEqual(Object.keys(SOURCES), ['osm', 'metrolinx', 'ltc']);
  assert.equal(Object.hasOwn(SOURCES, 'miway'), false);
});

test('receipt export fields remain versioned and explicit', () => {
  assert.equal(RECEIPT_VERSION, 1);
  assert.deepEqual(Object.keys(create()), RECEIPT_FIELDS);
  assert.deepEqual(Object.keys(create().datasets[0]), DATASET_FIELDS);
});

test('receipt input accepts complete round-tripped JSON from a release file', () => {
  const input = release();
  assert.deepEqual(createReceiptFromText(JSON.stringify(input), 'mapone', 'en'), create());
});

test('nested structures are immutable after parsing', () => {
  const receipt = parseReceipt(create());
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.datasets), true);
  assert.equal(Object.isFrozen(receipt.datasets[0]), true);
  assert.equal(Object.isFrozen(receipt.datasets[0].notices), true);
});

test('receipt equality is structural and sensitive to evidence', () => {
  const original = create();
  const modified = clone(original);
  modified.title = 'Different';
  assert.equal(receiptEqual(original, modified), false);
});

const cases = [
  ['extra root field', (x) => { x.extra = 'ignored'; }],
  ['missing root field', (x) => { delete x.credits; }],
  ['wrong version', (x) => { x.version = 200; }],
  ['invalid locale', (x) => { x.language = 'es'; }],
  ['empty surface id', (x) => { x.surfaceId = ''; }],
  ['invalid surface id', (x) => { x.surfaceId = '../../x'; }],
  ['invalid route', (x) => { x.route = '//bad'; }],
  ['absolute route', (x) => { x.route = 'https://bad.test'; }],
  ['invalid delivery', (x) => { x.delivery = 'maybe'; }],
  ['unrecorded keyboard claim', (x) => { x.keyboard = 'sure'; }],
  ['unrecorded screen-reader claim', (x) => { x.screenReader = true; }],
  ['negative target', (x) => { x.minimumTargetPx = -1; }],
  ['fractional target', (x) => { x.minimumTargetPx = 43.5; }],
  ['oversized target', (x) => { x.minimumTargetPx = 1001; }],
  ['unexpected status', (x) => { x.status = 'complete'; }],
  ['non-array datasets', (x) => { x.datasets = {}; }],
  ['duplicate dataset ids', (x) => { x.datasets.push(clone(x.datasets[0])); }],
  ['invalid source URL', (x) => { x.datasets[0].sourceUrl = 'javascript:alert(1)'; }],
  ['source credentials', (x) => { x.datasets[0].sourceUrl = 'https://a:b@example.org'; }],
  ['invalid licence URL', (x) => { x.datasets[0].licenceUrl = 'http://example.org'; }],
  ['invalid acquired date', (x) => { x.datasets[0].acquiredOn = '2026-02-30'; }],
  ['invalid dataset date', (x) => { x.datasets[0].datasetAsOf = '2026-13-01'; }],
  ['invalid terms date', (x) => { x.datasets[0].termsReviewedOn = ''; }],
  ['invalid surface date', (x) => { x.surfaceDate = 'yesterday'; }],
  ['invalid review date', (x) => { x.reviewedOn = '2026-02-29'; }],
  ['missing dataset key', (x) => { delete x.datasets[0].licence; }],
  ['extra dataset key', (x) => { x.datasets[0].something = 'data'; }],
  ['unknown dataset provider', (x) => { x.datasets[0].provider = 'miway'; }],
  ['invalid permission', (x) => { x.datasets[0].permission = 'yes'; }],
  ['invalid dataset status', (x) => { x.datasets[0].status = 'ready'; }],
  ['duplicate notices', (x) => { x.datasets[0].notices.push(x.datasets[0].notices[0]); }],
  ['unbounded title', (x) => { x.title = 'x'.repeat(501); }],
  ['control character', (x) => { x.credits = '\u0000'; }],
];
for (const [name, mutate] of cases) {
  test(`reject malformed receipt: ${name}`, () => {
    const receipt = clone(create());
    mutate(receipt);
    assert.throws(() => parseReceipt(receipt), ReceiptError);
  });
}

test('invalid JSON never becomes an empty receipt', () => {
  assert.throws(() => parseReceiptText('{broken'), /RECEIPT_JSON/u);
  assert.throws(() => parseReceiptText(123), /RECEIPT_SIZE/u);
  assert.throws(() => parseReceiptText(' '.repeat(1_048_577)), /RECEIPT_SIZE/u);
});

test('invalid language never silently falls back in receipt generator', () => {
  assert.throws(() => createReceipt(release(), 'mapone', 'de'), /RECEIPT_LOCALE/u);
  assert.throws(() => legalNotices(dataset(), 'de'), /RECEIPT_LOCALE/u);
});
