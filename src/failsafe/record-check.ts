import type { ValidateFunction } from "ajv";
import { regionId, TRANCHES, type Tranche } from "../model/records.js";

/**
 * A generous box around Ontario. It is not a boundary: it only catches values
 * that cannot be an Ontario location, such as swapped latitude and longitude,
 * projected metres, or a missing decimal point. Every committed record on
 * 2026-11-16 sat inside latitude 41.44..55.99 and longitude -95.30..-74.15.
 */
export const ONTARIO_ENVELOPE = { minLat: 41, maxLat: 57.5, minLon: -96, maxLon: -73.5 } as const;

export type RecordFaultCode =
  | "not_object"
  | "bad_id"
  | "unknown_tranche"
  | "bad_region"
  | "schema"
  | "missing_provenance"
  | "provenance_mismatch"
  | "non_finite"
  | "coordinate_range"
  | "region_mismatch"
  | "duplicate_id"
  | "parse_error";

export type RecordCheck = { ok: true } | { ok: false; code: RecordFaultCode; reason: string };

export interface RecordCheckOptions {
  /** When given, every field must carry this source_id. */
  sourceId?: string;
  /** Ajv validators by tranche. Omit to run only the structural and semantic checks. */
  validators?: Partial<Record<Tranche, ValidateFunction>>;
  /** Tranche the caller expects, for example the tranche of a pack partition. */
  tranche?: Tranche;
  /** Region the caller expects, for example the cell of a pack partition. */
  region?: string;
}

const LAT_KEYS = ["lat", "latitude", "stop_lat"] as const;
const LON_KEYS = ["lon", "longitude", "stop_lon"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(code: RecordFaultCode, reason: string): RecordCheck {
  return { ok: false, code, reason };
}

/** Finds NaN or Infinity anywhere in a value. JSON cannot carry them, so they would turn into null on write. */
function nonFinitePath(value: unknown, at: string): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? null : at;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = nonFinitePath(item, `${at}/${index}`);
      if (found) return found;
    }
    return null;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const found = nonFinitePath(item, `${at}/${key}`);
      if (found) return found;
    }
  }
  return null;
}

function numberField(fields: Record<string, unknown>, keys: readonly string[]): { key: string; value: unknown } | null {
  for (const key of keys) {
    const field = fields[key];
    if (isObject(field) && field.value !== "UNKNOWN" && field.value !== undefined) return { key, value: field.value };
  }
  return null;
}

function inEnvelope(lat: number, lon: number): boolean {
  return lat >= ONTARIO_ENVELOPE.minLat && lat <= ONTARIO_ENVELOPE.maxLat
    && lon >= ONTARIO_ENVELOPE.minLon && lon <= ONTARIO_ENVELOPE.maxLon;
}

/** Region ids are cut from the unrounded point, and stored coordinates are rounded to 1e-6, so allow that much. */
function regionMatches(region: string, lat: number, lon: number): boolean {
  for (const dLat of [0, -1e-6, 1e-6]) {
    for (const dLon of [0, -1e-6, 1e-6]) {
      if (regionId(lat + dLat, lon + dLon) === region) return true;
    }
  }
  return false;
}

/**
 * Checks one record before it is written or packed. A failed check names one
 * reason. The caller quarantines the record; it never stops other records.
 */
export function checkRecord(value: unknown, options: RecordCheckOptions = {}): RecordCheck {
  if (!isObject(value)) return fail("not_object", "record is not an object");
  const { id, tranche, region, fields } = value;
  if (typeof id !== "string" || id.trim() === "") return fail("bad_id", "record id is missing or empty");
  if (typeof tranche !== "string" || !(TRANCHES as readonly string[]).includes(tranche)) {
    return fail("unknown_tranche", `tranche ${JSON.stringify(tranche)} is not one of ${TRANCHES.join(", ")}`);
  }
  if (options.tranche && tranche !== options.tranche) {
    return fail("unknown_tranche", `tranche ${tranche} does not match partition tranche ${options.tranche}`);
  }
  if (typeof region !== "string" || region.trim() === "") return fail("bad_region", "region is missing or empty");
  if (options.region && region !== options.region) {
    return fail("bad_region", `region ${region} does not match partition cell ${options.region}`);
  }
  if (!isObject(fields) || Object.keys(fields).length === 0) return fail("missing_provenance", "record has no fields");
  const nonFinite = nonFinitePath(value, "");
  if (nonFinite) return fail("non_finite", `${nonFinite} is NaN or Infinity`);
  for (const [name, field] of Object.entries(fields)) {
    if (!isObject(field)) return fail("missing_provenance", `/fields/${name} is not a field object`);
    if (!("value" in field)) return fail("missing_provenance", `/fields/${name} has no value`);
    for (const key of ["source_id", "licence"] as const) {
      if (typeof field[key] !== "string" || (field[key] as string).trim() === "") {
        return fail("missing_provenance", `/fields/${name}/${key} is missing or empty`);
      }
    }
    if (typeof field.retrieved_at !== "string" || !DATE.test(field.retrieved_at.slice(0, 10))) {
      return fail("missing_provenance", `/fields/${name}/retrieved_at is not a date`);
    }
    if (!Number.isInteger(field.tier) || (field.tier as number) < 0 || (field.tier as number) > 4) {
      return fail("missing_provenance", `/fields/${name}/tier ${JSON.stringify(field.tier)} is not 0 to 4`);
    }
    if (options.sourceId && field.source_id !== options.sourceId) {
      return fail("provenance_mismatch", `/fields/${name}/source_id ${String(field.source_id)} is not ${options.sourceId}`);
    }
  }
  const validate = options.validators?.[tranche as Tranche];
  if (validate && validate(value) !== true) {
    const detail = (validate.errors ?? []).slice(0, 5).map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`).join("; ");
    return fail("schema", detail || "schema validation failed");
  }
  const lat = numberField(fields, LAT_KEYS);
  const lon = numberField(fields, LON_KEYS);
  for (const item of [lat, lon]) {
    if (item && typeof item.value !== "number") {
      return fail("coordinate_range", `/fields/${item.key}/value ${JSON.stringify(item.value)} is not a number`);
    }
  }
  if (lat && lon) {
    const la = lat.value as number;
    const lo = lon.value as number;
    if (!inEnvelope(la, lo)) return fail("coordinate_range", `point ${la}, ${lo} is outside the Ontario envelope`);
    if (!regionMatches(region, la, lo)) return fail("region_mismatch", `region ${region} does not contain point ${la}, ${lo}`);
  } else if (lat || lon) {
    return fail("coordinate_range", "only one of latitude and longitude is known");
  }
  const geometry = (fields as Record<string, unknown>).geometry;
  if (isObject(geometry) && Array.isArray(geometry.value)) {
    for (const pair of geometry.value as unknown[]) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "number" || typeof pair[1] !== "number") {
        return fail("coordinate_range", "geometry has a vertex that is not a [lon, lat] pair");
      }
      if (!inEnvelope(pair[1], pair[0])) return fail("coordinate_range", `geometry vertex ${pair[0]}, ${pair[1]} is outside the Ontario envelope`);
    }
  }
  return { ok: true };
}
