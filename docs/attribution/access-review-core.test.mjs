import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_SCHEMA, REVIEW_MAX_BYTES, UNKNOWN, REVIEW_PROVIDERS,
  REVIEW_LICENCES, REVIEW_STATES, REVIEW_DISPOSITIONS, REVIEW_TIERS,
  REVIEW_KINDS, REVIEW_TECHNIQUES, REVIEW_RESULTS, REVIEW_LOCALES,
  ReviewInputError, isReviewObject, parseReviewDate, parseReviewUrl,
  parseReviewRoute, parseReviewTarget, parseReviewSource,
  parseReviewSurface, parseAccessReview, parseAccessReviewJson,
  exportAccessReview, summarizeReviewStructure, BufferlessByteLength,
} from './access-review-core.mjs';
import {
  reviewRelease, reviewSource, reviewSurface, reviewTarget,
  reviewObservation, cloneReview,
} from './access-review-fixtures.mjs';

function withSource(key, value) {
  const release = reviewRelease();
  release.sources[0][key] = value;
  return release;
}
function withSurface(key, value) {
  const release = reviewRelease();
  release.surfaces[0][key] = value;
  return release;
}
function withTarget(key, value) {
  const release = reviewRelease();
  release.surfaces[0].targets[0][key] = value;
  return release;
}
function withObservation(key, value) {
  const release = reviewRelease();
  release.surfaces[0].targets[0].observations[0][key] = value;
  return release;
}
function bad(path, input) {
  assert.throws(() => parseAccessReview(input), error => error instanceof ReviewInputError && error.path.endsWith(path.split('.').at(-1)));
}

test('schema constants are stable and input sizes bounded', () => {
  assert.equal(REVIEW_SCHEMA, 'attribution-access-review/1');
  assert.equal(REVIEW_MAX_BYTES, 2_097_152);
  assert.equal(UNKNOWN, 'UNKNOWN');
});
test('only explicit allowed providers and licences are recognised', () => {
  assert.deepEqual(REVIEW_PROVIDERS, ['osm', 'metrolinx', 'ltc', 'other']);
  assert.ok(REVIEW_LICENCES.includes('ODbL-1.0'));
  assert.ok(REVIEW_LICENCES.includes('Metrolinx-AUA'));
  assert.ok(REVIEW_LICENCES.includes('OGL-Ontario-Metrolinx'));
  assert.ok(REVIEW_LICENCES.includes('LTC-Open-Data-Terms'));
  assert.equal(REVIEW_LICENCES.at(-1), UNKNOWN);
});
test('all policy states are explicit and never coerced', () => {
  assert.deepEqual(REVIEW_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.deepEqual(REVIEW_DISPOSITIONS, ['included', 'held', 'excluded']);
  assert.deepEqual(REVIEW_TIERS, ['primary', 'secondary', 'community', UNKNOWN]);
  assert.deepEqual(REVIEW_RESULTS, ['PASS', 'FAIL', UNKNOWN]);
  assert.deepEqual(REVIEW_LOCALES, ['en', 'fr']);
  assert.equal(new Set(REVIEW_TECHNIQUES).size, REVIEW_TECHNIQUES.length);
  assert.equal(new Set(REVIEW_KINDS).size, REVIEW_KINDS.length);
});
test('object guards reject arrays, null, numbers and strings', () => {
  for (const value of [null, [], 1, false, 'abc']) assert.equal(isReviewObject(value), false);
  assert.equal(isReviewObject({}), true);
});
test('parse preserves a complete record without inventing dates', () => {
  const source = reviewRelease();
  const parsed = parseAccessReview(source);
  assert.deepEqual(parsed, source);
  assert.equal(parsed.sources[0].datasetDate, UNKNOWN);
  assert.equal(parsed.surfaces[0].targets[0].widthPx, 44);
});
test('round-trip JSON keeps canonical validated records', () => {
  const original = reviewRelease();
  const canonical = exportAccessReview(original);
  assert.ok(canonical.endsWith('\n'));
  assert.deepEqual(parseAccessReviewJson(canonical), original);
  assert.deepEqual(parseAccessReviewJson(exportAccessReview(parseAccessReviewJson(canonical))), original);
});
test('input JSON cannot exceed byte size limit', () => {
  const huge = `${' '.repeat(REVIEW_MAX_BYTES)}{}`;
  assert.throws(() => parseAccessReviewJson(huge), ReviewInputError);
});
test('UTF-8 byte counting accounts for multibyte characters', () => {
  assert.equal(BufferlessByteLength('abc'), 3);
  assert.equal(BufferlessByteLength('é'), 2);
  assert.equal(BufferlessByteLength('’'), 3);
});
test('invalid JSON reports a contract error, not raw parser internals', () => {
  assert.throws(() => parseAccessReviewJson('{'), /Invalid JSON/u);
  assert.throws(() => parseAccessReviewJson('not-json'), ReviewInputError);
});
test('rejects non-string input to JSON parser', () => {
  for (const value of [null, 1, {}, [], false]) assert.throws(() => parseAccessReviewJson(value), ReviewInputError);
});
test('strict top-level schema and no unknown attributes', () => {
  bad('release.schema', { ...reviewRelease(), schema: 'other' });
  bad('release.extra', { ...reviewRelease(), extra: true });
  const input = reviewRelease();
  delete input.releaseId;
  bad('release.releaseId', input);
});
test('rejects duplicate source identifiers', () => {
  const source = reviewSource();
  bad('release.sources', reviewRelease({ sources: [source, cloneReview(source)] }));
});
test('rejects duplicate surface identifiers', () => {
  const surface = reviewSurface();
  bad('release.surfaces', reviewRelease({ surfaces: [surface, cloneReview(surface)] }));
});
test('rejects duplicate surface publication routes', () => {
  const s = reviewSurface();
  bad('release.surfaces.route', reviewRelease({ surfaces: [s, reviewSurface({ id: 'other' })] }));
});
test('identifiers must be lowercase and bounded', () => {
  for (const value of ['UPPER', 'a_b', '-start', 'end-', 'two--words', 'a'.repeat(73), 'a b', 'école']) {
    bad('release.releaseId', reviewRelease({ releaseId: value }));
  }
  assert.equal(parseAccessReview(reviewRelease({ releaseId: 'release-2026-a' })).releaseId, 'release-2026-a');
});
test('rejects missing source fields', () => {
  for (const field of Object.keys(reviewSource())) {
    const source = reviewSource();
    delete source[field];
    bad(`sources[0].${field}`, reviewRelease({ sources: [source] }));
  }
});
test('rejects unexpected source fields', () => {
  bad('sources[0].extra', reviewRelease({ sources: [reviewSource({ extra: 'not declared' })] }));
});
test('rejects missing surface fields', () => {
  for (const field of Object.keys(reviewSurface())) {
    const surface = reviewSurface();
    delete surface[field];
    bad(`surfaces[0].${field}`, reviewRelease({ surfaces: [surface] }));
  }
});
test('rejects unexpected surface field', () => {
  bad('surfaces[0].remote', withSurface('remote', 'https://example.org'));
});
test('rejects missing target fields', () => {
  for (const field of Object.keys(reviewTarget())) {
    const target = reviewTarget();
    delete target[field];
    bad(`targets[0].${field}`, withSurface('targets', [target]));
  }
});
test('rejects unrecognised target field', () => {
  bad('targets[0].unknownField', withTarget('unknownField', true));
});
test('rejects missing observation fields', () => {
  for (const field of Object.keys(reviewObservation())) {
    const observation = reviewObservation();
    delete observation[field];
    bad(`observations[0].${field}`, withTarget('observations', [observation]));
  }
});
test('rejects extra observation fields', () => {
  bad('observations[0].extra', withObservation('extra', 'bad'));
});
test('duplicate observation techniques are not allowed', () => {
  bad('observations', withTarget('observations', [reviewObservation(), reviewObservation()]));
});
test('duplicate notice target IDs are not allowed', () => {
  const targets = [reviewTarget(), reviewTarget('terms', 'Licence terms', { id: 'notice-credit' })];
  bad('targets', withSurface('targets', targets));
});
test('duplicate source links in one surface are not allowed', () => {
  bad('sourceIds', withSurface('sourceIds', ['osm-record', 'osm-record']));
});
test('rejects invalid provider names', () => {
  for (const provider of ['miway', 'unknown', 'OSM', '', null]) bad('source.provider', withSource('provider', provider));
});
test('rejects invalid licence names', () => {
  for (const licence of ['odbl', 'Proprietary', 'CUSTOM', '', null]) bad('source.licence', withSource('licence', licence));
});
test('rejects noncanonical permission states', () => {
  for (const permission of ['yes', 'true', true, 1, '', null]) bad('source.permission', withSource('permission', permission));
});
test('rejects noncanonical publication dispositions', () => {
  for (const status of ['published', 'active', 'Included', '', null]) bad('source.status', withSource('status', status));
});
test('rejects unsupported evidence tiers', () => {
  for (const tier of ['gold', 'certified', 'official', 1]) bad('source.tier', withSource('tier', tier));
});
test('rejects unsupported target kinds', () => {
  for (const kind of ['unknown', 'map', 'button', '', null]) bad('target.kind', withTarget('kind', kind));
});
test('rejects unsupported technique values', () => {
  for (const technique of ['voice-control', 'camera', 'automated', 'mouse']) bad('technique', withObservation('technique', technique));
});
test('rejects unsupported outcome values', () => {
  for (const result of ['OK', 'YES', 'no', 'GOOD']) bad('result', withObservation('result', result));
});
test('unknown review outcomes and dates remain literal UNKNOWN', () => {
  const review = withObservation('result', UNKNOWN);
  review.surfaces[0].targets[0].testedDate = UNKNOWN;
  review.sources[0].datasetDate = UNKNOWN;
  const parsed = parseAccessReview(review);
  assert.equal(parsed.surfaces[0].targets[0].observations[0].result, UNKNOWN);
  assert.equal(parsed.surfaces[0].targets[0].testedDate, UNKNOWN);
  assert.equal(parsed.sources[0].datasetDate, UNKNOWN);
});
test('rejects missing and invalid ISO dates', () => {
  for (const date of ['', 'tomorrow', '2026-2-01', '2026-02-30', '2025-02-29', '2000-13-01', '1899-12-31', '0000-01-01', null, 22]) {
    assert.throws(() => parseReviewDate(date), ReviewInputError, String(date));
  }
});
test('leap days are accepted only in leap years', () => {
  assert.equal(parseReviewDate('2024-02-29'), '2024-02-29');
  assert.equal(parseReviewDate('2000-02-29'), '2000-02-29');
  assert.throws(() => parseReviewDate('2100-02-29'), ReviewInputError);
});
test('valid calendar dates and UNKNOWN are preserved', () => {
  for (const date of ['2026-11-19', '1999-12-31', '2024-02-29', UNKNOWN]) assert.equal(parseReviewDate(date), date);
});
test('rejects non-HTTPS source URLs', () => {
  for (const url of ['http://example.org', 'javascript:alert(1)', 'data:text/plain,x', 'ftp://example.org', '/relative', 'example.org', '', null]) {
    assert.throws(() => parseReviewUrl(url), ReviewInputError);
  }
});
test('rejects credentials and fragments in URLs', () => {
  for (const url of ['https://me:secret@example.org/a', 'https://example.org/a#section']) assert.throws(() => parseReviewUrl(url), ReviewInputError);
});
test('rejects localhost, numeric and local names', () => {
  for (const url of ['https://localhost/a', 'https://service.local/a', 'https://127.0.0.1/a', 'https://192.168.1.1/a', 'https://[::1]/a']) {
    assert.throws(() => parseReviewUrl(url), ReviewInputError, url);
  }
});
test('accepts HTTPS public links without changing spelling', () => {
  assert.equal(parseReviewUrl('https://example.org/x?a=b'), 'https://example.org/x?a=b');
  assert.equal(parseReviewUrl(UNKNOWN), UNKNOWN);
});
test('rejects unsafe relative routes', () => {
  for (const route of ['../index.html', '/root.html', 'https://example.org', 'a\\b.html', 'a//b.html', '.hidden', './a.html', 'a?query', 'a#frag', 'a/../b', '']) {
    assert.throws(() => parseReviewRoute(route), ReviewInputError, route);
  }
});
test('safe relative routes preserve slashes', () => {
  assert.equal(parseReviewRoute('pages/en/sources.html'), 'pages/en/sources.html');
  assert.equal(parseReviewRoute('index.html'), 'index.html');
});
test('pixel target must be an integer within the declared bound', () => {
  for (const value of [-1, 1.5, Number.POSITIVE_INFINITY, 1001, null, '44']) bad('target.widthPx', withTarget('widthPx', value));
  for (const value of [0, 44, 1000, UNKNOWN]) assert.equal(parseReviewTarget(reviewTarget('credit', 'test', { widthPx: value })).widthPx, value);
});
test('rejects oversized and control-character fields', () => {
  bad('notice', withSource('notice', 'x'.repeat(6001)));
  bad('text', withTarget('text', 'x'.repeat(6001)));
  bad('note', withObservation('note', 'x'.repeat(1201)));
  bad('text', withTarget('text', 'unexpected\u0000null'));
});
test('multiline legal notices and notes are permitted', () => {
  const source = parseReviewSource(reviewSource({ notice: 'Line one\nLine two' }));
  assert.equal(source.notice, 'Line one\nLine two');
  const note = parseReviewTarget(reviewTarget('credit', 'Some\ntext', { observations: [reviewObservation('keyboard', { note: 'A\nB' })] }));
  assert.equal(note.observations[0].note, 'A\nB');
});
test('NFC normalization is required rather than rewriting values', () => {
  bad('notice', withSource('notice', 'e\u0301'));
  assert.equal(parseReviewSource(reviewSource({ notice: 'é' })).notice, 'é');
});
test('array and record counts are bounded', () => {
  bad('release.sources', reviewRelease({ sources: Array.from({ length: 501 }, () => reviewSource()) }));
  bad('release.surfaces', reviewRelease({ surfaces: Array.from({ length: 501 }, () => reviewSurface()) }));
  bad('sourceIds', withSurface('sourceIds', Array.from({ length: 201 }, (_, i) => `s-${i}`)));
  bad('targets', withSurface('targets', Array.from({ length: 401 }, (_, i) => reviewTarget('credit', 'x', { id: `t-${i}` }))));
  bad('observations', withTarget('observations', Array.from({ length: 13 }, (_, i) => reviewObservation('keyboard'))));
});
test('structures do not acquire inferred permissions', () => {
  const parsed = parseAccessReview(withSource('permission', UNKNOWN));
  assert.equal(parsed.sources[0].permission, UNKNOWN);
});
test('summary uses included records and does not imply success', () => {
  const summary = summarizeReviewStructure(reviewRelease());
  assert.deepEqual(summary, {
    releaseId: 'release-one', sources: 1, includedSources: 1, surfaces: 1,
    includedSurfaces: 1, targets: 2, unknownDatasetDates: 1,
  });
});
test('summary ignores held surfaces for target count', () => {
  const r = reviewRelease();
  r.surfaces.push(reviewSurface({ id: 'held-view', route: 'held.html', status: 'held' }));
  assert.equal(summarizeReviewStructure(r).targets, 2);
});
