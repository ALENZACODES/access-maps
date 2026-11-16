import { describe, expect, it } from "vitest";
import {
  mapLondonLibrary,
  mapLondonOffStreetParking,
  mapLondonParkAmenity,
  mapLondonParkingInventory,
  mapLondonSidewalk,
  mapLondonTrail,
  mapLondonWalkway,
} from "../../src/municipal/cities/london.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the City of London OpenData services as retrieved on 2026-11-16, cut to the columns read. */
const LICENCE = "owner-permission-2026-11-16";

describe("London park amenities", () => {
  const ctx = provenance("london-park-amenities", LICENCE);

  it("writes a Washroom row as a washroom record with no accessibility value", () => {
    const record = mapLondonParkAmenity(
      feature(
        { OBJECTID: 9384, GIS_ID: 1043, Address: "25 Wilson Ave", Owner: "City", Type: "Washroom", GIS_FeatureKey: "Labatt Park Washrooms 1" },
        { x: -81.259428, y: 42.983675 },
      ),
      ctx,
    );
    expect(record.tranche).toBe("washroom");
    expect(record.id).toBe("london-park-amenities:9384");
    expect(record.fields.name?.value).toBe("Labatt Park Washrooms 1");
    expect(record.fields.operator?.value).toBe("City");
    expect(record.fields.addr_housenumber?.value).toBe("25");
    expect(record.fields.addr_street?.value).toBe("Wilson Ave");
    expect(record.region).toBe("n42.5_w081.5");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });

  it("writes any other amenity as a venue with the City's type as category", () => {
    const record = mapLondonParkAmenity(
      feature(
        { OBJECTID: 8714, GIS_ID: 352, Address: "2a Grosvenor St", Owner: "City", Type: "Play Structure", GIS_FeatureKey: "Gibbons Park Play Structure 1" },
        { x: -81.26216, y: 42.998937 },
      ),
      ctx,
    );
    expect(record.tranche).toBe("venue");
    expect(record.fields.category?.value).toBe("Play Structure");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });
});

describe("London parking", () => {
  it("keeps a blank CountDisabledSpaces UNKNOWN and names the stretch by its Location", () => {
    const ctx = provenance("london-parking-inventory", LICENCE);
    const row = {
      OBJECTID: 404,
      GIS_ID: 124,
      Name: null,
      Location: "West side of Clarence St / North of Angel St",
      AccessType: "Public",
      ParkingFacilityType: "Perpendicular Parking",
      CountDisabledSpaces: null,
    };
    const record = mapLondonParkingInventory(feature(row, { x: -81.250443, y: 42.989791 }), ctx);
    expect(record.fields.name?.value).toBe("West side of Clarence St / North of Angel St");
    expect(record.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expect(record.fields.category?.value).toBe("Perpendicular Parking");
    expectValid(record);
    const counted = mapLondonParkingInventory(feature({ ...row, CountDisabledSpaces: 0 }, { x: -81.250443, y: 42.989791 }), ctx);
    expect(counted.fields.capacity_disabled?.value).toBe(0);
  });

  it("places an off-street lot at the vertex mean of its outline", () => {
    const ctx = provenance("london-off-street-parking", LICENCE);
    const ring = [
      [-81.229237, 42.990232],
      [-81.228776, 42.990186],
      [-81.227623, 42.990699],
      [-81.229237, 42.990232],
    ];
    const record = mapLondonOffStreetParking(feature({ OBJECTID: 22, GIS_ID: 162, LotName: "Municipal Lot #1" }, { rings: [ring] }), ctx);
    expect(record.fields.name?.value).toBe("Municipal Lot #1");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expect(record.region).toBe("n42.5_w081.5");
    expectValid(record);
  });
});

describe("London libraries", () => {
  it("stores the branch name and address and no accessibility value", () => {
    const ctx = provenance("london-libraries", LICENCE);
    const record = mapLondonLibrary(
      feature({ OBJECTID: 19, GIS_ID: 1, GIS_FeatureKey: "Beacock Public Library", Address: "1280 Huron St" }, { x: -81.218822, y: 43.019538 }),
      ctx,
    );
    expect(record.fields.name?.value).toBe("Beacock Public Library");
    expect(record.fields.addr_street?.value).toBe("Huron St");
    expect(record.region).toBe("n43.0_w081.5");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });
});

describe("London paths", () => {
  it("keeps the sidewalk width class as a published pair and no numeric width", () => {
    const ctx = provenance("london-sidewalks", LICENCE);
    const record = mapLondonSidewalk(
      feature({ OBJECTID: 474, Width: "< 1.5m", Material: "Concrete" }, { paths: [[[-81.294957, 42.909381], [-81.294959, 42.909385], [-81.295525, 42.910657]]] }),
      ctx,
    );
    expect(record.tranche).toBe("path");
    expect(record.fields.wheelchair_description?.value).toBe("Width=< 1.5m");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expect(record.fields.surface?.value).toBe("Concrete");
    expect(record.fields.kind?.value).toBe("sidewalk");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });

  it("imports a walkway line", () => {
    const ctx = provenance("london-walkways", LICENCE);
    const record = mapLondonWalkway(feature({ OBJECTID: 1, Assumed: "Y" }, { paths: [[[-81.233655, 43.040403], [-81.234156, 43.040453]]] }), ctx);
    expect(record.fields.kind?.value).toBe("walkway");
    expect(record.region).toBe("n43.0_w081.5");
    expectValid(record);
  });

  it("imports a trail and leaves out Future, Road and Parking Lot rows", () => {
    const ctx = provenance("london-trails", LICENCE);
    const line = { paths: [[[-81.322216, 42.958903], [-81.32225, 42.958952]]] };
    const record = mapLondonTrail(feature({ OBJECTID: 19640, Type: "Trail", PathType: "Walking Trails", Status: null }, line), ctx);
    expect(record?.fields.kind?.value).toBe("Type=Trail; PathType=Walking Trails");
    if (record) expectValid(record);
    expect(mapLondonTrail(feature({ OBJECTID: 21845, Type: null, PathType: null, Status: "Future" }, line), ctx)).toBeNull();
    expect(mapLondonTrail(feature({ OBJECTID: 19665, Type: "Road", PathType: "Multi Use Path", Status: null }, line), ctx)).toBeNull();
    expect(mapLondonTrail(feature({ OBJECTID: 1, Type: "Parking Lot", PathType: "Multi Use Path", Status: null }, line), ctx)).toBeNull();
  });
});
