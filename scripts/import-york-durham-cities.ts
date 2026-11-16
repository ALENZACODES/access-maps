import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { findZipEntry, listZip, readZipText } from "../src/io/zip.js";
import { mapGtfsStop, wheelchairStopsFromRows } from "../src/gtfs/map.js";
import { GTFS_FEEDS } from "../src/gtfs/feeds.js";
import { YORK_DURHAM_GTFS_FEED_IDS, YORK_DURHAM_JOBS } from "../src/municipal/cities/york-durham-jobs.js";
import { cityFeature, type RawArcFeature } from "../src/municipal/cities/york-durham-shared.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";
const ID_CHUNK = 100;

export interface ImportedCitySource {
  source_id: string;
  records: number;
  /** Rows the mapper does not import, such as a trail the publisher marks as not public. */
  skipped: number;
  /** Mapped records left out because the source row has no usable coordinate. */
  no_coordinate: number;
  duplicate_ids: number;
  /** Line features the publisher drew in more than one part. Each part is stored as its own record. */
  multipart_lines: number;
}

/**
 * Imports the York Region and Durham Region municipal layers listed in YORK_DURHAM_JOBS and
 * the GTFS feeds named in YORK_DURHAM_GTFS_FEED_IDS. Each layer is read from the ArcGIS REST layer in
 * the registry download_url and cached in `.cache/municipal/<id>.json`.
 */
export async function importYorkDurhamCities(
  repoRoot: string,
  only: readonly string[] = [],
): Promise<{ sources: ImportedCitySource[]; gtfs: { source_id: string; stops: number; skipped: number }[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: ImportedCitySource[] = [];
  for (const job of YORK_DURHAM_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    const source = requireSource(registry, job.id);
    if (source.kind !== "municipal" || source.tier !== job.tier) {
      throw new Error(`${job.id} must be tier ${job.tier} municipal data`);
    }
    const features = await cachedLayer(repoRoot, job.id, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
    const ctx: Provenance = {
      source_id: source.id,
      licence: source.licence_id,
      retrieved_at: source.retrieved_at,
      tier: source.tier,
    };
    const seen = new Set<string>();
    let records = 0;
    let skipped = 0;
    let noCell = 0;
    let duplicateIds = 0;
    let multipart = 0;
    for (const raw of features) {
      const feature = cityFeature(raw);
      const mapped = job.map(feature, ctx);
      if (mapped === null) {
        skipped += 1;
        continue;
      }
      if (feature.lines.length > 1) multipart += 1;
      for (const record of Array.isArray(mapped) ? mapped : [mapped]) {
        // A record with no usable coordinate has no 0.5-degree cell to be stored in.
        if (record.region === "unknown") {
          noCell += 1;
          continue;
        }
        let next = record;
        if (!acceptId(seen, next.id)) {
          duplicateIds += 1;
          let suffix = 2;
          while (!acceptId(seen, `${record.id}#${suffix}`)) suffix += 1;
          next = { ...record, id: `${record.id}#${suffix}` };
        }
        await commitRecord(next, source.id, writer, validators);
        records += 1;
      }
    }
    sources.push({
      source_id: source.id,
      records,
      skipped,
      no_coordinate: noCell,
      duplicate_ids: duplicateIds,
      multipart_lines: multipart,
    });
  }
  const gtfs: { source_id: string; stops: number; skipped: number }[] = [];
  for (const feed of GTFS_FEEDS.filter((item) => YORK_DURHAM_GTFS_FEED_IDS.includes(item.id))) {
    if (only.length > 0 && !only.includes(feed.id)) continue;
    const source = requireSource(registry, feed.id);
    if (source.kind !== "gtfs" || source.tier !== 1) throw new Error(`${feed.id} must be a tier 1 gtfs source`);
    const zipPath = path.join(repoRoot, feed.file);
    if (!existsSync(zipPath)) {
      mkdirSync(path.dirname(zipPath), { recursive: true });
      writeFileSync(zipPath, await fetchBinary(source.download_url));
    }
    const stopsEntry = findZipEntry(listZip(zipPath), "stops.txt");
    if (!stopsEntry) throw new Error(`${feed.id} has no stops.txt`);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, ["transit", "path"]);
    const ctx: Provenance = {
      source_id: source.id,
      licence: source.licence_id,
      retrieved_at: source.retrieved_at,
      tier: source.tier,
    };
    const rows = parseCsv(readZipText(zipPath, stopsEntry)).rows;
    const wheelchairStops = wheelchairStopsFromRows(rows);
    const seen = new Set<string>();
    let stops = 0;
    let skipped = 0;
    for (const row of rows) {
      const record = mapGtfsStop(row, new Map(), ctx, source.id, wheelchairStops);
      if (!record || !acceptId(seen, record.id)) {
        skipped += 1;
        continue;
      }
      await commitRecord(record, source.id, writer, validators);
      stops += 1;
    }
    gtfs.push({ source_id: source.id, stops, skipped });
  }
  await writer.close();
  console.log(JSON.stringify({ sources, gtfs }));
  return { sources, gtfs };
}

async function cachedLayer(repoRoot: string, id: string, url: string): Promise<RawArcFeature[]> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.json`);
  if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { features: RawArcFeature[] }).features;
  const features = await fetchLayer(url);
  writeFileSync(file, JSON.stringify({ url, features }));
  return features;
}

async function fetchJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url.origin}${url.pathname} HTTP ${response.status}`);
  const body = (await response.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (body.error) throw new Error(`${url.origin}${url.pathname}: ${body.error.message ?? "service error"}`);
  return body;
}

async function fetchBinary(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Reads every feature of one layer: the object id list first, then the features in id chunks. */
async function fetchLayer(layer: string): Promise<RawArcFeature[]> {
  const endpoint = layer.replace(/\/$/, "");
  const idQuery = new URL(`${endpoint}/query`);
  idQuery.searchParams.set("where", "1=1");
  idQuery.searchParams.set("returnIdsOnly", "true");
  idQuery.searchParams.set("f", "json");
  const idBody = await fetchJson(idQuery);
  const ids = [...((idBody.objectIds as number[] | null) ?? [])].sort((a, b) => a - b);
  if (ids.length === 0) throw new Error(`${endpoint} returned no object ids`);
  const features: RawArcFeature[] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const query = new URL(`${endpoint}/query`);
    query.searchParams.set("objectIds", ids.slice(start, start + ID_CHUNK).join(","));
    query.searchParams.set("outFields", "*");
    query.searchParams.set("returnGeometry", "true");
    query.searchParams.set("outSR", "4326");
    query.searchParams.set("f", "json");
    const body = await fetchJson(query);
    features.push(...((body.features as RawArcFeature[] | undefined) ?? []));
  }
  if (features.length !== ids.length) {
    throw new Error(`${endpoint} returned ${features.length} features for ${ids.length} object ids`);
  }
  return features;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importYorkDurhamCities(process.cwd(), process.argv.slice(2));
}
