import { once } from "node:events";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { createGzip, type Gzip } from "node:zlib";
import { TRANCHE_DIR, type DataRecord } from "../model/records.js";
import { countDirRecords, swapDirectory, verifyNdjsonGz, type VerifiedFile } from "../failsafe/files.js";
import { allowedDrops, failsafeLog, minKeepRatio, type Outcome } from "../failsafe/report.js";

interface OpenPart {
  gzip: Gzip;
  output: NodeJS.WritableStream;
}

interface PartState {
  filePath: string;
  stagedPath: string;
  uncompressed: number;
  part: number;
}

const MAX_GZIP_BYTES = 24 * 1024 * 1024;

/** Directories (for example `washrooms/toronto-park-washrooms`) whose next write replaces them, per data root. */
const pendingResets = new Map<string, Set<string>>();
const openWriters = new Set<PartitionWriter>();

/**
 * Marks a source directory to be replaced by what the next writer on the same
 * data root stages for it. Nothing is deleted here: the old directory stays the
 * last known-good copy until the new one has been written and verified.
 */
export function markForReplacement(dataRoot: string, relativeDir: string): void {
  const root = path.resolve(dataRoot);
  const marks = pendingResets.get(root) ?? new Set<string>();
  marks.add(relativeDir);
  pendingResets.set(root, marks);
}

/**
 * Drops writers that never reached close(), for example after an importer
 * threw on an HTTP error. Their staged files are deleted and the live data is
 * left exactly as it was. Returns the source directories that kept their last
 * known-good copy.
 */
export async function abandonOpenWriters(reason: string): Promise<string[]> {
  const kept: string[] = [];
  for (const writer of [...openWriters]) kept.push(...await writer.abandon(reason));
  for (const [root, marks] of pendingResets) {
    for (const dir of marks) if (!kept.includes(dir)) kept.push(dir);
    pendingResets.delete(root);
  }
  return [...new Set(kept)].sort();
}

/**
 * Writes gzip NDJSON partitioned by tranche, source, and region.
 * Reopening a region appends another gzip member to the same file.
 * A new part file starts only after the uncompressed budget is spent.
 *
 * Records are written to a staging directory first. close() reads every
 * staged file back (decompress, parse, count, hash) and only then moves it
 * into place. A file that fails, a source that returns no records, or a
 * source that shrinks below the keep ratio leaves the previous files in place
 * and is recorded in the failsafe run report.
 */
export class PartitionWriter {
  private readonly open = new Map<string, OpenPart>();
  private readonly openedOrder: string[] = [];
  private readonly states = new Map<string, PartState>();
  private readonly written = new Map<string, number>();
  private readonly writeErrors = new Map<string, string>();
  private readonly stagingRoot: string;
  private finished = false;
  readonly files: string[] = [];
  readonly outcomes: Outcome[] = [];

  constructor(
    private readonly root: string,
    private readonly maxUncompressed = 32_000_000,
    private readonly maxOpen = 256,
    private readonly maxGzipBytes = MAX_GZIP_BYTES,
  ) {
    const resolved = path.resolve(root);
    this.stagingRoot = path.join(path.dirname(resolved), ".cache", "failsafe", "staging", `${path.basename(resolved)}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    openWriters.add(this);
  }

  async write(record: DataRecord, sourceId: string): Promise<void> {
    if (this.finished) throw new Error("partition writer is closed");
    const directory = TRANCHE_DIR[record.tranche];
    const key = `${directory}/${sourceId}/${record.region}`;
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    let state = this.states.get(key);
    if (!state) {
      state = await this.newState(directory, sourceId, record.region, 1);
      this.states.set(key, state);
      this.files.push(state.filePath);
    }
    if (state.uncompressed > 0 && state.uncompressed + bytes > this.maxUncompressed) {
      await this.closeKey(key);
      const next = await this.newState(directory, sourceId, record.region, state.part + 1);
      Object.assign(state, next);
      this.files.push(state.filePath);
    }
    let part = this.open.get(key);
    if (!part) {
      if (this.open.size >= this.maxOpen) await this.closeKey(this.openedOrder[0] as string);
      part = this.openStream(state.stagedPath);
      this.open.set(key, part);
      this.openedOrder.push(key);
    }
    const ok = part.gzip.write(line);
    state.uncompressed += bytes;
    this.written.set(state.stagedPath, (this.written.get(state.stagedPath) ?? 0) + 1);
    if (!ok) await once(part.gzip, "drain");
  }

  /** Commits every verified source directory and leaves the rest as they were. Never throws for one bad file. */
  async close(): Promise<void> {
    if (this.finished) return;
    for (const key of [...this.open.keys()]) await this.closeKey(key);
    this.finished = true;
    openWriters.delete(this);
    const root = path.resolve(this.root);
    // The writer that closes next claims every replacement marked on its data root.
    const replaced = new Set<string>(pendingResets.get(root) ?? []);
    pendingResets.delete(root);
    const stagedDirs = new Set<string>();
    for (const file of this.written.keys()) stagedDirs.add(path.relative(this.stagingRoot, path.dirname(file)).split(path.sep).join("/"));
    try {
      for (const dir of [...new Set([...stagedDirs, ...replaced])].sort()) {
        let outcome: Outcome;
        try {
          outcome = await this.commitDir(dir, replaced.has(dir), stagedDirs.has(dir));
        } catch (error) {
          outcome = { step: "write", source_id: dir.split("/")[1], target: dir, status: "kept_last_known_good", reason: `commit failed: ${(error as Error).message}` };
        }
        this.outcomes.push(outcome);
        failsafeLog().outcome(outcome);
      }
    } finally {
      rmSync(this.stagingRoot, { recursive: true, force: true });
    }
  }

  /** Stops without committing anything. Used when the importer that owns this writer failed. */
  async abandon(reason: string): Promise<string[]> {
    if (this.finished) return [];
    for (const key of [...this.open.keys()]) {
      try { await this.closeKey(key); } catch { /* the staged files are deleted below either way */ }
    }
    this.finished = true;
    openWriters.delete(this);
    rmSync(this.stagingRoot, { recursive: true, force: true });
    const dirs = [...new Set([...this.written.keys()].map((file) => path.relative(this.stagingRoot, path.dirname(file)).split(path.sep).join("/")))];
    // The caller (runIsolated) records these in the run report.
    for (const dir of dirs) this.outcomes.push({ step: "write", source_id: dir.split("/")[1], target: dir, status: "kept_last_known_good", reason });
    return dirs;
  }

  private async commitDir(dir: string, replace: boolean, staged: boolean): Promise<Outcome> {
    const sourceId = dir.split("/")[1];
    const live = path.join(this.root, dir);
    const stagedDir = path.join(this.stagingRoot, dir);
    const base = { step: "write", source_id: sourceId, target: dir } as const;
    const files: VerifiedFile[] = [];
    if (staged) {
      for (const [stagedPath, count] of this.written) {
        if (path.dirname(stagedPath) !== stagedDir) continue;
        try {
          const writeError = this.writeErrors.get(stagedPath);
          if (writeError) throw new Error(`write failed: ${writeError}`);
          const verified = await verifyNdjsonGz(stagedPath);
          if (verified.records !== count) throw new Error(`wrote ${count} records but read back ${verified.records}`);
          if (verified.bytes > this.maxGzipBytes) throw new Error(`file is ${verified.bytes} bytes, over the ${this.maxGzipBytes} byte limit`);
          files.push({ ...verified, path: path.relative(stagedDir, stagedPath) });
        } catch (error) {
          return { ...base, status: "kept_last_known_good", reason: `${path.basename(stagedPath)}: ${(error as Error).message}` };
        }
      }
    }
    const after = files.reduce((sum, file) => sum + file.records, 0);
    if (!replace) {
      for (const file of files) {
        const target = path.join(live, file.path);
        mkdirSync(path.dirname(target), { recursive: true });
        renameSync(path.join(stagedDir, file.path), target);
      }
      return { ...base, status: "appended", after, files };
    }
    const before = (await countDirRecords(live)).records;
    if (after === 0) {
      if (before === 0) return { ...base, status: "unchanged", before, after };
      return { ...base, status: "kept_last_known_good", before, after, reason: "the source returned no records; the previous files were kept" };
    }
    const ratio = minKeepRatio();
    if (before > 0 && after < before * ratio && !allowedDrops().has(sourceId ?? "")) {
      return {
        ...base, status: "kept_last_known_good", before, after,
        reason: `the source returned ${after} records, under ${Math.round(ratio * 100)}% of the ${before} kept; set ACCESS_FAILSAFE_ALLOW_DROP=${sourceId} after checking the source`,
      };
    }
    swapDirectory(stagedDir, live);
    return { ...base, status: "replaced", before, after, files };
  }

  private async newState(directory: string, sourceId: string, region: string, part: number): Promise<PartState> {
    const suffix = part === 1 ? "" : `.p${String(part).padStart(2, "0")}`;
    const relative = path.join(directory, sourceId, `${region}${suffix}.ndjson.gz`);
    const state = { filePath: path.join(this.root, relative), stagedPath: path.join(this.stagingRoot, relative), uncompressed: 0, part };
    // A directory that is not being replaced keeps its existing records: the
    // staged file starts as a copy, and this run appends to it.
    const dir = path.join(directory, sourceId).split(path.sep).join("/");
    const replacing = pendingResets.get(path.resolve(this.root))?.has(dir) ?? false;
    if (!replacing && existsSync(state.filePath) && !existsSync(state.stagedPath)) {
      try {
        const existing = await verifyNdjsonGz(state.filePath);
        mkdirSync(path.dirname(state.stagedPath), { recursive: true });
        copyFileSync(state.filePath, state.stagedPath);
        this.written.set(state.stagedPath, existing.records);
      } catch (error) {
        // An unreadable existing file is not carried forward; this run's records replace it.
        failsafeLog().outcome({ step: "write", source_id: sourceId, target: relative, status: "unreadable_replaced", reason: `existing file was unreadable and is not appended to: ${(error as Error).message}` });
      }
    }
    return state;
  }

  private openStream(filePath: string): OpenPart {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const output = createWriteStream(filePath, { flags: "a" });
    const gzip = createGzip({ level: 9 });
    // A write error (disk full, a removed staging directory) must not crash the
    // process: the staged file then fails its read-back check in close().
    const failed = (error: Error) => this.writeErrors.set(filePath, error.message);
    output.on("error", failed);
    gzip.on("error", failed);
    gzip.pipe(output);
    return { gzip, output };
  }

  private async closeKey(key: string): Promise<void> {
    const part = this.open.get(key);
    if (!part) return;
    this.open.delete(key);
    const index = this.openedOrder.indexOf(key);
    if (index >= 0) this.openedOrder.splice(index, 1);
    part.gzip.end();
    if (this.writeErrors.size > 0 && (part.output as NodeJS.WritableStream & { destroyed?: boolean }).destroyed) return;
    await Promise.race([once(part.output, "finish"), once(part.output, "close")]);
  }
}
