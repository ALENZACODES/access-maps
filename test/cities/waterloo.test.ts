import { describe, expect, it } from "vitest";
import { mapWaterlooParkingLot, mapWaterlooPathSegment, mapWaterlooPlayground } from "../../src/municipal/cities/waterloo.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the City of Waterloo services as retrieved on 2026-11-16, cut to the columns read. */
const ctx = (id: string) => provenance(id, "Waterloo-Open-Data-User-Licence");

describe("Waterloo parking lots", () => {
  const rings = [
    [
      [-80.519166, 43.463867],
      [-80.519606, 43.464126],
      [-80.519335, 43.464367],
      [-80.519166, 43.463867],
    ],
  ];
  const row = { OBJECTID: 1, NAME: "City Centre Lot (Reserved)", ADDRESS: "100 REGINA ST S", CLASS: "Reserved Parking", SURFACE: "PAVED", ACCESSIBLE: "Y" };

  it("keeps the lot ACCESSIBLE flag as published and derives no space count", () => {
    const record = mapWaterlooParkingLot(feature(row, { rings }), ctx("waterloo-parking-lots"));
    expect(record.fields.wheelchair_description?.value).toBe("ACCESSIBLE=Y");
    expect(record.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expect(record.fields.addr_housenumber?.value).toBe("100");
    expect(record.fields.addr_street?.value).toBe("REGINA ST S");
    expect(record.fields.surface?.value).toBe("PAVED");
    expect(record.region).toBe("n43.0_w081.0");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });

  it("keeps a blank address UNKNOWN", () => {
    const record = mapWaterlooParkingLot(feature({ ...row, ADDRESS: null, ACCESSIBLE: "N" }, { rings }), ctx("waterloo-parking-lots"));
    expect(record.fields.addr_street?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("ACCESSIBLE=N");
  });
});

describe("Waterloo playgrounds", () => {
  const row = { OBJECTID: 1, ASSET_ID: 10147899, PLAYGROUND_NAME: "Atlantic Park", LIFECYCLESTATUS: "Active", SURFACE_TYPE: "Sand" };
  const point = { x: -80.50564, y: 43.515395 };

  it("stores the published play surface and no accessibility value", () => {
    const record = mapWaterlooPlayground(feature(row, point), ctx("waterloo-playgrounds"));
    expect(record?.fields.surface?.value).toBe("Sand");
    expect(record?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("skips a playground that is not Active", () => {
    expect(mapWaterlooPlayground(feature({ ...row, LIFECYCLESTATUS: "Removed" }, point), ctx("waterloo-playgrounds"))).toBeNull();
  });
});

describe("Waterloo sidewalks and trails", () => {
  const paths = [
    [
      [-80.547051, 43.498837],
      [-80.547056, 43.498817],
      [-80.547054, 43.498796],
    ],
  ];

  it("stores the published surface and length for a sidewalk", () => {
    const row = { OBJECTID: 1, STATUS: "Active", PATH_TYPE: "Sidewalk", SURFACE: "Concrete", LENGTH_M: 38.6054633822009 };
    const record = mapWaterlooPathSegment(feature(row, { paths }), ctx("waterloo-sidewalks"), "STATUS");
    expect(record?.fields.kind?.value).toBe("Sidewalk");
    expect(record?.fields.surface?.value).toBe("Concrete");
    expect(record?.fields.length_m?.value).toBe(38.61);
    expect(record?.fields.width?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("keeps the truncated trail type exactly as published", () => {
    const row = { OBJECTID: 86, LIFECYCLESTATUS: "Active", PATH_TYPE: "Recreational Tra", SURFACE: "Stonedust", LENGTH_M: 263.697734603199 };
    const record = mapWaterlooPathSegment(feature(row, { paths }), ctx("waterloo-trails"), "LIFECYCLESTATUS");
    expect(record?.fields.kind?.value).toBe("Recreational Tra");
    expect(record?.fields.surface?.value).toBe("Stonedust");
    expectValid(record!);
  });

  it("skips a row that is not Active", () => {
    const row = { OBJECTID: 2, LIFECYCLESTATUS: "Proposed", PATH_TYPE: "Walkway", SURFACE: "Asphalt", LENGTH_M: 10 };
    expect(mapWaterlooPathSegment(feature(row, { paths }), ctx("waterloo-trails"), "LIFECYCLESTATUS")).toBeNull();
  });
});
