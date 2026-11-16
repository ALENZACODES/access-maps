import { PartitionWriter } from "../io/partition-writer.js";
import { TRANCHE_DIR, type Tranche } from "../model/records.js";
import { runIsolated } from "./isolate.js";
import { failsafeLog, type FailsafeLog } from "./report.js";

export interface SourceFailure {
  source_id: string;
  error: string;
  /** Source directories that kept their last known-good files. */
  kept: string[];
}

/**
 * Runs the sources of one importer one at a time, each with its own
 * PartitionWriter inside runIsolated. A source that throws (an HTTP error, a
 * missing download, a parse error, a duplicate id) is abandoned on its own:
 * its directories keep their last known-good files and are reported, and the
 * next source still runs and is written. Sources that finished are committed
 * as soon as they finish, so a later failure cannot hold them back.
 *
 * Call finish() after the loop: it throws once, naming every failed source,
 * so the import step is still marked failed in the run report and the exit
 * code, after every other source has landed.
 */
export class PerSourceRun {
  readonly failures: SourceFailure[] = [];
  private attempted = 0;

  constructor(
    private readonly step: string,
    private readonly dataRoot: string,
    private readonly log?: FailsafeLog,
  ) {}

  /**
   * Runs one source. `tranches` are the tranches the source writes; they name
   * the directories reported as kept when the source fails before it marked
   * them. Returns the job's result, or undefined when the source failed.
   */
  async source<T>(sourceId: string, tranches: readonly Tranche[], job: (writer: PartitionWriter) => Promise<T>): Promise<T | undefined> {
    this.attempted += 1;
    const log = this.log ?? failsafeLog();
    let value: T | undefined;
    const result = await runIsolated(`${this.step}/${sourceId}`, async () => {
      const writer = new PartitionWriter(this.dataRoot);
      value = await job(writer);
      await writer.close();
    }, log);
    if (result.ok) return value;
    const kept = new Set(result.kept ?? []);
    for (const tranche of tranches) {
      const target = `${TRANCHE_DIR[tranche]}/${sourceId}`;
      if (kept.has(target)) continue;
      kept.add(target);
      log.outcome({ step: `${this.step}/${sourceId}`, source_id: sourceId, target, status: "kept_last_known_good", reason: `${sourceId} failed before it was written; its previous files were not touched` });
    }
    this.failures.push({ source_id: sourceId, error: result.error ?? "unknown error", kept: [...kept].sort() });
    return undefined;
  }

  /** Throws when any source failed. Every other source has already been written. */
  finish(): void {
    if (this.failures.length === 0) return;
    const detail = this.failures.map((failure) => `${failure.source_id} (${failure.error.slice(0, 200)})`).join("; ");
    throw new Error(`${this.step}: ${this.failures.length} of ${this.attempted} sources failed and kept their last known-good files: ${detail}`);
  }
}
