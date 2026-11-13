import type { Coord } from "./geo.js";
import type { ImportedRecord } from "./records.js";
import type { Provenance } from "./types.js";

/**
 * Everything the planner reads. Stops, paths, venues, and washrooms follow the open-data
 * record shape. Elevators, chargers, parking, paratransit, fares, and reports are not in
 * that import. They are optional overlays. Missing overlays stay unknown.
 *
 * This module does not open data/ and does not run the import pipelines.
 */
export interface TransitTrip {
  id: string;
  agencyId: string;
  agencyName: string;
  routeId: string;
  routeName: string;
  mode: "subway" | "rail" | "bus" | "streetcar";
  /** GTFS wheelchair_accessible: 0 and blank are unknown. */
  wheelchairAccessible: "0" | "1" | "2" | "UNKNOWN";
  stopTimes: Array<{ stopId: string; arrival: string; departure: string }>;
  provenance: Provenance;
}

export interface ElevatorObservation {
  state: "working" | "out" | "unknown";
  observedAt: string;
  source: "feed" | "page" | "user-report" | "none";
  provenance: Provenance;
  userReport?: {
    state: "working" | "out";
    observedAt: string;
    provenance: Provenance;
  };
}

export interface ElevatorAsset {
  id: string;
  name: string;
  stopId: string;
  networkId: string;
  operatorName: string;
  helpPhone: string | null;
  /** A different step-free way into the same platform, already checked. */
  alternateStepFree: boolean;
  status: ElevatorObservation | null;
  provenance: Provenance;
}

export interface StopAccessNote {
  stopId: string;
  /** Only "step-free" when the note itself carries the evidence in `evidence`. */
  status: "step-free" | "unknown" | "not-step-free";
  evidence: string;
  provenance: Provenance;
}

export interface WashroomDetail {
  washroomId: string;
  transferSide: "left" | "right" | "both" | null;
  turningDiameterMm: number | null;
  door: string | null;
  provenance: Provenance;
}

export interface ChargingPoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
  connector: string | null;
  hours: string | null;
  access: string | null;
  cost: string | null;
  provenance: Provenance;
}

export interface ParkingBay {
  id: string;
  name: string;
  lon: number;
  lat: number;
  venueId?: string;
  vanAccessible: boolean | null;
  widthMm: number | null;
  aisleMm: number | null;
  payment: "app-only" | "card" | "cash" | "attendant" | "unknown";
  reservationCutoff: string | null;
  reservationPhone: string | null;
  distanceToEntranceMetres: number | null;
  provenance: Provenance;
}

export interface ParatransitDirectoryEntry {
  id: string;
  name: string;
  region: string;
  phone: string | null;
  portalUrl: string | null;
  /** How many days ahead a request can be made. Null when the page was not read. */
  bookingWindowDays: number | null;
  guarantee: "no-guarantee" | "unknown";
  pickupWindowMinutes: number | null;
  /** Published or scenario shared-ride duration. Not a prediction the App invents. */
  sharedRideMinutes: number | null;
  driverWaitMinutes: number | null;
  noShowPolicy: string | null;
  unscheduledStops: "not-permitted" | "unknown";
  /** Lead time before a fixed-route connection, when the operator publishes one. */
  connectionLeadMinutes: number | null;
  weatherStatus: {
    state: "cancelled" | "delayed" | "unknown";
    summary: string;
    url: string | null;
    provenance: Provenance;
  } | null;
  provenance: Provenance;
}

export interface BarrierReport {
  id: string;
  pathId?: string;
  stopId?: string;
  kind: "snow" | "construction" | "closure";
  blocksPassage: boolean;
  observedAt: string;
  provenance: Provenance;
}

export interface SeasonalNote {
  pathId: string;
  winterChecked: boolean;
  provenance: Provenance;
}

export interface FareRule {
  id: string;
  agencyId: string;
  agencyName: string;
  supportPerson: "free" | "fare" | "free-with-card" | "seat-reservation" | "unknown";
  card: string | null;
  proof: string | null;
  provenance: Provenance;
}

export interface IntercityService {
  id: string;
  name: string;
  agencyId: string;
  fromName: string;
  toName: string;
  from: Coord;
  to: Coord;
  departure: string;
  arrival: string;
  assistance: {
    minimumNoticeHours: number;
    phone: string;
    earlyArrivalMinutes: number;
    boarding: "staff-lift" | "unknown";
  } | null;
  provenance: Provenance;
}

export interface RidehailSupplyNote {
  id: string;
  region: string;
  /** Copied from the catalog. The planner does not invent a supply claim. */
  summary: string;
  taxis: Array<{
    name: string;
    phone: string | null;
    leadTimeNote: string | null;
    provenance: Provenance;
  }>;
  provenance: Provenance;
}

export interface TransferPoint {
  id: string;
  name: string;
  fromRegion: string;
  toRegion: string;
  shelter: "yes" | "no" | "unknown";
  washroom: "yes" | "no" | "unknown";
  stepFree: "yes" | "no" | "unknown";
  provenance: Provenance;
}

export interface JourneyDataSource {
  stops: ImportedRecord[];
  paths: ImportedRecord[];
  venues: ImportedRecord[];
  washrooms: ImportedRecord[];
  /** Measurements that are not in the open-data washroom schema. Absent means unknown, not usable. */
  washroomDetails?: WashroomDetail[];
  trips?: TransitTrip[];
  elevators?: ElevatorAsset[];
  stopAccess?: StopAccessNote[];
  chargers?: ChargingPoint[];
  parking?: ParkingBay[];
  paratransit?: ParatransitDirectoryEntry[];
  barriers?: BarrierReport[];
  seasonal?: SeasonalNote[];
  fares?: FareRule[];
  intercity?: IntercityService[];
  ridehail?: RidehailSupplyNote[];
  transfers?: TransferPoint[];
}

export function emptySource(): JourneyDataSource {
  return { stops: [], paths: [], venues: [], washrooms: [] };
}
