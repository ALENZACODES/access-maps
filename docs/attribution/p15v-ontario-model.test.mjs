import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS_VALUES, FEATURE_VALUES, ONTARIO_LICENCES, SOURCE_TYPES,
  allFacts, byteHash, dayNumber, diagnostic, factIds, french, localPath,
  orderIssues, parseOntarioSnapshot, textIssues,
} from './p15v-ontario-model.mjs';
import { asset, copy, edge, evidence, fictionalOntario, node, place,
  secondLicenceGroup, source } from './p15v-fixtures.mjs';

function errorWith(change) {
  const fixture = fictionalOntario();
  change(fixture);
  return parseOntarioSnapshot(fixture);
}
function fails(change, code) {
  const outcome = errorWith(change);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.snapshot, null);
  assert.ok(outcome.issues.some((item) => item.code === code),
    `Expected ${code}; actual: ${outcome.issues.map((item) => item.code).join(', ')}`);
}
function passes(change) {
  const outcome = errorWith(change);
  assert.equal(outcome.ok, true, JSON.stringify(outcome.issues));
  return outcome.snapshot;
}

const base = fictionalOntario();
const EXPECTED_FACTS = 2 + 4 + 5;

describe('P15V basic ontology and strict local validation', () => {
  it('has a complete fictional starter fixture', () => {
    const report = parseOntarioSnapshot(fictionalOntario());
    assert.equal(report.ok, true, JSON.stringify(report.issues));
    assert.equal(report.snapshot.places.length, 2);
    assert.equal(report.snapshot.nodes.length, 4);
    assert.equal(report.snapshot.edges.length, 5);
  });
  it('does not return a partial snapshot for malformed roots', () => {
    for (const bad of [null, undefined, [], {}, 0, '', '[]', true]) {
      const report = parseOntarioSnapshot(bad);
      assert.equal(report.ok, false);
      assert.equal(report.snapshot, null);
    }
  });
  it('contains canonical access choices', () => {
    assert.deepEqual(ACCESS_VALUES, ['YES', 'NO', 'UNKNOWN']);
  });
  it('includes Ontario open-source licence identifiers', () => {
    assert.ok(ONTARIO_LICENCES.includes('OGL-ON-1.0'));
    assert.ok(ONTARIO_LICENCES.includes('ODbL-1.0'));
    assert.equal(ONTARIO_LICENCES.includes('private'), false);
  });
  it('includes routing and accessibility feature groups', () => {
    for (const item of ['entrance', 'lift', 'washroom', 'crossing', 'ramp', 'outage']) {
      assert.ok(FEATURE_VALUES.includes(item));
    }
  });
  it('retains explicit source categories', () => {
    assert.ok(SOURCE_TYPES.includes('municipal'));
    assert.ok(SOURCE_TYPES.includes('open-map'));
  });
  it('orders fact IDs deterministically', () => {
    const snapshot = passes(() => {});
    assert.equal(factIds(snapshot).length, EXPECTED_FACTS);
    assert.deepEqual(factIds(snapshot), [...factIds(snapshot)].sort());
  });
  it('leaves supplied input intact', () => {
    const fixture = fictionalOntario();
    const text = JSON.stringify(fixture);
    parseOntarioSnapshot(fixture);
    assert.equal(JSON.stringify(fixture), text);
  });
  it('clones accepted snapshot from input', () => {
    const fixture = fictionalOntario();
    const parsed = parseOntarioSnapshot(fixture);
    fixture.nodes[0].name.en = 'Modified after parse';
    assert.notEqual(parsed.snapshot.nodes[0].name.en, fixture.nodes[0].name.en);
  });
  it('sorts issue lists by path then code', () => {
    const list = [diagnostic('NODE', 'z'), diagnostic('SOURCE', 'a'), diagnostic('DATE', 'a')];
    assert.deepEqual(orderIssues(list).map((issue) => issue.code), ['DATE', 'SOURCE', 'NODE']);
  });
  it('formats English diagnostics', () => {
    const report = errorWith((value) => { value.version = 99; });
    assert.match(textIssues(report, 'en'), /Snapshot blocked/u);
  });
  it('formats French diagnostics', () => {
    const report = errorWith((value) => { value.version = 99; });
    assert.match(textIssues(report, 'fr'), /Données bloquées/u);
  });
  it('includes U+202F before French semicolons', () => {
    assert.ok(diagnostic('CONFLICT', 'p').fr.includes('\u202f;'));
  });
  it('reports success in two languages', () => {
    const report = parseOntarioSnapshot(fictionalOntario());
    assert.match(textIssues(report, 'en'), /Check passed/u);
    assert.match(textIssues(report, 'fr'), /Contrôle réussi/u);
  });
  it('rejects unknown locale for display', () => {
    assert.throws(() => textIssues(parseOntarioSnapshot(fictionalOntario()), 'de'), TypeError);
  });
  it('lists all places, nodes, and edges', () => {
    const snapshot = passes(() => {});
    assert.equal(allFacts(snapshot).length, EXPECTED_FACTS);
  });
  it('computes a known local digest', () => {
    assert.equal(byteHash(new TextEncoder().encode('abc')),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('rejects non-byte input for digest computation', () => {
    assert.throws(() => byteHash('abc'), TypeError);
  });
});

describe('P15V calendar semantics', () => {
  for (const accepted of ['2024-02-29', '2000-02-29', '2026-11-19',
    '0001-01-01', '1999-12-31', '2020-02-29']) {
    it(`accepts exact calendar day ${accepted}`, () => {
      assert.equal(typeof dayNumber(accepted), 'number');
    });
  }
  for (const rejected of ['2026-02-29', '1900-02-29', '2026-13-01',
    '2026-00-01', '2026-11-31', '2026-11-00', '2026-1-01',
    '2026-11-1', '2026-11-19T00:00:00Z', 'yesterday', '', null, 1]) {
    it(`rejects malformed calendar input ${String(rejected)}`, () => {
      assert.equal(dayNumber(rejected), null);
    });
  }
  it('orders consecutive dates without locale assumptions', () => {
    assert.equal(dayNumber('2026-11-19') - dayNumber('2026-11-18'), 1);
  });
  it('handles the leap-day transition', () => {
    assert.equal(dayNumber('2024-03-01') - dayNumber('2024-02-29'), 1);
  });
});

describe('P15V bilingual punctuation and safe paths', () => {
  for (const value of ['Entrée', 'Porte\u00a0: entrée', 'Attention\u202f!',
    'Oui\u202f; non', '«\u202fAccès\u202f»', 'La rampe et le trottoir']) {
    it(`accepts French typography ${value}`, () => assert.equal(french(value), true));
  }
  for (const value of ['Porte: entrée', 'Attention!', 'Oui; non',
    '«Accès»', "l'acces", 'Que faire?', 'Allô !', 'Non ;']) {
    it(`rejects French typography ${value}`, () => assert.equal(french(value), false));
  }
  for (const value of ['offline/map.json', 'sources/city.json',
    'a/b/c', 'assets/route-2026.ndjson']) {
    it(`accepts local reference ${value}`, () => assert.equal(localPath(value), true));
  }
  for (const value of ['/etc/shadow', '../escape', 'a/../b', './file',
    'a//b', 'https://site.test/path', 'a\\b', 'a#b', 'a?b',
    'a%b', '', '.hidden/file', 'a/.hidden', 'a/ b', 'a\u0000b']) {
    it(`rejects unsafe local reference ${JSON.stringify(value)}`, () => {
      assert.equal(localPath(value), false);
    });
  }
});

describe('P15V root bounds and date rules', () => {
  it('blocks an unexpected root field', () => fails((x) => { x.extra = 1; }, 'ROOT'));
  it('blocks wrong version', () => fails((x) => { x.version = 2; }, 'ROOT'));
  it('blocks a missing collection', () => fails((x) => { delete x.nodes; }, 'ROOT'));
  it('blocks a missing date', () => fails((x) => { x.asOf = null; }, 'DATE'));
  it('blocks an invalid day', () => fails((x) => { x.asOf = '2026-02-29'; }, 'DATE'));
  it('blocks negative age', () => fails((x) => { x.maxAgeDays = -1; }, 'DATE'));
  it('blocks fractional age', () => fails((x) => { x.maxAgeDays = 1.5; }, 'DATE'));
  it('blocks unbounded age', () => fails((x) => { x.maxAgeDays = 3651; }, 'DATE'));
  it('supports a valid longer retention window', () => {
    passes((x) => { x.maxAgeDays = 200; });
  });
  it('supports an empty but complete snapshot', () => {
    passes((x) => { x.sources = []; x.places = []; x.nodes = []; x.edges = []; x.assets = []; });
  });
  it('rejects unbounded places', () => {
    fails((x) => { x.places = Array.from({ length: 20001 }, () => null); }, 'LIMIT');
  });
  it('rejects unbounded edges', () => {
    fails((x) => { x.edges = Array.from({ length: 60001 }, () => null); }, 'LIMIT');
  });
});

describe('P15V source licence and provenance policy', () => {
  it('accepts a second open municipal source', () => {
    passes((x) => { x.sources.push(source('county')); });
  });
  it('accepts a separate open-map licence group', () => {
    passes((x) => Object.assign(x, secondLicenceGroup(x)));
  });
  it('blocks duplicate source IDs', () => {
    fails((x) => { x.sources.push(copy(x.sources[0])); }, 'DUPLICATE');
  });
  it('blocks closed source licence', () => {
    fails((x) => { x.sources[0].licence = 'private'; }, 'LICENCE');
  });
  it('blocks ODbL in the open export group', () => {
    fails((x) => { x.sources[0].licence = 'ODbL-1.0'; }, 'SILO');
  });
  it('blocks a future source date', () => {
    fails((x) => { x.sources[0].observedOn = '2026-11-20'; }, 'TIME');
  });
  it('blocks source observation outside window', () => {
    fails((x) => { x.sources[0].observedOn = '2025-01-01'; }, 'TIME');
  });
  it('blocks missing English source description', () => {
    fails((x) => { x.sources[0].name.en = ''; }, 'SOURCE');
  });
  it('blocks missing French source description', () => {
    fails((x) => { x.sources[0].name.fr = ''; }, 'SOURCE');
  });
  it('blocks HTML-like source labels', () => {
    fails((x) => { x.sources[0].name.en = '<script>alert(1)</script>'; }, 'SOURCE');
  });
  it('blocks embedded personal contact details', () => {
    fails((x) => { x.sources[0].name.en = 'help@example.test'; }, 'SOURCE');
  });
  it('blocks an unsupported kind', () => {
    fails((x) => { x.sources[0].kind = 'unspecified'; }, 'SOURCE');
  });
  it('blocks missing local reference', () => {
    fails((x) => { x.sources[0].reference = '../other.json'; }, 'SOURCE');
  });
  it('blocks held operator source text', () => {
    fails((x) => { x.sources[0].name.en = 'MiWay feed'; }, 'HELD');
  });
  it('allows references with nested paths', () => {
    passes((x) => { x.sources[0].reference = 'licences/ontario/municipal.json'; });
  });
  it('blocks surplus source metadata', () => {
    fails((x) => { x.sources[0].provisional = true; }, 'SOURCE');
  });
});

describe('P15V actual graph consistency', () => {
  it('rejects missing place-node relationship', () => {
    fails((x) => { x.places[0].nodeIds = ['a']; }, 'REF');
  });
  it('rejects nonexisting place from node', () => {
    fails((x) => { x.nodes[0].placeId = 'absent'; }, 'REF');
  });
  it('rejects edge referencing absent endpoint', () => {
    fails((x) => { x.edges[0].to = 'missing'; }, 'REF');
  });
  it('rejects edge loop', () => {
    fails((x) => { x.edges[0].to = 'a'; }, 'LOOP');
  });
  it('rejects unsupported edge direction', () => {
    fails((x) => { x.edges[0].direction = 'reverse'; }, 'DIRECTION');
  });
  it('rejects invalid distance', () => {
    fails((x) => { x.edges[0].metres = -1; }, 'EDGE');
  });
  it('rejects implausibly long segment', () => {
    fails((x) => { x.edges[0].metres = 200001; }, 'EDGE');
  });
  it('rejects infinite distance', () => {
    fails((x) => { x.edges[0].metres = Infinity; }, 'EDGE');
  });
  it('rejects longitude outside Ontario bounds', () => {
    fails((x) => { x.nodes[0].lon = -100; }, 'NODE');
  });
  it('rejects latitude outside Ontario bounds', () => {
    fails((x) => { x.nodes[0].lat = 80; }, 'NODE');
  });
  it('rejects missing node latitude', () => {
    fails((x) => { delete x.nodes[0].lat; }, 'NODE');
  });
  it('accepts directed forward segment', () => {
    passes((x) => { x.edges[0].direction = 'forward'; });
  });
  it('blocks missing linked source', () => {
    fails((x) => { x.edges[0].sourceIds = ['missing']; }, 'REF');
  });
  it('blocks duplicated source reference', () => {
    fails((x) => { x.edges[0].sourceIds.push('municipal'); }, 'EDGE');
  });
  it('blocks two places with the same ID', () => {
    fails((x) => { x.places[1].id = 'library'; }, 'DUPLICATE');
  });
  it('blocks two nodes with the same ID', () => {
    fails((x) => { x.nodes[1].id = 'a'; }, 'DUPLICATE');
  });
  it('blocks two edges with the same ID', () => {
    fails((x) => { x.edges[1].id = 'ab'; }, 'DUPLICATE');
  });
  it('blocks missing French node name', () => {
    fails((x) => { x.nodes[0].name.fr = ''; }, 'NODE');
  });
  it('blocks malformed French place punctuation', () => {
    fails((x) => { x.places[0].name.fr = 'Accès: oui'; }, 'PLACE');
  });
  it('accepts a new isolated supported node with place reference', () => {
    passes((x) => {
      x.places[1].nodeIds.push('e');
      x.nodes.push(node('e', 'market', 43.755, -79.445));
    });
  });
});

describe('P15V evidence and tier honesty', () => {
  it('rejects asserted access without observations', () => {
    fails((x) => { x.edges[0].evidence = []; }, 'ASSERTION');
  });
  it('rejects conflicting observations with a positive claim', () => {
    fails((x) => { x.edges[0].evidence.push(evidence('path', 'NO')); }, 'CONFLICT');
  });
  it('allows UNKNOWN when observations conflict', () => {
    passes((x) => {
      x.edges[0].access = 'UNKNOWN';
      x.edges[0].tier = 1;
      x.edges[0].evidence.push(evidence('path', 'NO'));
    });
  });
  it('rejects asserted access with tier zero', () => {
    fails((x) => { x.edges[0].tier = 0; }, 'TIER');
  });
  it('rejects tier one positive access', () => {
    fails((x) => { x.edges[0].tier = 1; }, 'TIER');
  });
  it('rejects tier three without two independent sources', () => {
    fails((x) => { x.edges[0].tier = 3; x.edges[0].evidence[0].tier = 3; }, 'TIER');
  });
  it('accepts tier three from two dated source records', () => {
    passes((x) => {
      x.sources.push(source('county'));
      x.edges[0].tier = 3;
      x.edges[0].sourceIds.push('county');
      x.edges[0].evidence = [evidence('path', 'YES', 'municipal', 3),
        evidence('path', 'YES', 'county', 3)];
    });
  });
  it('rejects evidence source not in declared sourceIds', () => {
    fails((x) => {
      x.sources.push(source('county'));
      x.edges[0].evidence[0].sourceId = 'county';
    }, 'REF');
  });
  it('rejects evidence feature mismatching record', () => {
    fails((x) => { x.edges[0].evidence[0].feature = 'washroom'; }, 'EVIDENCE');
  });
  it('rejects future evidence', () => {
    fails((x) => { x.edges[0].evidence[0].observedOn = '2026-11-20'; }, 'TIME');
  });
  it('rejects evidence predating its cited source', () => {
    fails((x) => { x.edges[0].evidence[0].observedOn = '2026-10-30'; }, 'TIME');
  });
  it('rejects malformed evidence tier', () => {
    fails((x) => { x.edges[0].evidence[0].tier = 7; }, 'EVIDENCE');
  });
  it('rejects unsupported access choice', () => {
    fails((x) => { x.edges[0].access = 'MAYBE'; }, 'EDGE');
  });
  it('accepts UNKNOWN access without a fabricated observation', () => {
    passes((x) => { x.edges[0].access = 'UNKNOWN'; x.edges[0].tier = 1;
      x.edges[0].evidence = []; });
  });
});

describe('P15V offline asset provenance', () => {
  it('accepts another distinct asset', () => {
    passes((x) => { x.assets.push(asset('sidecar')); });
  });
  it('rejects duplicate asset identifiers', () => {
    fails((x) => { x.assets.push(asset()); }, 'DUPLICATE');
  });
  it('rejects duplicate asset paths', () => {
    fails((x) => { x.assets.push({ ...asset('sidecar'), path: x.assets[0].path }); }, 'DUPLICATE');
  });
  it('rejects an absent digest', () => {
    fails((x) => { x.assets[0].sha256 = ''; }, 'ASSET');
  });
  it('rejects non-hex digest', () => {
    fails((x) => { x.assets[0].sha256 = 'g'.repeat(64); }, 'ASSET');
  });
  it('rejects a zero-byte asset', () => {
    fails((x) => { x.assets[0].bytes = 0; }, 'ASSET');
  });
  it('rejects asset greater than 32 MiB', () => {
    fails((x) => { x.assets[0].bytes = 32 * 1024 * 1024 + 1; }, 'ASSET');
  });
  it('rejects an absolute asset path', () => {
    fails((x) => { x.assets[0].path = '/offline/map.json'; }, 'ASSET');
  });
  it('rejects a missing asset source reference', () => {
    fails((x) => { x.assets[0].sourceIds = ['missing']; }, 'REF');
  });
  it('rejects cross-silo asset references', () => {
    fails((x) => { x.assets[0].silo = 'odbl'; }, 'SILO');
  });
});
