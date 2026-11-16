import { describe, expect, it } from "vitest";
import {
  ESSEX_COUNTY_JOBS,
  essexAreaIsPublicPlace,
  mapEssexLibrary,
  mapEssexRecreationalArea,
  mapEssexTrail,
} from "../../src/municipal/cities/essex-county.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the County of Essex layers retrieved on 2026-11-16, with long rings and lines cut short. */

describe("Essex County recreational areas", () => {
  const ctx = contextFor("essex-county-recreational-areas");
  const park = {
    attributes: {
      PARK_NAME: "Gil Maure Park",
      "SHAPE.area": 56294.4462105,
      "SHAPE.len": 1386.7626926056196,
      OBJECTID: 594,
      TYPE: "PARK",
      MUNICIPALITY: "LAS",
    },
    geometry: {
      rings: [
        [
          [-83.103314, 42.238362],
          [-83.103394, 42.237947],
          [-83.1023, 42.237666],
          [-83.10237, 42.237278],
        ],
      ],
    },
  };

  it("stores the name, the County's class and the spelled-out municipality with accessibility UNKNOWN", () => {
    const record = mapEssexRecreationalArea(park, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.id).toBe("essex-county-recreational-areas:594");
    expect(record.region).toBe("n42.0_w083.5");
    expect(record.fields.name?.value).toBe("Gil Maure Park");
    expect(record.fields.category?.value).toBe("PARK");
    expect(record.fields.category_group?.value).toBe("park");
    expect(record.fields.addr_city?.value).toBe("LaSalle");
    expect(record.fields.addr_city?.raw).toBe("LAS");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("keeps a municipality written in full and files a community centre under recreation", () => {
    const record = mapEssexRecreationalArea(
      {
        attributes: { PARK_NAME: "Comber Community Center", OBJECTID: 484, TYPE: "COMMUNITY CENTRE", MUNICIPALITY: "Lakeshore" },
        geometry: {
          rings: [
            [
              [-82.550224, 42.230879],
              [-82.550298, 42.230881],
              [-82.551018, 42.230903],
            ],
          ],
        },
      },
      ctx,
    );
    if (!record) throw new Error("expected a record");
    expect(record.fields.addr_city?.value).toBe("Lakeshore");
    expect(record.fields.category_group?.value).toBe("recreation");
    expectValid(record);
  });

  it("leaves golf courses and marinas out", () => {
    expect(essexAreaIsPublicPlace({ TYPE: "GOLF COURSE" })).toBe(false);
    expect(essexAreaIsPublicPlace({ TYPE: "MARINA" })).toBe(false);
    expect(essexAreaIsPublicPlace({ TYPE: "SPORTS COMPLEX" })).toBe(true);
    expect(mapEssexRecreationalArea({ ...park, attributes: { ...park.attributes, TYPE: "GOLF COURSE" } }, ctx)).toBeNull();
  });
});

describe("Essex County libraries", () => {
  it("stores the branch name, street address and community", () => {
    const record = mapEssexLibrary(
      {
        attributes: { OBJECTID: 1, NAME: "Amherstburg Branch", LOCATION: "Amherstburg", ADDRESS: "232 Sandwich St S" },
        geometry: { x: -83.109655, y: 42.102895 },
      },
      contextFor("essex-county-libraries"),
    );
    expect(record.id).toBe("essex-county-libraries:1");
    expect(record.fields.name?.value).toBe("Amherstburg Branch");
    expect(record.fields.addr_housenumber?.value).toBe("232");
    expect(record.fields.addr_city?.value).toBe("Amherstburg");
    expect(record.fields.category_group?.value).toBe("library");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Essex County CWATS trails", () => {
  const ctx = contextFor("essex-county-trails");
  const trail = {
    attributes: {
      OBJECTID: 6,
      Municipali: "ERCA",
      F_Type_New: "MUT",
      Road_Class: "ERCA",
      SegmentName: "Amherstburg - Essex Greenway",
      FromRoute: "County Road 5",
      ToRoute: "County Road 11",
      Completed: "Completed 2017",
    },
    geometry: {
      paths: [
        [
          [-82.970233, 42.142627],
          [-82.984623, 42.139363],
          [-82.994756, 42.137102],
        ],
      ],
    },
  };

  it("stores a multi-use trail with its segment name and no surface or width", () => {
    const records = mapEssexTrail(trail, ctx);
    if (!records) throw new Error("expected records");
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.id).toBe("essex-county-trails:6");
    expect(record.fields.kind?.value).toBe("multi-use trail");
    expect(record.fields.kind?.raw).toBe("MUT");
    expect(record.fields.signposted_as?.value).toBe("Amherstburg - Essex Greenway");
    expect(record.fields.surface?.value).toBe("UNKNOWN");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("stores each part of a multipart line as its own record", () => {
    const records = mapEssexTrail(
      {
        ...trail,
        geometry: {
          paths: [
            [
              [-82.970233, 42.142627],
              [-82.984623, 42.139363],
            ],
            [
              [-82.99, 42.13],
              [-82.995, 42.131],
            ],
          ],
        },
      },
      ctx,
    );
    expect(records?.map((record) => record.id)).toEqual(["essex-county-trails:6:1", "essex-county-trails:6:2"]);
  });

  it("leaves bike lanes, paved shoulders, signed routes and cycle paths out", () => {
    for (const type of ["Bike Lane", "Paved Shoulder", "Signed Route", "Cycle Path", "CSS"]) {
      expect(mapEssexTrail({ ...trail, attributes: { ...trail.attributes, F_Type_New: type } }, ctx)).toBeNull();
    }
  });
});

describe("Essex County registry entries", () => {
  it("are tier 0 municipal sources under the County of Essex licence, retrieved 2026-11-16", () => {
    for (const job of ESSEX_COUNTY_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("OGL-Essex-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
