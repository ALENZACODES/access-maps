/**
 * Master plan, Part 5, Days 4 and 5: acceptance checks for the journey engine.
 * Each test title starts with its check id from the access-help day catalogue.
 * The three journeys are labelled fixtures from scenarios.ts, not real places.
 * Screen checks (D04-3 state, D04-5, D05-5) are in packages/map-ui/test/acceptance.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { planJourney, type Journey, type Leg } from "../src/index.js";
import { scenarioBus, scenarioStep, scenarioSubway, scenarioUnknowns } from "./scenarios.js";

const LIVE = /\b(live|real[- ]?time|right now|en direct|en temps réel)\b/i;

function transitJourney(journeys: Journey[]): Journey {
  const found = journeys.find((journey) => journey.legs.some((leg) => leg.mode === "transit"));
  if (!found) throw new Error("no transit journey");
  return found;
}

function expectLegHonest(leg: Leg): void {
  expect(["step-free", "unknown", "not-step-free"], leg.id).toContain(leg.stepFree.status);
  expect(leg.provenance.sourceId, leg.id).toBeTruthy();
  expect(leg.provenance.licence, leg.id).toBeTruthy();
  expect(leg.provenance.retrievedAt === null || typeof leg.provenance.retrievedAt === "string", leg.id).toBe(true);
}

describe("Day 4", () => {
  it("D04-1 a journey returns at least one route, the approach leg is separate, and every leg has a step-free status and a source", () => {
    const plan = planJourney(scenarioBus());
    expect(plan.journeys.length).toBeGreaterThan(0);
    const journey = transitJourney(plan.journeys);
    const approaches = journey.legs.filter((leg) => leg.mode === "approach");
    expect(approaches).toHaveLength(1);
    const approach = approaches[0]!;
    expect(approach.chainLeg).toBe("approach");
    const transitIndex = journey.legs.findIndex((leg) => leg.mode === "transit");
    expect(journey.legs.indexOf(approach)).toBeGreaterThan(transitIndex);
    for (const leg of journey.legs) expectLegHonest(leg);
  });

  it("D04-2 a thin approach shows Unknown and the explanation names the gap", () => {
    const plan = planJourney(scenarioUnknowns());
    const journey = transitJourney(plan.journeys);
    const approach = journey.legs.find((leg) => leg.mode === "approach");
    expect(approach?.stepFree.status).toBe("unknown");
    expect(approach?.distanceKind).not.toBe("route");
    expect(journey.explanation).toMatch(/UNKNOWN: [^.]*Approach/);
    expect(journey.presentedAsStepFree).toBe(false);
  });

  it("D04-3 the step-free setting changes results when a step is recorded, and says why it does not when none is", () => {
    const required = planJourney(scenarioStep({ stepFreeRequired: true }));
    const optional = planJourney(scenarioStep({ stepFreeRequired: false }));
    expect(required.stepFreeRequired).toBe(true);
    expect(optional.stepFreeRequired).toBe(false);
    const stepped = (journeys: Journey[]) => journeys.filter((journey) => journey.legs.some((leg) => leg.stepFree.status === "not-step-free"));
    expect(stepped(required.journeys)).toHaveLength(0);
    expect(stepped(required.blocked).length).toBeGreaterThan(0);
    expect(stepped(optional.journeys).length).toBeGreaterThan(0);

    // With no recorded barrier the setting has nothing to move. The screen says so (map-ui D04-3).
    const on = planJourney(scenarioBus({ stepFreeRequired: true }));
    const off = planJourney(scenarioBus({ stepFreeRequired: false }));
    expect(on.blocked).toHaveLength(0);
    expect(on.journeys.map((journey) => journey.summary)).toEqual(off.journeys.map((journey) => journey.summary));
  });

  it("D04-4 every time on three routes is labelled scheduled and no live or real-time wording appears", () => {
    for (const input of [scenarioBus(), scenarioSubway(), scenarioUnknowns()]) {
      for (const locale of ["en", "fr"] as const) {
        const plan = planJourney({ ...input, locale });
        const journey = transitJourney(plan.journeys);
        const timed = [...journey.legs, ...journey.returnJourney.legs].filter((leg) => leg.timing);
        expect(timed.length).toBeGreaterThan(1);
        for (const leg of timed) {
          expect(leg.timing?.kind).toBe("scheduled");
          expect(leg.timing?.label).toBe(locale === "en" ? "Scheduled" : "Horaire");
        }
        expect(JSON.stringify(plan)).not.toMatch(LIVE);
      }
    }
  });

  it("D04-6 the return leg uses the same structure and the same honesty labels", () => {
    const journey = transitJourney(planJourney(scenarioBus()).journeys);
    const back = journey.returnJourney;
    expect(back.legs.length).toBeGreaterThan(0);
    for (const leg of back.legs) expectLegHonest(leg);
    const outModes = new Set(journey.legs.map((leg) => leg.mode));
    for (const mode of ["transit", "approach"] as const) {
      expect(outModes.has(mode)).toBe(true);
    }
    expect(back.legs.some((leg) => leg.mode === "transit")).toBe(true);
    expect(back.legs.find((leg) => leg.mode === "transit")?.timing?.label).toBe("Scheduled");
    expect(back.explanation.length).toBeGreaterThan(20);
    expect(back.presentedAsStepFree).toBe(false);
  });
});

describe("Day 5", () => {
  function depthChecks(journey: Journey): void {
    expect(journey.depth.entrance.text.length).toBeGreaterThan(0);
    expect(journey.depth.entrance.provenance.sourceId).toBeTruthy();
    expect(journey.depth.washroom.text.length).toBeGreaterThan(0);
    expect(journey.depth.parking.text.length).toBeGreaterThan(0);
    expect(journey.legs.some((leg) => leg.mode === "approach")).toBe(true);
    expect(journey.returnJourney.legs.length).toBeGreaterThan(0);
    expect(journey.returnJourney.depth.washroom.text.length).toBeGreaterThan(0);
    for (const leg of [...journey.legs, ...journey.returnJourney.legs]) expectLegHonest(leg);
  }

  it("D05-1 fixture journey 1 renders entrance, washroom, parking, approach, and return with tiers and sources", () => {
    const journey = transitJourney(planJourney(scenarioBus()).journeys);
    depthChecks(journey);
    expect(journey.depth.washroom.provenance?.tier).toBe(2);
    expect(journey.depth.parking.provenance?.tier).toBe(1);
    expect(journey.depth.parking.text).toContain("Fixture clinic lot");
    expect(journey.depth.entrance.stepCount).toBe("UNKNOWN");
  });

  it("D05-2 fixture journey 2 renders the same depth on a route that differs", () => {
    const one = transitJourney(planJourney(scenarioBus()).journeys);
    const two = transitJourney(planJourney(scenarioSubway()).journeys);
    depthChecks(two);
    expect(two.legs.find((leg) => leg.mode === "transit")?.transitMode).toBe("subway");
    expect(one.legs.find((leg) => leg.mode === "transit")?.transitMode).toBe("bus");
    expect(two.summary === one.summary && two.depth.parking.text === one.depth.parking.text).toBe(false);
    expect(two.depth.parking.text).toContain("Fixture library lot");
  });

  it("D05-3 fixture journey 3 renders the same depth and labels every unknown", () => {
    const journey = transitJourney(planJourney(scenarioUnknowns()).journeys);
    depthChecks(journey);
    expect(journey.depth.entrance.stepCount).toBe("UNKNOWN");
    expect(journey.depth.entrance.ramp).toBe("UNKNOWN");
    expect(journey.depth.entrance.doorWidth).toBe("UNKNOWN");
    expect(journey.depth.washroom.usable).toBe(false);
    expect(journey.depth.washroom.transferSide).toMatch(/unknown/i);
    expect(journey.depth.parking.text.toLowerCase()).toContain("no parking");
  });

  it("D05-4 a destination with no seeded washroom shows an honest absence and a visible warning", () => {
    const input = scenarioUnknowns();
    const plan = planJourney({ ...input, data: { ...input.data, washrooms: [] } });
    const journey = plan.journeys[0]!;
    expect(journey.depth.washroom.text.toLowerCase()).toContain("no washroom");
    expect(journey.depth.washroom.usable).toBe(false);
    const warning = plan.warnings.find((item) => item.code === "washroom");
    expect(warning?.beforeCommit).toBe(true);
    expect(warning?.text.length).toBeGreaterThan(10);
    expect(warning?.text).not.toMatch(/minutes? between|bladder|catheter/i);
  });
});
