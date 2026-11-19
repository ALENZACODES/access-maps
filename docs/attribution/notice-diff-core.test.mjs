import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTICE_SCHEMA, UNKNOWN, NoticeInputError, parseNoticeRelease, parseNoticeReleaseJson,
  parseNoticeSource, parseNotice, parseNoticeSurface, LEGAL_NOTICES, hasFullNotice,
  licenceMatchesProvider, knownCatalogueProvider, catalogueFor, normalizedNotice,
  MAX_DOCUMENT_BYTES,
} from './notice-diff-core.mjs';
import {
  source, notice, surface, release, auaSource, oglSource, ltcSource,
  duplicate, mutateSource, mutateNotice, mutateSurface,
} from './notice-diff-fixtures.mjs';

function fails(input, match) {
  assert.throws(() => parseNoticeRelease(input), e => e instanceof NoticeInputError && (!match || e.message.includes(match)));
}
test('schema is versioned', () => assert.equal(NOTICE_SCHEMA, 'attribution-notice-diff/1'));
test('an empty release is structurally valid for an explicit audit', () => {
  const parsed = parseNoticeRelease(release({ sources: [], notices: [], surfaces: [] }));
  assert.equal(parsed.sources.length, 0);
});
test('a normal release round-trips as JSON', () => {
  const current = release();
  const result = parseNoticeReleaseJson(JSON.stringify(current));
  assert.deepEqual(result, current);
});
test('the parser does not fill missing dataset dates', () => {
  const parsed = parseNoticeRelease(mutateSource(release(), { datasetDate: UNKNOWN }));
  assert.equal(parsed.sources[0].datasetDate, UNKNOWN);
});
test('parsed release and arrays are frozen', () => {
  const parsed = parseNoticeRelease(release());
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.sources));
  assert.ok(Object.isFrozen(parsed.sources[0]));
  assert.ok(Object.isFrozen(parsed.notices));
  assert.ok(Object.isFrozen(parsed.notices[0]));
  assert.ok(Object.isFrozen(parsed.surfaces));
});
test('source and licence identifiers use the shared catalogue', () => {
  assert.equal(knownCatalogueProvider(auaSource()), true);
  assert.equal(knownCatalogueProvider(source({ provider: 'other', licence: 'OTHER-OPEN' })), false);
  assert.equal(catalogueFor(source()).id, 'osm');
  assert.equal(catalogueFor(source({ provider: 'other', licence: 'OTHER-OPEN' })), null);
});
test('legal notices are drawn from the catalogue', () => {
  assert.ok(LEGAL_NOTICES.osmCredit.includes('OpenStreetMap'));
  assert.ok(LEGAL_NOTICES.osmLicence.includes('ODbL'));
  assert.ok(LEGAL_NOTICES.aua[0].includes('Metrolinx'));
  assert.ok(LEGAL_NOTICES.aua[1].includes('applicable laws'));
  assert.ok(LEGAL_NOTICES.aua[2].includes('lois applicables'));
  assert.ok(LEGAL_NOTICES.ogl.includes('Open Government Licence'));
});
test('notice matching preserves content while tolerating whitespace', () => {
  assert.equal(hasFullNotice('  Map   credit\n notice  ', 'Map credit notice'), true);
  assert.equal(hasFullNotice('Map credit', 'Different text'), false);
  assert.equal(normalizedNotice(' a\t b '), 'a b');
});
test('provider licence families are never inferred from names', () => {
  assert.equal(licenceMatchesProvider(source()), true);
  assert.equal(licenceMatchesProvider(auaSource()), true);
  assert.equal(licenceMatchesProvider(oglSource()), true);
  assert.equal(licenceMatchesProvider(ltcSource()), true);
  assert.equal(licenceMatchesProvider(source({ provider: 'osm', licence: 'Metrolinx-AUA' })), false);
  assert.equal(licenceMatchesProvider(source({ provider: 'other', licence: 'ODbL-1.0' })), false);
});
test('source parser uses explicit optional note defaults', () => {
  const { note: _omit, ...without } = source();
  assert.equal(parseNoticeSource(without).note, '');
});
test('multiline notice text is allowed', () => {
  const result = parseNotice(notice({ text: 'English notice\nMention française' }));
  assert.match(result.text, /\n/u);
});
test('multiline source note is allowed', () => {
  const result = parseNoticeSource(source({ note: 'First evidence\nSecond evidence' }));
  assert.match(result.note, /\n/u);
});
test('notice and surface helpers parse independently', () => {
  assert.equal(parseNotice(notice()).sourceId, 'map-source');
  assert.equal(parseNoticeSurface(surface()).locale, 'en');
});
for (const value of [null, [], false, 0, 'text', undefined]) {
  test(`root rejects non-object value ${String(value)}`, () => fails(value, 'Expected object'));
}
for (const name of ['schema', 'releaseId', 'sources', 'notices', 'surfaces']) {
  test(`root requires ${name}`, () => {
    const input = duplicate(release());
    delete input[name];
    fails(input, `release.${name}`);
  });
}
test('root rejects extra fields', () => fails({ ...release(), extra: 5 }, 'Unknown field'));
test('root rejects version drift', () => fails({ ...release(), schema: 'attribution-notice-diff/2' }, 'Unsupported version'));
for (const identifier of ['AB', 'two_words', 'with space', 'x/y', '..', '', '0abc', 'á', 'a-', '-a']) {
  test(`release identifier rejects ${JSON.stringify(identifier)}`, () => fails({ ...release(), releaseId: identifier }, 'releaseId'));
}
for (const path of ['sources', 'notices', 'surfaces']) {
  test(`${path} must be an array`, () => fails({ ...release(), [path]: {} }, path));
  test(`${path} rejects null`, () => fails({ ...release(), [path]: null }, path));
}
test('source list has a hard cap', () => fails(release({ sources: Array(251).fill(source()) }), 'release.sources'));
test('notice list has a hard cap', () => fails(release({ notices: Array(1001).fill(notice()) }), 'release.notices'));
test('surface list has a hard cap', () => fails(release({ surfaces: Array(401).fill(surface()) }), 'release.surfaces'));
test('duplicate source identifiers fail', () => fails(release({ sources: [source(), source()] }), 'Duplicate identifier'));
test('duplicate notice identifiers fail', () => fails(release({ notices: [notice(), notice()] }), 'Duplicate identifier'));
test('duplicate surface identifiers fail', () => fails(release({ surfaces: [surface(), surface()] }), 'Duplicate identifier'));
test('duplicate route paths fail', () => fails(release({ surfaces: [surface(), surface({ id: 'other-view' })] }), 'Duplicate route'));
const sourceCases = [
  ['provider', 'unknown-provider'], ['licence', 'not-a-licence'],
  ['sourceUrl', 'javascript:alert(1)'], ['licenceUrl', 'http://example.org'],
  ['sourceUrl', 'https://username:password@example.org'],
  ['sourceUrl', 'https://localhost/data'], ['sourceUrl', 'https://127.0.0.1/data'],
  ['sourceUrl', 'https://192.168.1.1/data'], ['sourceUrl', 'https://10.10.1.1/data'],
  ['sourceUrl', 'https://example.local/data'], ['sourceUrl', 'https://example.org/#fragment'],
  ['permission', 'MAYBE'], ['licenceEvidence', null], ['tier', 'gold'],
  ['state', 'published'], ['acquiredDate', '2026-02-30'], ['datasetDate', '2026-13-01'],
  ['termsDate', '2026-00-01'], ['licenceName', ''], ['id', 'BAD ID'],
];
for (const [key, value] of sourceCases) {
  test(`source rejects invalid ${key}=${String(value)}`, () => fails(mutateSource(release(), { [key]: value }), `.${key}`));
}
for (const key of ['id', 'provider', 'licence', 'sourceUrl', 'licenceUrl', 'licenceName', 'permission', 'licenceEvidence', 'tier', 'acquiredDate', 'datasetDate', 'termsDate', 'state']) {
  test(`source requires ${key}`, () => {
    const input = duplicate(release());
    delete input.sources[0][key];
    fails(input, `.sources[0].${key}`);
  });
}
test('source rejects unexpected properties', () => fails(mutateSource(release(), { email: 'private@example.org' }), 'Unknown field'));
test('source rejects non-NFC text', () => fails(mutateSource(release(), { licenceName: 'cafe\u0301' }), 'NFC'));
test('source rejects control characters', () => fails(mutateSource(release(), { licenceName: 'bad\u0000value' }), 'Control'));
const noticeCases = [
  ['kind', 'unknown-kind'], ['locale', 'es'], ['visible', false],
  ['nearMap', 'MAYBE'], ['termsUrl', 'file:///etc/passwd'],
  ['recordedDate', '2026-11-31'], ['text', ''], ['text', '<escape>\u0000'],
  ['id', 'Not Valid'], ['sourceId', '#source'],
];
for (const [key, value] of noticeCases) {
  test(`notice rejects invalid ${key}`, () => fails(mutateNotice(release(), { [key]: value }), `.notices[0].${key}`));
}
for (const key of ['id', 'sourceId', 'locale', 'kind', 'text', 'visible', 'nearMap', 'termsUrl', 'recordedDate']) {
  test(`notice requires ${key}`, () => {
    const input = duplicate(release());
    delete input.notices[0][key];
    fails(input, `.notices[0].${key}`);
  });
}
const surfaceCases = [
  ['locale', 'de'], ['mode', 'other-mode'], ['offline', true],
  ['keyboard', 'SOMETIMES'], ['screenReader', null],
  ['targetPx', 20.5], ['targetPx', -1], ['targetPx', 1001],
  ['publishedDate', '2026-02-29'], ['route', '/absolute.html'],
  ['route', '../escape.html'], ['route', './relative.html'],
  ['route', 'pages/../escape.html'], ['route', 'pages//empty.html'],
  ['route', 'pages/file.html?x=1'], ['route', 'pages\\bad.html'],
];
for (const [key, value] of surfaceCases) {
  test(`surface rejects invalid ${key}=${String(value)}`, () => fails(mutateSurface(release(), { [key]: value }), `.surfaces[0].${key}`));
}
for (const key of ['id', 'route', 'locale', 'mode', 'sourceIds', 'noticeIds', 'offline', 'keyboard', 'screenReader', 'targetPx', 'publishedDate']) {
  test(`surface requires ${key}`, () => {
    const input = duplicate(release());
    delete input.surfaces[0][key];
    fails(input, `.surfaces[0].${key}`);
  });
}
test('surface rejects duplicate source references', () => fails(mutateSurface(release(), { sourceIds: ['map-source', 'map-source'] }), 'Duplicate IDs'));
test('surface rejects duplicate notice references', () => fails(mutateSurface(release(), { noticeIds: ['map-credit', 'map-credit'] }), 'Duplicate IDs'));
test('surface accepts UNKNOWN size as explicit unknown', () => assert.equal(parseNoticeSurface(surface({ targetPx: UNKNOWN })).targetPx, UNKNOWN));
test('JSON parser rejects non-JSON input', () => assert.throws(() => parseNoticeReleaseJson('{'), NoticeInputError));
test('JSON parser rejects a non-string argument', () => assert.throws(() => parseNoticeReleaseJson({}), NoticeInputError));
test('JSON parser rejects excessive UTF-8 byte counts', () => assert.throws(() => parseNoticeReleaseJson('é'.repeat(MAX_DOCUMENT_BYTES)), NoticeInputError));
test('parser recognises a valid leap day', () => assert.equal(parseNoticeSource(source({ datasetDate: '2024-02-29' })).datasetDate, '2024-02-29'));
test('parser refuses invalid leap days', () => assert.throws(() => parseNoticeSource(source({ datasetDate: '2025-02-29' })), NoticeInputError));
