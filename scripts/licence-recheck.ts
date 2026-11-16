import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRegistry } from "../src/registry.js";
import {
  buildRegister,
  isIsoDate,
  registerMarkdown,
  subjectsOf,
  validateLog,
  type GapEntry,
  type RecheckLogEntry,
} from "../src/licence/recheck.js";
import { TILES_HELD_FOR_LEGAL_REVIEW } from "./build-pmtiles.js";

/**
 * Usage: npm run licence:recheck -- --as-of YYYY-MM-DD [--format md|json] [--fail-on-overdue]
 * Reads only files in this repository. It does not call the network.
 */
export function run(argv: string[], repoRoot: string): { code: number; out: string; err: string } {
  let asOf = "";
  let format = "md";
  let failOnOverdue = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--as-of") { asOf = argv[i + 1] ?? ""; i += 1; }
    else if (arg === "--format") { format = argv[i + 1] ?? ""; i += 1; }
    else if (arg === "--fail-on-overdue") failOnOverdue = true;
    else return { code: 2, out: "", err: `unknown argument ${arg}\n` };
  }
  if (!isIsoDate(asOf) || (format !== "md" && format !== "json")) {
    return { code: 2, out: "", err: "usage: licence-recheck --as-of YYYY-MM-DD [--format md|json] [--fail-on-overdue]\n" };
  }
  const registry = readRegistry(repoRoot);
  const gaps = JSON.parse(readFileSync(path.join(repoRoot, "sources", "gaps.json"), "utf8")) as GapEntry[];
  const log = JSON.parse(readFileSync(path.join(repoRoot, "sources", "licence-rechecks.json"), "utf8")) as unknown;
  const issues = validateLog(log, subjectsOf(registry, gaps), asOf);
  if (issues.length > 0) {
    return {
      code: 1,
      out: "",
      err: issues.map((issue) => `sources/licence-rechecks.json entry ${issue.index} ${issue.field}: ${issue.message}`).join("\n") + "\n",
    };
  }
  const register = buildRegister(registry, gaps, log as RecheckLogEntry[], { asOf, heldFromTiles: TILES_HELD_FOR_LEGAL_REVIEW });
  const out = format === "md" ? registerMarkdown(register) : `${JSON.stringify(register, null, 2)}\n`;
  return { code: failOnOverdue && register.overdue > 0 ? 1 : 0, out, err: "" };
}

const invoked = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invoked) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = run(process.argv.slice(2), root);
  process.stdout.write(result.out);
  process.stderr.write(result.err);
  process.exitCode = result.code;
}
