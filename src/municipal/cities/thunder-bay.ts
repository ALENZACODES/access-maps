import { buildRecord, type DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  dataset,
  lineFields,
  pointFields,
  pointOf,
  published,
  regionOf,
  type RawFeature,
} from "./g4-helpers.js";

/** City of Thunder Bay open-data layers retrieved on 2026-11-16. */

/** Sidewalks. The layer publishes the line and an id only, so every other field stays UNKNOWN. */
export function mapThunderBaySidewalk(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: dataset("sidewalk", ctx),
      footway: dataset("sidewalk", ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

/** Trails. LOCATION is the published trail name. No surface, width or accessibility column exists. */
export function mapThunderBayTrail(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: dataset("trail", ctx),
      signposted_as: published(row, "LOCATION", ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

/** Address of City Facilities. Building name and civic address only; no accessibility column. */
export function mapThunderBayFacility(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "BUILDING", ctx),
      category: dataset("City facility", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(point, ctx),
      ...civic(row.COMPLETE ?? "", "COMPLETE", ctx),
    },
    ctx,
  );
}

export const THUNDER_BAY_JOBS = [
  { id: "thunder-bay-sidewalks", tranches: ["path" as const], map: mapThunderBaySidewalk },
  { id: "thunder-bay-trails", tranches: ["path" as const], map: mapThunderBayTrail },
  { id: "thunder-bay-city-facilities", tranches: ["venue" as const], map: mapThunderBayFacility },
];
