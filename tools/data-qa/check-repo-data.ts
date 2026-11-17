/**
 * CLI for the pack/registry checkStrictData gate.
 * Usage: tsx tools/data-qa/check-repo-data.ts
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { checkRepoData } from "./repo-check.js";
import { reportStaleAndMissingLicences } from "./stale-licence-report.js";

/**
 * The day a retrieval date is checked against: a registry date after it is reported as a
 * future date. It is the current UTC date when the check runs, never a fixed day. UTC is
 * used because it is never behind the Ontario date, so a source retrieved today in Ontario
 * always passes. ACCESS_LICENCE_AS_OF (YYYY-MM-DD) overrides it, for example with the
 * commit date in CI.
 */
export function licenceAsOf(now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ACCESS_LICENCE_AS_OF?.trim();
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`ACCESS_LICENCE_AS_OF must be YYYY-MM-DD, got ${override}`);
    return override;
  }
  return now.toISOString().slice(0, 10);
}

export async function main(root = process.cwd(), asOf: string = licenceAsOf()): Promise<number> {
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
    { asOf, maxAgeDays: 365 },
  );
  const summary = {
    registry: report.registry,
    packRecords: report.packRecords,
    files: report.files,
    documentedLicenceHits: report.documentedLicenceHits,
    violations: report.violations.length,
    licenceBlocking: diagnostic.blocking.length,
    licenceReviewDue: diagnostic.review.length,
    licenceClean: diagnostic.clean,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (diagnostic.review.length > 0) {
    console.log(
      `INFORMATIONAL (licence still valid, due for review; maxAgeDays=${diagnostic.maxAgeDays}): ${diagnostic.review.length} source(s) over ${diagnostic.checked} registry sources.`,
    );
    for (const issue of diagnostic.review) {
      console.log(`  review: ${issue.source || `#${issue.index}`} — ${issue.en}`);
    }
  }
  const errors = [...report.violations];
  for (const issue of diagnostic.blocking) {
    errors.push(
      `${issue.source || `record ${issue.index}`}: ${issue.code} — ${issue.en}`,
    );
  }
  if (errors.length > 0) {
    for (const violation of errors.slice(0, 50)) console.error(violation);
    if (errors.length > 50) {
      console.error(`… and ${errors.length - 50} more`);
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
