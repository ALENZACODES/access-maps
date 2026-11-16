import type { DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  civicColumns,
  dataset,
  featurePoint,
  featureVertexMean,
  flag,
  httpUrl,
  labelled,
  pathRecord,
  pointFields,
  positiveNumber,
  present,
  published,
  spaceCount,
  venueRecord,
  washroomRecord,
  type CityFeature,
  type Row,
} from "./g3-shared.js";

/**
 * City of Kitchener open-data layers retrieved on 2026-11-16 under the Open Government
 * Licence - The Corporation of the City of Kitchener, version 1.0.
 *
 * Every layer carries a STATUS column. Only rows the City publishes as ACTIVE are imported;
 * HISTORIC, PLANNED, PENDING, UNKNOWN and blank rows return null. The SOURCE, CREATE_BY and
 * UPDATE_BY columns can hold the name of a person and are never requested.
 */

function active(row: Row): boolean {
  return (row.STATUS ?? "").trim().toUpperCase() === "ACTIVE";
}

/**
 * Public Washrooms. CATEGORY (Portable, Comfort Station, Community Centre Washroom, City
 * Facility Washroom, Library Washroom) is the facility type and SUBCATEGORY (Public or
 * Patrons Only) is the access. The layer has no accessibility column, so wheelchair and
 * every other accessibility field stay UNKNOWN.
 */
export function mapKitchenerWashroom(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!active(row)) return null;
  const point = featurePoint(feature);
  return washroomRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "LANDMARK", ctx),
      ...pointFields(point, ctx),
      facility_type: published(row, "CATEGORY", ctx),
      access: published(row, "SUBCATEGORY", ctx),
      opening_hours: published(row, "HOURS_OF_OPERATION", ctx),
      ...civicColumns(row, "CIVIC_NO", "STREET", ctx),
      location: published(row, "COMMON_LOCATION_REFERENCE", ctx),
    },
    ctx,
  );
}

/**
 * Parking Public Lots (polygons). ACCESSIBLE_SPACES is the published count of accessible
 * spaces, including a published 0; -1 and blank stay UNKNOWN. The stored point is the
 * vertex mean of the lot outline.
 */
export function mapKitchenerParkingLot(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!active(row)) return null;
  const point = featureVertexMean(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "PARKING_FACILITY", ctx),
      category: published(row, "SUBCATEGORY", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
      ...civicColumns(row, "CIVIC_NO", "STREET", ctx),
      opening_hours: labelled(row, ["HOURS", "DAYS"], ctx),
      access: published(row, "PARKING_ACCESS", ctx),
      capacity_disabled: spaceCount(row, "ACCESSIBLE_SPACES", ctx),
      website: httpUrl(row, "PARKING_URL", ctx),
      ref: published(row, "PARKINGFACILITYID", ctx),
    },
    ctx,
  );
}

/** The CATEGORY token the Parking Features layer uses for a marked accessible parking location. */
export const KITCHENER_ACCESSIBLE_PARKING_CATEGORY = "HANDICAP PARKING";

/**
 * Parking Features. The layer mixes light poles, signs, entrances and pay machines. Only
 * ACTIVE points whose CATEGORY is the City's accessible-parking token are imported. The
 * token and the lot named in SUBCATEGORY are kept as published in wheelchair_description.
 * A point is one mapped feature; no space count is derived from it.
 */
export function mapKitchenerAccessibleParking(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!active(row)) return null;
  if ((row.CATEGORY ?? "").trim().toUpperCase() !== KITCHENER_ACCESSIBLE_PARKING_CATEGORY) return null;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "LOCATION_DESCRIPTION", ctx),
      category: dataset("accessible parking feature", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx),
      wheelchair_description: labelled(row, ["CATEGORY", "SUBCATEGORY"], ctx),
      ref: published(row, "PARKINGFEATUREID", ctx),
    },
    ctx,
  );
}

/**
 * Playgrounds (polygons). AODA_COMPLIANT is the City's flag and is kept as AODA_COMPLIANT=Y
 * or AODA_COMPLIANT=N; any other token stays UNKNOWN. The layer does not say what was
 * assessed, so wheelchair stays UNKNOWN. RESILIENT_SURFACE_MATERIAL (EWF, Sand, Rubber,
 * Asphalt) is the published play surface.
 */
export function mapKitchenerPlayground(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!active(row)) return null;
  const point = featureVertexMean(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "LANDMARK", ctx),
      category: published(row, "CATEGORY", ctx),
      category_group: dataset("playground", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
      ...civicColumns(row, "CIVIC_NO", "STREET", ctx),
      wheelchair_description: flag(row, "AODA_COMPLIANT", ["Y", "N"], ctx),
      surface: published(row, "RESILIENT_SURFACE_MATERIAL", ctx),
      ref: published(row, "LANDMARKID", ctx),
    },
    ctx,
  );
}

/**
 * Playground Equipment. ACCESSIBLE is the City's flag, kept as ACCESSIBLE=Y or ACCESSIBLE=N.
 * A row the City marks MEMORIAL = Y would carry a dedication in NAME, so its name is not read.
 */
export function mapKitchenerPlaygroundEquipment(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!active(row)) return null;
  const point = featurePoint(feature);
  const memorial = (row.MEMORIAL ?? "").trim().toUpperCase() !== "N";
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: memorial ? unknownField(ctx) : published(row, "NAME", ctx),
      category: published(row, "CATEGORY", ctx),
      category_group: dataset("playground", ctx),
      ...pointFields(point, ctx),
      wheelchair_description: flag(row, "ACCESSIBLE", ["Y", "N"], ctx),
      ref: published(row, "LANDMARKID", ctx),
    },
    ctx,
  );
}

const VIRTUAL = "NA (VIRTUAL LINK)";

function surface(row: Row, ctx: Provenance): FieldValue {
  const raw = row.SURFACE_MATERIAL ?? "";
  if (raw.trim().toUpperCase() === VIRTUAL) return unknownField(ctx, { source_key: "SURFACE_MATERIAL", raw });
  return published(row, "SURFACE_MATERIAL", ctx);
}

/** GRADE is filled with UNKNOWN or NONE on almost every row. Only another token is kept. */
function gradeAndFlags(row: Row, ctx: Provenance): FieldValue {
  const parts: { key: string; value: string }[] = [];
  for (const key of ["CURBCUT", "RAILING"]) {
    const token = (row[key] ?? "").trim().toUpperCase();
    if (token === "Y" || token === "N") parts.push({ key, value: token });
  }
  const grade = present(row, "GRADE");
  if (grade !== "") parts.push({ key: "GRADE", value: grade });
  if (parts.length === 0) return unknownField(ctx, { source_key: "CURBCUT,RAILING,GRADE" });
  return fv(parts.map((part) => `${part.key}=${part.value}`).join("; "), ctx, {
    source_key: parts.map((part) => part.key).join(","),
  });
}

/**
 * Sidewalks, Trails and Crosswalks share one active-transportation schema. SUBCATEGORY
 * (SIDEWALK, WALKWAY, BMUT, MUT, MAJOR TRAIL, CROSSWALK and so on) is the kind and
 * FEATURE_TYPE (SURFACE, STAIRS, BRIDGE, UNDERPASS, OVERPASS, BOARDWALK) is kept beside it,
 * so a stair segment stays marked as stairs. WIDTH_M is the published width in metres; 0
 * stays UNKNOWN. CURBCUT and RAILING are the City's Y or N flags and are kept as published
 * pairs: the layer does not say where on the segment the curb cut or railing is. Rows the
 * City publishes as a virtual network link are not a place to walk and return null.
 */
export function mapKitchenerPathSegment(feature: CityFeature, ctx: Provenance, crossing = false): DataRecord | null {
  const row = feature.attributes;
  if (!active(row)) return null;
  if ((row.FEATURE_TYPE ?? "").trim().toUpperCase() === VIRTUAL) return null;
  if ((row.CATEGORY ?? "").trim().toUpperCase() === "NETWORK LINKS") return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: published(row, "SUBCATEGORY", ctx),
      footway: published(row, "FEATURE_TYPE", ctx),
      surface: surface(row, ctx),
      width: positiveNumber(row, "WIDTH_M", ctx),
      wheelchair_description: gradeAndFlags(row, ctx),
      crossing: crossing ? published(row, "SUBCATEGORY", ctx) : unknownField(ctx),
    },
    ctx,
  );
}
