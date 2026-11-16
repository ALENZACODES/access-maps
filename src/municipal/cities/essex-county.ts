import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  dataset,
  lineFields,
  pointFields,
  pointOf,
  published,
  regionOf,
  ringMeanOf,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";
import { lineParts, partId } from "./g6-helpers.js";

/**
 * County of Essex open-data layers retrieved on 2026-11-16 from
 * https://cwserver.countyofessex.ca/arcgis/rest/services/OpenData/. The County layers
 * cover its seven lower-tier municipalities, among them Lakeshore, LaSalle, Leamington,
 * Amherstburg and Tecumseh. None of these layers has an accessibility column, so every
 * accessibility field stays UNKNOWN.
 */

/** Recreational Areas TYPE values that are public places a person can visit. */
const ESSEX_PUBLIC_AREA_TYPES = new Set(["PARK", "COMMUNITY CENTRE", "SPORTS COMPLEX", "HISTORIC SITE"]);

/**
 * The layer writes MUNICIPALITY either in full or as a three-letter code. The codes are
 * spelled out only where the full name is also used in the same layer.
 */
export const ESSEX_MUNICIPALITY_CODES: Readonly<Record<string, string>> = {
  AMH: "Amherstburg",
  ESS: "Essex",
  KIN: "Kingsville",
  LAK: "Lakeshore",
  LAS: "LaSalle",
  TEC: "Tecumseh",
};

/** True for parks, community centres, sports complexes and historic sites. Golf courses and marinas are left out. */
export function essexAreaIsPublicPlace(row: Row): boolean {
  return ESSEX_PUBLIC_AREA_TYPES.has((row.TYPE ?? "").trim().toUpperCase());
}

/**
 * Recreational Areas (polygons). TYPE is the County's own class and is stored as the
 * category. The stored point is the vertex mean of the outline, not an entrance.
 */
export function mapEssexRecreationalArea(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if (!essexAreaIsPublicPlace(row)) return null;
  const point = ringMeanOf(feature);
  const municipality = (row.MUNICIPALITY ?? "").trim();
  const city = ESSEX_MUNICIPALITY_CODES[municipality.toUpperCase()] ?? municipality;
  const type = (row.TYPE ?? "").trim().toUpperCase();
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "PARK_NAME", ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset(type === "PARK" ? "park" : "recreation", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
      addr_city: fv(city, ctx, { source_key: "MUNICIPALITY", raw: row.MUNICIPALITY ?? "" }),
    },
    ctx,
  );
}

/** County Libraries (points). LOCATION is the community the branch is in. */
export function mapEssexLibrary(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "NAME", ctx),
      category: dataset("library", ctx),
      category_group: dataset("library", ctx),
      ...pointFields(point, ctx),
      ...civic(row.ADDRESS ?? "", "ADDRESS", ctx),
      addr_city: published(row, "LOCATION", ctx),
    },
    ctx,
  );
}

/**
 * CWATS Routes facility types that are off the roadway. MUT and MUP are the County's
 * multi-use trail and multi-use path. Bike lanes, paved shoulders, signed routes, cycle
 * paths and the CSS type are left out: they are on or beside the roadway, or the layer
 * does not say which.
 */
export const ESSEX_OFF_ROAD_TYPES: Readonly<Record<string, string>> = {
  MUT: "multi-use trail",
  MUP: "multi-use path",
};

/**
 * Existing CWATS trails (County Wide Active Transportation System). Only MUT and MUP rows
 * are imported (others return null). The layer has no surface, width or accessibility column.
 * A line drawn in several parts is stored as one record per part.
 */
export function mapEssexTrail(feature: RawFeature, ctx: Provenance): DataRecord[] | null {
  const row = attributesOf(feature);
  const raw = (row.F_Type_New ?? "").trim();
  const kind = ESSEX_OFF_ROAD_TYPES[raw.toUpperCase()];
  if (!kind) return null;
  return lineParts(feature).map(({ feature: piece, part }) => {
    const line = lineFields(piece, ctx);
    return buildRecord(
      "path",
      partId(ctx.source_id, row.OBJECTID ?? "", part),
      line.region,
      {
        kind: fv(kind, ctx, { source_key: "F_Type_New", raw }),
        signposted_as: published(row, "SegmentName", ctx),
        geometry: line.geometry,
        geometry_type: line.geometry_type,
      },
      ctx,
    );
  });
}

export const ESSEX_COUNTY_JOBS = [
  { id: "essex-county-recreational-areas", tranches: ["venue" as const], map: mapEssexRecreationalArea },
  { id: "essex-county-libraries", tranches: ["venue" as const], map: mapEssexLibrary },
  { id: "essex-county-trails", tranches: ["path" as const], map: mapEssexTrail },
];
