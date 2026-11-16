/**
 * Three labelled fixture journeys for the master-plan Day 4 and Day 5 checks.
 *
 * These are not real places, stops, or trips. The licence on every record is
 * "fixture-not-a-real-dataset". They stand in for the three demo journeys until
 * the open-data seed from the pipeline change is merged. Values that a real
 * source would not carry are left out, so they stay unknown.
 */
import type { PlanInput } from "../src/index.js";
import { field, path, provenance, source, stop, trip, venue, washroom, SUMMER_DEPART, SUMMER_NOW } from "./fixtures.js";

const HOME = { id: "home", name: "Fixture home", lon: -79.4002, lat: 43.7, venueId: "home" };

const homeVenue = venue("home", "Fixture home", HOME.lon, HOME.lat, {
  step_count: field(0),
  ramp: field("yes"),
  door_width: field("900 mm"),
});

const common = {
  origin: HOME,
  departAt: SUMMER_DEPART,
  now: SUMMER_NOW,
  winterMode: false as const,
  profile: { chair: "manual" as const, transferSide: "left" as const },
};

/** Scenario 1: bus, a measured approach, a described washroom, and a parking bay. */
export function scenarioBus(over: Partial<PlanInput> = {}): PlanInput {
  return {
    ...common,
    data: source({
      stops: [stop("a", "Fixture stop A", -79.4, 43.7, "1"), stop("b", "Fixture stop B", -79.399, 43.7004, "1")],
      venues: [
        homeVenue,
        venue("clinic", "Fixture clinic", -79.3988, 43.7004, {
          step_count: field("UNKNOWN"),
          ramp: field("UNKNOWN"),
          door_width: field("UNKNOWN"),
        }),
      ],
      paths: [
        path("to-a", [[HOME.lon, HOME.lat], [-79.4, 43.7]], { wheelchair: field("yes"), surface: field("asphalt"), incline: field("2%") }),
        path("to-clinic", [[-79.399, 43.7004], [-79.3988, 43.7004]], { wheelchair: field("yes"), surface: field("concrete"), incline: field("1%") }),
      ],
      trips: [
        trip({
          id: "bus-out",
          routeId: "fixture-bus",
          mode: "bus",
          wheelchairAccessible: "1",
          stopTimes: [
            { stopId: "a", arrival: "08:10", departure: "08:10" },
            { stopId: "b", arrival: "08:22", departure: "08:22" },
          ],
        }),
        trip({
          id: "bus-back",
          routeId: "fixture-bus",
          mode: "bus",
          wheelchairAccessible: "1",
          stopTimes: [
            { stopId: "b", arrival: "17:10", departure: "17:10" },
            { stopId: "a", arrival: "17:22", departure: "17:22" },
          ],
        }),
      ],
      stopAccess: [
        { stopId: "a", status: "step-free", evidence: "fixture curb ramp", provenance: provenance({ tier: 2 }) },
        { stopId: "b", status: "step-free", evidence: "fixture curb ramp", provenance: provenance({ tier: 2 }) },
      ],
      washrooms: [washroom("wc-clinic", "Fixture clinic washroom", -79.3988, 43.7004, { wheelchair: field("yes"), access: field("customers") })],
      washroomDetails: [
        { washroomId: "wc-clinic", transferSide: "both", turningDiameterMm: 1500, door: "outward", provenance: provenance({ tier: 2 }) },
      ],
      parking: [
        {
          id: "lot-clinic",
          name: "Fixture clinic lot",
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
    destination: { id: "clinic", name: "Fixture clinic", lon: -79.3988, lat: 43.7004, venueId: "clinic" },
    ...over,
  };
}

/** Scenario 2: subway to a different destination, so the route differs from scenario 1. */
export function scenarioSubway(over: Partial<PlanInput> = {}): PlanInput {
  return {
    ...common,
    data: source({
      stops: [stop("s1", "Fixture station North", -79.4, 43.7, "1"), stop("s2", "Fixture station South", -79.4, 43.69, "1")],
      venues: [
        homeVenue,
        venue("library", "Fixture library", -79.4002, 43.6898, {
          step_count: field(0),
          ramp: field("UNKNOWN"),
          door_width: field("950 mm"),
        }),
      ],
      paths: [
        path("home-s1", [[HOME.lon, HOME.lat], [-79.4, 43.7]], { wheelchair: field("yes"), surface: field("asphalt"), incline: field("1%") }),
        path("s2-library", [[-79.4, 43.69], [-79.4002, 43.6898]], { wheelchair: field("yes"), surface: field("paving_stones"), incline: field("3%") }),
      ],
      trips: [
        trip({
          id: "subway-out",
          routeId: "fixture-line",
          mode: "subway",
          wheelchairAccessible: "1",
          stopTimes: [
            { stopId: "s1", arrival: "08:05", departure: "08:05" },
            { stopId: "s2", arrival: "08:14", departure: "08:14" },
          ],
        }),
        trip({
          id: "subway-back",
          routeId: "fixture-line",
          mode: "subway",
          wheelchairAccessible: "1",
          stopTimes: [
            { stopId: "s2", arrival: "16:40", departure: "16:40" },
            { stopId: "s1", arrival: "16:49", departure: "16:49" },
          ],
        }),
      ],
      stopAccess: [
        { stopId: "s1", status: "step-free", evidence: "fixture level entrance", provenance: provenance({ tier: 2 }) },
        { stopId: "s2", status: "step-free", evidence: "fixture level entrance", provenance: provenance({ tier: 2 }) },
      ],
      washrooms: [washroom("wc-library", "Fixture library washroom", -79.4002, 43.6898, { wheelchair: field("yes"), adult_changing_table: field("yes") })],
      washroomDetails: [
        { washroomId: "wc-library", transferSide: "left", turningDiameterMm: 1700, door: "automatic", provenance: provenance({ tier: 2 }) },
      ],
      parking: [
        {
          id: "lot-library",
          name: "Fixture library lot",
          lon: -79.4002,
          lat: 43.6898,
          vanAccessible: null,
          widthMm: null,
          aisleMm: null,
          payment: "unknown",
          reservationCutoff: null,
          reservationPhone: null,
          distanceToEntranceMetres: null,
          provenance: provenance({ tier: 1 }),
        },
      ],
    }),
    destination: { id: "library", name: "Fixture library", lon: -79.4002, lat: 43.6898, venueId: "library" },
    ...over,
  };
}

/** Scenario 3: bus to a hall where entrance, washroom measurements, and the approach are unknown. */
export function scenarioUnknowns(over: Partial<PlanInput> = {}): PlanInput {
  return {
    ...common,
    data: source({
      stops: [stop("c", "Fixture stop C", -79.4, 43.7, "1"), stop("d", "Fixture stop D", -79.38, 43.705, "UNKNOWN")],
      venues: [homeVenue, venue("hall", "Fixture hall", -79.3797, 43.7051)],
      paths: [path("home-c", [[HOME.lon, HOME.lat], [-79.4, 43.7]], { wheelchair: field("yes") })],
      trips: [
        trip({
          id: "bus-hall",
          routeId: "fixture-bus-2",
          mode: "bus",
          wheelchairAccessible: "1",
          stopTimes: [
            { stopId: "c", arrival: "08:12", departure: "08:12" },
            { stopId: "d", arrival: "08:31", departure: "08:31" },
          ],
        }),
        trip({
          id: "bus-hall-back",
          routeId: "fixture-bus-2",
          mode: "bus",
          wheelchairAccessible: "1",
          stopTimes: [
            { stopId: "d", arrival: "15:02", departure: "15:02" },
            { stopId: "c", arrival: "15:21", departure: "15:21" },
          ],
        }),
      ],
      washrooms: [washroom("wc-hall", "Fixture hall washroom", -79.3797, 43.7051, { wheelchair: field("yes") })],
    }),
    destination: { id: "hall", name: "Fixture hall", lon: -79.3797, lat: 43.7051, venueId: "hall" },
    ...over,
  };
}

/** A path with a recorded step between home and the destination. */
export function scenarioStep(over: Partial<PlanInput> = {}): PlanInput {
  const destination = { id: "shop", name: "Fixture shop", lon: -79.3995, lat: 43.7002 };
  return {
    ...common,
    data: source({
      venues: [homeVenue],
      paths: [path("steps", [[HOME.lon, HOME.lat], [destination.lon, destination.lat]], { step_count: field(3) })],
    }),
    destination,
    ...over,
  };
}
