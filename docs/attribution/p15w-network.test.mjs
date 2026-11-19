import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LICENCES, ACCESS, FEATURES, KINDS, SILOS, LEVELS,
  record, identifier, strictKeys, localFile, calendarDay, safeCopy, frenchCopy,
  heldOperator, desiredSilo, auditNetwork, networkSummary, networkText,
} from './p15w-network.mjs';
import {
  sampleNetwork, sampleSource, sampleNode, sampleEdge, sampleAsset, observation,
  withNode, withEdge, clone, POSITIONS,
} from './p15w-fixtures.mjs';

const codes = report => report.findings.map(x => x.code);
const check = snapshot => auditNetwork(snapshot);
const fail = (snapshot, code) => {
  const result = check(snapshot);
  assert.equal(result.ok, false);
  assert.equal(result.network, null);
  assert.ok(codes(result).includes(code), `Expected ${code}: ${JSON.stringify(result.findings)}`);
};
const edit = (key, patch) => {
  const snapshot = sampleNetwork();
  Object.assign(snapshot[key][0], patch);
  return snapshot;
};

describe('P15W network shared helpers', () => {
  it('lists only accepted open source licences', () => {
    assert.ok(LICENCES.includes('OGL-ON-1.0'));
    assert.ok(LICENCES.includes('ODbL-1.0'));
    assert.ok(!LICENCES.includes('commercial-proprietary'));
  });
  it('preserves YES, NO and UNKNOWN distinctly', () => {
    assert.deepEqual(ACCESS, ['YES', 'NO', 'UNKNOWN']);
  });
  it('supports primary public-access feature classes', () => {
    assert.ok(FEATURES.includes('lift'));
    assert.ok(FEATURES.includes('crossing'));
    assert.ok(FEATURES.includes('entrance'));
  });
  it('supports stairs without assuming access', () => assert.ok(KINDS.includes('stair')));
  it('recognizes both licence export silos', () => assert.deepEqual(SILOS, ['open', 'odbl']));
  it('supports bounded evidence tiers', () => assert.deepEqual(LEVELS, [0, 1, 2, 3]));
  it('recognizes records rather than arrays', () => {
    assert.equal(record({}), true);
    assert.equal(record([]), false);
    assert.equal(record(null), false);
  });
  it('requires canonical identifiers', () => {
    assert.equal(identifier('toronto_entrance-2'), true);
    assert.equal(identifier('Uppercase'), false);
    assert.equal(identifier('a/../b'), false);
    assert.equal(identifier('a'.repeat(97)), false);
  });
  it('rejects missing or unexpected keys', () => {
    assert.equal(strictKeys({ a: 1, b: 2 }, ['a', 'b']), true);
    assert.equal(strictKeys({ a: 1 }, ['a', 'b']), false);
    assert.equal(strictKeys({ a: 1, b: 2 }, ['a']), false);
  });
  it('accepts nested safe local file paths', () => assert.equal(localFile('assets/maps/a.bin'), true));
  it('rejects absolute file paths', () => assert.equal(localFile('/etc/hosts'), false));
  it('rejects parent-relative paths', () => assert.equal(localFile('tiles/../private'), false));
  it('rejects ambiguous percent encoding', () => assert.equal(localFile('tiles/%2e%2e/file'), false));
  it('rejects URL fragments and query strings', () => {
    assert.equal(localFile('map.json#x'), false);
    assert.equal(localFile('map.json?x'), false);
  });
  it('rejects Windows-style paths', () => assert.equal(localFile('c:\\data\\x'), false));
  it('accepts leap-day dates in leap years', () => assert.ok(calendarDay('2024-02-29') !== null));
  it('rejects leap-day dates in non-leap years', () => assert.equal(calendarDay('2025-02-29'), null));
  it('rejects dates without leading zeros', () => assert.equal(calendarDay('2026-1-02'), null));
  it('rejects a month beyond December', () => assert.equal(calendarDay('2026-13-01'), null));
  it('rejects missing dates', () => assert.equal(calendarDay(null), null));
  it('rejects unsupported control characters in text', () => assert.equal(safeCopy('a\nb'), false));
  it('rejects HTML markup', () => assert.equal(safeCopy('<script>x</script>'), false));
  it('rejects contact information embedded in labels', () => assert.equal(safeCopy('a@b.ca'), false));
  it('requires natural apostrophes in French labels', () => assert.equal(frenchCopy("L'acces"), false));
  it('requires nonbreaking spacing before French colon', () => {
    assert.equal(frenchCopy('Note: fichier'), false);
    assert.equal(frenchCopy('Note\u00a0: fichier'), true);
  });
  it('requires narrow no-break spacing before French semicolon', () => {
    assert.equal(frenchCopy('Attention; conserver'), false);
    assert.equal(frenchCopy('Attention\u202f; conserver'), true);
  });
  it('requires narrow no-break spacing around French guillemets', () => {
    assert.equal(frenchCopy('« inaccessible »'), false);
    assert.equal(frenchCopy('«\u202finaccessible\u202f»'), true);
  });
  it('detects operator sources that must stay outside this export', () => {
    assert.equal(heldOperator('MiWay services'), true);
    assert.equal(heldOperator('Municipal sample'), false);
  });
  it('derives the open silo from normal attribution', () => {
    assert.equal(desiredSilo(['city'], new Map([['city', sampleSource()]])), 'open');
  });
  it('derives the separate ODbL silo from any ODbL source', () => {
    assert.equal(desiredSilo(['city', 'osm'], new Map([
      ['city', sampleSource()], ['osm', sampleSource('osm', 'ODbL-1.0')],
    ])), 'odbl');
  });
  it('returns null when a source ID cannot be resolved', () => {
    assert.equal(desiredSilo(['absent'], new Map()), null);
  });
});

describe('P15W network fail-closed intake', () => {
  it('accepts the small deterministic Ontario fixture', () => {
    const result = check(sampleNetwork());
    assert.equal(result.ok, true);
    assert.equal(result.findings.length, 0);
  });
  it('returns actual maps only for a complete passing audit', () => {
    const network = check(sampleNetwork()).network;
    assert.equal(network.nodes.size, 5);
    assert.equal(network.edges.size, 6);
    assert.equal(network.sources.size, 1);
  });
  it('counts known and unknown accessibility states', () => {
    const stats = networkSummary(check(sampleNetwork()).network);
    assert.equal(stats.sourceCount, 1);
    assert.equal(stats.nodeCount, 5);
    assert.equal(stats.edgeCount, 6);
    assert.deepEqual(stats.states, { YES: 11, NO: 0, UNKNOWN: 0 });
  });
  it('rejects null root', () => fail(null, 'ROOT'));
  it('rejects a missing source list', () => {
    const input = sampleNetwork();
    delete input.sources;
    fail(input, 'ROOT');
  });
  it('rejects an unexpected root property', () => fail({ ...sampleNetwork(), debug: true }, 'ROOT'));
  it('rejects schema version changes', () => fail({ ...sampleNetwork(), schemaVersion: 2 }, 'ROOT'));
  it('rejects dates that are not calendar dates', () => fail({ ...sampleNetwork(), asOf: '2026-02-30' }, 'DATE'));
  it('rejects a negative age window', () => fail({ ...sampleNetwork(), maxAgeDays: -1 }, 'DATE'));
  it('rejects excessive source records before allocation', () => {
    const network = sampleNetwork();
    network.sources = Array.from({ length: 5001 }, () => sampleSource());
    fail(network, 'LIMIT');
  });
  it('rejects unsupported source licences', () => fail(edit('sources', { licence: 'private' }), 'LICENCE'));
  it('rejects held operator records', () => fail(edit('sources', { name: 'MiWay operations' }), 'HELD'));
  it('rejects future-dated source records', () => fail(edit('sources', { observedOn: '2027-01-01' }), 'STALE'));
  it('rejects missing source paths', () => fail(edit('sources', { reference: '' }), 'PATH'));
  it('rejects unsafe source descriptions', () => fail(edit('sources', { en: '<script>x</script>' }), 'COPY'));
  it('rejects incorrectly spaced French source descriptions', () => fail(edit('sources', { fr: 'Données; locales' }), 'PUNCTUATION'));
  it('rejects duplicate source identifiers', () => {
    const network = sampleNetwork();
    network.sources.push(sampleSource());
    fail(network, 'DUPLICATE');
  });
  it('rejects a node outside the Ontario envelope', () => {
    fail(withNode(sampleNetwork(), 'alpha', { coordinate: { lat: 25, lon: -80 } }), 'NODE');
  });
  it('rejects a malformed node identifier', () => {
    fail(withNode(sampleNetwork(), 'alpha', { id: 'NOT VALID' }), 'NODE');
  });
  it('rejects a node with an unsupported access label', () => {
    fail(withNode(sampleNetwork(), 'alpha', { access: 'MAYBE' }), 'NODE');
  });
  it('rejects a node with unsupported tiers', () => {
    fail(withNode(sampleNetwork(), 'alpha', { tier: 100 }), 'NODE');
  });
  it('rejects missing evidence for a known node', () => {
    fail(withNode(sampleNetwork(), 'alpha', { evidence: [] }), 'EVIDENCE');
  });
  it('rejects contradictory access evidence for known node', () => {
    const source = sampleNetwork();
    source.nodes[0].evidence.push(observation('NO', 'entrance'));
    fail(source, 'CONFLICT');
  });
  it('allows an UNKNOWN node with no evidence and tier one', () => {
    const result = check(withNode(sampleNetwork(), 'alpha', { access: 'UNKNOWN',
      evidence: [], tier: 1 }));
    assert.equal(result.ok, true);
  });
  it('blocks a positive access state assigned tier zero', () => {
    fail(withNode(sampleNetwork(), 'alpha', { tier: 0 }), 'TIER');
  });
  it('blocks an unsupported tier-three claim', () => {
    fail(withNode(sampleNetwork(), 'alpha', { tier: 3 }), 'TIER');
  });
  it('rejects unknown source IDs on nodes', () => {
    fail(withNode(sampleNetwork(), 'alpha', { sourceIds: ['absent'] }), 'REFERENCE');
  });
  it('rejects evidence for an unrelated feature', () => {
    const source = sampleNetwork();
    source.nodes[0].evidence[0].feature = 'washroom';
    fail(source, 'EVIDENCE');
  });
  it('rejects duplicate node IDs', () => {
    const source = sampleNetwork();
    source.nodes.push(clone(source.nodes[0]));
    fail(source, 'DUPLICATE');
  });
  it('rejects missing edge endpoint', () => {
    fail(withEdge(sampleNetwork(), 'ab', { to: 'absent' }), 'REFERENCE');
  });
  it('rejects connection from node to itself', () => {
    fail(withEdge(sampleNetwork(), 'ab', { to: 'alpha' }), 'EDGE');
  });
  it('rejects impossible edge length metadata', () => {
    fail(withEdge(sampleNetwork(), 'ab', { lengthMetres: -12 }), 'EDGE');
  });
  it('rejects a path geometry disconnected from its endpoints', () => {
    fail(withEdge(sampleNetwork(), 'ab', { geometry: [POSITIONS.charlie, POSITIONS.delta] }), 'GEOMETRY');
  });
  it('rejects a path with only one coordinate', () => {
    fail(withEdge(sampleNetwork(), 'ab', { geometry: [POSITIONS.alpha] }), 'GEOMETRY');
  });
  it('rejects a missing edge label', () => fail(withEdge(sampleNetwork(), 'ab', { fr: '' }), 'COPY'));
  it('rejects unknown edge source IDs', () => fail(withEdge(sampleNetwork(), 'ab', { sourceIds: ['none'] }), 'REFERENCE'));
  it('rejects duplicate edge IDs', () => {
    const source = sampleNetwork();
    source.edges.push(clone(source.edges[0]));
    fail(source, 'DUPLICATE');
  });
  it('rejects a source boundary crossing in a regular export', () => {
    const source = sampleNetwork();
    source.sources.push(sampleSource('osm', 'ODbL-1.0'));
    source.edges[0].sourceIds = ['city', 'osm'];
    source.edges[0].evidence.push(observation('YES', 'path', 'osm'));
    fail(source, 'SILO');
  });
  it('rejects a malformed asset hash', () => fail(edit('assets', { sha256: 'abc' }), 'HASH'));
  it('rejects a non-local asset path', () => fail(edit('assets', { path: '../file' }), 'PATH'));
  it('rejects zero-sized assets', () => fail(edit('assets', { bytes: 0 }), 'ASSET'));
  it('rejects duplicate asset paths', () => {
    const source = sampleNetwork();
    source.assets.push({ ...sampleAsset('other'), path: source.assets[0].path });
    fail(source, 'DUPLICATE');
  });
  it('rejects missing asset source references', () => fail(edit('assets', { sourceIds: ['none'] }), 'REFERENCE'));
  it('returns the full findings list in English', () => {
    const report = check({ ...sampleNetwork(), schemaVersion: 3 });
    assert.match(networkText(report, 'en'), /Route blocked/);
  });
  it('returns bilingual diagnostics without changing status', () => {
    const report = check({ ...sampleNetwork(), schemaVersion: 3 });
    assert.match(networkText(report, 'fr'), /Parcours bloqué/);
    assert.ok(report.findings.every(x => x.en.length && x.fr.length));
  });
  it('rejects an unsupported report language', () => {
    assert.equal(networkText(check(sampleNetwork()), 'es'), null);
  });
  it('uses the narrow no-break space in French conflict diagnostics', () => {
    const source = sampleNetwork();
    source.nodes[0].evidence.push(observation('NO', 'entrance'));
    const result = check(source);
    assert.ok(result.findings.some(x => x.code === 'CONFLICT' && x.fr.includes('\u202f;')));
  });
  it('does not expose a partial network on any failure', () => {
    const source = sampleNetwork();
    source.assets[0].path = '../escape';
    assert.equal(check(source).network, null);
  });
});
