import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LICENCES, STATES, FEATURES, ACTIONS, MAX_RECORDS, MAX_SOURCES,
  object, exact, id, dayNumber, safePath, safeText, frenchText, validSource,
  validObservation, validDecision, validPolicy, isLocalInput, dateWithin,
  sourceSilo, stableSort, unique, contractSummary } from './contract.mjs';
import { base, clone, source, observation, decision, policy } from './fixtures.mjs';

describe('structural trust boundary', () => {
  for (const value of [null, undefined, false, true, 0, 'x', [], () => {}]) {
    it(`rejects non-object ${String(value)}`, () => { assert.equal(object(value), false); });
  }
  it('accepts ordinary object', () => assert.equal(object({}), true));
  it('requires every listed property', () => assert.equal(exact({ a: 1 }, ['a', 'b']), false));
  it('rejects unlisted property', () => assert.equal(exact({ a: 1, b: 2 }, ['a']), false));
  it('permits explicitly optional properties', () => assert.equal(exact({ a: 1, b: 2 }, ['a'], ['b']), true));
  it('rejects array where dictionary expected', () => assert.equal(exact([], []), false));
  it('rejects null where dictionary expected', () => assert.equal(exact(null, []), false));
});

describe('identifiers and path traversal', () => {
  for (const value of ['', 'A', '1a', 'a/', 'a:', 'a.', 'a b', '../a', 'a\\b',
    'a--b', 'a__b', '-a', 'a-', 'a_', '_a', 'a/b', 'a?b', 'a#b', 'a@b']) {
    it(`rejects identifier ${JSON.stringify(value)}`, () => assert.equal(id(value), false));
  }
  for (const value of ['a', 'a1', 'a-b', 'a_b', 'feature-12', 'stop_3', 'a0b9']) {
    it(`accepts safe identifier ${value}`, () => assert.equal(id(value), true));
  }
  for (const value of ['/etc/passwd', '../a', 'a/../b', './a', 'a/./b',
    'a//b', 'https://host/a', 'file:/a', 'C:\\private', 'a\\b', 'a?x',
    'a#x', 'a%20b', '', 'a\nb', 'a:b', '//remote/file']) {
    it(`rejects unsafe local path ${JSON.stringify(value)}`, () => assert.equal(safePath(value), false));
  }
  for (const value of ['a', 'a/b', 'en/page.html', 'sources/local.txt',
    '2026/november/report.json', 'file_name.json']) {
    it(`accepts local path ${value}`, () => assert.equal(safePath(value), true));
  }
});

describe('calendar date contract', () => {
  for (const value of ['', '2026-2-3', '2026/02/03', '2026-02-30', '2025-02-29',
    '2026-13-01', '2026-00-01', '2026-01-00', '2026-04-31', '0000-01-01',
    'abc', '2026-11-20Z', '2026-11-20T00:00:00Z']) {
    it(`rejects calendar day ${JSON.stringify(value)}`, () => assert.equal(dayNumber(value), null));
  }
  for (const value of ['2024-02-29', '2026-11-20', '2000-02-29', '1900-02-28', '2026-12-31']) {
    it(`accepts calendar day ${value}`, () => assert.ok(Number.isSafeInteger(dayNumber(value))));
  }
  it('accepts same day at maxAge 0', () => assert.equal(dateWithin('2026-11-20', '2026-11-20', 0), true));
  it('rejects previous day at maxAge 0', () => assert.equal(dateWithin('2026-11-19', '2026-11-20', 0), false));
  it('accepts previous day at maxAge 1', () => assert.equal(dateWithin('2026-11-19', '2026-11-20', 1), true));
  it('rejects future observations', () => assert.equal(dateWithin('2026-11-21', '2026-11-20', 100), false));
  it('rejects invalid asOf', () => assert.equal(dateWithin('2026-11-20', 'not-a-date', 5), false));
  it('rejects fractional maximum age', () => assert.equal(dateWithin('2026-11-20', '2026-11-20', .1), false));
});

describe('untrusted text and French typography', () => {
  for (const value of ['', ' leading', 'trailing ', 'new\nline', '<script>alert(1)</script>',
    '<iframe src="x">', '<svg onload=x>', 'javascript:alert(1)',
    'person@example.org', '416-555-0101', 'apiKey=abcd', 'password:abc', 'x'.repeat(481)]) {
    it(`rejects unsafe text case ${JSON.stringify(value).slice(0, 70)}`, () => assert.equal(safeText(value), false));
  }
  for (const value of ['UNKNOWN', 'Unobserved entrance', 'Source record not available',
    'Map record with no accessibility conclusion', 'A note with punctuation.']) {
    it(`accepts benign text ${value}`, () => assert.equal(safeText(value), true));
  }
  for (const value of ["L'acces", 'Source : inconnue', 'Pourquoi ?', 'Oui ; non',
    'Attention !', '«Texte»', '<iframe>', 'contact@example.org']) {
    it(`rejects French formatting ${value}`, () => assert.equal(frenchText(value), false));
  }
  for (const value of ['L’accès', 'Source\u00a0: inconnue', 'Pourquoi\u202f?',
    'Oui\u202f; non', 'Attention\u202f!', '«\u202fTexte\u202f»', 'UNKNOWN']) {
    it(`accepts French formatting ${value}`, () => assert.equal(frenchText(value), true));
  }
});

describe('open source stamps', () => {
  it('allows the known fictional source', () => assert.equal(validSource(source), true));
  for (const licence of LICENCES) {
    it(`allows explicit open licence ${licence}`, () => assert.equal(validSource({ ...source, licence }), true));
  }
  for (const licence of ['', null, 'private', 'CC-BY-NC-4.0', 'ODbL', 'unknown']) {
    it(`rejects unsupported licence ${String(licence)}`, () => assert.equal(validSource({ ...source, licence }), false));
  }
  for (const name of ['MiWay GTFS', 'Mi-Way transit', 'miway', 'person@example.com']) {
    it(`holds source ${name}`, () => assert.equal(validSource({ ...source, name }), false));
  }
  it('requires observedOn', () => assert.equal(validSource({ ...source, observedOn: '' }), false));
  it('requires a relative evidence reference', () => assert.equal(validSource({ ...source, reference: '../secret' }), false));
  it('does not accept hidden source fields', () => assert.equal(validSource({ ...source, privateEmail: 'x' }), false));
});

describe('observations and publication decisions', () => {
  it('accepts a full observation', () => assert.equal(validObservation(observation), true));
  it('accepts a full decision', () => assert.equal(validDecision(decision), true));
  for (const state of STATES) {
    it(`accepts observed state ${state}`, () => assert.equal(validObservation({ ...observation, state }), true));
    it(`accepts decided state ${state}`, () => assert.equal(validDecision({ ...decision, state }), true));
  }
  for (const action of ACTIONS) {
    it(`accepts supported action ${action}`, () => assert.equal(validObservation({ ...observation, kind: action }), true));
  }
  for (const feature of FEATURES) {
    it(`accepts supported feature ${feature}`, () => assert.equal(validObservation({ ...observation, feature }), true));
  }
  it('rejects inference-shaped yes', () => assert.equal(validObservation({ ...observation, state: 'probably' }), false));
  it('rejects a missing French note', () => assert.equal(validObservation({ ...observation, noteFr: '' }), false));
  it('rejects a missing source array', () => assert.equal(validObservation({ ...observation, sourceIds: null }), false));
  it('rejects duplicate source IDs', () => assert.equal(validObservation({ ...observation, sourceIds: ['a','a'] }), false));
  it('rejects an unsafe optional note', () => assert.equal(validDecision({ ...decision, noteEn: '<script>' }), false));
  it('rejects an unexpected decision field', () => assert.equal(validDecision({ ...decision, contact: true }), false));
  it('rejects unknown silo', () => assert.equal(validDecision({ ...decision, silo: 'mixed' }), false));
});

describe('policy and schema boundaries', () => {
  it('accepts valid default policy', () => assert.equal(validPolicy(policy), true));
  it('accepts complete input', () => assert.equal(isLocalInput(base()), true));
  it('has exact contract summary', () => assert.deepEqual(contractSummary(base()), {
    sources: 1, observations: 1, decisions: 1, asOf: '2026-11-20',
  }));
  for (const age of [-1, 0.1, 36501, '10', Infinity, NaN]) {
    it(`rejects invalid age ${String(age)}`, () => assert.equal(validPolicy({ ...policy, maxAgeDays: age }), false));
  }
  it('accepts maximum configured observation limit', () => assert.equal(validPolicy({ ...policy, maxObservations: MAX_RECORDS }), true));
  it('rejects too large source limit', () => assert.equal(validPolicy({ ...policy, maxSources: MAX_SOURCES + 1 }), false));
  it('rejects unknown root keys', () => assert.equal(isLocalInput({ ...base(), hidden: 'x' }), false));
  it('rejects unsupported schema version', () => assert.equal(isLocalInput({ ...base(), schemaVersion: 2 }), false));
  it('rejects missing collections', () => { const input = base(); delete input.decisions; assert.equal(isLocalInput(input), false); });
  it('recognizes ODbL lineage', () => assert.equal(sourceSilo([{ ...source, licence: 'ODbL-1.0' }]), 'odbl'));
  it('separates non-ODbL lineage', () => assert.equal(sourceSilo([source]), 'open'));
  it('sorts deterministically without mutation', () => { const a = [3, 1, 2]; assert.deepEqual(stableSort(a, String), [1,2,3]); assert.deepEqual(a,[3,1,2]); });
  it('rejects duplicate strings', () => assert.equal(unique(['a', 'a']), false));
  it('recognizes distinct strings', () => assert.equal(unique(['a', 'b']), true));
});
