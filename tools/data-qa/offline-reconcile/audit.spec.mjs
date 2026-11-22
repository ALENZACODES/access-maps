import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { audit, finding, finish, projection } from './audit.mjs';
import { base, blocks, allows, clone, known, odbl, corrected, withdrawn,
  secondFeature, secondSource, issue, source, observation, decision } from './fixtures.mjs';

describe('fail-closed root inventory', () => {
  for (const input of [null, false, [], '', {}, { schemaVersion: 1 }, { ...base(), schemaVersion: 3 }]) {
    it(`blocks invalid root ${JSON.stringify(input).slice(0, 40)}`, () => blocks(input, 'ROOT'));
  }
  it('allows zero sources and observations with no assertions', () => {
    const input = base();
    input.sources = []; input.observations = []; input.decisions = [];
    allows(input);
  });
  it('blocks over declared source limit', () => {
    const input = base(); input.policy.maxSources = 0; blocks(input, 'LIMIT');
  });
  it('blocks over declared observation limit', () => {
    const input = base(); input.policy.maxObservations = 0; blocks(input, 'LIMIT');
  });
  it('blocks over declared decision limit', () => {
    const input = base(); input.policy.maxObservations = 0; blocks(input, 'LIMIT');
  });
  it('totals do not infer access', () => {
    const result = allows(base());
    assert.equal(result.totals.unknown, 1);
    assert.equal(result.totals.conflicts, 0);
  });
  it('totals report distinct features', () => {
    const result = allows(secondFeature(base(), 'parking'));
    assert.equal(result.totals.distinctFeatures, 2);
  });
  it('has deterministic finding order', () => {
    const input = base(); input.sources[0].licence = 'private';
    assert.deepEqual(audit(input), audit(input));
  });
  it('every finding includes EN and FR', () => {
    const result = blocks({ ...base(), schemaVersion: 2 }, 'ROOT');
    for (const item of result.findings) {
      assert.ok(item.en.length > 5);
      assert.ok(item.fr.length > 5);
    }
  });
  it('fail-closed projection returns no records for invalid inventory', () => {
    const input = base(); input.sources[0].licence = 'private';
    const result = projection(input);
    assert.equal(result.ok, false);
    assert.deepEqual(result.records, []);
  });
  it('success projection retains original UNKNOWN', () => {
    const result = projection(base());
    assert.equal(result.ok, true);
    assert.equal(result.records[0].state, 'UNKNOWN');
  });
  it('success projection retains dated provenance', () => {
    const result = projection(base());
    assert.equal(result.records[0].sources[0].observedOn, '2026-11-10');
    assert.equal(result.records[0].sources[0].licence, 'OGL-ON-1.0');
  });
});

describe('source and licence gate', () => {
  for (const licence of ['private', '', 'ODbL', 'CC-BY-NC-4.0', null]) {
    it(`blocks closed or unrecorded licence ${String(licence)}`, () => {
      const input = base(); input.sources[0].licence = licence;
      blocks(input, 'SOURCE');
    });
  }
  for (const name of ['MiWay GTFS', 'Mi-Way stop data', 'miway-export']) {
    it(`blocks held feed ${name}`, () => {
      const input = base(); input.sources[0].name = name;
      blocks(input, 'SOURCE');
    });
  }
  it('blocks a missing source identifier', () => {
    const input = base(); delete input.sources[0].id;
    blocks(input, 'SOURCE');
  });
  it('blocks a remote licence reference', () => {
    const input = base(); input.sources[0].reference = 'https://other.example/data';
    blocks(input, 'SOURCE');
  });
  it('blocks source path traversal', () => {
    const input = base(); input.sources[0].reference = '../outside';
    blocks(input, 'SOURCE');
  });
  it('blocks source observation dates in the future', () => {
    const input = base(); input.sources[0].observedOn = '2026-11-21';
    blocks(input, 'STALE');
  });
  it('blocks source observation dates outside max age', () => {
    const input = base(); input.sources[0].observedOn = '2026-10-01';
    blocks(input, 'STALE');
  });
  it('accepts source on exact maximum age boundary', () => {
    const input = base(); input.sources[0].observedOn = '2026-10-21';
    allows(input);
  });
  it('blocks invalid calendar date even if lexically well formed', () => {
    const input = base(); input.sources[0].observedOn = '2026-02-30';
    blocks(input, 'SOURCE');
  });
  it('blocks duplicate source identifiers', () => {
    const input = base(); input.sources.push(clone(input.sources[0]));
    blocks(input, 'DUPLICATE');
  });
  it('keeps a distinct unused source as informational', () => {
    const input = secondSource(base());
    const result = allows(input);
    assert.equal(result.findings[0].severity, 'NOTICE');
  });
  it('cannot silently mix ODbL into open decisions', () => {
    const input = base(); input.sources[0].licence = 'ODbL-1.0';
    blocks(input, 'SILO');
  });
  it('blocks mixed source lineage in either export silo', () => {
    const input = secondSource(odbl());
    const extra = input.sources[1].id;
    input.observations[0].sourceIds.push(extra);
    input.decisions[0].sourceIds.push(extra);
    for (const silo of ['open', 'odbl']) {
      input.decisions[0].silo = silo;
      blocks(input, 'SILO');
      assert.deepEqual(projection(input).records, []);
    }
  });
  it('accepts explicit ODbL silo', () => allows(odbl()));
  it('blocks ODbL-labeled decision without ODbL sources', () => {
    const input = base(); input.decisions[0].silo = 'odbl';
    blocks(input, 'SILO');
  });
  it('preserves source licence across projection', () => {
    const result = projection(odbl());
    assert.equal(result.records[0].sources[0].licence, 'ODbL-1.0');
  });
});

describe('observation schema and chronology', () => {
  it('rejects unknown feature categories', () => {
    const input = base(); input.observations[0].feature = 'diagnosis';
    blocks(input, 'OBSERVATION');
  });
  it('rejects unsupported state claims', () => {
    const input = base(); input.observations[0].state = 'PROBABLY';
    blocks(input, 'OBSERVATION');
  });
  it('rejects missing French observations', () => {
    const input = base(); input.observations[0].noteFr = '';
    blocks(input, 'OBSERVATION');
  });
  it('rejects personal email addresses', () => {
    const input = base(); input.observations[0].noteEn = 'A person@example.org wrote this';
    blocks(input, 'OBSERVATION');
  });
  it('rejects scripting markup in notes', () => {
    const input = base(); input.observations[0].noteFr = '<script>alert(1)</script>';
    blocks(input, 'OBSERVATION');
  });
  it('rejects unknown source references', () => {
    const input = base(); input.observations[0].sourceIds = ['missing'];
    blocks(input, 'SOURCE_LINK');
  });
  it('rejects observation before its source date', () => {
    const input = base(); input.observations[0].observedOn = '2026-11-09';
    blocks(input, 'HISTORY');
  });
  it('accepts observation on source date', () => {
    const input = base(); input.observations[0].observedOn = '2026-11-10';
    allows(input);
  });
  it('rejects future observation', () => {
    const input = base(); input.observations[0].observedOn = '2026-11-22';
    blocks(input, 'STALE');
  });
  it('rejects expired observation', () => {
    const input = base(); input.observations[0].observedOn = '2026-10-01';
    blocks(input, 'STALE');
  });
  it('rejects invalid observation date', () => {
    const input = base(); input.observations[0].observedOn = '2026-02-30';
    blocks(input, 'OBSERVATION');
  });
  it('rejects duplicate observation identifiers', () => {
    const input = base(); input.observations.push(clone(observation));
    blocks(input, 'DUPLICATE');
  });
  it('blocks an orphan observation with no decision', () => {
    const input = base(); input.decisions = [];
    blocks(input, 'ORPHAN');
  });
  it('blocks an unsupported known observation without sources', () => {
    const input = known('YES'); input.observations[0].sourceIds = [];
    blocks(input, 'ASSERT');
  });
  it('keeps unsourced observations UNKNOWN and blocks publication', () => {
    const input = base(); input.observations[0].sourceIds = [];
    input.decisions[0].sourceIds = [];
    const result = blocks(input, 'RECORD_SOURCE');
    assert.equal(result.totals.unknown, 1);
  });
  it('does not convert UNKNOWN to YES', () => {
    const result = allows(base());
    assert.equal(result.totals.unknown, 1);
  });
});

describe('revision history', () => {
  it('allows a dated correction with a matching feature', () => allows(corrected(known('YES'), 'NO')));
  it('allows a withdrawal of recorded status', () => allows(withdrawn(known('YES'))));
  it('blocks a correction without supersedes', () => {
    const input = base(); input.observations[0].kind = 'CORRECT';
    blocks(input, 'CORRECTION');
  });
  it('blocks a withdrawal without supersedes', () => {
    const input = base(); input.observations[0].kind = 'WITHDRAW';
    blocks(input, 'WITHDRAW');
  });
  it('blocks a withdrawal that asserts YES', () => {
    const input = known('YES'); input.observations[0].kind = 'WITHDRAW';
    blocks(input, 'WITHDRAW');
  });
  it('blocks a correction referencing an absent observation', () => {
    const input = corrected(known('YES'));
    input.observations[1].supersedes = 'missing';
    blocks(input, 'HISTORY');
  });
  it('blocks a self-referential revision', () => {
    const input = corrected(known('YES'));
    input.observations[1].supersedes = 'obs-b';
    blocks(input, 'HISTORY');
  });
  it('blocks revision histories that move backward', () => {
    const input = corrected(known('YES'));
    input.observations[1].observedOn = '2026-11-11';
    input.observations[0].observedOn = '2026-11-12';
    blocks(input, 'HISTORY');
  });
  it('blocks revision across different features', () => {
    const input = corrected(known('YES'));
    input.observations[1].feature = 'washroom';
    blocks(input, 'HISTORY');
  });
  it('blocks a cycle of two revisions', () => {
    const input = corrected(known('YES'));
    input.observations[0].supersedes = 'obs-b';
    blocks(input, 'HISTORY');
  });
  it('blocks a new observation that claims to supersede another without correction action', () => {
    const input = corrected(known('YES'));
    input.observations[1].kind = 'OBSERVE';
    blocks(input, 'HISTORY');
  });
});

describe('conflicting evidence and decisions', () => {
  it('accepts YES supported by matching current evidence', () => allows(known('YES')));
  it('accepts NO supported by matching current evidence', () => allows(known('NO')));
  it('rejects YES without supporting observation', () => {
    const input = base(); input.decisions[0].state = 'YES';
    blocks(input, 'ASSERT');
  });
  it('rejects NO when only UNKNOWN is observed', () => {
    const input = base(); input.decisions[0].state = 'NO';
    blocks(input, 'ASSERT');
  });
  it('rejects UNKNOWN when a single current YES observation exists', () => {
    const input = known('YES'); input.decisions[0].state = 'UNKNOWN';
    blocks(input, 'ASSERT');
  });
  it('rejects duplicate decision for same feature', () => {
    const input = base(); input.decisions.push(clone(decision));
    blocks(input, 'DUPLICATE');
  });
  it('blocks a decision citing missing observation', () => {
    const input = base(); input.decisions[0].observationIds = ['none'];
    blocks(input, 'OBS_LINK');
  });
  it('blocks a decision omitting an observation', () => {
    const input = corrected(known('YES'));
    input.decisions[0].observationIds = ['obs-a'];
    blocks(input, 'OBS_LINK');
  });
  it('blocks decision that drops required source', () => {
    const input = known('YES'); input.decisions[0].sourceIds = [];
    blocks(input, 'DEC_SOURCES');
  });
  it('blocks decision citing absent source', () => {
    const input = base(); input.decisions[0].sourceIds.push('not-found');
    blocks(input, 'DEC_SOURCES');
  });
  it('allows a publication with two independent features', () => allows(secondFeature(base(), 'parking')));
  it('blocks a decision whose feature is unknown', () => {
    const input = base(); input.decisions[0].feature = 'unknown-feature';
    blocks(input, 'DECISION');
  });
  it('blocks a known state that lacks observations', () => {
    const input = base(); input.observations = []; input.decisions[0].state = 'YES';
    blocks(input, 'ASSERT');
  });
  it('requires a traceable source even for an empty UNKNOWN decision', () => {
    const input = base(); input.observations = [];
    input.decisions[0] = { ...decision, sourceIds: [], observationIds: [] };
    blocks(input, 'RECORD_SOURCE');
  });
  it('reports a conflict as UNKNOWN if both YES and NO survive', () => {
    const input = known('YES');
    input.observations.push({ ...clone(input.observations[0]), id: 'obs-conflict', state: 'NO' });
    input.decisions[0].state = 'UNKNOWN';
    input.decisions[0].observationIds.push('obs-conflict');
    const result = allows(input);
    assert.equal(result.totals.conflicts, 1);
  });
  it('blocks a known state when both YES and NO survive', () => {
    const input = known('YES');
    input.observations.push({ ...clone(input.observations[0]), id: 'obs-conflict', state: 'NO' });
    input.decisions[0].observationIds.push('obs-conflict');
    blocks(input, 'CONFLICT');
  });
  it('does not confuse a superseded YES with an active conflict', () => allows(corrected(known('YES'), 'NO')));
  it('does not treat withdrawn evidence as known', () => allows(withdrawn(known('YES'))));
});

describe('finding report stability', () => {
  it('report has Boolean ok', () => assert.equal(typeof audit(base()).ok, 'boolean'));
  it('finding paths retain source indices', () => {
    const input = base(); input.sources[0].licence = '';
    assert.ok(blocks(input, 'SOURCE').findings.some(f => /sources\[0\]/.test(f.path)));
  });
  it('findings preserve error severity', () => {
    const result = finish([finding('SOURCE', '$.sources[0]')], {});
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].severity, 'ERROR');
  });
  it('notice-only results remain nonblocking', () => {
    const result = finish([finding('UNREFERENCED', 'source-x', 'NOTICE')], {});
    assert.equal(result.ok, true);
  });
  it('sorts findings by location deterministically', () => {
    const result = finish([finding('SOURCE', 'z'), finding('SOURCE', 'a')], {});
    assert.deepEqual(result.findings.map(f => f.path), ['a','z']);
  });
  it('throws on missing dictionary finding code', () => assert.throws(() => finding('MISSING', '$')));
  it('does not mutate input while checking', () => {
    const input = base(); const old = clone(input);
    audit(input);
    assert.deepEqual(input, old);
  });
  it('does not mutate input while projecting', () => {
    const input = base(); const old = clone(input);
    projection(input);
    assert.deepEqual(input, old);
  });
  it('unknown and known inventory values remain distinct', () => {
    const input = secondFeature(base(), 'parking', 'YES');
    const result = projection(input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map(d => d.state).sort(), ['UNKNOWN', 'YES']);
  });
});

describe('recorded source provenance', () => {
  it('reports the missing fields in a legacy source and preserves its UNKNOWN state', () => {
    const input = base();
    delete input.sources[0].retrievedOn;
    delete input.sources[0].tier;
    const result = audit(input);
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings.filter(item => ['RETRIEVAL_DATE', 'SOURCE_TIER'].includes(item.code))
      .map(item => item.path).sort(), ['$.sources[0].retrievedOn', '$.sources[0].tier']);
    assert.equal(input.observations[0].state, 'UNKNOWN');
    assert.equal(Object.hasOwn(input.sources[0], 'tier'), false);
  });

  it('requires an explicitly recorded integer tier and a real calendar retrieval date', () => {
    const input = base();
    for (const tier of [0, 1, 2, 3, 4]) {
      input.sources[0].tier = tier;
      assert.equal(audit(input).ok, true);
    }
    for (const tier of [-1, 5, 1.5, '0', 'UNKNOWN', null]) {
      input.sources[0].tier = tier;
      assert.ok(audit(input).findings.some(item => item.code === 'SOURCE_TIER'));
    }
    input.sources[0].tier = 0;
    for (const retrievedOn of ['2026-02-30', '2026-11-09', '2026-11-21', 'UNKNOWN']) {
      input.sources[0].retrievedOn = retrievedOn;
      assert.ok(audit(input).findings.some(item => item.path === '$.sources[0].retrievedOn'));
    }
  });
});

it('returns the recorded retrieval date and tier with each publication decision', () => {
  const input = base();
  const projected = projection(input).records[0];
  assert.equal(projected.state, 'UNKNOWN');
  assert.equal(projected.sources[0].retrievedOn, '2026-11-12');
  assert.equal(projected.sources[0].tier, 0);
  delete input.sources[0].retrievedOn;
  assert.deepEqual(projection(input).records, []);
});
