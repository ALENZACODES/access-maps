import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBLIGATION_SCHEMA, OBLIGATION_UNKNOWN, MAX_OBLIGATION_BYTES,
  OBLIGATION_PROVIDERS, OBLIGATION_STATES, OBLIGATION_TIERS,
  OBLIGATION_LIFECYCLE, OBLIGATION_KINDS,
  ObligationInputError, parseObligationRegister, parseObligationJson,
  parseObligationSource, parseObligationPage, parseObligationPlacement,
  parseObligationWitness, canonicalObligationJson,
  sourcePageIndex, placementIndex, witnessIndex,
} from './obligation-core.mjs';
import { obligation, page, source, placement, witness, frenchPair, aua, ogl, ltc } from './obligation-fixtures.mjs';

const clone = value => structuredClone(value);
const mutate = (section, patch) => {
  const input = obligation();
  input[section][0] = { ...input[section][0], ...patch };
  return input;
};
const shouldReject = (input, match = /./u) => {
  assert.throws(() => parseObligationRegister(input), error => {
    assert.ok(error instanceof ObligationInputError);
    assert.match(error.message, match);
    return true;
  });
};
test('schema identifier is stable and versioned', () => {
  assert.equal(OBLIGATION_SCHEMA, 'attribution-obligation-register/1');
  assert.equal(OBLIGATION_UNKNOWN, 'UNKNOWN');
});
test('bounded JSON limit is two mebibytes', () => {
  assert.equal(MAX_OBLIGATION_BYTES, 2_097_152);
});
test('provider set is explicit without a hidden provider', () => {
  assert.deepEqual(OBLIGATION_PROVIDERS, ['osm', 'metrolinx-aua', 'metrolinx-ogl', 'ltc', 'other']);
});
test('evidence states preserve the unknown literal', () => {
  assert.deepEqual(OBLIGATION_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.deepEqual(OBLIGATION_TIERS, ['primary', 'secondary', 'community', 'UNKNOWN']);
});
test('lifecycle keeps held and excluded records separate', () => {
  assert.deepEqual(OBLIGATION_LIFECYCLE, ['included', 'held', 'excluded']);
});
test('placement kinds distinguish credit, licence, terms and laws', () => {
  assert.deepEqual(OBLIGATION_KINDS, ['credit', 'licence', 'terms', 'laws', 'disclosure']);
});
test('a complete explicit document parses without changing data', () => {
  const input = obligation();
  assert.deepEqual(parseObligationRegister(input), input);
});
test('parsed JSON round-trips every field', () => {
  const input = obligation();
  assert.deepEqual(parseObligationJson(JSON.stringify(input)), input);
});
test('canonical output ends with newline and parses', () => {
  const encoded = canonicalObligationJson(obligation());
  assert.ok(encoded.endsWith('\n'));
  assert.deepEqual(parseObligationJson(encoded), obligation());
});
test('input object is never mutated by parsing', () => {
  const input = obligation();
  const before = clone(input);
  parseObligationRegister(input);
  assert.deepEqual(input, before);
});
test('canonical order sorts record identities without altering source', () => {
  const input = frenchPair();
  input.pages.reverse();
  const copy = clone(input);
  const parsed = JSON.parse(canonicalObligationJson(input));
  assert.deepEqual(parsed.pages.map(x => x.id), ['map-en', 'map-fr']);
  assert.deepEqual(input, copy);
});
test('canonical JSON output is deterministic for same logical order', () => {
  const a = frenchPair();
  const b = clone(a);
  b.placements.reverse();
  assert.equal(canonicalObligationJson(a), canonicalObligationJson(b));
});
test('source page reverse index records declared usage', () => {
  assert.deepEqual(sourcePageIndex(frenchPair())['osm-source'], ['map-en', 'map-fr']);
});
test('placement index groups placements per page', () => {
  assert.deepEqual(placementIndex(obligation())['map-en'], ['map-credit', 'map-licence']);
});
test('witness index groups source evidence', () => {
  assert.deepEqual(witnessIndex(obligation())['osm-source'], ['osm-document']);
});
test('unused source gets an empty reverse-index array', () => {
  const input = obligation();
  input.sources.push(source({ id: 'unused-source' }));
  assert.deepEqual(sourcePageIndex(input)['unused-source'], []);
});
test('unknown page source remains indexable, not inferred', () => {
  const input = obligation();
  input.pages[0].sourceIds = ['absent-source'];
  assert.deepEqual(sourcePageIndex(input)['absent-source'], ['map-en']);
});
test('unknown placement page stays in the placement index', () => {
  const input = obligation();
  input.placements[0].pageId = 'lost-page';
  assert.deepEqual(placementIndex(input)['lost-page'], ['map-credit']);
});
test('unknown witness source stays in the witness index', () => {
  const input = obligation();
  input.witnesses[0].sourceId = 'lost-source';
  assert.deepEqual(witnessIndex(input)['lost-source'], ['osm-document']);
});
test('record parsers expose stable public functions', () => {
  assert.deepEqual(parseObligationSource(source()), source());
  assert.deepEqual(parseObligationPage(page()), page());
  assert.deepEqual(parseObligationPlacement(placement()), placement());
  assert.deepEqual(parseObligationWitness(witness()), witness());
});
test('each recognised provider can have a source record', () => {
  for (const entry of [source(), aua(), ogl(), ltc()]) {
    assert.equal(parseObligationSource(entry).provider, entry.provider);
  }
});
test('unknown dataset date is preserved, not replaced with clock time', () => {
  const parsed = parseObligationRegister(obligation());
  assert.equal(parsed.sources[0].datasetAsOf, 'UNKNOWN');
  assert.equal(parsed.pages[0].publishedOn, 'UNKNOWN');
});
test('page target boundary accepts zero syntactically for audit to block', () => {
  assert.equal(parseObligationPage(page({ targetPx: 0 })).targetPx, 0);
});
test('page target accepts explicit UNKNOWN without assuming a size', () => {
  assert.equal(parseObligationPage(page({ targetPx: 'UNKNOWN' })).targetPx, 'UNKNOWN');
});
test('number 44 is accepted exactly', () => {
  assert.equal(parseObligationPage(page({ targetPx: 44 })).targetPx, 44);
});
test('source notes may include required legal notices on separate lines', () => {
  assert.match(parseObligationSource(source()).attribution, /\n/u);
});

test('rejects missing or unsupported root schema', () => {
  shouldReject({ ...obligation(), schema: 'another-schema' }, /schema/u);
  const input = obligation();
  delete input.schema;
  shouldReject(input, /schema/u);
});
test('rejects extra root field even when innocuous', () => {
  shouldReject({ ...obligation(), extra: true }, /extra/u);
});
test('rejects non-object root values', () => {
  for (const bad of [null, [], 'hello', true, 9]) shouldReject(bad, /object/u);
});
test('rejects invalid release IDs', () => {
  for (const value of ['A', 'with space', '../evil', '', 'a_', 9, null]) {
    shouldReject({ ...obligation(), releaseId: value });
  }
});
test('rejects duplicate source IDs', () => {
  shouldReject({ ...obligation(), sources: [source(), source()] }, /Duplicate/u);
});
test('rejects duplicate page IDs', () => {
  shouldReject({ ...obligation(), pages: [page(), page()] }, /Duplicate/u);
});
test('rejects duplicate placement IDs', () => {
  shouldReject({ ...obligation(), placements: [placement(), placement()] }, /Duplicate/u);
});
test('rejects duplicate witness IDs', () => {
  shouldReject({ ...obligation(), witnesses: [witness(), witness()] }, /Duplicate/u);
});
test('rejects missing source property with explicit path', () => {
  const input = obligation();
  delete input.sources[0].licenceUrl;
  shouldReject(input, /licenceUrl/u);
});
test('rejects unknown source property with explicit path', () => {
  shouldReject(mutate('sources', { speculative: true }), /speculative/u);
});
test('rejects missing page property', () => {
  const input = obligation();
  delete input.pages[0].screenReader;
  shouldReject(input, /screenReader/u);
});
test('rejects unknown page property', () => {
  shouldReject(mutate('pages', { unsafeFlag: true }), /unsafeFlag/u);
});
test('rejects missing placement property', () => {
  const input = obligation();
  delete input.placements[0].witnessIds;
  shouldReject(input, /witnessIds/u);
});
test('rejects unknown placement property', () => {
  shouldReject(mutate('placements', { added: 'not allowed' }), /added/u);
});
test('rejects missing witness property', () => {
  const input = obligation();
  delete input.witnesses[0].recordedOn;
  shouldReject(input, /recordedOn/u);
});
test('rejects unknown witness property', () => {
  shouldReject(mutate('witnesses', { invented: 'none' }), /invented/u);
});
test('rejects duplicate source references within a page', () => {
  shouldReject(mutate('pages', { sourceIds: ['osm-source', 'osm-source'] }), /Duplicate/u);
});
test('rejects duplicate witness references within a placement', () => {
  shouldReject(mutate('placements', { witnessIds: ['osm-document', 'osm-document'] }), /Duplicate/u);
});
test('rejects non-arrays in collection fields', () => {
  for (const field of ['sources', 'pages', 'placements', 'witnesses']) {
    shouldReject({ ...obligation(), [field]: {} }, /array/u);
  }
});
test('rejects excessively large array collections', () => {
  shouldReject({ ...obligation(), pages: Array.from({ length: 401 }, () => page()) }, /array/u);
  shouldReject({ ...obligation(), placements: Array.from({ length: 2401 }, () => placement()) }, /array/u);
  shouldReject({ ...obligation(), witnesses: Array.from({ length: 3001 }, () => witness()) }, /array/u);
});
test('rejects documents larger than configured UTF-8 limit', () => {
  const over = ` ${' '.repeat(MAX_OBLIGATION_BYTES)}`;
  assert.throws(() => parseObligationJson(over), ObligationInputError);
});
test('rejects JSON syntax errors', () => {
  for (const raw of ['{', 'null trailing', 'not-json', '']) {
    assert.throws(() => parseObligationJson(raw), ObligationInputError);
  }
});
test('rejects non-text JSON arguments', () => {
  for (const raw of [null, {}, 1, true]) assert.throws(() => parseObligationJson(raw), ObligationInputError);
});
test('rejects unknown provider labels', () => {
  for (const provider of ['transit', 'metrolinx', 'miway', 'not-yet-known', null]) {
    shouldReject(mutate('sources', { provider }));
  }
});
test('rejects unknown source permission state', () => {
  for (const permission of ['yes', 'TRUE', null, '', 'PENDING']) shouldReject(mutate('sources', { permission }));
});
test('rejects unknown evidence-tier labels', () => {
  for (const tier of ['official', 'approved', 'tertiary', 'community-review']) shouldReject(mutate('sources', { tier }));
});
test('rejects unsupported publication lifecycle', () => {
  for (const state of ['published', 'ready', 'draft', 'unknown']) shouldReject(mutate('sources', { state }));
});
test('rejects unrecognised page locale', () => {
  for (const locale of ['FR', 'fr-CA', 'es', 'UNKNOWN']) shouldReject(mutate('pages', { locale }));
});
test('rejects unrecognised page display mode', () => {
  for (const display of ['route', 'tile', 'unknown', 'screen']) shouldReject(mutate('pages', { display }));
});
test('rejects arbitrary placement kind', () => {
  for (const kind of ['permission', 'approval', 'contract', 'map']) shouldReject(mutate('placements', { kind }));
});
test('rejects invented placement visibility', () => {
  for (const visibility of ['displayed', 'hidden', 'yes', 'none']) shouldReject(mutate('placements', { visibility }));
});
test('rejects negative and fractional targets', () => {
  for (const targetPx of [-1, 43.5, 1001, NaN, Infinity, '44']) shouldReject(mutate('pages', { targetPx }));
});
test('rejects invalid witness type', () => {
  for (const type of ['external', 'audit', 'file', 'UNKNOWN']) shouldReject(mutate('witnesses', { type }));
});
test('rejects control characters in supplied text', () => {
  for (const value of ['Bad\u0000source', 'Bad\u0007source', 'Bad\u001fsource']) {
    shouldReject(mutate('sources', { title: value }), /Control/u);
  }
});
test('rejects text that is not NFC-normalised', () => {
  shouldReject(mutate('sources', { title: 'Cafe\u0301' }), /NFC/u);
});
test('rejects excessively long source titles', () => {
  shouldReject(mutate('sources', { title: 'x'.repeat(181) }), /bounded/u);
});
test('rejects excessively long notice text', () => {
  shouldReject(mutate('placements', { notice: 'x'.repeat(5001) }), /bounded/u);
});
test('rejects invalid ISO date including non-leap February', () => {
  for (const value of ['2025-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-12-00', '2026-01-32', '2026-1-1', '1800-01-01']) {
    shouldReject(mutate('sources', { datasetAsOf: value }), /date/u);
  }
});
test('accepts leap day on leap year', () => {
  const value = parseObligationSource(source({ datasetAsOf: '2024-02-29' }));
  assert.equal(value.datasetAsOf, '2024-02-29');
});
test('rejects insecure and credential-bearing source URLs', () => {
  for (const value of ['http://example.org/a', 'https://user:pass@example.org/', 'ftp://example.org/', 'javascript:alert(1)', 'data:text/html,a', 'not-a-url', 'https://example.org/#fragment']) {
    shouldReject(mutate('sources', { sourceUrl: value }), /address|HTTPS/u);
  }
});
test('rejects local and private hostname URLs', () => {
  for (const value of ['https://localhost/', 'https://app.local/', 'https://demo.localhost/', 'https://127.0.0.1/', 'https://192.168.1.4/', 'https://10.1.1.2/', 'https://172.16.5.6/', 'https://169.254.1.2/']) {
    shouldReject(mutate('sources', { sourceUrl: value }), /addresses|hostname/u);
  }
});
test('rejects absolute and traversal page paths', () => {
  for (const value of ['/index.html', '../index.html', 'pages/../index.html', 'pages//index.html', 'C:\\temp\\index.html', 'http://example.org/', './index.html', '.hidden/index.html', 'pages/index.html?x=1']) {
    shouldReject(mutate('pages', { path: value }), /route|path|scheme/u);
  }
});
test('rejects unsafe path characters', () => {
  for (const value of ['pages/bad path.html', 'pages/%2e%2e/x.html', 'pages/x#y.html', 'pages/x.html?search', 'pages/été.html']) {
    shouldReject(mutate('pages', { path: value }), /route|character/u);
  }
});
test('retains explicit UNKNOWN source URL for audit rather than substituting data', () => {
  const parsed = parseObligationRegister(mutate('sources', { sourceUrl: 'UNKNOWN' }));
  assert.equal(parsed.sources[0].sourceUrl, 'UNKNOWN');
});
test('retains explicit UNKNOWN witness URL for audit', () => {
  const parsed = parseObligationRegister(mutate('witnesses', { url: 'UNKNOWN' }));
  assert.equal(parsed.witnesses[0].url, 'UNKNOWN');
});
test('does not infer a new URL from provider ID', () => {
  const parsed = parseObligationRegister(mutate('sources', { licenceUrl: 'UNKNOWN' }));
  assert.equal(parsed.sources[0].licenceUrl, 'UNKNOWN');
});
