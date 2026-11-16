import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { mapCambridgePlayStructure } from "../src/municipal/cities/cambridge.js";
import { cityFeature, type CityFeature } from "../src/municipal/cities/g3-shared.js";
import { mapLambtonAccessibleFacility, LAMBTON_FEATURE_COLUMNS, LAMBTON_WASHROOM_COLUMNS } from "../src/municipal/cities/lambton.js";
import { mapGuelphParkingLot, mapGuelphRestroom, mapGuelphSidewalk, mapGuelphTrail } from "../src/municipal/cities/guelph.js";
import {
  mapKitchenerAccessibleParking,
  mapKitchenerParkingLot,
  mapKitchenerPathSegment,
  mapKitchenerPlayground,
  mapKitchenerPlaygroundEquipment,
  mapKitchenerWashroom,
} from "../src/municipal/cities/kitchener.js";
import { mapWaterlooParkingLot, mapWaterlooPathSegment, mapWaterlooPlayground } from "../src/municipal/cities/waterloo.js";
import {
  mapWindsorBusStop,
  mapWindsorDrinkingFountain,
  mapWindsorParkWashroom,
  mapWindsorPlayground,
  mapWindsorSidewalk,
  mapWindsorTrail,
} from "../src/municipal/cities/windsor.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

/**
 * Importer for the Kitchener, Waterloo, Cambridge, Guelph, Windsor and County of Lambton
 * open-data layers.
 * Each layer job names the columns it requests; no other column is downloaded. The
 * registry download_url is the layer URL. The Guelph Transit and Transit Windsor GTFS
 * feeds are listed in src/gtfs/feeds.ts and imported by scripts/import-gtfs.ts.
 */
export interface LayerJob {
  id: string;
  tranche: Tranche;
  /** Set when a job also writes a second tranche, such as a washroom record beside a venue. */
  alsoWrites?: readonly Tranche[];
  /** Columns requested from the service. OBJECTID is always requested. */
  fields: readonly string[];
  map: (feature: CityFeature, ctx: Provenance) => DataRecord | DataRecord[] | null;
}

export const G3_LAYER_JOBS: readonly LayerJob[] = [
  {
    id: "kitchener-public-washrooms",
    tranche: "washroom",
    fields: ["LANDMARK", "CATEGORY", "SUBCATEGORY", "CIVIC_NO", "STREET", "STATUS", "COMMON_LOCATION_REFERENCE", "HOURS_OF_OPERATION"],
    map: mapKitchenerWashroom,
  },
  {
    id: "kitchener-parking-lots",
    tranche: "venue",
    fields: ["PARKINGFACILITYID", "PARKING_FACILITY", "SUBCATEGORY", "CIVIC_NO", "STREET", "PARKING_ACCESS", "HOURS", "DAYS", "STATUS", "ACCESSIBLE_SPACES", "PARKING_URL"],
    map: mapKitchenerParkingLot,
  },
  {
    id: "kitchener-accessible-parking",
    tranche: "venue",
    fields: ["CATEGORY", "SUBCATEGORY", "STATUS", "PARKINGFEATUREID", "LOCATION_DESCRIPTION"],
    map: mapKitchenerAccessibleParking,
  },
  {
    id: "kitchener-playgrounds",
    tranche: "venue",
    fields: ["LANDMARKID", "LANDMARK", "CIVIC_NO", "STREET", "CATEGORY", "STATUS", "AODA_COMPLIANT", "RESILIENT_SURFACE_MATERIAL"],
    map: mapKitchenerPlayground,
  },
  {
    id: "kitchener-playground-equipment",
    tranche: "venue",
    fields: ["LANDMARKID", "NAME", "CATEGORY", "ACCESSIBLE", "MEMORIAL", "STATUS"],
    map: mapKitchenerPlaygroundEquipment,
  },
  {
    id: "kitchener-sidewalks",
    tranche: "path",
    fields: ["STATUS", "CATEGORY", "SUBCATEGORY", "FEATURE_TYPE", "SURFACE_MATERIAL", "WIDTH_M", "GRADE", "RAILING", "CURBCUT"],
    map: (feature, ctx) => mapKitchenerPathSegment(feature, ctx),
  },
  {
    id: "kitchener-trails",
    tranche: "path",
    fields: ["STATUS", "CATEGORY", "SUBCATEGORY", "FEATURE_TYPE", "SURFACE_MATERIAL", "WIDTH_M", "GRADE", "RAILING", "CURBCUT"],
    map: (feature, ctx) => mapKitchenerPathSegment(feature, ctx),
  },
  {
    id: "kitchener-crosswalks",
    tranche: "path",
    fields: ["STATUS", "CATEGORY", "SUBCATEGORY", "FEATURE_TYPE", "SURFACE_MATERIAL"],
    map: (feature, ctx) => mapKitchenerPathSegment(feature, ctx, true),
  },
  {
    id: "waterloo-parking-lots",
    tranche: "venue",
    fields: ["NAME", "ADDRESS", "CLASS", "SURFACE", "ACCESSIBLE"],
    map: mapWaterlooParkingLot,
  },
  {
    id: "waterloo-playgrounds",
    tranche: "venue",
    fields: ["ASSET_ID", "PLAYGROUND_NAME", "LIFECYCLESTATUS", "SURFACE_TYPE"],
    map: mapWaterlooPlayground,
  },
  {
    id: "waterloo-sidewalks",
    tranche: "path",
    fields: ["STATUS", "PATH_TYPE", "SURFACE", "LENGTH_M"],
    map: (feature, ctx) => mapWaterlooPathSegment(feature, ctx, "STATUS"),
  },
  {
    id: "waterloo-trails",
    tranche: "path",
    fields: ["LIFECYCLESTATUS", "PATH_TYPE", "SURFACE", "LENGTH_M"],
    map: (feature, ctx) => mapWaterlooPathSegment(feature, ctx, "LIFECYCLESTATUS"),
  },
  {
    id: "cambridge-play-structures",
    tranche: "venue",
    fields: ["ASSET_ID", "STREET_NUMBER", "STREET_NAME", "PARK_NAME", "PLAY_STRUCTURE_TYPE"],
    map: mapCambridgePlayStructure,
  },
  {
    id: "guelph-restrooms",
    tranche: "washroom",
    fields: ["RestroomType", "ParkName", "LocationDescription", "Status"],
    map: mapGuelphRestroom,
  },
  {
    id: "guelph-parking-lots",
    tranche: "venue",
    fields: ["LOTID", "LOTNAME", "LOCATION", "STATUS", "PARKINGTYPE", "ACCESSIBLESPACES", "WEBSITELINK"],
    map: mapGuelphParkingLot,
  },
  {
    id: "guelph-sidewalks",
    tranche: "path",
    fields: ["STATUS", "SURFTYPE", "WIDTH"],
    map: mapGuelphSidewalk,
  },
  {
    id: "guelph-trails",
    tranche: "path",
    fields: ["Surface_Type"],
    map: mapGuelphTrail,
  },
  {
    id: "windsor-park-washrooms",
    tranche: "washroom",
    fields: ["park_name", "park_address"],
    map: mapWindsorParkWashroom,
  },
  {
    id: "windsor-playgrounds",
    tranche: "venue",
    fields: ["gisid", "park_name", "asset_description"],
    map: mapWindsorPlayground,
  },
  {
    id: "windsor-drinking-fountains",
    tranche: "venue",
    fields: ["gisid", "park_name"],
    map: mapWindsorDrinkingFountain,
  },
  {
    id: "windsor-bus-stops",
    tranche: "venue",
    fields: ["on_street", "at_street", "landing_type", "has_full_access", "public_id"],
    map: mapWindsorBusStop,
  },
  {
    id: "windsor-sidewalks",
    tranche: "path",
    fields: ["sidewalk_type", "sidewalk_width", "surface_type", "service_status"],
    map: mapWindsorSidewalk,
  },
  {
    id: "windsor-paths-trails",
    tranche: "path",
    fields: ["trail_type", "trail_width", "surface_material_type", "status", "is_all_ages_and_abilities"],
    map: mapWindsorTrail,
  },
  {
    id: "lambton-accessible-facilities",
    tranche: "venue",
    alsoWrites: ["washroom"],
    fields: ["Facility", "Address", "City", "Desc_", "Facility_ID", ...LAMBTON_FEATURE_COLUMNS, ...LAMBTON_WASHROOM_COLUMNS],
    map: mapLambtonAccessibleFacility,
  },
];

export interface ImportedSource {
  source_id: string;
  /** Features the service returned. */
  fetched: number;
  records: number;
  /** Features the mapper does not import, such as a row that is not active. */
  skipped: number;
  /** Mapped records left out because the feature has no usable geometry in Ontario. */
  no_geometry: number;
}

type RawFeature = Parameters<typeof cityFeature>[0];

export async function importCitiesG3(repoRoot: string, only: readonly string[] = []): Promise<{ sources: ImportedSource[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: ImportedSource[] = [];
  for (const job of G3_LAYER_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    const source = requireSource(registry, job.id);
    if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 municipal data`);
    const features = await cachedLayer(repoRoot, job, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, [job.tranche, ...(job.alsoWrites ?? [])]);
    const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
    const seen = new Set<string>();
    let skipped = 0;
    let noGeometry = 0;
    let records = 0;
    for (const raw of features) {
      const mapped = job.map(cityFeature(raw), ctx);
      if (mapped === null) {
        skipped += 1;
        continue;
      }
      for (const record of Array.isArray(mapped) ? mapped : [mapped]) {
        // A record with no usable geometry has no 0.5-degree cell to be stored in.
        if (record.region === "unknown") {
          noGeometry += 1;
          continue;
        }
        if (!acceptId(seen, record.id)) throw new Error(`${job.id}: duplicate id ${record.id}`);
        await commitRecord(record, source.id, writer, validators);
        records += 1;
      }
    }
    sources.push({ source_id: source.id, fetched: features.length, records, skipped, no_geometry: noGeometry });
  }
  await writer.close();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

/** Reads `.cache/municipal/<id>.json`, downloading every feature of the layer when the file is absent. */
async function cachedLayer(repoRoot: string, job: LayerJob, url: string): Promise<RawFeature[]> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${job.id}.json`);
  if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { features: RawFeature[] }).features;
  const features = await fetchLayer(url, job.fields);
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

/**
 * Pages through a layer with resultOffset and checks the number of features against the
 * layer's own count, so a short page or a silent transfer limit fails the import.
 */
async function fetchLayer(layerUrl: string, fields: readonly string[]): Promise<RawFeature[]> {
  const endpoint = `${layerUrl.replace(/\/$/, "")}/query`;
  const countUrl = new URL(endpoint);
  countUrl.searchParams.set("where", "1=1");
  countUrl.searchParams.set("returnCountOnly", "true");
  countUrl.searchParams.set("f", "json");
  const expected = Number((await getJson(countUrl)).count);
  if (!Number.isInteger(expected) || expected <= 0) throw new Error(`${layerUrl} returned no count`);
  const features: RawFeature[] = [];
  const pageSize = 1000;
  while (features.length < expected) {
    const query = new URL(endpoint);
    query.searchParams.set("where", "1=1");
    query.searchParams.set("outFields", ["OBJECTID", ...fields].join(","));
    query.searchParams.set("returnGeometry", "true");
    query.searchParams.set("outSR", "4326");
    query.searchParams.set("geometryPrecision", "6");
    query.searchParams.set("orderByFields", "OBJECTID");
    query.searchParams.set("resultOffset", String(features.length));
    query.searchParams.set("resultRecordCount", String(pageSize));
    query.searchParams.set("f", "json");
    const page = ((await getJson(query)).features ?? []) as RawFeature[];
    if (page.length === 0) break;
    features.push(...page);
  }
  if (features.length !== expected) throw new Error(`${layerUrl} returned ${features.length} of ${expected} features`);
  const ids = new Set(features.map((feature) => String(feature.attributes?.OBJECTID)));
  if (ids.size !== features.length) throw new Error(`${layerUrl} returned repeated OBJECTID values`);
  return features;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importCitiesG3(process.cwd(), process.argv.slice(2));
}
