/**
 * Same-place link files.
 *
 * data/links/index.json                         method, parameters, input digest, file list
 * data/links/same-place/<cell>[.pN].jsonl.gz    one cluster per line, in the cell of its first member
 * data/links/possible-duplicates/<cell>[.pN].jsonl.gz
 *                                               one possible duplicate per line, in the cell of record a
 *
 * The files use .jsonl.gz, not .ndjson.gz, because they are not records: the
 * record walkers (count, pack, tiles, data checks) read only .ndjson.gz.
 * Link files never change a source record. A link names records by tranche
 * and id; a record that is not in the data any more is ignored by readers.
 */
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import type { MatchParams, PairEvidence, PlaceTranche } from "./match.js";

export const LINKS_DIR = "links";
export const CLUSTER_DIR = "same-place";
export const POSSIBLE_DIR = "possible-duplicates";
export const LINK_FILE_PATTERN = /^([ns]\d{2,3}\.\d_[ew]\d{3}\.\d)(?:\.p(\d+))?\.jsonl\.gz$/;
/** Each link file stays under this many compressed bytes (the pack limit is 25 MiB). */
export const LINK_FILE_MAX_BYTES = 24 * 1024 * 1024;
/** A new part starts after this many uncompressed bytes; link lines compress well below a tenth. */
export const LINK_PART_UNCOMPRESSED = 96 * 1024 * 1024;

export interface LinkMember {
  tranche: PlaceTranche;
  id: string;
  source_id: string;
  cell: string;
}

export interface LinkEvidence extends PairEvidence {
  a: string;
  b: string;
}

export interface ClusterLine {
  cluster: string;
  method: string;
  members: LinkMember[];
  evidence: LinkEvidence[];
}

export interface PossibleLine {
  method: string;
  a: LinkMember;
  b: LinkMember;
  evidence: PairEvidence;
  why: string;
}

export interface LinkFileEntry {
  path: string;
  bytes: number;
  sha256: string;
  lines: number;
}

export interface LinksIndex {
  method: string;
  params: MatchParams;
  /** sha256 over the sorted "path sha256" lines of every input record file. */
  input_digest: string;
  input_files: number;
  places_read: number;
  skipped: Array<{ path: string; reason: string }>;
  clusters: number;
  records_in_clusters: number;
  possible_duplicates: number;
  files: LinkFileEntry[];
}

export function memberKey(member: Pick<LinkMember, "tranche" | "id">): string {
  return `${member.tranche}|${member.id}`;
}

/** Writes one family of link files (same-place or possible-duplicates), one or more parts per cell. */
export class LinkWriter {
  private readonly parts = new Map<string, { gzip: ReturnType<typeof createGzip>; out: ReturnType<typeof createWriteStream>; bytes: number; part: number; lines: number; file: string }>();
  readonly written: Array<{ file: string; lines: number }> = [];

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  async write(cell: string, line: unknown): Promise<void> {
    const text = `${JSON.stringify(line)}\n`;
    let state = this.parts.get(cell);
    if (state && state.bytes + text.length > LINK_PART_UNCOMPRESSED) {
      await this.finish(cell);
      state = this.open(cell, state.part + 1);
    }
    if (!state) state = this.open(cell, 1);
    state.bytes += text.length;
    state.lines += 1;
    if (!state.gzip.write(text)) await once(state.gzip, "drain");
  }

  private open(cell: string, part: number) {
    const file = path.join(this.dir, part === 1 ? `${cell}.jsonl.gz` : `${cell}.p${part}.jsonl.gz`);
    const gzip = createGzip({ level: 9 });
    const out = createWriteStream(file);
    gzip.pipe(out);
    const state = { gzip, out, bytes: 0, part, lines: 0, file };
    this.parts.set(cell, state);
    return state;
  }

  private async finish(cell: string): Promise<void> {
    const state = this.parts.get(cell);
    if (!state) return;
    state.gzip.end();
    await once(state.out, "finish");
    this.written.push({ file: state.file, lines: state.lines });
    this.parts.delete(cell);
  }

  async close(): Promise<void> {
    for (const cell of [...this.parts.keys()].sort()) await this.finish(cell);
  }
}

export async function sha256File(file: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    bytes += (chunk as Buffer).length;
    hash.update(chunk as Buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

export async function* readJsonlGz<T>(file: string): AsyncGenerator<T> {
  const input = createReadStream(file).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let number = 0;
  try {
    for await (const line of lines) {
      number += 1;
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as T;
      } catch {
        throw new Error(`${file}: line ${number} is not JSON`);
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export function readLinksIndex(dataRoot: string): LinksIndex | null {
  const file = path.join(dataRoot, LINKS_DIR, "index.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as LinksIndex;
}

/** Link files of one family, sorted, relative to the data root. */
export function linkFiles(dataRoot: string, family: typeof CLUSTER_DIR | typeof POSSIBLE_DIR): string[] {
  const dir = path.join(dataRoot, LINKS_DIR, family);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => LINK_FILE_PATTERN.test(name))
    .sort()
    .map((name) => `${LINKS_DIR}/${family}/${name}`);
}

/**
 * Every line of one link family in the committed files. Each file is checked
 * against index.json (size, SHA-256 and line count); a file that does not
 * match, a file the index does not list, or a listed file that is missing
 * throws, so nothing is ever computed from part of the links.
 */
export async function* readLinkFamily<T>(dataRoot: string, family: typeof CLUSTER_DIR | typeof POSSIBLE_DIR): AsyncGenerator<T> {
  const index = readLinksIndex(dataRoot);
  const files = linkFiles(dataRoot, family);
  if (!index) {
    if (files.length > 0) throw new Error("data/links has link files but no index.json");
    return;
  }
  const prefix = `${LINKS_DIR}/${family}/`;
  for (const entry of index.files) {
    if (entry.path.startsWith(prefix) && !files.includes(entry.path)) {
      throw new Error(`${entry.path} is listed in data/links/index.json but missing`);
    }
  }
  const listed = new Map(index.files.map((entry) => [entry.path, entry]));
  for (const relative of files) {
    const entry = listed.get(relative);
    if (!entry) throw new Error(`${relative} is not listed in data/links/index.json`);
    const actual = await sha256File(path.join(dataRoot, relative));
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) throw new Error(`${relative} does not match data/links/index.json`);
    let lines = 0;
    for await (const line of readJsonlGz<T>(path.join(dataRoot, relative))) {
      lines += 1;
      yield line;
    }
    if (lines !== entry.lines) throw new Error(`${relative} has ${lines} lines; index.json says ${entry.lines}`);
  }
}

export function readClusters(dataRoot: string): AsyncGenerator<ClusterLine> {
  return readLinkFamily<ClusterLine>(dataRoot, CLUSTER_DIR);
}

export function readPossibleDuplicates(dataRoot: string): AsyncGenerator<PossibleLine> {
  return readLinkFamily<PossibleLine>(dataRoot, POSSIBLE_DIR);
}

/** Directories holding place records. */
export const PLACE_DATA_DIRS = ["venues", "washrooms", "transit"] as const;

/** Place record files under the data root, relative, sorted. */
export function placeDataFiles(dataRoot: string): string[] {
  const out: string[] = [];
  for (const dir of PLACE_DATA_DIRS) {
    const root = path.join(dataRoot, dir);
    if (!existsSync(root)) continue;
    for (const source of readdirSync(root).sort()) {
      const sourceDir = path.join(root, source);
      for (const name of readdirSync(sourceDir).sort()) if (name.endsWith(".ndjson.gz")) out.push(`${dir}/${source}/${name}`);
    }
  }
  return out.sort();
}

/**
 * Digest of the place record files: sha256 over "relative-path sha256" lines,
 * sorted by path. The matcher stores it in index.json as input_digest; the
 * count and the pack compare it with the data they read, to say whether the
 * links are current.
 */
export async function placeDataDigest(dataRoot: string, relativeFiles: readonly string[] = placeDataFiles(dataRoot)): Promise<string> {
  const digest = createHash("sha256");
  for (const relative of [...relativeFiles].sort()) {
    digest.update(`${relative} ${(await sha256File(path.join(dataRoot, relative))).sha256}\n`);
  }
  return digest.digest("hex");
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
