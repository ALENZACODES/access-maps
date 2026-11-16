/** Build sha256-verified, source-isolated GTFS schedule shards from licensed local ZIPs. */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, inflateRawSync } from "node:zlib";

interface Allowed {
  sourceId: string;
  agency: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  retrieved: string;
  zipFileName: string;
}
type Row = Record<string, string>;
interface Part {
  path: string; bytes: number; sha256: string; tripCount: number; sourceId: string;
  licence: string; licenceUrl: string; retrieved: string; feedStart: string; feedEnd: string;
  placement: "git" | "release"; assetName?: string; kind: "calendar" | "trips"; regionId: string;
}
interface SourceReport { sourceId: string; sourceName: string; inWebPack: boolean; heldReason?: string; licence?: string; licenceUrl?: string; retrieved?: string; feedVersion?: string }
interface GTFS { agency: Row[]; routes: Row[]; stops: Row[]; trips: Row[]; stop_times: Row[]; calendar: Row[]; calendar_dates: Row[]; feed_info: Row[] }
export interface BuildOptions { input: string; output: string; allowlist: Allowed[]; budgetBytes?: number; regionOverride?: Record<string, string> }

/** ZIP central directory reader. Supports methods STORED and DEFLATE; no extraction to disk. */
export function readZip(file: Uint8Array): Map<string, Uint8Array> {
  const data = Buffer.from(file);
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
    if (data.readUInt32LE(p) === 0x06054b50) { end = p; break; }
  }
  if (end < 0) throw new Error("ZIP central directory not found");
  const entries = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < entries; i++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP entry");
    const method = data.readUInt16LE(offset + 10);
    const packed = data.readUInt32LE(offset + 20);
    const unpacked = data.readUInt32LE(offset + 24);
    const nameSize = data.readUInt16LE(offset + 28);
    const extraSize = data.readUInt16LE(offset + 30);
    const commentSize = data.readUInt16LE(offset + 32);
    const local = data.readUInt32LE(offset + 42);
    const name = data.subarray(offset + 46, offset + 46 + nameSize).toString("utf8");
    offset += 46 + nameSize + extraSize + commentSize;
    if (!/^(?:[\w-]+\/)?[\w-]+\.txt$/.test(name) || name.includes("..")) continue;
    if (data.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid ZIP local entry");
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const bytes = data.subarray(start, start + packed);
    const result = method === 0 ? bytes : method === 8 ? inflateRawSync(bytes) : null;
    if (!result || result.length !== unpacked) throw new Error(`Unsupported or corrupt ZIP entry: ${name}`);
    const basename = name.split("/").at(-1)!;
    if (out.has(basename)) throw new Error(`Duplicate GTFS table: ${basename}`);
    out.set(basename, result);
  }
  return out;
}

export function csv(text: string): Row[] {
  const records: string[][] = [];
  let row: string[] = []; let field = ""; let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field); if (row.some((v) => v !== "")) records.push(row);
      row = []; field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated CSV quoted field");
  row.push(field); if (row.some((v) => v !== "")) records.push(row);
  const [header, ...body] = records;
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key.trim(), values[i] ?? ""])));
}

const REGION_BOUNDS: Array<[string, number, number, number, number]> = [
  ["toronto", 43.55, 43.90, -79.65, -79.10],
  ["ottawa", 45.10, 45.55, -76.10, -75.35],
  ["hamilton", 43.10, 43.42, -80.10, -79.65],
  ["peel", 43.50, 43.95, -80.05, -79.55],
  ["london", 42.80, 43.15, -81.55, -81.05],
  ["kingston", 44.15, 44.35, -76.75, -76.30],
  ["sudbury", 46.35, 46.65, -81.25, -80.75],
  ["waterloo", 43.30, 43.62, -80.70, -80.25],
  ["windsor", 42.20, 42.40, -83.20, -82.85],
  ["niagara", 42.80, 43.30, -79.50, -79.00]
];
function isHeldMiWay(id: string, name = ""): boolean {
  return [id, name].some((value) => value.trim().toLowerCase().includes("miway"));
}

function regions(stop: Row, override?: Record<string, string>): string[] {
  const stopId = stop.stop_id;
  if (stopId && override?.[stopId]) return [override[stopId]];
  const lat = Number(stop.stop_lat); const lon = Number(stop.stop_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !stop.stop_lat || !stop.stop_lon) return [];
  return REGION_BOUNDS.filter(([, s, n, w, e]) => lat >= s && lat <= n && lon >= w && lon <= e).map(([name]) => name);
}
function flag(value: string | undefined): "1" | "2" | "UNKNOWN" {
  return value === "1" || value === "2" ? value : "UNKNOWN";
}
function validId(id: string): boolean { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id); }
function readFeed(bytes: Uint8Array): GTFS {
  const files = readZip(bytes);
  const tables = ["agency", "routes", "stops", "trips", "stop_times", "calendar", "calendar_dates", "feed_info"] as const;
  const feed = Object.fromEntries(tables.map((key) => [key, csv(Buffer.from(files.get(`${key}.txt`) ?? []).toString("utf8"))])) as unknown as GTFS;
  for (const required of ["routes", "stops", "trips", "stop_times"] as const) {
    if (!feed[required].length) throw new Error(`GTFS lacks ${required}.txt`);
  }
  if (!feed.calendar.length && !feed.calendar_dates.length) throw new Error("GTFS lacks service calendars");
  return feed;
}
function feedCoverage(feed: GTFS): [string, string] {
  const meta = feed.feed_info[0];
  const dates = [...feed.calendar.flatMap((row) => [row.start_date, row.end_date]), ...feed.calendar_dates.map((row) => row.date)].filter(Boolean).sort();
  return [meta?.feed_start_date || dates[0] || "UNKNOWN", meta?.feed_end_date || dates.at(-1) || "UNKNOWN"];
}

export function buildTimetables(opts: BuildOptions): { parts: Part[]; sources: SourceReport[]; skipped: string[] } {
  const { input, output } = opts;
  const parts: Part[] = [];
  const sources: SourceReport[] = [];
  const skipped: string[] = [];
  const accepted = new Set<string>();
  const allowlist = opts.allowlist;
  if (new Set(allowlist.map((a) => a.sourceId)).size !== allowlist.length) throw new Error("Duplicate allow-list sourceId");
  let gitBytes = 0;
  const budget = opts.budgetBytes ?? 150 * 1024 * 1024;
  const base = join(output, "data/schedules/v1");
  mkdirSync(base, { recursive: true });
  const write = (region: string, allowed: Allowed, kind: "calendar" | "trips", content: string, count: number, start: string, end: string, index = 0): void => {
    const sourceId = allowed.sourceId;
    const filename = kind === "calendar" ? "calendar.json.gz" : `trips-${String(index).padStart(4, "0")}.ndjson.gz`;
    const path = `${region}/${sourceId}/${filename}`;
    const bytes = gzipSync(Buffer.from(content), { level: 9, mtime: 0 } as Parameters<typeof gzipSync>[1]);
    if (bytes.byteLength > 50 * 1024 * 1024) throw new Error(`Oversized schedule part: ${path}`);
    const release = sourceId.startsWith("metrolinx-") || gitBytes + bytes.length > budget;
    const assetName = `${sourceId}-schedules-v1-${region}-${filename}`;
    const placement = release ? "release" : "git";
    const target = release ? join(output, "release-assets", assetName) : join(base, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    parts.push({ path, bytes: bytes.length, sha256, tripCount: count, sourceId,
      licence: allowed.licence, licenceUrl: allowed.licenceUrl, retrieved: allowed.retrieved,
      feedStart: start, feedEnd: end, placement, ...(release ? { assetName } : {}), kind, regionId: region });
    if (!release) gitBytes += bytes.length;
  };
  for (const allowed of allowlist) {
    if (!validId(allowed.sourceId) || !allowed.agency || !allowed.licence || !allowed.licenceUrl || !/^\d{4}-\d\d-\d\d$/.test(allowed.retrieved) || !/^[\w.-]+\.zip$/.test(allowed.zipFileName)) throw new Error(`Invalid allow-list row: ${allowed.sourceId}`);
    // Explicit legal gate: no other Metrolinx aliases, no MiWay, and no unreviewed source.
    if (isHeldMiWay(allowed.sourceId, allowed.agency) || allowed.sourceId === "metrolinx" || (allowed.sourceId.startsWith("metrolinx-") && !["metrolinx-go", "metrolinx-up"].includes(allowed.sourceId))) {
      skipped.push(`${allowed.sourceId}: licence not approved`); continue;
    }
    if (allowed.sourceId.startsWith("metrolinx-") && (allowed.licence !== "Metrolinx Access and Use Agreement (accepted 2026-11-15)" || allowed.licenceUrl !== "https://www.gotransit.com/en/partner-with-us/software-developers")) {
      skipped.push(`${allowed.sourceId}: AUA provenance invalid`); continue;
    }
    const file = join(input, allowed.zipFileName);
    if (!existsSync(file)) { skipped.push(`${allowed.sourceId}: zip missing`); continue; }
    const feed = readFeed(readFileSync(file));
    const [start, end] = feedCoverage(feed);
    const version = feed.feed_info[0]?.feed_version;
    sources.push({ sourceId: allowed.sourceId, sourceName: allowed.agency, inWebPack: true,
      licence: allowed.licence, licenceUrl: allowed.licenceUrl, retrieved: allowed.retrieved, ...(version ? { feedVersion: version } : {}) });
    accepted.add(allowed.zipFileName);
    const stops = new Map((feed.stops.filter((stop) => stop.stop_id) as Array<Row & { stop_id: string }>).map((stop) => [stop.stop_id, stop]));
    const routes = new Map((feed.routes.filter((route) => route.route_id) as Array<Row & { route_id: string }>).map((route) => [route.route_id, route]));
    const stopTimes = new Map<string, Row[]>();
    for (const st of feed.stop_times) {
      const stopId = st.stop_id;
      const tripId = st.trip_id;
      if (!stopId || !tripId || !stops.has(stopId)) continue;
      const rows = stopTimes.get(tripId) ?? [];
      rows.push(st); stopTimes.set(tripId, rows);
    }
    const grouped = new Map<string, Array<{ id: string; routeId: string; serviceId: string; headsign: string; wheelchairAccessible: string; stopTimes: Array<{ stopId: string; arrival: string; departure: string; sequence: number }> }>>();
    for (const trip of feed.trips) {
      const tripRouteId = trip.route_id;
      const tripKey = trip.trip_id;
      if (!tripRouteId || !tripKey || !routes.has(tripRouteId)) continue;
      const times = (stopTimes.get(tripKey) ?? []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
      if (!times.length) continue;
      const tripRegions = new Set(times.flatMap((st) => {
        const stop = st.stop_id ? stops.get(st.stop_id) : undefined;
        return stop ? regions(stop, opts.regionOverride) : [];
      }));
      for (const region of tripRegions) {
        const list = grouped.get(region) ?? [];
        const mappedStops = [];
        for (const st of times) {
          const stopId = st.stop_id;
          const arrival = st.arrival_time;
          const departure = st.departure_time;
          if (!stopId || !arrival || !departure) continue;
          mappedStops.push({ stopId, arrival, departure, sequence: Number(st.stop_sequence) });
        }
        if (!mappedStops.length) continue;
        const tripId = trip.trip_id;
        const routeId = trip.route_id;
        const serviceId = trip.service_id;
        if (!tripId || !routeId || !serviceId) continue;
        list.push({ id: tripId, routeId, serviceId, headsign: trip.trip_headsign || "",
          wheelchairAccessible: flag(trip.wheelchair_accessible), stopTimes: mappedStops });
        grouped.set(region, list);
      }
    }
    for (const [region, trips] of grouped) {
      const usedStops = new Set(trips.flatMap((trip) => trip.stopTimes.map((st) => st.stopId)));
      const usedRoutes = new Set(trips.map((trip) => trip.routeId));
      const usedServices = new Set(trips.map((trip) => trip.serviceId));
      const calendar = {
        sourceId: allowed.sourceId, sourceName: allowed.agency,
        agency: feed.agency.map((a) => ({ id: a.agency_id || "", name: a.agency_name || allowed.agency })),
        routes: feed.routes.filter((r) => r.route_id && usedRoutes.has(r.route_id)).map((r) => ({ id: r.route_id ?? "", shortName: r.route_short_name || "", longName: r.route_long_name || "", type: r.route_type || "" })),
        stops: feed.stops.filter((s) => s.stop_id && usedStops.has(s.stop_id)).map((s) => ({ id: s.stop_id ?? "", name: s.stop_name || "", lat: Number(s.stop_lat), lon: Number(s.stop_lon), wheelchairBoarding: flag(s.wheelchair_boarding) })),
        calendar: feed.calendar.filter((c) => c.service_id && usedServices.has(c.service_id)).map((c) => ({ serviceId: c.service_id ?? "", startDate: c.start_date ?? "", endDate: c.end_date ?? "",
          weekdays: [c.sunday ?? "", c.monday ?? "", c.tuesday ?? "", c.wednesday ?? "", c.thursday ?? "", c.friday ?? "", c.saturday ?? ""] })),
        calendarDates: feed.calendar_dates.filter((c) => c.service_id && usedServices.has(c.service_id)).map((c) => ({ serviceId: c.service_id ?? "", date: c.date ?? "", exceptionType: c.exception_type ?? "" }))
      };
      write(region, allowed, "calendar", JSON.stringify(calendar), 0, start, end);
      // Bound the *compressed* size, not the uncompressed NDJSON length.
      let batch: string[] = []; let batchBytes = 0; let shard = 0;
      const flush = (): void => { if (batch.length) { write(region, allowed, "trips", `${batch.join("\n")}\n`, batch.length, start, end, shard++); batch = []; batchBytes = 0; } };
      for (const trip of trips) {
        const line = JSON.stringify(trip);
        const size = Buffer.byteLength(line) + 1;
        if (size > 900_000) throw new Error(`Single trip exceeds shard limit: ${trip.id}`);
        if (batchBytes + size > 900_000) flush();
        batch.push(line); batchBytes += size;
      }
      flush();
    }
  }
  // An unknown or unlicensed ZIP is never read or copied into output.
  const heldReason = "Official terms href not confirmed; grantor defect in the still-hosted PDF";
  sources.push({ sourceId: "miway", sourceName: "MiWay", inWebPack: false, heldReason });
  const manifest = { version: 1 as const, parts, sources };
  writeFileSync(join(base, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(base, "RELEASE-ASSETS.md"), `# Schedule release assets\n\n${parts.filter((part) => part.placement === "release").map((part) => `- \`${part.assetName}\` — ${part.bytes} bytes; sha256 \`${part.sha256}\`; destination \`${part.path}\``).join("\n")}\n`);
  writeFileSync(join(base, "BUILD-REPORT.json"), `${JSON.stringify({ skipped, sourceCount: sources.filter((s) => s.inWebPack).length, parts: parts.length }, null, 2)}\n`);
  return { parts, sources, skipped };
}

function requiredOption(args: string[], flag: string): string {
  const i = args.indexOf(flag);
  const value = i >= 0 ? args[i + 1] : undefined;
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function option(args: string[], flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i < 0 ? fallback : args[i + 1] || fallback;
}

function main(): void {
  const args = process.argv.slice(2);
  const allowFile = resolve(option(args, "--allowlist", "packages/timetables/src/licence-allowlist.json"));
  const opts = {
    input: resolve(requiredOption(args, "--input")),
    output: resolve(option(args, "--output", ".")),
    allowlist: JSON.parse(readFileSync(allowFile, "utf8")) as Allowed[],
    budgetBytes: Number(option(args, "--budget-bytes", String(150 * 1024 * 1024))),
  };
  buildTimetables(opts);
}
if (process.argv[1] && /build-gtfs-timetables\.(?:ts|js)$/.test(process.argv[1])) main();
