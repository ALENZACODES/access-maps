import type { OutageRecord, OutageSnapshot, OutageState } from "./types.js";

/**
 * TTC alerts have no expires_at field (access-main packages/schema/TIERS.md). When a period has an end,
 * that end is the expiry. When no period has an end, the record leaves the current view after the
 * 30-day status snapshot window counted from the feed time.
 */
export const STATUS_SNAPSHOT_DAYS = 30;

function ms(iso: string | null): number | null {
  if (iso === null) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

/** The end time that takes this record out of the current view, or null when the operator gave none. */
export function expiresAt(record: OutageRecord): string | null {
  const ends = record.periods.map((period) => period.end).filter((end): end is string => end !== null);
  if (ends.length === 0) return null;
  return ends.sort()[ends.length - 1] ?? null;
}

export function outageState(record: OutageRecord, nowIso: string): OutageState {
  const now = ms(nowIso);
  if (now === null) throw new Error(`Invalid clock: ${nowIso}`);
  const reported = ms(record.reportedAt);
  const periods = record.periods.length > 0 ? record.periods : [{ start: null, end: null }];
  let planned = false;
  for (const period of periods) {
    const start = ms(period.start);
    const end = ms(period.end);
    if (start !== null && now < start) {
      planned = true;
      continue;
    }
    if (end !== null && now >= end) continue;
    if (end === null && reported !== null && now - reported > STATUS_SNAPSHOT_DAYS * 86_400_000) return "stale";
    return "current";
  }
  return planned ? "planned" : "expired";
}

export function currentOutages(snapshot: OutageSnapshot, nowIso: string): OutageRecord[] {
  return snapshot.records.filter((record) => outageState(record, nowIso) === "current");
}

export interface StationQuery {
  /** GTFS stop ids for the station's platforms and entrances. */
  stopIds: string[];
  networkId: string;
}

export interface StationStatus {
  /**
   * outage-reported: the source lists a current outage at one of these stops.
   * no-outage-reported: the source covers this network and lists none. That is not a check that the elevator works.
   * unknown: the source does not cover this network, or no stop id was given.
   */
  state: "outage-reported" | "no-outage-reported" | "unknown";
  current: OutageRecord[];
  /** Expired or planned records for the same stops, kept so the person can see what is not counted. */
  notCurrent: Array<{ record: OutageRecord; state: Exclude<OutageState, "current"> }>;
  sourceId: string;
  licence: string;
  asOf: string;
  origin: OutageSnapshot["origin"];
  mayBeOutOfDate: boolean;
  demonstration: boolean;
}

export function stationStatus(snapshot: OutageSnapshot, station: StationQuery, nowIso: string): StationStatus {
  const base = {
    sourceId: snapshot.sourceId,
    licence: snapshot.licence,
    asOf: snapshot.asOf,
    origin: snapshot.origin,
    mayBeOutOfDate: snapshot.mayBeOutOfDate,
    demonstration: snapshot.demonstration,
  };
  if (station.networkId !== snapshot.networkId || station.stopIds.length === 0) {
    return { ...base, state: "unknown", current: [], notCurrent: [] };
  }
  const wanted = new Set(station.stopIds);
  const matching = snapshot.records.filter((record) => record.stopIds.some((id) => wanted.has(id)));
  const current: OutageRecord[] = [];
  const notCurrent: StationStatus["notCurrent"] = [];
  for (const record of matching) {
    const state = outageState(record, nowIso);
    if (state === "current") current.push(record);
    else notCurrent.push({ record, state });
  }
  return { ...base, state: current.length > 0 ? "outage-reported" : "no-outage-reported", current, notCurrent };
}

/** Elevator outages decide step-free status. Escalators are not a step-free path and only inform. */
export function blocksStepFree(record: OutageRecord): boolean {
  return (
    record.status === "out_of_service" &&
    (record.equipment === "elevator" || record.equipment === "elevator_and_escalator")
  );
}
