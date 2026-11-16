import { describe, expect, it } from "vitest";
import { mapWhitbyFacility, mapWhitbyPark, mapWhitbySidewalk, mapWhitbyTrail } from "../../src/municipal/cities/whitby.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectNoAccessibilityClaim, expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layers retrieved on 2026-11-16, cut to the columns read. */
const LICENCE = "OGL-Whitby-1.0";

describe("Whitby town facilities", () => {
  const ctx = provenance("whitby-town-facilities", LICENCE);

  it("maps a facility with address, postcode and web page and no accessibility claim", () => {
    const record = mapWhitbyFacility(
      cityFeature({
        attributes: {
          OBJECTID: 21,
          NAME: "Brooklin Community Centre and Library",
          ADDRESS: "8 Vipond Rd",
          TOWN: "Brooklin",
          POSTCODE: "L1M 1B3",
          TYPE: "Library",
          URL: "https://www.whitby.ca/explore-and-enjoy/parks-and-recreation/community-centres/",
        },
        geometry: { x: -78.96289652047611, y: 43.957603723355355 },
      }),
      ctx,
    );
    expect(record.tranche).toBe("venue");
    expect(record.region).toBe("n43.5_w079.0");
    expect(record.fields.name?.value).toBe("Brooklin Community Centre and Library");
    expect(record.fields.category?.value).toBe("Library");
    expect(record.fields.addr_housenumber?.value).toBe("8");
    expect(record.fields.addr_street?.value).toBe("Vipond Rd");
    expect(record.fields.addr_city?.value).toBe("Brooklin");
    expect(record.fields.addr_postcode?.value).toBe("L1M 1B3");
    expect(record.fields.website?.value).toBe("https://www.whitby.ca/explore-and-enjoy/parks-and-recreation/community-centres/");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });
});

describe("Whitby sidewalks", () => {
  const ctx = provenance("whitby-sidewalks", LICENCE);
  const attributes = {
    OBJECTID: 15,
    ROADNAME: "Thickson Rd S",
    LENGTH: 45,
    WIDTH: 3,
    AREA_SQM: 135,
    MATERIAL: "ASP",
    NORRAMPS: 0,
    ACCRAMPS: 2,
    OTHRAMPS: 0,
    TOTRAMPS: 2,
    SW_TYPE: "MultiUsePath",
  };
  const geometry = {
    paths: [
      [
        [-78.9053467796932, 43.8705183003167],
        [-78.9051680286626, 43.8701630668151],
        [-78.905143134694, 43.8701392894971],
      ],
    ],
  };

  it("keeps width, length, material and the published ramp counts without a wheelchair or ramp value", () => {
    const records = mapWhitbySidewalk(cityFeature({ attributes, geometry }), ctx)!;
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.tranche).toBe("path");
    expect(record.id).toBe("whitby-sidewalks:15");
    expect(record.region).toBe("n43.5_w079.0");
    expect(record.fields.kind?.value).toBe("MultiUsePath");
    expect(record.fields.footway?.value).toBe("UNKNOWN");
    expect(record.fields.surface?.value).toBe("ASP");
    expect(record.fields.width?.value).toBe(3);
    expect(record.fields.length_m?.value).toBe(45);
    expect(record.fields.wheelchair_description?.value).toBe("NORRAMPS=0; ACCRAMPS=2; OTHRAMPS=0; TOTRAMPS=2");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.ramp?.value).toBe("UNKNOWN");
    expect(record.fields.kerb?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("marks a Sidewalk row as a sidewalk and leaves blank ramp counts UNKNOWN", () => {
    const record = mapWhitbySidewalk(
      cityFeature({
        attributes: { ...attributes, SW_TYPE: "Sidewalk", NORRAMPS: null, ACCRAMPS: null, OTHRAMPS: null, TOTRAMPS: null, WIDTH: null },
        geometry,
      }),
      ctx,
    )![0]!;
    expect(record.fields.footway?.value).toBe("sidewalk");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("skips a cycle track and a row with no sidewalk type", () => {
    expect(mapWhitbySidewalk(cityFeature({ attributes: { ...attributes, SW_TYPE: "AsphaltCycleTrack" }, geometry }), ctx)).toBeNull();
    expect(mapWhitbySidewalk(cityFeature({ attributes: { ...attributes, SW_TYPE: null }, geometry }), ctx)).toBeNull();
  });
});

describe("Whitby trails", () => {
  const ctx = provenance("whitby-trails", LICENCE);
  const attributes = {
    OBJECTID: 11,
    PARK_NAME: "Whitburn Park",
    TRAIL_NAME: "Whitburn Park",
    ASSET_TYPE: "Walkway",
    SURF_CLASS: "Asphalt",
    WIDTH: 2.0999999,
    TrailLength: 5.73362989,
    STATUS: "Open",
  };
  const geometry = {
    paths: [
      [
        [-78.9613565669521, 43.9079009633288],
        [-78.9614083453112, 43.9078911508311],
        [-78.9614256151934, 43.9078878783787],
      ],
    ],
  };

  it("keeps the published type, surface, width and length", () => {
    const record = mapWhitbyTrail(cityFeature({ attributes, geometry }), ctx)![0]!;
    expect(record.id).toBe("whitby-trails:11");
    expect(record.fields.kind?.value).toBe("Walkway");
    expect(record.fields.surface?.value).toBe("Asphalt");
    expect(record.fields.width?.value).toBe(2.1);
    expect(record.fields.length_m?.value).toBe(5.73);
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("leaves a zero width UNKNOWN and skips service lanes and rows that are not open", () => {
    const zero = mapWhitbyTrail(cityFeature({ attributes: { ...attributes, WIDTH: 0 }, geometry }), ctx)![0]!;
    expect(zero.fields.width?.value).toBe("UNKNOWN");
    expect(zero.fields.width?.raw).toBe("0");
    expect(mapWhitbyTrail(cityFeature({ attributes: { ...attributes, ASSET_TYPE: "Storm-Service Lane" }, geometry }), ctx)).toBeNull();
    expect(mapWhitbyTrail(cityFeature({ attributes: { ...attributes, STATUS: "Closed" }, geometry }), ctx)).toBeNull();
    expect(mapWhitbyTrail(cityFeature({ attributes: { ...attributes, STATUS: null }, geometry }), ctx)).toHaveLength(1);
  });

  it("gives a record with no region when the row has no line", () => {
    const records = mapWhitbyTrail(cityFeature({ attributes, geometry: null }), ctx)!;
    expect(records).toHaveLength(1);
    expect(records[0]!.region).toBe("unknown");
    expect(records[0]!.fields.geometry?.value).toBe("UNKNOWN");
  });
});

describe("Whitby parks", () => {
  const ctx = provenance("whitby-parks", LICENCE);
  const attributes = {
    OBJECTID_1: 6,
    PARK_NAME: "Rolling Acres Park",
    FACILITYID: "PK38-01",
    CLASS: "LOCAL",
    AMENITIES: "Baseball Diamond,Soccer Pitch,Playspace,Washrooms,",
    ADDRESS: "69 Waller St",
  };
  const geometry = { x: -78.92, y: 43.9 };

  it("adds a washroom record with a derived coordinate when the amenity list names Washrooms", () => {
    const records = mapWhitbyPark(cityFeature({ attributes, geometry }), ctx);
    expect(records).toHaveLength(2);
    const [venue, washroom] = records as [(typeof records)[number], (typeof records)[number]];
    expect(venue.id).toBe("whitby-parks:6");
    expect(venue.fields.name?.value).toBe("Rolling Acres Park");
    expect(venue.fields.category?.value).toBe("LOCAL");
    expect(venue.fields.addr_housenumber?.value).toBe("69");
    expect(venue.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(venue.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(venue);
    expect(washroom.tranche).toBe("washroom");
    expect(washroom.id).toBe("whitby-parks:6:washroom");
    expect(washroom.fields.lat?.derived).toBe(true);
    expect(washroom.fields.facility_type?.raw).toBe("Washrooms");
    expect(washroom.fields.parent_id?.value).toBe("whitby-parks:6");
    expectNoAccessibilityClaim(washroom);
    expectValid(washroom);
  });

  it("keeps Accessible Amenities as the Town's flag and never as a wheelchair yes", () => {
    const records = mapWhitbyPark(
      cityFeature({ attributes: { ...attributes, AMENITIES: "Playspace,Accessible Amenities,Parking Spots," }, geometry }),
      ctx,
    );
    expect(records).toHaveLength(1);
    expect(records[0]!.fields.wheelchair_description?.value).toBe("AMENITIES=Accessible Amenities");
    expect(records[0]!.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(records[0]!);
  });

  it("adds nothing for an empty amenity list", () => {
    const records = mapWhitbyPark(cityFeature({ attributes: { ...attributes, AMENITIES: "" }, geometry }), ctx);
    expect(records).toHaveLength(1);
    expect(records[0]!.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });
});
