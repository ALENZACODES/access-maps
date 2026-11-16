import { describe, expect, it } from "vitest";
import { mapBramptonCityParking, mapBramptonTrail } from "../../src/municipal/cities/brampton.js";
import { geoFeature } from "../../src/municipal/cities/west-gta-shared.js";
import { readRegistry } from "../../src/registry.js";
import { ctxFor, expectValid, root } from "./west-shared.js";

/**
 * Features below are copied from the City of Brampton layers retrieved on 2026-11-16, cut to a few
 * columns and to the first two points of a line. Rows built with a changed TRAIL_TYPE or
 * ACCESSIBLE_CAP are variations of those rows for the test.
 */
describe("Brampton public parking garages", () => {
  const ctx = ctxFor("brampton-city-parking", "CC-BY-4.0");
  const feature = geoFeature({
    geometry: { type: "Point", coordinates: [-79.7598006972269, 43.6847446890968] },
    properties: {
      OBJECTID: 1,
      LOT_NAME: "CITY HALL PARKING GARAGE",
      CAPACITY: 368,
      ADDRESS: "2 WELLINGTON ST W",
      PUBLIC_CAP: 349,
      ACCESSIBLE_CAP: 8,
      HRLY_RATE: "First hour is free. $1 per 1/2 hour. $9 daily.",
    },
  });

  it("stores the published accessible-space count", () => {
    const record = mapBramptonCityParking(feature, ctx);
    expect(record.fields.capacity_disabled).toMatchObject({ value: 8, raw: "8", source_key: "ACCESSIBLE_CAP" });
    expect(record.fields.name?.value).toBe("CITY HALL PARKING GARAGE");
    expect(record.fields.addr_housenumber?.value).toBe("2");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("stores a published zero and keeps a blank count UNKNOWN", () => {
    const zero = mapBramptonCityParking({ ...feature, properties: { ...feature.properties, ACCESSIBLE_CAP: "0" } }, ctx);
    expect(zero.fields.capacity_disabled?.value).toBe(0);
    const blank = mapBramptonCityParking({ ...feature, properties: { ...feature.properties, ACCESSIBLE_CAP: "" } }, ctx);
    expect(blank.fields.capacity_disabled?.value).toBe("UNKNOWN");
  });
});

describe("Brampton recreational trails", () => {
  const ctx = ctxFor("brampton-recreational-trails", "CC-BY");
  const line = { type: "LineString", coordinates: [[-79.7984098382321, 43.7570185325553], [-79.7947582113257, 43.7603823876601]] };

  it("imports off-road trail types with the published type as kind", () => {
    const record = mapBramptonTrail(geoFeature({ geometry: line, properties: { OBJECTID: 1, STATUS: "EXISTING", TRAIL_TYPE: "MULTI-USE" } }), ctx);
    expect(record?.fields.kind?.value).toBe("MULTI-USE");
    expect(record?.fields.surface?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("leaves out on-road and undefined types", () => {
    for (const type of ["ON STREET BIKE LANE", "ON ROAD SIGNED ROUTE", "APRON", "CROSSWALK", "CROSSROAD", ""]) {
      expect(mapBramptonTrail(geoFeature({ geometry: line, properties: { OBJECTID: 5, TRAIL_TYPE: type } }), ctx), type).toBeNull();
    }
  });
});

describe("Brampton registry entries", () => {
  const registry = readRegistry(root);

  it("records a Creative Commons version only where the item links one", () => {
    const parking = registry.sources.find((entry) => entry.id === "brampton-city-parking")!;
    const trails = registry.sources.find((entry) => entry.id === "brampton-recreational-trails")!;
    expect(parking.licence_id).toBe("CC-BY-4.0");
    expect(trails.licence_id).toBe("CC-BY");
    for (const source of [parking, trails]) {
      expect(source.tier).toBe(0);
      expect(source.kind).toBe("municipal");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
