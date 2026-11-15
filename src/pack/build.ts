import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { execFileSync } from "node:child_process";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../model/records.js";
import { cellBBox, makeRegions } from "./regions.js";
import type { PackManifest, PackPart } from "./types.js";
import { readRegistry, type SourceEntry } from "../registry.js";

const LIMIT = 25 * 1024 * 1024;
const PATH_PATTERN = /^(venues|washrooms|paths|transit)\/([^/]+)\/([ns]\d{2,3}\.\d_[ew]\d{3}\.\d)(?:\.p\d+)?\.ndjson\.gz$/;
const TRANCHES: Tranche[] = ["venue", "washroom", "transit", "path"];
const DIR_TO_TRANCHE = Object.fromEntries(Object.entries(TRANCHE_DIR).map(([key, value]) => [value, key])) as Record<string, Tranche>;

export const METROLINX_AUA_LEGEND =
  "Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service.";
export const METROLINX_OGL_LINE =
  "Contains information licensed under the Open Government Licence - Ontario - Metrolinx.";
export const METROLINX_PACK_ATTRIBUTION = `${METROLINX_AUA_LEGEND} ${METROLINX_OGL_LINE}`;
export const METROLINX_PACK_LICENCE = "Metrolinx Access and Use Agreement (accepted 2026-11-15)";
export const METROLINX_PACK_LICENCE_URL = "https://www.gotransit.com/en/partner-with-us/software-developers";
export const METROLINX_ACCEPTED_ON = "2026-11-15";
/** ISO local time of John's direct confirmation to QA (America/Toronto). */
export const JOHN_QA_CONFIRMATION_AT = "2026-11-15T17:59:00-05:00";
export const JOHN_QA_CONFIRMATION_NOTE =
  "John Khan confirmed directly to QA on 2026-11-15 at 5:59 PM ET (America/Toronto) that he accepted the Metrolinx Access and Use Agreement. At the same time he approved London Transit data. MiWay stays out.";

/** LTC is approved, but held out of this pack until a follow-up adds the Terms of Use availability notice. MiWay is already absent from the registry. */
export const PACK_HELD_PENDING_CONFIRMATION = new Set(["gtfs-ltc"]);

export function holdReason(source: SourceEntry): string | null {
  // Take the legal decision from the registry's terms, rather than assuming
  // all GTFS or all municipal records are licensed for web redistribution.
  if (source.id === "gtfs-miway" || source.id.startsWith("gtfs-miway")) {
    return "MiWay stays out: official terms are unconfirmed.";
  }
  if (PACK_HELD_PENDING_CONFIRMATION.has(source.id)) {
    return "London Transit is held out of this web pack until a follow-up adds the LTC Terms of Use availability notice. John Khan confirmed directly to QA on 2026-11-15 at 5:59 PM ET (America/Toronto) that London Transit data can go in.";
  }
  const notes = `${source.notes ?? ""} ${source.tier_note ?? ""}`;
  if (/not been reconciled|revocable|legal review is still required|not treated as a settled open grant|held for legal review/i.test(notes)) {
    return `Licence terms require review: ${source.notes ?? source.licence_name}`;
  }
  return null;
}

export function assertMetrolinxPackProvenance(source: SourceEntry): void {
  if (!source.id.startsWith("metrolinx-")) return;
  const missing: string[] = [];
  if (source.licence_id !== METROLINX_PACK_LICENCE && source.licence_name !== METROLINX_PACK_LICENCE) {
    missing.push("licence");
  }
  if (source.licence_url !== METROLINX_PACK_LICENCE_URL) missing.push("licenceUrl");
  if (source.retrieved_at !== METROLINX_ACCEPTED_ON) missing.push("retrieved");
  if (!source.attribution.includes(METROLINX_AUA_LEGEND) || !source.attribution.includes(METROLINX_OGL_LINE)) {
    missing.push("attribution");
  }
  if (missing.length) {
    throw new Error(`Metrolinx pack provenance is incomplete for ${source.id}: ${missing.join(", ")}`);
  }
}

export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function field(record: DataRecord, names: string[]): unknown {
  for (const name of names) {
    const value = record.fields[name]?.value;
    if (value !== undefined && value !== "UNKNOWN") return value;
  }
  return null;
}

export function searchHit(record: DataRecord): {
  id: string; tranche: Tranche; name: string | null; nameNorm: string; lat: number | null; lon: number | null;
} {
  const rawName = field(record, ["name", "stop_name", "title"]);
  const name = typeof rawName === "string" ? rawName : null;
  const lat = field(record, ["lat", "latitude", "stop_lat"]);
  const lon = field(record, ["lon", "longitude", "stop_lon"]);
  return {
    id: record.id,
    tranche: record.tranche,
    name,
    nameNorm: name === null ? "" : normalizeName(name),
    lat: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
    lon: typeof lon === "number" && Number.isFinite(lon) ? lon : null,
  };
}

async function* filesUnder(directory: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(filename);
    else if (entry.isFile() && entry.name.endsWith(".ndjson.gz")) yield filename;
  }
}

export async function* recordsIn(file: string): AsyncGenerator<DataRecord> {
  const stream = createReadStream(file).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) if (line.trim()) yield JSON.parse(line) as DataRecord;
  } finally { lines.close(); stream.destroy(); }
}

export async function digest(file: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    const buffer = chunk as Buffer;
    bytes += buffer.length;
    hash.update(buffer);
  }
  if (bytes > LIMIT) throw new Error(`Part exceeds 25 MiB: ${file}`);
  return { bytes, sha256: hash.digest("hex") };
}

async function write(gzip: ReturnType<typeof createGzip>, value: string): Promise<void> {
  if (!gzip.write(value)) await once(gzip, "drain");
}

function sourceCommit(repoRoot: string): string {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(); }
  catch { return "2c01751faf39854bb849dae00b804cf881e72287"; }
}

export async function buildWebPack(options: {
  data: string; out: string; repoRoot?: string; builtAt?: string; sourceCommit?: string;
}): Promise<PackManifest> {
  const dataRoot = path.resolve(options.data);
  const out = path.resolve(options.out);
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const registry = readRegistry(repoRoot);
  const sources = registry.sources.map((source) => {
    const heldReason = holdReason(source);
    const inWebPack = heldReason === null;
    if (inWebPack) assertMetrolinxPackProvenance(source);
    return {
      sourceId: source.id, name: source.name, licence: source.licence_id,
      licenceUrl: source.licence_url, attribution: source.attribution,
      retrieved: source.retrieved_at, shareAlike: source.licence_id === "ODbL-1.0",
      inWebPack, heldReason,
    };
  });
  const allowed = new Set(sources.filter((source) => source.inWebPack).map((source) => source.sourceId));
  const groups = new Map<string, Array<{ file: string; relative: string; tranche: Tranche; sourceId: string }>>();
  for await (const file of filesUnder(dataRoot)) {
    const relative = path.relative(dataRoot, file).split(path.sep).join("/");
    const match = PATH_PATTERN.exec(relative);
    if (!match) throw new Error(`Unexpected partition path: ${relative}`);
    const dir = match[1];
    const sourceId = match[2];
    const cell = match[3];
    const tranche = dir ? DIR_TO_TRANCHE[dir] : undefined;
    if (!dir || !sourceId || !cell || !tranche) throw new Error(`Unexpected partition path: ${relative}`);
    if (!registry.sources.some((source) => source.id === sourceId)) throw new Error(`Unregistered source: ${sourceId}`);
    if (!allowed.has(sourceId)) continue;
    const group = groups.get(cell) ?? [];
    group.push({ file, relative, tranche, sourceId });
    groups.set(cell, group);
  }
  const manifest: PackManifest = {
    version: 1, builtAt: options.builtAt ?? new Date().toISOString(),
    sourceCommit: options.sourceCommit ?? sourceCommit(repoRoot), sources,
    regions: makeRegions([...groups.keys()]),
    tranches: Object.fromEntries(TRANCHES.map((tranche) => [tranche, { cells: {} }])),
    search: {}, tiles: {}, counts: { records: 0, byTranche: {}, bySource: {} },
  };
  await mkdir(path.join(out, "search"), { recursive: true });
  for (const cell of [...groups.keys()].sort()) {
    const parts = groups.get(cell)!.sort((a, b) => a.relative.localeCompare(b.relative, "en"));
    const output = path.join(out, "search", `${cell}.json.gz`);
    const temp = `${output}.tmp`;
    const gzip = createGzip({ level: 9 });
    const destination = createWriteStream(temp);
    gzip.pipe(destination);
    let count = 0;
    try {
      await write(gzip, "[");
      for (const part of parts) {
        const { bytes, sha256 } = await digest(part.file);
        let partCount = 0;
        for await (const record of recordsIn(part.file)) {
          if (record.tranche !== part.tranche || record.region !== cell) {
            throw new Error(`Partition mismatch: ${part.relative}: ${record.id}`);
          }
          if (count) await write(gzip, ",");
          await write(gzip, JSON.stringify(searchHit(record)));
          count++;
          partCount++;
        }
        const trancheEntry = manifest.tranches[part.tranche];
        if (!trancheEntry) throw new Error(`Missing tranche: ${part.tranche}`);
        const cellEntries = trancheEntry.cells;
        const entry = cellEntries[cell] ?? { bbox: cellBBox(cell), parts: [] as PackPart[] };
        entry.parts.push({ path: part.relative, bytes, sha256, count: partCount, sourceId: part.sourceId });
        cellEntries[cell] = entry;
        manifest.counts.records += partCount;
        manifest.counts.byTranche[part.tranche] = (manifest.counts.byTranche[part.tranche] ?? 0) + partCount;
        manifest.counts.bySource[part.sourceId] = (manifest.counts.bySource[part.sourceId] ?? 0) + partCount;
      }
      await write(gzip, "]");
      gzip.end();
      await once(destination, "finish");
      await rename(temp, output);
    } catch (error) {
      gzip.destroy();
      destination.destroy();
      await rm(temp, { force: true });
      throw error;
    }
    manifest.search[cell] = {
      path: `pack/v1/search/${cell}.json.gz`, ...await digest(output), count,
    };
  }
  for (const [key, licence] of [["open", "mixed-open"], ["odbl", "ODbL-1.0"]] as const) {
    const relative = `tiles/${key}/places.pmtiles`;
    try {
      const file = await stat(path.join(dataRoot, relative));
      if (file.size > LIMIT) throw new Error(`Tile exceeds 25 MiB: ${relative}`);
      manifest.tiles[key] = { path: relative, bytes: file.size, licence };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const manifestFile = path.join(out, "manifest.json");
  await mkdir(out, { recursive: true });
  await writeFile(`${manifestFile}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestFile}.tmp`, manifestFile);
  return manifest;
}
