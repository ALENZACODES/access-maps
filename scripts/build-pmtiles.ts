import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { isAccessibilityField } from "../src/count/accessibility.js";
import { isPiece } from "../src/model/provenance.js";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../src/model/records.js";
import { buildPmtiles, TileSizeError, type MapFeature } from "../src/tiles/build.js";

const FAMILIES = ["odbl", "other"] as const;

export async function buildOfflineTiles(repoRoot: string, includePaths = true): Promise<string[]> {
  const features = await collect(path.join(repoRoot, "data"), includePaths);
  const written: string[] = [];
  for (const family of FAMILIES) {
    const group = features.filter((feature) => feature.licenceFamily === family);
    if (group.length === 0) continue;
    const directory = path.join(repoRoot, "data", "tiles", family === "odbl" ? "odbl" : "open");
    mkdirSync(directory, { recursive: true });
    const options = archiveOptions(family);
    try {
      const archive = buildPmtiles(group, options);
      const file = path.join(directory, "places.pmtiles");
      writeFileSync(file, archive);
      written.push(path.relative(repoRoot, file));
      console.log(JSON.stringify({ file: path.relative(repoRoot, file), bytes: archive.length, features: group.length }));
    } catch (error) {
      if (!(error instanceof TileSizeError)) throw error;
      const bands = new Map<string, MapFeature[]>();
      for (const feature of group) {
        const label = `n${String(Math.max(0, Math.floor(feature.lat))).padStart(2, "0")}`;
        const list = bands.get(label) ?? [];
        list.push(feature);
        bands.set(label, list);
      }
      for (const [label, band] of [...bands.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const archive = buildPmtiles(band, options);
        const file = path.join(directory, `places-${label}.pmtiles`);
        writeFileSync(file, archive);
        written.push(path.relative(repoRoot, file));
        console.log(JSON.stringify({ file: path.relative(repoRoot, file), bytes: archive.length, features: band.length }));
      }
    }
  }
  return written;
}

function archiveOptions(family: "odbl" | "other") {
  return {
    family,
    name: family === "odbl" ? "OSM Ontario place overlay" : "Open-data place overlay",
    description:
      family === "odbl"
        ? "Point overlay, and path segments short enough to sit in one tile, from the OpenStreetMap Ontario extract. This file is an ODbL layer and contains no other licence."
        : "Point overlay from openly licensed Ontario datasets other than OpenStreetMap. This file contains no OpenStreetMap data.",
    attribution:
      family === "odbl"
        ? "(c) OpenStreetMap contributors. Open Database License (ODbL) 1.0. https://www.openstreetmap.org/copyright"
        : "Open-data overlay. Attribution for each source_id is in ATTRIBUTION.md. This file contains no OpenStreetMap data.",
    minZoom: 0,
    maxZoom: 12,
  };
}

async function collect(dataRoot: string, includePaths: boolean): Promise<MapFeature[]> {
  const features: MapFeature[] = [];
  for (const tranche of Object.keys(TRANCHE_DIR) as Tranche[]) {
    const directory = path.join(dataRoot, TRANCHE_DIR[tranche]);
    for (const file of listNdjson(directory)) {
      const stream = readline.createInterface({
        input: createReadStream(file).pipe(createGunzip()),
        crlfDelay: Infinity,
      });
      for await (const line of stream) {
        if (!line.trim()) continue;
        const feature = toFeature(JSON.parse(line) as DataRecord, includePaths);
        if (feature) features.push(feature);
      }
    }
  }
  return features;
}

function toFeature(record: DataRecord, includePaths: boolean): MapFeature | null {
  const licence = record.fields.lat?.licence ?? record.fields.geometry?.licence ?? record.fields.name?.licence;
  if (!licence) return null;
  const family = licence === "ODbL-1.0" || record.fields.lat?.source_id === "osm-ontario" ? "odbl" : "other";
  const props: Record<string, string> = {
    id: record.id,
    tranche: record.tranche,
    source_id: record.fields.lat?.source_id ?? record.fields.geometry?.source_id ?? "",
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
