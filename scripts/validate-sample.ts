import { createReadStream, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { readRegistry } from "../src/registry.js";
import { validationError, compileValidators } from "../src/validate/ajv.js";
import type { Tranche } from "../src/model/records.js";

const MAX_BYTES = 50 * 1024 * 1024;
const PER_FILE = 20;
const PER_TRANCHE = 100;

const repoRoot = process.cwd();
const validators = compileValidators(path.join(repoRoot, "schema"));
const registry = readRegistry(repoRoot);
for (const source of registry.sources) {
  const ok: boolean = validators.source(source);
  if (!ok) throw new Error(validationError(source.id, validators.source.errors));
}

const files = listNdjson(path.join(repoRoot, "data"));
if (files.length === 0) throw new Error("validate-sample found no data files");
for (const file of listPmtiles(path.join(repoRoot, "data"))) {
  const bytes = statSync(file).size;
  if (bytes >= MAX_BYTES) throw new Error(`${file} is ${bytes} bytes, at or over 50 MB`);
}
const seen: Record<Tranche, number> = { venue: 0, washroom: 0, path: 0, transit: 0 };
let checked = 0;
let alertsChecked = 0;
for (const file of files) {
  const bytes = statSync(file).size;
  if (bytes >= MAX_BYTES) throw new Error(`${file} is ${bytes} bytes, at or over 50 MB`);
  if (file.split(path.sep).includes("alerts")) {
    alertsChecked += await validateAlerts(file);
    continue;
  }
  const tranche = trancheOf(file);
  if (seen[tranche] >= PER_TRANCHE) continue;
  const stream = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let inFile = 0;
  for await (const line of stream) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as { id?: string; tranche?: Tranche };
    if (record.tranche !== tranche) throw new Error(`${file} contains tranche ${record.tranche}`);
    const validate = validators.records[tranche];
    const ok: boolean = validate(record);
    if (!ok) throw new Error(validationError(record.id ?? file, validate.errors));
    checked += 1;
    inFile += 1;
    seen[tranche] += 1;
    if (inFile >= PER_FILE || seen[tranche] >= PER_TRANCHE) break;
  }
  stream.close();
}
console.log(JSON.stringify({ checked, alertsChecked, seen, files: files.length, sources: registry.sources.length }));

async function validateAlerts(file: string): Promise<number> {
  const stream = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let count = 0;
  for await (const line of stream) {
    if (!line.trim()) continue;
    const parsed: unknown = JSON.parse(line);
    const id = parsed && typeof parsed === "object" && "id" in parsed && typeof parsed.id === "string" ? parsed.id : file;
    if (validators.alert(parsed) !== true) throw new Error(validationError(id, validators.alert.errors));
    count += 1;
    if (count >= 20) break;
  }
  stream.close();
  return count;
}

function listPmtiles(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".pmtiles")) found.push(full);
    }
  };
  walk(directory);
  return found;
}

function trancheOf(file: string): Tranche {
  const parts = file.split(path.sep);
  const folder = parts.find((part) => ["venues", "washrooms", "paths", "transit"].includes(part));
  if (folder === "venues") return "venue";
  if (folder === "washrooms") return "washroom";
  if (folder === "paths") return "path";
  if (folder === "transit") return "transit";
  throw new Error(`cannot tell tranche from ${file}`);
}

function listNdjson(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ndjson.gz")) found.push(full);
    }
  };
  walk(directory);
  return found.sort();
}
