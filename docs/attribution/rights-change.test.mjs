import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRightsMatrix} from './rights-core.mjs';
import {compareRightsMatrices} from './rights-change.mjs';
import {matrix, source, output, exception, otherSource} from './rights-fixtures.mjs';
const parse = value => parseRightsMatrix(value);
function compare(after, before = matrix()) { return compareRightsMatrices(parse(before), parse(after)); }
function alteredSource(field, value) { return matrix({releaseId: 'release-two', sources: [source({[field]: value})]}); }
function alteredOutput(field, value) { return matrix({releaseId: 'release-two', outputs: [output({[field]: value})]}); }
function changedField(after, collection, field, before = matrix()) {
  return compare(after, before).changes.find(item => item.collection === collection && item.field === field);
}

test('unchanged release has no changes', () => {
  const result = compare(matrix());
  assert.equal(result.blocked, false);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.newBlockingCodes, []);
});
test('comparison retains both supplied release identifiers', () => {
  const result = compare(matrix({releaseId: 'release-two'}));
  assert.equal(result.previousRelease, 'release-one');
  assert.equal(result.currentRelease, 'release-two');
});
test('comparison does not mutate its inputs', () => {
  const before = parse(matrix());
  const after = parse(alteredSource('licenceName', 'Updated licence name'));
  const snapshots = [JSON.stringify(before), JSON.stringify(after)];
  compareRightsMatrices(before, after);
  assert.deepEqual([JSON.stringify(before), JSON.stringify(after)], snapshots);
});
test('source removed from the release is blocking', () => {
  const result = compare(matrix({sources: []}));
  assert.ok(result.blocked);
  assert.ok(result.changes.some(item => item.collection === 'sources' && item.field === 'removed' && item.level === 'block'));
});
test('source addition remains visible without being classed as a regression', () => {
  const result = compare(matrix({sources: [source(), otherSource()]}));
  assert.ok(result.changes.some(item => item.id === 'independent-open' && item.field === 'added' && item.level === 'note'));
});
test('included output removed from the release blocks', () => {
  const result = compare(matrix({outputs: []}));
  assert.ok(result.changes.some(item => item.collection === 'outputs' && item.field === 'removed' && item.level === 'block'));
});
test('a new output appears in the change log', () => {
  const result = compare(matrix({outputs: [output(), output({id: 'page-two', route: 'pages/two.html'})]}));
  assert.ok(result.changes.some(item => item.id === 'page-two' && item.field === 'added'));
});
test('missing previous exception is recorded without silently restoring it', () => {
  const previous = matrix({exceptions: [exception()]});
  const result = compare(matrix({exceptions: []}), previous);
  assert.ok(result.changes.some(item => item.collection === 'exceptions' && item.field === 'removed'));
});
for (const field of ['licenceId', 'licenceName', 'sourceUrl', 'licenceUrl', 'termsUrl',
  'evidenceUrl', 'shareAlikeRequired', 'attribution', 'termsReviewedOn']) {
  test(`change of ${field} is a source rights regression`, () => {
    const value = field === 'licenceId' ? 'OTHER-OPEN' : field === 'termsReviewedOn' ? '2026-04-01'
      : field === 'shareAlikeRequired' ? 'UNKNOWN'
      : field.endsWith('Url') ? 'https://example.org/changed' : 'changed';
    const result = changedField(alteredSource(field, value), 'sources', field);
    assert.equal(result.level, 'block');
    assert.deepEqual(result.affectedOutputs, ['map-en']);
  });
}
for (const field of ['permission', 'redistribution', 'derivativeUse', 'openLicenceEvidence']) {
  test(`losing YES ${field} blocks a regression`, () => {
    const result = changedField(alteredSource(field, 'NO'), 'sources', field);
    assert.equal(result.level, 'block');
  });
  test(`losing known ${field} to UNKNOWN blocks`, () => {
    const result = changedField(alteredSource(field, 'UNKNOWN'), 'sources', field);
    assert.equal(result.level, 'block');
  });
  test(`restoring ${field} to YES is not a regression by itself`, () => {
    const previous = matrix({sources: [source({[field]: 'UNKNOWN'})]});
    const result = changedField(matrix(), 'sources', field, previous);
    assert.equal(result.level, 'note');
  });
}
test('a known dataset date changed to UNKNOWN is displayed', () => {
  const prior = matrix({sources: [source({datasetAsOf: '2026-05-01'})]});
  const result = changedField(matrix(), 'sources', 'datasetAsOf', prior);
  assert.equal(result.before, '2026-05-01');
  assert.equal(result.after, 'UNKNOWN');
});
test('source name change is visible without rights overclaim', () => {
  const item = changedField(alteredSource('name', 'Editorial display name'), 'sources', 'name');
  assert.equal(item.level, 'note');
});
test('a changed acquisition date is included in the comparison', () => {
  const item = changedField(alteredSource('acquiredOn', '2026-05-03'), 'sources', 'acquiredOn');
  assert.equal(item.after, '2026-05-03');
});
for (const field of ['route', 'distribution', 'transformation', 'attribution',
  'mapCredit', 'licenceLink', 'redistributionNotice', 'separatedDatasets',
  'offlineAvailable', 'keyboardAccessible', 'screenReaderLabelled']) {
  test(`${field} changes are not silently ignored`, () => {
    const value = field === 'route' ? 'pages/new.html'
      : field === 'distribution' ? 'online'
      : field === 'transformation' ? 'derived'
      : field === 'attribution' ? 'Changed visible notice' : 'NO';
    const item = changedField(alteredOutput(field, value), 'outputs', field);
    assert.equal(item.level, 'block');
    assert.deepEqual(item.affectedOutputs, ['map-en']);
  });
}
test('a larger minimum target is not a regression', () => {
  const item = changedField(alteredOutput('minimumTargetPx', 64), 'outputs', 'minimumTargetPx');
  assert.equal(item.level, 'note');
});
test('an unchanged minimum target has no change record', () => {
  const result = compare(alteredOutput('minimumTargetPx', 44));
  assert.ok(!result.changes.some(item => item.field === 'minimumTargetPx'));
});
test('a smaller minimum target blocks', () => {
  const item = changedField(alteredOutput('minimumTargetPx', 32), 'outputs', 'minimumTargetPx');
  assert.equal(item.level, 'block');
});
test('UNKNOWN minimum target is a regression', () => {
  const item = changedField(alteredOutput('minimumTargetPx', 'UNKNOWN'), 'outputs', 'minimumTargetPx');
  assert.equal(item.level, 'block');
});
test('restored output keyboard evidence is not a regression by itself', () => {
  const old = matrix({outputs: [output({keyboardAccessible: 'NO'})]});
  const item = changedField(matrix(), 'outputs', 'keyboardAccessible', old);
  assert.equal(item.level, 'note');
});
test('restored output offline evidence is not a regression by itself', () => {
  const old = matrix({outputs: [output({offlineAvailable: 'UNKNOWN'})]});
  const item = changedField(matrix(), 'outputs', 'offlineAvailable', old);
  assert.equal(item.level, 'note');
});
test('newly included output state is not automatically a change regression', () => {
  const old = matrix({outputs: [output({state: 'held'})]});
  const item = changedField(matrix(), 'outputs', 'state', old);
  assert.equal(item.level, 'note');
});
test('known source to output impact is retained', () => {
  const result = compare(matrix({sources: [], outputs: [output()]}));
  const sourceRemoval = result.changes.find(item => item.collection === 'sources' && item.field === 'removed');
  assert.deepEqual(sourceRemoval.affectedOutputs, ['map-en']);
});
test('impact across multiple views is sorted and deduplicated', () => {
  const previous = matrix({outputs: [output(), output({id: 'page-two', route: 'pages/two.html'})]});
  const candidate = matrix({sources: [], outputs: previous.outputs});
  const item = compare(candidate, previous).changes.find(x => x.collection === 'sources');
  assert.deepEqual(item.affectedOutputs, ['map-en', 'page-two']);
});
test('order of source IDs inside a view does not generate a false regression', () => {
  const old = matrix({sources: [source(), otherSource()], outputs: [output({sourceIds: ['osm-base', 'independent-open']})]});
  const next = matrix({sources: old.sources, outputs: [output({sourceIds: ['independent-open', 'osm-base']})]});
  const result = compare(next, old);
  assert.ok(!result.changes.some(item => item.field === 'sourceIds'));
});
test('exception resolution field change is preserved', () => {
  const previous = matrix({exceptions: [exception({disposition: 'open'})]});
  const candidate = matrix({exceptions: [exception()]});
  const result = compare(candidate, previous);
  assert.ok(result.changes.some(item => item.field === 'disposition'));
});
test('a new blocking audit code is listed once', () => {
  const next = matrix({sources: [source({permission: 'NO'})]});
  const result = compare(next);
  assert.ok(result.newBlockingCodes.includes('SOURCE_PERMISSION_MISSING'));
  assert.equal(result.newBlockingCodes.filter(c => c === 'SOURCE_PERMISSION_MISSING').length, 1);
});
test('a blocked candidate blocks even with no historical changes', () => {
  const invalid = matrix({sources: [source({permission: 'NO'})]});
  const result = compare(invalid, invalid);
  assert.equal(result.blocked, true);
  assert.equal(result.changes.length, 0);
});
test('all changes contain stable identifiers and before/after strings', () => {
  const candidate = alteredSource('licenceName', 'Other name');
  for (const item of compare(candidate).changes) {
    assert.equal(typeof item.collection, 'string');
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.before, 'string');
    assert.equal(typeof item.after, 'string');
    assert.ok(Array.isArray(item.affectedOutputs));
    assert.ok(['block', 'note'].includes(item.level));
  }
});
