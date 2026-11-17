/**
 * npm run match:places — links records from different sources that are the
 * same real place, and writes data/links/ (see src/places/links.ts).
 *
 * Streams: pass 1 reads every venue, washroom and transit file once and keeps
 * a small per-cell working file under .cache/places-match/; pass 2 matches
 * one 0.5-degree cell at a time, reading its neighbours' edges as margin.
 * Only the records named by a candidate link stay in memory. Source records
 * are never changed. The output is staged and swapped in only when complete.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import {
  cellBox,
  cellEdges,
  clusterEdges,
  DEFAULT_PARAMS,
  DensityIndex,
  inMargin,
  MATCH_METHOD,
  neighbourCells,
  toPlacePoint,
  type Edge,
  type MatchParams,
  type PairEvidence,
  type PlacePoint,
} from "../src/places/match.js";
import {
  CLUSTER_DIR,
  LINK_FILE_MAX_BYTES,
  LINKS_DIR,
  LinkWriter,
  POSSIBLE_DIR,
  sha256File,
  type LinkMember,
  type LinksIndex,
} from "../src/places/links.js";
import { swapDirectory, writeFileAtomic } from "../src/failsafe/files.js";

const PLACE_DIRS = ["venues", "washrooms", "transit"] as const;

export interface MatchRunOptions {
  dataRoot: string;
  workDir: string;
  params?: MatchParams;
  /** Also keep scored pairs that were not linked when this returns true (for building an evaluation sample). */
  keep?: (evidence: PairEvidence) => boolean;
  log?: (message: string) => void;
  /** Called once for every place read in pass 1. */
  onPoint?: (point: PlacePoint) => void;
}

export interface MatchRunResult {
  edges: Edge[];
  points: Map<string, PlacePoint>;
  inputFiles: Array<{ path: string; sha256: string }>;
  placesRead: number;
  skipped: Array<{ path: string; reason: string }>;
}

function placeFiles(dataRoot: string): string[] {
  const out: string[] = [];
  for (const dir of PLACE_DIRS) {
    const root = path.join(dataRoot, dir);
    if (!existsSync(root)) continue;
    for (const source of readdirSync(root).sort()) {
      const sourceDir = path.join(root, source);
      for (const name of readdirSync(sourceDir).sort()) if (name.endsWith(".ndjson.gz")) out.push(path.join(sourceDir, name));
    }
  }
  return out;
}

class CellSpool {
  private readonly buffers = new Map<string, string[]>();
  private readonly sizes = new Map<string, number>();
  readonly cells = new Set<string>();
  constructor(private readonly dir: string) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  add(point: PlacePoint): void {
    const line = JSON.stringify(point);
    const list = this.buffers.get(point.cell) ?? [];
    list.push(line);
    this.buffers.set(point.cell, list);
    this.cells.add(point.cell);
    const size = (this.sizes.get(point.cell) ?? 0) + line.length;
    this.sizes.set(point.cell, size);
    if (size > 1_000_000) this.flush(point.cell);
  }
  flush(cell: string): void {
    const list = this.buffers.get(cell);
    if (!list || list.length === 0) return;
    appendFileSync(path.join(this.dir, `${cell}.jsonl`), `${list.join("\n")}\n`);
    this.buffers.set(cell, []);
    this.sizes.set(cell, 0);
  }
  flushAll(): void {
    for (const cell of [...this.buffers.keys()].sort()) this.flush(cell);
  }
  read(cell: string): PlacePoint[] {
    const file = path.join(this.dir, `${cell}.jsonl`);
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as PlacePoint);
  }
}

export async function collectEdges(options: MatchRunOptions): Promise<MatchRunResult> {
  const params = options.params ?? DEFAULT_PARAMS;
  const log = options.log ?? (() => {});
  const spool = new CellSpool(path.join(options.workDir, "cells"));
  const density = new DensityIndex();
  const seen = new Set<string>();
  const skipped: Array<{ path: string; reason: string }> = [];
  const inputFiles: Array<{ path: string; sha256: string }> = [];
  let placesRead = 0;
  for (const file of placeFiles(options.dataRoot)) {
    const relative = path.relative(options.dataRoot, file).split(path.sep).join("/");
    const accepted: PlacePoint[] = [];
    try {
      const digest = await sha256File(file);
      const input = createReadStream(file).pipe(createGunzip());
      const lines = createInterface({ input, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        const point = toPlacePoint(JSON.parse(line));
        if (point) accepted.push(point);
      }
      inputFiles.push({ path: relative, sha256: digest.sha256 });
    } catch (error) {
      // A file that cannot be read adds no links; the rest still match. It is listed in index.json.
      skipped.push({ path: relative, reason: (error as Error).message });
      continue;
    }
    for (const point of accepted) {
      if (seen.has(point.key)) {
        skipped.push({ path: relative, reason: `duplicate record ${point.key}; the first one read is used` });
        continue;
      }
      seen.add(point.key);
      density.add(point.lat, point.lon);
      options.onPoint?.(point);
      spool.add(point);
      placesRead += 1;
    }
  }
  seen.clear();
  spool.flushAll();
  log(`pass 1: ${placesRead} places in ${spool.cells.size} cells`);
  const edges: Edge[] = [];
  const points = new Map<string, PlacePoint>();
  for (const cell of [...spool.cells].sort()) {
    const own = spool.read(cell);
    const box = cellBox(cell);
    const margin: PlacePoint[] = [];
    for (const neighbour of neighbourCells(cell)) {
      if (!spool.cells.has(neighbour)) continue;
      for (const point of spool.read(neighbour)) if (inMargin(point, box)) margin.push(point);
    }
    const found = cellEdges(own, margin, density, params, options.keep);
    if (found.length > 0) {
      const byKey = new Map<string, PlacePoint>();
      for (const point of own) byKey.set(point.key, point);
      for (const point of margin) byKey.set(point.key, point);
      for (const edge of found) {
        for (const key of [edge.a, edge.b]) if (!points.has(key)) points.set(key, byKey.get(key)!);
        edges.push(edge);
      }
    }
    log(`pass 2: ${cell} ${own.length} places, ${found.length} edges`);
  }
  return { edges, points, inputFiles, placesRead, skipped };
}

function member(point: PlacePoint): LinkMember {
  return { tranche: point.tranche, id: point.id, source_id: point.sourceId, cell: point.cell };
}

export async function runMatch(options: MatchRunOptions & { out?: string }): Promise<LinksIndex> {
  const params = options.params ?? DEFAULT_PARAMS;
  const collected = await collectEdges(options);
  const { clusters, possible } = clusterEdges(collected.edges, collected.points, params);
  const out = options.out ?? path.join(options.dataRoot, LINKS_DIR);
  const staging = path.join(options.workDir, "staging");
  rmSync(staging, { recursive: true, force: true });
  const clusterWriter = new LinkWriter(path.join(staging, CLUSTER_DIR));
  for (const cluster of clusters) {
    const members = cluster.members.map((key) => member(collected.points.get(key)!));
    const anchor = members[0]!;
    await clusterWriter.write(anchor.cell, {
      cluster: cluster.id,
      method: MATCH_METHOD,
      members,
      evidence: cluster.edges.map((edge) => ({ a: edge.a, b: edge.b, ...edge.evidence })),
    });
  }
  await clusterWriter.close();
  const possibleWriter = new LinkWriter(path.join(staging, POSSIBLE_DIR));
  for (const item of possible) {
    const a = member(collected.points.get(item.a)!);
    await possibleWriter.write(a.cell, {
      method: MATCH_METHOD,
      a,
      b: member(collected.points.get(item.b)!),
      evidence: item.evidence,
      why: item.why,
    });
  }
  await possibleWriter.close();
  const files: LinksIndex["files"] = [];
  for (const written of [...clusterWriter.written, ...possibleWriter.written]) {
    const digest = await sha256File(written.file);
    if (digest.bytes > LINK_FILE_MAX_BYTES) throw new Error(`${written.file} is ${digest.bytes} bytes, over the link file limit`);
    const relative = `${LINKS_DIR}/${path.relative(staging, written.file).split(path.sep).join("/")}`;
    files.push({ path: relative, bytes: digest.bytes, sha256: digest.sha256, lines: written.lines });
  }
  files.sort((x, y) => (x.path < y.path ? -1 : 1));
  const digest = createHash("sha256");
  for (const file of [...collected.inputFiles].sort((x, y) => (x.path < y.path ? -1 : 1))) digest.update(`${file.path} ${file.sha256}\n`);
  const index: LinksIndex = {
    method: MATCH_METHOD,
    params,
    input_digest: digest.digest("hex"),
    input_files: collected.inputFiles.length,
    places_read: collected.placesRead,
    skipped: collected.skipped,
    clusters: clusters.length,
    records_in_clusters: clusters.reduce((sum, cluster) => sum + cluster.members.length, 0),
    possible_duplicates: possible.length,
    files,
  };
  writeFileSync(path.join(staging, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  swapDirectory(staging, out);
  return index;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.cwd();
  const verbose = process.argv.includes("--verbose");
  const index = await runMatch({
    dataRoot: path.join(repoRoot, "data"),
    workDir: path.join(repoRoot, ".cache", "places-match"),
    log: verbose ? (message) => console.error(message) : undefined,
  });
  writeFileAtomic(path.join(repoRoot, ".cache", "places-match", "last-run.json"), `${JSON.stringify({ clusters: index.clusters, records_in_clusters: index.records_in_clusters, possible_duplicates: index.possible_duplicates, skipped: index.skipped.length }, null, 2)}\n`);
  console.log(JSON.stringify({
    places_read: index.places_read,
    clusters: index.clusters,
    records_in_clusters: index.records_in_clusters,
    possible_duplicates: index.possible_duplicates,
    skipped: index.skipped.length,
    files: index.files.length,
  }));
}
