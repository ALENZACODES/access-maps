import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateRouteEvidenceRequest, assessFeatureAtTime, assessRouteEvidence,
  compareRouteEvidence, routeEvidenceText, provenanceForRoute,
} from './p15aa-route-evidence.mjs';
import { parseEvidenceRegister } from './p15aa-intake.mjs';
import {
  register, copy, routeRequest, withUnknown, withNo, withConflict,
  withIndependentSources, withOdbl,
} from './p15aa-fixtures.mjs';

const assess = (input, options = {}) => assessRouteEvidence(input, routeRequest(options));
const parsed = (input) => parseEvidenceRegister(input).value;

describe('P15AA route evidence: date-sensitive and never optimistic', () => {
  it('accepts a fully supported two-feature route', () => {
    const result = assess(register());
    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'available');
    assert.equal(result.value.access, 'YES');
    assert.equal(result.value.sections.length, 2);
    assert.equal(result.summary.unknown, 0);
  });
  it('preserves UNKNOWN with a conditional flag', () => {
    const outcome = assess(withUnknown(), { allowUnknown: true });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.access, 'UNKNOWN');
    assert.equal(outcome.value.status, 'conditional');
    assert.equal(outcome.summary.unknown, 1);
  });
  it('does not silently offer unknown access as a supported route', () => {
    const outcome = assess(withUnknown());
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.status, 'absent');
    assert.equal(outcome.value.access, 'UNKNOWN');
  });
  it('treats reported negative access as a barrier', () => {
    const outcome = assess(withNo());
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.status, 'blocked');
    assert.equal(outcome.value.access, 'NO');
    assert.equal(outcome.summary.barriers, 1);
  });
  it('requires disagreement to remain UNKNOWN', () => {
    const outcome = assess(withConflict(), { allowUnknown: true });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.status, 'conditional');
    assert.equal(outcome.value.sections[1].access, 'UNKNOWN');
    assert.ok(outcome.value.sections[1].reasons.includes('CONFLICT'));
  });
  it('blocks a request with missing feature references', () => {
    const result = assess(register(), { featureIds: ['entrance-a', 'absent'] });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'REFERENCE'));
  });
  it('rejects duplicate requested feature identifiers', () => {
    const result = assess(register(), { featureIds: ['entrance-a', 'entrance-a'] });
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('rejects empty route selections', () => {
    const result = assess(register(), { featureIds: [] });
    assert.equal(result.ok, false);
  });
  it('rejects invalid route identifiers', () => {
    const result = assess(register(), { routeId: '../route' });
    assert.equal(result.ok, false);
  });
  it('rejects invented route locales or silos', () => {
    const result = assess(register(), { silo: 'mixed' });
    assert.equal(result.ok, false);
  });
  it('rejects a request exceeding the bounded horizon', () => {
    const result = assess(register(), { maximumAgeDays: 4000 });
    assert.equal(result.ok, false);
  });
  it('rejects a request before the data publication date', () => {
    const result = assess(register(), { asOf: '2026-11-18' });
    assert.equal(result.ok, false);
  });
  it('rejects a request with malformed tier metadata', () => {
    const result = assess(register(), { minimumTier: 8 });
    assert.equal(result.ok, false);
  });
  it('rejects unsupported extra request fields', () => {
    const result = assess(register(), { mode: 'optimistic' });
    assert.equal(result.ok, false);
  });
  it('rejects requests with a foreign licence silo', () => {
    const result = assess(withOdbl(), { silo: 'odbl' });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'SILO'));
  });
  it('accepts isolated ODbL feature requests', () => {
    const result = assessRouteEvidence(withOdbl(), routeRequest({
      silo: 'odbl', featureIds: ['ramp-c'],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.value.sections[0].access, 'YES');
  });
  it('requires independent tier-three observations', () => {
    const model = withIndependentSources();
    model.observations[0].tier = 3;
    const result = assessRouteEvidence(model, routeRequest({
      featureIds: ['entrance-a'], minimumTier: 3,
    }));
    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'available');
  });
  it('keeps lower-tier observations out of elevated claims', () => {
    const result = assessRouteEvidence(register(), routeRequest({ minimumTier: 3 }));
    assert.equal(result.ok, true);
    assert.equal(result.value.access, 'UNKNOWN');
    assert.equal(result.value.status, 'absent');
  });
  it('does not promote a tier-one feature to positive access', () => {
    const result = assess(withUnknown(), { allowUnknown: true, minimumTier: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.value.sections[1].access, 'UNKNOWN');
  });
  it('expires evidence by observation age', () => {
    const result = assess(register(), { asOf: '2026-12-31', maximumAgeDays: 30, allowUnknown: true });
    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'conditional');
    assert.ok(result.value.sections[0].reasons.includes('AGE'));
  });
  it('accepts dates at the inclusive freshness boundary', () => {
    const result = assess(register(), { asOf: '2026-11-20', maximumAgeDays: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'available');
  });
  it('refuses stale source metadata even with recent observations', () => {
    const value = register();
    value.sources[0].observedOn = '2026-09-19';
    const result = assess(value);
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('exposes the exact observation references', () => {
    const result = assess(register());
    assert.deepEqual(result.value.sections[0].observationIds, ['obs-a']);
    assert.deepEqual(result.value.sections[0].sourceIds, ['municipal']);
    assert.equal(result.value.sections[0].tier, 2);
  });
  it('does not attach unsupported provenance to UNKNOWN', () => {
    const result = assess(withUnknown(), { allowUnknown: true });
    assert.deepEqual(result.value.sections[1].observationIds, []);
    assert.deepEqual(result.value.sections[1].sourceIds, []);
  });
  it('retains a deterministic evidence digest', () => {
    const first = assess(register());
    const second = assess(copy(register()));
    assert.equal(first.value.evidenceDigest, second.value.evidenceDigest);
  });
  it('flags added route evidence sections', () => {
    const previous = assessRouteEvidence(register(), routeRequest({ featureIds: ['entrance-a'] }));
    const next = assess(register());
    const diff = compareRouteEvidence(previous, next);
    assert.equal(diff.ok, true);
    assert.equal(diff.value.changes.find((row) => row.featureId === 'entrance-b').kind, 'added');
  });
  it('flags removed route evidence sections', () => {
    const previous = assess(register());
    const next = assessRouteEvidence(register(), routeRequest({ featureIds: ['entrance-a'] }));
    const diff = compareRouteEvidence(previous, next);
    assert.equal(diff.ok, true);
    assert.equal(diff.value.changes.find((row) => row.featureId === 'entrance-b').kind, 'removed');
  });
  it('marks a previously available route becoming conditional', () => {
    const previous = assess(register());
    const next = assess(withUnknown(), { allowUnknown: true });
    const diff = compareRouteEvidence(previous, next);
    assert.equal(diff.ok, true);
    assert.equal(diff.value.nextIsWorse, true);
    assert.equal(diff.value.statusChanged, true);
  });
  it('marks an available route becoming blocked', () => {
    const previous = assess(register());
    const next = assess(withNo());
    const diff = compareRouteEvidence(previous, next);
    assert.equal(diff.ok, true);
    assert.equal(diff.value.after, 'blocked');
    assert.equal(diff.value.nextIsWorse, true);
  });
  it('rejects comparing unrelated route identifiers', () => {
    const previous = assess(register());
    const next = assess(register(), { routeId: 'other-route' });
    const diff = compareRouteEvidence(previous, next);
    assert.equal(diff.ok, false);
  });
  it('rejects comparing blocked inputs', () => {
    const previous = assess(null);
    const next = assess(register());
    const diff = compareRouteEvidence(previous, next);
    assert.equal(diff.ok, false);
  });
  it('prints route status and segments in both languages', () => {
    const result = assess(register());
    assert.match(routeEvidenceText(result, 'en'), /Route supported/u);
    assert.match(routeEvidenceText(result, 'fr'), /Parcours/u);
    assert.match(routeEvidenceText(result, 'fr'), /entrance-a/u);
    assert.throws(() => routeEvidenceText(result, 'es'), TypeError);
  });
  it('collects route provenance without modifying the register', () => {
    const input = register();
    const outcome = assess(input);
    const original = parsed(input);
    const citations = provenanceForRoute(original, outcome);
    assert.equal(citations.routeId, 'sample-route');
    assert.equal(citations.sources.length, 1);
    assert.equal(citations.features.length, 2);
    assert.equal(provenanceForRoute(original, { ok: false }), null);
  });
  it('checks request validity against parsed registers', () => {
    const model = parsed(register());
    assert.equal(validateRouteEvidenceRequest(routeRequest(), model), true);
    assert.equal(validateRouteEvidenceRequest(routeRequest({ maximumAgeDays: -1 }), model), false);
    assert.equal(validateRouteEvidenceRequest(routeRequest({ asOf: 'bad' }), model), false);
  });
  it('assesses one feature in isolation', () => {
    const model = parsed(register());
    const result = assessFeatureAtTime(model.features[0], model, routeRequest());
    assert.equal(result.access, 'YES');
    assert.equal(result.featureId, 'entrance-a');
  });
});
