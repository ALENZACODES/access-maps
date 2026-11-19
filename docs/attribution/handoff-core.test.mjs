import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HANDOFF_SCHEMA, HandoffInputError, MAX_HANDOFF_BYTES, UNKNOWN,
  parseHandoffPack, parseHandoffJson, parsePolicy, parseSource, parseSurface,
  parseHandoff, stableHandoffJson, sourceById, surfaceById, distributionIndex,
  reachableSources, handoffsForSource, handoffsForSurface, date, url, text,
  id, ids, digest, pixels, choice, exactKeys, object,
} from './handoff-core.mjs';
import { pack, parsed, source, surface, handoff, publicPack } from './handoff-fixtures.mjs';
const clone = (value) => structuredClone(value);
function expectInvalid(value, pattern = undefined) {
  assert.throws(() => parseHandoffPack(value), (error) => {
    assert.ok(error instanceof HandoffInputError);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}
test('schema identifies a distinct handoff contract', () => assert.equal(HANDOFF_SCHEMA, 'attribution-handoff/1'));
test('valid fixture round trips through JSON', () => assert.deepEqual(parseHandoffJson(JSON.stringify(pack())), parsed()));
test('stabilized JSON ends in newline', () => assert.ok(stableHandoffJson(pack()).endsWith('\n')));
test('stable handoff round trip preserves UNKNOWN', () => assert.equal(JSON.parse(stableHandoffJson(pack())).sources[0].datasetDate, UNKNOWN));
test('source count and surface count retained', () => {
  const result = parsed();
  assert.equal(result.sources.length, 1);
  assert.equal(result.surfaces.length, 1);
  assert.equal(result.handoffs.length, 1);
});
test('parser returns independent typed arrays', () => {
  const input = pack();
  const result = parseHandoffPack(input);
  assert.notStrictEqual(result.sources, input.sources);
  assert.notStrictEqual(result.sources[0], input.sources[0]);
});
test('parser rejects missing root', () => expectInvalid(null));
test('parser rejects a list root', () => expectInvalid([]));
test('parser rejects unsupported schema', () => expectInvalid({ ...pack(), schema: 'v2' }, /schema/u));
test('parser rejects missing top-level field', () => {
  const input = pack(); delete input.handoffs;
  expectInvalid(input, /handoffs/u);
});
test('parser rejects extra root metadata', () => expectInvalid({ ...pack(), requestId: 'secret' }, /requestId/u));
test('parser rejects unknown source property', () => {
  const input = pack(); input.sources[0].contactEmail = 'private@example.org';
  expectInvalid(input, /contactEmail/u);
});
test('parser rejects unknown surface property', () => {
  const input = pack(); input.surfaces[0].privateNotes = 'not for export';
  expectInvalid(input, /privateNotes/u);
});
test('parser rejects unknown handoff property', () => {
  const input = pack(); input.handoffs[0].accessToken = 'secret';
  expectInvalid(input, /accessToken/u);
});
test('parser rejects unknown policy property', () => {
  const input = pack(); input.policy.privateAddress = 'not for publication';
  expectInvalid(input, /privateAddress/u);
});
test('control character is rejected', () => assert.throws(() => text('a\u0001b', 'field'), HandoffInputError));
test('linefeed is allowed in a licence notice', () => assert.equal(text('first\nsecond', 'notice'), 'first\nsecond'));
test('NFC input stays normalized', () => assert.equal(text('données', 'field'), 'données'));
test('non-NFC input is rejected', () => assert.throws(() => text('e\u0301', 'field'), HandoffInputError));
test('unknown date stays UNKNOWN', () => assert.equal(date('UNKNOWN', 'date'), UNKNOWN));
test('valid leap day is accepted', () => assert.equal(date('2024-02-29', 'date'), '2024-02-29'));
test('non-leap day is rejected', () => assert.throws(() => date('2025-02-29', 'date'), HandoffInputError));
test('invalid month is rejected', () => assert.throws(() => date('2026-13-01', 'date'), HandoffInputError));
test('invalid day is rejected', () => assert.throws(() => date('2026-04-31', 'date'), HandoffInputError));
test('invalid year is rejected', () => assert.throws(() => date('1800-01-01', 'date'), HandoffInputError));
test('ISO datetime cannot replace a date', () => assert.throws(() => date('2026-01-01T00:00:00Z', 'date'), HandoffInputError));
test('safe HTTPS link accepted', () => assert.equal(url('https://example.org/source', 'url'), 'https://example.org/source'));
test('UNKNOWN URL preserved', () => assert.equal(url('UNKNOWN', 'url'), UNKNOWN));
for (const [label, bad] of [
  ['http', 'http://example.org'], ['file', 'file:///etc/passwd'],
  ['javascript', 'javascript:alert(1)'], ['credentials', 'https://user:pw@example.org'],
  ['fragment', 'https://example.org/#x'], ['localhost', 'https://localhost'],
  ['local domain', 'https://example.local'], ['IPv4 loopback', 'https://127.0.0.1'],
  ['private address', 'https://192.168.2.1'], ['link-local', 'https://169.254.1.2'],
  ['private 10', 'https://10.1.2.3'], ['private 172', 'https://172.20.1.1'],
  ['scheme-relative', '//example.org/x'], ['empty', ''],
]) test(`unsafe ${label} URL rejected`, () => assert.throws(() => url(bad, 'url'), HandoffInputError));
test('IDs accept a lowercase slug', () => assert.equal(id('source-42', 'id'), 'source-42'));
for (const bad of ['UPPER', 'white space', '../escape', 'a_', '0abc', 'a--b', '']) {
  test(`invalid identifier ${JSON.stringify(bad)} rejected`, () => assert.throws(() => id(bad, 'id'), HandoffInputError));
}
test('duplicate references are rejected', () => assert.throws(() => ids(['a','a'], 'refs'), HandoffInputError));
test('bounded reference list works', () => assert.deepEqual(ids(['b','a'], 'refs'), ['b','a']));
test('bad pixels rejected', () => assert.throws(() => pixels(-1, 'size'), HandoffInputError));
test('floating point pixels rejected', () => assert.throws(() => pixels(44.1, 'size'), HandoffInputError));
test('UNKNOWN target size allowed as explicit evidence', () => assert.equal(pixels(UNKNOWN, 'size'), UNKNOWN));
test('44px boundary accepted', () => assert.equal(pixels(44, 'size'), 44));
test('digest requires lowercase 64-hex characters', () => assert.throws(() => digest('ABC', 'digest'), HandoffInputError));
test('UNKNOWN digest is representable', () => assert.equal(digest(UNKNOWN, 'digest'), UNKNOWN));
test('invalid choice rejected', () => assert.throws(() => choice('maybe', ['YES','NO'], 'flag'), HandoffInputError));
test('duplicate source IDs rejected', () => expectInvalid({ ...pack(), sources:[source(),source()] }, /Duplicate/u));
test('duplicate surface IDs rejected', () => expectInvalid({ ...pack(), surfaces:[surface(),surface()] }, /Duplicate/u));
test('duplicate handoff IDs rejected', () => expectInvalid({ ...pack(), handoffs:[handoff(),handoff()] }, /Duplicate/u));
test('unknown provider is rejected instead of added to catalogue', () => expectInvalid({ ...pack(), sources:[source({provider:'unspecified'})] }));
test('unsupported tier is rejected', () => expectInvalid({ ...pack(), sources:[source({tier:'official'})] }));
test('unsupported permission is rejected', () => expectInvalid({ ...pack(), sources:[source({permission:'MAYBE'})] }));
test('private recipient is not a supported delivery target', () => expectInvalid({ ...pack(), handoffs:[handoff({recipient:'private-email'})] }));
test('unsupported handoff format rejected', () => expectInvalid({ ...pack(), handoffs:[handoff({format:'pdf'})] }));
test('negative target dimension rejected', () => expectInvalid({ ...pack(), surfaces:[surface({targetPx:-5})] }));
test('oversized JSON rejected', () => assert.throws(() => parseHandoffJson(' '.repeat(MAX_HANDOFF_BYTES+1)), HandoffInputError));
test('malformed JSON rejected', () => assert.throws(() => parseHandoffJson('not-json'), HandoffInputError));
test('nonstring JSON input rejected', () => assert.throws(() => parseHandoffJson({}), HandoffInputError));
test('source lookup returns null for unknown ID', () => assert.equal(sourceById(parsed(), 'not-there'), null));
test('source lookup returns exact record', () => assert.equal(sourceById(parsed(), 'osm-a').id, 'osm-a'));
test('surface lookup returns null for unknown ID', () => assert.equal(surfaceById(parsed(), 'not-there'), null));
test('surface lookup returns exact record', () => assert.equal(surfaceById(parsed(), 'map-en').id, 'map-en'));
test('reachable sources include directly declared source', () => assert.deepEqual(reachableSources(parsed(), handoff()), ['osm-a']));
test('handoff lookup by surface finds exact handoff', () => assert.deepEqual(handoffsForSurface(parsed(), 'map-en').map((x)=>x.id), ['handoff-a']));
test('handoff lookup by source finds exact handoff', () => assert.deepEqual(handoffsForSource(parsed(), 'osm-a').map((x)=>x.id), ['handoff-a']));
test('handoff distribution index is deterministic', () => assert.deepEqual(distributionIndex(parsed()), {'osm-a':['handoff-a']}));
test('public handoff keeps two explicit locales', () => assert.deepEqual(parseHandoffPack(publicPack()).surfaces.map((x)=>x.locale), ['en','fr']));
test('parsing does not infer dataset dates', () => assert.equal(parsed().sources[0].datasetDate, UNKNOWN));
test('manual policy parsing retains purpose in both languages', () => {
  const result = parsePolicy(pack().policy);
  assert.ok(result.purposeEn.length > 5);
  assert.ok(result.purposeFr.length > 5);
});
test('surface parser retains explicit locale', () => assert.equal(parseSurface(surface({locale:'fr'})).locale, 'fr'));
test('source parser retains source licence', () => assert.equal(parseSource(source()).provider, 'osm'));
test('handoff parser retains delivery scope', () => assert.equal(parseHandoff(handoff()).scope, 'attribution-only'));
test('object validator refuses string', () => assert.throws(() => object('a', 'value'), HandoffInputError));
test('exact keys rejects missing field', () => assert.throws(() => exactKeys({ a:1 }, ['a','b'], 'value'), HandoffInputError));
test('pack parser does not mutate input', () => {
  const value = pack(); const original = clone(value);
  parseHandoffPack(value); assert.deepEqual(value, original);
});
