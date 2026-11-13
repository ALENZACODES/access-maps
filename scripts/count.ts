import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { countNdjsonGz, renderCountsMarkdown } from "../src/count/count.js";

export async function writeCounts(repoRoot: string): Promise<void> {
  const dataRoot = path.join(repoRoot, "data");
  const files = listNdjson(dataRoot).sort();
  if (files.length === 0) throw new Error("no data/*.ndjson.gz files to count");
  const report = await countNdjsonGz(files);
  const inventory = files.map((file) => ({
    file: path.relative(repoRoot, file),
    bytes: statSync(file).size,
  }));
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(path.join(repoRoot, "counts.json"), `${JSON.stringify({ ...report, files: inventory }, null, 2)}\n`);
  writeFileSync(path.join(repoRoot, "COUNTS.md"), renderCountsMarkdown(report));
  console.log(
    JSON.stringify({
      pieces: report.pieces,
      gaps: report.gaps,
      records: report.records,
      shortfalls: report.shortfalls,
      files: inventory.length,
    }),
  );
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
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeCounts(process.cwd());
}
