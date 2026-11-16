import { describe, expect, it } from "vitest";
import {
  mapWindsorBusStop,
  mapWindsorDrinkingFountain,
  mapWindsorParkWashroom,
  mapWindsorPlayground,
  mapWindsorSidewalk,
  mapWindsorTrail,
} from "../../src/municipal/cities/windsor.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the City of Windsor services as retrieved on 2026-11-16, cut to the columns read. */
const ctx = (id: string) => provenance(id, "OGL-Windsor-1.0");

describe("Windsor park washrooms, playgrounds and fountains", () => {
  it("stores a park washroom with its park and address and no accessibility value", () => {
    const record = mapWindsorParkWashroom(
      feature({ OBJECTID: 303, park_name: "Jackson", park_address: "125 Tecumseh Rd E" }, { x: -83.023898, y: 42.292193 }),
      ctx("windsor-park-washrooms"),
    );
    expect(record.tranche).toBe("washroom");
    expect(record.fields.name?.value).toBe("Jackson");
    expect(record.fields.address?.value).toBe("125 Tecumseh Rd E");
    expect(record.region).toBe("n42.0_w083.5");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });

  it("keeps the playground ACCESSIBLE pair as published text", () => {
    const row = { OBJECTID: 29, gisid: "P057-PLAY-1", park_name: "Flora", asset_description: "SIZE=SMALL, ACCESSIBLE=YES" };
    const record = mapWindsorPlayground(feature(row, { x: -82.928294, y: 42.338421 }), ctx("windsor-playgrounds"));
    expect(record.fields.wheelchair_description?.value).toBe("SIZE=SMALL, ACCESSIBLE=YES");
    expectNoDerivedWheelchair(record);
    expectValid(record);
    const none = mapWindsorPlayground(feature({ ...row, asset_description: null }, { x: -82.928294, y: 42.338421 }), ctx("windsor-playgrounds"));
    expect(none.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });

  it("stores a drinking fountain with no accessibility value", () => {
    const record = mapWindsorDrinkingFountain(
      feature({ OBJECTID: 307, gisid: "P129-DRNK-1", park_name: "Oakwood" }, { x: -83.035057, y: 42.257511 }),
      ctx("windsor-drinking-fountains"),
    );
    expect(record.fields.category_group?.value).toBe("drinking_water");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Windsor bus stops", () => {
  const row = { OBJECTID: 3, on_street: "Foster", at_street: "Walker", landing_type: "CONCRETE_GRASS", has_full_access: "N", public_id: 2604 };
  const point = { x: -82.976733, y: 42.276532 };

  it("keeps has_full_access as the City's flag", () => {
    const record = mapWindsorBusStop(feature(row, point), ctx("windsor-bus-stops"));
    expect(record.fields.name?.value).toBe("Foster / Walker");
    expect(record.fields.wheelchair_description?.value).toBe("has_full_access=N; landing_type=CONCRETE_GRASS");
    expect(record.fields.ref?.value).toBe("2604");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });

  it("leaves a blank flag out", () => {
    const record = mapWindsorBusStop(feature({ ...row, has_full_access: " ", landing_type: null }, point), ctx("windsor-bus-stops"));
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });
});

describe("Windsor sidewalks and trails", () => {
  const paths = [
    [
      [-82.971154, 42.327968],
      [-82.971254, 42.327966],
      [-82.971354, 42.327965],
    ],
  ];
  const sidewalk = { OBJECTID: 1, sidewalk_type: "Not Applicable", sidewalk_width: 1.5, surface_type: "Concrete Sidewalk", service_status: "In Service" };

  it("stores an ordinary sidewalk with its published width and surface", () => {
    const record = mapWindsorSidewalk(feature(sidewalk, { paths }), ctx("windsor-sidewalks"));
    expect(record?.fields.kind?.value).toBe("sidewalk");
    expect(record?.fields.width?.value).toBe(1.5);
    expect(record?.fields.surface?.value).toBe("Concrete Sidewalk");
    expect(record?.fields.length_m?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("rounds the published single-precision width and keeps the raw token", () => {
    const record = mapWindsorSidewalk(feature({ ...sidewalk, sidewalk_width: 1.2000000476837158 }, { paths }), ctx("windsor-sidewalks"));
    expect(record?.fields.width?.value).toBe(1.2);
    expect(record?.fields.width?.raw).toBe("1.2000000476837158");
  });

  it("skips segments out of service, cycle tracks and paved shoulders", () => {
    const c = ctx("windsor-sidewalks");
    expect(mapWindsorSidewalk(feature({ ...sidewalk, service_status: "Temp. Out-New Construction" }, { paths }), c)).toBeNull();
    expect(mapWindsorSidewalk(feature({ ...sidewalk, sidewalk_type: "cycle" }, { paths }), c)).toBeNull();
    expect(mapWindsorSidewalk(feature({ ...sidewalk, sidewalk_type: "paved shld" }, { paths }), c)).toBeNull();
    expect(mapWindsorSidewalk(feature({ ...sidewalk, sidewalk_type: "mup" }, { paths }), c)?.fields.kind?.value).toBe("mup");
  });

  it("leaves a surface that points to a qualifier UNKNOWN", () => {
    const record = mapWindsorSidewalk(feature({ ...sidewalk, surface_type: "See Qualifier For Details" }, { paths }), ctx("windsor-sidewalks"));
    expect(record?.fields.surface?.value).toBe("UNKNOWN");
  });

  const trail = {
    OBJECTID: 6,
    trail_type: "Multi-use Trail",
    trail_width: 3,
    surface_material_type: "Asphalt",
    status: "COMPLETE",
    is_all_ages_and_abilities: "y",
  };

  it("keeps is_all_ages_and_abilities as the City's flag", () => {
    const record = mapWindsorTrail(feature(trail, { paths }), ctx("windsor-paths-trails"));
    expect(record?.fields.kind?.value).toBe("Multi-use Trail");
    expect(record?.fields.width?.value).toBe(3);
    expect(record?.fields.wheelchair_description?.value).toBe("is_all_ages_and_abilities=y");
    expectNoDerivedWheelchair(record!);
    expectValid(record!);
  });

  it("skips trails that are not complete and roadway lines", () => {
    const c = ctx("windsor-paths-trails");
    expect(mapWindsorTrail(feature({ ...trail, status: "IN PROGRESS", trail_width: null, surface_material_type: null }, { paths }), c)).toBeNull();
    expect(mapWindsorTrail(feature({ ...trail, status: null }, { paths }), c)).toBeNull();
    expect(mapWindsorTrail(feature({ ...trail, trail_type: "Roadway" }, { paths }), c)).toBeNull();
    expect(mapWindsorTrail(feature({ ...trail, status: "COMPLETE - N/A", trail_width: 0 }, { paths }), c)?.fields.width?.value).toBe("UNKNOWN");
  });
});
