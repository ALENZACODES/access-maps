import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import {
  arcFeature,
  mapOttawaParkFeature,
  mapOttawaParkParking,
  mapOttawaPublicWashroom,
  mapTorontoAccessibleStall,
  mapTorontoCommunityCentreWashroom,
  mapTorontoDrinkingFountain,
  mapTorontoLibraryBranch,
  mapTorontoParkFacility,
  mapTorontoPedestrianSegment,
  mapTorontoTrafficSignal,
} from "../src/municipal/city-open-data.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

/**
 * City of Ottawa parks inventory point layers that carry the City's ACCESSIBLE flag.
 * The English half of the service layer name is the stored category. Layer 14 (parking)
 * has its own source. Layer 5 is a joined table the service does not page, layer 7 has
 * no filled flag, and layers 8, 23 and 24 are not points; none of those are read here.
 */
export const OTTAWA_PARK_LAYERS: readonly { id: number; name: string; nameKeys?: readonly string[] }[] = [
  { id: 0, name: "Beaches" },
  { id: 1, name: "Ball Diamonds" },
  { id: 2, name: "Ball Diamonds School" },
  { id: 3, name: "Basketball Courts" },
  { id: 4, name: "Boat Launches" },
  { id: 9, name: "Lawn Bowling" },
  { id: 10, name: "Outdoor Pools" },
  { id: 11, name: "Outdoor Wading Pools" },
  { id: 12, name: "Other Park Features" },
  { id: 13, name: "Outdoor Rinks" },
  { id: 15, name: "Play Area - Structures" },
  { id: 16, name: "Skateboard Parks" },
  { id: 17, name: "Sledding Hills" },
  { id: 18, name: "Splash Pads" },
  { id: 19, name: "Sports Fields" },
  { id: 20, name: "Sports Fields on School Property" },
  { id: 21, name: "Tennis Courts" },
  { id: 22, name: "Volleyball Courts" },
  { id: 27, name: "Pickleball Courts" },
  // Bench NAME holds memorial dedications (names of people). It is not read.
  { id: 28, name: "Benches", nameKeys: [] },
];

type Loaded = { records: DataRecord[]; skipped: number };

export interface ImportedSource {
  source_id: string;
  records: number;
  /** Rows the mapper does not import, such as a building with no public washroom. */
  skipped: number;
  /** Mapped records left out because the source row has no usable coordinate. */
  no_coordinate: number;
  duplicate_ids: number;
}

interface Job {
  id: string;
  tranches: Tranche[];
  kind: "csv" | "arcgis";
  /** ArcGIS layer ids appended to the registry download_url. One empty string means the URL is the layer. */
  layers?: readonly string[];
  load: (cache: Buffer, ctx: Provenance) => Loaded;
}

function csvJob(id: string, tranches: Tranche[], map: (row: Record<string, string>, ctx: Provenance) => DataRecord | DataRecord[] | null): Job {
  return {
    id,
    tranches,
    kind: "csv",
    load: (cache, ctx) => {
      const records: DataRecord[] = [];
      let skipped = 0;
      for (const row of parseCsv(cache.toString("utf8")).rows) {
        const mapped = map(row, ctx);
        if (mapped === null) skipped += 1;
        else if (Array.isArray(mapped)) records.push(...mapped);
        else records.push(mapped);
      }
      return { records, skipped };
    },
  };
}

interface ArcCache {
  layers: { id: string; features: { attributes?: Record<string, unknown>; geometry?: { x?: unknown; y?: unknown } }[] }[];
}

function arcJob(
  id: string,
  tranches: Tranche[],
  layers: readonly string[],
  map: (feature: ReturnType<typeof arcFeature>, layerId: string, ctx: Provenance) => DataRecord | null,
): Job {
  return {
    id,
    tranches,
    kind: "arcgis",
    layers,
    load: (cache, ctx) => {
      const parsed = JSON.parse(cache.toString("utf8")) as ArcCache;
      const records: DataRecord[] = [];
      let skipped = 0;
      for (const layer of parsed.layers) {
        for (const raw of layer.features) {
          const mapped = map(arcFeature(raw), layer.id, ctx);
          if (mapped === null) skipped += 1;
          else records.push(mapped);
        }
      }
      return { records, skipped };
    },
  };
}

export const CITY_JOBS: readonly Job[] = [
  csvJob("toronto-accessible-parking-stalls", ["venue"], mapTorontoAccessibleStall),
  csvJob("toronto-traffic-signals", ["venue"], mapTorontoTrafficSignal),
  csvJob("toronto-library-branches", ["venue", "washroom"], mapTorontoLibraryBranch),
  csvJob("toronto-drinking-fountains", ["venue"], mapTorontoDrinkingFountain),
  csvJob("toronto-parks-recreation-facilities", ["venue"], mapTorontoParkFacility),
  csvJob("toronto-community-centre-washrooms", ["washroom"], mapTorontoCommunityCentreWashroom),
  csvJob("toronto-pedestrian-network", ["path"], mapTorontoPedestrianSegment),
  arcJob("ottawa-public-washrooms", ["washroom"], [""], (feature, _layer, ctx) => mapOttawaPublicWashroom(feature, ctx)),
  arcJob(
    "ottawa-parks-inventory",
    ["venue"],
    OTTAWA_PARK_LAYERS.map((layer) => String(layer.id)),
    (feature, layerId, ctx) => {
      const layer = OTTAWA_PARK_LAYERS.find((item) => String(item.id) === layerId);
      if (!layer) throw new Error(`ottawa-parks-inventory: layer ${layerId} is not in OTTAWA_PARK_LAYERS`);
      return mapOttawaParkFeature(feature, layer.id, layer.name, ctx, layer.nameKeys);
    },
  ),
  arcJob("ottawa-park-parking", ["venue"], [""], (feature, _layer, ctx) => mapOttawaParkParking(feature, ctx)),
];

export async function importCityOpenData(
  repoRoot: string,
  only: readonly string[] = [],
): Promise<{ sources: ImportedSource[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: ImportedSource[] = [];
  for (const job of CITY_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    const source = requireSource(registry, job.id);
    if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 municipal data`);
    const cache = await cached(repoRoot, job, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
    const ctx: Provenance = {
      source_id: source.id,
      licence: source.licence_id,
      retrieved_at: source.retrieved_at,
      tier: 0,
    };
    const loaded = job.load(cache, ctx);
    const seen = new Set<string>();
    let duplicateIds = 0;
    let noCell = 0;
    for (const record of loaded.records) {
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
    }
    sources.push({
      source_id: source.id,
      records: loaded.records.length - noCell,
      skipped: loaded.skipped,
      no_coordinate: noCell,
      duplicate_ids: duplicateIds,
    });
  }
  await writer.close();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

/** Reads `.cache/municipal/<id>.csv|json`, downloading from the registry URL when the file is absent. */
async function cached(repoRoot: string, job: Job, url: string): Promise<Buffer> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${job.id}.${job.kind === "csv" ? "csv" : "json"}`);
  if (existsSync(file)) return readFileSync(file);
  const body = job.kind === "csv" ? await fetchFile(url) : Buffer.from(JSON.stringify(await fetchLayers(url, job.layers ?? [""])));
  writeFileSync(file, body);
  return body;
}

async function fetchFile(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 32) throw new Error(`${url} returned ${body.length} bytes`);
  if (body[0] === 0x7b || body[0] === 0x3c) throw new Error(`${url} did not return a CSV file`);
  return body;
}

async function fetchLayers(base: string, layers: readonly string[]): Promise<ArcCache> {
  const out: ArcCache = { layers: [] };
  for (const layer of layers) {
    const endpoint = layer === "" ? base : `${base.replace(/\/$/, "")}/${layer}`;
    const features: ArcCache["layers"][number]["features"] = [];
    for (;;) {
      const query = new URL(`${endpoint}/query`);
      query.searchParams.set("where", "1=1");
      query.searchParams.set("outFields", "*");
      query.searchParams.set("returnGeometry", "true");
      query.searchParams.set("outSR", "4326");
      query.searchParams.set("orderByFields", "OBJECTID");
      query.searchParams.set("resultOffset", String(features.length));
      query.searchParams.set("resultRecordCount", "1000");
      query.searchParams.set("f", "json");
      const response = await fetch(query, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
      const body = (await response.json()) as {
        error?: { message?: string };
        features?: ArcCache["layers"][number]["features"];
        exceededTransferLimit?: boolean;
      };
      if (body.error) throw new Error(`${endpoint}: ${body.error.message ?? "service error"}`);
      const page = body.features ?? [];
      features.push(...page);
      if (page.length === 0 || body.exceededTransferLimit !== true) break;
    }
    if (features.length === 0) throw new Error(`${endpoint} returned no features`);
    out.layers.push({ id: layer, features });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importCityOpenData(process.cwd(), process.argv.slice(2));
}
