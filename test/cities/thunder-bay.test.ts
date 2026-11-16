import { describe, expect, it } from "vitest";
import {
  THUNDER_BAY_JOBS,
  mapThunderBayFacility,
  mapThunderBaySidewalk,
  mapThunderBayTrail,
} from "../../src/municipal/cities/thunder-bay.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the City of Thunder Bay layers retrieved on 2026-11-16, with long lines cut short. */

describe("Thunder Bay sidewalks and trails", () => {
  it("stores the sidewalk line and nothing the layer does not publish", () => {
    const record = mapThunderBaySidewalk(
      {
        attributes: { OBJECTID: 1, SIDEWAK_ID: 2347, UNITID: "2347" },
        geometry: {
          paths: [
            [
              [-89.24198, 48.446625],
              [-89.24104, 48.447067],
            ],
          ],
        },
      },
      contextFor("thunder-bay-sidewalks"),
    );
    expect(record.tranche).toBe("path");
    expect(record.id).toBe("thunder-bay-sidewalks:1");
    expect(record.region).toBe("n48.0_w089.5");
    expect(record.fields.footway?.value).toBe("sidewalk");
    for (const key of ["surface", "width", "kerb", "incline", "wheelchair", "wheelchair_description", "length_m"]) {
      expect(record.fields[key]?.value).toBe("UNKNOWN");
    }
    expect(record.fields.geometry_type?.value).toBe("LineString");
    expectValid(record);
  });

  it("stores the trail name from LOCATION", () => {
    const record = mapThunderBayTrail(
      {
        attributes: { OBJECTID: 1, LOCATION: "Woodward Avenue Trail" },
        geometry: {
          paths: [
            [
              [-89.289411, 48.365184],
              [-89.289388, 48.365208],
              [-89.289368, 48.365248],
            ],
          ],
        },
      },
      contextFor("thunder-bay-trails"),
    );
    expect(record.fields.kind?.value).toBe("trail");
    expect(record.fields.signposted_as?.value).toBe("Woodward Avenue Trail");
    expect(record.fields.footway?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("gives a line with no geometry no storage cell", () => {
    const record = mapThunderBaySidewalk({ attributes: { OBJECTID: 9 } }, contextFor("thunder-bay-sidewalks"));
    expect(record.region).toBe("unknown");
    expect(record.fields.geometry?.value).toBe("UNKNOWN");
  });
});

describe("Thunder Bay City facilities", () => {
  it("stores the building name and address with every accessibility field UNKNOWN", () => {
    const record = mapThunderBayFacility(
      {
        attributes: { OBJECTID: 283, COMPLETE: "1841 MOUNTAIN RD", BUILDING: "South Neebing Community Centre" },
        geometry: { x: -89.346332, y: 48.317142 },
      },
      contextFor("thunder-bay-city-facilities"),
    );
    expect(record.fields.name?.value).toBe("South Neebing Community Centre");
    expect(record.fields.addr_housenumber?.value).toBe("1841");
    expect(record.fields.addr_street?.value).toBe("MOUNTAIN RD");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Thunder Bay registry entries", () => {
  it("are tier 0 municipal sources under the Thunder Bay licence, retrieved 2026-11-16", () => {
    for (const job of THUNDER_BAY_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("Thunder-Bay-Open-Data-Licence-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
