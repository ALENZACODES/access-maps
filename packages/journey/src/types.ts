import type { Coord } from "./geo.js";

/**
 * Three-valued step-free status.
 * The missing case is `unknown`. Nothing in this package may default a leg to `step-free`.
 */
export type StepFreeStatus = "step-free" | "unknown" | "not-step-free";

export type VerificationTier = 0 | 1 | 2 | 3 | 4;

export interface Provenance {
  sourceId: string;
  licence: string;
  /** ISO date (YYYY-MM-DD) or full timestamp for a status observation. */
  retrievedAt: string;
  tier: VerificationTier;
  note?: string;
}

export interface StepFreeAssessment {
  status: StepFreeStatus;
  /** True only for a tier-3 survey. Open data and operator flags never set this. */
  appVerified: boolean;
  tier: VerificationTier | null;
  /** Stable reason codes. User-facing sentences are built from these. */
  reasons: string[];
  /** Evidence the status actually used. Empty when status is step-free is a bug. */
  evidence: string[];
}

export type LegMode =
  | "home-exit"
  | "roll"
  | "approach"
  | "station-access"
  | "transit"
  | "entrance"
  | "interior"
  | "washroom"
  | "activity"
  | "parking"
  | "paratransit-info"
  | "intercity"
  | "handoff"
  | "charging";

export type ChainLegId =
  | "origin"
  | "booking"
  | "ride"
  | "approach"
  | "entrance"
  | "interior"
  | "washroom"
  | "activity"
  | "return";

export type DistanceKind = "route" | "straight-line" | "unknown";

export interface Warning {
  code: string;
  /** Shown before the person commits to the journey. */
  beforeCommit: boolean;
  text: string;
  phones: string[];
}

export interface ScheduledTiming {
  kind: "scheduled";
  departure: string | null;
  arrival: string | null;
  /** Localised label. Always the scheduled-time label, never a current-position claim. */
  label: string;
}

export interface Leg {
  id: string;
  chainLeg: ChainLegId;
  mode: LegMode;
  title: string;
  fromName: string;
  toName: string;
  from: Coord;
  to: Coord;
  stepFree: StepFreeAssessment;
  distanceMetres: number | null;
  distanceKind: DistanceKind;
  surface: string;
  gradient: string;
  timing: ScheduledTiming | null;
  provenance: Provenance;
  note: string;
  warnings: Warning[];
  singlePointOfFailure: boolean;
  /** Operator links. Present on information legs. Never a confirmation. */
  links: Array<{ label: string; href: string | null; phone: string | null }>;
  agencyId: string | null;
  transitMode: "subway" | "rail" | "bus" | "streetcar" | "paratransit" | "intercity" | null;
}

export interface ChainSlot {
  id: ChainLegId;
  state: "described" | "unknown" | "failed";
  text: string;
}

export interface ChainReport {
  slots: ChainSlot[];
  describedCount: number;
  weakest: { id: ChainLegId; text: string };
  fare: { state: "described" | "unknown" | "failed"; text: string };
  timing: { state: "described" | "unknown" | "failed"; text: string };
}

export interface DestinationDepth {
  entrance: {
    text: string;
    stepCount: string;
    ramp: string;
    doorWidth: string;
    provenance: Provenance;
  };
  washroom: {
    text: string;
    usable: boolean;
    transferSide: string;
    adultChangeTable: string;
    access: string;
    provenance: Provenance | null;
  };
  parking: {
    text: string;
    provenance: Provenance | null;
  };
}

export interface FareLine {
  legId: string;
  agencyName: string;
  text: string;
  card: string | null;
  supportPerson: string;
}

export interface Journey {
  id: string;
  summary: string;
  legs: Leg[];
  explanation: string;
  weakestLink: { legId: string; text: string };
  chain: ChainReport;
  /** True only when every outbound leg is step-free on evidence. */
  presentedAsStepFree: boolean;
  /** True only when outbound and return are both fully step-free on evidence. */
  roundTripStepFree: boolean;
  depth: DestinationDepth;
  returnJourney: {
    legs: Leg[];
    explanation: string;
    depth: DestinationDepth;
    presentedAsStepFree: boolean;
  };
  warnings: Warning[];
  fareSummary: FareLine[];
  preference: RoutingPreference;
}

export type RoutingPreference =
  | "fewest-transfers"
  | "shortest-distance"
  | "lowest-slope"
  | "washroom-aware"
  | "charging-aware";

export type Locale = "en" | "fr";

export interface EquipmentProfile {
  name: string;
  chair: "power" | "manual" | "scooter" | "none";
  transferSide: "left" | "right" | "either" | null;
  maxGradePercent: number | null;
  maxDistanceMetres: number | null;
  maxMinutesBetweenWashrooms: number | null;
  maxTravelMinutes: number | null;
  widthMm: number | null;
  needsSupportPerson: boolean;
  cardsHeld: string[];
  /** Paratransit directory ids the person is registered with. */
  registrations: string[];
  hasSmartphone: boolean;
}

export interface Endpoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
  venueId?: string;
}

export interface JourneyPlan {
  id: string;
  locale: Locale;
  departAt: string;
  now: string;
  preference: RoutingPreference;
  stepFreeRequired: boolean;
  winterMode: boolean;
  journeys: Journey[];
  /** Routes kept visible because they contain a recorded barrier. */
  blocked: Journey[];
  warnings: Warning[];
  systemEvent: null | { text: string; phones: string[] };
  noGo: null | { text: string; phones: string[] };
  supplyNotes: Warning[];
  offline: null | { asOf: string; banner: string };
  emergency: { phone: "911"; text: string };
}

export const DEFAULT_PROFILE: EquipmentProfile = {
  name: "profile",
  chair: "power",
  transferSide: null,
  maxGradePercent: null,
  maxDistanceMetres: null,
  maxMinutesBetweenWashrooms: null,
  maxTravelMinutes: null,
  widthMm: null,
  needsSupportPerson: false,
  cardsHeld: [],
  registrations: [],
  hasSmartphone: true,
};
