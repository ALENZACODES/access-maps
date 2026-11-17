import { splitCivicAddress } from "../municipal/map.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import { buildRecord, coordinateField, regionFromPoint, type DataRecord } from "../model/records.js";

/**
 * Overture Maps Foundation places theme, mapped to venue records.
 *
 * Release and licences were read on docs.overturemaps.org on 2026-11-16:
 * the release page names 2026-10-21.0 as the current release, and the
 * Attribution and Licensing page gives a licence per places source
 * (CDLA Permissive 2.0 for Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC,
 * BrightQuery, Birdeye, Uberall and OpenTravel Alliance; Apache 2.0 for
 * Foursquare; CC0 1.0 for AllThePlaces). Every place carries its own
 * `sources[].license`; a place is kept only when every one of them is in
 * PERMISSIVE_LICENCES.
 *
 * Overture does not publish wheelchair or any other accessibility attribute
 * for places, so every accessibility field stays UNKNOWN.
 */

export const OVERTURE_RELEASE = "2026-10-21.0";

/** Licences of places sources that permit redistribution, as read on 2026-11-16. */
export const PERMISSIVE_LICENCES: ReadonlySet<string> = new Set(["CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"]);

/**
 * One registry source per combination of source licences, so that every field
 * carries the licence of the data it came from.
 */
export const OVERTURE_SOURCES = [
  { id: "overture-places", licences: ["CDLA-Permissive-2.0"] },
  { id: "overture-places-foursquare", licences: ["Apache-2.0", "CDLA-Permissive-2.0"] },
  { id: "overture-places-alltheplaces", licences: ["CC0-1.0", "CDLA-Permissive-2.0"] },
] as const;

export type OvertureSourceId = (typeof OVERTURE_SOURCES)[number]["id"];

/**
 * Lowest Overture confidence kept. Overture defines confidence as "a value
 * between 0 and 1 representing the likelihood that the place exists", says it
 * is not calibrated to be strictly comparable across providers, and asks users
 * to "treat the score as a relative filtering tool rather than a precise
 * probability". It does not recommend a cut-off.
 *
 * Measured on the 2026-10-21.0 Ontario rows (not permanently closed): the
 * share of places with an OpenStreetMap venue of the same normalized name in
 * the same or a neighbouring grid cell (0.002 degrees latitude by 0.00286
 * degrees longitude, so within about 200 to 650 m) rises with confidence:
 * 0.2% below 0.1, 0.4% to 1.3% from 0.1 to 0.4, 2.1% from 0.4 to 0.5, 2.5%
 * from 0.5 to 0.6, 4.1% to 8.3% from 0.6 to 0.95, and 25% at 0.95 and above.
 * Places kept at each floor: 0 -> 616,993; 0.3 -> 556,905; 0.4 -> 528,772;
 * 0.5 -> 505,010; 0.6 -> 473,016; 0.77 -> 427,145; 0.9 -> 227,894;
 * 0.95 -> 188,880. A floor of 0.5 drops the 111,983 places in the bands
 * where corroboration is lowest (2.1% or less) and keeps every Foursquare
 * place (Foursquare places carry a confidence of about 0.77).
 */
export const CONFIDENCE_FLOOR = 0.5;

/**
 * Overture taxonomy categories for individual health practitioners and
 * practices. They match the OpenStreetMap categories whose name, operator,
 * brand and website the OSM mapper does not keep (amenity=doctors and
 * dentist; healthcare=doctor, dentist, psychotherapist, physiotherapist,
 * psychologist, podiatrist, occupational_therapist, speech_therapist,
 * midwife, nurse, counsellor, alternative, audiologist, optometrist).
 * The same fields are left UNKNOWN here. Hospitals, clinics, laboratories
 * and other facilities keep their names.
 */
export const PRACTITIONER_CATEGORIES: ReadonlySet<string> = new Set([
  // doctor (physician practices and specialties)
  "doctors_office", "family_practice", "aesthetic_medicine", "allergy_and_immunology", "anesthesiology",
  "cardiology", "child_psychiatry", "cosmetic_surgery", "dermatology", "ear_nose_and_throat",
  "endocrinology", "gastroenterology", "gerontology", "hematology", "internal_medicine", "neurology",
  "neuropathology", "obstetrics_and_gynecology", "occupational_medicine", "oncology", "ophthalmology",
  "orthopedics", "pain_management", "pathology", "pediatric_cardiology", "plastic_and_reconstructive_surgery",
  "preventive_medicine", "psychiatry", "pulmonology", "rheumatology", "sleep_medicine", "sports_medicine",
  "urology",
  // dentist
  "dental_clinic", "general_dentistry", "cosmetic_dentistry", "pediatric_dentistry", "orthodontics",
  "endodontics", "periodontics", "prosthodontics", "oral_and_maxillofacial_surgery", "dental_hygiene",
  // psychotherapist, psychologist, counsellor
  "psychotherapy", "sex_therapy", "hypnotherapy", "psychology", "sports_psychology", "behavior_analysis",
  "counseling", "family_counseling", "marriage_or_relationship_counseling",
  // physiotherapist, podiatrist, occupational and speech therapist, midwife, nurse
  "physical_therapy", "podiatry", "occupational_therapy", "speech_therapy", "midwifery", "doula_service", "nursing",
  // alternative
  "acupuncture", "aromatherapy", "chiropractic", "complementary_and_alternative_medicine", "homeopathy",
  "naturopathic_medicine", "osteopathic_medicine", "reflexology", "reiki",
  // audiologist, optometrist
  "audiology", "optometry",
  // registered massage therapists are a regulated health profession in Ontario;
  // Foursquare lists many of them under the therapist's own name
  "massage_therapy",
]);

export interface OvertureSourceRef {
  dataset: string | null;
  license: string | null;
  property: string | null;
  update_time: string | null;
}

/** One row of tools/overture/extract_places.py output. */
export interface OverturePlaceRow {
  id: string;
  lon: number;
  lat: number;
  geometry_type?: string | null;
  confidence: number | null;
  operating_status: string | null;
  name: string | null;
  basic_category: string | null;
  taxonomy_primary: string | null;
  brand: string | null;
  websites: string[] | null;
  address: { freeform: string | null; locality: string | null; postcode: string | null; region: string | null; country: string | null } | null;
  sources: OvertureSourceRef[] | null;
}

export type ExclusionReason =
  | "not_a_point"
  | "outside_ontario"
  | "licence_not_permissive"
  | "licence_combination_unmapped"
  | "permanently_closed"
  | "below_confidence_floor"
  | "no_name";

/**
 * Picks the registry source for a place from the licences of its sources, or
 * says why the place is left out. A place with any source whose licence is
 * not in PERMISSIVE_LICENCES is left out whole.
 */
export function classifyLicences(row: OverturePlaceRow): { sourceId: OvertureSourceId } | { excluded: "licence_not_permissive" | "licence_combination_unmapped" } {
  const licences = [...new Set((row.sources ?? []).map((source) => source.license ?? ""))].sort();
  if (licences.length === 0 || licences.some((licence) => !PERMISSIVE_LICENCES.has(licence))) return { excluded: "licence_not_permissive" };
  const key = licences.join("|");
  const match = OVERTURE_SOURCES.find((source) => [...source.licences].sort().join("|") === key);
  return match ? { sourceId: match.id } : { excluded: "licence_combination_unmapped" };
}

/** Filters that do not need the boundary or the other rows. Returns null when the row is kept. */
export function rowExclusion(row: OverturePlaceRow, floor = CONFIDENCE_FLOOR): ExclusionReason | null {
  if (row.operating_status === "permanently_closed") return "permanently_closed";
  if (typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < floor) return "below_confidence_floor";
  if (!row.name || row.name.trim() === "") return "no_name";
  return null;
}

/**
 * Key for exact duplicates inside the Overture release: the same name
 * (trimmed, case-folded) at the same coordinates to six decimals. Of each
 * group the place with the highest confidence is kept (then the smallest id).
 */
export function duplicateKey(row: OverturePlaceRow): string {
  return `${(row.name ?? "").trim().toLowerCase()}\u0000${row.lat.toFixed(6)}\u0000${row.lon.toFixed(6)}`;
}

export function prefers(a: { id: string; confidence: number }, b: { id: string; confidence: number }): boolean {
  return a.confidence > b.confidence || (a.confidence === b.confidence && a.id < b.id);
}

export function recordId(overtureId: string): string {
  return `overture:${overtureId}`;
}

/**
 * Latest update_time of the sources that supplied the whole place (property
 * ""), as published. Sources for one property, such as Overture's own
 * confidence score, are not the place's update.
 */
export function latestUpdate(row: OverturePlaceRow): string | null {
  const times = (row.sources ?? [])
    .filter((source) => (source.property ?? "") === "")
    .map((source) => source.update_time ?? "")
    .filter((time) => /^\d{4}-\d{2}-\d{2}/.test(time));
  return times.length ? times.sort().at(-1) ?? null : null;
}

/** Maps one kept place to a venue record. */
export function mapOverturePlace(row: OverturePlaceRow, ctx: Provenance): DataRecord {
  const practitioner = row.taxonomy_primary !== null && PRACTITIONER_CATEGORIES.has(row.taxonomy_primary);
  const text = (value: string | null | undefined, key: string): FieldValue =>
    typeof value === "string" ? fv(value, ctx, { source_key: key }) : unknownField(ctx);
  const website = (row.websites ?? []).find((url) => /^https?:\/\/\S+$/i.test(url.trim()));
  const updated = latestUpdate(row);
  const publisher = [`confidence=${row.confidence}`, updated ? `update_time=${updated}` : null].filter(Boolean).join("; ");
  // Categories are stored as Overture publishes them (basic_category and
  // taxonomy.primary). They are not translated into OSM keys or into the
  // municipal category words: no Overture category was found to mean exactly
  // the same as one of those, so no mapping table is applied.
  const partial: Record<string, FieldValue> = {
    name: practitioner ? unknownField(ctx) : text(row.name, "names.primary"),
    category_group: text(row.basic_category, "basic_category"),
    category: text(row.taxonomy_primary, "taxonomy.primary"),
    lat: coordinateField(row.lat, ctx, "geometry"),
    lon: coordinateField(row.lon, ctx, "geometry"),
    ...civic(row.address?.freeform ?? null, ctx),
    addr_city: text(row.address?.locality, "addresses[0].locality"),
    addr_postcode: text(row.address?.postcode, "addresses[0].postcode"),
    brand: practitioner ? unknownField(ctx) : text(row.brand, "brand.names.primary"),
    website: practitioner || !website ? unknownField(ctx) : fv(website.trim(), ctx, { source_key: "websites[0]" }),
    // The venue schema has no field for Overture's confidence or update time, so
    // they ride on the id field as COLUMN=value text in `raw` (not a piece).
    ref: fv(row.id, ctx, { source_key: "id", raw: publisher }),
  };
  return buildRecord("venue", recordId(row.id), regionFromPoint(row.lat, row.lon), partial, ctx);
}

/** A civic address is split only when it starts with a civic number; other text stays UNKNOWN with the text in raw. */
function civic(freeform: string | null, ctx: Provenance): { addr_housenumber: FieldValue; addr_street: FieldValue } {
  const value = (freeform ?? "").trim();
  const key = "addresses[0].freeform";
  if (value === "") return { addr_housenumber: unknownField(ctx), addr_street: unknownField(ctx) };
  if (!/^\d/.test(value)) {
    return { addr_housenumber: unknownField(ctx, { source_key: key, raw: value }), addr_street: unknownField(ctx, { source_key: key, raw: value }) };
  }
  const address = splitCivicAddress(value);
  return {
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: key }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: key }) : unknownField(ctx),
  };
}
