import { describe, expect, it } from "vitest";
import { G7_LAYER_JOBS } from "../../scripts/import-cities-g7.js";
import { mapGreyGtrStop, GREY_COUNTY_LAYERS } from "../../src/municipal/cities/grey-county.js";
import { HASTINGS_COUNTY_JOBS, HASTINGS_COUNTY_LAYERS } from "../../src/municipal/cities/hastings-county.js";
import { HURON_COUNTY_JOBS, HURON_COUNTY_LAYERS, huronTrailIsOpenPath } from "../../src/municipal/cities/huron-county.js";
import { LEEDS_GRENVILLE_JOBS, LEEDS_GRENVILLE_LAYERS } from "../../src/municipal/cities/leeds-grenville.js";
import type { G7LayerJob } from "../../src/municipal/cities/g7-helpers.js";
import type { DataRecord } from "../../src/model/records.js";
import { contextFor, expectValid, registry, VENUE_ACCESS_FIELDS } from "./g7-support.js";

/** Features below are copied from the layers retrieved on 2026-11-17, with long lines cut short. */

function job(jobs: readonly G7LayerJob[], id: string): G7LayerJob {
  const found = jobs.find((entry) => entry.id === id);
  if (!found) throw new Error(`no job ${id}`);
  return found;
}

function one(jobs: readonly G7LayerJob[], id: string, feature: Parameters<G7LayerJob["map"]>[0]): DataRecord {
  const mapped = job(jobs, id).map(feature, contextFor(id));
  if (mapped === null || Array.isArray(mapped)) throw new Error("expected one record");
  expectValid(mapped);
  return mapped;
}

describe("County of Huron", () => {
  it("stores a library branch with its civic address and accessibility UNKNOWN", () => {
    const record = one(HURON_COUNTY_JOBS, "huron-county-libraries", {
      attributes: { OBJECTID: 1, Branch: "Seaforth", Location: "108 Main St S" },
      geometry: { x: -81.39551702565052, y: 43.55035273036729 },
    });
    expect(record.id).toBe("huron-county-libraries:1");
    expect(record.region).toBe("n43.5_w081.5");
    expect(record.fields.name?.value).toBe("Seaforth");
    expect(record.fields.category?.value).toBe("library");
    expect(record.fields.addr_housenumber?.value).toBe("108");
    expect(record.fields.addr_street?.value).toBe("Main St S");
    for (const key of VENUE_ACCESS_FIELDS) expect(record.fields[key]?.value).toBe("UNKNOWN");
  });

  it("takes the park name from POI_Name, not from the owner column", () => {
    const record = one(HURON_COUNTY_JOBS, "huron-county-parks", {
      attributes: {
        OBJECTID_1: 3,
        Type: "Conservation Area",
        Address: "41710 CRANBROOK ROAD",
        Town: "WROXETER ON",
        PostalCode: "N0G 2X0",
        Municipality: "Morris-Turnberry",
        Website: "http://www.mvca.on.ca/",
        Name: "CONSERVATION AUTHORITY MAITLAND",
        POI_Name: "Sunshine Conservation Area",
      },
      geometry: { x: -81.30890690494165, y: 43.755868836738486 },
    });
    expect(record.fields.name?.value).toBe("Sunshine Conservation Area");
    expect(record.fields.category?.value).toBe("Conservation Area");
    expect(record.fields.addr_city?.value).toBe("Morris-Turnberry");
    expect(record.fields.addr_postcode?.value).toBe("N0G 2X0");
    expect(record.fields.operator?.value).toBe("UNKNOWN");
  });

  it("reads only the civic part of a one-line address and leaves golf courses and marinas out", () => {
    const record = one(HURON_COUNTY_JOBS, "huron-county-recreation", {
      attributes: { OBJECTID_1: 10, Type: "Baseball Diamond", Municipality: "Huron East", POI_Name: "Seaforth Community BaseBall Diamond ", Full_Address: "15 BRANTFORD STREET, Huron East, ON N0K" },
      geometry: { x: -81.39966426977918, y: 43.54691697079449 },
    });
    expect(record.fields.name?.value).toBe("Seaforth Community BaseBall Diamond");
    expect(record.fields.addr_housenumber?.value).toBe("15");
    expect(record.fields.addr_street?.value).toBe("BRANTFORD STREET");
    const golf = job(HURON_COUNTY_JOBS, "huron-county-recreation").map(
      { attributes: { OBJECTID_1: 99, Type: "Golf Course", POI_Name: "Fixture Golf" }, geometry: { x: -81.5, y: 43.6 } },
      contextFor("huron-county-recreation"),
    );
    expect(golf).toBeNull();
  });

  it("keeps trail features that are places and leaves benches out", () => {
    const record = one(HURON_COUNTY_JOBS, "huron-county-trail-features", {
      attributes: { OBJECTID_1: 40, TYPE: "Parking", COMMENTS: "Parking Area" },
      geometry: { x: -81.28926098698999, y: 43.67883965832463 },
    });
    expect(record.fields.category?.value).toBe("Parking");
    expect(record.fields.category_group?.value).toBe("trail_feature");
    const bench = job(HURON_COUNTY_JOBS, "huron-county-trail-features").map(
      { attributes: { OBJECTID_1: 41, TYPE: "Bench", COMMENTS: "Bench" }, geometry: { x: -81.28, y: 43.67 } },
      contextFor("huron-county-trail-features"),
    );
    expect(bench).toBeNull();
  });

  it("keeps the publisher's Accessible trail use as text and leaves closed and road rows out", () => {
    const mapped = job(HURON_COUNTY_JOBS, "huron-county-trails").map(
      {
        attributes: { OBJECTID: 7, TRAIL_TYPE: "Main", TRAIL_NAME: "Fixture Loop", TRAIL_USE1: "Accessible", TRAIL_USE2: " ", SURFACE: "Natural" },
        geometry: {
          paths: [
            [
              [-81.722746, 43.809958],
              [-81.722711, 43.81],
            ],
          ],
        },
      },
      contextFor("huron-county-trails"),
    );
    if (!Array.isArray(mapped)) throw new Error("expected path records");
    expect(mapped).toHaveLength(1);
    const trail = mapped[0] as DataRecord;
    expectValid(trail);
    expect(trail.fields.wheelchair_description?.value).toBe("TRAIL_USE1=Accessible");
    expect(trail.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(trail.fields.surface?.value).toBe("Natural");
    expect(trail.fields.signposted_as?.value).toBe("Fixture Loop");
    expect(huronTrailIsOpenPath({ TRAIL_TYPE: "Closed", TRAIL_USE1: "Walking" })).toBe(false);
    expect(huronTrailIsOpenPath({ TRAIL_TYPE: "Road", TRAIL_USE1: "" })).toBe(false);
    expect(huronTrailIsOpenPath({ TRAIL_TYPE: "Access", TRAIL_USE1: "Driveway" })).toBe(false);
    expect(huronTrailIsOpenPath({ TRAIL_TYPE: "Main", TRAIL_USE1: "Walking" })).toBe(true);
  });

  it("a trail without the word Accessible stays UNKNOWN, and a two-part line gives two records", () => {
    const mapped = job(HURON_COUNTY_JOBS, "huron-county-trails").map(
      {
        attributes: { OBJECTID: 2, TRAIL_TYPE: "Main", TRAIL_NAME: "Point Farms", TRAIL_USE1: "Walking", TRAIL_USE2: "Skiing", SURFACE: "Natural" },
        geometry: {
          paths: [
            [
              [-81.722746, 43.809958],
              [-81.722711, 43.81],
            ],
            [
              [-81.72, 43.81],
              [-81.719, 43.811],
            ],
          ],
        },
      },
      contextFor("huron-county-trails"),
    );
    if (!Array.isArray(mapped)) throw new Error("expected path records");
    expect(mapped.map((record) => record.id)).toEqual(["huron-county-trails:2:1", "huron-county-trails:2:2"]);
    for (const record of mapped) expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });
});

describe("County of Hastings", () => {
  it("stores an arena with its class, community and web link", () => {
    const record = one(HASTINGS_COUNTY_JOBS, "hastings-county-arenas", {
      attributes: { FID: 3, Fac_Typ: "Arena", Name: "Deseronto Community Centre", civic_ad: "51 Mechanic Street", Community: "Deseronto", web_lnk: "https://www.deseronto.ca/residents/parks-and-recreation/arena" },
      geometry: { x: -77.0582019959408, y: 44.19205001035157 },
    });
    expect(record.id).toBe("hastings-county-arenas:3");
    expect(record.fields.category?.value).toBe("Arena");
    expect(record.fields.addr_city?.value).toBe("Deseronto");
    expect(record.fields.website?.value).toBe("https://www.deseronto.ca/residents/parks-and-recreation/arena");
    for (const key of VENUE_ACCESS_FIELDS) expect(record.fields[key]?.value).toBe("UNKNOWN");
  });

  it("never requests the municipal office phone column", () => {
    const offices = job(HASTINGS_COUNTY_JOBS, "hastings-county-municipal-offices");
    expect(offices.fields).not.toContain("PHONE_NO");
    const record = one(HASTINGS_COUNTY_JOBS, "hastings-county-municipal-offices", {
      attributes: { FID: 1, NAME: "Town of Bancroft", ADDRESS: "8 HASTINGS HERITAGE WAY", COMMUNITY: "BANCROFT", WEBSITE: "http://www.town.bancroft.on.ca" },
      geometry: { x: -77.85919957962969, y: 45.05913284826116 },
    });
    expect(record.fields.category?.value).toBe("municipal office");
    expect(record.fields.category_group?.value).toBe("civic_facility");
  });
});

describe("United Counties of Leeds and Grenville", () => {
  it("stores a municipal office and never requests the owner or roll-number columns", () => {
    const record = one(LEEDS_GRENVILLE_JOBS, "leeds-grenville-municipal-offices", {
      attributes: { OBJECTID: 2, Name: "Township of Athens - Administration Office", Reformloc: "1 MAIN ST W", Municipali: "ATHENS", Type: "Municipal Office" },
      geometry: { x: -75.95244396516699, y: 44.62560005415055 },
    });
    expect(record.fields.addr_street?.value).toBe("MAIN ST W");
    expect(record.fields.addr_city?.value).toBe("ATHENS");
    const county = job(LEEDS_GRENVILLE_JOBS, "leeds-grenville-county-offices");
    expect(county.fields).not.toContain("Rollnum15");
    expect(county.fields).not.toContain("Owner");
  });
});

describe("County of Grey", () => {
  it("stores a GTR stop as a transit stop with wheelchair boarding UNKNOWN", () => {
    const record = mapGreyGtrStop(
      {
        attributes: { OBJECTID: 1, stop_id: "7", stop_name: "Dundalk Library", stop_desc: "80 Proton St N, Dundalk, ON N0C 1B0" },
        geometry: { x: -80.39426340998648, y: 44.16876260013311 },
      },
      contextFor("grey-county-gtr-bus-stops"),
    );
    if (!record) throw new Error("expected a record");
    expectValid(record);
    expect(record.tranche).toBe("transit");
    expect(record.id).toBe("grey-county-gtr-bus-stops:7");
    expect(record.fields.wheelchair_boarding?.value).toBe("UNKNOWN");
    expect(record.fields.description?.value).toBe("80 Proton St N, Dundalk, ON N0C 1B0");
  });
});

describe("lane G7 registry entries", () => {
  const layers: Record<string, string> = { ...HURON_COUNTY_LAYERS, ...HASTINGS_COUNTY_LAYERS, ...LEEDS_GRENVILLE_LAYERS, ...GREY_COUNTY_LAYERS };
  const NEVER_REQUESTED = /phone|fax|email|e_mail|contact|owner|roll|creat|edit|user|comment_by|memorial|globalid/i;

  it("every job is a tier 0 municipal source with a read licence, and its layer is the registry download_url", () => {
    for (const entry of G7_LAYER_JOBS) {
      const source = registry.sources.find((item) => item.id === entry.id);
      expect(source, entry.id).toBeDefined();
      expect(source?.kind).toBe("municipal");
      expect(source?.tier).toBe(0);
      expect(source?.retrieved_at).toBe("2026-11-17");
      expect(source?.licence_id).not.toMatch(/owner-permission/);
      expect(source?.notes ?? "").toMatch(/read on 2026-11-17|\(read 2026-11-17\)/);
      expect(source?.attribution.length).toBeGreaterThan(0);
      if (layers[entry.id]) expect(source?.download_url).toBe(layers[entry.id]);
    }
  });

  it("ids are unique and no job requests a contact, owner, roll-number or editor column", () => {
    const ids = G7_LAYER_JOBS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of G7_LAYER_JOBS) {
      for (const field of entry.fields) expect(NEVER_REQUESTED.test(field), `${entry.id} ${field}`).toBe(false);
    }
  });
});
