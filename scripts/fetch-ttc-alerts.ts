import { createWriteStream, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createGzip } from "node:zlib";
import { once } from "node:events";
import { parseAccessibilityAlerts, type ServiceAlert } from "../src/gtfs-rt/alerts.js";
import { readRegistry, requireSource } from "../src/registry.js";

const FEED_URL = "https://gtfsrt.ttc.ca/alerts/accessibility?format=text";
const USER_AGENT = "access-maps-pipeline/1.0 (TTC GTFS-RT accessibility alerts; OGL-Toronto)";

export async function fetchTtcAccessibilityAlerts(repoRoot: string, retrievedAt = today()): Promise<ServiceAlert[]> {
  const registry = readRegistry(repoRoot);
  const source = requireSource(registry, "gtfs-rt-ttc-accessibility");
  if (source.kind !== "gtfs-rt" || source.tier !== 4) {
    throw new Error("gtfs-rt-ttc-accessibility must be a tier 4 gtfs-rt source");
  }
  const response = await fetch(source.download_url || FEED_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
  });
  if (!response.ok) throw new Error(`TTC accessibility feed HTTP ${response.status}`);
  const text = await response.text();
  const alerts = parseAccessibilityAlerts(text, {
    source_id: source.id,
    licence: source.licence_id,
    retrieved_at: retrievedAt,
  });
  const directory = path.join(repoRoot, "data", "alerts", source.id);
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "alerts.ndjson.gz");
  await writeGzipNdjson(file, alerts);
  const bytes = (await import("node:fs")).statSync(file).size;
  if (bytes >= 50 * 1024 * 1024) throw new Error(`${file} is ${bytes} bytes`);
  console.log(
    JSON.stringify({
      file: path.relative(repoRoot, file),
      records: alerts.length,
      elevator: alerts.filter((alert) => alert.equipment === "elevator").length,
      escalator: alerts.filter((alert) => alert.equipment === "escalator").length,
      elevator_and_escalator: alerts.filter((alert) => alert.equipment === "elevator_and_escalator").length,
      unknown_equipment: alerts.filter((alert) => alert.equipment === "UNKNOWN").length,
      retrieved_at: retrievedAt,
      bytes,
    }),
  );
  return alerts;
}

async function writeGzipNdjson(file: string, rows: unknown[]): Promise<void> {
  const gzip = createGzip();
  const output = createWriteStream(file);
  gzip.pipe(output);
  for (const row of rows) {
    const ok = gzip.write(`${JSON.stringify(row)}\n`);
    if (!ok) await once(gzip, "drain");
  }
  gzip.end();
  await once(output, "finish");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await fetchTtcAccessibilityAlerts(process.cwd());
}
