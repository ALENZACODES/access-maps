import { describe, expect, it } from "vitest";
import {
  QUINTE_WEST_JOBS,
  mapQuinteWestPark,
  mapQuinteWestTrail,
  quinteWestSegmentIsWalkway,
} from "../../src/municipal/cities/quinte-west.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the City of Quinte West layers retrieved on 2026-11-16, with long lines cut short. */

describe("Quinte West parks", () => {
  it("stores the park name, class and address with every accessibility field UNKNOWN", () => {
    const record = mapQuinteWestPark(
      {
        attributes: { objectid: 68, id: 3, park_name: "Bain Park", note: " ", Location: "327 DUNDAS STREET EAST", amenities: "Park with Amenities" },
        geometry: { x: -77.548551, y: 44.104523 },
      },
      contextFor("quinte-west-parks"),
    );
    expect(record.id).toBe("quinte-west-parks:68");
    expect(record.region).toBe("n44.0_w078.0");
    expect(record.fields.name?.value).toBe("Bain Park");
    expect(record.fields.category?.value).toBe("Park with Amenities");
    expect(record.fields.addr_housenumber?.value).toBe("327");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Quinte West trails and sidewalks", () => {
  const ctx = contextFor("quinte-west-trails");
  const trail = {
    attributes: {
      objectid: 1,
      environ: "Canal, Rural",
      hazard_com: "",
      min_width: 0,
      on_road: "No",
      structure: "Lake Ontario Waterfront Trail",
      surface: "Dirt",
      surf_det: " ",
      firmness: " ",
      PEDEST: "Trail",
      CAR: "Disallowed",
    },
    geometry: {
      paths: [
        [
          [-77.627081, 44.047563],
          [-77.626823, 44.047609],
        ],
      ],
    },
  };

  it("stores the published surface and never a width from the zero placeholder", () => {
    const record = mapQuinteWestTrail(trail, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.fields.kind?.value).toBe("Trail");
    expect(record.fields.footway?.value).toBe("trail");
    expect(record.fields.surface?.value).toBe("Dirt");
    expect(record.fields.signposted_as?.value).toBe("Lake Ontario Waterfront Trail");
    expect(record.fields.min_width?.value).toBe("UNKNOWN");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("leaves road shoulders out", () => {
    expect(quinteWestSegmentIsWalkway({ PEDEST: "Walkway" })).toBe(true);
    expect(quinteWestSegmentIsWalkway({ PEDEST: "Sidewalk" })).toBe(true);
    expect(quinteWestSegmentIsWalkway({ PEDEST: "Wide Shoulder" })).toBe(false);
    expect(quinteWestSegmentIsWalkway({ PEDEST: "" })).toBe(false);
    expect(mapQuinteWestTrail({ ...trail, attributes: { ...trail.attributes, PEDEST: "Wide Shoulder" } }, ctx)).toBeNull();
  });
});

describe("Quinte West registry entries", () => {
  it("are tier 0 municipal sources under the Quinte West licence, retrieved 2026-11-16", () => {
    for (const job of QUINTE_WEST_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("Quinte-West-Open-Data-Licence-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
