import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { PerSourceRun } from "../src/failsafe/per-source.js";
import type { RawFeature } from "../src/municipal/cities/g4-helpers.js";
import type { G7LayerJob } from "../src/municipal/cities/g7-helpers.js";
import { GREY_COUNTY_JOBS } from "../src/municipal/cities/grey-county.js";
import { HASTINGS_COUNTY_JOBS } from "../src/municipal/cities/hastings-county.js";
import { HURON_COUNTY_JOBS } from "../src/municipal/cities/huron-county.js";
import { CENTRAL_LAKE_ONTARIO_CONSERVATION_JOBS } from "../src/municipal/cities/central-lake-ontario-conservation.js";
import { LAKE_SIMCOE_CONSERVATION_JOBS } from "../src/municipal/cities/lake-simcoe-conservation.js";
import { LEEDS_GRENVILLE_JOBS } from "../src/municipal/cities/leeds-grenville.js";
import { LENNOX_ADDINGTON_JOBS } from "../src/municipal/cities/lennox-addington.js";
import { NIAGARA_PENINSULA_CONSERVATION_JOBS } from "../src/municipal/cities/niagara-peninsula-conservation.js";
import { QUINTE_CONSERVATION_JOBS } from "../src/municipal/cities/quinte-conservation.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

/**
 * Importer for the small-town sweep: county, district and other upper-tier layers that
 * cover the municipalities listed in sources/ontario-municipalities-remaining.json. The
 * registry download_url is the layer URL. Each job names the only columns requested.
 */
export const G7_LAYER_JOBS: readonly G7LayerJob[] = [...HURON_COUNTY_JOBS, ...HASTINGS_COUNTY_JOBS, ...LEEDS_GRENVILLE_JOBS, ...GREY_COUNTY_JOBS, ...LENNOX_ADDINGTON_JOBS, ...QUINTE_CONSERVATION_JOBS, ...NIAGARA_PENINSULA_CONSERVATION_JOBS,
  ...LAKE_SIMCOE_CONSERVATION_JOBS,
  ...CENTRAL_LAKE_ONTARIO_CONSERVATION_JOBS,
];

export interface G7Imported {
  source_id: string;
  records: number;
  skipped: number;
  no_coordinate: number;
  duplicate_ids: number;
}

export async function importCitiesG7(
  repoRoot: string,
  only: readonly string[] = [],
  jobs: readonly G7LayerJob[] = G7_LAYER_JOBS,
): Promise<{ sources: G7Imported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const run = new PerSourceRun("importCitiesG7", path.join(repoRoot, "data"));
  const sources: G7Imported[] = [];
  for (const job of jobs) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    // Each source has its own writer: one that fails keeps its last known-good files and the others are still written.
    const imported = await run.source(job.id, job.tranches, async (writer) => {
      const source = requireSource(registry, job.id);
      if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 municipal data`);
      const features = await cachedLayer(repoRoot, job.id, source.download_url, job.fields);
      if (job.order) {
        const key = job.order;
        features.sort((a, b) => Number(a.attributes?.[key]) - Number(b.attributes?.[key]));
      }
      resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
      const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
      const seen = new Set<string>();
      const stats: G7Imported = { source_id: source.id, records: 0, skipped: 0, no_coordinate: 0, duplicate_ids: 0 };
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
          // An id seen twice in one source is a duplicate row in the published layer: it is not imported twice.
          if (!acceptId(seen, record.id)) {
            stats.duplicate_ids += 1;
            continue;
          }
          await commitRecord(record, source.id, writer, validators);
          stats.records += 1;
        }
      }
      return stats;
    });
    if (imported) sources.push(imported);
  }
  run.finish();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

/** Reads `.cache/municipal/<id>.json`, querying the layer when the file is absent. */
async function cachedLayer(repoRoot: string, id: string, url: string, fields: readonly string[]): Promise<RawFeature[]> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.json`);
  if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { features: RawFeature[] }).features;
  const features = await fetchLayer(url, fields);
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
async function fetchLayer(layer: string, fields: readonly string[]): Promise<RawFeature[]> {
  const base = layer.replace(/\/$/, "");
  const ids = new URL(`${base}/query`);
  ids.searchParams.set("where", "1=1");
  ids.searchParams.set("returnIdsOnly", "true");
  ids.searchParams.set("f", "json");
  const listed = await getJson(ids);
  const objectIds = [...((listed.objectIds as number[] | null) ?? [])].sort((a, b) => a - b);
  if (objectIds.length === 0) throw new Error(`${base} returned no features`);
  const outFields = [...new Set(fields)].join(",");
  const features: RawFeature[] = [];
  for (let start = 0; start < objectIds.length; start += 200) {
    const response = await fetch(`${base}/query`, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        objectIds: objectIds.slice(start, start + 200).join(","),
        outFields,
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
  await importCitiesG7(process.cwd(), process.argv.slice(2));
}
