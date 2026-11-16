import type { DataRecord } from "../../model/records.js";
import { unknownField, type Provenance } from "../../model/provenance.js";
import {
  civicText,
  dataset,
  featurePoint,
  featureVertexMean,
  labelled,
  pathRecord,
  pointFields,
  present,
  published,
  spaceCount,
  venueRecord,
  washroomRecord,
  type CityFeature,
} from "./g3-shared.js";

/**
 * City of London open-data layers retrieved on 2026-11-16 from the City's OpenData map
 * services (maps.london.ca), listed in the City's catalogue at https://opendata.london.ca.
 *
 * The basis for including them is recorded in sources/registry.json: the repository owner
 * stated on 2026-11-16 that use is permitted, and the City of London Open Data Terms of Use
 * were read the same day. Those terms ask that anyone who receives the data also receives
 * the terms (or their URL); ATTRIBUTION.md carries that link.
 *
 * None of these layers has a column that says a place is accessible, except the Parking
 * Inventory count of disabled spaces, which is empty on every row retrieved. Every
 * accessibility field therefore stays UNKNOWN unless a mapper below says otherwise.
 */

/** The Park Amenities Type the City uses for a washroom building. */
export const LONDON_WASHROOM_TYPE = "Washroom";

/**
 * Park Amenities (points). Type is the City's amenity type (Play Structure, Spray Pad,
 * Washroom, Community Centre, Arena and so on) and is stored unchanged as the category.
 * GIS_FeatureKey is the City's label for the amenity, such as "Victoria Park Washrooms 1",
 * and is the name. Owner (City, School, Private) is stored as operator. A Washroom row
 * becomes a washroom record; every other row becomes a venue. The layer has no
 * accessibility column.
 */
export function mapLondonParkAmenity(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  const id = `${ctx.source_id}:${row.OBJECTID}`;
  if (present(row, "Type") === LONDON_WASHROOM_TYPE) {
    return washroomRecord(
      id,
      point,
      {
        name: published(row, "GIS_FeatureKey", ctx),
        ...pointFields(point, ctx),
        facility_type: dataset("park washroom building", ctx),
        operator: published(row, "Owner", ctx),
        address: published(row, "Address", ctx),
        ...civicText(row, "Address", ctx),
        addr_city: dataset("London", ctx),
      },
      ctx,
    );
  }
  return venueRecord(
    id,
    point,
    {
      name: published(row, "GIS_FeatureKey", ctx),
      category: published(row, "Type", ctx),
      category_group: dataset("park_amenity", ctx),
      ...pointFields(point, ctx),
      ...civicText(row, "Address", ctx),
      addr_city: dataset("London", ctx),
      operator: published(row, "Owner", ctx),
      ref: published(row, "GIS_ID", ctx),
    },
    ctx,
  );
}

/**
 * Parking Inventory (points). CountDisabledSpaces is the City's count of disabled parking
 * spaces; a published whole number (including 0) is stored as capacity_disabled and a blank
 * stays UNKNOWN. On 2026-11-16 the column was blank on every row. Location is the City's
 * description of the parking stretch, such as "West side of Clarence St / North of Angel St".
 * MeterNo and HonkZoneID are payment identifiers and are not requested.
 */
export function mapLondonParkingInventory(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: present(row, "Name") !== "" ? published(row, "Name", ctx) : published(row, "Location", ctx),
      category: published(row, "ParkingFacilityType", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx),
      addr_city: dataset("London", ctx),
      access: published(row, "AccessType", ctx),
      capacity_disabled: spaceCount(row, "CountDisabledSpaces", ctx),
      ref: published(row, "GIS_ID", ctx),
    },
    ctx,
  );
}

/**
 * Parking Off Street (polygons): the City's municipal lots, with a lot name and nothing
 * else. The stored point is the vertex mean of the lot outline. capacity_disabled and every
 * accessibility field stay UNKNOWN.
 */
export function mapLondonOffStreetParking(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featureVertexMean(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "LotName", ctx),
      category: dataset("municipal parking lot", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
      addr_city: dataset("London", ctx),
      capacity_disabled: unknownField(ctx),
      ref: published(row, "GIS_ID", ctx),
    },
    ctx,
  );
}

/** Libraries (points). The layer has no accessibility column. */
export function mapLondonLibrary(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "GIS_FeatureKey", ctx),
      category: dataset("public library", ctx),
      category_group: dataset("library", ctx),
      ...pointFields(point, ctx),
      ...civicText(row, "Address", ctx),
      addr_city: dataset("London", ctx),
      ref: published(row, "GIS_ID", ctx),
    },
    ctx,
  );
}

/**
 * Sidewalks (lines). Width is published as a class, ">= 1.5m" or "< 1.5m", not a measured
 * width, so it is kept as the published pair `Width=<class>` in wheelchair_description and
 * the numeric width stays UNKNOWN. Material is the surface.
 */
export function mapLondonSidewalk(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: dataset("sidewalk", ctx),
      surface: published(row, "Material", ctx),
      width: unknownField(ctx),
      wheelchair_description: labelled(row, ["Width"], ctx),
    },
    ctx,
  );
}

/** Walkways (lines): the City's pedestrian walkways between streets, parks and blocks. */
export function mapLondonWalkway(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return pathRecord(feature, `${ctx.source_id}:${row.OBJECTID}`, { kind: dataset("walkway", ctx) }, ctx);
}

/** Bicycle Routes and Walking Trails rows of these Types are roadway or parking lines, not paths. */
export const LONDON_TRAIL_TYPES_LEFT_OUT = ["Road", "Parking Lot"] as const;

/**
 * Bicycle Routes and Walking Trails (lines in parks and open space). The layer's Status
 * column is used only to mark Future paths; a Future row is not imported, and a row with a
 * blank Status is imported. Rows whose Type is Road or Parking Lot, and rows with neither a
 * Type nor a PathType, are left out. Type and PathType are kept together as the kind.
 */
export function mapLondonTrail(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (present(row, "Status").toLowerCase() === "future") return null;
  const type = present(row, "Type");
  if ((LONDON_TRAIL_TYPES_LEFT_OUT as readonly string[]).includes(type)) return null;
  if (type === "" && present(row, "PathType") === "") return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    { kind: labelled(row, ["Type", "PathType"], ctx) },
    ctx,
  );
}
