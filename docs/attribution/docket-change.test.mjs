import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocket } from './docket-core.mjs';
import { compareDockets } from './docket-change.mjs';
import { fixtureDocket, fixtureSource, fixtureSurface, fixtureEvidence, fixtureDecision } from './docket-fixtures.mjs';

function compare(candidate, baseline = fixtureDocket()) {
  return compareDockets(parseDocket(baseline), parseDocket(candidate));
}
function has(result, kind, field) {
  return result.changes.some((c) => c.kind === kind && (!field || c.field === field));
}
function aChange(field, before, after, severity) {
  const result = compare(fixtureDocket({ sources: [fixtureSource({ [field]: after })] }),
    fixtureDocket({ sources: [fixtureSource({ [field]: before })] }));
  assert.ok(has(result, 'source-field', field), JSON.stringify(result.changes));
  assert.equal(result.changes.find((c) => c.field === field && c.kind === 'source-field').severity, severity);
}
test('identical releases have no changes', () => {
  const result = compare(fixtureDocket());
  assert.equal(result.blocked, false);
  assert.deepEqual(result.changes, []);
  assert.equal(result.beforeReleaseId, 'release-one');
  assert.equal(result.afterReleaseId, 'release-one');
});
test('order-independent identity comparison of source lists', () => {
  const one = fixtureSource(); const two = fixtureSource({ id: 'second-source', state: 'held', evidenceIds: [] });
  const before = fixtureDocket({ sources: [one, two] });
  const after = fixtureDocket({ sources: [two, one] });
  assert.ok(!has(compare(after, before), 'source-field'));
});
test('removed source blocks', () => {
  const result = compare(fixtureDocket({ sources: [] }));
  assert.equal(result.blocked, true);
  assert.ok(has(result, 'source-removed'));
});
test('added source creates review finding', () => {
  const result = compare(fixtureDocket({ sources: [fixtureSource(), fixtureSource({ id: 'new-source', state: 'held', evidenceIds: [] })] }));
  assert.ok(has(result, 'source-added'));
  assert.equal(result.changes.find((c) => c.kind === 'source-added').severity, 'review');
});
test('removed surface blocks', () => {
  const result = compare(fixtureDocket({ surfaces: [] }));
  assert.equal(result.blocked, true);
  assert.ok(has(result, 'surface-removed'));
});
test('removed evidence blocks', () => {
  const result = compare(fixtureDocket({ evidence: [] }));
  assert.equal(result.blocked, true);
  assert.ok(has(result, 'evidence-removed'));
});
test('removed decision blocks', () => {
  const result = compare(fixtureDocket({ decisions: [] }));
  assert.equal(result.blocked, true);
  assert.ok(has(result, 'decision-removed'));
});
for (const field of ['licence', 'licenceName', 'sourceUrl', 'licenceUrl', 'permission',
  'licenceEvidence', 'notice', 'tier', 'state']) {
  test(`source ${field} alteration creates blocking change`, () => {
    const before = fixtureSource();
    const updates = {
      licence: 'UNKNOWN', licenceName: 'Different terms', sourceUrl: 'https://example.org/new',
      licenceUrl: 'https://example.org/terms', permission: 'UNKNOWN',
      licenceEvidence: 'UNKNOWN', notice: '', tier: 'UNKNOWN', state: 'held',
    };
    aChange(field, before[field], updates[field], 'block');
  });
}
test('newly granted permission is review, not change blocker', () => {
  aChange('permission', 'UNKNOWN', 'YES', 'review');
});
test('newly documented licence evidence is review', () => {
  aChange('licenceEvidence', 'UNKNOWN', 'YES', 'review');
});
test('later dataset date is a review', () => {
  aChange('datasetDate', '2026-01-01', '2026-03-01', 'review');
});
test('later terms review date is a review', () => {
  aChange('termsReviewedOn', '2026-01-01', '2026-03-01', 'review');
});
test('later deadline is a review', () => {
  aChange('reviewDueOn', '2026-12-01', '2027-01-01', 'review');
});
test('earlier deadline triggers blocking change', () => {
  aChange('reviewDueOn', '2027-01-01', '2026-12-01', 'block');
});
test('improved source metadata is nonblocking review', () => {
  aChange('name', 'Old title', 'New title', 'review');
});
test('improved target size is a review', () => {
  const candidate = fixtureDocket({ surfaces: [fixtureSurface({ targetPx: 56 })] });
  const result = compare(candidate);
  assert.equal(result.blocked, false);
  assert.equal(result.changes.find((x) => x.field === 'targetPx').severity, 'review');
});
test('reduced target size is blocking change', () => {
  const candidate = fixtureDocket({ surfaces: [fixtureSurface({ targetPx: 43 })] });
  const result = compare(candidate);
  assert.equal(result.blocked, true);
  assert.equal(result.changes.find((x) => x.field === 'targetPx').severity, 'block');
});
for (const field of ['offline', 'keyboard', 'screenReader', 'mapCredit']) {
  test(`surface ${field} regression blocks`, () => {
    const result = compare(fixtureDocket({ surfaces: [fixtureSurface({ [field]: 'UNKNOWN' })] }));
    assert.equal(result.blocked, true);
    assert.equal(result.changes.find((x) => x.field === field).severity, 'block');
  });
  test(`surface ${field} improvement is a review`, () => {
    const result = compare(fixtureDocket(), fixtureDocket({ surfaces: [fixtureSurface({ [field]: 'UNKNOWN' })] }));
    assert.equal(result.changes.find((x) => x.field === field).severity, 'review');
  });
}
test('surface loses source link and blocks', () => {
  const result = compare(fixtureDocket({ surfaces: [fixtureSurface({ sourceIds: [] })] }));
  assert.equal(result.blocked, true);
  assert.ok(has(result, 'surface-field', 'sourceIds'));
});
test('surface language change requires review and currently blocks change', () => {
  const result = compare(fixtureDocket({ surfaces: [fixtureSurface({ locale: 'fr' })] }));
  assert.ok(has(result, 'surface-field', 'locale'));
});
test('evidence link change blocks', () => {
  const result = compare(fixtureDocket({ evidence: [fixtureEvidence({ url: 'https://example.org/changed' })] }));
  assert.ok(has(result, 'evidence-field', 'url'));
  assert.equal(result.changes.find((x) => x.field === 'url').severity, 'block');
});
test('decision state change blocks', () => {
  const result = compare(fixtureDocket({ decisions: [fixtureDecision({ state: 'pending' })] }));
  assert.ok(has(result, 'decision-field', 'state'));
  assert.equal(result.blocked, true);
});
test('new blocking finding recorded separately', () => {
  const result = compare(fixtureDocket({ sources: [fixtureSource({ permission: 'NO' })] }));
  assert.ok(has(result, 'new-blocker'));
  assert.ok(result.newBlockers >= 1);
});
test('baseline block is not silently hidden when candidate improves', () => {
  const baseline = fixtureDocket({ sources: [fixtureSource({ permission: 'UNKNOWN' })] });
  const result = compare(fixtureDocket(), baseline);
  assert.equal(result.baselineBlocked, true);
  assert.equal(result.candidateBlocked, false);
});
test('new blockers do not rely on system clock', () => {
  const baseline = fixtureDocket({ asOf: 'UNKNOWN' });
  const candidate = fixtureDocket({ asOf: 'UNKNOWN' });
  const result = compare(candidate, baseline);
  assert.equal(result.blocked, false);
});
test('comparisons preserve UNKNOWN rather than pretending empty is permission', () => {
  const result = compare(fixtureDocket({ sources: [fixtureSource({ permission: 'UNKNOWN' })] }));
  assert.equal(result.changes.find((x) => x.field === 'permission').after, 'UNKNOWN');
});
test('sorted comparisons are repeatable', () => {
  const after = fixtureDocket({ sources: [fixtureSource({ notice: '', permission: 'NO' })] });
  assert.deepEqual(compare(after).changes, compare(after).changes);
});
