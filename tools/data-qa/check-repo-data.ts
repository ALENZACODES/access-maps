/**
 * CLI for the pack/registry checkStrictData gate.
 * Usage: tsx tools/data-qa/check-repo-data.ts
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkRepoData } from "./repo-check.js";

export async function main(root = process.cwd()): Promise<number> {
  const report = await checkRepoData({ root: path.resolve(root) });
  const summary = {
    registry: report.registry,
    packRecords: report.packRecords,
    files: report.files,
    documentedLicenceHits: report.documentedLicenceHits,
    violations: report.violations.length,
  };
  console.log(JSON.stringify(summary, null, 2));
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
