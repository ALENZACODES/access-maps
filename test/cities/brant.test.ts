import { describe, expect, it } from "vitest";
import { BRANT_JOBS, brantSidewalkExists, mapBrantPark, mapBrantSidewalk, mapBrantTrail } from "../../src/municipal/cities/brant.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the County of Brant layers retrieved on 2026-11-16, with long rings and lines cut short. */

describe("Brant sidewalks", () => {
  const ctx = contextFor("brant-sidewalks");
  const sidewalk = {
    attributes: {
      OBJECTID: 3,
      MATERIAL: "Asphalt",
      TYPE: "Multi-Use Trail - Boulevard",
      WIDTH: 3,
      STATUS: "Active",
      SHAPE__Length: 343.7493413071925,
    },
    geometry: {
      paths: [
        [
          [-80.386695, 43.183191],
          [-80.386067, 43.182661],
          [-80.385787, 43.182382],
        ],
      ],
    },
  };

  it("stores the material and keeps the width as text because the layer states no unit", () => {
    const records = mapBrantSidewalk(sidewalk, ctx);
    if (!records) throw new Error("expected records");
    const record = records[0]!;
    expect(record.id).toBe("brant-sidewalks:3");
    expect(record.region).toBe("n43.0_w080.5");
    expect(record.fields.footway?.value).toBe("sidewalk");
    expect(record.fields.surface?.value).toBe("Asphalt");
    expect(record.fields.wheelchair_description?.value).toBe("TYPE=Multi-Use Trail - Boulevard; WIDTH=3; STATUS=Active");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.min_width?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("leaves sidewalks published as Removed out", () => {
    expect(brantSidewalkExists({ STATUS: "Removed" })).toBe(false);
    expect(brantSidewalkExists({ STATUS: "Unassumed" })).toBe(true);
    expect(brantSidewalkExists({ STATUS: "" })).toBe(true);
    expect(mapBrantSidewalk({ ...sidewalk, attributes: { ...sidewalk.attributes, STATUS: "Removed" } }, ctx)).toBeNull();
  });
});

describe("Brant trail network", () => {
  it("stores each part of a multipart trail with the trail name and no use columns", () => {
    const records = mapBrantTrail(
      {
        attributes: {
          OBJECTID: 2,
          TRAIL_NAME: "Grand Valley Trail",
          CYCLING: "No",
          HIKING: "Yes",
          STATUS: "Active",
          GLOBALID: "09d46dbd-567f-4885-9f6f-f45ee81207c0",
          OWNERSHIP: "Don't Show",
          SNOWTRAIL: null,
        },
        geometry: {
          paths: [
            [
              [-80.37313, 43.204186],
              [-80.372802, 43.20437],
            ],
            [
              [-80.348469, 43.229169],
              [-80.348469, 43.229168],
            ],
          ],
        },
      },
      contextFor("brant-trails"),
    );
    expect(records.map((record) => record.id)).toEqual(["brant-trails:2:1", "brant-trails:2:2"]);
    for (const record of records) {
      expect(record.fields.signposted_as?.value).toBe("Grand Valley Trail");
      expect(record.fields.kind?.value).toBe("trail");
      expect(record.fields.surface?.value).toBe("UNKNOWN");
      expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
      expect(JSON.stringify(record)).not.toContain("Don't Show");
      expectValid(record);
    }
  });
});

describe("Brant parks", () => {
  it("stores the park name and type at the outline's vertex mean", () => {
    const record = mapBrantPark(
      {
        attributes: { OBJECTID: 1, STATUS: "Active", PARK_NAME: "Oakhill Heights Park", PARK_TYPE: "Neighbourhood Park" },
        geometry: {
          rings: [
            [
              [-80.318601, 43.131298],
              [-80.319418, 43.131185],
              [-80.319515, 43.131353],
              [-80.318601, 43.131298],
            ],
          ],
        },
      },
      contextFor("brant-parks"),
    );
    expect(record.id).toBe("brant-parks:1");
    expect(record.fields.name?.value).toBe("Oakhill Heights Park");
    expect(record.fields.category?.value).toBe("Neighbourhood Park");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Brant registry entries", () => {
  it("are tier 0 municipal sources under CC0 1.0, retrieved 2026-11-16", () => {
    for (const job of BRANT_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("CC0-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
