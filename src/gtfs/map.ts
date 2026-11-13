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

export function mapWheelchairBoarding(raw: string | undefined, ctx: Provenance): FieldValue {
  const token = (raw ?? "").trim();
  if (token === "" || token === "0") {
    return unknownField(ctx, { source_key: "wheelchair_boarding", raw: token });
  }
  if (token === "1") {
    return fv("some_vehicles_accessible", ctx, { source_key: "wheelchair_boarding", raw: token });
  }
  if (token === "2") {
    return fv("boarding_not_possible", ctx, { source_key: "wheelchair_boarding", raw: token });
  }
  return fv(token, ctx, { source_key: "wheelchair_boarding", raw: token });
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
): DataRecord | null {
  const stopId = (row.stop_id ?? "").trim();
  if (!stopId) return null;
  const lat = parseCoord(row.stop_lat, 90);
  const lon = parseCoord(row.stop_lon, 180);
  const levelId = (row.level_id ?? "").trim();
  const level = levelId ? levels.get(levelId) : undefined;
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
      wheelchair_boarding: mapWheelchairBoarding(row.wheelchair_boarding, ctx),
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
