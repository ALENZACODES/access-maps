import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, type Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  pointFields,
  present,
  published,
  regionOf,
  type CityFeature,
} from "./york-durham-shared.js";

/** City of Pickering open data, retrieved 2026-11-16. Neither layer has an accessibility column. */

/** City Facility (points). The Yes/No amenity columns have no matching venue field and are not stored. */
export function mapPickeringFacility(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: published(row, "Name", ctx),
      category: published(row, "Categories", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "Address", ctx),
      addr_city: published(row, "City", ctx),
      addr_postcode: published(row, "Postal_Code", ctx),
    },
    ctx,
  );
}

/**
 * The amenity columns on the Parks layer share one coded-value domain, read 2026-11-16:
 * 0 is Yes, 1 is No and 2 is Unknown. The code for Yes is 0, not 1.
 */
export const PICKERING_AMENITY_YES = "0";

/** Park statuses that mean the park is not open to visit. Rows with these are skipped. */
const PICKERING_NOT_OPEN = new Set(["planned", "under construction", "in progress", "not in service", "decommissioned"]);

/** Park statuses under which the amenity columns are read. */
const PICKERING_IN_USE = new Set(["open", "in service", "assumed"]);

/**
 * Parks (polygons). A park whose Status is Planned, Under Construction, In Progress, Not In
 * Service or Decommissioned is skipped (null). Each other park is a venue at the vertex mean
 * of its outline. Washroom = 0 (Yes) on a park whose Status is Open, In Service or Assumed
 * adds a washroom record. A park with a blank Status gets no washroom record: most planned
 * and blank-status rows carry 0 in that column, which reads as an unfilled default there.
 * The layer does not say where in the park the washroom is, so its coordinate is the park
 * point, marked derived.
 */
export function mapPickeringPark(feature: CityFeature, ctx: Provenance): DataRecord[] | null {
  const row = feature.attributes;
  const status = present(row, "Status").toLowerCase();
  if (PICKERING_NOT_OPEN.has(status)) return null;
  const venueId = `${ctx.source_id}:${row.OBJECTID}`;
  const venue = buildRecord(
    "venue",
    venueId,
    regionOf(feature),
    {
      name: published(row, "PARKNAME", ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset("park", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "ParkAddress", ctx),
      ref: published(row, "PARKNUMBER", ctx),
    },
    ctx,
  );
  if (!PICKERING_IN_USE.has(status) || (row.Washroom ?? "").trim() !== PICKERING_AMENITY_YES) return [venue];
  const washroom = buildRecord(
    "washroom",
    `${venueId}:washroom`,
    regionOf(feature),
    {
      name: published(row, "PARKNAME", ctx),
      ...pointFields(feature, ctx, "parent_geometry"),
      facility_type: fv("washroom in a park", ctx, { source_key: "Washroom", raw: PICKERING_AMENITY_YES }),
      address: published(row, "ParkAddress", ctx),
      building: dataset("park", ctx),
      parent_id: fv(venueId, ctx, { source_key: "OBJECTID" }),
    },
    ctx,
  );
  return [venue, washroom];
}
