import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import schema from "../../src/pack/manifest.schema.json";
import { buildWebPack } from "../../src/pack/build.js";
import { verifyWebPack } from "../../src/pack/verify.js";
import type { PackLinkCell } from "../../src/pack/links.js";
import { fv, type Provenance } from "../../src/model/provenance.js";
import { buildRecord, type DataRecord } from "../../src/model/records.js";
import { runMatch } from "../../scripts/match-places.js";
import { cleanup, tempRoot } from "./helpers.js";

afterEach(cleanup);

/** Labelled test fixtures, not real places. Source ids are registry ids so the pack accepts them. */
const city: Provenance = { source_id: "toronto-park-washrooms", licence: "OGL-Toronto-1.0", retrieved_at: "2026-11-16", tier: 0 };
const osm: Provenance = { source_id: "osm-ontario", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const held: Provenance = { source_id: "brampton-city-parking", licence: "CC-BY-4.0", retrieved_at: "2026-11-16", tier: 0 };
const CELL = "n43.5_w079.5";
const commit = "2c01751faf39854bb849dae00b804cf881e72287";

function place(tranche: "washroom" | "venue", ctx: Provenance, id: string, name: string, lat: number, lon: number, extra: Record<string, string> = {}): DataRecord {
  const partial: Record<string, ReturnType<typeof fv>> = { name: fv(name, ctx, { source_key: "name" }) };
  for (const [key, value] of Object.entries(extra)) partial[key] = fv(value, ctx, { source_key: key });
  const record = buildRecord(tranche, id, CELL, partial, ctx);
  record.fields.lat = fv(lat, ctx, { source_key: "lat" });
  record.fields.lon = fv(lon, ctx, { source_key: "lon" });
  return record;
}

function write(data: string, dir: string, source: string, records: DataRecord[], cell = CELL): void {
  const folder = path.join(data, dir, source);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, `${cell}.ndjson.gz`), gzipSync(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`));
}

function setup() {
  const env = tempRoot();
  mkdirSync(path.join(env.root, "sources"), { recursive: true });
  cpSync(path.join(process.cwd(), "sources", "registry.json"), path.join(env.root, "sources", "registry.json"));
  write(env.data, "washrooms", city.source_id, [place("washroom", city, "city-1", "Fixture Park Washroom", 43.65, -79.38)]);
  write(env.data, "washrooms", osm.source_id, [place("washroom", osm, "osm:node/1", "Fixture Park Washroom", 43.65001, -79.38)]);
  write(env.data, "venues", osm.source_id, [
    place("venue", osm, "osm:way/2", "Fixture Lot", 43.66, -79.38, { category: "parking", category_group: "amenity", addr_housenumber: "10", addr_street: "Fixture Street" }),
  ]);
  write(env.data, "venues", held.source_id, [
    place("venue", held, "brampton-city-parking:1", "Fixture Lot", 43.66001, -79.38, { category: "municipal parking lot", category_group: "parking", addr_housenumber: "10", addr_street: "Fixture St" }),
  ]);
  return env;
}

async function pack(env: ReturnType<typeof setup>) {
  const out = path.join(env.root, "pack", "v1");
  const manifest = await buildWebPack({ data: env.data, out, repoRoot: env.root, builtAt: "2026-11-16T00:00:00.000Z", sourceCommit: commit });
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const valid = ajv.compile(schema);
  expect(valid(manifest), JSON.stringify(valid.errors)).toBe(true);
  await verifyWebPack({ data: env.data, out });
  return { manifest, out };
}

const match = (env: ReturnType<typeof setup>) => runMatch({ dataRoot: env.data, workDir: path.join(env.root, ".cache", "places-match") });

function cellFile(out: string, cell = CELL): PackLinkCell {
  return JSON.parse(gunzipSync(readFileSync(path.join(out, "links", `${cell}.json.gz`))).toString("utf8")) as PackLinkCell;
}

describe("same-place links in the pack", () => {
  it("carries the clusters of packed records, per cell, with their evidence", async () => {
    const env = setup();
    const index = await match(env);
    expect(index.clusters).toBe(2);
    const { manifest, out } = await pack(env);
    expect(manifest.links?.current).toBe(true);
    expect(manifest.links?.cells[CELL]).toMatchObject({ path: `pack/v1/links/${CELL}.json.gz`, clusters: 1 });
    const body = cellFile(out);
    expect(body.clusters).toHaveLength(1);
    expect(body.clusters[0]!.members.map((member) => member.sourceId).sort()).toEqual(["osm-ontario", "toronto-park-washrooms"]);
    expect(body.clusters[0]!.evidence[0]).toMatchObject({ address: "unknown" });
    expect(body.clusters[0]!.evidence[0]!.distance_m).toBeLessThan(5);
  });

  it("never names a record of a held source: its cluster is dropped and each record keeps its own page", async () => {
    const env = setup();
    const index = await match(env);
    // The matcher links the held lot to the OSM lot (two clusters in data/links) ...
    expect(index.clusters).toBe(2);
    const { manifest, out } = await pack(env);
    // ... but the pack names only packed records, so that cluster is dropped.
    const body = cellFile(out);
    expect(body.clusters).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(held.source_id);
    expect(manifest.counts.bySource[held.source_id]).toBeUndefined();
  });

  it("drops a member whose part is withheld", async () => {
    const env = setup();
    await match(env);
    // The OSM washroom part becomes unreadable after matching: the pack withholds it.
    appendFileSync(path.join(env.data, "washrooms", osm.source_id, `${CELL}.ndjson.gz`), Buffer.from("not gzip"));
    const { manifest, out } = await pack(env);
    expect(manifest.withheld?.some((part) => part.path === `washrooms/${osm.source_id}/${CELL}.ndjson.gz`)).toBe(true);
    expect(manifest.links?.current).toBe(false);
    expect(manifest.links?.cells[CELL]).toBeUndefined();
    expect(() => cellFile(out)).toThrow();
  });

  it("packs no links, and every record, when the link files do not match their index", async () => {
    const env = setup();
    const index = await match(env);
    const linkFile = index.files.find((file) => file.path.includes("same-place"))!;
    appendFileSync(path.join(env.data, linkFile.path), Buffer.from([0x1f, 0x8b]));
    const { manifest } = await pack(env);
    expect(manifest.links).toBeUndefined();
    expect(manifest.withheld?.find((part) => part.path === "links/same-place")?.reason).toMatch(/do not match/);
    expect(manifest.counts.records).toBe(3);
  });

  it("marks links older than the data as not current and still packs them", async () => {
    const env = setup();
    await match(env);
    write(env.data, "washrooms", "toronto-crem-washrooms", [
      place("washroom", { ...city, source_id: "toronto-crem-washrooms" }, "crem-1", "Fixture Hall Washroom", 43.67, -79.38),
    ]);
    const { manifest } = await pack(env);
    expect(manifest.links?.current).toBe(false);
    expect(manifest.links?.cells[CELL]?.clusters).toBe(1);
  });

  it("fails verification when a link file is changed after the build", async () => {
    const env = setup();
    await match(env);
    const { out } = await pack(env);
    writeFileSync(path.join(out, "links", `${CELL}.json.gz`), gzipSync(JSON.stringify({ cell: CELL, method: "x", clusters: [], possible: [] })));
    await expect(verifyWebPack({ data: env.data, out })).rejects.toThrow(/Digest mismatch/);
  });

  it("builds without links when there are none", async () => {
    const env = setup();
    const { manifest } = await pack(env);
    expect(manifest.links).toBeUndefined();
  });
});
