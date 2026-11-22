// @ts-check

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {compareSnapshots, DIMENSIONS, KINDS, pageRows, selectRows} from './field-review-compare.mjs';

/** @typedef {import('./field-review-input.mjs').FieldEvidence} FieldEvidence */
/** @typedef {import('./field-review-input.mjs').FieldRecord} FieldRecord */
/** @typedef {import('./field-review-compare.mjs').ReviewRow} ReviewRow */

/** @param {Partial<FieldEvidence>} [overrides] @returns {FieldEvidence} */
function evidence(overrides = {}) {
  return {
    value: 'UNKNOWN', source: 'source-a', licence: 'terms-a', retrievedOn: '2026-03-14',
    tier: 0, sourceKey: 'UNKNOWN', raw: null, rawPresent: false, derived: null, ...overrides,
  };
}

/** @param {string} id @param {Record<string,FieldEvidence>} fields @param {string} [region] @param {string} [tranche] @returns {FieldRecord} */
function record(id, fields, region = 'east', tranche = 'venue') {
  return {id, tranche, region, fields};
}

/** @param {FieldEvidence|null} before @param {FieldEvidence|null} after */
function oneField(before, after) {
  const result = compareSnapshots(
    [record('item', before ? {width: before} : {})],
    [record('item', after ? {width: after} : {})],
  );
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.ok(row);
  return row;
}

describe('matching by record identity', () => {
  it('matches equal IDs within a tranche and keeps the same ID in another tranche independent', () => {
    const before = [
      record('shared', {width: evidence()}),
      record('shared', {surface: evidence()}, 'east', 'path'),
    ];
    const after = [record('shared', {width: evidence({value: 0})})];
    const {rows, totals} = compareSnapshots(before, after);
    assert.deepEqual(rows.map(row => [row.tranche, row.id, row.field, row.kind, row.recordSide]), [
      ['path', 'shared', 'surface', 'field-before', 'before'],
      ['venue', 'shared', 'width', 'reported', 'both'],
    ]);
    assert.equal(totals.records, 2);
  });

  it('never collapses differing pairs of text components into a joined identifier', () => {
    const before = [
      record('x|y', {a: evidence()}, 'west', 'entry'),
      record('y', {a: evidence()}, 'west', 'entry|x'),
      record('y', {b: evidence()}, 'west', 'entry'),
    ];
    const after = [record('x|y', {a: evidence({value: 'text'})}, 'west', 'entry')];
    const result = compareSnapshots(before, after);
    assert.deepEqual(result.totals.bySide, {both: 1, before: 2, after: 0});
    assert.deepEqual(result.rows.map(r => [r.id, r.tranche, r.kind]), [
      ['x|y', 'entry', 'reported'], ['y', 'entry', 'field-before'], ['y', 'entry|x', 'field-before'],
    ]);
  });

  it('rejects an ambiguous duplicate within either input, including a second region', () => {
    const duplicate = [record('a', {}), record('a', {}, 'west')];
    assert.throws(() => compareSnapshots(duplicate, []), {name: 'RangeError', message: 'duplicate'});
    assert.throws(() => compareSnapshots([], duplicate), {name: 'RangeError', message: 'duplicate'});
  });

  it('emits a single independent region marker before fields and retains both original values', () => {
    const left = record('id', {b: evidence({value: 'one'}), a: evidence()}, 'first');
    const right = record('id', {a: evidence(), b: evidence({value: 'two'})}, 'second');
    const result = compareSnapshots([left], [right]);
    assert.deepEqual(result.rows.map(row => [row.field, row.kind, row.dimensions]), [
      [null, 'region', ['region']], ['a', 'same', []], ['b', 'value', ['value']],
    ]);
    for (const row of result.rows) {
      assert.equal(row.regionBefore, 'first');
      assert.equal(row.regionAfter, 'second');
      assert.equal(row.recordSide, 'both');
    }
    const moved = result.rows[0];
    assert.ok(moved);
    assert.equal(moved.before, null);
    assert.equal(moved.after, null);
    assert.equal(result.totals.records, 1);
    assert.equal(result.totals.fields, 2);
    assert.equal(result.totals.changed, 2);
  });

  it('preserves records without fields while keeping field totals at zero', () => {
    const result = compareSnapshots(
      [record('a', {}), record('b', {}), record('d', {})],
      [record('a', {}), record('c', {}), record('d', {}, 'other')],
    );
    assert.equal(result.totals.records, 4);
    assert.equal(result.totals.fields, 0);
    assert.equal(result.totals.changed, 3);
    assert.equal(result.totals.byKind.empty, 3);
    assert.deepEqual(selectRows(result, {changesOnly: true}).rows.map(r => [r.id, r.kind]), [
      ['b', 'empty'], ['c', 'empty'], ['d', 'region'],
    ]);
    assert.deepEqual(result.rows.map(r => [r.regionBefore, r.regionAfter]), [
      ['east', 'east'], ['east', null], [null, 'east'], ['east', 'other'],
    ]);
  });

  it('accepts dictionary field names without reading the object prototype on the other side', () => {
    const keys = ['toString', 'constructor', '__proto__'];
    const fields = Object.fromEntries(keys.map(key => [key, evidence()]));
    const result = compareSnapshots([record('a', fields)], [record('a', {})]);
    assert.deepEqual(result.facets.fields, [...keys].sort());
    assert.ok(result.rows.every(row => row.kind === 'field-before' && row.after === null));
    const reverse = compareSnapshots([record('a', {})], [record('a', fields)]);
    assert.ok(reverse.rows.every(row => row.kind === 'field-after' && row.before === null));
  });
});

describe('field values and attribution', () => {
  it('distinguishes a missing field from an observed UNKNOWN, in both directions', () => {
    const unknown = evidence({value: 'UNKNOWN', source: 'source-x'});
    const first = oneField(null, unknown);
    assert.equal(first.kind, 'field-after');
    assert.equal(first.before, null);
    assert.equal(first.after, unknown);
    assert.deepEqual(first.dimensions, []);
    const second = oneField(unknown, null);
    assert.equal(second.kind, 'field-before');
    assert.equal(second.before, unknown);
    assert.equal(second.after, null);
  });

  it('accepts zero as a reported value and keeps different primitive types distinct', () => {
    const unknown = evidence();
    const zero = evidence({value: 0});
    assert.equal(oneField(unknown, zero).kind, 'reported');
    assert.equal(oneField(zero, unknown).kind, 'became-unknown');
    assert.equal(oneField(zero, evidence({value: '0'})).kind, 'value');
    assert.equal(oneField(zero, evidence({value: 0})).kind, 'same');
    assert.equal(oneField(unknown, evidence({value: 'unknown'})).kind, 'reported');
  });

  it('records concurrent changes to the original value and all evidence dimensions', () => {
    const before = evidence({value: 'low'});
    const after = evidence({
      value: 'high', source: 'source-b', licence: 'terms-b', retrievedOn: '2026-04-01',
      tier: 2, sourceKey: 'height', raw: 0, rawPresent: true, derived: false,
    });
    const row = oneField(before, after);
    assert.equal(row.kind, 'value');
    assert.deepEqual(row.dimensions, DIMENSIONS.filter(dimension => dimension !== 'region'));
    assert.equal(row.before, before);
    assert.equal(row.after, after);
  });

  it('keeps evidence changes on both unknown transitions', () => {
    const before = evidence({tier: 1});
    const after = evidence({value: 'token', tier: 2});
    const forward = oneField(before, after);
    const backward = oneField(after, before);
    assert.deepEqual([forward.kind, forward.dimensions], ['reported', ['value', 'tier']]);
    assert.deepEqual([backward.kind, backward.dimensions], ['became-unknown', ['value', 'tier']]);
  });

  it('reports changes from missing provenance to stated metadata without changing UNKNOWN', () => {
    const partial = evidence({source: 'UNKNOWN', licence: 'UNKNOWN', retrievedOn: 'UNKNOWN', tier: 'UNKNOWN'});
    const populated = evidence();
    const row = oneField(partial, populated);
    assert.equal(row.kind, 'evidence');
    assert.deepEqual(row.dimensions, ['source', 'licence', 'retrievedOn', 'tier']);
    assert.equal(row.before?.value, 'UNKNOWN');
    assert.equal(row.after?.value, 'UNKNOWN');
  });

  it('distinguishes omitted raw, explicit null, a number and a string in recorded evidence', () => {
    const omitted = evidence();
    const explicit = evidence({rawPresent: true});
    const numeric = evidence({rawPresent: true, raw: 0});
    const textual = evidence({rawPresent: true, raw: '0'});
    for (const [left, right] of /** @type {const} */ ([
      [omitted, explicit], [explicit, omitted], [explicit, numeric], [numeric, textual],
    ])) {
      const change = oneField(left, right);
      assert.deepEqual([change.kind, change.dimensions], ['evidence', ['raw']]);
    }
    assert.equal(oneField(explicit, evidence({rawPresent: true})).kind, 'same');
  });

  it('distinguishes a stated derived flag from absence as well as true from false', () => {
    for (const [oldFlag, newFlag] of /** @type {const} */ ([[null, false], [false, true], [true, null]])) {
      const row = oneField(evidence({derived: oldFlag}), evidence({derived: newFlag}));
      assert.deepEqual(row.dimensions, ['derived']);
      assert.equal(row.kind, 'evidence');
    }
  });

  it('compares geometric coordinates by type, axis, point order and point count', () => {
    const value = [[-2, 1], [3, 4], [-2, 1]];
    const original = evidence({value});
    const identical = evidence({value: value.map(point => [...point])});
    assert.equal(oneField(original, identical).kind, 'same');
    const changed = [
      [[-2, 1], [3, 5], [-2, 1]],
      [[3, 4], [-2, 1], [-2, 1]],
      [[-2, 1], [3, 4]],
      [[1, -2], [3, 4], [-2, 1]],
    ];
    for (const path of changed) assert.equal(oneField(original, evidence({value: path})).kind, 'value');
    assert.equal(oneField(original, evidence({value: JSON.stringify(value)})).kind, 'value');
    assert.equal(oneField(identical, evidence({value, sourceKey: 'line'})).kind, 'evidence');
  });
});

/** A small input spanning all filter dimensions, including repeated sources. */
function filterExample() {
  const before = [
    record('a-10', {ramp: evidence({source: 'ancien'}), width: evidence()}, 'côté'),
    record('a-11', {surface: evidence({source: 'source-b'})}),
    record('a-10', {ramp: evidence({source: 'source-b'})}, 'west', 'path'),
  ];
  const after = [
    record('a-10', {ramp: evidence({value: 'yes', source: 'neuf'}), width: evidence()}, 'nord'),
    record('a-12', {surface: evidence({source: 'UNKNOWN'})}),
    record('a-10', {ramp: evidence({source: 'source-b', retrievedOn: '2026-04-01'})}, 'west', 'path'),
  ];
  return compareSnapshots(before, after);
}

describe('facets, selection and pages', () => {
  it('includes each distinct field, source from either side, and tranche in deterministic order', () => {
    assert.deepEqual(filterExample().facets, {
      fields: ['ramp', 'surface', 'width'],
      sources: ['UNKNOWN', 'ancien', 'neuf', 'source-a', 'source-b'],
      tranches: ['path', 'venue'],
    });
  });

  it('intersects exact filters and matches an attribution that survived on only one side', () => {
    const result = filterExample();
    for (const source of ['neuf', 'ancien']) {
      const selected = selectRows(result, {tranche: 'venue', source, field: 'ramp', kind: 'reported', recordSide: 'both'});
      assert.deepEqual(selected.rows.map(row => [row.id, row.kind]), [['a-10', 'reported']]);
      assert.equal(selected.totals.records, 1);
      assert.equal(selected.totals.changed, 1);
    }
    assert.equal(selectRows(result, {source: 'Ancien'}).totals.rows, 0);
    assert.equal(selectRows(result, {recordSide: 'before', source: 'neuf'}).totals.rows, 0);
    assert.equal(selectRows(result, {source: 'UNKNOWN'}).totals.rows, 1);
    assert.equal(selectRows(result, {kind: 'region', source: 'neuf'}).totals.rows, 0);
  });

  it('matches multiple search words across both regions and names while preserving accents for display', () => {
    const result = filterExample();
    const filtered = selectRows(result, {query: ' A-10   COTE\nNORD RAMP neuf '});
    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.rows[0]?.regionBefore, 'côté');
    assert.equal(selectRows(result, {query: 'nord absent'}).rows.length, 0);
    assert.equal(selectRows(result, {query: 'a-10', field: 'ramp'}).totals.records, 2);
  });

  it('counts selected record sides once per identity and leaves the full totals intact', () => {
    const result = filterExample();
    const originalTotals = structuredClone(result.totals);
    const filtered = selectRows(result, {tranche: 'venue', changesOnly: true});
    assert.deepEqual(filtered.totals.bySide, {before: 1, after: 1, both: 1});
    assert.equal(filtered.totals.byKind.same, 0);
    assert.equal(filtered.totals.fields, 3);
    assert.equal(filtered.totals.changed, 4);
    assert.equal(filtered.totals.rows, 4);
    assert.deepEqual(result.totals, originalTotals);
    assert.equal(selectRows(result, {query: ' \t '}).rows, result.rows);
  });

  it('provides zero counts for every kind and no phantom page when the selection is empty', () => {
    const result = selectRows(filterExample(), {kind: 'no-match'});
    assert.deepEqual(Object.keys(result.totals.byKind).sort(), [...KINDS].sort());
    assert.ok(Object.values(result.totals.byKind).every(count => count === 0));
    assert.deepEqual(result.totals.bySide, {before: 0, after: 0, both: 0});
    assert.deepEqual(pageRows(result.rows, 5, 10), {rows: [], page: 0, pages: 0, first: 0, last: 0, total: 0});
  });

  it('clamps stale page numbers, reports the displayed range, and preserves row references', () => {
    const {rows} = filterExample();
    const first = pageRows(rows, -1, 2);
    assert.deepEqual([first.first, first.last, first.page, first.pages, first.total], [1, 2, 1, 3, 6]);
    assert.equal(first.rows[0], rows[0]);
    const last = pageRows(rows, 200, 4);
    assert.deepEqual([last.first, last.last, last.page, last.pages, last.total], [5, 6, 2, 2, 6]);
    assert.deepEqual([...pageRows(rows, 1, 4).rows, ...last.rows], rows);
  });

  it('rejects invalid page sizes or fractional indices before slicing even an empty selection', () => {
    for (const invalid of [0, -1, 1.5, Infinity, NaN]) {
      assert.throws(() => pageRows([], 1, invalid), {name: 'RangeError', message: 'pageSize'});
    }
    for (const invalid of [2.2, -Infinity, NaN]) {
      assert.throws(() => pageRows([], invalid), {name: 'RangeError', message: 'page'});
    }
  });
});

describe('cross-checks', () => {
  it('covers every union field exactly once and reconciles classifications against the source records', () => {
    const old = Array.from({length: 24}, (_, index) => record('r' + index, {
      width: evidence({value: index, tier: index % 4}), surface: evidence({value: 'UNKNOWN'}),
    }, 'first', index % 2 ? 'venue' : 'path'));
    const next = old.filter((_, index) => index % 5 !== 0).map((row, index) => {
      /** @type {Record<string,FieldEvidence>} */
      const fields = {...row.fields};
      if (index % 3 === 0) fields.width = evidence({value: 'UNKNOWN', tier: 3});
      if (index % 4 === 0) delete fields.surface;
      if (index % 6 === 0) fields.entrance = evidence({value: 'UNKNOWN'});
      return {...row, region: index % 2 ? 'second' : row.region, fields};
    });
    next.push(record('new', {width: evidence({value: 0})}));
    const result = compareSnapshots(old, next);
    const flattened = result.rows.map(row => JSON.stringify([row.tranche, row.id, row.field]));
    assert.equal(new Set(flattened).size, flattened.length);
    const lookup = (/** @type {FieldRecord[]} */ list, /** @type {ReviewRow} */ row) =>
      list.find(item => item.tranche === row.tranche && item.id === row.id);
    for (const row of result.rows) {
      const left = lookup(old, row);
      const right = lookup(next, row);
      assert.equal(row.recordSide, left && right ? 'both' : left ? 'before' : 'after');
      if (row.field === null) {
        assert.notEqual(left?.region, right?.region);
        assert.equal(row.kind, 'region');
      } else {
        assert.equal(row.before, left?.fields[row.field] ?? null);
        assert.equal(row.after, right?.fields[row.field] ?? null);
      }
    }
    const expectedKeys = new Set([
      ...old.flatMap(row => Object.keys(row.fields).map(key => JSON.stringify([row.tranche, row.id, key]))),
      ...next.flatMap(row => Object.keys(row.fields).map(key => JSON.stringify([row.tranche, row.id, key]))),
    ]);
    const fieldKeys = result.rows.filter(row => row.field !== null).map(row => JSON.stringify([row.tranche, row.id, row.field]));
    assert.deepEqual(new Set(fieldKeys), expectedKeys);
    for (const kind of KINDS) {
      const selected = selectRows(result, {kind});
      assert.equal(selected.totals.rows, result.totals.byKind[kind]);
      assert.equal(selected.totals.records, new Set(selected.rows.map(row => JSON.stringify([row.tranche, row.id]))).size);
    }
  });

  it('returns the same order for reordered input arrays and field keys without mutating the originals', () => {
    const entries = {z: evidence({value: 0}), a: evidence()};
    const earlier = [record('b', entries), record('a', {a: evidence()})];
    const later = [record('a', {c: evidence()}), record('b', {a: evidence(), z: evidence({value: 1})})];
    const original = structuredClone({earlier, later});
    const first = compareSnapshots(Object.freeze(earlier), Object.freeze(later));
    const reorder = (/** @type {FieldRecord} */ r) => ({
      ...r, fields: Object.fromEntries(Object.entries(r.fields).reverse()),
    });
    const second = compareSnapshots([...earlier].reverse().map(reorder), [...later].reverse().map(reorder));
    assert.deepEqual(first, second);
    assert.deepEqual({earlier, later}, original);
  });
});
