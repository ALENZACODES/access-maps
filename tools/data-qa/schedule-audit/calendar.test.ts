import { describe, expect, it } from "vitest";
import type { Issue } from "./common.ts";
import { auditCalendar, type CalendarScope, type ServiceDays } from "./calendar.ts";

const scope: CalendarScope = { sourceId: "fixture", feedStart: "20240201", feedEnd: "20240331" };

function rule(serviceId = "weekday", startDate = "20240201", endDate = "20240331") {
  return { serviceId, startDate, endDate, weekdays: ["0", "1", "1", "1", "1", "1", "0"] };
}

function exception(serviceId: string, date: string, exceptionType: string) {
  return { serviceId, date, exceptionType };
}

function route(id = "line") {
  return { id, shortName: "L", longName: "", type: "3" };
}

function stop(id = "platform") {
  return { id, name: "Fixture stop", lat: 0, lon: 0, wheelchairBoarding: "UNKNOWN" };
}

function calendar(patch: Record<string, unknown> = {}) {
  return {
    sourceId: scope.sourceId, sourceName: "Fixture catalogue", agency: [{ id: "", name: "Fixture catalogue" }],
    stops: [stop()], routes: [route()], calendar: [rule()], calendarDates: [], ...patch,
  };
}

function inspect(input: unknown, coverage = scope) {
  const issues: Issue[] = [];
  const index = auditCalendar(input, coverage, issue => issues.push(issue));
  return { index, issues };
}

describe("calendar evidence identity", () => {
  it("resolves a complete source and preserves the distinction between a referenced and an absent row", () => {
    const { index, issues } = inspect(calendar());
    expect(issues).toEqual([]);
    expect(index.route("line")).toBe("present");
    expect(index.stop("platform")).toBe("present");
    expect(index.service("weekday")).toBe("present");
    expect(index.stop("line")).toBe("missing");
    expect(index.service("platform")).toBe("missing");
    expect(index.serviceDays("undefined-service", "20240229", "20240301")).toEqual({
      active: 0, inactive: 0, unknown: 2,
    });
  });

  it("ignores otherwise plausible evidence from another manifest source", () => {
    const { index, issues } = inspect(calendar({ sourceId: "wrong", stops: [{ ...stop(), wheelchairBoarding: "1" }] }));
    expect(issues).toEqual([{ code: "CAL_SOURCE", at: "/sourceId", severity: "error" }]);
    expect(index.route("line")).toBe("unknown");
    expect(index.stop("platform")).toBe("unknown");
    expect(index.stopBoarding("platform")).toBe("UNKNOWN");
    expect(index.serviceDays("weekday", "20240229", "20240229").unknown).toBe(1);
  });

  it("checks the source name written by the builder when the manifest supplies it", () => {
    const coverage = { ...scope, sourceName: "Fixture catalogue" };
    expect(inspect(calendar(), coverage).issues).toEqual([]);
    const mismatch = inspect(calendar({ sourceName: "Other catalogue" }), coverage);
    expect(mismatch.issues).toEqual([{ code: "CAL_SOURCE", at: "/sourceName", severity: "error" }]);
    expect(mismatch.index.serviceDays("weekday", "20240229", "20240229").unknown).toBe(1);
    const absent = inspect(calendar({ sourceName: null }), coverage);
    expect(absent.issues).toEqual([{ code: "CAL_NAME", at: "/sourceName", severity: "error" }]);
    expect(absent.index.route("line")).toBe("unknown");
  });

  it("joins opaque identifiers exactly, including numeric prefixes and property-like names", () => {
    const ids = ["001", "1", "__proto__", "constructor", "réseau:R 2", " 009 "];
    const { index, issues } = inspect(calendar({ stops: ids.map(stop), routes: ids.map(route) }));
    expect(issues).toEqual([]);
    for (const id of ids) {
      expect(index.route(id)).toBe("present");
      expect(index.stop(id)).toBe("present");
    }
    expect(index.stop("009")).toBe("missing");
  });

  it("quarantines only the duplicated stop ID and never selects the last boarding flag", () => {
    const { index, issues } = inspect(calendar({ stops: [
      { ...stop(), wheelchairBoarding: "1" }, { ...stop(), wheelchairBoarding: "2" },
      { ...stop("other"), wheelchairBoarding: "2" },
    ] }));
    expect(issues).toEqual([{ code: "CAL_DUPLICATE_ID", at: "/stops/1/id", severity: "error" }]);
    expect(index.stopBoarding("platform")).toBe("UNKNOWN");
    expect(index.stop("platform")).toBe("unknown");
    expect(index.stopBoarding("other")).toBe("2");
    expect(index.route("line")).toBe("present");
  });

  it("checks geographic bounds without confusing a zero coordinate with missing data", () => {
    const rows = [
      stop("zero"), { ...stop("edge"), lat: -90, lon: 180 },
      { ...stop("null"), lat: null, lon: "0" }, { ...stop("past-edge"), lat: 90.1, lon: -181 },
    ];
    const { index, issues } = inspect(calendar({ stops: rows }));
    expect(issues.map(issue => issue.at)).toEqual(["/stops/2/lat", "/stops/2/lon", "/stops/3/lat", "/stops/3/lon"]);
    expect(index.stop("zero")).toBe("present");
    expect(index.stop("edge")).toBe("present");
    expect(index.stop("null")).toBe("unknown");
    expect(index.stop("past-edge")).toBe("unknown");
  });

  it("accepts the builder's boarding values and keeps unknown separate from an explicit barrier", () => {
    const flags = ["1", "2", "0", "UNKNOWN", null, "yes", 1];
    const { index, issues } = inspect(calendar({ stops: flags.map((flag, i) => ({
      ...stop("stop-" + i), wheelchairBoarding: flag,
    })) }));
    expect(issues.map(issue => issue.code)).toEqual(["CAL_BOARDING", "CAL_BOARDING", "CAL_BOARDING"]);
    expect(flags.map((_, i) => index.stopBoarding("stop-" + i))).toEqual([
      "1", "2", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN",
    ]);
    expect(index.stop("stop-2")).toBe("present");
    expect(index.stop("stop-4")).toBe("unknown");
  });

  it("preserves extended numeric route types and checks that at least one name is available", () => {
    const routes = [
      { ...route("long"), type: "1300", shortName: "", longName: "Synthetic loop" },
      { ...route("short"), type: "0" },
      { ...route("missing-name"), shortName: " " },
      { ...route("missing-type"), type: null },
    ];
    const { index, issues } = inspect(calendar({ routes }));
    expect(issues.map(issue => issue.code)).toEqual(["CAL_NAME", "CAL_ROUTE_TYPE"]);
    expect(index.route("long")).toBe("present");
    expect(index.route("short")).toBe("present");
    expect(index.route("missing-type")).toBe("unknown");
  });

  it("accepts an anonymous singleton agency and requires unambiguous keys in multi-agency rows", () => {
    const { issues } = inspect(calendar({ agency: [
      { id: "", name: "First" }, { id: "b", name: "Second" }, { id: "b", name: "" },
    ] }));
    expect(issues.map(issue => [issue.code, issue.at])).toEqual([
      ["CAL_ID", "/agency/0/id"], ["CAL_NAME", "/agency/2/name"], ["CAL_DUPLICATE_ID", "/agency/2/id"],
    ]);
  });

  it("never leaks an invalid source label or ID in findings", () => {
    const secretLabel = "private\nfixture-marker";
    const { index, issues } = inspect(calendar({
      agency: {}, routes: [null, route(secretLabel)], stops: [{ ...stop(secretLabel), lat: 500 }],
      calendar: [{ ...rule(secretLabel) }], calendarDates: "bad",
    }));
    expect(issues.some(issue => issue.at === "/routes/1/id")).toBe(true);
    expect(issues.every(issue => /^\/(?:[A-Za-z]+|\d+)(?:\/(?:[A-Za-z]+|\d+))*$/u.test(issue.at))).toBe(true);
    expect(JSON.stringify(issues)).not.toContain("fixture-marker");
    expect(index.service("weekday")).toBe("unknown");
    expect(index.route("absent")).toBe("unknown");
  });
});

describe("service-day evidence", () => {
  it("counts both range endpoints and clips dates outside the feed to unknown", () => {
    const { index } = inspect(calendar({ calendar: [rule("wk", "20240229", "20240304")] }));
    expect(index.serviceDays("wk", "20240228", "20240305")).toEqual({ active: 3, inactive: 4, unknown: 0 });
    expect(index.serviceDays("wk", "20240131", "20240201")).toEqual({ active: 0, inactive: 1, unknown: 1 });
    expect(index.serviceDays("wk", "20240331", "20240402")).toEqual({ active: 0, inactive: 1, unknown: 2 });
  });

  it("keeps absent feed bounds unknown while distinguishing malformed and reversed bounds", () => {
    for (const key of ["feedStart", "feedEnd"] as const) {
      const { index, issues } = inspect(calendar(), { ...scope, [key]: "UNKNOWN" });
      expect(issues).toEqual([{ code: "CAL_UNKNOWN_COVERAGE", at: "/" + key, severity: "warning" }]);
      expect(index.serviceDays("weekday", "20240229", "20240301")).toEqual({ active: 0, inactive: 0, unknown: 2 });
    }
    const bad = inspect(calendar(), { ...scope, feedStart: "20240231" });
    expect(bad.issues).toEqual([{ code: "CAL_DATE", at: "/feedStart", severity: "error" }]);
    const reversed = inspect(calendar(), { ...scope, feedEnd: "20240131" });
    expect(reversed.issues).toEqual([{ code: "CAL_RANGE", at: "/feedEnd", severity: "error" }]);
    expect(reversed.index.serviceDays("weekday", "20240201", "20240201").unknown).toBe(1);
  });

  it("uses Sunday as index zero in the shard's weekly mask", () => {
    const mask = ["1", "0", "0", "0", "0", "0", "0"];
    const { index } = inspect(calendar({ calendar: [{ ...rule("sun"), weekdays: mask }] }));
    expect(index.serviceDays("sun", "20240204", "20240204").active).toBe(1);
    expect(index.serviceDays("sun", "20240205", "20240210").active).toBe(0);
    expect(index.serviceDays("sun", "20240201", "20240331")).toEqual({ active: 9, inactive: 51, unknown: 0 });
  });

  it("counts an exception-only service and lets overrides add dates outside its usual weekly range", () => {
    const { index, issues } = inspect(calendar({
      calendar: [rule("regular", "20240212", "20240216")],
      calendarDates: [
        exception("special", "20240211", "1"), exception("regular", "20240211", "1"),
        exception("regular", "20240212", "2"), exception("regular", "20240217", "2"),
      ],
    }));
    expect(issues).toEqual([]);
    expect(index.service("special")).toBe("present");
    expect(index.serviceDays("special", "20240209", "20240218")).toEqual({ active: 1, inactive: 9, unknown: 0 });
    expect(index.serviceDays("regular", "20240209", "20240218")).toEqual({ active: 5, inactive: 5, unknown: 0 });
  });

  it("distinguishes agreeing duplicate exceptions from conflicting statements without order bias", () => {
    const agree = exception("weekday", "20240204", "1");
    const disagree = exception("weekday", "20240205", "2");
    for (const ordered of [
      [disagree, { ...disagree, exceptionType: "1" }],
      [{ ...disagree, exceptionType: "1" }, disagree],
    ]) {
      const { index, issues } = inspect(calendar({ calendarDates: [agree, agree, ...ordered] }));
      expect(issues).toEqual([
        { code: "CAL_DUPLICATE_EXCEPTION", at: "/calendarDates/1", severity: "warning" },
        { code: "CAL_CONFLICT_EXCEPTION", at: "/calendarDates/3", severity: "error" },
      ]);
      expect(index.serviceDays("weekday", "20240204", "20240206")).toEqual({ active: 2, inactive: 0, unknown: 1 });
    }
  });

  it("lets unambiguous dated evidence resolve just that day when base schedules conflict", () => {
    const { index, issues } = inspect(calendar({
      calendar: [rule(), { ...rule(), weekdays: Array(7).fill("0") }],
      calendarDates: [exception("weekday", "20240210", "1"), exception("weekday", "20240211", "2")],
    }));
    expect(issues.map(issue => issue.code)).toEqual(["CAL_DUPLICATE_RULE"]);
    expect(index.service("weekday")).toBe("unknown");
    expect(index.serviceDays("weekday", "20240209", "20240212")).toEqual({ active: 1, inactive: 1, unknown: 2 });
  });

  it("has unknown activity for the applicable days of an invalid pattern or reversed range", () => {
    const { index, issues } = inspect(calendar({
      calendar: [
        { ...rule("typed"), weekdays: [1, 0, 0, 0, 0, 0, 1] },
        { ...rule("short"), weekdays: ["1"] },
        rule("reversed", "20240301", "20240201"),
        rule("invalid", "20240230", "20240301"),
      ],
    }));
    expect(issues.map(issue => issue.code)).toEqual(["CAL_WEEKDAYS", "CAL_WEEKDAYS", "CAL_RANGE", "CAL_DATE"]);
    for (const id of ["typed", "short", "reversed", "invalid"]) {
      expect(index.serviceDays(id, "20240229", "20240301")).toEqual({ active: 0, inactive: 0, unknown: 2 });
    }
  });

  it("isolates a misdated action to its own service, and an invalid action to its day", () => {
    const { index, issues } = inspect(calendar({
      calendar: [rule("one"), rule("two")],
      calendarDates: [exception("one", "20240231", "1"), exception("two", "20240226", "3")],
    }));
    expect(issues.map(issue => issue.code)).toEqual(["CAL_DATE", "CAL_EXCEPTION_TYPE"]);
    expect(index.serviceDays("one", "20240226", "20240227")).toEqual({ active: 0, inactive: 0, unknown: 2 });
    expect(index.serviceDays("two", "20240226", "20240227")).toEqual({ active: 1, inactive: 0, unknown: 1 });
  });

  it("does not assume empty exception tables when storage or the decoded shape is incomplete", () => {
    for (const bad of [null, 1, { calendar: [rule()] }, calendar({ calendarDates: null }), calendar({ calendarDates: [{}] })]) {
      const { index, issues } = inspect(bad);
      expect(issues.length).toBeGreaterThan(0);
      expect(index.serviceDays("weekday", "20240215", "20240215").unknown).toBe(1);
    }
    const { index } = inspect(calendar({ calendar: null, calendarDates: [exception("special", "20240215", "2")] }));
    expect(index.serviceDays("special", "20240214", "20240216")).toEqual({ active: 0, inactive: 1, unknown: 2 });
  });

  it("checks civil dates without local DST arithmetic or century rollover", () => {
    const coverage = { ...scope, feedStart: "00010101", feedEnd: "99991231" };
    const { index } = inspect(calendar({ calendar: [{
      ...rule("daily", coverage.feedStart, coverage.feedEnd), weekdays: Array(7).fill("1"),
    }] }), coverage);
    expect(index.serviceDays("daily", "00010101", "00010101").active).toBe(1);
    expect(index.serviceDays("daily", "19000228", "19000301").active).toBe(2);
    expect(index.serviceDays("daily", "20000228", "20000301").active).toBe(3);
    expect(index.serviceDays("daily", "20240309", "20240311").active).toBe(3);
    expect(index.serviceDays("daily", "00010101", "99991231").active).toBe(3652059);
    for (const bad of ["00000101", "2024-02-29", "20240200", "19000229", "20241301"]) {
      expect(() => index.serviceDays("daily", bad, coverage.feedEnd)).toThrow(RangeError);
    }
    expect(() => index.serviceDays("daily", "20240402", "20240401")).toThrow(RangeError);
  });

  it("agrees with an independent day-by-day oracle for overlapping windows across leap day", () => {
    const weekly = ["0", "1", "0", "0", "1", "0", "1"];
    const changes = new Map([["20240221", "1"], ["20240222", "2"], ["20240302", "2"], ["20240308", "1"]]);
    const { index } = inspect(calendar({
      calendar: [{ ...rule("s", "20240215", "20240310"), weekdays: weekly }],
      calendarDates: [...changes].map(([day, value]) => exception("s", day, value)),
    }));
    const epoch = Date.UTC(2024, 1, 12);
    const samples = Array.from({ length: 34 }, (_, offset) => {
      const date = new Date(epoch + offset * 86400000);
      const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
      const normal = ymd >= "20240215" && ymd <= "20240310" && weekly[date.getUTCDay()] === "1";
      const on = changes.has(ymd) ? changes.get(ymd) === "1" : normal;
      return { ymd, on };
    });
    for (let a = 0; a < samples.length; a++) {
      for (let b = a; b < samples.length; b++) {
        const active = samples.slice(a, b + 1).filter(sample => sample.on).length;
        const expected: ServiceDays = { active, inactive: b - a + 1 - active, unknown: 0 };
        expect(index.serviceDays("s", samples[a]!.ymd, samples[b]!.ymd)).toEqual(expected);
      }
    }
  });
});
