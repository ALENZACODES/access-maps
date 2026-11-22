import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_COMPRESSED_BYTES, type AuditPart } from "./manifest.ts";
import { readManifestFile, readPart } from "./parts.ts";

let directory: string;
let packRoot: string;
let releaseRoot: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "schedule-qa-"));
  packRoot = join(directory, "data", "schedules", "v1");
  releaseRoot = join(directory, "release-assets");
  await mkdir(packRoot, { recursive: true });
  await mkdir(releaseRoot);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function descriptor(bytes: Buffer, kind: AuditPart["kind"] = "trips", placement: AuditPart["placement"] = "git"): AuditPart {
  const filename = kind === "trips" ? "trips-0000.ndjson.gz" : "calendar.json.gz";
  return {
    index: 3,
    sourceId: "fixture", regionId: "region", placement, kind,
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    tripCount: kind === "calendar" ? 0 : 1, path: "region/fixture/" + filename,
    ...(placement === "release" ? { assetName: "fixture-schedules-v1-region-" + filename } : {}),
  };
}

async function stage(bytes: Buffer, kind: AuditPart["kind"] = "trips", placement: AuditPart["placement"] = "git") {
  const part = descriptor(bytes, kind, placement);
  const target = part.assetName === undefined ? join(packRoot, part.path) : join(releaseRoot, part.assetName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { part, target };
}

describe("local part resolution", () => {
  it("does not use the network or search the git directory for a missing release asset", async () => {
    const bytes = gzipSync('{"id":"fixture-trip"}\n');
    const { part: git } = await stage(bytes);
    const release = descriptor(bytes, "trips", "release");
    await writeFile(join(packRoot, release.assetName!), bytes);
    expect((await readPart(git, { packRoot })).status).toBe("trips");
    const expected = { status: "missing", issue: { code: "file.missing", at: "parts[3]", severity: "warning" } };
    expect(await readPart(release, { packRoot })).toEqual(expected);
    expect(await readPart(release, { packRoot, releaseRoot })).toEqual(expected);
  });

  it("reads the named release asset with no corresponding git path present", async () => {
    const bytes = gzipSync('{"sourceId":"fixture","stops":[]}');
    const { part } = await stage(bytes, "calendar", "release");
    expect(await readPart(part, { packRoot, releaseRoot })).toEqual({
      status: "calendar", value: { sourceId: "fixture", stops: [] },
    });
  });

  it("rejects traversal, absolute paths, aliases and URI-like names before opening them", async () => {
    const p = descriptor(gzipSync("{}"));
    const names = ["../data", join(directory, "outside"), "/tmp/calendar.json.gz", "https://example.invalid/shard", "region\\fixture\\file"];
    for (const path of names) {
      expect(await readPart({ ...p, path }, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "part.path" } });
    }
    expect(await readPart({ ...p, placement: "release", assetName: "../shard" }, { packRoot, releaseRoot }))
      .toMatchObject({ status: "invalid", issue: { code: "part.path" } });
  });

  it("accepts an internal symlink and rejects a sibling directory with the same root-name prefix", async () => {
    const bytes = gzipSync('{"id":"fixture"}\n');
    const { part, target } = await stage(bytes);
    const internal = join(packRoot, "staged");
    const external = join(packRoot + "-archive", "staged");
    await mkdir(dirname(external), { recursive: true });
    await writeFile(internal, bytes);
    await writeFile(external, bytes);
    await rm(target);
    await symlink(internal, target);
    expect((await readPart(part, { packRoot })).status).toBe("trips");
    await rm(target);
    await symlink(external, target);
    expect(await readPart(part, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "file.outside" } });
  });

  it("distinguishes unstaged local files from a dangling link chain that ends outside the root", async () => {
    const part = descriptor(gzipSync("{}"), "calendar");
    const target = join(packRoot, part.path);
    const alias = join(packRoot, "staged-alias");
    await mkdir(dirname(target), { recursive: true });
    await symlink(alias, target);
    expect(await readPart(part, { packRoot })).toMatchObject({ status: "missing", issue: { code: "file.missing" } });
    await symlink(join(directory, "absent"), alias);
    expect(await readPart(part, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "file.outside" } });
  });

  it("detects an escape through a parent symlink in the git layout", async () => {
    const bytes = gzipSync("{}");
    const p = descriptor(bytes, "calendar");
    const archive = join(directory, "external");
    await mkdir(join(archive, "fixture"), { recursive: true });
    await writeFile(join(archive, "fixture", "calendar.json.gz"), bytes);
    await symlink(archive, join(packRoot, "region"), "dir");
    expect(await readPart(p, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "file.outside" } });
  });

  it("rejects a directory occupying the exact release asset path", async () => {
    const p = descriptor(gzipSync("{}"), "calendar", "release");
    await mkdir(join(releaseRoot, p.assetName!));
    expect(await readPart(p, { packRoot, releaseRoot })).toMatchObject({ status: "invalid", issue: { code: "file.type" } });
  });
});

describe("compressed size, hash, decompression and text decoding", () => {
  it("checks declared compressed length and then compressed SHA-256 before attempting gunzip", async () => {
    const { part } = await stage(Buffer.from("invalid gzip payload"));
    expect(await readPart({ ...part, bytes: part.bytes + 1, sha256: "0".repeat(64) }, { packRoot }))
      .toMatchObject({ status: "invalid", issue: { code: "file.size" } });
    expect(await readPart({ ...part, sha256: "0".repeat(64) }, { packRoot }))
      .toMatchObject({ status: "invalid", issue: { code: "file.hash" } });
    expect(await readPart(part, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "file.gzip" } });
  });

  it("distinguishes a missing gzip trailer from a metadata digest mismatch", async () => {
    const bytes = gzipSync('{"id":"fixture"}\n');
    const { part } = await stage(bytes.subarray(0, bytes.length - 3));
    expect(await readPart(part, { packRoot })).toMatchObject({ issue: { code: "file.gzip" } });
  });

  it("enforces actual and declared compressed limits before allocating the file buffer", async () => {
    const { part, target } = await stage(gzipSync("{}"));
    expect(await readPart({ ...part, bytes: MAX_COMPRESSED_BYTES + 1 }, { packRoot })).toMatchObject({ issue: { code: "file.limit" } });
    // A sparse file tests stat-based rejection without creating a large test fixture.
    await truncate(target, MAX_COMPRESSED_BYTES + 1);
    expect(await readPart(part, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "file.limit" } });
  });

  it("bounds decompressed trip data before parsing even a tiny compressed input", async () => {
    const { part } = await stage(gzipSync(Buffer.alloc(4 * 1024 * 1024 + 1, 0x20)));
    expect(part.bytes).toBeLessThan(8192);
    expect(await readPart(part, { packRoot })).toMatchObject({ status: "invalid", issue: { code: "file.limit" } });
  });

  it("counts bytes per NDJSON line including multibyte text", async () => {
    const bytes = gzipSync(JSON.stringify("é".repeat(530_000)));
    const { part } = await stage(bytes);
    expect(await readPart(part, { packRoot })).toMatchObject({
      status: "invalid", issue: { code: "file.limit", at: "parts[3].rows[0]" },
    });
  });

  it("bounds rows independently of the size of an individual NDJSON record", async () => {
    const { part } = await stage(gzipSync("0\n".repeat(100_001)));
    expect(await readPart(part, { packRoot })).toMatchObject({
      status: "invalid", issue: { code: "file.limit", at: "parts[3].rows[100000]" },
    });
  });

  it("reads CRLF and an unterminated terminal record without creating an extra row", async () => {
    const { part } = await stage(gzipSync('{"id":"fixture-été"}\r\n{"id":"fixture-two"}'));
    expect(await readPart(part, { packRoot })).toEqual({ status: "trips", rows: [{ id: "fixture-été" }, { id: "fixture-two" }] });
  });

  it.each([
    ["invalid JSON", Buffer.from('{"id":'), "file.ndjson"],
    ["blank row", Buffer.from("\r\n"), "file.ndjson"],
    ["invalid UTF-8", Buffer.from([0xc3, 0x28]), "file.utf8"],
  ] as const)("returns no partially parsed trip collection for %s late in a file", async (_name, tail, code) => {
    const bytes = Buffer.concat([Buffer.from('{"id":"fixture"}\n'), tail]);
    const { part } = await stage(gzipSync(bytes));
    expect(await readPart(part, { packRoot })).toEqual({ status: "invalid", issue: { code, at: "parts[3].rows[1]", severity: "error" } });
  });

  it.each([
    [Buffer.from([0xff]), "file.utf8"],
    [Buffer.from("[]{}"), "file.json"],
  ] as const)("distinguishes calendar UTF-8 and JSON failures", async (payload, code) => {
    const { part } = await stage(gzipSync(payload), "calendar");
    expect(await readPart(part, { packRoot })).toEqual({ status: "invalid", issue: { code, at: "parts[3]", severity: "error" } });
  });
});

describe("local manifest input", () => {
  it("returns the parsed wire object with no mutations or inferred verification tier", async () => {
    const target = join(packRoot, "manifest.json");
    const value = { version: 1, sources: [{ sourceId: "fixture" }], parts: [] };
    await writeFile(target, JSON.stringify(value));
    expect(await readManifestFile(target)).toEqual({ ok: true, value });
  });

  it("reports a missing manifest as an error and keeps the input path out of the issue", async () => {
    const result = await readManifestFile(join(directory, "sensitive-location.json"));
    expect(result).toEqual({ ok: false, issue: { code: "file.missing", at: "manifest", severity: "error" } });
  });

  it("distinguishes syntax, invalid UTF-8 and a manifest exceeding the bounded reader", async () => {
    const target = join(directory, "manifest.json");
    for (const [payload, code] of [[Buffer.from("{"), "file.json"], [Buffer.from([0xfe]), "file.utf8"]] as const) {
      await writeFile(target, payload);
      expect(await readManifestFile(target)).toMatchObject({ ok: false, issue: { code } });
    }
    await truncate(target, 8 * 1024 * 1024 + 1);
    expect(await readManifestFile(target)).toMatchObject({ ok: false, issue: { code: "file.limit" } });
    expect(await readManifestFile(packRoot)).toMatchObject({ ok: false, issue: { code: "file.type" } });
  });
});
