import { describe, expect, it } from "vitest";
import { guelphSidewalkWidth, mapGuelphParkingLot, mapGuelphRestroom, mapGuelphSidewalk, mapGuelphTrail } from "../../src/municipal/cities/guelph.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the City of Guelph services as retrieved on 2026-11-16, cut to the columns read. */
const ctx = (id: string) => provenance(id, "OGL-Guelph-2.0");

describe("Guelph restrooms", () => {
  const row = {
    OBJECTID: 3,
    RestroomType: "PORTABLE RESTROOM",
    ParkName: "GRANGE ROAD PARK",
    LocationDescription: "NORTH END OF PARKING LOT ON CONCRETE PAD",
    Status: "IN-USE",
  };
  const point = { x: -80.219288, y: 43.573614 };

  it("stores the published restroom type and leaves wheelchair UNKNOWN", () => {
    const record = mapGuelphRestroom(feature(row, point), ctx("guelph-restrooms"));
    expect(record?.tranche).toBe("washroom");
    expect(record?.fields.facility_type?.value).toBe("PORTABLE RESTROOM");
    expect(record?.fields.location?.value).toBe("NORTH END OF PARKING LOT ON CONCRETE PAD");
    expect(record?.fields.published_accessibility?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("skips a restroom that is not IN-USE", () => {
    expect(mapGuelphRestroom(feature({ ...row, Status: "REMOVED" }, point), ctx("guelph-restrooms"))).toBeNull();
  });
});

describe("Guelph parking lots", () => {
  const row = {
    OBJECTID: 4,
    LOTID: 18,
    LOTNAME: "West Parkade",
    LOCATION: "110 Macdonell Street",
    STATUS: "Open",
    PARKINGTYPE: "Parkade",
    ACCESSIBLESPACES: 20,
    WEBSITELINK: "https://guelph.ca/living/getting-around/drive/parking/",
  };
  const point = { x: -80.247477, y: 43.54577 };

  it("stores the published accessible-space count", () => {
    const record = mapGuelphParkingLot(feature(row, point), ctx("guelph-parking-lots"));
    expect(record?.fields.capacity_disabled?.value).toBe(20);
    expect(record?.fields.addr_housenumber?.value).toBe("110");
    expect(record?.fields.addr_street?.value).toBe("Macdonell Street");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("keeps a published 0 and does not treat a street description as a civic address", () => {
    const record = mapGuelphParkingLot(
      feature({ ...row, LOCATION: "Freshfield Street", ACCESSIBLESPACES: 0, PARKINGTYPE: "On-Street" }, point),
      ctx("guelph-parking-lots"),
    );
    expect(record?.fields.capacity_disabled?.value).toBe(0);
    expect(record?.fields.addr_street?.value).toBe("UNKNOWN");
    expect(record?.fields.addr_housenumber?.value).toBe("UNKNOWN");
  });
});

describe("Guelph sidewalks and trails", () => {
  const paths = [
    [
      [-80.262825, 43.54847],
      [-80.262836, 43.548453],
      [-80.263546, 43.547922],
    ],
  ];

  it("reads the metre figure of the published width", () => {
    const record = mapGuelphSidewalk(
      feature({ OBJECTID: 1, STATUS: "BUILT", SURFTYPE: "CONCRETE", WIDTH: "0.91m (3'-0\")" }, { paths }),
      ctx("guelph-sidewalks"),
    );
    expect(record?.fields.width?.value).toBe(0.91);
    expect(record?.fields.width?.raw).toBe("0.91m (3'-0\")");
    expect(record?.fields.surface?.value).toBe("CONCRETE");
    expect(record?.fields.kerb?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("leaves OTHER and UNKNOWN widths UNKNOWN", () => {
    const c = ctx("guelph-sidewalks");
    expect(guelphSidewalkWidth({ WIDTH: "OTHER" }, c).value).toBe("UNKNOWN");
    expect(guelphSidewalkWidth({ WIDTH: "UNKNOWN" }, c).value).toBe("UNKNOWN");
    expect(guelphSidewalkWidth({ WIDTH: "" }, c).value).toBe("UNKNOWN");
    expect(guelphSidewalkWidth({ WIDTH: "1.52m (5'-0\")" }, c).value).toBe(1.52);
  });

  it("skips a PROPOSED sidewalk", () => {
    expect(
      mapGuelphSidewalk(feature({ OBJECTID: 2, STATUS: "PROPOSED", SURFTYPE: "CONCRETE", WIDTH: "OTHER" }, { paths }), ctx("guelph-sidewalks")),
    ).toBeNull();
  });

  it("stores the published trail surface only", () => {
    const record = mapGuelphTrail(feature({ OBJECTID: 1, Surface_Type: "GRANULAR" }, { paths }), ctx("guelph-trails"));
    expect(record.fields.surface?.value).toBe("GRANULAR");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.kind?.value).toBe("trail");
    expectValid(record);
  });
});
