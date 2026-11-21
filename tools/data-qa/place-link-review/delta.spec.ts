import assert from "node:assert/strict";
import { test } from "node:test";
import type { LinkGroup, LinkMember, LinkPair, LinkSnapshot } from "./snapshot.ts";
import { diffLinks, GROUP_KINDS, PAIR_KINDS } from "./delta.ts";

function member(id: string, patch: Partial<LinkMember> = {}): LinkMember {
  return { tranche: "venue", id, cell: "n44.0_w080.0", sourceId: "fixture-" + id, ...patch };
}

function group(id: string, members: Array<string | LinkMember>, evidenceDigest = "e1"): LinkGroup {
  return { id, members: members.map(item => typeof item === "string" ? member(item) : item), evidenceDigest };
}

function pair(a: string | LinkMember, b: string | LinkMember, evidenceDigest = "p1"): LinkPair {
  return {
    a: typeof a === "string" ? member(a) : a,
    b: typeof b === "string" ? member(b) : b,
    evidenceDigest,
  };
}

function release(groups: LinkGroup[] = [], pairs: LinkPair[] = [], patch: Partial<LinkSnapshot> = {}): LinkSnapshot {
  return { method: "fixture", inputDigest: "records-1", skippedCount: 0, groups, pairs, ...patch };
}

test("empty inputs have zero counts, index-scoped coverage and release identity", () => {
  const output = diffLinks(release(), release([], [], { method: "fixture-next", inputDigest: "records-2" }));
  assert.deepEqual(output.previous, {
    method: "fixture", inputDigest: "records-1", skippedCount: 0, groups: 0, pairs: 0,
  });
  assert.equal(output.candidate.method, "fixture-next");
  assert.equal(output.candidate.inputDigest, "records-2");
  assert.equal(output.coverage, "no-skips-reported");
  assert.deepEqual(output.groupCounts, Object.fromEntries(GROUP_KINDS.map(k => [k, 0])));
  assert.deepEqual(output.pairCounts, Object.fromEntries(PAIR_KINDS.map(k => [k, 0])));
  assert.deepEqual(output.groups, []);
  assert.deepEqual(output.pairs, []);
});

test("only the tranche and upstream ID determine identity across releases", () => {
  const old = release([group("old", ["k", "q"])]);
  const next = release([group("old", [member("k", { tranche: "transit" }), member("q", { tranche: "washroom" })])]);
  const result = diffLinks(old, next);
  assert.deepEqual(result.groups.map(row => row.kind), ["added", "absent"]);
  assert.equal(result.groupCounts.retained, 0);
  assert.equal(result.groups[0]?.memberCounts.shared, 0);
  assert.equal(result.groups[1]?.memberCounts.absent, 2);
  assert.deepEqual(result.groups.map(row => row.overlaps), [[], []]);
});

test("retained declarations are counted without filling the review with unchanged rows", () => {
  const previous = release([group("g", ["a", "b"])], [pair("b", "c")]);
  const candidate = release([group("g", ["b", "a"])], [pair("c", "b")]);
  const { groupCounts, pairCounts, groups, pairs } = diffLinks(previous, candidate);
  assert.equal(groupCounts.retained, 1);
  assert.equal(pairCounts.retained, 1);
  assert.deepEqual(groups, []);
  assert.deepEqual(pairs, []);
});

test("directed group overlap sizes distinguish a split from several new identities", () => {
  const previous = release([group("old", ["a", "b", "c", "d", "e"])]);
  const candidate = release([group("south", ["a", "b"]), group("north", ["c", "d", "new"])]);
  const [change] = diffLinks(previous, candidate).groups;
  assert.equal(change?.kind, "split");
  assert.deepEqual(change?.overlaps, [
    { before: "old", after: "north", members: 2 },
    { before: "old", after: "south", members: 2 },
  ]);
  assert.deepEqual(change?.memberCounts, { shared: 4, added: 1, absent: 1, sourceChanged: 0, cellChanged: 0 });
  assert.deepEqual(change?.after.map(g => g.id), ["north", "south"]);
  const [inverse] = diffLinks(candidate, previous).groups;
  assert.equal(inverse?.kind, "merged");
  assert.deepEqual(inverse?.overlaps, [
    { before: "north", after: "old", members: 2 },
    { before: "south", after: "old", members: 2 },
  ]);
});

test("a chain of overlaps yields one many-to-many event across alternating releases", () => {
  const previous = release([
    group("3", ["e", "f", "g"]), group("1", ["a", "b"]), group("2", ["c", "d"]),
    group("stable", ["r", "s"]),
  ]);
  const candidate = release([
    group("z", ["f", "g"]), group("x", ["b", "c"]), group("y", ["d", "e"]),
    group("stable", ["r", "s"]),
  ]);
  const result = diffLinks(previous, candidate);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groupCounts.regrouped, 1);
  assert.equal(result.groupCounts.retained, 1);
  assert.deepEqual(result.groups[0]?.before.map(g => g.id), ["1", "2", "3"]);
  assert.deepEqual(result.groups[0]?.after.map(g => g.id), ["x", "y", "z"]);
  assert.deepEqual(result.groups[0]?.overlaps, [
    { before: "1", after: "x", members: 1 }, { before: "2", after: "x", members: 1 },
    { before: "2", after: "y", members: 1 }, { before: "3", after: "y", members: 1 },
    { before: "3", after: "z", members: 2 },
  ]);
});

test("one surviving group distinguishes growth, contraction and simultaneous replacement", () => {
  const old = release([group("north", ["a", "b"])]);
  const expanded = release([group("north-2", ["a", "b", "c"])]);
  assert.equal(diffLinks(old, expanded).groups[0]?.kind, "expanded");
  assert.equal(diffLinks(expanded, old).groups[0]?.kind, "contracted");
  const exchanged = release([group("north", ["a", "c"])]);
  const [change] = diffLinks(old, exchanged).groups;
  assert.equal(change?.kind, "membership");
  assert.deepEqual(change?.memberCounts, { shared: 1, added: 1, absent: 1, sourceChanged: 0, cellChanged: 0 });
});

test("a rekey can coincide with changed evidence and provenance without losing either side", () => {
  const old = release([group("first", ["a", "b"])]);
  const afterA = member("a", { sourceId: "fixture-corrected", cell: "n44.5_w080.0" });
  const afterB = member("b", { cell: "n44.5_w080.0" });
  const result = diffLinks(old, release([group("second", [afterB, afterA], "e2")]));
  const change = result.groups[0]!;
  assert.equal(change.kind, "rekeyed");
  assert.deepEqual(change.memberCounts, { shared: 2, added: 0, absent: 0, sourceChanged: 1, cellChanged: 2 });
  assert.deepEqual(change.sources, ["fixture-a", "fixture-b", "fixture-corrected"]);
  assert.equal(change.before[0]?.evidenceDigest, "e1");
  assert.equal(change.after[0]?.evidenceDigest, "e2");
  assert.deepEqual(change.after[0]?.members, [afterA, afterB]);
});

test("same group membership still exposes a change in source, cell, or matcher evidence", () => {
  const old = release([group("a", ["1", "2"]), group("b", ["3", "4"]), group("c", ["5", "6"])]);
  const candidate = release([
    group("a", [member("1", { sourceId: "corrected" }), "2"]),
    group("b", [member("3", { cell: "n44.5_w080.0" }), "4"]),
    group("c", ["5", "6"], "e2"),
  ]);
  const result = diffLinks(old, candidate);
  assert.deepEqual(result.groups.map(g => g.kind), ["metadata", "metadata", "evidence"]);
  assert.equal(result.groups[0]?.memberCounts.sourceChanged, 1);
  assert.equal(result.groups[1]?.memberCounts.cellChanged, 1);
  assert.equal(result.groups[2]?.after[0]?.evidenceDigest, "e2");
});

test("skip counts carry through to disclosures even when an entire previous component is absent", () => {
  const old = release([group("one", ["a", "b"])], [], { skippedCount: 2 });
  const next = release([], [], { skippedCount: 3 });
  const result = diffLinks(old, next);
  assert.equal(result.coverage, "skips-reported");
  assert.equal(result.previous.skippedCount, 2);
  assert.equal(result.candidate.skippedCount, 3);
  assert.equal(result.groups[0]?.kind, "absent");
  assert.deepEqual(result.groups[0]?.after, []);
  assert.equal(diffLinks(old, release()).coverage, "skips-reported");
  assert.equal(diffLinks(release(), next).coverage, "skips-reported");
});

test("promotion and demotion join only observed possible endpoints to the opposite release's groups", () => {
  const possible = release([], [pair("z", "a")]);
  const renamed = member("a", { sourceId: "fixture-amended", cell: "n44.0_w079.5" });
  const grouped = release([group("listed", [renamed, "z", "c"])]);
  const promoted = diffLinks(possible, grouped);
  assert.equal(promoted.groupCounts.added, 1);
  assert.equal(promoted.pairCounts.promoted, 1);
  assert.equal(promoted.pairs.length, 1);
  const row = promoted.pairs[0]!;
  assert.equal(row.before?.groupId, null);
  assert.equal(row.before?.possibleDigest, "p1");
  assert.equal(row.after?.groupId, "listed");
  assert.equal(row.after?.possibleDigest, null);
  assert.equal(row.before?.a.sourceId, "fixture-a");
  assert.deepEqual(row.after?.a, renamed);
  assert.deepEqual(row.sources, ["fixture-a", "fixture-amended", "fixture-z"]);
  const [reverse] = diffLinks(grouped, possible).pairs;
  assert.equal(reverse?.kind, "demoted");
  assert.deepEqual(reverse?.before, row.after);
  assert.deepEqual(reverse?.after, row.before);
});

test("group co-membership alone does not manufacture possible declarations", () => {
  const old = release([group("group", ["a", "b", "c", "d"])]);
  const next = release([group("l", ["a", "b"]), group("r", ["c", "d"])]);
  const output = diffLinks(old, next);
  assert.equal(output.groupCounts.split, 1);
  assert.equal(output.pairCounts.demoted, 0);
  assert.deepEqual(output.pairs, []);
});

test("same endpoint in separate candidate groups does not imply pair promotion", () => {
  const possible = release([], [pair("aa", "bb")]);
  const split = release([group("left", ["aa", "cc"]), group("right", ["bb", "dd"])]);
  assert.equal(diffLinks(possible, split).pairs[0]?.kind, "absent");
  assert.equal(diffLinks(split, possible).pairs[0]?.kind, "added");
});

test("a retained possible pair reports changed evidence and metadata separately", () => {
  const old = release([], [pair("a", "b"), pair("a", "c"), pair("d", "e")]);
  const candidate = release([], [
    pair("b", "a", "p2"),
    pair("c", member("a", { cell: "n44.5_w080.0", sourceId: "revised" }), "p3"),
    pair("e", "d"),
  ]);
  const { pairs, pairCounts } = diffLinks(old, candidate);
  assert.deepEqual(pairs.map(p => p.kind), ["evidence", "metadata"]);
  assert.equal(pairCounts.retained, 1);
  assert.equal(pairs[0]?.after?.a.id, "a");
  assert.equal(pairs[0]?.after?.possibleDigest, "p2");
  assert.equal(pairs[1]?.after?.possibleDigest, "p3");
  assert.equal(pairs[1]?.after?.a.sourceId, "revised");
});

test("a pair explicitly listed alongside a group retains both declarations", () => {
  const possible = pair("a", "b");
  const groupAB = group("group-ab", ["a", "b"]);
  const both = release([groupAB], [possible]);
  const onlyPair = release([], [possible]);
  const onlyGroup = release([groupAB]);
  for (const [from, to] of [[both, onlyPair], [onlyPair, both], [both, onlyGroup], [onlyGroup, both]] as const) {
    const output = diffLinks(from, to);
    assert.equal(output.pairs[0]?.kind, "relationship");
    assert.equal(output.pairCounts.promoted, 0);
    assert.equal(output.pairCounts.demoted, 0);
    const coexisting = from === both ? output.pairs[0]?.before : output.pairs[0]?.after;
    assert.equal(coexisting?.groupId, "group-ab");
    assert.equal(coexisting?.possibleDigest, "p1");
  }
  assert.equal(diffLinks(both, both).pairCounts.retained, 1);
});

test("source and cell changes on endpoints are kept distinct for identical bare IDs in two tranches", () => {
  const a = member("12", { tranche: "transit", sourceId: "fixture-transit" });
  const b = member("12", { tranche: "venue", sourceId: "fixture-venue" });
  const old = release([], [pair(a, b)]);
  const candidate = release([], [pair({ ...b, sourceId: "fixture-other" }, a)]);
  const [change] = diffLinks(old, candidate).pairs;
  assert.equal(change?.kind, "metadata");
  assert.deepEqual(change?.before?.a, a);
  assert.equal(change?.after?.b.sourceId, "fixture-other");
});

test("opaque endpoint identifiers with separators, Unicode, or reserved object keys stay distinct", () => {
  const previous = release([], [
    pair("a", "b|venue|c"), pair("a|venue|b", "c"),
    pair("__proto__", "é"), pair("constructor", "e\u0301"),
  ]);
  const result = diffLinks(previous, release());
  assert.equal(result.pairCounts.absent, 4);
  assert.equal(new Set(result.pairs.map(row => JSON.stringify([row.before?.a.id, row.before?.b.id]))).size, 4);
});

test("shuffled release, group, member and edge order cannot affect the serialized diff", () => {
  const old = release([group("q", ["a", "b"]), group("p", ["c", "d"]), group("t", ["x", "y"])],
    [pair("a", "c"), pair("d", "g"), pair("q", "s")]);
  const next = release([group("r", ["d", "b", "c"]), group("q", ["s", "q"])],
    [pair("x", "y"), pair("c", "a", "p2")]);
  function reversed(snapshot: LinkSnapshot): LinkSnapshot {
    return release(
      snapshot.groups.map(g => ({ ...g, members: [...g.members].reverse() })).reverse(),
      snapshot.pairs.map(p => ({ ...p, a: p.b, b: p.a })).reverse(),
    );
  }
  assert.equal(JSON.stringify(diffLinks(old, next)), JSON.stringify(diffLinks(reversed(old), reversed(next))));
});

test("comparison and subsequent report edits do not mutate either input release", () => {
  const old = release([group("z", ["b", "a"])], [pair("a", "d")]);
  const next = release([group("a", ["e", "b"])], [pair("a", "d", "p2")]);
  const original = JSON.stringify([old, next]);
  const changes = diffLinks(old, next);
  changes.groups[0]!.after[0]!.members[0]!.sourceId = "edited";
  changes.pairs[0]!.before!.a.sourceId = "edited";
  assert.equal(JSON.stringify([old, next]), original);
});

test("programmatic ambiguous memberships and duplicate possible declarations fail closed", () => {
  const invalid = [
    release([group("dup", ["a", "b"]), group("dup", ["c", "d"])]),
    release([group("x", ["a", "a"])]),
    release([group("x", ["a", "b"]), group("y", ["a", "c"])]),
    release([group("x", ["a"])]),
    release([], [pair("a", "a")]),
    release([], [pair("a", "b"), pair("b", "a", "different")]),
  ];
  for (const snapshot of invalid) {
    assert.throws(() => diffLinks(snapshot, release()), /Invalid|Repeated/u);
    assert.throws(() => diffLinks(release(), snapshot), /Invalid|Repeated/u);
  }
});

// A small, independent graph oracle deliberately tests all old/new group pairs.
// It checks the production traversal against transitive reachability for arbitrary
// partitions, including cases whose components never share a cluster identifier.
function oracle(before: LinkGroup[], after: LinkGroup[]): string[][] {
  const entries = [
    ...before.map(g => ({ key: "-" + g.id, members: g.members.map(m => m.id), next: false })),
    ...after.map(g => ({ key: "+" + g.id, members: g.members.map(m => m.id), next: true })),
  ];
  const remaining = new Set(entries);
  const components: string[][] = [];
  for (const seed of entries) {
    if (!remaining.delete(seed)) continue;
    const connected = [seed];
    for (const current of connected) {
      for (const other of remaining) {
        if (other.next !== current.next && other.members.some(m => current.members.includes(m))) {
          remaining.delete(other);
          connected.push(other);
        }
      }
    }
    components.push(connected.map(row => row.key).sort());
  }
  return components.sort((a, b) => a.join().localeCompare(b.join(), "en"));
}

test("reference graph agrees on 80 deterministic generated partition comparisons", () => {
  let state = 7891;
  function sample(size: number) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state % size;
  }
  function make(prefix: string) {
    const buckets: string[][] = Array.from({ length: 8 }, () => []);
    for (let i = 0; i < 24; i++) {
      if (sample(7) !== 0) buckets[sample(buckets.length)]!.push(String(i));
    }
    return buckets.map((ids, i) => group(prefix + i, ids)).filter(g => g.members.length >= 2);
  }
  for (let round = 0; round < 80; round++) {
    const old = make("from-");
    const next = make("to-");
    const expected = oracle(old, next);
    const result = diffLinks(release(old), release(next));
    const got = result.groups.map(change => [
      ...change.before.map(g => "-" + g.id), ...change.after.map(g => "+" + g.id),
    ].sort()).sort((a, b) => a.join().localeCompare(b.join(), "en"));
    assert.deepEqual(got, expected, "round " + round);
    for (const row of result.groups) {
      const before = new Set(row.before.flatMap(g => g.members.map(m => m.id)));
      const after = new Set(row.after.flatMap(g => g.members.map(m => m.id)));
      assert.equal(row.memberCounts.shared, [...before].filter(id => after.has(id)).length);
      assert.equal(row.overlaps.reduce((sum, edge) => sum + edge.members, 0), row.memberCounts.shared);
      assert.equal(row.memberCounts.shared + row.memberCounts.added, after.size);
      assert.equal(row.memberCounts.shared + row.memberCounts.absent, before.size);
    }
  }
});

test("a 12,000-member group inspects only the single previously declared possible pair", () => {
  const ids = Array.from({ length: 12_000 }, (_, index) => "id-" + index);
  const next = release([group("group", ids)]);
  const old = release([], [pair("id-107", "id-10107")]);
  const result = diffLinks(old, next);
  assert.equal(result.pairCounts.promoted, 1);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.groups[0]?.memberCounts.added, ids.length);
});
