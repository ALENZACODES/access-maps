// @ts-check

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { compareSnapshots } from './field-review-compare.mjs';
import { parseFieldSnapshot } from './field-review-input.mjs';
import { fieldReport } from './field-review-report.mjs';
import { localizedLabel } from './field-review-labels.mjs';

/** @param {Record<string,unknown>} fields @param {string} [id] @param {string} [region] */
function record(fields, id = 'r-1', region = 'area-a') {
  return { id, region, tranche: 'venue', fields };
}

/** @param {string|number|number[][]} value @param {Record<string,unknown>} [patch] */
function observation(value, patch = {}) {
  return { value, licence: 'terms-1', source_id: 's-1', retrieved_at: '2026-02-28', tier: 0, ...patch };
}

/** @param {unknown[]} left @param {unknown[]} right */
function comparison(left, right) {
  return compareSnapshots(parseFieldSnapshot(JSON.stringify(left)), parseFieldSnapshot(JSON.stringify(right)));
}

test('empty files produce a labelled zero-row report in each language', async () => {
  const empty = comparison([], []);
  const en = fieldReport(empty, {}, 'en');
  assert.equal(en.type, 'text/plain;charset=utf-8');
  assert.match(await en.text(), /Records in the first file: 0\nRecords in the second file: 0/);
  const fr = await fieldReport(empty, {}, 'fr').text();
  assert.match(fr, /^Comparaison des champs cartographiques\n/);
  assert.match(fr, /Aucune ligne ne correspond à cette sélection\.\n$/);
  assert.doesNotMatch(fr, /undefined|NaN|Références des sources/);
});

test('distinct source references survive a licence or date change with the same source ID', async () => {
  const old = observation('a');
  const newer = observation('a', { licence: 'terms-2', retrieved_at: '2026-03-01' });
  const view = comparison([record({ name: old, ramp: old })], [record({ name: newer, ramp: newer })]);
  const report = await fieldReport(view, { kind: 'evidence' }, 'en').text();
  assert.equal(report.match(/^\[\d+\] Source: "s-1"$/gm)?.length, 2);
  assert.equal(report.match(/Source reference: \[1\]/g)?.length, 2);
  assert.equal(report.match(/Source reference: \[2\]/g)?.length, 2);
  assert.match(report, /\[1\] Source: "s-1"\n  Licence: "terms-1"\n  Retrieval date: "2026-02-28"\n  Evidence tier: 0/);
  assert.match(report, /\[2\] Source: "s-1"\n  Licence: "terms-2"\n  Retrieval date: "2026-03-01"/);
  assert.match(report, /Differences: Licence, Retrieval date/);
});

test('the same source on another tier receives its own reference', async () => {
  const view = comparison([record({ ramp: observation('UNKNOWN') })],
    [record({ ramp: observation('UNKNOWN', { tier: 3 }) })]);
  const report = await fieldReport(view, {}, 'en').text();
  assert.match(report, /Differences: Evidence tier/);
  assert.equal(report.match(/\[\d\] Source:/g)?.length, 2);
  assert.match(report, /Evidence tier: 0/);
  assert.match(report, /Evidence tier: 3/);
});

test('selecting an old source keeps the corresponding new evidence but excludes unrelated fields', async () => {
  const first = record({ door: observation(0), width: observation(45, { source_id: 's-3' }) });
  const second = record({ door: observation('0', { source_id: 's-2' }), width: observation(50, { source_id: 's-3' }) });
  const view = comparison([first], [second]);
  const filters = { source: 's-1', changesOnly: true, tranche: 'venue', recordSide: 'both' };
  const report = await fieldReport(view, filters, 'en').text();
  assert.match(report, /Comparison rows before filtering: 2\nComparison rows in this report: 1/);
  assert.match(report, /Source: "s-1"/);
  assert.match(report, /Source: "s-2"/);
  assert.match(report, /Before: Value: 0\n/);
  assert.match(report, /After: Value: "0"\n/);
  assert.doesNotMatch(report, /width|s-3/);
});

test('absent entries, unknown values, explicit null and a false derived flag remain distinct', async () => {
  const first = record({ ramp: observation('UNKNOWN', { raw: null }), door: observation('UNKNOWN') });
  const second = record({ ramp: observation('UNKNOWN', { derived: false }) });
  const report = await fieldReport(comparison([first], [second]), { changesOnly: true }, 'en').text();
  assert.match(report, /After: Absent from this file/);
  assert.match(report, /Original token: null/);
  assert.match(report, /Original token: UNKNOWN/);
  assert.match(report, /Derived: No/);
  assert.match(report, /Derived: UNKNOWN/);
  assert.match(report, /Value: UNKNOWN/);
});

test('a supplied raw string spelling UNKNOWN is distinct from an omitted raw token', async () => {
  const a = record({ ramp: observation('UNKNOWN') });
  const b = record({ ramp: observation('UNKNOWN', { raw: 'UNKNOWN' }) });
  const report = await fieldReport(comparison([a], [b]), {}, 'en').text();
  assert.match(report, /Original token: UNKNOWN\n/);
  assert.match(report, /Original token: "UNKNOWN"\n/);
});

test('region-only rows include both region labels without fabricating source references', async () => {
  const emptyRecord = record({});
  const view = comparison([emptyRecord], [{ ...emptyRecord, region: 'area-b' }]);
  const report = await fieldReport(view, { kind: 'region' }, 'en').text();
  assert.match(report, /First region: "area-a"\nSecond region: "area-b"/);
  assert.match(report, /Change type: Region changed/);
  assert.doesNotMatch(report, /Source reference|Original token|Before: Value/);
});

test('empty field sets on one side remain traceable to their record', async () => {
  const view = comparison([record({}, 'one')], [record({}, 'two')]);
  const report = await fieldReport(view, { recordSide: 'after', changesOnly: true }, 'en').text();
  assert.match(report, /Record: "two"/);
  assert.match(report, /First region: Absent from this file/);
  assert.doesNotMatch(report, /Record: "one"/);
});

test('a geometry retains every ordered vertex in the text export', async () => {
  const vertices = Array.from({length: 200}, (_, i) => [i / 10, -i / 20]);
  const view = comparison([], [record({ geometry: observation(vertices) })]);
  const report = await fieldReport(view, {}, 'en').text();
  assert.ok(report.includes('After: Value: ' + JSON.stringify(vertices)));
});

test('text resembling row headings cannot inject additional lines', async () => {
  const malicious = 'first\nRecord: other\u2028last';
  const view = comparison([], [record({ description: observation(malicious) })]);
  const report = await fieldReport(view, {}, 'en').text();
  assert.equal(report.match(/^Record: /gm)?.length, 1);
  assert.ok(report.includes('first\\nRecord: other\\u2028last'));
});

test('French typography is applied only to authored labels, including substituted search text', async () => {
  const filters = { field: 'door', source: 'label:1', query: '?', changesOnly: true };
  const report = await fieldReport(comparison([], []), filters, 'fr').text();
  assert.ok(report.includes('Source\u00a0: "label:1"'));
  assert.ok(report.includes('Texte recherché\u00a0: "?"'));
  const label = localizedLabel('Who?', '« Qui ? » Ici ; oui ! Avec :');
  assert.equal(label.fr, '«\u202fQui\u202f?\u202f» Ici\u202f; oui\u202f! Avec\u00a0:');
});

test('a lower byte budget accounts for multibyte text and refuses partial reports', async () => {
  const data = comparison([], [record({ name: observation('é'.repeat(30)) })]);
  const full = fieldReport(data, {}, 'fr');
  assert.equal((await fieldReport(data, {}, 'fr', full.size).text()), await full.text());
  assert.throws(() => fieldReport(data, {}, 'fr', full.size - 1), {message: 'report-limit'});
  assert.throws(() => fieldReport(data, {}, 'fr', 64 * 1024 * 1024 + 1), {message: 'report-limit'});
});

test('changing the order of files’ records and keys leaves reference numbering deterministic', async () => {
  const a = record({ a: observation('a'), b: observation('b', { source_id: 's-2' }) });
  const b = record({ c: observation('c') }, 'r-2');
  const reversed = { ...a, fields: Object.fromEntries(Object.entries(a.fields).reverse()) };
  const one = await fieldReport(comparison([], [a, b]), {}, 'en').text();
  const two = await fieldReport(comparison([], [b, reversed]), {}, 'en').text();
  assert.equal(one, two);
});
