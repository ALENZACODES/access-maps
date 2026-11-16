import { abandonOpenWriters } from "../io/partition-writer.js";
import { failsafeLog, type FailsafeLog } from "./report.js";

export interface ImportStep {
  /** Exported function name, for example importMunicipal. */
  name: string;
  /** Module specifier as written in import-all.ts, for example ./import-municipal.js. */
  module: string;
}

/**
 * Reads the steps of scripts/import-all.ts without running it: every
 * `await name(repoRoot)` call, in order, with the module it is imported from.
 * Reading the plan from that file keeps one list of importers, owned by the
 * import lanes.
 */
export function parseImportPlan(source: string): ImportStep[] {
  const modules = new Map<string, string>();
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const name of (match[1] ?? "").split(",").map((item) => item.trim().split(/\s+as\s+/).pop()?.trim() ?? "")) {
      if (name) modules.set(name, match[2] ?? "");
    }
  }
  const steps: ImportStep[] = [];
  for (const match of source.matchAll(/^\s*await\s+([A-Za-z_$][\w$]*)\s*\(\s*repoRoot\s*\)\s*;?\s*$/gm)) {
    const name = match[1] ?? "";
    const module = modules.get(name);
    if (!module) throw new Error(`import-all.ts calls ${name} but does not import it`);
    steps.push({ name, module });
  }
  if (steps.length === 0) throw new Error("no `await step(repoRoot)` calls found in import-all.ts");
  return steps;
}

export interface StepResult {
  step: string;
  ok: boolean;
  error?: string;
  kept?: string[];
}

/**
 * Runs one step. If it throws, every writer it left open is abandoned, so the
 * source directories it was replacing keep their last known-good files, and
 * the next step still runs.
 */
export async function runIsolated(step: string, run: () => Promise<unknown>, log: FailsafeLog = failsafeLog()): Promise<StepResult> {
  try {
    await run();
    return { step, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kept = await abandonOpenWriters(`${step} failed: ${message}`);
    log.outcome({ step, status: "step_failed", reason: message.slice(0, 500) });
    for (const target of kept) {
      log.outcome({ step, source_id: target.split("/")[1], target, status: "kept_last_known_good", reason: `${step} failed before this source was written` });
    }
    return { step, ok: false, error: message, kept };
  }
}
