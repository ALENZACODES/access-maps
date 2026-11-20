import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { blankPlan, addSurface, removeSurface, setSurface, setUse, dropUse,
  parsePlan, serializePlan, blankUse, requiredNotices, downloadName,
  PLACEMENT_SCHEMA, UNKNOWN, SOURCE_IDS, TIERS, MODES, LOCATIONS } from './placement-core.mjs';
import { auditPlacement, auditSummary } from './placement-audit.mjs';
import { COPY, FINDING_COPY } from './placement-messages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => addSurface(blankPlan(), 'Fictional map', 'map');
const withUse = (id = 'osm') => setUse(fixture(), 'view-1', id, {});
const goodUse = (id = 'osm') => {
  const base = withUse(id);
  return setUse(base, 'view-1', id, {
    licence: 'Terms supplied for test only', retrievedOn: '2026-11-18', tier: 'reviewed',
    location: 'near-content', credit: requiredNotices(id, 'en').join('\n'),
    licenceVisible: 'yes', keyboard: 'yes', screenReader: 'yes', minTargetPx: 44,
    notes: 'Fictional test publication',
  });
};

test('new plans have a versioned empty structure', () => {
  assert.deepEqual(blankPlan(), { schema: PLACEMENT_SCHEMA, surfaces: [] });
  assert.deepEqual(parsePlan(serializePlan(blankPlan())), blankPlan());
});
test('source catalogue is constrained to current providers', () => {
  assert.deepEqual(SOURCE_IDS, ['osm', 'metrolinx', 'ltc']);
  assert.throws(() => blankUse('miway'));
});
test('new source evidence remains UNKNOWN', () => {
  for (const id of SOURCE_IDS) {
    const entry = blankUse(id);
    for (const key of ['licence', 'retrievedOn', 'tier', 'location', 'credit', 'minTargetPx', 'notes']) assert.equal(entry[key], UNKNOWN);
  }
});
test('plans preserve source records across JSON round trips', () => {
  const plan = goodUse();
  assert.deepEqual(parsePlan(serializePlan(plan)), plan);
  assert.equal(plan.surfaces[0].uses[0].retrievedOn, '2026-11-18');
});
test('surface ID assignment uses next available unique ID', () => {
  let plan = fixture();
  plan = addSurface(plan, 'List');
  plan = removeSurface(plan, 'view-1');
  plan = addSurface(plan, 'Return');
  assert.deepEqual(plan.surfaces.map((s) => s.id), ['view-2', 'view-1']);
});
test('surface edits preserve other views and source evidence', () => {
  const plan = addSurface(goodUse(), 'Another view');
  const edited = setSurface(plan, 'view-1', { route: '/fictional-map' });
  assert.equal(edited.surfaces[0].uses[0].credit, requiredNotices('osm').join('\n'));
  assert.equal(edited.surfaces[1].name, 'Another view');
});
test('source removal only changes the selected view', () => {
  const plan = addSurface(goodUse(), 'Other view');
  const clean = dropUse(plan, 'view-1', 'osm');
  assert.equal(clean.surfaces[0].uses.length, 0);
  assert.equal(plan.surfaces[0].uses.length, 1);
});
test('unknown target size and missing evidence produce blocks', () => {
  const report = auditPlacement(withUse());
  const codes = new Set(report.findings.map((f) => f.code));
  for (const code of ['LICENCE_UNKNOWN', 'RETRIEVAL_UNKNOWN', 'TIER_UNKNOWN', 'LOCATION_MISSING', 'OSM_NEAR_MAP', 'TARGET_UNKNOWN', 'NOTICE_MISSING']) assert.ok(codes.has(code), code);
  assert.equal(report.blocked, true);
});
test('complete fictional entry has no blocking finding', () => {
  const report = auditPlacement(goodUse());
  assert.equal(report.blocked, false);
  assert.deepEqual(auditSummary(report), { blocking: 0, information: 1 });
});
test('OpenStreetMap credit must be near a map', () => {
  const plan = setUse(goodUse(), 'view-1', 'osm', { location: 'footer' });
  assert.ok(auditPlacement(plan).findings.some((f) => f.code === 'OSM_NEAR_MAP'));
});
test('minimum touch target is 44 pixels', () => {
  for (const minTargetPx of [0, 20, 43]) {
    const plan = setUse(goodUse(), 'view-1', 'osm', { minTargetPx });
    assert.ok(auditPlacement(plan).findings.some((f) => f.code === 'TARGET_SMALL'));
  }
  assert.ok(!auditPlacement(goodUse()).findings.some((f) => f.code === 'TARGET_SMALL'));
});
test('credit is not silently inferred from source ID', () => {
  const plan = setUse(goodUse(), 'view-1', 'osm', { credit: 'OpenStreetMap' });
  assert.ok(auditPlacement(plan).findings.some((f) => f.code === 'OSM_CREDIT_MISSING'));
});
test('required notices differ by selected provider', () => {
  assert.equal(requiredNotices('osm')[0], '© OpenStreetMap contributors');
  assert.ok(requiredNotices('metrolinx').length >= 2);
  assert.ok(requiredNotices('ltc', 'fr')[0].includes('LTC'));
});
test('unknowns and negative access assessments remain blocking', () => {
  for (const key of ['licenceVisible', 'keyboard', 'screenReader']) {
    const plan = setUse(goodUse(), 'view-1', 'osm', { [key]: 'no' });
    assert.equal(auditPlacement(plan).blocked, true);
  }
});
test('imports fail closed on unsupported keys or repeated identifiers', () => {
  const plan = fixture();
  assert.throws(() => parsePlan({ ...plan, unexpected: true }));
  assert.throws(() => parsePlan({ ...plan, surfaces: [plan.surfaces[0], plan.surfaces[0]] }));
  assert.throws(() => parsePlan({ ...plan, schema: 'something-else' }));
});
test('imports reject invalid URLs, unsafe routes and control characters', () => {
  for (const route of ['https://example.com', '//outside', '/../private', '/bad<script>', '/\n']) {
    assert.throws(() => setSurface(fixture(), 'view-1', { route }));
  }
  assert.throws(() => addSurface(blankPlan(), 'hello\nworld'));
});
test('valid local routes are retained without contacting a site', () => {
  for (const route of ['/map', '/maps/routes?lang=fr', '/map#credits', UNKNOWN]) {
    assert.equal(setSurface(fixture(), 'view-1', { route }).surfaces[0].route, route);
  }
});
test('invalid calendar dates are rejected rather than normalised', () => {
  for (const retrievedOn of ['2026-02-30', '2026-13-01', '20-01-01', '']) {
    assert.throws(() => setUse(withUse(), 'view-1', 'osm', { retrievedOn }));
  }
});
test('large imports are rejected', () => {
  assert.throws(() => parsePlan(' '.repeat(1024 * 1024 + 1)));
});
test('source uses cannot be repeated or carry unrecognised fields', () => {
  const plan = withUse();
  assert.throws(() => setSurface(plan, 'view-1', { uses: [...plan.surfaces[0].uses, ...plan.surfaces[0].uses] }));
  assert.throws(() => setUse(plan, 'view-1', 'osm', { injected: true }));
});
test('input numbers have strict bounds', () => {
  for (const minTargetPx of [-1, 1001, NaN, Infinity, 43.5]) {
    assert.throws(() => setUse(withUse(), 'view-1', 'osm', { minTargetPx }));
  }
});
test('all modes, locations and tiers are accepted', () => {
  for (const mode of MODES) assert.equal(addSurface(blankPlan(), 'View', mode).surfaces[0].mode, mode);
  for (const location of LOCATIONS) assert.equal(setUse(withUse(), 'view-1', 'osm', { location }).surfaces[0].uses[0].location, location);
  for (const tier of TIERS) assert.equal(setUse(withUse(), 'view-1', 'osm', { tier }).surfaces[0].uses[0].tier, tier);
});
test('French legal notice remains literal, not machine paraphrased', () => {
  assert.equal(requiredNotices('osm', 'fr')[0], requiredNotices('osm', 'en')[0]);
  assert.ok(requiredNotices('metrolinx', 'fr')[0].startsWith('Data used in this product'));
});
test('all audit finding codes have English and French descriptions', () => {
  const codes = new Set([
    'SOURCE_UNKNOWN', 'LICENCE_UNKNOWN', 'RETRIEVAL_UNKNOWN', 'TIER_UNKNOWN', 'LOCATION_MISSING', 'OSM_NEAR_MAP', 'NOTICE_MISSING', 'OSM_CREDIT_MISSING', 'LICENCE_LINK_UNKNOWN', 'KEYBOARD_UNKNOWN', 'SCREEN_READER_UNKNOWN', 'TARGET_UNKNOWN', 'TARGET_SMALL', 'ROUTE_UNKNOWN', 'NO_SOURCES_RECORDED', 'NOTES_UNKNOWN',
  ]);
  for (const code of codes) for (const lang of ['en', 'fr']) assert.ok(FINDING_COPY[lang][code], `${lang} ${code}`);
});
test('all user-interface copy keys have bilingual counterparts', () => {
  assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fr).sort());
  for (const key of Object.keys(COPY.en)) for (const lang of ['en', 'fr']) assert.ok(COPY[lang][key].trim());
});
test('French copy avoids ASCII interrogative and exclamation punctuation', () => {
  for (const value of Object.values(COPY.fr)) assert.doesNotMatch(value, /(?<!\u00a0)[?!]/u);
});
test('offline route includes restrictive CSP, live region and local modules', async () => {
  const html = await readFile(join(here, 'placement.html'), 'utf8');
  assert.match(html, /connect-src 'none'/u);
  assert.match(html, /form-action 'none'/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /placement-route\.mjs/u);
  assert.match(html, /placement\.css/u);
});
test('route includes no network or persistence APIs', async () => {
  const js = await readFile(join(here, 'placement-route.mjs'), 'utf8');
  for (const banned of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'setInterval(', 'navigator.sendBeacon']) assert.ok(!js.includes(banned), banned);
  assert.match(js, /parsePlan\(raw\)/u);
  assert.match(js, /auditPlacement\(plan, locale\)/u);
});
test('controls and focus are sized for 44px and keyboard access', async () => {
  const css = await readFile(join(here, 'placement.css'), 'utf8');
  assert.match(css, /min-height:\s*44px/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /prefers-reduced-motion/u);
});
test('download filenames use the selected locale', () => {
  assert.equal(downloadName('en'), 'notice-placement-en.json');
  assert.equal(downloadName('fr'), 'notice-placement-fr.json');
});
test('no source list is assumed from an empty view', () => {
  const report = auditPlacement(fixture());
  assert.ok(report.findings.some((f) => f.code === 'NO_SOURCES_RECORDED'));
  assert.equal(report.blocked, false);
});
