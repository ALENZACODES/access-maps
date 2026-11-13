import { buildRecord, coordinateField, regionFromPoint, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";

export interface LevelInfo {
  level_index: string;
  level_name: string;
}

const LOCATION_TYPES: Record<string, string> = {
  "0": "stop",
  "1": "station",
  "2": "entrance_exit",
  "3": "generic_node",
  "4": "boarding_area",
};

const PATHWAY_MODES: Record<string, string> = {
  "1": "walkway",
  "2": "stairs",
  "3": "moving_sidewalk",
  "4": "escalator",
  "5": "elevator",
  "6": "fare_gate",
  "7": "exit_gate",
};

export function mapLocationType(raw: string | undefined, ctx: Provenance): FieldValue {
  const token = (raw ?? "").trim();
  if (token === "") return fv("stop", ctx, { source_key: "location_type", raw: "" });
  const named = LOCATION_TYPES[token];
  if (named) return fv(named, ctx, { source_key: "location_type", raw: token });
  return fv(token, ctx, { source_key: "location_type", raw: token });
}

export interface WheelchairStop {
  wheelchair_boarding: string;
  location_type: string;
  parent_station: string;
}

/**
 * GTFS wheelchair_boarding depends on location_type and parent_station.
 * Parentless stops and stations: 0 or empty is no information.
 * Child stops and boarding areas: 0 or empty inherits the parent; 1 and 2 describe the path from the station.
 * Entrances (location_type 2): 0 or empty inherits the parent; 1 and 2 describe the entrance, not vehicle boarding.
 * An inherited value is marked derived so it is not counted again as the parent's fact.
 */
/** Parentless stop: 0 or empty stays UNKNOWN. Child stops and entrances use resolveWheelchairBoarding. */
export function mapWheelchairBoarding(raw: string | undefined, ctx: Provenance): FieldValue {
  return resolveWheelchairBoarding(
    "stop",
    new Map([["stop", { wheelchair_boarding: raw ?? "", location_type: "", parent_station: "" }]]),
    ctx,
  );
}

export function resolveWheelchairBoarding(
  stopId: string,
  stops: ReadonlyMap<string, WheelchairStop>,
  ctx: Provenance,
): FieldValue {
  return walkWheelchair(stopId, stops, ctx, new Set(), false, "");
}

function walkWheelchair(
  stopId: string,
  stops: ReadonlyMap<string, WheelchairStop>,
  ctx: Provenance,
  seen: Set<string>,
  inherited: boolean,
  childRaw: string,
): FieldValue {
  if (seen.has(stopId) || seen.size > 6) {
    return unknownField(ctx, { source_key: "wheelchair_boarding", raw: childRaw });
  }
  const row = stops.get(stopId);
  if (!row) return unknownField(ctx, { source_key: "wheelchair_boarding", raw: childRaw });
  seen.add(stopId);
  const code = row.wheelchair_boarding.trim();
  const parent = row.parent_station.trim();
  const role = wheelchairRole(row.location_type, parent !== "");
  const noInformation = code === "" || code === "0";
  if (noInformation && (role === "child_stop" || role === "entrance") && parent) {
    return walkWheelchair(parent, stops, ctx, seen, true, inherited ? childRaw : code);
  }
  const own = mapOwnWheelchair(role, code, ctx);
  if (!inherited) return own;
  if (own.value === "UNKNOWN") return unknownField(ctx, { source_key: "wheelchair_boarding", raw: childRaw });
  return { ...own, derived: true, raw: childRaw, source_key: "wheelchair_boarding" };
}

function wheelchairRole(locationType: string, hasParent: boolean): "station" | "entrance" | "child_stop" | "parentless_stop" {
  const token = locationType.trim();
  if (token === "2") return "entrance";
  if (token === "1") return "station";
  return hasParent ? "child_stop" : "parentless_stop";
}

function mapOwnWheelchair(
  role: "station" | "entrance" | "child_stop" | "parentless_stop",
  code: string,
  ctx: Provenance,
): FieldValue {
  if (code === "" || code === "0") {
    return unknownField(ctx, { source_key: "wheelchair_boarding", raw: code });
  }
  if (role === "entrance") {
    if (code === "1") return fv("entrance_accessible", ctx, { source_key: "wheelchair_boarding", raw: code });
    if (code === "2") return fv("entrance_not_accessible", ctx, { source_key: "wheelchair_boarding", raw: code });
  } else if (role === "child_stop") {
    if (code === "1") return fv("accessible_path", ctx, { source_key: "wheelchair_boarding", raw: code });
    if (code === "2") return fv("no_accessible_path", ctx, { source_key: "wheelchair_boarding", raw: code });
  } else if (code === "1") {
    return fv("some_vehicles_accessible", ctx, { source_key: "wheelchair_boarding", raw: code });
  } else if (code === "2") {
    return fv("boarding_not_possible", ctx, { source_key: "wheelchair_boarding", raw: code });
  }
  return fv(code, ctx, { source_key: "wheelchair_boarding", raw: code });
}

export function wheelchairStopsFromRows(rows: Record<string, string>[]): Map<string, WheelchairStop> {
  const stops = new Map<string, WheelchairStop>();
  for (const row of rows) {
    const id = (row.stop_id ?? "").trim();
    if (!id) continue;
    stops.set(id, {
      wheelchair_boarding: row.wheelchair_boarding ?? "",
      location_type: row.location_type ?? "",
      parent_station: row.parent_station ?? "",
    });
  }
  return stops;
}

export function mapBidirectional(raw: string | undefined, ctx: Provenance): FieldValue {
  const token = (raw ?? "").trim();
  if (token === "" || token === "1") return fv("yes", ctx, { source_key: "is_bidirectional", raw: token });
  if (token === "0") return fv("no", ctx, { source_key: "is_bidirectional", raw: token });
  return fv(token, ctx, { source_key: "is_bidirectional", raw: token });
}

export function mapGtfsStop(
  row: Record<string, string>,
  levels: ReadonlyMap<string, LevelInfo>,
  ctx: Provenance,
  sourceId: string,
  wheelchairStops?: ReadonlyMap<string, WheelchairStop>,
): DataRecord | null {
  const stopId = (row.stop_id ?? "").trim();
  if (!stopId) return null;
  const lat = parseCoord(row.stop_lat, 90);
  const lon = parseCoord(row.stop_lon, 180);
  const levelId = (row.level_id ?? "").trim();
  const level = levelId ? levels.get(levelId) : undefined;
  const feed = wheelchairStops ?? wheelchairStopsFromRows([row]);
  return buildRecord(
    "transit",
    `gtfs:${sourceId}:${stopId}`,
    regionFromPoint(lat, lon),
    {
      name: textCell(row, "stop_name", ctx),
      lat: coordinateField(lat, ctx, "stop_lat"),
      lon: coordinateField(lon, ctx, "stop_lon"),
      stop_code: textCell(row, "stop_code", ctx),
      location_type: mapLocationType(row.location_type, ctx),
      parent_station: textCell(row, "parent_station", ctx),
      wheelchair_boarding: resolveWheelchairBoarding(stopId, feed, ctx),
      platform_code: textCell(row, "platform_code", ctx),
      level_id: levelId ? fv(levelId, ctx, { source_key: "level_id" }) : unknownField(ctx, { source_key: "level_id" }),
      level_index: level ? numericCell(level.level_index, ctx, "level_index") : unknownField(ctx),
      level_name: level ? textRaw(level.level_name, ctx, "level_name") : unknownField(ctx),
      description: textCell(row, "stop_desc", ctx),
      url: textCell(row, "stop_url", ctx),
    },
    ctx,
  );
}

export function mapGtfsPathway(row: Record<string, string>, ctx: Provenance, sourceId: string): DataRecord | null {
  const pathwayId = (row.pathway_id ?? "").trim();
  if (!pathwayId) return null;
  const modeToken = (row.pathway_mode ?? "").trim();
  const mode = PATHWAY_MODES[modeToken];
  return buildRecord(
    "path",
    `gtfs:${sourceId}:pathway:${pathwayId}`,
    "unknown",
    {
      kind: fv("gtfs_pathway", ctx, { source_key: "pathway_id" }),
      pathway_mode: mode
        ? fv(mode, ctx, { source_key: "pathway_mode", raw: modeToken })
        : modeToken
          ? fv(modeToken, ctx, { source_key: "pathway_mode", raw: modeToken })
          : unknownField(ctx, { source_key: "pathway_mode" }),
      bidirectional: mapBidirectional(row.is_bidirectional, ctx),
      length_m: numericCell(row.length, ctx, "length"),
      traversal_time_s: numericCell(row.traversal_time, ctx, "traversal_time"),
      stair_count: numericCell(row.stair_count, ctx, "stair_count"),
      max_slope: numericCell(row.max_slope, ctx, "max_slope"),
      min_width: numericCell(row.min_width, ctx, "min_width"),
      signposted_as: textCell(row, "signposted_as", ctx),
      reversed_signposted_as: textCell(row, "reversed_signposted_as", ctx),
      from_ref: textCell(row, "from_stop_id", ctx),
      to_ref: textCell(row, "to_stop_id", ctx),
    },
    ctx,
  );
}

export function indexLevels(rows: Record<string, string>[]): Map<string, LevelInfo> {
  const levels = new Map<string, LevelInfo>();
  for (const row of rows) {
    const id = (row.level_id ?? "").trim();
    if (!id) continue;
    levels.set(id, {
      level_index: row.level_index ?? "",
      level_name: row.level_name ?? "",
    });
  }
  return levels;
}

function textCell(row: Record<string, string>, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  return textRaw(row[key] ?? "", ctx, key);
}

function textRaw(raw: string, ctx: Provenance, sourceKey: string): FieldValue {
  const trimmed = raw.trim();
  if (trimmed === "") return unknownField(ctx, { source_key: sourceKey, raw: raw });
  return fv(trimmed, ctx, { source_key: sourceKey });
}

function numericCell(raw: string | undefined, ctx: Provenance, sourceKey: string): FieldValue {
  const token = (raw ?? "").trim();
  if (token === "") return unknownField(ctx, { source_key: sourceKey });
  if (/^-?\d+(\.\d+)?$/.test(token)) return fv(Number(token), ctx, { source_key: sourceKey, raw: token });
  return fv(token, ctx, { source_key: sourceKey, raw: token });
}

function parseCoord(raw: string | undefined, limit: number): number | null {
  const token = (raw ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(token)) return null;
  const value = Number(token);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}
