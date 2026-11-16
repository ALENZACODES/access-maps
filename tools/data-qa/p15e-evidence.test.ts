import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditEvidence, type Decision, type EvidencePackage, type Observation } from './p15e-evidence.ts';

const stamp = {
  source: 'Town open mapping', licence: 'OGL-ON-1.0', observedOn: '2026-11-10',
  reference: 'sources/town-2026.json',
} as const;
const sample: Observation = {
  id: 'obs-1', placeId: 'place-1', feature: 'entrance', kind: 'OBSERVATION',
  access: 'UNKNOWN', recordedOn: '2026-11-11', reason: 'No access information supplied',
  source: stamp, silo: 'open',
};
const decision: Decision = {
  placeId: 'place-1', feature: 'entrance', access: 'UNKNOWN',
  observationIds: ['obs-1'], silo: 'open', source: stamp,
};
const packageBase: EvidencePackage = {
  schemaVersion: 1, asOf: '2026-11-15', maxAgeDays: 30,
  observations: [sample], decisions: [decision],
};
function run(changes: Record<string, unknown> = {}) {
  return auditEvidence({ ...packageBase, ...changes });
}
function errors(changes: Record<string, unknown>, code: string) {
  const result = run(changes);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result.findings));
  for (const item of result.findings) {
    assert.ok(item.en.length > 10);
    assert.ok(item.fr.length > 10);
  }
  return result;
}
describe('evidence decisions', () => {
  it('keeps an explicitly unknown observation and decision', () => {
    const result = run();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.unknown, 1);
    assert.equal(result.summary.observations, 1);
    assert.deepEqual(result.findings, []);
  });
  it('does not turn an unknown observation into an accessible decision', () => {
    errors({ decisions: [{ ...decision, access: 'YES' }] }, 'CONFLICT');
  });
  it('does not turn unknown evidence into a negative access assertion', () => {
    errors({ decisions: [{ ...decision, access: 'NO' }] }, 'CONFLICT');
  });
  it('accepts a positive decision supported by a matching observation', () => {
    const obs = { ...sample, access: 'YES' };
    assert.equal(run({ observations: [obs], decisions: [{ ...decision, access: 'YES' }] }).ok, true);
  });
  it('accepts a negative decision supported by a matching observation', () => {
    const obs = { ...sample, access: 'NO' };
    assert.equal(run({ observations: [obs], decisions: [{ ...decision, access: 'NO' }] }).ok, true);
  });
  it('blocks conflicting positive and negative observations', () => {
    const a = { ...sample, access: 'YES' };
    const b = { ...sample, id: 'obs-2', access: 'NO' };
    const result = errors({ observations: [a, b], decisions: [
      { ...decision, access: 'YES', observationIds: ['obs-1', 'obs-2'] },
    ] }, 'CONFLICT');
    assert.equal(result.summary.conflicting, 1);
  });
  it('accepts a conflict disclosed as UNKNOWN with no selected source', () => {
    const a = { ...sample, access: 'YES' };
    const b = { ...sample, id: 'obs-2', access: 'NO' };
    const result = run({ observations: [a, b], decisions: [
      { ...decision, access: 'UNKNOWN', source: null, observationIds: ['obs-1', 'obs-2'] },
    ] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.conflicting, 1);
  });
  it('rejects unknown state derived from two different assertions without a conflict', () => {
    const a = { ...sample, access: 'YES' };
    errors({ observations: [a], decisions: [{ ...decision, access: 'UNKNOWN' }] }, 'ASSERTION');
  });
  it('allows a correcting observation to supersede an older one', () => {
    const a = { ...sample, access: 'NO' };
    const b = { ...sample, id: 'obs-2', kind: 'CORRECTION', access: 'YES',
      recordedOn: '2026-11-12', supersedes: 'obs-1' };
    const result = run({ observations: [a, b], decisions: [{ ...decision,
      access: 'YES', observationIds: ['obs-1', 'obs-2'] }] });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('requires the old reference for a correction', () => {
    errors({ observations: [{ ...sample, kind: 'CORRECTION' }] }, 'SUPERSEDES');
  });
  it('rejects supersession cycles', () => {
    const a = { ...sample, kind: 'CORRECTION', supersedes: 'obs-2' };
    const b = { ...sample, id: 'obs-2', kind: 'CORRECTION', supersedes: 'obs-1' };
    errors({ observations: [a, b], decisions: [
      { ...decision, observationIds: ['obs-1', 'obs-2'] },
    ] }, 'HISTORY');
  });
  it('rejects correction from a different place', () => {
    const a = sample;
    const b = { ...sample, id: 'obs-2', placeId: 'place-2', kind: 'CORRECTION',
      supersedes: 'obs-1' };
    errors({ observations: [a, b] }, 'HISTORY');
  });
  it('rejects correction with older timestamp than original', () => {
    const a = sample;
    const b = { ...sample, id: 'obs-2', kind: 'CORRECTION',
      recordedOn: '2026-11-09', supersedes: 'obs-1' };
    errors({ observations: [a, b], decisions: [
      { ...decision, observationIds: ['obs-1', 'obs-2'] },
    ] }, 'HISTORY');
  });
  it('allows withdrawal to return the state to UNKNOWN', () => {
    const a = { ...sample, access: 'YES' };
    const b = { ...sample, id: 'obs-2', kind: 'WITHDRAWAL',
      supersedes: 'obs-1', recordedOn: '2026-11-12' };
    const result = run({ observations: [a, b], decisions: [{ ...decision, source: null,
      observationIds: ['obs-1', 'obs-2'] }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.withdrawals, 1);
  });
  it('forbids a withdrawal from asserting access', () => {
    errors({ observations: [{ ...sample, kind: 'WITHDRAWAL', access: 'YES' }] }, 'WITHDRAWAL');
  });
  it('blocks stale source dates', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, observedOn: '2020-01-01' } }] }, 'AGE');
  });
  it('blocks future source dates', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, observedOn: '2027-01-01' } }] }, 'AGE');
  });
  it('blocks future observation dates', () => {
    errors({ observations: [{ ...sample, recordedOn: '2027-01-01' }] }, 'AGE');
  });
  it('blocks source chronology later than observation', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, observedOn: '2026-11-14' } }] }, 'ORDER');
  });
  it('rejects invalid calendar dates', () => {
    errors({ observations: [{ ...sample, recordedOn: '2026-02-30' }] }, 'OBS_SCHEMA');
  });
  it('rejects missing source licence', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, licence: '' } }] }, 'OBS_SCHEMA');
  });
  it('rejects closed source licence', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, licence: 'private' } }] }, 'SOURCE');
  });
  it('rejects held transit sources, including identifier variants', () => {
    for (const name of ['MiWay', 'mi-way', 'MI_WAY', 'Mi Way GTFS']) {
      errors({ observations: [{ ...sample, source: { ...stamp, source: name } }] }, 'HELD');
    }
  });
  it('detects ODbL records misfiled as general open data', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, licence: 'ODbL-1.0' } }] }, 'SILO');
  });
  it('allows correctly segregated ODbL observations and decisions', () => {
    const odbl = { ...stamp, licence: 'ODbL-1.0' };
    const result = run({ observations: [{ ...sample, source: odbl, silo: 'odbl' }],
      decisions: [{ ...decision, source: odbl, silo: 'odbl' }] });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('blocks decision silo mismatch', () => {
    errors({ decisions: [{ ...decision, silo: 'odbl' }] }, 'DEC_SILO');
  });
  it('rejects unknown source references', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, reference: 'https://somewhere.example/a' } }] }, 'SOURCE');
  });
  it('rejects personal email text', () => {
    errors({ observations: [{ ...sample, reason: 'contact alice@example.org about location' }] }, 'PRIVACY');
  });
  it('rejects contact phone numbers', () => {
    errors({ observations: [{ ...sample, reason: 'please call 416-555-0100 for more' }] }, 'PRIVACY');
  });
  it('rejects embedded script markup', () => {
    errors({ observations: [{ ...sample, reason: '<script>unsafe()</script>' }] }, 'PRIVACY');
  });
  it('rejects unreferenced observations', () => {
    errors({ decisions: [] }, 'DEC_COVER');
  });
  it('rejects unrelated place evidence', () => {
    errors({ decisions: [{ ...decision, placeId: 'place-2' }] }, 'REFERENCE');
  });
  it('rejects duplicate observation ids', () => {
    errors({ observations: [sample, sample] }, 'DUPLICATE');
  });
  it('rejects repeated decision per feature', () => {
    errors({ decisions: [decision, decision] }, 'DUPLICATE');
  });
  it('rejects duplicate references in decision', () => {
    errors({ decisions: [{ ...decision, observationIds: ['obs-1', 'obs-1'] }] }, 'DUPLICATE');
  });
  it('rejects source unrelated to supporting evidence', () => {
    errors({ decisions: [{ ...decision, source: { ...stamp, source: 'Other open dataset' } }] }, 'DEC_SOURCE');
  });
  it('rejects arbitrary extra observation metadata', () => {
    errors({ observations: [{ ...sample, coordinates: [43.0, -79.0] }] }, 'OBS_SCHEMA');
  });
  it('rejects unsupported feature names', () => {
    errors({ observations: [{ ...sample, feature: 'all-access' }] }, 'OBS_SCHEMA');
  });
  it('rejects malformed root input', () => {
    assert.equal(auditEvidence(null).ok, false);
    assert.equal(auditEvidence([]).ok, false);
    assert.equal(auditEvidence({}).ok, false);
  });
  it('rejects overflowing inventory', () => {
    errors({ decisions: Array.from({ length: 50001 }, () => decision) }, 'LIMIT');
  });
  it('produces deterministic bilingual diagnostics', () => {
    const data = { observations: [{ ...sample, recordedOn: '2027-01-01' }] };
    assert.deepEqual(run(data), run(data));
    assert.ok(run(data).findings.every(f => f.en && f.fr));
  });
});

describe('evidence inventory boundaries', () => {
  it('accepts separate unknown decisions for independent features', () => {
    const other: Observation = { ...sample, id: 'obs-2', feature: 'lift' };
    const report = run({ observations: [sample, other], decisions: [decision,
      { ...decision, feature: 'lift', observationIds: ['obs-2'] },
    ] });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.summary.unknown, 2);
  });
  it('rejects a decision that references a different feature', () => {
    const other: Observation = { ...sample, id: 'obs-2', feature: 'lift' };
    errors({ observations: [sample, other], decisions: [
      { ...decision, observationIds: ['obs-1', 'obs-2'] },
    ] }, 'REFERENCE');
  });
  it('rejects an observation not named by a partial decision', () => {
    const other: Observation = { ...sample, id: 'obs-2' };
    errors({ observations: [sample, other] }, 'REFERENCE');
  });
  it('rejects an unknown observation with an invalid status case', () => {
    errors({ observations: [{ ...sample, access: 'Unknown' }] }, 'OBS_SCHEMA');
  });
  it('rejects extra source stamp fields', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, privateContact: 'hidden' } }] }, 'OBS_SCHEMA');
  });
  it('rejects an HTTP source reference even when licence is open', () => {
    errors({ observations: [{ ...sample, source: { ...stamp, reference: 'http://test.invalid' } }] }, 'SOURCE');
  });
  it('rejects a future recording date at the reporting boundary', () => {
    errors({ observations: [{ ...sample, recordedOn: '2026-11-16' }] }, 'AGE');
  });
  it('rejects malformed options for date thresholds', () => {
    errors({ maxAgeDays: -1 }, 'POLICY');
  });
});
