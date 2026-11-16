import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { objectId, pathRecord, present, published, type GeoFeature } from "./west-gta-shared.js";

/**
 * Mapper for the Region of Peel Trails layer retrieved on 2026-11-16 under the Open Data
 * Licence for The Regional Municipality of Peel, Version 1.0. The layer covers Brampton,
 * Caledon and Mississauga.
 */

/** Classes that are off-road trails. Bicycle lanes and on-road routes are the roadway. */
export const PEEL_TRAIL_CLASSES: ReadonlySet<string> = new Set([
  "paved multi-use trail",
  "unpaved multi-use trail",
  "hiking trail",
  "unmarked dirt trail",
]);

/**
 * Only segments whose Class is one of PEEL_TRAIL_CLASSES are imported (others return
 * null). Class and Surface are kept as published. The layer has no width or slope column.
 */
export function mapPeelTrail(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (!PEEL_TRAIL_CLASSES.has(present(row, "Class").toLowerCase())) return null;
  return pathRecord(
    feature,
    objectId(row, ctx),
    { kind: published(row, "Class", ctx), surface: published(row, "Surface", ctx) },
    ctx,
  );
}
