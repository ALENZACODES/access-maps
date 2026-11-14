import type {
  ElevatorAsset,
  FieldValue,
  ImportedRecord,
  JourneyDataSource,
  Provenance,
  TransitTrip,
  VerificationTier,
} from "../src/index.js";

export function provenance(over: Partial<Provenance> = {}): Provenance {
  return {
    sourceId: "fixture",
    licence: "fixture-not-a-real-dataset",
    retrievedAt: "2026-11-13",
    tier: 0,
    note: "Scenario fixture. Not an operator status and not a survey.",
    ...over,
  };
}

export function field(
  value: FieldValue["value"],
  tier: VerificationTier = 0,
  source = "fixture",
): FieldValue {
  return {
    value,
    source_id: source,
    licence: "fixture-not-a-real-dataset",
    retrieved_at: "2026-11-13",
    tier,
  };
}

/** A field stamped the way the open-data lane stamps an OpenStreetMap import. Scenario values only. */
export function osmField(
  value: FieldValue["value"],
  retrievedAt = "2026-10-01T04:12:00Z",
  tier: VerificationTier = 0,
): FieldValue {
  return {
    value,
    source_id: "osm-ontario",
    licence: "ODbL-1.0",
    retrieved_at: retrievedAt,
    tier,
  };
}

export function stop(
  id: string,
  name: string,
  lon: number,
  lat: number,
  boarding: "0" | "1" | "2" | "UNKNOWN" = "UNKNOWN",
  region = "fixture",
): ImportedRecord {
  return {
    id,
    tranche: "transit",
    region,
    fields: {
      name: field(name, 1, "gtfs-fixture"),
      lat: field(lat, 1, "gtfs-fixture"),
      lon: field(lon, 1, "gtfs-fixture"),
      wheelchair_boarding: field(boarding, 1, "gtfs-fixture"),
    },
  };
}

export function path(
  id: string,
  coordinates: Array<[number, number]>,
  extra: Partial<Record<string, FieldValue>> = {},
): ImportedRecord {
  return {
    id,
    tranche: "path",
    region: "fixture",
    fields: {
      geometry: field(coordinates),
      geometry_type: field("linestring"),
      ...extra,
    },
  };
}

export function venue(
  id: string,
  name: string,
  lon: number,
  lat: number,
  extra: Partial<Record<string, FieldValue>> = {},
  region = "fixture",
): ImportedRecord {
  return {
    id,
    tranche: "venue",
    region,
    fields: {
      name: field(name),
      lat: field(lat),
      lon: field(lon),
      ...extra,
    },
  };
}

export function washroom(
  id: string,
  name: string,
  lon: number,
  lat: number,
  extra: Partial<Record<string, FieldValue>> = {},
): ImportedRecord {
  return {
    id,
    tranche: "washroom",
    region: "fixture",
    fields: {
      name: field(name),
      lat: field(lat),
      lon: field(lon),
      ...extra,
    },
  };
}

export function trip(partial: Partial<TransitTrip> & Pick<TransitTrip, "id" | "stopTimes">): TransitTrip {
  return {
    agencyId: "fixture-agency",
    agencyName: "Fixture agency",
    routeId: partial.id,
    routeName: partial.id,
    mode: "bus",
    wheelchairAccessible: "UNKNOWN",
    provenance: provenance({ tier: 1, sourceId: "gtfs-fixture" }),
    ...partial,
  };
}

export function elevator(partial: Partial<ElevatorAsset> & Pick<ElevatorAsset, "id" | "stopId">): ElevatorAsset {
  return {
    name: partial.id,
    networkId: "fixture-network",
    operatorName: "Fixture operator",
    helpPhone: null,
    alternateStepFree: false,
    status: null,
    provenance: provenance({ tier: 4, sourceId: "elevator-fixture" }),
    ...partial,
  };
}

export function source(partial: Partial<JourneyDataSource> = {}): JourneyDataSource {
  return {
    stops: [],
    paths: [],
    venues: [],
    washrooms: [],
    ...partial,
  };
}

/** June morning, outside the November–April winter window. */
export const SUMMER_NOW = "2026-06-15T07:00:00-04:00";
export const SUMMER_DEPART = "2026-06-15T08:00:00-04:00";
export const WINTER_NOW = "2026-01-18T07:00:00-05:00";
export const WINTER_DEPART = "2026-01-18T08:00:00-05:00";
