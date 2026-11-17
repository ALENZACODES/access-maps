import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { readXlsx } from "../src/io/xlsx.js";
import { PerSourceRun } from "../src/failsafe/per-source.js";
import {
  mapCorrectionalInstitution,
  mapCourthouse,
  mapLiquorRetail,
  mapPrivateSchool,
  mapPublicSchool,
  mapSeniorsCentre,
  unquoteHeaders,
  type CatalogueRow,
} from "../src/provincial/ontario-catalogue.js";
import type { DataRecord, Tranche } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

/**
 * Province of Ontario place files from the Ontario Data Catalogue. The registry
 * download_url is the file. A row whose id repeats an earlier row's id describes the
 * same place (the same name and address), so only the first is written; the count of
 * such rows is reported.
 */
export interface CatalogueJob {
  id: string;
  format: "csv" | "xlsx";
  /** Text encoding of a CSV file. */
  encoding?: string;
  prepare?: (row: CatalogueRow) => CatalogueRow;
  map: (row: CatalogueRow, ctx: Provenance) => DataRecord | null;
}

export const CATALOGUE_JOBS: readonly CatalogueJob[] = [
  { id: "ontario-public-schools", format: "xlsx", map: mapPublicSchool },
  { id: "ontario-private-schools", format: "xlsx", map: mapPrivateSchool },
  { id: "ontario-alcohol-retail-locations", format: "csv", encoding: "utf-8", map: mapLiquorRetail },
  { id: "ontario-courthouses", format: "csv", encoding: "utf-8", prepare: unquoteHeaders, map: mapCourthouse },
  { id: "ontario-seniors-active-living-centres", format: "csv", encoding: "windows-1252", map: mapSeniorsCentre },
  { id: "ontario-correctional-institutions", format: "csv", encoding: "utf-8", map: mapCorrectionalInstitution },
];

export interface CatalogueImported {
  source_id: string;
  rows: number;
  records: number;
  skipped: number;
  no_coordinate: number;
  same_place: number;
}

const TRANCHES: readonly Tranche[] = ["venue"];

export async function importOntarioCatalogue(repoRoot: string, only: readonly string[] = [], jobs: readonly CatalogueJob[] = CATALOGUE_JOBS): Promise<{ sources: CatalogueImported[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const run = new PerSourceRun("importOntarioCatalogue", path.join(repoRoot, "data"));
  const sources: CatalogueImported[] = [];
  for (const job of jobs) {
    if (only.length > 0 && !only.includes(job.id)) continue;
    // Each source has its own writer: one that fails keeps its last known-good files and the others are still written.
    const imported = await run.source(job.id, TRANCHES, async (writer) => {
      const source = requireSource(registry, job.id);
      if (source.kind !== "provincial" || source.tier !== 0) throw new Error(`${job.id} must be tier 0 provincial data`);
      const file = await cachedFile(repoRoot, job, source.download_url);
      const rows = readRows(file, job);
      if (rows.length === 0) throw new Error(`${job.id} has no rows`);
      resetSourceDirs(path.join(repoRoot, "data"), source.id, TRANCHES);
      const ctx: Provenance = { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: 0 };
      const stats: CatalogueImported = { source_id: source.id, rows: rows.length, records: 0, skipped: 0, no_coordinate: 0, same_place: 0 };
      const seen = new Set<string>();
      for (const row of rows) {
        const record = job.map(job.prepare ? job.prepare(row) : row, ctx);
        if (record === null) {
          stats.skipped += 1;
          continue;
        }
        // A record with no usable coordinate has no 0.5-degree cell to be stored in.
        if (record.region === "unknown") {
          stats.no_coordinate += 1;
          continue;
        }
        if (seen.has(record.id)) {
          stats.same_place += 1;
          continue;
        }
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

function readRows(file: string, job: CatalogueJob): CatalogueRow[] {
  if (job.format === "xlsx") return readXlsx(file).rows;
  const text = new TextDecoder(job.encoding ?? "utf-8", { fatal: true }).decode(readFileSync(file));
  // Rows with no value at all (the courthouse file ends in thousands of them) are not rows.
  return parseCsv(text).rows.filter((row) => Object.values(row).some((value) => value.trim() !== ""));
}

/** Returns `.cache/provincial/<id>.<format>`, downloading the file when it is absent. */
async function cachedFile(repoRoot: string, job: CatalogueJob, url: string): Promise<string> {
  const directory = path.join(repoRoot, ".cache", "provincial");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${job.id}.${job.format}`);
  if (existsSync(file)) return file;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok || !response.body) throw new Error(`${url} HTTP ${response.status}`);
  const partial = `${file}.part`;
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(partial));
  renameSync(partial, file);
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importOntarioCatalogue(process.cwd(), process.argv.slice(2));
}
