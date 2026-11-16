/**
 * Outage records for elevators and escalators.
 *
 * A record copies what the operator published. Nothing here is a guess:
 * a missing station name, asset label, or end time stays UNKNOWN or null.
 * A station that the source does not cover is unknown, never "no outage".
 */
export type Equipment = "elevator" | "escalator" | "elevator_and_escalator" | "UNKNOWN";

export type OutageOrigin = "feed" | "last-known" | "manual-seed";

export interface ActivePeriod {
  /** ISO time, or null when the operator gave no start. */
  start: string | null;
  /** ISO time, or null when the operator gave no end. */
  end: string | null;
}

export interface OutageProvenance {
  sourceId: string;
  licence: string;
  /** Date the snapshot was retrieved (YYYY-MM-DD). */
  retrievedAt: string;
  /** Operator status feeds are tier 4. They are not checks by the App. */
  tier: 4;
}

export interface OutageRecord {
  id: string;
  /** Network the source covers, for example "ttc". */
  networkId: string;
  /** Station name as written before the first colon of the operator text, or UNKNOWN. */
  stationName: string;
  /** GTFS stop ids exactly as the operator listed them. */
  stopIds: string[];
  equipment: Equipment;
  /** Asset label such as "ELV02-B" when the operator text names one. */
  assetLabel: string | null;
  /** "out_of_service" only when the operator text says so. */
  status: "out_of_service" | "UNKNOWN";
  /** Operator feed time (ISO). */
  reportedAt: string;
  periods: ActivePeriod[];
  /** Operator text, copied. */
  effectNote: string;
  effectLanguage: string;
  provenance: OutageProvenance;
}

export type OutageState = "current" | "planned" | "expired" | "stale";

export interface OutageSnapshot {
  origin: OutageOrigin;
  /** ISO time the snapshot was taken (feed time when available). */
  asOf: string;
  networkId: string;
  sourceId: string;
  licence: string;
  records: OutageRecord[];
  /** Alerts that failed the shape check, by id when there is one. */
  rejected: Array<{ id: string; reason: string }>;
  /** True for last-known and manual-seed snapshots. */
  mayBeOutOfDate: boolean;
  /** True when the records are a dated demonstration seed, not a fresh feed read. */
  demonstration: boolean;
  /** Why the feed was not used, when it was not. */
  feedError: string | null;
}

export type Locale = "en" | "fr";
