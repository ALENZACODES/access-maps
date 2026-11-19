import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fictionalOntario, request, copy, evidence } from './p15v-fixtures.mjs';
import { french } from './p15v-ontario-model.mjs';
import {
  evidenceNotice, parseEvidencePolicy, classifyObservations,
  explainWaypointJourney, evidenceExplanationText,
} from './p15y-route-evidence.mjs';

function policy(overrides = {}) {
  return {
    minimumTier: 1, maximumAgeDays: 45, asOf: '2026-11-19',
    includeUnknown: true, includeBarriers: true, maximumNotes: 1000,
    minimumIndependentSources: 1, ...overrides,
  };
}
function waypoints(overrides = {}) {
  return {
    ...request(), via: ['b'], avoidNodes: [], requiredFeatures: [],
    maxCandidates: 48, maxUnknownSegments: 12, ...overrides,
  };
}
function explanation(snapshot = fictionalOntario(), q = waypoints(), p = policy()) {
  return explainWaypointJourney(snapshot, q, p);
}
function observations(access = 'YES', tier = 2) {
  return [evidence('path', access, 'municipal', tier)];
}
function sources() {
  return fictionalOntario().sources;
}

describe('P15Y evidence policy validation', () => {
  it('accepts an explicit bounded policy', () => {
    const result = parseEvidencePolicy(policy());
    assert.equal(result.ok, true);
    assert.equal(result.value.minimumTier, 1);
    assert.equal(Object.isFrozen(result.value), true);
  });

  for (const value of [null, undefined, [], false, 123, '']) {
    it(`blocks an invalid root policy ${String(value)}`, () => {
      const result = parseEvidencePolicy(value);
      assert.equal(result.ok, false);
      assert.equal(result.value, null);
      assert.ok(result.issues.some((item) => item.code === 'ROOT'));
    });
  }

  it('requires every explicit policy setting', () => {
    for (const key of Object.keys(policy())) {
      const candidate = policy();
      delete candidate[key];
      assert.equal(parseEvidencePolicy(candidate).ok, false, `Missing ${key}`);
    }
  });

  it('rejects arbitrary policy extensions', () => {
    assert.equal(parseEvidencePolicy({ ...policy(), remoteRequest: 'anything' }).ok, false);
  });

  for (const invalid of [-1, 4, 1.5, NaN, Infinity, undefined, '2']) {
    it(`rejects invalid minimum tier ${String(invalid)}`, () => {
      const result = parseEvidencePolicy(policy({ minimumTier: invalid }));
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((issue) => issue.code === 'TIER'));
    });
  }

  for (const invalid of [-1, 3651, 1.5, NaN, Infinity, null, '45']) {
    it(`rejects invalid age window ${String(invalid)}`, () => {
      const result = parseEvidencePolicy(policy({ maximumAgeDays: invalid }));
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((issue) => issue.code === 'AGE'));
    });
  }

  for (const invalid of ['2026-02-30', '2026-13-01', '2026-00-01',
    '2026-11-00', '2026/11/19', '', null, 123]) {
    it(`rejects invalid review date ${String(invalid)}`, () => {
      assert.equal(parseEvidencePolicy(policy({ asOf: invalid })).ok, false);
    });
  }

  for (const invalid of [-1, 0, 1.5, NaN, Infinity, 10001, '10']) {
    it(`rejects invalid note cap ${String(invalid)}`, () => {
      assert.equal(parseEvidencePolicy(policy({ maximumNotes: invalid })).ok, false);
    });
  }

  for (const invalid of [-1, 11, 1.5, NaN, Infinity, '1']) {
    it(`rejects invalid source independence threshold ${String(invalid)}`, () => {
      assert.equal(parseEvidencePolicy(policy({ minimumIndependentSources: invalid })).ok, false);
    });
  }

  it('requires a Boolean uncertainty policy', () => {
    for (const bad of [0, 1, 'true', null, undefined]) {
      assert.equal(parseEvidencePolicy(policy({ includeUnknown: bad })).ok, false);
    }
  });

  it('requires a Boolean barrier reporting policy', () => {
    for (const bad of [0, 1, 'false', null, undefined]) {
      assert.equal(parseEvidencePolicy(policy({ includeBarriers: bad })).ok, false);
    }
  });

  it('returns bilingual immutable notices', () => {
    const issue = evidenceNotice('CONFLICT', 'edges.ab');
    assert.equal(issue.path, 'edges.ab');
    assert.match(issue.en, /disagree/);
    assert.match(issue.fr, /\u202f;/u);
    assert.equal(Object.isFrozen(issue), true);
  });
});

describe('P15Y dated evidence classification', () => {
  it('classifies a supported affirmative observation', () => {
    const result = classifyObservations(observations(), sources(), 'YES', policy(), 'edges.ab');
    assert.equal(result.state, 'YES');
    assert.equal(result.independentSources, 1);
  });

  it('classifies a supported negative observation', () => {
    const result = classifyObservations(observations('NO'), sources(), 'NO', policy(), 'edges.ab');
    assert.equal(result.state, 'NO');
    assert.ok(result.issues.some((issue) => issue.code === 'ACCESS'));
  });

  it('keeps missing observations UNKNOWN', () => {
    const result = classifyObservations([], sources(), 'UNKNOWN', policy(), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
  });

  it('does not promote UNKNOWN when the supporting source is missing', () => {
    const result = classifyObservations(observations(), [], 'YES', policy(), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
    assert.ok(result.issues.some((issue) => issue.code === 'REF'));
  });

  it('treats conflicting observations as UNKNOWN', () => {
    const facts = [...observations('YES'), ...observations('NO')];
    const result = classifyObservations(facts, sources(), 'UNKNOWN', policy(), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
    assert.ok(result.issues.some((issue) => issue.code === 'CONFLICT'));
  });

  it('does not allow contradictory evidence to assert YES', () => {
    const facts = [...observations('YES'), ...observations('NO')];
    assert.equal(classifyObservations(facts, sources(), 'YES', policy(), 'edges.ab').state, 'UNKNOWN');
  });

  it('does not allow contradictory evidence to assert NO', () => {
    const facts = [...observations('YES'), ...observations('NO')];
    assert.equal(classifyObservations(facts, sources(), 'NO', policy(), 'edges.ab').state, 'UNKNOWN');
  });

  it('does not claim support when the only source predates the review window', () => {
    const result = classifyObservations(observations(), sources(), 'YES',
      policy({ asOf: '2027-02-19', maximumAgeDays: 30 }), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
    assert.ok(result.issues.some((issue) => issue.code === 'AGE'));
  });

  it('does not claim support from future observations', () => {
    const facts = [{ ...observations()[0], observedOn: '2026-11-20' }];
    const result = classifyObservations(facts, sources(), 'YES', policy(), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
  });

  it('does not claim support from evidence preceding its source', () => {
    const facts = [{ ...observations()[0], observedOn: '2026-10-01' }];
    const result = classifyObservations(facts, sources(), 'YES', policy(), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
  });

  it('does not silently raise low-tier evidence', () => {
    const result = classifyObservations(observations('YES', 1), sources(), 'YES',
      policy({ minimumTier: 2 }), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
    assert.ok(result.issues.some((issue) => issue.code === 'TIER'));
  });

  it('does not treat duplicate observations as independent sources', () => {
    const facts = [...observations(), ...observations()];
    const result = classifyObservations(facts, sources(), 'YES',
      policy({ minimumIndependentSources: 2 }), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
    assert.equal(result.independentSources, 1);
  });

  it('requires independent source IDs for a higher threshold', () => {
    const sourceB = { ...sources()[0], id: 'survey', observedOn: '2026-11-01' };
    const facts = [...observations(), { ...observations()[0], sourceId: 'survey' }];
    const result = classifyObservations(facts, [...sources(), sourceB], 'YES',
      policy({ minimumIndependentSources: 2 }), 'edges.ab');
    assert.equal(result.state, 'YES');
    assert.equal(result.independentSources, 2);
  });

  it('prevents inconsistent claimed access from being promoted', () => {
    const result = classifyObservations(observations('YES'), sources(), 'NO', policy(), 'edges.ab');
    assert.equal(result.state, 'UNKNOWN');
  });

  it('reports missing usable evidence explicitly', () => {
    const result = classifyObservations([], sources(), 'YES', policy(), 'edges.ab');
    assert.ok(result.issues.some((issue) => issue.code === 'UNKNOWN'));
  });
});

describe('P15Y route-level explanation', () => {
  it('creates a supported decision for a complete fictional network', () => {
    const report = explanation();
    assert.equal(report.status, 'found');
    assert.ok(report.decisions.length);
    assert.ok(report.decisions[0].sections.length);
  });

  it('keeps every section linked to a real edge ID', () => {
    const snapshot = fictionalOntario();
    const report = explanation(snapshot);
    const edges = new Set(snapshot.edges.map((item) => item.id));
    for (const choice of report.decisions) {
      for (const section of choice.sections) assert.ok(edges.has(section.edgeId));
    }
  });

  it('keeps per-section source citations', () => {
    const report = explanation();
    for (const decision of report.decisions) {
      for (const section of decision.sections) assert.ok(section.sourceIds.includes('municipal'));
    }
  });

  it('never describes missing support as positive', () => {
    const snapshot = fictionalOntario();
    for (const edge of snapshot.edges) {
      edge.access = 'UNKNOWN'; edge.tier = 1; edge.evidence = [];
    }
    const report = explanation(snapshot, waypoints({ allowUnknown: true }));
    assert.equal(report.status, 'conditional');
    assert.ok(report.decisions.every((item) => item.status === 'UNKNOWN'));
  });

  it('cannot route around a missing source by changing policy', () => {
    const snapshot = fictionalOntario();
    snapshot.sources = [];
    assert.equal(explanation(snapshot).status, 'blocked');
  });

  it('propagates malformed route requests without emitting decisions', () => {
    const report = explanation(fictionalOntario(), waypoints({ via: ['nonexistent'] }));
    assert.equal(report.status, 'invalid');
    assert.deepEqual(report.decisions, []);
  });

  it('rejects invalid source policy without running route planning', () => {
    const report = explanation(fictionalOntario(), waypoints(), { minimumTier: 99 });
    assert.equal(report.status, 'blocked');
    assert.deepEqual(report.decisions, []);
  });

  it('withholds decisions when notes exceed bounded limits', () => {
    const snapshot = fictionalOntario();
    for (const edge of snapshot.edges) {
      edge.access = 'UNKNOWN'; edge.tier = 1; edge.evidence = [];
    }
    const report = explanation(snapshot, waypoints({ allowUnknown: true }),
      policy({ maximumNotes: 1 }));
    assert.equal(report.status, 'blocked');
    assert.deepEqual(report.decisions, []);
  });

  it('omits conditional decisions when policy disallows UNKNOWN', () => {
    const snapshot = fictionalOntario();
    for (const edge of snapshot.edges) {
      edge.access = 'UNKNOWN'; edge.tier = 1; edge.evidence = [];
    }
    const report = explanation(snapshot, waypoints({ allowUnknown: true }),
      policy({ includeUnknown: false }));
    assert.equal(report.status, 'absent');
    assert.deepEqual(report.decisions, []);
  });

  it('does not add fictitious traversal-time estimates', () => {
    const report = explanation();
    for (const decision of report.decisions) {
      assert.equal(Object.hasOwn(decision, 'minutes'), false);
      assert.equal(Object.hasOwn(decision, 'arrivalTime'), false);
    }
  });

  it('does not edit the supplied network snapshot', () => {
    const snapshot = fictionalOntario();
    const previous = copy(snapshot);
    explanation(snapshot);
    assert.deepEqual(snapshot, previous);
  });

  it('does not edit the supplied policy', () => {
    const p = policy();
    const previous = copy(p);
    explanation(fictionalOntario(), waypoints(), p);
    assert.deepEqual(p, previous);
  });

  it('outputs deterministic explanations', () => {
    assert.deepEqual(explanation(), explanation());
  });

  it('provides an English summary without unsupported guarantees', () => {
    const text = evidenceExplanationText(explanation(), 'en');
    assert.match(text, /Route/);
    assert.match(text, /Sources/);
    assert.ok(text.endsWith('\n'));
  });

  it('provides proper French narrow and regular nonbreaking spaces', () => {
    const text = evidenceExplanationText(explanation(), 'fr');
    assert.match(text, /Parcours/);
    assert.match(text, /\u00a0:/u);
    assert.equal(french(text), true);
  });

  it('keeps UNKNOWN literal in French copy for conditional routes', () => {
    const snapshot = fictionalOntario();
    for (const edge of snapshot.edges) {
      edge.access = 'UNKNOWN'; edge.tier = 1; edge.evidence = [];
    }
    const report = explanation(snapshot, waypoints({ allowUnknown: true }));
    assert.match(evidenceExplanationText(report, 'fr'), /UNKNOWN/);
  });

  it('rejects unsupported locales instead of guessing translations', () => {
    assert.throws(() => evidenceExplanationText(explanation(), 'de'), TypeError);
  });

  it('keeps each route decision immutable at top level', () => {
    const report = explanation();
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.decisions), true);
    assert.equal(Object.isFrozen(report.decisions[0]), true);
  });

  it('keeps the total metres from the underlying graph', () => {
    const report = explanation();
    const decision = report.decisions[0];
    assert.equal(decision.metres, decision.sections.reduce((sum, section) => sum + section.metres, 0));
  });

  it('counts all route sections without inventing additional legs', () => {
    const report = explanation();
    for (const decision of report.decisions) {
      assert.equal(decision.totalSegments, decision.sections.length);
      assert.equal(decision.supported + decision.unknown + decision.barriers, decision.totalSegments);
    }
  });
});
