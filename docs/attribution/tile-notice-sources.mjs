// @ts-check

/**
 * Read the source tags used by features in one decoded vector tile. Only
 * the attribution fields enter the result; geometry and other properties
 * are skipped within the byte range of their enclosing message.
 * @typedef {{layer:string, sourceId:string, count:number}} SourceGroup
 * @typedef {{layers:string[], featureCount:number, groups:SourceGroup[]}} TileSources
 * @typedef {{id:string, name:string, licence:string, retrievedOn:string, tier:number|'UNKNOWN', attribution:string}} RegistrySource
 * @typedef {'matched'|'unlisted'|'no-registry'|'unknown-source'} Match
 * @typedef {SourceGroup & Omit<RegistrySource,'id'> & {match:Match}} SourceRow
 * @typedef {'tile-limit'|'tile-format'|'registry-limit'|'registry-format'|'registry-duplicate'|'registry-read'|'cancelled'} ErrorCode
 */

const UNKNOWN = 'UNKNOWN';
const tileBytesLimit = 16 * 1024 * 1024;
const registryBytesLimit = 4 * 1024 * 1024;
const dictionaryLimit = 65536;
const maxSourceBytes = 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

export class TileSourceError extends Error {
  /** @param {ErrorCode} code @param {number|null} [row] */
  constructor(code, row = null) {
    super(code);
    this.code = code;
    this.row = row;
  }
}

function badTile() {
  return new TileSourceError('tile-format');
}

class WireReader {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  get done() { return this.pos === this.bytes.length; }

  /** Field numbers, lengths and dictionary indices use at most 32 value bits.
   * Also accept a valid zero extension in a ten-byte wire representation.
   */
  uint32() {
    let result = 0;
    for (let index = 0; index < 10; index++) {
      const byte = this.bytes[this.pos++];
      if (byte === undefined) throw badTile();
      const part = byte & 127;
      if ((index === 4 && part > 15) || (index > 4 && part !== 0)) throw badTile();
      if (index < 5) result += part * 2 ** (index * 7);
      if (byte < 128) return result;
    }
    throw badTile();
  }

  skipInteger() {
    // An unused feature ID or integer property can exceed exact numeric
    // precision. Locate the end without converting its value to a number.
    for (let index = 0; index < 10; index++) {
      const byte = this.bytes[this.pos++];
      if (byte === undefined || (index === 9 && byte > 1)) throw badTile();
      if (byte < 128) return;
    }
    throw badTile();
  }

  key() {
    const key = this.uint32();
    if (key < 8) throw badTile();
    return key;
  }

  /** @param {number} length */
  advance(length) {
    if (length > this.bytes.length - this.pos) throw badTile();
    this.pos += length;
  }

  bytesField() {
    const size = this.uint32();
    const start = this.pos;
    this.advance(size);
    return this.bytes.subarray(start, this.pos);
  }

  /** @param {number} key @param {number} [depth] */
  skip(key, depth = 0) {
    switch (key % 8) {
      case 0: this.skipInteger(); return;
      case 1: this.advance(8); return;
      case 2: this.advance(this.uint32()); return;
      case 3: {
        if (depth >= 16) throw new TileSourceError('tile-limit');
        const close = key + 1;
        while (!this.done) {
          const next = this.key();
          if (next === close) return;
          this.skip(next, depth + 1);
        }
        throw badTile();
      }
      case 5: this.advance(4); return;
      default: throw badTile();
    }
  }
}

/** @param {Uint8Array} bytes */
function decode(bytes) {
  try {
    return utf8.decode(bytes);
  } catch {
    throw badTile();
  }
}

/** @param {string} id */
function usableId(id) {
  return Boolean(id.trim()) && id !== UNKNOWN && !/[\u0000-\u001f\u007f]/u.test(id);
}

/**
 * A value with no string alternative, or more than one known alternative,
 * cannot establish a source ID. Other property types remain immaterial.
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
function sourceCandidate(bytes) {
  const r = new WireReader(bytes);
  let alternatives = 0;
  let candidate = null;
  while (!r.done) {
    const key = r.key();
    if (key === 10) {
      const value = r.bytesField();
      alternatives++;
      if (alternatives === 1 && value.length <= maxSourceBytes) {
        try {
          const text = utf8.decode(value);
          if (usableId(text)) candidate = text;
        } catch {
          // A malformed string supplies no usable source identity.
        }
      }
    } else {
      if (Math.floor(key / 8) <= 7) alternatives++;
      r.skip(key);
    }
  }
  return alternatives === 1 ? candidate : null;
}

/** @param {Uint8Array} bytes @param {boolean[]} sourceKeys @param {(string|null)[]} values */
function featureSource(bytes, sourceKeys, values) {
  const r = new WireReader(bytes);
  let pendingKey = -1;
  /** @type {string|null} */
  let found = null;
  /** @param {number} index */
  function tagIndex(index) {
    if (pendingKey === -1) {
      if (index >= sourceKeys.length) throw badTile();
      pendingKey = index;
      return;
    }
    if (index >= values.length) throw badTile();
    if (sourceKeys[pendingKey]) {
      const id = values[index] ?? UNKNOWN;
      // Repeated conflicting labels cannot attribute the same feature to two
      // sources. Once ambiguous it stays unknown for this feature.
      found = found === null || found === id ? id : UNKNOWN;
    }
    pendingKey = -1;
  }
  while (!r.done) {
    const key = r.key();
    if (key === 18) {
      const packed = new WireReader(r.bytesField());
      while (!packed.done) tagIndex(packed.uint32());
    } else if (key === 16) {
      tagIndex(r.uint32());
    } else {
      if (Math.floor(key / 8) === 2) throw badTile();
      r.skip(key);
    }
  }
  if (pendingKey !== -1) throw badTile();
  return found ?? UNKNOWN;
}

const sourceKey = encoder.encode('source_id');

/** @param {Uint8Array} bytes */
function layerTable(bytes) {
  const r = new WireReader(bytes);
  /** @type {boolean[]} */
  const keys = [];
  /** @type {(string|null)[]} */
  const values = [];
  let name = '';
  let version = 0;
  let features = 0;
  while (!r.done) {
    const key = r.key();
    switch (key) {
      case 10: {
        const field = r.bytesField();
        if (field.length > 256) throw new TileSourceError('tile-limit');
        if (name) throw badTile();
        name = decode(field);
        if (!name.trim() || /[\u0000-\u001f\u007f]/u.test(name)) throw badTile();
        break;
      }
      case 18:
        if (++features > 100000) throw new TileSourceError('tile-limit');
        r.skip(key);
        break;
      case 26: {
        if (keys.length >= dictionaryLimit) throw new TileSourceError('tile-limit');
        const field = r.bytesField();
        keys.push(field.length === sourceKey.length && sourceKey.every((byte, index) => field[index] === byte));
        break;
      }
      case 34:
        if (values.length >= dictionaryLimit) throw new TileSourceError('tile-limit');
        values.push(sourceCandidate(r.bytesField()));
        break;
      case 120:
        if (version) throw badTile();
        version = r.uint32();
        if (version !== 1 && version !== 2) throw badTile();
        break;
      default:
        if ([1, 2, 3, 4, 15].includes(Math.floor(key / 8))) throw badTile();
        r.skip(key);
    }
  }
  if (!name || !version) throw badTile();
  return { name, keys, values, features };
}

/** @param {string} a @param {string} b */
function compare(a, b) {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** @param {Uint8Array} bytes @returns {TileSources} */
export function parseTileSources(bytes) {
  if (!(bytes instanceof Uint8Array)) throw badTile();
  if (bytes.length > tileBytesLimit) throw new TileSourceError('tile-limit');
  const tile = new WireReader(bytes);
  /** @type {Set<string>} */
  const layerNames = new Set();
  /** @type {SourceGroup[]} */
  const groups = [];
  let featureCount = 0;
  while (!tile.done) {
    const key = tile.key();
    if (key !== 26) {
      if (Math.floor(key / 8) === 3) throw badTile();
      tile.skip(key);
      continue;
    }
    const layer = tile.bytesField();
    if (layerNames.size >= 256) throw new TileSourceError('tile-limit');
    const { name, keys, values, features } = layerTable(layer);
    if (layerNames.has(name)) throw badTile();
    layerNames.add(name);
    featureCount += features;
    if (featureCount > 100000) throw new TileSourceError('tile-limit');

    // A second linear pass handles layers with their feature messages before
    // their dictionaries, without retaining slices for every feature.
    const r = new WireReader(layer);
    /** @type {Map<string,number>} */
    const counts = new Map();
    while (!r.done) {
      const field = r.key();
      if (field !== 18) {
        r.skip(field);
        continue;
      }
      const id = featureSource(r.bytesField(), keys, values);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (groups.length + counts.size > 16384) throw new TileSourceError('tile-limit');
    }
    for (const [sourceId, count] of counts) groups.push({layer: name, sourceId, count});
  }
  groups.sort((a, b) => compare(a.layer, b.layer) || compare(a.sourceId, b.sourceId));
  return { layers: [...layerNames].sort(compare), featureCount, groups };
}

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Scan validated JSON to catch repeated member names that ordinary parsing
 * would otherwise silently replace. Escaped names compare by decoded value.
 * @param {string} text
 */
function uniqueMembers(text) {
  /** @type {(Set<string>|null)[]} */
  const levels = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === '{' || c === '[') {
      if (levels.length >= 48) throw new TileSourceError('registry-limit');
      levels.push(c === '{' ? new Set() : null);
    } else if (c === '}' || c === ']') {
      levels.pop();
    } else if (c === '"') {
      const start = i++;
      while (text.charAt(i) !== '"') {
        if (text.charAt(i) === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (/[ \t\n\r]/u.test(text.charAt(next))) next++;
      if (text.charAt(next) !== ':') continue;
      const keys = levels.at(-1);
      const key = JSON.parse(text.slice(start, i + 1));
      if (keys?.has(key)) throw new TileSourceError('registry-format');
      keys?.add(key);
    }
  }
}

/** @param {unknown} field @param {number} row @param {number} max */
function optionalText(field, row, max) {
  if (field == null || field === '') return UNKNOWN;
  if (typeof field !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\p{Surrogate}/u.test(field)) {
    throw new TileSourceError('registry-format', row);
  }
  if (field.length > max) throw new TileSourceError('registry-limit', row);
  return field.trim() ? field : UNKNOWN;
}

/** @param {unknown} input @param {number} row */
function retrievalDay(input, row) {
  const value = optionalText(input, row, 64);
  if (value === UNKNOWN) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000')) {
    throw new TileSourceError('registry-format', row);
  }
  const day = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== value) {
    throw new TileSourceError('registry-format', row);
  }
  return value;
}

/** @param {string} text @returns {Map<string,RegistrySource>} */
export function parseSourceRegistry(text) {
  if (typeof text !== 'string') throw new TileSourceError('registry-format');
  if (text.length > registryBytesLimit ||
      (text.length > registryBytesLimit / 3 && encoder.encode(text).byteLength > registryBytesLimit)) {
    throw new TileSourceError('registry-limit');
  }
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new TileSourceError('registry-format');
  }
  if (!isRecord(json) || !Array.isArray(json.sources)) throw new TileSourceError('registry-format');
  if (json.sources.length > 10000) throw new TileSourceError('registry-limit');
  uniqueMembers(body);
  /** @type {Map<string,RegistrySource>} */
  const result = new Map();
  for (const [i, entry] of json.sources.entries()) {
    const row = i + 1;
    if (!isRecord(entry)) throw new TileSourceError('registry-format', row);
    const id = optionalText(entry.id, row, maxSourceBytes);
    if (!usableId(id)) throw new TileSourceError('registry-format', row);
    if (encoder.encode(id).byteLength > maxSourceBytes) throw new TileSourceError('registry-limit', row);
    if (result.has(id)) throw new TileSourceError('registry-duplicate', row);
    const tier = entry.tier ?? UNKNOWN;
    if (tier !== UNKNOWN && (!Number.isInteger(tier) || typeof tier !== 'number' || tier < 0 || tier > 4)) {
      throw new TileSourceError('registry-format', row);
    }
    result.set(id, {
      id, tier,
      name: optionalText(entry.name, row, 2048),
      licence: optionalText(entry.licence_id, row, 2048),
      retrievedOn: retrievalDay(entry.retrieved_at, row),
      attribution: optionalText(entry.attribution, row, 8192),
    });
  }
  return result;
}

/** @param {Blob} blob @param {AbortSignal} [signal] */
export async function readSourceRegistry(blob, signal) {
  if (blob.size > registryBytesLimit) throw new TileSourceError('registry-limit');
  if (signal?.aborted) throw new TileSourceError('cancelled');
  let reader;
  try {
    reader = blob.stream().getReader();
  } catch {
    throw new TileSourceError('registry-read');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  /** @type {string[]} */
  const pieces = [];
  let count = 0;
  const stop = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', stop, {once: true});
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (signal?.aborted) throw new TileSourceError('cancelled');
      if (done) break;
      count += value.length;
      if (count > registryBytesLimit) throw new TileSourceError('registry-limit');
      pieces.push(decoder.decode(value, {stream: true}));
    }
    pieces.push(decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof TileSourceError) throw error;
    throw new TileSourceError('registry-read');
  } finally {
    signal?.removeEventListener('abort', stop);
    reader.releaseLock();
  }
  return parseSourceRegistry(pieces.join(''));
}

/** @param {TileSources} tile @param {ReadonlyMap<string,RegistrySource>|null} registry @returns {SourceRow[]} */
export function joinTileSources(tile, registry) {
  return tile.groups.map(group => {
    const source = group.sourceId === UNKNOWN ? undefined : registry?.get(group.sourceId);
    const match = source ? 'matched' : group.sourceId === UNKNOWN ? 'unknown-source' :
      registry ? 'unlisted' : 'no-registry';
    return {
      ...group, match,
      name: source?.name ?? UNKNOWN,
      licence: source?.licence ?? UNKNOWN,
      retrievedOn: source?.retrievedOn ?? UNKNOWN,
      tier: source?.tier ?? UNKNOWN,
      attribution: source?.attribution ?? UNKNOWN,
    };
  });
}
