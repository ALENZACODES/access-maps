import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, after, test } from "node:test";
import { DECISION_SCHEMA, readDecisions } from "./decisions.ts";
import { writeReviewFixture, type FixturePaths } from "./fixture.ts";
import { checkInputs } from "./inputs.ts";
import { readProvenance } from "./provenance.ts";
import { buildBook, type Release, type ReviewBook } from "./review.ts";
import { renderHtml, renderText } from "./report.ts";
import { readSnapshot } from "./snapshot.ts";
import { selectPage, SelectionError } from "./view.ts";

let root: string;
let locations: FixturePaths;
let previous: Release;
let candidate: Release;
let scoped: ReviewBook;
let registryRows: Array<Record<string, unknown>>;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "fixture-place-review-"));
  locations = await writeReviewFixture(root);
  const old = JSON.parse(await readFile(locations.beforeRegistry, "utf8"));
  registryRows = JSON.parse(await readFile(locations.afterRegistry, "utf8")).sources;
  previous = { links: await readSnapshot(locations.beforeData), registry: readProvenance(old) };
  candidate = { links: await readSnapshot(locations.afterData), registry: readProvenance({ sources: registryRows }) };
  scoped = buildBook(previous, candidate);
});

after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function sourceChange(id: string, update: Record<string, unknown>): Release {
  const sources = registryRows.map(row => row.id === id ? { ...row, ...update } : row);
  return { links: candidate.links, registry: readProvenance({ sources }) };
}

function change(book: ReviewBook, kind: string) {
  const row = book.cases.find(item => item.kind === kind);
  assert.ok(row, kind);
  return row;
}

test("inventory counts declarations and carries source evidence without inferring a baseline", () => {
  const inventory = selectPage(buildBook(null, candidate));
  assert.equal(inventory.mode, "inventory");
  assert.equal(inventory.candidate.groups, candidate.links.groups.length);
  const grouped = candidate.links.groups.reduce((sum, group) => sum + group.members.length, 0);
  assert.equal(inventory.candidate.groupedMembers, grouped);
  assert.equal(inventory.candidate.possiblePairs, candidate.links.pairs.length);
  assert.equal(inventory.candidate.cells, 2);
  assert.equal(inventory.previous, null);
  assert.equal(inventory.groupCounts, null);
  assert.equal(inventory.pairCounts, null);
  assert.equal(inventory.totalCases, 0);
  assert.deepEqual(inventory.citations.map(row => row.sourceId), inventory.candidate.sourceIds);
  for (const cited of inventory.citations) {
    assert.equal(cited.previous, null);
    assert.equal(cited.candidate?.status, "included");
    assert.equal(cited.candidate?.verificationTier, 0);
    assert.equal(cited.candidate?.retrievedOn, "2026-01-10");
  }
});

test("identity, membership and possible-link transitions stay separately attributable", () => {
  const { groupCounts, pairCounts } = scoped;
  assert.equal(groupCounts?.split, 1);
  assert.equal(groupCounts?.merged, 1);
  assert.equal(groupCounts?.retained, 1);
  assert.equal(pairCounts?.promoted, 1);
  assert.equal(pairCounts?.demoted, 1);
  assert.equal(pairCounts?.retained, 1);
  const promoted = change(scoped, "promoted");
  assert.equal(promoted.family, "pair");
  assert.equal(promoted.previousGroups, 0);
  assert.equal(promoted.candidateGroups, 1);
  assert.equal(promoted.members.length, 2);
  assert.ok(promoted.members.every(member => member.previous?.groupId === null && member.candidate?.groupId));
  const split = change(scoped, "split");
  assert.equal(split.previousGroups, 1);
  assert.equal(split.candidateGroups, 2);
  assert.equal(split.members.length, 4);
  assert.equal(split.accessibility, "UNKNOWN");
  assert.ok(split.citations.every(cite => cite.previous?.licence && cite.candidate?.licence));
  for (const item of scoped.cases) {
    assert.match(item.id, /^[a-f\d]{64}$/u);
    assert.match(item.fingerprint, /^[a-f\d]{64}$/u);
    assert.ok(item.citations.length > 0);
  }
});

test("an unchanged release has no review cases and both inventories retain the declaration counts", () => {
  const review = buildBook(previous, previous);
  assert.equal(review.mode, "comparison");
  assert.deepEqual(review.previous, review.candidate);
  assert.equal(review.groupCounts?.retained, previous.links.groups.length);
  assert.equal(review.pairCounts?.retained, previous.links.pairs.length);
  assert.deepEqual(review.cases, []);
});

test("an active hold suppresses historical and candidate record IDs and cells in every affected case", () => {
  const restricted = buildBook(previous, sourceChange("fixture-alpha", { notes: "held for legal review" }));
  const split = change(restricted, "split");
  const archivedId = change(scoped, "split").members[0]!.id;
  assert.ok(archivedId.includes("split"));
  assert.equal(split.restricted, true);
  assert.deepEqual(split.members, []);
  assert.deepEqual(split.cells, []);
  assert.equal(split.priority, "rights");
  assert.ok(!JSON.stringify(split).includes(archivedId));
  assert.equal(split.id, change(scoped, "split").id);
  assert.notEqual(split.fingerprint, change(scoped, "split").fingerprint);
  assert.equal(split.citations.find(row => row.sourceId === "fixture-alpha")?.candidate?.status, "held");
  const selection = selectPage(restricted, { source: "fixture-alpha", state: "restricted" });
  assert.ok(selection.matchedCases > 0);
  assert.ok(selection.cases.every(row => row.memberCount === 0 && row.members.length === 0));
  assert.equal(selectPage(restricted, { source: "fixture-alpha", cell: "n45.0_w080.0" }).matchedCases, 0);
  assert.equal(change(restricted, "held").family, "source");
});

test("an archival hold also suppresses mixed-source member details after the declaration is restored", () => {
  const restrictedArchive = sourceChange("fixture-bravo", { tier_note: "revocable" }).registry;
  const result = buildBook({ ...previous, registry: restrictedArchive }, candidate);
  assert.equal(change(result, "promoted").restricted, true);
  assert.equal(change(result, "restored").restricted, true);
  const release = change(result, "restored").citations[0]!;
  assert.equal(release.previous?.status, "held");
  assert.equal(release.candidate?.status, "included");
  const unaffected = change(result, "demoted");
  assert.equal(unaffected.restricted, false);
  assert.ok(unaffected.members.length > 0);
});

test("a missing candidate declaration preserves the historical citation and has no record drill-down", () => {
  const registry = readProvenance({ sources: registryRows.filter(row => row.id !== "fixture-delta") });
  const result = buildBook(previous, { ...candidate, registry });
  const removed = change(result, "removed");
  assert.equal(removed.restricted, true);
  const citation = removed.citations[0]!;
  assert.equal(citation.previous?.sourceId, "fixture-delta");
  assert.equal(citation.candidate?.status, "unknown");
  assert.equal(citation.candidate?.licence, null);
  assert.deepEqual(citation.candidate?.issues, ["missing-declaration"]);
  assert.deepEqual(change(result, "split").members, []);
});

test("the same declarations in different enumeration orders have stable case IDs and evidence fingerprints", () => {
  const shuffled: Release = {
    links: {
      ...candidate.links, groups: [...candidate.links.groups].reverse().map(group => ({
        ...group, members: [...group.members].reverse(),
      })), pairs: [...candidate.links.pairs].reverse(),
    },
    registry: readProvenance({ sources: [...registryRows].reverse() }),
  };
  const again = buildBook(previous, shuffled);
  assert.deepEqual(again.cases, scoped.cases);
});

test("registry-only changes create source cases and invalidate previous decisions on affected links", () => {
  const updated = sourceChange("fixture-delta", { tier: 1, retrieved_at: "2026-01-11" });
  const oldSplit = change(scoped, "split");
  const revised = buildBook(previous, updated);
  const newSplit = change(revised, "split");
  assert.equal(oldSplit.id, newSplit.id);
  assert.notEqual(oldSplit.fingerprint, newSplit.fingerprint);
  const decision = readDecisions({ schema: DECISION_SCHEMA, entries: [
    { id: oldSplit.id, fingerprint: oldSplit.fingerprint, decision: "reviewed" },
  ] });
  const page = selectPage(revised, { id: oldSplit.id }, [decision]);
  assert.equal(page.cases[0]?.state, "stale");
  assert.equal(page.orphanDecisions, 0);
  const source = revised.cases.find(row => row.family === "source" && row.citations[0]?.sourceId === "fixture-delta");
  assert.deepEqual(source?.fields, ["retrievedOn", "verificationTier"]);
  assert.equal(change(scoped, "promoted").fingerprint, change(revised, "promoted").fingerprint);
});

test("checking the underlying record set is explicit and binds the case to that changed evidence state", async () => {
  const inputs = await checkInputs(locations.afterData, candidate.links.inputDigest);
  assert.equal(inputs.status, "matches");
  const confirmed = buildBook(previous, { ...candidate, inputs });
  assert.deepEqual(confirmed.candidate.inputs, inputs);
  assert.equal(scoped.candidate.inputs, null);
  assert.equal(change(scoped, "split").id, change(confirmed, "split").id);
  assert.notEqual(change(scoped, "split").fingerprint, change(confirmed, "split").fingerprint);
});

test("case filters intersect and status totals continue to describe the complete release review", () => {
  const promoted = change(scoped, "promoted");
  const decision = { id: promoted.id, fingerprint: promoted.fingerprint, decision: "follow-up" };
  const assigned = readDecisions({ schema: DECISION_SCHEMA, entries: [decision] });
  const filter = { family: "pair", priority: "identity", cell: "n45.0_w080.0", source: "fixture-bravo" } as const;
  const result = selectPage(scoped, { ...filter, state: "follow-up" }, [assigned]);
  assert.equal(result.totalCases, scoped.cases.length);
  assert.equal(result.matchedCases, 1);
  assert.equal(result.counts["follow-up"], 1);
  assert.equal(result.counts.open, result.totalCases - 1);
  assert.equal(result.cases[0]?.id, promoted.id);
  const opposite = readDecisions({ schema: DECISION_SCHEMA, entries: [{ ...decision, decision: "reviewed" }] });
  assert.equal(selectPage(scoped, { ...filter, state: "conflict" }, [assigned, opposite]).matchedCases, 1);
  assert.equal(selectPage(scoped, { ...filter, state: "follow-up" }, [assigned, opposite]).matchedCases, 0);
  assert.equal(selectPage(scoped, { ...filter, cell: "n45.5_w080.0" }, [assigned]).matchedCases, 0);
});

test("paging exposes every case exactly once in review order and gives empty selections a valid first page", () => {
  const first = selectPage(scoped, { perPage: 2 });
  assert.equal(first.pages, Math.ceil(scoped.cases.length / 2));
  const ids = [...first.cases.map(row => row.id)];
  for (let page = 2; page <= first.pages; page++) {
    const batch = selectPage(scoped, { perPage: 2, page });
    ids.push(...batch.cases.map(row => row.id));
    assert.ok(batch.cases.length <= 2);
  }
  assert.deepEqual(ids, scoped.cases.map(row => row.id));
  const empty = selectPage(scoped, { source: "unrepresented" });
  assert.equal(empty.pages, 1);
  assert.equal(empty.matchedCases, 0);
  assert.deepEqual(empty.cases, []);
  assert.throws(() => selectPage(scoped, { source: "unrepresented", page: 2 }), SelectionError);
});

test("member drill-down pages the chosen case, retains its evidence identity and never overruns the end", () => {
  const row = change(scoped, "split");
  const first = selectPage(scoped, { id: row.id, memberLimit: 1 }).cases[0]!;
  const next = selectPage(scoped, { id: row.id, memberLimit: 3, memberOffset: 1 }).cases[0]!;
  assert.equal(first.memberCount, 4);
  assert.equal(first.memberOffset, 0);
  assert.equal(next.memberOffset, 1);
  assert.equal(first.fingerprint, next.fingerprint);
  assert.deepEqual([...first.members, ...next.members], row.members);
  assert.throws(() => selectPage(scoped, { id: row.id, memberOffset: row.members.length }), SelectionError);
  assert.throws(() => selectPage(scoped, { memberOffset: 1 }), SelectionError);
});

test("selection rejects invalid case IDs, unsafe indices and limits beyond the supported bounds", () => {
  for (const perPage of [0, 201, 0.1, Infinity]) assert.throws(() => selectPage(scoped, { perPage }), SelectionError);
  for (const memberLimit of [0, 251, NaN]) assert.throws(() => selectPage(scoped, { memberLimit }), SelectionError);
  for (const page of [-1, 0, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => selectPage(scoped, { page }), SelectionError);
  assert.throws(() => selectPage(scoped, { id: "0".repeat(64) }), SelectionError);
});

function threeSourceRelation() {
  // The possible pair's two endpoints come from admissible sources. The actual
  // cluster identifier names a third source's record, just as the matcher emits.
  const pair = candidate.links.pairs.find(row => row.a.id.endsWith(":possible"));
  const anchor = previous.links.groups.flatMap(row => row.members)
    .find(row => row.sourceId === "fixture-alpha" && row.id.endsWith(":split"));
  assert.ok(pair && anchor);
  assert.notEqual(pair.a.sourceId, anchor.sourceId);
  assert.notEqual(pair.b.sourceId, anchor.sourceId);
  const cluster = { id: anchor.tranche + "|" + anchor.id, members: [anchor, pair.a, pair.b],
    evidenceDigest: candidate.links.inputDigest };
  const proposed: Release = { registry: previous.registry, links: { ...previous.links, groups: [], pairs: [pair] } };
  const linked: Release = { registry: candidate.registry, links: { ...candidate.links, groups: [cluster], pairs: [] } };
  return { anchor, pair, cluster, proposed, linked };
}

test("a held third-source anchor cannot expose the record keys of a candidate pair promotion", () => {
  const { anchor, pair, proposed, linked } = threeSourceRelation();
  const held = sourceChange(anchor.sourceId, { notes: "revocable" }).registry;
  const book = buildBook(proposed, { ...linked, registry: held });
  const result = change(book, "promoted");
  assert.deepEqual(result.citations.map(row => row.sourceId).sort(), [anchor.sourceId, pair.a.sourceId, pair.b.sourceId].sort());
  assert.equal(result.citations.find(row => row.sourceId === anchor.sourceId)?.candidate?.status, "held");
  assert.equal(result.restricted, true);
  assert.deepEqual(result.members, []);
  assert.deepEqual(result.cells, []);
  const page = selectPage(book, { id: result.id });
  assert.equal(page.cases[0]?.state, "restricted");
  for (const text of [JSON.stringify(page), renderText(page, "en"), renderHtml(page, "fr")]) {
    for (const member of [anchor, pair.a, pair.b]) assert.ok(!text.includes(member.id));
  }
});

test("a restored third-source anchor keeps an older pair demotion restricted", () => {
  const { anchor, pair, linked, proposed } = threeSourceRelation();
  const archivedHold = sourceChange(anchor.sourceId, { tier_note: "held for legal review" }).registry;
  const book = buildBook({ ...linked, registry: archivedHold }, proposed);
  const result = change(book, "demoted");
  const citation = result.citations.find(row => row.sourceId === anchor.sourceId);
  assert.equal(citation?.previous?.status, "held");
  assert.equal(citation?.candidate?.status, "included");
  assert.equal(result.restricted, true);
  const page = selectPage(book, { id: result.id });
  assert.equal(page.cases[0]?.memberCount, 0);
  for (const text of [JSON.stringify(page), renderText(page, "fr"), renderHtml(page, "en")]) {
    for (const member of [anchor, pair.a, pair.b]) assert.ok(!text.includes(member.id));
  }
});

test("the public pair fingerprint tracks its group citations independently of input ordering and unrelated sources", () => {
  const { anchor, pair, cluster, proposed, linked } = threeSourceRelation();
  const reviewed = change(buildBook(proposed, linked), "promoted");
  assert.equal(reviewed.restricted, false);
  assert.equal(reviewed.members.length, 2);
  assert.ok(reviewed.members.every(row => row.candidate?.groupId === cluster.id));
  const reversedPair: Release = { ...proposed, links: { ...proposed.links, pairs: [{ ...pair, a: pair.b, b: pair.a }] } };
  const permuted: Release = { registry: sourceChange("fixture-charlie", { tier: 2 }).registry,
    links: { ...linked.links, groups: [{ ...cluster, members: [...cluster.members].reverse() }] } };
  const equivalent = change(buildBook(reversedPair, permuted), "promoted");
  assert.equal(equivalent.id, reviewed.id);
  assert.equal(equivalent.fingerprint, reviewed.fingerprint);
  const updated = change(buildBook(proposed, { ...linked, registry: sourceChange(anchor.sourceId, { tier: 2 }).registry }), "promoted");
  assert.equal(updated.id, reviewed.id);
  assert.equal(updated.restricted, false);
  assert.notEqual(updated.fingerprint, reviewed.fingerprint);
});

test("a changed cluster evidence digest invalidates a promotion decision with identical public endpoints", () => {
  const { proposed, linked, cluster } = threeSourceRelation();
  const initial = change(buildBook(proposed, linked), "promoted");
  const evidenceDigest = "d".repeat(64);
  assert.notEqual(evidenceDigest, cluster.evidenceDigest);
  const revised = buildBook(proposed, { ...linked, links: { ...linked.links, groups: [{ ...cluster, evidenceDigest }] } });
  const promotion = change(revised, "promoted");
  const handoff = readDecisions({ schema: DECISION_SCHEMA, entries: [
    { id: initial.id, fingerprint: initial.fingerprint, decision: "reviewed" },
  ] });
  assert.equal(promotion.id, initial.id);
  assert.deepEqual(promotion.members, initial.members);
  assert.deepEqual(promotion.citations, initial.citations);
  assert.notEqual(promotion.fingerprint, initial.fingerprint);
  assert.equal(selectPage(revised, { id: initial.id }, [handoff]).cases[0]?.state, "stale");
});

test("changing a non-anchor, non-endpoint member changes the promotion fingerprint even within the same source", () => {
  const { proposed, linked, cluster } = threeSourceRelation();
  const members = candidate.links.groups.flatMap(row => row.members);
  const original = members.find(row => row.id === "fixture-charlie:split");
  const replacement = members.find(row => row.id === "fixture-charlie:merge");
  assert.ok(original && replacement);
  assert.equal(original.sourceId, replacement.sourceId);
  const inCluster = (extra: typeof original) => buildBook(proposed, { ...linked,
    links: { ...linked.links, groups: [{ ...cluster, members: [...cluster.members, extra] }] } });
  const initial = change(inCluster(original), "promoted");
  const revised = inCluster(replacement);
  const promotion = change(revised, "promoted");
  const handoff = readDecisions({ schema: DECISION_SCHEMA, entries: [
    { id: initial.id, fingerprint: initial.fingerprint, decision: "follow-up" },
  ] });
  assert.equal(promotion.id, initial.id);
  assert.deepEqual(promotion.members, initial.members);
  assert.deepEqual(promotion.citations, initial.citations);
  assert.equal(promotion.members[0]?.candidate?.groupId, cluster.id);
  assert.equal(selectPage(revised, { id: initial.id }, [handoff]).cases[0]?.state, "stale");
});
