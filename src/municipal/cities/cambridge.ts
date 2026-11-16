import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  civicColumns,
  dataset,
  featurePoint,
  flag,
  pathRecord,
  pointFields,
  positiveNumber,
  published,
  venueRecord,
  type CityFeature,
} from "./g3-shared.js";

/**
 * City of Cambridge Play Structures, retrieved on 2026-11-16 under the Open Government
 * Licence - City of Cambridge (Open Data Licence Version 2.0).
 *
 * PLAY_STRUCTURE_TYPE is the City's own label, such as JR SR SWING or JR SR ADA SWING, and
 * is stored unchanged as the category. The layer has no accessibility column, so a label
 * that mentions ADA is not turned into a wheelchair value.
 */
export function mapCambridgePlayStructure(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "PARK_NAME", ctx),
      category: published(row, "PLAY_STRUCTURE_TYPE", ctx),
      category_group: dataset("playground", ctx),
      ...pointFields(point, ctx),
      ...civicColumns(row, "STREET_NUMBER", "STREET_NAME", ctx),
      ref: published(row, "ASSET_ID", ctx),
    },
    ctx,
  );
}

/** Trails rows of these TRAIL_TYPE values are roadway or parking-lot lines, not paths. */
export const CAMBRIDGE_TRAIL_TYPES_LEFT_OUT = ["ROAD", "PARK ROAD", "PARKING LOT"] as const;

function inService(row: Record<string, string>): boolean {
  return (row.STATUS ?? "").trim().toUpperCase() === "IN SERVICE";
}

/**
 * City of Cambridge Trails (OpenData1/MapServer/11), retrieved on 2026-11-16. The layer has
 * no catalogue record stating a licence; the basis for including it is the repository
 * owner's statement of 2026-11-16, recorded in sources/registry.json.
 *
 * ACCESSIBLE is the City's YES or NO flag and is kept as ACCESSIBLE=YES or ACCESSIBLE=NO in
 * wheelchair_description; a blank stays UNKNOWN and wheelchair is never derived from it.
 * TRAIL_TYPE is the kind, SURFACE_MATERIAL the surface and WIDTH the width (the map service
 * states its units as metres). Only IN SERVICE rows are imported; road, park road and
 * parking-lot lines are left out.
 */
export function mapCambridgeTrail(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!inService(row)) return null;
  const type = (row.TRAIL_TYPE ?? "").trim().toUpperCase();
  if ((CAMBRIDGE_TRAIL_TYPES_LEFT_OUT as readonly string[]).includes(type)) return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: published(row, "TRAIL_TYPE", ctx),
      surface: published(row, "SURFACE_MATERIAL", ctx),
      width: positiveNumber(row, "WIDTH", ctx),
      wheelchair_description: flag(row, "ACCESSIBLE", ["YES", "NO"], ctx),
    },
    ctx,
  );
}

/**
 * City of Cambridge Pedestrian Network (OpenData2/MapServer/3), retrieved on 2026-11-16 on
 * the same basis as the Trails layer. Only SIDE_WALK rows are imported: the network's TRAIL
 * and WALKWAY rows repeat lines in the Trails layer, which also carries the ACCESSIBLE flag.
 * Only IN SERVICE rows are imported.
 */
export function mapCambridgeSidewalk(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!inService(row)) return null;
  if ((row.ASSET_TYPE ?? "").trim().toUpperCase() !== "SIDE_WALK") return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: dataset("sidewalk", ctx),
      surface: published(row, "SURFACE_MATERIAL", ctx),
      width: positiveNumber(row, "WIDTH", ctx),
    },
    ctx,
  );
}
