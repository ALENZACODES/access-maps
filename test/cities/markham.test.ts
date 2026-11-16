import { describe, expect, it } from "vitest";
import { mapMarkhamFacility, mapMarkhamTrail } from "../../src/municipal/cities/markham.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectNoAccessibilityClaim, expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layers retrieved on 2026-11-16, cut to the columns read. Outlines are shortened. */
const LICENCE = "Markham-Open-Data-Licence-1.0";

describe("Markham city facilities", () => {
  const ctx = provenance("markham-city-facilities", LICENCE);
  const feature = cityFeature({
    attributes: { OBJECTID: 47, NAME: "MCKAY ART CENTRE", ADDRESS: "197 MAIN ST UNIONVILLE", TYPE: "Art Gallery", LABEL: "McKay Art Centre" },
    geometry: {
      rings: [
        [
          [-79.3120528771338, 43.86817490116057],
          [-79.31205420593395, 43.86818359842333],
          [-79.31204242113918, 43.86818454255095],
          [-79.3120528771338, 43.86817490116057],
        ],
      ],
    },
  });

  it("maps a building outline to a venue at the vertex mean with no accessibility claim", () => {
    const record = mapMarkhamFacility(feature, ctx);
    expect(record.tranche).toBe("venue");
    expect(record.id).toBe("markham-city-facilities:47");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.name?.value).toBe("McKay Art Centre");
    expect(record.fields.category?.value).toBe("Art Gallery");
    expect(record.fields.addr_housenumber?.value).toBe("197");
    expect(record.fields.addr_street?.value).toBe("MAIN ST UNIONVILLE");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.lat?.value).toBe(43.868181);
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("falls back to NAME when LABEL is blank", () => {
    const record = mapMarkhamFacility({ ...feature, attributes: { ...feature.attributes, LABEL: " " } }, ctx);
    expect(record.fields.name?.value).toBe("MCKAY ART CENTRE");
    expect(record.fields.name?.source_key).toBe("NAME");
  });
});

describe("Markham trails", () => {
  const ctx = provenance("markham-trails", LICENCE);
  const attributes = { OBJECTID: 5, LENGTH: 21.890621, TRAIL_NAME: "Leighland Park", PUBLIC_: "Yes", MATERIAL: "ASPH" };
  const part = [
    [-79.34390180508454, 43.86826572625826],
    [-79.34385589841133, 43.86829723594774],
    [-79.34378429502144, 43.86835988108318],
  ];

  it("imports a public segment with the published material code and length", () => {
    const records = mapMarkhamTrail(cityFeature({ attributes, geometry: { paths: [part] } }), ctx)!;
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.tranche).toBe("path");
    expect(record.id).toBe("markham-trails:5");
    expect(record.fields.kind?.value).toBe("trail");
    expect(record.fields.surface?.value).toBe("ASPH");
    expect(record.fields.length_m?.value).toBe(21.89);
    expect(record.fields.geometry_type?.value).toBe("LineString");
    expect(record.fields.geometry?.value).toEqual([
      [-79.343902, 43.868266],
      [-79.343856, 43.868297],
      [-79.343784, 43.86836],
    ]);
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("skips a segment the City does not mark public", () => {
    expect(mapMarkhamTrail(cityFeature({ attributes: { ...attributes, PUBLIC_: "No" }, geometry: { paths: [part] } }), ctx)).toBeNull();
    expect(mapMarkhamTrail(cityFeature({ attributes: { ...attributes, PUBLIC_: null }, geometry: { paths: [part] } }), ctx)).toBeNull();
  });

  it("stores each drawn part as its own record and does not repeat the whole length on the parts", () => {
    const second = [
      [-79.3437, 43.8684],
      [-79.3436, 43.8685],
    ];
    const records = mapMarkhamTrail(cityFeature({ attributes, geometry: { paths: [part, second] } }), ctx)!;
    expect(records.map((record) => record.id)).toEqual(["markham-trails:5", "markham-trails:5:part2"]);
    for (const record of records) {
      expect(record.fields.length_m?.value).toBe("UNKNOWN");
      expectValid(record);
    }
  });
});
