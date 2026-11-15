import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { parseCsv } from "../src/io/csv.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { mapTorontoCremWashroom, mapTorontoParkWashroom, mapTorontoStreetWashroom } from "../src/municipal/map.js";
import type { DataRecord } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const DATASETS = [
  {
    id: "toronto-park-washrooms",
    file: ".cache/municipal/toronto-park-washrooms.csv",
    map: mapTorontoParkWashroom,
  },
  {
    id: "toronto-street-washrooms",
    file: ".cache/municipal/toronto-street-washrooms.csv",
    map: mapTorontoStreetWashroom,
  },
  {
    id: "toronto-crem-washrooms",
    file: ".cache/municipal/toronto-crem-washrooms.csv",
    map: mapTorontoCremWashroom,
  },
] as const;

export async function importMunicipal(repoRoot: string): Promise<{ sources: { source_id: string; records: number; skipped_duplicate: number }[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: { source_id: string; records: number; skipped_duplicate: number }[] = [];
  for (const dataset of DATASETS) {
    const source = requireSource(registry, dataset.id);
    if (source.kind !== "municipal" || source.tier !== 0) throw new Error(`${dataset.id} must be tier 0 municipal data`);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, ["washroom"]);
    const ctx: Provenance = {
      source_id: source.id,
      licence: source.licence_id,
      retrieved_at: source.retrieved_at,
      tier: source.tier,
    };
    const seen = new Set<string>();
    let records = 0;
    let skippedDuplicate = 0;
    const table = parseCsv(readFileSync(path.join(repoRoot, dataset.file), "utf8"));
    for (const row of table.rows) {
      let record: DataRecord = dataset.map(row, ctx);
      const unique = acceptId(seen, record.id);
      if (!unique) {
        skippedDuplicate += 1;
        record = { ...record, id: `${record.id}#${skippedDuplicate}` };
        if (!acceptId(seen, record.id)) throw new Error(`still duplicate ${record.id}`);
      }
      await commitRecord(record, source.id, writer, validators);
      records += 1;
    }
    sources.push({ source_id: source.id, records, skipped_duplicate: skippedDuplicate });
  }
  await writer.close();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importMunicipal(process.cwd());
}
