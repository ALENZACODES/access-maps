import { describe, expect, it } from "vitest";
import {
  CORNWALL_JOBS,
  mapCornwallBusStop,
  mapCornwallRecreationalPath,
  mapCornwallSidewalk,
  mapCornwallWaterStation,
} from "../../src/municipal/cities/cornwall.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the City of Cornwall layers retrieved on 2026-11-16, with long lines cut short. */

describe("Cornwall sidewalks", () => {
  const ctx = contextFor("cornwall-sidewalks");
  const sidewalk = {
    attributes: { OBJECTID: 1, SIDEWALKID: 111, ROUTE: 5, TYPE: "STANDARD", MATERIAL: "CONCRETE", SEG_LENGTH: 191.3, SLRN_ID: 436, SWLK_WIDTH: 1.5 },
    geometry: {
      paths: [
        [
          [-74.70048, 45.030187],
          [-74.699262, 45.028697],
        ],
      ],
    },
  };

  it("stores the material and keeps the width as text because the layer states no unit", () => {
    const record = mapCornwallSidewalk(sidewalk, ctx);
    expect(record.tranche).toBe("path");
    expect(record.region).toBe("n45.0_w075.0");
    expect(record.fields.footway?.value).toBe("sidewalk");
    expect(record.fields.surface?.value).toBe("CONCRETE");
    expect(record.fields.wheelchair_description?.value).toBe("TYPE=STANDARD; SWLK_WIDTH=1.5");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.length_m?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("leaves blank columns UNKNOWN", () => {
    const record = mapCornwallSidewalk({ ...sidewalk, attributes: { OBJECTID: 2, TYPE: null, MATERIAL: null, SWLK_WIDTH: null } }, ctx);
    expect(record.fields.surface?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });
});

describe("Cornwall recreational paths", () => {
  const ctx = contextFor("cornwall-recreational-paths");
  const path = {
    attributes: {
      OBJECTID: 1,
      OWNERSHIP: "CORNWALL",
      ON_ROAD: "N",
      FACILITY_CATEGORY: "PHYSICALLY SEPARATED BIKEWAYS",
      FACILITY_TYPE: "MULTI-USE RECREATIONAL PATH",
      PATH_NAME: null,
      PATH_WIDTH: 2.5,
      SURFACE_TYPE: "ASPHALT",
    },
    geometry: {
      paths: [
        [
          [-74.811746, 45.032595],
          [-74.811787, 45.032359],
        ],
      ],
    },
  };

  it("imports an off-road path with its published type and surface", () => {
    const record = mapCornwallRecreationalPath(path, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.fields.kind?.value).toBe("MULTI-USE RECREATIONAL PATH");
    expect(record.fields.surface?.value).toBe("ASPHALT");
    expect(record.fields.wheelchair_description?.value).toBe("PATH_WIDTH=2.5");
    expect(record.fields.signposted_as?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("leaves out bicycle lanes, paved shoulders and mixed-traffic routes on the road", () => {
    expect(mapCornwallRecreationalPath({ ...path, attributes: { ...path.attributes, ON_ROAD: "Y", FACILITY_TYPE: "PAVED SHOULDERS" } }, ctx)).toBeNull();
    expect(mapCornwallRecreationalPath({ ...path, attributes: { ...path.attributes, ON_ROAD: null } }, ctx)).toBeNull();
  });
});

describe("Cornwall water bottle filling stations and bus stops", () => {
  it("stores the published place name and no accessibility value", () => {
    const record = mapCornwallWaterStation(
      { attributes: { FID: 1, LOCATION: "LAMOUREUX PARK - WOODHOUSE MUSEUM" }, geometry: { x: -74.729341, y: 45.013923 } },
      contextFor("cornwall-water-bottle-filling-stations"),
    );
    expect(record.fields.name?.value).toBe("LAMOUREUX PARK - WOODHOUSE MUSEUM");
    expect(record.fields.category_group?.value).toBe("drinking_water");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("keeps the undefined wheelchair code as raw and wheelchair_boarding UNKNOWN", () => {
    const ctx = contextFor("cornwall-transit-bus-stops");
    const stop = {
      attributes: { FID: 1, stop_id: "101", stop_name: "Joyce & Riverdale", stop_lat: 45.016235, stop_lon: -74.77124, wheelchair: "0" },
      geometry: { x: -74.77124, y: 45.016235 },
    };
    const record = mapCornwallBusStop(stop, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.tranche).toBe("transit");
    expect(record.id).toBe("cornwall-transit-bus-stops:101");
    expect(record.fields.name?.value).toBe("Joyce & Riverdale");
    expect(record.fields.wheelchair_boarding?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_boarding?.raw).toBe("0");
    expect(mapCornwallBusStop({ ...stop, attributes: { ...stop.attributes, wheelchair: "1" } }, ctx)?.fields.wheelchair_boarding?.value).toBe("UNKNOWN");
    expect(mapCornwallBusStop({ ...stop, attributes: { ...stop.attributes, stop_id: "" } }, ctx)).toBeNull();
    expectValid(record);
  });
});

describe("Cornwall registry entries", () => {
  it("are tier 0 municipal sources under the Cornwall licence, retrieved 2026-11-16", () => {
    for (const job of CORNWALL_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("Cornwall-Open-Data-Licence-2.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
