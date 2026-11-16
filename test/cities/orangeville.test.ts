import { describe, expect, it } from "vitest";
import { ORANGEVILLE_JOBS, mapOrangevillePark } from "../../src/municipal/cities/orangeville.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the Town of Orangeville Parks layer retrieved on 2026-11-16, with the amenity columns cut short. */

const fendley = {
  attributes: {
    OBJECTID: 14,
    FACILITYID: "7",
    NAME: "Fendley Park",
    SUBTYPEFIELD: null,
    FEATURECODE: null,
    FULLADDR: "11 Fendley Road, Orangeville Ontario ",
    OPERDAYS: "Sun-Sat",
    OPERHOURS: "Other",
    NUMPARKING: 60,
    ADACOMPLY: "No",
    PARKINGLOT: "Yes",
    PLAYGROUND: "Yes",
    RESTROOM: "Yes",
    SPLASHPAD: "Yes",
    ACCESSPLAYGROUND: "No",
  },
  geometry: { x: -80.13691778664612, y: 43.906354633062904 },
};

describe("Orangeville parks", () => {
  const ctx = contextFor("orangeville-parks");

  it("keeps the Town's accessibility columns as published flags, not as a wheelchair value", () => {
    const [venue] = mapOrangevillePark(fendley, ctx);
    if (!venue) throw new Error("expected a venue");
    expect(venue.id).toBe("orangeville-parks:14");
    expect(venue.region).toBe("n43.5_w080.5");
    expect(venue.fields.name?.value).toBe("Fendley Park");
    expect(venue.fields.addr_housenumber?.value).toBe("11");
    expect(venue.fields.addr_street?.value).toBe("Fendley Road");
    expect(venue.fields.wheelchair_description?.value).toBe("ADACOMPLY=No; ACCESSPLAYGROUND=No");
    expect(venue.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(venue.fields.ref?.value).toBe("7");
    expectValid(venue);
  });

  it("adds a washroom at the park point, marked derived, when RESTROOM is Yes", () => {
    const records = mapOrangevillePark(fendley, ctx);
    expect(records).toHaveLength(2);
    const washroom = records[1]!;
    expect(washroom.tranche).toBe("washroom");
    expect(washroom.id).toBe("orangeville-parks:14:washroom");
    expect(washroom.fields.lat?.derived).toBe(true);
    expect(washroom.fields.lon?.derived).toBe(true);
    expect(washroom.fields.parent_id?.value).toBe("orangeville-parks:14");
    expect(washroom.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(washroom.fields.published_accessibility?.value).toBe("UNKNOWN");
    expectValid(washroom);
  });

  it("adds no washroom when RESTROOM is No", () => {
    const records = mapOrangevillePark({ ...fendley, attributes: { ...fendley.attributes, RESTROOM: "No", ADACOMPLY: "Yes" } }, ctx);
    expect(records).toHaveLength(1);
    expect(records[0]!.fields.wheelchair_description?.value).toBe("ADACOMPLY=Yes; ACCESSPLAYGROUND=No");
  });
});

describe("Orangeville registry entry", () => {
  it("is a tier 0 municipal source under the Orangeville licence, retrieved 2026-11-16", () => {
    for (const job of ORANGEVILLE_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("OGL-Orangeville-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
