import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { DEFAULT_OPTIONS, runAudit } from "./audit.js";
import { licenceChecks } from "./licences.js";
import { isSeedFile } from "./read.js";
import { renderAudit, renderLicenceChecks } from "./report.js";
import type { AuditOptions, CrossCheckEntry } from "./types.js";

interface Parsed {
  positional: string[];
  flags: Map<string, string>;
}

export function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
      flags.set(arg.slice(2), value);
      index += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function collect(path: string, out: string[]): Promise<void> {
  const info = await stat(path);
  if (info.isFile()) {
    if (isSeedFile(path)) out.push(path);
    return;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    await collect(join(path, entry.name), out);
  }
}

const RESULTS = new Set(["agrees", "disagrees", "not-in-second-source"]);

export function parseCrossCheck(value: unknown): CrossCheckEntry[] {
  if (!Array.isArray(value)) throw new Error("The cross-check file must be a JSON array.");
  return value.map((item, index) => {
    const entry = item as Partial<CrossCheckEntry>;
    const missing = (["recordId", "field", "secondSource", "secondValue", "result", "checkedOn"] as const).filter(
      (key) => typeof entry[key] !== "string" || entry[key]!.trim() === "",
    );
    if (missing.length) throw new Error(`Cross-check entry ${index + 1} is missing ${missing.join(", ")}.`);
    if (!RESULTS.has(entry.result!)) throw new Error(`Cross-check entry ${index + 1} has result "${entry.result}".`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checkedOn!)) throw new Error(`Cross-check entry ${index + 1} needs checkedOn as YYYY-MM-DD.`);
    return entry as CrossCheckEntry;
  });
}

function datedOption(flags: Map<string, string>): string {
  const date = flags.get("date") ?? DEFAULT_OPTIONS.auditDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD.");
  return date;
}

async function emit(outDir: string | undefined, base: string, json: unknown, markdown: string): Promise<void> {
  if (!outDir) {
    process.stdout.write(`${markdown}\n`);
    return;
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${base}.json`), `${JSON.stringify(json, null, 2)}\n`);
  await writeFile(join(outDir, `${base}.md`), `${markdown}\n`);
  process.stdout.write(`Wrote ${join(outDir, `${base}.json`)} and ${join(outDir, `${base}.md`)}\n`);
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  if (command === "audit") {
    if (positional.length === 0) throw new Error("Give at least one seed file or directory.");
    const root = resolve(flags.get("root") ?? process.cwd());
    const paths: string[] = [];
    for (const item of positional) await collect(resolve(item), paths);
    if (paths.length === 0) throw new Error("No .ndjson, .jsonl, .ndjson.gz, or .json seed files were found.");
    const overrides: Partial<AuditOptions> = { auditDate: datedOption(flags) };
    if (flags.has("seed")) overrides.seed = flags.get("seed")!;
    if (flags.has("sample")) {
      const size = Number(flags.get("sample"));
      if (!Number.isInteger(size) || size < 1) throw new Error("--sample must be a positive whole number.");
      overrides.samplePerFile = size;
    }
    if (flags.has("sample-by")) {
      const by = flags.get("sample-by");
      if (by !== "file" && by !== "directory") throw new Error("--sample-by must be file or directory.");
      overrides.sampleBy = by;
    }
    if (flags.has("fields")) overrides.fieldList = JSON.parse(await readFile(flags.get("fields")!, "utf8"));
    const reported = flags.has("counts") ? JSON.parse(await readFile(flags.get("counts")!, "utf8")) : undefined;
    const crossCheck = flags.has("cross-check") ? parseCrossCheck(JSON.parse(await readFile(flags.get("cross-check")!, "utf8"))) : [];
    const report = await runAudit(
      { files: paths.map((path) => ({ path, label: relative(root, path).split(sep).join("/") })), reported, crossCheck },
      overrides,
    );
    await emit(flags.get("out"), "seed-deep-sample", report, renderAudit(report));
    const blockers = report.defects.some((defect) => defect.severity === "blocker");
    const mismatched = report.reconciliation.some((row) => !row.matches);
    return blockers || mismatched ? 1 : 0;
  }
  if (command === "licences") {
    const [registryPath] = positional;
    if (!registryPath) throw new Error("Give the source registry JSON file.");
    const date = datedOption(flags);
    const maxAge = Number(flags.get("max-age") ?? 90);
    if (!Number.isInteger(maxAge) || maxAge < 1) throw new Error("--max-age must be a positive whole number of days.");
    const checks = licenceChecks(JSON.parse(await readFile(registryPath, "utf8")), date, maxAge);
    await emit(flags.get("out"), "licence-rechecks", { format: "licence-rechecks-1.0.0", openedOn: date, checks }, renderLicenceChecks(checks, date));
    return 0;
  }
  throw new Error("Usage: cli.ts audit <files or dirs> [--counts counts.json] [--cross-check entries.json] [--fields fields.json] [--seed text] [--sample 20] [--sample-by file|directory] [--date YYYY-MM-DD] [--root dir] [--out dir]\n       cli.ts licences <registry.json> [--date YYYY-MM-DD] [--max-age 90] [--out dir]");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(2);
    },
  );
}
