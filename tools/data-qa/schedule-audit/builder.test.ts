import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTimetables } from "../../../scripts/build-gtfs-timetables.ts";
import { storedZipEntries } from "../../../test/provincial/zip-fixture.ts";
import { auditSchedules } from "./audit.ts";

const source = {
  sourceId: "workshop",
  agency: "Workshop fixture",
  licence: "Synthetic test data",
  licenceUrl: "https://example.invalid/licence",
  attribution: "Workshop fixture",
  retrieved: "2024-02-28",
  zipFileName: "workshop.zip",
};

function scheduleFiles(cancelLocalTrip: boolean) {
  // The west/east split is specified by regionOverride. These coordinates are
  // synthetic and the trip and stop names do not describe a real network.
  return {
    "agency.txt": "agency_name,agency_url,agency_timezone\nWorkshop fixture,https://example.invalid,America/Toronto\n",
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\nr,01,,3\n",
    "stops.txt": [
      "stop_id,stop_name,stop_lat,stop_lon,wheelchair_boarding",
      'w1,"Quai, un",0,0,1',
      "w2,Quai deux,0,0.01,2",
      "e1,Quai trois,0,0.02,0",
    ].join("\r\n"),
    "trips.txt": [
      "route_id,service_id,trip_id,trip_headsign,wheelchair_accessible",
      "r,special,cross,Rive est,",
      "r,thursday,local,Rive ouest,1",
    ].join("\n"),
    "stop_times.txt": [
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
      "cross,24:13:00,24:14:00,e1,30",
      "local,09:00:00,09:00:00,w1,10",
      "cross,23:55:00,23:57:00,w1,10",
      "local,09:15:00,09:15:00,w2,20",
    ].join("\n"),
    "calendar.txt": [
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
      "thursday,0,0,0,1,0,0,0,20240229,20240301",
    ].join("\n"),
    "calendar_dates.txt": [
      "service_id,date,exception_type",
      "special,20240301,1",
      ...(cancelLocalTrip ? ["thursday,20240229,2"] : []),
    ].join("\n"),
    "feed_info.txt": [
      "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version",
      "Workshop fixture,https://example.invalid,en,20240229,20240301,fixture",
    ].join("\n"),
  };
}

const workspaces: string[] = [];
afterEach(() => {
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

function buildFixture(cancelLocalTrip = false) {
  const root = mkdtempSync(join(tmpdir(), "schedule-builder-audit-"));
  workspaces.push(root);
  const input = join(root, "input");
  mkdirSync(input);
  writeFileSync(join(input, source.zipFileName), storedZipEntries(scheduleFiles(cancelLocalTrip)));
  const shared = {
    input, allowlist: [source], regionOverride: { w1: "west", w2: "west", e1: "east" },
  };
  // Exercise the real placement decision at its exact byte boundary. Measuring
  // the generated calendar avoids pinning the test to one zlib implementation.
  const measured = buildTimetables({ ...shared, output: join(root, "measure") });
  const calendar = measured.parts.find(part => part.regionId === "west" && part.kind === "calendar");
  if (!calendar) throw new Error("The fixture build did not produce the western calendar");
  const output = join(root, "pack");
  const built = buildTimetables({ ...shared, output, budgetBytes: calendar.bytes });
  const packRoot = join(output, "data", "schedules", "v1");
  const options = {
    manifest: join(packRoot, "manifest.json"), packRoot, releaseRoot: join(output, "release-assets"),
  };
  return { built, options };
}

describe("auditing the local outputs of buildTimetables", () => {
  it("recognizes both placements and keeps regional copies of a late trip distinct", async () => {
    const { built, options } = buildFixture();
    expect(built.skipped).toEqual([]);
    expect(built.parts.filter(part => part.placement === "git").map(part => part.path)).toEqual([
      "west/workshop/calendar.json.gz",
    ]);
    expect(built.parts.filter(part => part.placement === "release")).toHaveLength(3);
    const report = await auditSchedules(options);
    expect(report.status).toBe("clean");
    expect(report.findings).toMatchObject({ errors: 0, warnings: 0, examples: [] });
    expect(report.manifest).toEqual({ declaredParts: 4, eligibleGroups: 2, heldSources: 1 });
    expect(report.totals).toMatchObject({
      selectedParts: 4, decodedParts: 4, declaredTripRows: 3, decodedRows: 3,
      stopTimeEntries: 6, unknownWheelchairTrips: 2, afterMidnightTrips: 2, duplicateTripIds: 0,
    });
    for (const group of report.groups) {
      expect(group).toMatchObject({
        sourceId: source.sourceId, feedStart: "20240229", feedEnd: "20240301",
        provenance: {
          source: source.sourceId, licence: source.licence, retrievedOn: source.retrieved, verificationTier: "UNKNOWN",
        },
      });
    }
    expect(report.groups.find(group => group.regionId === "west")?.totals.decodedRows).toBe(2);
    expect(report.groups.find(group => group.regionId === "east")?.totals.decodedRows).toBe(1);
  });

  it("uses a dated cancellation in the published weekly calendar without cancelling a special service", async () => {
    const { options } = buildFixture(true);
    const west = await auditSchedules({ ...options, region: "west" });
    expect(west.status).toBe("review");
    expect(west.totals).toMatchObject({ decodedRows: 2, rowsWithWarnings: 1, rowsWithErrors: 0 });
    expect(west.findings.counts).toEqual([{ code: "trip.no-service-days", count: 1, severity: "warning" }]);
    const east = await auditSchedules({ ...options, region: "east" });
    expect(east.status).toBe("clean");
    expect(east.totals).toMatchObject({ decodedRows: 1, afterMidnightTrips: 1, unknownWheelchairTrips: 1 });
  });

  it("rereads changed release files and restores the original report when the original bytes return", async () => {
    const { built, options } = buildFixture();
    const baseline = await auditSchedules(options);
    const asset = built.parts.find(part => part.regionId === "east" && part.kind === "trips")?.assetName;
    if (!asset) throw new Error("The fixture build did not emit the eastern trips release asset");
    const path = join(options.releaseRoot, asset);
    const original = readFileSync(path);
    rmSync(path);
    const missing = await auditSchedules(options);
    expect(missing.status).toBe("incomplete");
    expect(missing.totals).toMatchObject({ missingParts: 1, invalidParts: 0, decodedRows: 2, declaredTripRows: 3 });
    expect(missing.findings.counts).toEqual([{ code: "file.missing", count: 1, severity: "warning" }]);
    expect(missing.groups.find(group => group.regionId === "west")).toEqual(
      baseline.groups.find(group => group.regionId === "west"),
    );

    const changed = Buffer.from(original);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    writeFileSync(path, changed);
    const corrupt = await auditSchedules(options);
    expect(corrupt.status).toBe("invalid");
    expect(corrupt.totals).toMatchObject({ missingParts: 0, invalidParts: 1, decodedRows: 2, afterMidnightTrips: 1 });
    expect(corrupt.findings.counts).toEqual([{ code: "file.hash", count: 1, severity: "error" }]);
    writeFileSync(path, original);
    expect(await auditSchedules(options)).toEqual(baseline);
  });

  it("counts the declared regional rows when only the repository portion of the pack is mounted", async () => {
    const { options } = buildFixture();
    const report = await auditSchedules({ manifest: options.manifest, packRoot: options.packRoot });
    expect(report.status).toBe("incomplete");
    expect(report.totals).toMatchObject({
      selectedParts: 4, decodedParts: 1, missingParts: 3,
      declaredTripRows: 3, decodedRows: 0, afterMidnightTrips: 0,
    });
    expect(report.groups.every(group => group.status === "incomplete")).toBe(true);
    expect(report.findings.counts).toEqual([{ code: "file.missing", count: 3, severity: "warning" }]);
  });
});
