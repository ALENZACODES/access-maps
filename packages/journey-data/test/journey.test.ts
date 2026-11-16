import { describe, expect, it, vi } from "vitest";
import { createJourneyModule, createPublishedTimetableAccess, routeRolling, elevatorAt } from "../src/index.js";
import type { PackRecord, PackSource, PackSourceEntry } from "../src/pack-types.js";
import type { TimetableChunk } from "../src/transit.js";

const origin = { lat: 43.65, lon: -79.38 };
const middle = { lat: 43.65, lon: -79.379 };
const destination = { lat: 43.65, lon: -79.378 };
const osm: PackSourceEntry = { sourceId: "osm-ontario", name: "OpenStreetMap Ontario", licence: "ODbL-1.0", retrieved: "2026-11-14", inWebPack: true };
const ttc: PackSourceEntry = { sourceId: "ttc-confirmed", name: "TTC feed", licence: "OGL-ON-1.0", retrieved: "2026-11-14", inWebPack: true };
const held: PackSourceEntry = { sourceId: "miway", name: "MiWay", licence: "UNKNOWN", inWebPack: false, heldReason: "Licence unclear" };
function field(value: string | number | Array<[number, number]>, source = osm.sourceId) {
  return { value, source_id: source, licence: "ODbL-1.0", retrieved_at: "2026-11-14", tier: 1 as const };
}
function path(id: string, from: typeof origin, to: typeof origin, fields: Record<string, ReturnType<typeof field>> = {}): PackRecord {
  return { id, tranche: "path", region: "toronto", fields: {
    geometry: field([[from.lon, from.lat], [to.lon, to.lat]]),
    highway: field("footway"), kerb: field("flush"), surface: field("asphalt"),
    steps: field("0"), ...fields,
  } };
}
function stop(id: string, point: typeof origin, boarding: string, source = ttc.sourceId): PackRecord {
  return { id, tranche: "transit", region: "toronto", fields: {
    lat: field(point.lat, source), lon: field(point.lon, source),
    wheelchair_boarding: field(boarding, source), name: field(id, source),
  } };
}
function fixtureSource(records: PackRecord[], sources = [osm, ttc, held], downloaded = true): PackSource {
  const manifest = { version: 1, sources, regions: [{ id: "toronto",
    label: { en: "Toronto", fr: "Toronto" }, bbox: [-79.5, 43.5, -79.0, 44.0] as [number, number, number, number],
    cells: ["n43.5_w079.5"] }] };
  return {
    manifest: async () => manifest, cellsFor: async () => ["n43.5_w079.5"],
    async *records(tranche) { yield* records.filter((record) => record.tranche === tranche); },
    search: async () => [], get: async (id) => records.find((record) => record.id === id) ?? null,
    sourcesFor: () => sources, regions: async () => [{ id: "toronto", downloaded }],
    downloadRegion: async () => ({ id: "toronto", downloaded: true }), deleteRegion: async () => {},
  };
}
const request = { origin, destination, profile: { stepFreeRequired: true }, now: "2026-11-15T12:00:00Z" };

describe("on-device rolling graph", () => {
  it("refuses steps and raised kerbs rather than detouring over a disconnected edge", () => {
    const first = path("p1", origin, middle);
    const steps = path("p2", middle, destination, { steps: field("3") });
    expect(routeRolling([first, steps], origin, destination, request.profile)).toBeNull();
    const raised = path("p3", middle, destination, { kerb: field("raised") });
    expect(routeRolling([first, raised], origin, destination, request.profile)).toBeNull();
    expect(routeRolling([first, raised], origin, destination, { stepFreeRequired: false })?.recordIds).toEqual(["p1", "p3"]);
  });
  it("counts unknown surfaces and keeps provenance instead of declaring step-free", () => {
    const unknown = path("p2", middle, destination, { surface: field("UNKNOWN") });
    const result = routeRolling([path("p1", origin, middle), unknown], origin, destination, request.profile, [osm]);
    expect(result?.status).toBe("unknown");
    expect(result?.unknownSurfaceCount).toBe(1);
    expect(result?.evidence).toContainEqual(expect.objectContaining({ recordId: "p2", sourceName: "OpenStreetMap Ontario", tier: 1, retrievedAt: "2026-11-14" }));
    expect(result?.evidence.some((entry) => entry.attribution === "© OpenStreetMap contributors, ODbL")).toBe(true);
    expect(result?.evidence.every((entry) => entry.prototype_label === "PROTOTYPE-UNVERIFIED")).toBe(true);
  });
  it("labels pack evidence as SEEDED-OPEN-DATA or PROTOTYPE-UNVERIFIED, never VERIFIED", () => {
    const seeded = path("p2", middle, destination, { surface: { ...field("asphalt"), tier: 0 } });
    const seededRoute = routeRolling([path("p1", origin, middle), seeded], origin, destination, request.profile, [osm]);
    expect(seededRoute?.evidence.filter((entry) => entry.recordId === "p2")
      .every((entry) => entry.prototype_label === "SEEDED-OPEN-DATA")).toBe(true);
    const later = path("p2b", middle, destination, { surface: field("asphalt") });
    const laterRoute = routeRolling([path("p1b", origin, middle), later], origin, destination, request.profile, [osm]);
    expect(laterRoute?.evidence.filter((entry) => entry.recordId === "p2b")
      .every((entry) => entry.prototype_label === "PROTOTYPE-UNVERIFIED")).toBe(true);
    expect(JSON.stringify(seededRoute?.evidence)).not.toMatch(/"VERIFIED"/);
    expect(JSON.stringify(laterRoute?.evidence)).not.toMatch(/"VERIFIED"/);
    const alert = { id: "e1", stopId: "stop-a", state: "out" as const, checkedAt: "2026-11-15T11:00:00Z",
      sourceId: "ttc-confirmed", sourceName: "TTC", licence: "OGL-ON-1.0", tier: 1 as const };
    expect(elevatorAt(alert, request.now)?.evidence.prototype_label).toBe("PROTOTYPE-UNVERIFIED");
    expect(elevatorAt({ ...alert, tier: 0 }, request.now)?.evidence.prototype_label).toBe("SEEDED-OPEN-DATA");
    expect(JSON.stringify(elevatorAt(alert, request.now)?.evidence)).not.toMatch(/"VERIFIED"/);
  });
  it("rejects routes longer than 3 km and unrelated endpoint snaps", () => {
    expect(routeRolling([path("p", origin, middle)], origin, { lat: 43.7, lon: -79.38 }, request.profile)).toBeNull();
    expect(routeRolling([path("p", origin, middle)], origin, destination, request.profile)).toBeNull();
  });
});

describe("recorded stops, elevator alerts and I14 schedules", () => {
  const records = [path("p1", origin, middle), path("p2", middle, destination),
    stop("stop-a", origin, "1"), stop("stop-b", destination, "0"), stop("held-stop", middle, "1", "miway")];
  const chunk: TimetableChunk = { region: "toronto", sourceId: "ttc-confirmed", sourceName: "TTC schedule",
    licence: "OGL-ON-1.0", fetchedAt: "2026-11-14", tier: 1,
    trips: [{ id: "trip-1", routeId: "route-a", stopTimes: [
      { stopId: "stop-a", departure: "12:10:00", arrival: "12:10:00" },
      { stopId: "stop-b", departure: "12:22:00", arrival: "12:22:00" },
    ] }],
  };
  it("marks old or future observations unknown and leaves fresh failures visible", () => {
    const alert = { id: "e1", stopId: "stop-a", state: "out" as const, checkedAt: "2026-11-15T07:00:00Z",
      sourceId: "ttc-confirmed", sourceName: "TTC", licence: "OGL-ON-1.0", tier: 1 };
    expect(elevatorAt(alert, request.now)?.state).toBe("unknown");
    expect(elevatorAt({ ...alert, checkedAt: "2026-11-15T11:00:00Z" }, request.now)?.state).toBe("out");
    expect(elevatorAt({ ...alert, checkedAt: "2026-11-16T11:00:00Z" }, request.now)?.state).toBe("unknown");
  });
  it("uses the I14 fixture for scheduled times without a fetch and omits held sources", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const module = createJourneyModule(fixtureSource(records), {
      timetable: {} as never, readTimetableChunk: async () => chunk,
    });
    const result = await module.plan(request);
    expect(result.transit).toEqual([expect.objectContaining({ departure: "12:10:00", arrival: "12:22:00",
      sourceName: "TTC schedule", fetchedAt: "2026-11-14", scheduled: true })]);
    expect(result.transit[0]?.evidence).toContainEqual(expect.objectContaining({ recordId: "trip-1", licence: "OGL-ON-1.0" }));
    expect(result.originStops.some((item) => item.id === "held-stop")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("names missing timetable region and does not invent times", async () => {
    const result = await createJourneyModule(fixtureSource(records)).plan({ ...request, locale: "fr" });
    expect(result.transit).toEqual([]);
    expect(result.missingTimetables).toEqual(["Toronto"]);
    expect(result.notices.some((notice) => notice.includes("horaires de Toronto"))).toBe(true);
    expect(result.destinationStops.find((item) => item.id === "stop-b")?.boarding).toBe("unknown");
  });
  it("names the required offline region", async () => {
    const result = await createJourneyModule(fixtureSource(records, [osm, ttc, held], false)).plan({ ...request, offline: true });
    expect(result.missingRegions).toEqual(["Toronto"]);
    expect(result.roll).toBeNull();
    expect(result.notices).toContain("Download Toronto for this journey");
  });
  it("does not accept a timetable chunk from held feeds", async () => {
    const result = await createJourneyModule(fixtureSource(records), {
      timetable: {} as never,
      readTimetableChunk: async () => ({ ...chunk, sourceId: "miway", sourceName: "MiWay" }),
    }).plan(request);
    expect(result.transit).toEqual([]);
    expect(result.missingTimetables).toEqual(["Toronto"]);
  });
});

describe("I14 published chunk reader", () => {
  async function gzipPart(body: string, path: string, sourceId: string, kind: "calendar" | "trips", regionId = "toronto") {
    const { gzipSync } = await import("node:zlib");
    const bytes = gzipSync(Buffer.from(body));
    const sha256 = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
    const part = {
      path, bytes: bytes.byteLength, sha256, sourceId, licence: "OGL-ON-1.0",
      retrieved: "2026-11-14", kind, regionId,
    };
    return { part, bytes };
  }

  it("reads gzip calendar and trip NDJSON and returns no times when a part is missing", async () => {
    const calendar = JSON.stringify({ sourceId: "ttc-confirmed", sourceName: "TTC schedule" });
    const trip = JSON.stringify({
      id: "trip-1", routeId: "route-a",
      stopTimes: [
        { stopId: "stop-a", departure: "12:10:00", arrival: "12:10:00" },
        { stopId: "stop-b", departure: "12:22:00", arrival: "12:22:00" },
      ],
    });
    const cal = await gzipPart(calendar, "calendar.json.gz", "ttc-confirmed", "calendar");
    const trips = await gzipPart(`${trip}\n`, "trips-1.ndjson.gz", "ttc-confirmed", "trips");
    const manifest = {
      version: 1 as const,
      parts: [cal.part, trips.part],
      sources: [{ sourceId: "ttc-confirmed", sourceName: "TTC schedule", inWebPack: true }],
    };
    const files = new Map<string, Uint8Array>([
      ["https://offline.invalid/schedules/manifest.json", new TextEncoder().encode(JSON.stringify(manifest))],
      ["https://offline.invalid/schedules/calendar.json.gz", new Uint8Array(cal.bytes)],
      ["https://offline.invalid/schedules/trips-1.ndjson.gz", new Uint8Array(trips.bytes)],
    ]);
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const body = files.get(url);
      if (body === undefined) return new Response(null, { status: 504 });
      const copy = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
      return new Response(copy, { status: 200 });
    };
    const access = createPublishedTimetableAccess({
      baseUrl: "https://offline.invalid/schedules/",
      fetch: fetchFn,
    });
    const chunks = await access.readTimetableChunks(access.source, "toronto");
    expect(chunks).toEqual([expect.objectContaining({
      region: "toronto", sourceId: "ttc-confirmed", sourceName: "TTC schedule",
      licence: "OGL-ON-1.0", fetchedAt: "2026-11-14", tier: null,
    })]);
    expect(chunks[0]?.trips[0]?.stopTimes[1]?.arrival).toBe("12:22:00");
    files.delete("https://offline.invalid/schedules/trips-1.ndjson.gz");
    const emptyAccess = createPublishedTimetableAccess({
      baseUrl: "https://offline.invalid/schedules/",
      fetch: fetchFn,
      manifest,
    });
    expect(await emptyAccess.readTimetableChunks(emptyAccess.source, "toronto")).toEqual([]);
    expect(await emptyAccess.source.departures({ stopIds: ["stop-a"], at: new Date() })).toEqual([]);
  });

  it("accepts a GO timetable chunk and still holds MiWay", async () => {
    const go: PackSourceEntry = { sourceId: "metrolinx-go", name: "GO Transit", licence: "Metrolinx AUA", retrieved: "2026-11-15", inWebPack: true };
    const records = [path("p1", origin, middle), path("p2", middle, destination),
      stop("stop-a", origin, "1"), stop("stop-b", destination, "0"), stop("held-stop", middle, "1", "miway")];
    const result = await createJourneyModule(fixtureSource(records, [osm, ttc, held, go]), {
      timetable: {} as never,
      readTimetableChunk: async () => ({
        region: "toronto", sourceId: "metrolinx-go", sourceName: "GO Transit",
        licence: "Metrolinx AUA", fetchedAt: "2026-11-15", tier: 1,
        trips: [{ id: "trip-go", routeId: "route-go", stopTimes: [
          { stopId: "stop-a", departure: "13:00:00", arrival: "13:00:00" },
          { stopId: "stop-b", departure: "13:20:00", arrival: "13:20:00" },
        ] }],
      }),
    }).plan(request);
    expect(result.transit).toEqual([expect.objectContaining({ departure: "13:00:00", arrival: "13:20:00", sourceName: "GO Transit" })]);
    expect(result.originStops.some((item) => item.id === "held-stop")).toBe(false);
  });
});
