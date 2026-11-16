import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import { parseGeometry, pathPositions, representativePoint } from "../../osm/geometry.js";
import { splitCivicAddress } from "../map.js";

/**
 * Helpers shared by the Peel, Hamilton, Halton and Niagara city mappers.
 *
 * Rules every mapper built on these helpers follows:
 * - a field is filled only from a column the publisher filled; blank, None, N/A and
 *   codes the publisher does not define stay UNKNOWN with the original token on `raw`;
 * - a publisher's accessibility column is kept as `COLUMN=value` text. It is not turned
 *   into a wheelchair yes or no;
 * - phone, fax, email and editor-name columns are not read.
 */

export type Row = Record<string, string>;

/** One feature of an ArcGIS REST query made with `f=geojson&outSR=4326`. */
export interface GeoFeature {
  properties: Row;
  geometry: unknown;
}

export function geoFeature(raw: { properties?: Record<string, unknown> | null; geometry?: unknown }): GeoFeature {
  const properties: Row = {};
  for (const [key, value] of Object.entries(raw.properties ?? {})) {
    properties[key] = value === null || value === undefined ? "" : String(value);
  }
  return { properties, geometry: raw.geometry ?? null };
}

const BLANK = new Set(["", "none", "unknown", "n/a", "na", "null"]);

export function present(row: Row, key: string): string {
  const trimmed = (row[key] ?? "").replace(/\s+/g, " ").trim();
  return BLANK.has(trimmed.toLowerCase()) ? "" : trimmed;
}

export function published(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const value = present(row, key);
  if (value === "") return unknownField(ctx, { source_key: key, raw: row[key] ?? "" });
  return fv(value, ctx, { source_key: key });
}

/** Joins filled columns as `COLUMN=value` pairs so the column name stays with the value. */
export function labelled(row: Row, keys: readonly string[], ctx: Provenance): FieldValue {
  const parts = keys.map((key) => ({ key, value: present(row, key) })).filter((part) => part.value !== "");
  if (parts.length === 0) return unknownField(ctx, { source_key: keys.join(",") });
  return fv(parts.map((part) => `${part.key}=${part.value}`).join("; "), ctx, {
    source_key: parts.map((part) => part.key).join(","),
  });
}

/** Maps a published YES or NO token (any letter case). Every other token stays UNKNOWN. */
export function yesNo(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const lowered = raw.trim().toLowerCase();
  if (lowered === "yes") return fv("yes", ctx, { source_key: key, raw });
  if (lowered === "no") return fv("no", ctx, { source_key: key, raw });
  return unknownField(ctx, { source_key: key, raw });
}

/** A published whole number of zero or more, such as a count of accessible parking spaces. */
export function wholeNumber(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const value = Number(raw);
  if (raw === "" || !Number.isInteger(value) || value < 0) return unknownField(ctx, { source_key: key, raw });
  return fv(value, ctx, { source_key: key, raw });
}

/** A published positive measurement, rounded to two decimal places. */
export function positiveNumber(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value) || value <= 0) return unknownField(ctx, { source_key: key, raw });
  return fv(Math.round(value * 100) / 100, ctx, { source_key: key, raw });
}

export function civic(row: Row, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const value = present(row, key);
  if (value === "") return { addr_housenumber: unknownField(ctx), addr_street: unknownField(ctx) };
  const address = splitCivicAddress(value);
  return {
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: key }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: key }) : unknownField(ctx),
  };
}

export function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

export interface Located {
  region: string;
  lat: FieldValue;
  lon: FieldValue;
}

/**
 * A point feature keeps its published coordinate. A polygon or line feature gets the
 * vertex mean of its outline (`geometry:vertex_mean`), which is not a surveyed entrance.
 * A coordinate outside Ontario's bounding box is treated as missing.
 */
export function locate(feature: GeoFeature, ctx: Provenance): Located {
  const geometry = parseGeometry(feature.geometry);
  const point = representativePoint(geometry);
  const key = geometry?.type === "Point" ? "geometry" : "geometry:vertex_mean";
  const inside = point !== null && point.lat >= 41 && point.lat <= 57.5 && point.lon >= -96 && point.lon <= -73.5;
  const lat = inside ? roundCoord(point.lat) : null;
  const lon = inside ? roundCoord(point.lon) : null;
  return {
    region: regionFromPoint(lat, lon),
    lat: coordinateField(lat, ctx, key),
    lon: coordinateField(lon, ctx, key),
  };
}

export function venueRecord(
  feature: GeoFeature,
  id: string,
  fields: Record<string, FieldValue>,
  ctx: Provenance,
): DataRecord {
  const at = locate(feature, ctx);
  return buildRecord("venue", id, at.region, { lat: at.lat, lon: at.lon, ...fields }, ctx);
}

export function washroomRecord(
  feature: GeoFeature,
  id: string,
  fields: Record<string, FieldValue>,
  ctx: Provenance,
): DataRecord {
  const at = locate(feature, ctx);
  return buildRecord("washroom", id, at.region, { lat: at.lat, lon: at.lon, ...fields }, ctx);
}

/**
 * A path record keeps the published line, rounded to six decimal places. A multipart line
 * keeps its longest part. Length is stored only from a column the caller passes in.
 */
export function pathRecord(
  feature: GeoFeature,
  id: string,
  fields: Record<string, FieldValue>,
  ctx: Provenance,
): DataRecord {
  const drawn = pathPositions(parseGeometry(feature.geometry));
  const anchor = drawn?.positions[0];
  return buildRecord(
    "path",
    id,
    regionFromPoint(anchor ? anchor[1] : null, anchor ? anchor[0] : null),
    {
      ...fields,
      geometry: drawn ? fv(drawn.positions, ctx, { source_key: "geometry" }) : unknownField(ctx),
      geometry_type: drawn ? fv(drawn.geometryType, ctx, { source_key: "geometry" }) : unknownField(ctx),
    },
    ctx,
  );
}

export function objectId(row: Row, ctx: Provenance): string {
  const id = (row.OBJECTID ?? row.FID ?? row.ObjectId ?? "").trim();
  if (id === "") throw new Error(`${ctx.source_id}: feature has no OBJECTID`);
  return `${ctx.source_id}:${id}`;
}
