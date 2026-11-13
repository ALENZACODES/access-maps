import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { asImportedRecord, planJourney, resolveStepFree, assertEngineAllowed } from "../src/index.js";
import { field, path, source, stop, SUMMER_DEPART, SUMMER_NOW, trip, venue } from "./fixtures.js";

const origin = { id: "home", name: "Fixture home", lon: -79.46, lat: 43.68, venueId: "home-venue" };
const destination = { id: "clinic", name: "Fixture clinic", lon: -79.45, lat: 43.681, venueId: "clinic-venue" };

describe("step-free defaults", () => {
  it("treats an empty evidence bag as unknown", () => {
    const result = resolveStepFree(undefined);
    expect(result.status).toBe("unknown");
    expect(result.appVerified).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  it("does not treat a zero step count alone as step-free", () => {
    const result = resolveStepFree({
      stairs: 0,
      wheelchair: "unknown",
      boarding: "unknown",
      ramp: "unknown",
      inclinePercent: null,
      widthMm: null,
      blocked: false,
      blockReason: null,
      winterDowngrade: false,
      tier: 0,
      evidenceLabel: "path",
    });
    expect(result.status).toBe("unknown");
  });

  it("keeps an operator boarding flag of 0 as unknown on a station access leg", () => {
    const plan = planJourney({
      data: source({
        stops: [stop("a", "Stop A", -79.46, 43.68, "0"), stop("b", "Stop B", -79.4502, 43.681, "0")],
        trips: [
          trip({
            id: "bus",
            mode: "bus",
            wheelchairAccessible: "0",
            stopTimes: [
              { stopId: "a", arrival: "08:10", departure: "08:10" },
              { stopId: "b", arrival: "08:20", departure: "08:20" },
            ],
          }),
        ],
        venues: [venue("home-venue", "Home", origin.lon, origin.lat), venue("clinic-venue", "Clinic", destination.lon, destination.lat)],
      }),
      origin,
      destination,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const transit = plan.journeys.find((journey) => journey.legs.some((leg) => leg.mode === "transit"));
    expect(transit).toBeTruthy();
    const access = transit?.legs.find((leg) => leg.mode === "station-access");
    expect(access?.stepFree.status).toBe("unknown");
    expect(transit?.presentedAsStepFree).toBe(false);
    expect(transit?.legs.every((leg) => leg.timing === null || leg.timing.kind === "scheduled")).toBe(true);
    expect(transit?.legs.every((leg) => leg.timing === null || leg.timing.label === "Scheduled")).toBe(true);
  });

  it("flags a recorded step when the step-free requirement is on, and shows it when the requirement is off", () => {
    const data = source({
      paths: [
        path("steps", [
          [origin.lon, origin.lat],
          [destination.lon, destination.lat],
        ], { step_count: field(4) }),
      ],
    });
    const blocked = planJourney({
      data,
      origin,
      destination,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    expect(blocked.journeys.some((journey) => journey.legs.some((leg) => leg.stepFree.status === "not-step-free"))).toBe(false);
    expect(blocked.blocked.some((journey) => journey.legs.some((leg) => leg.stepFree.reasons.includes("stairs")))).toBe(true);

    const open = planJourney({
      data,
      origin,
      destination,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      stepFreeRequired: false,
      profile: { chair: "manual" },
    });
    expect(open.journeys.some((journey) => journey.legs.some((leg) => leg.stepFree.reasons.includes("stairs")))).toBe(true);
  });

  it("reads a data-lane record without inventing missing fields", () => {
    const record = asImportedRecord({
      id: "stop-1",
      tranche: "transit",
      region: "toronto",
      fields: {
        name: field("Example stop", 1, "gtfs"),
        wheelchair_boarding: field("0", 1, "gtfs"),
      },
    });
    expect(record.tranche).toBe("transit");
    expect(record.fields.lat).toBeUndefined();
  });

  it("validates a leg against the journey schema", () => {
    const plan = planJourney({
      data: source(),
      origin,
      destination,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const schema = JSON.parse(readFileSync(new URL("../schema/journey-leg.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv({ strict: true, allErrors: true });
    const validate = ajv.compile(schema);
    for (const leg of plan.journeys[0]?.legs ?? []) {
      expect(validate(leg), JSON.stringify(validate.errors)).toBe(true);
      if (leg.stepFree.status === "step-free") expect(leg.stepFree.evidence.length).toBeGreaterThan(0);
    }
  });

  it("rejects OpenTripPlanner and OpenRouteService by name", () => {
    expect(() => assertEngineAllowed("opentripplanner")).toThrow(/OpenTripPlanner/);
    expect(() => assertEngineAllowed("OpenRouteService")).toThrow(/OpenRouteService/);
    expect(() => assertEngineAllowed("valhalla")).not.toThrow();
    expect(() => assertEngineAllowed("osrm")).not.toThrow();
    expect(() => assertEngineAllowed("graphhopper")).not.toThrow();
  });
});
