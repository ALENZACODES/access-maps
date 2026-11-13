import path from "node:path";
import { pathToFileURL } from "node:url";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { findZipEntry, listZip, readZipText } from "../src/io/zip.js";
import { GTFS_FEEDS } from "../src/gtfs/feeds.js";
import { indexLevels, mapGtfsPathway, mapGtfsStop } from "../src/gtfs/map.js";
import { readRegistry, requireSource, type SourceEntry } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

export interface GtfsImportStats {
  sources: { source_id: string; stops: number; pathways: number; skipped_duplicate: number; skipped_missing_id: number }[];
}

export async function importGtfs(repoRoot: string): Promise<GtfsImportStats> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const stats: GtfsImportStats = { sources: [] };
  for (const feed of GTFS_FEEDS) {
    const source = requireSource(registry, feed.id);
    if (source.kind !== "gtfs" || source.tier !== 1) {
      throw new Error(`${feed.id} must be a tier 1 gtfs source`);
    }
    resetSourceDirs(path.join(repoRoot, "data"), source.id, ["transit", "path"]);
    stats.sources.push(await importFeed(repoRoot, source, feed.file, writer, validators));
  }
  await writer.close();
  console.log(JSON.stringify(stats));
  return stats;
}

async function importFeed(
  repoRoot: string,
  source: SourceEntry,
  relativeZip: string,
  writer: PartitionWriter,
  validators: ReturnType<typeof compileValidators>,
): Promise<GtfsImportStats["sources"][number]> {
  const zipPath = path.join(repoRoot, relativeZip);
  const entries = listZip(zipPath);
  const stopsEntry = findZipEntry(entries, "stops.txt");
  if (!stopsEntry) throw new Error(`${source.id} has no stops.txt`);
  const levelsEntry = findZipEntry(entries, "levels.txt");
  const pathwaysEntry = findZipEntry(entries, "pathways.txt");
  const levels = levelsEntry ? indexLevels(parseCsv(readZipText(zipPath, levelsEntry)).rows) : new Map();
  const ctx = {
    source_id: source.id,
    licence: source.licence_id,
    retrieved_at: source.retrieved_at,
    tier: source.tier,
  };
  const seenStops = new Set<string>();
  const seenPaths = new Set<string>();
  let stops = 0;
  let pathways = 0;
  let skippedDuplicate = 0;
  let skippedMissingId = 0;
  for (const row of parseCsv(readZipText(zipPath, stopsEntry)).rows) {
    const record = mapGtfsStop(row, levels, ctx, source.id);
    if (!record) {
      skippedMissingId += 1;
      continue;
    }
    if (!acceptId(seenStops, record.id)) {
      skippedDuplicate += 1;
      continue;
    }
    await commitRecord(record, source.id, writer, validators);
    stops += 1;
  }
  if (pathwaysEntry) {
    for (const row of parseCsv(readZipText(zipPath, pathwaysEntry)).rows) {
      const record = mapGtfsPathway(row, ctx, source.id);
      if (!record) {
        skippedMissingId += 1;
        continue;
      }
      if (!acceptId(seenPaths, record.id)) {
        skippedDuplicate += 1;
        continue;
      }
      await commitRecord(record, source.id, writer, validators);
      pathways += 1;
    }
  }
  return { source_id: source.id, stops, pathways, skipped_duplicate: skippedDuplicate, skipped_missing_id: skippedMissingId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importGtfs(process.cwd());
}
