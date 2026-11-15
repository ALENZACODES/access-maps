import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../src/pack/manifest.schema.json";
import { buildWebPack, holdReason, normalizeName, searchHit } from "../src/pack/build.js";
import { cellBBox, makeRegions, overlaps } from "../src/pack/regions.js";
import { verifyWebPack } from "../src/pack/verify.js";
import { readRegistry } from "../src/registry.js";
import type { DataRecord } from "../src/model/records.js";

const roots: string[] = [];
const commit = "2c01751faf39854bb849dae00b804cf881e72287";
const date = "2026-11-15T00:00:00.000Z";
const cell = "n43.5_w079.5";

function record(id: string, name: string, sourceId = "osm-ontario"): DataRecord {
  const field = (value: string | number) => ({ value, source_id: sourceId, licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 as const });
  return { id, tranche: "venue", region: cell, fields: {
    name: field(name), latitude: field(43.7), longitude: field(-79.4),
  } };
}

async function fixture(): Promise<{ data: string; out: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "web-pack-"));
  roots.push(root);
  const data = path.join(root, "data");
  const out = path.join(root, "pack", "v1");
  const fixtureFiles = [
    ["osm-ontario", [record("known", "École"), record("unnamed", "UNKNOWN")]],
    ["gtfs-miway", [record("held", "Private", "gtfs-miway")]],
  ] as const;
  for (const [source, records] of fixtureFiles) {
    const dir = path.join(data, "venues", source);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${cell}.ndjson.gz`), gzipSync(`${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`));
  }
  return { data, out };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Ontario web pack", () => {
  it("holds all four feeds based on the current legal registry notes", () => {
    const registry = readRegistry(process.cwd());
    for (const id of ["gtfs-go-transit", "gtfs-up-express", "gtfs-miway", "gtfs-ltc"]) {
      expect(holdReason(registry.sources.find((source) => source.id === id)!)).toBeTruthy();
    }
    expect(holdReason(registry.sources.find((source) => source.id === "gtfs-ttc")!)).toBeNull();
  });

  it("folds French accents and keeps unknown names nullable", () => {
    expect(normalizeName("École, Saint-Étienne !")).toBe("ecole saint etienne");
    expect(searchHit(record("x", "UNKNOWN"))).toMatchObject({ name: null, nameNorm: "" });
  });

  it("uses southwest corners, not centre points, for cells", () => {
    expect(cellBBox(cell)).toEqual([-79.5, 43.5, -79, 44]);
    expect(cellBBox("n44.0_w080.0")).toEqual([-80, 44, -79.5, 44.5]);
    expect(overlaps(cellBBox(cell), [-79, 43.5, -78.5, 44])).toBe(false);
    expect(makeRegions([cell]).find((region) => region.id === "ontario-all")?.cells).toEqual([cell]);
  });

  it("builds schema-valid, deterministic, filtered indexes and verifies hashes and counts", async () => {
    const { data, out } = await fixture();
    const options = { data, out, sourceCommit: commit, builtAt: date };
    const manifest = await buildWebPack(options);
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const valid = ajv.compile(schema);
    expect(valid(manifest), JSON.stringify(valid.errors)).toBe(true);
    expect(manifest.counts.records).toBe(2);
    expect(manifest.counts.bySource).toEqual({ "osm-ontario": 2 });
    expect(manifest.tranches.venue?.cells[cell]?.parts).toHaveLength(1);
    expect(manifest.sources.find((source) => source.sourceId === "gtfs-miway")).toMatchObject({ inWebPack: false });
    const index = JSON.parse(gunzipSync(await readFile(path.join(out, "search", `${cell}.json.gz`))).toString());
    expect(index).toHaveLength(2);
    expect(index[0]).toMatchObject({ name: "École", nameNorm: "ecole", lat: 43.7, lon: -79.4 });
    expect(index[1]).toMatchObject({ name: null, nameNorm: "" });
    await verifyWebPack({ data, out });
    const first = await readFile(path.join(out, "manifest.json"));
    const compressed = await readFile(path.join(out, "search", `${cell}.json.gz`));
    await buildWebPack(options);
    expect(await readFile(path.join(out, "manifest.json"))).toEqual(first);
    expect(await readFile(path.join(out, "search", `${cell}.json.gz`))).toEqual(compressed);
    await writeFile(path.join(out, "search", `${cell}.json.gz`), Buffer.from("corrupt"));
    await expect(verifyWebPack({ data, out })).rejects.toThrow();
  });
});
