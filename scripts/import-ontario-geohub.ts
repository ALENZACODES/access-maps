import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { PerSourceRun } from "../src/failsafe/per-source.js";
import {
  AIRPORT_FIELDS,
  arcAnchor,
  FISHING_FIELDS,
  mapFishingAccessPoint,
  mapMohServiceLocation,
  mapOfficialAirport,
  mapOtnAccessPoint,
  mapProvincialPark,
  mapRailwayStation,
  MOH_FIELDS,
  OTN_FIELDS,
  PARK_FIELDS,
  STATION_FIELDS,
  type GeohubFeature,
} from "../src/provincial/ontario-geohub.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

/**
 * Province of Ontario place layers from Land Information Ontario map services. The
 * registry download_url is the layer URL. Each job names the columns it requests; no
 * other column is downloaded. Polygon outlines are reduced to their map anchor as each
 * page arrives, so the cache holds attributes and one point per feature.
 */
export interface GeohubJob {
  id: string;
  fields: readonly string[];
  /** Features per request. Polygon layers use small pages because outlines are large. */
  pageSize: number;
  map: (feature: GeohubFeature, ctx: Provenance) => DataRecord | null;
}

export const GEOHUB_JOBS: readonly GeohubJob[] = [
  { id: "ontario-moh-service-locations", fields: MOH_FIELDS, pageSize: 1000, map: mapMohServiceLocation },
  { id: "ontario-fishing-access-points", fields: FISHING_FIELDS, pageSize: 1000, map: mapFishingAccessPoint },
  { id: "ontario-provincial-parks", fields: PARK_FIELDS, pageSize: 10, map: mapProvincialPark },
  { id: "ontario-official-airports", fields: AIRPORT_FIELDS, pageSize: 100, map: mapOfficialAirport },
  { id: "ontario-otn-access-points", fields: OTN_FIELDS, pageSize: 1000, map: mapOtnAccessPoint },
  { id: "ontario-railway-stations", fields: STATION_FIELDS, pageSize: 1000, map: mapRailwayStation },
];

export interface GeohubImported {
  source_id: string;
  fetched: number;
  records: number;
  skipped: number;
  no_geometry: number;
}

const TRANCHES: readonly Tranche[] = ["venue"];

export async function importOntarioGeohub(repoRoot: string, only: readonly string[] = [], jobs: readonly GeohubJob[] = GEOHUB_JOBS): Promise<{ sources: GeohubImported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const run = new PerSourceRun("importOntarioGeohub", path.join(repoRoot, "data"));
  const sources: GeohubImported[] = [];
  for (const job of jobs) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    // Each source has its own writer: one that fails keeps its last known-good files and the others are still written.
    const imported = await run.source(job.id, TRANCHES, async (writer) => {
      const source = requireSource(registry, job.id);
      if (source.kind !== "provincial" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 provincial data`);
      const features = await cachedLayer(repoRoot, job, source.download_url);
      resetSourceDirs(path.join(repoRoot, "data"), source.id, TRANCHES);
      const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
      const stats: GeohubImported = { source_id: source.id, fetched: features.length, records: 0, skipped: 0, no_geometry: 0 };
      const seen = new Set<string>();
      for (const feature of features) {
        const record = job.map(feature, ctx);
        if (record === null) {
          stats.skipped += 1;
          continue;
        }
        // A record with no usable geometry has no 0.5-degree cell to be stored in.
        if (record.region === "unknown") {
          stats.no_geometry += 1;
          continue;
        }
        if (seen.has(record.id)) throw new Error(`${job.id} repeats id ${record.id}`);
        seen.add(record.id);
        if (await commitRecord(record, source.id, writer, validators)) stats.records += 1;
      }
      return stats;
    });
    if (imported) sources.push(imported);
  }
  run.finish();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

/** Reads `.cache/provincial/<id>.json`, downloading the layer when the file is absent. */
async function cachedLayer(repoRoot: string, job: GeohubJob, url: string): Promise<GeohubFeature[]> {
  const directory = path.join(repoRoot, ".cache", "provincial");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${job.id}.json`);
  if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { features: GeohubFeature[] }).features;
  const features = await fetchLayer(url, job);
  writeFileSync(file, JSON.stringify({ features }));
  return features;
}

async function getJson(url: URL): Promise<Record<string, unknown>> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!response.ok) throw new Error(`${url.origin}${url.pathname} HTTP ${response.status}`);
      const body = (await response.json()) as Record<string, unknown> & { error?: { message?: string } };
      if (body.error) throw new Error(`${url.origin}${url.pathname}: ${body.error.message ?? "service error"}`);
      return body;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}

/** Pages through a layer by OBJECTID order and checks the total against the layer's own count. */
async function fetchLayer(layerUrl: string, job: GeohubJob): Promise<GeohubFeature[]> {
  const endpoint = `${layerUrl.replace(/\/$/, "")}/query`;
  const countUrl = new URL(endpoint);
  countUrl.searchParams.set("where", "1=1");
  countUrl.searchParams.set("returnCountOnly", "true");
  countUrl.searchParams.set("f", "json");
  const expected = Number((await getJson(countUrl)).count);
  if (!Number.isInteger(expected) || expected <= 0) throw new Error(`${layerUrl} returned no count`);
  const features: GeohubFeature[] = [];
  const objectIds = new Set<string>();
  while (features.length < expected) {
    const query = new URL(endpoint);
    query.searchParams.set("where", "1=1");
    query.searchParams.set("outFields", ["OBJECTID", ...job.fields].join(","));
    query.searchParams.set("returnGeometry", "true");
    query.searchParams.set("outSR", "4326");
    query.searchParams.set("geometryPrecision", "6");
    query.searchParams.set("orderByFields", "OBJECTID");
    query.searchParams.set("resultOffset", String(features.length));
    query.searchParams.set("resultRecordCount", String(job.pageSize));
    query.searchParams.set("f", "json");
    const page = ((await getJson(query)).features ?? []) as Array<{ attributes?: Record<string, unknown>; geometry?: { x?: unknown; y?: unknown; rings?: unknown } }>;
    if (page.length === 0) break;
    for (const raw of page) {
      const attributes: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw.attributes ?? {})) attributes[key] = value === null || value === undefined ? "" : String(value);
      objectIds.add(attributes.OBJECTID ?? "");
      features.push({ attributes, anchor: arcAnchor(raw.geometry) });
    }
  }
  if (features.length !== expected) throw new Error(`${layerUrl} returned ${features.length} of ${expected} features`);
  if (objectIds.size !== features.length) throw new Error(`${layerUrl} returned repeated OBJECTID values`);
  return features;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importOntarioGeohub(process.cwd(), process.argv.slice(2));
}
