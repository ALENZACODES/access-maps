import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createReadStream } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { isAccessibilityField } from "../src/count/accessibility.js";
import { isPiece } from "../src/model/provenance.js";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../src/model/records.js";
import { buildPmtiles, MAX_TILE_FILE_BYTES, TILE_FILE_PATTERN, TileSizeError, type ArchiveOptions, type MapFeature } from "../src/tiles/build.js";
import { holdReason } from "../src/pack/build.js";
import { readRegistry } from "../src/registry.js";
import { writeFileAtomic } from "../src/failsafe/files.js";
import { checkRecord } from "../src/failsafe/record-check.js";
import { failsafeLog } from "../src/failsafe/report.js";

const FAMILIES = ["odbl", "other"] as const;

/** GO Transit and UP Express stay out of the mixed open overlay so those files can be removed quickly. */
export const TILES_HELD_FOR_LEGAL_REVIEW = new Set([
  "metrolinx-go",
  "metrolinx-up",
]);

export async function buildOfflineTiles(repoRoot: string, includePaths = true, limit = MAX_TILE_FILE_BYTES): Promise<string[]> {
  const excluded = excludedSources(repoRoot);
  const features = await collect(path.join(repoRoot, "data"), includePaths, excluded);
  const written: string[] = [];
  for (const family of FAMILIES) {
    const group = features.filter((feature) => feature.licenceFamily === family);
    if (group.length === 0) continue;
    const directory = path.join(repoRoot, "data", "tiles", family === "odbl" ? "odbl" : "open");
    mkdirSync(directory, { recursive: true });
    // Every archive of the family is built before any file is written, so a
    // failed build leaves the previous files as they were.
    const archives = splitToFit(group, archiveOptions(family), limit);
    const names = new Set<string>();
    for (const { label, archive, features: count } of archives) {
      const name = label ? `places-${label}.pmtiles` : "places.pmtiles";
      const file = path.join(directory, name);
      writeFileAtomic(file, archive);
      names.add(name);
      written.push(path.relative(repoRoot, file));
      console.log(JSON.stringify({ file: path.relative(repoRoot, file), bytes: archive.length, features: count }));
    }
    // Files from an earlier split that this build did not write would list stale places.
    for (const name of readdirSync(directory)) {
      if (TILE_FILE_PATTERN.test(name) && !names.has(name)) rmSync(path.join(directory, name));
    }
  }
  return written;
}

export interface SplitArchive {
  /** "" for one file per family, else a band such as n43 or n43-w080. */
  label: string;
  archive: Buffer;
  features: number;
}

/**
 * Builds one archive for the features, or, when it would reach the 25 MiB
 * file limit, one per 1-degree latitude band (places-n43), and a band that is
 * still too large one per 1-degree longitude band inside it (places-n43-w080).
 * Bands are cut on the feature's point (the first vertex of a path), so every
 * feature is in exactly one file. Throws rather than write a file over the limit.
 */
export function splitToFit(features: MapFeature[], options: ArchiveOptions, limit = MAX_TILE_FILE_BYTES): SplitArchive[] {
  const whole = tryBuild(features, options, limit);
  if (whole) return [{ label: "", archive: whole, features: features.length }];
  const out: SplitArchive[] = [];
  for (const [lat, band] of groupBy(features, latBand)) {
    const archive = tryBuild(band, options, limit);
    if (archive) {
      out.push({ label: lat, archive, features: band.length });
      continue;
    }
    for (const [lon, cell] of groupBy(band, lonBand)) {
      const piece = tryBuild(cell, options, limit);
      if (!piece) throw new Error(`tiles for ${lat}-${lon} (${cell.length} features) are still over the ${limit} byte limit`);
      out.push({ label: `${lat}-${lon}`, archive: piece, features: cell.length });
    }
  }
  return out;
}

function tryBuild(features: MapFeature[], options: ArchiveOptions, limit: number): Buffer | null {
  try {
    const archive = buildPmtiles(features, options);
    return archive.length < limit ? archive : null;
  } catch (error) {
    if (error instanceof TileSizeError) return null;
    throw error;
  }
}

const latBand = (feature: MapFeature) => `n${String(Math.max(0, Math.floor(feature.lat))).padStart(2, "0")}`;
const lonBand = (feature: MapFeature) => `w${String(Math.max(0, Math.ceil(-feature.lon))).padStart(3, "0")}`;

function groupBy(features: MapFeature[], key: (feature: MapFeature) => string): Array<[string, MapFeature[]]> {
  const groups = new Map<string, MapFeature[]>();
  for (const feature of features) {
    const label = key(feature);
    const list = groups.get(label) ?? [];
    list.push(feature);
    groups.set(label, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Sources the tiles leave out: the ones the web pack holds (the same
 * holdReason rule as src/pack/build.ts), and GO Transit and UP Express, which
 * stay in their own metrolinx-* files. A source not in the registry has no
 * licence and is left out too (see collectFile).
 */
export function excludedSources(repoRoot: string): { held: Set<string>; registered: Set<string> } {
  const registry = readRegistry(repoRoot);
  const held = new Set<string>(TILES_HELD_FOR_LEGAL_REVIEW);
  for (const source of registry.sources) if (holdReason(source) !== null) held.add(source.id);
  return { held, registered: new Set(registry.sources.map((source) => source.id)) };
}

function archiveOptions(family: "odbl" | "other"): ArchiveOptions {
  return {
    family,
    name: family === "odbl" ? "OSM Ontario place overlay" : "Open-data place overlay",
    description:
      family === "odbl"
        ? "Point overlay, and path segments short enough to sit in one tile, from the OpenStreetMap Ontario extract. This file is an ODbL layer and contains no other licence."
        : "Point overlay from Ontario datasets with a confirmed open grant, other than OpenStreetMap. GO Transit and UP Express timetable stops stay in their own metrolinx-* files and are left out of this overlay so they can be removed quickly. This file contains no OpenStreetMap data.",
    attribution:
      family === "odbl"
        ? "© OpenStreetMap contributors. Open Database License (ODbL) 1.0. https://www.openstreetmap.org/copyright"
        : "Open-data overlay. Attribution for each source_id is in ATTRIBUTION.md. This file contains no OpenStreetMap data.",
    minZoom: 0,
    maxZoom: 12,
  };
}

async function collect(dataRoot: string, includePaths: boolean, excluded: { held: Set<string>; registered: Set<string> }): Promise<MapFeature[]> {
  const features: MapFeature[] = [];
  for (const tranche of Object.keys(TRANCHE_DIR) as Tranche[]) {
    const directory = path.join(dataRoot, TRANCHE_DIR[tranche]);
    for (const file of listNdjson(directory)) {
      const sourceId = path.basename(path.dirname(file));
      if (!excluded.registered.has(sourceId)) {
        failsafeLog().outcome({ step: "tiles", source_id: sourceId, target: file, status: "withheld", reason: "source is not in sources/registry.json, so it has no licence" });
        continue;
      }
      if (excluded.held.has(sourceId)) continue;
      for (const feature of await collectFile(file, tranche, includePaths)) {
        if (!excluded.held.has(feature.props.source_id ?? "")) features.push(feature);
      }
    }
  }
  return features;
}

/**
 * Features from one partition. A file that does not decompress or has a line
 * that is not JSON adds nothing and is reported; a record that fails its
 * check is skipped and quarantined. Neither stops the other files.
 */
export async function collectFile(file: string, tranche: Tranche, includePaths: boolean): Promise<MapFeature[]> {
  const sourceId = path.basename(path.dirname(file));
  const features: MapFeature[] = [];
  const input = createReadStream(file).pipe(createGunzip());
  const stream = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of stream) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let record: unknown;
      try { record = JSON.parse(line); }
      catch { throw new Error(`line ${lineNumber} is not JSON`); }
      const check = checkRecord(record, { tranche, sourceId });
      if (!check.ok) {
        failsafeLog().quarantine({ stage: "tiles", source_id: sourceId, tranche, file, id: (record as { id?: string }).id, code: check.code, reason: check.reason });
        continue;
      }
      const feature = toFeature(record as DataRecord, includePaths);
      if (feature) features.push(feature);
    }
  } catch (error) {
    failsafeLog().outcome({ step: "tiles", source_id: sourceId, target: file, status: "withheld", reason: `file left out of the overlay: ${(error as Error).message}` });
    return [];
  } finally {
    stream.close();
    input.destroy();
  }
  return features;
}

function toFeature(record: DataRecord, includePaths: boolean): MapFeature | null {
  const licence = record.fields.lat?.licence ?? record.fields.geometry?.licence ?? record.fields.name?.licence;
  const sourceId = record.fields.lat?.source_id ?? record.fields.geometry?.source_id ?? record.fields.name?.source_id ?? "";
  if (!licence || TILES_HELD_FOR_LEGAL_REVIEW.has(sourceId)) return null;
  const family = licence === "ODbL-1.0" || sourceId === "osm-ontario" ? "odbl" : "other";
  const props: Record<string, string> = {
    id: record.id,
    tranche: record.tranche,
    source_id: sourceId,
  };
  const name = textValue(record, "name");
  if (name) props.name = name.slice(0, 80);
  for (const [field, value] of Object.entries(record.fields)) {
    if (!isAccessibilityField(record.tranche, field) || !value || !isPiece(value)) continue;
    if (typeof value.value === "string" || typeof value.value === "number") props[field] = String(value.value).slice(0, 80);
  }
  const lat = coordinate(record, "lat");
  const lon = coordinate(record, "lon");
  if (lat !== null && lon !== null) return { lat, lon, props, licenceFamily: family };
  if (!includePaths) return null;
  const geometry = record.fields.geometry?.value;
  if (!Array.isArray(geometry) || geometry.length < 2) return null;
  const line = geometry.filter((pair): pair is [number, number] => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (line.length < 2) return null;
  const first = line[0] as [number, number];
  return { lon: first[0], lat: first[1], line, props, licenceFamily: family };
}

function textValue(record: DataRecord, field: string): string {
  const value = record.fields[field];
  if (!value || !isPiece(value) || typeof value.value !== "string") return "";
  return value.value;
}

function coordinate(record: DataRecord, field: string): number | null {
  const value = record.fields[field];
  if (!value || typeof value.value !== "number" || !Number.isFinite(value.value)) return null;
  return value.value;
}

function listNdjson(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ndjson.gz")) found.push(full);
    }
  };
  walk(directory);
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const includePaths = !process.argv.includes("--points");
  await buildOfflineTiles(process.cwd(), includePaths);
}
