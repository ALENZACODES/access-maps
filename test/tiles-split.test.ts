import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { PMTiles } from "pmtiles";
import { afterEach, describe, expect, it } from "vitest";
import schema from "../src/pack/manifest.schema.json";
import { buildOfflineTiles, excludedSources, splitToFit } from "../scripts/build-pmtiles.js";
import { buildWebPack, PACK_FILE_LIMIT } from "../src/pack/build.js";
import { verifyWebPack } from "../src/pack/verify.js";
import { buildPmtiles, MAX_TILE_FILE_BYTES, pmtilesBounds, project, TILE_FILE_PATTERN, type ArchiveOptions, type MapFeature } from "../src/tiles/build.js";
import { fv, type Provenance } from "../src/model/provenance.js";
import { buildRecord, type DataRecord } from "../src/model/records.js";
import { cleanup, tempRoot } from "./failsafe/helpers.js";

/** Every place below is a labelled test fixture, not a real place. */

afterEach(cleanup);

const OSM_CREDIT = "© OpenStreetMap contributors";
const commit = "2c01751faf39854bb849dae00b804cf881e72287";
const repo = process.cwd();

const options: ArchiveOptions = { family: "odbl", name: "fixture", description: "fixture", attribution: `${OSM_CREDIT}. ODbL 1.0.`, maxZoom: 10 };

function point(id: string, lat: number, lon: number): MapFeature {
  return { lat, lon, props: { id, tranche: "venue", source_id: "osm-ontario", name: `Fixture ${id}` }, licenceFamily: "odbl" };
}

function spread(prefix: string, lat: number, lon: number, count: number): MapFeature[] {
  return Array.from({ length: count }, (_, i) => point(`${prefix}${i}`, lat + (i % 40) * 0.02, lon + Math.floor(i / 40) * 0.02));
}

class BufferSource {
  constructor(private readonly file: Buffer) {}
  getKey(): string { return "fixture"; }
  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    const slice = this.file.subarray(offset, Math.min(this.file.length, offset + length));
    const copy = new Uint8Array(slice.byteLength);
    copy.set(slice);
    return { data: copy.buffer };
  }
}

async function metadata(file: Buffer): Promise<{ attribution?: string; description?: string }> {
  return (await new PMTiles(new BufferSource(file)).getMetadata()) as { attribution?: string; description?: string };
}

describe("splitting an overlay to stay under the file limit", () => {
  it("the tile limit is the pack's per-file limit", () => {
    expect(MAX_TILE_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(PACK_FILE_LIMIT).toBe(MAX_TILE_FILE_BYTES);
  });

  it("splits into latitude bands, then longitude bands, and keeps every feature exactly once", () => {
    const north = spread("n", 44.1, -79.9, 40);
    const south = spread("s", 42.1, -82.9, 40);
    const west = spread("w", 43.1, -80.95, 400);
    const east = spread("e", 43.1, -79.95, 400);
    const all = [...south, ...west, ...east, ...north];
    const size = (features: MapFeature[]) => buildPmtiles(features, options).length;
    const limit = Math.max(size(north), size(south), size(west), size(east)) + 1;
    expect(size([...west, ...east])).toBeGreaterThanOrEqual(limit);
    expect(size(all)).toBeGreaterThanOrEqual(limit);

    const archives = splitToFit(all, options, limit);
    expect(archives.map((archive) => archive.label)).toEqual(["n42", "n43-w080", "n43-w081", "n44"]);
    expect(archives.map((archive) => archive.features)).toEqual([40, 400, 400, 40]);
    for (const archive of archives) expect(archive.archive.length).toBeLessThan(limit);
    expect(archives.reduce((sum, archive) => sum + archive.features, 0)).toBe(all.length);
    const bounds = pmtilesBounds(archives[1]!.archive);
    expect(bounds[0]).toBeGreaterThanOrEqual(-80);
    expect(bounds[2]).toBeLessThan(-79);
  });

  it("keeps one file when the family fits", () => {
    const archives = splitToFit(spread("a", 43.1, -79.5, 10), options);
    expect(archives.map((archive) => archive.label)).toEqual([""]);
  });

  it("refuses to write a file over the limit instead of writing it", () => {
    expect(() => splitToFit(spread("a", 43.1, -79.5, 50), options, 200)).toThrow(/still over the 200 byte limit/);
  });

  it("file names match the pattern the pack reads", () => {
    for (const name of ["places.pmtiles", "places-n43.pmtiles", "places-n43-w080.pmtiles"]) expect(TILE_FILE_PATTERN.test(name), name).toBe(true);
    for (const name of ["places-n43.pmtiles.tmp", "other.pmtiles", "places-43.pmtiles"]) expect(TILE_FILE_PATTERN.test(name), name).toBe(false);
  });
});

function record(sourceId: string, licence: string, id: string, lat: number, lon: number, cell: string, tier: 0 | 1 | 2 | 3 | 4 = 0): DataRecord {
  const ctx: Provenance = { source_id: sourceId, licence, retrieved_at: "2026-11-16", tier };
  const result = buildRecord("venue", `${sourceId}:${id}`, cell, { name: fv(`Fixture ${id}`, ctx, { source_key: "name" }) }, ctx);
  result.fields.lat = fv(lat, ctx, { source_key: "lat" });
  result.fields.lon = fv(lon, ctx, { source_key: "lon" });
  return result;
}

function writePart(data: string, sourceId: string, cell: string, records: DataRecord[]): void {
  const file = path.join(data, "venues", sourceId, `${cell}.ndjson.gz`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gzipSync(`${records.map((item) => JSON.stringify(item)).join("\n")}\n`));
}

function tileFixture() {
  const env = tempRoot();
  cpSync(path.join(repo, "sources"), path.join(env.root, "sources"), { recursive: true });
  const osm = [
    ...Array.from({ length: 300 }, (_, i) => record("osm-ontario", "ODbL-1.0", `a${i}`, 43.6 + (i % 20) * 0.01, -79.4 + Math.floor(i / 20) * 0.01, "n43.5_w079.5")),
    ...Array.from({ length: 300 }, (_, i) => record("osm-ontario", "ODbL-1.0", `b${i}`, 44.6 + (i % 20) * 0.01, -79.4 + Math.floor(i / 20) * 0.01, "n44.5_w079.5")),
  ];
  writePart(env.data, "osm-ontario", "n43.5_w079.5", osm.slice(0, 300));
  writePart(env.data, "osm-ontario", "n44.5_w079.5", osm.slice(300));
  writePart(env.data, "toronto-library-branches", "n43.5_w079.5", [record("toronto-library-branches", "OGL-Toronto-1.0", "lib1", 43.65, -79.38, "n43.5_w079.5")]);
  // Held by the pack's licence rule: it must not reach any tile either.
  writePart(env.data, "brampton-city-parking", "n43.5_w080.0", [record("brampton-city-parking", "OGL-Brampton", "held1", 43.7, -79.75, "n43.5_w080.0")]);
  // Not in the registry: no licence, so no tile.
  writePart(env.data, "unregistered-fixture", "n43.5_w079.5", [record("unregistered-fixture", "CC0-1.0", "x1", 43.66, -79.39, "n43.5_w079.5")]);
  return env;
}

async function tileHas(file: string, lat: number, lon: number, zoom: number, text: string): Promise<boolean> {
  const reader = new PMTiles(new BufferSource(readFileSync(file)));
  const { x, y } = project(lon, lat, zoom);
  const response = await reader.getZxy(zoom, x, y);
  if (!response) return false;
  return Buffer.from(new Uint8Array(response.data)).includes(Buffer.from(text));
}

describe("building the overlays and the pack from split tiles", () => {
  it("respects the pack's holds, keeps OSM in its own family with the exact credit, and removes stale band files", async () => {
    const env = tileFixture();
    mkdirSync(path.join(env.data, "tiles", "odbl"), { recursive: true });
    writeFileSync(path.join(env.data, "tiles", "odbl", "places-n40.pmtiles"), "stale");

    const whole = await buildOfflineTiles(env.root, true);
    expect(whole.sort()).toEqual(["data/tiles/odbl/places.pmtiles", "data/tiles/open/places.pmtiles"]);
    expect(existsSync(path.join(env.data, "tiles", "odbl", "places-n40.pmtiles"))).toBe(false);
    const odbl = path.join(env.data, "tiles", "odbl", "places.pmtiles");
    const open = path.join(env.data, "tiles", "open", "places.pmtiles");
    expect((await metadata(readFileSync(odbl))).attribution?.startsWith(OSM_CREDIT)).toBe(true);
    expect((await metadata(readFileSync(open))).attribution).not.toContain("OpenStreetMap contributors");
    expect(await tileHas(open, 43.65, -79.38, 12, "toronto-library-branches:lib1")).toBe(true);
    expect(await tileHas(open, 43.66, -79.39, 12, "unregistered-fixture")).toBe(false);
    expect(await tileHas(open, 43.7, -79.75, 12, "brampton-city-parking")).toBe(false);
    expect(await tileHas(odbl, 43.6, -79.4, 12, "osm-ontario:a0")).toBe(true);
    expect(await tileHas(odbl, 43.65, -79.38, 12, "toronto-library-branches")).toBe(false);
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ step: "tiles", source_id: "unregistered-fixture", status: "withheld" }));

    // Force a split with a limit just under the single ODbL file.
    const limit = statSync(odbl).size - 1;
    const split = await buildOfflineTiles(env.root, true, limit);
    expect(split.filter((file) => file.includes("odbl")).sort()).toEqual(["data/tiles/odbl/places-n43.pmtiles", "data/tiles/odbl/places-n44.pmtiles"]);
    expect(readdirSync(path.join(env.data, "tiles", "odbl")).sort()).toEqual(["places-n43.pmtiles", "places-n44.pmtiles"]);
    for (const name of ["places-n43.pmtiles", "places-n44.pmtiles"]) {
      const file = path.join(env.data, "tiles", "odbl", name);
      expect(statSync(file).size).toBeLessThan(limit);
      expect((await metadata(readFileSync(file))).attribution?.startsWith(OSM_CREDIT)).toBe(true);
    }
    expect(await tileHas(path.join(env.data, "tiles", "odbl", "places-n44.pmtiles"), 44.6, -79.4, 12, "osm-ontario:b0")).toBe(true);
    expect(await tileHas(path.join(env.data, "tiles", "odbl", "places-n43.pmtiles"), 44.6, -79.4, 12, "osm-ontario:b0")).toBe(false);

    const out = path.join(env.root, "pack", "v1");
    const manifest = await buildWebPack({ data: env.data, out, repoRoot: env.root, builtAt: "2026-11-16T00:00:00.000Z", sourceCommit: commit });
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const valid = ajv.compile(schema);
    expect(valid(manifest), JSON.stringify(valid.errors)).toBe(true);
    expect(Object.keys(manifest.tiles).sort()).toEqual(["odbl/n43", "odbl/n44", "open"]);
    expect(manifest.tiles["odbl/n44"]).toMatchObject({ path: "tiles/odbl/places-n44.pmtiles", licence: "ODbL-1.0" });
    expect(manifest.tiles.open).toMatchObject({ path: "tiles/open/places.pmtiles", licence: "mixed-open" });
    const [west, south, east, north] = manifest.tiles["odbl/n44"]!.bbox;
    expect(south).toBeGreaterThanOrEqual(44);
    expect(north).toBeLessThan(45);
    expect(west).toBeLessThan(east);
    expect(manifest.withheld?.filter((part) => part.path.startsWith("tiles/"))).toEqual([]);
    await verifyWebPack({ data: env.data, out });

    // verify:web-pack rejects a tile that changed after the build, a wrong key, and a wrong licence.
    const manifestFile = path.join(out, "manifest.json");
    const saved = readFileSync(manifestFile, "utf8");
    const edit = async (change: (m: typeof manifest) => void, message: RegExp) => {
      const copy = JSON.parse(saved) as typeof manifest;
      change(copy);
      writeFileSync(manifestFile, JSON.stringify(copy));
      await expect(verifyWebPack({ data: env.data, out })).rejects.toThrow(message);
      writeFileSync(manifestFile, saved);
    };
    await edit((m) => { m.tiles["odbl/n44"]!.sha256 = "0".repeat(64); }, /Digest mismatch/);
    await edit((m) => { m.tiles["odbl/n45"] = m.tiles["odbl/n44"]!; }, /Tile key does not match its path/);
    await edit((m) => { m.tiles["odbl/n44"]!.licence = "mixed-open"; }, /Tile licence does not match its family/);
    await edit((m) => { m.withheld = [{ path: "tiles/odbl/places-n44.pmtiles", sourceId: null, tranche: null, cell: null, reason: "x" }]; }, /Withheld tile included/);
  });

  it("an unexpected file in a tile directory is withheld, not listed", async () => {
    const env = tileFixture();
    await buildOfflineTiles(env.root, true);
    writeFileSync(path.join(env.data, "tiles", "open", "places-copy.pmtiles"), "x");
    const out = path.join(env.root, "pack", "v1");
    const manifest = await buildWebPack({ data: env.data, out, repoRoot: env.root, builtAt: "2026-11-16T00:00:00.000Z", sourceCommit: commit });
    expect(Object.keys(manifest.tiles).sort()).toEqual(["odbl", "open"]);
    expect(manifest.withheld).toContainEqual(expect.objectContaining({ path: "tiles/open/places-copy.pmtiles", reason: "unexpected tile file name" }));
    await verifyWebPack({ data: env.data, out });
  });

  it("the tiles leave out every source the pack holds and the Metrolinx files", () => {
    const { held, registered } = excludedSources(repo);
    expect(held.has("brampton-city-parking")).toBe(true);
    expect(held.has("metrolinx-go")).toBe(true);
    expect(held.has("metrolinx-up")).toBe(true);
    expect(held.has("osm-ontario")).toBe(false);
    expect(registered.has("osm-ontario")).toBe(true);
  });
});

describe("the committed overlays", () => {
  const tiles = path.join(repo, "data", "tiles");
  const files = ["odbl", "open"].flatMap((family) =>
    existsSync(path.join(tiles, family)) ? readdirSync(path.join(tiles, family)).map((name) => ({ family, name, file: path.join(tiles, family, name) })) : [],
  );

  it("are all under the 25 MiB file limit and named as the pack expects", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const { name, file } of files) {
      expect(TILE_FILE_PATTERN.test(name), name).toBe(true);
      expect(statSync(file).size, name).toBeLessThan(MAX_TILE_FILE_BYTES);
    }
  });

  it("credit OpenStreetMap exactly in every ODbL file and never in the open files", async () => {
    for (const { family, name, file } of files) {
      const head = readFileSync(file);
      const { attribution, description } = await metadata(head);
      if (family === "odbl") expect(attribution?.startsWith(OSM_CREDIT), name).toBe(true);
      else {
        expect(attribution, name).not.toContain("OpenStreetMap contributors");
        expect(description, name).toContain("no OpenStreetMap data");
      }
    }
  });
});
