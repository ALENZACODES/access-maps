import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Where quarantine and run reports go. `.cache/` is gitignored, so nothing
 * here is ever committed with the data. Override with ACCESS_FAILSAFE_DIR.
 */
export function failsafeDir(cwd = process.cwd()): string {
  return path.resolve(process.env.ACCESS_FAILSAFE_DIR ?? path.join(cwd, ".cache", "failsafe"));
}

/** Smallest share of the last known-good record count a refreshed source may return. */
export function minKeepRatio(): number {
  const raw = Number(process.env.ACCESS_FAILSAFE_MIN_RATIO ?? "0.5");
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
}

/** Sources a person has said may shrink past the guard on this run (comma-separated source ids). */
export function allowedDrops(): Set<string> {
  return new Set((process.env.ACCESS_FAILSAFE_ALLOW_DROP ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

export interface QuarantineEntry {
  stage: "import" | "pack" | "tiles";
  source_id: string;
  tranche?: string;
  id?: string;
  file?: string;
  code: string;
  reason: string;
  /** The scrubbed record, or the first 2,000 characters of a line that did not parse. */
  record?: unknown;
}

export type OutcomeStatus =
  | "replaced"
  | "appended"
  | "unchanged"
  | "kept_last_known_good"
  | "unreadable_replaced"
  | "withheld"
  | "step_failed";

export interface Outcome {
  step: string;
  source_id?: string;
  target?: string;
  status: OutcomeStatus;
  reason?: string;
  before?: number;
  after?: number;
  files?: Array<{ path: string; bytes: number; sha256: string; records: number }>;
}

export interface RunReport {
  started_at: string;
  finished_at?: string;
  status: "clean" | "contained" | "failed";
  quarantined: { total: number; by_source: Record<string, Record<string, number>> };
  outcomes: Outcome[];
}

const MAX_RAW = 2000;

function trimRecord(record: unknown): unknown {
  if (typeof record === "string") return record.length > MAX_RAW ? `${record.slice(0, MAX_RAW)}…` : record;
  const text = JSON.stringify(record);
  if (text !== undefined && text.length > 200_000) return { truncated: true, first_characters: text.slice(0, MAX_RAW) };
  return record;
}

/**
 * One report per process run. Quarantined records are appended to
 * quarantine.ndjson as they happen; the summary is written to
 * run-report.json through a temporary file and a rename.
 */
export class FailsafeLog {
  readonly report: RunReport;
  private readonly dir: string;
  private quarantineReady = false;

  constructor(dir = failsafeDir()) {
    this.dir = dir;
    this.report = { started_at: new Date().toISOString(), status: "clean", quarantined: { total: 0, by_source: {} }, outcomes: [] };
  }

  get quarantineFile(): string { return path.join(this.dir, "quarantine.ndjson"); }
  get reportFile(): string { return path.join(this.dir, "run-report.json"); }

  quarantine(entry: QuarantineEntry): void {
    const bySource = (this.report.quarantined.by_source[entry.source_id] ??= {});
    bySource[entry.code] = (bySource[entry.code] ?? 0) + 1;
    this.report.quarantined.total += 1;
    if (this.report.status === "clean") this.report.status = "contained";
    if (!this.quarantineReady) {
      mkdirSync(this.dir, { recursive: true });
      this.quarantineReady = true;
    }
    const line = { run: this.report.started_at, at: new Date().toISOString(), ...entry, record: trimRecord(entry.record) };
    appendFileSync(this.quarantineFile, `${JSON.stringify(line)}\n`);
  }

  outcome(outcome: Outcome): void {
    this.report.outcomes.push(outcome);
    if (outcome.status === "kept_last_known_good" || outcome.status === "step_failed" || outcome.status === "unreadable_replaced" || outcome.status === "withheld") {
      if (this.report.status === "clean") this.report.status = "contained";
    }
  }

  fail(): void { this.report.status = "failed"; }

  write(): string {
    this.report.finished_at = new Date().toISOString();
    mkdirSync(this.dir, { recursive: true });
    const temp = `${this.reportFile}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.report, null, 2)}\n`);
    renameSync(temp, this.reportFile);
    return this.reportFile;
  }
}

let shared: FailsafeLog | undefined;

/** The log for this process. Importers, the pack builder and the tile builder all write to it. */
export function failsafeLog(): FailsafeLog {
  if (!shared) {
    shared = new FailsafeLog();
    // A run started outside scripts/import-failsafe.ts still leaves its report behind.
    if (!process.env.VITEST) {
      process.once("exit", () => {
        const log = shared;
        if (log && (log.report.outcomes.length > 0 || log.report.quarantined.total > 0) && !log.report.finished_at) {
          try { log.write(); } catch { /* reporting must never turn a finished run into a failed one */ }
        }
      });
    }
  }
  return shared;
}

/** Tests and the import wrapper start a fresh log. */
export function resetFailsafeLog(dir?: string): FailsafeLog {
  shared = new FailsafeLog(dir);
  return shared;
}
