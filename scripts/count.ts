import { mkdirSync, readdirSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { countNdjsonGz, renderCountsMarkdown } from "../src/count/count.js";
import { summarizeAlerts, type ServiceAlert } from "../src/gtfs-rt/alerts.js";
import { TRANCHE_DIR } from "../src/model/records.js";

export async function writeCounts(repoRoot: string): Promise<void> {
  const dataRoot = path.join(repoRoot, "data");
  const files = trancheFiles(dataRoot).sort();
  if (files.length === 0) throw new Error("no data/*.ndjson.gz files to count");
  const report = await countNdjsonGz(files);
  const alerts = await readAlerts(path.join(dataRoot, "alerts"));
  const alertSummary = summarizeAlerts(alerts);
  const inventory = files.map((file) => ({
    file: path.relative(repoRoot, file),
    bytes: statSync(file).size,
  }));
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(
    path.join(repoRoot, "counts.json"),
    `${JSON.stringify({ ...report, alerts: alertSummary, files: inventory }, null, 2)}\n`,
  );
  writeFileSync(path.join(repoRoot, "COUNTS.md"), `${renderCountsMarkdown(report)}${renderAlerts(alertSummary)}`);
  console.log(
    JSON.stringify({
      pieces: report.pieces,
      accessibility_pieces: report.accessibility_pieces,
      identity_pieces: report.identity_pieces,
      gaps: report.gaps,
      records: report.records,
      alerts: alertSummary.records,
      shortfalls: report.shortfalls,
      files: inventory.length,
    }),
  );
}

function renderAlerts(summary: ReturnType<typeof summarizeAlerts>): string {
  return [
    "",
    "## GTFS-RT accessibility alerts",
    "",
    "These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Equipment is elevator or escalator only when the header text says so.",
    "",
    `Alert records: **${summary.records.toLocaleString("en-CA")}**.`,
    `Elevator: **${summary.elevator.toLocaleString("en-CA")}**. Escalator: **${summary.escalator.toLocaleString("en-CA")}**. Both words: **${summary.elevator_and_escalator.toLocaleString("en-CA")}**. Equipment not stated: **${summary.unknown_equipment.toLocaleString("en-CA")}**.`,
    `Retrieval dates: ${Object.keys(summary.by_retrieved_at).sort().join(", ") || "none"}.`,
    "",
  ].join("\n");
}

async function readAlerts(directory: string): Promise<ServiceAlert[]> {
  const alerts: ServiceAlert[] = [];
  for (const file of listNdjson(directory)) {
    const stream = readline.createInterface({
      input: createReadStream(file).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of stream) {
      if (!line.trim()) continue;
      alerts.push(JSON.parse(line) as ServiceAlert);
    }
  }
  return alerts;
}

function trancheFiles(dataRoot: string): string[] {
  const files: string[] = [];
  for (const directory of Object.values(TRANCHE_DIR)) {
    files.push(...listNdjson(path.join(dataRoot, directory)));
  }
  return files;
}

function listNdjson(directory: string): string[] {
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
      else if (entry.name.endsWith(".ndjson.gz")) found.push(full);
    }
  };
  walk(directory);
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeCounts(process.cwd());
}
