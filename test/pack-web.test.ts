import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../src/pack/manifest.schema.json";
import {
  METROLINX_ACCEPTED_ON,
  METROLINX_AUA_LEGEND,
  METROLINX_OGL_LINE,
  METROLINX_PACK_ATTRIBUTION,
  METROLINX_PACK_LICENCE,
  METROLINX_PACK_LICENCE_URL,
  buildWebPack,
  holdReason,
  normalizeName,
  searchHit,
} from "../src/pack/build.js";
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

function transitRecord(id: string, name: string, sourceId: string, licence: string): DataRecord {
  const field = (value: string | number) => ({
    value, source_id: sourceId, licence, retrieved_at: "2026-11-15", tier: 1 as const,
  });
  return { id, tranche: "transit", region: cell, fields: {
    stop_name: field(name), stop_lat: field(43.7), stop_lon: field(-79.4),
  } };
}

async function fixture(): Promise<{ data: string; out: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "web-pack-"));
  roots.push(root);
  const data = path.join(root, "data");
  const out = path.join(root, "pack", "v1");
  const fixtureFiles: Array<[string, string, DataRecord[]]> = [
    ["venues", "osm-ontario", [record("known", "École"), record("unnamed", "UNKNOWN")]],
    ["transit", "metrolinx-go", [transitRecord(
      "go-stop",
      "Exhibition GO",
      "metrolinx-go",
      METROLINX_PACK_LICENCE,
    )]],
    ["transit", "gtfs-ltc", [transitRecord(
      "ltc-held",
      "Dundas and Richmond",
      "gtfs-ltc",
      "LTC Open Data Terms of Use",
    )]],
  ];
  for (const [kind, source, records] of fixtureFiles) {
    const dir = path.join(data, kind, source);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${cell}.ndjson.gz`), gzipSync(`${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`));
  }
  return { data, out };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Ontario web pack", () => {
  it("packs Metrolinx GO/UP with AUA provenance and holds LTC pending confirmation", () => {
    const registry = readRegistry(process.cwd());
    const ids = new Set(registry.sources.map((source) => source.id));
    expect(ids.has("gtfs-miway")).toBe(false);
    expect(ids.has("gtfs-go-transit")).toBe(false);
    expect(ids.has("gtfs-up-express")).toBe(false);
    expect(holdReason(registry.sources.find((source) => source.id === "gtfs-ltc")!)).toMatch(/pending confirmation/);
    expect(holdReason(registry.sources.find((source) => source.id === "gtfs-ttc")!)).toBeNull();
    for (const id of ["metrolinx-go", "metrolinx-up"] as const) {
      const source = registry.sources.find((entry) => entry.id === id);
      expect(source, id).toBeDefined();
      expect(holdReason(source!)).toBeNull();
      expect(source!.licence_id).toBe(METROLINX_PACK_LICENCE);
      expect(source!.licence_url).toBe(METROLINX_PACK_LICENCE_URL);
      expect(source!.retrieved_at).toBe(METROLINX_ACCEPTED_ON);
      expect(source!.attribution).toBe(METROLINX_PACK_ATTRIBUTION);
      expect(source!.attribution).toContain(METROLINX_AUA_LEGEND);
      expect(source!.attribution).toContain(METROLINX_OGL_LINE);
    }
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
    expect(manifest.counts.records).toBe(3);
    expect(manifest.counts.bySource).toEqual({ "metrolinx-go": 1, "osm-ontario": 2 });
    expect(manifest.tranches.venue?.cells[cell]?.parts).toHaveLength(1);
    expect(manifest.tranches.transit?.cells[cell]?.parts).toEqual([
      expect.objectContaining({ path: `transit/metrolinx-go/${cell}.ndjson.gz`, sourceId: "metrolinx-go", count: 1 }),
    ]);
    expect(manifest.sources.find((source) => source.sourceId === "gtfs-miway")).toBeUndefined();
    expect(manifest.sources.find((source) => source.sourceId === "gtfs-ltc")).toMatchObject({
      inWebPack: false,
      heldReason: expect.stringMatching(/pending confirmation/),
    });
    const go = manifest.sources.find((source) => source.sourceId === "metrolinx-go");
    expect(go).toMatchObject({
      inWebPack: true,
      heldReason: null,
      licence: METROLINX_PACK_LICENCE,
      licenceUrl: METROLINX_PACK_LICENCE_URL,
      retrieved: METROLINX_ACCEPTED_ON,
      attribution: METROLINX_PACK_ATTRIBUTION,
    });
    expect(go?.attribution).toContain(METROLINX_AUA_LEGEND);
    expect(go?.attribution).toContain(METROLINX_OGL_LINE);
    const index = JSON.parse(gunzipSync(await readFile(path.join(out, "search", `${cell}.json.gz`))).toString());
    expect(index).toHaveLength(3);
    expect(index[0]).toMatchObject({ name: "Exhibition GO", nameNorm: "exhibition go", lat: 43.7, lon: -79.4, tranche: "transit" });
    expect(index[1]).toMatchObject({ name: "École", nameNorm: "ecole", lat: 43.7, lon: -79.4 });
    expect(index[2]).toMatchObject({ name: null, nameNorm: "" });
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
