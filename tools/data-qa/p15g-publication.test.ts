import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditPublication, publicationText } from './p15g-publication.js';

type TestEvidence = { feature: string; access: string; sourceId: string; observedOn: string };
const sha = 'a'.repeat(64);
function valid() {
  return {
    schemaVersion: 1, asOf: '2026-11-16', maxAgeDays: 365,
    sources: [{ id: 'municipal', name: 'Municipal open data', licence: 'OGL-ON-1.0',
      observedOn: '2026-11-10', reference: 'sources/municipal.json' }],
    assets: [{ id: 'map', path: 'offline/map.pmtiles', sha256: sha, bytes: 1024,
      sourceIds: ['municipal'], silo: 'open' }],
    places: [{ id: 'library', en: 'Public library', fr: 'Bibliothèque publique',
      feature: 'entrance', access: 'UNKNOWN', sourceIds: ['municipal'], evidence: [] as TestEvidence[],
      assetIds: ['map'], targetPx: 44, silo: 'open' }],
  };
}
function fail(modifier: (item: ReturnType<typeof valid>) => void, code: string): void {
  const item = valid();
  modifier(item);
  const result = auditPublication(item);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result));
  for (const finding of result.findings) {
    assert.ok(finding.en.length > 0);
    assert.ok(finding.fr.length > 0);
  }
}

describe('P15G offline publication gate', () => {
  it('accepts fully attributed UNKNOWN place', () => {
    const result = auditPublication(valid());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.summary.unknown, 1);
    assert.equal(result.summary.asserted, 0);
  });
  it('returns stable bilingual text', () => {
    const report = auditPublication(valid());
    assert.match(publicationText(report, 'en'), /Check passed/);
    assert.match(publicationText(report, 'fr'), /Contrôle réussi/);
  });
  it('rejects a null root', () => {
    assert.ok(auditPublication(null).findings.some(f => f.code === 'ROOT'));
  });
  it('rejects missing records', () => {
    assert.ok(auditPublication({ schemaVersion: 1 }).findings.some(f => f.code === 'ROOT'));
  });
  it('rejects extra root keys', () => {
    assert.ok(auditPublication({ ...valid(), surprise: 1 }).findings.some(f => f.code === 'ROOT'));
  });
  it('rejects invalid report date', () => fail(x => { x.asOf = '2026-02-30'; }, 'DATE'));
  it('rejects negative maximum age', () => fail(x => { x.maxAgeDays = -1; }, 'DATE'));
  it('rejects future source dates', () => fail(x => { x.sources[0]!.observedOn = '2026-11-17'; }, 'STALE'));
  it('rejects stale source dates', () => fail(x => { x.sources[0]!.observedOn = '2025-01-01'; }, 'STALE'));
  it('accepts the age boundary', () => {
    const x = valid();
    x.maxAgeDays = 6;
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects missing licence', () => fail(x => { x.sources[0]!.licence = ''; }, 'LICENCE'));
  it('rejects proprietary licence', () => fail(x => { x.sources[0]!.licence = 'Proprietary'; }, 'LICENCE'));
  it('rejects held transport feed', () => fail(x => { x.sources[0]!.name = 'Mi-Way GTFS'; }, 'HELD'));
  it('rejects missing source name', () => fail(x => { x.sources[0]!.name = ''; }, 'SOURCE'));
  it('rejects missing source reference', () => fail(x => { x.sources[0]!.reference = ''; }, 'REFERENCE'));
  it('rejects remote source reference', () => fail(x => { x.sources[0]!.reference = 'https://example.org'; }, 'REFERENCE'));
  it('rejects source path traversal', () => fail(x => { x.sources[0]!.reference = '../private'; }, 'REFERENCE'));
  it('rejects duplicate source ids', () => fail(x => { x.sources.push({ ...x.sources[0]! }); }, 'DUPLICATE'));
  it('rejects duplicate place ids', () => fail(x => { x.places.push({ ...x.places[0]! }); }, 'DUPLICATE'));
  it('rejects duplicate asset ids', () => fail(x => { x.assets.push({ ...x.assets[0]! }); }, 'DUPLICATE'));
  it('rejects duplicate asset paths', () => fail(x => { x.assets.push({ ...x.assets[0]!, id: 'another' }); }, 'DUPLICATE'));
  it('rejects absent asset hash', () => fail(x => { x.assets[0]!.sha256 = ''; }, 'HASH'));
  it('rejects upper-case asset hash', () => fail(x => { x.assets[0]!.sha256 = 'A'.repeat(64); }, 'HASH'));
  it('rejects zero asset bytes', () => fail(x => { x.assets[0]!.bytes = 0; }, 'ASSET'));
  it('rejects unsafe asset path', () => fail(x => { x.assets[0]!.path = '../map.pmtiles'; }, 'LINK'));
  it('rejects remote asset path', () => fail(x => { x.assets[0]!.path = 'https://server/map'; }, 'LINK'));
  it('rejects source reference absent from assets', () => fail(x => { x.assets[0]!.sourceIds = ['missing']; }, 'ASSET_SOURCE'));
  it('rejects source reference absent from places', () => fail(x => { x.places[0]!.sourceIds = ['missing']; }, 'MISSING_SOURCE'));
  it('rejects an absent asset link', () => fail(x => { x.places[0]!.assetIds = ['missing']; }, 'ASSET_LINK'));
  it('rejects wrong asset silo for ODbL provenance', () => fail(x => {
    x.sources[0]!.licence = 'ODbL-1.0';
  }, 'ASSET_SILO'));
  it('rejects wrong place silo for ODbL provenance', () => fail(x => {
    x.sources[0]!.licence = 'ODbL-1.0';
  }, 'SILO'));
  it('accepts segregated ODbL assets and places', () => {
    const x = valid();
    x.sources[0]!.licence = 'ODbL-1.0';
    x.assets[0]!.silo = 'odbl';
    x.places[0]!.silo = 'odbl';
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects asset silo mismatch with place', () => fail(x => {
    x.places[0]!.silo = 'odbl';
  }, 'ASSET_SILO'));
  it('rejects control target smaller than 44', () => fail(x => { x.places[0]!.targetPx = 43; }, 'TARGET'));
  it('rejects non-finite control target', () => fail(x => { x.places[0]!.targetPx = Infinity; }, 'TARGET'));
  it('accepts a 44 px control', () => assert.equal(auditPublication(valid()).ok, true));
  it('rejects missing English text', () => fail(x => { x.places[0]!.en = ''; }, 'TRANSLATION'));
  it('rejects missing French text', () => fail(x => { x.places[0]!.fr = ''; }, 'TRANSLATION'));
  it('rejects script markup in either language', () => fail(x => { x.places[0]!.en = '<script>bad</script>'; }, 'CONTENT'));
  it('rejects email addresses in labels', () => fail(x => { x.places[0]!.en = 'a@example.org'; }, 'CONTENT'));
  it('rejects promotional certainty claims', () => fail(x => { x.places[0]!.en = 'Guaranteed access'; }, 'CONTENT'));
  it('rejects plain French apostrophe', () => fail(x => { x.places[0]!.fr = "L'entree"; }, 'PUNCTUATION'));
  it('accepts typographic French apostrophe', () => {
    const x = valid();
    x.places[0]!.fr = 'L’entrée';
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects French colon without nonbreaking space', () => fail(x => { x.places[0]!.fr = 'Lieu : entrée'; }, 'PUNCTUATION'));
  it('accepts French colon with nonbreaking space', () => {
    const x = valid(); x.places[0]!.fr = 'Lieu\u00a0: entrée';
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects French question punctuation', () => fail(x => { x.places[0]!.fr = 'Où ?'; }, 'PUNCTUATION'));
  it('accepts narrow nonbreaking space before punctuation', () => {
    const x = valid(); x.places[0]!.fr = 'Où\u202f?';
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects incorrect French guillemets', () => fail(x => { x.places[0]!.fr = '«Lieu»'; }, 'PUNCTUATION'));
  it('accepts French guillemets with correct spacing', () => {
    const x = valid(); x.places[0]!.fr = '«\u202fLieu\u202f»';
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects a known value without evidence', () => fail(x => { x.places[0]!.access = 'YES'; }, 'EVIDENCE'));
  it('does not change an unknown value from evidence alone', () => {
    const x = valid();
    x.places[0]!.evidence = [{ feature: 'entrance', access: 'YES',
      sourceId: 'municipal', observedOn: '2026-11-10' }];
    const report = auditPublication(x);
    assert.equal(report.ok, true);
    assert.equal(report.summary.unknown, 1);
  });
  it('accepts a known state when matching evidence is present', () => {
    const x = valid();
    x.places[0]!.access = 'YES';
    x.places[0]!.evidence = [{ feature: 'entrance', access: 'YES',
      sourceId: 'municipal', observedOn: '2026-11-10' }];
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects contradictory asserted states', () => fail(x => {
    x.places[0]!.access = 'YES';
    x.places[0]!.evidence = [
      { feature: 'entrance', access: 'YES', sourceId: 'municipal', observedOn: '2026-11-10' },
      { feature: 'entrance', access: 'NO', sourceId: 'municipal', observedOn: '2026-11-10' },
    ];
  }, 'CONFLICT'));
  it('accepts contradictory evidence with an UNKNOWN conclusion', () => {
    const x = valid();
    x.places[0]!.evidence = [
      { feature: 'entrance', access: 'YES', sourceId: 'municipal', observedOn: '2026-11-10' },
      { feature: 'entrance', access: 'NO', sourceId: 'municipal', observedOn: '2026-11-10' },
    ];
    assert.equal(auditPublication(x).ok, true);
  });
  it('rejects unrelated evidence feature', () => fail(x => {
    x.places[0]!.evidence = [{ feature: 'parking', access: 'YES',
      sourceId: 'municipal', observedOn: '2026-11-10' }];
  }, 'ORPHAN'));
  it('rejects an unknown evidence source', () => fail(x => {
    x.places[0]!.evidence = [{ feature: 'entrance', access: 'YES',
      sourceId: 'other', observedOn: '2026-11-10' }];
  }, 'MISSING_SOURCE'));
  it('rejects evidence preceding the source timestamp', () => fail(x => {
    x.places[0]!.evidence = [{ feature: 'entrance', access: 'YES',
      sourceId: 'municipal', observedOn: '2026-11-09' }];
  }, 'STALE'));
  it('rejects future evidence', () => fail(x => {
    x.places[0]!.evidence = [{ feature: 'entrance', access: 'YES',
      sourceId: 'municipal', observedOn: '2026-11-17' }];
  }, 'STALE'));
  it('rejects duplicate place asset references', () => fail(x => {
    x.places[0]!.assetIds.push('map');
  }, 'DUPLICATE'));
  it('rejects duplicate place source references', () => fail(x => {
    x.places[0]!.sourceIds.push('municipal');
  }, 'DUPLICATE'));
  it('rejects unexpected place fields', () => {
    const x = valid();
    assert.ok(auditPublication({ ...x, places: [{ ...x.places[0], predicted: 'YES' }] })
      .findings.some(f => f.code === 'PLACE'));
  });
  it('never mutates input records', () => {
    const x = valid();
    const before = JSON.stringify(x);
    auditPublication(x);
    assert.equal(JSON.stringify(x), before);
  });
  it('reports in deterministic order', () => {
    const x = valid();
    x.places[0]!.targetPx = 20;
    x.sources[0]!.licence = '';
    assert.deepEqual(auditPublication(x), auditPublication(x));
  });
});
