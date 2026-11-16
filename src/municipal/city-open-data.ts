import { cell } from "../io/csv.js";
import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import { parseGeometry, pathPositions } from "../osm/geometry.js";
import { parsePointGeometry, splitCivicAddress } from "./map.js";

/**
 * Mappers for City of Toronto and City of Ottawa open-data files retrieved on 2026-11-16.
 *
 * Rules shared by every mapper here:
 * - a field is filled only from a column the publisher filled; blank, None, N/A and
 *   undefined codes stay UNKNOWN with the original token on `raw`;
 * - a column named "accessible" is kept as the publisher's flag in a description field.
 *   It is not turned into a wheelchair yes or no;
 * - phone, fax and email columns are not read.
 */

const BLANK = new Set(["", "none", "unknown", "n/a", "na", "null"]);

type Row = Record<string, string>;
type Point = { lon: number; lat: number } | null;

function published(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const trimmed = raw.trim();
  if (BLANK.has(trimmed.toLowerCase())) return unknownField(ctx, { source_key: key, raw });
  return fv(trimmed, ctx, { source_key: key });
}

function present(row: Row, key: string): string {
  const trimmed = (row[key] ?? "").trim();
  return BLANK.has(trimmed.toLowerCase()) ? "" : trimmed;
}

/** Joins filled columns as `COLUMN=value` pairs so the column name stays with the value. */
function labelled(row: Row, keys: string[], ctx: Provenance): FieldValue {
  const parts = keys.map((key) => ({ key, value: present(row, key) })).filter((part) => part.value !== "");
  if (parts.length === 0) return unknownField(ctx, { source_key: keys.join(",") });
  return fv(parts.map((part) => `${part.key}=${part.value}`).join("; "), ctx, {
    source_key: parts.map((part) => part.key).join(","),
  });
}

function civic(raw: string, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const trimmed = raw.replaceAll(" ", " ").replace(/\s+/g, " ").trim();
  if (BLANK.has(trimmed.toLowerCase())) {
    return { addr_housenumber: unknownField(ctx), addr_street: unknownField(ctx) };
  }
  const address = splitCivicAddress(trimmed);
  return {
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: key }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: key }) : unknownField(ctx),
  };
}

function pointFields(point: Point, ctx: Provenance, key: string): { lat: FieldValue; lon: FieldValue } {
  return {
    lat: coordinateField(point?.lat ?? null, ctx, key),
    lon: coordinateField(point?.lon ?? null, ctx, key),
  };
}

function region(point: Point): string {
  return regionFromPoint(point?.lat ?? null, point?.lon ?? null);
}

function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

/**
 * Off-Street Parking – Surface Lots – Accessible Stalls. One row is one stall.
 * The datastore field note calls AODA_TYPE an estimated stall type, "typically encoded
 * as Type A (Van Accessible) or Type B (Standard)", read from aerial imagery. The type,
 * the imagery source and the note are kept as published. A row with neither a type nor a
 * note keeps wheelchair_description UNKNOWN. No stall count is derived.
 */
export function mapTorontoAccessibleStall(row: Row, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  return buildRecord(
    "venue",
    `${ctx.source_id}:${cell(row, "_id")}`,
    region(point),
    {
      category: dataset("accessible parking stall", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx, "geometry"),
      wheelchair_description:
        present(row, "AODA_TYPE") === "" && present(row, "NOTES") === ""
          ? unknownField(ctx, { source_key: "AODA_TYPE", raw: row.AODA_TYPE ?? "" })
          : labelled(row, ["AODA_TYPE", "NOTES", "SOURCE"], ctx),
      ref: published(row, "CP_ID_TEXT", ctx),
    },
    ctx,
  );
}

/**
 * Traffic Signals Tabular, Traffic Signal resource. The publisher readme defines the
 * audible signal flag as "Enable with sound (=1), Not installed (=0)". Only 1 and 0 are
 * mapped. Blank and any other code, including -1, stay UNKNOWN.
 */
export function mapTorontoTrafficSignal(row: Row, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  const px = cell(row, "PX").trim() || cell(row, "_id");
  const streets = ["MAIN_STREET", "SIDE1_STREET", "SIDE2_STREET"]
    .map((key) => ({ key, value: present(row, key) }))
    .filter((part) => part.value !== "");
  const name =
    present(row, "MAIN_STREET") === ""
      ? unknownField(ctx, { source_key: "MAIN_STREET" })
      : fv(streets.map((part) => part.value).join(" / "), ctx, {
          source_key: streets.map((part) => part.key).join(","),
        });
  return buildRecord(
    "venue",
    `${ctx.source_id}:${px}`,
    region(point),
    {
      name,
      category: dataset("traffic signal", ctx),
      category_group: dataset("crossing", ctx),
      ...pointFields(point, ctx, "geometry"),
      speech_output: audibleSignal(row, ctx),
      ref: published(row, "PX", ctx),
    },
    ctx,
  );
}

function audibleSignal(row: Row, ctx: Provenance): FieldValue {
  const key = "AUDIBLEPEDSIGNAL";
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  if (raw === "1") return fv("yes", ctx, { source_key: key, raw });
  if (raw === "0") return fv("no", ctx, { source_key: key, raw });
  return unknownField(ctx, { source_key: key, raw });
}

/**
 * Library Branch General Information. The file has no accessibility column, so every
 * accessibility field stays UNKNOWN. Rows with PhysicalBranch other than 1 are not
 * buildings and are skipped (null). PublicWashroom = 1 adds a washroom record whose
 * coordinate is the branch point, marked derived.
 */
export function mapTorontoLibraryBranch(row: Row, ctx: Provenance): DataRecord[] | null {
  if (cell(row, "PhysicalBranch").trim() !== "1") return null;
  const point = parsePointGeometry(cell(row, "geometry"));
  const code = cell(row, "BranchCode").trim() || cell(row, "_id");
  const street = (cell(row, "Address").split(",")[0] ?? "").trim();
  const venueId = `${ctx.source_id}:${code}`;
  const venue = buildRecord(
    "venue",
    venueId,
    region(point),
    {
      name: published(row, "BranchName", ctx),
      category: dataset("library", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(point, ctx, "geometry"),
      ...civic(street, "Address", ctx),
      addr_postcode: published(row, "PostalCode", ctx),
      opening_hours: published(row, "Hours", ctx),
      website: published(row, "Website", ctx),
      ref: published(row, "BranchCode", ctx),
    },
    ctx,
  );
  if (cell(row, "PublicWashroom").trim() !== "1") return [venue];
  const washroom = buildRecord(
    "washroom",
    `${venueId}:washroom`,
    region(point),
    {
      name: published(row, "BranchName", ctx),
      lat: coordinateField(point?.lat ?? null, ctx, "parent_geometry", true),
      lon: coordinateField(point?.lon ?? null, ctx, "parent_geometry", true),
      facility_type: fv("public washroom in a library branch", ctx, { source_key: "PublicWashroom", raw: "1" }),
      opening_hours: published(row, "Hours", ctx),
      addr_postcode: published(row, "PostalCode", ctx),
      address: published(row, "Address", ctx),
      building: dataset("library", ctx),
      parent_id: fv(venueId, ctx, { source_key: "BranchCode" }),
    },
    ctx,
  );
  return [venue, washroom];
}

/**
 * Parks Drinking Fountains. ACCESSIBLE_FEATURES is kept as published text. The venue
 * schema has no status field, so the daily open or closed status is not stored.
 */
export function mapTorontoDrinkingFountain(row: Row, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  const id = cell(row, "ASSET_ID").trim() || cell(row, "_id");
  const name = ["ALTERNATIVE_NAME", "LOCATION", "AssetName"]
    .map((key) => published(row, key, ctx))
    .find((field) => field.value !== "UNKNOWN");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${id}`,
    region(point),
    {
      name: name ?? unknownField(ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset("drinking_water", ctx),
      ...pointFields(point, ctx, "geometry"),
      ...civic(cell(row, "ADDRESS"), "ADDRESS", ctx),
      opening_hours: published(row, "HOURS", ctx),
      website: published(row, "URL", ctx),
      wheelchair_description: published(row, "ACCESSIBLE_FEATURES", ctx),
      ref: published(row, "ASSET_ID", ctx),
    },
    ctx,
  );
}

/** Parks and Recreation Facilities. The file has no accessibility column. AMENITIES is not stored. */
export function mapTorontoParkFacility(row: Row, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  const id = cell(row, "LOCATIONID").trim() || cell(row, "_id");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${id}`,
    region(point),
    {
      name: published(row, "ASSET_NAME", ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset("park_or_recreation_facility", ctx),
      ...pointFields(point, ctx, "geometry"),
      ...civic(cell(row, "ADDRESS"), "ADDRESS", ctx),
      website: published(row, "URL", ctx),
      ref: published(row, "LOCATIONID", ctx),
    },
    ctx,
  );
}

function yesNoToken(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const lowered = raw.trim().toLowerCase();
  if (lowered === "yes") return fv("yes", ctx, { source_key: key, raw });
  if (lowered === "no") return fv("no", ctx, { source_key: key, raw });
  return unknownField(ctx, { source_key: key, raw });
}

function hrefOf(row: Row, key: string, ctx: Provenance): FieldValue {
  const raw = (row[key] ?? "").trim();
  if (BLANK.has(raw.toLowerCase())) return unknownField(ctx, { source_key: key });
  const match = /href="(https?:\/\/[^"]+)"/.exec(raw);
  if (match?.[1]) return fv(match[1], ctx, { source_key: key });
  if (/^https?:\/\/\S+$/.test(raw)) return fv(raw, ctx, { source_key: key });
  return unknownField(ctx, { source_key: key });
}

/**
 * Association of Community Centres. Only rows with Public Washroom = 1 become washroom
 * records. The Accessible column does not say whether it describes the washroom or the
 * building, so it is kept as the published flag and wheelchair stays UNKNOWN.
 */
export function mapTorontoCommunityCentreWashroom(row: Row, ctx: Provenance): DataRecord | null {
  if (cell(row, "Public Washroom").trim() !== "1") return null;
  const point = parsePointGeometry(cell(row, "geometry"));
  const id = cell(row, "AOCC ID").trim() || cell(row, "_id");
  return buildRecord(
    "washroom",
    `${ctx.source_id}:${id}`,
    region(point),
    {
      name: published(row, "Association of Community Centre Name", ctx),
      ...pointFields(point, ctx, "geometry"),
      facility_type: fv("public washroom in a community centre", ctx, { source_key: "Public Washroom", raw: "1" }),
      unisex: yesNoToken(row, "All Gender Washrooms", ctx),
      opening_hours: published(row, "Hours", ctx),
      addr_postcode: published(row, "Postal Code", ctx),
      address: fv(cell(row, "Address").replaceAll(" ", " ").replace(/\s+/g, " "), ctx, { source_key: "Address" }),
      description: published(row, "Washroom Details", ctx),
      published_accessibility: labelled(row, ["Accessible"], ctx),
      building: dataset("community centre", ctx),
      website: hrefOf(row, "Website", ctx),
    },
    ctx,
  );
}

const SIDEWALK_STATED = /^(?:sidewalk on (?:both sides|(?:north|south|east|west) side)|laneway with sidewalk on )/;
const PEDESTRIAN_ROAD_TYPES = new Set(["walkway", "trail", "pathway"]);

/**
 * True when the publisher states a place to walk on the segment: a sidewalk on both sides
 * or on a named side, a City walkway, a recreational trail, or a Walkway, Trail or Pathway
 * road type. Segments published with no sidewalk, a partial sidewalk, a laneway without a
 * sidewalk, a roadway under development, or no description on a road are not imported:
 * the line is the roadway, and a path record is read as somewhere a person can travel.
 */
export function torontoSegmentHasWalkway(row: Row): boolean {
  const description = (row.SIDEWALK_DESCRIPTION ?? "").trim().toLowerCase();
  if (SIDEWALK_STATED.test(description)) return true;
  if (description === "city walkway" || description === "recreational trail") return true;
  if (/^(?:no sidewalk|laneway without|partial sidewalk|laneway with at least partial|roadway under development)/.test(description)) {
    return false;
  }
  return PEDESTRIAN_ROAD_TYPES.has((row.ROAD_TYPE ?? "").trim().toLowerCase());
}

/**
 * Pedestrian Network. Only segments that pass torontoSegmentHasWalkway are imported (others
 * return null). ROAD_TYPE, the sidewalk description and the crosswalk type code are kept
 * as published. The readme gives LENGTH in metres. It does not define the crosswalk type
 * codes, so the code is stored unchanged. The line is the publisher's network line, which
 * follows the street for a sidewalk segment; it is not a surveyed sidewalk edge.
 */
export function mapTorontoPedestrianSegment(row: Row, ctx: Provenance): DataRecord | null {
  if (!torontoSegmentHasWalkway(row)) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(cell(row, "geometry"));
  } catch {
    parsed = null;
  }
  const drawn = pathPositions(parseGeometry(parsed));
  const anchor = drawn?.positions[0];
  const id = cell(row, "OBJECTID").trim() || cell(row, "_id");
  const length = Number(cell(row, "LENGTH"));
  const lengthRaw = cell(row, "LENGTH").trim();
  return buildRecord(
    "path",
    `${ctx.source_id}:${id}`,
    regionFromPoint(anchor ? anchor[1] : null, anchor ? anchor[0] : null),
    {
      kind: published(row, "ROAD_TYPE", ctx),
      footway: published(row, "SIDEWALK_DESCRIPTION", ctx),
      crossing: published(row, "CROSSWALK_TYPE", ctx),
      length_m:
        lengthRaw !== "" && Number.isFinite(length) && length > 0
          ? fv(Math.round(length * 100) / 100, ctx, { source_key: "LENGTH", raw: lengthRaw })
          : unknownField(ctx, { source_key: "LENGTH", raw: lengthRaw }),
      geometry: drawn ? fv(drawn.positions, ctx, { source_key: "geometry" }) : unknownField(ctx),
      geometry_type: drawn ? fv(drawn.geometryType, ctx, { source_key: "geometry" }) : unknownField(ctx),
    },
    ctx,
  );
}

/** A feature from an ArcGIS REST query with outSR=4326: attributes as strings, point as x and y. */
export interface ArcFeature {
  attributes: Row;
  x: number | null;
  y: number | null;
}

export function arcFeature(raw: { attributes?: Record<string, unknown>; geometry?: { x?: unknown; y?: unknown } }): ArcFeature {
  const attributes: Row = {};
  for (const [key, value] of Object.entries(raw.attributes ?? {})) {
    attributes[key] = value === null || value === undefined ? "" : String(value);
  }
  const x = typeof raw.geometry?.x === "number" && Number.isFinite(raw.geometry.x) ? raw.geometry.x : null;
  const y = typeof raw.geometry?.y === "number" && Number.isFinite(raw.geometry.y) ? raw.geometry.y : null;
  return { attributes, x, y };
}

function arcPoint(feature: ArcFeature): Point {
  if (feature.x === null || feature.y === null) return null;
  if (feature.y < 41 || feature.y > 57.5 || feature.x < -96 || feature.x > -73.5) return null;
  return { lon: roundCoord(feature.x), lat: roundCoord(feature.y) };
}

/** Coded yes/no domain used by the Ottawa washroom layer: 1 = Yes/Oui, 0 = No/Non, NA = not applicable. */
function codedYesNo(row: Row, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  if (raw === "1") return fv("yes", ctx, { source_key: key, raw });
  if (raw === "0") return fv("no", ctx, { source_key: key, raw });
  return unknownField(ctx, { source_key: key, raw });
}

/** Accessibility Rating domain on the Ottawa Public Washrooms layer, read 2026-11-16. */
export const OTTAWA_WASHROOM_RATING: Record<string, string> = {
  "0": "0 - No Accessibility",
  "1": "1 - Minimal Accessibility",
  "2": "2 - Moderate Accessibility",
  "3": "3 - Maximum Accessibility",
};

const DAYS: [string, string][] = [
  ["Mo", "MONDAY"],
  ["Tu", "TUESDAY"],
  ["We", "WEDNESDAY"],
  ["Th", "THURSDAY"],
  ["Fr", "FRIDAY"],
  ["Sa", "SATURDAY"],
  ["Su", "SUNDAY"],
];

function ottawaHours(row: Row, ctx: Provenance): FieldValue {
  const parts: string[] = [];
  const keys: string[] = [];
  for (const [short, day] of DAYS) {
    const open = (row[`HOURS_${day}_OPEN`] ?? "").trim();
    const closed = (row[`HOURS_${day}_CLOSED`] ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(closed)) continue;
    parts.push(`${short} ${open}-${closed}`);
    keys.push(`HOURS_${day}_OPEN`, `HOURS_${day}_CLOSED`);
  }
  if (parts.length === 0) return unknownField(ctx);
  return fv(parts.join("; "), ctx, { source_key: keys.join(",") });
}

/**
 * City of Ottawa Public Washrooms. The layer lists every City building. Only rows with
 * PUBLIC_TOILETS_YN = 1 (Yes/Oui) are washrooms (others return null). The Accessibility
 * Rating is kept as the publisher's rating label. It is not turned into wheelchair yes or no.
 */
export function mapOttawaPublicWashroom(feature: ArcFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if ((row.PUBLIC_TOILETS_YN ?? "").trim() !== "1") return null;
  const point = arcPoint(feature);
  const ratingRaw = (row.ACCESSIBILITY ?? "").trim();
  const rating = OTTAWA_WASHROOM_RATING[ratingRaw];
  const seasonalRaw = (row.SEASONAL ?? "").trim();
  const address = (row.ADDRESS ?? "").replace(/\s+/g, " ").trim();
  return buildRecord(
    "washroom",
    `${ctx.source_id}:${(row.UNIQUE_ID ?? "").trim() || row.OBJECTID}:${row.OBJECTID}`,
    region(point),
    {
      name: published(row, "NAME", ctx),
      ...pointFields(point, ctx, "geometry"),
      facility_type:
        (row.FAMILY_TOILET ?? "").trim() === "1"
          ? fv("family toilet", ctx, { source_key: "FAMILY_TOILET", raw: "1" })
          : unknownField(ctx, { source_key: "FAMILY_TOILET", raw: row.FAMILY_TOILET ?? "" }),
      changing_table: codedYesNo(row, "CHANGE_STATION_CHILD", ctx),
      adult_changing_table: codedYesNo(row, "CHANGE_STATION_ADULT", ctx),
      opening_hours: ottawaHours(row, ctx),
      ...civic(address, "ADDRESS", ctx),
      seasonal:
        seasonalRaw === "1"
          ? fv("yes", ctx, { source_key: "SEASONAL", raw: seasonalRaw })
          : seasonalRaw === "0"
            ? fv("no", ctx, { source_key: "SEASONAL", raw: seasonalRaw })
            : unknownField(ctx, { source_key: "SEASONAL", raw: seasonalRaw }),
      published_accessibility: rating
        ? fv(rating, ctx, { source_key: "ACCESSIBILITY", raw: ratingRaw })
        : unknownField(ctx, { source_key: "ACCESSIBILITY", raw: ratingRaw }),
      building: published(row, "FACILITY_GROUP_NAME", ctx),
    },
    ctx,
  );
}

/** The Ottawa parks inventory writes its bilingual yes/no domain as yes/oui, no/non, y or n. */
function ottawaFlag(row: Row, key: string): "yes" | "no" | null {
  const raw = (row[key] ?? "").trim().toLowerCase();
  if (raw === "yes/oui" || raw === "y") return "yes";
  if (raw === "no/non" || raw === "n") return "no";
  return null;
}

function cityAccessibleFlag(row: Row, ctx: Provenance): FieldValue {
  if (!("ACCESSIBLE" in row)) return unknownField(ctx);
  const flag = ottawaFlag(row, "ACCESSIBLE");
  const raw = row.ACCESSIBLE ?? "";
  if (!flag) return unknownField(ctx, { source_key: "ACCESSIBLE", raw });
  return fv(`ACCESSIBLE=${flag}`, ctx, { source_key: "ACCESSIBLE", raw });
}

/**
 * City of Ottawa parks inventory point layers. The City's ACCESSIBLE flag is kept as
 * `ACCESSIBLE=yes` or `ACCESSIBLE=no` in wheelchair_description. The layer does not say
 * what was assessed, so wheelchair stays UNKNOWN. The bench layer's NAME column holds
 * memorial dedications, which are names of people, so the importer passes no name keys
 * for that layer and the plaque text is never read.
 */
export function mapOttawaParkFeature(
  feature: ArcFeature,
  layerId: number,
  layerName: string,
  ctx: Provenance,
  nameKeys: readonly string[] = ["NAME", "PARKNAME"],
): DataRecord {
  const row = feature.attributes;
  const point = arcPoint(feature);
  const name = nameKeys.map((key) => published(row, key, ctx)).find((field) => field.value !== "UNKNOWN");
  const lit = ottawaFlag(row, "LIGHTING");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${layerId}:${row.OBJECTID}`,
    region(point),
    {
      name: name ?? unknownField(ctx),
      category: fv(layerName, ctx, { source_key: "layer" }),
      category_group: dataset("park_feature", ctx),
      ...pointFields(point, ctx, "geometry"),
      wheelchair_description: cityAccessibleFlag(row, ctx),
      surface: "SURFACE" in row ? published(row, "SURFACE", ctx) : unknownField(ctx),
      lit: lit ? fv(lit, ctx, { source_key: "LIGHTING", raw: row.LIGHTING ?? "" }) : unknownField(ctx),
      ref: published(row, "FACILITYID", ctx),
    },
    ctx,
  );
}

/**
 * City of Ottawa parking lots in City parkland. ACCESSIBLE_PARKING_CAPACITY is the
 * published count of accessible spaces, including a published 0.
 */
export function mapOttawaParkParking(feature: ArcFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = arcPoint(feature);
  const capacityRaw = (row.ACCESSIBLE_PARKING_CAPACITY ?? "").trim();
  const capacity = Number(capacityRaw);
  const lit = ottawaFlag(row, "LIGHTING");
  const street = ((row.ADDRESS ?? "").split(",")[0] ?? "").trim();
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    region(point),
    {
      name: published(row, "PARKNAME", ctx),
      category: dataset("parking lot in City parkland", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx, "geometry"),
      ...civic(street, "ADDRESS", ctx),
      capacity_disabled:
        capacityRaw !== "" && Number.isInteger(capacity) && capacity >= 0
          ? fv(capacity, ctx, { source_key: "ACCESSIBLE_PARKING_CAPACITY", raw: capacityRaw })
          : unknownField(ctx, { source_key: "ACCESSIBLE_PARKING_CAPACITY", raw: capacityRaw }),
      wheelchair_description: cityAccessibleFlag(row, ctx),
      surface: published(row, "SURFACE", ctx),
      lit: lit ? fv(lit, ctx, { source_key: "LIGHTING", raw: row.LIGHTING ?? "" }) : unknownField(ctx),
      ref: published(row, "FACILITYID", ctx),
    },
    ctx,
  );
}
