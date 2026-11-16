import type { JourneyDataSource, PlanInput, TransitTrip } from "@access-maps/journey";
import { TTC_STOPS } from "../seed/index.js";

/**
 * Stops are real TTC records (seed/ttc-stops.ts). Trips, times, origin, and destination are scenario
 * fixtures. They are not an operator schedule.
 */
const scenarioProvenance = {
  sourceId: "scenario-fixture",
  licence: "fixture-not-a-real-dataset",
  retrievedAt: "2026-11-13",
  tier: 1 as const,
  note: "Scenario trip. Not an operator schedule.",
};

export const LINE_TRIP: TransitTrip = {
  id: "scenario-line-1",
  agencyId: "scenario-subway",
  agencyName: "Scenario subway trip",
  routeId: "scenario-line-1",
  routeName: "Scenario Line 1 trip",
  mode: "subway",
  wheelchairAccessible: "UNKNOWN",
  stopTimes: [
    { stopId: "gtfs:gtfs-ttc:13831", arrival: "14:05", departure: "14:05" },
    { stopId: "gtfs:gtfs-ttc:13830", arrival: "14:09", departure: "14:09" },
  ],
  provenance: scenarioProvenance,
};

export const BUS_TRIP: TransitTrip = {
  id: "scenario-bus",
  agencyId: "scenario-bus",
  agencyName: "Scenario bus trip",
  routeId: "scenario-bus",
  routeName: "Scenario bus trip",
  mode: "bus",
  wheelchairAccessible: "UNKNOWN",
  stopTimes: [
    { stopId: "gtfs:gtfs-ttc:9895", arrival: "14:03", departure: "14:03" },
    { stopId: "gtfs:gtfs-ttc:14779", arrival: "14:20", departure: "14:20" },
  ],
  provenance: scenarioProvenance,
};

export const PAPE_TRIP: TransitTrip = {
  id: "scenario-line-2",
  agencyId: "scenario-subway",
  agencyName: "Scenario subway trip",
  routeId: "scenario-line-2",
  routeName: "Scenario Line 2 trip",
  mode: "subway",
  wheelchairAccessible: "UNKNOWN",
  stopTimes: [
    { stopId: "gtfs:gtfs-ttc:13745", arrival: "14:10", departure: "14:10" },
    { stopId: "gtfs:gtfs-ttc:13830", arrival: "14:40", departure: "14:40" },
  ],
  provenance: scenarioProvenance,
};

export function data(trips: TransitTrip[]): JourneyDataSource {
  return { stops: TTC_STOPS, paths: [], venues: [], washrooms: [], trips };
}

/** About 40 minutes after the snapshot feed time (2026-11-13 19:48:29 UTC), after the Fairbank escalator end time (20:00 UTC). */
export const NOW = "2026-11-13T20:30:00.000Z";

export function cedarvaleInput(trips: TransitTrip[], over: Partial<PlanInput> = {}): PlanInput {
  return {
    data: data(trips),
    origin: { id: "scenario-origin", name: "Scenario origin", lon: -79.4365, lat: 43.6996 },
    destination: { id: "scenario-destination", name: "Scenario destination", lon: -79.415, lat: 43.6835 },
    departAt: "2026-11-13T20:30:00.000Z",
    now: NOW,
    winterMode: false,
    ...over,
  };
}

export function papeInput(trips: TransitTrip[], over: Partial<PlanInput> = {}): PlanInput {
  return {
    data: data(trips),
    origin: { id: "scenario-origin-2", name: "Scenario origin near Pape", lon: -79.3455, lat: 43.6797 },
    destination: { id: "scenario-destination", name: "Scenario destination", lon: -79.415, lat: 43.6835 },
    departAt: "2026-11-13T20:30:00.000Z",
    now: NOW,
    winterMode: false,
    ...over,
  };
}
