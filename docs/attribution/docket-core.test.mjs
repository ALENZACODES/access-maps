import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCKET_SCHEMA, MAX_BYTES, parseDocket, parseDocketJson, stableDocketJson,
  publicUrl, isoDate, id, boundedText, DocketInputError } from './docket-core.mjs';
import { fixtureDocket, fixtureSource, fixtureEvidence, fixtureSurface, fixtureDecision } from './docket-fixtures.mjs';

const rejection = (input, key) => {
  assert.throws(() => parseDocket(input), (error) => error instanceof DocketInputError &&
    (!key || error.path.includes(key)), `Expected input rejection at ${key}`);
};
test('schema literal is stable', () => assert.equal(DOCKET_SCHEMA, 'attribution-recheck-docket/1'));
test('valid docket roundtrips in canonical property order', () => {
  const valid = fixtureDocket();
  assert.deepEqual(parseDocket(valid), valid);
  assert.deepEqual(parseDocketJson(stableDocketJson(valid)), valid);
});
test('serialization ends with a newline', () => assert.ok(stableDocketJson(fixtureDocket()).endsWith('\n')));
test('unknown dataset date remains literal UNKNOWN', () => {
  assert.equal(parseDocket(fixtureDocket()).sources[0].datasetDate, 'UNKNOWN');
});
test('empty collections are structurally permitted for audit', () => {
  const docket = parseDocket(fixtureDocket({ sources: [], evidence: [], surfaces: [], decisions: [] }));
  assert.deepEqual(docket.sources, []);
});
test('unsupported schema is rejected', () => rejection({ ...fixtureDocket(), schema: 'other' }, 'schema'));
test('top-level unknown keys are rejected', () => rejection({ ...fixtureDocket(), surprise: true }, 'surprise'));
test('missing top-level keys are rejected', () => {
  const x = fixtureDocket(); delete x.decisions; rejection(x, 'decisions');
});
test('non-object root is rejected', () => { for (const item of [null, [], 1, 'x']) rejection(item); });
test('JSON parser rejects bad syntax', () => assert.throws(() => parseDocketJson('not json'), DocketInputError));
test('JSON parser rejects non-string input', () => assert.throws(() => parseDocketJson(null), DocketInputError));
test('JSON parser enforces byte size', () => assert.throws(() => parseDocketJson('x'.repeat(MAX_BYTES + 1)), DocketInputError));
test('identifier syntax rejects uppercase and whitespace', () => {
  for (const value of ['A', 'x_x', 'x ', '1x', 'x--y', '', 'x/'.repeat(34)]) {
    assert.throws(() => id(value), DocketInputError);
  }
});
test('identifier accepts ordinary slug', () => assert.equal(id('map-source-7'), 'map-source-7'));
test('boundedText rejects control chars', () => {
  for (const value of ['a\t', 'a\0', 'a\x7f']) assert.throws(() => boundedText(value, 'value'), DocketInputError);
});
test('boundedText allows explicit multiline note only', () => {
  assert.equal(boundedText('one\ntwo', 'note', { multiline: true }), 'one\ntwo');
  assert.throws(() => boundedText('one\ntwo', 'title'), DocketInputError);
});
test('boundedText rejects decomposed Unicode', () => assert.throws(() => boundedText('e\u0301', 'value'), DocketInputError));
test('date parser preserves UNKNOWN', () => assert.equal(isoDate('UNKNOWN'), 'UNKNOWN'));
test('date parser handles leap years', () => {
  assert.equal(isoDate('2024-02-29'), '2024-02-29');
  for (const date of ['2025-02-29', '2100-02-29', '2026-13-01', '2026-00-02', '2026-04-31']) {
    assert.throws(() => isoDate(date), DocketInputError);
  }
});
test('date parser rejects timestamps and estimates', () => {
  for (const date of ['today', '2026', '2026-1-2', '2026-11-19T10:00:00Z', 20261119]) {
    assert.throws(() => isoDate(date), DocketInputError);
  }
});
test('public URL parser accepts HTTPS and UNKNOWN', () => {
  assert.equal(publicUrl('UNKNOWN'), 'UNKNOWN');
  assert.equal(publicUrl('https://example.org/terms'), 'https://example.org/terms');
});
test('public URL parser rejects local and unsafe addresses', () => {
  for (const value of ['http://example.org', 'javascript:alert(1)', 'file:///tmp/a',
    'https://localhost', 'https://127.0.0.1', 'https://192.168.1.1',
    'https://172.20.0.1', 'https://example.local', 'https://name:pass@example.org',
    'https://example.org/path#fragment', 'not a url']) {
    assert.throws(() => publicUrl(value), DocketInputError, String(value));
  }
});
for (const field of ['id', 'name', 'licence', 'sourceUrl', 'licenceUrl', 'permission',
  'licenceEvidence', 'datasetDate', 'reviewDueOn', 'tier', 'state', 'evidenceIds']) {
  test(`source record rejects missing ${field}`, () => {
    const source = fixtureSource(); delete source[field];
    rejection(fixtureDocket({ sources: [source] }), field);
  });
}
for (const field of ['id', 'sourceId', 'url', 'tier', 'observedOn', 'recordedOn', 'licenceUrl']) {
  test(`evidence record rejects missing ${field}`, () => {
    const entry = fixtureEvidence(); delete entry[field];
    rejection(fixtureDocket({ evidence: [entry] }), field);
  });
}
for (const field of ['id', 'locale', 'kind', 'sourceIds', 'offline', 'keyboard', 'screenReader', 'targetPx']) {
  test(`surface record rejects missing ${field}`, () => {
    const entry = fixtureSurface(); delete entry[field];
    rejection(fixtureDocket({ surfaces: [entry] }), field);
  });
}
for (const field of ['id', 'sourceId', 'state', 'decidedOn', 'reason', 'evidenceIds']) {
  test(`decision record rejects missing ${field}`, () => {
    const entry = fixtureDecision(); delete entry[field];
    rejection(fixtureDocket({ decisions: [entry] }), field);
  });
}
for (const value of ['maybe', true, 'yes', 'N/A', null]) {
  test(`unknown permission value ${String(value)} fails schema`, () => {
    rejection(fixtureDocket({ sources: [fixtureSource({ permission: value })] }), 'permission');
  });
}
test('duplicate source identities are rejected', () => {
  rejection(fixtureDocket({ sources: [fixtureSource(), fixtureSource()] }), 'sources');
});
test('duplicate evidence identities are rejected', () => {
  rejection(fixtureDocket({ evidence: [fixtureEvidence(), fixtureEvidence()] }), 'evidence');
});
test('duplicate surface identities are rejected', () => {
  rejection(fixtureDocket({ surfaces: [fixtureSurface(), fixtureSurface()] }), 'surfaces');
});
test('duplicate decision identities are rejected', () => {
  rejection(fixtureDocket({ decisions: [fixtureDecision(), fixtureDecision()] }), 'decisions');
});
test('duplicate source references on a surface are rejected', () => {
  rejection(fixtureDocket({ surfaces: [fixtureSurface({ sourceIds: ['osm-source', 'osm-source'] })] }), 'sourceIds');
});
test('duplicate evidence references on a source are rejected', () => {
  rejection(fixtureDocket({ sources: [fixtureSource({ evidenceIds: ['osm-proof', 'osm-proof'] })] }), 'evidenceIds');
});
test('negative target pixels are rejected', () => rejection(fixtureDocket({ surfaces: [fixtureSurface({ targetPx: -1 })] }), 'targetPx'));
test('fractional target pixels are rejected', () => rejection(fixtureDocket({ surfaces: [fixtureSurface({ targetPx: 43.5 })] }), 'targetPx'));
test('target pixels can be unknown for explicit fail-closed audit', () => assert.equal(parseDocket(fixtureDocket({ surfaces: [fixtureSurface({ targetPx: 'UNKNOWN' })] })).surfaces[0].targetPx, 'UNKNOWN'));
test('newlines are accepted in legal notices', () => {
  assert.ok(parseDocket(fixtureDocket()).sources[0].notice.includes('\n'));
});
test('unexpected source fields fail closed', () => {
  rejection(fixtureDocket({ sources: [fixtureSource({ extra: 'field' })] }), 'extra');
});
test('unexpected evidence fields fail closed', () => {
  rejection(fixtureDocket({ evidence: [fixtureEvidence({ secret: 'field' })] }), 'secret');
});
test('unexpected decision fields fail closed', () => {
  rejection(fixtureDocket({ decisions: [fixtureDecision({ extra: true })] }), 'extra');
});
