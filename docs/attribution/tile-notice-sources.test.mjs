// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesField, concat, makeVectorTile, numberField, textField, varint } from './tile-notice-fixture.mjs';
import {
  joinTileSources, parseSourceRegistry, parseTileSources, readSourceRegistry, TileSourceError,
} from './tile-notice-sources.mjs';

/** @param {Uint8Array[]} parts */
const layer = (...parts) => bytesField(3, concat(textField(1, 'entries'), ...parts, numberField(15, 2)));
/** @param {Uint8Array[]} parts */
const feature = (...parts) => bytesField(2, concat(...parts));
/** @param {string} text */
const stringValue = text => bytesField(4, textField(1, text));
/** @param {number[]} indices */
const packed = (...indices) => bytesField(2, concat(...indices.map(varint)));
/** @param {import('./tile-notice-sources.mjs').ErrorCode} code @param {number|null} [row] */
function errorWith(code, row = null) {
  return (/** @type {unknown} */ error) =>
    error instanceof TileSourceError && error.code === code && error.row === row;
}

test('counts each feature in its own layer, including features without a source', () => {
  const tile = makeVectorTile([
    {name: 'paths', features: [{source_id: 'b'}, {source_id: 'a'}, {}, {source_id: 'b'}]},
    {name: 'entries', features: [{source_id: 'a'}, {source_id: 'b'}]},
    {name: 'outlines', features: []},
  ]);
  const found = parseTileSources(tile);
  assert.deepEqual(found.layers, ['entries', 'outlines', 'paths']);
  assert.equal(found.featureCount, 6);
  assert.deepEqual(found.groups, [
    {layer: 'entries', sourceId: 'a', count: 1},
    {layer: 'entries', sourceId: 'b', count: 1},
    {layer: 'paths', sourceId: 'UNKNOWN', count: 1},
    {layer: 'paths', sourceId: 'a', count: 1},
    {layer: 'paths', sourceId: 'b', count: 2},
  ]);
});

test('an existing tile can have no layers or just an empty layer', () => {
  assert.deepEqual(parseTileSources(new Uint8Array()), {layers: [], groups: [], featureCount: 0});
  assert.deepEqual(parseTileSources(layer()), {layers: ['entries'], groups: [], featureCount: 0});
});

test('dictionary entries alone do not create a source occurrence', () => {
  const body = layer(
    feature(packed(1, 0, 0, 1)),
    textField(3, 'source_id'), textField(3, 'name'),
    stringValue('in-name'), stringValue('referenced'), stringValue('unused'),
  );
  assert.deepEqual(parseTileSources(body).groups, [{layer: 'entries', sourceId: 'referenced', count: 1}]);
});

test('supports dictionaries after features and tags split across packed and unpacked fields', () => {
  const split = feature(numberField(2, 1), packed(1, 0), numberField(2, 0));
  const body = layer(split, textField(3, 'source_id'), textField(3, 'other'), stringValue('x'), stringValue('y'));
  assert.equal(parseTileSources(body).groups[0]?.sourceId, 'x');
});

test('a feature with contradictory source tags has unknown attribution', () => {
  const tile = layer(textField(3, 'source_id'), textField(3, 'source_id'),
    stringValue('a'), stringValue('b'), feature(packed(0, 0, 1, 1, 0, 0)), feature(packed(1, 0, 0, 0)));
  assert.deepEqual(parseTileSources(tile).groups.map(row => [row.sourceId, row.count]), [['UNKNOWN', 1], ['a', 1]]);
});

test('interprets only a string as a source ID and never guesses from other properties', () => {
  const tile = makeVectorTile([{ name: 'points', features: [
    {source_id: false}, {source_id: 0}, {source_id: ''}, {source_id: '  '},
    {source_id: 'UNKNOWN'}, {source_id: 'control\ncode'}, {name: 's-1'}, {source_id: 'X'.repeat(1025)},
  ] }]);
  assert.deepEqual(parseTileSources(tile).groups, [{layer: 'points', sourceId: 'UNKNOWN', count: 8}]);
});

test('unreadable and ambiguous value messages cannot claim an identity', () => {
  const notText = bytesField(4, bytesField(1, Uint8Array.of(0xf0, 0x80, 0x80)));
  const mixed = bytesField(4, concat(textField(1, 'a'), numberField(7, 1)));
  const repeated = bytesField(4, concat(textField(1, 'a'), textField(1, 'b')));
  const noValue = bytesField(4, numberField(19, 1));
  const tile = layer(textField(3, 'source_id'), notText, mixed, repeated, noValue,
    ...[0, 1, 2, 3].map(index => feature(packed(0, index))));
  assert.equal(parseTileSources(tile).groups[0]?.count, 4);
  assert.equal(parseTileSources(tile).groups[0]?.sourceId, 'UNKNOWN');
});

test('Unicode source IDs compare exactly, including whitespace and normalization form', () => {
  const ids = ['É', 'E\u0301', 'É ', ' É', '__proto__', 'constructor'];
  const model = parseTileSources(makeVectorTile([{name: 'points', features: ids.map(source_id => ({source_id}))}]));
  assert.deepEqual(model.groups.map(row => row.sourceId), [...ids].sort());
});

test('ignores unrelated fields of all wire types and large integer feature IDs', () => {
  const largeInteger = Uint8Array.of(8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1);
  const extensions = concat(varint(11 * 8 + 1), new Uint8Array(8),
    varint(19 * 8 + 5), new Uint8Array(4), varint(20 * 8 + 3),
    varint(21 * 8 + 3), numberField(90, 5), varint(21 * 8 + 4), varint(20 * 8 + 4));
  const tile = concat(extensions, layer(textField(3, 'source_id'), stringValue('local'),
    feature(largeInteger, extensions, packed(0, 0), bytesField(4, Uint8Array.of(9, 2, 2)))), extensions);
  assert.deepEqual(parseTileSources(tile).groups, [{layer: 'entries', sourceId: 'local', count: 1}]);
});

test('honours the offset of a typed-array view and ignores data outside the tile', () => {
  const bytes = makeVectorTile([{name: 'only', features: [{source_id: 'one'}]}]);
  const padded = concat(Uint8Array.of(255, 255), bytes, Uint8Array.of(255));
  assert.deepEqual(parseTileSources(padded.subarray(2, -1)), parseTileSources(bytes));
});

test('rejects unpaired tags and dictionary indices outside the layer', () => {
  const key = textField(3, 'source_id');
  const value = stringValue('a');
  for (const invalid of [packed(0), packed(2, 0), packed(0, 1), packed(1, 9), bytesField(2, Uint8Array.of(0x80))]) {
    assert.throws(() => parseTileSources(layer(key, value, feature(invalid))), errorWith('tile-format'));
  }
  assert.throws(() => parseTileSources(layer(key, feature(packed(0, 0)))), errorWith('tile-format'));
});

test('rejects incomplete messages, illegal keys and varints overflowing their domain', () => {
  for (const bytes of [
    Uint8Array.of(0), Uint8Array.of(26, 20, 0), Uint8Array.of(255, 255, 255, 255, 127),
    Uint8Array.of(8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 2),
    Uint8Array.of(21, 1, 2), Uint8Array.of(14, 0), Uint8Array.of(11, 20), Uint8Array.of(11),
    Uint8Array.of(26, 1, 0), numberField(3, 0),
    layer(numberField(2, 1)), layer(feature(Uint8Array.of(21, 0, 0, 0, 0))),
  ]) {
    assert.throws(() => parseTileSources(bytes), errorWith('tile-format'));
  }
});

test('deeper nested extensions stop at the declared parsing limit', () => {
  assert.throws(() => parseTileSources(new Uint8Array(17).fill(11)), errorWith('tile-limit'));
});

test('accepts supported layer versions and rejects missing, duplicate or unreadable layer identities', () => {
  assert.deepEqual(parseTileSources(bytesField(3, concat(numberField(15, 1), textField(1, 'p')))).layers, ['p']);
  for (const bad of [
    bytesField(3, textField(1, 'a')), bytesField(3, numberField(15, 2)),
    layer(textField(1, 'second')), layer(numberField(15, 1)), concat(layer(), layer()),
    bytesField(3, concat(numberField(15, 3), textField(1, 'p'))),
    bytesField(3, concat(numberField(15, 2), bytesField(1, Uint8Array.of(254)))),
  ]) {
    assert.throws(() => parseTileSources(bad), errorWith('tile-format'));
  }
});

test('rejects oversized tiles, excessively long layer names and too many layers', () => {
  assert.throws(() => parseTileSources(new Uint8Array(16 * 1024 * 1024 + 1)), errorWith('tile-limit'));
  assert.throws(() => parseTileSources(makeVectorTile([{name: 'a'.repeat(257), features: []}])), errorWith('tile-limit'));
  const layers = Array.from({length: 257}, (_, i) => ({name: String(i), features: []}));
  assert.throws(() => parseTileSources(makeVectorTile(layers)), errorWith('tile-limit'));
});

test('counts agree with an independent feature walk across repeated tags and empty layers', () => {
  const inputs = Array.from({length: 9}, (_, i) => {
    const features = Array.from({length: i * 17}, (_, j) => {
      const source_id = j % 11 === 0 ? '' : 's' + (i * j % 7);
      return {source_id, name: String(j % 4), grade: j % 2 === 0};
    });
    return {name: 'slice-' + i, features};
  });
  const parsed = parseTileSources(makeVectorTile(inputs));
  const expected = inputs.flatMap(({name, features}) => {
    /** @type {Map<string,number>} */
    const frequency = new Map();
    for (const item of features) {
      const key = item.source_id || 'UNKNOWN';
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
    return [...frequency.keys()].sort().map(sourceId => ({layer: name, sourceId, count: frequency.get(sourceId)}));
  });
  assert.deepEqual(parsed.groups, expected);
  assert.equal(parsed.featureCount, inputs.reduce((sum, layer) => sum + layer.features.length, 0));
});

/** @param {unknown[]} sources */
const registryText = sources => JSON.stringify({sources});

test('registry extracts declared fields, retaining exact credit text and evidence tier zero', () => {
  const source = { id: 'b', name: 'Source B', licence_id: 'terms-a', retrieved_at: '2024-02-29',
    tier: 0, attribution: '  Credit: B\nsecond line  ', ignored: {tier: 4} };
  const registry = parseSourceRegistry('\uFEFF' + registryText([source]));
  assert.deepEqual(registry.get('b'), {
    id: 'b', name: 'Source B', licence: 'terms-a', retrievedOn: '2024-02-29',
    tier: 0, attribution: '  Credit: B\nsecond line  ',
  });
});

test('missing metadata remains UNKNOWN without inventing dates, licence text or tiers', () => {
  const registry = parseSourceRegistry(registryText([{id: 'a', name: '', tier: null, licence_name: 'similar column'}]));
  assert.deepEqual(registry.get('a'), {
    id: 'a', name: 'UNKNOWN', licence: 'UNKNOWN', retrievedOn: 'UNKNOWN',
    tier: 'UNKNOWN', attribution: 'UNKNOWN',
  });
});

test('malformed entries reject the whole registry and identify the offending row', () => {
  for (const row of [
    {}, null, {id: 5}, {id: 'UNKNOWN'}, {id: '\ninvalid'}, {id: 'a', name: 7},
    {id: 'a', tier: 5}, {id: 'a', tier: false}, {id: 'a', tier: '0'}, {id: 'a', tier: 2.5},
    {id: 'a', retrieved_at: '2023-02-29'}, {id: 'a', retrieved_at: '2022-02-30'},
    {id: 'a', retrieved_at: '2022-9-01'}, {id: 'a', retrieved_at: '0000-01-01'},
    {id: 'a', licence_id: 'bad\u0001'}, {id: 'a', attribution: []}, {id: 'a', attribution: '\ud800'},
  ]) {
    assert.throws(() => parseSourceRegistry(registryText([{id: 'ok'}, row])), errorWith('registry-format', 2));
  }
});

test('registry structure and property uniqueness are checked independently of string escapes', () => {
  for (const text of ['[{}]', '{}', '{"sources":0}', '{"sources":[]}x',
    '{"sources":[],"sources":[]}', '{"sources":[{"id":"a","\\u0069d":"b"}]}']) {
    assert.throws(() => parseSourceRegistry(text), errorWith('registry-format'));
  }
  const id = 'braces { } and a "quote"';
  assert.equal(parseSourceRegistry(registryText([{id}])).get(id)?.id, id);
});

test('duplicate IDs reject the later row while distinct Unicode spellings remain separate', () => {
  assert.throws(() => parseSourceRegistry(registryText([{id: 'one'}, {id: 'one'}])), errorWith('registry-duplicate', 2));
  const ids = ['é', 'e\u0301', 'é ', '__proto__'];
  assert.deepEqual([...parseSourceRegistry(registryText(ids.map(id => ({id})))).keys()], ids);
});

test('registry budgets cover total bytes, number of records, text size, nesting and ID bytes', () => {
  assert.throws(() => parseSourceRegistry(' '.repeat(4 * 1024 * 1024 + 1)), errorWith('registry-limit'));
  assert.throws(() => parseSourceRegistry(registryText(Array(10001).fill({id: 'a'}))), errorWith('registry-limit'));
  assert.throws(() => parseSourceRegistry(registryText([{id: 'é'.repeat(513)}])), errorWith('registry-limit', 1));
  assert.throws(() => parseSourceRegistry(registryText([{id: 'a', attribution: 'x'.repeat(8193)}])), errorWith('registry-limit', 1));
  const deep = '{"sources":[],"unused":' + '['.repeat(50) + '0' + ']'.repeat(50) + '}';
  assert.throws(() => parseSourceRegistry(deep), errorWith('registry-limit'));
});

test('joining retains every tile group and distinguishes absent, unmatched and unknown identities', () => {
  const key = 'id-1';
  const model = parseTileSources(makeVectorTile([{name: 'entries', features: [
    {source_id: key}, {source_id: key}, {}, {source_id: 'unlisted'}, {source_id: 'Id-1'},
  ]}]));
  const registry = parseSourceRegistry(registryText([
    { id: key, licence_id: 'terms', retrieved_at: '2020-01-02', tier: 0, attribution: 'credit' },
    { id: 'unused' },
  ]));
  const absent = joinTileSources(model, null);
  assert.equal(absent.find(row => row.sourceId === key)?.match, 'no-registry');
  assert.equal(absent.find(row => row.sourceId === 'UNKNOWN')?.match, 'unknown-source');
  const rows = joinTileSources(model, registry);
  assert.equal(rows.length, 4);
  const match = rows.find(row => row.sourceId === key);
  assert.deepEqual(match, { layer: 'entries', sourceId: key, count: 2, match: 'matched', name: 'UNKNOWN',
    licence: 'terms', retrievedOn: '2020-01-02', tier: 0, attribution: 'credit' });
  for (const row of rows.filter(item => item.sourceId !== key)) {
    assert.equal(row.match, row.sourceId === 'UNKNOWN' ? 'unknown-source' : 'unlisted');
    assert.deepEqual([row.name, row.licence, row.retrievedOn, row.tier, row.attribution], Array(5).fill('UNKNOWN'));
  }
  assert.equal(joinTileSources(model, new Map()).find(row => row.sourceId === key)?.match, 'unlisted');
  assert.equal(model.groups.some(group => 'match' in group), false);
});

test('local registry reads report invalid byte sequences and accept split UTF-8', async () => {
  await assert.rejects(readSourceRegistry(new Blob([Uint8Array.of(0xfe)])), errorWith('registry-read'));
  const bytes = new TextEncoder().encode(registryText([{id: 'é', tier: 2}]));
  const split = bytes.indexOf(0xc3) + 1;
  class Split extends Blob {
    stream() {
      return new ReadableStream({start(writer) {
        writer.enqueue(bytes.slice(0, split));
        writer.enqueue(bytes.slice(split));
        writer.close();
      }});
    }
  }
  assert.equal((await readSourceRegistry(new Split())).get('é')?.tier, 2);
});

test('a failed or superseded registry read never yields a partially decoded map', async () => {
  const controller = new AbortController();
  class Delayed extends Blob {
    stream() {
      return new ReadableStream({pull() { controller.abort(); }});
    }
  }
  await assert.rejects(readSourceRegistry(new Delayed(), controller.signal), errorWith('cancelled'));
  await assert.rejects(readSourceRegistry(new Blob(), controller.signal), errorWith('cancelled'));
  class Failing extends Blob {
    stream() { return new ReadableStream({start(w) { w.error(new Error('read')); }}); }
  }
  await assert.rejects(readSourceRegistry(new Failing()), errorWith('registry-read'));
});

test('file size and streamed bytes are independently bounded', async () => {
  const limit = 4 * 1024 * 1024;
  await assert.rejects(readSourceRegistry(new Blob([new Uint8Array(limit + 1)])), errorWith('registry-limit'));
  class Expanding extends Blob {
    stream() {
      return new ReadableStream({start(w) { w.enqueue(new Uint8Array(limit + 1)); w.close(); }});
    }
  }
  await assert.rejects(readSourceRegistry(new Expanding()), errorWith('registry-limit'));
});
