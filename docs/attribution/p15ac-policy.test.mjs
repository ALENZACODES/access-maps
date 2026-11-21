import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  REVIEW_LIMITS, OPEN_LICENCES, ACCESS, FEATURES, boundedSourceIndex,
  defaultReviewPolicy, frenchSpacing, isDate, isId, isRecord,
  isoDateWithin, normaliseReviewPolicy, reviewCopy, safeBilingual, safeCopy,
  selectLocale, sortId, sourceView, stableFindings, uniqueSorted, assessDate,
} from './p15ac-policy.mjs';
import { fictionalOntario, copy, source } from './p15v-fixtures.mjs';

const asOf = '2026-11-19';
const defaultPolicy = () => defaultReviewPolicy(asOf);
function outcome(changes = {}, date = asOf) {
  return normaliseReviewPolicy(defaultReviewPolicy(date, changes), date);
}

describe('P15AC: strict review-policy input', () => {
  it('accepts the documented defaults without mutation', () => {
    const value = defaultPolicy();
    const result = normaliseReviewPolicy(value, asOf);
    assert.equal(result.ok, true);
    assert.deepEqual(value.avoidFeatures, []);
    assert.equal(Object.isFrozen(result.value), true);
  });
  it('preserves requested settings without upgrading UNKNOWN', () => {
    const r = outcome({ allowUnknown: false, minimumTier: 3, includeReturn: false });
    assert.equal(r.ok, true);
    assert.equal(r.value.allowUnknown, false);
    assert.equal(r.value.minimumTier, 3);
    assert.equal(r.value.includeReturn, false);
  });
  it('requires a valid snapshot date', () => {
    assert.equal(normaliseReviewPolicy(defaultPolicy(), 'not-a-date').ok, false);
  });
  it('rejects a missing policy object', () => {
    assert.equal(normaliseReviewPolicy(null, asOf).ok, false);
  });
  it('rejects additional switches rather than silently accepting them', () => {
    assert.equal(outcome({ autoPublish: true }).ok, false);
  });
  it('requires the exact policy field set', () => {
    const policy = defaultPolicy();
    delete policy.includeReturn;
    assert.equal(normaliseReviewPolicy(policy, asOf).ok, false);
  });
  it('rejects policy-asOf mismatch', () => {
    assert.equal(normaliseReviewPolicy(defaultPolicy(), '2026-11-18').ok, false);
  });
  for (const silo of ['open', 'odbl']) {
    it(`accepts the ${silo} licence partition`, () => {
      assert.equal(outcome({ silo }).value.silo, silo);
    });
  }
  for (const silo of ['', null, 'both', 'UNKNOWN', 'private']) {
    it(`rejects unsupported partition ${String(silo)}`, () => {
      assert.equal(outcome({ silo }).ok, false);
    });
  }
  for (const days of [-1, 3651, 0.5, null, '90', Infinity]) {
    it(`rejects age window ${String(days)}`, () => {
      assert.equal(outcome({ maxAgeDays: days }).ok, false);
    });
  }
  for (const days of [0, 1, 30, 90, 365, 3650]) {
    it(`accepts supported age window ${days}`, () => {
      assert.equal(outcome({ maxAgeDays: days }).ok, true);
    });
  }
  for (const level of [0, 1, 2, 3]) {
    it(`accepts tier ${level}`, () => {
      assert.equal(outcome({ minimumTier: level }).value.minimumTier, level);
    });
  }
  for (const level of [-1, 4, 1.5, '2', null]) {
    it(`rejects tier ${String(level)}`, () => {
      assert.equal(outcome({ minimumTier: level }).ok, false);
    });
  }
  for (const flag of ['allowUnknown', 'requireIndependentSources', 'includeReturn']) {
    it(`does not accept nonboolean ${flag}`, () => {
      assert.equal(outcome({ [flag]: 1 }).ok, false);
    });
    it(`accepts explicit false for ${flag}`, () => {
      assert.equal(outcome({ [flag]: false }).ok, true);
    });
  }
  for (const metres of [0, -1, 1.1, 1_000_001, NaN, '100']) {
    it(`rejects distance bound ${String(metres)}`, () => {
      assert.equal(outcome({ maximumDistanceMetres: metres }).ok, false);
    });
  }
  for (const metres of [1, 100, 20000, 1000000]) {
    it(`accepts distance bound ${metres}`, () => {
      assert.equal(outcome({ maximumDistanceMetres: metres }).ok, true);
    });
  }
  for (const hops of [0, -1, 501, 2.5, null]) {
    it(`rejects hop bound ${String(hops)}`, () => {
      assert.equal(outcome({ maximumHops: hops }).ok, false);
    });
  }
  for (const count of [0, 6, 1.1, '3', NaN]) {
    it(`rejects alternative bound ${String(count)}`, () => {
      assert.equal(outcome({ alternatives: count }).ok, false);
    });
  }
  for (const count of [1, 2, 3, 4, 5]) {
    it(`accepts alternative bound ${count}`, () => {
      assert.equal(outcome({ alternatives: count }).ok, true);
    });
  }
  it('sorts excluded features into a stable order', () => {
    const p = outcome({ avoidFeatures: ['washroom', 'entrance'] });
    assert.deepEqual(p.value.avoidFeatures, ['entrance', 'washroom']);
  });
  it('rejects repeated feature exclusions', () => {
    assert.equal(outcome({ avoidFeatures: ['ramp', 'ramp'] }).ok, false);
  });
  it('rejects a feature not represented by the ontology', () => {
    assert.equal(outcome({ avoidFeatures: ['teleport'] }).ok, false);
  });
  it('rejects a nonarray feature list', () => {
    assert.equal(outcome({ avoidFeatures: 'lift' }).ok, false);
  });
  for (const limit of [0, -1, 12001, '100', 0.25]) {
    it(`rejects findings bound ${String(limit)}`, () => {
      assert.equal(outcome({ maxFindings: limit }).ok, false);
    });
  }
  it('gives every policy problem a bilingual diagnostic', () => {
    const result = outcome({ maxFindings: -1, minimumTier: 7 });
    assert.equal(result.ok, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.every((issue) => issue.en && issue.fr));
  });
});

describe('P15AC: text, data and date helpers', () => {
  it('defines a finite open-licence allowlist', () => {
    assert.ok(OPEN_LICENCES.includes('OGL-ON-1.0'));
    assert.ok(OPEN_LICENCES.includes('ODbL-1.0'));
    assert.equal(OPEN_LICENCES.includes('proprietary'), false);
  });
  it('uses literal UNKNOWN for unresolved access', () => {
    assert.deepEqual(ACCESS, ['YES', 'NO', 'UNKNOWN']);
    assert.equal(reviewCopy('fr').unknown, 'UNKNOWN');
  });
  it('defines bounded review limits', () => {
    assert.ok(REVIEW_LIMITS.sources > 0);
    assert.ok(REVIEW_LIMITS.maxFindings < 20000);
  });
  it('lists gradient and surface as distinct features', () => {
    assert.ok(FEATURES.includes('gradient'));
    assert.ok(FEATURES.includes('surface'));
  });
  for (const bad of ['', ' ', '<script>x</script>', 'javascript:alert(1)',
    'person@example.com', 'password:guess', 'a\nb', 'real-time', 'guaranteed']) {
    it(`rejects unsafe label ${JSON.stringify(bad)}`, () => {
      assert.equal(safeCopy(bad), false);
    });
  }
  for (const good of ['UNKNOWN', 'Lift not assessed', 'Observation from city source', 'Place A']) {
    it(`accepts bounded label ${good}`, () => {
      assert.equal(safeCopy(good), true);
    });
  }
  it('requires both languages', () => {
    assert.equal(safeBilingual({ en: 'Lift' }), false);
  });
  it('rejects unexpected text keys', () => {
    assert.equal(safeBilingual({ en: 'Lift', fr: 'Ascenseur', hidden: 'yes' }), false);
  });
  it('accepts bilingual source labels with typography', () => {
    assert.equal(safeBilingual({ en: 'Entry', fr: 'Entrée' }), true);
  });
  it('requires U+00A0 before colons, exclamation points and question marks', () => {
    for (const mark of [':', '!', '?']) {
      assert.equal(frenchSpacing(`Accès\u00a0${mark}`), true);
      for (const wrong of ['', ' ', '\u202f']) {
        assert.equal(frenchSpacing(`Accès${wrong}${mark}`), false);
      }
    }
  });
  it('requires U+202F before a semicolon', () => {
    assert.equal(frenchSpacing('Une source\u202f; une autre'), true);
    for (const wrong of ['', ' ', '\u00a0']) {
      assert.equal(frenchSpacing(`Une source${wrong}; une autre`), false);
    }
  });
  it('requires U+00A0 on both inner edges of guillemets', () => {
    assert.equal(frenchSpacing('«\u00a0accès\u00a0»'), true);
    for (const wrong of ['', ' ', '\u202f']) {
      assert.equal(frenchSpacing(`«${wrong}accès\u00a0»`), false);
      assert.equal(frenchSpacing(`«\u00a0accès${wrong}»`), false);
    }
  });
  it('uses curly French apostrophes', () => {
    assert.equal(frenchSpacing("l'accès"), false);
    assert.equal(frenchSpacing('l’accès'), true);
  });
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-01',
    '2026-11-19T00:00:00Z', 'UNKNOWN', null, 0]) {
    it(`rejects invalid observation date ${String(bad)}`, () => {
      assert.equal(isDate(bad), false);
    });
  }
  it('accepts an actual leap day', () => {
    assert.equal(isDate('2024-02-29'), true);
  });
  it('rejects impossible leap day', () => {
    assert.equal(isDate('2025-02-29'), false);
  });
  it('accepts inclusive retention boundary', () => {
    assert.equal(isoDateWithin('2026-11-01', '2026-11-19', 18), true);
  });
  it('rejects observation before window', () => {
    assert.equal(isoDateWithin('2026-11-01', '2026-11-19', 17), false);
  });
  it('rejects future observation', () => {
    assert.equal(isoDateWithin('2026-11-20', asOf, 90), false);
  });
  for (const id of ['a', 'source-1', 'osm_ontario', 'asset2']) {
    it(`accepts safe id ${id}`, () => {
      assert.equal(isId(id), true);
    });
  }
  for (const id of ['', 'UPPER', '../asset', '__', 'a b']) {
    it(`rejects unsafe id ${id}`, () => {
      assert.equal(isId(id), false);
    });
  }
  it('recognizes plain objects but not arrays', () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
  });
  it('maintains stable sorted ids', () => {
    assert.deepEqual(uniqueSorted(['z', 'a', 'z', 'b']), ['a', 'b', 'z']);
    assert.equal(sortId('a', 'b') < 0, true);
  });
  it('rejects unsupported locale', () => {
    assert.throws(() => selectLocale('de'), TypeError);
  });
  it('keeps copy keys equal across languages', () => {
    assert.deepEqual(Object.keys(reviewCopy('en')), Object.keys(reviewCopy('fr')));
  });
  it('supports stable bilingual text without policy claims', () => {
    for (const locale of ['en', 'fr']) {
      for (const value of Object.values(reviewCopy(locale))) assert.equal(safeCopy(value), true);
    }
  });
});

describe('P15AC: source chronology and licensing', () => {
  it('builds a catalogue from the merged Ontario fixtures', () => {
    const snapshot = fictionalOntario();
    const index = boundedSourceIndex(snapshot, defaultPolicy());
    assert.equal(index.size, 1);
    assert.equal(index.get('municipal').licence, 'OGL-ON-1.0');
  });
  it('blocks duplicate source identities', () => {
    const snapshot = fictionalOntario();
    snapshot.sources.push(copy(snapshot.sources[0]));
    assert.equal(boundedSourceIndex(snapshot, defaultPolicy()), null);
  });
  it('blocks a source outside the open licence allowlist', () => {
    const snapshot = fictionalOntario();
    snapshot.sources[0].licence = 'closed';
    assert.equal(boundedSourceIndex(snapshot, defaultPolicy()), null);
  });
  it('marks source beyond the age window as not current', () => {
    const record = source();
    const value = sourceView(record, '2026-11-19', 10);
    assert.equal(value.current, false);
  });
  it('keeps invalid source date unavailable', () => {
    assert.equal(sourceView({ ...source(), observedOn: 'UNKNOWN' }, asOf, 90), null);
  });
  it('does not count an older observation than its source', () => {
    const record = sourceView(source(), asOf, 90);
    assert.equal(assessDate('2026-10-31', record, defaultPolicy()), 'UNKNOWN');
  });
  it('accepts a dated observation after source publication', () => {
    const record = sourceView(source(), asOf, 90);
    assert.equal(assessDate('2026-11-02', record, defaultPolicy()), 'CURRENT');
  });
  it('rejects observation without source metadata', () => {
    assert.equal(assessDate('2026-11-02', null, defaultPolicy()), 'UNKNOWN');
  });
  it('rejects future source date as current', () => {
    const record = sourceView({ ...source(), observedOn: '2026-11-20' }, asOf, 90);
    assert.equal(record.current, false);
  });
  it('does not mutate the source fixture', () => {
    const snapshot = fictionalOntario();
    const before = structuredClone(snapshot);
    boundedSourceIndex(snapshot, defaultPolicy());
    assert.deepEqual(snapshot, before);
  });
  it('deduplicates report findings by complete identity', () => {
    const list = [{ code: 'A', path: 'x', en: 'a', fr: 'b' },
      { code: 'A', path: 'x', en: 'a', fr: 'b' }];
    assert.equal(stableFindings(list).length, 1);
  });
  it('returns null when the report exceeds its cap', () => {
    const list = [{ code: 'A', path: 'x', en: 'a', fr: 'b' },
      { code: 'A', path: 'y', en: 'a', fr: 'b' }];
    assert.equal(stableFindings(list, 1), null);
  });
});
