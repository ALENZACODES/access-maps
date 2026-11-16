import { describe, expect, it } from "vitest";
import {
  mapHaldimandAccessibleParking,
  mapHaldimandPedestrianCrossing,
  mapHaldimandSidewalk,
  mapHaldimandTrafficSignal,
  mapHaldimandTrail,
} from "../../src/municipal/cities/haldimand.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the Haldimand County GIS server as retrieved on 2026-11-16, cut to the columns read. */
const LICENCE = "owner-permission-2026-11-16";

describe("Haldimand accessible parking", () => {
  it("stores a point of the AccessibleParking layer with its published pairs and no count", () => {
    const ctx = provenance("haldimand-accessible-parking", LICENCE);
    const record = mapHaldimandAccessibleParking(
      feature({ OBJECTID: 7, Address: null, Ownership: null, ParkingType: "On Street", ByLaw: "Pending", Accessible: null }, { x: -79.945684, y: 43.07249 }),
      ctx,
    );
    expect(record.fields.category?.value).toBe("accessible parking location");
    expect(record.fields.wheelchair_description?.value).toBe("ParkingType=On Street; ByLaw=Pending");
    expect(record.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expect(record.fields.addr_street?.value).toBe("UNKNOWN");
    expect(record.region).toBe("n43.0_w080.0");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });
});

describe("Haldimand sidewalks", () => {
  const ctx = provenance("haldimand-sidewalks", LICENCE);
  const line = { paths: [[[-79.960848, 43.079354], [-79.960815, 43.079452], [-79.960497, 43.080081]]] };

  it("keeps the free-text width as a published pair and no numeric width", () => {
    const record = mapHaldimandSidewalk(feature({ OBJECTID: 1, STATUS: "ACTIVE", SURFTYPE: "CONCRETE", WIDTH: "1.52M(5'0\")" }, line), ctx);
    expect(record?.fields.wheelchair_description?.value).toBe("WIDTH=1.52M(5'0\")");
    expect(record?.fields.width?.value).toBe("UNKNOWN");
    expect(record?.fields.surface?.value).toBe("CONCRETE");
    if (record) expectValid(record);
  });

  it("leaves out rows with a blank, proposed, removed or not-assumed status", () => {
    for (const STATUS of [null, "PROPOSED", "REMOVED", "NOT ASSUMED"]) {
      expect(mapHaldimandSidewalk(feature({ OBJECTID: 2, STATUS, SURFTYPE: "CONCRETE", WIDTH: null }, line), ctx)).toBeNull();
    }
  });
});

describe("Haldimand traffic signals", () => {
  const ctx = provenance("haldimand-traffic-signals", LICENCE);

  it("keeps Audible and Accessible as the County's flags without deriving speech output", () => {
    const record = mapHaldimandTrafficSignal(
      feature(
        { OBJECTID: 108, Location: "BROAD ST", Intersecti: "CHESTNUT ST", Town: "DUNNVILLE", Subtype: "0", Removed_Da: -2209161600000, Audible: "YES", Accessible: "YES" },
        { x: -79.616988, y: 42.90357 },
      ),
      ctx,
    );
    expect(record?.fields.name?.value).toBe("BROAD ST / CHESTNUT ST");
    expect(record?.fields.wheelchair_description?.value).toBe("Audible=YES; Accessible=YES");
    expect(record?.fields.speech_output?.value).toBe("UNKNOWN");
    expect(record?.fields.category?.value).toBe("traffic signal location");
    if (record) {
      expectNoDerivedWheelchair(record);
      expectValid(record);
    }
  });

  it("imports a pole with a blank removal date and leaves blank and UNKNOWN flags UNKNOWN", () => {
    const record = mapHaldimandTrafficSignal(
      feature(
        { OBJECTID: 35, Location: "Caithness St W", Intersecti: "Argyle St N", Town: "CALEDONIA", Subtype: "1", Removed_Da: null, Audible: " ", Accessible: "UNKNOWN" },
        { x: -79.952017, y: 43.073774 },
      ),
      ctx,
    );
    expect(record?.fields.category?.value).toBe("traffic signal pole");
    expect(record?.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });

  it("leaves out handwells and removed rows", () => {
    const point = { x: -79.930475, y: 43.064205 };
    const handwell = { OBJECTID: 536, Location: null, Intersecti: null, Town: "CALEDONIA", Subtype: "4", Removed_Da: null, Audible: null, Accessible: null };
    expect(mapHaldimandTrafficSignal(feature(handwell, point), ctx)).toBeNull();
    expect(mapHaldimandTrafficSignal(feature({ ...handwell, Subtype: "1", Removed_Da: 1600387200000 }, point), ctx)).toBeNull();
  });
});

describe("Haldimand pedestrian crossings", () => {
  const ctx = provenance("haldimand-pedestrian-crossings", LICENCE);
  const row = { OBJECTID: 1, Name: "PEDESTRIAN CROSSOVER", Location: "MAIN STREET (RD 3)", Intersecti: "BRIDGE ST", Town: "DUNNVILLE", Removed_Da: -2209161600000, Audible: "Yes", Accessible: "YES" };
  const point = { x: -79.61688, y: 42.901499 };

  it("stores a mixed-case Yes as Audible=YES", () => {
    const record = mapHaldimandPedestrianCrossing(feature(row, point), ctx);
    expect(record?.fields.wheelchair_description?.value).toBe("Audible=YES; Accessible=YES");
    expect(record?.fields.category?.value).toBe("PEDESTRIAN CROSSOVER");
    if (record) expectValid(record);
  });

  it("leaves out the out-of-commission row and the test row", () => {
    expect(mapHaldimandPedestrianCrossing(feature({ ...row, Name: "OUT OF COMMISSION" }, point), ctx)).toBeNull();
    expect(
      mapHaldimandPedestrianCrossing(feature({ OBJECTID: 18, Name: "test", Location: null, Intersecti: null, Town: null, Removed_Da: null, Audible: null, Accessible: null }, point), ctx),
    ).toBeNull();
  });
});

describe("Haldimand trails", () => {
  const ctx = provenance("haldimand-trails", LICENCE);
  const line = { paths: [[[-79.619211, 42.901327], [-79.619648, 42.901252], [-79.61993, 42.901291]]] };

  it("imports active off-road trails and leaves out on-road routes and planned rows", () => {
    const row = { OBJECTID: 3, Type: "Multi-Use", Class: "Type 1: Multi-Use Trail", Status: "ACTIVE", OffRoad: "Y" };
    const record = mapHaldimandTrail(feature(row, line), ctx);
    expect(record?.fields.kind?.value).toBe("Type=Multi-Use; Class=Type 1: Multi-Use Trail");
    if (record) expectValid(record);
    expect(mapHaldimandTrail(feature({ ...row, OffRoad: "N" }, line), ctx)).toBeNull();
    expect(mapHaldimandTrail(feature({ ...row, Status: "PLANNING STAGE" }, line), ctx)).toBeNull();
  });
});
