import { buildRecord, type DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  dataset,
  labelled,
  lineFields,
  pointFields,
  pointOf,
  published,
  regionOf,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";

/** City of Quinte West open-data layers retrieved on 2026-11-16. */

/** Parks. `amenities` is the City's own class, such as "Park with Amenities". No accessibility column exists. */
export function mapQuinteWestPark(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.objectid}`,
    regionOf(point),
    {
      name: published(row, "park_name", ctx),
      category: published(row, "amenities", ctx),
      category_group: dataset("park", ctx),
      ...pointFields(point, ctx),
      ...civic(row.Location ?? "", "Location", ctx),
      ref: published(row, "id", ctx),
    },
    ctx,
  );
}

const QUINTE_WEST_WALKING = new Set(["trail", "walkway", "sidewalk"]);

/** True for a trail, walkway or sidewalk. A row published as Wide Shoulder is a road shoulder and is left out. */
export function quinteWestSegmentIsWalkway(row: Row): boolean {
  return QUINTE_WEST_WALKING.has((row.PEDEST ?? "").trim().toLowerCase());
}

/**
 * Trails and Sidewalks. Only rows that pass quinteWestSegmentIsWalkway are imported
 * (others return null). `surface` is stored as published. `min_width` is 0 or blank on
 * every row retrieved and has no stated unit, so it is not stored.
 */
export function mapQuinteWestTrail(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if (!quinteWestSegmentIsWalkway(row)) return null;
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.objectid}`,
    line.region,
    {
      kind: published(row, "PEDEST", ctx),
      footway: (row.PEDEST ?? "").trim().toLowerCase() === "sidewalk" ? dataset("sidewalk", ctx) : dataset("trail", ctx),
      surface: published(row, "surface", ctx),
      wheelchair_description: labelled(row, ["surf_det", "firmness", "hazard_com"], ctx),
      signposted_as: published(row, "structure", ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

export const QUINTE_WEST_JOBS = [
  { id: "quinte-west-parks", tranches: ["venue" as const], map: mapQuinteWestPark },
  { id: "quinte-west-trails", tranches: ["path" as const], map: mapQuinteWestTrail },
];
