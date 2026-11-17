import { describe, expect, it } from "vitest";
import { licenceAsOf } from "./check-repo-data.js";
import { reportStaleAndMissingLicences } from "./stale-licence-report.js";

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe("checkStrictData as-of date", () => {
  it("is the current UTC date at run time, not a fixed day", () => {
    expect(licenceAsOf(new Date("2026-11-17T05:00:00Z"), {})).toBe("2026-11-17");
    expect(licenceAsOf(new Date("2027-03-02T23:59:59Z"), {})).toBe("2027-03-02");
    expect(licenceAsOf(undefined, {})).toBe(new Date().toISOString().slice(0, 10));
  });

  it("can be set to a given day, such as the commit date, and rejects a malformed one", () => {
    expect(licenceAsOf(new Date("2026-11-17T05:00:00Z"), { ACCESS_LICENCE_AS_OF: "2026-11-20" })).toBe("2026-11-20");
    expect(() => licenceAsOf(new Date(), { ACCESS_LICENCE_AS_OF: "17/11/2026" })).toThrow(/YYYY-MM-DD/);
  });

  it("passes a source retrieved today and blocks one retrieved tomorrow", () => {
    const today = licenceAsOf(new Date(), {});
    const tomorrow = nextDay(today);
    const report = reportStaleAndMissingLicences(
      [
        { source: "fixture-today", licence: "OGL-ON-1.0", observedOn: today },
        { source: "fixture-tomorrow", licence: "OGL-ON-1.0", observedOn: tomorrow },
      ],
      { asOf: today, maxAgeDays: 365 },
    );
    expect(report.blocking.map((issue) => `${issue.source}:${issue.code}`)).toEqual(["fixture-tomorrow:DATE_FUTURE"]);
  });
});
