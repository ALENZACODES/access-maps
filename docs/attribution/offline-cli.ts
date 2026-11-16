/** Offline-bundle release gate. Reads local files; does not write or fetch. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditOfflineBundle, parseOfflineBundleJson, type OfflineBundle } from "./offline-bundle.js";
import { auditBundleFiles } from "./offline-files.js";
import { makeOfflineReport, type OfflineLocale } from "./offline-report.js";

export type OfflineFormat = "text" | "html" | "json";
export interface OfflineCliOptions {
  readonly manifest: string;
  readonly root: string | null;
  readonly locale: OfflineLocale;
  readonly format: OfflineFormat;
  readonly allowOnline: boolean;
}
export interface OfflineCliResult {
  readonly status: 0 | 1 | 2;
  readonly output: string;
  readonly error: string;
}
export class OfflineCliError extends Error {
  constructor(message: string) { super(message); this.name = "OfflineCliError"; }
}
const USAGE = [
  "Usage: offline-cli <bundle.json> [--root <directory>] [--lang en|fr] [--format text|json|html] [--allow-online]",
  "The manifest is local JSON. --root additionally checks actual files and SHA-256 digests.",
  "Exit 0: no blocking gaps, 1: release blocked, 2: invalid input or file error.",
].join("\n");
function optionValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new OfflineCliError(`Missing value for ${flag}`);
  return value;
}
export function parseOfflineCliArguments(args: readonly string[]): OfflineCliOptions {
  if (args.length === 0 || args.includes("--help")) throw new OfflineCliError(USAGE);
  let manifest: string | undefined;
  let root: string | null = null;
  let locale: OfflineLocale = "en";
  let format: OfflineFormat = "text";
  let allowOnline = false;
  const used = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--root" || arg === "--lang" || arg === "--format") {
      if (used.has(arg)) throw new OfflineCliError(`Repeated argument ${arg}`);
      used.add(arg);
      const value = optionValue(args, i, arg);
      i += 1;
      if (arg === "--root") root = value;
      else if (arg === "--lang") {
        if (value !== "en" && value !== "fr") throw new OfflineCliError("Language must be en or fr");
        locale = value;
      } else {
        if (value !== "text" && value !== "html" && value !== "json") throw new OfflineCliError("Unknown output format");
        format = value;
      }
    } else if (arg === "--allow-online") {
      if (used.has(arg)) throw new OfflineCliError("Repeated --allow-online");
      used.add(arg); allowOnline = true;
    } else if (arg.startsWith("-")) throw new OfflineCliError(`Unknown option ${arg}`);
    else if (!manifest) manifest = arg;
    else throw new OfflineCliError("Expected one bundle JSON file");
  }
  if (!manifest) throw new OfflineCliError("Bundle manifest path is required");
  return {manifest, root, locale, format, allowOnline};
}
async function readBundle(file: string): Promise<OfflineBundle> {
  const content = await readFile(file, "utf8");
  return parseOfflineBundleJson(content);
}
/** Injected functions make exit behavior testable without modifying process globals. */
export async function executeOfflineCli(args: readonly string[]): Promise<OfflineCliResult> {
  let options: OfflineCliOptions;
  try { options = parseOfflineCliArguments(args); }
  catch (error) {
    return {status:2, output:"", error:error instanceof Error ? error.message : "Invalid arguments"};
  }
  try {
    const manifest = resolve(options.manifest);
    const bundle = await readBundle(manifest);
    const result = options.root === null
      ? auditOfflineBundle(bundle, !options.allowOnline)
      : await auditBundleFiles(bundle, resolve(options.root), {requireOffline: !options.allowOnline});
    const report = makeOfflineReport(bundle, result, options.locale);
    return {status: result.blocked ? 1 : 0, output:report[options.format], error:""};
  } catch (error) {
    return {status:2, output:"", error:error instanceof Error ? error.message : "Unable to inspect bundle"};
  }
}
/** Start only when executed as a script, never when imported by a test. */
function isEntrypoint(): boolean {
  const argv = process.argv[1];
  return typeof argv === "string" && resolve(argv) === fileURLToPath(import.meta.url);
}
if (isEntrypoint()) {
  void executeOfflineCli(process.argv.slice(2)).then((result) => {
    if (result.output) process.stdout.write(result.output);
    if (result.error) process.stderr.write(`${result.error}\n`);
    process.exitCode = result.status;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Unable to inspect bundle"}\n`);
    process.exitCode = 2;
  });
}
