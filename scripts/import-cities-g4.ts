import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { findZipEntry, listZip, readZipText } from "../src/io/zip.js";
import { indexLevels, mapGtfsPathway, mapGtfsStop, wheelchairStopsFromRows } from "../src/gtfs/map.js";
import type { RawFeature } from "../src/municipal/cities/g4-helpers.js";
import { GREATER_SUDBURY_JOBS } from "../src/municipal/cities/greater-sudbury.js";
import { KINGSTON_JOBS } from "../src/municipal/cities/kingston.js";
import { THUNDER_BAY_JOBS } from "../src/municipal/cities/thunder-bay.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

/** One ArcGIS REST layer read into one source. The registry download_url is the layer URL. */
export interface CityLayerJob {
  id: string;
  tranches: Tranche[];
  map: (feature: RawFeature, ctx: Provenance) => DataRecord | DataRecord[] | null;
}

/** Static GTFS feeds published by the cities in this file. Stops and pathways only, tier 1. */
export const G4_GTFS_FEEDS: readonly string[] = ["gtfs-kingston", "gtfs-gova"];

export const G4_LAYER_JOBS: readonly CityLayerJob[] = [
  ...KINGSTON_JOBS,
  ...GREATER_SUDBURY_JOBS,
  ...THUNDER_BAY_JOBS,
];

export interface G4Imported {
  source_id: string;
  records: number;
  skipped: number;
  no_coordinate: number;
  duplicate_ids: number;
}

export async function importCitiesG4(repoRoot: string, only: readonly string[] = []): Promise<{ sources: G4Imported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: G4Imported[] = [];
  for (const job of G4_LAYER_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    const source = requireSource(registry, job.id);
    if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 municipal data`);
    const features = await cachedLayer(repoRoot, job.id, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
    const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
    const seen = new Set<string>();
    const stats: G4Imported = { source_id: source.id, records: 0, skipped: 0, no_coordinate: 0, duplicate_ids: 0 };
    for (const feature of features) {
      const mapped = job.map(feature, ctx);
      if (mapped === null) {
        stats.skipped += 1;
        continue;
      }
      for (const record of Array.isArray(mapped) ? mapped : [mapped]) {
        // A record with no usable coordinate has no 0.5-degree cell to be stored in.
        if (record.region === "unknown") {
          stats.no_coordinate += 1;
          continue;
        }
        let next = record;
        if (!acceptId(seen, next.id)) {
          stats.duplicate_ids += 1;
          let suffix = 2;
          while (!acceptId(seen, `${record.id}#${suffix}`)) suffix += 1;
          next = { ...record, id: `${record.id}#${suffix}` };
        }
        await commitRecord(next, source.id, writer, validators);
        stats.records += 1;
      }
    }
    sources.push(stats);
  }
  for (const id of G4_GTFS_FEEDS) {
    if (only.length > 0 && !only.includes(id)) continue;
    const source = requireSource(registry, id);
    if (source.kind !== "gtfs" || source.tier !== 1) throw new Error(`${id} must be a tier 1 gtfs source`);
    const zipPath = await cachedZip(repoRoot, id, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, ["transit", "path"]);
    const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 1 };
    const entries = listZip(zipPath);
    const stopsEntry = findZipEntry(entries, "stops.txt");
    if (!stopsEntry) throw new Error(`${id} has no stops.txt`);
    const levelsEntry = findZipEntry(entries, "levels.txt");
    const pathwaysEntry = findZipEntry(entries, "pathways.txt");
    const levels = levelsEntry ? indexLevels(parseCsv(readZipText(zipPath, levelsEntry)).rows) : new Map();
    const stopRows = parseCsv(readZipText(zipPath, stopsEntry)).rows;
    const wheelchairStops = wheelchairStopsFromRows(stopRows);
    const seen = new Set<string>();
    const stats: G4Imported = { source_id: source.id, records: 0, skipped: 0, no_coordinate: 0, duplicate_ids: 0 };
    const rows: (DataRecord | null)[] = stopRows.map((row) => mapGtfsStop(row, levels, ctx, source.id, wheelchairStops));
    if (pathwaysEntry) {
      for (const row of parseCsv(readZipText(zipPath, pathwaysEntry)).rows) rows.push(mapGtfsPathway(row, ctx, source.id));
    }
    for (const record of rows) {
      if (!record) {
        stats.skipped += 1;
        continue;
      }
      if (!acceptId(seen, `${record.tranche}:${record.id}`)) {
        stats.duplicate_ids += 1;
        continue;
      }
      await commitRecord(record, source.id, writer, validators);
      stats.records += 1;
    }
    sources.push(stats);
  }
  await writer.close();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

/** Reads `.cache/municipal/<id>.json`, querying the layer when the file is absent. */
async function cachedLayer(repoRoot: string, id: string, url: string): Promise<RawFeature[]> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.json`);
  if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { features: RawFeature[] }).features;
  const features = await fetchLayer(url);
  writeFileSync(file, JSON.stringify({ features }));
  return features;
}

async function cachedZip(repoRoot: string, id: string, url: string): Promise<string> {
  const directory = path.join(repoRoot, ".cache", "gtfs");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.zip`);
  if (existsSync(file)) return file;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body[0] !== 0x50 || body[1] !== 0x4b) throw new Error(`${url} did not return a zip file`);
  writeFileSync(file, body);
  return file;
}

async function getJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url.origin}${url.pathname} HTTP ${response.status}`);
  const body = (await response.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (body.error) throw new Error(`${url.origin}${url.pathname}: ${body.error.message ?? "service error"}`);
  return body;
}

/** Pages a layer by object id, so the result does not depend on the service's own ordering. */
async function fetchLayer(layer: string): Promise<RawFeature[]> {
  const base = layer.replace(/\/$/, "");
  const ids = new URL(`${base}/query`);
  ids.searchParams.set("where", "1=1");
  ids.searchParams.set("returnIdsOnly", "true");
  ids.searchParams.set("f", "json");
  const listed = await getJson(ids);
  const objectIds = [...((listed.objectIds as number[] | null) ?? [])].sort((a, b) => a - b);
  if (objectIds.length === 0) throw new Error(`${base} returned no features`);
  const features: RawFeature[] = [];
  for (let start = 0; start < objectIds.length; start += 200) {
    const response = await fetch(`${base}/query`, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        objectIds: objectIds.slice(start, start + 200).join(","),
        outFields: "*",
        returnGeometry: "true",
        outSR: "4326",
        geometryPrecision: "6",
        f: "json",
      }),
    });
    if (!response.ok) throw new Error(`${base} HTTP ${response.status}`);
    const body = (await response.json()) as { error?: { message?: string }; features?: RawFeature[] };
    if (body.error) throw new Error(`${base}: ${body.error.message ?? "service error"}`);
    features.push(...(body.features ?? []));
  }
  if (features.length !== objectIds.length) {
    throw new Error(`${base} returned ${features.length} of ${objectIds.length} features`);
  }
  return features;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importCitiesG4(process.cwd(), process.argv.slice(2));
}
