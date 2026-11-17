import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { gpkgSrsId, parseGpkgGeometry, placeAnchor, readGpkgRows } from "../src/io/gpkg.js";
import { PerSourceRun } from "../src/failsafe/per-source.js";
import { statcanLambertToWgs84 } from "../src/geo/project.js";
import {
  lodeExclusion,
  mapOdcaf,
  mapOdef,
  mapOdhf,
  mapOdsrf,
  type LodeAnchor,
  type LodeDatabase,
  type LodeRow,
} from "../src/national/statcan-lode.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";
const STATCAN_LAMBERT = 3347;

/** One LODE database: the zip entry read and how its Ontario rows are listed. */
interface LodeJob {
  id: LodeDatabase;
  /** File name inside the published zip. */
  entry: string;
  rows: (file: string) => Iterable<{ row: LodeRow; anchor: LodeAnchor | null }>;
  map: (row: LodeRow, anchor: LodeAnchor | null, ctx: Provenance) => DataRecord;
}

export interface LodeImported {
  source_id: string;
  ontario_rows: number;
  records: number;
  excluded: Record<string, number>;
  no_coordinate: number;
}

const TRANCHES: readonly Tranche[] = ["venue"];

export const LODE_JOBS: readonly LodeJob[] = [
  { id: "statcan-odhf", entry: "odhf_v2.gpkg", rows: (file) => gpkgOntarioRows(file, "odhf_v2"), map: mapOdhf },
  { id: "statcan-odsrf", entry: "odsrf_v2.gpkg", rows: (file) => gpkgOntarioRows(file, "odsrf_v2"), map: mapOdsrf },
  { id: "statcan-odef", entry: "odef_v3_0_1.csv", rows: (file) => csvOntarioRows(file, "utf-8", "province_code", "ON"), map: (row, _anchor, ctx) => mapOdef(row, ctx) },
  { id: "statcan-odcaf", entry: "ODCAF_v1.0.csv", rows: (file) => csvOntarioRows(file, "windows-1252", "Prov_Terr", "on"), map: (row, _anchor, ctx) => mapOdcaf(row, ctx) },
];

export async function importStatcanLode(repoRoot: string, only: readonly string[] = []): Promise<{ sources: LodeImported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const run = new PerSourceRun("importStatcanLode", path.join(repoRoot, "data"));
  const sources: LodeImported[] = [];
  for (const job of LODE_JOBS) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    // Each source has its own writer: one that fails keeps its last known-good files and the others are still written.
    const imported = await run.source(job.id, TRANCHES, async (writer) => {
      const source = requireSource(registry, job.id);
      if (source.kind !== "federal" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 federal data`);
      const file = await cachedEntry(repoRoot, job.id, source.download_url, job.entry);
      resetSourceDirs(path.join(repoRoot, "data"), source.id, TRANCHES);
      const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
      const stats: LodeImported = { source_id: source.id, ontario_rows: 0, records: 0, excluded: {}, no_coordinate: 0 };
      const seen = new Set<string>();
      for (const { row, anchor } of job.rows(file)) {
        stats.ontario_rows += 1;
        const reason = lodeExclusion(job.id, row);
        if (reason) {
          stats.excluded[reason] = (stats.excluded[reason] ?? 0) + 1;
          continue;
        }
        const record = job.map(row, anchor, ctx);
        // A record with no usable coordinate has no 0.5-degree cell to be stored in.
        if (record.region === "unknown") {
          stats.no_coordinate += 1;
          continue;
        }
        // Statistics Canada's id is unique per row; a repeat is an exact duplicate and is not written twice.
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

function* gpkgOntarioRows(file: string, table: string): Generator<{ row: LodeRow; anchor: LodeAnchor | null }> {
  const srs = gpkgSrsId(file, table);
  if (srs !== STATCAN_LAMBERT) throw new Error(`${table} uses spatial reference ${srs}, expected ${STATCAN_LAMBERT}`);
  for (const raw of readGpkgRows(file, table, "prov_terr = ?", ["ON"])) {
    const row: LodeRow = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "geom" || value instanceof Uint8Array) continue;
      row[key] = value === null ? "" : String(value);
    }
    const projected = placeAnchor(parseGpkgGeometry(raw.geom as Uint8Array | null));
    const anchor = projected ? { ...statcanLambertToWgs84(projected.x, projected.y), key: projected.key } : null;
    yield { row, anchor };
  }
}

function* csvOntarioRows(file: string, encoding: string, provinceKey: string, province: string): Generator<{ row: LodeRow; anchor: LodeAnchor | null }> {
  const text = new TextDecoder(encoding).decode(readFileSync(file));
  for (const row of parseCsv(text).rows) {
    if ((row[provinceKey] ?? "").trim() === province) yield { row, anchor: null };
  }
}

/** Returns `.cache/lode/<id>/<entry>`, downloading and unzipping the published zip when it is absent. */
async function cachedEntry(repoRoot: string, id: string, url: string, entry: string): Promise<string> {
  const directory = path.join(repoRoot, ".cache", "lode", id);
  mkdirSync(directory, { recursive: true });
  const target = path.join(directory, entry);
  if (existsSync(target)) return target;
  const zip = path.join(directory, `${id}.zip`);
  if (!existsSync(zip)) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok || !response.body) throw new Error(`${url} HTTP ${response.status}`);
    const partial = `${zip}.part`;
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(partial));
    renameSync(partial, zip);
  }
  const listed = spawnSync("unzip", ["-Z1", zip], { encoding: "utf8" });
  if (listed.status !== 0) throw new Error(`unable to list ${zip}: ${listed.stderr}`);
  const member = listed.stdout.split("\n").map((line) => line.trim()).find((line) => line.split("/").pop() === entry);
  if (!member) throw new Error(`${zip} has no ${entry}`);
  const unzipped = spawnSync("unzip", ["-o", "-j", zip, member, "-d", directory], { encoding: "utf8" });
  if (unzipped.status !== 0 || !existsSync(target)) throw new Error(`unable to extract ${entry} from ${zip}: ${unzipped.stderr}`);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importStatcanLode(process.cwd(), process.argv.slice(2));
}
