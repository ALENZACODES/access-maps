// @ts-check

/**
 * Read the header, directory and selected content of a local vector tile
 * archive. Offsets stay relative to their declared sections until a slice is
 * requested. This prevents an entry from reading a neighbour's metadata.
 */

/** @typedef {'format'|'bounds'|'metadata'|'directory'|'compression'|'limit'|'coordinate'|'read'|'cancelled'} ErrorCode */
/** @typedef {{offset:number,length:number}} Span */
/** @typedef {{id:number,run:number,length:number,offset:number}} DirectoryEntry */
/** @typedef {[number,number,number,number]} Bounds */
/** @typedef {[number,number,number]} Center */

export class TileArchiveError extends Error {
  /** @param {ErrorCode} code */
  constructor(code) {
    super(code);
    this.name = 'TileArchiveError';
    this.code = code;
  }
}

const headerSize = 127;
const maxZoom = 26; // All tile IDs up to this zoom fit in an exact integer.
const directoryBudget = 4 * 1024 * 1024;
const metadataBudget = 1024 * 1024;
const tileBudget = 8 * 1024 * 1024;
const maxEntries = 100_000;
const maxLevels = 4;

/** @param {ErrorCode} code @returns {never} */
function fail(code) {
  throw new TileArchiveError(code);
}

/** @param {AbortSignal} [signal] */
function active(signal) {
  if (signal?.aborted) fail('cancelled');
}

/**
 * First Hilbert tile ID assigned to a zoom. Avoid rounding 4**27 - 1
 * when computing the exclusive end of the last supported level.
 * @param {number} z
 */
function firstId(z) {
  if (z === 0) return 0;
  return ((4 ** (z - 1) - 1) / 3) + 4 ** (z - 1);
}

/**
 * Coordinates use a top-left origin. The low coordinate bits are rotated in
 * each quadrant before the next bit pair is consumed.
 * @param {number} z @param {number} x @param {number} y
 */
export function tileIdFor(z, x, y) {
  if (!Number.isInteger(z) || z < 0 || z > maxZoom) fail('coordinate');
  const width = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= width) {
    fail('coordinate');
  }
  let id = firstId(z);
  for (let half = width / 2; half >= 1; half /= 2) {
    const right = (x & half) !== 0;
    const bottom = (y & half) !== 0;
    const quadrant = right ? (bottom ? 2 : 3) : (bottom ? 1 : 0);
    id += quadrant * half * half;
    x %= half;
    y %= half;
    if (!bottom) {
      const oldX = x;
      x = right ? half - 1 - y : y;
      y = right ? half - 1 - oldX : oldX;
    }
  }
  return id;
}

/** @param {Uint8Array} bytes @param {number} size */
function unpackHeader(bytes, size) {
  if (bytes.length !== headerSize || String.fromCharCode(...bytes.subarray(0, 7)) !== 'PMTiles' || bytes[7] !== 3) {
    fail('format');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wide = (/** @type {number} */ index) => {
    const value = Number(view.getBigUint64(index, true));
    if (!Number.isSafeInteger(value)) fail('bounds');
    return value;
  };
  const section = (/** @type {number} */ index) => {
    const offset = wide(index);
    const length = wide(index + 8);
    if (offset > size || length > size - offset || (length > 0 && offset < headerSize)) fail('bounds');
    return {offset, length};
  };
  const root = section(8);
  const meta = section(24);
  const leaves = section(40);
  const tiles = section(56);
  if (!root.length || root.offset + root.length > 16384) fail('directory');
  const occupied = [root, meta, leaves, tiles].filter(s => s.length).sort((a, b) => a.offset - b.offset);
  let end = headerSize;
  for (const part of occupied) {
    if (part.offset < end) fail('bounds');
    end = part.offset + part.length;
  }
  const internalCompression = view.getUint8(97);
  const tileCompression = view.getUint8(98);
  if (![1, 2].includes(internalCompression) || ![1, 2].includes(tileCompression)) fail('compression');
  const tileType = view.getUint8(99);
  if (tileType !== 1 || view.getUint8(96) > 1) fail('format');
  const min = view.getUint8(100);
  const max = view.getUint8(101);
  const centerZoom = view.getUint8(118);
  if (max > maxZoom || min > max || centerZoom > maxZoom) fail('bounds');
  const degrees = (/** @type {number} */ i) => view.getInt32(i, true) / 1e7;
  /** @type {Bounds} */
  const bounds = [degrees(102), degrees(106), degrees(110), degrees(114)];
  /** @type {Center} */
  const center = [degrees(119), degrees(123), centerZoom];
  const [west, south, east, north] = bounds;
  if (west < -180 || east > 180 || west > east || south < -90 || north > 90 || south > north ||
      Math.abs(center[0]) > 180 || Math.abs(center[1]) > 90) fail('bounds');
  const addressedTiles = wide(72);
  const tileEntries = wide(80);
  const tileContents = wide(88);
  // Zero is permitted when a producer did not record a count.
  if ((addressedTiles && tileEntries > addressedTiles) || (tileEntries && tileContents > tileEntries)) {
    fail('directory');
  }
  const header = Object.freeze({
    minZoom: min, maxZoom: max, tileType,
    bounds: Object.freeze(bounds), center: Object.freeze(center),
    addressedTiles, tileEntries, tileContents,
  });
  return {header, root, meta, leaves, tiles, internalCompression, tileCompression};
}

/**
 * Decode bytes in a single declared slice. Count decompressed bytes before
 * keeping each output chunk. On failure discard the entire range.
 * @param {Blob} file @param {Span} span @param {number} compression
 * @param {number} budget @param {AbortSignal} [signal]
 */
async function readSection(file, span, compression, budget, signal) {
  active(signal);
  if (span.length > budget + (compression === 2 ? 65536 : 0)) fail('limit');
  const slice = file.slice(span.offset, span.offset + span.length);
  if (slice.size !== span.length) fail('read');
  if (compression === 1) {
    try {
      const content = new Uint8Array(await slice.arrayBuffer());
      active(signal);
      if (content.length !== span.length) fail('read');
      return content;
    } catch (error) {
      active(signal);
      if (error instanceof TileArchiveError) throw error;
      fail('read');
    }
  }
  if (typeof DecompressionStream !== 'function') fail('compression');
  const reader = slice.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, {once: true});
  let size = 0;
  /** @type {Uint8Array[]} */
  const parts = [];
  try {
    for (;;) {
      const part = await reader.read();
      active(signal);
      if (part.done) break;
      size += part.value.length;
      if (size > budget) fail('limit');
      parts.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    active(signal);
    if (error instanceof TileArchiveError) throw error;
    fail('compression');
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/**
 * Conflicting copies of a top-level metadata key must not quietly replace an
 * earlier credit. Syntax has already been checked with JSON.parse, so skip the
 * bodies of strings without treating quoted braces or colons as structure.
 * @param {string} source
 */
function uniqueMetadataKeys(source) {
  const seen = new Set();
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === '"') {
      const start = i;
      while (source[++i] !== '"') if (source[i] === '\\') i++;
      if (depth !== 1) continue;
      let next = i + 1;
      while (next < source.length && /[ \n\r\t]/u.test(source.charAt(next))) next++;
      if (source[next] !== ':') continue;
      const key = JSON.parse(source.slice(start, i + 1));
      if (seen.has(key)) fail('metadata');
      seen.add(key);
    }
  }
}

/** @param {Uint8Array} bytes */
function unpackMetadata(bytes) {
  /** @type {Record<string,unknown>} */
  let object = {};
  if (bytes.length) {
    try {
      const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      const parsed = JSON.parse(source);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail('metadata');
      uniqueMetadataKeys(source);
      object = parsed;
    } catch {
      fail('metadata');
    }
  }
  const text = (/** @type {string} */ key) => {
    const value = object[key];
    if (value === undefined || value === null) return 'UNKNOWN';
    if (typeof value !== 'string') fail('metadata');
    return value.trim() ? value : 'UNKNOWN';
  };
  return Object.freeze({name: text('name'), description: text('description'), attribution: text('attribution')});
}

/**
 * Directory columns encode IDs as deltas and tile data offsets using either
 * offset + 1 or a zero for the end of the previous range.
 * @param {Uint8Array} bytes @param {number} low @param {number} high
 * @param {number} tileLength @param {number} leafLength
 */
function unpackDirectory(bytes, low, high, tileLength, leafLength) {
  let cursor = 0;
  function integer() {
    let value = 0;
    let factor = 1;
    for (let i = 0; i < 8; i++) {
      const b = bytes[cursor++];
      if (b === undefined) fail('directory');
      value += (b & 127) * factor;
      if (!Number.isSafeInteger(value)) fail('directory');
      if (b < 128) return value;
      factor *= 128;
    }
    return fail('directory');
  }
  const count = integer();
  if (count > maxEntries) fail('limit');
  if (count > Math.floor((bytes.length - cursor) / 4)) fail('directory');
  /** @type {DirectoryEntry[]} */
  const entries = [];
  let id = 0;
  for (let i = 0; i < count; i++) {
    const delta = integer();
    if (i > 0 && delta === 0) fail('directory');
    id += delta;
    if (id < low || id >= high) fail('directory');
    entries.push({id, run: 0, length: 0, offset: 0});
  }
  for (const [i, entry] of entries.entries()) {
    entry.run = integer();
    if (entry.run > (entries[i + 1]?.id ?? high) - entry.id) fail('directory');
  }
  for (const entry of entries) {
    entry.length = integer();
    if (entry.length === 0) fail('directory');
  }
  let previousEnd = 0;
  for (const [i, entry] of entries.entries()) {
    const value = integer();
    if (value === 0 && i === 0) fail('directory');
    entry.offset = value === 0 ? previousEnd : value - 1;
    const within = entry.run ? tileLength : leafLength;
    if (entry.offset > within || entry.length > within - entry.offset) fail('directory');
    previousEnd = entry.offset + entry.length;
  }
  if (cursor !== bytes.length) fail('directory');
  return entries;
}

/** @param {DirectoryEntry[]} entries @param {number} id */
function preceding(entries, id) {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if ((entries[mid]?.id ?? Infinity) <= id) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

/**
 * Open a local vector archive. The index checks all entries in every directory
 * that is read. Tile contents and unused leaves stay on disk until requested.
 * @param {Blob} file @param {AbortSignal} [signal]
 */
export async function openTileArchive(file, signal) {
  active(signal);
  if (!Number.isSafeInteger(file.size) || file.size < headerSize) fail('format');
  const bytes = await readSection(file, {offset: 0, length: headerSize}, 1, headerSize, signal);
  const {header, root, meta, leaves, tiles, internalCompression, tileCompression} = unpackHeader(bytes, file.size);
  const low = firstId(header.minZoom);
  const high = firstId(header.maxZoom + 1);
  const directoryBytes = await readSection(file, root, internalCompression, directoryBudget, signal);
  const entries = unpackDirectory(directoryBytes, low, high, tiles.length, leaves.length);
  if (entries.every(entry => entry.run > 0)) {
    // In a root-only archive these counts are available without reading
    // payloads. Multiple entries may reference the same content range.
    const addressed = entries.reduce((sum, entry) => sum + entry.run, 0);
    const distinct = new Set(entries.map(entry => entry.offset + ':' + entry.length));
    if ((header.tileEntries && header.tileEntries !== entries.length) ||
        (header.addressedTiles && header.addressedTiles !== addressed) ||
        (header.tileContents && header.tileContents !== distinct.size)) fail('directory');
  }
  const metadataBytes = meta.length
    ? await readSection(file, meta, internalCompression, metadataBudget, signal)
    : new Uint8Array();
  const metadata = unpackMetadata(metadataBytes);
  /** @type {{offset:number,length:number,low:number,high:number,entries:DirectoryEntry[]}|null} */
  let cached = null;

  /** @param {number} z @param {number} x @param {number} y @param {AbortSignal} [lookupSignal] */
  async function readTile(z, x, y, lookupSignal) {
    active(lookupSignal);
    const id = tileIdFor(z, x, y);
    if (z < header.minZoom || z > header.maxZoom) return null;
    let current = entries;
    let upper = high;
    const visited = new Set();
    for (let depth = 0; depth < maxLevels; depth++) {
      const at = preceding(current, id);
      const entry = current[at];
      if (!entry) return null;
      if (entry.run) {
        if (id - entry.id >= entry.run) return null;
        const span = {offset: tiles.offset + entry.offset, length: entry.length};
        return readSection(file, span, tileCompression, tileBudget, lookupSignal);
      }
      if (depth + 1 >= maxLevels || visited.has(entry.offset)) fail('directory');
      visited.add(entry.offset);
      upper = current[at + 1]?.id ?? upper;
      if (cached && cached.offset === entry.offset && cached.length === entry.length &&
          cached.low === entry.id && cached.high === upper) {
        current = cached.entries;
      } else {
        const span = {offset: leaves.offset + entry.offset, length: entry.length};
        const content = await readSection(file, span, internalCompression, directoryBudget, lookupSignal);
        current = unpackDirectory(content, entry.id, upper, tiles.length, leaves.length);
        if (current[0]?.id !== entry.id) fail('directory');
        cached = {offset: entry.offset, length: entry.length, low: entry.id, high: upper, entries: current};
      }
    }
    return fail('directory');
  }
  return Object.freeze({header, metadata, readTile});
}

/** @typedef {Awaited<ReturnType<typeof openTileArchive>>} TileArchive */
