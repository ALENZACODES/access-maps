import type { DataRecord } from "../../model/records.js";
import { coordinateField } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  civicText,
  dataset,
  featurePoint,
  httpUrl,
  labelled,
  pointFields,
  present,
  published,
  venueRecord,
  washroomRecord,
  type CityFeature,
  type Row,
} from "./g3-shared.js";

/**
 * County of Lambton Accessible Features, retrieved on 2026-11-16 under the Open Government
 * Licence - County of Lambton. The layer lists County and municipal facilities (libraries,
 * museums, offices and similar buildings, 20 of them in Sarnia) and, for each facility, the
 * accessibility features the County lists for it.
 *
 * Each ACC column holds the County's own phrase when the feature is listed (for example
 * "Accessible Designated Parking" or "Ground Level Access") and is empty otherwise. A filled
 * column is kept as a `COLUMN=phrase` pair. An empty column is not read as "no": the layer
 * does not say that an unlisted feature is absent, so it stays UNKNOWN. The DESC_HTML column
 * repeats the same phrases as markup and is not requested.
 */
export const LAMBTON_FEATURE_COLUMNS = [
  "ACCOutsideParking",
  "ACCEntranceDistance",
  "ACCEntranceAccess",
  "ACCEntranceStairs",
  "ACCEntranceRamp",
  "ACCInsideResourcesElevator",
  "ACCInsideResourcesWheelchair",
  "ACCInsideResourcesRollator",
  "ACCInsideResourcesMobilityCharg",
  "ACCInsideResourcesLargePrint",
  "ACCInsideResourcesSpokenBook",
  "ACCInsideResourcesMagnifier",
  "ACCOutsideBike",
] as const;

export const LAMBTON_WASHROOM_COLUMNS = ["ACCWashroomsAccessible", "ACCWashroomsBabyChangeTable", "ACCWashroomsAdultChangeTable"] as const;

function listed(row: Row, key: string, ctx: Provenance): FieldValue {
  const value = present(row, key);
  if (value === "") return unknownField(ctx, { source_key: key, raw: row[key] ?? "" });
  return fv("yes", ctx, { source_key: key, raw: value });
}

/**
 * One venue per facility. When the County lists a washroom feature, a washroom record is
 * added at the facility point (marked derived, as the washroom itself is not located).
 * The County's washroom phrase is kept in published_accessibility; wheelchair stays UNKNOWN.
 * A listed baby or adult change table is stored as yes; an unlisted one stays UNKNOWN.
 */
export function mapLambtonAccessibleFacility(feature: CityFeature, ctx: Provenance): DataRecord[] {
  const row = feature.attributes;
  const point = featurePoint(feature);
  const venueId = `${ctx.source_id}:${row.OBJECTID}`;
  const venue = venueRecord(
    venueId,
    point,
    {
      name: published(row, "Facility", ctx),
      category: dataset("County or municipal facility", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(point, ctx),
      ...civicText(row, "Address", ctx),
      addr_city: published(row, "City", ctx),
      website: httpUrl(row, "Desc_", ctx),
      wheelchair_description: labelled(row, LAMBTON_FEATURE_COLUMNS, ctx),
      ref: published(row, "Facility_ID", ctx),
    },
    ctx,
  );
  if (LAMBTON_WASHROOM_COLUMNS.every((key) => present(row, key) === "")) return [venue];
  const washroom = washroomRecord(
    `${venueId}:washroom`,
    point,
    {
      name: published(row, "Facility", ctx),
      lat: coordinateField(point?.lat ?? null, ctx, "parent_geometry", true),
      lon: coordinateField(point?.lon ?? null, ctx, "parent_geometry", true),
      facility_type: dataset("washroom in a County or municipal facility", ctx),
      published_accessibility: labelled(row, ["ACCWashroomsAccessible"], ctx),
      changing_table: listed(row, "ACCWashroomsBabyChangeTable", ctx),
      adult_changing_table: listed(row, "ACCWashroomsAdultChangeTable", ctx),
      address: published(row, "Address", ctx),
      addr_city: published(row, "City", ctx),
      parent_id: fv(venueId, ctx, { source_key: "OBJECTID" }),
    },
    ctx,
  );
  return [venue, washroom];
}
