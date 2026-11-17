import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { planOverture } from "../scripts/import-overture-places.js";
import { Boundary } from "../src/geo/boundary.js";
import type { Provenance } from "../src/model/provenance.js";
import { ACCESSIBILITY_FIELDS } from "../src/count/accessibility.js";
import {
  classifyLicences, CONFIDENCE_FLOOR, duplicateKey, latestUpdate, mapOverturePlace, OVERTURE_SOURCES, PRACTITIONER_CATEGORIES,
  rowExclusion, type OverturePlaceRow,
} from "../src/overture/places.js";
import { compileValidators } from "../src/validate/ajv.js";

/**
 * Rows below are copied from the Overture 2026-10-21.0 places extract
 * retrieved on 2026-11-16 (tools/overture/extract_places.py). Rows built
 * from them with changed values are labelled as test fixtures.
 */

const validators = compileValidators(path.join(process.cwd(), "schema"));
const ctx = (source_id: string, licence: string): Provenance => ({ source_id, licence, retrieved_at: "2026-11-16", tier: 0 });

const theatre: OverturePlaceRow = {
  id: "512dc935-2395-4924-b3fd-a34abab0d0e6", lon: -79.44973254, lat: 43.64545116, geometry_type: "POINT",
  confidence: 0.8892979162931443, operating_status: null, name: "Acting Out Kids theater",
  basic_category: "performing_arts_venue", taxonomy_primary: "performing_arts_venue", brand: null,
  websites: ["http://www.actingoutkidstheatre.com/"],
  address: { freeform: "Roncesvalles United Church, #240", locality: "Toronto", postcode: "M6R 1L3", region: "ON", country: "CA" },
  sources: [
    { dataset: "meta", license: "CDLA-Permissive-2.0", property: "", update_time: "2026-10-12T00:00:00.000Z" },
    { dataset: "Overture", license: "CDLA-Permissive-2.0", property: "/properties/confidence", update_time: "2026-10-15T18:00:21Z" },
  ],
};

const dental: OverturePlaceRow = {
  id: "64b32e5a-d29c-420b-a2cf-e7892c58c672", lon: -79.4414807030791, lat: 43.66803224635956, geometry_type: "POINT",
  confidence: 0.77, operating_status: null, name: "Galleria Dental Office", basic_category: "dental_clinic",
  taxonomy_primary: "dental_clinic", brand: null, websites: ["http://costachedentistry.com"],
  address: { freeform: "1245 Dupont St # 7", locality: "Toronto", postcode: "M6H 2A6", region: "ON", country: "CA" },
  sources: [
    { dataset: "Foursquare", license: "Apache-2.0", property: "", update_time: "2025-07-14T00:00:00.000" },
    { dataset: "Overture", license: "CDLA-Permissive-2.0", property: "/properties/confidence", update_time: "2026-10-15T18:00:21Z" },
  ],
};

const charger: OverturePlaceRow = {
  id: "5a0234a0-4ffc-4137-90d1-52586f486eab", lon: -79.4493574975706, lat: 43.6735918299538, geometry_type: "POINT",
  confidence: 0.8, operating_status: null, name: "GreenP - LocationID 5238 - 1337 Lansdowne Avenue",
  basic_category: "ev_charging_station", taxonomy_primary: "ev_charging_station", brand: "FLO", websites: [],
  address: { freeform: null, locality: null, postcode: null, region: "ON", country: "CA" },
  sources: [
    { dataset: "AllThePlaces", license: "CC0-1.0", property: "", update_time: "2026-10-10T08:17:35.000Z" },
    { dataset: "Overture", license: "CDLA-Permissive-2.0", property: "/properties/confidence", update_time: "2026-10-15T18:00:21Z" },
  ],
};

const detroit: OverturePlaceRow = {
  id: "df8dbe0f-16ee-4c73-ab52-47ce3017089f", lon: -83.09823, lat: 42.30887, geometry_type: "POINT",
  confidence: 0.9868942239284515, operating_status: "open", name: "Chase Mortgage", basic_category: "financial_service",
  taxonomy_primary: "mortgage_lender", brand: null, websites: ["https://www.chase.com/mortgage/loan-officer"],
  address: { freeform: "5460 W Fort St", locality: "Detroit", postcode: "48209", region: "MI", country: "US" },
  sources: [{ dataset: "Microsoft", license: "CDLA-Permissive-2.0", property: "", update_time: "2016-02-01T16:27:25.897Z" }],
};

describe("Overture places licences", () => {
  it("routes each place to the source for its set of licences", () => {
    expect(classifyLicences(theatre)).toEqual({ sourceId: "overture-places" });
    expect(classifyLicences(dental)).toEqual({ sourceId: "overture-places-foursquare" });
    expect(classifyLicences(charger)).toEqual({ sourceId: "overture-places-alltheplaces" });
  });

  it("leaves out a place with any source licence that is not permissive, and one with no source", () => {
    // Test fixture: a licence string Overture does not publish for places.
    const restricted = { ...theatre, sources: [...(theatre.sources ?? []), { dataset: "fixture", license: "fixture-no-redistribution", property: "", update_time: null }] };
    expect(classifyLicences(restricted)).toEqual({ excluded: "licence_not_permissive" });
    expect(classifyLicences({ ...theatre, sources: [] })).toEqual({ excluded: "licence_not_permissive" });
    const mixed = { ...theatre, sources: [...(dental.sources ?? []), ...(charger.sources ?? [])] };
    expect(classifyLicences(mixed)).toEqual({ excluded: "licence_combination_unmapped" });
  });

  it("has one registry source per licence set", () => {
    expect(OVERTURE_SOURCES.map((source) => source.id)).toEqual(["overture-places", "overture-places-foursquare", "overture-places-alltheplaces"]);
  });
});

describe("Overture places filters", () => {
  it("drops permanently closed places, places under the confidence floor, and unnamed places", () => {
    expect(CONFIDENCE_FLOOR).toBe(0.5);
    expect(rowExclusion(theatre)).toBeNull();
    expect(rowExclusion({ ...theatre, operating_status: "permanently_closed" })).toBe("permanently_closed");
    expect(rowExclusion({ ...theatre, operating_status: "temporarily_closed" })).toBeNull();
    expect(rowExclusion({ ...theatre, confidence: 0.4999 })).toBe("below_confidence_floor");
    expect(rowExclusion({ ...theatre, confidence: 0.5 })).toBeNull();
    expect(rowExclusion({ ...theatre, confidence: null })).toBe("below_confidence_floor");
    expect(rowExclusion({ ...theatre, name: "  " })).toBe("no_name");
  });

  it("treats the same name at the same coordinates as an exact duplicate", () => {
    expect(duplicateKey(theatre)).toBe(duplicateKey({ ...theatre, id: "fixture", name: " acting out KIDS theater " }));
    expect(duplicateKey(theatre)).not.toBe(duplicateKey({ ...theatre, lat: theatre.lat + 0.00001 }));
  });
});

describe("Overture place mapping", () => {
  it("maps a place to a valid venue record with every accessibility field UNKNOWN", () => {
    const record = mapOverturePlace(theatre, ctx("overture-places", "CDLA-Permissive-2.0"));
    expect(record.id).toBe("overture:512dc935-2395-4924-b3fd-a34abab0d0e6");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.name?.value).toBe("Acting Out Kids theater");
    expect(record.fields.category_group).toMatchObject({ value: "performing_arts_venue", source_key: "basic_category" });
    expect(record.fields.category).toMatchObject({ value: "performing_arts_venue", source_key: "taxonomy.primary" });
    expect(record.fields.website?.value).toBe("http://www.actingoutkidstheatre.com/");
    expect(record.fields.addr_city?.value).toBe("Toronto");
    expect(record.fields.addr_postcode?.value).toBe("M6R 1L3");
    // The freeform address does not start with a civic number, so it is not split.
    expect(record.fields.addr_street).toMatchObject({ value: "UNKNOWN", raw: "Roncesvalles United Church, #240" });
    expect(record.fields.ref).toMatchObject({ value: theatre.id, source_key: "id", raw: "confidence=0.8892979162931443; update_time=2026-10-12T00:00:00.000Z" });
    for (const field of ACCESSIBILITY_FIELDS.venue) expect(record.fields[field]?.value, field).toBe("UNKNOWN");
    for (const field of Object.values(record.fields)) expect(field).toMatchObject({ source_id: "overture-places", licence: "CDLA-Permissive-2.0", tier: 0 });
    expect(validators.records.venue(record)).toBe(true);
  });

  it("splits a civic address and leaves out a practitioner's name, brand and website", () => {
    expect(PRACTITIONER_CATEGORIES.has("dental_clinic")).toBe(true);
    expect(PRACTITIONER_CATEGORIES.has("hospital")).toBe(false);
    const record = mapOverturePlace(dental, ctx("overture-places-foursquare", "CDLA-Permissive-2.0 AND Apache-2.0"));
    expect(record.fields.name?.value).toBe("UNKNOWN");
    expect(record.fields.website?.value).toBe("UNKNOWN");
    expect(record.fields.brand?.value).toBe("UNKNOWN");
    expect(record.fields.category?.value).toBe("dental_clinic");
    expect(record.fields.addr_housenumber?.value).toBe("1245");
    expect(record.fields.addr_street?.value).toBe("Dupont St # 7");
    expect(record.fields.ref?.raw).toBe("confidence=0.77; update_time=2025-07-14T00:00:00.000");
    expect(validators.records.venue(record)).toBe(true);
  });

  it("keeps a brand and leaves a missing address UNKNOWN", () => {
    const record = mapOverturePlace(charger, ctx("overture-places-alltheplaces", "CDLA-Permissive-2.0 AND CC0-1.0"));
    expect(record.fields.brand).toMatchObject({ value: "FLO", source_key: "brand.names.primary" });
    expect(record.fields.addr_street?.value).toBe("UNKNOWN");
    expect(record.fields.website?.value).toBe("UNKNOWN");
    expect(latestUpdate(charger)).toBe("2026-10-10T08:17:35.000Z");
    expect(validators.records.venue(record)).toBe(true);
  });
});

describe("Boundary", () => {
  // Test fixture polygon: a square with a square hole. Not a real boundary.
  const square = new Boundary({
    type: "Polygon",
    coordinates: [
      [[-80, 43], [-79, 43], [-79, 44], [-80, 44], [-80, 43]],
      [[-79.6, 43.4], [-79.4, 43.4], [-79.4, 43.6], [-79.6, 43.6], [-79.6, 43.4]],
    ],
  });

  it("uses the even-odd rule, so a hole is outside", () => {
    expect(square.contains(-79.9, 43.1)).toBe(true);
    expect(square.contains(-79.5, 43.5)).toBe(false);
    expect(square.contains(-78.9, 43.5)).toBe(false);
    expect(square.contains(-79.5, 44.2)).toBe(false);
    expect(square.contains(Number.NaN, 43.5)).toBe(false);
  });

  it("reads every part of a MultiPolygon", () => {
    const two = new Boundary({ type: "MultiPolygon", coordinates: [[[[-80, 43], [-79, 43], [-79, 44], [-80, 43]]], [[[-77, 45], [-76, 45], [-76, 46], [-77, 45]]]] });
    expect(two.contains(-79.2, 43.5)).toBe(true);
    expect(two.contains(-76.2, 45.5)).toBe(true);
    expect(two.contains(-78, 44.5)).toBe(false);
  });
});

describe("planOverture", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  it("counts each filter step and keeps the most confident of an exact duplicate pair", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "overture-"));
    roots.push(root);
    const file = path.join(root, "places.ndjson.gz");
    const twin = { ...theatre, id: "fixture-twin", confidence: 0.6 };
    const low = { ...charger, id: "fixture-low", confidence: 0.2 };
    const closed = { ...dental, id: "fixture-closed", operating_status: "permanently_closed" };
    const rows = [theatre, dental, charger, detroit, twin, low, closed];
    writeFileSync(file, gzipSync(rows.map((row) => JSON.stringify(row)).join("\n") + "\n"));
    // Test fixture boundary around west Toronto; Detroit is outside it.
    const boundary = new Boundary({ type: "Polygon", coordinates: [[[-79.6, 43.5], [-79.3, 43.5], [-79.3, 43.8], [-79.6, 43.8], [-79.6, 43.5]]] });
    const plan = await planOverture(file, boundary);
    expect(plan.steps).toEqual({ read: 7, point: 7, in_ontario: 6, permissive_licence: 6, not_permanently_closed: 5, at_or_above_confidence_floor: 4, named: 4, distinct: 3 });
    expect(plan.excluded).toEqual({ outside_ontario: 1, permanently_closed: 1, below_confidence_floor: 1, exact_duplicate: 1 });
    expect([...plan.keep.entries()].sort()).toEqual([
      [theatre.id, "overture-places"],
      [charger.id, "overture-places-alltheplaces"],
      [dental.id, "overture-places-foursquare"],
    ].sort());
  });
});
