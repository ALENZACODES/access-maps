import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { planJourney, toMapFeatures } from "../src/index.js";
import type { JourneyDataSource, JourneyPlan, Leg, ParatransitDirectoryEntry } from "../src/index.js";
import { field, osmField, path, provenance, source, stop, SUMMER_DEPART, SUMMER_NOW, trip, venue } from "./fixtures.js";

const home = { id: "home", name: "Fixture home", lon: -79.4, lat: 43.7 };
const mid = { lon: -79.395, lat: 43.7 };
const place = { id: "place", name: "Fixture destination", lon: -79.39, lat: 43.7 };

function plan(data: JourneyDataSource, over: Partial<Parameters<typeof planJourney>[0]> = {}): JourneyPlan {
  return planJourney({
    data,
    origin: home,
    destination: place,
    departAt: SUMMER_DEPART,
    now: SUMMER_NOW,
    winterMode: false,
    profile: { chair: "manual" },
    ...over,
  });
}

function approachOf(result: JourneyPlan): Leg | undefined {
  return [...result.journeys, ...result.blocked].flatMap((journey) => journey.legs).find((leg) => leg.mode === "approach");
}

function shownText(result: JourneyPlan): string {
  const journeys = [...result.journeys, ...result.blocked];
  return [
    ...journeys.flatMap((journey) => [
      journey.summary,
      journey.explanation,
      journey.weakestLink.text,
      journey.depth.entrance.text,
      journey.depth.washroom.text,
      journey.depth.parking.text,
      journey.returnJourney.explanation,
      ...journey.chain.slots.map((slot) => slot.text),
      journey.chain.fare.text,
      journey.chain.timing.text,
      ...journey.fareSummary.map((line) => line.text),
      ...journey.warnings.map((warning) => warning.text),
      ...[...journey.legs, ...journey.returnJourney.legs].flatMap((leg) => [
        leg.title,
        leg.note,
        ...leg.warnings.map((warning) => warning.text),
      ]),
    ]),
    ...result.warnings.map((warning) => warning.text),
    ...result.supplyNotes.map((note) => note.text),
  ].join("\n");
}

const osmSidewalk = (retrievedAt?: string) =>
  path(
    "way/1001",
    [
      [home.lon, home.lat],
      [place.lon, place.lat],
    ],
    {
      geometry: osmField(
        [
          [home.lon, home.lat],
          [place.lon, place.lat],
        ],
        retrievedAt,
      ),
      wheelchair: osmField("yes", retrievedAt),
      step_count: osmField(0, retrievedAt),
      surface: osmField("asphalt", retrievedAt),
    },
  );

describe("R2 walking legs cite the path record that decided them", () => {
  it("gives an OpenStreetMap walking leg its licence, attribution, retrieval date, and tier", () => {
    const result = plan(source({ paths: [osmSidewalk()] }));
    const approach = approachOf(result);
    expect(approach?.distanceKind).toBe("route");
    expect(approach?.provenance.sourceId).toBe("osm-ontario");
    expect(approach?.provenance.licence).toBe("ODbL-1.0");
    expect(approach?.provenance.attribution).toBe("© OpenStreetMap contributors");
    expect(approach?.provenance.retrievedOn).toBe("2026-10-01");
    expect(approach?.provenance.retrievedAt).toBe("2026-10-01T04:12:00Z");
    expect(approach?.provenance.tier).toBe(0);
    expect(approach?.provenance.note).toBe("way/1001");
    expect(approach?.geometryAttribution).toBe("© OpenStreetMap contributors");
    // An open-data tag is still a claim, not a check by the App.
    expect(approach?.stepFree.appVerified).toBe(false);
  });

  it("never cites the router or a made-up licence on any leg", () => {
    const result = plan(source({ paths: [osmSidewalk()] }));
    const legs = [...result.journeys, ...result.blocked].flatMap((journey) => [...journey.legs, ...journey.returnJourney.legs]);
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) {
      expect(leg.provenance.sourceId).not.toBe("graph");
      expect(leg.provenance.licence).not.toBe("catalog-path");
    }
  });

  it("validates the OpenStreetMap leg against the schema, and the schema rejects one without the credit", () => {
    const schema = JSON.parse(readFileSync(new URL("../schema/journey-leg.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
    const approach = approachOf(plan(source({ paths: [osmSidewalk()] })));
    expect(approach).toBeTruthy();
    expect(validate(approach), JSON.stringify(validate.errors)).toBe(true);
    const stripped = { ...approach, provenance: { ...approach?.provenance, attribution: undefined } };
    expect(validate(JSON.parse(JSON.stringify(stripped)))).toBe(false);
  });

  it("keeps a missing retrieval date UNKNOWN and does not fill in today's date", () => {
    const approach = approachOf(plan(source({ paths: [osmSidewalk("UNKNOWN")] })));
    expect(approach?.provenance.licence).toBe("ODbL-1.0");
    expect(approach?.provenance.retrievedOn).toBe("UNKNOWN");
    expect(approach?.provenance.retrievedAt).toBe("UNKNOWN");
    expect(JSON.stringify(approach?.provenance)).not.toContain("2026-06-15");
  });

  it("does not put the OpenStreetMap credit on a path that is not OpenStreetMap data", () => {
    const result = plan(
      source({
        paths: [
          path("fixture-walk", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], { wheelchair: field("yes"), step_count: field(0) }),
        ],
      }),
    );
    const approach = approachOf(result);
    expect(approach?.distanceKind).toBe("route");
    expect(approach?.provenance.sourceId).toBe("fixture");
    expect(approach?.provenance.licence).toBe("fixture-not-a-real-dataset");
    expect(approach?.provenance.attribution).toBeUndefined();
    expect(approach?.provenance.retrievedOn).toBeUndefined();
    expect(approach?.geometryAttribution).toBeNull();
    expect(toMapFeatures(result).some((feature) => feature.odbl)).toBe(false);
  });

  it("cites the segment that decided the status when a route crosses two sources", () => {
    const result = plan(
      source({
        paths: [
          path("way/2001", [
            [home.lon, home.lat],
            [mid.lon, mid.lat],
          ], {
            geometry: osmField([
              [home.lon, home.lat],
              [mid.lon, mid.lat],
            ]),
            wheelchair: osmField("yes"),
            step_count: osmField(0),
          }),
          path("city-link", [
            [mid.lon, mid.lat],
            [place.lon, place.lat],
          ], { surface: field("gravel", 0, "city-fixture") }),
        ],
      }),
    );
    const approach = approachOf(result);
    expect(approach?.stepFree.status).toBe("unknown");
    expect(approach?.provenance.sourceId).toBe("city-fixture");
    expect(approach?.provenance.note).toBe("city-link");
    expect(approach?.provenance.attribution).toBeUndefined();
    // Part of the drawn line is still OpenStreetMap geometry, so the map credit stays.
    expect(approach?.geometryAttribution).toBe("© OpenStreetMap contributors");
    expect(toMapFeatures(result).some((feature) => feature.odbl)).toBe(true);
  });

  it("cites the barrier report when the report decided the leg, and keeps the map credit", () => {
    const result = plan(
      source({
        paths: [osmSidewalk()],
        barriers: [
          {
            id: "hoarding",
            pathId: "way/1001",
            kind: "construction",
            blocksPassage: true,
            observedAt: SUMMER_NOW,
            provenance: provenance({ tier: 2, sourceId: "report-fixture" }),
          },
        ],
      }),
    );
    const approach = approachOf(result);
    expect(approach?.stepFree.status).toBe("not-step-free");
    expect(approach?.provenance.sourceId).toBe("report-fixture");
    expect(approach?.provenance.tier).toBe(2);
    expect(approach?.geometryAttribution).toBe("© OpenStreetMap contributors");
  });

  it("leaves a straight-line gap with no source at all", () => {
    const approach = approachOf(plan(source()));
    expect(approach?.distanceKind).toBe("straight-line");
    expect(approach?.provenance.sourceId).toBe("UNKNOWN");
    expect(approach?.provenance.licence).toBe("UNKNOWN");
    expect(approach?.provenance.tier).toBeNull();
    expect(approach?.geometryAttribution).toBeNull();
  });

  it("passes the credit to the map feature for the leg", () => {
    const features = toMapFeatures(plan(source({ paths: [osmSidewalk()] })));
    const feature = features.find((item) => item.kind === "approach");
    expect(feature?.source).toBe("osm-ontario");
    expect(feature?.licence).toBe("ODbL-1.0");
    expect(feature?.attribution).toBe("© OpenStreetMap contributors");
    expect(feature?.retrievedOn).toBe("2026-10-01");
    expect(feature?.tier).toBe(0);
    expect(feature?.odbl).toBe(true);
  });
});

function specialized(over: Partial<ParatransitDirectoryEntry> = {}): ParatransitDirectoryEntry {
  return {
    id: "scenario-specialized",
    name: "Scenario specialized transit",
    region: "london",
    phone: "000-333-0000",
    portalUrl: null,
    bookingWindowDays: 1,
    guarantee: "no-guarantee",
    pickupWindowMinutes: null,
    sharedRideMinutes: null,
    driverWaitMinutes: 5,
    noShowPolicy: null,
    unscheduledStops: "unknown",
    connectionLeadMinutes: null,
    weatherStatus: null,
    provenance: provenance({ tier: 1 }),
    ...over,
  };
}

function paratransitNote(result: JourneyPlan): string {
  const leg = [...result.journeys, ...result.blocked]
    .flatMap((journey) => journey.legs)
    .find((item) => item.mode === "paratransit-info");
  return leg?.note ?? "";
}

describe("R1 paratransit booking cutoff", () => {
  const depart = "2026-06-15T10:00:00-04:00";
  const now = "2026-06-15T09:00:00-04:00";
  const venues = [
    venue("home", "Home", home.lon, home.lat, {}, "london"),
    venue("place", "Clinic", place.lon, place.lat, {}, "london"),
  ];
  const ends = { origin: { ...home, venueId: "home" }, destination: { ...place, venueId: "place" }, departAt: depart, now };

  it("does not show the departure time as a booking deadline", () => {
    const result = plan(source({ venues, paratransit: [specialized()] }), ends);
    const note = paratransitNote(result);
    expect(note).not.toBe("");
    expect(note).not.toContain("Book by");
    expect(note).not.toContain("2026-06-15T10:00");
    expect(JSON.stringify(result)).not.toContain("Book by");
    expect(note).toContain("Booking cutoff: UNKNOWN");
    expect(note).toContain("Call 000-333-0000 to confirm the cutoff");
  });

  it("writes one day in the singular and leaves an unknown pickup window without a unit", () => {
    const note = paratransitNote(plan(source({ venues, paratransit: [specialized()] }), ends));
    expect(note).toContain("Booking window: 1 day.");
    expect(note).toContain("Pickup window: UNKNOWN.");
    expect(note).not.toContain("UNKNOWN minutes");
    expect(note).toContain("Driver wait: 5 minutes.");
  });

  it("says so when no operator phone is recorded", () => {
    const note = paratransitNote(plan(source({ venues, paratransit: [specialized({ phone: null })] }), ends));
    expect(note).toContain("Booking cutoff: UNKNOWN");
    expect(note).toContain("No operator phone is recorded");
    expect(note).not.toContain("Call UNKNOWN");
  });

  it("gives the same facts in French with no deadline", () => {
    const note = paratransitNote(plan(source({ venues, paratransit: [specialized()] }), { ...ends, locale: "fr" }));
    expect(note).toContain("Heure limite de réservation : Inconnu");
    expect(note).toContain("Appelez le 000-333-0000");
    expect(note).not.toContain("Réserver avant");
    expect(note).not.toContain("2026-06-15T10:00");
    expect(note).not.toContain("UNKNOWN");
  });
});

describe("S2 future-dated barrier reports", () => {
  const future = "2026-06-15T09:00:00-04:00"; // two hours after SUMMER_NOW

  it("makes a path unknown when its barrier report is dated in the future", () => {
    const result = plan(
      source({
        paths: [
          path("sidewalk", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], { wheelchair: field("yes"), step_count: field(0) }),
        ],
        barriers: [
          {
            id: "ahead",
            pathId: "sidewalk",
            kind: "construction",
            blocksPassage: true,
            observedAt: future,
            provenance: provenance({ tier: 2, sourceId: "report-fixture" }),
          },
        ],
      }),
    );
    const approach = approachOf(result);
    expect(approach?.stepFree.status).toBe("unknown");
    expect(approach?.stepFree.reasons).toContain("barrier-future");
    expect(approach?.note).toContain("timestamp in the future");
    expect(approach?.provenance.sourceId).toBe("report-fixture");
    for (const journey of [...result.journeys, ...result.blocked]) {
      expect(journey.presentedAsStepFree).toBe(false);
    }
  });

  it("is step-free on the same path when there is no report, so the check above can fail", () => {
    const approach = approachOf(
      plan(
        source({
          paths: [
            path("sidewalk", [
              [home.lon, home.lat],
              [place.lon, place.lat],
            ], { wheelchair: field("yes"), step_count: field(0) }),
          ],
        }),
      ),
    );
    expect(approach?.stepFree.status).toBe("step-free");
  });

  it("makes station access unknown when a stop barrier report is dated in the future", () => {
    const result = plan(
      source({
        stops: [
          stop("a", "Scenario stop A", home.lon, home.lat, "1"),
          stop("b", "Scenario stop B", place.lon, place.lat, "1"),
        ],
        stopAccess: [
          { stopId: "a", status: "step-free", evidence: "Scenario ramp note", provenance: provenance({ tier: 1 }) },
        ],
        trips: [
          trip({
            id: "bus",
            mode: "bus",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "a", arrival: "08:10", departure: "08:10" },
              { stopId: "b", arrival: "08:25", departure: "08:25" },
            ],
          }),
        ],
        barriers: [
          {
            id: "ahead",
            stopId: "a",
            kind: "snow",
            blocksPassage: true,
            observedAt: future,
            provenance: provenance({ tier: 2, sourceId: "report-fixture" }),
          },
        ],
      }),
    );
    const access = [...result.journeys, ...result.blocked]
      .flatMap((journey) => journey.legs)
      .find((leg) => leg.mode === "station-access" && leg.fromName === "Scenario stop A");
    expect(access).toBeTruthy();
    expect(access?.stepFree.status).toBe("unknown");
    expect(access?.stepFree.reasons).toContain("barrier-future");
    expect(access?.provenance.sourceId).toBe("report-fixture");
  });
});

describe("S1 French display values", () => {
  it("does not show the UNKNOWN token in French text, and keeps it as the data value", () => {
    const result = plan(
      source({
        venues: [venue("place", "Clinique", place.lon, place.lat, { wheelchair: field("yes") })],
        paths: [osmSidewalk()],
      }),
      { locale: "fr", destination: { ...place, venueId: "place" } },
    );
    const text = shownText(result);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/UNKNOWN|INCONNU/);
    expect(text).toContain("Inconnu");
    const journey = result.journeys[0] ?? result.blocked[0];
    expect(journey?.depth.entrance.stepCount).toBe("UNKNOWN");
    expect(journey?.legs.find((leg) => leg.mode === "interior")?.surface).toBe("UNKNOWN");
  });
});
