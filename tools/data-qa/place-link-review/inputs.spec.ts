import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rename, rm, symlink, truncate, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { gzipSync } from "node:zlib";
import { checkInputs } from "./inputs.ts";

function sha(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "link-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(relative: string, content: Buffer | string) {
    const file = join(root, relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    return file;
  }
  return { root, put };
}

test("fingerprints use sorted relative paths and exact compressed bytes across just three tranches", async t => {
  const { root, put } = await fixture(t);
  const a = gzipSync("fictional-record\n", { level: 3 });
  const b = gzipSync("another fixture\n");
  const c = gzipSync("washroom fixture\n");
  await put("washrooms/sample/1.ndjson.gz", c);
  await put("transit/other/2.ndjson.gz", b);
  await put("venues/sample/1.ndjson.gz", a);
  await put("transit/other/2.jsonl.gz", "ignored");
  await put("path/sample/1.ndjson.gz", "ignored");
  await put("links/same-place/1.ndjson.gz", "ignored");
  const digest = sha(
    "transit/other/2.ndjson.gz " + sha(b) + "\n" +
    "venues/sample/1.ndjson.gz " + sha(a) + "\n" +
    "washrooms/sample/1.ndjson.gz " + sha(c) + "\n",
  );
  assert.deepEqual(await checkInputs(root, digest, 3), {
    status: "matches", declaredDigest: digest, observedDigest: digest,
    files: 3, bytes: a.length + b.length + c.length, reason: null,
  });
});

test("byte-for-byte recompression and renaming each break a previously matching digest", async t => {
  const { root, put } = await fixture(t);
  const name = "venues/sample/part.ndjson.gz";
  const raw = "abc".repeat(100);
  const a = gzipSync(raw, { level: 1 });
  const b = gzipSync(raw, { level: 9 });
  assert.notDeepEqual(a, b);
  const file = await put(name, a);
  const digest = sha(name + " " + sha(a) + "\n");
  assert.equal((await checkInputs(root, digest)).status, "matches");
  await writeFile(file, b);
  assert.equal((await checkInputs(root, digest)).reason, "digest-mismatch");
  await writeFile(file, a);
  await rename(file, join(dirname(file), "renamed.ndjson.gz"));
  assert.equal((await checkInputs(root, digest)).reason, "digest-mismatch");
});

test("matching hashes with a contradictory declared count remain different", async t => {
  const { root, put } = await fixture(t);
  await put("venues/source/file.ndjson.gz", "fixture");
  const digest = sha("venues/source/file.ndjson.gz " + sha("fixture") + "\n");
  const result = await checkInputs(root, digest, 2);
  assert.equal(result.status, "differs");
  assert.equal(result.observedDigest, result.declaredDigest);
  assert.equal(result.reason, "count-mismatch");
});

test("empty, absent and incomplete roots have distinct results", async t => {
  const { root } = await fixture(t);
  assert.equal((await checkInputs(root, sha(""), 0)).status, "matches");
  assert.equal((await checkInputs(root, sha("files"), 2)).status, "unavailable");
  await mkdir(join(root, "venues"));
  const emptyArea = await checkInputs(root, sha("files"), 1);
  assert.equal(emptyArea.status, "differs");
  assert.equal(emptyArea.observedDigest, sha(""));
  assert.equal((await checkInputs(join(root, "missing"), sha(""), 0)).reason, "root-unavailable");
});

test("invalid declarations are refused before reading local data", async () => {
  for (const value of ["", "x".repeat(64), "abc", "A".repeat(64)]) {
    assert.equal((await checkInputs("nonexistent", value)).reason, "invalid-declaration");
  }
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await checkInputs("nonexistent", sha(""), count)).reason, "invalid-declaration");
  }
});

test("symlinks at the selected root, tranche, publisher and record are refused", async t => {
  const { root } = await fixture(t);
  const external = await fixture(t);
  const record = await external.put("venues/a/1.ndjson.gz", "fixture");
  const rootLink = join(root, "foreign");
  await symlink(external.root, rootLink);
  assert.equal((await checkInputs(rootLink, sha(""))).reason, "unsafe-entry");
  const area = join(root, "venues");
  await symlink(join(external.root, "venues"), area);
  assert.equal((await checkInputs(root, sha(""))).reason, "unsafe-entry");
  await rm(area);
  await mkdir(area);
  const source = join(area, "source");
  await symlink(dirname(record), source);
  assert.equal((await checkInputs(root, sha(""))).reason, "unsafe-entry");
  await rm(source);
  await mkdir(source);
  await symlink(record, join(source, "shard.ndjson.gz"));
  const result = await checkInputs(root, sha(""));
  assert.equal(result.reason, "unsafe-entry");
  assert.equal(result.observedDigest, null);
});

test("an oversized sparse file or directory disguised as a shard cannot be credited", async t => {
  const { root, put } = await fixture(t);
  const file = await put("transit/demo/big.ndjson.gz", "x");
  await truncate(file, 50_000_001);
  assert.equal((await checkInputs(root, sha(""))).reason, "file-limit");
  await rm(file);
  await mkdir(file);
  assert.equal((await checkInputs(root, sha(""))).reason, "unsafe-entry");
});

test("a filename with a line break cannot contribute an ambiguous hash manifest entry", async t => {
  const { root, put } = await fixture(t);
  await put("venues/source/one\ntwo.ndjson.gz", "x");
  assert.equal((await checkInputs(root, sha(""))).reason, "unsafe-entry");
});

async function duringRead(target: string, change: () => Promise<unknown>, scan: () => Promise<void>) {
  const handle = await open(target);
  const prototype: { read: FileHandle["read"] } = Object.getPrototypeOf(handle);
  await handle.close();
  const original = Object.getOwnPropertyDescriptor(prototype, "read")!;
  let changed = false;
  Object.defineProperty(prototype, "read", {
    ...original,
    async value(this: FileHandle, ...args: Parameters<FileHandle["read"]>) {
      const result = await Reflect.apply(original.value, this, args);
      if (!changed) {
        changed = true;
        await change();
      }
      return result;
    },
  });
  try { await scan(); } finally { Object.defineProperty(prototype, "read", original); }
  assert.ok(changed);
}

test("same-size inode replacement during a read clears the observed digest", async t => {
  const { root, put } = await fixture(t);
  const path = "venues/demo/a.ndjson.gz";
  const file = await put(path, "test");
  const replacement = await put("other", "test");
  await duringRead(file, () => rename(replacement, file), async () => {
    const result = await checkInputs(root, sha(path + " " + sha("test") + "\n"));
    assert.equal(result.reason, "changed-during-check");
    assert.equal(result.observedDigest, null);
  });
});

test("files appended to another tranche mid-check invalidate the observed inventory", async t => {
  const { root, put } = await fixture(t);
  const path = "venues/demo/a.ndjson.gz";
  const file = await put(path, "original");
  await duringRead(file, () => put("washrooms/demo/new.ndjson.gz", "next"), async () => {
    const result = await checkInputs(root, sha(path + " " + sha("original") + "\n"), 1);
    assert.equal(result.reason, "changed-during-check");
    assert.equal(result.status, "unavailable");
  });
});
