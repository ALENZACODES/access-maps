/** Explicit local-file gate for bilingual offline publication parity. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOfflineBundleJson } from "./offline-bundle.js";
import { auditBilingualParity, parseParityPlanJson, type ParityResult } from "./offline-parity.js";
import { compareBilingualReleases, type ParityComparison } from "./offline-parity-change.js";
import { renderParityReport, type ParityLocale } from "./offline-parity-report.js";

export type OutputFormat = "text" | "html" | "json";
export interface ParityCliOptions {
  readonly bundleFile: string;
  readonly parityFile: string;
  readonly beforeBundleFile: string | null;
  readonly beforeParityFile: string | null;
  readonly locale: ParityLocale;
  readonly format: OutputFormat;
}
export interface ParityCliResult {
  readonly status: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
  readonly report: ParityResult | null;
  readonly comparison: ParityComparison | null;
}
export class ParityCliError extends Error {
  constructor(message: string) { super(message); this.name = "ParityCliError"; }
}
export const PARITY_USAGE = [
  "Usage: offline-parity-cli <bundle.json> <pairs.json> [--lang en|fr] [--format text|html|json]",
  "       offline-parity-cli <bundle.json> <pairs.json> --before-bundle old.json --before-pairs old-pairs.json",
  "Checks explicit bilingual publication pairs against local source, licence and route evidence.",
  "Exit 0 means no blockers; exit 1 means a release blocker; exit 2 means invalid input.",
].join("\n");
function nextValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new ParityCliError(`Missing value for ${flag}`);
  return value;
}
export function parseParityCliArguments(args: readonly string[]): ParityCliOptions {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) throw new ParityCliError(PARITY_USAGE);
  const positional: string[] = [];
  const used = new Set<string>();
  let locale: ParityLocale = "en";
  let format: OutputFormat = "text";
  let beforeBundleFile: string | null = null;
  let beforeParityFile: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (!item) throw new ParityCliError("Empty argument");
    if (["--lang", "--format", "--before-bundle", "--before-pairs"].includes(item)) {
      if (used.has(item)) throw new ParityCliError(`Repeated option: ${item}`);
      used.add(item);
      const value = nextValue(args, i, item);
      i += 1;
      if (item === "--lang") {
        if (value !== "en" && value !== "fr") throw new ParityCliError("Language must be en or fr");
        locale = value;
      } else if (item === "--format") {
        if (value !== "text" && value !== "html" && value !== "json") throw new ParityCliError("Format must be text, html or json");
        format = value;
      } else if (item === "--before-bundle") beforeBundleFile = value;
      else beforeParityFile = value;
    } else if (item.startsWith("-")) throw new ParityCliError(`Unknown option: ${item}`);
    else positional.push(item);
  }
  if (positional.length !== 2) throw new ParityCliError("Expected a bundle and pairs JSON file");
  if ((beforeBundleFile === null) !== (beforeParityFile === null)) {
    throw new ParityCliError("Both baseline arguments are required together");
  }
  const bundleFile = positional[0];
  const parityFile = positional[1];
  if (!bundleFile || !parityFile) throw new ParityCliError("Missing file path");
  return { bundleFile, parityFile, beforeBundleFile, beforeParityFile, locale, format };
}
async function readBounded(file: string, max: number): Promise<string> {
  const path = resolve(file);
  const { stat } = await import("node:fs/promises");
  const info = await stat(path);
  if (!info.isFile()) throw new ParityCliError(`Not a regular file: ${path}`);
  if (info.size > max) throw new ParityCliError(`Input file exceeds limit: ${path}`);
  const content = await readFile(path, "utf8");
  if (Buffer.byteLength(content, "utf8") > max) throw new ParityCliError(`Input file exceeds limit: ${path}`);
  return content;
}
export async function executeParityCli(args: readonly string[]): Promise<ParityCliResult> {
  let options: ParityCliOptions;
  try { options = parseParityCliArguments(args); }
  catch (error) {
    return { status: 2, stdout: "", stderr: error instanceof Error ? error.message : "Invalid arguments", report: null, comparison: null };
  }
  try {
    const bundle = parseOfflineBundleJson(await readBounded(options.bundleFile, 8_388_608));
    const plan = parseParityPlanJson(await readBounded(options.parityFile, 1_048_576));
    const report = auditBilingualParity(bundle, plan);
    let comparison: ParityComparison | null = null;
    if (options.beforeBundleFile && options.beforeParityFile) {
      const beforeBundle = parseOfflineBundleJson(await readBounded(options.beforeBundleFile, 8_388_608));
      const beforePlan = parseParityPlanJson(await readBounded(options.beforeParityFile, 1_048_576));
      comparison = compareBilingualReleases(beforeBundle, beforePlan, bundle, plan);
    }
    const rendered = renderParityReport(bundle, plan, report, options.locale, comparison ?? undefined);
    return { status: report.blocked || comparison?.blocked ? 1 : 0, stdout: rendered[options.format], stderr: "", report, comparison };
  } catch (error) {
    return { status: 2, stdout: "", stderr: error instanceof Error ? error.message : "Cannot inspect bilingual parity", report: null, comparison: null };
  }
}
function isEntrypoint(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  return resolve(arg) === fileURLToPath(import.meta.url);
}
if (isEntrypoint()) {
  void executeParityCli(process.argv.slice(2)).then(({ status, stdout, stderr }) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode = status;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Cannot inspect bilingual parity"}\n`);
    process.exitCode = 2;
  });
}
