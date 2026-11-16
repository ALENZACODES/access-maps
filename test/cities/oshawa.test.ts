import { describe, expect, it } from "vitest";
import { mapOshawaCommunityCentre, mapOshawaTrail } from "../../src/municipal/cities/oshawa.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectNoAccessibilityClaim, expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layers retrieved on 2026-11-16, cut to the columns read. */
const LICENCE = "OGL-Oshawa-2.0";

describe("Oshawa community centres", () => {
  const ctx = provenance("oshawa-community-centres", LICENCE);

  it("maps a centre with its split address and no accessibility claim", () => {
    const record = mapOshawaCommunityCentre(
      cityFeature({
        attributes: {
          OBJECTID: 1,
          FULLNAME: "South Oshawa Community Centre",
          CATEGORY: "Community Centre",
          ADDRESS: "1455 CEDAR ST",
          ADDRESS_NUM: "1455",
          ADDRESS_UNIT: null,
          ADDRESS_STREET: "CEDAR ST",
        },
        geometry: { x: -78.84654177412898, y: 43.85953334245659 },
      }),
      ctx,
    );
    expect(record.tranche).toBe("venue");
    expect(record.id).toBe("oshawa-community-centres:1");
    expect(record.region).toBe("n43.5_w079.0");
    expect(record.fields.name?.value).toBe("South Oshawa Community Centre");
    expect(record.fields.category?.value).toBe("Community Centre");
    expect(record.fields.addr_housenumber?.value).toBe("1455");
    expect(record.fields.addr_street?.value).toBe("CEDAR ST");
    expect(record.fields.addr_unit?.value).toBe("UNKNOWN");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });
});

describe("Oshawa trails", () => {
  const ctx = provenance("oshawa-trails", LICENCE);
  const geometry = {
    paths: [
      [
        [-78.80288269780488, 43.87483186983505],
        [-78.80276694895208, 43.87479988335733],
        [-78.80275301740413, 43.87479603290062],
      ],
    ],
  };

  it("stores the domain name of the type code and keeps the code on raw", () => {
    const records = mapOshawaTrail(cityFeature({ attributes: { OBJECTID: 1148983, NAME_: null, TYPE: "NT" }, geometry }), ctx)!;
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.id).toBe("oshawa-trails:1148983");
    expect(record.fields.kind?.value).toBe("NATURE TRAIL - OFF-ROAD RURAL");
    expect(record.fields.kind?.raw).toBe("NT");
    expect(record.fields.surface?.value).toBe("UNKNOWN");
    expect(record.fields.geometry_type?.value).toBe("LineString");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("skips a cycling-route code and a code the domain does not define", () => {
    expect(mapOshawaTrail(cityFeature({ attributes: { OBJECTID: 2, TYPE: "CL" }, geometry }), ctx)).toBeNull();
    expect(mapOshawaTrail(cityFeature({ attributes: { OBJECTID: 3, TYPE: "ZZ" }, geometry }), ctx)).toBeNull();
    expect(mapOshawaTrail(cityFeature({ attributes: { OBJECTID: 4, TYPE: null }, geometry }), ctx)).toBeNull();
  });
});
