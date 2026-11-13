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
const seen: Record<Tranche, number> = { venue: 0, washroom: 0, path: 0, transit: 0 };
let checked = 0;
for (const file of files) {
  const bytes = statSync(file).size;
  if (bytes >= MAX_BYTES) throw new Error(`${file} is ${bytes} bytes, at or over 50 MB`);
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
console.log(JSON.stringify({ checked, seen, files: files.length, sources: registry.sources.length }));

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
