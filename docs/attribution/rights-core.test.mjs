import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIGHTS_SCHEMA, RIGHTS_MAX_BYTES, RightsInputError, parseRightsMatrix,
  parseRightsMatrixJson, exportRightsMatrix, rightsBySource, BufferlessBytes,
  PROVIDERS, LICENCES, STATES, TIERS, OUTPUT_KINDS, TRANSFORMS,
  DISTRIBUTIONS, PUBLICATION_STATES, DISPOSITIONS,
} from './rights-core.mjs';
import {matrix, source, output, exception, auaSource, oglSource, otherSource} from './rights-fixtures.mjs';
const clone = object => structuredClone(object);
const valid = () => matrix();
function invalid(modify, message = /./u) {
  const value = valid();
  modify(value);
  assert.throws(() => parseRightsMatrix(value), message);
}

test('the schema identifier is versioned', () => assert.equal(RIGHTS_SCHEMA, 'attribution-rights-matrix/1'));
test('fixture parses without guessing missing information', () => {
  const result = parseRightsMatrix(valid());
  assert.equal(result.sources[0].datasetAsOf, 'UNKNOWN');
  assert.equal(result.outputs[0].publishedOn, 'UNKNOWN');
  assert.equal(result.sources[0].redistribution, 'YES');
});
test('parsing reconstructs records and cannot mutate the caller input', () => {
  const initial = valid();
  const result = parseRightsMatrix(initial);
  assert.notEqual(result, initial);
  assert.notEqual(result.sources[0], initial.sources[0]);
  assert.notEqual(result.outputs[0], initial.outputs[0]);
  result.outputs[0].sourceIds.push('added');
  assert.deepEqual(initial.outputs[0].sourceIds, ['osm-base']);
});
test('canonical export and parse round-trip', () => {
  const input = matrix({exceptions: [exception()]});
  const json = exportRightsMatrix(input);
  assert.ok(json.endsWith('\n'));
  assert.deepEqual(parseRightsMatrixJson(json), parseRightsMatrix(input));
});
test('the input byte limit is measured in UTF-8 rather than characters', () => {
  assert.equal(BufferlessBytes('a'), 1);
  assert.equal(BufferlessBytes('é'), 2);
  assert.equal(BufferlessBytes('’'), 3);
  assert.equal(BufferlessBytes('UNKNOWN'), 7);
});
test('non-JSON string produces a stable input error', () => assert.throws(
  () => parseRightsMatrixJson('not JSON'), RightsInputError));
test('a non-string JSON argument is rejected', () => assert.throws(
  () => parseRightsMatrixJson({}), RightsInputError));
test('an oversized document fails before JSON parsing', () => assert.throws(
  () => parseRightsMatrixJson(' '.repeat(RIGHTS_MAX_BYTES + 1)), /size limit/u));
test('unsupported version is rejected', () => invalid(x => { x.schema = 'other'; }, /schema/u));
test('missing schema fails', () => invalid(x => { delete x.schema; }, /schema/u));
test('an unrecognized root field fails', () => invalid(x => { x.extra = true; }, /extra/u));
test('non-object input fails', () => assert.throws(() => parseRightsMatrix(null), RightsInputError));
test('array root fails', () => assert.throws(() => parseRightsMatrix([]), RightsInputError));
test('blank release ID fails', () => invalid(x => { x.releaseId = ''; }));
test('uppercase release ID fails', () => invalid(x => { x.releaseId = 'Release'; }));
test('two adjacent hyphens in release ID fail', () => invalid(x => { x.releaseId = 'release--one'; }));
test('overlong release ID fails', () => invalid(x => { x.releaseId = 'a'.repeat(73); }));
for (const key of ['sources', 'outputs', 'exceptions']) {
  test(`${key} must be an array`, () => invalid(x => { x[key] = null; }));
  test(`${key} rejects extra unknown properties`, () => invalid(x => { x[key] = {}; }));
}
for (const field of ['provider', 'name', 'licenceId', 'licenceName', 'sourceUrl',
  'licenceUrl', 'termsUrl', 'acquiredOn', 'datasetAsOf', 'termsReviewedOn',
  'evidenceTier', 'evidenceUrl', 'permission', 'redistribution', 'derivativeUse',
  'openLicenceEvidence', 'shareAlikeRequired', 'attribution', 'publication']) {
  test(`source.${field} is required`, () => invalid(x => { delete x.sources[0][field]; }, new RegExp(field, 'u')));
}
for (const field of ['name', 'locale', 'kind', 'distribution', 'transformation', 'sourceIds',
  'route', 'state', 'attribution', 'mapCredit', 'licenceLink', 'redistributionNotice',
  'shareAlikePublished', 'separatedDatasets', 'offlineAvailable',
  'keyboardAccessible', 'screenReaderLabelled', 'minimumTargetPx', 'publishedOn']) {
  test(`output.${field} is required`, () => invalid(x => { delete x.outputs[0][field]; }, new RegExp(field, 'u')));
}
for (const field of ['sourceId', 'outputId', 'issue', 'evidenceUrl',
  'recordedOn', 'reviewer', 'disposition', 'reason']) {
  test(`exception.${field} is required`, () => invalid(x => {
    x.exceptions = [exception()]; delete x.exceptions[0][field];
  }, new RegExp(field, 'u')));
}
for (const field of ['sourceUrl', 'licenceUrl', 'termsUrl', 'evidenceUrl']) {
  test(`${field} refuses http`, () => invalid(x => { x.sources[0][field] = 'http://example.com/a'; }));
  test(`${field} refuses userinfo`, () => invalid(x => { x.sources[0][field] = 'https://x@y.example/a'; }));
  test(`${field} refuses fragment`, () => invalid(x => { x.sources[0][field] = 'https://example.org/a#b'; }));
  test(`${field} refuses localhost`, () => invalid(x => { x.sources[0][field] = 'https://localhost/a'; }));
  test(`${field} refuses local hostname`, () => invalid(x => { x.sources[0][field] = 'https://private.local/a'; }));
  test(`${field} refuses IPv4 loopback`, () => invalid(x => { x.sources[0][field] = 'https://127.0.0.1/a'; }));
  test(`${field} explicitly accepts UNKNOWN`, () => {
    const input = valid(); input.sources[0][field] = 'UNKNOWN';
    assert.equal(parseRightsMatrix(input).sources[0][field], 'UNKNOWN');
  });
}
for (const field of ['acquiredOn', 'datasetAsOf', 'termsReviewedOn']) {
  test(`${field} rejects malformed dates`, () => invalid(x => { x.sources[0][field] = 'May 5'; }));
  test(`${field} rejects February 30`, () => invalid(x => { x.sources[0][field] = '2026-02-30'; }));
  test(`${field} accepts leap day`, () => {
    const value = valid(); value.sources[0][field] = '2024-02-29';
    assert.equal(parseRightsMatrix(value).sources[0][field], '2024-02-29');
  });
  test(`${field} accepts UNKNOWN`, () => {
    const value = valid(); value.sources[0][field] = 'UNKNOWN';
    assert.equal(parseRightsMatrix(value).sources[0][field], 'UNKNOWN');
  });
}
for (const field of ['permission', 'redistribution', 'derivativeUse', 'openLicenceEvidence', 'shareAlikeRequired']) {
  test(`${field} rejects lowercase yes`, () => invalid(x => { x.sources[0][field] = 'yes'; }));
  test(`${field} accepts UNKNOWN`, () => {
    const value = valid(); value.sources[0][field] = 'UNKNOWN';
    assert.equal(parseRightsMatrix(value).sources[0][field], 'UNKNOWN');
  });
}
for (const field of ['mapCredit', 'licenceLink', 'redistributionNotice', 'shareAlikePublished',
  'separatedDatasets', 'offlineAvailable', 'keyboardAccessible', 'screenReaderLabelled']) {
  test(`${field} rejects boolean true`, () => invalid(x => { x.outputs[0][field] = true; }));
  test(`${field} accepts UNKNOWN`, () => {
    const value = valid(); value.outputs[0][field] = 'UNKNOWN';
    assert.equal(parseRightsMatrix(value).outputs[0][field], 'UNKNOWN');
  });
}
for (const bad of ['/index.html', '../index.html', 'index/../home.html',
  'https://example.com/route.html', 'pages\\map.html', 'pages//map.html',
  'pages/.hidden.html', 'pages/map.html?x=1', 'pages/map.htm']) {
  test(`unsafe output path rejected: ${bad}`, () => invalid(x => { x.outputs[0].route = bad; }));
}
test('duplicate source identities are refused', () => invalid(x => { x.sources.push(clone(x.sources[0])); }));
test('duplicate output identities are refused', () => invalid(x => { x.outputs.push(clone(x.outputs[0])); }));
test('duplicate output paths are refused even with different IDs', () => invalid(x => { x.outputs.push(output({id: 'second'})); }));
test('duplicate exception identities are refused', () => invalid(x => { x.exceptions = [exception(), exception()]; }));
test('duplicate source IDs within a view are refused', () => invalid(x => { x.outputs[0].sourceIds = ['osm-base', 'osm-base']; }));
test('too many records are refused', () => invalid(x => { x.outputs = Array.from({length: 401}, (_, i) => output({id: `page-${i}`, route: `pages/page-${i}.html`})); }));
test('too many exceptions are refused', () => invalid(x => { x.exceptions = Array.from({length: 201}, (_, i) => exception({id: `decision-${i}`})); }));
test('minimum target cannot exceed bounded maximum', () => invalid(x => { x.outputs[0].minimumTargetPx = 1001; }));
test('minimum target cannot be negative', () => invalid(x => { x.outputs[0].minimumTargetPx = -1; }));
test('minimum target cannot be fractional', () => invalid(x => { x.outputs[0].minimumTargetPx = 43.5; }));
test('UTF-8 and apostrophe normalization is enforced', () => invalid(x => { x.sources[0].name = 'e\u0301'; }));
test('multiline attribution is supported', () => {
  const result = parseRightsMatrix(valid());
  assert.ok(result.sources[0].attribution.includes('\n'));
});
test('unsafe controls in attribution are refused', () => invalid(x => { x.sources[0].attribution += '\u0001'; }));
test('unknown keys in source entries fail', () => invalid(x => { x.sources[0].unsafe = 1; }));
test('unknown keys in outputs fail', () => invalid(x => { x.outputs[0].unsafe = 1; }));
test('unknown keys in exception fail', () => invalid(x => { x.exceptions = [exception({unsafe: 1})]; }));
test('valid AUA source parses without modifying its notice', () => {
  const result = parseRightsMatrix(matrix({sources: [auaSource()]}));
  assert.equal(result.sources[0].attribution, auaSource().attribution);
});
test('valid OGL source parses without modifying its notice', () => {
  const result = parseRightsMatrix(matrix({sources: [oglSource()]}));
  assert.equal(result.sources[0].attribution, oglSource().attribution);
});
test('other open source is allowed as a concrete record', () => {
  const result = parseRightsMatrix(matrix({sources: [otherSource()]}));
  assert.equal(result.sources[0].licenceName, 'CC-BY-4.0');
});
test('rightsBySource identifies actual dependent output IDs', () => {
  const input = parseRightsMatrix(matrix({outputs: [output(), output({id: 'map-fr', locale: 'fr', route: 'pages/map-fr.html'})]}));
  assert.deepEqual(rightsBySource(input), {'osm-base': ['map-en', 'map-fr']});
});
test('rightsBySource records missing source IDs without inventing sources', () => {
  const input = parseRightsMatrix(matrix({outputs: [output({sourceIds: ['absent']})]}));
  assert.deepEqual(rightsBySource(input), {'osm-base': [], absent: ['map-en']});
});
test('contract allowed enums are explicit', () => {
  assert.deepEqual([...PROVIDERS], ['osm', 'metrolinx', 'ltc', 'other']);
  assert.ok(LICENCES.includes('OTHER-OPEN'));
  assert.ok(STATES.includes('UNKNOWN'));
  assert.ok(TIERS.includes('UNKNOWN'));
  assert.ok(OUTPUT_KINDS.includes('map'));
  assert.ok(TRANSFORMS.includes('combined'));
  assert.ok(DISTRIBUTIONS.includes('offline'));
  assert.ok(PUBLICATION_STATES.includes('held'));
  assert.ok(DISPOSITIONS.includes('resolved'));
});
