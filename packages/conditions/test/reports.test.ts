import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/route-report.schema.json";
import fixture from "../fixtures/synthetic-route-reports.json";
import {
  DEFAULT_DECAY,
  corroborateReports,
  reportFreshness,
  validateReport,
} from "../src/reports";
import { routingFacts } from "../src/routingFacts";
import { buildReport } from "../src/viewModels";
import type { DecayConfig, RouteReport } from "../src/reportTypes";

// Every record in this file is synthetic test data, not an observation.
const NOW = new Date("2026-11-15T12:00:00.000Z");

function report(overrides: Partial<RouteReport> & { id: string }): RouteReport {
  return {
    kind: "snowbank",
    location: { type: "point", point: { lat: 43.85, lon: -79.45 } },
    observed_at: "2026-11-15T11:00:00.000Z",
    observation: {
      value: "present",
      source_id: "synthetic-test",
      licence: "CC0-1.0",
      retrieved_at: "2026-11-15T11:30:00.000Z",
      tier: 0,
    },
    reporter: { role: "wheelchair_user", ref: `person-${overrides.id}` },
    synthetic: true,
    ...overrides,
  };
}

function cleared(id: string, observedAt: string, ref: string | null): RouteReport {
  const base = report({ id, observed_at: observedAt });
  return {
    ...base,
    observation: { ...base.observation, value: "cleared", retrieved_at: observedAt },
    reporter: { role: "passerby", ref },
  };
}

function loadFixture(): RouteReport[] {
  return (fixture as unknown[]).map((item) => {
    const result = validateReport(item);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.report;
  });
}

describe("route report validation", () => {
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  it("accepts the labelled synthetic fixture in schema and code", () => {
    for (const item of fixture as unknown[]) {
      expect(validate(item), JSON.stringify(validate.errors)).toBe(true);
      expect(validateReport(item).ok).toBe(true);
      expect((item as RouteReport).synthetic).toBe(true);
    }
  });

  it("keeps the observed time exactly as the person gave it", () => {
    const input = report({ id: "t1", observed_at: "2026-11-15T06:00:00-05:00" });
    const result = validateReport(input);
    expect(result.ok && result.report.observed_at).toBe("2026-11-15T06:00:00-05:00");
    expect(result.ok && result.report.observation.retrieved_at).toBe(
      "2026-11-15T11:30:00.000Z",
    );
  });

  it("rejects any tier other than 0 in schema and code", () => {
    const input = report({ id: "t2" }) as unknown as {
      observation: { tier: number };
    };
    input.observation = { ...input.observation, tier: 2 };
    expect(validate(input)).toBe(false);
    const result = validateReport(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual({
      field: "observation.tier",
      code: "tier_must_be_zero",
    });
  });

  it("rejects vocabulary, time and location errors with field codes", () => {
    const result = validateReport({
      id: " ",
      kind: "pothole",
      location: { type: "point", point: { lat: 99, lon: 0 } },
      observed_at: "yesterday",
      observation: {
        value: "passable",
        source_id: "",
        licence: "",
        retrieved_at: "2026-11-15",
        tier: 0,
      },
      reporter: { role: "inspector", ref: "" },
      note: "x".repeat(501),
      photo: { handle: "p", media_type: "image/gif", captured_at: null },
    });
    expect(result.ok).toBe(false);
    const codes = !result.ok
      ? result.errors.map((issue) => `${issue.field}:${issue.code}`)
      : [];
    expect(codes).toEqual([
      "id:missing",
      "kind:unknown_kind",
      "location:invalid_location",
      "observed_at:invalid_time",
      "observation.value:unknown_observation",
      "observation.source_id:missing",
      "observation.licence:missing",
      "observation.retrieved_at:invalid_time",
      "reporter.role:unknown_role",
      "reporter.ref:invalid",
      "photo:invalid_photo",
      "note:note_too_long",
    ]);
  });

  it("rejects a report saved before it was observed", () => {
    const input = report({ id: "t3", observed_at: "2026-11-15T12:30:00.000Z" });
    const result = validateReport(input);
    expect(!result.ok && result.errors).toEqual([
      { field: "observation.retrieved_at", code: "saved_before_observed" },
    ]);
  });

  it("warns when the photo time differs and still keeps the stated time", () => {
    const result = validateReport(
      report({
        id: "t4",
        photo: {
          handle: "local-1",
          media_type: "image/jpeg",
          captured_at: "2026-11-15T07:00:00.000Z",
        },
      }),
    );
    expect(result.ok && result.warnings).toEqual(["photo_time_differs"]);
    expect(result.ok && result.report.observed_at).toBe("2026-11-15T11:00:00.000Z");
  });

  it("drops unknown properties and never copies image bytes", () => {
    const result = validateReport({
      ...report({ id: "t5" }),
      verified: true,
      photo: {
        handle: "local-2",
        media_type: "image/png",
        captured_at: null,
        bytes: "AAAA",
        gps: { lat: 1, lon: 2 },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report).not.toHaveProperty("verified");
    expect(result.report.photo).toEqual({
      handle: "local-2",
      media_type: "image/png",
      captured_at: null,
    });
  });

  it("builds a tier 0 report from form values", () => {
    const built = buildReport(
      {
        kind: "ice",
        observation: "present",
        observed_at: "2026-11-15T10:15:00.000Z",
        role: "passerby",
        note: "  SYNTHETIC  ",
      },
      {
        id: "form-1",
        location: { type: "segment", segment_id: "synthetic-segment-1" },
        source_id: "synthetic-test",
        licence: "CC0-1.0",
        reporter_ref: null,
        now: NOW,
      },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.report.observed_at).toBe("2026-11-15T10:15:00.000Z");
    expect(built.report.observation.retrieved_at).toBe(NOW.toISOString());
    expect(built.report.observation.tier).toBe(0);
    expect(built.report.note).toBe("SYNTHETIC");
    expect(validate(built.report)).toBe(true);
  });

  it("refuses a form time later than the save time", () => {
    const built = buildReport(
      {
        kind: "ice",
        observation: "present",
        observed_at: "2026-11-15T18:00:00.000Z",
        role: "UNKNOWN",
        note: "",
      },
      {
        id: "form-2",
        location: { type: "segment", segment_id: "synthetic-segment-1" },
        source_id: "synthetic-test",
        licence: "CC0-1.0",
        reporter_ref: null,
        now: NOW,
      },
    );
    expect(built.ok).toBe(false);
  });
});

describe("freshness decay", () => {
  it("halves exponential confidence every half-life", () => {
    const item = report({ id: "f1", kind: "ice", observed_at: "2026-11-15T06:00:00.000Z" });
    const fresh = reportFreshness(item, NOW);
    expect(fresh.status).toBe("active");
    expect(fresh.confidence).toBe(0.5);
    expect(fresh.age_hours).toBe(6);
    expect(fresh.expires_at).toBe("2026-11-16T06:00:00.000Z");
  });

  it("falls monotonically with age", () => {
    const ages = [0, 1, 5, 12, 23];
    for (const kind of ["ice", "surface", "snowbank"] as const) {
      const values = ages.map((hours) =>
        reportFreshness(
          report({
            id: "f2",
            kind,
            observed_at: new Date(NOW.getTime() - hours * 3600000).toISOString(),
          }),
          NOW,
        ).confidence,
      );
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThan(values[i - 1] as number);
      }
      expect(values[0]).toBe(1);
    }
  });

  it("supports linear and step curves from configuration", () => {
    const config: DecayConfig = {
      ...DEFAULT_DECAY,
      ice: { curve: "linear", half_life_hours: 1, expiry_hours: 10 },
      snowbank: { curve: "step", half_life_hours: 1, expiry_hours: 10 },
    };
    const observed = "2026-11-15T07:00:00.000Z";
    expect(
      reportFreshness(report({ id: "f3", kind: "ice", observed_at: observed }), NOW, config)
        .confidence,
    ).toBe(0.5);
    expect(
      reportFreshness(report({ id: "f4", observed_at: observed }), NOW, config).confidence,
    ).toBe(1);
  });

  it("marks a report expired at its expiry and gives it zero confidence", () => {
    const item = report({ id: "f5", kind: "ice", observed_at: "2026-11-14T12:00:00.000Z" });
    expect(reportFreshness(item, NOW)).toEqual({
      status: "expired",
      confidence: 0,
      age_hours: 24,
      expires_at: "2026-11-15T12:00:00.000Z",
    });
  });

  it("does not treat a future or unreadable time as current", () => {
    const future = report({ id: "f6", observed_at: "2026-11-15T13:00:00.000Z" });
    expect(reportFreshness(future, NOW).status).toBe("needs_check");
    const broken = report({ id: "f7", observed_at: "not a time" });
    expect(reportFreshness(broken, NOW)).toEqual({
      status: "needs_check",
      confidence: 0,
      age_hours: null,
      expires_at: null,
    });
    const skew = report({ id: "f8", observed_at: "2026-11-15T12:03:00.000Z" });
    expect(reportFreshness(skew, NOW)).toMatchObject({ status: "active", confidence: 1 });
  });

  it("rejects an invalid clock or decay rule", () => {
    const item = report({ id: "f9" });
    expect(() => reportFreshness(item, new Date(NaN))).toThrow(RangeError);
    expect(() =>
      reportFreshness(item, NOW, {
        ...DEFAULT_DECAY,
        snowbank: { curve: "step", half_life_hours: 1, expiry_hours: 0 },
      }),
    ).toThrow(RangeError);
  });
});

describe("corroboration", () => {
  it("leaves a single report at tier 0", () => {
    const [group] = corroborateReports([report({ id: "c1" })], NOW);
    expect(group).toMatchObject({
      state: "active",
      tier: 0,
      independent_reporters: 1,
    });
  });

  it("raises the tier only for independent reporters at the same place", () => {
    const groups = corroborateReports(loadFixture(), NOW);
    expect(groups).toHaveLength(2);
    const snow = groups.find((group) => group.kind === "snowbank");
    expect(snow).toMatchObject({
      state: "active",
      tier: 2,
      independent_reporters: 2,
      has_photo: true,
      latest_observed_at: "2026-11-15T10:00:00.000Z",
    });
    expect(snow?.reports.map((item) => item.part)).toEqual(["supporting", "supporting"]);
  });

  it("does not count repeat reports from one person as corroboration", () => {
    const [group] = corroborateReports(
      [
        report({ id: "c2", reporter: { role: "passerby", ref: "same" } }),
        report({
          id: "c3",
          observed_at: "2026-11-15T11:20:00.000Z",
          reporter: { role: "passerby", ref: "same" },
        }),
      ],
      NOW,
    );
    expect(group).toMatchObject({ tier: 0, independent_reporters: 1 });
  });

  it("counts reports without a reporter reference as one voice at most", () => {
    const anonymous = { role: "UNKNOWN" as const, ref: null };
    const [group] = corroborateReports(
      [
        report({ id: "c4", reporter: anonymous }),
        report({ id: "c5", reporter: anonymous }),
        report({ id: "c6", reporter: anonymous }),
      ],
      NOW,
    );
    expect(group).toMatchObject({ tier: 0, independent_reporters: 1 });
    const [mixed] = corroborateReports(
      [report({ id: "c7", reporter: anonymous }), report({ id: "c8" })],
      NOW,
    );
    expect(mixed).toMatchObject({ tier: 0, independent_reporters: 1 });
  });

  it("does not merge different kinds, distant points, sources or licences", () => {
    const far = report({
      id: "c9",
      location: { type: "point", point: { lat: 43.851, lon: -79.45 } },
    });
    const otherKind = report({ id: "c10", kind: "ice" });
    const base = report({ id: "c11" });
    const otherLicence = {
      ...report({ id: "c12" }),
      observation: { ...base.observation, licence: "ODbL-1.0" },
    };
    const groups = corroborateReports([base, far, otherKind, otherLicence], NOW);
    expect(groups).toHaveLength(4);
    expect(groups.every((group) => group.tier === 0)).toBe(true);
  });

  it("groups by segment id regardless of coordinates", () => {
    const groups = corroborateReports(
      [
        report({ id: "c13", location: { type: "segment", segment_id: "s1" } }),
        report({ id: "c14", location: { type: "segment", segment_id: "s1" } }),
        report({ id: "c15", location: { type: "segment", segment_id: "s2" } }),
      ],
      NOW,
    );
    expect(groups.map((group) => group.tier).sort()).toEqual([0, 2]);
  });

  it("lets a later cleared report supersede earlier reports without calling the way clear", () => {
    const [group] = corroborateReports(
      [
        report({ id: "c16", observed_at: "2026-11-15T08:00:00.000Z" }),
        report({ id: "c17", observed_at: "2026-11-15T09:00:00.000Z" }),
        cleared("c18", "2026-11-15T11:00:00.000Z", "plough-watcher"),
      ],
      NOW,
    );
    expect(group).toMatchObject({
      state: "reported_cleared",
      tier: 0,
      confidence: 0,
      independent_reporters: 0,
    });
    expect(group?.reports.map((item) => item.part)).toEqual([
      "superseded",
      "superseded",
      "clearing",
    ]);
  });

  it("flags a dispute when someone else reports it present soon after a cleared report", () => {
    const [group] = corroborateReports(
      [
        report({ id: "c19", observed_at: "2026-11-15T08:00:00.000Z" }),
        cleared("c20", "2026-11-15T10:00:00.000Z", "person-x"),
        report({ id: "c21", observed_at: "2026-11-15T10:30:00.000Z" }),
        report({ id: "c22", observed_at: "2026-11-15T10:40:00.000Z" }),
      ],
      NOW,
    );
    expect(group?.state).toBe("disputed");
    expect(group?.tier).toBe(0);
    expect(group?.independent_reporters).toBe(2);
    const undisputed = corroborateReports(
      [
        report({ id: "c21", observed_at: "2026-11-15T10:30:00.000Z" }),
        report({ id: "c22", observed_at: "2026-11-15T10:40:00.000Z" }),
      ],
      NOW,
    )[0];
    expect(group?.confidence).toBeCloseTo((undisputed?.confidence ?? 0) * 0.5, 2);
  });

  it("treats a present report long after a cleared one as a new condition", () => {
    const [group] = corroborateReports(
      [
        cleared("c23", "2026-11-15T05:00:00.000Z", "person-x"),
        report({ id: "c24", observed_at: "2026-11-15T10:00:00.000Z" }),
        report({ id: "c25", observed_at: "2026-11-15T11:00:00.000Z" }),
      ],
      NOW,
    );
    expect(group).toMatchObject({ state: "active", tier: 2 });
  });

  it("does not call it a dispute when the same person updates their own report", () => {
    const [group] = corroborateReports(
      [
        cleared("c26", "2026-11-15T10:00:00.000Z", "person-x"),
        report({
          id: "c27",
          observed_at: "2026-11-15T10:30:00.000Z",
          reporter: { role: "passerby", ref: "person-x" },
        }),
      ],
      NOW,
    );
    expect(group?.state).toBe("active");
  });

  it("keeps expired reports listed as expired and never counts them", () => {
    const [group] = corroborateReports(
      [
        report({ id: "c28", kind: "ice", observed_at: "2026-11-13T08:00:00.000Z" }),
        report({ id: "c29", kind: "ice", observed_at: "2026-11-13T09:00:00.000Z" }),
        report({ id: "c30", kind: "ice", observed_at: "2026-11-15T11:00:00.000Z" }),
      ],
      NOW,
    );
    expect(group).toMatchObject({ state: "active", tier: 0, independent_reporters: 1 });
    expect(group?.reports.map((item) => item.part)).toEqual([
      "expired",
      "expired",
      "supporting",
    ]);

    const [old] = corroborateReports(
      [
        report({ id: "c31", kind: "ice", observed_at: "2026-11-13T08:00:00.000Z" }),
        report({ id: "c32", kind: "ice", observed_at: "2026-11-13T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(old).toMatchObject({ state: "expired", tier: 0, confidence: 0 });
    expect(old?.reports).toHaveLength(2);
  });

  it("an expired cleared report no longer hides anything, and is not current", () => {
    const [group] = corroborateReports(
      [cleared("c33", "2026-11-10T10:00:00.000Z", "person-x")],
      NOW,
    );
    expect(group?.state).toBe("expired");
  });

  it("rejects settings that would let one reporter raise the tier", () => {
    expect(() =>
      corroborateReports([], NOW, { corroboration: { min_independent: 1 } }),
    ).toThrow(RangeError);
  });

  it("gives the same result regardless of input order", () => {
    const items = loadFixture();
    const forward = corroborateReports(items, NOW);
    const backward = corroborateReports([...items].reverse(), NOW);
    expect(backward).toEqual(forward);
  });
});

describe("routing facts", () => {
  it("emits an avoid hint only for a corroborated blocking kind", () => {
    const facts = routingFacts(corroborateReports(loadFixture(), NOW));
    const snow = facts.find((fact) => fact.kind === "snowbank");
    expect(snow).toMatchObject({
      hint: "avoid_if_possible",
      claim: "reported_condition",
      passable: "UNKNOWN",
      fact: {
        value: "snowbank",
        source_id: "synthetic-test",
        licence: "CC0-1.0",
        retrieved_at: "2026-11-15T10:01:00.000Z",
        tier: 2,
        derived: true,
      },
    });
    expect(snow?.provenance.report_ids).toEqual([
      "synthetic-report:a1",
      "synthetic-report:b1",
    ]);
    expect(snow?.provenance.independent_reporters).toBe(2);
    expect(snow?.penalty).toBeGreaterThan(0);
    expect(snow?.penalty).toBeLessThanOrEqual(0.8);
  });

  it("gives a single report a penalty, never an avoid hint", () => {
    const [fact] = routingFacts(
      corroborateReports([report({ id: "r1", kind: "curb_cut_blocked" })], NOW),
    );
    expect(fact).toMatchObject({ hint: "penalty", passable: "UNKNOWN" });
    expect(fact?.fact.tier).toBe(0);
    expect(fact?.penalty).toBeCloseTo(0.9 * 0.958, 2);
  });

  it("never gives an avoid hint to a kind outside the avoid list", () => {
    const [fact] = routingFacts(
      corroborateReports(
        [report({ id: "r2", kind: "gradient" }), report({ id: "r3", kind: "gradient" })],
        NOW,
      ),
    );
    expect(fact?.fact.tier).toBe(2);
    expect(fact?.hint).toBe("penalty");
  });

  it("keeps expired and cleared groups as facts with no penalty and no passable claim", () => {
    const facts = routingFacts(
      corroborateReports(
        [
          report({ id: "r4", kind: "ice", observed_at: "2026-11-13T08:00:00.000Z" }),
          report({ id: "r5", observed_at: "2026-11-15T08:00:00.000Z" }),
          cleared("r6", "2026-11-15T11:00:00.000Z", "person-x"),
        ],
        NOW,
      ),
    );
    expect(facts).toHaveLength(2);
    const expired = facts.find((fact) => fact.kind === "ice");
    expect(expired).toMatchObject({
      state: "expired",
      claim: "no_current_report",
      hint: "none",
      penalty: 0,
      passable: "UNKNOWN",
    });
    expect(expired?.provenance.report_ids).toEqual(["r4"]);
    expect(expired?.provenance.counted_report_ids).toEqual([]);
    const gone = facts.find((fact) => fact.kind === "snowbank");
    expect(gone).toMatchObject({
      state: "reported_cleared",
      claim: "reported_cleared",
      hint: "none",
      penalty: 0,
      passable: "UNKNOWN",
    });
    expect(gone?.provenance.counted_report_ids).toEqual(["r6"]);
  });

  it("never states passable for any state", () => {
    const facts = routingFacts(
      corroborateReports(
        [
          ...loadFixture(),
          report({ id: "r7", kind: "other", observed_at: "2026-12-01T00:00:00.000Z" }),
          cleared("r8", "2026-11-15T11:30:00.000Z", "person-x"),
        ],
        NOW,
      ),
    );
    expect(facts.length).toBeGreaterThan(2);
    expect(new Set(facts.map((fact) => fact.passable))).toEqual(new Set(["UNKNOWN"]));
    expect(facts.find((fact) => fact.kind === "other")?.state).toBe("needs_check");
    expect(JSON.stringify(facts)).not.toMatch(/"verified"|"clear"|"safe"/);
  });

  it("lowers the penalty as reports age", () => {
    const item = report({ id: "r9", observed_at: "2026-11-15T11:00:00.000Z" });
    const early = routingFacts(corroborateReports([item], NOW))[0];
    const late = routingFacts(
      corroborateReports([item], new Date("2026-11-17T11:00:00.000Z")),
    )[0];
    expect(late?.penalty).toBeLessThan(early?.penalty ?? 0);
    const after = routingFacts(
      corroborateReports([item], new Date("2026-11-18T11:00:00.000Z")),
    )[0];
    expect(after).toMatchObject({ state: "expired", penalty: 0, hint: "none" });
  });

  it("rejects out-of-range weights", () => {
    const groups = corroborateReports([report({ id: "r10" })], NOW);
    expect(() =>
      routingFacts(groups, {
        weight: { snowbank: 2, curb_cut_blocked: 0, ice: 0, surface: 0, gradient: 0, obstruction: 0, other: 0 },
        may_avoid: [],
        avoid_threshold: 0.6,
      }),
    ).toThrow(RangeError);
  });
});
