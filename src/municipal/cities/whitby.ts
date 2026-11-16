import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  labelled,
  pathRecords,
  pointFields,
  positiveNumber,
  present,
  published,
  regionOf,
  type CityFeature,
  type Row,
} from "./york-durham-shared.js";

/** Town of Whitby open data, retrieved 2026-11-16. */

/** Town Facilities (points). The layer has no accessibility column. */
export function mapWhitbyFacility(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: published(row, "NAME", ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "ADDRESS", ctx),
      addr_city: published(row, "TOWN", ctx),
      addr_postcode: published(row, "POSTCODE", ctx),
      website: /^https?:\/\/\S+$/.test(present(row, "URL")) ? published(row, "URL", ctx) : unknownField(ctx, { source_key: "URL" }),
    },
    ctx,
  );
}

/** Sidewalk types that are a place to walk. AsphaltCycleTrack is a cycling facility and is not imported. */
const WHITBY_WALKING_TYPES = new Set(["sidewalk", "multiusepath", "roundabout"]);

/** Ramp counts on a sidewalk segment. The layer's field aliases name each column. */
export const WHITBY_RAMP_COLUMNS: readonly string[] = ["NORRAMPS", "ACCRAMPS", "OTHRAMPS", "TOTRAMPS"];

/**
 * Sidewalks. The Town describes the layer as sidewalks it constructs or assumes within the
 * road allowance, so each line is a sidewalk, not a road centreline. Rows whose SIDEWALK
 * TYPE is not Sidewalk, MultiUsePath or Roundabout are skipped (null).
 *
 * LENGTH and WIDTH are stored as metres: the layer publishes AREA SQUARE METRES, which is
 * LENGTH times WIDTH. MATERIAL is stored as the published code. The ramp counts (NUMBER OF
 * RAMPS, NUMBER OF ACCESSIBLE RAMPS, NUMBER OF NON ACCESSIBLE RAMPS, TOTAL NUMBER OF RAMPS)
 * are kept as published counts with their column names. They are not turned into a ramp or
 * wheelchair yes or no, and the layer does not say where on the segment a ramp is.
 */
export function mapWhitbySidewalk(feature: CityFeature, ctx: Provenance): DataRecord[] | null {
  const row = feature.attributes;
  const type = present(row, "SW_TYPE");
  if (!WHITBY_WALKING_TYPES.has(type.toLowerCase())) return null;
  return pathRecords(feature, ctx, `${ctx.source_id}:${row.OBJECTID}`, (singlePart) => ({
    kind: published(row, "SW_TYPE", ctx),
    footway: type.toLowerCase() === "sidewalk" ? fv("sidewalk", ctx, { source_key: "SW_TYPE", raw: type }) : unknownField(ctx),
    surface: published(row, "MATERIAL", ctx),
    width: positiveNumber(row, "WIDTH", ctx),
    length_m: singlePart ? positiveNumber(row, "LENGTH", ctx) : unknownField(ctx, { source_key: "LENGTH" }),
    wheelchair_description: rampCounts(row, ctx),
  }));
}

function rampCounts(row: Row, ctx: Provenance): FieldValue {
  const stated = WHITBY_RAMP_COLUMNS.filter((key) => /^\d+$/.test((row[key] ?? "").trim()));
  if (stated.length === 0) return unknownField(ctx, { source_key: WHITBY_RAMP_COLUMNS.join(",") });
  return labelled(row, stated, ctx);
}

/** Trail asset types that are a place to walk. Storm-Service Lane is a maintenance lane and is not imported. */
const WHITBY_TRAIL_TYPES = new Set(["trail", "walkway", "trail crossing"]);

/**
 * Trails. ASSET TYPE and SURFACE CLASS are stored as published. A WIDTH of 0 is the layer's
 * blank and stays UNKNOWN. WIDTH and TRAIL LENGTH are stored as metres: the layer's AREA SQM
 * column is TRAIL LENGTH times WIDTH, and TRAIL LENGTH matched the drawn line's length in
 * metres. Rows whose STATUS is filled with anything other than Open are skipped (null), and
 * so are Storm-Service Lane rows.
 */
export function mapWhitbyTrail(feature: CityFeature, ctx: Provenance): DataRecord[] | null {
  const row = feature.attributes;
  if (!WHITBY_TRAIL_TYPES.has(present(row, "ASSET_TYPE").toLowerCase())) return null;
  const status = present(row, "STATUS").toLowerCase();
  if (status !== "" && status !== "open") return null;
  return pathRecords(feature, ctx, `${ctx.source_id}:${row.OBJECTID}`, (singlePart) => ({
    kind: published(row, "ASSET_TYPE", ctx),
    surface: published(row, "SURF_CLASS", ctx),
    width: positiveNumber(row, "WIDTH", ctx),
    length_m: singlePart ? positiveNumber(row, "TrailLength", ctx) : unknownField(ctx, { source_key: "TrailLength" }),
  }));
}

function amenityTokens(row: Row): string[] {
  return (row.AMENITIES ?? "")
    .split(/[,;]/)
    .map((token) => token.replace(/\s+/g, " ").trim())
    .filter((token) => token !== "");
}

/**
 * Parks (points). PARK AMENITIES is a comma-separated list. "Accessible Amenities" is the
 * Town's own flag: it is kept as published in wheelchair_description and does not say which
 * amenities it covers, so wheelchair stays UNKNOWN. "Washrooms" adds a washroom record. The
 * layer does not say where in the park the washroom is, so its coordinate is the park point,
 * marked derived. A park whose list has no such token gets no washroom record; an absent
 * token is not stored as a no.
 */
export function mapWhitbyPark(feature: CityFeature, ctx: Provenance): DataRecord[] {
  const row = feature.attributes;
  const tokens = amenityTokens(row).map((token) => token.toLowerCase());
  const venueId = `${ctx.source_id}:${row.OBJECTID_1}`;
  const venue = buildRecord(
    "venue",
    venueId,
    regionOf(feature),
    {
      name: published(row, "PARK_NAME", ctx),
      category: published(row, "CLASS", ctx),
      category_group: dataset("park", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "ADDRESS", ctx),
      wheelchair_description: tokens.includes("accessible amenities")
        ? fv("AMENITIES=Accessible Amenities", ctx, { source_key: "AMENITIES" })
        : unknownField(ctx, { source_key: "AMENITIES" }),
      ref: published(row, "FACILITYID", ctx),
    },
    ctx,
  );
  if (!tokens.includes("washrooms")) return [venue];
  const washroom = buildRecord(
    "washroom",
    `${venueId}:washroom`,
    regionOf(feature),
    {
      name: published(row, "PARK_NAME", ctx),
      ...pointFields(feature, ctx, "parent_geometry"),
      facility_type: fv("washrooms in a park", ctx, { source_key: "AMENITIES", raw: "Washrooms" }),
      address: published(row, "ADDRESS", ctx),
      building: dataset("park", ctx),
      parent_id: fv(venueId, ctx, { source_key: "OBJECTID_1" }),
    },
    ctx,
  );
  return [venue, washroom];
}
