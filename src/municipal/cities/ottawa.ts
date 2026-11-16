import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  dataset,
  lineFields,
  pointFields,
  pointOf,
  present,
  published,
  regionOf,
  ringMeanOf,
  type Point,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";

/**
 * City of Ottawa layers retrieved on 2026-11-16 that the first Ottawa pass
 * (src/municipal/city-open-data.ts) confirmed the licence for and did not map.
 */

function link(row: Row, key: string, ctx: Provenance): FieldValue {
  return /^https?:\/\/\S+$/.test(present(row, key)) ? published(row, key, ctx) : unknownField(ctx, { source_key: key });
}

/**
 * City Facilities for Recreation Activities. A row is a building or an element of a
 * building, such as an arena inside a recreation complex. The layer has no accessibility
 * column, so every accessibility field stays UNKNOWN.
 */
export function mapOttawaRecreationFacility(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  const name = ["BUILDING_ELEMENT_DESC", "BUILDING_DESC", "BUSINESS_ENTITY_DESC"]
    .map((key) => published(row, key, ctx))
    .find((field) => field.value !== "UNKNOWN");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: name ?? unknownField(ctx),
      category: published(row, "BUILDING_ELEMENT_TYPE", ctx).value === "UNKNOWN" ? published(row, "BUILDING_TYPE", ctx) : published(row, "BUILDING_ELEMENT_TYPE", ctx),
      category_group: dataset("park_or_recreation_facility", ctx),
      ...pointFields(point, ctx),
      addr_housenumber: /^\d+$/.test(present(row, "ADDRNUM")) ? published(row, "ADDRNUM", ctx) : unknownField(ctx, { source_key: "ADDRNUM" }),
      addr_street: published(row, "FULLNAME", ctx),
      website: link(row, "LINK", ctx),
    },
    ctx,
  );
}

/** Ottawa Public Library Locations 2024. Name and address only; no accessibility column. */
export function mapOttawaLibrary(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${present(row, "Acronym") || row.ObjectId}`,
    regionOf(point),
    {
      name: published(row, "Name", ctx),
      category: dataset("library", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(point, ctx),
      ...civic(row.Street_Address ?? "", "Street_Address", ctx),
      addr_city: published(row, "City", ctx),
      addr_postcode: published(row, "Postal_Code", ctx),
      ref: published(row, "Acronym", ctx),
    },
    ctx,
  );
}

/**
 * Public Drinking Water Fountains. HOURS_OF_OPERATION is the City's sentence, such as
 * "Open during facility business hours", and is kept as published. No accessibility
 * column exists.
 */
export function mapOttawaDrinkingFountain(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  const inside = present(row, "INSIDE_OUTSIDE").toLowerCase();
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "BUILDING_NAME", ctx),
      category: dataset("drinking fountain", ctx),
      category_group: dataset("drinking_water", ctx),
      ...pointFields(point, ctx),
      ...civic(row.ADDRESS ?? "", "ADDRESS", ctx),
      opening_hours: published(row, "HOURS_OF_OPERATION", ctx),
      indoor:
        inside === "inside"
          ? fv("yes", ctx, { source_key: "INSIDE_OUTSIDE", raw: row.INSIDE_OUTSIDE ?? "" })
          : inside === "outside"
            ? fv("no", ctx, { source_key: "INSIDE_OUTSIDE", raw: row.INSIDE_OUTSIDE ?? "" })
            : unknownField(ctx, { source_key: "INSIDE_OUTSIDE", raw: row.INSIDE_OUTSIDE ?? "" }),
      website: link(row, "URL", ctx),
    },
    ctx,
  );
}

function ottawaFlag(row: Row, ctx: Provenance): FieldValue {
  if (!("ACCESSIBLE" in row)) return unknownField(ctx);
  const raw = row.ACCESSIBLE ?? "";
  const lowered = raw.trim().toLowerCase();
  if (lowered === "yes/oui" || lowered === "y") return fv("ACCESSIBLE=yes", ctx, { source_key: "ACCESSIBLE", raw });
  if (lowered === "no/non" || lowered === "n") return fv("ACCESSIBLE=no", ctx, { source_key: "ACCESSIBLE", raw });
  return unknownField(ctx, { source_key: "ACCESSIBLE", raw });
}

function publishedPoint(row: Row): Point {
  const lat = Number(row.LATITUDE);
  const lon = Number(row.LONGITUDE);
  if ((row.LATITUDE ?? "") === "" || (row.LONGITUDE ?? "") === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 41 || lat > 57.5 || lon < -96 || lon > -73.5) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

/**
 * Parks and Greenspace (parks inventory layer 24), one polygon per park. The point is the
 * City's published LATITUDE and LONGITUDE; when those are blank it is the vertex mean of
 * the outline. The ACCESSIBLE flag is kept as `ACCESSIBLE=yes` or `ACCESSIBLE=no`. The
 * layer does not say what was assessed, so wheelchair stays UNKNOWN.
 */
export function mapOttawaPark(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const stated = publishedPoint(row);
  const point = stated ?? ringMeanOf(feature);
  const street = ((row.ADDRESS ?? "").split(",")[0] ?? "").trim();
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "NAME", ctx),
      category: published(row, "PARK_TYPE", ctx),
      category_group: dataset("park", ctx),
      lat: pointFields(point, ctx, stated ? "LATITUDE" : "geometry:vertex_mean").lat,
      lon: pointFields(point, ctx, stated ? "LONGITUDE" : "geometry:vertex_mean").lon,
      ...civic(street, "ADDRESS", ctx),
      wheelchair_description: ottawaFlag(row, ctx),
      ref: published(row, "PARK_ID", ctx),
    },
    ctx,
  );
}

/** WALK_TYPE values on the Existing Pedestrian Network layer. Each one is a place to walk off the roadway. */
export const OTTAWA_WALK_TYPES: Readonly<Record<string, string>> = {
  SIDEWALK: "sidewalk",
  MUP: "multi-use pathway",
  PATH: "path",
};

/**
 * Existing Pedestrian Network. Only rows whose WALK_TYPE is SIDEWALK, MUP or PATH are
 * imported (others return null). MUP is spelled out from the City's layer names, which
 * call it a multi-use pathway. The layer has no surface, width, slope or curb column.
 */
export function mapOttawaPedestrianSegment(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  const raw = (row.WALK_TYPE ?? "").trim();
  const kind = OTTAWA_WALK_TYPES[raw.toUpperCase()];
  if (!kind) return null;
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: fv(kind, ctx, { source_key: "WALK_TYPE", raw }),
      footway: kind === "sidewalk" ? fv("sidewalk", ctx, { source_key: "WALK_TYPE", raw }) : unknownField(ctx, { source_key: "WALK_TYPE", raw }),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

export const OTTAWA_MORE_JOBS = [
  { id: "ottawa-recreation-facilities", tranches: ["venue" as const], map: mapOttawaRecreationFacility },
  { id: "ottawa-library-locations", tranches: ["venue" as const], map: mapOttawaLibrary },
  { id: "ottawa-drinking-fountains", tranches: ["venue" as const], map: mapOttawaDrinkingFountain },
  { id: "ottawa-parks", tranches: ["venue" as const], map: mapOttawaPark },
  { id: "ottawa-pedestrian-network", tranches: ["path" as const], map: mapOttawaPedestrianSegment },
];
