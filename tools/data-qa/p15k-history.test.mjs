import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditHistory, compareHistory, decisionShape, eventShape, observationShape } from './p15k-history.mjs';
import { clone, decision, history, observation, reason, source, ZERO_HASH } from './p15k-fixtures.mjs';

function codes(value) { return auditHistory(value).findings.map(item => item.code); }
function blocked(value, code) {
  const result = auditHistory(value);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(item => item.code === code), JSON.stringify(result));
}
function changeObservation(patch) {
  return history({ observations: [observation(patch)] });
}
function changeDecision(patch) {
  return history({ decisions: [decision(patch)] });
}
function extraObservation(patch = {}) {
  return observation({ id: 'observation-two', kind: 'CORRECTED', supersedes: 'observation-one', ...patch });
}

describe('P15K evidence history shape', () => {
  it('accepts a fictional complete observation', () => {
    assert.equal(observationShape(observation()), true);
  });
  it('rejects an observation without a source', () => {
    const value = observation();
    delete value.source;
    assert.equal(observationShape(value), false);
  });
  it('rejects a non-catalogue feature', () => {
    assert.equal(observationShape(observation({ feature: 'unknown-feature' })), false);
  });
  it('rejects an inferred access value', () => {
    assert.equal(observationShape(observation({ access: 'LIKELY' })), false);
  });
  it('rejects an invalid observation date', () => {
    assert.equal(observationShape(observation({ recordedOn: '2026-02-30' })), false);
  });
  it('rejects an unknown evidence kind', () => {
    assert.equal(observationShape(observation({ kind: 'REVIEWED' })), false);
  });
  it('rejects unexpected private metadata', () => {
    assert.equal(observationShape(observation({ ownerEmail: 'x@example.org' })), false);
  });
  it('requires a valid identifier for revisions', () => {
    assert.equal(observationShape(observation({ supersedes: '../original' })), false);
  });
  it('accepts the explicit UNKNOWN state', () => {
    assert.equal(observationShape(observation({ access: 'UNKNOWN' })), true);
  });
  it('rejects missing decision evidence ids', () => {
    assert.equal(decisionShape({ ...decision(), observationIds: null }), false);
  });
  it('accepts an UNKNOWN decision without a source', () => {
    assert.equal(decisionShape(decision({ access: 'UNKNOWN', source: null })), true);
  });
  it('rejects a decision with an invalid silo', () => {
    assert.equal(decisionShape(decision({ silo: 'mixed' })), false);
  });
  it('rejects an event with no digest', () => {
    const event = history().events[0];
    assert.equal(eventShape({ ...event, sourceDigest: '' }), false);
  });
  it('rejects an unknown publication state', () => {
    assert.equal(eventShape({ ...history().events[0], state: 'ACTIVE' }), false);
  });
});

describe('P15K history semantic gates', () => {
  it('accepts the valid fixture and reports its count', () => {
    const result = auditHistory(history());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.observations, 1);
  });
  it('rejects a null package', () => {
    blocked(null, 'SHAPE');
  });
  it('rejects a missing observations array', () => {
    const value = history();
    delete value.observations;
    blocked(value, 'SHAPE');
  });
  it('rejects a non-calendar asOf date', () => {
    blocked(history({ asOf: '2026-11-31' }), 'SHAPE');
  });
  it('rejects a negative max-age policy', () => {
    blocked(history({ maxAgeDays: -1 }), 'SHAPE');
  });
  it('rejects duplicate observation identifiers', () => {
    blocked(history({ observations: [observation(), observation()] }), 'DUPLICATE');
  });
  it('rejects missing source licence', () => {
    blocked(changeObservation({ source: source({ licence: '' }) }), 'SHAPE');
  });
  it('rejects held sources', () => {
    blocked(changeObservation({ source: source({ source: 'MiWay feed' }) }), 'SHAPE');
  });
  it('rejects an observation with stale recording date', () => {
    blocked(changeObservation({ recordedOn: '2026-01-01' }), 'STALE');
  });
  it('rejects a source date newer than recording date', () => {
    blocked(changeObservation({ recordedOn: '2026-11-14' }), 'ORDER');
  });
  it('rejects an ODbL source in an open silo', () => {
    blocked(changeObservation({ source: source({ licence: 'ODbL-1.0' }) }), 'SILO');
  });
  it('accepts a correctly isolated ODbL observation', () => {
    const stamp = source({ licence: 'ODbL-1.0' });
    const result = auditHistory(history({
      observations: [observation({ source: stamp, silo: 'odbl' })],
      decisions: [decision({ source: stamp, silo: 'odbl' })],
    }));
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('rejects a known decision not supported by its evidence', () => {
    blocked(changeDecision({ access: 'NO' }), 'EVIDENCE');
  });
  it('rejects a known decision with missing source', () => {
    blocked(changeDecision({ source: null }), 'EVIDENCE');
  });
  it('rejects a source stamp unrelated to active evidence', () => {
    blocked(changeDecision({ source: source({ reference: 'sources/other.json' }) }), 'EVIDENCE');
  });
  it('rejects a decision referring to a non-existent observation', () => {
    blocked(changeDecision({ observationIds: ['not-found'] }), 'REFERENCE');
  });
  it('rejects duplicate decision references', () => {
    blocked(changeDecision({ observationIds: ['observation-one', 'observation-one'] }), 'DUPLICATE');
  });
  it('rejects an uncovered observation', () => {
    blocked(history({ decisions: [] }), 'REFERENCE');
  });
  it('rejects a duplicate decision for the same feature', () => {
    blocked(history({ decisions: [decision(), decision()] }), 'DUPLICATE');
  });
  it('rejects an unsupported switch to UNKNOWN', () => {
    blocked(changeDecision({ access: 'UNKNOWN' }), 'EVIDENCE');
  });
  it('rejects mutually contradictory active observations', () => {
    const other = observation({ id: 'observation-two', access: 'NO' });
    const result = auditHistory(history({
      observations: [observation(), other],
      decisions: [decision({ observationIds: ['observation-one', 'observation-two'] })],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.findings.some(item => item.code === 'UNKNOWN'));
  });
  it('allows an UNKNOWN decision when evidence conflicts', () => {
    const other = observation({ id: 'observation-two', access: 'NO' });
    const result = auditHistory(history({
      observations: [observation(), other],
      decisions: [decision({ access: 'UNKNOWN', source: null, observationIds: ['observation-one', 'observation-two'] })],
    }));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.conflicts, 1);
  });
  it('allows explicit UNKNOWN without a fabricated source claim', () => {
    const result = auditHistory(history({
      observations: [observation({ access: 'UNKNOWN' })],
      decisions: [decision({ access: 'UNKNOWN', source: null })],
    }));
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('rejects a correction referencing itself', () => {
    blocked(history({
      observations: [observation(), extraObservation({ supersedes: 'observation-two' })],
      decisions: [decision({ observationIds: ['observation-one', 'observation-two'] })],
    }), 'ORDER');
  });
  it('accepts a correct supersession chain', () => {
    const corrected = extraObservation();
    const result = auditHistory(history({
      observations: [observation(), corrected],
      decisions: [decision({ observationIds: ['observation-one', 'observation-two'] })],
    }));
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('rejects a correction outside its original feature', () => {
    blocked(history({
      observations: [observation(), extraObservation({ feature: 'washroom' })],
      decisions: [decision({ observationIds: ['observation-one'] })],
    }), 'ORDER');
  });
  it('rejects a correction recorded before its ancestor', () => {
    blocked(history({
      observations: [observation(), extraObservation({ recordedOn: '2026-11-14' })],
      decisions: [decision({ observationIds: ['observation-one', 'observation-two'] })],
    }), 'ORDER');
  });
  it('rejects a withdrawal with known access state', () => {
    blocked(history({
      observations: [observation(), extraObservation({ kind: 'WITHDRAWN' })],
      decisions: [decision({ observationIds: ['observation-one', 'observation-two'] })],
    }), 'UNKNOWN');
  });
  it('accepts withdrawal that restores UNKNOWN', () => {
    const withdrawal = extraObservation({ kind: 'WITHDRAWN', access: 'UNKNOWN' });
    const result = auditHistory(history({
      observations: [observation(), withdrawal],
      decisions: [decision({ access: 'UNKNOWN', source: null, observationIds: ['observation-one', 'observation-two'] })],
    }));
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  it('rejects an event date in the future', () => {
    const events = clone(history().events);
    events[2].at = '2026-11-21';
    blocked(history({ events }), 'DATE');
  });
  it('rejects publication without a draft state', () => {
    blocked(history({ events: history().events.slice(1) }), 'ORDER');
  });
  it('rejects a declining event date', () => {
    const events = clone(history().events);
    events[1].at = '2026-11-14';
    blocked(history({ events }), 'ORDER');
  });
  it('rejects reversion from published to draft', () => {
    const events = [...history().events, { id: 'four', state: 'DRAFT', at: '2026-11-18', sourceDigest: ZERO_HASH, reason: reason() }];
    blocked(history({ events }), 'ORDER');
  });
  it('rejects invalid French event reasons', () => {
    const events = clone(history().events);
    events[0].reason.fr = 'Source : manquante';
    blocked(history({ events }), 'TYPOGRAPHY');
  });
  it('rejects a personal email in an observation reason', () => {
    blocked(changeObservation({ reason: reason({ en: 'contact@example.org' }) }), 'UNSAFE');
  });
});

describe('P15K immutable history comparison', () => {
  it('accepts identical snapshots', () => {
    assert.equal(compareHistory(history(), clone(history())).ok, true);
  });
  it('rejects an older publication date', () => {
    assert.ok(compareHistory(history(), history({ asOf: '2026-11-19' })).findings.some(item => item.code === 'ORDER'));
  });
  it('rejects silently removed observations', () => {
    const before = history();
    const after = history({ observations: [], decisions: [] });
    assert.ok(compareHistory(before, after).findings.some(item => item.code === 'REMOVAL'));
  });
  it('rejects silently changed source provenance', () => {
    const after = history({ observations: [observation({ source: source({ observedOn: '2026-11-14' }) })],
      decisions: [decision({ source: source({ observedOn: '2026-11-14' }) })] });
    assert.ok(compareHistory(history(), after).findings.some(item => item.code === 'DRIFT'));
  });
  it('rejects an unsupported source snapshot as input', () => {
    assert.equal(compareHistory(null, history()).ok, false);
  });
  it('retains structured bilingual findings', () => {
    const report = compareHistory(history(), history({ observations: [], decisions: [] }));
    assert.ok(report.findings.every(item => item.en && item.fr));
  });
});
