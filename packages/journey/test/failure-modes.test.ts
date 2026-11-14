import { describe, expect, it } from "vitest";
import { planJourney, routeWithFetch } from "../src/index.js";
import type { Journey, JourneyPlan, PlanInput } from "../src/index.js";
import {
  elevator,
  field,
  path,
  provenance,
  source,
  stop,
  SUMMER_DEPART,
  SUMMER_NOW,
  trip,
  venue,
  washroom,
  WINTER_DEPART,
  WINTER_NOW,
} from "./fixtures.js";

const home = { id: "home", name: "Fixture home", lon: -79.4, lat: 43.7, venueId: "home" };
const place = { id: "place", name: "Fixture destination", lon: -79.39, lat: 43.7, venueId: "place" };

function texts(value: unknown): string {
  return JSON.stringify(value);
}

function journeyWith(plan: JourneyPlan, mode: string): Journey | undefined {
  return [...plan.journeys, ...plan.blocked].find((journey) => journey.legs.some((leg) => leg.mode === mode));
}

describe("FM-01 elevator outage with no alternate", () => {
  const data = source({
    stops: [
      stop("st-clair", "Scenario station St. Clair West", -79.4, 43.7, "1"),
      stop("st-patrick", "Scenario station St. Patrick", -79.39, 43.7, "1"),
    ],
    venues: [
      venue("home", "Home near scenario St. Clair West", home.lon, home.lat),
      venue("place", "Hospital near scenario St. Patrick", place.lon, place.lat),
    ],
    trips: [
      trip({
        id: "subway",
        agencyId: "scenario-subway",
        routeId: "line",
        routeName: "Scenario subway",
        mode: "subway",
        wheelchairAccessible: "1",
        stopTimes: [
          { stopId: "st-clair", arrival: "08:10", departure: "08:10" },
          { stopId: "st-patrick", arrival: "08:28", departure: "08:28" },
        ],
      }),
    ],
    elevators: [
      elevator({
        id: "e-st-clair",
        name: "Scenario elevator St. Clair West",
        stopId: "st-clair",
        networkId: "scenario-subway",
        helpPhone: "000-000-0000",
        status: {
          state: "out",
          observedAt: "2026-06-15T06:50:00-04:00",
          source: "feed",
          provenance: provenance({ tier: 4 }),
        },
      }),
    ],
  });

  it("does not treat the station boarding flag as a step-free path", () => {
    const plan = planJourney({ data, origin: home, destination: place, departAt: SUMMER_DEPART, now: SUMMER_NOW, winterMode: false, profile: { chair: "power" } });
    const subway = journeyWith(plan, "transit");
    expect(subway).toBeTruthy();
    const access = subway?.legs.find((leg) => leg.mode === "station-access" && leg.title.includes("St. Clair"));
    const approach = subway?.legs.find((leg) => leg.mode === "approach");
    const ride = subway?.legs.find((leg) => leg.mode === "transit");
    expect(access?.mode).toBe("station-access");
    expect(access?.stepFree.status).toBe("not-step-free");
    expect(access?.note).toContain("000-000-0000");
    expect(access?.singlePointOfFailure).toBe(true);
    expect(approach?.mode).toBe("approach");
    expect(approach?.id).not.toBe(ride?.id);
    expect(approach?.distanceKind).toBe("straight-line");
    expect(approach?.stepFree.status).not.toBe("step-free");
    expect(approach?.note.toLowerCase()).toContain("straight-line");
    expect(approach?.surface).toBe("UNKNOWN");
    expect(approach?.gradient).toBe("UNKNOWN");
    expect(ride?.timing?.label).toBe("Scheduled");
    expect(subway?.presentedAsStepFree).toBe(false);
    expect(plan.blocked).toContain(subway);
    expect(plan.noGo).toBeTruthy();
    expect(texts(plan)).not.toMatch(/\blive\b/i);
    expect(texts(plan)).not.toMatch(/real-time/i);
    expect(access?.provenance.sourceId).toBe("fixture");
    expect(access?.provenance.tier).toBe(4);
    expect(access?.provenance.sourceId).not.toBe("gtfs-fixture");
  });

  it("does not call the station step-free when one of two elevators is out", () => {
    const plan = planJourney({
      data: source({
        ...data,
        elevators: [
          elevator({
            id: "street",
            name: "Street elevator",
            stopId: "st-clair",
            networkId: "scenario-subway",
            status: { state: "working", observedAt: "2026-06-15T06:40:00-04:00", source: "feed", provenance: provenance({ tier: 4, sourceId: "elevator-feed" }) },
          }),
          elevator({
            id: "platform",
            name: "Platform elevator",
            stopId: "st-clair",
            networkId: "scenario-subway",
            status: { state: "out", observedAt: "2026-06-15T06:42:00-04:00", source: "feed", provenance: provenance({ tier: 4, sourceId: "elevator-feed" }) },
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power" },
    });
    const access = [...plan.journeys, ...plan.blocked]
      .flatMap((journey) => journey.legs)
      .find((leg) => leg.mode === "station-access" && leg.title.includes("St. Clair"));
    expect(access?.stepFree.status).toBe("not-step-free");
    expect(access?.note).toContain("Street elevator");
    expect(access?.note).toContain("Platform elevator");
    expect(access?.provenance.sourceId).toBe("elevator-feed");
    expect(access?.singlePointOfFailure).toBe(false);
  });

  it("treats a fresh user report of an outage as the barrier and shows both sources", () => {
    const plan = planJourney({
      data: source({
        ...data,
        elevators: [
          elevator({
            id: "e-st-clair",
            name: "Scenario elevator St. Clair West",
            stopId: "st-clair",
            networkId: "scenario-subway",
            helpPhone: "000-000-0000",
            status: {
              state: "working",
              observedAt: "2026-06-15T06:40:00-04:00",
              source: "feed",
              provenance: provenance({ tier: 4, sourceId: "elevator-feed" }),
              userReport: {
                state: "out",
                observedAt: "2026-06-15T06:45:00-04:00",
                provenance: provenance({ tier: 4, sourceId: "user-report" }),
              },
            },
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power" },
    });
    const access = [...plan.journeys, ...plan.blocked]
      .flatMap((journey) => journey.legs)
      .find((leg) => leg.mode === "station-access" && leg.title.includes("St. Clair"));
    expect(access?.stepFree.status).toBe("not-step-free");
    expect(access?.note).toContain("2026-06-15T06:40:00-04:00");
    expect(access?.note).toContain("2026-06-15T06:45:00-04:00");
    expect(access?.provenance.sourceId).toBe("user-report");
  });

  it("does not treat a future-dated elevator status as in service", () => {
    const plan = planJourney({
      data: source({
        ...data,
        elevators: [
          elevator({
            id: "e-st-clair",
            name: "Scenario elevator St. Clair West",
            stopId: "st-clair",
            status: {
              state: "working",
              observedAt: "2026-06-16T07:00:00-04:00",
              source: "feed",
              provenance: provenance({ tier: 4, sourceId: "elevator-feed" }),
            },
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power" },
    });
    const access = [...plan.journeys, ...plan.blocked]
      .flatMap((journey) => journey.legs)
      .find((leg) => leg.mode === "station-access" && leg.title.includes("St. Clair"));
    expect(access?.stepFree.status).toBe("unknown");
    expect(access?.stepFree.reasons).toContain("elevator-future");
  });
});

describe("FM-02 correlated elevator outage", () => {
  it("escalates several outages and does not leave the subway in the usable list", () => {
    const observedAt = "2026-06-15T06:40:00-04:00";
    const plan = planJourney({
      data: source({
        stops: [stop("finch", "Scenario Finch", -79.4, 43.7, "1"), stop("union", "Scenario Union", -79.39, 43.7, "1")],
        trips: [
          trip({
            id: "subway",
            agencyId: "scenario-subway",
            mode: "subway",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "finch", arrival: "09:00", departure: "09:00" },
              { stopId: "union", arrival: "09:40", departure: "09:40" },
            ],
          }),
        ],
        elevators: ["e1", "e2", "e3"].map((id, index) =>
          elevator({
            id,
            stopId: index === 0 ? "finch" : "union",
            networkId: "scenario-subway",
            helpPhone: "000-111-0000",
            status: { state: "out", observedAt, source: "feed", provenance: provenance({ tier: 4 }) },
          }),
        ),
        paratransit: [
          {
            id: "scenario-para",
            name: "Scenario paratransit",
            region: "fixture",
            phone: "000-222-0000",
            portalUrl: "https://example.test/para",
            bookingWindowDays: 7,
            guarantee: "no-guarantee",
            pickupWindowMinutes: 30,
            sharedRideMinutes: 40,
            driverWaitMinutes: 5,
            noShowPolicy: null,
            unscheduledStops: "unknown",
            connectionLeadMinutes: null,
            weatherStatus: null,
            provenance: provenance(),
          },
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual", registrations: [] },
    });
    expect(plan.systemEvent?.text.toLowerCase()).toContain("several elevators");
    expect(plan.systemEvent?.phones).toContain("000-111-0000");
    const subway = [...plan.journeys, ...plan.blocked].find((journey) =>
      journey.legs.some((leg) => leg.transitMode === "subway"),
    );
    expect(plan.journeys).not.toContain(subway);
    expect(plan.blocked).toContain(subway);
    const info = journeyWith(plan, "paratransit-info");
    expect(info?.legs.some((leg) => leg.links.some((link) => link.href === "https://example.test/para"))).toBe(true);
    expect(texts(info!)).not.toMatch(/\bbooked\b/i);
  });
});

describe("FM-03 washroom label without measurements", () => {
  it("does not recommend a washroom from a wheelchair tag alone or a mismatched transfer side", () => {
    const plan = planJourney({
      data: source({
        venues: [venue("place", "Scenario cafe", place.lon, place.lat, { wheelchair: field("yes") })],
        washrooms: [
          washroom("wc", "Scenario washroom", place.lon, place.lat, {
            wheelchair: field("yes"),
            adult_changing_table: field("UNKNOWN"),
          }),
        ],
        washroomDetails: [
          {
            washroomId: "wc",
            transferSide: "right",
            turningDiameterMm: null,
            door: null,
            provenance: provenance(),
          },
        ],
        paths: [
          path("clear", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], { wheelchair: field("yes"), step_count: field(0), surface: field("concrete") }),
        ],
      }),
      origin: home,
      destination: { ...place },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power", transferSide: "left" },
    });
    const depth = plan.journeys[0]?.depth ?? plan.blocked[0]?.depth;
    expect(depth?.washroom.usable).toBe(false);
    expect(depth?.washroom.transferSide).toBe("right");
    expect(depth?.washroom.adultChangeTable).toBe("UNKNOWN");
    expect(depth?.washroom.text.toLowerCase()).not.toContain("millimetres of turning");
    expect(plan.warnings.some((warning) => warning.code === "washroom" && warning.beforeCommit)).toBe(true);
    expect(texts(plan)).not.toMatch(/catheter/i);
  });

  it("does not recommend a wheelchair tag that has no measurements, and shows the call-ahead phone", () => {
    const plan = planJourney({
      data: source({
        washrooms: [
          washroom("wc", "Scenario washroom", place.lon, place.lat, {
            wheelchair: field("yes"),
            phone: field("000-777-0000"),
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power", transferSide: "left" },
    });
    const depth = plan.journeys[0]?.depth ?? plan.blocked[0]?.depth;
    expect(depth?.washroom.usable).toBe(false);
    expect(depth?.washroom.text).toContain("000-777-0000");
    expect(depth?.washroom.text.toLowerCase()).toContain("call ahead");
    expect(depth?.washroom.transferSide).toBe("UNKNOWN");
  });
});

describe("FM-04 paratransit window and shared ride", () => {
  it("links the operator and does not confirm a trip", () => {
    const depart = "2026-06-17T10:00:00-04:00";
    const now = "2026-06-15T09:00:00-04:00";
    const plan = planJourney({
      data: source({
        venues: [venue("home", "Home", home.lon, home.lat, {}, "london"), venue("place", "Clinic", place.lon, place.lat, {}, "london")],
        paratransit: [
          {
            id: "scenario-specialized",
            name: "Scenario specialized transit",
            region: "london",
            phone: "000-333-0000",
            portalUrl: "https://example.test/book",
            bookingWindowDays: 3,
            guarantee: "no-guarantee",
            pickupWindowMinutes: 30,
            sharedRideMinutes: 75,
            driverWaitMinutes: 5,
            noShowPolicy: "scenario policy",
            unscheduledStops: "unknown",
            connectionLeadMinutes: null,
            weatherStatus: null,
            provenance: provenance({ tier: 1 }),
          },
        ],
      }),
      origin: { ...home, venueId: "home" },
      destination: { ...place, venueId: "place" },
      departAt: depart,
      now,
      winterMode: false,
      profile: { chair: "manual", maxTravelMinutes: 60, maxMinutesBetweenWashrooms: 60, registrations: ["scenario-specialized"] },
    });
    const info = journeyWith(plan, "paratransit-info");
    const leg = info?.legs.find((item) => item.mode === "paratransit-info");
    expect(leg?.links[0]?.phone).toBe("000-333-0000");
    expect(leg?.links[0]?.href).toBe("https://example.test/book");
    expect(leg?.note.toLowerCase()).toContain("no guarantee");
    expect(leg?.note).toContain("Booking window: 3 days");
    // The catalog has no cutoff field, so no deadline is shown. The departure time is not a deadline.
    expect(leg?.note).not.toContain("Book by");
    expect(leg?.note).not.toContain(depart);
    expect(texts(info)).not.toContain("Book by");
    expect(leg?.note).toContain("Booking cutoff: UNKNOWN");
    expect(leg?.note).toContain("Call 000-333-0000 to confirm the cutoff");
    expect(leg?.note).toContain("Pickup window: 30 minutes");
    expect(leg?.note).toContain("Driver wait: 5 minutes");
    expect(leg?.note).toContain("No-show policy: scenario policy");
    expect(leg?.note.toLowerCase()).not.toContain("booked");
    expect(info?.warnings.some((warning) => warning.code === "washroom-interval" || warning.code === "travel-time")).toBe(true);
    expect(info?.returnJourney.explanation.toLowerCase()).toContain("not a confirmed trip");
  });
});

describe("FM-05 winter sidewalk and snow", () => {
  it("does not keep a warm-season path as verified in winter, and honours a snow blockage", () => {
    const data = source({
      paths: [
        path("sidewalk", [
          [home.lon, home.lat],
          [place.lon, place.lat],
        ], { wheelchair: field("yes"), surface: field("concrete"), incline: field("1%") }),
      ],
      barriers: [
        {
          id: "snow-1",
          pathId: "sidewalk",
          kind: "snow",
          blocksPassage: true,
          observedAt: WINTER_NOW,
          provenance: provenance({ tier: 2 }),
        },
      ],
    });
    const snow = planJourney({
      data,
      origin: home,
      destination: place,
      departAt: WINTER_DEPART,
      now: WINTER_NOW,
      profile: { chair: "power" },
    });
    const approach = snow.blocked.flatMap((journey) => journey.legs).find((leg) => leg.mode === "approach");
    expect(approach?.stepFree.status).toBe("not-step-free");
    expect(approach?.stepFree.reasons).toContain("snow-blocked");
    expect(snow.winterMode).toBe(true);

    const downgraded = planJourney({
      data: source({ paths: data.paths }),
      origin: home,
      destination: place,
      departAt: WINTER_DEPART,
      now: WINTER_NOW,
      profile: { chair: "manual" },
    });
    const winterPath = [...downgraded.journeys, ...downgraded.blocked]
      .flatMap((journey) => journey.legs)
      .find((leg) => leg.mode === "approach" && leg.distanceKind === "route");
    expect(winterPath?.stepFree.status).toBe("unknown");
    expect(winterPath?.stepFree.reasons).toContain("summer-not-winter");
    expect(winterPath?.stepFree.appVerified).toBe(false);
  });
});

describe("FM-06 on-demand wheelchair vehicle supply", () => {
  it("keeps the supply note out of the usable route list", () => {
    const plan = planJourney({
      data: source({
        ridehail: [
          {
            id: "supply",
            region: "toronto",
            summary: "Scenario note: on-demand supply is not confirmed. Pre-book a taxi at 000-444-0000, lead time 90 minutes.",
            taxis: [{ name: "Scenario taxi", phone: "000-444-0000", leadTimeNote: "90 minutes", provenance: provenance() }],
            provenance: provenance(),
          },
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power" },
    });
    expect(plan.supplyNotes[0]?.text.toLowerCase()).toContain("not a fallback");
    expect(plan.supplyNotes[0]?.phones).toContain("000-444-0000");
    expect(plan.supplyNotes[0]?.text).toContain("000-444-0000");
    expect(plan.supplyNotes[0]?.text).toContain("90 minutes");
    expect(
      [...plan.journeys, ...plan.blocked].some((journey) =>
        journey.legs.some((leg) => leg.note.includes("000-444-0000") || leg.links.some((link) => link.phone === "000-444-0000")),
      ),
    ).toBe(false);
    expect(texts(plan)).not.toMatch(/\bin range\b/i);
  });
});

describe("FM-07 intercity assistance notice", () => {
  it("states the assistance deadline and does not call the trip step-free", () => {
    const plan = planJourney({
      data: source({
        intercity: [
          {
            id: "corridor",
            name: "Scenario intercity",
            agencyId: "scenario-intercity",
            fromName: "Scenario Toronto",
            toName: "Scenario Ottawa",
            from: home,
            to: place,
            departure: "2026-06-16T08:00:00-04:00",
            arrival: "2026-06-16T12:00:00-04:00",
            assistance: {
              minimumNoticeHours: 48,
              phone: "000-555-0000",
              earlyArrivalMinutes: 30,
              boarding: "staff-lift",
            },
            provenance: provenance({ tier: 1 }),
          },
        ],
      }),
      origin: home,
      destination: place,
      departAt: "2026-06-16T08:00:00-04:00",
      now: "2026-06-15T12:00:00-04:00",
      winterMode: false,
      profile: { chair: "manual" },
    });
    const service = journeyWith(plan, "intercity");
    expect(service?.presentedAsStepFree).toBe(false);
    expect(service?.legs.find((leg) => leg.mode === "intercity")?.stepFree.status).toBe("not-step-free");
    expect(service?.warnings.some((warning) => warning.text.includes("000-555-0000"))).toBe(true);
    expect(texts(service!)).not.toMatch(/\bbooked\b/i);
  });
});

describe("FM-08 parking bay usability", () => {
  it("shows bay facts, the cutoff, and the app-only limit", () => {
    const plan = planJourney({
      data: source({
        parking: [
          {
            id: "bay",
            name: "Scenario bay",
            lon: place.lon,
            lat: place.lat,
            vanAccessible: false,
            widthMm: 2400,
            aisleMm: null,
            payment: "app-only",
            reservationCutoff: "2026-06-14T17:00:00-04:00",
            reservationPhone: "000-666-0000",
            distanceToEntranceMetres: 80,
            provenance: provenance(),
          },
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power", hasSmartphone: false },
    });
    const parking = plan.journeys[0]?.depth.parking.text ?? "";
    expect(parking).toContain("Van-accessible: no");
    expect(parking).toContain("app-only");
    expect(parking).toContain("UNKNOWN");
    expect(plan.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["parking-van", "parking-app-only", "parking-cutoff"]));
  });
});

describe("FM-09 slope, distance, and charging", () => {
  it("warns on grade and distance and does not estimate range", () => {
    const plan = planJourney({
      data: source({
        paths: [
          path("hill", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], {
            wheelchair: field("yes"),
            incline: field("12%"),
            length_m: field(3000),
            surface: field("unpaved"),
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: WINTER_DEPART,
      now: WINTER_NOW,
      profile: { chair: "power", maxGradePercent: 5, maxDistanceMetres: 2000 },
    });
    const hill = plan.blocked.flatMap((journey) => journey.legs).find((leg) => leg.gradient.includes("12"));
    expect(hill?.stepFree.reasons).toContain("grade-over-limit");
    expect(plan.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["no-charger", "cold-range", "distance-over"]));
    expect(texts(plan)).not.toMatch(/\bin range\b/i);
    expect(texts(plan)).not.toMatch(/guaranteed/i);
  });
});

describe("FM-10 weather cancellation and connection lead", () => {
  it("surfaces a cancellation and the connection buffer", () => {
    const plan = planJourney({
      data: source({
        venues: [venue("home", "Home", home.lon, home.lat, {}, "hamilton"), venue("place", "Clinic", place.lon, place.lat, {}, "hamilton")],
        paratransit: [
          {
            id: "scenario-darts",
            name: "Scenario Hamilton paratransit",
            region: "hamilton",
            phone: "000-777-0000",
            portalUrl: "https://example.test/weather",
            bookingWindowDays: 7,
            guarantee: "no-guarantee",
            pickupWindowMinutes: null,
            sharedRideMinutes: null,
            driverWaitMinutes: 5,
            noShowPolicy: null,
            unscheduledStops: "unknown",
            connectionLeadMinutes: 90,
            weatherStatus: {
              state: "cancelled",
              summary: "Scenario cancellation for snow and ice. No rebooking is in this record.",
              url: "https://example.test/weather",
              provenance: provenance({ tier: 1 }),
            },
            provenance: provenance({ tier: 1 }),
          },
        ],
      }),
      origin: { ...home, venueId: "home" },
      destination: { ...place, venueId: "place" },
      departAt: WINTER_DEPART,
      now: WINTER_NOW,
      profile: { chair: "manual" },
    });
    const info = journeyWith(plan, "paratransit-info");
    expect(plan.blocked).toContain(info);
    expect(info?.warnings.some((warning) => warning.code === "weather-cancellation")).toBe(true);
    expect(info?.legs.find((leg) => leg.mode === "paratransit-info")?.note).toContain("90");
    expect(info?.legs.find((leg) => leg.mode === "paratransit-info")?.note.toLowerCase()).toContain("missed connection");
  });
});

describe("FM-11 cross-boundary paratransit", () => {
  it("models two systems, a registration gap, and an unverified transfer", () => {
    const plan = planJourney({
      data: source({
        venues: [
          venue("home", "Toronto home", home.lon, home.lat, {}, "toronto"),
          venue("place", "Mississauga clinic", place.lon, place.lat, {}, "peel"),
        ],
        paratransit: [
          {
            id: "system-a",
            name: "Scenario system A",
            region: "toronto",
            phone: "000-100-0001",
            portalUrl: "https://example.test/a",
            bookingWindowDays: 7,
            guarantee: "no-guarantee",
            pickupWindowMinutes: null,
            sharedRideMinutes: null,
            driverWaitMinutes: null,
            noShowPolicy: null,
            unscheduledStops: "unknown",
            connectionLeadMinutes: null,
            weatherStatus: null,
            provenance: provenance({ tier: 1 }),
          },
          {
            id: "system-b",
            name: "Scenario system B",
            region: "peel",
            phone: "000-100-0002",
            portalUrl: "https://example.test/b",
            bookingWindowDays: 2,
            guarantee: "unknown",
            pickupWindowMinutes: null,
            sharedRideMinutes: null,
            driverWaitMinutes: null,
            noShowPolicy: null,
            unscheduledStops: "unknown",
            connectionLeadMinutes: null,
            weatherStatus: null,
            provenance: provenance({ tier: 1 }),
          },
        ],
        transfers: [
          {
            id: "curb",
            name: "Scenario transfer curb",
            fromRegion: "toronto",
            toRegion: "peel",
            shelter: "unknown",
            washroom: "unknown",
            stepFree: "unknown",
            provenance: provenance(),
          },
        ],
      }),
      origin: { ...home, venueId: "home" },
      destination: { ...place, venueId: "place" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual", registrations: ["system-a"] },
    });
    const handoff = [...plan.journeys, ...plan.blocked].find((journey) => journey.legs.some((leg) => leg.mode === "handoff"));
    expect(handoff?.legs.filter((leg) => leg.mode === "paratransit-info")).toHaveLength(2);
    expect(handoff?.warnings.some((warning) => warning.code === "registration-gap" && warning.text.includes("Scenario system B"))).toBe(true);
    expect(handoff?.warnings.some((warning) => warning.code === "transfer-unverified")).toBe(true);
    expect(handoff?.summary).not.toBe("paratransit-info");
  });
});

describe("FM-12 last 200 metres", () => {
  it("keeps the approach separate and refuses station-plus-venue flags", () => {
    const plan = planJourney({
      data: source({
        stops: [stop("station", "Scenario accessible station", home.lon, home.lat, "1")],
        venues: [venue("place", "Scenario theatre", place.lon, place.lat, { wheelchair: field("yes") })],
        trips: [
          trip({
            id: "in",
            mode: "subway",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "station", arrival: "19:00", departure: "19:00" },
              { stopId: "station", arrival: "19:05", departure: "19:05" },
            ],
          }),
        ],
        paths: [
          path("closed", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], { wheelchair: field("yes") }),
        ],
        barriers: [
          {
            id: "hoarding",
            pathId: "closed",
            kind: "construction",
            blocksPassage: true,
            observedAt: SUMMER_NOW,
            provenance: provenance({ tier: 2 }),
          },
        ],
      }),
      origin: { ...home, venueId: undefined },
      destination: { ...place, venueId: "place" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power" },
    });
    const tripJourney = [...plan.journeys, ...plan.blocked].find((journey) => journey.legs.some((leg) => leg.mode === "transit"));
    const approach = tripJourney?.legs.find((leg) => leg.mode === "approach");
    const ride = tripJourney?.legs.find((leg) => leg.mode === "transit");
    expect(approach).toBeTruthy();
    expect(approach?.id).not.toBe(ride?.id);
    expect(approach?.stepFree.status).toBe("not-step-free");
    expect(approach?.stepFree.reasons).toContain("construction");
    expect(tripJourney?.presentedAsStepFree).toBe(false);
    expect(plan.journeys).not.toContain(tripJourney);
  });

  it("does not treat a station flag plus a venue tag as a step-free approach or entrance", () => {
    const plan = planJourney({
      data: source({
        stops: [stop("station", "Scenario accessible station", home.lon, home.lat, "1")],
        venues: [venue("place", "Scenario theatre", place.lon, place.lat, { wheelchair: field("yes") })],
        trips: [
          trip({
            id: "in",
            mode: "subway",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "station", arrival: "19:00", departure: "19:00" },
              { stopId: "station", arrival: "19:05", departure: "19:05" },
            ],
          }),
        ],
      }),
      origin: { ...home, venueId: undefined },
      destination: { ...place, venueId: "place" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "power" },
    });
    const tripJourney = [...plan.journeys, ...plan.blocked].find((journey) => journey.legs.some((leg) => leg.mode === "transit"));
    const approach = tripJourney?.legs.find((leg) => leg.mode === "approach");
    const entrance = tripJourney?.legs.find((leg) => leg.mode === "entrance");
    expect(approach?.stepFree.status).not.toBe("step-free");
    expect(entrance?.stepFree.status).toBe("unknown");
    expect(entrance?.stepFree.reasons).toContain("entrance-not-measured");
    expect(tripJourney?.presentedAsStepFree).toBe(false);
  });

  it("does not keep an expired barrier, and a current barrier says why it blocks", () => {
    const expired = planJourney({
      data: source({
        paths: [
          path("sidewalk", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], { wheelchair: field("yes"), step_count: field(0) }),
        ],
        barriers: [
          {
            id: "old-hoarding",
            pathId: "sidewalk",
            kind: "construction",
            blocksPassage: true,
            observedAt: "2025-01-01T12:00:00-05:00",
            provenance: provenance({ tier: 2 }),
          },
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const oldApproach = [...expired.journeys, ...expired.blocked].flatMap((journey) => journey.legs).find((leg) => leg.mode === "approach");
    expect(oldApproach?.stepFree.reasons).not.toContain("construction");

    const current = planJourney({
      data: source({
        paths: [
          path("sidewalk", [
            [home.lon, home.lat],
            [place.lon, place.lat],
          ], { wheelchair: field("yes"), step_count: field(0) }),
        ],
        barriers: [
          {
            id: "fresh-hoarding",
            pathId: "sidewalk",
            kind: "construction",
            blocksPassage: true,
            observedAt: SUMMER_NOW,
            provenance: provenance({ tier: 2 }),
          },
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const approach = [...current.journeys, ...current.blocked].flatMap((journey) => journey.legs).find((leg) => leg.mode === "approach");
    expect(approach?.stepFree.status).toBe("not-step-free");
    expect(approach?.note.toLowerCase()).toContain("construction");
    expect(approach?.note).toContain(SUMMER_NOW);
  });
});

describe("FM-13 washroom timing", () => {
  it("warns before departure, stays silent on clinical detail, and keeps the warning offline", () => {
    const plan = planJourney({
      data: source({
        venues: [venue("home", "Home", home.lon, home.lat, {}, "sudbury"), venue("place", "Clinic", place.lon, place.lat, {}, "sudbury")],
        paratransit: [
          {
            id: "scenario-zone",
            name: "Scenario shared ride",
            region: "sudbury",
            phone: "000-888-0000",
            portalUrl: null,
            bookingWindowDays: 2,
            guarantee: "no-guarantee",
            pickupWindowMinutes: null,
            sharedRideMinutes: 95,
            driverWaitMinutes: null,
            noShowPolicy: null,
            unscheduledStops: "not-permitted",
            connectionLeadMinutes: null,
            weatherStatus: null,
            provenance: provenance({ tier: 1 }),
          },
        ],
      }),
      origin: { ...home, venueId: "home" },
      destination: { ...place, venueId: "place" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      offline: true,
      profile: { chair: "power", maxMinutesBetweenWashrooms: 90, registrations: ["scenario-zone"] },
    });
    const info = journeyWith(plan, "paratransit-info");
    expect(info?.warnings.some((warning) => warning.beforeCommit && warning.code === "washroom-interval")).toBe(true);
    expect(info?.legs.find((leg) => leg.mode === "paratransit-info")?.note.toLowerCase()).toContain("not permitted");
    expect(info?.depth.washroom.text.toLowerCase()).toContain("no washroom");
    expect(plan.emergency.phone).toBe("911");
    expect(plan.offline?.banner).toBeTruthy();
    expect(texts(plan)).not.toMatch(/dysreflexia|catheter|triage|blood pressure/i);
  });
});

describe("FM-14 support person and fare cards", () => {
  it("does not copy a free support person across operators", () => {
    const plan = planJourney({
      data: source({
        stops: [
          stop("kitchener", "Scenario Kitchener", -79.4, 43.7, "1"),
          stop("go", "Scenario rail station", -79.395, 43.7, "1"),
          stop("toronto", "Scenario Toronto hospital stop", -79.39, 43.7, "1"),
        ],
        trips: [
          trip({
            id: "grt",
            agencyId: "grt",
            agencyName: "Scenario GRT",
            routeId: "grt",
            mode: "bus",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "kitchener", arrival: "08:00", departure: "08:00" },
              { stopId: "go", arrival: "08:20", departure: "08:20" },
            ],
          }),
          trip({
            id: "go",
            agencyId: "go",
            agencyName: "Scenario GO",
            routeId: "go",
            mode: "rail",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "go", arrival: "08:40", departure: "08:40" },
              { stopId: "toronto", arrival: "09:30", departure: "09:30" },
            ],
          }),
          trip({
            id: "ttc",
            agencyId: "ttc",
            agencyName: "Scenario TTC",
            routeId: "ttc",
            mode: "subway",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "toronto", arrival: "09:40", departure: "09:40" },
              { stopId: "toronto", arrival: "09:50", departure: "09:50" },
            ],
          }),
        ],
        fares: [
          { id: "f-grt", agencyId: "grt", agencyName: "Scenario GRT", supportPerson: "free", card: "EasyGO", proof: null, provenance: provenance({ tier: 1 }) },
          { id: "f-go", agencyId: "go", agencyName: "Scenario GO", supportPerson: "free", card: null, proof: null, provenance: provenance({ tier: 1 }) },
          { id: "f-ttc", agencyId: "ttc", agencyName: "Scenario TTC", supportPerson: "free-with-card", card: "Support Person Assistance Card", proof: "card", provenance: provenance({ tier: 1 }) },
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual", needsSupportPerson: true, cardsHeld: ["PRESTO"] },
    });
    const chain = [...plan.journeys, ...plan.blocked].find((journey) => journey.fareSummary.length >= 3);
    expect(chain?.fareSummary.map((line) => line.agencyName)).toEqual(["Scenario GRT", "Scenario GO", "Scenario TTC"]);
    expect(chain?.warnings.some((warning) => warning.code === "support-person-differs")).toBe(true);
    expect(chain?.warnings.some((warning) => warning.code === "card-missing" && warning.text.includes("Support Person Assistance Card"))).toBe(true);
    expect(chain?.fareSummary.some((line) => line.text.includes("free") && line.agencyName === "Scenario TTC" && line.supportPerson === "free")).toBe(false);
  });
});

describe("return, stale status, and external router", () => {
  it("shows a return with the same leg count and does not invent a return schedule", () => {
    const plan = planJourney({
      data: source({
        stops: [stop("a", "A", home.lon, home.lat, "1"), stop("b", "B", place.lon, place.lat, "1")],
        trips: [
          trip({
            id: "out",
            routeId: "route",
            mode: "bus",
            wheelchairAccessible: "UNKNOWN",
            stopTimes: [
              { stopId: "a", arrival: "08:00", departure: "08:00" },
              { stopId: "b", arrival: "08:20", departure: "08:20" },
            ],
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const journey = journeyWith(plan, "transit");
    expect(journey?.returnJourney.legs).toHaveLength(journey?.legs.length ?? -1);
    const back = journey?.returnJourney.legs.find((leg) => leg.mode === "transit");
    expect(back?.timing).toBeNull();
    expect(back?.stepFree.status).toBe("unknown");
    expect(back?.note.toLowerCase()).toContain("not a confirmed trip");
  });

  it("treats an elevator status older than four hours as unknown", () => {
    const plan = planJourney({
      data: source({
        stops: [stop("a", "A", home.lon, home.lat, "1")],
        trips: [
          trip({
            id: "loop",
            mode: "subway",
            agencyId: "scenario-subway",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "a", arrival: "08:00", departure: "08:00" },
              { stopId: "a", arrival: "08:10", departure: "08:10" },
            ],
          }),
        ],
        elevators: [
          elevator({
            id: "old",
            stopId: "a",
            networkId: "scenario-subway",
            alternateStepFree: true,
            status: {
              state: "working",
              observedAt: "2026-06-15T01:00:00-04:00",
              source: "feed",
              provenance: provenance({ tier: 4 }),
            },
          }),
        ],
      }),
      origin: home,
      destination: place,
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    const access = journeyWith(plan, "transit")?.legs.find((leg) => leg.mode === "station-access");
    expect(access?.stepFree.status).toBe("unknown");
    expect(access?.stepFree.reasons).toContain("elevator-stale");
    expect(access?.note.toLowerCase()).not.toContain("in service");
  });

  it("does not mark an external pedestrian route as step-free", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(String(url)).toContain("https://router.example.test/access-route");
      expect(body.engine).toBe("osrm");
      expect(body.costing).toBe("pedestrian");
      return new Response(JSON.stringify({ distanceMetres: 400, geometry: [[-79.4, 43.7], [-79.39, 43.7]] }), { status: 200 });
    };
    const result = await routeWithFetch(
      { engine: "osrm", baseUrl: "https://router.example.test", fetchImpl },
      { from: home, to: place, reportBarriers: true },
    );
    expect(result.assessment.status).toBe("unknown");
    expect(result.assessment.reasons).toContain("external-engine-does-not-prove-step-free");
    expect(result.distanceMetres).toBe(400);
  });
});

describe("day 4 and day 5 planner shape", () => {
  function planned(over: Partial<PlanInput> = {}): JourneyPlan {
    return planJourney({
      data: source({
        stops: [stop("a", "Stop A", -79.4, 43.7, "1"), stop("b", "Stop B", -79.399, 43.7004, "1")],
        venues: [
          venue("home", "Home", -79.4002, 43.7, { step_count: field(0), ramp: field("yes"), door_width: field("900 mm"), wheelchair: field("yes") }),
          venue("place", "Clinic", -79.3988, 43.7004, { step_count: field("UNKNOWN"), ramp: field("UNKNOWN"), door_width: field("UNKNOWN") }),
        ],
        paths: [
          path("to-a", [[-79.4002, 43.7], [-79.4, 43.7]], { wheelchair: field("yes"), surface: field("asphalt"), incline: field("2%") }),
          path("to-clinic", [[-79.399, 43.7004], [-79.3988, 43.7004]], { wheelchair: field("yes"), surface: field("concrete"), incline: field("1%") }),
        ],
        trips: [
          trip({
            id: "bus",
            routeId: "bus",
            mode: "bus",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "a", arrival: "08:10", departure: "08:10" },
              { stopId: "b", arrival: "08:22", departure: "08:22" },
            ],
          }),
          trip({
            id: "bus-back",
            routeId: "bus",
            mode: "bus",
            wheelchairAccessible: "1",
            stopTimes: [
              { stopId: "b", arrival: "17:10", departure: "17:10" },
              { stopId: "a", arrival: "17:22", departure: "17:22" },
            ],
          }),
        ],
        stopAccess: [
          { stopId: "a", status: "step-free", evidence: "surface stop, surveyed curb ramp", provenance: provenance({ tier: 2 }) },
          { stopId: "b", status: "step-free", evidence: "surface stop, surveyed curb ramp", provenance: provenance({ tier: 2 }) },
        ],
        washrooms: [washroom("wc", "Clinic washroom", -79.3988, 43.7004, { wheelchair: field("yes"), adult_changing_table: field("no"), access: field("customers") })],
        washroomDetails: [{ washroomId: "wc", transferSide: "both", turningDiameterMm: 1500, door: "outward", provenance: provenance({ tier: 2 }) }],
        parking: [
          {
            id: "lot",
            name: "Clinic lot",
            lon: -79.3988,
            lat: 43.7004,
            vanAccessible: true,
            widthMm: 3400,
            aisleMm: 2000,
            payment: "card",
            reservationCutoff: null,
            reservationPhone: null,
            distanceToEntranceMetres: 40,
            provenance: provenance({ tier: 1 }),
          },
        ],
      }),
      origin: { id: "home", name: "Home", lon: -79.4002, lat: 43.7, venueId: "home" },
      destination: { id: "clinic", name: "Clinic", lon: -79.3988, lat: 43.7004, venueId: "place" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual", transferSide: "left" },
      ...over,
    });
  }

  it("returns a transit journey with a separate approach, sources, and a scheduled return", () => {
    const plan = planned();
    const journey = plan.journeys.find((item) => item.legs.some((leg) => leg.mode === "transit"));
    expect(journey).toBeTruthy();
    const approach = journey?.legs.find((leg) => leg.mode === "approach");
    expect(approach?.distanceKind).toBe("route");
    expect(approach?.surface).toBe("concrete");
    expect(approach?.gradient).toContain("1%");
    expect(journey?.legs.every((leg) => leg.stepFree.status && leg.provenance.sourceId)).toBe(true);
    expect(journey?.explanation.length).toBeGreaterThan(20);
    const back = journey?.returnJourney.legs.find((leg) => leg.mode === "transit");
    expect(back?.timing?.label).toBe("Scheduled");
    expect(back?.timing?.departure).toBe("17:10");
    expect(journey?.depth.entrance.stepCount).toBe("UNKNOWN");
    expect(journey?.depth.washroom.usable).toBe(true);
    expect(journey?.depth.washroom.transferSide).toBe("both");
    expect(journey?.depth.parking.text).toContain("Clinic lot");
    expect(journey?.depth.parking.provenance?.tier).toBe(1);
  });

  it("says when no washroom is recorded and keeps the warning before the result is trusted", () => {
    const plan = planned();
    const bare = planJourney({
      data: source({
        venues: [venue("place", "Empty clinic", place.lon, place.lat)],
      }),
      origin: home,
      destination: { ...place, venueId: "place" },
      departAt: SUMMER_DEPART,
      now: SUMMER_NOW,
      winterMode: false,
      profile: { chair: "manual" },
    });
    expect(bare.journeys[0]?.depth.washroom.text.toLowerCase()).toContain("no washroom");
    expect(bare.warnings.some((warning) => warning.beforeCommit && warning.code === "washroom")).toBe(true);
    expect(bare.journeys[0]?.depth.parking.text.toLowerCase()).toContain("no parking");
    expect(bare.journeys[0]?.returnJourney.depth.washroom.text.toLowerCase()).toContain("no washroom");
  });
});
