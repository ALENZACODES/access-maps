import fields from "../../schema/fields.json";
import { fv, unknownField, type FieldValue, type Provenance } from "./provenance.js";

export const VENUE_FIELDS = fields.venue;
export const WASHROOM_FIELDS = fields.washroom;
export const PATH_FIELDS = fields.path;
export const TRANSIT_FIELDS = fields.transit;

export const TRANCHES = ["venue", "washroom", "path", "transit"] as const;
export type Tranche = (typeof TRANCHES)[number];

export const TRANCHE_DIR: Record<Tranche, string> = {
  venue: "venues",
  washroom: "washrooms",
  path: "paths",
  transit: "transit",
};

export const FIELD_LIST: Record<Tranche, readonly string[]> = {
  venue: VENUE_FIELDS,
  washroom: WASHROOM_FIELDS,
  path: PATH_FIELDS,
  transit: TRANSIT_FIELDS,
};

/** Illustrative piece targets from the master plan, section 5.6. Not a quota. */
export const TRANCHE_TARGETS: Record<Tranche, number> = {
  venue: 250_000,
  path: 100_000,
  transit: 50_000,
  washroom: 100_000,
};

export const TOTAL_TARGET = 500_000;

export interface DataRecord {
  id: string;
  tranche: Tranche;
  region: string;
  fields: Record<string, FieldValue>;
}

export function buildRecord(
  tranche: Tranche,
  id: string,
  region: string,
  partial: Record<string, FieldValue>,
  ctx: Provenance,
): DataRecord {
  const keys = FIELD_LIST[tranche];
  const known = new Set(keys);
  for (const key of Object.keys(partial)) {
    if (!known.has(key)) throw new Error(`field ${key} is not in the ${tranche} schema`);
  }
  const recordFields: Record<string, FieldValue> = {};
  for (const key of keys) {
    recordFields[key] = partial[key] ?? unknownField(ctx);
  }
  return { id, tranche, region, fields: recordFields };
}

export function roundCoord(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function regionId(lat: number, lon: number): string {
  const latBin = Math.floor(lat * 2) / 2;
  const lonBin = Math.floor(lon * 2) / 2;
  const ns = latBin < 0 ? "s" : "n";
  const ew = lonBin < 0 ? "w" : "e";
  return `${ns}${padFixed(Math.abs(latBin), 2)}_${ew}${padFixed(Math.abs(lonBin), 3)}`;
}

function padFixed(value: number, integerDigits: number): string {
  const parts = value.toFixed(1).split(".");
  const integers = parts[0] ?? "0";
  const fraction = parts[1] ?? "0";
  return `${integers.padStart(integerDigits, "0")}.${fraction}`;
}

export function regionFromPoint(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return "unknown";
  return regionId(lat, lon);
}

export function coordinateField(
  value: number | null,
  ctx: Provenance,
  sourceKey: string,
  derived = false,
): FieldValue {
  if (value === null || !Number.isFinite(value)) return unknownField(ctx, { source_key: sourceKey });
  return fv(roundCoord(value), ctx, { source_key: sourceKey, derived });
}
