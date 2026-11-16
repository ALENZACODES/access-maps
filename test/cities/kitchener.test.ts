import { describe, expect, it } from "vitest";
import {
  mapKitchenerAccessibleParking,
  mapKitchenerParkingLot,
  mapKitchenerPathSegment,
  mapKitchenerPlayground,
  mapKitchenerPlaygroundEquipment,
  mapKitchenerWashroom,
} from "../../src/municipal/cities/kitchener.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the City of Kitchener services as retrieved on 2026-11-16, cut to the columns read. */
const ctx = (id: string) => provenance(id, "OGL-Kitchener-1.0");

describe("Kitchener public washrooms", () => {
  const row = {
    OBJECTID: 1,
    LANDMARK: "HURON NATURAL AREA COMFORT STATION",
    CATEGORY: "Comfort Station",
    SUBCATEGORY: "Public",
    CIVIC_NO: 801,
    STREET: "TRILLIUM DR",
    STATUS: "ACTIVE",
    COMMON_LOCATION_REFERENCE: "HURON NATURAL AREA",
    HOURS_OF_OPERATION: "DAWN TO DUSK (SEASONAL)",
  };
  const point = { x: -80.481963, y: 43.398416 };

  it("keeps the published type, access and hours and leaves wheelchair UNKNOWN", () => {
    const record = mapKitchenerWashroom(feature(row, point), ctx("kitchener-public-washrooms"));
    expect(record?.tranche).toBe("washroom");
    expect(record?.id).toBe("kitchener-public-washrooms:1");
    expect(record?.region).toBe("n43.0_w080.5");
    expect(record?.fields.facility_type?.value).toBe("Comfort Station");
    expect(record?.fields.access?.value).toBe("Public");
    expect(record?.fields.opening_hours?.value).toBe("DAWN TO DUSK (SEASONAL)");
    expect(record?.fields.addr_housenumber?.value).toBe("801");
    expect(record?.fields.lat?.value).toBe(43.398416);
    expectNoDerivedWheelchair(record!);
    expect(record?.fields.published_accessibility?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("skips rows the City does not publish as ACTIVE", () => {
    const blank = { ...row, STATUS: "UNKNOWN", CIVIC_NO: null, STREET: null, HOURS_OF_OPERATION: null };
    expect(mapKitchenerWashroom(feature(blank, point), ctx("kitchener-public-washrooms"))).toBeNull();
    expect(mapKitchenerWashroom(feature({ ...row, STATUS: "HISTORIC" }, point), ctx("kitchener-public-washrooms"))).toBeNull();
  });

  it("keeps a blank civic number and blank hours UNKNOWN", () => {
    const record = mapKitchenerWashroom(
      feature({ ...row, CIVIC_NO: null, HOURS_OF_OPERATION: null }, point),
      ctx("kitchener-public-washrooms"),
    );
    expect(record?.fields.addr_housenumber?.value).toBe("UNKNOWN");
    expect(record?.fields.opening_hours?.value).toBe("UNKNOWN");
  });
});

describe("Kitchener parking lots", () => {
  const rings = [
    [
      [-80.436799, 43.394545],
      [-80.436679, 43.394457],
      [-80.436594, 43.394387],
      [-80.436799, 43.394545],
    ],
  ];
  const row = {
    OBJECTID: 1687,
    PARKINGFACILITYID: 5850,
    PARKING_FACILITY: "DOON PIONEER PARK CC AND LIBRARY",
    SUBCATEGORY: "SURFACE LOT",
    CIVIC_NO: "150",
    STREET: "PIONEER DR",
    PARKING_ACCESS: "PUBLIC",
    HOURS: "6:00 - 14:30",
    DAYS: null,
    STATUS: "ACTIVE",
    ACCESSIBLE_SPACES: 2,
    PARKING_URL: null,
  };

  it("stores the published accessible-space count and a vertex-mean point", () => {
    const record = mapKitchenerParkingLot(feature(row, { rings }), ctx("kitchener-parking-lots"));
    expect(record?.fields.capacity_disabled?.value).toBe(2);
    expect(record?.fields.opening_hours?.value).toBe("HOURS=6:00 - 14:30");
    expect(record?.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record?.fields.lat?.value).toBeCloseTo(43.394463, 5);
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("keeps a published 0 and leaves blank and -1 UNKNOWN", () => {
    const of = (value: unknown) =>
      mapKitchenerParkingLot(feature({ ...row, ACCESSIBLE_SPACES: value }, { rings }), ctx("kitchener-parking-lots"))?.fields
        .capacity_disabled?.value;
    expect(of(0)).toBe(0);
    expect(of(null)).toBe("UNKNOWN");
    expect(of(-1)).toBe("UNKNOWN");
  });

  it("skips a HISTORIC lot", () => {
    expect(mapKitchenerParkingLot(feature({ ...row, STATUS: "HISTORIC" }, { rings }), ctx("kitchener-parking-lots"))).toBeNull();
  });
});

describe("Kitchener accessible parking points", () => {
  const row = {
    OBJECTID: 1989,
    CATEGORY: "HANDICAP PARKING",
    SUBCATEGORY: "CHARLES BENTON PARKING GARAGE",
    STATUS: "ACTIVE",
    PARKINGFEATUREID: 361,
    LOCATION_DESCRIPTION: "CHARLES BENTON PARKING GARAGE",
  };
  const point = { x: -80.489014, y: 43.44908 };

  it("keeps the City's category token and derives no count or wheelchair value", () => {
    const record = mapKitchenerAccessibleParking(feature(row, point), ctx("kitchener-accessible-parking"));
    expect(record?.fields.category?.value).toBe("accessible parking feature");
    expect(record?.fields.wheelchair_description?.value).toBe(
      "CATEGORY=HANDICAP PARKING; SUBCATEGORY=CHARLES BENTON PARKING GARAGE",
    );
    expect(record?.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("skips other parking features and planned points", () => {
    expect(mapKitchenerAccessibleParking(feature({ ...row, CATEGORY: "LIGHT POLE" }, point), ctx("kitchener-accessible-parking"))).toBeNull();
    expect(mapKitchenerAccessibleParking(feature({ ...row, STATUS: "PLANNED" }, point), ctx("kitchener-accessible-parking"))).toBeNull();
  });
});

describe("Kitchener playgrounds and equipment", () => {
  const rings = [
    [
      [-80.455695, 43.420387],
      [-80.455593, 43.420445],
      [-80.455536, 43.420478],
      [-80.455695, 43.420387],
    ],
  ];
  const row = {
    OBJECTID: 17758,
    LANDMARKID: 10713,
    LANDMARK: "Traynor Park Playground",
    CIVIC_NO: null,
    STREET: "VANIER DR",
    CATEGORY: "Playground",
    STATUS: "ACTIVE",
    AODA_COMPLIANT: "Y",
    RESILIENT_SURFACE_MATERIAL: "EWF",
  };

  it("keeps AODA_COMPLIANT as the City's flag, never as a wheelchair value", () => {
    const record = mapKitchenerPlayground(feature(row, { rings }), ctx("kitchener-playgrounds"));
    expect(record?.fields.wheelchair_description?.value).toBe("AODA_COMPLIANT=Y");
    expect(record?.fields.surface?.value).toBe("EWF");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("leaves a token other than Y or N UNKNOWN with the token on raw", () => {
    const record = mapKitchenerPlayground(
      feature({ ...row, AODA_COMPLIANT: "X", RESILIENT_SURFACE_MATERIAL: null }, { rings }),
      ctx("kitchener-playgrounds"),
    );
    expect(record?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record?.fields.wheelchair_description?.raw).toBe("X");
    expect(record?.fields.surface?.value).toBe("UNKNOWN");
  });

  const equipment = {
    OBJECTID: 14,
    LANDMARKID: 23493,
    NAME: "Benninger Park Playground Accessible Ramp 1",
    CATEGORY: "Playground Accessible Ramp",
    ACCESSIBLE: "Y",
    MEMORIAL: "N",
    STATUS: "Active",
  };
  const point = { x: -80.539041, y: 43.404105 };

  it("keeps the equipment ACCESSIBLE flag as published", () => {
    const record = mapKitchenerPlaygroundEquipment(feature(equipment, point), ctx("kitchener-playground-equipment"));
    expect(record?.fields.wheelchair_description?.value).toBe("ACCESSIBLE=Y");
    expect(record?.fields.ramp?.value).toBe("UNKNOWN");
    expect(record?.fields.name?.value).toBe("Benninger Park Playground Accessible Ramp 1");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("does not read the name of a memorial row", () => {
    const record = mapKitchenerPlaygroundEquipment(feature({ ...equipment, MEMORIAL: "Y" }, point), ctx("kitchener-playground-equipment"));
    expect(record?.fields.name?.value).toBe("UNKNOWN");
  });
});

describe("Kitchener sidewalks, trails and crosswalks", () => {
  const stairs = {
    OBJECTID: 648893,
    STATUS: "ACTIVE",
    CATEGORY: "SIDEWALKS AND WALKWAYS",
    SUBCATEGORY: "WALKWAY",
    FEATURE_TYPE: "STAIRS",
    SURFACE_MATERIAL: "CONCRETE",
    WIDTH_M: 1.5,
    GRADE: null,
    RAILING: "Y",
    CURBCUT: "N",
  };
  const paths = [
    [
      [-80.45683, 43.459344],
      [-80.456828, 43.459314],
    ],
  ];

  it("keeps stairs marked as stairs with the published width and flags", () => {
    const record = mapKitchenerPathSegment(feature(stairs, { paths }), ctx("kitchener-sidewalks"));
    expect(record?.tranche).toBe("path");
    expect(record?.fields.kind?.value).toBe("WALKWAY");
    expect(record?.fields.footway?.value).toBe("STAIRS");
    expect(record?.fields.width?.value).toBe(1.5);
    expect(record?.fields.wheelchair_description?.value).toBe("CURBCUT=N; RAILING=Y");
    expect(record?.fields.handrail?.value).toBe("UNKNOWN");
    expect(record?.fields.kerb?.value).toBe("UNKNOWN");
    expect(record?.fields.length_m?.value).toBe("UNKNOWN");
    expect(record?.fields.geometry?.value).toEqual(paths[0]);
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("does not import a virtual network link", () => {
    const link = {
      ...stairs,
      SUBCATEGORY: "CONTINUOUS SIDEWALK",
      FEATURE_TYPE: "NA (VIRTUAL LINK)",
      SURFACE_MATERIAL: "NA (VIRTUAL LINK)",
      WIDTH_M: 0,
    };
    expect(mapKitchenerPathSegment(feature(link, { paths }), ctx("kitchener-sidewalks"))).toBeNull();
  });

  it("leaves a width of 0 and a GRADE of UNKNOWN out", () => {
    const record = mapKitchenerPathSegment(
      feature({ ...stairs, FEATURE_TYPE: "SURFACE", WIDTH_M: 0, GRADE: "UNKNOWN", RAILING: "N" }, { paths }),
      ctx("kitchener-sidewalks"),
    );
    expect(record?.fields.width?.value).toBe("UNKNOWN");
    expect(record?.fields.wheelchair_description?.value).toBe("CURBCUT=N; RAILING=N");
  });

  it("stores the crossing kind for the crosswalk layer only", () => {
    const row = {
      OBJECTID: 845075,
      STATUS: "ACTIVE",
      CATEGORY: "SIDEWALKS AND WALKWAYS",
      SUBCATEGORY: "CROSSWALK",
      FEATURE_TYPE: "SURFACE",
      SURFACE_MATERIAL: "ASPHALT (PAINTED)",
    };
    const record = mapKitchenerPathSegment(feature(row, { paths }), ctx("kitchener-crosswalks"), true);
    expect(record?.fields.crossing?.value).toBe("CROSSWALK");
    expect(record?.fields.surface?.value).toBe("ASPHALT (PAINTED)");
    expect(record?.fields.width?.value).toBe("UNKNOWN");
    expect(record?.fields.tactile_paving?.value).toBe("UNKNOWN");
    expectValid(record!);
    expect(mapKitchenerPathSegment(feature(stairs, { paths }), ctx("kitchener-sidewalks"))?.fields.crossing?.value).toBe("UNKNOWN");
  });

  it("gives a feature with no line the unknown region so the importer leaves it out", () => {
    expect(mapKitchenerPathSegment(feature(stairs, null), ctx("kitchener-sidewalks"))?.region).toBe("unknown");
  });
});
