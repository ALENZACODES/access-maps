// @ts-check

/**
 * Locate complete members by walking their compressed blocks. A signature may
 * occur inside ordinary compressed bytes, so looking for the next header could
 * silently cut a valid record. No decompressed payload is allocated here.
 * The caller passes each resulting slice to the native reader for inflation
 * and checksum validation. Bit layout follows RFC 1951 and RFC 1952.
 */
export class GzipStructureError extends Error {
  /** @param {'compression'|'limit'} [code] */
  constructor(code = 'compression') {
    super(code);
    this.code = code;
  }
}

export const gzipLimits = Object.freeze({ members: 512, blocks: 16_384 });

class Bits {
  /** @param {Uint8Array} data @param {number} start */
  constructor(data, start) {
    this.data = data;
    this.position = start * 8;
  }

  /** @param {number} width */
  peek(width) {
    if (this.position + width > this.data.length * 8) throw new GzipStructureError();
    const at = Math.floor(this.position / 8);
    const word = (this.data[at] ?? 0) | ((this.data[at + 1] ?? 0) << 8) | ((this.data[at + 2] ?? 0) << 16);
    return (word >>> (this.position % 8)) & ((1 << width) - 1);
  }

  /** @param {number} width */
  read(width) {
    const value = this.peek(width);
    this.position += width;
    return value;
  }
}

/**
 * The first nine bits cover common codes in constant time. Longer codes are
 * decoded by length. This keeps the table bounded even for short blocks which
 * declare a long code. Compressed bits are never replayed between blocks.
 */
class Codebook {
  /** @param {number[]} lengths */
  constructor(lengths) {
    this.max = Math.max(...lengths);
    const counts = new Uint16Array(16);
    for (const len of lengths) if (len) counts[len] = (counts[len] ?? 0) + 1;
    this.first = new Uint16Array(16);
    this.symbols = Array.from({ length: 16 }, () => /** @type {number[]} */ ([]));
    this.width = Math.min(9, this.max);
    this.table = new Uint16Array(1 << this.width);
    let next = 0;
    for (let len = 1; len <= this.max; len++) {
      next = (next + (counts[len - 1] ?? 0)) * 2;
      if (next + (counts[len] ?? 0) > (1 << len)) throw new GzipStructureError();
      this.first[len] = next;
    }
    for (const [symbol, len] of lengths.entries()) {
      if (!len) continue;
      const group = /** @type {number[]} */ (this.symbols[len]);
      const code = (this.first[len] ?? 0) + group.length;
      group.push(symbol);
      if (len > this.width) continue;
      let prefix = 0;
      for (let bit = 0; bit < len; bit++) prefix = (prefix << 1) | ((code >>> bit) & 1);
      for (let i = prefix; i < this.table.length; i += 1 << len) {
        this.table[i] = (symbol << 4) | len;
      }
    }
  }

  /** @param {Bits} bits */
  decode(bits) {
    const packed = this.table[bits.peek(this.width)] ?? 0;
    if (packed) {
      bits.position += packed & 15;
      return packed >>> 4;
    }
    let code = 0;
    for (let len = 1; len <= this.max; len++) {
      code = (code << 1) | bits.read(1);
      const ordinal = code - (this.first[len] ?? 0);
      const symbol = this.symbols[len]?.[ordinal];
      if (symbol !== undefined) return symbol;
    }
    throw new GzipStructureError();
  }
}

const fixedLetters = new Codebook(Array.from({ length: 288 }, (_, s) =>
  s < 144 ? 8 : s < 256 ? 9 : s < 280 ? 7 : 8));
const fixedDistances = new Codebook(Array(32).fill(5));
const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** @param {Bits} bits */
function dynamicBookPair(bits) {
  const letters = bits.read(5) + 257;
  const distances = bits.read(5) + 1;
  const count = bits.read(4) + 4;
  if (letters > 286) throw new GzipStructureError();
  const meta = Array(19).fill(0);
  for (const index of order.slice(0, count)) meta[index] = bits.read(3);
  const lengthsBook = new Codebook(meta);
  /** @type {number[]} */
  const lengths = [];
  while (lengths.length < letters + distances) {
    const symbol = lengthsBook.decode(bits);
    if (symbol < 16) {
      lengths.push(symbol);
      continue;
    }
    const length = symbol === 16 ? lengths.at(-1) : 0;
    if (length === undefined) throw new GzipStructureError();
    const times = symbol === 16 ? 3 + bits.read(2) : symbol === 17 ? 3 + bits.read(3) : 11 + bits.read(7);
    if (lengths.length + times > letters + distances) throw new GzipStructureError();
    for (let i = 0; i < times; i++) lengths.push(length);
  }
  if (!lengths[256]) throw new GzipStructureError();
  return [new Codebook(lengths.slice(0, letters)), new Codebook(lengths.slice(letters))];
}

/** @param {number} symbol @param {Bits} bits */
function matchLength(symbol, bits) {
  if (symbol < 265) return symbol - 254;
  if (symbol === 285) return 258;
  if (symbol > 285) throw new GzipStructureError();
  const extra = (symbol - 261) >> 2;
  return 3 + ((4 + ((symbol - 265) % 4)) << extra) + bits.read(extra);
}

/** @param {number} symbol @param {Bits} bits */
function distance(symbol, bits) {
  if (symbol < 4) return symbol + 1;
  if (symbol > 29) throw new GzipStructureError();
  const extra = (symbol >> 1) - 1;
  return 1 + ((2 + (symbol & 1)) << extra) + bits.read(extra);
}

/** @param {Uint8Array} bytes @param {number} start @param {number} budget @param {{remaining:number}} work */
function blocks(bytes, start, budget, work) {
  const bits = new Bits(bytes, start);
  let output = 0;
  let final;
  do {
    if (work.remaining-- <= 0) throw new GzipStructureError('limit');
    final = bits.read(1);
    const type = bits.read(2);
    if (type === 0) {
      bits.position = Math.ceil(bits.position / 8) * 8;
      const count = bits.read(16);
      if ((count ^ bits.read(16)) !== 0xffff) throw new GzipStructureError();
      bits.position += count * 8;
      if (bits.position > bytes.length * 8) throw new GzipStructureError();
      output += count;
    } else {
      if (type === 3) throw new GzipStructureError();
      let letters = fixedLetters;
      let distances = fixedDistances;
      if (type === 2) {
        const [literalBook, distanceBook] = dynamicBookPair(bits);
        if (!literalBook || !distanceBook) throw new GzipStructureError();
        letters = literalBook;
        distances = distanceBook;
      }
      for (;;) {
        const symbol = letters.decode(bits);
        if (symbol === 256) break;
        if (symbol < 256) {
          output++;
        } else {
          const length = matchLength(symbol, bits);
          if (distance(distances.decode(bits), bits) > output) throw new GzipStructureError();
          output += length;
        }
        if (output > budget) throw new GzipStructureError('limit');
      }
    }
    if (output > budget) throw new GzipStructureError('limit');
  } while (!final);
  return { output, end: Math.ceil(bits.position / 8) };
}

/** @param {Uint8Array} data @param {number} start */
function afterHeader(data, start) {
  const flags = data[start + 3] ?? 0;
  if (start + 10 > data.length || data[start] !== 0x1f || data[start + 1] !== 0x8b ||
      data[start + 2] !== 8 || (flags & 0xe0)) throw new GzipStructureError();
  let cursor = start + 10;
  if (flags & 4) cursor += 2 + ((data[cursor] ?? 0) | ((data[cursor + 1] ?? 0) << 8));
  for (const flag of [8, 16]) {
    if (!(flags & flag)) continue;
    const nul = data.indexOf(0, cursor);
    if (nul < 0) throw new GzipStructureError();
    cursor = nul + 1;
  }
  if (flags & 2) cursor += 2;
  if (cursor >= data.length) throw new GzipStructureError();
  return cursor;
}

/**
 * @param {Uint8Array} data
 * @param {number} budget Maximum decoded bytes across all members.
 * @returns {Generator<{start:number,end:number}>}
 */
export function* gzipMembers(data, budget) {
  let cursor = 0;
  let count = 0;
  const work = { remaining: gzipLimits.blocks };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  do {
    if (++count > gzipLimits.members) throw new GzipStructureError('limit');
    const start = cursor;
    const block = blocks(data, afterHeader(data, start), budget, work);
    cursor = block.end + 8;
    if (cursor > data.length || view.getUint32(block.end + 4, true) !== block.output) {
      throw new GzipStructureError();
    }
    budget -= block.output;
    yield { start, end: cursor };
  } while (cursor < data.length);
}
