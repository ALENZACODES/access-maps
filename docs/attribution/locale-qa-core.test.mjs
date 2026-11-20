import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_QA_SCHEMA, UNKNOWN, MAX_BYTES, LocaleQaInputError,
  parseLocaleSource, parseLocaleNotice, parseLocalePage, parseLocaleQa,
  parseLocaleQaJson, serializeLocaleQa, locatePage, locateSource,
  pairedPages, sourcesUsedByPages, noticeById,
} from './locale-qa-core.mjs';
import {
  fixtureRelease, fixtureSource, fixturePage, fixtureNotice,
  copyFixture, withNotice, metrolinxRelease, ltcRelease, otherOpenRelease,
} from './locale-qa-fixtures.mjs';

const valid = fixtureRelease();
const rejects = (input, path) => assert.throws(() => parseLocaleQa(input), error => error instanceof LocaleQaInputError && error.path.includes(path));

test('public schema identifier remains stable', () => {
  assert.equal(LOCALE_QA_SCHEMA, 'attribution-locale-qa/1');
  assert.equal(UNKNOWN, 'UNKNOWN');
});
test('the normal release has explicit bilingual pages', () => {
  const parsed = parseLocaleQa(valid);
  assert.equal(parsed.releaseId, 'release-one');
  assert.deepEqual(parsed.pages.map(p => p.locale), ['en', 'fr']);
});
test('normalization copies arrays rather than returning the mutable original', () => {
  const input = fixtureRelease();
  const parsed = parseLocaleQa(input);
  assert.notEqual(parsed, input);
  assert.notEqual(parsed.sources, input.sources);
  assert.notEqual(parsed.pages, input.pages);
  assert.notEqual(parsed.pages[0].notices, input.pages[0].notices);
});
test('canonical JSON output has one trailing newline', () => {
  const raw = serializeLocaleQa(fixtureRelease());
  assert.ok(raw.endsWith('\n'));
  assert.ok(!raw.endsWith('\n\n'));
  assert.deepEqual(parseLocaleQaJson(raw), parseLocaleQa(fixtureRelease()));
});
test('JSON parse errors are explicit input errors', () => {
  for (const value of ['{', 'invalid', '[]foo', '', 'null,,']) {
    assert.throws(() => parseLocaleQaJson(value), LocaleQaInputError);
  }
});
test('JSON parser rejects nonstring input', () => {
  for (const value of [null, 3, {}, [], undefined, true]) {
    assert.throws(() => parseLocaleQaJson(value), LocaleQaInputError);
  }
});
test('JSON input has a strict byte ceiling', () => {
  const payload = ' '.repeat(MAX_BYTES + 1);
  assert.throws(() => parseLocaleQaJson(payload), /too large/u);
});
test('UTF-8 sizing counts multibyte characters', () => {
  const payload = 'é'.repeat(Math.floor(MAX_BYTES / 2) + 1);
  assert.throws(() => parseLocaleQaJson(payload), /too large/u);
});
test('the release root rejects unexpected schema', () => {
  rejects({ ...valid, schema: 'next-schema' }, 'schema');
});
test('the release root rejects unknown fields', () => {
  rejects({ ...valid, injected: true }, 'injected');
});
test('the release root rejects missing required fields', () => {
  for (const field of ['schema', 'releaseId', 'sources', 'pages', 'requireBilingual']) {
    const input = copyFixture(valid);
    delete input[field];
    rejects(input, field);
  }
});
test('the bilingual policy must be a boolean', () => {
  for (const value of [0, 'true', UNKNOWN, null, [], {}]) {
    rejects({ ...valid, requireBilingual: value }, 'requireBilingual');
  }
});
test('release identifier must be stable and URL-safe', () => {
  for (const value of ['', 'A', '-release', 'release--one', 'release_one', '../release', ' r ', 'a'.repeat(73)]) {
    rejects({ ...valid, releaseId: value }, 'releaseId');
  }
});
test('valid lowercase release IDs accept numbers and hyphens', () => {
  for (const id of ['release-a', 'release-2026', 'a2', 'a-b-c-4']) {
    assert.equal(parseLocaleQa({ ...valid, releaseId: id }).releaseId, id);
  }
});
test('the contract rejects unbounded source count', () => {
  const sources = Array.from({ length: 351 }, (_, i) => fixtureSource({ id: `source-${i}` }));
  rejects({ ...valid, sources }, 'sources');
});
test('the contract rejects unbounded page count', () => {
  const pages = Array.from({ length: 351 }, (_, i) => fixturePage({ id: `page-${i}`, route: `pages/${i}.html` }));
  rejects({ ...valid, pages }, 'pages');
});
test('the contract rejects duplicate source IDs', () => {
  rejects({ ...valid, sources: [fixtureSource(), fixtureSource()] }, 'sources');
});
test('the contract rejects duplicate page IDs', () => {
  rejects({ ...valid, pages: [fixturePage(), fixturePage()] }, 'pages');
});
test('the contract rejects two pages with the same route', () => {
  const other = fixturePage({ id: 'another-page' });
  rejects({ ...valid, pages: [fixturePage(), other] }, 'routes');
});
test('the contract rejects duplicate notice IDs per page', () => {
  const page = fixturePage({ notices: [fixtureNotice(), fixtureNotice()] });
  rejects({ ...valid, pages: [page] }, 'notices');
});
test('different pages can reuse a notice ID locally', () => {
  const pages = [fixturePage(), fixturePage({ id: 'other-page', route: 'pages/other.html' })];
  assert.equal(parseLocaleQa({ ...valid, pages }).pages.length, 2);
});
test('source records reject missing fields', () => {
  for (const key of Object.keys(fixtureSource())) {
    const source = fixtureSource();
    delete source[key];
    assert.throws(() => parseLocaleSource(source), LocaleQaInputError, key);
  }
});
test('source records reject unexpected fields', () => {
  assert.throws(() => parseLocaleSource({ ...fixtureSource(), extra: 'yes' }), /Unexpected field/u);
});
test('source records reject unsupported provider identities', () => {
  for (const provider of ['not-supported', '', 'all', 'regional', null]) {
    assert.throws(() => parseLocaleSource(fixtureSource({ provider })), LocaleQaInputError);
  }
});
test('source records reject unsupported licence families', () => {
  for (const terms of ['', 'ODbL', 'PRIVATE', UNKNOWN, 'Metrolinx-combined']) {
    assert.throws(() => parseLocaleSource(fixtureSource({ terms })), LocaleQaInputError);
  }
});
test('source records keep permission UNKNOWN as UNKNOWN', () => {
  const parsed = parseLocaleSource(fixtureSource({ permission: UNKNOWN }));
  assert.equal(parsed.permission, UNKNOWN);
});
test('source records keep evidence UNKNOWN as UNKNOWN', () => {
  const parsed = parseLocaleSource(fixtureSource({ licenceEvidence: UNKNOWN }));
  assert.equal(parsed.licenceEvidence, UNKNOWN);
});
test('source records preserve unknown dates individually', () => {
  const parsed = parseLocaleSource(fixtureSource({ acquiredDate: UNKNOWN, datasetDate: UNKNOWN, termsDate: UNKNOWN }));
  assert.equal(parsed.acquiredDate, UNKNOWN);
  assert.equal(parsed.datasetDate, UNKNOWN);
  assert.equal(parsed.termsDate, UNKNOWN);
});
test('source records reject invalid permission values', () => {
  for (const field of ['permission', 'licenceEvidence']) {
    for (const value of ['yes', 'TRUE', true, 1, 'maybe', '']) {
      assert.throws(() => parseLocaleSource(fixtureSource({ [field]: value })), LocaleQaInputError);
    }
  }
});
test('source records restrict evidence tier vocabulary', () => {
  for (const value of ['self-certified', 'confirmed', '', null]) {
    assert.throws(() => parseLocaleSource(fixtureSource({ evidenceTier: value })), LocaleQaInputError);
  }
});
test('source records allow the explicit tier UNKNOWN', () => {
  assert.equal(parseLocaleSource(fixtureSource({ evidenceTier: UNKNOWN })).evidenceTier, UNKNOWN);
});
test('source records restrict publication state vocabulary', () => {
  for (const value of ['ready', 'approved', 'published', 'deleted', null]) {
    assert.throws(() => parseLocaleSource(fixtureSource({ status: value })), LocaleQaInputError);
  }
});
test('source URLs must use public HTTPS', () => {
  for (const value of [
    'http://example.org/data', 'javascript:alert(1)', 'file:///a',
    'https://localhost/test', 'https://example.local/data',
    'https://127.0.0.1/private', 'https://10.0.0.2/private',
    'https://192.168.1.1/private', 'https://172.16.0.1/private',
    'https://0.0.0.0/private', 'https://user:password@example.org/data',
    'https://example.org/data#fragment', 'https://[::1]/data',
  ]) {
    assert.throws(() => parseLocaleSource(fixtureSource({ sourceUrl: value })), LocaleQaInputError, value);
  }
});
test('licence URL rejects unsafe public-facing links', () => {
  for (const value of ['http://example.org', 'https://localhost', 'ftp://example.org', 'https://example.org/t#part']) {
    assert.throws(() => parseLocaleSource(fixtureSource({ licenceUrl: value })), LocaleQaInputError);
  }
});
test('unknown URLs remain unknown without inference', () => {
  const parsed = parseLocaleSource(fixtureSource({ sourceUrl: UNKNOWN, licenceUrl: UNKNOWN }));
  assert.equal(parsed.sourceUrl, UNKNOWN);
  assert.equal(parsed.licenceUrl, UNKNOWN);
});
test('dates accept Gregorian leap dates', () => {
  assert.equal(parseLocaleSource(fixtureSource({ acquiredDate: '2024-02-29' })).acquiredDate, '2024-02-29');
});
test('dates reject impossible day/month combinations', () => {
  for (const value of ['2025-02-29','2026-04-31','2026-00-01','2026-13-01','2026-01-00','1899-01-01','2026-1-01','2026-01-1']) {
    assert.throws(() => parseLocaleSource(fixtureSource({ termsDate: value })), LocaleQaInputError);
  }
});
test('NFC normalization is required for public text', () => {
  assert.throws(() => parseLocaleSource(fixtureSource({ name: 'Cafe\u0301' })), /normalized/u);
});
test('unsafe control characters are rejected from records', () => {
  for (const value of ['a\u0000b', 'a\u001fb', 'a\u007fb']) {
    assert.throws(() => parseLocaleSource(fixtureSource({ name: value })), LocaleQaInputError);
  }
});
test('multiline evidence notes are allowed', () => {
  assert.equal(parseLocaleNotice(fixtureNotice({ evidenceNote: 'First line\nSecond line' })).evidenceNote, 'First line\nSecond line');
});
test('notice records reject every omitted required field', () => {
  for (const field of Object.keys(fixtureNotice())) {
    const notice = fixtureNotice();
    delete notice[field];
    assert.throws(() => parseLocaleNotice(notice), LocaleQaInputError, field);
  }
});
test('notice records reject extra fields', () => {
  assert.throws(() => parseLocaleNotice({ ...fixtureNotice(), secret: 'hidden' }), /Unexpected field/u);
});
test('notice IDs require lowercase stable identifiers', () => {
  for (const id of ['Bad', 'bad_id', '../bad', '', 'a--b']) {
    assert.throws(() => parseLocaleNotice(fixtureNotice({ id })), LocaleQaInputError);
  }
});
test('notice source identifiers must be valid', () => {
  for (const sourceId of ['Wrong', '', 'path/part', 'item_1']) {
    assert.throws(() => parseLocaleNotice(fixtureNotice({ sourceId })), LocaleQaInputError);
  }
});
test('notice kinds are strictly enumerated', () => {
  for (const kind of ['translated', 'notices', 'map', '', null]) {
    assert.throws(() => parseLocaleNotice(fixtureNotice({ kind })), LocaleQaInputError);
  }
});
test('notice control targets must be bounded integers', () => {
  for (const targetPx of [-1, 2.5, 2001, NaN, Infinity, '44', null]) {
    assert.throws(() => parseLocaleNotice(fixtureNotice({ targetPx })), LocaleQaInputError);
  }
});
test('notice target can be explicitly UNKNOWN', () => {
  assert.equal(parseLocaleNotice(fixtureNotice({ targetPx: UNKNOWN })).targetPx, UNKNOWN);
});
test('notice metadata may be negative or unknown without being silently changed', () => {
  for (const field of ['visible', 'nearContent', 'keyboard', 'screenReader', 'contrast']) {
    assert.equal(parseLocaleNotice(fixtureNotice({ [field]: 'NO' }))[field], 'NO');
    assert.equal(parseLocaleNotice(fixtureNotice({ [field]: UNKNOWN }))[field], UNKNOWN);
  }
});
test('notice review states are explicit', () => {
  for (const state of ['accepted', 'pending', 'rejected', UNKNOWN]) {
    assert.equal(parseLocaleNotice(fixtureNotice({ review: state })).review, state);
  }
});
test('notice review state rejects unsupported values', () => {
  for (const value of ['done', 'approved', 'confirmed', true]) {
    assert.throws(() => parseLocaleNotice(fixtureNotice({ review: value })), LocaleQaInputError);
  }
});
test('notice evidence URLs must be HTTPS or UNKNOWN', () => {
  for (const value of ['http://example.org', 'file:///evidence', 'https://localhost/evidence']) {
    assert.throws(() => parseLocaleNotice(fixtureNotice({ evidenceUrl: value })), LocaleQaInputError);
  }
  assert.equal(parseLocaleNotice(fixtureNotice({ evidenceUrl: UNKNOWN })).evidenceUrl, UNKNOWN);
});
test('page records reject every missing field', () => {
  for (const field of Object.keys(fixturePage())) {
    const page = fixturePage();
    delete page[field];
    assert.throws(() => parseLocalePage(page), LocaleQaInputError, field);
  }
});
test('page record rejects unknown fields', () => {
  assert.throws(() => parseLocalePage({ ...fixturePage(), note: 'extra' }), LocaleQaInputError);
});
test('page routes must remain relative to a published directory', () => {
  for (const route of ['/absolute.html','../outside.html','a/../b','a//b','a/./b','https://example.org','a?x=y','a#part','a\\b']) {
    assert.throws(() => parseLocalePage(fixturePage({ route })), LocaleQaInputError, route);
  }
});
test('pages must identify supported language codes', () => {
  for (const locale of ['FR', 'fr-CA', 'es', '', UNKNOWN]) {
    assert.throws(() => parseLocalePage(fixturePage({ locale })), LocaleQaInputError);
  }
});
test('page source IDs cannot repeat', () => {
  assert.throws(() => parseLocalePage(fixturePage({ sourceIds: ['osm-source','osm-source'] })), LocaleQaInputError);
});
test('page source IDs must be valid identifiers', () => {
  assert.throws(() => parseLocalePage(fixturePage({ sourceIds: ['OSM'] })), LocaleQaInputError);
});
test('page offline status remains explicit UNKNOWN', () => {
  assert.equal(parseLocalePage(fixturePage({ offline: UNKNOWN })).offline, UNKNOWN);
});
test('page target dimensions reject unsafe values', () => {
  for (const value of [-1, 3.5, 2001, '48']) {
    assert.throws(() => parseLocalePage(fixturePage({ targetPx: value })), LocaleQaInputError);
  }
});
test('page notices reject unbounded arrays', () => {
  const notices = Array.from({ length: 1601 }, (_, i) => fixtureNotice({ id: `n-${i}` }));
  assert.throws(() => parseLocalePage(fixturePage({ notices })), LocaleQaInputError);
});
test('page display types are strictly enumerated', () => {
  for (const display of ['dashboard', 'widget', '', null]) {
    assert.throws(() => parseLocalePage(fixturePage({ display })), LocaleQaInputError);
  }
});
test('page status types are strictly enumerated', () => {
  for (const publicStatus of ['live', 'posted', 'ready', 'published']) {
    assert.throws(() => parseLocalePage(fixturePage({ publicStatus })), LocaleQaInputError);
  }
});
test('lookup returns the requested source', () => {
  assert.equal(locateSource(valid, 'osm-source')?.id, 'osm-source');
  assert.equal(locateSource(valid, 'missing'), null);
});
test('lookup returns the requested publication page', () => {
  assert.equal(locatePage(valid, 'page-fr')?.locale, 'fr');
  assert.equal(locatePage(valid, 'missing'), null);
});
test('notice lookup is scoped to the containing page', () => {
  assert.equal(noticeById(valid.pages[0], 'osm-credit')?.kind, 'credit');
  assert.equal(noticeById(valid.pages[0], 'credit-fr'), null);
});
test('pairedPages pairs explicit English and French IDs', () => {
  const pairs = pairedPages(valid);
  assert.equal(pairs.size, 1);
  assert.equal(pairs.get('map-attribution')?.en?.id, 'page-en');
  assert.equal(pairs.get('map-attribution')?.fr?.id, 'page-fr');
});
test('pairedPages keeps an absent locale as null', () => {
  const pairs = pairedPages({ pages: [fixturePage()] });
  assert.equal(pairs.get('map-attribution')?.fr, null);
});
test('sourcesUsedByPages deduplicates and sorts dependent pages', () => {
  const map = sourcesUsedByPages({ ...valid, pages: [...valid.pages, fixturePage({ id: 'another-page', locale: 'en', route: 'pages/another.html' })] });
  assert.deepEqual(map.get('osm-source'), ['another-page','page-en','page-fr']);
});
test('sourcesUsedByPages includes unused sources with an empty array', () => {
  const map = sourcesUsedByPages({ ...valid, sources: [...valid.sources, fixtureSource({ id: 'unused-source' })] });
  assert.deepEqual(map.get('unused-source'), []);
});
test('source fixtures support all implemented provider terms', () => {
  for (const release of [metrolinxRelease('AUA'), metrolinxRelease('OGL'), ltcRelease(), otherOpenRelease()]) {
    assert.equal(parseLocaleQa(release).sources.length, 1);
    assert.equal(parseLocaleQa(release).pages.length, 2);
  }
});
test('per-notice mutation utility does not mutate its original', () => {
  const next = withNotice(valid, 'page-en', 'osm-credit', { visible: 'NO' });
  assert.equal(next.pages[0].notices[0].visible, 'NO');
  assert.equal(valid.pages[0].notices[0].visible, 'YES');
});
