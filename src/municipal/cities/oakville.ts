import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { objectId, present, published, washroomRecord, type GeoFeature } from "./west-gta-shared.js";

/**
 * Mapper for the Town of Oakville Town Facilities layer retrieved on 2026-11-16 under the
 * Town of Oakville Open Data Licence.
 */

/**
 * Only rows whose DESCRIPTIO is Washroom become washroom records (others return null).
 * The layer has a name, an address and a description and no accessibility column, so
 * wheelchair stays UNKNOWN.
 */
export function mapOakvilleTownWashroom(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (present(row, "DESCRIPTIO").toLowerCase() !== "washroom") return null;
  return washroomRecord(
    feature,
    objectId(row, ctx),
    {
      name: published(row, "NAME", ctx),
      facility_type: published(row, "DESCRIPTIO", ctx),
      address: published(row, "ADDRESS", ctx),
    },
    ctx,
  );
}
