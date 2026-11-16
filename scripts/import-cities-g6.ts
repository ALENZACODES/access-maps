import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import type { RawFeature } from "../src/municipal/cities/g4-helpers.js";
import { BRANT_JOBS } from "../src/municipal/cities/brant.js";
import { ESSEX_COUNTY_JOBS } from "../src/municipal/cities/essex-county.js";
import { ORANGEVILLE_JOBS } from "../src/municipal/cities/orangeville.js";
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

/** Layers for the municipalities ranked 51 to 77 (sources/ontario-municipalities-51-75.json) and their counties. */
export const G6_LAYER_JOBS: readonly CityLayerJob[] = [...ESSEX_COUNTY_JOBS, ...BRANT_JOBS, ...ORANGEVILLE_JOBS];

export interface G6Imported {
  source_id: string;
  records: number;
  skipped: number;
  no_coordinate: number;
  duplicate_ids: number;
}

export async function importCitiesG6(repoRoot: string, only: readonly string[] = []): Promise<{ sources: G6Imported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: G6Imported[] = [];
  for (const job of G6_LAYER_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    const source = requireSource(registry, job.id);
    if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 municipal data`);
    const features = await cachedLayer(repoRoot, job.id, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
    const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
    const seen = new Set<string>();
    const stats: G6Imported = { source_id: source.id, records: 0, skipped: 0, no_coordinate: 0, duplicate_ids: 0 };
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
  await importCitiesG6(process.cwd(), process.argv.slice(2));
}
