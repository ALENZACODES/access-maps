import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  objectId,
  pathRecord,
  present,
  published,
  venueRecord,
  wholeNumber,
  type GeoFeature,
} from "./west-gta-shared.js";

/** Mappers for City of Brampton open-data layers retrieved on 2026-11-16 (CC BY on each item). */

/**
 * City Parking Lots. ACCESSIBLE_CAP is the published count of accessible spaces and is
 * stored as capacity_disabled. Rates and permit costs are not read.
 */
export function mapBramptonCityParking(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return venueRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "LOT_NAME", ctx),
      category: dataset("municipal parking lot", ctx),
      category_group: dataset("parking", ctx),
      ...civic(row, "ADDRESS", ctx),
      capacity_disabled: wholeNumber(row, "ACCESSIBLE_CAP", ctx),
    },
    ctx,
  );
}

/** Trail types that are places to walk or roll, off the roadway. */
export const BRAMPTON_TRAIL_TYPES: ReadonlySet<string> = new Set([
  "multi-use",
  "walkway",
  "sidewalk",
  "bridge",
  "underpass",
]);

/**
 * Recreational Trails. Only MULTI-USE, WALKWAY, SIDEWALK, BRIDGE and UNDERPASS segments
 * are imported (others return null). On-street bike lanes and signed on-road routes are
 * the roadway, and the layer does not define APRON, CROSSWALK or CROSSROAD. The layer has
 * no surface, width or slope column.
 */
export function mapBramptonTrail(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (!BRAMPTON_TRAIL_TYPES.has(present(row, "TRAIL_TYPE").toLowerCase())) return null;
  return pathRecord(feature, objectId(row, ctx), { kind: published(row, "TRAIL_TYPE", ctx) }, ctx);
}
