import { describe, expect, it } from "vitest";
import { auditCalendar } from "./calendar.ts";
import type { Issue } from "./common.ts";
import { TripAudit, tripIssueCodes, tripIssueText, type TripCatalog, type TripPart } from "./trips.ts";

function part(partIndex: number, tripCount: number): TripPart {
  return { partIndex, tripCount, feedStart: "20240228", feedEnd: "20240301" };
}

function stopTime(sequence: number, arrival: string, departure = arrival, stopId = "platform") {
  return { stopId, sequence, arrival, departure };
}

function trip(id = "trip", patch: Record<string, unknown> = {}) {
  return {
    id, routeId: "loop", serviceId: "special", headsign: "", wheelchairAccessible: "UNKNOWN",
    stopTimes: [stopTime(0, "23:58:59", "23:59:01"), stopTime(5, "24:05:12")],
    ...patch,
  };
}

function catalogue(patch: Partial<TripCatalog> = {}): TripCatalog {
  return {
    route: id => id === "loop" ? "present" : "missing",
    service: id => id === "special" ? "present" : "missing",
    stop: id => id === "platform" ? "present" : "missing",
    serviceDays: () => ({ active: 1, unknown: 0, inactive: 2 }),
    ...patch,
  };
}

function inspect(rows: unknown[], catalog: TripCatalog | null = catalogue(), declaration = rows.length) {
  const audit = new TripAudit(catalog);
  audit.auditPart(part(3, declaration), rows);
  return audit.summary();
}

describe("trip part accounting", () => {
  it("accepts a loop crossing midnight and counts the return to the same stop", () => {
    const result = inspect([trip()]);
    expect(result).toEqual({
      parts: 1, declaredTrips: 1, parsedRows: 1, tripRows: 1,
      rowsWithErrors: 0, rowsWithWarnings: 0, stopTimes: 2, unknownWheelchairTrips: 1,
      afterMidnightTrips: 1, duplicateTripIds: 0, untrackedTripIds: 0,
      errors: 0, warnings: 0, issues: [], omittedIssues: 0,
    });
  });

  it("reports the declared count, decoded values and trip records separately", () => {
    const result = inspect([null, [], trip(), {}], catalogue(), 7);
    expect(result).toMatchObject({
      declaredTrips: 7, parsedRows: 4, tripRows: 2, rowsWithErrors: 3,
      stopTimes: 2, unknownWheelchairTrips: 2, afterMidnightTrips: 1,
    });
    expect(result.issues.filter(issue => issue.code === "trip.row").map(issue => issue.at)).toEqual([
      "parts[3].rows[0]", "parts[3].rows[1]",
    ]);
    expect(result.issues[0]).toEqual({ code: "trip.count", severity: "error", at: "parts[3].tripCount" });
    expect(result.errors).toBe(result.issues.length);
    expect(result.rowsWithWarnings).toBe(0);
  });

  it("flags a count mismatch on a part even when all its decoded rows pass", () => {
    const result = inspect([trip()], catalogue(), 0);
    expect(result.errors).toBe(1);
    expect(result.rowsWithErrors).toBe(0);
    expect(result.issues.map(issue => issue.code)).toEqual(["trip.count"]);
  });

  it("retains the manifest index and returns independent part and aggregate metrics", () => {
    const audit = new TripAudit(catalogue());
    const first = audit.auditPart(part(8, 2), [trip("a"), trip("b")]);
    const second = audit.auditPart(part(2, 3), [false]);
    expect(first).toMatchObject({ partIndex: 8, parsedRows: 2, errors: 0 });
    expect(second).toMatchObject({ partIndex: 2, parsedRows: 1, errors: 2 });
    first.parsedRows = 90;
    expect(audit.summary()).toMatchObject({ parts: 2, parsedRows: 3, declaredTrips: 5, tripRows: 2 });
  });

  it("does not silently round an unsafe aggregate or commit a rejected contribution", () => {
    const audit = new TripAudit(catalogue());
    audit.auditPart(part(1, Number.MAX_SAFE_INTEGER), []);
    expect(() => audit.auditPart(part(2, 1), [])).toThrow(RangeError);
    expect(audit.summary()).toMatchObject({ parts: 1, declaredTrips: Number.MAX_SAFE_INTEGER, errors: 1 });
  });
});

describe("trip joins to the local calendar", () => {
  it("points to every missing foreign key without copying upstream identifiers into findings", () => {
    const result = inspect([trip("opaque-identity", {
      routeId: "private-route-name", serviceId: "private-service-id",
      stopTimes: [stopTime(1, "8:21:00", "8:21:01", "private-stop-id")],
      headsign: "unreviewed free text",
    })]);
    expect(result.issues).toEqual([
      { code: "trip.route-missing", at: "parts[3].rows[0].routeId", severity: "error" },
      { code: "trip.service-missing", at: "parts[3].rows[0].serviceId", severity: "error" },
      { code: "trip.stop-missing", at: "parts[3].rows[0].stopTimes[0].stopId", severity: "error" },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/opaque|private|unreviewed/u);
  });

  it("keeps unresolved joins distinct from proven missing references", () => {
    const catalog = catalogue({
      route: () => "unknown", service: () => "unknown", stop: () => "unknown",
      serviceDays: () => { throw new Error("Unresolved service must not be queried"); },
    });
    const result = inspect([trip()], catalog);
    expect(result).toMatchObject({ rowsWithWarnings: 1, warnings: 4, errors: 0, unknownWheelchairTrips: 1 });
    expect(result.issues.map(issue => issue.code)).toEqual([
      "trip.route-unknown", "trip.service-unknown", "trip.stop-unknown", "trip.stop-unknown",
    ]);
  });

  it("still detects a broken sequence when catalogue evidence is absent", () => {
    const result = inspect([trip("a", {
      stopTimes: [stopTime(1, "12:00:00"), stopTime(1, "12:10:00")],
    })], null);
    expect(result.issues).toEqual([
      { code: "trip.catalog-unavailable", at: "parts[3].rows[0]", severity: "warning" },
      { code: "trip.sequence-order", at: "parts[3].rows[0].stopTimes[1].sequence", severity: "error" },
    ]);
    expect(result).toMatchObject({ rowsWithErrors: 1, rowsWithWarnings: 1 });
  });

  it("caches service checks only within the part's declared coverage", () => {
    const ranges: string[][] = [];
    const catalog = catalogue({
      serviceDays(id, from, through) {
        ranges.push([id, from, through]);
        return { active: from === "20240228" ? 1 : 0, unknown: 0, inactive: 2 };
      },
    });
    const audit = new TripAudit(catalog);
    audit.auditPart(part(2, 2), [trip("first"), trip("second")]);
    audit.auditPart({ ...part(4, 2), feedStart: "20240301" }, [trip("third"), trip("fourth")]);
    expect(ranges).toEqual([["special", "20240228", "20240301"], ["special", "20240301", "20240301"]]);
    expect(audit.summary().issues.map(issue => issue.code)).toEqual(["trip.no-service-days", "trip.no-service-days"]);
  });

  it("preserves inconclusive service coverage separately from fully known inactive days", () => {
    const result = inspect([trip()], catalogue({ serviceDays: () => ({ active: 0, unknown: 1, inactive: 2 }) }));
    expect(result.issues).toEqual([
      { code: "trip.service-days-unknown", severity: "warning", at: "parts[3].rows[0].serviceId" },
    ]);
    const active = inspect([trip()], catalogue({ serviceDays: () => ({ active: 1, unknown: 2, inactive: 0 }) }));
    expect(active.issues).toEqual([]);
  });

  it.each([
    ["UNKNOWN", "UNKNOWN"], ["UNKNOWN", "20240301"], ["20240228", "UNKNOWN"],
    ["20240230", "20240301"], ["20240302", "20240301"],
  ])("keeps coverage unknown without querying an invalid period %s to %s", (feedStart, feedEnd) => {
    const audit = new TripAudit(catalogue({
      serviceDays: () => { throw new Error("Invalid period sent to calendar"); },
    }));
    audit.auditPart({ ...part(3, 1), feedStart, feedEnd }, [trip()]);
    expect(audit.summary().issues.map(issue => issue.code)).toEqual(["trip.service-days-unknown"]);
  });

  it("joins real calendar exception-only service without promoting stop boarding evidence to the trip", () => {
    const issues: Issue[] = [];
    const input = {
      sourceId: "fixture", sourceName: "Fixture", agency: [{ id: "", name: "Fixture" }],
      calendar: [], calendarDates: [{ serviceId: "special", date: "20240229", exceptionType: "1" }],
      stops: [{ id: "platform", name: "Fixture platform", lat: 0, lon: 0, wheelchairBoarding: "1" }],
      routes: [{ id: "loop", type: "3", shortName: "L", longName: "" }],
    };
    const index = auditCalendar(input, { ...part(3, 1), sourceId: "fixture" }, issue => issues.push(issue));
    const report = inspect([trip()], index);
    expect(issues).toEqual([]);
    expect(index.stopBoarding("platform")).toBe("1");
    expect(report.unknownWheelchairTrips).toBe(1);
    expect(report.issues).toEqual([]);
  });
});

describe("trip identities and bounded storage", () => {
  it("tracks exact identifiers across shards and marks repetitions within one shard", () => {
    const ids = ["1", "01", "01 ", "é:R", "É:R", "__proto__", "constructor", "😀"];
    const audit = new TripAudit(catalogue());
    audit.auditPart(part(1, ids.length), ids.map(id => trip(id)));
    const next = audit.auditPart(part(4, 3), [trip("É:R"), trip("fresh"), trip("fresh")]);
    expect(next.duplicateTripIds).toBe(2);
    expect(audit.summary().issues).toEqual([
      { code: "trip.duplicate-id", at: "parts[4].rows[0].id", severity: "error" },
      { code: "trip.duplicate-id", at: "parts[4].rows[2].id", severity: "error" },
    ]);
    expect(inspect([trip("É:R")]).duplicateTripIds).toBe(0);
  });

  it("tracks a valid ID on a malformed trip so a second occurrence is visible", () => {
    const result = inspect([trip("same", { headsign: 3 }), trip("same")]);
    expect(result.issues.map(issue => issue.code)).toEqual(["trip.headsign", "trip.duplicate-id"]);
    expect(result.rowsWithErrors).toBe(2);
  });

  it("rejects empty, control-bearing and non-string identifiers at their field paths", () => {
    const wrong = trip("", {
      routeId: 0, serviceId: " \t ", stopTimes: [stopTime(0, "00:00:00", "00:00:00", "bad\u007fid")],
    });
    const result = inspect([wrong, wrong]);
    expect(result.issues.slice(0, 4).map(issue => issue.at)).toEqual([
      "parts[3].rows[0].id", "parts[3].rows[0].routeId", "parts[3].rows[0].serviceId",
      "parts[3].rows[0].stopTimes[0].stopId",
    ]);
    expect(result.issues.every(issue => issue.code === "trip.id")).toBe(true);
    expect(result.duplicateTripIds).toBe(0);
  });

  it("continues detecting previously tracked IDs when the ID count limit is full", () => {
    const audit = new TripAudit(catalogue(), { maxTripIds: 1 });
    audit.auditPart(part(1, 2), [trip("a"), trip("b")]);
    audit.auditPart(part(2, 2), [trip("b"), trip("a")]);
    expect(audit.summary()).toMatchObject({ untrackedTripIds: 2, duplicateTripIds: 1, errors: 1, warnings: 2 });
    expect(audit.summary().issues.map(issue => issue.at)).toEqual([
      "parts[1].rows[1].id", "parts[2].rows[0].id", "parts[2].rows[1].id",
    ]);
  });

  it("limits retained text in code units and can still admit a later shorter ID", () => {
    const audit = new TripAudit(catalogue(), { maxIdCodeUnits: 3 });
    audit.auditPart(part(1, 3), [trip("😀😀"), trip("😀"), trip("x")]);
    audit.auditPart(part(3, 3), [trip("x"), trip("😀"), trip("z")]);
    expect(audit.summary()).toMatchObject({ untrackedTripIds: 2, duplicateTripIds: 2 });
    expect(audit.summary().issues.map(issue => issue.code)).toEqual([
      "trip.id-budget", "trip.duplicate-id", "trip.duplicate-id", "trip.id-budget",
    ]);
  });

  it("keeps UTF-16 identifier identity when detaching keys from the decoded payload", () => {
    const audit = new TripAudit(catalogue());
    const ids = ["prefix-" + "\ud800", "prefix-" + "\ud801", "prefix-�"];
    audit.auditPart(part(1, 3), ids.map(id => trip(id)));
    const repeats = audit.auditPart(part(2, 3), ids.map(id => trip(id)));
    expect(repeats.duplicateTripIds).toBe(3);
    expect(audit.summary().errors).toBe(3);
  });

  it("collects totals and every callback when the retained sample is full", () => {
    const events: Issue[] = [];
    const audit = new TripAudit(null, { maxIssues: 1, maxTripIds: 0, onIssue: issue => events.push(issue) });
    audit.auditPart(part(1, 1), [trip()]);
    audit.auditPart(part(2, 1), [trip()]);
    const summary = audit.summary();
    expect(summary).toMatchObject({ warnings: 4, untrackedTripIds: 2, omittedIssues: 3 });
    expect(events.map(issue => issue.code)).toEqual([
      "trip.id-budget", "trip.catalog-unavailable", "trip.id-budget", "trip.catalog-unavailable",
    ]);
    events[0]!.at = "mutated by consumer";
    summary.issues[0]!.code = "edited copy";
    expect(audit.summary().issues).toEqual([{ code: "trip.id-budget", at: "parts[1].rows[0].id", severity: "warning" }]);
  });

  it("retries a failed part without preserving IDs or samples from the failed pass", () => {
    let interrupted = true;
    const audit = new TripAudit(catalogue(), { onIssue() {
      if (interrupted) throw new Error("Test sink interrupted");
    } });
    const rows = [trip("first"), trip("second", { headsign: false })];
    expect(() => audit.auditPart(part(8, 2), rows)).toThrow("Test sink interrupted");
    expect(audit.summary()).toMatchObject({ parts: 0, tripRows: 0, errors: 0, issues: [] });
    interrupted = false;
    audit.auditPart(part(8, 2), rows);
    expect(audit.summary()).toMatchObject({ parts: 1, tripRows: 2, errors: 1, duplicateTripIds: 0 });
  });
});

describe("service-day clocks and stop order", () => {
  it("accepts one- and two-digit hours, equal timestamps and legal gaps in the sequence", () => {
    const result = inspect([trip("day", { stopTimes: [
      stopTime(0, "0:00:00"), stopTime(2, "00:00:00"), stopTime(90, "23:59:59"),
    ] })]);
    expect(result).toMatchObject({ afterMidnightTrips: 0, stopTimes: 3, issues: [] });
  });

  it("distinguishes extended service days from deliberately short lookup history", () => {
    const result = inspect([
      trip("second-day", { stopTimes: [stopTime(1, "24:00:00"), stopTime(2, "47:59:59")] }),
      trip("third-day", { stopTimes: [stopTime(1, "48:00:00"), stopTime(2, "71:59:59")] }),
      trip("later", { stopTimes: [stopTime(1, "71:59:59", "72:00:00"), stopTime(2, "100:00:00")] }),
    ]);
    expect(result.afterMidnightTrips).toBe(3);
    expect(result.issues).toEqual([
      { code: "trip.lookup-window", at: "parts[3].rows[2].stopTimes[0].departure", severity: "warning" },
    ]);
  });

  it.each(["23:59:60", "24:60:00", "08:00", " 8:00:00", "8:00:00\n", "-1:00:00", "1000:00:00", "1:2:03"])(
    "rejects malformed service clock %j at both stop cells", clock => {
      const result = inspect([trip("bad-clock", { stopTimes: [stopTime(1, clock)] })]);
      expect(result.issues.map(issue => [issue.code, issue.at])).toEqual([
        ["trip.clock", "parts[3].rows[0].stopTimes[0].arrival"],
        ["trip.clock", "parts[3].rows[0].stopTimes[0].departure"],
      ]);
      expect(result.rowsWithErrors).toBe(1);
    },
  );

  it("flags negative dwell and clock rollover within the same trip", () => {
    const result = inspect([trip("rollover", { stopTimes: [
      stopTime(1, "23:59:00", "23:58:59"), stopTime(2, "00:02:00"),
    ] })]);
    expect(result.issues).toEqual([
      { code: "trip.dwell", at: "parts[3].rows[0].stopTimes[0].departure", severity: "error" },
      { code: "trip.time-backwards", at: "parts[3].rows[0].stopTimes[1].arrival", severity: "error" },
    ]);
  });

  it("preserves the latest usable time and sequence through damaged intermediate stops", () => {
    const result = inspect([trip("partial", { stopTimes: [
      stopTime(5, "12:00:00"), null,
      { ...stopTime(2, "bad", "11:59:59"), sequence: "6" },
      stopTime(4, "12:01:00"),
    ] })]);
    expect(result.issues.map(issue => [issue.code, issue.at.split("stopTimes")[1]])).toEqual([
      ["trip.stop-row", "[1]"], ["trip.sequence", "[2].sequence"], ["trip.clock", "[2].arrival"],
      ["trip.time-backwards", "[2].departure"], ["trip.sequence-order", "[3].sequence"],
    ]);
    expect(result.stopTimes).toBe(4);
  });

  it.each([null, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1])("rejects an unsupported sequence %j", sequence => {
    const result = inspect([trip("broken", { stopTimes: [{ ...stopTime(0, "00:00:01"), sequence }] })]);
    expect(result.issues).toEqual([{ code: "trip.sequence", at: "parts[3].rows[0].stopTimes[0].sequence", severity: "error" }]);
  });

  it("reports missing stop lists and malformed stop rows at their distinct locations", () => {
    const result = inspect([trip("absent", { stopTimes: null }), trip("empty", { stopTimes: [] }),
      trip("not-a-stop", { stopTimes: ["platform"] })]);
    expect(result.issues.map(issue => [issue.code, issue.at])).toEqual([
      ["trip.stop-list", "parts[3].rows[0].stopTimes"], ["trip.stop-list", "parts[3].rows[1].stopTimes"],
      ["trip.stop-row", "parts[3].rows[2].stopTimes[0]"],
    ]);
  });
});

describe("trip accessibility evidence", () => {
  it("retains explicit trip flags and counts recognized unknown representations", () => {
    const flags = ["1", "2", "0", "UNKNOWN"];
    const result = inspect(flags.map((wheelchairAccessible, i) => trip(String(i), { wheelchairAccessible })));
    expect(result.issues).toEqual([]);
    expect(result.unknownWheelchairTrips).toBe(2);
  });

  it("counts unsupported fields as unknown and records the malformed evidence", () => {
    const flags = [false, 1, 0, null, undefined, "yes", ""];
    const result = inspect(flags.map((wheelchairAccessible, i) => trip(String(i), { wheelchairAccessible })));
    expect(result.unknownWheelchairTrips).toBe(flags.length);
    expect(result.errors).toBe(flags.length);
    expect(result.issues.every(issue => issue.code === "trip.wheelchair-flag")).toBe(true);
  });

  it("provides English and French text for each trip diagnostic", () => {
    for (const code of tripIssueCodes) {
      const [en, fr] = tripIssueText[code];
      expect(en.length).toBeGreaterThan(0);
      expect(fr.length).toBeGreaterThan(0);
      expect(fr).not.toBe(en);
      expect(fr).not.toMatch(/[^\u00a0][:?!]/u);
    }
  });
});
