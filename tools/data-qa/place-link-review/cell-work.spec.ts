import assert from "node:assert/strict";
import { test } from "node:test";
import { cellWork, selectCellWork } from "./cell-work.ts";
import type { MemberChange, ReviewBook, ReviewCase } from "./review.ts";

const east = "n44.0_w079.5";
const west = "n44.0_w080.0";
const north = "n44.5_w079.5";

function movement(id: string, previous: string | null, candidate: string | null): MemberChange {
  const position = (cell: string | null) => cell === null ? null : { sourceId: "fictional", cell, groupId: "synthetic" };
  return { id, tranche: "venue", previous: position(previous), candidate: position(candidate) };
}

function item(id: string, members: MemberChange[], patch: Partial<ReviewCase> = {}): ReviewCase {
  return {
    id, members, family: "group", kind: "membership", fingerprint: "fixture", restricted: false,
    citations: [], cells: [], priority: "identity", previousGroups: 1, candidateGroups: 1,
    fields: [], matchingEvidence: null, accessibility: "UNKNOWN", ...patch,
  };
}

function book(cases: ReviewCase[]): ReviewBook {
  const candidate = {
    method: "test", inputDigest: "synthetic", groups: 0, groupedMembers: 0,
    possiblePairs: 0, cells: 0, sourceIds: [], skippedInputs: 0, inputs: null,
  };
  return { schema: "place-link-review/v1", mode: "comparison", previous: candidate, candidate,
    citations: [], groupCounts: null, pairCounts: null, cases };
}

test("a cross-cell split assigns the full case once to each cell and records each side independently", () => {
  const split = item("case-a", [
    movement("1", west, west), movement("2", east, north), movement("3", east, north),
    movement("4", null, north), movement("5", east, null),
  ], { kind: "split" });
  const work = cellWork(book([split]));
  assert.equal(work.totalCases, 1);
  assert.equal(work.locatedCases, 1);
  assert.equal(work.assignments, 3);
  assert.equal(work.crossCellCases, 1);
  assert.deepEqual(work.rows.map(row => [row.cell, row.previousOnly, row.candidateOnly, row.both]), [
    [east, 1, 0, 0], [west, 0, 0, 1], [north, 0, 1, 0],
  ]);
  for (const row of work.rows) {
    assert.equal(row.cases, 1);
    assert.equal(row.splits, 1);
    assert.equal(row.crossCell, 1);
  }
});

test("a cell shared by different members across releases is counted on both sides", () => {
  const changed = item("case-a", [movement("old", east, null), movement("new", null, east)]);
  const [row] = cellWork(book([changed])).rows;
  assert.deepEqual(row, {
    cell: east, cases: 1, previousOnly: 0, candidateOnly: 0, both: 1,
    groups: 1, pairs: 0, splits: 0, merges: 0, regrouped: 0, crossCell: 0,
  });
});

test("a move distributes workload across cells even if neither release spans two cells by itself", () => {
  const work = cellWork(book([item("case", [movement("one", west, east)], { family: "pair", kind: "metadata" })]));
  assert.equal(work.assignments, 2);
  assert.equal(work.crossCellCases, 1);
  assert.deepEqual(work.rows.map(row => [row.cell, row.pairs, row.crossCell]), [[east, 1, 1], [west, 1, 1]]);
});

test("restricted, source-metadata and unlocated cases produce three disjoint counts and no location leaks", () => {
  const hidden = item("private-key", [movement("private-member", north, north)], {
    restricted: true, cells: [north], family: "source",
  });
  const source = item("source-a", [movement("untrusted-location", east, east)], { family: "source", cells: [east] });
  const unlocated = item("unlocated", [], { cells: [west] });
  const empty = item("no-position", [movement("lost", null, null)]);
  const work = cellWork(book([hidden, source, unlocated, empty]));
  assert.deepEqual(work.unlocated, { restricted: 1, source: 1, unknown: 2 });
  assert.equal(work.locatedCases, 0);
  assert.equal(work.totalCases, 4);
  assert.deepEqual(work.rows, []);
  assert.doesNotMatch(JSON.stringify(work), /fictional|private|n44\.|source-a|untrusted/u);
});

test("invalid cache keys cannot produce a partially located case", () => {
  for (const invalid of ["", "unknown", "n44.2_w080.0", "n44.0_w080.00", "s00.0_w080.0", "n90.0_w080.0"]) {
    const work = cellWork(book([item("bad", [movement("valid-side", west, invalid)])]));
    assert.equal(work.unlocated.unknown, 1, invalid);
    assert.equal(work.assignments, 0);
  }
});

function workload() {
  const shared = movement("base", east, east);
  return book([
    item("merge", [shared, movement("outer", north, east)], { kind: "merged" }),
    item("regroup", [shared], { kind: "regrouped" }),
    item("pair", [shared, movement("other", west, west)], { family: "pair", kind: "promoted" }),
    item("new", [movement("new", null, north)], { kind: "added" }),
    item("vanished", [movement("former", west, null)], { kind: "absent" }),
  ]);
}

test("row counts partition global work and prioritize busiest cells with deterministic lexical ties", () => {
  const result = cellWork(workload());
  assert.equal(result.locatedCases, 5);
  assert.equal(result.assignments, 7);
  assert.equal(result.crossCellCases, 2);
  assert.deepEqual(result.rows.map(row => [row.cell, row.cases]), [[east, 3], [west, 2], [north, 2]]);
  assert.deepEqual(result.rows.map(row => [row.groups, row.pairs]), [[2, 1], [1, 1], [2, 0]]);
  assert.deepEqual(result.rows.map(row => [row.splits, row.merges, row.regrouped]), [[0, 1, 1], [0, 0, 0], [0, 1, 0]]);
  assert.equal(result.rows.reduce((total, row) => total + row.cases, 0), result.assignments);
  for (const row of result.rows) {
    assert.equal(row.previousOnly + row.candidateOnly + row.both, row.cases);
    assert.equal(row.groups + row.pairs, row.cases);
  }
});

test("per-cell output excludes record IDs, decisions, source identifiers, case keys and coordinates", () => {
  const work = cellWork(book([item("opaque-case-id", [movement("private-record-id", east, east)], {
    fields: ["private-value"], fingerprint: "never-show",
  })]));
  assert.doesNotMatch(JSON.stringify(work), /opaque-case-id|never-show|private-record-id|fictional|private-value|synthetic/u);
  assert.equal(work.rows.length, 1);
});

test("case and member permutations leave the complete workload byte-identical", () => {
  const input = workload();
  const reversed = book(input.cases.slice().reverse().map(row => ({ ...row, members: row.members.slice().reverse() })));
  assert.equal(JSON.stringify(cellWork(input)), JSON.stringify(cellWork(reversed)));
});

test("the workload rejects repeated case IDs rather than double-count a repeated export page", () => {
  const one = item("same", [movement("1", east, west)]);
  assert.throws(() => cellWork(book([one, { ...one, members: [] }])), /duplicate-case/u);
});

test("row windows are bounded separately from case positions and keep the whole-book totals", () => {
  const work = cellWork(workload());
  const first = selectCellWork(work, { perPage: 1 });
  const last = selectCellWork(work, { perPage: 1, page: 3 });
  assert.deepEqual(first.rows.map(row => row.cell), [east]);
  assert.deepEqual(last.rows.map(row => row.cell), [north]);
  for (const result of [first, last]) {
    assert.equal(result.totalCells, 3);
    assert.equal(result.matchedCells, 3);
    assert.equal(result.pages, 3);
    assert.equal(result.totalCases, 5);
    assert.equal(result.locatedCases, 5);
    assert.equal(result.assignments, 7);
  }
  first.rows[0]!.cases = 500;
  first.unlocated.unknown = 30;
  assert.equal(work.rows[0]!.cases, 3);
  assert.equal(work.unlocated.unknown, 0);
});

test("an exact cell selection never expands to unrelated cells, including an empty result", () => {
  const work = cellWork(workload());
  const matching = selectCellWork(work, { cell: west });
  assert.equal(matching.matchedCells, 1);
  assert.equal(matching.totalCells, 3);
  assert.deepEqual(matching.rows.map(row => row.cell), [west]);
  const none = selectCellWork(work, { cell: "n43.0_w081.0" });
  assert.equal(none.page, 1);
  assert.equal(none.pages, 1);
  assert.equal(none.matchedCells, 0);
  assert.deepEqual(none.rows, []);
  assert.throws(() => selectCellWork(work, { cell: west, page: 2 }), /page/u);
});

test("window boundaries are checked on empty and nonempty inventories", () => {
  const work = cellWork(book([]));
  const page = selectCellWork(work);
  assert.equal(page.pages, 1);
  assert.equal(page.perPage, 25);
  for (const value of [-1, 0, 1.5, NaN, Infinity]) {
    assert.throws(() => selectCellWork(work, { perPage: value }), /per-page/u);
    assert.throws(() => selectCellWork(work, { page: value }), /page/u);
  }
  assert.throws(() => selectCellWork(work, { perPage: 101 }), /per-page/u);
  assert.throws(() => selectCellWork(work, { cell: "n43.25_w081.0" }), /cell/u);
});

test("a large cluster and repeated endpoint positions create one assignment per unique cell", () => {
  const members = Array.from({ length: 10_000 }, (_, i) => movement("member-" + i, east, i % 2 ? west : east));
  const work = cellWork(book([item("large-case", members, { kind: "split" })]));
  assert.equal(work.assignments, 2);
  assert.deepEqual(work.rows.map(row => row.cases), [1, 1]);
  assert.ok(JSON.stringify(work).length < 1000);
});
