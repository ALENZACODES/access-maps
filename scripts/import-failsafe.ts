/**
 * Runs the steps of scripts/import-all.ts one at a time. A step that throws
 * (an HTTP error, a missing download, a parse error in one feed) is recorded
 * and the next step still runs; the source directories it was replacing keep
 * their last known-good files. Ends with .cache/failsafe/run-report.json.
 *
 * Exit code: 0 when every step ran (contained faults are in the report),
 * 1 when a step failed. Add --strict to also exit 1 when anything was
 * quarantined or kept back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseImportPlan, runIsolated, type StepResult } from "../src/failsafe/isolate.js";
import { failsafeLog } from "../src/failsafe/report.js";

export async function importWithFailsafe(repoRoot: string, planFile = path.join(repoRoot, "scripts", "import-all.ts")): Promise<StepResult[]> {
  const plan = parseImportPlan(readFileSync(planFile, "utf8"));
  const log = failsafeLog();
  const results: StepResult[] = [];
  for (const step of plan) {
    const result = await runIsolated(step.name, async () => {
      const loaded = (await import(pathToFileURL(path.resolve(path.dirname(planFile), step.module.replace(/\.js$/, ".ts"))).href)) as Record<string, unknown>;
      const run = loaded[step.name];
      if (typeof run !== "function") throw new Error(`${step.module} does not export ${step.name}`);
      await (run as (root: string) => Promise<unknown>)(repoRoot);
    }, log);
    results.push(result);
    console.log(JSON.stringify({ step: step.name, ok: result.ok, ...(result.error ? { error: result.error.slice(0, 300) } : {}) }));
  }
  if (results.some((result) => !result.ok)) log.fail();
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await importWithFailsafe(process.cwd());
  const log = failsafeLog();
  const file = log.write();
  const report = log.report;
  const kept = report.outcomes.filter((outcome) => outcome.status === "kept_last_known_good");
  console.log(JSON.stringify({ status: report.status, steps_failed: results.filter((result) => !result.ok).map((result) => result.step), quarantined: report.quarantined.total, kept_last_known_good: kept.map((outcome) => outcome.target), report: file }));
  const strict = process.argv.includes("--strict");
  process.exit(results.some((result) => !result.ok) || (strict && report.status !== "clean") ? 1 : 0);
}
