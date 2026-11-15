import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import path from "node:path";
import { commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { parseOsmFeature } from "../src/osm/feature.js";
import { mapOsmElement } from "../src/osm/map.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const MAX_FEATURE_BYTES = 16 * 1024 * 1024;

export interface OsmImportStats {
  source_id: string;
  features: number;
  records: number;
  skipped_oversize: number;
  skipped_unparsed: number;
  skipped_empty: number;
  skipped_duplicate: number;
  dropped_personal_tags: number;
  by_tranche: Record<string, number>;
}

export async function importOsm(repoRoot: string): Promise<OsmImportStats> {
  const source = requireSource(readRegistry(repoRoot), "osm-ontario");
  const pbf = path.join(repoRoot, ".cache/osm/ontario-latest.osm.pbf");
  const filtered = path.join(repoRoot, ".cache/osm/ontario-a11y.osm.pbf");
  if (!existsSync(pbf)) throw new Error(`missing ${pbf}`);
  if (!existsSync(filtered)) filterOntario(pbf, filtered);

  const dataRoot = path.join(repoRoot, "data");
  resetSourceDirs(dataRoot, source.id, ["venue", "washroom", "path"]);
  const writer = new PartitionWriter(dataRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const ctx = {
    source_id: source.id,
    licence: source.licence_id,
    retrieved_at: source.retrieved_at,
    tier: source.tier,
  };
  const seen = new Map<string, Set<string>>();
  const stats: OsmImportStats = {
    source_id: source.id,
    features: 0,
    records: 0,
    skipped_oversize: 0,
    skipped_unparsed: 0,
    skipped_empty: 0,
    skipped_duplicate: 0,
    dropped_personal_tags: 0,
    by_tranche: {},
  };
  const child = spawn(
    "osmium",
    ["export", "-f", "geojsonseq", "-a", "type,id", "-u", "type_id", "--progress", filtered],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  if (!child.stdout) throw new Error("osmium export produced no stdout");
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
  for await (const line of lines) {
    const payload = line.startsWith("\u001e") ? line.slice(1) : line;
    if (!payload.trim()) continue;
    if (Buffer.byteLength(payload) > MAX_FEATURE_BYTES) {
      stats.skipped_oversize += 1;
      continue;
    }
    stats.features += 1;
    const feature = JSON.parse(payload) as { id?: unknown; geometry?: unknown; properties?: unknown };
    const parsed = parseOsmFeature(feature);
    if (!parsed) {
      stats.skipped_unparsed += 1;
      continue;
    }
    stats.dropped_personal_tags += parsed.droppedKeys.length;
    const records = mapOsmElement(parsed.element, ctx);
    if (records.length === 0) {
      stats.skipped_empty += 1;
      continue;
    }
    for (const record of records) {
      let ids = seen.get(record.tranche);
      if (!ids) {
        ids = new Set();
        seen.set(record.tranche, ids);
      }
      if (ids.has(record.id)) {
        stats.skipped_duplicate += 1;
        continue;
      }
      ids.add(record.id);
      await commitRecord(record, source.id, writer, validators);
      stats.records += 1;
      stats.by_tranche[record.tranche] = (stats.by_tranche[record.tranche] ?? 0) + 1;
    }
    if (stats.features % 200_000 === 0) {
      console.error(`osm features ${stats.features} records ${stats.records}`);
    }
  }
  const exitCode = await new Promise<number>((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`osmium export exited ${exitCode}`);
  console.log(JSON.stringify(stats));
  return stats;
  } finally {
    await writer.close();
  }
}

function filterOntario(input: string, output: string): void {
  const result = spawnSync(
    "osmium",
    [
      "tags-filter",
      "--progress",
      "-O",
      "-o",
      output,
      input,
      "nwr/amenity",
      "nwr/shop",
      "nwr/tourism",
      "nwr/leisure",
      "nwr/healthcare",
      "nwr/entrance",
      "w/highway=footway,path,pedestrian,steps,corridor,cycleway,bridleway,crossing",
      "n/highway=crossing",
      "n/kerb",
      "n/tactile_paving",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("osmium tags-filter failed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await importOsm(process.cwd());
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
