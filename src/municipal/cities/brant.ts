import { buildRecord, type DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  dataset,
  labelled,
  lineFields,
  pointFields,
  published,
  regionOf,
  ringMeanOf,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";
import { lineParts, partId } from "./g6-helpers.js";

/**
 * County of Brant open-data layers retrieved on 2026-11-16 from the County's ArcGIS
 * open-data catalogue (https://catalogue-Brant.hub.arcgis.com). Each item's licence field
 * reads CC0. None of these layers has an accessibility column.
 */

/** True unless the County publishes the sidewalk as Removed. Unassumed and blank status rows are kept. */
export function brantSidewalkExists(row: Row): boolean {
  return (row.STATUS ?? "").trim().toLowerCase() !== "removed";
}

/**
 * Sidewalk. MATERIAL is stored as published. TYPE (for example Boulevard, Curb Face or
 * Multi-Use Trail - Boulevard), WIDTH and STATUS are kept as `COLUMN=value` text: the
 * layer does not state the unit of WIDTH, so it is not written to the width field. A
 * line drawn in several parts is stored as one record per part.
 */
export function mapBrantSidewalk(feature: RawFeature, ctx: Provenance): DataRecord[] | null {
  const row = attributesOf(feature);
  if (!brantSidewalkExists(row)) return null;
  return lineParts(feature).map(({ feature: piece, part }) => {
    const line = lineFields(piece, ctx);
    return buildRecord(
      "path",
      partId(ctx.source_id, row.OBJECTID ?? "", part),
      line.region,
      {
        kind: dataset("sidewalk", ctx),
        footway: dataset("sidewalk", ctx),
        surface: published(row, "MATERIAL", ctx),
        wheelchair_description: labelled(row, ["TYPE", "WIDTH", "STATUS"], ctx),
        geometry: line.geometry,
        geometry_type: line.geometry_type,
      },
      ctx,
    );
  });
}

/**
 * Brant Trail Network. Every row retrieved is published as Active. CYCLING, HIKING and
 * SNOWTRAIL are the County's own yes/no columns; they are not accessibility values and
 * are not stored. OWNERSHIP is not stored (one of its values is a display flag). A trail
 * drawn in several parts is stored as one record per part.
 */
export function mapBrantTrail(feature: RawFeature, ctx: Provenance): DataRecord[] {
  const row = attributesOf(feature);
  return lineParts(feature).map(({ feature: piece, part }) => {
    const line = lineFields(piece, ctx);
    return buildRecord(
      "path",
      partId(ctx.source_id, row.OBJECTID ?? "", part),
      line.region,
      {
        kind: dataset("trail", ctx),
        footway: dataset("trail", ctx),
        signposted_as: published(row, "TRAIL_NAME", ctx),
        geometry: line.geometry,
        geometry_type: line.geometry_type,
      },
      ctx,
    );
  });
}

/** County of Brant Parks (polygons). The stored point is the vertex mean of the outline, not an entrance. */
export function mapBrantPark(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = ringMeanOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "PARK_NAME", ctx),
      category: published(row, "PARK_TYPE", ctx),
      category_group: dataset("park", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
    },
    ctx,
  );
}

export const BRANT_JOBS = [
  { id: "brant-sidewalks", tranches: ["path" as const], map: mapBrantSidewalk },
  { id: "brant-trails", tranches: ["path" as const], map: mapBrantTrail },
  { id: "brant-parks", tranches: ["venue" as const], map: mapBrantPark },
];
