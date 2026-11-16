/**
 * CLI for the pack/registry checkStrictData gate.
 * Usage: tsx tools/data-qa/check-repo-data.ts
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { checkRepoData } from "./repo-check.js";
import { reportStaleAndMissingLicences } from "./stale-licence-report.js";

export async function main(root = process.cwd()): Promise<number> {
  const resolvedRoot = path.resolve(root);
  const report = await checkRepoData({ root: resolvedRoot });
  const registryPath = path.join(resolvedRoot, "sources", "registry.json");
  const registryJson = JSON.parse(readFileSync(registryPath, "utf8")) as {
    sources?: Array<{ id?: string; licence_id?: string; retrieved_at?: string }>;
  };
  const diagnostic = reportStaleAndMissingLicences(
    (registryJson.sources ?? []).map((source) => ({
      source: source.id ?? "",
      licence: source.licence_id ?? "",
      observedOn: source.retrieved_at ?? "",
    })),
    { asOf: "2026-11-15", maxAgeDays: 3650 },
  );
  const summary = {
    registry: report.registry,
    packRecords: report.packRecords,
    files: report.files,
    documentedLicenceHits: report.documentedLicenceHits,
    violations: report.violations.length,
    staleLicenceIssues: diagnostic.issues.length,
    staleLicenceClean: diagnostic.clean,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (diagnostic.issues.length > 0) {
    console.log(
      `Stale-date/licence diagnostic (informational, maxAgeDays=${diagnostic.maxAgeDays}): ${diagnostic.issues.length} issue(s) over ${diagnostic.checked} registry sources.`,
    );
  }
  if (report.violations.length > 0) {
    for (const violation of report.violations.slice(0, 50)) console.error(violation);
    if (report.violations.length > 50) {
      console.error(`… and ${report.violations.length - 50} more`);
    }
    return 1;
  }
  return 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const code = await main();
  process.exit(code);
}
