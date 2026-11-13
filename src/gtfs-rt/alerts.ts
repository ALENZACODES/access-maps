import { ProtoNode, parseTextProto } from "./textproto.js";

export const EQUIPMENT = ["elevator", "escalator", "elevator_and_escalator", "UNKNOWN"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export interface ActivePeriod {
  start?: number;
  end?: number;
}

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
  active_periods: ActivePeriod[];
  cause: string;
}

export interface AlertContext {
  source_id: string;
  licence: string;
  retrieved_at: string;
}

/**
 * Elevator or escalator when the header names that equipment.
 * English: elevator, escalator. French: ascenseur, escalier mécanique.
 * Accents are ignored, so "mecanique" matches "mécanique".
 * "hors service" is the out-of-service phrase. It does not name equipment by itself.
 */
export function equipmentClass(header: string): Equipment {
  const text = header.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const elevator = /\b(?:elevators?|ascenseurs?)\b/.test(text);
  const escalator = /\b(?:escalators?|escaliers?[\s-]+mecaniques?)\b/.test(text);
  if (elevator && escalator) return "elevator_and_escalator";
  if (elevator) return "elevator";
  if (escalator) return "escalator";
  return "UNKNOWN";
}

export function parseAccessibilityAlerts(text: string, ctx: AlertContext): ServiceAlert[] {
  const root = parseTextProto(text);
  const header = root.node("header");
  const timestamp = header?.scalar("timestamp");
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new Error("GTFS-RT header has no numeric timestamp");
  }
  const seen = new Set<string>();
  const alerts: ServiceAlert[] = [];
  for (const entity of root.nodes("entity")) {
    const entityId = scalarString(entity, "id");
    if (!entityId) throw new Error("GTFS-RT entity has no id");
    const alert = entity.node("alert");
    if (!alert) continue;
    let id = `${ctx.source_id}:${entityId}`;
    if (seen.has(id)) {
      let suffix = 2;
      while (seen.has(`${id}#${suffix}`)) suffix += 1;
      id = `${id}#${suffix}`;
    }
    seen.add(id);
    const translation = alert.node("header_text")?.node("translation");
    const headerText = translation ? scalarString(translation, "text") : "";
    const language = translation ? scalarString(translation, "language") : "";
    const stopIds: string[] = [];
    const routeIds: string[] = [];
    for (const informed of alert.nodes("informed_entity")) {
      const stopId = scalarString(informed, "stop_id");
      const routeId = scalarString(informed, "route_id");
      if (stopId) stopIds.push(stopId);
      if (routeId) routeIds.push(routeId);
    }
    const periods: ActivePeriod[] = [];
    for (const period of alert.nodes("active_period")) {
      const start = period.scalar("start");
      const end = period.scalar("end");
      const item: ActivePeriod = {};
      if (typeof start === "number") item.start = start;
      if (typeof end === "number") item.end = end;
      periods.push(item);
    }
    const cause = scalarString(alert, "cause");
    alerts.push({
      id,
      source_id: ctx.source_id,
      licence: ctx.licence,
      retrieved_at: ctx.retrieved_at,
      tier: 4,
      feed_timestamp: timestamp,
      entity_id: entityId,
      effect: scalarString(alert, "effect") || "UNKNOWN",
      equipment: equipmentClass(headerText),
      header_text: headerText || "UNKNOWN",
      header_language: language || "UNKNOWN",
      stop_ids: stopIds,
      route_ids: routeIds,
      active_periods: periods,
      cause: cause || "UNKNOWN",
    });
  }
  return alerts;
}

export interface AlertSummary {
  records: number;
  elevator: number;
  escalator: number;
  elevator_and_escalator: number;
  unknown_equipment: number;
  by_retrieved_at: Record<string, number>;
}

export function summarizeAlerts(alerts: ServiceAlert[]): AlertSummary {
  const summary: AlertSummary = {
    records: alerts.length,
    elevator: 0,
    escalator: 0,
    elevator_and_escalator: 0,
    unknown_equipment: 0,
    by_retrieved_at: {},
  };
  for (const alert of alerts) {
    if (alert.equipment === "elevator") summary.elevator += 1;
    else if (alert.equipment === "escalator") summary.escalator += 1;
    else if (alert.equipment === "elevator_and_escalator") summary.elevator_and_escalator += 1;
    else summary.unknown_equipment += 1;
    summary.by_retrieved_at[alert.retrieved_at] = (summary.by_retrieved_at[alert.retrieved_at] ?? 0) + 1;
  }
  return summary;
}

function scalarString(node: ProtoNode, key: string): string {
  const value = node.scalar(key);
  if (value === undefined) return "";
  return String(value).trim();
}
