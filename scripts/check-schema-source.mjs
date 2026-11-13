import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { dirname, join, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(readFileSync(join(root, "schema/upstream-pin.json"), "utf8"));
const commit = pin.commit;
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`schema pin is not a commit SHA: ${commit}`);

assertLocalTiers();

const checkout = ensureSchemaPackage(root, commit);
const entry = join(checkout, "packages/schema/dist/index.js");
const { SchemaValidator } = await import(pathToFileURL(entry).href);
const validator = new SchemaValidator();
const summary = await validateAll(join(root, "data"), validator);
console.log(JSON.stringify({ pin: commit, ...summary }, null, 2));
if (summary.failed > 0) process.exitCode = 1;

function assertLocalTiers() {
  const upstream = JSON.parse(readFileSync(join(root, "schema/upstream/field-value.schema.json"), "utf8"));
  const local = JSON.parse(readFileSync(join(root, "schema/field-value.schema.json"), "utf8"));
  const expected = [0, 1, 2, 3, 4];
  const upstreamTiers = upstream.properties?.tier?.enum;
  const localTiers = local.properties?.tier?.enum;
  if (JSON.stringify(upstreamTiers) !== JSON.stringify(expected)) {
    throw new Error(`upstream tier enum is ${JSON.stringify(upstreamTiers)}, expected ${JSON.stringify(expected)}`);
  }
  if (JSON.stringify(localTiers) !== JSON.stringify(expected)) {
    throw new Error(`local tier enum is ${JSON.stringify(localTiers)}, expected ${JSON.stringify(expected)}`);
  }
  if (local.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error("local field-value schema is not draft 2020-12");
  }
  const fields = JSON.parse(readFileSync(join(root, "schema/fields.json"), "utf8"));
  if (!fields.washroom.includes("posted_date")) throw new Error("washroom fields are missing posted_date");
}

function ensureSchemaPackage(repoRoot, sha) {
  const dest = join(repoRoot, ".cache/access-main");
  const marker = join(dest, ".pin");
  const built = join(dest, "packages/schema/dist/index.js");
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === sha && existsSync(built)) return dest;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  run("git", ["init"], dest);
  run("git", ["remote", "add", "origin", "https://github.com/ALENZACODES/access-main.git"], dest);
  run("git", ["fetch", "--depth", "1", "origin", sha], dest);
  run("git", ["checkout", "--detach", "FETCH_HEAD"], dest);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dest, encoding: "utf8" });
  if (head.status !== 0 || head.stdout.trim() !== sha) {
    throw new Error(`access-main checkout is ${head.stdout.trim() || head.stderr}, expected ${sha}`);
  }
  const pkg = join(dest, "packages/schema");
  run("npm", ["install", "--no-audit", "--no-fund"], pkg);
  if (!existsSync(built)) run("npx", ["tsc", "-p", "tsconfig.json"], pkg);
  writeFileSync(marker, `${sha}\n`);
  return dest;
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${result.status}`);
}

async function validateAll(dataRoot, validator) {
  const counts = { venue: 0, washroom: 0, path: 0, transit: 0 };
  const failedByKey = new Map();
  let checked = 0;
  let failed = 0;
  for (const file of listNdjson(dataRoot)) {
    const tranche = trancheOf(file);
    const stream = createInterface({
      input: createReadStream(file).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of stream) {
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      const result = validator.validateDetected(record);
      checked += 1;
      if (tranche in counts) counts[tranche] += 1;
      if (result.ok) continue;
      failed += 1;
      const detail = result.errors
        .map((error) => `${error.instancePath} ${error.message} (${error.schemaPath})`)
        .join("; ");
      const key = `${record.tranche ?? tranche} ${detail}`;
      const bucket = failedByKey.get(key) ?? { count: 0, ids: [] };
      bucket.count += 1;
      if (bucket.ids.length < 8) bucket.ids.push(record.id ?? file);
      failedByKey.set(key, bucket);
    }
    stream.close();
  }
  return {
    checked,
    failed,
    counts,
    failures: [...failedByKey.entries()].map(([error, bucket]) => ({
      error,
      count: bucket.count,
      ids: bucket.ids,
    })),
  };
}

function trancheOf(file) {
  const parts = file.split(sep);
  if (parts.includes("venues")) return "venue";
  if (parts.includes("washrooms")) return "washroom";
  if (parts.includes("paths")) return "path";
  if (parts.includes("transit")) return "transit";
  return "other";
}

function listNdjson(directory) {
  const found = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      if (name === "tiles" || name === "alerts") continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ndjson.gz")) found.push(full);
    }
  };
  walk(directory);
  return found.sort();
}
