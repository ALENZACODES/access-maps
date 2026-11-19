import { describe, expect, it } from "vitest";
import {
  buildRouteEvidence, compareEvidenceOptions, EMPTY_FILTERS, EVIDENCE_COPY, evidenceExport,
  filterEvidence, routeStatus, sortedOptions, type EvidenceFilters, type EvidenceIssue,
  type EvidenceOption, type EvidenceSegment,
} from "../src/routeEvidence.js";
import { barredLeg, journey, leg, manyPlans, plan, provenance, uncertainLeg, varyingPlan, withStatus } from "./routeEvidenceFixtures.js";

const base = () => buildRouteEvidence(plan());
const single = (out = leg("ab"), back = leg("ba")) => buildRouteEvidence(plan([journey("one", [out], [back])])).options[0]!;
const issueCodes = (option: EvidenceOption) => option.issues.map((issue) => issue.code);
const segments = (option: EvidenceOption) => option.segments;
const amended = (changes: Partial<EvidenceFilters>) => ({ ...EMPTY_FILTERS, ...changes });

function expectIssue(option: EvidenceOption, code: string, severity: string): void {
  const match = option.issues.find((issue) => issue.code === code);
  expect(match, `expected issue ${code}`).toBeDefined();
  expect(match?.severity).toBe(severity);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("P15AB route evidence intake", () => {
  it("builds a local review of an ordinary synthetic route", () => {
    const dashboard = base();
    expect(dashboard.planId).toBe("synthetic-plan");
    expect(dashboard.options).toHaveLength(1);
    expect(dashboard.options[0]?.segments).toHaveLength(2);
  });

  it("keeps the outbound and return legs separate", () => {
    const result = single();
    expect(result.outbound.map((item) => item.legId)).toEqual(["ab"]);
    expect(result.returnSegments.map((item) => item.legId)).toEqual(["ba"]);
    expect(result.segments.map((item) => item.direction)).toEqual(["outbound", "return"]);
  });

  it("does not mutate the routing plan", () => {
    const input = varyingPlan();
    const snapshot = clone(input);
    buildRouteEvidence(input);
    expect(input).toEqual(snapshot);
  });

  it("returns an empty result for a plan without options", () => {
    const dashboard = buildRouteEvidence(plan([]));
    expect(dashboard.options).toEqual([]);
    expect(dashboard.summary.options).toBe(0);
    expect(dashboard.summary.sources).toBe(0);
  });

  it("includes options reported as blocked by the planner", () => {
    const blocked = journey("blocked", [barredLeg("stairs")]);
    const dashboard = buildRouteEvidence(plan([], [blocked]));
    expect(dashboard.options).toHaveLength(1);
    expect(dashboard.options[0]?.blockedByPlanner).toBe(true);
    expect(dashboard.options[0]?.status).toBe("blocked");
  });

  it("preserves the original option order", () => {
    const dashboard = buildRouteEvidence(manyPlans(12));
    expect(dashboard.options.map((value) => value.id)).toEqual(Array.from({ length: 12 }, (_, index) => `option-${index}`));
  });

  it("can handle a route with no segments", () => {
    const dashboard = buildRouteEvidence(plan([journey("blank", [], [])]));
    expect(dashboard.options[0]?.status).toBe("UNKNOWN");
    expect(dashboard.options[0]?.distanceMetres).toBe(0);
    expect(dashboard.options[0]?.sources).toEqual([]);
  });

  it("counts the number of distinct source identifiers", () => {
    const dashboard = buildRouteEvidence(plan([
      journey("a", [leg("a1"), leg("a2")]),
      journey("b", [leg("b1", { provenance: provenance({ sourceId: "second" }) })]),
    ]));
    expect(dashboard.summary.sources).toBe(2);
  });

  it("records the date of the input snapshot instead of a system clock", () => {
    const dashboard = buildRouteEvidence(plan([], [], { now: "2026-05-17T13:05:00Z" }));
    expect(dashboard.generatedFrom).toBe("2026-05-17");
  });

  it("uses UNKNOWN for a date that cannot be parsed", () => {
    expect(buildRouteEvidence(plan([], [], { now: "not supplied" })).generatedFrom).toBe("UNKNOWN");
  });

  it("does not infer a survey tier from an unknown provenance tier", () => {
    const option = single(leg("unknown-tier", { provenance: provenance({ tier: null }) }));
    expect(option.segments[0]?.tier).toBeNull();
    expectIssue(option, "TIER_UNKNOWN", "caution");
  });

  it("counts known and unresolved options separately", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    expect(dashboard.summary.options).toBe(4);
    expect(dashboard.summary.conditional).toBeGreaterThan(0);
    expect(dashboard.summary.blocked).toBeGreaterThan(0);
  });

  it("freezes the top-level dashboard", () => {
    const dashboard = base();
    expect(Object.isFrozen(dashboard)).toBe(true);
    expect(Object.isFrozen(dashboard.options)).toBe(true);
    expect(Object.isFrozen(dashboard.summary)).toBe(true);
  });

  it("freezes generated segments and issues", () => {
    const option = single(uncertainLeg("unknown"));
    expect(Object.isFrozen(option)).toBe(true);
    expect(Object.isFrozen(option.segments)).toBe(true);
    expect(Object.isFrozen(option.segments[0])).toBe(true);
    expect(Object.isFrozen(option.issues)).toBe(true);
    expect(Object.isFrozen(option.issues[0])).toBe(true);
  });

  it("does not serialize the user's equipment profile into the report", () => {
    const data = evidenceExport(base());
    expect(data).not.toContain("registrations");
    expect(data).not.toContain("chair");
    expect(data).not.toContain("transferSide");
  });
});

describe("P15AB three-valued route statements", () => {
  const entries = [
    { name: "supported", status: "step-free", code: "YES" },
    { name: "barrier", status: "not-step-free", code: "NO" },
    { name: "unresolved", status: "unknown", code: "UNKNOWN" },
  ] as const;

  for (const entry of entries) {
    it(`maps ${entry.name} onto ${entry.code} without adding an accessibility claim`, () => {
      const option = single(withStatus("test", entry.status));
      expect(option.segments[0]?.status).toBe(entry.code);
    });
  }

  it("turns a reported barrier into a blocking finding", () => {
    const option = single(barredLeg("barrier"));
    expectIssue(option, "BARRIER_REPORTED", "blocking");
    expect(option.status).toBe("blocked");
  });

  it("turns an unknown leg into a conditional route", () => {
    const option = single(uncertainLeg("unknown"));
    expect(option.status).toBe("conditional");
    expectIssue(option, "ACCESS_UNKNOWN", "caution");
  });

  it("does not turn an unknown return into a supported round trip", () => {
    const option = single(leg("out"), uncertainLeg("back"));
    expect(option.roundTripStatus).toBe("conditional");
    expect(option.status).toBe("conditional");
  });

  it("keeps an outbound barrier blocking despite a supported return", () => {
    const option = single(barredLeg("out"), leg("back"));
    expect(option.status).toBe("blocked");
    expect(option.roundTripStatus).toBe("blocked");
  });

  it("keeps a return barrier from presenting the round trip as supported", () => {
    const option = single(leg("out"), barredLeg("back"));
    expect(option.roundTripStatus).toBe("blocked");
    expect(option.status).toBe("conditional");
  });

  it("keeps a planner-blocked option blocked regardless of its legs", () => {
    const dashboard = buildRouteEvidence(plan([], [journey("planner-blocked")]));
    expect(dashboard.options[0]?.status).toBe("blocked");
  });

  it("does not infer missing segments are accessible", () => {
    expect(routeStatus([])).toBe("UNKNOWN");
  });

  it("downgrades a stated step-free segment without cited observations to UNKNOWN", () => {
    const item = leg("missing-evidence", {
      stepFree: { status: "step-free", appVerified: false, tier: 2, reasons: [], evidence: [] },
    });
    const option = single(item);
    expect(option.segments[0]?.status).toBe("UNKNOWN");
    expectIssue(option, "EVIDENCE_MISSING", "caution");
  });

  it("gives NO priority over UNKNOWN within an option", () => {
    const option = single(barredLeg("no"), uncertainLeg("unknown"));
    expect(option.roundTripStatus).toBe("blocked");
  });

  it("never represents an unknown source as a supported fact", () => {
    const option = single(leg("source", { provenance: provenance({ sourceId: "UNKNOWN" }) }));
    expectIssue(option, "SOURCE_UNKNOWN", "caution");
    expect(option.status).toBe("conditional");
  });

  it("records a missing licence without inventing an open licence", () => {
    const option = single(leg("licence", { provenance: provenance({ licence: "UNKNOWN" }) }));
    expectIssue(option, "LICENCE_UNKNOWN", "caution");
    expect(option.sources.some((source) => source.licence === "UNKNOWN")).toBe(true);
  });

  it("keeps missing surface evidence separate from a stated step-free status", () => {
    const option = single(leg("surface", { surface: "UNKNOWN" }));
    expect(option.segments[0]?.status).toBe("YES");
    expectIssue(option, "SURFACE_UNKNOWN", "caution");
    expect(option.status).toBe("conditional");
  });

  it("keeps unknown gradients separate from stated access", () => {
    const option = single(leg("gradient", { gradient: "UNKNOWN" }));
    expectIssue(option, "GRADIENT_UNKNOWN", "caution");
    expect(option.status).toBe("conditional");
  });

  it("does not assume an unmeasured distance is zero", () => {
    const option = single(leg("distance", { distanceMetres: null, distanceKind: "unknown" }));
    expect(option.segments[0]?.distanceMetres).toBeNull();
    expect(option.distanceMetres).toBeNull();
    expectIssue(option, "DISTANCE_UNCERTAIN", "information");
  });

  it("does not treat a straight-line distance as a routed measurement", () => {
    const option = single(leg("straight", { distanceMetres: 100, distanceKind: "straight-line" }));
    expect(option.segments[0]?.distanceMetres).toBeNull();
    expectIssue(option, "DISTANCE_UNCERTAIN", "information");
  });

  it("does not treat a negative distance as a routed measurement", () => {
    const option = single(leg("negative", { distanceMetres: -1 }));
    expect(option.segments[0]?.distanceMetres).toBeNull();
  });

  it("does not treat an infinite distance as measured", () => {
    const option = single(leg("infinite", { distanceMetres: Infinity }));
    expect(option.segments[0]?.distanceMetres).toBeNull();
  });

  it("records a segment flagged as a single point of failure", () => {
    const option = single(leg("failure", { singlePointOfFailure: true }));
    expectIssue(option, "SINGLE_FAILURE", "caution");
  });

  it("does not create a missing-schedule warning for a walking leg", () => {
    const option = single(leg("walk", { mode: "roll", timing: null }));
    expect(issueCodes(option)).not.toContain("SCHEDULE_UNKNOWN");
  });

  it("does create a missing-schedule warning for a transit leg", () => {
    const option = single(leg("transit", { mode: "transit", timing: null }));
    expectIssue(option, "SCHEDULE_UNKNOWN", "caution");
  });

  it("does create a missing-schedule warning for an intercity leg", () => {
    const option = single(leg("intercity", { mode: "intercity", timing: null }));
    expectIssue(option, "SCHEDULE_UNKNOWN", "caution");
  });

  it("counts warnings requiring action before travel as blocking", () => {
    const option = single(leg("warnings", {
      warnings: [{ code: "test", beforeCommit: true, text: "Fictional notice", phones: [] }],
    }));
    expectIssue(option, "WARNING_0", "blocking");
  });

  it("counts informational route warnings without forcing a barrier", () => {
    const option = single(leg("warnings", {
      warnings: [{ code: "notice", beforeCommit: false, text: "Fictional notice", phones: [] }],
    }));
    expectIssue(option, "WARNING_0", "caution");
    expect(option.status).toBe("conditional");
  });

  it("does not omit a second route warning", () => {
    const option = single(leg("warnings", {
      warnings: [
        { code: "first", beforeCommit: false, text: "First", phones: [] },
        { code: "second", beforeCommit: true, text: "Second", phones: [] },
      ],
    }));
    expect(issueCodes(option)).toContain("WARNING_0");
    expect(issueCodes(option)).toContain("WARNING_1");
  });
});

describe("P15AB source and date handling", () => {
  const invalidDates = ["UNKNOWN", "", "2026-13-01", "2026-02-30", "2026-00-10", "2026-11-40", "not a date", "2026/11/19"];
  for (const date of invalidDates) {
    it(`keeps the source date UNKNOWN for ${JSON.stringify(date)}`, () => {
      const option = single(leg("date", { provenance: provenance({ retrievedAt: date }) }));
      expect(option.segments[0]?.observedOn).toBe("UNKNOWN");
      expectIssue(option, "DATE_UNKNOWN", "caution");
    });
  }

  it("accepts a valid leap-day date", () => {
    const option = single(leg("leap", { provenance: provenance({ retrievedAt: "2024-02-29" }) }));
    expect(option.segments[0]?.observedOn).toBe("2024-02-29");
  });

  it("uses retrievedOn before retrievedAt when present", () => {
    const option = single(leg("retrieved", { provenance: provenance({ retrievedAt: "2026-11-01", retrievedOn: "2026-11-18" }) }));
    expect(option.segments[0]?.observedOn).toBe("2026-11-18");
  });

  it("includes an attribution line only when supplied", () => {
    const option = single(leg("attribution", { provenance: provenance({ attribution: "© OpenStreetMap contributors" }) }));
    expect(option.segments[0]?.attribution).toBe("© OpenStreetMap contributors");
  });

  it("does not invent an attribution line", () => {
    const option = single(leg("none"));
    expect(option.segments[0]?.attribution).toBeNull();
  });

  it("keeps licence groups separate in the source list", () => {
    const option = buildRouteEvidence(plan([journey("mixed", [
      leg("one", { provenance: provenance({ licence: "OGL-ON-1.0" }) }),
      leg("two", { provenance: provenance({ licence: "ODbL-1.0" }) }),
    ])])).options[0]!;
    expect(option.sources.map((source) => source.licence).sort()).toEqual(["ODbL-1.0", "OGL-ON-1.0"]);
  });

  it("preserves a stated source tier zero", () => {
    const option = single(leg("tier-zero", { provenance: provenance({ tier: 0 }) }));
    expect(option.segments[0]?.tier).toBe(0);
  });

  it("does not replace a missing tier with zero", () => {
    const option = single(leg("tier-null", { provenance: provenance({ tier: null }) }));
    expect(option.segments[0]?.tier).toBeNull();
  });

  it("keeps different source dates as separate source citations", () => {
    const option = buildRouteEvidence(plan([journey("two-dates", [
      leg("one", { provenance: provenance({ retrievedAt: "2026-11-01" }) }),
      leg("two", { provenance: provenance({ retrievedAt: "2026-11-18" }) }),
    ])])).options[0]!;
    expect(option.sources).toHaveLength(2);
  });

  it("normalizes blank source identifiers to UNKNOWN", () => {
    const option = single(leg("source", { provenance: provenance({ sourceId: " " }) }));
    expect(option.segments[0]?.sourceId).toBe("UNKNOWN");
    expectIssue(option, "SOURCE_UNKNOWN", "caution");
  });

  it("keeps unsupported licence identifiers UNKNOWN", () => {
    const option = single(leg("unsupported", { provenance: provenance({ licence: "unsupported" }) }));
    expect(option.segments[0]?.licence).toBe("UNKNOWN");
    expectIssue(option, "LICENCE_UNKNOWN", "caution");
  });

  it("does not emit personal contact information supplied in a source identifier", () => {
    const option = single(leg("contact", { provenance: provenance({ sourceId: "contact@example.invalid" }) }));
    expect(option.segments[0]?.sourceId).toBe("UNKNOWN");
    expect(evidenceExport(buildRouteEvidence(plan([journey("contact", [leg("contact", {
      provenance: provenance({ sourceId: "contact@example.invalid" }),
    })])])))).not.toContain("contact@example.invalid");
  });

  it("does not emit unsafe source identifiers into the report", () => {
    const option = single(leg("unsafe", { provenance: provenance({ sourceId: "<script>" }) }));
    expect(option.segments[0]?.sourceId).toBe("UNKNOWN");
  });

  it("keeps ODbL licences in their original source record", () => {
    const option = single(leg("odbl", { provenance: provenance({ licence: "ODbL-1.0" }) }));
    expect(option.segments[0]?.licence).toBe("ODbL-1.0");
  });

  it("does not mislabel a supplied source identifier as UNKNOWN", () => {
    const option = single(leg("source", { provenance: provenance({ sourceId: "municipal-fixture" }) }));
    expect(option.segments[0]?.sourceId).toBe("municipal-fixture");
    expect(issueCodes(option)).not.toContain("SOURCE_UNKNOWN");
  });

  it("uses stable ordering of source citations", () => {
    const option = buildRouteEvidence(plan([journey("ordering", [
      leg("z", { provenance: provenance({ sourceId: "zeta" }) }),
      leg("a", { provenance: provenance({ sourceId: "alpha" }) }),
    ])])).options[0]!;
    expect(option.sources.map((source) => source.id)).toEqual(["alpha", "municipal-fixture", "zeta"]);
  });
});

describe("P15AB filters and comparisons", () => {
  const sample = single(uncertainLeg("unknown"), barredLeg("barrier"));

  it("returns all issues with the default filters", () => {
    expect(filterEvidence(sample, EMPTY_FILTERS)).toHaveLength(sample.issues.length);
  });

  it("filters by outbound direction", () => {
    expect(filterEvidence(sample, amended({ direction: "outbound" })).every((item) => item.direction === "outbound")).toBe(true);
  });

  it("filters by return direction", () => {
    expect(filterEvidence(sample, amended({ direction: "return" })).every((item) => item.direction === "return")).toBe(true);
  });

  for (const severity of ["blocking", "caution", "information"] as const) {
    it(`filters evidence at ${severity} severity`, () => {
      expect(filterEvidence(sample, amended({ severity })).every((item) => item.severity === severity)).toBe(true);
    });
  }

  for (const category of ["access", "time", "source", "surface", "distance", "continuity", "return"] as const) {
    it(`filters evidence for the ${category} category`, () => {
      expect(filterEvidence(sample, amended({ category })).every((item) => item.category === category)).toBe(true);
    });
  }

  it("searches issue codes case insensitively", () => {
    expect(filterEvidence(sample, amended({ query: "ACCESS_UNKNOWN" })).some((item) => item.code === "ACCESS_UNKNOWN")).toBe(true);
    expect(filterEvidence(sample, amended({ query: "access_unknown" })).some((item) => item.code === "ACCESS_UNKNOWN")).toBe(true);
  });

  it("searches the English issue text", () => {
    expect(filterEvidence(sample, amended({ query: "access status" })).length).toBeGreaterThan(0);
  });

  it("searches the French issue text", () => {
    expect(filterEvidence(sample, amended({ query: "l’état de l’accès" })).length).toBeGreaterThan(0);
  });

  it("searches the source identifier", () => {
    expect(filterEvidence(sample, amended({ query: "municipal-fixture" })).length).toBeGreaterThan(0);
  });

  it("returns no issues when search does not match", () => {
    expect(filterEvidence(sample, amended({ query: "unrelated phrase" }))).toEqual([]);
  });

  it("does not mutate the original issue list", () => {
    const previous = [...sample.issues];
    filterEvidence(sample, amended({ severity: "blocking" }));
    expect(sample.issues).toEqual(previous);
  });

  it("sorts by the fewest unresolved segments", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    const sorted = sortedOptions(dashboard.options, "uncertainty");
    expect(sorted[0]?.totals.unknown).toBeLessThanOrEqual(sorted.at(-1)?.totals.unknown ?? 0);
  });

  it("sorts options with a missing total distance after measured options", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    const sorted = sortedOptions(dashboard.options, "distance");
    expect(sorted.at(-1)?.distanceMetres).toBeNull();
  });

  it("preserves the order for the original sort", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    expect(sortedOptions(dashboard.options, "original").map((item) => item.id)).toEqual(dashboard.options.map((item) => item.id));
  });

  it("returns a new frozen array when sorting", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    const sorted = sortedOptions(dashboard.options, "original");
    expect(sorted).not.toBe(dashboard.options);
    expect(Object.isFrozen(sorted)).toBe(true);
  });

  it("compares two distinct options by their recorded values", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    const changes = compareEvidenceOptions(dashboard.options[0]!, dashboard.options[1]!);
    expect(changes.some((item) => item.code === "unknown")).toBe(true);
    expect(changes.every((item) => item.label.en && item.label.fr)).toBe(true);
  });

  it("reports no differences between the same option", () => {
    const option = base().options[0]!;
    expect(compareEvidenceOptions(option, option)).toEqual([]);
  });

  it("does not mutate either compared option", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    const before = clone(dashboard.options);
    compareEvidenceOptions(dashboard.options[0]!, dashboard.options[1]!);
    expect(dashboard.options).toEqual(before);
  });
});

describe("P15AB report serialization", () => {
  it("produces a parseable JSON document", () => {
    expect(JSON.parse(evidenceExport(base()))).toBeTruthy();
  });

  it("ends reports with exactly one newline", () => {
    const text = evidenceExport(base());
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("is deterministic across repeated calls", () => {
    const dashboard = buildRouteEvidence(varyingPlan());
    expect(evidenceExport(dashboard)).toBe(evidenceExport(dashboard));
  });

  it("retains the schema version and snapshot date", () => {
    const report = JSON.parse(evidenceExport(base())) as { schemaVersion: number; asOf: string };
    expect(report.schemaVersion).toBe(1);
    expect(report.asOf).toBe("2026-11-19");
  });

  it("does not include the full input plan", () => {
    const output = evidenceExport(base());
    expect(output).not.toContain("winterMode");
    expect(output).not.toContain("emergency");
    expect(output).not.toContain("profile");
  });

  it("includes the licence and date with each exported segment", () => {
    const output = evidenceExport(base());
    expect(output).toContain("OGL-ON-1.0");
    expect(output).toContain("2026-11-18");
  });

  it("preserves explicit UNKNOWN in the export", () => {
    const output = evidenceExport(buildRouteEvidence(plan([journey("unknown", [uncertainLeg("missing")])])));
    expect(output).toContain('"status": "UNKNOWN"');
  });

  it("does not invent an asset digest or retrieval timestamp", () => {
    const output = evidenceExport(base());
    expect(output).not.toContain("sha256");
    expect(output).not.toContain("downloadedAt");
  });

  it("serializes the same record regardless of dashboard locale", () => {
    const english = evidenceExport(buildRouteEvidence(plan()));
    const french = evidenceExport(buildRouteEvidence(plan([], [], { locale: "fr" })));
    expect(JSON.parse(english)).toBeTruthy();
    expect(JSON.parse(french)).toBeTruthy();
  });
});

describe("P15AB French copy constraints", () => {
  it("has the same copy keys in both locales", () => {
    expect(Object.keys(EVIDENCE_COPY.en).sort()).toEqual(Object.keys(EVIDENCE_COPY.fr).sort());
  });

  it("keeps the UNKNOWN token uppercase in the French summary", () => {
    expect(EVIDENCE_COPY.fr.introduction).toContain("UNKNOWN");
    expect(EVIDENCE_COPY.fr.unknown).toBe("UNKNOWN");
  });

  it("does not use straight apostrophes between French letters", () => {
    const combined = Object.values(EVIDENCE_COPY.fr).join(" ");
    expect(combined).not.toMatch(/[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu);
  });

  it("uses a narrow no-break space before French semicolons", () => {
    expect(EVIDENCE_COPY.fr.conditional).toContain("\u202f;");
  });

  it("keeps French sentence punctuation consistent", () => {
    const combined = Object.values(EVIDENCE_COPY.fr).join(" ");
    expect(combined).not.toMatch(/(?<!\u202f)[;!?]/u);
  });

  it("keeps French colons spaced when used within copy", () => {
    const combined = Object.values(EVIDENCE_COPY.fr).join(" ");
    expect(combined).not.toMatch(/(?<!\u00a0):/u);
  });

  it("does not claim access for unresolved data", () => {
    expect(EVIDENCE_COPY.fr.introduction).toContain("UNKNOWN ne signifie pas accessible");
  });

  it("leaves all user-facing fields translated", () => {
    const english = EVIDENCE_COPY.en;
    const french = EVIDENCE_COPY.fr;
    for (const key of Object.keys(english) as Array<keyof typeof english>) {
      expect(french[key].length).toBeGreaterThan(0);
    }
  });
});
