import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeReviewFixture } from "./fixture.ts";
import { readProvenance } from "./provenance.ts";
import { auditPublication, type PublicationIssue } from "./publication.ts";
import { readSnapshot, type LinkMember } from "./snapshot.ts";

const anchor = "n45.0_w080.0";
const neighbour = "n45.5_w080.0";
interface WireMember { tranche: LinkMember["tranche"]; id: string; source_id: string; cell: string }
interface RawEdge {
  a: string; b: string; score: number; distance_m: number; class_compat: number;
  code: string; address: string; reason: string; name: number | null;
}
interface Group { id: string; members: LinkMember[]; evidence: RawEdge[] }
interface Pair { a: LinkMember; b: LinkMember; score: number; distance_m: number; why: string }
interface Body { cell: string; method: string; clusters: Group[]; possible: Pair[] }
interface Entry { path: string; clusters: number; possible: number; sha256: string; bytes: number }
interface TestManifest {
  version: number;
  sources: Array<Record<string, unknown> & { sourceId: string; inWebPack: boolean }>;
  withheld: Array<{path: string; reason: string; cell: string | null}>;
  links?: { method: string; inputDigest: string; dataDigest: string; current: boolean; cells: Record<string, Entry> };
}

function present(wire: WireMember): LinkMember {
  return { tranche: wire.tranche, id: wire.id, sourceId: wire.source_id, cell: wire.cell };
}

async function staged(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "place-link-pack-"));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  const fixture = await writeReviewFixture(dir);
  const root = join(dir, "pack/v1");
  await mkdir(join(root, "links"), { recursive: true });
  const s = await readSnapshot(fixture.afterData);
  const rawRegistry = JSON.parse(await readFile(fixture.afterRegistry, "utf8")) as {
    sources: Array<Record<string, unknown> & {id: string}>;
  };
  const source = readProvenance(rawRegistry);
  const manifest: TestManifest = {
    version: 1, sources: rawRegistry.sources.map(row => ({
      sourceId: row.id, name: row.name, licence: row.licence_id, licenceUrl: row.licence_url,
      attribution: row.attribution, retrieved: row.retrieved_at, shareAlike: false,
      inWebPack: true, heldReason: null,
    })), withheld: [],
    links: { method: s.method, current: true, inputDigest: s.inputDigest, dataDigest: s.inputDigest, cells: {} },
  };
  const bodies: Record<string, Body> = {};
  function body(cell: string): Body {
    return bodies[cell] ??= { cell, method: s.method, clusters: [], possible: [] };
  }
  // Stage two representative group shapes, including a two-cell mirror and a
  // three-record remainder. Unselected source declarations are intentionally absent.
  for (const cell of [anchor, neighbour]) {
    const bytes = await readFile(join(fixture.afterData, "links/same-place", cell + ".jsonl.gz"));
    for (const line of gunzipSync(bytes).toString().trimEnd().split("\n")) {
      const raw = JSON.parse(line) as {cluster: string; members: WireMember[]; evidence: RawEdge[]};
      if (!raw.cluster.endsWith(":merge") && !raw.cluster.endsWith(":move")) continue;
      const members = raw.members.map(present).filter(m => m.sourceId !== "fixture-delta");
      const keep = members.map(m => m.tranche + "|" + m.id);
      const group: Group = {
        id: raw.cluster, members, evidence: raw.evidence.filter(e => keep.includes(e.a) && keep.includes(e.b))
          .map(({ a, b, score, distance_m, name, class_compat, address, code, reason }) =>
            ({ a, b, score, distance_m, name, class_compat, address, code, reason })),
      };
      for (const name of new Set(members.map(m => m.cell))) body(name).clusters.push(structuredClone(group));
    }
  }
  const pairs = await readFile(join(fixture.afterData, "links/possible-duplicates", anchor + ".jsonl.gz"));
  for (const line of gunzipSync(pairs).toString().trimEnd().split("\n")) {
    const raw = JSON.parse(line) as { a: WireMember; b: WireMember; why: string; evidence: RawEdge };
    body(anchor).possible.push({ a: present(raw.a), b: present(raw.b), score: raw.evidence.score,
      distance_m: raw.evidence.distance_m, why: raw.why });
  }
  async function writeManifest() {
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  }
  async function writeBytes(cell: string, bytes: Buffer) {
    const part = manifest.links!.cells[cell]!;
    part.bytes = bytes.length;
    part.sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(root, "links", cell + ".json.gz"), bytes);
    await writeManifest();
  }
  async function writeBody(cell: string) {
    const current = body(cell);
    manifest.links!.cells[cell] = {
      path: "pack/v1/links/" + cell + ".json.gz", clusters: current.clusters.length,
      possible: current.possible.length, bytes: 0, sha256: "",
    };
    await writeBytes(cell, gzipSync(JSON.stringify(current)));
  }
  for (const cell of Object.keys(bodies)) await writeBody(cell);
  return {
    manifest, root, s, source, rawRegistry, bodies, writeBody, writeBytes, writeManifest,
    audit: () => auditPublication(root, s, source),
  };
}

test("accepts filtered group membership, a cross-cell mirror, and the original possible rationale", async t => {
  const pack = await staged(t);
  const audit = await pack.audit();
  assert.equal(audit.status, "checked");
  assert.deepEqual(audit.issues, []);
  assert.deepEqual(audit.cells.map(c => [c.cell, c.groups, c.pairs, c.status]),
    [[anchor, 2, 2, "checked"], [neighbour, 1, 0, "checked"]]);
  assert.deepEqual(audit.cells[1]!.sourceIds, ["fixture-alpha", "fixture-bravo"]);
});

test("digest, byte length, malformed gzip and decoded JSON are separately attributed to a cell", async t => {
  const pack = await staged(t);
  const listing = pack.manifest.links!.cells[anchor]!;
  listing.bytes++;
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).cells[0]!.issues, ["size"]);
  listing.bytes--;
  listing.sha256 = "0".repeat(64);
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).cells[0]!.issues, ["digest"]);
  await pack.writeBytes(anchor, Buffer.from("fixture"));
  assert.deepEqual((await pack.audit()).cells[0]!.issues, ["compression"]);
  await pack.writeBytes(anchor, gzipSync("{"));
  assert.deepEqual((await pack.audit()).cells[0]!.issues, ["cell-format"]);
});

test("distinguishes explicit whole-index withholding from an undeclared or stray link directory", async t => {
  const pack = await staged(t);
  delete pack.manifest.links;
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).issues, ["inventory"]);
  await rm(join(pack.root, "links"), { recursive: true });
  assert.equal((await pack.audit()).status, "undeclared");
  pack.manifest.withheld.push({ path: "links/same-place", cell: null, reason: "synthetic hold" });
  await pack.writeManifest();
  assert.equal((await pack.audit()).status, "withheld");
});

test("checks builder identity and current flag independently from matching cell declarations", async t => {
  const pack = await staged(t);
  const links = pack.manifest.links!;
  links.method = "other-run";
  links.inputDigest = "a".repeat(64);
  links.current = false;
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).issues, ["index-identity", "input-stale"]);
  links.method = pack.s.method;
  links.inputDigest = pack.s.inputDigest;
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).issues, ["input-stale"]);
});

test("flags both index/file count disagreement and duplicate group declarations", async t => {
  const pack = await staged(t);
  const body = pack.bodies[anchor]!;
  body.clusters.push(structuredClone(body.clusters[0]!));
  await pack.writeBody(anchor);
  pack.manifest.links!.cells[anchor]!.clusters++;
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).cells[0]!.issues, ["cell-count", "duplicate"]);
});

for (const [label, issue, change] of [
  ["foreign cluster ID", "foreign-group", (b: Body) => { b.clusters[0]!.id = "unpublished-fixture"; }],
  ["foreign pair", "foreign-pair", (b: Body) => { b.possible[0]!.b.id = "unpublished-fixture"; }],
  ["false member cell", "foreign-member", (b: Body) => { b.clusters[0]!.members[0]!.cell = "n46.0_w080.0"; }],
  ["undeclared source", "foreign-member", (b: Body) => { b.possible[0]!.b.sourceId = "unpublished-fixture"; }],
  ["new accessibility claim", "cell-format", (b: Body) => { Object.assign(b.clusters[0]!.members[0]!, { stepFree: true }); }],
  ["edited score", "evidence", (b: Body) => { b.clusters[0]!.evidence[0]!.score = 0.01; }],
  ["edited unknown-name score", "evidence", (b: Body) => { b.clusters[0]!.evidence[0]!.name = null; }],
  ["edited duplicate rationale", "evidence", (b: Body) => { b.possible[0]!.why = "private reviewer comment"; }],
  ["missing declared evidence edge", "evidence", (b: Body) => { b.clusters[0]!.evidence.shift(); }],
  ["repeat pair in reverse order", "duplicate", (b: Body) => {
    const original = b.possible[0]!;
    b.possible.push({ ...original, a: original.b, b: original.a });
  }],
] as const) {
  test("flags " + label + " without echoing the offending record", async t => {
    const pack = await staged(t);
    change(pack.bodies[anchor]!);
    await pack.writeBody(anchor);
    const audit = await pack.audit();
    assert.equal(audit.status, "issues");
    assert.ok(audit.cells[0]!.issues.includes(issue satisfies PublicationIssue));
    assert.doesNotMatch(JSON.stringify(audit), /venue\||unpublished-fixture|private reviewer comment|:merge/u);
  });
}

test("denies a source held by either the pack manifest or the review registry", async t => {
  const pack = await staged(t);
  pack.manifest.sources[0]!.inWebPack = false;
  await pack.writeManifest();
  const left = await pack.audit();
  assert.ok(left.cells.some(c => c.issues.includes("source-held")));
  assert.ok(left.cells.every(c => !c.sourceIds.includes("fixture-alpha")));
  pack.manifest.sources[0]!.inWebPack = true;
  await pack.writeManifest();
  pack.rawRegistry.sources[0]!.notes = "held for legal review";
  const right = await auditPublication(pack.root, pack.s, readProvenance(pack.rawRegistry));
  assert.ok(right.cells.some(c => c.issues.includes("source-held")));
});

test("missing, explicitly withheld and inconsistently published mirrors have distinct dispositions", async t => {
  const pack = await staged(t);
  delete pack.manifest.links!.cells[neighbour];
  await unlink(join(pack.root, "links", neighbour + ".json.gz"));
  await pack.writeManifest();
  const missing = await pack.audit();
  assert.equal(missing.status, "issues");
  assert.deepEqual(missing.cells.find(c => c.cell === neighbour)?.issues, ["mirror-missing"]);
  pack.manifest.withheld.push({ path: "links/" + neighbour + ".json.gz", cell: neighbour, reason: "synthetic size hold" });
  await pack.writeManifest();
  const held = await pack.audit();
  assert.equal(held.status, "checked");
  assert.equal(held.cells.find(c => c.cell === neighbour)?.status, "withheld");
  await pack.writeBody(neighbour);
  assert.ok((await pack.audit()).cells.find(c => c.cell === neighbour)?.issues.includes("inventory"));
});

test("a declared path cannot escape the selected pack, reference a symlink, or expose input paths", async t => {
  const pack = await staged(t);
  const entry = pack.manifest.links!.cells[anchor]!;
  const canonical = entry.path;
  entry.path = "../../sensitive-fixture";
  await pack.writeManifest();
  assert.deepEqual((await pack.audit()).cells[0]!.issues, ["unsafe-path"]);
  entry.path = canonical;
  await pack.writeManifest();
  const file = join(pack.root, "links", anchor + ".json.gz");
  await unlink(file);
  await symlink(join(pack.root, "manifest.json"), file);
  const rejected = await pack.audit();
  assert.deepEqual(rejected.cells[0]!.issues, ["unsafe-path"]);
  assert.ok(!JSON.stringify(rejected).includes(pack.root));
});

test("absence or corruption of the pack manifest yields a bounded audit result", async t => {
  const pack = await staged(t);
  const path = join(pack.root, "manifest.json");
  await writeFile(path, "null");
  assert.deepEqual(await pack.audit(), { status: "issues", issues: ["manifest-format"], cells: [] });
  await unlink(path);
  assert.deepEqual(await pack.audit(), { status: "issues", issues: ["manifest-unavailable"], cells: [] });
});

test("source terms must match the declaration actually distributed with linked records", async t => {
  const pack = await staged(t);
  const first = pack.manifest.sources[0]!;
  for (const [field, changed] of [
    ["name", "Other synthetic publisher"], ["licence", "OTHER"], ["licenceUrl", "https://example.invalid/wrong"],
    ["retrieved", "2099-01-01"], ["attribution", ""], ["shareAlike", true], ["heldReason", "synthetic hold"],
  ] as const) {
    const original = first[field];
    first[field] = changed;
    await pack.writeManifest();
    const report = await pack.audit();
    assert.equal(report.status, "issues", field);
    assert.ok(report.cells.some(cell => cell.issues.includes("source-terms")), field);
    assert.ok(report.cells.every(cell => !cell.sourceIds.includes(first.sourceId)), field);
    assert.ok(!JSON.stringify(report).includes(String(changed)) || typeof changed !== "string" || !changed);
    first[field] = original;
  }
});

test("a filtered group ID must not expose the literal record key of a held anchor", async t => {
  const pack = await staged(t);
  const group = pack.bodies[anchor]!.clusters.find(g => g.id.endsWith(":merge"))!;
  assert.ok(group);
  group.members = group.members.filter(m => m.sourceId !== "fixture-alpha");
  assert.equal(group.members.length, 2);
  group.evidence = [];
  pack.bodies[anchor]!.clusters = [group];
  pack.bodies[anchor]!.possible = [];
  delete pack.manifest.links!.cells[neighbour];
  await unlink(join(pack.root, "links", neighbour + ".json.gz"));
  await pack.writeBody(anchor);
  assert.equal((await pack.audit()).status, "checked");
  pack.manifest.sources[0]!.inWebPack = false;
  await pack.writeManifest();
  const report = await pack.audit();
  assert.deepEqual(report.cells[0]!.issues, ["source-held"]);
  assert.ok(!JSON.stringify(report).includes(group.id));
});
