import { describe, expect, it } from "vitest";
import {
  assessCondition, assessObservation, assessRequirement, assessRoute,
  assessRouteWithConditions, combineAssessments, hasProvenance, isIsoDate,
  type Assessment, type Condition, type Evidence, type JourneyRoute,
  type JourneySegment, type Observation, type RoutingProfile,
} from "./index.js";

const evidence: Evidence = {
  source: "synthetic-fixture", licence: "CC0-1.0", observedAt: "2026-11-01",
};
const simple: RoutingProfile = { id: "step-free", requirements: ["step_free"] };
const detailed: RoutingProfile = {
  id: "detailed", requirements: ["step_free", "surface", "width"],
};
const observation = (
  requirement: Observation["requirement"],
  assessment: Assessment,
  provenance: Evidence | null = evidence,
): Observation => ({ requirement, assessment, evidence: provenance });
const segment = (id: string, observations: readonly Observation[]): JourneySegment =>
  ({ id, observations });
const route = (id: string, segments: readonly JourneySegment[]): JourneyRoute =>
  ({ id, segments });
const condition = (
  assessment: Assessment,
  validUntil: string | null = "2026-11-30",
  provenance: Evidence | null = evidence,
): Condition => ({ assessment, validUntil, evidence: provenance });

describe("evidence provenance", () => {
  it("accepts dated open-licence evidence", () => {
    for (const licence of ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0"]) {
      expect(hasProvenance({ ...evidence, licence })).toBe(true);
    }
  });
  it.each([
    null, { ...evidence, source: " " }, { ...evidence, licence: "proprietary" },
    { ...evidence, observedAt: "" }, { ...evidence, observedAt: "2026-02-30" },
  ])("rejects incomplete or unsupported provenance", (value) => {
    expect(hasProvenance(value)).toBe(false);
  });
  it.each(["2026-00-01", "2026-13-01", "2026-11-31", "2025-02-29", "0000-01-01"])(
    "rejects invalid calendar date %s", (value) => expect(isIsoDate(value)).toBe(false),
  );
  it("accepts a valid leap day", () => expect(isIsoDate("2024-02-29")).toBe(true));
  it("does not infer pass or barrier from unsupported evidence", () => {
    expect(assessObservation(undefined)).toBe("UNKNOWN");
    expect(assessObservation(observation("step_free", "PASS", null))).toBe("UNKNOWN");
    expect(assessObservation(observation("step_free", "BLOCKED", null))).toBe("UNKNOWN");
  });
});

describe("journey and profile routing", () => {
  it("does not infer access from empty routes or requirements", () => {
    expect(assessRoute(route("empty", []), simple).assessment).toBe("UNKNOWN");
    expect(assessRoute(route("a", [segment("s", [])]), {
      id: "none", requirements: [],
    }).assessment).toBe("UNKNOWN");
  });
  it("requires every segment and every profile requirement", () => {
    const candidate = route("r", [
      segment("one", [observation("step_free", "PASS")]), segment("two", []),
    ]);
    expect(assessRoute(candidate, simple).assessment).toBe("UNKNOWN");
    expect(assessRoute(candidate, detailed).assessment).toBe("UNKNOWN");
  });
  it("keeps profile decisions independent for the same route", () => {
    const candidate = route("r", [segment("s", [observation("step_free", "PASS")])]);
    expect(assessRoute(candidate, simple)).toEqual({
      routeId: "r", profileId: "step-free", assessment: "PASS",
    });
    expect(assessRoute(candidate, detailed).assessment).toBe("UNKNOWN");
  });
  it("passes only a route with complete supported requirements", () => {
    const observations = [
      observation("step_free", "PASS"), observation("surface", "PASS"),
      observation("width", "PASS"),
    ];
    expect(assessRoute(route("r", [segment("a", observations),
      segment("b", observations)]), detailed).assessment).toBe("PASS");
  });
  it("preserves unknown duplicates and documented barriers", () => {
    expect(assessRequirement(segment("s", [
      observation("step_free", "PASS"), observation("step_free", "UNKNOWN"),
    ]), "step_free")).toBe("UNKNOWN");
    expect(assessRequirement(segment("s", [
      observation("step_free", "PASS"), observation("step_free", "BLOCKED"),
    ]), "step_free")).toBe("BLOCKED");
  });
  it("evaluates alternative routes without transferring positive evidence", () => {
    expect(assessRoute(route("a", [segment("s", [])]), simple).assessment).toBe("UNKNOWN");
    expect(assessRoute(route("b", [segment("s", [
      observation("step_free", "PASS"),
    ])]), simple).assessment).toBe("PASS");
  });
  it.each([
    { inputs: [] as Assessment[], result: "UNKNOWN" },
    { inputs: ["PASS"], result: "PASS" },
    { inputs: ["PASS", "UNKNOWN"], result: "UNKNOWN" },
    { inputs: ["UNKNOWN", "BLOCKED"], result: "BLOCKED" },
    { inputs: ["PASS", "BLOCKED"], result: "BLOCKED" },
  ] satisfies readonly { inputs: readonly Assessment[]; result: Assessment }[])(
    "combines conservatively: $result", ({ inputs, result }) => {
      expect(combineAssessments(inputs)).toBe(result);
    },
  );
});

describe("changing conditions", () => {
  const candidate = route("r", [segment("s", [observation("step_free", "PASS")])]);
  it("includes a condition's last valid date", () => {
    expect(assessCondition(condition("PASS", "2026-11-15"), "2026-11-15")).toBe("PASS");
  });
  it("does not reuse expired positive or negative conditions", () => {
    expect(assessCondition(condition("PASS", "2026-11-14"), "2026-11-15")).toBe("UNKNOWN");
    expect(assessCondition(condition("BLOCKED", "2026-11-14"), "2026-11-15"))
      .toBe("UNKNOWN");
  });
  it("rejects missing, future-dated or inconsistent provenance", () => {
    expect(assessCondition(null, "2026-11-15")).toBe("UNKNOWN");
    expect(assessCondition(condition("PASS", null), "2026-11-15")).toBe("UNKNOWN");
    expect(assessCondition(condition("PASS", "2026-11-30", {
      ...evidence, observedAt: "2026-11-20",
    }), "2026-11-15")).toBe("UNKNOWN");
    expect(assessCondition(condition("PASS", "2026-10-31"), "2026-10-15"))
      .toBe("UNKNOWN");
  });
  it("never upgrades unknown route evidence", () => {
    expect(assessRouteWithConditions(route("unknown", [segment("s", [])]),
      simple, [condition("PASS")], "2026-11-15").assessment).toBe("UNKNOWN");
  });
  it("requires explicit condition checks rather than assuming clear", () => {
    expect(assessRouteWithConditions(candidate, simple, [], "2026-11-15").assessment)
      .toBe("UNKNOWN");
    expect(assessRouteWithConditions(candidate, simple,
      [condition("PASS"), null], "2026-11-15").assessment).toBe("UNKNOWN");
  });
  it("applies a documented barrier and permits fully supported cases", () => {
    expect(assessRouteWithConditions(candidate, simple,
      [condition("BLOCKED")], "2026-11-15").assessment).toBe("BLOCKED");
    expect(assessRouteWithConditions(candidate, simple,
      [condition("PASS")], "2026-11-15").assessment).toBe("PASS");
  });
});
