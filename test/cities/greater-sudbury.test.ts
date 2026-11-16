import { describe, expect, it } from "vitest";
import {
  GREATER_SUDBURY_JOBS,
  mapSudburyPlayground,
  mapSudburyRecreation,
  mapSudburyWalkway,
  sudburySegmentIsWalkway,
} from "../../src/municipal/cities/greater-sudbury.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the City of Greater Sudbury layers retrieved on 2026-11-16. */

describe("Greater Sudbury parks and playgrounds", () => {
  const ctx = contextFor("greater-sudbury-playgrounds");
  const park = {
    attributes: {
      OBJECTID_1: 10,
      OBJECTID: 10,
      Community: "Sudbury",
      Ward: 10,
      Name_EN: "James Jerome Sport Complex",
      Category_E: "Park",
      Address_EN: "90 Centennial Drive",
      Accessibility: "Full",
    },
    geometry: { x: -80.999964, y: 46.469451 },
  };

  it("keeps Full and Partial as the City's words and never sets wheelchair", () => {
    const record = mapSudburyPlayground(park, ctx);
    expect(record.fields.wheelchair_description?.value).toBe("Accessibility=Full");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.addr_housenumber?.value).toBe("90");
    expect(record.region).toBe("n46.0_w081.0");
    expectValid(record);
    const partial = mapSudburyPlayground({ ...park, attributes: { ...park.attributes, Accessibility: "Partial" } }, ctx);
    expect(partial.fields.wheelchair_description?.value).toBe("Accessibility=Partial");
  });

  it("leaves N/A UNKNOWN with the token on raw", () => {
    const record = mapSudburyPlayground({ ...park, attributes: { ...park.attributes, Accessibility: "N/A" } }, ctx);
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.raw).toBe("N/A");
  });
});

describe("Greater Sudbury recreation", () => {
  it("stores the category and no accessibility value", () => {
    const record = mapSudburyRecreation(
      {
        attributes: {
          OBJECTID: 1,
          COMMUNITY: "Sudbury",
          Name_EN: "Cambrian",
          Category_EN: "Arena",
          Address_EN: "755 Bruce Street",
          Website: "https://www.greatersudbury.ca/play/arenas/",
        },
        geometry: { x: -80.991963, y: 46.510385 },
      },
      contextFor("greater-sudbury-recreation"),
    );
    expect(record.fields.category?.value).toBe("Arena");
    expect(record.fields.website?.value).toBe("https://www.greatersudbury.ca/play/arenas/");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Greater Sudbury walkways", () => {
  const ctx = contextFor("greater-sudbury-walkways");
  const walkway = {
    attributes: {
      OBJECTID: 755,
      ASSETID: "705803",
      STYPE: "Walkway",
      LIFECYCLESTATUS: "ACT",
      MATERIAL: "C",
      WIDTH: null,
      RAILING: 1,
      STAIRS: 1,
    },
    geometry: {
      paths: [
        [
          [-80.99377, 46.4763],
          [-80.99381, 46.476303],
        ],
      ],
    },
  };

  it("maps the published domains and keeps stairs as published text", () => {
    const record = mapSudburyWalkway(walkway, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.fields.kind?.value).toBe("Walkway");
    expect(record.fields.footway?.value).toBe("UNKNOWN");
    expect(record.fields.surface?.value).toBe("Concrete");
    expect(record.fields.surface?.raw).toBe("C");
    expect(record.fields.handrail?.value).toBe("yes");
    expect(record.fields.wheelchair_description?.value).toBe("STAIRS=True");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.step_count?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("keeps a width as text because the layer states no unit", () => {
    const record = mapSudburyWalkway(
      { ...walkway, attributes: { ...walkway.attributes, STYPE: "Sidewalk", WIDTH: 1.5, STAIRS: 0, RAILING: null, MATERIAL: null } },
      ctx,
    );
    if (!record) throw new Error("expected a record");
    expect(record.fields.footway?.value).toBe("sidewalk");
    expect(record.fields.wheelchair_description?.value).toBe("STAIRS=False; WIDTH=1.5");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.surface?.value).toBe("UNKNOWN");
    expect(record.fields.handrail?.value).toBe("UNKNOWN");
  });

  it("leaves out segments that are not active places to walk", () => {
    expect(sudburySegmentIsWalkway({ STYPE: "Sidewalk", LIFECYCLESTATUS: "ACT" })).toBe(true);
    expect(sudburySegmentIsWalkway({ STYPE: "Trail", LIFECYCLESTATUS: "ACT" })).toBe(true);
    for (const status of ["PRP", "ABA", "REM", "UC", ""]) {
      expect(sudburySegmentIsWalkway({ STYPE: "Sidewalk", LIFECYCLESTATUS: status })).toBe(false);
    }
    for (const type of ["Bike path", "Shoulder", "Unknown", ""]) {
      expect(sudburySegmentIsWalkway({ STYPE: type, LIFECYCLESTATUS: "ACT" })).toBe(false);
    }
    expect(mapSudburyWalkway({ ...walkway, attributes: { ...walkway.attributes, LIFECYCLESTATUS: "REM" } }, ctx)).toBeNull();
  });
});

describe("Greater Sudbury registry entries", () => {
  it("are tier 0 municipal sources under the Greater Sudbury licence, retrieved 2026-11-16", () => {
    for (const job of GREATER_SUDBURY_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("Greater-Sudbury-Open-Data-Licence-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
    const feed = sourceEntry("gtfs-gova");
    expect(feed.kind).toBe("gtfs");
    expect(feed.tier).toBe(1);
  });
});
