import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import { splitCivicAddress } from "../municipal/map.js";

/**
 * Statistics Canada Linkable Open Data Environment (LODE) place databases, Ontario rows.
 *
 * Rules every mapper here follows:
 * - Ontario is the database's own province column (prov_terr, province_code or Prov_Terr),
 *   which Statistics Canada assigns from its 2021 census subdivision boundaries. The
 *   import also checks the point against the pipeline's Ontario box.
 * - Statistics Canada writes ".." for a value the source did not give. ".." and blanks stay
 *   UNKNOWN with the original token on `raw`.
 * - The ODSRF `accessible` column is kept as the publisher's flag text in
 *   wheelchair_description, as `accessible=<text as published>`. It is not turned into a
 *   wheelchair yes or no.
 * - No phone, email, contact-person, ownership or health-authority column is read.
 * - A healthcare facility name that names a person (Dr., MD, physician, surgeon, a
 *   professional corporation, or a row in the Integrated Community Health Services Centre
 *   class, which lists private clinics often named after a physician) is not stored; the
 *   place stays, with name UNKNOWN.
 * - Rows whose provider this repository has listed in sources/gaps.json (see
 *   LODE_EXCLUDED_PROVIDERS) are left out, and so are rows the database marks as coming
 *   from a listing that is not open data.
 */

export type LodeRow = Record<string, string>;
export interface LodeAnchor {
  lon: number;
  lat: number;
  key: string;
}

export type LodeDatabase = "statcan-odhf" | "statcan-odsrf" | "statcan-odef" | "statcan-odcaf";

/**
 * Providers whose rows are left out, by database, with the reason recorded in
 * sources/gaps.json. Names are as the database spells them (ODCAF in lower case).
 */
export const LODE_EXCLUDED_PROVIDERS: Readonly<Record<LodeDatabase, Readonly<Record<string, string>>>> = {
  "statcan-odhf": {
    "City of Barrie": "barrie",
    "City of London": "london",
    "Norfolk County": "norfolk",
  },
  "statcan-odsrf": {
    "City of Mississauga": "mississauga",
    "City of Burlington": "burlington",
    "City of Brantford": "brantford",
    "City of Barrie": "barrie",
    "City of London": "london",
    "Norfolk County": "norfolk",
  },
  "statcan-odef": {},
  "statcan-odcaf": {
    mississauga: "mississauga",
    "city of mississauga": "mississauga",
    burlington: "burlington",
    barrie: "barrie",
    london: "london",
    "norfolk county": "norfolk",
    "middlesex county": "middlesex",
    brampton: "brampton-terms",
    "city of brampton": "brampton-terms",
    "canadian museums association": "not-open-data",
  },
};

/** ODSRF category whose rows are trails and pathways (lines), not places. */
export const ODSRF_TRAIL_CATEGORY = "Trails and pathways";
/** ODCAF facility type for individual artists, left out under the personal-data rule. */
export const ODCAF_ARTIST_TYPE = "artist";

const MISSING = new Set(["", "..", "...", "none", "null", "n/a", "na", "unknown"]);

export function lodeValue(row: LodeRow, key: string): string {
  const trimmed = (row[key] ?? "").replace(/\s+/g, " ").trim();
  return MISSING.has(trimmed.toLowerCase()) ? "" : trimmed;
}

function lodeField(row: LodeRow, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const value = lodeValue(row, key);
  if (value === "") return unknownField(ctx, { source_key: key, raw: row[key] ?? "" });
  return fv(value, ctx, { source_key: key });
}

function dataset(value: string, ctx: Provenance): FieldValue {
  return fv(value, ctx, { source_key: "dataset" });
}

function civic(row: LodeRow, key: string, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const raw = lodeValue(row, key);
  if (raw === "") return { addr_housenumber: unknownField(ctx, { source_key: key, raw: row[key] ?? "" }), addr_street: unknownField(ctx, { source_key: key, raw: row[key] ?? "" }) };
  const split = splitCivicAddress(raw);
  return {
    addr_housenumber: split.housenumber ? fv(split.housenumber, ctx, { source_key: key }) : unknownField(ctx, { source_key: key }),
    addr_street: split.street ? fv(split.street, ctx, { source_key: key }) : unknownField(ctx, { source_key: key }),
  };
}

function inOntarioBox(lon: number, lat: number): boolean {
  return lat >= 41 && lat <= 57.5 && lon >= -96 && lon <= -73.5;
}

function anchorFields(anchor: LodeAnchor | null, ctx: Provenance): { region: string; lat: FieldValue; lon: FieldValue } {
  const usable = anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lon) && inOntarioBox(anchor.lon, anchor.lat) ? anchor : null;
  const lat = usable ? roundCoord(usable.lat) : null;
  const lon = usable ? roundCoord(usable.lon) : null;
  return {
    region: regionFromPoint(lat, lon),
    lat: coordinateField(lat, ctx, usable?.key ?? "geometry"),
    lon: coordinateField(lon, ctx, usable?.key ?? "geometry"),
  };
}

/** Why a row is left out, or null when it is imported. */
export function lodeExclusion(database: LodeDatabase, row: LodeRow): string | null {
  const provider = (row.provider ?? row.Provider ?? "").trim();
  const reason = LODE_EXCLUDED_PROVIDERS[database][provider];
  if (reason) return `provider:${reason}`;
  if (database === "statcan-odsrf" && (row.category ?? "").trim() === ODSRF_TRAIL_CATEGORY) return "trail";
  if (database === "statcan-odcaf" && (row.ODCAF_Facility_Type ?? "").trim().toLowerCase() === ODCAF_ARTIST_TYPE) return "artist";
  return null;
}

const PERSON_NAME = [
  /\bdr\b\.?/i,
  /\bm\.?\s?d\b\.?/i,
  /\bphysicians?\b/i,
  /\bsurgeons?\b/i,
  /\bprofessional\s+corp/i,
  /\bmedicine\s+prof/i,
  /\bd\.?d\.?s\b/i,
];
const ODHF_PERSON_CLASS = new Set(["integrated community health services centre"]);

/** True when a healthcare facility name may name a person; such a name is not stored. */
export function healthNameNamesPerson(name: string, sourceClass: string): boolean {
  if (ODHF_PERSON_CLASS.has(sourceClass.trim().toLowerCase())) return true;
  return PERSON_NAME.some((pattern) => pattern.test(name));
}

/** Open Database of Healthcare Facilities v2.0, one venue per row. */
export function mapOdhf(row: LodeRow, anchor: LodeAnchor | null, ctx: Provenance): DataRecord {
  const at = anchorFields(anchor, ctx);
  const rawName = lodeValue(row, "name");
  const withheld = rawName !== "" && healthNameNamesPerson(rawName, row.source_class ?? "");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.id}`,
    at.region,
    {
      name: withheld ? unknownField(ctx, { source_key: "name" }) : lodeField(row, "name", ctx),
      category_group: dataset("healthcare", ctx),
      category: lodeField(row, "type", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(row, "address", ctx),
      addr_city: lodeField(row, "csdname", ctx),
      ref: lodeField(row, "source_id", ctx),
    },
    ctx,
  );
}

/** Open Database of Sports and Recreational Facilities v2.0, one venue per non-trail row. */
export function mapOdsrf(row: LodeRow, anchor: LodeAnchor | null, ctx: Provenance): DataRecord {
  const at = anchorFields(anchor, ctx);
  const accessible = lodeValue(row, "accessible");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.id}`,
    at.region,
    {
      name: lodeField(row, "name", ctx),
      category_group: dataset("recreation", ctx),
      category: lodeField(row, "type", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(row, "address", ctx),
      addr_city: lodeField(row, "csdname", ctx),
      wheelchair_description:
        accessible === ""
          ? unknownField(ctx, { source_key: "accessible", raw: row.accessible ?? "" })
          : fv(`accessible=${accessible}`, ctx, { source_key: "accessible" }),
      ref: lodeField(row, "source_id", ctx),
    },
    ctx,
  );
}

/** Parses the ODEF geometry column, `POINT (lon lat)` in WGS84. */
export function odefPoint(raw: string): LodeAnchor | null {
  const match = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec((raw ?? "").trim());
  if (!match) return null;
  return { lon: Number(match[1]), lat: Number(match[2]), key: "geometry" };
}

/** Open Database of Educational Facilities v3.0.1, one venue per row with a point. */
export function mapOdef(row: LodeRow, ctx: Provenance): DataRecord {
  const at = anchorFields(odefPoint(row.geometry ?? ""), ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.unique_id}`,
    at.region,
    {
      name: lodeField(row, "facility_name", ctx),
      category_group: dataset("education", ctx),
      category: lodeField(row, "facility_type", ctx),
      lat: at.lat,
      lon: at.lon,
      ...civic(row, "streetAddress", ctx),
      addr_city: lodeField(row, "addressLocality", ctx),
      addr_postcode: lodeField(row, "postalCode", ctx),
      ref: lodeField(row, "school_id", ctx),
    },
    ctx,
  );
}

/** Open Database of Cultural and Art Facilities v1.0, one venue per row with a point. */
export function mapOdcaf(row: LodeRow, ctx: Provenance): DataRecord {
  const lat = Number(lodeValue(row, "Latitude") || Number.NaN);
  const lon = Number(lodeValue(row, "Longitude") || Number.NaN);
  const at = anchorFields(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, key: "Latitude,Longitude" } : null, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.Index}`,
    at.region,
    {
      name: lodeField(row, "Facility_Name", ctx),
      category_group: dataset("culture", ctx),
      category: lodeField(row, "ODCAF_Facility_Type", ctx),
      lat: at.lat,
      lon: at.lon,
      addr_housenumber: lodeField(row, "Street_No", ctx),
      addr_street: lodeField(row, "Street_Name", ctx),
      addr_unit: lodeField(row, "Unit", ctx),
      addr_city: lodeField(row, "City", ctx),
      addr_postcode: lodeField(row, "Postal_Code", ctx),
    },
    ctx,
  );
}
