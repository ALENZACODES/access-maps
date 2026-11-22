// @ts-check

import { gzipMembers, GzipStructureError } from './field-review-gzip.mjs';

/** @typedef {string | number | number[][]} FieldValue */
/**
 * @typedef {object} FieldEvidence
 * @property {FieldValue} value
 * @property {string} source
 * @property {string} licence
 * @property {string} retrievedOn
 * @property {number|'UNKNOWN'} tier
 * @property {string} sourceKey
 * @property {boolean} rawPresent
 * @property {string|number|null} raw
 * @property {boolean|null} derived
 */
/**
 * @typedef {object} FieldRecord
 * @property {string} id
 * @property {string} tranche
 * @property {string} region
 * @property {Record<string,FieldEvidence>} fields
 */
/** @typedef {'format'|'record'|'field'|'duplicate'|'limit'|'encoding'|'compression'|'read'} InputCode */

export class FieldInputError extends Error {
  /** @param {InputCode} code @param {number|null} [row] */
  constructor(code, row = null) {
    super(code);
    this.name = 'FieldInputError';
    this.code = code;
    this.row = row;
  }
}

export const fieldInputLimits = Object.freeze({
  bytes: 32 * 1024 * 1024,
  rows: 25_000,
  fieldsPerRow: 128,
  fields: 250_000,
  pointsPerField: 32_768,
  rowCharacters: 4 * 1024 * 1024,
  depth: 24,
});

const unknown = 'UNKNOWN';
const tranches = new Set(['venue', 'washroom', 'path', 'transit']);
const recordKeys = new Set(['id', 'tranche', 'region', 'fields']);
const evidenceKeys = new Set(['value', 'source_id', 'licence', 'retrieved_at', 'tier', 'source_key', 'raw', 'derived']);
const invalidText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\p{Surrogate}/u;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {number} row @param {boolean} [singleLine] @param {'record'|'field'} [code] */
function textValue(value, row, singleLine = false, code = 'field') {
  if (typeof value !== 'string' || invalidText.test(value) || (singleLine && /[\r\n\t]/u.test(value))) {
    throw new FieldInputError(code, row);
  }
  return value;
}

/** @param {unknown} value @param {number} row */
function evidenceText(value, row) {
  if (value == null) return unknown;
  const text = textValue(value, row, true);
  return text.trim() ? text : unknown;
}

/** @param {unknown} value @param {number} row */
function calendarDate(value, row) {
  const text = evidenceText(value, row);
  if (text === unknown) return unknown;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) || text.startsWith('0000')) {
    throw new FieldInputError('field', row);
  }
  const date = new Date(text + 'T00:00:00Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== text) {
    throw new FieldInputError('field', row);
  }
  return text;
}

/** @param {unknown} value @returns {value is number} */
function exactNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value));
}

/** @param {unknown} value @param {number} row @returns {FieldValue} */
function fieldValue(value, row) {
  if (value == null) return unknown;
  if (typeof value === 'string') return textValue(value, row);
  if (exactNumber(value)) return value;
  if (!Array.isArray(value) || value.length === 0) throw new FieldInputError('field', row);
  if (value.length > fieldInputLimits.pointsPerField) throw new FieldInputError('limit', row);
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 ||
        !exactNumber(pair[0]) || !exactNumber(pair[1])) {
      throw new FieldInputError('field', row);
    }
  }
  return /** @type {number[][]} */ (value);
}

/** @param {unknown} input @param {number} row @returns {FieldEvidence} */
function fieldEvidence(input, row) {
  if (!isObject(input) || Object.keys(input).some(key => !evidenceKeys.has(key))) {
    throw new FieldInputError('field', row);
  }
  const tier = input.tier == null || input.tier === unknown ? unknown : input.tier;
  if (tier !== unknown && (typeof tier !== 'number' || !Number.isInteger(tier) || tier < 0 || tier > 4)) {
    throw new FieldInputError('field', row);
  }
  const raw = input.raw ?? null;
  if (raw !== null && typeof raw !== 'string' && !exactNumber(raw)) {
    throw new FieldInputError('field', row);
  }
  if (typeof raw === 'string') textValue(raw, row);
  const derived = input.derived ?? null;
  if (derived !== null && typeof derived !== 'boolean') throw new FieldInputError('field', row);
  return {
    value: fieldValue(input.value, row),
    source: evidenceText(input.source_id, row),
    licence: evidenceText(input.licence, row),
    retrievedOn: calendarDate(input.retrieved_at, row),
    tier,
    sourceKey: evidenceText(input.source_key, row),
    rawPresent: Object.hasOwn(input, 'raw'),
    raw,
    derived,
  };
}

/**
 * JSON parsers silently keep only the last value for a repeated object member.
 * Walk the already syntactically valid record to reject that ambiguity before
 * comparing values. Decode escaped keys so equivalent spellings compare equal.
 * @param {string} text @param {number} row
 */
function requireUniqueMembers(text, row) {
  /** @type {Array<Set<string>|null>} */
  const stack = [];
  for (let pos = 0; pos < text.length; pos++) {
    const char = text[pos];
    if (char === '{') stack.push(new Set());
    else if (char === '[') stack.push(null);
    else if (char === '}' || char === ']') stack.pop();
    else if (char === '"') {
      const start = pos++;
      let escaped = false;
      while (text[pos] !== '"') {
        if (text[pos] === '\\') {
          pos++;
          escaped = true;
        }
        pos++;
      }
      let next = pos + 1;
      while (next < text.length && /[\t\r\n ]/u.test(text[next] ?? '')) next++;
      if (text[next] === ':') {
        const keys = stack.at(-1);
        const key = escaped ? JSON.parse(text.slice(start, pos + 1)) : text.slice(start + 1, pos);
        if (keys?.has(key)) throw new FieldInputError(stack.length === 1 ? 'record' : 'field', row);
        keys?.add(key);
      }
    }
  }
}

class Snapshot {
  /** @type {FieldRecord[]} */
  records = [];
  /** @type {Map<string,Set<string>>} */
  ids = new Map();
  fields = 0;

  /** @param {string} text @param {number} row */
  add(text, row) {
    if (this.records.length >= fieldInputLimits.rows) throw new FieldInputError('limit', row);
    /** @type {unknown} */
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new FieldInputError('format', row);
    }
    if (!isObject(input) || Object.keys(input).some(key => !recordKeys.has(key))) {
      throw new FieldInputError('record', row);
    }
    const { tranche, fields } = input;
    if (typeof tranche !== 'string' || !tranches.has(tranche) || !isObject(fields)) {
      throw new FieldInputError('record', row);
    }
    const id = textValue(input.id, row, true, 'record');
    const region = textValue(input.region, row, true, 'record');
    if (!id.trim() || id === unknown || !region.trim()) throw new FieldInputError('record', row);
    const keys = Object.keys(fields);
    if (keys.length > fieldInputLimits.fieldsPerRow || this.fields + keys.length > fieldInputLimits.fields) {
      throw new FieldInputError('limit', row);
    }
    requireUniqueMembers(text, row);
    const seen = this.ids.get(tranche) ?? new Set();
    if (seen.has(id)) throw new FieldInputError('duplicate', row);
    /** @type {Record<string,FieldEvidence>} */
    const normalized = Object.create(null);
    for (const key of keys) {
      if (!/^[a-z][a-z0-9_]{0,127}$/u.test(key) || key === 'constructor' || key === 'prototype') {
        throw new FieldInputError('field', row);
      }
      normalized[key] = fieldEvidence(fields[key], row);
    }
    seen.add(id);
    this.ids.set(tranche, seen);
    this.fields += keys.length;
    this.records.push({ id, region, tranche, fields: normalized });
  }
}

/**
 * Frame one record at a time, including across input chunks. Quoted braces,
 * escaped quotes, pretty-printed arrays and split CRLF line endings all keep
 * their original meaning. A compressed file never needs a full decoded copy.
 */
class RecordFramer {
  snapshot = new Snapshot();
  /** @type {'start'|'first'|'next'|'comma'|'after'|'done'} */
  mode = 'start';
  inArray = false;
  afterNewline = false;
  depth = 0;
  string = false;
  escape = false;
  line = 1;
  lastCR = false;
  number = 0;
  row = 0;
  length = 0;
  /** @type {string[]} */
  fragments = [];

  /** @param {string} part */
  append(part) {
    this.length += part.length;
    if (this.length > fieldInputLimits.rowCharacters) throw new FieldInputError('limit', this.row);
    this.fragments.push(part);
  }

  /** @param {string} chunk */
  feed(chunk) {
    if (!chunk.length) return;
    let start = this.depth ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charAt(i);
      const physicalLine = this.line;
      if (c === '\r' || (c === '\n' && !this.lastCR)) this.line++;
      this.lastCR = c === '\r';
      if (!this.depth) {
        if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
          if (c === '\n' || c === '\r') this.afterNewline = true;
          continue;
        }
        if (this.mode === 'start' && c === '[') {
          this.inArray = true;
          this.mode = 'first';
          continue;
        }
        if ((this.mode === 'comma' || this.mode === 'first') && c === ']') {
          this.mode = 'done';
          continue;
        }
        if (this.mode === 'comma' && c === ',') {
          this.mode = 'next';
          continue;
        }
        const position = this.inArray ? this.number + 1 : physicalLine;
        if (c !== '{' || this.mode === 'done' || this.mode === 'comma' ||
            (this.mode === 'after' && !this.afterNewline)) {
          throw new FieldInputError('format', position);
        }
        this.row = position;
        this.number++;
        start = i;
        this.depth = 1;
        this.afterNewline = false;
        continue;
      }
      if (this.string) {
        if (this.escape) this.escape = false;
        else if (c === '\\') this.escape = true;
        else if (c === '"') this.string = false;
        continue;
      }
      if (c === '"') this.string = true;
      else if (c === '{' || c === '[') {
        this.depth++;
        if (this.depth > fieldInputLimits.depth) throw new FieldInputError('limit', this.row);
      } else if (c === '}' || c === ']') {
        this.depth--;
        if (!this.depth) {
          this.append(chunk.slice(start, i + 1));
          this.snapshot.add(this.fragments.join(''), this.row);
          this.fragments = [];
          this.length = 0;
          this.mode = this.inArray ? 'comma' : 'after';
          start = -1;
        }
      }
    }
    if (start >= 0) this.append(chunk.slice(start));
  }

  finish() {
    if (this.depth) throw new FieldInputError('format', this.row);
    if (this.mode === 'start') throw new FieldInputError('format');
    if (this.inArray && this.mode !== 'done') throw new FieldInputError('format', this.number + 1);
    return this.snapshot.records;
  }
}

/** @param {string} text @returns {FieldRecord[]} */
export function parseFieldSnapshot(text) {
  if (typeof text !== 'string') throw new FieldInputError('format');
  const cap = fieldInputLimits.bytes;
  // A UTF-16 code unit needs at most three UTF-8 bytes. Avoid allocating a
  // second, encoded copy of small snapshots just to test the budget.
  if (text.length > cap || (text.length > cap / 3 && new Blob([text]).size > cap)) {
    throw new FieldInputError('limit');
  }
  const framer = new RecordFramer();
  framer.feed(text.startsWith('\uFEFF') ? text.slice(1) : text);
  return framer.finish();
}

/**
 * @param {Blob} file
 * @param {boolean} compressed
 * @param {AbortSignal|undefined} signal
 * @returns {AsyncGenerator<ReadableStream<Uint8Array>>}
 */
async function* inputStreams(file, compressed, signal) {
  if (!compressed) {
    yield file.stream();
    return;
  }
  if (typeof DecompressionStream !== 'function') throw new FieldInputError('compression');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const members = gzipMembers(bytes, fieldInputLimits.bytes);
  for (const { start, end } of members) {
    if (signal?.aborted) throw new FieldInputError('read');
    yield file.slice(start, end).stream().pipeThrough(new DecompressionStream('gzip'));
  }
}

/** @param {Blob} file @param {AbortSignal} [signal] @returns {Promise<FieldRecord[]>} */
export async function readFieldSnapshot(file, signal) {
  if (signal?.aborted) throw new FieldInputError('read');
  if (file.size > fieldInputLimits.bytes) throw new FieldInputError('limit');
  let compressed = false;
  try {
    const prefix = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (signal?.aborted) throw new FieldInputError('read');
    compressed = prefix[0] === 0x1f && prefix[1] === 0x8b;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const framer = new RecordFramer();
    let bytes = 0;
    /** @param {Uint8Array} [chunk] */
    const decode = chunk => {
      try {
        return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode();
      } catch {
        throw new FieldInputError('encoding');
      }
    };
    for await (const input of inputStreams(file, compressed, signal)) {
      const reader = input.getReader();
      const abort = () => { void reader.cancel().catch(() => {}); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (signal?.aborted) throw new FieldInputError('read');
        for (;;) {
          const part = await reader.read();
          if (signal?.aborted) throw new FieldInputError('read');
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > fieldInputLimits.bytes) throw new FieldInputError('limit');
          framer.feed(decode(part.value));
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        signal?.removeEventListener('abort', abort);
        reader.releaseLock();
      }
    }
    framer.feed(decode());
    return framer.finish();
  } catch (error) {
    if (error instanceof FieldInputError) throw error;
    if (error instanceof GzipStructureError) throw new FieldInputError(error.code);
    throw new FieldInputError(compressed ? 'compression' : 'read');
  }
}
