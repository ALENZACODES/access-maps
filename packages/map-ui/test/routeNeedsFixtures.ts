import type { Journey, JourneyPlan, Leg, Provenance, StepFreeStatus } from "@access-maps/journey";

/** Synthetic local fixtures; no assertion about any actual Ontario site. */
export function provenance(changes: Partial<Provenance> = {}): Provenance {
  return {
    sourceId: "municipal-fixture",
    licence: "OGL-ON-1.0",
    retrievedAt: "2026-11-18",
    tier: 2,
    note: "Fictional map record",
    ...changes,
  };
}

export function leg(id: string, changes: Partial<Leg> = {}): Leg {
  return {
    id, chainLeg: "approach", mode: "roll", title: `Fictional segment ${id}`,
    fromName: "Synthetic origin", toName: "Synthetic destination",
    from: { lat: 43.7, lon: -79.4 }, to: { lat: 43.71, lon: -79.41 },
    stepFree: { status: "step-free", appVerified: false, tier: 2, reasons: [], evidence: ["fixture"] },
    distanceMetres: 120, distanceKind: "route", surface: "paved", gradient: "2%",
    timing: null, provenance: provenance(), geometryAttribution: null,
    note: "Fictional record", warnings: [], singlePointOfFailure: false, links: [], agencyId: null,
    transitMode: null,
    ...changes,
  };
}

export function uncertainLeg(id: string, changes: Partial<Leg> = {}): Leg {
  return leg(id, {
    stepFree: { status: "unknown", appVerified: false, tier: null, reasons: ["missing"], evidence: [] },
    provenance: provenance({ tier: null, retrievedAt: "UNKNOWN" }),
    surface: "UNKNOWN", gradient: "UNKNOWN", distanceMetres: null, distanceKind: "unknown",
    ...changes,
  });
}

export function barredLeg(id: string, changes: Partial<Leg> = {}): Leg {
  return leg(id, {
    stepFree: { status: "not-step-free", appVerified: false, tier: 1, reasons: ["barrier"], evidence: ["reported"] },
    ...changes,
  });
}

export function journey(id = "option-a", out: Leg[] = [leg("ab")], back: Leg[] = [leg("ba")], changes: Partial<Journey> = {}): Journey {
  const emptyDepth = {
    entrance: { text: "UNKNOWN", stepCount: "UNKNOWN", ramp: "UNKNOWN", doorWidth: "UNKNOWN", provenance: provenance() },
    washroom: { text: "UNKNOWN", usable: false, transferSide: "UNKNOWN", adultChangeTable: "UNKNOWN", access: "UNKNOWN", provenance: null },
    parking: { text: "UNKNOWN", provenance: null },
  };
  return {
    id, summary: `Fictional route ${id}`, legs: out,
    explanation: "Synthetic route generated for unit tests",
    weakestLink: { legId: out[0]?.id ?? "UNKNOWN", text: "UNKNOWN" },
    chain: { slots: [], describedCount: 0, weakest: { id: "approach", text: "UNKNOWN" },
      fare: { state: "unknown", text: "UNKNOWN" }, timing: { state: "unknown", text: "UNKNOWN" } },
    presentedAsStepFree: false, roundTripStepFree: false, depth: emptyDepth,
    returnJourney: { legs: back, explanation: "Synthetic return", depth: emptyDepth, presentedAsStepFree: false },
    warnings: [], fareSummary: [], preference: "shortest-distance", ...changes,
  };
}

export function plan(journeys: Journey[] = [journey()], blocked: Journey[] = [], changes: Partial<JourneyPlan> = {}): JourneyPlan {
  return {
    id: "synthetic-plan", locale: "en", departAt: "2026-11-19T10:00:00-05:00",
    now: "2026-11-19T09:00:00-05:00", preference: "shortest-distance",
    stepFreeRequired: true, winterMode: false,
    journeys, blocked, warnings: [], systemEvent: null, noGo: null, supplyNotes: [],
    offline: { asOf: "2026-11-19", banner: "Synthetic records" },
    emergency: { phone: "911", text: "Emergency" }, ...changes,
  };
}

export function withStatus(id: string, status: StepFreeStatus): Leg {
  return leg(id, {
    stepFree: { status, appVerified: false, tier: status === "unknown" ? null : 2,
      evidence: status === "unknown" ? [] : ["fixture"], reasons: [] },
  });
}

export function manyPlans(count: number): JourneyPlan {
  const routes: Journey[] = [];
  for (let index = 0; index < count; index++) {
    routes.push(journey(`option-${index}`, [leg(`out-${index}`)], [leg(`return-${index}`)]));
  }
  return plan(routes);
}

export function varyingPlan(): JourneyPlan {
  return plan([
    journey("full", [leg("paved")], [leg("return-a")]),
    journey("conditional", [uncertainLeg("unknown")], [leg("return-b")]),
    journey("barrier", [barredLeg("step")], [leg("return-c")]),
    journey("return-unknown", [leg("out-d")], [uncertainLeg("return-d")]),
  ]);
}
