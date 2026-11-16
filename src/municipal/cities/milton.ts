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
  yesNo,
  type GeoFeature,
} from "./west-gta-shared.js";

/**
 * Mappers for Town of Milton open-data layers retrieved on 2026-11-16 under the Open
 * Government Licence – Milton. Coded-domain columns are stored as the code the service returns.
 */

/**
 * Parking Lots. ACCESSIBLE_SPOTS is the published count of accessible spaces and is stored
 * as capacity_disabled, including a published 0. The point is the vertex mean of the lot outline.
 */
export function mapMiltonParkingLot(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return venueRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "NAME", ctx),
      category: dataset("parking lot", ctx),
      category_group: dataset("parking", ctx),
      ...civic(row, "ADDRESS", ctx),
      operator: published(row, "OWNER", ctx),
      capacity_disabled: wholeNumber(row, "ACCESSIBLE_SPOTS", ctx),
      ref: published(row, "LOT_ID", ctx),
    },
    ctx,
  );
}

/**
 * Park Amenities: fields, courts, playgrounds, splash pads and shade structures. The layer
 * has no accessibility column. LIGHTING is stored as lit. The WASHROOM and PARKING flags
 * have no field in the venue schema and are not stored. A row whose STATUS is Historic is
 * not a current amenity and returns null.
 */
export function mapMiltonParkAmenity(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (present(row, "STATUS").toLowerCase() === "historic") return null;
  return venueRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "NAME", ctx),
      category: published(row, "CATEGORY", ctx),
      category_group: dataset("park_feature", ctx),
      ...civic(row, "ADDRESS", ctx),
      lit: yesNo(row, "LIGHTING", ctx),
    },
    ctx,
  );
}

/** Sidewalks. MATERIAL is stored as surface and LIT_PATHWAY as lit. The layer has no width or slope column. */
export function mapMiltonSidewalk(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return pathRecord(
    feature,
    objectId(row, ctx),
    {
      kind: published(row, "CATEGORY", ctx),
      footway: dataset("sidewalk", ctx),
      surface: published(row, "MATERIAL", ctx),
      lit: yesNo(row, "LIT_PATHWAY", ctx),
    },
    ctx,
  );
}

/**
 * Trails: park paths, multi-use trails, and pedestrian bridges with their stairs and ramps.
 * CATEGORY is stored as kind, MATERIAL as surface and LIT_PATHWAY as lit.
 */
export function mapMiltonTrail(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return pathRecord(
    feature,
    objectId(row, ctx),
    {
      kind: published(row, "CATEGORY", ctx),
      surface: published(row, "MATERIAL", ctx),
      lit: yesNo(row, "LIT_PATHWAY", ctx),
    },
    ctx,
  );
}
