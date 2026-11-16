import { coordinateField, regionFromPoint, roundCoord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import { parseGeometry, pathPositions, type Position } from "../../osm/geometry.js";
import { splitCivicAddress } from "../map.js";

/**
 * Shared helpers for the city mappers in this directory.
 *
 * Rules every mapper follows:
 * - a field is filled only from a column the publisher filled; blank, None, N/A and
 *   undefined codes stay UNKNOWN with the original token on `raw`;
 * - a publisher's accessible column is kept as the publisher's flag in a description
 *   field. It is not turned into a wheelchair yes or no;
 * - a number whose unit the layer does not state is kept as `COLUMN=value` text and is
 *   not written to a metric field;
 * - phone, fax and email columns are not read.
 */

const BLANK = new Set(["", "none", "unknown", "n/a", "na", "null"]);

export type Row = Record<string, string>;
export type Point = { lon: number; lat: number } | null;

/** One feature from an ArcGIS REST query with outSR=4326. */
export interface RawFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: unknown; y?: unknown; paths?: unknown; rings?: unknown };
}

export function attributesOf(raw: RawFeature): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(raw.attributes ?? {})) {
    row[key] = value === null || value === undefined ? "" : String(value);
  }
  return row;
}

function inOntario(lon: number, lat: number): boolean {
  return lat >= 41 && lat <= 57.5 && lon >= -96 && lon <= -73.5;
}

export function pointOf(raw: RawFeature): Point {
  const x = raw.geometry?.x;
  const y = raw.geometry?.y;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!inOntario(x, y)) return null;
  return { lon: roundCoord(x), lat: roundCoord(y) };
}

function positionLists(value: unknown): Position[][] {
  if (!Array.isArray(value)) return [];
  const lists: Position[][] = [];
  for (const part of value) {
    if (!Array.isArray(part)) continue;
    const positions: Position[] = [];
    for (const item of part) {
      if (Array.isArray(item) && typeof item[0] === "number" && typeof item[1] === "number") {
        positions.push([item[0], item[1]]);
      }
    }
    if (positions.length > 0) lists.push(positions);
  }
  return lists;
}

/** The published line, rounded to six decimals. A multipart line keeps its longest part. */
export function lineOf(raw: RawFeature): { geometryType: "Point" | "LineString"; positions: Position[] } | null {
  const paths = positionLists(raw.geometry?.paths);
  if (paths.length === 0) return null;
  const drawn = pathPositions(parseGeometry({ type: "MultiLineString", coordinates: paths }));
  if (!drawn) return null;
  const first = drawn.positions[0];
  if (!first || !inOntario(first[0], first[1])) return null;
  return drawn;
}

/** Vertex mean of the first ring of a polygon. It is a map anchor, not a surveyed entrance. */
export function ringMeanOf(raw: RawFeature): Point {
  const ring = positionLists(raw.geometry?.rings)[0];
  if (!ring) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const open = first && last && ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
  if (open.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const position of open) {
    lon += position[0];
    lat += position[1];
  }
  lon /= open.length;
  lat /= open.length;
  if (!inOntario(lon, lat)) return null;
  return { lon: roundCoord(lon), lat: roundCoord(lat) };
}

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

/** Maps a coded column through the layer's published domain. A code outside the domain stays UNKNOWN. */
export function coded(row: Row, key: string, domain: Readonly<Record<string, string>>, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const value = domain[raw];
  if (value === undefined) return unknownField(ctx, { source_key: key, raw });
  return fv(value, ctx, { source_key: key, raw });
}

export function civic(raw: string, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (BLANK.has(trimmed.toLowerCase())) {
    return { addr_housenumber: unknownField(ctx), addr_street: unknownField(ctx) };
  }
  const address = splitCivicAddress(trimmed);
  return {
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: key }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: key }) : unknownField(ctx),
  };
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

export function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

/** Geometry fields and the storage cell for a path record. */
export function lineFields(raw: RawFeature, ctx: Provenance): { region: string; geometry: FieldValue; geometry_type: FieldValue } {
  const drawn = lineOf(raw);
  const anchor = drawn?.positions[0];
  return {
    region: regionFromPoint(anchor ? anchor[1] : null, anchor ? anchor[0] : null),
    geometry: drawn ? fv(drawn.positions, ctx, { source_key: "geometry" }) : unknownField(ctx),
    geometry_type: drawn ? fv(drawn.geometryType, ctx, { source_key: "geometry" }) : unknownField(ctx),
  };
}

/** A whole number of accessible spaces as published, including a published 0. */
export function spaceCount(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const count = Number(raw);
  if (raw === "" || !Number.isInteger(count) || count < 0) return unknownField(ctx, { source_key: key, raw });
  return fv(count, ctx, { source_key: key, raw });
}
