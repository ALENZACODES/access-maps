// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { inputLimits, NoticeInputError, parseNotices, readNoticeFile } from './notice-calendar-input.mjs';

/** @param {Record<string, unknown>} [changes] */
function bulletin(changes = {}) {
  return {
    id: 'notice-17',
    source_id: 'source-2',
    licence: 'licence-8',
    retrieved_at: '2024-02-29',
    tier: 4,
    feed_timestamp: 1709164800,
    entity_id: '17',
    effect: 'ACCESSIBILITY_ISSUE',
    equipment: 'elevator',
    header_text: 'Scheduled inspection',
    header_language: 'en',
    stop_ids: ['s-1', 's-3'],
    route_ids: ['r-5'],
    active_periods: [{ start: 1709164800, end: 1709251200 }],
    cause: 'MAINTENANCE',
    ...changes,
  };
}

/** @param {string} code @param {number|null} [row] */
function issue(code, row = null) {
  return (/** @type {unknown} */ error) =>
    error instanceof NoticeInputError && error.code === code && error.row === row;
}

/** @param {Record<string, unknown>} changes */
function readOne(changes) {
  const notice = parseNotices(JSON.stringify(bulletin(changes)))[0];
  assert.ok(notice);
  return notice;
}

test('adapts a complete snapshot row and keeps provenance alongside its period', () => {
  assert.deepEqual(readOne({}), {
    id: 'notice-17',
    source: 'source-2',
    licence: 'licence-8',
    retrievedOn: '2024-02-29',
    tier: 4,
    header: 'Scheduled inspection',
    language: 'en',
    equipment: 'elevator',
    stops: ['s-1', 's-3'],
    routes: ['r-5'],
    periods: [{ start: 1709164800, end: 1709251200 }],
  });
});

test('missing fields carry no inferred text, time, tier, equipment or references', () => {
  assert.deepEqual(parseNotices('{"id":"a"}'), [{
    id: 'a',
    source: 'UNKNOWN',
    licence: 'UNKNOWN',
    retrievedOn: 'UNKNOWN',
    tier: 'UNKNOWN',
    header: 'UNKNOWN',
    language: 'UNKNOWN',
    equipment: 'UNKNOWN',
    stops: [],
    routes: [],
    periods: [],
  }]);
});

test('null and explicit unknown representations also leave fields unknown', () => {
  const notice = readOne({
    source_id: ' ',
    licence: null,
    retrieved_at: 'UNKNOWN',
    tier: null,
    header_text: null,
    header_language: ' UNKNOWN ',
    equipment: null,
    stop_ids: 'UNKNOWN',
    route_ids: null,
    active_periods: 'UNKNOWN',
  });
  for (const value of [
    notice.source, notice.licence, notice.retrievedOn, notice.tier,
    notice.header, notice.language, notice.equipment,
  ]) assert.equal(value, 'UNKNOWN');
  assert.deepEqual([notice.stops, notice.routes, notice.periods], [[], [], []]);
});

test('array, single object and newline-delimited forms yield equivalent rows', () => {
  const first = bulletin();
  const second = bulletin({ id: 'b' });
  const single = parseNotices(JSON.stringify(first, null, 2));
  assert.deepEqual(single, parseNotices(JSON.stringify([first])));
  const lines = [first, second].map((row) => JSON.stringify(row)).join('\r\n\r\n');
  assert.deepEqual(parseNotices('\uFEFF\r\n' + lines + '\n'), parseNotices(JSON.stringify([first, second], null, 2)));
  assert.deepEqual(parseNotices('\uFEFF\n' + JSON.stringify([first])), single);
});

test('an empty array describes zero records; an empty file has no envelope', () => {
  assert.deepEqual(parseNotices(' \r\n[ ]'), []);
  assert.throws(() => parseNotices('\uFEFF \t\r\n'), issue('empty'));
});

test('array record errors use list position even when pretty-printed', () => {
  const text = JSON.stringify([bulletin(), { id: ' ' }], null, 2);
  assert.throws(() => parseNotices(text), issue('row', 2));
  assert.throws(() => parseNotices('[{"id":"a"},'), issue('format'));
});

test('line errors use physical line numbers including skipped empty lines', () => {
  const first = JSON.stringify(bulletin());
  for (const separator of ['\n', '\r', '\r\n']) {
    const lines = ['', first, '  ', ' {'];
    assert.throws(() => parseNotices(lines.join(separator)), issue('format', 4));
    lines[3] = '{}';
    assert.throws(() => parseNotices(lines.join(separator)), issue('row', 4));
  }
  assert.throws(() => parseNotices('\n\n{\n"id": 0\n}'), issue('row', 3));
});

test('duplicate IDs are rejected atomically across sources and repeat reads are independent', () => {
  const first = JSON.stringify(bulletin());
  const duplicate = JSON.stringify(bulletin({ id: ' notice-17 ', source_id: 'different' }));
  assert.throws(() => parseNotices(first + '\n\n' + duplicate), issue('duplicate', 3));
  assert.equal(parseNotices(first).length, 1);
  assert.equal(parseNotices(duplicate).length, 1);
});

test('rejects non-object rows and unexpected keys without treating keys as data', () => {
  for (const value of ['null', '12', 'false', '"text"', '[[{}]]']) {
    assert.throws(() => parseNotices(value), issue('row', 1));
  }
  for (const key of ['__proto__', 'constructor', 'active_period']) {
    assert.throws(() => parseNotices('{"id":"a","' + key + '":{}}'), issue('row', 1));
  }
});

test('identifier strings are ordinary values even when they resemble property names', () => {
  const ids = ['constructor', '__proto__', 'toString'];
  const result = parseNotices(JSON.stringify(ids.map((id) => ({ id }))));
  assert.deepEqual(result.map((item) => item.id), ids);
});

test('requires distinct, nonempty string IDs and never coerces numbers or arrays', () => {
  for (const id of [' ', 'UNKNOWN', 0, {}, [], null]) {
    assert.throws(() => readOne({ id }), issue('row', 1));
  }
  const result = parseNotices('[{"id":"A"},{"id":"a"}]');
  assert.deepEqual(result.map((notice) => notice.id), ['A', 'a']);
});

test('source text retains diacritics, internal spacing, and original header breaks', () => {
  const header = 'Accès suspendu\nPortes\u00a0: niveau 2';
  const row = readOne({ header_text: header, source_id: 'échantillon', licence: 'licence «\u202fa\u202f»' });
  assert.equal(row.header, header);
  assert.equal(row.source, 'échantillon');
  assert.equal(row.licence, 'licence «\u202fa\u202f»');
});

test('rejects hidden control and bidi overrides in imported text and IDs', () => {
  for (const header_text of ['a\u0000b', 'a\u202eb', 'a\u2068b', 'a\ud800b']) {
    assert.throws(() => readOne({ header_text }), issue('row', 1));
  }
  for (const id of ['a\nb', 'a\rb', 'a\tb']) {
    assert.throws(() => readOne({ id }), issue('row', 1));
  }
  assert.equal(readOne({ header_text: '📅' }).header, '📅');
});

test('language tags are canonicalized without assigning a default language', () => {
  assert.equal(readOne({ header_language: 'fr-ca' }).language, 'fr-CA');
  assert.equal(readOne({ header_language: 'en-US' }).language, 'en-US');
  assert.equal(readOne({ header_language: null }).language, 'UNKNOWN');
  assert.throws(() => readOne({ header_language: 'fr ca' }), issue('row', 1));
});

test('retrieval date is checked as a calendar day, independently of the active period', () => {
  for (const date of ['2024-02-30', '1900-02-29', '0000-01-01', '2026-13-01', '2026-1-1', 20261120]) {
    assert.throws(() => readOne({ retrieved_at: date }), issue('date', 1));
  }
  for (const date of ['0001-01-01', '2000-02-29', '9999-12-31']) {
    assert.equal(readOne({ retrieved_at: date }).retrievedOn, date);
  }
});

test('accepts only a published service-alert tier or an unknown tier', () => {
  for (const tier of [0, 1, 3, 5, '4', {}, false]) {
    assert.throws(() => readOne({ tier }), issue('row', 1));
  }
  assert.equal(readOne({ tier: 'UNKNOWN' }).tier, 'UNKNOWN');
});

test('feed metadata cannot become a calendar period or a substitute for retrieval day', () => {
  const notice = readOne({ retrieved_at: null, active_periods: [], feed_timestamp: 123 });
  assert.equal(notice.retrievedOn, 'UNKNOWN');
  assert.deepEqual(notice.periods, []);
  for (const changes of [
    { feed_timestamp: -1 }, { feed_timestamp: '123' }, { entity_id: {} }, { cause: ['maintenance'] },
  ]) {
    assert.throws(() => readOne(changes), issue('row', 1));
  }
});

test('does not infer equipment from a header or reduce a combined equipment value', () => {
  assert.equal(readOne({ header_text: 'Elevator', equipment: 'UNKNOWN' }).equipment, 'UNKNOWN');
  assert.equal(readOne({ equipment: 'elevator_and_escalator' }).equipment, 'elevator_and_escalator');
  assert.throws(() => readOne({ equipment: 'stair' }), issue('row', 1));
});

test('references preserve order and distinct IDs without inventing unknown references', () => {
  const notice = readOne({
    stop_ids: ['b', 'a', ' b ', null, 'UNKNOWN'],
    route_ids: ['01', '1'],
  });
  assert.deepEqual(notice.stops, ['b', 'a']);
  assert.deepEqual(notice.routes, ['01', '1']);
  assert.throws(() => readOne({ stop_ids: 's' }), issue('row', 1));
  assert.throws(() => readOne({ route_ids: [2] }), issue('row', 1));
});

test('retains open or undated periods, zero epoch and source ordering', () => {
  const periods = [{ end: 4 }, { start: 0 }, {}, { start: 1, end: 3 }, { start: null, end: 'UNKNOWN' }];
  assert.deepEqual(readOne({ active_periods: periods }).periods, [
    { start: null, end: 4 },
    { start: 0, end: null },
    { start: null, end: null },
    { start: 1, end: 3 },
    { start: null, end: null },
  ]);
});

test('rejects suspect or ambiguous period boundaries instead of expanding them', () => {
  for (const period of [
    { start: 1, end: 1 }, { start: 3, end: 2 }, { end: -1 },
    { start: 1.5 }, { start: '0' }, { end: 253402300800 },
    { from: 1, until: 5 }, null, [], 'UNKNOWN',
  ]) {
    assert.throws(() => readOne({ active_periods: [period] }), issue('period', 1));
  }
  assert.equal(readOne({ active_periods: [{ end: 253402300799 }] }).periods[0]?.end, 253402300799);
  assert.throws(() => readOne({ active_periods: { start: 1 } }), issue('period', 1));
});

test('bounds list and text fields on each record and identifies the offending record', () => {
  for (const changes of [
    { id: 'a'.repeat(513) },
    { header_text: 'x'.repeat(16385) },
    { active_periods: Array(inputLimits.periodsPerRecord + 1).fill({}) },
    { stop_ids: Array(inputLimits.referencesPerField + 1).fill('s') },
  ]) {
    assert.throws(() => readOne(changes), issue('limit', 1));
  }
  assert.equal(readOne({ header_text: 'x'.repeat(16384) }).header.length, 16384);
});

test('the global period budget also limits many individually valid rows', () => {
  const each = Array(inputLimits.periodsPerRecord).fill({ start: 0 });
  const count = inputLimits.totalPeriods / inputLimits.periodsPerRecord;
  const records = Array.from({ length: count }, (_, i) => ({ id: String(i), active_periods: each }));
  assert.equal(parseNotices(JSON.stringify(records)).length, count);
  const oneOver = [...records, { id: 'next', active_periods: [{}] }];
  assert.throws(() => parseNotices(JSON.stringify(oneOver)), issue('limit', count + 1));
});

test('record count is bounded for arrays and for newline-delimited input', () => {
  const records = Array.from({ length: inputLimits.records + 1 }, (_, i) => ({ id: String(i) }));
  const lines = records.map((row) => JSON.stringify(row));
  assert.equal(parseNotices(JSON.stringify(records.slice(1))).length, inputLimits.records);
  assert.throws(() => parseNotices(JSON.stringify(records)), issue('limit', inputLimits.records + 1));
  assert.throws(() => parseNotices('\n' + lines.join('\n')), issue('limit', inputLimits.records + 2));
});

test('text size is a byte budget, including multibyte input', () => {
  const text = 'é'.repeat(inputLimits.textBytes / 2 + 1);
  assert.ok(text.length < inputLimits.textBytes);
  assert.throws(() => parseNotices(text), issue('limit'));
});

test('recognizes gzip by the bytes and accepts the same plain snapshot', async () => {
  const text = JSON.stringify(bulletin({ header_text: 'Inspection de l’accès' }));
  const compressed = new File([Uint8Array.from(gzipSync(text))], 'records.json', { type: 'text/plain' });
  const plain = new File([text], 'records.gz', { type: 'application/gzip' });
  assert.deepEqual(await readNoticeFile(compressed), await readNoticeFile(plain));
  assert.deepEqual(await readNoticeFile(plain), parseNotices(text));
});

test('caps both the original blob and the expanded stream', async () => {
  const large = new Blob([new Uint8Array(inputLimits.fileBytes + 1)]);
  await assert.rejects(readNoticeFile(large), issue('limit'));
  const over = gzipSync(' '.repeat(inputLimits.textBytes + 1));
  assert.ok(over.length < inputLimits.fileBytes);
  await assert.rejects(readNoticeFile(new Blob([Uint8Array.from(over)])), issue('limit'));
});

test('reports corrupt compression separately from a valid gzip with bad content', async () => {
  const gz = Uint8Array.from(gzipSync('[]'));
  await assert.rejects(readNoticeFile(new Blob([gz.subarray(0, gz.length - 3)])), issue('compression'));
  await assert.rejects(readNoticeFile(new Blob([Uint8Array.from(gzipSync('  '))])), issue('empty'));
  await assert.rejects(readNoticeFile(new Blob([Uint8Array.from(gzipSync('x'))])), issue('format', 1));
});

test('rejects illegal and incomplete UTF-8 in plain and compressed streams', async () => {
  for (const bytes of [new Uint8Array([0xff]), new Uint8Array([0xc3])]) {
    await assert.rejects(readNoticeFile(new Blob([bytes])), issue('encoding'));
    await assert.rejects(readNoticeFile(new Blob([Uint8Array.from(gzipSync(bytes))])), issue('encoding'));
  }
});

test('keeps a multibyte character split across stream chunks intact', async () => {
  const text = JSON.stringify(bulletin({ header_text: 'Étage' }));
  const bytes = new TextEncoder().encode(text);
  const split = bytes.indexOf(0xc3) + 1;
  assert.ok(split > 0);
  class ChunkedFile extends Blob {
    stream() {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, split));
          controller.enqueue(bytes.subarray(split));
          controller.close();
        },
      });
    }
  }
  assert.deepEqual(await readNoticeFile(new ChunkedFile([bytes])), parseNotices(text));
});

test('read errors have a stable issue and return no partial result', async () => {
  class FailedRead extends Blob {
    stream() {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":"a"}\n'));
          controller.error(new Error('interrupted'));
        },
      });
    }
  }
  await assert.rejects(readNoticeFile(new FailedRead(['{"id":"a"}'])), issue('read'));
});
