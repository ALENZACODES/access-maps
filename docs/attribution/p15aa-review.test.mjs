import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateRemovalPolicy, validateReviewAuthorization, changesBetween,
  summarizeChanges, compareEvidenceRegisters, createReviewQueue,
  decideReviewQueue, reviewQueueText, digestReviewPlan,
} from './p15aa-review.mjs';
import { parseEvidenceRegister } from './p15aa-intake.mjs';
import {
  register, copy, source, observation, feature, withUnknown,
  withNo, withAsset, removalPolicy, reviewAuthorization,
} from './p15aa-fixtures.mjs';

const compare = (before, after, policy = removalPolicy()) =>
  compareEvidenceRegisters(before, after, policy);
const changeCodes = (before, after, policy) => compare(before, after, policy).issues.map((x) => x.code);
const updated = (mutate) => { const result = register(); mutate(result); return result; };

describe('P15AA review: local release-change decisions', () => {
  it('allows no-op comparisons', () => {
    const result = compare(register(), register());
    assert.equal(result.ok, true);
    assert.equal(result.value.summary.unchanged, 5);
    assert.equal(result.value.summary.removed, 0);
  });
  it('keeps deterministic digests', () => {
    const before = register();
    const after = copy(before);
    assert.equal(compare(before, after).value.previousDigest, compare(after, before).value.candidateDigest);
  });
  it('accepts adding a new unknown feature', () => {
    const after = updated((value) => value.features.push(feature('third')));
    const result = compare(register(), after);
    assert.equal(result.ok, true);
    assert.equal(result.value.summary.added, 1);
  });
  it('blocks a removal without a policy entry', () => {
    const after = updated((value) => {
      value.features.pop();
      value.observations.pop();
    });
    assert.ok(changeCodes(register(), after).includes('REMOVAL'));
  });
  it('allows declared feature and evidence removal', () => {
    const after = updated((value) => {
      value.features.pop();
      value.observations.pop();
    });
    const policy = removalPolicy({
      removedFeatures: ['entrance-b'], removedObservations: ['obs-b'], maximumRemovals: 2,
    });
    const result = compare(register(), after, policy);
    assert.equal(result.ok, true);
    assert.equal(result.value.summary.removed, 2);
  });
  it('blocks removal above the requested maximum', () => {
    const after = updated((value) => {
      value.features.pop();
      value.observations.pop();
    });
    const policy = removalPolicy({
      removedFeatures: ['entrance-b'], removedObservations: ['obs-b'], maximumRemovals: 1,
    });
    assert.ok(changeCodes(register(), after, policy).includes('LIMIT'));
  });
  it('blocks unmatched removal authorization', () => {
    const policy = removalPolicy({ removedFeatures: ['entrance-b'], maximumRemovals: 1 });
    assert.ok(changeCodes(register(), register(), policy).includes('UNMATCHED'));
  });
  it('blocks malformed removal policies', () => {
    for (const value of [null, {}, { maximumRemovals: 0 },
      removalPolicy({ maximumRemovals: -1 }),
      removalPolicy({ removedFeatures: ['entrance-a', 'entrance-a'] }),
      removalPolicy({ allowTierDecrease: 'yes' }),
      { ...removalPolicy(), arbitrary: true }]) {
      assert.equal(validateRemovalPolicy(value), false);
    }
  });
  it('accepts complete policy fields', () => {
    assert.equal(validateRemovalPolicy(removalPolicy()), true);
    assert.equal(validateRemovalPolicy(removalPolicy({ maximumRemovals: 4 })), true);
  });
  it('rejects reverse snapshot dates', () => {
    const after = updated((value) => { value.asOf = '2026-11-18'; });
    assert.ok(changeCodes(register(), after).includes('ROLLBACK'));
  });
  it('rejects reusing a source id for a different licence', () => {
    const after = updated((value) => { value.sources[0].name.en = 'Another source'; });
    assert.ok(changeCodes(register(), after).includes('IDENTITY'));
  });
  it('rejects changing source independence groups', () => {
    const after = updated((value) => { value.sources[0].independenceGroup = 'other'; });
    assert.ok(changeCodes(register(), after).includes('IDENTITY'));
  });
  it('rejects moving a source date backwards', () => {
    const after = updated((value) => { value.sources[0].observedOn = '2026-11-09'; });
    assert.ok(changeCodes(register(), after).includes('ROLLBACK'));
  });
  it('allows a source to move forward with updated evidence', () => {
    const after = updated((value) => {
      value.sources[0].observedOn = '2026-11-11';
    });
    assert.equal(compare(register(), after).ok, true);
  });
  it('rejects changing a reused observation id', () => {
    const after = updated((value) => { value.observations[0].note = 'Revised fictional note'; });
    const result = compare(register(), after);
    assert.equal(result.ok, true);
    assert.equal(result.value.summary.changed, 1);
  });
  it('rejects changing a reused observation claim', () => {
    const after = updated((value) => {
      value.features[0].access = 'NO';
      value.observations[0].access = 'NO';
    });
    assert.ok(changeCodes(register(), after).includes('IDENTITY'));
  });
  it('rejects changing an asset digest under the same id', () => {
    const old = withAsset();
    const after = copy(old);
    after.assets[0].sha256 = 'b'.repeat(64);
    assert.ok(changeCodes(old, after).includes('ASSET'));
  });
  it('rejects changing feature identity', () => {
    const after = updated((value) => {
      value.features[0].name.en = 'Changed fictional entrance';
    });
    assert.ok(changeCodes(register(), after).includes('TEXT'));
  });
  it('blocks tier reductions unless explicitly allowed', () => {
    const old = register();
    const after = withUnknown();
    assert.ok(changeCodes(old, after).includes('TIER'));
    assert.equal(compare(old, after, removalPolicy({ allowTierDecrease: true,
      removedObservations: ['obs-b'], maximumRemovals: 1 })).ok, true);
  });
  it('never silently promotes UNKNOWN to YES', () => {
    const old = register();
    old.features[1].access = 'UNKNOWN';
    old.features[1].tier = 1;
    const after = register();
    assert.ok(changeCodes(old, after).includes('TRANSITION'));
  });
  it('accepts a promotion with a new dated observation', () => {
    const old = withUnknown();
    const after = register();
    after.observations[1].id = 'obs-new';
    after.features[1].observationIds = ['obs-new'];
    const result = compare(old, after);
    assert.equal(result.ok, true);
  });
  it('rejects removing linked evidence without a removal', () => {
    const after = updated((value) => {
      value.observations[0].id = 'obs-new';
      value.features[0].observationIds = ['obs-new'];
    });
    assert.ok(changeCodes(register(), after).includes('REMOVAL'));
  });
  it('creates a deterministic per-record comparison', () => {
    const old = [{ id: 'a', name: 'one' }, { id: 'b', name: 'two' }];
    const next = [{ id: 'b', name: 'three' }, { id: 'c', name: 'new' }];
    const result = changesBetween(old, next, 'features');
    assert.deepEqual(result.map((row) => row.kind), ['removed', 'changed', 'added']);
    assert.deepEqual(summarizeChanges(result), { added: 1, removed: 1, changed: 1, unchanged: 0 });
  });
  it('creates a review queue only for actual changes', () => {
    const old = register();
    const after = updated((value) => value.features.push(feature('third')));
    const comparison = compare(old, after);
    const queue = createReviewQueue(parseEvidenceRegister(old).value,
      parseEvidenceRegister(after).value, comparison);
    assert.equal(queue.ok, true);
    assert.equal(queue.value.length, 1);
    assert.equal(queue.value[0].featureId, 'third');
    assert.equal(queue.value[0].nextAccess, 'UNKNOWN');
  });
  it('refuses queues based on a blocked comparison', () => {
    const queue = createReviewQueue(register(), register(), compare(null, null));
    assert.equal(queue.ok, false);
  });
  it('requires a decision for every queue entry', () => {
    const before = register();
    const after = updated((value) => value.features.push(feature('third')));
    const queue = createReviewQueue(parseEvidenceRegister(before).value,
      parseEvidenceRegister(after).value, compare(before, after));
    const result = decideReviewQueue(queue, [], '2026-11-19');
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'EMPTY'));
  });
  it('accepts a complete, local review decision', () => {
    const before = register();
    const after = updated((value) => value.features.push(feature('third')));
    const queue = createReviewQueue(parseEvidenceRegister(before).value,
      parseEvidenceRegister(after).value, compare(before, after));
    const result = decideReviewQueue(queue,
      [reviewAuthorization('third', 'defer')], '2026-11-19');
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.deferred, ['third']);
    assert.equal(result.value.accepted.length, 0);
  });
  it('rejects decisions for nonexistent queue entries', () => {
    const before = register();
    const after = updated((value) => value.features.push(feature('third')));
    const queue = createReviewQueue(parseEvidenceRegister(before).value,
      parseEvidenceRegister(after).value, compare(before, after));
    const result = decideReviewQueue(queue,
      [reviewAuthorization('elsewhere')], '2026-11-19');
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'UNMATCHED'));
  });
  it('rejects duplicate review decisions', () => {
    const before = register();
    const after = updated((value) => value.features.push(feature('third')));
    const queue = createReviewQueue(parseEvidenceRegister(before).value,
      parseEvidenceRegister(after).value, compare(before, after));
    const result = decideReviewQueue(queue,
      [reviewAuthorization('third'), reviewAuthorization('third')], '2026-11-19');
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'DUPLICATE'));
  });
  it('rejects future review dates', () => {
    assert.equal(validateReviewAuthorization(reviewAuthorization('third', 'accept',
      { reviewedOn: '2026-11-20' }), '2026-11-19'), false);
  });
  it('rejects unsupported reviewers and actions', () => {
    assert.equal(validateReviewAuthorization(reviewAuthorization('third', 'publish'), '2026-11-19'), false);
    assert.equal(validateReviewAuthorization(reviewAuthorization('third', 'accept',
      { reviewer: 'unknown' }), '2026-11-19'), false);
  });
  it('formats the queue in EN and FR', () => {
    const before = register();
    const after = updated((value) => value.features.push(feature('third')));
    const queue = createReviewQueue(parseEvidenceRegister(before).value,
      parseEvidenceRegister(after).value, compare(before, after));
    assert.match(reviewQueueText(queue, 'en'), /Records needing review/u);
    assert.match(reviewQueueText(queue, 'fr'), /Fiches à contrôler/u);
    assert.throws(() => reviewQueueText(queue, 'es'), TypeError);
  });
  it('hashes the exact exported review plan bytes', () => {
    const before = register();
    const after = updated((value) => value.features.push(feature('third')));
    const queue = createReviewQueue(parseEvidenceRegister(before).value,
      parseEvidenceRegister(after).value, compare(before, after));
    const decision = decideReviewQueue(queue, [reviewAuthorization('third', 'defer')], '2026-11-19');
    const digest = digestReviewPlan(decision);
    assert.equal(digest.sha256.length, 64);
    assert.equal(digest.length, digest.bytes.length);
    assert.equal(digestReviewPlan({ ok: false }), null);
  });
});
