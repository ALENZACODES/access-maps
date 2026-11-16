import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { mapBramptonCityParking, mapBramptonTrail } from "../src/municipal/cities/brampton.js";
import {
  mapHamiltonBusStopAmenity,
  mapHamiltonDrinkingFountain,
  mapHamiltonParkWashroom,
  mapHamiltonPedestrianFeature,
  mapHamiltonSidewalk,
  mapHamiltonTrail,
} from "../src/municipal/cities/hamilton.js";
import { mapMiltonParkAmenity, mapMiltonParkingLot, mapMiltonSidewalk, mapMiltonTrail } from "../src/municipal/cities/milton.js";
import {
  mapNiagaraFallsPlayground,
  mapNiagaraFallsSidewalk,
  mapNiagaraFallsTrail,
} from "../src/municipal/cities/niagara-falls.js";
import { mapOakvilleTownWashroom } from "../src/municipal/cities/oakville.js";
import { mapPeelTrail } from "../src/municipal/cities/peel-region.js";
import { mapWellandPublicWashroom, mapWellandTrail } from "../src/municipal/cities/welland.js";
import { geoFeature, type GeoFeature } from "../src/municipal/cities/west-gta-shared.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

interface Job {
  id: string;
  tranches: Tranche[];
  map: (feature: GeoFeature, ctx: Provenance) => DataRecord | null;
}

/**
 * One job per registry source. The registry download_url is the ArcGIS REST layer, which
 * is read with `f=geojson&outSR=4326`. Peel, Hamilton, Halton and Niagara municipalities.
 */
export const WEST_CITY_JOBS: readonly Job[] = [
  { id: "hamilton-park-washrooms", tranches: ["washroom"], map: mapHamiltonParkWashroom },
  { id: "hamilton-drinking-fountains", tranches: ["venue"], map: mapHamiltonDrinkingFountain },
  { id: "hamilton-bus-stop-amenities", tranches: ["venue"], map: mapHamiltonBusStopAmenity },
  { id: "hamilton-pedestrian-features", tranches: ["path"], map: mapHamiltonPedestrianFeature },
  { id: "hamilton-trails", tranches: ["path"], map: mapHamiltonTrail },
  { id: "hamilton-sidewalks", tranches: ["path"], map: mapHamiltonSidewalk },
  { id: "brampton-city-parking", tranches: ["venue"], map: mapBramptonCityParking },
  { id: "brampton-recreational-trails", tranches: ["path"], map: mapBramptonTrail },
  { id: "peel-trails", tranches: ["path"], map: mapPeelTrail },
  { id: "oakville-town-washrooms", tranches: ["washroom"], map: mapOakvilleTownWashroom },
  { id: "milton-parking-lots", tranches: ["venue"], map: mapMiltonParkingLot },
  { id: "milton-park-amenities", tranches: ["venue"], map: mapMiltonParkAmenity },
  { id: "milton-sidewalks", tranches: ["path"], map: mapMiltonSidewalk },
  { id: "milton-trails", tranches: ["path"], map: mapMiltonTrail },
  { id: "niagara-falls-sidewalks", tranches: ["path"], map: mapNiagaraFallsSidewalk },
  { id: "niagara-falls-trails", tranches: ["path"], map: mapNiagaraFallsTrail },
  { id: "niagara-falls-playgrounds", tranches: ["venue"], map: mapNiagaraFallsPlayground },
  { id: "welland-trails", tranches: ["path"], map: mapWellandTrail },
  { id: "welland-public-washrooms", tranches: ["washroom"], map: mapWellandPublicWashroom },
];

export interface ImportedSource {
  source_id: string;
  features: number;
  records: number;
  /** Features the mapper does not import, such as an on-road route in a trails layer. */
  skipped: number;
  /** Mapped records left out because the feature has no usable coordinate. */
  no_coordinate: number;
  duplicate_ids: number;
}

export async function importWestCities(repoRoot: string, only: readonly string[] = []): Promise<{ sources: ImportedSource[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: ImportedSource[] = [];
  for (const job of WEST_CITY_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    const source = requireSource(registry, job.id);
    if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 municipal data`);
    const features = await cached(repoRoot, job.id, source.download_url);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
    const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
    const seen = new Set<string>();
    let records = 0;
    let skipped = 0;
    let noCell = 0;
    let duplicateIds = 0;
    for (const raw of features) {
      const record = job.map(geoFeature(raw), ctx);
      if (record === null) {
        skipped += 1;
        continue;
      }
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
    sources.push({ source_id: source.id, features: features.length, records, skipped, no_coordinate: noCell, duplicate_ids: duplicateIds });
  }
  await writer.close();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

type RawFeature = { properties?: Record<string, unknown> | null; geometry?: unknown };

/** Reads `.cache/municipal/<id>.geojson`, downloading every page of the layer when the file is absent. */
async function cached(repoRoot: string, id: string, layerUrl: string): Promise<RawFeature[]> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.geojson`);
  if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { features: RawFeature[] }).features;
  const features = await fetchLayer(layerUrl.replace(/\/$/, ""));
  writeFileSync(file, JSON.stringify({ type: "FeatureCollection", features }));
  return features;
}

async function getJson(url: URL): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (response.status === 429 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      continue;
    }
    if (!response.ok) throw new Error(`${url.origin}${url.pathname} HTTP ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    if (body.error) throw new Error(`${url.origin}${url.pathname}: ${JSON.stringify(body.error)}`);
    return body;
  }
}

/** Pages through a layer by object id and checks the total against the layer's own count. */
async function fetchLayer(layer: string): Promise<RawFeature[]> {
  const info = await getJson(new URL(`${layer}?f=json`));
  const oidField =
    (info.objectIdField as string | undefined) ??
    ((info.fields as { name: string; type: string }[] | undefined) ?? []).find((field) => field.type === "esriFieldTypeOID")?.name ??
    "OBJECTID";
  const countUrl = new URL(`${layer}/query`);
  countUrl.searchParams.set("where", "1=1");
  countUrl.searchParams.set("returnCountOnly", "true");
  countUrl.searchParams.set("f", "json");
  const expected = Number((await getJson(countUrl)).count);
  const features: RawFeature[] = [];
  for (;;) {
    const query = new URL(`${layer}/query`);
    query.searchParams.set("where", "1=1");
    query.searchParams.set("outFields", "*");
    query.searchParams.set("returnGeometry", "true");
    query.searchParams.set("outSR", "4326");
    query.searchParams.set("orderByFields", oidField);
    query.searchParams.set("resultOffset", String(features.length));
    query.searchParams.set("resultRecordCount", "1000");
    query.searchParams.set("f", "geojson");
    const page = ((await getJson(query)).features as RawFeature[] | undefined) ?? [];
    features.push(...page);
    if (page.length === 0 || features.length >= expected) break;
  }
  if (features.length !== expected) throw new Error(`${layer} returned ${features.length} of ${expected} features`);
  if (features.length === 0) throw new Error(`${layer} returned no features`);
  return features;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importWestCities(process.cwd(), process.argv.slice(2));
}
