import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIM_SCHEMA, CLAIM_MAX_BYTES, ClaimInputError, parseClaimTrace, parseClaimTraceJson, parseClaimSource, parseClaimReference, parseClaimStatement, parseClaimSurface, serialiseClaimTrace, catalogueSource } from './claim-trace-core.mjs';
import { source, reference, claim, surface, release, copy } from './claim-trace-fixture.test.mjs';

test('known release parses with no inferred dates', () => {
  const parsed = parseClaimTrace(release());
  assert.equal(parsed.schema, CLAIM_SCHEMA);
  assert.equal(parsed.sources[0].datasetDate, 'UNKNOWN');
  assert.equal(parsed.surfaces[0].publishedDate, 'UNKNOWN');
});
test('round-trip emits strict canonical JSON', () => {
  const before = release();
  const text = serialiseClaimTrace(before);
  assert.deepEqual(parseClaimTraceJson(text), before);
  assert.equal(text.endsWith('\n'), true);
});
test('input JSON must fit bounded UTF-8 size', () => {
  assert.throws(() => parseClaimTraceJson('x'.repeat(CLAIM_MAX_BYTES + 1)), ClaimInputError);
});
test('input JSON fails closed', () => {
  for (const content of ['', 'no', '[', '{}', 'null', '42', '[]', '{"schema":"other"}']) {
    assert.throws(() => parseClaimTraceJson(content), ClaimInputError, content);
  }
});
test('unknown catalogue provider is not invented', () => {
  assert.equal(catalogueSource('other'), null);
  assert.ok(catalogueSource('osm'));
});

for (const field of ['schema', 'releaseId', 'sources', 'references', 'claims', 'surfaces']) {
  test(`required release field ${field} cannot be missing`, () => {
    const bad = copy(release()); delete bad[field];
    assert.throws(() => parseClaimTrace(bad), ClaimInputError);
  });
}
test('unexpected release fields fail closed', () => {
  assert.throws(() => parseClaimTrace({...release(), debug: true}), ClaimInputError);
});
for (const [collection, value] of [['sources', source()], ['references', reference()], ['claims', claim()], ['surfaces', surface()]]) {
  test(`duplicate ${collection} identifiers are rejected`, () => {
    const bad = {...release(), [collection]: [value, value]};
    assert.throws(() => parseClaimTrace(bad), ClaimInputError);
  });
}
for (const [name, parse, fixture] of [['source', parseClaimSource, source], ['reference', parseClaimReference, reference], ['claim', parseClaimStatement, claim], ['surface', parseClaimSurface, surface]]) {
  test(`${name} rejects null and arrays`, () => {
    assert.throws(() => parse(null), ClaimInputError);
    assert.throws(() => parse([]), ClaimInputError);
  });
  test(`${name} rejects unknown keys`, () => assert.throws(() => parse({...fixture(), extra: true}), ClaimInputError));
  test(`${name} rejects control characters`, () => {
    const old = fixture();
    const key = name === 'claim' ? 'text' : name === 'surface' ? 'route' : 'title' in old ? 'title' : 'name';
    assert.throws(() => parse({...old, [key]: 'abc\u0001'}), ClaimInputError);
  });
}
for (const [field, values] of [
  ['permission', ['MAYBE', 'yes', null, 1]],
  ['tier', ['trusted', '', null]],
  ['family', ['unknown', 'metrolinx', 'odbl']],
  ['provider', ['miway', '', null]],
  ['state', ['active', 'published', null]],
]) {
  for (const value of values) test(`source ${field} rejects ${String(value)}`, () => assert.throws(() => parseClaimSource(source({[field]: value})), ClaimInputError));
}
for (const field of ['url', 'licenceUrl']) {
  for (const value of ['http://example.org', 'https://user:pass@example.org', 'javascript:alert(1)', 'file:///etc/passwd', 'https://localhost/test', 'https://127.0.0.1/a', 'https://192.168.1.10/a', 'https://example.org/a#section']) {
    test(`${field} rejects unsafe URL ${value}`, () => assert.throws(() => parseClaimSource(source({[field]: value})), ClaimInputError));
  }
}
for (const field of ['acquiredDate', 'datasetDate', 'termsDate']) {
  for (const value of ['2026-02-30', '2025-13-01', '2023-02-29', '2026-00-12', '2026-01-00', 'yesterday', '', null]) {
    test(`${field} rejects calendar value ${String(value)}`, () => assert.throws(() => parseClaimSource(source({[field]: value})), ClaimInputError));
  }
}
test('leap days are calendar-aware', () => {
  assert.equal(parseClaimSource(source({datasetDate: '2024-02-29'})).datasetDate, '2024-02-29');
});
test('multiline notices remain intact', () => {
  const value = parseClaimSource(source({notice: 'line one\nline two'}));
  assert.equal(value.notice, 'line one\nline two');
});
for (const field of ['sourceIds', 'referenceIds']) {
  test(`claim ${field} rejects duplicates`, () => {
    const bad = claim({[field]: ['same', 'same']});
    assert.throws(() => parseClaimStatement(bad), ClaimInputError);
  });
  test(`claim ${field} rejects invalid identifiers`, () => {
    assert.throws(() => parseClaimStatement(claim({[field]: ['../escape']})), ClaimInputError);
  });
}
for (const value of [-1, 1001, 1.5, NaN, Infinity, null]) {
  test(`surface target rejects ${String(value)}`, () => assert.throws(() => parseClaimSurface(surface({targetPx: value})), ClaimInputError));
}
for (const count of [0, 1, 44, 1000]) {
  test(`surface target accepts integer ${count}`, () => assert.equal(parseClaimSurface(surface({targetPx: count})).targetPx, count));
}
test('duplicate route source IDs fail', () => {
  assert.throws(() => parseClaimSurface(surface({sourceIds: ['one', 'one']})), ClaimInputError);
});
test('non-NFC text fails', () => assert.throws(() => parseClaimStatement(claim({text: 'cafe\u0301'})), ClaimInputError));
