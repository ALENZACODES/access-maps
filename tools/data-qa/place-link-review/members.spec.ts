import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { gzipSync } from "node:zlib";
import expectedFields from "../../../schema/fields.json" with { type: "json" };
import { inspectMembers } from "./members.ts";
import type { SourceCatalogue, SourceEvidence } from "./provenance.ts";
import type { LinkMember } from "./snapshot.ts";

const source: SourceEvidence = {
  sourceId: "fixture-source", sourceName: "Test source", licence: "Fixture licence",
  licenceUrl: "https://fixture.invalid/terms", sourceUrl: "https://fixture.invalid/",
  attribution: "Test source", retrievedOn: "2026-01-07", verificationTier: 0,
  status: "included", issues: [],
};
const registry: SourceCatalogue = new Map([[source.sourceId, source]]);
const cell = "n44.0_w080.0";
const directories = { venue: "venues", washroom: "washrooms", transit: "transit" };

function member(id = "synthetic", patch: Partial<LinkMember> = {}): LinkMember {
  return { id, tranche: "venue", cell, sourceId: source.sourceId, ...patch };
}

interface TestField {
  value?: string | number | null;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: number;
}
function record(forMember: LinkMember) {
  const fields: Record<string, TestField> = {};
  for (const key of expectedFields[forMember.tranche]) {
    fields[key] = {
      value: key === "name" ? "Private display label" : "UNKNOWN",
      source_id: forMember.sourceId, licence: source.licence!, retrieved_at: source.retrievedOn!,
      tier: source.verificationTier!,
    };
  }
  fields.lat!.value = -18.1234;
  fields.lon!.value = 124.6789;
  return { id: forMember.id, tranche: forMember.tranche, region: forMember.cell, fields };
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "link-members-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(name: string, payload: unknown[] | Buffer, forMember = member()) {
    const dir = join(root, directories[forMember.tranche], forMember.sourceId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, name);
    const bytes = Buffer.isBuffer(payload) ? payload : gzipSync(payload.map(row => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(path, bytes);
    return path;
  }
  return { root, put };
}

test("returns only provenance, identifiers and field coverage for each supported tranche", async t => {
  const { root, put } = await fixture(t);
  for (const tranche of ["venue", "washroom", "transit"] as const) {
    const target = member("id-" + tranche, { tranche });
    const row = record(target);
    await put(cell + ".ndjson.gz", [row], target);
    const [found] = await inspectMembers(root, [target], registry);
    const total = expectedFields[tranche].length;
    assert.deepEqual(found, {
      member: target, sourceId: source.sourceId, licence: source.licence, retrievedOn: source.retrievedOn,
      verificationTier: 0, status: "matched", reason: null, partsRead: 1, matchingRows: 1,
      fields: { total, unknown: total - 3, missing: 0, invalidProvenance: 0 }, accessibility: "UNKNOWN",
    });
    const serialized = JSON.stringify(found);
    assert.doesNotMatch(serialized, /Private display label|124\.6789|-18\.1234/u);
  }
});

test("only complete observed split partitions can establish an absent member declaration", async t => {
  const { root, put } = await fixture(t);
  const sought = member("missing");
  const [none] = await inspectMembers(root, [sought], registry);
  assert.equal(none?.status, "unavailable");
  assert.equal(none?.matchingRows, null);
  await put(cell + ".p02.ndjson.gz", [record(member("other"))]);
  const [gap] = await inspectMembers(root, [sought], registry);
  assert.equal(gap?.reason, "partition-sequence");
  assert.equal(gap?.matchingRows, null);
  await put(cell + ".ndjson.gz", [record(member("another"))]);
  const [absent] = await inspectMembers(root, [sought], registry);
  assert.equal(absent?.status, "absent");
  assert.equal(absent?.matchingRows, 0);
  assert.equal(absent?.partsRead, 2);
  assert.equal(absent?.fields, null);
});

test("an ID in a second shard is found, and duplicates across shards are disclosed without selecting a row", async t => {
  const { root, put } = await fixture(t);
  const a = member("a"), b = member("b");
  await put(cell + ".ndjson.gz", [record(a)]);
  await put(cell + ".p02.ndjson.gz", [record(a), record(b)]);
  const [duplicate, found] = await inspectMembers(root, [b, a], registry);
  assert.equal(duplicate?.status, "duplicate");
  assert.equal(duplicate?.matchingRows, 2);
  assert.equal(duplicate?.fields, null);
  assert.equal(found?.status, "matched");
  assert.equal(found?.matchingRows, 1);
  assert.equal(found?.partsRead, 2);
});

test("unreadable, malformed or invalid-UTF-8 trailing shard prevents publishing a partial positive or negative", async t => {
  const { root, put } = await fixture(t);
  const a = member("a"), b = member("b");
  await put(cell + ".ndjson.gz", [record(a)]);
  for (const bytes of [Buffer.from("not gzip"), gzipSync("not JSON\n"), gzipSync(Buffer.from([0xff])),
    gzipSync('{"unidentifiable":true}\n')]) {
    await put(cell + ".p02.ndjson.gz", bytes);
    const result = await inspectMembers(root, [a, b], registry);
    assert.ok(result.every(row => row.status === "unavailable" && row.reason === "invalid-partition"));
    assert.ok(result.every(row => row.matchingRows === null && row.fields === null && row.partsRead === 1));
  }
});

test("shard numbering follows the writer's unnumbered first file, p02 onward without holes or aliases", async t => {
  const { root, put } = await fixture(t);
  const target = member();
  await put(cell + ".ndjson.gz", [record(target)]);
  for (const suffix of ["p01", "p2", "p002", "p03", "part2"]) {
    const file = await put(cell + "." + suffix + ".ndjson.gz", []);
    const [result] = await inspectMembers(root, [target], registry);
    assert.equal(result?.status, "unavailable");
    assert.equal(result?.reason, "partition-sequence");
    await rm(file);
  }
  await put("n44.5_w080.0.p03.ndjson.gz", []);
  assert.equal((await inspectMembers(root, [target], registry))[0]?.status, "matched");
});

test("reports source, licence, date and verification-tier disagreements independently of unknown values", async t => {
  const { root, put } = await fixture(t);
  const target = member();
  const row = record(target);
  const originalUnknown = expectedFields.venue.length - 3;
  row.fields.name!.source_id = "other-source";
  row.fields.lat!.licence = "Other licence";
  row.fields.lon!.retrieved_at = "1900-01-01";
  row.fields.category!.tier = 4;
  await put(cell + ".ndjson.gz", [row]);
  const [result] = await inspectMembers(root, [target], registry);
  assert.equal(result?.status, "mismatch");
  assert.equal(result?.reason, "field-provenance");
  assert.equal(result?.fields?.invalidProvenance, 4);
  assert.equal(result?.fields?.unknown, originalUnknown);
  assert.doesNotMatch(JSON.stringify(result), /other-source|Other licence|1900-01-01/u);
});

test("missing required fields, absent values and explicit UNKNOWN stay distinct", async t => {
  const { root, put } = await fixture(t);
  const target = member();
  const row = record(target);
  delete row.fields.name;
  delete row.fields.category!.value;
  row.fields.wheelchair!.value = null;
  await put(cell + ".ndjson.gz", [row]);
  const [result] = await inspectMembers(root, [target], registry);
  assert.equal(result?.status, "mismatch");
  assert.equal(result?.reason, "missing-fields");
  assert.deepEqual(result?.fields, {
    total: expectedFields.venue.length, unknown: expectedFields.venue.length - 5, missing: 3, invalidProvenance: 0,
  });
});

test("unknown field names in a matched record cannot be silently accepted or exported", async t => {
  const { root, put } = await fixture(t);
  const target = member();
  const row = record(target);
  row.fields.private_extension = { ...row.fields.name!, value: "not exported" };
  await put(cell + ".ndjson.gz", [row]);
  const [result] = await inspectMembers(root, [target], registry);
  assert.equal(result?.reason, "unexpected-fields");
  assert.equal(result?.status, "mismatch");
  assert.doesNotMatch(JSON.stringify(result), /private_extension|not exported/u);
});

test("a misplaced matching record is flagged, and a mixed partition cannot establish an absence", async t => {
  const { root, put } = await fixture(t);
  const target = member(), other = member("other");
  await put(cell + ".ndjson.gz", [{ ...record(target), region: "n43.5_w080.0" }]);
  const [mismatch] = await inspectMembers(root, [target], registry);
  assert.equal(mismatch?.status, "mismatch");
  assert.equal(mismatch?.reason, "record-header");
  assert.equal(mismatch?.fields, null);
  await put(cell + ".ndjson.gz", [{ ...record(other), tranche: "transit" }]);
  const [uncertain] = await inspectMembers(root, [target], registry);
  assert.equal(uncertain?.status, "unavailable");
  assert.equal(uncertain?.matchingRows, null);
});

test("withheld and missing sources suppress member IDs before opening any filesystem root", async () => {
  const held: SourceEvidence = { ...source, status: "held" };
  for (const policy of [new Map([[source.sourceId, held]]), new Map()]) {
    const [row] = await inspectMembers("unavailable\0root", [member("withheld-private-record")], policy);
    assert.equal(row?.status, "restricted");
    assert.equal(row?.member, null);
    assert.equal(row?.partsRead, 0);
    assert.equal(row?.matchingRows, null);
    assert.doesNotMatch(JSON.stringify(row), /withheld-private-record/u);
  }
  const blocked = { ...source, sourceId: "miway" };
  const [excluded] = await inspectMembers("", [member("under-hold", { sourceId: blocked.sourceId })],
    new Map([[blocked.sourceId, blocked]]));
  assert.equal(excluded?.status, "restricted");
});

test("handles a symlink next to real partitions and refuses unsafe locators", async t => {
  const { root, put } = await fixture(t);
  const target = member();
  const file = await put(cell + ".ndjson.gz", [record(target)]);
  await symlink(file, file.replace(".ndjson.gz", ".p02.ndjson.gz"));
  const [blocked] = await inspectMembers(root, [target], registry);
  assert.equal(blocked?.reason, "unsafe-entry");
  assert.equal(blocked?.fields, null);
  const [unsafe] = await inspectMembers(root, [member("t", { cell: "../up" })], registry);
  assert.equal(unsafe?.reason, "unsafe-entry");
});

test("requests sharing a partition are scanned together and exact duplicate locators have one result", async t => {
  const { root, put } = await fixture(t);
  const a = member("one"), b = member("two");
  const file = await put(cell + ".ndjson.gz", [record(a), record(b)]);
  const handle = await open(file);
  const prototype: { read: FileHandle["read"] } = Object.getPrototypeOf(handle);
  await handle.close();
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "read")!;
  let reads = 0;
  Object.defineProperty(prototype, "read", { ...descriptor, value(this: FileHandle, ...args: Parameters<FileHandle["read"]>) {
    reads++;
    return Reflect.apply(descriptor.value, this, args);
  } });
  try {
    await inspectMembers(root, [a], registry);
    const oneRead = reads;
    reads = 0;
    const rows = await inspectMembers(root, [b, a, b], registry);
    assert.equal(rows.length, 2);
    assert.ok(oneRead > 0);
    assert.equal(reads, oneRead);
    assert.deepEqual(rows.map(row => row.member?.id), ["one", "two"]);
  } finally {
    Object.defineProperty(prototype, "read", descriptor);
  }
});
