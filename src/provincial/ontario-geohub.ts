import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import { placeAnchor, type Coordinate } from "../io/gpkg.js";
import { healthNameNamesPerson } from "../national/statcan-lode.js";
import { splitCivicAddress } from "../municipal/map.js";

/**
 * Province of Ontario place layers served by Land Information Ontario (LIO) and listed in
 * the Ontario Data Catalogue under the Open Government Licence – Ontario.
 *
 * Rules every mapper here follows:
 * - only the columns named in a job's field list are requested, so no phone, email or
 *   contact column is downloaded;
 * - blank, "Unknown" and "<Null>" stay UNKNOWN with the original token on `raw`;
 * - a publisher's accessibility flag is kept as `COLUMN=value` text in
 *   wheelchair_description. It is not turned into a wheelchair yes or no;
 * - a health service name that may name a person is not stored (same rule as the
 *   Statistics Canada healthcare import); the place stays with name UNKNOWN.
 */

export type GeohubRow = Record<string, string>;

/** One feature as cached: string attributes and a map anchor in degrees, or null. */
export interface GeohubFeature {
  attributes: GeohubRow;
  anchor: { lon: number; lat: number; key: string } | null;
}

const MISSING = new Set(["", "unknown", "<null>", "null", "none", "n/a", "na"]);

export function geohubValue(row: GeohubRow, key: string): string {
  const trimmed = (row[key] ?? "").replace(/\s+/g, " ").trim();
  return MISSING.has(trimmed.toLowerCase()) ? "" : trimmed;
}

function field(row: GeohubRow, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const value = geohubValue(row, key);
  if (value === "") return unknownField(ctx, { source_key: key, raw: row[key] ?? "" });
  return fv(value, ctx, { source_key: key });
}

function flag(row: GeohubRow, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const value = geohubValue(row, key);
  if (value === "") return unknownField(ctx, { source_key: key, raw: row[key] ?? "" });
  return fv(`${key}=${value}`, ctx, { source_key: key });
}

function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

function inOntarioBox(lon: number, lat: number): boolean {
  return lat >= 41 && lat <= 57.5 && lon >= -96 && lon <= -73.5;
}

function anchorFields(feature: GeohubFeature, ctx: Provenance): { region: string; lat: FieldValue; lon: FieldValue } {
  const anchor = feature.anchor;
  const usable = anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lon) && inOntarioBox(anchor.lon, anchor.lat) ? anchor : null;
  const lat = usable ? roundCoord(usable.lat) : null;
  const lon = usable ? roundCoord(usable.lon) : null;
  return {
    region: regionFromPoint(lat, lon),
    lat: coordinateField(lat, ctx, usable?.key ?? "geometry"),
    lon: coordinateField(lon, ctx, usable?.key ?? "geometry"),
  };
}

/**
 * The map anchor for an ArcGIS JSON geometry in degrees: a point as published, or the
 * vertex mean of the largest ring of a polygon (`geometry:vertex_mean`), which is not a
 * surveyed entrance.
 */
export function arcAnchor(geometry: { x?: unknown; y?: unknown; rings?: unknown } | null | undefined): GeohubFeature["anchor"] {
  if (!geometry) return null;
  if (typeof geometry.x === "number" && typeof geometry.y === "number") return { lon: geometry.x, lat: geometry.y, key: "geometry" };
  if (!Array.isArray(geometry.rings)) return null;
  const rings: Coordinate[][] = [];
  for (const ring of geometry.rings) {
    if (!Array.isArray(ring)) continue;
    const positions = ring.filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number").map((p) => [p[0], p[1]] as Coordinate);
    if (positions.length > 0) rings.push(positions);
  }
  const anchor = placeAnchor({ type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) });
  return anchor ? { lon: anchor.x, lat: anchor.y, key: anchor.key } : null;
}

function civic(row: GeohubRow, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const raw = geohubValue(row, key);
  if (raw === "") return { addr_housenumber: unknownField(ctx, { source_key: key }), addr_street: unknownField(ctx, { source_key: key }) };
  const split = splitCivicAddress(raw);
  return {
    addr_housenumber: split.housenumber ? fv(split.housenumber, ctx, { source_key: key }) : unknownField(ctx, { source_key: key }),
    addr_street: fv(split.street, ctx, { source_key: key }),
  };
}

/** Ministry of Health Service Provider Locations (MOHSERLO). */
export const MOH_FIELDS = ["OGF_ID", "MOH_SERVICE_PROVIDER_IDENT", "SERVICE_TYPE", "ENGLISH_NAME", "ADDRESS_LINE_1", "COMMUNITY", "POSTAL_CODE"] as const;

export function mapMohServiceLocation(feature: GeohubFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const at = anchorFields(feature, ctx);
  const name = geohubValue(row, "ENGLISH_NAME");
  const withheld = name !== "" && healthNameNamesPerson(name, row.SERVICE_TYPE ?? "");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OGF_ID}`,
    at.region,
    {
      name: withheld ? unknownField(ctx, { source_key: "ENGLISH_NAME" }) : field(row, "ENGLISH_NAME", ctx),
      category_group: dataset("healthcare", ctx),
      category: field(row, "SERVICE_TYPE", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(row, "ADDRESS_LINE_1", ctx),
      addr_city: field(row, "COMMUNITY", ctx),
      addr_postcode: field(row, "POSTAL_CODE", ctx),
      ref: field(row, "MOH_SERVICE_PROVIDER_IDENT", ctx),
    },
    ctx,
  );
}

/** Fishing Access Point. Rows the Ministry marks VISIBILITY_IND No are not imported. */
export const FISHING_FIELDS = ["OGF_ID", "FISHING_ACCESS_POINT_TYPE", "SITE_NAME", "ACCESSIBILITY_FLG", "VISIBILITY_IND"] as const;

export function mapFishingAccessPoint(feature: GeohubFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if ((row.VISIBILITY_IND ?? "").trim() !== "Yes") return null;
  const at = anchorFields(feature, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OGF_ID}`,
    at.region,
    {
      name: field(row, "SITE_NAME", ctx),
      category_group: dataset("fishing_access", ctx),
      category: field(row, "FISHING_ACCESS_POINT_TYPE", ctx),
      lat: at.lat,
      lon: at.lon,
      wheelchair_description: flag(row, "ACCESSIBILITY_FLG", ctx),
    },
    ctx,
  );
}

/** Provincial Park Regulated: one venue per regulated park or protected area outline. */
export const PARK_FIELDS = ["OGF_ID", "PROTECTED_SITE_IDENT", "PROTECTED_AREA_NAME_ENG", "TYPE_ENG", "MANAGEMENT_ENG"] as const;

export function mapProvincialPark(feature: GeohubFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const at = anchorFields(feature, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OGF_ID}`,
    at.region,
    {
      name: field(row, "PROTECTED_AREA_NAME_ENG", ctx),
      category_group: dataset("park", ctx),
      category: field(row, "TYPE_ENG", ctx),
      lat: at.lat,
      lon: at.lon,
      operator: field(row, "MANAGEMENT_ENG", ctx),
      ref: field(row, "PROTECTED_SITE_IDENT", ctx),
    },
    ctx,
  );
}

/** Official airports. Only AIRPORT_TYPE Airport and Seaplane Base are imported; heliports are not places the public visits. */
export const AIRPORT_FIELDS = ["OGF_ID", "AIRPORT_TYPE", "NAME", "AIRPORT_IDENT"] as const;
const AIRPORT_TYPES = new Set(["Airport", "Seaplane Base"]);

export function mapOfficialAirport(feature: GeohubFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!AIRPORT_TYPES.has((row.AIRPORT_TYPE ?? "").trim())) return null;
  const at = anchorFields(feature, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OGF_ID}`,
    at.region,
    {
      name: field(row, "NAME", ctx),
      category_group: dataset("airport", ctx),
      category: field(row, "AIRPORT_TYPE", ctx),
      lat: at.lat,
      lon: at.lon,
      ref: field(row, "AIRPORT_IDENT", ctx),
    },
    ctx,
  );
}

/** Ontario Trail Network access points. The layer publishes a location and its accuracy only, so the name is UNKNOWN. */
export const OTN_FIELDS = ["OGF_ID", "LOCATION_ACCURACY"] as const;

export function mapOtnAccessPoint(feature: GeohubFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const at = anchorFields(feature, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OGF_ID}`,
    at.region,
    {
      category_group: dataset("trail_access", ctx),
      category: dataset("trail access point", ctx),
      lat: at.lat,
      lon: at.lon,
    },
    ctx,
  );
}

/** Ontario Railway Network stations. Only STNTYPE Passenger Station and Mixed are imported. */
export const STATION_FIELDS = ["OGF_ID", "NID", "STENNAME", "STNTYPE"] as const;
const STATION_TYPES = new Set(["Passenger Station", "Mixed"]);

export function mapRailwayStation(feature: GeohubFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!STATION_TYPES.has((row.STNTYPE ?? "").trim())) return null;
  const at = anchorFields(feature, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OGF_ID}`,
    at.region,
    {
      name: field(row, "STENNAME", ctx),
      category_group: dataset("railway_station", ctx),
      category: field(row, "STNTYPE", ctx),
      lat: at.lat,
      lon: at.lon,
      ref: field(row, "NID", ctx),
    },
    ctx,
  );
}
