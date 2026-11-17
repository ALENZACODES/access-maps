import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import { splitCivicAddress } from "../municipal/map.js";

/**
 * Province of Ontario place files downloaded from the Ontario Data Catalogue
 * (data.ontario.ca and files.ontario.ca) under the Open Government Licence – Ontario.
 *
 * Rules every mapper here follows:
 * - a field is filled only from a column the publisher filled; blanks and NA-style tokens
 *   stay UNKNOWN with the original token on `raw`;
 * - the point is the file's own Latitude and Longitude columns, kept only inside the
 *   pipeline's Ontario box;
 * - phone, fax, email, website and contact columns are never read, and nothing about a
 *   school's students is read;
 * - none of these files has an accessibility column, so every accessibility field is
 *   UNKNOWN.
 */

export type CatalogueRow = Record<string, string>;

const MISSING = new Set(["", "na", "n/a", "n/d", "null", "none", "unknown"]);

export function catalogueValue(row: CatalogueRow, key: string): string {
  const trimmed = (row[key] ?? "").replace(/\s+/g, " ").trim();
  return MISSING.has(trimmed.toLowerCase()) ? "" : trimmed;
}

function field(row: CatalogueRow, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const value = catalogueValue(row, key);
  if (value === "") return unknownField(ctx, { source_key: key, raw: row[key] ?? "" });
  return fv(value, ctx, { source_key: key });
}

function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

function pointOf(row: CatalogueRow, latKey: string, lonKey: string, ctx: Provenance): { region: string; lat: FieldValue; lon: FieldValue } {
  const lat = Number(catalogueValue(row, latKey) || Number.NaN);
  const lon = Number(catalogueValue(row, lonKey) || Number.NaN);
  const usable = Number.isFinite(lat) && Number.isFinite(lon) && lat >= 41 && lat <= 57.5 && lon >= -96 && lon <= -73.5;
  const key = `${latKey},${lonKey}`;
  return {
    region: usable ? regionFromPoint(roundCoord(lat), roundCoord(lon)) : "unknown",
    lat: coordinateField(usable ? roundCoord(lat) : null, ctx, key),
    lon: coordinateField(usable ? roundCoord(lon) : null, ctx, key),
  };
}

function civic(raw: string, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (MISSING.has(trimmed.toLowerCase())) return { addr_housenumber: unknownField(ctx, { source_key: key }), addr_street: unknownField(ctx, { source_key: key }) };
  const split = splitCivicAddress(trimmed);
  return {
    addr_housenumber: split.housenumber ? fv(split.housenumber, ctx, { source_key: key }) : unknownField(ctx, { source_key: key }),
    addr_street: fv(split.street, ctx, { source_key: key }),
  };
}

/** A lower-case id part built from published values: letters and digits joined by hyphens. */
export function slugId(...parts: string[]): string {
  return parts
    .map((part) => part.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter((part) => part !== "")
    .join("_");
}

/** School Information and Student Demographics (publicly funded schools). Only location columns are read. */
export function mapPublicSchool(row: CatalogueRow, ctx: Provenance): DataRecord {
  const at = pointOf(row, "Latitude", "Longitude", ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${catalogueValue(row, "School Number")}`,
    at.region,
    {
      name: field(row, "School Name", ctx),
      category_group: dataset("education", ctx),
      category: field(row, "School Level", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(row.Street ?? "", "Street", ctx),
      addr_unit: field(row, "Building Suite", ctx),
      addr_city: field(row, "City", ctx),
      addr_postcode: field(row, "Postal Code", ctx),
      operator: field(row, "Board Name", ctx),
      ref: field(row, "School Number", ctx),
    },
    ctx,
  );
}

/**
 * Private School Location List. A school's main location (School Main Location Flag T)
 * keeps the school number as its id; another location adds its street address to the id.
 */
export function mapPrivateSchool(row: CatalogueRow, ctx: Provenance): DataRecord {
  const at = pointOf(row, "Latitude", "Longitude", ctx);
  const number = catalogueValue(row, "School Number");
  const main = (row["School Main Location Flag"] ?? "").trim() === "T";
  const street = [catalogueValue(row, "Street Name"), catalogueValue(row, "Street Type")].filter(Boolean).join(" ");
  const id = main ? number : `${number}:${slugId(catalogueValue(row, "Street Number"), street, catalogueValue(row, "City"))}`;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${id}`,
    at.region,
    {
      name: field(row, "School Name", ctx),
      category_group: dataset("education", ctx),
      category: field(row, "School Level", ctx),
      lat: at.lat,
      lon: at.lon,
      addr_housenumber: field(row, "Street Number", ctx),
      addr_street: street === "" ? unknownField(ctx, { source_key: "Street Name,Street Type" }) : fv(street, ctx, { source_key: "Street Name,Street Type" }),
      addr_unit: field(row, "Suite", ctx),
      addr_city: field(row, "City", ctx),
      addr_postcode: field(row, "Postal Code", ctx),
      ref: field(row, "School Number", ctx),
    },
    ctx,
  );
}

const LIQUOR_KINDS = ["Ontario_producer", "LCBO_convenience_outlet", "Bottle_return_only"] as const;

/** The id of a row in Where to buy alcoholic beverages: its published name and address. */
export function liquorId(row: CatalogueRow): string {
  return slugId(catalogueValue(row, "Location"), catalogueValue(row, "Address"), catalogueValue(row, "City/Town"), catalogueValue(row, "Postal_code"));
}

/** Where to buy alcoholic beverages (retail sales locations). The Y flags that say what kind of place it is are kept as COLUMN=Y text in category. */
export function mapLiquorRetail(row: CatalogueRow, ctx: Provenance): DataRecord {
  const at = pointOf(row, "Latitude", "Longitude", ctx);
  const kinds = LIQUOR_KINDS.filter((key) => (row[key] ?? "").trim() === "Y");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${liquorId(row)}`,
    at.region,
    {
      name: field(row, "Location", ctx),
      category_group: dataset("alcohol_retail", ctx),
      category: kinds.length > 0 ? fv(kinds.map((key) => `${key}=Y`).join("; "), ctx, { source_key: kinds.join(",") }) : unknownField(ctx, { source_key: LIQUOR_KINDS.join(",") }),
      lat: at.lat,
      lon: at.lon,
      ...civic(row.Address ?? "", "Address", ctx),
      addr_city: field(row, "City/Town", ctx),
      addr_postcode: field(row, "Postal_code", ctx),
    },
    ctx,
  );
}

/** Strips the single quotes the courthouse file puts around its header names. */
export function unquoteHeaders(row: CatalogueRow): CatalogueRow {
  const out: CatalogueRow = {};
  for (const [key, value] of Object.entries(row)) out[key.replace(/^'+|'+$/g, "").trim()] = value;
  return out;
}

/** Latitude and Longitude of Ontario Courthouses. */
export function mapCourthouse(row: CatalogueRow, ctx: Provenance): DataRecord {
  const at = pointOf(row, "Bldg_Latitude", "Bldg_Longitude", ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${slugId(catalogueValue(row, "Bldg_Ministry_Official_Name"))}`,
    at.region,
    {
      name: field(row, "Bldg_Ministry_Official_Name", ctx),
      category_group: dataset("civic_facility", ctx),
      category: dataset("courthouse", ctx),
      lat: at.lat,
      lon: at.lon,
      addr_city: field(row, "Bldg_City", ctx),
      addr_postcode: field(row, "Bldg_Postal_Code", ctx),
    },
    ctx,
  );
}

/**
 * Seniors Active Living Centre Locations. The Address column is either a street address
 * or a building name; when it does not start with a number, the 2nd Address Line is used
 * for the street address if that one does.
 */
export function mapSeniorsCentre(row: CatalogueRow, ctx: Provenance): DataRecord {
  const at = pointOf(row, "Latitude", "Longitude", ctx);
  const first = catalogueValue(row, "Address");
  const second = catalogueValue(row, "2nd Address Line");
  const [street, key] = /^\d/.test(first) ? [first, "Address"] : /^\d/.test(second) ? [second, "2nd Address Line"] : ["", "Address"];
  return buildRecord(
    "venue",
    `${ctx.source_id}:${catalogueValue(row, "ID")}`,
    at.region,
    {
      name: field(row, "Organization name", ctx),
      category_group: dataset("community_centre", ctx),
      category: dataset("seniors active living centre", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(street, key, ctx),
      addr_city: field(row, "City/Ville", ctx),
      // The header is published with a line break: "Postal Code/\nCode postale".
      addr_postcode: field(row, "Postal Code/\nCode postale" in row ? "Postal Code/\nCode postale" : "Postal Code/Code postale", ctx),
    },
    ctx,
  );
}

/** Ontario's Adult Provincial Correctional Institutions. Rows with Operating_Status Closed are not imported. */
export function mapCorrectionalInstitution(row: CatalogueRow, ctx: Provenance): DataRecord | null {
  if ((row.Operating_Status ?? "").trim() !== "Open") return null;
  const at = pointOf(row, "Latitude", "Longitude", ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${slugId(catalogueValue(row, "Institution"))}`,
    at.region,
    {
      name: field(row, "Institution", ctx),
      category_group: dataset("civic_facility", ctx),
      category: field(row, "Facility_Type", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(row.Street ?? "", "Street", ctx),
      addr_city: field(row, "City", ctx),
      addr_postcode: field(row, "Postal_Code", ctx),
    },
    ctx,
  );
}
