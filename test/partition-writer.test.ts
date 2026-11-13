import { createReadStream } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { fv, unknownField, type Provenance } from "../src/model/provenance.js";
import { buildRecord } from "../src/model/records.js";

const ctx: Provenance = {
  source_id: "osm-ontario",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.length = 0;
});

describe("partition writer", () => {
  it("appends to the same region file after the open-file limit closes it", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "access-maps-"));
    directories.push(root);
    const writer = new PartitionWriter(root, 1_000_000, 1);
    await writer.write(record("a", "n43.5_w079.5"), "osm-ontario");
    await writer.write(record("b", "n43.0_w079.5"), "osm-ontario");
    await writer.write(record("c", "n43.5_w079.5"), "osm-ontario");
    await writer.close();
    const files = writer.files.filter((file, index) => writer.files.indexOf(file) === index);
    expect(files).toHaveLength(2);
    const ids = await readIds(files[0] as string);
    expect(ids).toEqual(["a", "c"]);
  });
});

function record(id: string, region: string) {
  const built = buildRecord("venue", id, region, { name: fv("Cafe", ctx, { source_key: "name" }) }, ctx);
  built.fields.name = built.fields.name ?? unknownField(ctx);
  return built;
}

async function readIds(file: string): Promise<string[]> {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  const ids: string[] = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    ids.push((JSON.parse(line) as { id: string }).id);
  }
  return ids;
}
