import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { execFileSync } from "node:child_process";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../model/records.js";
import { cellBBox, makeRegions } from "./regions.js";
import type { PackManifest, PackPart } from "./types.js";
import { readRegistry, type SourceEntry } from "../registry.js";
import { checkRecord } from "../failsafe/record-check.js";
import { failsafeLog } from "../failsafe/report.js";
import { pmtilesBounds, TILE_FILE_PATTERN } from "../tiles/build.js";

/** Largest file the pack lists (25 MiB). The same value as MAX_TILE_FILE_BYTES in src/tiles/build.ts. */
export const PACK_FILE_LIMIT = 25 * 1024 * 1024;
const LIMIT = PACK_FILE_LIMIT;
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

export const LTC_PACK_LICENCE = "LTC Open Data Terms of Use";
export const LTC_PACK_LICENCE_URL = "https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/";
export const LTC_AVAILABILITY_NOTICE_EN =
  "Transit data is available from London Transit Commission under its Terms of Use";
/** FR typography: U+2019 in d’utilisation; U+00A0 before ':'. */
export const LTC_AVAILABILITY_NOTICE_FR =
  "Les données de transport en commun sont disponibles auprès de la Commission de transport de London : elles sont offertes aux termes de ses conditions d’utilisation.";
export const LTC_PACK_ATTRIBUTION = `${LTC_AVAILABILITY_NOTICE_EN}. ${LTC_AVAILABILITY_NOTICE_FR} ${LTC_PACK_LICENCE_URL}`;

/** Hold any source whose id or name contains or starts with "miway", case-insensitive. */
export function isHeldMiWay(id: string, name = ""): boolean {
  return [id, name].some((value) => value.trim().toLowerCase().includes("miway"));
}

export function holdReason(source: SourceEntry): string | null {
  // Take the legal decision from the registry's terms, rather than assuming
  // all GTFS or all municipal records are licensed for web redistribution.
  if (isHeldMiWay(source.id, source.name)) {
    return "MiWay stays out: official terms are unconfirmed.";
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

export function assertLtcPackProvenance(source: SourceEntry): void {
  if (source.id !== "gtfs-ltc") return;
  const missing: string[] = [];
  if (source.licence_id !== LTC_PACK_LICENCE && source.licence_name !== LTC_PACK_LICENCE) {
    missing.push("licence");
  }
  if (source.licence_url !== LTC_PACK_LICENCE_URL) missing.push("licenceUrl");
  if (!source.attribution.includes(LTC_AVAILABILITY_NOTICE_EN)) missing.push("notice-en");
  if (!source.attribution.includes(LTC_AVAILABILITY_NOTICE_FR)) missing.push("notice-fr");
  if (!source.attribution.includes(LTC_PACK_LICENCE_URL)) missing.push("terms-url");
  if (/logo|crest|mark|endors/i.test(source.attribution)) missing.push("marks-or-endorsement");
  if (missing.length) {
    throw new Error(`LTC pack provenance is incomplete for ${source.id}: ${missing.join(", ")}`);
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

async function readHead(file: string, length: number): Promise<Buffer> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
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

const NON_PARTITION_DIRS = new Set(["alerts", "tiles", "schedules"]);

export interface WithheldPart {
  path: string;
  sourceId: string | null;
  tranche: Tranche | null;
  cell: string | null;
  reason: string;
}

type CheckedPart =
  | { ok: true; bytes: number; sha256: string; hits: ReturnType<typeof searchHit>[] }
  | { ok: false; reason: string };

/** Reads one partition to the end and checks every record. Any fault withholds the whole part. */
async function checkPart(file: string, tranche: Tranche, cell: string, sourceId: string): Promise<CheckedPart> {
  let bytes: number;
  let sha256: string;
  try {
    ({ bytes, sha256 } = await digest(file));
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  if (bytes === 0) return { ok: false, reason: "file is empty (0 bytes)" };
  const hits: ReturnType<typeof searchHit>[] = [];
  const stream = createReadStream(file).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let record: unknown;
      try { record = JSON.parse(line); }
      catch { return { ok: false, reason: `line ${lineNumber} is not JSON` }; }
      const check = checkRecord(record, { tranche, region: cell, sourceId });
      if (!check.ok) return { ok: false, reason: `line ${lineNumber}: ${check.code}: ${check.reason}` };
      hits.push(searchHit(record as DataRecord));
    }
  } catch (error) {
    return { ok: false, reason: `gzip: ${(error as Error).message}` };
  } finally {
    lines.close();
    stream.destroy();
  }
  return { ok: true, bytes, sha256, hits };
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
    if (inWebPack) {
      assertMetrolinxPackProvenance(source);
      assertLtcPackProvenance(source);
    }
    return {
      sourceId: source.id, name: source.name, licence: source.licence_id,
      licenceUrl: source.licence_url, attribution: source.attribution,
      retrieved: source.retrieved_at, shareAlike: source.licence_id === "ODbL-1.0",
      inWebPack, heldReason,
    };
  });
  const allowed = new Set(sources.filter((source) => source.inWebPack).map((source) => source.sourceId));
  const groups = new Map<string, Array<{ file: string; relative: string; tranche: Tranche; sourceId: string }>>();
  const withheld: WithheldPart[] = [];
  const withhold = (part: WithheldPart): void => {
    withheld.push(part);
    failsafeLog().outcome({ step: "pack", source_id: part.sourceId ?? undefined, target: part.path, status: "withheld", reason: `withheld from the pack: ${part.reason}` });
  };
  for await (const file of filesUnder(dataRoot)) {
    const relative = path.relative(dataRoot, file).split(path.sep).join("/");
    // Alert snapshots and tiles are not record partitions and never go into the record pack.
    if (NON_PARTITION_DIRS.has(relative.split("/")[0] ?? "")) continue;
    const match = PATH_PATTERN.exec(relative);
    const dir = match?.[1];
    const sourceId = match?.[2];
    const cell = match?.[3];
    const tranche = dir ? DIR_TO_TRANCHE[dir] : undefined;
    if (!match || !dir || !sourceId || !cell || !tranche) {
      withhold({ path: relative, sourceId: null, tranche: null, cell: null, reason: "unexpected partition path" });
      continue;
    }
    if (!registry.sources.some((source) => source.id === sourceId)) {
      withhold({ path: relative, sourceId, tranche, cell, reason: "source is not in sources/registry.json, so it has no licence" });
      continue;
    }
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
    withheld,
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
        // Each part is read and checked in full before any of it is used. A
        // part that fails is withheld with its reason; the other parts and
        // cells are still packed.
        const checked = await checkPart(part.file, part.tranche, cell, part.sourceId);
        if (!checked.ok) {
          withhold({ path: part.relative, sourceId: part.sourceId, tranche: part.tranche, cell, reason: checked.reason });
          continue;
        }
        const { bytes, sha256 } = checked;
        const partCount = checked.hits.length;
        for (const hit of checked.hits) {
          if (count) await write(gzip, ",");
          await write(gzip, JSON.stringify(hit));
          count++;
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
    if (count === 0 && !Object.values(manifest.tranches).some((entry) => entry.cells[cell])) {
      await rm(output, { force: true });
      continue;
    }
    manifest.search[cell] = {
      path: `pack/v1/search/${cell}.json.gz`, ...await digest(output), count,
    };
  }
  for (const [family, licence] of [["open", "mixed-open"], ["odbl", "ODbL-1.0"]] as const) {
    // One overlay per family (places.pmtiles), or, when the family was split to
    // stay under the file limit, one per band (places-n43.pmtiles,
    // places-n43-w080.pmtiles). Keys are "open", "odbl", "odbl/n43", "odbl/n43-w080".
    let names: string[];
    try {
      names = (await readdir(path.join(dataRoot, "tiles", family))).filter((name) => name.endsWith(".pmtiles")).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      continue;
    }
    for (const name of names) {
      const relative = `tiles/${family}/${name}`;
      const band = TILE_FILE_PATTERN.exec(name);
      if (!band) {
        withhold({ path: relative, sourceId: null, tranche: null, cell: null, reason: "unexpected tile file name" });
        continue;
      }
      const file = path.join(dataRoot, relative);
      const size = (await stat(file)).size;
      // An oversized overlay is left out with its reason; the record parts are still packed.
      if (size > LIMIT) {
        withhold({ path: relative, sourceId: null, tranche: null, cell: null, reason: `tile is ${size} bytes, over the ${LIMIT} byte limit` });
        continue;
      }
      let bbox: [number, number, number, number];
      try {
        bbox = pmtilesBounds(await readHead(file, 127));
      } catch (error) {
        withhold({ path: relative, sourceId: null, tranche: null, cell: null, reason: `tile header is unreadable: ${(error as Error).message}` });
        continue;
      }
      const { sha256 } = await digest(file);
      manifest.tiles[band[1] ? `${family}/${band[1]}` : family] = { path: relative, bytes: size, sha256, licence, bbox };
    }
  }
  const manifestFile = path.join(out, "manifest.json");
  await mkdir(out, { recursive: true });
  await writeFile(`${manifestFile}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestFile}.tmp`, manifestFile);
  return manifest;
}
