import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  civicText,
  dataset,
  featurePoint,
  featureVertexMean,
  flag,
  pathRecord,
  pointFields,
  positiveNumber,
  published,
  venueRecord,
  type CityFeature,
} from "./g3-shared.js";

/**
 * City of Waterloo open-data layers retrieved on 2026-11-16 under the Waterloo Open Data
 * User Licence. Only rows published as Active are imported.
 */

/**
 * Parking Lots (City Operated), polygons. ACCESSIBLE is the City's Y or N flag for the lot
 * and is kept as ACCESSIBLE=Y or ACCESSIBLE=N. It is not a count of spaces and it is not
 * turned into a wheelchair value. CAPACITY is free text mixing a number with permit rules,
 * so no count is read from it. The stored point is the vertex mean of the lot outline.
 */
export function mapWaterlooParkingLot(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featureVertexMean(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "NAME", ctx),
      category: published(row, "CLASS", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
      ...civicText(row, "ADDRESS", ctx),
      wheelchair_description: flag(row, "ACCESSIBLE", ["Y", "N"], ctx),
      surface: published(row, "SURFACE", ctx),
    },
    ctx,
  );
}

/** Playgrounds. SURFACE_TYPE (Sand or Wood Fibre) is the published play surface. No accessibility flag is published. */
export function mapWaterlooPlayground(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if ((row.LIFECYCLESTATUS ?? "").trim().toLowerCase() !== "active") return null;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "PLAYGROUND_NAME", ctx),
      category: dataset("playground", ctx),
      category_group: dataset("playground", ctx),
      ...pointFields(point, ctx),
      surface: published(row, "SURFACE_TYPE", ctx),
      ref: published(row, "ASSET_ID", ctx),
    },
    ctx,
  );
}

/**
 * Sidewalks (status column STATUS) and Trails and Pathways (status column LIFECYCLESTATUS).
 * PATH_TYPE is the kind, SURFACE the published surface and LENGTH_M the published length in
 * metres. Neither layer publishes a width, slope or curb column.
 */
export function mapWaterlooPathSegment(
  feature: CityFeature,
  ctx: Provenance,
  statusKey: "STATUS" | "LIFECYCLESTATUS",
): DataRecord | null {
  const row = feature.attributes;
  if ((row[statusKey] ?? "").trim().toLowerCase() !== "active") return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: published(row, "PATH_TYPE", ctx),
      surface: published(row, "SURFACE", ctx),
      length_m: positiveNumber(row, "LENGTH_M", ctx),
    },
    ctx,
  );
}
