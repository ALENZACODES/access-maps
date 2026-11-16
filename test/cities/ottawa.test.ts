import { describe, expect, it } from "vitest";
import {
  OTTAWA_MORE_JOBS,
  mapOttawaDrinkingFountain,
  mapOttawaLibrary,
  mapOttawaPark,
  mapOttawaPedestrianSegment,
  mapOttawaRecreationFacility,
} from "../../src/municipal/cities/ottawa.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the City of Ottawa layers retrieved on 2026-11-16, cut to the columns read. */

describe("Ottawa recreation facilities, libraries and drinking fountains", () => {
  it("names a building element and stores no accessibility value", () => {
    const record = mapOttawaRecreationFacility(
      {
        attributes: {
          OBJECTID: 4,
          BUSINESS_ENTITY_DESC: "St. Laurent Complex/Don Gamble Community Centre",
          BUILDING_DESC: "St. Laurent Complex/Don Gamble Community Centre",
          BUILDING_TYPE: "Recreation Complex",
          BUILDING_ELEMENT_DESC: "St. Laurent Cmplx Arena",
          BUILDING_ELEMENT_TYPE: "Arena",
          SUBTYPE: "Element",
          ADDRNUM: 525,
          FULLNAME: "Côté St",
          LINK: "https://ottawa.ca/en/recreation-and-parks/recreation-facilities/facility-listing/st-laurent-complex",
        },
        geometry: { x: -75.6396, y: 45.4365 },
      },
      contextFor("ottawa-recreation-facilities"),
    );
    expect(record.fields.name?.value).toBe("St. Laurent Cmplx Arena");
    expect(record.fields.category?.value).toBe("Arena");
    expect(record.fields.addr_housenumber?.value).toBe("525");
    expect(record.fields.addr_street?.value).toBe("Côté St");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("stores a library branch by its acronym", () => {
    const record = mapOttawaLibrary(
      {
        attributes: { ObjectId: 1, Name: "Alta Vista", Acronym: "AL", Street_Address: "2516 Alta Vista", City: "Ottawa", Province: "ON", Postal_Code: "K1V 7T1" },
        geometry: { x: -75.661077, y: 45.378183 },
      },
      contextFor("ottawa-library-locations"),
    );
    expect(record.id).toBe("ottawa-library-locations:AL");
    expect(record.fields.name?.value).toBe("Alta Vista");
    expect(record.fields.addr_postcode?.value).toBe("K1V 7T1");
    expect(record.fields.category?.value).toBe("library");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("keeps the fountain hours sentence and the inside or outside value as published", () => {
    const ctx = contextFor("ottawa-drinking-fountains");
    const fountain = {
      attributes: {
        OBJECTID: 1,
        BUILDING_NAME: "Ottawa Public Library Hazeldean Branch",
        ADDRESS: "50 Castlefrank Rd",
        OPEN_YEAR_ROUND: "Yes",
        HOURS_OF_OPERATION: "Open during facility business hours",
        INSIDE_OUTSIDE: "Inside",
        URL: null,
      },
      geometry: { x: -75.8937, y: 45.2953 },
    };
    const record = mapOttawaDrinkingFountain(fountain, ctx);
    expect(record.fields.opening_hours?.value).toBe("Open during facility business hours");
    expect(record.fields.indoor?.value).toBe("yes");
    expect(record.fields.category_group?.value).toBe("drinking_water");
    expect(record.fields.website?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
    const outside = mapOttawaDrinkingFountain({ ...fountain, attributes: { ...fountain.attributes, INSIDE_OUTSIDE: "Outside" } }, ctx);
    expect(outside.fields.indoor?.value).toBe("no");
    const blank = mapOttawaDrinkingFountain({ ...fountain, attributes: { ...fountain.attributes, INSIDE_OUTSIDE: null } }, ctx);
    expect(blank.fields.indoor?.value).toBe("UNKNOWN");
  });
});

describe("Ottawa parks and greenspace", () => {
  const ctx = contextFor("ottawa-parks");
  const park = {
    attributes: {
      OBJECTID: 1,
      PARK_ID: 479,
      NAME: "Heron Park",
      ADDRESS: "999 Heron Road",
      PARK_TYPE: "Active Recreation",
      ACCESSIBLE: "no/non",
      LATITUDE: 45.38066028,
      LONGITUDE: -75.67721307,
    },
    geometry: {
      rings: [
        [
          [-75.678, 45.38],
          [-75.676, 45.38],
          [-75.676, 45.382],
          [-75.678, 45.38],
        ],
      ],
    },
  };

  it("keeps the City's flag as published text and uses the published point", () => {
    const record = mapOttawaPark(park, ctx);
    expect(record.fields.wheelchair_description?.value).toBe("ACCESSIBLE=no");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.lat?.value).toBe(45.38066);
    expect(record.fields.lat?.source_key).toBe("LATITUDE");
    expect(record.fields.lon?.source_key).toBe("LONGITUDE");
    expect(record.fields.addr_housenumber?.value).toBe("999");
    expect(record.region).toBe("n45.0_w076.0");
    expectValid(record);
    const yes = mapOttawaPark({ ...park, attributes: { ...park.attributes, ACCESSIBLE: "yes/oui" } }, ctx);
    expect(yes.fields.wheelchair_description?.value).toBe("ACCESSIBLE=yes");
    expect(yes.fields.wheelchair?.value).toBe("UNKNOWN");
  });

  it("falls back to the outline's vertex mean and leaves a blank flag UNKNOWN", () => {
    const record = mapOttawaPark({ ...park, attributes: { ...park.attributes, LATITUDE: null, LONGITUDE: null, ACCESSIBLE: null } }, ctx);
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.lat?.value).toBe(45.380667);
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
  });
});

describe("Ottawa pedestrian network", () => {
  const ctx = contextFor("ottawa-pedestrian-network");
  const segment = {
    attributes: { OBJECTID: 27833, WALK_TYPE: "SIDEWALK", DESCRIPTION_EN: "Sidewalks and Paths" },
    geometry: {
      paths: [
        [
          [-76.213424, 45.468789],
          [-76.21328, 45.467841],
        ],
      ],
    },
  };

  it("stores the walk type and nothing the layer does not publish", () => {
    const record = mapOttawaPedestrianSegment(segment, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.fields.kind?.value).toBe("sidewalk");
    expect(record.fields.kind?.raw).toBe("SIDEWALK");
    expect(record.fields.footway?.value).toBe("sidewalk");
    for (const key of ["surface", "width", "kerb", "incline", "wheelchair", "length_m"]) {
      expect(record.fields[key]?.value).toBe("UNKNOWN");
    }
    expectValid(record);
    const mup = mapOttawaPedestrianSegment({ ...segment, attributes: { ...segment.attributes, WALK_TYPE: "MUP" } }, ctx);
    expect(mup?.fields.kind?.value).toBe("multi-use pathway");
    expect(mup?.fields.footway?.value).toBe("UNKNOWN");
  });

  it("skips a walk type the layer does not define", () => {
    expect(mapOttawaPedestrianSegment({ ...segment, attributes: { ...segment.attributes, WALK_TYPE: "ROAD" } }, ctx)).toBeNull();
    expect(mapOttawaPedestrianSegment({ ...segment, attributes: { ...segment.attributes, WALK_TYPE: null } }, ctx)).toBeNull();
  });
});

describe("Ottawa registry entries added in this pass", () => {
  it("are tier 0 municipal sources under the Ottawa licence, retrieved 2026-11-16", () => {
    for (const job of OTTAWA_MORE_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("Ottawa-Open-Data-Licence-2.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
