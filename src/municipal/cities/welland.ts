import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { objectId, pathRecord, present, published, washroomRecord, type GeoFeature } from "./west-gta-shared.js";

/**
 * Mappers for City of Welland open-data layers retrieved on 2026-11-16 under the Open
 * Government Licence – City of Welland.
 */

/**
 * City Wide Trails. Only rows whose Enviro is Off-Road are imported (others return null):
 * an On-Road/Sidewalk row does not say whether its line is the road or a sidewalk. Class
 * and Surface (Paved or Unpaved) are stored as published.
 */
export function mapWellandTrail(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (present(row, "Enviro").toLowerCase() !== "off-road") return null;
  return pathRecord(
    feature,
    objectId(row, ctx),
    { kind: published(row, "Class", ctx), surface: published(row, "Surface", ctx) },
    ctx,
  );
}

/**
 * Municipal Facilities. Only rows whose SubType is Public Washroom become washroom records
 * (others return null). The layer has no accessibility column, so wheelchair stays UNKNOWN.
 */
export function mapWellandPublicWashroom(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (present(row, "SubType").toLowerCase() !== "public washroom") return null;
  return washroomRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "Name", ctx),
      facility_type: published(row, "SubType", ctx),
      address: published(row, "Address", ctx),
      building: published(row, "Type", ctx),
    },
    ctx,
  );
}
