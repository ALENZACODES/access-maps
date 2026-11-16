import test from 'node:test';
import assert from 'node:assert/strict';
import { dataset, release, surface, withMetrolinx, withLtc } from './receipt-fixture.test.mjs';
import { createReceipt } from './receipt-core.mjs';
import {
  RECEIPT_RULES, auditReceipt, auditAllReceipts, auditReportAsText,
  auditReportAsJson, finding,
} from './receipt-audit.mjs';
import { METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
  SOURCES } from './attribution-utils.mjs';

const clone = (value) => structuredClone(value);
function run(changes = {}) {
  const pkg = release([dataset('osmone', changes.record)],
    [surface('mapone', changes.surface)]);
  const receipt = createReceipt(pkg, 'mapone', 'en');
  if (changes.receipt) Object.assign(receipt, changes.receipt);
  return auditReceipt(receipt, pkg, changes.options);
}
function has(report, code) { return report.findings.some((item) => item.code === code); }
function assessment(pkg, locale = 'en', options = {}) {
  return auditReceipt(createReceipt(pkg, pkg.register.surfaces[0].id, locale), pkg,
    { locale, ...options });
}

test('baseline OSM receipt is not blocked with recorded evidence', () => {
  const report = assessment(release());
  assert.equal(report.blocked, false);
  assert.equal(report.errors, 0);
  assert.ok(has(report, 'SURFACE_DATE_UNKNOWN'));
  assert.ok(has(report, 'DATASET_DATE_UNKNOWN'));
});

test('UNKNOWN dataset dates are informational, never fabricated', () => {
  const result = assessment(release());
  assert.equal(result.receipt.surfaceDate, 'UNKNOWN');
  assert.equal(result.receipt.datasets[0].datasetAsOf, 'UNKNOWN');
  assert.equal(result.findings.find((item) => item.code === 'DATASET_DATE_UNKNOWN').severity, 'info');
});

test('surface with missing source identifiers blocks', () => {
  const pkg = release([dataset()], [surface('mapone', { sourceIds: [] })]);
  const report = assessment(pkg);
  assert.equal(report.blocked, true);
  assert.ok(has(report, 'NO_SOURCES'));
});

test('a held source blocks even if the surrounding surface is included', () => {
  const report = assessment(release([dataset('osmone', { status: 'held' })]));
  assert.ok(has(report, 'SOURCE_NOT_INCLUDED'));
  assert.equal(report.blocked, true);
});

test('an excluded source blocks even with a complete source notice', () => {
  const report = assessment(release([dataset('osmone', { status: 'excluded' })]));
  assert.ok(has(report, 'SOURCE_NOT_INCLUDED'));
});

test('held surface is never promoted to release-ready', () => {
  const report = assessment(release([dataset()], [surface('mapone', { state: 'held' })]));
  assert.ok(has(report, 'NOT_PUBLISHED'));
  assert.equal(report.blocked, true);
});

test('excluded surface blocks too', () => {
  const report = assessment(release([dataset()], [surface('mapone', { state: 'excluded' })]));
  assert.ok(has(report, 'NOT_PUBLISHED'));
});

test('UNKNOWN permission cannot be interpreted as yes', () => {
  const report = assessment(release([dataset('osmone', { redistributionAllowed: 'UNKNOWN' })]));
  assert.ok(has(report, 'UNKNOWN_PERMISSION'));
  assert.equal(report.blocked, true);
});

test('explicit denied redistribution blocks', () => {
  const report = assessment(release([dataset('osmone', { redistributionAllowed: false })]));
  assert.ok(has(report, 'DENIED_PERMISSION'));
});

test('unknown licence blocks and does not invent ODbL notices', () => {
  const report = assessment(release([dataset('osmone', { licence: 'UNKNOWN' })]));
  assert.ok(has(report, 'UNKNOWN_LICENCE'));
  assert.ok(has(report, 'UNSUPPORTED_PROVIDER_LICENCE'));
});

test('missing terms date blocks rather than using the system clock', () => {
  const report = assessment(release([dataset('osmone', { termsReviewedOn: 'UNKNOWN' })]));
  assert.ok(has(report, 'LICENCE_TERMS_UNKNOWN'));
});

test('missing acquisition date is a blocking evidence gap', () => {
  const report = assessment(release([dataset('osmone', { acquiredOn: 'UNKNOWN' })]));
  assert.ok(has(report, 'ACQUISITION_UNKNOWN'));
});

test('source URL UNKNOWN is not treated as an empty but valid link', () => {
  const report = assessment(release([dataset('osmone', { sourceUrl: 'UNKNOWN' })]));
  assert.ok(has(report, 'SOURCE_URL_UNKNOWN'));
});

test('licence URL UNKNOWN is a blocking attribution gap', () => {
  const report = assessment(release([dataset('osmone', { licenceUrl: 'UNKNOWN' })]));
  assert.ok(has(report, 'LICENCE_URL_UNKNOWN'));
});

test('missing surface review date blocks', () => {
  const report = assessment(release([dataset()], [surface('mapone', { lastReviewedOn: 'UNKNOWN' })]));
  assert.ok(has(report, 'SURFACE_REVIEW_UNKNOWN'));
});

test('unknown keyboard support blocks rather than implying support', () => {
  const report = assessment(release([dataset()], [surface('mapone', { supportsKeyboard: 'UNKNOWN' })]));
  assert.ok(has(report, 'UNKNOWN_KEYBOARD'));
});

test('explicit missing keyboard support blocks', () => {
  const report = assessment(release([dataset()], [surface('mapone', { supportsKeyboard: 'no' })]));
  assert.ok(has(report, 'NO_KEYBOARD'));
});

test('unknown screen reader support blocks', () => {
  const report = assessment(release([dataset()], [surface('mapone', { supportsScreenReader: 'UNKNOWN' })]));
  assert.ok(has(report, 'UNKNOWN_SCREEN_READER'));
});

test('explicitly absent screen reader support blocks', () => {
  const report = assessment(release([dataset()], [surface('mapone', { supportsScreenReader: 'no' })]));
  assert.ok(has(report, 'NO_SCREEN_READER'));
});

test('unknown target dimension blocks', () => {
  const report = assessment(release([dataset()], [surface('mapone', { minimumTargetPx: 'UNKNOWN' })]));
  assert.ok(has(report, 'UNKNOWN_TARGET'));
});

for (const px of [0, 1, 20, 42, 43]) {
  test(`documented target of ${px}px is rejected`, () => {
    const report = assessment(release([dataset()], [surface('mapone', { minimumTargetPx: px })]));
    assert.ok(has(report, 'SMALL_TARGET'));
    assert.equal(report.blocked, true);
  });
}
for (const px of [44, 45, 48, 60]) {
  test(`documented target of ${px}px meets the numerical minimum`, () => {
    const report = assessment(release([dataset()], [surface('mapone', { minimumTargetPx: px })]));
    assert.equal(has(report, 'SMALL_TARGET'), false);
  });
}

test('unknown delivery mode blocks', () => {
  const report = assessment(release([dataset()], [surface('mapone', { delivery: 'UNKNOWN' })]));
  assert.ok(has(report, 'UNKNOWN_DELIVERY'));
});

test('online-only surfaces report lack of documented offline delivery', () => {
  const report = assessment(release([dataset()], [surface('mapone', { delivery: 'online' })]));
  assert.ok(has(report, 'ONLINE_DELIVERY'));
  assert.equal(report.warnings, 1);
});

test('both offline and online is accepted as documented mode', () => {
  const report = assessment(release([dataset()], [surface('mapone', { delivery: 'both' })]));
  assert.equal(has(report, 'ONLINE_DELIVERY'), false);
});

test('OSM map without on-map credit blocks', () => {
  const pkg = release([dataset()], [surface('mapone', { creditEn: 'Another dataset', creditFr: 'Autre source' })]);
  const report = assessment(pkg);
  assert.ok(has(report, 'OSM_MAP_CREDIT'));
});

test('OSM map retains distinct ODbL notice and on-map source attribution', () => {
  const receipt = createReceipt(release(), 'mapone', 'en');
  assert.ok(receipt.credits.includes('© OpenStreetMap contributors'));
  assert.ok(receipt.datasets[0].notices.includes('Open Database License (ODbL) 1.0'));
  assert.equal(has(auditReceipt(receipt, release()), 'OSM_MAP_CREDIT'), false);
});

test('Metrolinx AUA receipt carries the section 3 legend and both applicable-laws lines', () => {
  const pkg = withMetrolinx('Metrolinx-AUA');
  const receipt = createReceipt(pkg, 'gojourney', 'en');
  const result = auditReceipt(receipt, pkg);
  const combined = receipt.datasets[0].notices.join(' ');
  for (const legal of [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
    METROLINX_AUA_END_USER_LAWS_FR]) assert.ok(combined.includes(legal));
  assert.equal(has(result, 'AUA_LEGEND'), false);
  assert.equal(has(result, 'AUA_LAWS'), false);
});

test('Metrolinx OGL has its own notice with no AUA conditions added by provider label', () => {
  const pkg = withMetrolinx('OGL-Ontario-Metrolinx');
  const receipt = createReceipt(pkg, 'gojourney', 'en');
  assert.deepEqual(receipt.datasets[0].notices, [METROLINX_OGL_NOTICE]);
  assert.equal(has(auditReceipt(receipt, pkg), 'OGL_LINE'), false);
});

test('LTC reference contains its source name without implying affiliation', () => {
  const pkg = withLtc();
  const receipt = createReceipt(pkg, 'ltcjourney', 'en');
  assert.ok(receipt.datasets[0].notices.join(' ').includes('London Transit Commission'));
  assert.equal(has(auditReceipt(receipt, pkg), 'LTC_NOTICE'), false);
});

test('receipt locale mismatch is a blocking finding', () => {
  const pkg = release();
  const receipt = createReceipt(pkg, 'mapone', 'en');
  const report = auditReceipt(receipt, pkg, { locale: 'fr' });
  assert.ok(has(report, 'RECEIPT_LOCALE_DRIFT'));
});

test('receipt unchanged from canonical release has no drift finding', () => {
  const pkg = release();
  const receipt = createReceipt(pkg, 'mapone', 'en');
  const report = auditReceipt(receipt, pkg);
  assert.equal(has(report, 'RECEIPT_DRIFT'), false);
});

test('release audit integration reports upstream blockers when opted in', () => {
  const pkg = release([dataset('osmone', { termsReviewedOn: 'UNKNOWN' })]);
  const receipt = createReceipt(pkg, 'mapone', 'en');
  const report = auditReceipt(receipt, pkg, { withReleaseAudit: true });
  assert.ok(has(report, 'RELEASE_AUDIT'));
});

test('without requested upstream run, receipt has its own independent findings', () => {
  const pkg = release();
  const report = auditReceipt(createReceipt(pkg, 'mapone', 'en'), pkg);
  assert.equal(has(report, 'RELEASE_AUDIT'), false);
});

test('reports are deterministic across calls', () => {
  const pkg = release();
  assert.deepEqual(assessment(pkg), assessment(pkg));
  assert.equal(auditReportAsText(assessment(pkg)), auditReportAsText(assessment(pkg)));
});

test('json report is parseable and does not silently discard severity', () => {
  const pkg = release([dataset('osmone', { redistributionAllowed: false })]);
  const report = assessment(pkg);
  const exported = JSON.parse(auditReportAsJson(report));
  assert.equal(exported.blocked, true);
  assert.equal(exported.surfaceId, 'mapone');
  assert.ok(exported.findings.some((item) => item.severity === 'error'));
});

test('French text output has language-specific heading', () => {
  const pkg = release();
  const report = assessment(pkg, 'fr');
  assert.match(auditReportAsText(report, 'fr'), /Examen des mentions de source/u);
});

test('finding constructor rejects unknown severity and code', () => {
  assert.throws(() => finding('NOT_A_RULE', 'error', 'mapone'), /Unknown rule/u);
  assert.throws(() => finding('NO_SOURCES', 'fatal', 'mapone'), /Unknown severity/u);
});

test('audit of a missing surface produces a blocking drift finding', () => {
  const pkg = release();
  const other = release([dataset()], [surface('newone', { path: '/new' })]);
  const receipt = createReceipt(pkg, 'mapone', 'en');
  const report = auditReceipt(receipt, other);
  assert.ok(has(report, 'RECEIPT_DRIFT'));
});

test('batch audit checks each surface separately', () => {
  const pkg = release([dataset()], [surface('mapone'),
    surface('otherone', { path: '/other', minimumTargetPx: 42 })]);
  const result = auditAllReceipts(pkg, 'fr');
  assert.equal(result.results.length, 2);
  assert.equal(result.blocked, true);
  assert.equal(result.results[0].receipt.language, 'fr');
  assert.ok(result.results[1].findings.some((item) => item.code === 'SMALL_TARGET'));
});

test('batch audit of an empty register contains no invented surfaces', () => {
  const result = auditAllReceipts(release([], []));
  assert.deepEqual(result.results, []);
  assert.equal(result.errors, 0);
});

test('every receipt audit rule has a nonempty explanation', () => {
  for (const [code, explanation] of Object.entries(RECEIPT_RULES)) {
    assert.match(code, /^[A-Z_]+$/u);
    assert.ok(explanation.length > 20, code);
  }
});

// Directly mutate exported receipts: imported receipts may be forged or stale.
const tamper = [
  ['title', (x) => { x.title = 'Mislabelled map'; }, 'RECEIPT_DRIFT'],
  ['path', (x) => { x.route = '/different'; }, 'RECEIPT_DRIFT'],
  ['credit', (x) => { x.credits = 'No attribution'; }, 'RECEIPT_DRIFT'],
  ['notice', (x) => { x.sourceNotices = 'Something else'; }, 'RECEIPT_DRIFT'],
  ['surface review', (x) => { x.reviewedOn = '2026-01-01'; }, 'RECEIPT_DRIFT'],
  ['delivery mode', (x) => { x.delivery = 'both'; }, 'RECEIPT_DRIFT'],
  ['keyboard evidence', (x) => { x.keyboard = 'no'; }, 'RECEIPT_DRIFT'],
  ['screen reader evidence', (x) => { x.screenReader = 'no'; }, 'RECEIPT_DRIFT'],
  ['target size', (x) => { x.minimumTargetPx = 60; }, 'RECEIPT_DRIFT'],
  ['source name', (x) => { x.datasets[0].name = 'Wrong source'; }, 'RECEIPT_DRIFT'],
  ['licence name', (x) => { x.datasets[0].licence = 'OTHER-OPEN'; }, 'RECEIPT_DRIFT'],
  ['source URL', (x) => { x.datasets[0].sourceUrl = 'https://example.org/data'; }, 'RECEIPT_DRIFT'],
  ['licence URL', (x) => { x.datasets[0].licenceUrl = 'https://example.org/legal'; }, 'RECEIPT_DRIFT'],
  ['acquisition date', (x) => { x.datasets[0].acquiredOn = '2026-01-01'; }, 'RECEIPT_DRIFT'],
  ['terms review date', (x) => { x.datasets[0].termsReviewedOn = '2026-01-01'; }, 'RECEIPT_DRIFT'],
  ['dataset date', (x) => { x.datasets[0].datasetAsOf = '2026-01-01'; }, 'RECEIPT_DATE_DRIFT'],
  ['redistribution', (x) => { x.datasets[0].permission = false; }, 'RECEIPT_DRIFT'],
  ['record status', (x) => { x.datasets[0].status = 'held'; }, 'RECEIPT_DRIFT'],
  ['source order', (x) => { x.datasets = []; }, 'RECEIPT_SOURCE_DRIFT'],
];
for (const [name, mutate, expected] of tamper) {
  test(`tampered receipt: ${name} blocks release`, () => {
    const pkg = release();
    const receipt = clone(createReceipt(pkg, 'mapone', 'en'));
    mutate(receipt);
    const report = auditReceipt(receipt, pkg);
    assert.equal(report.blocked, true);
    assert.ok(has(report, expected), `${name}: expected ${expected}`);
  });
}

test('missing required AUA legend is detected on a tampered imported receipt', () => {
  const pkg = withMetrolinx();
  const receipt = clone(createReceipt(pkg, 'gojourney', 'en'));
  receipt.datasets[0].notices = receipt.datasets[0].notices.filter((x) => x !== METROLINX_AUA_LEGEND);
  receipt.sourceNotices = receipt.sourceNotices.replace(METROLINX_AUA_LEGEND, '');
  const report = auditReceipt(receipt, pkg);
  assert.ok(has(report, 'AUA_LEGEND'));
  assert.ok(has(report, 'RECEIPT_NOTICE_DRIFT'));
});

test('missing applicable-laws lines are detected independently of the section 3 legend', () => {
  const pkg = withMetrolinx();
  const receipt = clone(createReceipt(pkg, 'gojourney', 'fr'));
  receipt.datasets[0].notices = [METROLINX_AUA_LEGEND];
  receipt.sourceNotices = METROLINX_AUA_LEGEND;
  const report = auditReceipt(receipt, pkg);
  assert.ok(has(report, 'AUA_LAWS'));
  assert.equal(has(report, 'AUA_LEGEND'), false);
});

test('OGL line is not silently replaced by AUA notice', () => {
  const pkg = withMetrolinx('OGL-Ontario-Metrolinx');
  const receipt = clone(createReceipt(pkg, 'gojourney', 'en'));
  receipt.datasets[0].notices = [METROLINX_AUA_LEGEND];
  receipt.sourceNotices = METROLINX_AUA_LEGEND;
  const report = auditReceipt(receipt, pkg);
  assert.ok(has(report, 'OGL_LINE'));
  assert.ok(has(report, 'UNEXPECTED_AUA'));
});

test('AUA line on OGL-only surface blocks as unexpected', () => {
  const pkg = withMetrolinx('OGL-Ontario-Metrolinx');
  const receipt = clone(createReceipt(pkg, 'gojourney', 'en'));
  receipt.sourceNotices += ` ${METROLINX_AUA_LEGEND}`;
  const report = auditReceipt(receipt, pkg);
  assert.ok(has(report, 'UNEXPECTED_AUA'));
});

test('OGL line on AUA-only surface blocks as unexpected', () => {
  const pkg = withMetrolinx('Metrolinx-AUA');
  const receipt = clone(createReceipt(pkg, 'gojourney', 'en'));
  receipt.sourceNotices += ` ${METROLINX_OGL_NOTICE}`;
  const report = auditReceipt(receipt, pkg);
  assert.ok(has(report, 'UNEXPECTED_OGL'));
});

test('LTC missing notice is detected rather than treated as optional evidence', () => {
  const pkg = withLtc();
  const receipt = clone(createReceipt(pkg, 'ltcjourney', 'en'));
  receipt.datasets[0].notices = [];
  receipt.sourceNotices = 'Omitted';
  const report = auditReceipt(receipt, pkg);
  assert.ok(has(report, 'LTC_NOTICE'));
});
