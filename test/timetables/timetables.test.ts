import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, deflateRawSync } from "node:zlib";
import { createHash, webcrypto } from "node:crypto";
import { buildTimetables, csv, readZip } from "../../scripts/build-gtfs-timetables";
import { createTimetableSource, metrolinxAuaLegendEn, metrolinxOglLineEn, transitEndUserTermsEn, transitEndUserTermsFr, normalizeWheelchair } from "../../packages/timetables/src/index";

const license = { sourceId: "sample", agency: "Sample Agency", licence: "LTC Open Data Terms of Use", licenceUrl: "https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/", attribution: "Sample Agency", retrieved: "2026-11-15", zipFileName: "sample.zip" };
const metrolinx = { ...license, sourceId: "metrolinx-go", agency: "GO Transit", attribution: "GO Transit", licence: "Metrolinx Access and Use Agreement (accepted 2026-11-15)", licenceUrl: "https://www.gotransit.com/en/partner-with-us/software-developers", zipFileName: "go-sample.zip" };
const sampleTables = {
  "agency.txt": "agency_id,agency_name\nA,Sample Agency\n",
  "routes.txt": "route_id,route_short_name,route_long_name,route_type\nR,7,Sample Route,3\n",
  "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nS,Sample Stop,42.98,-81.25\n",
  "trips.txt": "route_id,service_id,trip_id,trip_headsign,wheelchair_accessible\nR,D,T,Sample Centre,0\n",
  "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT,25:15:00,25:16:00,S,1\n",
  "calendar_dates.txt": "service_id,date,exception_type\nD,20261115,1\n",
  "feed_info.txt": "feed_start_date,feed_end_date,feed_version\n20261115,20261115,sample-v1\n"
};
function zip(tables: Record<string, string>): Buffer {
  const locals: Buffer[] = []; const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(tables)) {
    const filename = Buffer.from(name); const raw = Buffer.from(content); const packed = deflateRawSync(raw);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, packed);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename);
    offset += local.length + filename.length + packed.length;
  }
  const size = central.reduce((n, part) => n + part.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(tables).length, 8);
  end.writeUInt16LE(Object.keys(tables).length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "sample-timetables-"));
  const input = join(dir, "input"); const output = join(dir, "output");
  mkdirSync(input); mkdirSync(output);
  writeFileSync(join(input, license.zipFileName), zip(sampleTables));
  writeFileSync(join(input, metrolinx.zipFileName), zip(sampleTables));
  writeFileSync(join(input, "miway.zip"), zip(sampleTables));
  return { dir, input, output };
}
function readPart(output: string, part: { path: string; placement: string; assetName?: string }) {
  return readFileSync(part.placement === "release" ? join(output, "release-assets", part.assetName!) : join(output, "data/schedules/v1", part.path));
}

describe("fictional GTFS timetable pack", () => {
  it("parses quoted GTFS cells and calendar_dates without calendar", () => {
    expect(csv('id,name\n1,"Hello, ""World"""\n')[0]?.name).toBe('Hello, "World"');
    expect(readZip(zip(sampleTables)).has("calendar.txt")).toBe(false);
    const f = fixture();
    try {
      const result = buildTimetables({ input: f.input, output: f.output, allowlist: [license] });
      expect(result.parts.some((p) => p.kind === "trips")).toBe(true);
      const calendar = result.parts.find((p) => p.kind === "calendar");
      expect(calendar).toBeDefined();
      if (!calendar) throw new Error("missing calendar part");
      expect(JSON.parse(requireGunzip(readPart(f.output, calendar))).calendarDates).toHaveLength(1);
      expect(JSON.parse(requireGunzip(readPart(f.output, calendar))).stops[0].wheelchairBoarding).toBe("UNKNOWN");
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  it("refuses unlisted input and MiWay even when explicitly put on the list", () => {
    const f = fixture();
    try {
      const invalid = { ...license, sourceId: "miway", zipFileName: "miway.zip" };
      const result = buildTimetables({ input: f.input, output: f.output, allowlist: [license, invalid] });
      expect(result.parts.every((p) => p.sourceId === "sample")).toBe(true);
      expect(result.skipped.some((message) => message.startsWith("miway"))).toBe(true);
      expect(result.sources.find((s) => s.sourceId === "miway")?.inWebPack).toBe(false);
      expect(result.parts.every((p) => !p.path.includes("miway") && !p.path.includes("metrolinx"))).toBe(true);
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  it("separates Metrolinx assets and verifies exact bytes, sha256 and placement", () => {
    const f = fixture();
    try {
      const result = buildTimetables({ input: f.input, output: f.output, allowlist: [license, metrolinx] });
      const metParts = result.parts.filter((p) => p.sourceId === "metrolinx-go");
      expect(metParts.length).toBeGreaterThan(0);
      for (const part of result.parts) {
        const bytes = readPart(f.output, part);
        expect(bytes.length).toBe(part.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(part.sha256);
        const contents = requireGunzip(bytes);
        expect(contents.includes('"sourceId":"metrolinx-go"') && contents.includes('"sourceId":"sample"')).toBe(false);
        if (part.sourceId === "metrolinx-go") {
          expect(part.path).toContain("metrolinx-go");
          expect(part.placement).toBe("release");
          expect(part.assetName).toMatch(/^metrolinx-go-/);
          expect(existsSync(join(f.output, "data/schedules/v1", part.path))).toBe(false);
        }
      }
      expect(readFileSync(join(f.output, "data/schedules/v1/RELEASE-ASSETS.md"), "utf8")).toContain("metrolinx-go-");
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  it("uses only cached verified chunks and preserves scheduled time and provenance", async () => {
    const f = fixture();
    try {
      const result = buildTimetables({ input: f.input, output: f.output, allowlist: [license] });
      const manifest = { version: 1 as const, parts: result.parts, sources: result.sources };
      const unavailable = new Set<string>();
      const fetchMock = async (input: RequestInfo | URL): Promise<Response> => {
        const url = new URL(String(input)); const part = url.pathname.replace(/^\/data\/schedules\/v1\//, "");
        if (unavailable.has(part)) return new Response(null, { status: 404 });
        return new Response(readFileSync(join(f.output, "data/schedules/v1", part)));
      };
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
      const source = createTimetableSource({ baseUrl: "https://example.test/data/schedules/v1/", manifest, fetch: fetchMock as typeof fetch });
      expect(await source.hasRegion("london")).toBe(true);
      const at = new Date(2026, 10, 16, 1, 10);
      const [row] = await source.departures({ stopIds: ["S"], at, windowMin: 10 });
      expect(row).toMatchObject({ departure: "25:16:00", arrival: "25:15:00", sourceName: "Sample Agency", retrieved: "2026-11-15", serviceDate: "2026-11-15", wheelchairAccessible: "UNKNOWN" });
      const missingTrip = result.parts.find((p) => p.kind === "trips");
      expect(missingTrip).toBeDefined();
      unavailable.add(missingTrip!.path);
      const missingPath = [...unavailable][0];
      expect(missingPath).toBeDefined();
      expect(await source.missingChunks("london")).toContain(missingPath);
      expect(await source.departures({ stopIds: ["S"], at })).toEqual([]);
      unavailable.clear();
      const victim = result.parts.find((p) => p.kind === "trips");
      expect(victim).toBeDefined();
      if (!victim) throw new Error("missing trips part");
      const file = join(f.output, "data/schedules/v1", victim.path);
      const bytes = readFileSync(file); bytes[20] = (bytes[20] ?? 0) ^ 1; writeFileSync(file, bytes);
      await expect(source.departures({ stopIds: ["S"], at })).rejects.toThrow(/SHA-256 mismatch/);
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });

  it("exports exact legal strings and does not infer wheelchair accessibility", () => {
    expect(normalizeWheelchair("0")).toBe("UNKNOWN");
    expect(normalizeWheelchair("")).toBe("UNKNOWN");
    expect(metrolinxAuaLegendEn).toBe("Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service.");
    expect(metrolinxOglLineEn).toBe("Contains information licensed under the Open Government Licence - Ontario - Metrolinx.");
    expect(transitEndUserTermsEn).toBe("You must follow all applicable laws when using the transit timetable data in the App.");
    expect(transitEndUserTermsFr).toBe("Vous devez respecter toutes les lois applicables lorsque vous utilisez les données d'horaires de transport en commun dans l'App.");
  });
});
function requireGunzip(bytes: Buffer): string { return gunzipSync(bytes).toString("utf8"); }
