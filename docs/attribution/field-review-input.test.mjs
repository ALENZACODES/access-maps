// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { FieldInputError, fieldInputLimits, parseFieldSnapshot, readFieldSnapshot } from './field-review-input.mjs';

/** @typedef {import('./field-review-input.mjs').InputCode} InputCode */

/** @param {Record<string,unknown>} [changes] */
function evidence(changes = {}) {
  return {
    value: 'yes',
    source_id: 'source-a',
    licence: 'terms-a',
    retrieved_at: '2024-02-29',
    tier: 0,
    source_key: 'field-a',
    raw: 'Y',
    derived: false,
    ...changes,
  };
}

/** @param {Record<string,unknown>} [fields] @param {Record<string,unknown>} [changes] */
function record(fields = { entrance: evidence() }, changes = {}) {
  return { id: 'item-a', tranche: 'venue', region: 'area-a', fields, ...changes };
}

/** @param {string} input */
function first(input) {
  const result = parseFieldSnapshot(input);
  assert.equal(result.length, 1);
  assert.ok(result[0]);
  return result[0];
}

/** @param {Record<string,unknown>} input */
function singleEvidence(input) {
  const result = first(JSON.stringify(record({ entrance: input })));
  assert.ok(result.fields.entrance);
  return result.fields.entrance;
}

/** @param {InputCode} code @param {number|null} row */
function fails(code, row) {
  return (/** @type {unknown} */ err) => {
    assert.ok(err instanceof FieldInputError);
    assert.equal(err.code, code);
    assert.equal(err.row, row);
    assert.equal(err.message, code);
    return true;
  };
}

test('converts nested published evidence to independently accessible field metadata', () => {
  const input = record({
    entrance: evidence(),
    width: evidence({ value: 0, source_id: 'source-b', tier: 4, derived: true }),
  });
  const result = first(JSON.stringify(input));
  assert.equal(result.id, 'item-a');
  assert.equal(result.region, 'area-a');
  assert.equal(result.tranche, 'venue');
  assert.deepEqual(result.fields.entrance, {
    value: 'yes', source: 'source-a', licence: 'terms-a',
    retrievedOn: '2024-02-29', tier: 0, sourceKey: 'field-a',
    rawPresent: true, raw: 'Y', derived: false,
  });
  assert.deepEqual(result.fields.width, {
    value: 0, source: 'source-b', licence: 'terms-a',
    retrievedOn: '2024-02-29', tier: 4, sourceKey: 'field-a',
    rawPresent: true, raw: 'Y', derived: true,
  });
  assert.equal(Object.getPrototypeOf(result.fields), null);
});

test('omitted evidence stays unknown with a distinct absence marker for optional raw input', () => {
  assert.deepEqual(singleEvidence({}), {
    value: 'UNKNOWN', source: 'UNKNOWN', licence: 'UNKNOWN',
    retrievedOn: 'UNKNOWN', tier: 'UNKNOWN', sourceKey: 'UNKNOWN',
    rawPresent: false, raw: null, derived: null,
  });
  const explicit = singleEvidence({ value: 'UNKNOWN', source_id: null, licence: '',
    retrieved_at: 'UNKNOWN', tier: 'UNKNOWN', raw: null });
  assert.equal(explicit.rawPresent, true);
  assert.equal(explicit.raw, null);
  assert.equal(explicit.source, 'UNKNOWN');
  assert.equal(explicit.retrievedOn, 'UNKNOWN');
  assert.equal(explicit.licence, 'UNKNOWN');
});

test('numeric zero, text zero and empty published tokens survive without coercion', () => {
  const numeric = singleEvidence({ value: 0, raw: 0 });
  assert.equal(numeric.value, 0);
  assert.equal(numeric.raw, 0);
  const textual = singleEvidence({ value: '0', raw: '0' });
  assert.equal(textual.value, '0');
  assert.equal(textual.raw, '0');
  const spaces = singleEvidence({ value: ' \t ', raw: '', source_key: ' untrimmed ' });
  assert.equal(spaces.value, ' \t ');
  assert.equal(spaces.raw, '');
  assert.equal(spaces.sourceKey, ' untrimmed ');
});

test('preserves spelling, case and normalization of imported strings', () => {
  const value = '  Accès\r\nentre\t« deux »  ';
  const original = 'acce\u0300s';
  const normalized = singleEvidence({ value, source_key: original, raw: original });
  assert.equal(normalized.value, value);
  assert.equal(normalized.sourceKey, original);
  assert.equal(normalized.raw, original);
});

test('accepts finite coordinate pairs in their supplied order including repeats', () => {
  const value = [[-2.125, 0], [-2.125, 0], [-1, 3.5]];
  assert.deepEqual(singleEvidence({ value }).value, value);
  assert.deepEqual(singleEvidence({ value: [[1, 1]] }).value, [[1, 1]]);
});

test('retains an empty fields collection instead of manufacturing evidence', () => {
  const row = first(JSON.stringify(record({})));
  assert.deepEqual(Object.keys(row.fields), []);
  assert.equal(row.fields.entrance, undefined);
});

test('one array can contain the same source identifier in all four layers', () => {
  const layers = ['path', 'transit', 'venue', 'washroom'];
  const inputs = layers.map(tranche => record({}, { tranche }));
  assert.deepEqual(parseFieldSnapshot(JSON.stringify(inputs)).map(row => row.tranche), layers);
});

test('duplicate identities fail when the region or field set changes', () => {
  const original = record({ entrance: evidence() });
  const other = record({ ramp: evidence() }, { region: 'area-b' });
  assert.throws(() => parseFieldSnapshot(JSON.stringify([original, other])), fails('duplicate', 2));
  const text = '\r\n' + JSON.stringify(original) + '\r\n \r\n' + JSON.stringify(other);
  assert.throws(() => parseFieldSnapshot(text), fails('duplicate', 4));
  assert.equal(parseFieldSnapshot(JSON.stringify(other)).length, 1);
});

test('empty arrays succeed and whitespace-only inputs cannot masquerade as empty snapshots', () => {
  assert.deepEqual(parseFieldSnapshot('\uFEFF \r\n[ \t ]\n'), []);
  assert.throws(() => parseFieldSnapshot(''), fails('format', null));
  assert.throws(() => parseFieldSnapshot('\uFEFF\r\n\t '), fails('format', null));
});

test('accepts an indented single object and arrays with indentation and blank lines', () => {
  const one = record();
  const two = record({}, { id: 'item-b' });
  const pretty = JSON.stringify(one, null, 2);
  assert.equal(first('\n\t' + pretty + '\n').id, 'item-a');
  const rows = parseFieldSnapshot('[\n  ' + pretty + ',\r\n' + JSON.stringify(two, null, 2) + '\n]');
  assert.deepEqual(rows.map(row => row.id), ['item-a', 'item-b']);
});

test('NDJSON positions follow physical lines with blank lines, CRLF and a final missing newline', () => {
  const text = JSON.stringify(record());
  const invalid = JSON.stringify(record({}, { region: 3 }));
  assert.throws(() => parseFieldSnapshot('\n' + text + '\r\n\r\n\t\r' + invalid), fails('record', 5));
  const pretty = JSON.stringify(record(), null, 2);
  const count = pretty.split('\n').length;
  assert.throws(() => parseFieldSnapshot(pretty + '\n' + invalid), fails('record', count + 1));
});

test('array errors use element positions even with many physical lines', () => {
  const good = JSON.stringify(record(), null, 2);
  const bad = JSON.stringify(record({ a: { value: [1, 2] } }, { id: 'item-b' }), null, 2);
  assert.throws(() => parseFieldSnapshot('[\n\n' + good + ',\n' + bad + '\n]'), fails('field', 2));
});

test('rejects invalid separators, unexpected input after an array and truncated objects', () => {
  const one = JSON.stringify(record());
  assert.throws(() => parseFieldSnapshot(one + ' ' + one), fails('format', 1));
  assert.throws(() => parseFieldSnapshot('[' + one + ',]'), fails('format', 2));
  assert.throws(() => parseFieldSnapshot('[' + one + ' ' + one + ']'), fails('format', 2));
  assert.throws(() => parseFieldSnapshot('[]\n' + one), fails('format', 1));
  assert.throws(() => parseFieldSnapshot('\n{"id":'), fails('format', 2));
  assert.throws(() => parseFieldSnapshot('[' + one), fails('format', 2));
  assert.throws(() => parseFieldSnapshot('{"id":"x",}'), fails('format', 1));
});

test('quoted delimiters and escaped backslashes are content inside the source value', () => {
  const value = '[{ "quoted": "}{" }, "\\\\" ] : " raw = {}';
  assert.equal(singleEvidence({ value }).value, value);
  const records = [record({ shape: evidence({ value }) }), record({}, { id: '[id]}' })];
  assert.deepEqual(parseFieldSnapshot(JSON.stringify(records)).map(row => row.id), ['item-a', '[id]}']);
});

test('ambiguous duplicate keys fail even when one spelling uses a character escape', () => {
  const text = JSON.stringify(record());
  assert.throws(() => parseFieldSnapshot(text.replace('"id":', '"id":"first","id":')), fails('record', 1));
  assert.throws(() => parseFieldSnapshot(text.replace('"tier":0', '"tier":4,"ti\\u0065r":0')), fails('field', 1));
  assert.throws(() => parseFieldSnapshot(text.replace('"entrance":', '"entrance":{},"entrance":')), fails('field', 1));
  const keyLikeText = '\"tier\":4,\"tier\":0';
  assert.equal(singleEvidence({ value: keyLikeText }).value, keyLikeText);
});

test('identity and field shape errors do not construct partial records', () => {
  for (const changes of [{ id: '' }, { id: 'UNKNOWN' }, { id: 'x\ny' }, { region: null },
    { tranche: 'other' }, { fields: [] }, { fields: null }, { extra: true }]) {
    assert.throws(() => parseFieldSnapshot(JSON.stringify(record({}, changes))), fails('record', 1));
  }
  assert.throws(() => first(JSON.stringify(record({ ramp: false }))), fails('field', 1));
  assert.throws(() => first(JSON.stringify(record({ ramp: { value: 'yes', note: 'x' } }))), fails('field', 1));
});

test('reserved and malformed field keys are rejected before indexing', () => {
  for (const key of ['__proto__', 'prototype', 'constructor', '', 'x/y', 'with space']) {
    assert.throws(() => first(JSON.stringify(record({ [key]: evidence() }))), fails('field', 1));
  }
  assert.equal(singleEvidence({ source_id: 'constructor' }).source, 'constructor');
});

test('matches real calendar dates including century leap-year rules', () => {
  for (const date of ['2000-02-29', '0001-01-01', '9999-12-31']) {
    assert.equal(singleEvidence({ retrieved_at: date }).retrievedOn, date);
  }
  for (const date of ['1900-02-29', '2025-02-29', '2023-11-31', '2024-04-00', ' 2024-02-29', '0000-01-01', 0]) {
    assert.throws(() => singleEvidence({ retrieved_at: date }), fails('field', 1));
  }
});

test('tier, original token and derivation flags have separate scalar types', () => {
  for (const tier of [0, 1, 2, 3, 4]) assert.equal(singleEvidence({ tier }).tier, tier);
  for (const tier of [-1, 5, 0.5, '1', false, {}]) {
    assert.throws(() => singleEvidence({ tier }), fails('field', 1));
  }
  for (const raw of [[], {}, true]) {
    assert.throws(() => singleEvidence({ raw }), fails('field', 1));
  }
  for (const derived of [0, 'false', {}]) {
    assert.throws(() => singleEvidence({ derived }), fails('field', 1));
  }
});

test('rejects malformed positions, nonfinite coefficients and unsupported value types', () => {
  for (const value of [true, {}, [], [1, 2], [[1]], [[1, 2, 3]], [[null, 1]], [['1', 2]]]) {
    assert.throws(() => singleEvidence({ value }), fails('field', 1));
  }
  const overflow = JSON.stringify(record({ width: { value: 999 } })).replace('999', '1e999');
  assert.throws(() => parseFieldSnapshot(overflow), fails('field', 1));
  const rawOverflow = JSON.stringify(record({ width: { raw: 999 } })).replace('999', '-1e999');
  assert.throws(() => parseFieldSnapshot(rawOverflow), fails('field', 1));
});

test('rejects broken text encodings and unprintable controls without normalizing valid punctuation', () => {
  for (const value of ['\u0000', '\u0007', '\ud800', '\udc00']) {
    assert.throws(() => singleEvidence({ value }), fails('field', 1));
  }
  assert.throws(() => singleEvidence({ licence: 'one\ntwo' }), fails('field', 1));
  assert.equal(singleEvidence({ value: '✓ — 𐀀' }).value, '✓ — 𐀀');
});

/**
 * A local file whose stream is segmented independently of its stored bytes.
 * Small chunks exercise text, quote and frame boundaries directly.
 * @param {Uint8Array<ArrayBuffer>} bytes @param {number} width
 */
function chunkFile(bytes, width) {
  const file = new Blob([bytes]);
  Object.defineProperty(file, 'stream', {
    value: () => {
      let position = 0;
      return new ReadableStream({
        pull(controller) {
          if (position === bytes.length) controller.close();
          else {
            const end = Math.min(bytes.length, position + width);
            controller.enqueue(bytes.subarray(position, end));
            position = end;
          }
        },
      });
    },
  });
  return file;
}

test('local text reader handles a split BOM, a multibyte value, escapes and mixed line endings', async () => {
  const a = record({ note: evidence({ value: 'Accès\n\"entrée\" 🪜' }) });
  const b = record({}, { id: 'item-b' });
  const text = '\uFEFF\r\n' + JSON.stringify(a) + '\r\n\r\n' + JSON.stringify(b);
  const bytes = new TextEncoder().encode(text);
  const rows = await readFieldSnapshot(chunkFile(bytes, 1));
  assert.deepEqual(rows, parseFieldSnapshot(text));
});

test('gzip bytes are recognized from their signature even without a filename or media type', async () => {
  const text = JSON.stringify([record({}, { tranche: 'transit' }), record({}, { tranche: 'venue' })]);
  const gzip = Uint8Array.from(gzipSync(text));
  assert.deepEqual(await readFieldSnapshot(chunkFile(gzip, 3)), parseFieldSnapshot(text));
  assert.deepEqual(await readFieldSnapshot(new Blob([text], { type: 'application/gzip' })), parseFieldSnapshot(text));
});

test('rejects invalid UTF-8 at both midstream and decoder flush', async () => {
  const text = new TextEncoder().encode(JSON.stringify(record()));
  const invalid = Uint8Array.from([...text, 0x20, 0xff]);
  await assert.rejects(() => readFieldSnapshot(chunkFile(invalid, 2)), fails('encoding', null));
  const unfinished = Uint8Array.from([...text, 0x20, 0xe2, 0x82]);
  await assert.rejects(() => readFieldSnapshot(chunkFile(unfinished, 1)), fails('encoding', null));
});

test('a damaged compressed footer invalidates the whole file after intact records', async () => {
  const zip = Uint8Array.from(gzipSync(JSON.stringify(record())));
  zip[zip.length - 1] = 1;
  await assert.rejects(() => readFieldSnapshot(new Blob([zip])), fails('compression', null));
  await assert.rejects(() => readFieldSnapshot(new Blob([new Uint8Array([31, 139])])), fails('compression', null));
});

test('stream and prefix read failures have a stable error code', async () => {
  const broken = new Blob(['{}']);
  Object.defineProperty(broken, 'stream', { value: () => new ReadableStream({
    start(controller) { controller.error(new Error('read stopped')); },
  }) });
  await assert.rejects(() => readFieldSnapshot(broken), fails('read', null));
  const unavailable = new Blob(['{}']);
  Object.defineProperty(unavailable, 'slice', { value: () => { throw new Error('unavailable'); } });
  await assert.rejects(() => readFieldSnapshot(unavailable), fails('read', null));
});

test('a syntax failure cancels the unread stream', async () => {
  let cancelled = false;
  const broken = new Blob(['#']);
  Object.defineProperty(broken, 'stream', { value: () => new ReadableStream({
    start(controller) { controller.enqueue(Uint8Array.of(35)); },
    cancel() { cancelled = true; },
  }) });
  await assert.rejects(() => readFieldSnapshot(broken), fails('format', 1));
  assert.equal(cancelled, true);
});

test('limits incoming files before opening a stream or examining a prefix', async () => {
  const file = new Blob();
  let opened = false;
  Object.defineProperties(file, {
    size: { value: fieldInputLimits.bytes + 1 },
    slice: { value: () => { opened = true; throw new Error('too soon'); } },
  });
  await assert.rejects(() => readFieldSnapshot(file), fails('limit', null));
  assert.equal(opened, false);
});

test('decompressed bytes are counted even when the entire payload contains only whitespace', async () => {
  const buffer = Buffer.alloc(fieldInputLimits.bytes + 1, 32);
  const zipped = Uint8Array.from(gzipSync(buffer));
  assert.ok(zipped.byteLength < fieldInputLimits.bytes);
  await assert.rejects(() => readFieldSnapshot(new Blob([zipped])), fails('limit', null));
});

test('per-record fan-out and nested input budgets fail at a located record', () => {
  const fields = Object.fromEntries(Array.from({ length: fieldInputLimits.fieldsPerRow + 1 }, (_, i) => ['a' + i, {}]));
  assert.throws(() => first(JSON.stringify(record(fields))), fails('limit', 1));
  const deep = '{"fields":' + '['.repeat(fieldInputLimits.depth + 1) + ']'.repeat(fieldInputLimits.depth + 1) + '}';
  assert.throws(() => parseFieldSnapshot('\n' + deep), fails('limit', 2));
  const oversize = JSON.stringify(record({ note: { value: 'x'.repeat(fieldInputLimits.rowCharacters) } }));
  assert.throws(() => parseFieldSnapshot(oversize), fails('limit', 1));
});

test('coordinate and row limits apply independently of field counts', () => {
  const shape = Array.from({ length: fieldInputLimits.pointsPerField + 1 }, () => [1, 2]);
  assert.throws(() => singleEvidence({ value: shape }), fails('limit', 1));
  const rows = Array.from({ length: fieldInputLimits.rows + 1 }, (_, i) => record({}, { id: String(i) }));
  assert.throws(() => parseFieldSnapshot(JSON.stringify(rows)), fails('limit', fieldInputLimits.rows + 1));
});

test('aborting during a pending read cancels it without returning partial records', async () => {
  const controller = new AbortController();
  const file = new Blob(['{}']);
  let cancelled = false;
  Object.defineProperty(file, 'stream', { value: () => new ReadableStream({
    start(sink) {
      sink.enqueue(new TextEncoder().encode(JSON.stringify(record()) + '\n'));
      setTimeout(() => controller.abort(), 0);
    },
    cancel() { cancelled = true; },
  }) });
  await assert.rejects(() => readFieldSnapshot(file, controller.signal), fails('read', null));
  assert.equal(cancelled, true);
});

test('an already abandoned file never opens its prefix or stream', async () => {
  const signal = AbortSignal.abort();
  const file = new Blob();
  let opened = false;
  Object.defineProperty(file, 'slice', { value: () => { opened = true; return file; } });
  await assert.rejects(() => readFieldSnapshot(file, signal), fails('read', null));
  assert.equal(opened, false);
});

test('one UTF-8 code point and one record can span independently compressed members', async () => {
  const input = JSON.stringify(record({ note: evidence({ value: 'entrée' }) }));
  const bytes = Buffer.from(input + '\r\n');
  const cut = bytes.indexOf(Buffer.from('é')) + 1;
  assert.ok(cut > 1);
  const combined = Buffer.concat([
    gzipSync(bytes.subarray(0, cut)), gzipSync(''), gzipSync(bytes.subarray(cut)),
    gzipSync(JSON.stringify(record({}, { id: 'item-b' }))),
  ]);
  const result = await readFieldSnapshot(new Blob([Uint8Array.from(combined)]));
  assert.deepEqual(result.map(row => row.id), ['item-a', 'item-b']);
  assert.equal(result[0]?.fields.note?.value, 'entrée');
});

test('a corrupted checksum in a later member invalidates earlier complete records', async () => {
  const a = gzipSync(JSON.stringify(record()) + '\n');
  const b = gzipSync(JSON.stringify(record({}, { id: 'item-b' })));
  const crcOffset = b.length - 8;
  b[crcOffset] = (b[crcOffset] ?? 0) ^ 128;
  const combined = Uint8Array.from(Buffer.concat([a, b]));
  await assert.rejects(() => readFieldSnapshot(new Blob([combined])), fails('compression', null));
});

test('unsafe integral JSON values cannot collapse two distinct source tokens into a match', () => {
  for (const change of [{ value: 999 }, { raw: 999 }, { value: [[1, 999]] }]) {
    const text = JSON.stringify(record({ width: change })).replace('999', '9007199254740993');
    assert.throws(() => parseFieldSnapshot(text), fails('field', 1));
  }
  assert.equal(singleEvidence({ value: Number.MAX_SAFE_INTEGER }).value, Number.MAX_SAFE_INTEGER);
  assert.equal(singleEvidence({ value: '9007199254740993' }).value, '9007199254740993');
});
