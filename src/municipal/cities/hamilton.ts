import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  labelled,
  objectId,
  pathRecord,
  positiveNumber,
  present,
  published,
  venueRecord,
  washroomRecord,
  type GeoFeature,
} from "./west-gta-shared.js";

/**
 * Mappers for City of Hamilton open-data layers retrieved on 2026-11-16 under the City of
 * Hamilton Open Data Licence. Coded-domain columns are stored as the code the service
 * returns.
 */

/**
 * Park Washrooms. AODA_ACCESSIBILITY is the City's own Yes or No column. It is kept as
 * `AODA_ACCESSIBILITY=Yes` or `AODA_ACCESSIBILITY=No`, and wheelchair stays UNKNOWN because
 * the layer does not say what was assessed. WASHROOM_TYPE is kept as published.
 */
export function mapHamiltonParkWashroom(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return washroomRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "LOCATION", ctx),
      facility_type: published(row, "WASHROOM_TYPE", ctx),
      published_accessibility: labelled(row, ["AODA_ACCESSIBILITY"], ctx),
      building: published(row, "CATEGORY", ctx),
      address: published(row, "PARK_ADDRESS", ctx),
    },
    ctx,
  );
}

/** Drinking Fountains. The layer has no accessibility column, so those fields stay UNKNOWN. */
export function mapHamiltonDrinkingFountain(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return venueRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "PARK_NAME", ctx),
      category: dataset("drinking fountain", ctx),
      category_group: dataset("drinking_water", ctx),
      ...civic(row, "ADDRESS", ctx),
    },
    ctx,
  );
}

/**
 * HSR Bus Stops, the City's stop amenity inventory. The landing area columns describe the
 * surface a rider boards from. They are kept as published text. This layer has no
 * wheelchair boarding column, and none is derived from the landing area.
 */
export function mapHamiltonBusStopAmenity(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return venueRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "STOP_NAME", ctx),
      category: dataset("transit stop", ctx),
      category_group: dataset("transit_stop", ctx),
      wheelchair_description: labelled(row, ["LANDING_AREA", "LANDING_AREA_TYPE"], ctx),
      ref: published(row, "STOP_NUMBER", ctx),
    },
    ctx,
  );
}

/** Pedestrian Features: stairs, pedestrian-only streets, bridges, tunnels and overpasses. */
export function mapHamiltonPedestrianFeature(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return pathRecord(feature, objectId(row, ctx), { kind: published(row, "CATEGORY", ctx) }, ctx);
}

/** Trail types that are places to walk or roll. On-road routes and untyped segments are left out. */
export const HAMILTON_TRAIL_TYPES: ReadonlySet<string> = new Set(["multi-use", "boulevard", "stairs"]);

/**
 * Trails. Only segments whose TRAIL_TYPE is Multi-Use, Boulevard or Stairs are imported
 * (others return null): an On-road Route line is the roadway, and a segment with no
 * trail type is not stated to be a trail. SURFACE and LENGTH_IN_METRES are kept as published.
 */
export function mapHamiltonTrail(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (!HAMILTON_TRAIL_TYPES.has(present(row, "TRAIL_TYPE").toLowerCase())) return null;
  return pathRecord(
    feature,
    objectId(row, ctx),
    {
      kind: published(row, "TRAIL_TYPE", ctx),
      surface: published(row, "SURFACE", ctx),
      length_m: positiveNumber(row, "LENGTH_IN_METRES", ctx),
    },
    ctx,
  );
}

/**
 * Road Sidewalk. Every line in the layer is a sidewalk and the layer has no attribute
 * column, so only the line is stored. Width, surface and slope stay UNKNOWN.
 */
export function mapHamiltonSidewalk(feature: GeoFeature, ctx: Provenance): DataRecord {
  return pathRecord(
    feature,
    objectId(feature.properties, ctx),
    { kind: dataset("sidewalk", ctx), footway: dataset("sidewalk", ctx) },
    ctx,
  );
}
