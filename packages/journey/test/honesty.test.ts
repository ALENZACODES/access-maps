import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { asImportedRecord, claimFromTier, copyLocaleKeys, planJourney, provenanceFromField, resolveStepFree, assertEngineAllowed } from "../src/index.js";
import { field, path, provenance, source, stop, SUMMER_DEPART, SUMMER_NOW, trip, venue, washroom } from "./fixtures.js";

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

  it("plans a destination named Live Music Hall", () => {
    const plan = planJourney({
      data: source(),
      origin: { ...origin, name: "Home" },
      destination: { ...destination, name: "Live Music Hall" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const names = [...plan.journeys, ...plan.blocked].flatMap((journey) => journey.legs.map((leg) => leg.title));
    expect(names.some((title) => title.includes("Live Music Hall"))).toBe(true);
  });

  it("does not invent a tier or a 1970 date for a missing field", () => {
    const missing = provenanceFromField(undefined, "missing");
    expect(missing.tier).toBeNull();
    expect(missing.sourceId).toBe("UNKNOWN");
    expect(missing.retrievedAt).toBe("UNKNOWN");
    expect(missing.retrievedAt).not.toBe("1970-01-01");
    const plan = planJourney({
      data: source(),
      origin,
      destination,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const homeLeg = plan.journeys[0]?.legs.find((leg) => leg.mode === "home-exit");
    expect(homeLeg?.provenance.tier).toBeNull();
    expect(homeLeg?.provenance.sourceId).toBe("UNKNOWN");
  });

  it("does not treat tier 3 as an App survey without protocol, role, method, and date", () => {
    expect(claimFromTier(3, false).appVerified).toBe(false);
    expect(claimFromTier(3, false).reason).toBe("tier-without-survey");
    expect(claimFromTier(3, true).appVerified).toBe(true);
    const tagged = resolveStepFree({
      stairs: 0,
      wheelchair: "yes",
      boarding: "unknown",
      ramp: "unknown",
      inclinePercent: null,
      widthMm: null,
      blocked: false,
      blockReason: null,
      winterDowngrade: false,
      tier: 3,
      evidenceLabel: "path",
      surveyed: false,
    });
    expect(tagged.status).toBe("step-free");
    expect(tagged.appVerified).toBe(false);
    expect(tagged.reasons).toContain("tier-without-survey");
  });

  it("keeps the same copy keys in French and English", () => {
    const keys = copyLocaleKeys();
    expect([...keys.fr].sort()).toEqual([...keys.en].sort());
  });

  it("does not leave English entrance, washroom, parking, or mode codes on a French plan", () => {
    const plan = planJourney({
      locale: "fr",
      data: source({
        venues: [venue("clinic", "Clinique", destination.lon, destination.lat, { wheelchair: field("yes") })],
        washrooms: [washroom("wc", "Toilettes", destination.lon, destination.lat, { wheelchair: field("yes"), phone: field("000-777-0000") })],
        parking: [
          {
            id: "bay",
            name: "Stationnement clinique",
            lon: destination.lon,
            lat: destination.lat,
            vanAccessible: false,
            widthMm: null,
            aisleMm: null,
            payment: "app-only",
            reservationCutoff: null,
            reservationPhone: null,
            distanceToEntranceMetres: 20,
            provenance: provenance(),
          },
        ],
      }),
      origin,
      destination: { ...destination, venueId: "clinic" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const blob = JSON.stringify(plan);
    expect(blob).not.toContain("Steps:");
    expect(blob).not.toContain("Door width");
    expect(blob).not.toContain("Transfer side");
    expect(blob).not.toContain("Van-accessible");
    expect(blob).not.toContain("Gradient:");
    const shown = [...plan.journeys, ...plan.blocked].flatMap((journey) => [
      journey.summary,
      ...journey.legs.map((leg) => leg.title),
      ...journey.returnJourney.legs.map((leg) => leg.title),
    ]);
    expect(shown.join(" ")).not.toMatch(/\bhome-exit\b|\bapproach\b/);
    expect(blob).toContain("Marches");
    expect(blob).toContain("Côté de transfert");
    expect(blob).toContain("Fourgonnette");
    expect(plan.journeys[0]?.summary ?? plan.blocked[0]?.summary).not.toMatch(/home-exit|approach|station-access/);
  });

  it("rejects OpenTripPlanner and OpenRouteService by name", () => {
    expect(() => assertEngineAllowed("opentripplanner")).toThrow(/OpenTripPlanner/);
    expect(() => assertEngineAllowed("OpenRouteService")).toThrow(/OpenRouteService/);
    expect(() => assertEngineAllowed("valhalla")).not.toThrow();
    expect(() => assertEngineAllowed("osrm")).not.toThrow();
    expect(() => assertEngineAllowed("graphhopper")).not.toThrow();
  });
});
