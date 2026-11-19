import test from 'node:test';
import assert from 'node:assert/strict';
import { compareClaimTraces, summaryByKind } from './claim-trace-change.mjs';
import { release, source, reference, claim, surface } from './claim-trace-fixture.test.mjs';
const compare = (next) => compareClaimTraces(release(), next);
function changed(change, field, level) { assert.ok(change.changes.some((item) => item.field === field && item.level === level), JSON.stringify(change.changes)); }
test('identical releases have no changes', () => {
  const out = compare(release());
  assert.equal(out.blocked, false);
  assert.deepEqual(out.changes, []);
});
test('release identifiers are recorded without modification', () => {
  const out = compare(release({releaseId: 'release-two'}));
  assert.equal(out.afterReleaseId, 'release-two');
  assert.equal(out.beforeReleaseId, 'release-one');
});
for (const [field, value, level] of [
  ['state', 'held', 'block'], ['permission', 'NO', 'block'], ['permission', 'UNKNOWN', 'block'],
  ['licence', 'UNKNOWN', 'block'], ['url', 'UNKNOWN', 'block'], ['tier', 'UNKNOWN', 'block'],
  ['acquiredDate', 'UNKNOWN', 'block'], ['datasetDate', '2026-01-05', 'attention'],
  ['notice', '', 'block'], ['name', 'Updated source', 'attention'],
]) {
  test(`changed source ${field} becomes ${level}`, () => changed(compare(release({sources: [source({[field]: value})]})), field, level));
}
for (const [field, value, level] of [
  ['status', 'held', 'block'], ['disclosure', 'unsupported', 'attention'],
  ['sourceIds', [], 'block'], ['referenceIds', [], 'block'],
  ['language', 'fr', 'block'], ['text', 'Changed claim', 'block'],
  ['observedDate', 'UNKNOWN', 'block'],
]) {
  test(`changed claim ${field} becomes ${level}`, () => changed(compare(release({claims: [claim({[field]: value})]})), field, level));
}
for (const [field, value, level] of [
  ['targetPx', 43, 'block'], ['targetPx', 'UNKNOWN', 'block'], ['targetPx', 48, 'attention'],
  ['offline', 'NO', 'block'], ['keyboard', 'UNKNOWN', 'block'], ['screenReader', 'NO', 'block'],
  ['mapCredit', 'NO', 'block'], ['sourceIds', [], 'block'], ['claimIds', [], 'block'],
  ['route', 'places/changed.html', 'block'],
]) {
  test(`changed surface ${field} becomes ${level}`, () => changed(compare(release({surfaces: [surface({[field]: value})]})), field, level));
}
for (const [field, value, level] of [
  ['tier', 'UNKNOWN', 'block'], ['url', 'UNKNOWN', 'block'], ['date', 'UNKNOWN', 'attention'],
  ['title', 'Revised reference', 'attention'],
]) {
  test(`changed reference ${field} becomes ${level}`, () => changed(compare(release({references: [reference({[field]: value})]})), field, level));
}
for (const [collection, replacement] of [['sources', []], ['references', []], ['claims', []], ['surfaces', []]]) {
  test(`removing ${collection} blocks release`, () => assert.equal(compare(release({[collection]: replacement})).blocked, true));
}
test('new source is visible as an attention change', () => {
  const out = compare(release({sources: [source(), source({id: 'another-source'})]}));
  assert.ok(out.changes.some((item) => item.kind === 'source-added' && item.level === 'attention'));
});
test('summary counts source and route changes', () => {
  const out = compare(release({sources: [source({permission: 'NO'})], surfaces: [surface({targetPx: 40})]}));
  const counts = summaryByKind(out);
  assert.equal(counts['source-changed'], 1);
  assert.equal(counts['surface-changed'], 1);
});
test('added block findings are listed', () => {
  const out = compare(release({sources: [source({permission: 'NO'})]}));
  assert.ok(out.introduced.some((item) => item.includes('SOURCE_PERMISSION_DENIED')));
});
test('resolved findings are separately reported', () => {
  const out = compareClaimTraces(release({sources: [source({permission: 'NO'})]}), release());
  assert.ok(out.resolved.some((item) => item.includes('SOURCE_PERMISSION_DENIED')));
});
