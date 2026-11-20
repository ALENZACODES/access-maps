import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseEvidenceRegister, validateSource, validateFeature, validateObservation,
  validateAsset, evidenceByFeature, provenanceForFeature, dependenciesForFeature,
  filterEvidenceRegister,
} from './p15aa-intake.mjs';
import {
  register, copy, source, observation, feature, asset, withUnknown,
  withNo, withConflict, withAsset, withOdbl, withIndependentSources,
} from './p15aa-fixtures.mjs';

const audit = (value) => parseEvidenceRegister(value);
const codes = (value) => audit(value).issues.map((item) => item.code);
const has = (value, code) => codes(value).includes(code);
const mutated = (fn) => { const value = register(); fn(value); return value; };

describe('P15AA evidence intake: reject unsupported record claims', () => {
  it('accepts and sorts a complete fictional register', () => {
    const result = audit(register());
    assert.equal(result.ok, true);
    assert.equal(result.value.features.length, 2);
    assert.equal(result.summary.sources, 1);
    assert.equal(result.summary.observations, 2);
    assert.equal(result.summary.assets, 0);
    assert.equal(result.summary.access.YES, 2);
    assert.equal(result.summary.tiers[2], 2);
  });
  it('does not modify caller records', () => {
    const original = register();
    const snapshot = copy(original);
    const outcome = audit(original);
    assert.equal(outcome.ok, true);
    assert.deepEqual(original, snapshot);
    assert.notStrictEqual(outcome.value.features[0], original.features[0]);
  });
  it('is independent of array record ordering', () => {
    const input = register();
    const changed = copy(input);
    changed.features.reverse();
    changed.observations.reverse();
    const a = audit(input);
    const b = audit(changed);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.summary.digest, b.summary.digest);
    assert.deepEqual(a.value, b.value);
  });
  it('accepts explicitly unknown access', () => {
    const result = audit(withUnknown());
    assert.equal(result.ok, true);
    assert.equal(result.value.features[1].access, 'UNKNOWN');
    assert.equal(result.summary.access.UNKNOWN, 1);
  });
  it('accepts supported negative observations', () => {
    const result = audit(withNo());
    assert.equal(result.ok, true);
    assert.equal(result.value.features[1].access, 'NO');
  });
  it('accepts disagreement only when the access stays UNKNOWN', () => {
    const registerWithConflict = withConflict();
    assert.equal(audit(registerWithConflict).ok, true);
    registerWithConflict.features[1].access = 'YES';
    registerWithConflict.features[1].tier = 2;
    assert.equal(has(registerWithConflict, 'CONFLICT'), true);
  });
  it('accepts two independent sources for tier three', () => {
    const outcome = audit(withIndependentSources());
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.features[0].tier, 3);
  });
  it('rejects repeated nominally independent source groups', () => {
    const value = withIndependentSources();
    value.sources[1].independenceGroup = 'municipal';
    assert.equal(has(value, 'INDEPENDENCE'), true);
  });
  it('accepts separated ODbL source records', () => {
    const outcome = audit(withOdbl());
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.features[2].silo, 'odbl');
  });
  it('rejects the wrong export silo for a feature', () => {
    const value = withOdbl();
    value.features[2].silo = 'open';
    assert.equal(has(value, 'SILO'), true);
  });
  it('fails closed on malformed entries in every collection', () => {
    for (const category of ['sources', 'features', 'observations']) {
      for (const bad of [null, false, 0, {}, [], 'invalid']) {
        const candidate = register();
        candidate[category][0] = bad;
        const result = audit(candidate);
        assert.equal(result.ok, false, `${category} must be rejected`);
        assert.equal(result.value, null);
      }
    }
    for (const bad of [null, false, 0, {}, [], 'invalid']) {
      const candidate = withAsset();
      candidate.assets[0] = bad;
      assert.equal(audit(candidate).ok, false);
    }
  });
  it('rejects an invalid root', () => {
    for (const value of [null, false, [], {}, { version: 1 }, 'records']) {
      const outcome = audit(value);
      assert.equal(outcome.ok, false);
      assert.equal(outcome.value, null);
      assert.ok(outcome.issues.some((issue) => issue.code === 'ROOT'));
    }
  });
  it('rejects invalid snapshot dates', () => {
    assert.equal(has(mutated((v) => { v.asOf = '2026-02-30'; }), 'DATE'), true);
    assert.equal(has(mutated((v) => { v.asOf = '2026-11-20T00:00Z'; }), 'DATE'), true);
    assert.equal(has(mutated((v) => { v.maxAgeDays = -1; }), 'DATE'), true);
    assert.equal(has(mutated((v) => { v.maxAgeDays = 3651; }), 'DATE'), true);
  });
  it('does not accept stale sources', () => {
    const value = mutated((v) => { v.sources[0].observedOn = '2025-01-01'; });
    assert.equal(has(value, 'AGE'), true);
  });
  it('does not accept future sources', () => {
    const value = mutated((v) => { v.sources[0].observedOn = '2026-12-01'; });
    assert.equal(has(value, 'AGE'), true);
  });
  it('does not accept future observations', () => {
    const value = mutated((v) => { v.observations[0].observedOn = '2026-12-01'; });
    assert.equal(has(value, 'AGE'), true);
  });
  it('rejects missing source identities', () => {
    assert.equal(has(mutated((v) => { v.sources[0].id = ''; }), 'SOURCE'), true);
    assert.equal(has(mutated((v) => { v.sources[0].reference = '../missing'; }), 'SOURCE'), true);
    assert.equal(has(mutated((v) => { v.sources[0].kind = 'private'; }), 'SOURCE'), true);
  });
  it('rejects unsupported source licences', () => {
    assert.equal(has(mutated((v) => { v.sources[0].licence = 'proprietary'; }), 'LICENCE'), true);
    assert.equal(has(mutated((v) => { v.sources[0].silo = 'odbl'; }), 'SILO'), true);
  });
  it('rejects an open-map source with a mismatched licence', () => {
    assert.equal(has(mutated((v) => { v.sources[0].kind = 'open-map'; }), 'LICENCE'), true);
  });
  it('rejects unsafe English and French labels', () => {
    assert.equal(has(mutated((v) => { v.features[0].name.fr = 'Entrée: locale'; }), 'FEATURE'), true);
    assert.equal(has(mutated((v) => { v.features[0].name.en = '<script>'; }), 'FEATURE'), true);
    assert.equal(has(mutated((v) => { v.sources[0].name.fr = 'Oui !'; }), 'SOURCE'), true);
  });
  it('rejects duplicate source records', () => {
    const value = mutated((v) => { v.sources.push(copy(v.sources[0])); });
    assert.equal(has(value, 'DUPLICATE'), true);
  });
  it('rejects duplicate feature records', () => {
    const value = mutated((v) => { v.features.push(copy(v.features[0])); });
    assert.equal(has(value, 'DUPLICATE'), true);
  });
  it('rejects duplicate observation records', () => {
    const value = mutated((v) => { v.observations.push(copy(v.observations[0])); });
    assert.equal(has(value, 'DUPLICATE'), true);
  });
  it('rejects duplicate offline assets', () => {
    const value = withAsset();
    value.assets.push(copy(value.assets[0]));
    assert.equal(has(value, 'DUPLICATE'), true);
  });
  it('rejects duplicate offline paths', () => {
    const value = withAsset();
    value.assets.push(asset('map-b', 'different', { path: 'offline/map-a.json' }));
    assert.equal(has(value, 'DUPLICATE'), true);
  });
  it('rejects a missing source dependency', () => {
    const value = mutated((v) => { v.features[0].sourceIds = ['not-here']; });
    assert.equal(has(value, 'REFERENCE'), true);
  });
  it('rejects missing observation dependencies', () => {
    const value = mutated((v) => { v.features[0].observationIds = ['not-here']; });
    assert.equal(has(value, 'REFERENCE'), true);
  });
  it('rejects detached observations', () => {
    const value = mutated((v) => { v.observations.push(observation('extra', 'entrance-a')); });
    assert.equal(has(value, 'REFERENCE'), true);
  });
  it('rejects references to another feature', () => {
    const value = mutated((v) => { v.observations[0].featureId = 'entrance-b'; });
    assert.equal(has(value, 'REFERENCE'), true);
  });
  it('rejects evidence older than its source', () => {
    const value = mutated((v) => { v.observations[0].observedOn = '2026-11-09'; });
    assert.equal(has(value, 'AGE'), true);
  });
  it('rejects an unsupported tier three', () => {
    const value = mutated((v) => { v.features[0].tier = 3; });
    assert.equal(has(value, 'TIER'), true);
  });
  it('rejects unsupported tier-three survey roles', () => {
    const value = withIndependentSources();
    value.observations[2].role = 'observer';
    assert.equal(has(value, 'TIER'), true);
  });
  it('rejects tier-zero positive access', () => {
    const value = mutated((v) => { v.features[0].tier = 0; });
    assert.equal(has(value, 'TIER'), true);
  });
  it('rejects positive access without observations', () => {
    const value = mutated((v) => { v.features[0].observationIds = []; });
    assert.equal(has(value, 'CLAIM'), true);
  });
  it('rejects unreferenced offline assets', () => {
    const value = withAsset();
    value.features[0].assetIds = ['absent'];
    assert.equal(has(value, 'REFERENCE'), true);
  });
  it('rejects unsafe asset paths', () => {
    const value = withAsset();
    value.assets[0].path = '../offline.json';
    assert.equal(has(value, 'ASSET'), true);
  });
  it('rejects unsafe asset hash declarations', () => {
    const value = withAsset();
    value.assets[0].sha256 = 'f'.repeat(63);
    assert.equal(has(value, 'ASSET'), true);
  });
  it('rejects assets pointing across source silos', () => {
    const value = withAsset();
    value.assets[0].silo = 'odbl';
    assert.equal(has(value, 'SILO'), true);
  });
  it('collects provenance by feature', () => {
    const result = audit(register());
    const record = provenanceForFeature(result.value, 'entrance-a');
    assert.equal(record.featureId, 'entrance-a');
    assert.equal(record.sources.length, 1);
    assert.equal(record.observations.length, 1);
    assert.equal(provenanceForFeature(result.value, 'missing'), null);
  });
  it('indexes observations for every selected feature', () => {
    const result = audit(register());
    const byFeature = evidenceByFeature(result.value);
    assert.equal(byFeature.size, 2);
    assert.equal(byFeature.get('entrance-a')[0].id, 'obs-a');
  });
  it('collects complete dependencies', () => {
    const result = audit(withAsset());
    const deps = dependenciesForFeature(result.value, 'entrance-a');
    assert.deepEqual(deps.sourceIds, ['municipal']);
    assert.deepEqual(deps.observationIds, ['obs-a']);
    assert.deepEqual(deps.assetIds, ['map-a']);
    assert.equal(dependenciesForFeature(result.value, 'absent'), null);
  });
  it('creates a bounded, dependency-complete subset', () => {
    const result = audit(register());
    const sliced = filterEvidenceRegister(result.value, ['entrance-a']);
    assert.equal(sliced.ok, true);
    assert.equal(sliced.value.features.length, 1);
    assert.equal(sliced.value.observations.length, 1);
    assert.equal(sliced.value.sources.length, 1);
  });
  it('rejects a subset naming a missing feature', () => {
    const result = audit(register());
    const sliced = filterEvidenceRegister(result.value, ['missing']);
    assert.equal(sliced.ok, false);
    assert.equal(sliced.value, null);
  });
  it('rejects repeated feature selections', () => {
    const result = audit(register());
    const sliced = filterEvidenceRegister(result.value, ['entrance-a', 'entrance-a']);
    assert.equal(sliced.ok, false);
  });
  it('requires actual open-map source licence separation', () => {
    const value = withOdbl();
    value.sources[1].licence = 'OGL-ON-1.0';
    assert.equal(has(value, 'LICENCE'), true);
  });
  it('retains deterministic sorted errors', () => {
    const value = mutated((v) => {
      v.features[0].sourceIds = ['missing'];
      v.observations[1].sourceId = 'absent';
    });
    const first = audit(value);
    const second = audit(value);
    assert.deepEqual(first.issues, second.issues);
    assert.equal(first.value, null);
  });
  it('exposes small isolated validation functions', () => {
    const issues = [];
    const add = (code, path) => issues.push({ code, path });
    assert.equal(validateSource(source(), 0, '2026-11-19', 60, add), true);
    assert.equal(validateFeature(feature('entrance-a', ['obs-a']), 0, add), true);
    assert.equal(validateObservation(observation('obs-a', 'entrance-a'), 0, '2026-11-19', 60, add), true);
    assert.equal(validateAsset(asset('map-a'), 0, add), true);
    assert.equal(issues.length, 0);
  });
});
