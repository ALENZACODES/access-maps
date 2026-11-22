// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { constants, gzipSync, gunzipSync } from 'node:zlib';
import { gzipMembers, GzipStructureError, gzipLimits } from './field-review-gzip.mjs';

/** @param {Uint8Array} data @param {number} [cap] */
function ranges(data, cap = 32 * 1024 * 1024) {
  return [...gzipMembers(data, cap)];
}

/** @param {unknown} error */
function compressedError(error) {
  return error instanceof GzipStructureError && error.code === 'compression';
}

/** @param {unknown} error */
function limitError(error) {
  return error instanceof GzipStructureError && error.code === 'limit';
}

test('locates mixed stored, fixed and dynamic members including an empty member', () => {
  const texts = [
    'one fragment',
    '',
    'the second fragment is longer '.repeat(400),
    'the third fragment includes a longer run of repeated bytes '.repeat(10000),
  ];
  const parts = texts.map((text, i) => gzipSync(text, {
    level: i === 0 ? 0 : 6,
    strategy: i === 2 ? constants.Z_FIXED : constants.Z_DEFAULT_STRATEGY,
  }));
  const joined = Buffer.concat(parts);
  const regions = ranges(joined);
  assert.equal(regions.length, parts.length);
  const frames = regions.map(({ start, end }) => joined.subarray(start, end));
  assert.deepEqual(frames, parts);
  assert.deepEqual(frames.map(buf => gunzipSync(buf).toString()), texts);
});

test('header-looking bytes inside a stored block cannot create a new member', () => {
  const falseHeader = gzipSync('a complete inner file');
  const actual = gzipSync(Buffer.concat([Buffer.alloc(30), falseHeader, Buffer.alloc(8)]), { level: 0 });
  assert.notEqual(actual.indexOf(falseHeader), -1);
  const other = gzipSync('after');
  assert.deepEqual(ranges(Buffer.concat([actual, other])), [
    { start: 0, end: actual.length }, { start: actual.length, end: actual.length + other.length },
  ]);
});

test('skips optional header fields with embedded signatures in name, comment and extra', () => {
  const original = gzipSync('hello');
  const header = Buffer.from(original.subarray(0, 10));
  header[3] = 4 | 8 | 16;
  const extra = Buffer.from([3, 0, 31, 139, 8]);
  const name = Buffer.from([65, 31, 139, 8, 66, 0]);
  const comment = Buffer.from([67, 0]);
  const file = Buffer.concat([header, extra, name, comment, original.subarray(10)]);
  assert.deepEqual(ranges(file), [{ start: 0, end: file.length }]);
  assert.equal(gunzipSync(file).toString(), 'hello');
  const broken = Buffer.concat([header, extra, name, Buffer.from('no terminator')]);
  assert.throws(() => ranges(broken), compressedError);
});

test('decoded budget is cumulative, including compressed length-distance matches', () => {
  const a = gzipSync('a'.repeat(60000));
  const b = gzipSync('bc'.repeat(25000));
  assert.equal(ranges(Buffer.concat([a, b]), 110000).length, 2);
  assert.throws(() => ranges(Buffer.concat([a, b]), 109999), limitError);
  assert.throws(() => ranges(gzipSync('a'.repeat(100), { level: 0 }), 99), limitError);
});

test('each footer must retain the actual size of its own member', () => {
  const original = gzipSync('sample');
  const second = Buffer.from(original);
  second.writeUInt32LE(4, second.length - 4);
  assert.throws(() => ranges(Buffer.concat([original, second])), compressedError);
  for (const tail of [1, 4, 8]) {
    assert.throws(() => ranges(original.subarray(0, original.length - tail)), compressedError);
  }
});

test('rejects unsupported compression, reserved flags, bad blocks and trailing junk', () => {
  for (const [offset, byte] of [[2, 9], [3, 32], [10, 7]]) {
    const file = gzipSync('content');
    assert.ok(offset !== undefined && byte !== undefined);
    file[offset] = byte;
    assert.throws(() => ranges(file), compressedError);
  }
  const stored = gzipSync('data', { level: 0 });
  stored[13] = 0;
  assert.throws(() => ranges(stored), compressedError);
  assert.throws(() => ranges(Buffer.concat([gzipSync('ok'), Buffer.from('junk')])), compressedError);
});

test('stream positions are local to the supplied view, including its footer size', () => {
  const file = gzipSync('offset');
  const packed = Buffer.concat([Buffer.alloc(33, 0xff), file, Buffer.alloc(12)]);
  const view = packed.subarray(33, 33 + file.length);
  assert.deepEqual(ranges(view), [{ start: 0, end: view.length }]);
});

test('finds frame boundaries for deterministic mixed-alphabet, long-distance inputs', () => {
  let seed = 0xa1b2c3d4;
  const input = Buffer.alloc(16000);
  for (let i = 0; i < input.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    input[i] = i % 13 < 9 ? seed % 9 : seed % 256;
  }
  const raw = Buffer.concat([input, Buffer.alloc(12100, 33), input]);
  const files = [constants.Z_RLE, constants.Z_HUFFMAN_ONLY, constants.Z_FIXED, constants.Z_FILTERED]
    .map(strategy => gzipSync(raw, { strategy }));
  const group = Buffer.concat(files);
  const inferred = ranges(group).map(range => group.subarray(range.start, range.end));
  assert.deepEqual(inferred, files);
});

test('bounds framing work even for concatenated empty members and empty stored blocks', () => {
  const member = gzipSync('');
  assert.throws(() => ranges(Buffer.concat(Array(gzipLimits.members + 1).fill(member))), limitError);
  const emptyBlock = Buffer.from([0, 0, 0, 255, 255]);
  const large = Buffer.concat([
    member.subarray(0, 10),
    Buffer.concat(Array(gzipLimits.blocks).fill(emptyBlock)),
    member.subarray(10),
  ]);
  assert.throws(() => ranges(large), limitError);
});
