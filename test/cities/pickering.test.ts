import { describe, expect, it } from "vitest";
import { mapPickeringFacility, mapPickeringPark } from "../../src/municipal/cities/pickering.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectNoAccessibilityClaim, expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layers retrieved on 2026-11-16, cut to the columns read. Outlines are shortened. */
const LICENCE = "Pickering-Open-Data-Licence-1.0";

describe("Pickering facilities", () => {
  const ctx = provenance("pickering-facilities", LICENCE);

  it("maps a facility point with its address and no accessibility claim", () => {
    const record = mapPickeringFacility(
      cityFeature({
        attributes: { OBJECTID: 6, Name: "Claremont Library Branch", Address: "4941 Brock Road", City: "Claremont", Postal_Code: "L1Y 1A9", Categories: "Library" },
        geometry: { x: -79.12845147833583, y: 43.97035561890789 },
      }),
      ctx,
    );
    expect(record.tranche).toBe("venue");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.name?.value).toBe("Claremont Library Branch");
    expect(record.fields.category?.value).toBe("Library");
    expect(record.fields.addr_housenumber?.value).toBe("4941");
    expect(record.fields.addr_street?.value).toBe("Brock Road");
    expect(record.fields.addr_city?.value).toBe("Claremont");
    expect(record.fields.addr_postcode?.value).toBe("L1Y 1A9");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });
});

describe("Pickering parks", () => {
  const ctx = provenance("pickering-parks", LICENCE);
  const attributes = {
    OBJECTID: 3,
    PARKNUMBER: "P-045",
    PARKNAME: "Progress Frenchman's Bay East Park",
    ParkAddress: "680P Front Rd",
    TYPE: "Community Park",
    Washroom: 0,
    Status: "Assumed",
  };
  const geometry = {
    rings: [
      [
        [-79.0843819747049, 43.8161447638123],
        [-79.0846834357988, 43.8159684229083],
        [-79.0849194709617, 43.8161205878064],
        [-79.0843819747049, 43.8161447638123],
      ],
    ],
  };

  it("adds a washroom record with a derived coordinate when the Washroom code is 0, the domain's Yes", () => {
    const records = mapPickeringPark(cityFeature({ attributes, geometry }), ctx)!;
    expect(records).toHaveLength(2);
    const [venue, washroom] = records as [(typeof records)[number], (typeof records)[number]];
    expect(venue.tranche).toBe("venue");
    expect(venue.id).toBe("pickering-parks:3");
    expect(venue.region).toBe("n43.5_w079.5");
    expect(venue.fields.name?.value).toBe("Progress Frenchman's Bay East Park");
    expect(venue.fields.category?.value).toBe("Community Park");
    expect(venue.fields.ref?.value).toBe("P-045");
    expect(venue.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expectNoAccessibilityClaim(venue);
    expectValid(venue);
    expect(washroom.tranche).toBe("washroom");
    expect(washroom.id).toBe("pickering-parks:3:washroom");
    expect(washroom.fields.lat?.derived).toBe(true);
    expect(washroom.fields.lon?.derived).toBe(true);
    expect(washroom.fields.lat?.value).toBe(venue.fields.lat?.value);
    expect(washroom.fields.facility_type?.raw).toBe("0");
    expect(washroom.fields.parent_id?.value).toBe("pickering-parks:3");
    expectNoAccessibilityClaim(washroom);
    expectValid(washroom);
  });

  it("adds no washroom for code 1 (No), code 2 (Unknown), a blank code or a blank status", () => {
    for (const Washroom of [1, 2, null]) {
      expect(mapPickeringPark(cityFeature({ attributes: { ...attributes, Washroom }, geometry }), ctx)).toHaveLength(1);
    }
    expect(mapPickeringPark(cityFeature({ attributes: { ...attributes, Status: null }, geometry }), ctx)).toHaveLength(1);
  });

  it("skips a park that is planned, under construction or not in service", () => {
    for (const Status of ["Planned", "Under Construction", "In Progress", "Not In Service", "Decommissioned"]) {
      expect(mapPickeringPark(cityFeature({ attributes: { ...attributes, Status }, geometry }), ctx)).toBeNull();
    }
  });
});
