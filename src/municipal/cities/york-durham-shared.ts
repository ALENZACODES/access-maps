import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import { pathPositions, representativePoint, type OsmGeometry, type Position } from "../../osm/geometry.js";
import { splitCivicAddress } from "../map.js";

/**
 * Helpers shared by the York Region and Durham Region municipal mappers in this directory.
 *
 * Rules shared by every mapper that uses them:
 * - a field is filled only from a column the publisher filled; blank, None, N/A and
 *   undefined codes stay UNKNOWN with the original token on `raw`;
 * - a publisher's accessibility flag or count is kept as published, with its column name.
 *   It is not turned into a wheelchair yes or no;
 * - phone, fax, email and editor-name columns are not read.
 */

export type Row = Record<string, string>;

export interface LonLat {
  lon: number;
  lat: number;
}

/** A feature from an ArcGIS REST query with outSR=4326. Attributes are strings. */
export interface CityFeature {
  attributes: Row;
  /** The published point, or the vertex mean of the largest ring or longest line part. */
  point: LonLat | null;
  /** `geometry` for a published point, `geometry:vertex_mean` for a point computed from a ring or a line. */
  pointKey: "geometry" | "geometry:vertex_mean";
  /** Every line part the publisher drew, rounded to six decimals with consecutive duplicates removed. */
  lines: LinePart[];
}

export interface LinePart {
  geometryType: "Point" | "LineString";
  positions: Position[];
}

export interface RawArcFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: unknown; y?: unknown; rings?: unknown; paths?: unknown } | null;
}

const BLANK = new Set(["", "none", "unknown", "n/a", "na", "null"]);

function inOntario(point: LonLat | null): LonLat | null {
  if (!point) return null;
  if (point.lat < 41 || point.lat > 57.5 || point.lon < -96 || point.lon > -73.5) return null;
  return { lon: roundCoord(point.lon), lat: roundCoord(point.lat) };
}

function positionLists(value: unknown): Position[][] {
  if (!Array.isArray(value)) return [];
  const lists: Position[][] = [];
  for (const part of value) {
    if (!Array.isArray(part)) continue;
    const positions: Position[] = [];
    for (const position of part) {
      if (Array.isArray(position) && typeof position[0] === "number" && typeof position[1] === "number") {
        positions.push([position[0], position[1]]);
      }
    }
    if (positions.length > 0) lists.push(positions);
  }
  return lists;
}

export function cityFeature(raw: RawArcFeature): CityFeature {
  const attributes: Row = {};
  for (const [key, value] of Object.entries(raw.attributes ?? {})) {
    attributes[key] = value === null || value === undefined ? "" : String(value);
  }
  const geometry = raw.geometry ?? {};
  if (typeof geometry.x === "number" && typeof geometry.y === "number") {
    const point = Number.isFinite(geometry.x) && Number.isFinite(geometry.y) ? { lon: geometry.x, lat: geometry.y } : null;
    return { attributes, point: inOntario(point), pointKey: "geometry", lines: [] };
  }
  const rings = positionLists(geometry.rings);
  if (rings.length > 0) {
    const polygon: OsmGeometry = { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) };
    return {
      attributes,
      point: inOntario(representativePoint(polygon)),
      pointKey: "geometry:vertex_mean",
      lines: [],
    };
  }
  const lines: LinePart[] = [];
  for (const path of positionLists(geometry.paths)) {
    const drawn = pathPositions({ type: "LineString", coordinates: path });
    const anchor = drawn?.positions[0];
    if (drawn && anchor && inOntario({ lon: anchor[0], lat: anchor[1] })) lines.push(drawn);
  }
  const first = lines[0]?.positions[0];
  return {
    attributes,
    point: first ? { lon: first[0], lat: first[1] } : null,
    pointKey: "geometry",
    lines,
  };
}

export function present(row: Row, key: string): string {
  const trimmed = (row[key] ?? "").replace(/\s+/g, " ").trim();
  return BLANK.has(trimmed.toLowerCase()) ? "" : trimmed;
}

export function published(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const trimmed = present(row, key);
  if (trimmed === "") return unknownField(ctx, { source_key: key, raw });
  return fv(trimmed, ctx, { source_key: key });
}

/** The first of the listed columns that the publisher filled. */
export function firstPublished(row: Row, keys: readonly string[], ctx: Provenance): FieldValue {
  for (const key of keys) {
    const field = published(row, key, ctx);
    if (field.value !== "UNKNOWN") return field;
  }
  return unknownField(ctx, { source_key: keys.join(",") });
}

/** Joins filled columns as `COLUMN=value` pairs so the column name stays with the value. */
export function labelled(row: Row, keys: readonly string[], ctx: Provenance): FieldValue {
  const parts = keys.map((key) => ({ key, value: present(row, key) })).filter((part) => part.value !== "");
  if (parts.length === 0) return unknownField(ctx, { source_key: keys.join(",") });
  return fv(parts.map((part) => `${part.key}=${part.value}`).join("; "), ctx, {
    source_key: parts.map((part) => part.key).join(","),
  });
}

export function civic(row: Row, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const trimmed = present(row, key);
  if (trimmed === "") return { addr_housenumber: unknownField(ctx), addr_street: unknownField(ctx) };
  const address = splitCivicAddress(trimmed);
  return {
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: key }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: key }) : unknownField(ctx),
  };
}

export function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

export function pointFields(feature: CityFeature, ctx: Provenance, derivedFrom?: string): { lat: FieldValue; lon: FieldValue } {
  const key = derivedFrom ?? feature.pointKey;
  return {
    lat: coordinateField(feature.point?.lat ?? null, ctx, key, derivedFrom !== undefined),
    lon: coordinateField(feature.point?.lon ?? null, ctx, key, derivedFrom !== undefined),
  };
}

export function regionOf(feature: CityFeature): string {
  return regionFromPoint(feature.point?.lat ?? null, feature.point?.lon ?? null);
}

/**
 * One path record for each line part the publisher drew. A single-part feature keeps the
 * feature id. Further parts add `:part2`, `:part3` and so on. `fieldsFor` is told whether
 * the feature has one part, so a length published for the whole feature is not repeated on
 * each of its parts. A feature with no usable line gives one record with UNKNOWN geometry
 * and no region, which the importer leaves out.
 */
export function pathRecords(
  feature: CityFeature,
  ctx: Provenance,
  idBase: string,
  fieldsFor: (singlePart: boolean) => Record<string, FieldValue>,
): DataRecord[] {
  if (feature.lines.length === 0) {
    return [buildRecord("path", idBase, "unknown", fieldsFor(true), ctx)];
  }
  const single = feature.lines.length === 1;
  return feature.lines.map((part, index) => {
    const anchor = part.positions[0];
    return buildRecord(
      "path",
      index === 0 ? idBase : `${idBase}:part${index + 1}`,
      regionFromPoint(anchor ? anchor[1] : null, anchor ? anchor[0] : null),
      {
        ...fieldsFor(single),
        geometry: fv(part.positions, ctx, { source_key: "geometry" }),
        geometry_type: fv(part.geometryType, ctx, { source_key: "geometry" }),
      },
      ctx,
    );
  });
}

/** A published number greater than zero, rounded to two decimals. Zero, blank and text stay UNKNOWN. */
export function positiveNumber(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value) || value <= 0) return unknownField(ctx, { source_key: key, raw });
  return fv(Math.round(value * 100) / 100, ctx, { source_key: key, raw });
}

/** Maps a publisher's Yes/No token to yes or no. Any other token stays UNKNOWN. */
export function yesNo(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const lowered = raw.trim().toLowerCase();
  if (lowered === "yes") return fv("yes", ctx, { source_key: key, raw });
  if (lowered === "no") return fv("no", ctx, { source_key: key, raw });
  return unknownField(ctx, { source_key: key, raw });
}

/** The value of a coded-value domain copied from the layer definition. An undefined code stays UNKNOWN. */
export function coded(row: Row, key: string, domain: Readonly<Record<string, string>>, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const name = domain[raw];
  if (!name) return unknownField(ctx, { source_key: key, raw });
  return fv(name, ctx, { source_key: key, raw });
}
