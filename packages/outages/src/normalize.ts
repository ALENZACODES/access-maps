import type { ActivePeriod, Equipment, OutageRecord } from "./types.js";

export const UNKNOWN = "UNKNOWN";

/**
 * Shape of one alert in schema/service-alert.schema.json (access-maps pull request 1,
 * pinned in access-main packages/schema/schema/import/service-alert.schema.json).
 */
export interface ServiceAlert {
  id: string;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: 4;
  feed_timestamp: number;
  entity_id: string;
  effect: string;
  equipment: Equipment;
  header_text: string;
  header_language: string;
  stop_ids: string[];
  route_ids: string[];
  active_periods: Array<{ start?: number; end?: number }>;
  cause: string;
}

const REQUIRED = [
  "id",
  "source_id",
  "licence",
  "retrieved_at",
  "tier",
  "feed_timestamp",
  "entity_id",
  "effect",
  "equipment",
  "header_text",
  "header_language",
  "stop_ids",
  "route_ids",
  "active_periods",
  "cause",
] as const;

const EQUIPMENT: readonly string[] = ["elevator", "escalator", "elevator_and_escalator", "UNKNOWN"];

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Returns a reason when the value does not match the service-alert shape, otherwise null. */
export function checkAlert(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "not-an-object";
  const alert = value as Record<string, unknown>;
  for (const key of REQUIRED) {
    if (!(key in alert)) return `missing:${key}`;
  }
  const allowed = new Set<string>(REQUIRED);
  for (const key of Object.keys(alert)) {
    if (!allowed.has(key)) return `unexpected:${key}`;
  }
  for (const key of ["id", "source_id", "licence", "entity_id", "effect", "header_text", "header_language", "cause"]) {
    if (!nonEmpty(alert[key])) return `empty:${key}`;
  }
  if (typeof alert.retrieved_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(alert.retrieved_at)) return "invalid:retrieved_at";
  if (alert.tier !== 4) return "invalid:tier";
  if (!isUnixSeconds(alert.feed_timestamp)) return "invalid:feed_timestamp";
  if (!EQUIPMENT.includes(String(alert.equipment))) return "invalid:equipment";
  for (const key of ["stop_ids", "route_ids"]) {
    const list = alert[key];
    if (!Array.isArray(list) || !list.every(nonEmpty)) return `invalid:${key}`;
  }
  const periods = alert.active_periods;
  if (!Array.isArray(periods)) return "invalid:active_periods";
  for (const period of periods) {
    if (!period || typeof period !== "object" || Array.isArray(period)) return "invalid:active_periods";
    for (const [key, item] of Object.entries(period as Record<string, unknown>)) {
      if (key !== "start" && key !== "end") return "invalid:active_periods";
      if (!isUnixSeconds(item)) return "invalid:active_periods";
    }
  }
  return null;
}

function iso(seconds: number | undefined): string | null {
  if (seconds === undefined) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Text before the first colon. The operator writes "Station: Equipment ...". No colon means unknown. */
export function stationNameFrom(header: string): string {
  const index = header.indexOf(":");
  if (index <= 0) return UNKNOWN;
  const name = header.slice(0, index).trim();
  return name.length > 0 ? name : UNKNOWN;
}

/** "Elevator ELV02-B" gives ELV02-B. "Elevator out of service" gives null. */
export function assetLabelFrom(header: string): string | null {
  const match = /\b(?:Elevator|Escalator|Ascenseur|Escalier mécanique)\s+([A-Z0-9][A-Z0-9-]*)\b/.exec(header);
  const label = match?.[1];
  if (!label) return null;
  return /\d/.test(label) ? label : null;
}

/** Out of service only when the operator text says it. */
export function statusFrom(header: string): OutageRecord["status"] {
  return /\bout of service\b|\bhors service\b/i.test(header) ? "out_of_service" : UNKNOWN;
}

export function toOutageRecord(alert: ServiceAlert, networkId: string): OutageRecord {
  const periods: ActivePeriod[] = alert.active_periods.map((period) => ({
    start: iso(period.start),
    end: iso(period.end),
  }));
  return {
    id: alert.id,
    networkId,
    stationName: stationNameFrom(alert.header_text),
    stopIds: [...alert.stop_ids],
    equipment: alert.equipment,
    assetLabel: assetLabelFrom(alert.header_text),
    status: statusFrom(alert.header_text),
    reportedAt: new Date(alert.feed_timestamp * 1000).toISOString(),
    periods,
    effectNote: alert.header_text,
    effectLanguage: alert.header_language,
    provenance: {
      sourceId: alert.source_id,
      licence: alert.licence,
      retrievedAt: alert.retrieved_at,
      tier: 4,
    },
  };
}

export function normalizeAlerts(
  raw: readonly unknown[],
  networkId: string,
): { records: OutageRecord[]; rejected: Array<{ id: string; reason: string }> } {
  const records: OutageRecord[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const item of raw) {
    const reason = checkAlert(item);
    if (reason) {
      const id = item && typeof item === "object" && nonEmpty((item as { id?: unknown }).id) ? String((item as { id: string }).id) : UNKNOWN;
      rejected.push({ id, reason });
      continue;
    }
    records.push(toOutageRecord(item as ServiceAlert, networkId));
  }
  return { records, rejected };
}
