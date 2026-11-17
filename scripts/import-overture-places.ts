import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import { PerSourceRun } from "../src/failsafe/per-source.js";
import { boundaryFromGeoJson, type Boundary } from "../src/geo/boundary.js";
import { commitRecord, resetSourceDirs } from "../src/io/commit.js";
import type { Provenance } from "../src/model/provenance.js";
import {
  classifyLicences, duplicateKey, mapOverturePlace, OVERTURE_RELEASE, OVERTURE_SOURCES, prefers, rowExclusion,
  type ExclusionReason, type OverturePlaceRow, type OvertureSourceId,
} from "../src/overture/places.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

/**
 * Land Information Ontario "Province" layer (outer boundary of the Province
 * of Ontario, Open Government Licence – Ontario). It follows the
 * international and interprovincial boundaries through the Great Lakes and
 * rivers, so a place on a shoreline or an island is inside it.
 */
export const ONTARIO_BOUNDARY_URL =
  "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open03/MapServer/0/query?where=1%3D1&outFields=OFFICIAL_NAME,LOCATION_ACCURACY,GEOMETRY_UPDATE_DATETIME&outSR=4326&f=geojson";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

export interface OvertureSteps {
  read: number;
  point: number;
  in_ontario: number;
  permissive_licence: number;
  not_permanently_closed: number;
  at_or_above_confidence_floor: number;
  named: number;
  distinct: number;
}

export interface OverturePlan {
  /** Overture id to the registry source its record is written to. */
  keep: Map<string, OvertureSourceId>;
  steps: OvertureSteps;
  excluded: Partial<Record<ExclusionReason | "exact_duplicate", number>>;
  kept_by_source: Record<string, number>;
}

/** Paths of the cached extract (tools/overture/extract_places.py) and boundary. */
export function overtureCache(repoRoot: string, release = OVERTURE_RELEASE): { places: string; boundary: string } {
  return {
    places: path.join(repoRoot, ".cache", "overture", release, "places-bbox.ndjson.gz"),
    boundary: path.join(repoRoot, ".cache", "boundary", "ontario-province.geojson"),
  };
}

export async function* readRows(file: string): AsyncGenerator<OverturePlaceRow> {
  if (!existsSync(file)) throw new Error(`${file} is missing; run tools/overture/extract_places.py ${OVERTURE_RELEASE} first`);
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as OverturePlaceRow;
  }
}

/**
 * First pass: applies the filters in order (point geometry, Ontario boundary,
 * licence, operating status, confidence floor, name) and keeps one place per
 * exact duplicate group. Counts every step.
 */
export async function planOverture(file: string, boundary: Boundary): Promise<OverturePlan> {
  const steps: OvertureSteps = { read: 0, point: 0, in_ontario: 0, permissive_licence: 0, not_permanently_closed: 0, at_or_above_confidence_floor: 0, named: 0, distinct: 0 };
  const excluded: OverturePlan["excluded"] = {};
  const count = (reason: ExclusionReason | "exact_duplicate") => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  const best = new Map<string, { id: string; confidence: number; sourceId: OvertureSourceId }>();
  for await (const row of readRows(file)) {
    steps.read += 1;
    if (row.geometry_type && row.geometry_type.toUpperCase() !== "POINT") { count("not_a_point"); continue; }
    steps.point += 1;
    if (!boundary.contains(row.lon, row.lat)) { count("outside_ontario"); continue; }
    steps.in_ontario += 1;
    const licence = classifyLicences(row);
    if ("excluded" in licence) { count(licence.excluded); continue; }
    steps.permissive_licence += 1;
    const reason = rowExclusion(row);
    if (reason === "permanently_closed") { count(reason); continue; }
    steps.not_permanently_closed += 1;
    if (reason === "below_confidence_floor") { count(reason); continue; }
    steps.at_or_above_confidence_floor += 1;
    if (reason === "no_name") { count(reason); continue; }
    steps.named += 1;
    const key = duplicateKey(row);
    const candidate = { id: row.id, confidence: row.confidence as number, sourceId: licence.sourceId };
    const current = best.get(key);
    if (current) count("exact_duplicate");
    if (!current || prefers(candidate, current)) best.set(key, candidate);
  }
  const keep = new Map<string, OvertureSourceId>();
  const kept_by_source: Record<string, number> = {};
  for (const { id, sourceId } of best.values()) {
    keep.set(id, sourceId);
    kept_by_source[sourceId] = (kept_by_source[sourceId] ?? 0) + 1;
  }
  steps.distinct = keep.size;
  return { keep, steps, excluded, kept_by_source };
}

async function loadBoundary(file: string): Promise<Boundary> {
  if (!existsSync(file)) {
    const response = await fetch(ONTARIO_BOUNDARY_URL, { headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json, application/json" } });
    if (!response.ok) throw new Error(`Ontario boundary HTTP ${response.status}`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, await response.text());
  }
  return boundaryFromGeoJson(readFileSync(file, "utf8"));
}

export interface OvertureImported {
  source_id: string;
  records: number;
  quarantined: number;
}

export async function importOverturePlaces(repoRoot: string, only: readonly string[] = []): Promise<{ plan?: Omit<OverturePlan, "keep">; sources: OvertureImported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const cache = overtureCache(repoRoot);
  const run = new PerSourceRun("importOverturePlaces", path.join(repoRoot, "data"));
  // The plan is shared by the three sources. If it cannot be built (a missing
  // or cut-short extract), every source fails on its own and keeps its files.
  let planned: Promise<OverturePlan> | undefined;
  const plan = () => (planned ??= loadBoundary(cache.boundary).then((boundary) => planOverture(cache.places, boundary)));
  const sources: OvertureImported[] = [];
  for (const { id } of OVERTURE_SOURCES) {
    if (only.length > 0 && !only.includes(id)) continue;
    const imported = await run.source(id, ["venue"], async (writer) => {
      const source = requireSource(registry, id);
      if (source.tier !== 0) throw new Error(`${id} must be a tier 0 source`);
      const { keep } = await plan();
      resetSourceDirs(path.join(repoRoot, "data"), id, ["venue"]);
      const ctx: Provenance = { source_id: id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
      const stats: OvertureImported = { source_id: id, records: 0, quarantined: 0 };
      for await (const row of readRows(cache.places)) {
        if (keep.get(row.id) !== id) continue;
        if (await commitRecord(mapOverturePlace(row, ctx), id, writer, validators)) stats.records += 1;
        else stats.quarantined += 1;
      }
      return stats;
    });
    if (imported) sources.push(imported);
  }
  run.finish();
  const summary = planned ? await planned : undefined;
  const report = { plan: summary ? { steps: summary.steps, excluded: summary.excluded, kept_by_source: summary.kept_by_source } : undefined, sources };
  console.log(JSON.stringify(report));
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await importOverturePlaces(process.cwd(), process.argv.slice(2));
}
