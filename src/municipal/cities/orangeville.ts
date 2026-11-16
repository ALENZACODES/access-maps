import { buildRecord, coordinateField, type DataRecord } from "../../model/records.js";
import { fv, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  dataset,
  labelled,
  pointFields,
  pointOf,
  present,
  published,
  regionOf,
  type RawFeature,
} from "./g4-helpers.js";

/**
 * Town of Orangeville open-data layer retrieved on 2026-11-16 from the Town's open-data
 * site (https://opendata.orangeville.ca). The item's licence field links the Open
 * Government Licence – Orangeville.
 */

/** The Town's own accessibility columns on the parks layer, kept as published flags. */
export const ORANGEVILLE_PARK_FLAGS = ["ADACOMPLY", "ACCESSPLAYGROUND"] as const;

/**
 * Parks and Recreation Areas (points). ADACOMPLY and ACCESSPLAYGROUND are the Town's own
 * Yes/No columns and are kept as `COLUMN=value` text in wheelchair_description; they are
 * not turned into a wheelchair yes or no. When RESTROOM is Yes, a washroom record is added
 * at the park point (marked derived, as the washroom itself is not located). RESTROOM No
 * adds nothing: the absence of a washroom record is not stored as a fact.
 */
export function mapOrangevillePark(feature: RawFeature, ctx: Provenance): DataRecord[] {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  const venueId = `${ctx.source_id}:${row.OBJECTID}`;
  const street = ((row.FULLADDR ?? "").split(",")[0] ?? "").trim();
  const venue = buildRecord(
    "venue",
    venueId,
    regionOf(point),
    {
      name: published(row, "NAME", ctx),
      category: dataset("park", ctx),
      category_group: dataset("park", ctx),
      ...pointFields(point, ctx),
      ...civic(street, "FULLADDR", ctx),
      wheelchair_description: labelled(row, ORANGEVILLE_PARK_FLAGS, ctx),
      ref: published(row, "FACILITYID", ctx),
    },
    ctx,
  );
  if (present(row, "RESTROOM").toLowerCase() !== "yes") return [venue];
  const washroom = buildRecord(
    "washroom",
    `${venueId}:washroom`,
    regionOf(point),
    {
      name: published(row, "NAME", ctx),
      lat: coordinateField(point?.lat ?? null, ctx, "parent_geometry", true),
      lon: coordinateField(point?.lon ?? null, ctx, "parent_geometry", true),
      facility_type: fv("washroom in a park", ctx, { source_key: "RESTROOM", raw: row.RESTROOM ?? "" }),
      address: published({ FULLADDR: street }, "FULLADDR", ctx),
      parent_id: fv(venueId, ctx, { source_key: "OBJECTID" }),
    },
    ctx,
  );
  return [venue, washroom];
}

export const ORANGEVILLE_JOBS = [{ id: "orangeville-parks", tranches: ["venue" as const, "washroom" as const], map: mapOrangevillePark }];
