// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { testArchive } from './tile-notice-archive-fixture.mjs';
import { openTileArchive, tileIdFor, TileArchiveError } from './tile-notice-archive.mjs';

const one = {z: 0, x: 0, y: 0, bytes: Uint8Array.of(19, 23)};
const quad = [
  {z: 1, x: 0, y: 0, bytes: Uint8Array.of(31)},
  {z: 1, x: 0, y: 1, bytes: Uint8Array.of(32)},
  {z: 1, x: 1, y: 1, bytes: Uint8Array.of(33)},
  {z: 1, x: 1, y: 0, bytes: Uint8Array.of(34)},
];

/** @param {Uint8Array<ArrayBuffer>} bytes */
function open(bytes) {
  return openTileArchive(new Blob([bytes]));
}

/** @param {Uint8Array} bytes @param {number} at */
function wide(bytes, at) {
  return Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(at, true));
}

/** @param {Uint8Array} bytes @param {number} at @param {bigint|number} value */
function setWide(bytes, at, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(at, BigInt(value), true);
}

/** @param {string} code */
function errorCode(code) {
  return (/** @type {unknown} */ error) => error instanceof TileArchiveError && error.code === code;
}

/**
 * Substitute a deliberately unusual directory or metadata block while keeping
 * the header and other sections correctly sized. These bytes exercise paths
 * the ordinary fixture encoder would not produce.
 * @param {Uint8Array<ArrayBuffer>} original @param {number} field @param {Uint8Array} replacement
 */
function substitute(original, field, replacement) {
  const header = original.slice(0, 127);
  let position = 127;
  const pieces = [];
  for (const at of [8, 24, 40, 56]) {
    const start = wide(original, at);
    const bytes = at === field ? replacement : original.subarray(start, start + wide(original, at + 8));
    setWide(header, at, bytes.length ? position : 0);
    setWide(header, at + 8, bytes.length);
    position += bytes.length;
    pieces.push(bytes);
  }
  const result = new Uint8Array(position);
  result.set(header);
  position = 127;
  for (const piece of pieces) {
    result.set(piece, position);
    position += piece.length;
  }
  return result;
}

test('opens the declared region, zoom range, centre and index counts', async () => {
  const archive = await open(testArchive({tiles: [one, ...quad]}));
  assert.deepEqual(archive.header, {
    bounds: [-180, -85, 180, 85], center: [0, 0, 0], minZoom: 0, maxZoom: 1,
    addressedTiles: 5, tileEntries: 5, tileContents: 5, tileType: 1,
  });
  assert.ok(Object.isFrozen(archive.header));
  assert.ok(Object.isFrozen(archive.header.bounds));
});

test('both local compression choices apply independently to index and content', async () => {
  for (const gzipIndex of [false, true]) {
    for (const gzipTiles of [false, true]) {
      const archive = await open(testArchive({
        tiles: [one], gzipIndex, gzipTiles, metadata: {attribution: '© source note'},
      }));
      assert.equal(archive.metadata.attribution, '© source note');
      assert.deepEqual(await archive.readTile(0, 0, 0), one.bytes);
    }
  }
});

test('metadata keeps the exact published notice including spacing and markup as text', async () => {
  const credit = '  « Texte »\n<em>©</em>  ';
  const archive = await open(testArchive({
    tiles: [], metadata: {name: 'dossier', attribution: credit, description: ' two\nlines '},
  }));
  assert.deepEqual(archive.metadata, {name: 'dossier', description: ' two\nlines ', attribution: credit});
  assert.equal(await archive.readTile(0, 0, 0), null);
});

test('an omitted metadata section, empty fields and null yield UNKNOWN', async () => {
  for (const text of ['', '{}', '{"name":" ","description":null,"attribution":""}']) {
    assert.deepEqual((await open(testArchive({tiles: [one], metadataText: text}))).metadata,
      {name: 'UNKNOWN', description: 'UNKNOWN', attribution: 'UNKNOWN'});
  }
});

test('invalid metadata never yields a partially parsed notice', async () => {
  const base = testArchive({tiles: [one]});
  for (const text of ['null', '[]', '{"name":"unfinished}', '{"attribution":7}',
    '{"name":"a","\\u006eame":"b"}']) {
    await assert.rejects(open(substitute(base, 24, new TextEncoder().encode(text))), errorCode('metadata'));
  }
  await assert.rejects(open(substitute(base, 24, Uint8Array.of(0xff))), errorCode('metadata'));
});

test('quoted braces, escaped quotes and nested keys do not collide with top-level metadata', async () => {
  const name = 'Text "with: {braces}"';
  const archive = await open(testArchive({tiles: [], metadata: {
    name, vector_layers: [{name: 'nested'}, {name: 'another'}], attribution: ' }{ ',
  }}));
  assert.equal(archive.metadata.name, name);
  assert.equal(archive.metadata.attribution, ' }{ ');
});

test('refuses a missing signature, version mismatch and non-vector payload type', async () => {
  await assert.rejects(open(new Uint8Array(126)), errorCode('format'));
  for (const [index, value] of /** @type {const} */ ([[0, 0], [6, 0], [7, 2], [99, 3], [96, 7]])) {
    const bytes = testArchive({tiles: [one]});
    bytes[index] = value;
    await assert.rejects(open(bytes), errorCode('format'));
  }
});

test('rejects unsupported internal and content compression before reading their bytes', async () => {
  for (const index of [97, 98]) {
    const bytes = testArchive({tiles: [one]});
    bytes[index] = 0;
    await assert.rejects(open(bytes), errorCode('compression'));
  }
});

test('rejects reversed geographic bounds, invalid centre, and impossible levels', async () => {
  for (const [index, value] of /** @type {const} */ ([[102, 181e7], [106, 89e7], [114, 91e7], [119, -181e7], [123, -91e7]])) {
    const bytes = testArchive({tiles: [one]});
    new DataView(bytes.buffer).setInt32(index, value, true);
    await assert.rejects(open(bytes), errorCode('bounds'));
  }
  for (const [index, value] of /** @type {const} */ ([[100, 1], [101, 27], [118, 27]])) {
    const bytes = testArchive({tiles: [one]});
    bytes[index] = value;
    await assert.rejects(open(bytes), errorCode('bounds'));
  }
});

test('bounds must fit the file, never overlap the header or another occupied section', async () => {
  for (const [index, value] of /** @type {const} */ ([[8, 12], [24, 127], [64, 1000], [56, 2n ** 59n], [40, 512]])) {
    const bytes = testArchive({tiles: [one]});
    setWide(bytes, index, value);
    await assert.rejects(open(bytes), errorCode('bounds'));
  }
  const far = new Uint8Array(20000);
  far.set(testArchive({tiles: [one]}));
  setWide(far, 8, 16382);
  await assert.rejects(open(far), errorCode('directory'));
});

test('a leaf section of length zero can use offset zero or any position within the file', async () => {
  const bytes = testArchive({tiles: [one]});
  assert.equal(wide(bytes, 40), 0);
  setWide(bytes, 40, bytes.length);
  assert.deepEqual(await (await open(bytes)).readTile(0, 0, 0), one.bytes);
});

test('advertised counts may be unspecified; contradictory known counts fail', async () => {
  const bytes = testArchive({tiles: [one]});
  for (const field of [72, 80, 88]) setWide(bytes, field, 0);
  const unspecified = await open(bytes);
  assert.deepEqual(await unspecified.readTile(0, 0, 0), one.bytes);
  for (const field of [72, 80, 88]) {
    const invalid = testArchive({tiles: [one]});
    setWide(invalid, field, 2);
    await assert.rejects(open(invalid), errorCode('directory'));
  }
});

test('known Hilbert positions cover each tile exactly once and start after earlier levels', () => {
  assert.equal(tileIdFor(0, 0, 0), 0);
  const rows = [
    [5, 6, 19, 20],
    [8, 7, 18, 17],
    [9, 12, 13, 16],
    [10, 11, 14, 15],
  ];
  for (const [y, row] of rows.entries()) {
    for (const [x, id] of row.entries()) assert.equal(tileIdFor(2, x, y), id);
  }
  const all = new Set();
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) all.add(tileIdFor(5, x, y));
  }
  assert.equal(Math.min(...all), 341);
  assert.equal(Math.max(...all), 1364);
  assert.equal(all.size, 1024);
  assert.equal(tileIdFor(26, 2 ** 26 - 1, 0), 6004799503160660);
});

test('invalid coordinate inputs are errors and valid out-of-archive zooms have no tile', async () => {
  const archive = await open(testArchive({tiles: quad}));
  for (const [z, x, y] of /** @type {const} */ ([[-1, 0, 0], [27, 0, 0], [2, -1, 0], [2, 4, 0],
    [2, 0, 4], [2.5, 0, 0], [0, NaN, 0], [1, 0, Infinity], [1, 0.5, 0]])) {
    await assert.rejects(archive.readTile(z, x, y), errorCode('coordinate'));
  }
  assert.equal(await archive.readTile(0, 0, 0), null);
  assert.equal(await archive.readTile(2, 0, 0), null);
});

test('runs reuse one content range and stop at their exclusive end', async () => {
  const tile = {...one, z: 1, run: 3};
  const archive = await open(testArchive({tiles: [tile]}));
  for (const [x,y] of /** @type {const} */ ([[0,0],[0,1],[1,1]])) {
    assert.deepEqual(await archive.readTile(1,x,y), one.bytes);
  }
  assert.equal(await archive.readTile(1,1,0), null);
});

test('multiple separated entries may share a content range', async () => {
  const bytes = testArchive({tiles: quad.slice(0,2)});
  const raw = Uint8Array.of(2, 1, 1, 1, 1, 1, 1, 1, 1);
  setWide(bytes, 88, 1);
  const archive = await open(substitute(bytes, 8, raw));
  assert.deepEqual(await archive.readTile(1,0,0), Uint8Array.of(31));
  assert.deepEqual(await archive.readTile(1,0,1), Uint8Array.of(31));
});

test('malformed directories cannot reinterpret bytes in another column or outside tile content', async () => {
  const bytes = testArchive({tiles: [one]});
  for (const raw of [
    [1,0,1,2], [1,0,1,0,1], [1,0,1,2,0], [1,0,1,3,1], [1,0,1,2,2], [1,0,1,2,1,6],
    [1,0,0,1,1], [1,1,1,2,1], [1,0,2,2,1], [128,128,128,128,128,128,128,128,1],
  ]) {
    await assert.rejects(open(substitute(bytes, 8, Uint8Array.from(raw))), errorCode('directory'));
  }
});

test('successive IDs must increase and a run cannot cover the next entry', async () => {
  const base = testArchive({tiles: quad.slice(0,2)});
  for (const raw of [
    [2,1,0,1,1,1,1,1,0],
    [2,1,1,2,1,1,1,1,0],
  ]) {
    await assert.rejects(open(substitute(base, 8, Uint8Array.from(raw))), errorCode('directory'));
  }
});

test('a sparse leaf can answer absent requests between two pointers', async () => {
  const a = quad[0], b = quad[3];
  assert.ok(a && b);
  const archive = await open(testArchive({tiles:[a,b],leafSize:1,gzipIndex:true,gzipTiles:true}));
  assert.deepEqual(await archive.readTile(1,0,0), a.bytes);
  assert.equal(await archive.readTile(1,0,1), null);
  assert.equal(await archive.readTile(1,1,1), null);
  assert.deepEqual(await archive.readTile(1,1,0), b.bytes);
});

test('a selected leaf must start at its pointer and cannot claim an adjacent branch', async () => {
  const base = testArchive({tiles: quad, leafSize:2});
  const firstLeaf = wide(base, 40);
  for (const [relative, value] of /** @type {const} */ ([[1,2],[2,2],[4,4]])) {
    const bytes = base.slice();
    bytes[firstLeaf + relative] = value;
    const archive = await open(bytes);
    await assert.rejects(archive.readTile(1,0,0), errorCode('directory'));
  }
});

test('cyclic or excessive nested directories fail, while a supported nested leaf loads', async () => {
  const base = testArchive({tiles: [one], leafSize:1});
  const self = Uint8Array.of(1,0,0,5,1);
  const terminal = Uint8Array.of(1,0,1,2,1);
  const cycle = await open(substitute(base,40,self));
  await assert.rejects(cycle.readTile(0,0,0), errorCode('directory'));
  const chain = (/** @type {number} */ levels) => {
    const leaf = new Uint8Array(levels * 5);
    for (let i=0; i<levels-1; i++) leaf.set([1,0,0,5,6+i*5],i*5);
    leaf.set(terminal,(levels-1)*5);
    return leaf;
  };
  const supported = await open(substitute(base,40,chain(3)));
  assert.deepEqual(await supported.readTile(0,0,0), one.bytes);
  const tooDeep = await open(substitute(base,40,chain(4)));
  await assert.rejects(tooDeep.readTile(0,0,0), errorCode('directory'));
});

test('one lookup reads only its leaf and selected content; repeating it reuses the index', async () => {
  class Tracked extends Blob {
    /** @type {number[]} */
    starts = [];
    slice(/** @type {number} */ start = 0, /** @type {number} */ end) {
      this.starts.push(start);
      return super.slice(start,end);
    }
  }
  const bytes = testArchive({tiles: quad,leafSize:2});
  const blob = new Tracked([bytes]);
  const archive = await openTileArchive(blob);
  const firstPayload = wide(bytes, 56);
  assert.ok(blob.starts.every(position => position < wide(bytes,40)));
  assert.deepEqual(await archive.readTile(1,0,0), Uint8Array.of(31));
  assert.deepEqual(blob.starts.slice(-2), [wide(bytes,40),firstPayload]);
  const oldLength = blob.starts.length;
  assert.deepEqual(await archive.readTile(1,0,1), Uint8Array.of(32));
  assert.deepEqual(blob.starts.slice(oldLength), [firstPayload + 1]);
});

test('a tile beyond four gigabytes needs only the declared byte ranges', async () => {
  const bytes = testArchive({tiles: [one]});
  const original = wide(bytes, 56);
  const distant = 2 ** 32 + 151;
  setWide(bytes, 56, distant);
  /** @type {number[][]} */
  const ranges = [];
  class SparseFile extends Blob {
    get size() { return distant + one.bytes.length; }
    /** @param {number} [start] @param {number} [end] */
    slice(start = 0, end = this.size) {
      ranges.push([start, end]);
      if (start === distant && end === this.size) return super.slice(original);
      assert.ok(start >= 0 && end <= original, 'only indexed ranges may be read');
      return super.slice(start, end);
    }
  }
  const archive = await openTileArchive(new SparseFile([bytes]));
  assert.deepEqual(await archive.readTile(0, 0, 0), one.bytes);
  assert.deepEqual(ranges.at(-1), [distant, distant + 2]);
});

test('a damaged leaf is rejected on access and never supplies a partial tile', async () => {
  const base = testArchive({tiles: quad,gzipIndex:true,leafSize:1});
  const index = wide(base,40);
  base[index] = 0;
  const archive = await open(base);
  await assert.rejects(archive.readTile(1,0,0), errorCode('compression'));
  assert.deepEqual(await archive.readTile(1,1,0), Uint8Array.of(34));
});

test('payload decompression refuses corrupt bytes and oversized expanded content', async () => {
  const normal = testArchive({tiles:[one],gzipTiles:true});
  const start = wide(normal,56);
  const crc = normal.length - 8;
  assert.ok(start < crc);
  normal[crc] = (normal[crc] ?? 0) ^ 255;
  const corrupt = await open(normal);
  await assert.rejects(corrupt.readTile(0,0,0), errorCode('compression'));
  const massive = await open(testArchive({tiles:[{...one, bytes: new Uint8Array(8*1024*1024+1)}],gzipTiles:true}));
  await assert.rejects(massive.readTile(0,0,0), errorCode('limit'));
});

test('metadata size limits apply to decoded bytes before JSON parsing', async () => {
  const base = testArchive({tiles:[one],gzipIndex:true});
  await assert.rejects(open(substitute(base,24,gzipSync(new Uint8Array(1024*1024+1)))), errorCode('limit'));
  await assert.rejects(open(substitute(base,24,Uint8Array.of(0,1,2))), errorCode('compression'));
});

test('an aborted operation discards its work and a later lookup has fresh cancellation state', async () => {
  const blob = new Blob([testArchive({tiles:[one]})]);
  const cancelled = AbortSignal.abort();
  await assert.rejects(openTileArchive(blob,cancelled), errorCode('cancelled'));
  const archive = await openTileArchive(blob);
  await assert.rejects(archive.readTile(0,0,0,cancelled), errorCode('cancelled'));
  assert.deepEqual(await archive.readTile(0,0,0), one.bytes);
});
