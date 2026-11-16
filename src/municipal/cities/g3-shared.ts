import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import { parseGeometry, pathPositions, representativePoint, type OsmGeometry } from "../../osm/geometry.js";
import { splitCivicAddress } from "../map.js";

/**
 * Helpers shared by the mappers for Kitchener, Waterloo, Cambridge, Guelph, Windsor and
 * the County of Lambton (files retrieved on 2026-11-16).
 *
 * Rules every mapper built on these helpers follows:
 * - a field is filled only from a column the publisher filled; blank and placeholder
 *   tokens stay UNKNOWN with the original token on `raw`;
 * - a publisher's accessible flag is kept as `COLUMN=value` in a description field. It is
 *   not turned into a wheelchair yes or no;
 * - only the columns named in a job's field list are requested from the service, so
 *   phone, email, editor and inspector columns are never downloaded.
 */

export type Row = Record<string, string>;
export type Point = { lon: number; lat: number } | null;

/** One feature of an ArcGIS REST query with outSR=4326: attributes as strings plus the geometry. */
export interface CityFeature {
  attributes: Row;
  geometry: OsmGeometry | null;
}

interface RawGeometry {
  x?: unknown;
  y?: unknown;
  paths?: unknown;
  rings?: unknown;
}

export function cityFeature(raw: { attributes?: Record<string, unknown>; geometry?: RawGeometry | null }): CityFeature {
  const attributes: Row = {};
  for (const [key, value] of Object.entries(raw.attributes ?? {})) {
    attributes[key] = value === null || value === undefined ? "" : String(value);
  }
  return { attributes, geometry: arcGeometry(raw.geometry ?? null) };
}

function arcGeometry(raw: RawGeometry | null): OsmGeometry | null {
  if (!raw) return null;
  if (typeof raw.x === "number" && typeof raw.y === "number") {
    return parseGeometry({ type: "Point", coordinates: [raw.x, raw.y] });
  }
  if (Array.isArray(raw.paths)) return parseGeometry({ type: "MultiLineString", coordinates: raw.paths });
  if (Array.isArray(raw.rings)) return parseGeometry({ type: "Polygon", coordinates: raw.rings });
  return null;
}

function inOntario(point: { lon: number; lat: number }): boolean {
  return point.lat >= 41 && point.lat <= 57.5 && point.lon >= -96 && point.lon <= -73.5;
}

/** The published point, or null when the feature is not a point or lies outside Ontario's bounding box. */
export function featurePoint(feature: CityFeature): Point {
  if (feature.geometry?.type !== "Point") return null;
  const point = representativePoint(feature.geometry);
  return point && inOntario(point) ? point : null;
}

/** Vertex mean of a polygon's first ring. It places the record on the map; it is not a surveyed entrance. */
export function featureVertexMean(feature: CityFeature): Point {
  if (feature.geometry?.type !== "Polygon") return null;
  const point = representativePoint(feature.geometry);
  return point && inOntario(point) ? { lon: roundCoord(point.lon), lat: roundCoord(point.lat) } : null;
}

export function pointFields(point: Point, ctx: Provenance, key = "geometry"): { lat: FieldValue; lon: FieldValue } {
  return {
    lat: coordinateField(point?.lat ?? null, ctx, key),
    lon: coordinateField(point?.lon ?? null, ctx, key),
  };
}

export function regionOf(point: Point): string {
  return regionFromPoint(point?.lat ?? null, point?.lon ?? null);
}

const BLANK = new Set(["", "none", "null", "n/a", "na", "unknown", "not applicable"]);

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

/**
 * A publisher flag column kept as `COLUMN=TOKEN`. Only the tokens listed in `allowed`
 * (compared in upper case) are kept; any other token stays UNKNOWN with the token on `raw`.
 */
export function flag(row: Row, key: string, allowed: readonly string[], ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const token = raw.trim().toUpperCase();
  if (!allowed.includes(token)) return unknownField(ctx, { source_key: key, raw });
  return fv(`${key}=${token}`, ctx, { source_key: key, raw });
}

export function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

/** A published number greater than zero, rounded to two decimals. Zero, blank and text stay UNKNOWN. */
export function positiveNumber(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value) || value <= 0) return unknownField(ctx, { source_key: key, raw });
  return fv(Math.round(value * 100) / 100, ctx, { source_key: key, raw });
}

/** A published count of accessible parking spaces: a whole number, including a published 0. */
export function spaceCount(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const value = Number(raw);
  if (raw === "" || !Number.isInteger(value) || value < 0) return unknownField(ctx, { source_key: key, raw });
  return fv(value, ctx, { source_key: key, raw });
}

/** Separate civic number and street columns. */
export function civicColumns(
  row: Row,
  numberKey: string,
  streetKey: string,
  ctx: Provenance,
): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  return { addr_housenumber: published(row, numberKey, ctx), addr_street: published(row, streetKey, ctx) };
}

/** One address column. It is split only when it starts with a civic number; other text is not an address. */
export function civicText(row: Row, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const value = present(row, key);
  if (!/^\d/.test(value)) {
    const raw = row[key] ?? "";
    return { addr_housenumber: unknownField(ctx, { source_key: key, raw }), addr_street: unknownField(ctx, { source_key: key, raw }) };
  }
  const address = splitCivicAddress(value);
  return {
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: key }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: key }) : unknownField(ctx),
  };
}

export function httpUrl(row: Row, key: string, ctx: Provenance): FieldValue {
  const value = present(row, key);
  if (!/^https?:\/\/\S+$/.test(value)) return unknownField(ctx, { source_key: key });
  return fv(value, ctx, { source_key: key });
}

/**
 * A path record from a published line. Multipart lines keep the longest part, as the rest
 * of the pipeline does. A feature with no usable line gets region "unknown" and is left out
 * by the importer.
 */
export function pathRecord(
  feature: CityFeature,
  id: string,
  partial: Record<string, FieldValue>,
  ctx: Provenance,
): DataRecord {
  const drawn = feature.geometry?.type === "Point" ? null : pathPositions(feature.geometry);
  const line = drawn && drawn.geometryType === "LineString" ? drawn : null;
  const anchor = line?.positions[0];
  const usable = anchor !== undefined && inOntario({ lon: anchor[0], lat: anchor[1] });
  return buildRecord(
    "path",
    id,
    usable ? regionFromPoint(anchor[1], anchor[0]) : "unknown",
    {
      ...partial,
      geometry: line && usable ? fv(line.positions, ctx, { source_key: "geometry" }) : unknownField(ctx),
      geometry_type: line && usable ? fv(line.geometryType, ctx, { source_key: "geometry" }) : unknownField(ctx),
    },
    ctx,
  );
}

export function venueRecord(id: string, point: Point, partial: Record<string, FieldValue>, ctx: Provenance): DataRecord {
  return buildRecord("venue", id, regionOf(point), partial, ctx);
}

export function washroomRecord(id: string, point: Point, partial: Record<string, FieldValue>, ctx: Provenance): DataRecord {
  return buildRecord("washroom", id, regionOf(point), partial, ctx);
}
