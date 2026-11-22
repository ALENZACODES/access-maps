// @ts-check

import { gzipSync } from 'node:zlib';
import { tileIdFor } from './tile-notice-archive.mjs';

/** @typedef {{z:number,x:number,y:number,bytes:Uint8Array,run?:number}} TestTile */
/** @typedef {{id:number,offset:number,length:number,run:number}} Entry */

/** @param {Uint8Array[]} pieces */
function join(pieces) {
  const result = new Uint8Array(pieces.reduce((size, piece) => size + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    result.set(piece, offset);
    offset += piece.length;
  }
  return result;
}

/** @param {Entry[]} entries */
function directory(entries) {
  /** @type {number[]} */
  const bytes = [];
  const number = (/** @type {number} */ value) => {
    let remaining = value;
    while (remaining >= 128) {
      bytes.push(128 + remaining % 128);
      remaining = Math.floor(remaining / 128);
    }
    bytes.push(remaining);
  };
  number(entries.length);
  let prior = 0;
  for (const entry of entries) {
    number(entry.id - prior);
    prior = entry.id;
  }
  for (const entry of entries) number(entry.run);
  for (const entry of entries) number(entry.length);
  let next = -1;
  for (const entry of entries) {
    number(entry.offset === next ? 0 : entry.offset + 1);
    next = entry.offset + entry.length;
  }
  return Uint8Array.from(bytes);
}

/**
 * Construct small, reproducible local archives from test-specific bytes. When
 * leafSize is positive, the root indexes chunks of that many tile entries.
 * @param {{tiles:TestTile[], metadata?:Record<string,unknown>, metadataText?:string,
 * gzipIndex?:boolean,gzipTiles?:boolean,leafSize?:number,minZoom?:number,maxZoom?:number}} options
 */
export function testArchive(options) {
  const {tiles, metadata = {}, gzipIndex = false, gzipTiles = false, leafSize = 0} = options;
  const sorted = tiles.map(t => ({tile: t, id: tileIdFor(t.z, t.x, t.y)})).sort((a,b) => a.id - b.id);
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Uint8Array[]} */
  const contents = [];
  let size = 0;
  for (const {tile, id} of sorted) {
    const bytes = gzipTiles ? gzipSync(tile.bytes) : tile.bytes;
    contents.push(bytes);
    entries.push({id, offset: size, length: bytes.length, run: tile.run ?? 1});
    size += bytes.length;
  }
  const pack = (/** @type {Uint8Array} */ bytes) => gzipIndex ? gzipSync(bytes) : bytes;
  /** @type {Uint8Array[]} */
  const leaves = [];
  let root = entries;
  if (leafSize > 0) {
    root = [];
    let leafOffset = 0;
    for (let start = 0; start < entries.length; start += leafSize) {
      const group = entries.slice(start, start + leafSize);
      const first = group[0];
      if (!first) throw new Error('empty leaf');
      const bytes = pack(directory(group));
      leaves.push(bytes);
      root.push({id: first.id, run: 0, offset: leafOffset, length: bytes.length});
      leafOffset += bytes.length;
    }
  }
  const rootBytes = pack(directory(root));
  const text = options.metadataText ?? JSON.stringify(metadata);
  const meta = text ? pack(new TextEncoder().encode(text)) : new Uint8Array();
  const leafBytes = join(leaves);
  const header = new Uint8Array(127);
  header.set(new TextEncoder().encode('PMTiles'));
  const view = new DataView(header.buffer);
  header[7] = 3;
  let offset = header.length;
  for (const [i, length] of [rootBytes.length, meta.length, leafBytes.length, size].entries()) {
    view.setBigUint64(8 + i * 16, BigInt(length ? offset : 0), true);
    view.setBigUint64(16 + i * 16, BigInt(length), true);
    offset += length;
  }
  view.setBigUint64(72, BigInt(entries.reduce((n,e) => n + e.run, 0)), true);
  view.setBigUint64(80, BigInt(entries.length), true);
  view.setBigUint64(88, BigInt(contents.length), true);
  const levels = tiles.map(tile => tile.z);
  const min = options.minZoom ?? (levels.length ? Math.min(...levels) : 0);
  const max = options.maxZoom ?? (levels.length ? Math.max(...levels) : 0);
  header.set([1, gzipIndex ? 2 : 1, gzipTiles ? 2 : 1, 1, min, max], 96);
  for (const [i, value] of [-180, -85, 180, 85].entries()) {
    view.setInt32(102 + i * 4, value * 1e7, true);
  }
  header[118] = min;
  return join([header, rootBytes, meta, leafBytes, ...contents]);
}
