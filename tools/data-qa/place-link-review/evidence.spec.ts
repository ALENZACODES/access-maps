import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLinks, type GroupChange, type PairChange, type PairDeclaration } from "./delta.ts";
import { groupEvidence, pairEvidence } from "./evidence.ts";
import type { LinkGroup, LinkMember, LinkSnapshot } from "./snapshot.ts";

type Projected = NonNullable<LinkGroup["publicationEdges"]>;
function member(id: string): LinkMember {
  return { id, tranche: "venue", sourceId: "fixture-" + id, cell: "n44.0_w080.0" };
}
function group(id: string, members: string[], digest: string, edges?: Projected): LinkGroup {
  return { id, members: members.map(member), evidenceDigest: digest,
    ...(edges === undefined ? {} : { publicationEdges: edges }) };
}
function edge(a: string, b: string, digest: string): Projected[number] {
  return { a, b, digest };
}
function release(groups: LinkGroup[]): LinkSnapshot {
  return { groups, pairs: [], inputDigest: "fixture-input", method: "fixture-method", skippedCount: 0 };
}
function groupChange(before: LinkGroup[], after: LinkGroup[]): GroupChange {
  return {
    before, after, sources: [], kind: "evidence", overlaps: [],
    memberCounts: { shared: 0, added: 0, absent: 0, sourceChanged: 0, cellChanged: 0 },
  };
}
function possible(possibleDigest: string | null, groupId: string | null): PairDeclaration {
  return { a: member("private-record-a"), b: member("private-record-b"), possibleDigest, groupId };
}
function pairChange(before: PairDeclaration | null, after: PairDeclaration | null): PairChange {
  return { before, after, sources: [], kind: "relationship" };
}

test("evidence-only changes show both full digests and counts for each kind of published-edge change", () => {
  const members = ["a", "b", "c", "d"];
  const previous = group("g", members, "older-full", [
    edge("a", "b", "one"), edge("b", "c", "two"), edge("c", "d", "three"),
  ]);
  const candidate = group("g", members, "new-full", [
    edge("b", "a", "one"), edge("c", "b", "revised"), edge("a", "d", "four"),
  ]);
  const [change] = diffLinks(release([previous]), release([candidate])).groups;
  assert.equal(change?.kind, "evidence");
  assert.deepEqual(groupEvidence(change!), {
    previous: { groups: [{ id: "g", digest: "older-full" }], possibleDigest: null },
    candidate: { groups: [{ id: "g", digest: "new-full" }], possibleDigest: null },
    edges: { unchanged: 1, changed: 1, added: 1, absent: 1 },
  });
});

test("unchanged projected edges do not erase a change to evidence outside the publication fields", () => {
  const previous = group("g", ["a", "b"], "first", [edge("a", "b", "same")]);
  const candidate = group("g", ["a", "b"], "second", [edge("b", "a", "same")]);
  const evidence = groupEvidence(groupChange([previous], [candidate]));
  assert.deepEqual(evidence.edges, { unchanged: 1, added: 0, absent: 0, changed: 0 });
  assert.notEqual(evidence.previous.groups[0]?.digest, evidence.candidate.groups[0]?.digest);
});

test("split and merge counts follow endpoint pairs instead of changed group identifiers", () => {
  const initial = group("parent", ["a", "b", "c", "d"], "all", [
    edge("a", "b", "ab"), edge("b", "c", "bc"), edge("c", "d", "cd"),
  ]);
  const split = [group("south", ["c", "d"], "south-data", [edge("d", "c", "cd-edited")]),
    group("north", ["a", "b"], "north-data", [edge("a", "b", "ab")])];
  const [forward] = diffLinks(release([initial]), release(split)).groups;
  const [backward] = diffLinks(release(split), release([initial])).groups;
  assert.equal(forward?.kind, "split");
  assert.equal(backward?.kind, "merged");
  const splitEvidence = groupEvidence(forward!);
  assert.deepEqual(splitEvidence.candidate.groups.map(g => g.id), ["north", "south"]);
  assert.deepEqual(splitEvidence.edges, { unchanged: 1, added: 0, absent: 1, changed: 1 });
  assert.deepEqual(groupEvidence(backward!).edges, { unchanged: 1, added: 1, absent: 0, changed: 1 });
});

test("partially projected nonempty components yield unknown counts while preserving group digests", () => {
  const complete = group("a", ["m", "n"], "a", [edge("m", "n", "x")]);
  const unavailable = group("b", ["q", "p"], "b");
  for (const [before, after] of [[[complete, unavailable], []], [[], [complete, unavailable]], [[unavailable], [complete]]] as const) {
    const result = groupEvidence(groupChange([...before], [...after]));
    assert.equal(result.edges, null);
    assert.equal(result.previous.groups.length, before.length);
    assert.equal(result.candidate.groups.length, after.length);
  }
});

test("an absent component and a known empty edge list are fully comparable", () => {
  const next = group("next", ["a", "b"], "new", [edge("a", "b", "x")]);
  const empty = group("empty", ["x", "y"], "empty-projection", []);
  assert.deepEqual(groupEvidence(groupChange([], [next])).edges, { unchanged: 0, added: 1, absent: 0, changed: 0 });
  assert.deepEqual(groupEvidence(groupChange([next], [])).edges, { unchanged: 0, added: 0, absent: 1, changed: 0 });
  assert.deepEqual(groupEvidence(groupChange([empty], [])).edges, { unchanged: 0, added: 0, absent: 0, changed: 0 });
});

test("inconsistent repeated observations for an endpoint pair cannot be credited", () => {
  const versions = (digest: string) => [
    group("one", ["a", "b"], "a", [edge("p", "q", "digest")]),
    group("two", ["c", "d"], "b", [edge("q", "p", digest)]),
  ];
  assert.equal(groupEvidence(groupChange(versions("conflict"), [])).edges, null);
  assert.deepEqual(groupEvidence(groupChange(versions("digest"), [])).edges, { unchanged: 0, added: 0, absent: 1, changed: 0 });
  const self = group("c", ["a", "b"], "self", [edge("u", "u", "conflict")]);
  assert.equal(groupEvidence(groupChange([], [self])).edges, null);
});

test("edge keys with punctuation remain distinct and raw endpoints never enter the evidence summary", () => {
  const rows = [edge("private|a", "b", "1"), edge("private", "a|b", "2"),
    edge("private\"one", "two", "3"), edge("private", '"one,two', "4")];
  const previous = group("group-id", ["m", "n"], "digest", rows);
  const summary = groupEvidence(groupChange([previous], []));
  assert.equal(summary.edges?.absent, 4);
  assert.doesNotMatch(JSON.stringify(summary), /private|one,two/u);
});

test("detached delta edge projections are normalized without altering authored snapshots", () => {
  const input = group("g", ["x", "y", "z"], "full-digest", [edge("z", "x", "b"), edge("y", "x", "a")]);
  const original = JSON.stringify(input);
  const [change] = diffLinks(release([input]), release([])).groups;
  const edges = change!.before[0]!.publicationEdges!;
  assert.deepEqual(edges, [edge("x", "y", "a"), edge("x", "z", "b")]);
  edges[0]!.digest = "reviewer-edit";
  assert.equal(JSON.stringify(input), original);
});

test("pair promotion and demotion retain the evidence from their respective sides", () => {
  const observed = possible("pair-digest", null);
  const grouped = possible(null, "group-id");
  const promotion = pairEvidence(pairChange(observed, grouped), null, "group-digest");
  assert.deepEqual(promotion, {
    previous: { groups: [], possibleDigest: "pair-digest" },
    candidate: { groups: [{ id: "group-id", digest: "group-digest" }], possibleDigest: null },
    edges: null,
  });
  const demotion = pairEvidence(pairChange(grouped, observed), "group-digest", null);
  assert.deepEqual(demotion.previous, promotion.candidate);
  assert.deepEqual(demotion.candidate, promotion.previous);
  assert.doesNotMatch(JSON.stringify(demotion), /private-record/u);
});

test("a missing owning-group digest remains unknown, and irrelevant supplied digests are ignored", () => {
  const grouped = possible("coexisting-pair", "group");
  const first = pairEvidence(pairChange(null, grouped), "no-side", null);
  assert.deepEqual(first.previous, { groups: [], possibleDigest: null });
  assert.deepEqual(first.candidate, { groups: [{ id: "group", digest: null }], possibleDigest: "coexisting-pair" });
  const absent = pairEvidence(pairChange(possible("old", null), null), "no-group", "no-side");
  assert.deepEqual(absent.previous, { groups: [], possibleDigest: "old" });
  assert.deepEqual(absent.candidate, { groups: [], possibleDigest: null });
});

test("independent pair and owning group digests are available when both are declared on both sides", () => {
  const summary = pairEvidence(pairChange(possible("p1", "old-g"), possible("p2", "new-g")), "g1", "g2");
  assert.deepEqual(summary.previous, { groups: [{ id: "old-g", digest: "g1" }], possibleDigest: "p1" });
  assert.deepEqual(summary.candidate, { groups: [{ id: "new-g", digest: "g2" }], possibleDigest: "p2" });
  assert.equal(summary.edges, null);
});
