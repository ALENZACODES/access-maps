import type { DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  civicText,
  dataset,
  featurePoint,
  httpUrl,
  pathRecord,
  pointFields,
  published,
  spaceCount,
  venueRecord,
  washroomRecord,
  type CityFeature,
  type Row,
} from "./g3-shared.js";

/**
 * City of Guelph open-data layers retrieved on 2026-11-16 under the Open Government
 * Licence - City of Guelph (Open Data Licence Version 2.0).
 */

/**
 * Restrooms in City parks. RestroomType (PERMANENT RESTROOM or PORTABLE RESTROOM) is the
 * facility type. Only rows published as IN-USE are imported. The layer has no accessibility
 * column, so wheelchair stays UNKNOWN.
 */
export function mapGuelphRestroom(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if ((row.Status ?? "").trim().toUpperCase() !== "IN-USE") return null;
  const point = featurePoint(feature);
  return washroomRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "ParkName", ctx),
      ...pointFields(point, ctx),
      facility_type: published(row, "RestroomType", ctx),
      location: published(row, "LocationDescription", ctx),
    },
    ctx,
  );
}

/**
 * Parking Lot Points (downtown lots, parkades and on-street permit areas). ACCESSIBLESPACES
 * is the published count of accessible spaces, including a published 0. LOCATION is split
 * into a civic address only when it starts with a number.
 */
export function mapGuelphParkingLot(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if ((row.STATUS ?? "").trim().toLowerCase() !== "open") return null;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "LOTNAME", ctx),
      category: published(row, "PARKINGTYPE", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx),
      ...civicText(row, "LOCATION", ctx),
      capacity_disabled: spaceCount(row, "ACCESSIBLESPACES", ctx),
      website: httpUrl(row, "WEBSITELINK", ctx),
      ref: published(row, "LOTID", ctx),
    },
    ctx,
  );
}

/** WIDTH is published as text such as `1.52m (5'-0")`. The metre figure is read; OTHER and UNKNOWN stay UNKNOWN. */
export function guelphSidewalkWidth(row: Row, ctx: Provenance): FieldValue {
  if (!("WIDTH" in row)) return unknownField(ctx);
  const raw = row.WIDTH ?? "";
  const match = /^(\d+(?:\.\d+)?)m\b/.exec(raw.trim());
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return unknownField(ctx, { source_key: "WIDTH", raw });
  return fv(value, ctx, { source_key: "WIDTH", raw });
}

/**
 * Sidewalks. Only rows published as BUILT are imported; PROPOSED rows return null. SURFTYPE
 * is the published surface. The layer has no slope or curb-ramp column.
 */
export function mapGuelphSidewalk(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if ((row.STATUS ?? "").trim().toUpperCase() !== "BUILT") return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: dataset("sidewalk", ctx),
      surface: published(row, "SURFTYPE", ctx),
      width: guelphSidewalkWidth(row, ctx),
    },
    ctx,
  );
}

/** Trails. Surface_Type is the published surface. The layer has no width, slope or accessibility column. */
export function mapGuelphTrail(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: dataset("trail", ctx),
      surface: published(row, "Surface_Type", ctx),
    },
    ctx,
  );
}
