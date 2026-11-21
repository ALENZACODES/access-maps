import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeReviewFixture } from "./fixture.ts";
import { readSnapshot, SnapshotError, type SnapshotIssue } from "./snapshot.ts";

interface FileEntry { path: string; bytes: number; sha256: string; lines: number }
interface TestIndex {
  method: string;
  input_digest: string;
  input_files: number;
  places_read: number;
  clusters: number;
  records_in_clusters: number;
  possible_duplicates: number;
  skipped: Array<{ path: string; reason: string }>;
  files: FileEntry[];
  params: Record<string, number>;
}

type WireMember = { tranche: string; id: string; source_id: string; cell: string };
type Edge = Record<string, string | number | null> & { a: string; b: string };
type WireGroup = { cluster: string; method: string; members: WireMember[]; evidence: Edge[] };
type WirePair = { method: string; a: WireMember; b: WireMember; why: string; evidence: Edge };

async function sandbox(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "place-link-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return writeReviewFixture(root);
}

async function manifest(data: string): Promise<TestIndex> {
  return JSON.parse(await readFile(join(data, "links/index.json"), "utf8")) as TestIndex;
}

async function replaceIndex(data: string, change: (index: TestIndex) => void): Promise<void> {
  const index = await manifest(data);
  change(index);
  await writeFile(join(data, "links/index.json"), JSON.stringify(index));
}

async function replaceShard(
  data: string, family: string, change: (bytes: Buffer) => Buffer, lines = 0, members = 0,
): Promise<FileEntry> {
  const index = await manifest(data);
  const entry = index.files.find(item => item.path.startsWith("links/" + family + "/"));
  assert.ok(entry);
  const file = join(data, entry.path);
  const bytes = change(await readFile(file));
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  entry.lines += lines;
  if (family === "same-place") {
    index.clusters += lines;
    index.records_in_clusters += members;
  } else index.possible_duplicates += lines;
  await writeFile(file, bytes);
  await writeFile(join(data, "links/index.json"), JSON.stringify(index));
  return entry;
}

function editRows<T>(rewrite: (rows: T[]) => void): (bytes: Buffer) => Buffer {
  return input => {
    const rows = gunzipSync(input).toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line) as T);
    rewrite(rows);
    return gzipSync(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  };
}

function failsWith(root: string, code: SnapshotIssue): Promise<void> {
  return assert.rejects(readSnapshot(root), (error: unknown) => {
    assert.ok(error instanceof SnapshotError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("complete release loads normalized groups, possible pairs and the original input commitment", async t => {
  const { beforeData, afterData } = await sandbox(t);
  const before = await readSnapshot(beforeData);
  const after = await readSnapshot(afterData);
  assert.equal(before.method, "same-place-v1");
  assert.equal(before.inputFiles, 4);
  assert.equal(after.inputFiles, 5);
  assert.notEqual(before.inputDigest, after.inputDigest);
  assert.equal(before.skippedCount, 0);
  assert.equal(before.groups.length, 6);
  assert.equal(before.pairs.length, 2);
  for (const group of before.groups) {
    assert.equal(group.id, group.members[0]!.tranche + "|" + group.members[0]!.id);
    assert.match(group.evidenceDigest, /^[0-9a-f]{64}$/u);
    assert.equal(new Set(group.members.map(m => m.sourceId)).size, group.members.length);
  }
  assert.ok(after.groups.some(g => g.members.some(m => m.cell !== g.members[0]!.cell)));
  assert.ok(before.pairs.some(p => p.a.id.includes("promote")));
  assert.ok(after.pairs.some(p => p.a.id.includes("demote")));
});

test("a publication can acknowledge skipped inputs without leaking the publisher's diagnostic", async t => {
  const { beforeData } = await sandbox(t);
  await replaceIndex(beforeData, index => {
    index.skipped.push({ path: "venues/fixture-alpha/cell.ndjson.gz", reason: "synthetic diagnostic text" });
  });
  const result = await readSnapshot(beforeData);
  assert.equal(result.skippedCount, 1);
  assert.ok(!JSON.stringify(result).includes("synthetic diagnostic text"));
});

test("empty family directories can be omitted when the manifest declares no link files", async t => {
  const { beforeData } = await sandbox(t);
  await Promise.all(["same-place", "possible-duplicates"].map(family =>
    rm(join(beforeData, "links", family), { recursive: true })));
  await replaceIndex(beforeData, i => {
    i.clusters = i.records_in_clusters = i.possible_duplicates = 0;
    i.files = [];
  });
  const empty = await readSnapshot(beforeData);
  assert.deepEqual(empty.groups, []);
  assert.deepEqual(empty.pairs, []);
});

for (const [description, change] of [
  ["negative source count", (i: TestIndex) => { i.input_files = -1; }],
  ["inexact place count", (i: TestIndex) => { i.places_read = Number.MAX_SAFE_INTEGER + 1; }],
  ["bad source digest", (i: TestIndex) => { i.input_digest = "f".repeat(63); }],
  ["non-numeric matcher setting", (i: TestIndex) => { Object.assign(i.params, { matchScore: "0.7" }); }],
  ["malformed skipped entry", (i: TestIndex) => { i.skipped.push({ path: "", reason: "skip" }); }],
  ["unsafe shard byte count", (i: TestIndex) => { i.files[0]!.bytes = 24 * 1024 * 1024 + 1; }],
] as const) {
  test("rejects index with " + description, async t => {
    const { beforeData } = await sandbox(t);
    await replaceIndex(beforeData, change);
    await failsWith(beforeData, "index-format");
  });
}

test("the entire family must match the index, including files it did not name", async t => {
  const { beforeData, afterData } = await sandbox(t);
  const [entry] = (await manifest(beforeData)).files;
  assert.ok(entry);
  await unlink(join(beforeData, entry.path));
  await failsWith(beforeData, "inventory");
  await writeFile(join(afterData, "links/same-place/n44.0_w080.0.jsonl.gz"), gzipSync(""));
  await failsWith(afterData, "inventory");
});

test("duplicate, traversal and invalid geographic shard declarations fail before opening files", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceIndex(beforeData, i => i.files.push({ ...i.files[0]! }));
  await failsWith(beforeData, "inventory");
  const original = await manifest(afterData);
  for (const path of ["../elsewhere", "/tmp/absolute", "links/same-place/n99.0_w080.0.jsonl.gz",
    "links/same-place/n45.0_w181.0.jsonl.gz", "links/same-place/n45.1_w080.0.jsonl.gz"]) {
    const swapped = structuredClone(original);
    swapped.files[0]!.path = path;
    await writeFile(join(afterData, "links/index.json"), JSON.stringify(swapped));
    await failsWith(afterData, "unsafe-path");
  }
});

test("split shards must start with the base filename followed by consecutive part numbers", async t => {
  const { beforeData } = await sandbox(t);
  const index = await manifest(beforeData);
  const entry = index.files[0]!;
  const original = await readFile(join(beforeData, entry.path));
  const lines = gunzipSync(original).toString("utf8").trimEnd().split("\n");
  assert.ok(lines.length >= 2);
  const extra: FileEntry[] = [];
  for (const [p, rowSet] of [lines.slice(0, 1), lines.slice(1)].entries()) {
    const path = p === 0 ? entry.path : entry.path.replace(".jsonl.gz", ".p2.jsonl.gz");
    const bytes = gzipSync(rowSet.join("\n") + "\n");
    await writeFile(join(beforeData, path), bytes);
    extra.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), lines: rowSet.length });
  }
  index.files.splice(0, 1, ...extra);
  await writeFile(join(beforeData, "links/index.json"), JSON.stringify(index));
  const valid = await readSnapshot(beforeData);
  assert.equal(valid.pairs.length, 2);
  await replaceIndex(beforeData, i => { i.files[1]!.path = i.files[1]!.path.replace(".p2.", ".p3."); });
  await failsWith(beforeData, "inventory");
});

test("rejects a per-family directory symlink even when its contents match every digest", async t => {
  const { beforeData } = await sandbox(t);
  const dir = join(beforeData, "links", "same-place");
  const target = join(beforeData, "relocated");
  await rename(dir, target);
  await symlink(target, dir);
  await failsWith(beforeData, "unsafe-path");
});

test("refuses a symlink in place of the index or a listed gzip file", async t => {
  const { beforeData, afterData } = await sandbox(t);
  const file = (await manifest(beforeData)).files[0]!.path;
  const original = join(beforeData, file);
  await rename(original, original + ".real");
  await symlink(original + ".real", original);
  await failsWith(beforeData, "inventory");
  const index = join(afterData, "links/index.json");
  await rename(index, index + ".real");
  await symlink(index + ".real", index);
  await failsWith(afterData, "unsafe-path");
});

test("compares compressed file size and digest independently", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceIndex(beforeData, i => { i.files[0]!.bytes += 1; });
  await failsWith(beforeData, "file-size");
  const entry = (await manifest(afterData)).files[0]!;
  const path = join(afterData, entry.path);
  const bytes = await readFile(path);
  bytes[0] = bytes[0]! ^ 1;
  await writeFile(path, bytes);
  await failsWith(afterData, "file-digest");
});

test("a correct checksum for an invalid gzip is insufficient", async t => {
  const { beforeData } = await sandbox(t);
  await replaceShard(beforeData, "possible-duplicates", () => Buffer.from("not compressed"));
  await failsWith(beforeData, "compression");
});

test("neither broken UTF-8 nor malformed JSON becomes part of the report or an error message", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "possible-duplicates", () => gzipSync(Buffer.from([0x7b, 0xff, 0x7d])));
  await failsWith(beforeData, "row-format");
  await replaceShard(afterData, "possible-duplicates", () => gzipSync("{ private fixture contents"));
  await failsWith(afterData, "row-format");
});

test("blank records and per-shard line-count drift are rejected", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "possible-duplicates", bytes => gzipSync(Buffer.concat([Buffer.from("\n"), gunzipSync(bytes)])));
  await failsWith(beforeData, "row-format");
  await replaceShard(afterData, "possible-duplicates", bytes => gzipSync(gunzipSync(bytes).toString().split("\n")[0]!));
  await failsWith(afterData, "line-count");
});

test("requires the same method in index, group and pair declarations", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => { rows[0]!.method = "other-method"; }));
  await failsWith(beforeData, "row-format");
  await replaceShard(afterData, "possible-duplicates", editRows<WirePair>(rows => { rows[0]!.method = "other-method"; }));
  await failsWith(afterData, "row-format");
});

test("duplicate cluster membership and duplicate source membership cannot identify one place", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => {
    rows[1]!.members.push(rows[0]!.members[1]!);
  }));
  await failsWith(beforeData, "cluster-conflict");
  await replaceShard(afterData, "same-place", editRows<WireGroup>(rows => {
    const first = rows[0]!.members[0]!;
    rows[0]!.members.push({ ...first, id: first.id + "-another" });
  }));
  await failsWith(afterData, "cluster-conflict");
});

test("rejects a possible pair that puts an existing record in another source or cell", async t => {
  const { beforeData } = await sandbox(t);
  await replaceShard(beforeData, "possible-duplicates", editRows<WirePair>(rows => {
    const old = rows[0]!.a;
    rows[1]!.a = { ...old, source_id: "different-source" };
  }));
  await failsWith(beforeData, "member-conflict");
});

test("a match must be anchored to its canonical identifier and publisher cell", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => { rows[0]!.cluster = "other"; }));
  await failsWith(beforeData, "cluster-conflict");
  await replaceShard(afterData, "possible-duplicates", editRows<WirePair>(rows => { rows[0]!.a.cell = "n43.0_w079.0"; }));
  await failsWith(afterData, "pair-conflict");
});

test("requires positive match evidence spanning the whole group", async t => {
  const { beforeData } = await sandbox(t);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => {
    const group = rows[0]!;
    assert.equal(group.members.length, 4);
    const edge = group.evidence[0]!;
    const [a, b, c] = group.members.map(m => m.tranche + "|" + m.id);
    group.evidence = [{ ...edge, a: a!, b: b! }, { ...edge, a: b!, b: c! }, { ...edge, a: c!, b: a! }];
  }));
  await failsWith(beforeData, "evidence");
});

test("refuses duplicated or unknown evidence endpoints, including reversed duplicates", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => {
    const edge = rows[0]!.evidence[0]!;
    rows[0]!.evidence.push({ ...edge, a: edge.b, b: edge.a });
  }));
  await failsWith(beforeData, "evidence");
  await replaceShard(afterData, "same-place", editRows<WireGroup>(rows => { rows[0]!.evidence[0]!.b = "venue|absent"; }));
  await failsWith(afterData, "evidence");
});

test("rejects probabilities outside their domain, unrecognized evidence and unsupported decisions", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => { rows[0]!.evidence[0]!.score = 1.4; }));
  await failsWith(beforeData, "evidence");
  await replaceShard(afterData, "possible-duplicates", editRows<WirePair>(rows => { rows[0]!.evidence.decision = "none"; }));
  await failsWith(afterData, "evidence");
  await replaceShard(afterData, "possible-duplicates", editRows<WirePair>(rows => {
    rows[0]!.evidence.decision = "possible";
    rows[0]!.evidence["undocumented"] = "unused";
  }));
  await failsWith(afterData, "evidence");
});

test("a reverse duplicate possible pair is detected across records", async t => {
  const { beforeData } = await sandbox(t);
  await replaceShard(beforeData, "possible-duplicates", editRows<WirePair>(rows => {
    const pair = rows[0]!;
    rows[1] = { ...pair, a: pair.b, b: pair.a };
  }));
  await failsWith(beforeData, "pair-conflict");
});

test("record totals must reflect the actual membership, including unique records only present in possible pairs", async t => {
  const { beforeData, afterData } = await sandbox(t);
  await replaceIndex(beforeData, i => { i.records_in_clusters++; });
  await failsWith(beforeData, "totals");
  await replaceIndex(afterData, i => { i.places_read = i.records_in_clusters; });
  await failsWith(afterData, "totals");
});

test("manifest ordering, JSON property order and symmetric evidence endpoint order leave the snapshot unchanged", async t => {
  const { beforeData } = await sandbox(t);
  const original = await readSnapshot(beforeData);
  await replaceIndex(beforeData, i => { i.files.reverse(); });
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => {
    rows.reverse();
    for (const group of rows) {
      group.members.reverse();
      group.evidence = group.evidence.reverse().map(edge =>
        Object.fromEntries(Object.entries({ ...edge, a: edge.b, b: edge.a }).reverse()) as Edge);
    }
  }));
  await replaceShard(beforeData, "possible-duplicates", editRows<WirePair>(rows => {
    for (const row of rows) [row.a, row.b] = [row.b, row.a];
  }));
  assert.deepEqual(await readSnapshot(beforeData), original);
});

test("score and rationale edits are detectable without retaining source free text", async t => {
  const { beforeData } = await sandbox(t);
  const original = await readSnapshot(beforeData);
  await replaceShard(beforeData, "same-place", editRows<WireGroup>(rows => { rows[0]!.evidence[0]!.score = 0.83; }));
  await replaceShard(beforeData, "possible-duplicates", editRows<WirePair>(rows => { rows[0]!.why = "SYNTHETIC INTERNAL COMMENT"; }));
  const modified = await readSnapshot(beforeData);
  const oldGroups = new Map(original.groups.map(g => [g.id, g.evidenceDigest]));
  assert.equal(modified.groups.filter(g => g.evidenceDigest !== oldGroups.get(g.id)).length, 1);
  assert.equal(modified.pairs.filter((p, i) => p.evidenceDigest !== original.pairs[i]!.evidenceDigest).length, 1);
  assert.ok(!JSON.stringify(modified).includes("SYNTHETIC INTERNAL COMMENT"));
});

test("requires an explicitly selected data directory rather than following a root symlink", async t => {
  const { beforeData, afterRoot } = await sandbox(t);
  const shortcut = join(afterRoot, "shortcut");
  await symlink(beforeData, shortcut);
  await failsWith(shortcut, "unsafe-path");
});

test("unavailable releases fail with a code and do not disclose the supplied private path", async t => {
  const { beforeRoot } = await sandbox(t);
  await failsWith(join(beforeRoot, "private-missing-directory"), "unreadable");
});
