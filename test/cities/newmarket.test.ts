import { describe, expect, it } from "vitest";
import {
  mapNewmarketLandmark,
  mapNewmarketParkFeature,
  mapNewmarketTrail,
  mapNewmarketTrailPoint,
} from "../../src/municipal/cities/newmarket.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectNoAccessibilityClaim, expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layers retrieved on 2026-11-16, cut to the columns read. Outlines are shortened. */
const LICENCE = "Newmarket-Open-Data-Licence-2.0";

describe("Newmarket park features", () => {
  const ctx = provenance("newmarket-park-features", LICENCE);
  const washroom = cityFeature({
    attributes: { OBJECTID: 6562, LANDMARK: "HASKETT PARK", MUN_ADD: "145 MILLARD AVE", CAT: "WASHROOM" },
    geometry: {
      rings: [
        [
          [-79.472755471683, 44.0518478116678],
          [-79.4727370938911, 44.0519136346344],
          [-79.4727331539591, 44.0519254561611],
          [-79.472755471683, 44.0518478116678],
        ],
      ],
    },
  });

  it("maps a WASHROOM outline to a washroom record with no accessibility claim", () => {
    const record = mapNewmarketParkFeature(washroom, ctx)!;
    expect(record.tranche).toBe("washroom");
    expect(record.id).toBe("newmarket-park-features:6562");
    expect(record.region).toBe("n44.0_w079.5");
    expect(record.fields.name?.value).toBe("HASKETT PARK");
    expect(record.fields.facility_type?.value).toBe("WASHROOM");
    expect(record.fields.addr_housenumber?.value).toBe("145");
    expect(record.fields.addr_street?.value).toBe("MILLARD AVE");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.lat?.derived).toBeUndefined();
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("maps another category to a venue and skips RETIRED rows", () => {
    const playground = mapNewmarketParkFeature(
      { ...washroom, attributes: { OBJECTID: "6568", LANDMARK: "RAY TWINNEY RECREATION COMPLEX", MUN_ADD: "100 EAGLE ST W", CAT: "PLAYGROUND" } },
      ctx,
    )!;
    expect(playground.tranche).toBe("venue");
    expect(playground.fields.category?.value).toBe("PLAYGROUND");
    expect(playground.fields.category_group?.value).toBe("park_feature");
    expectNoAccessibilityClaim(playground);
    expectValid(playground);
    expect(mapNewmarketParkFeature({ ...washroom, attributes: { ...washroom.attributes, CAT: "RETIRED" } }, ctx)).toBeNull();
    expect(mapNewmarketParkFeature({ ...washroom, attributes: { ...washroom.attributes, CAT: " " } }, ctx)).toBeNull();
  });
});

describe("Newmarket trails", () => {
  const ctx = provenance("newmarket-trails", LICENCE);

  it("keeps the published class and surface and leaves width and length UNKNOWN", () => {
    const records = mapNewmarketTrail(
      cityFeature({
        attributes: { OBJECTID: 10844, NAME: "JOHN F. SMITH TRAIL", CLASS: "TRAIL", SURFACE: "Concrete", STATUS: "Assumed" },
        geometry: {
          paths: [
            [
              [-79.4819540541583, 44.0284615972851],
              [-79.4816889732851, 44.0289018702646],
            ],
          ],
        },
      }),
      ctx,
    );
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.id).toBe("newmarket-trails:10844");
    expect(record.region).toBe("n44.0_w079.5");
    expect(record.fields.kind?.value).toBe("TRAIL");
    expect(record.fields.surface?.value).toBe("Concrete");
    expect(record.fields.length_m?.value).toBe("UNKNOWN");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });
});

describe("Newmarket trail points", () => {
  const ctx = provenance("newmarket-trail-points", LICENCE);
  const washroom = cityFeature({
    attributes: { OBJECTID: 772, NAME: "Holland River Valley Trail", FEATURE: "Washroom" },
    geometry: { x: -79.4592939618354, y: 44.01001690050154 },
  });

  it("maps a Washroom point to a washroom record and other features to venues", () => {
    const record = mapNewmarketTrailPoint(washroom, ctx)!;
    expect(record.tranche).toBe("washroom");
    expect(record.fields.facility_type?.value).toBe("Washroom");
    expect(record.fields.lat?.value).toBe(44.010017);
    expectNoAccessibilityClaim(record);
    expectValid(record);
    const access = mapNewmarketTrailPoint({ ...washroom, attributes: { ...washroom.attributes, FEATURE: "Access Point" } }, ctx)!;
    expect(access.tranche).toBe("venue");
    expect(access.fields.category?.value).toBe("Access Point");
    expectValid(access);
    expect(mapNewmarketTrailPoint({ ...washroom, attributes: { ...washroom.attributes, FEATURE: "" } }, ctx)).toBeNull();
  });
});

describe("Newmarket landmarks", () => {
  const ctx = provenance("newmarket-landmarks", LICENCE);
  const arena = cityFeature({
    attributes: {
      OBJECTID: 6017,
      LANDMARK: "RAY TWINNEY RECREATION COMPLEX",
      ADDRESS: "100 EAGLE ST W",
      CAT: "ARENA",
      ST_NUM: "100",
      STREET: "EAGLE ST W",
      UNIT_NUM: null,
    },
    geometry: { x: -79.48658377111965, y: 44.04433013440075 },
  });

  it("imports a public facility category and skips the others", () => {
    const record = mapNewmarketLandmark(arena, ctx)!;
    expect(record.tranche).toBe("venue");
    expect(record.fields.name?.value).toBe("RAY TWINNEY RECREATION COMPLEX");
    expect(record.fields.category?.value).toBe("ARENA");
    expect(record.fields.addr_housenumber?.value).toBe("100");
    expect(record.fields.addr_street?.value).toBe("EAGLE ST W");
    expect(record.fields.addr_unit?.value).toBe("UNKNOWN");
    expectNoAccessibilityClaim(record);
    expectValid(record);
    expect(mapNewmarketLandmark({ ...arena, attributes: { ...arena.attributes, CAT: "PLACE OF WORSHIP" } }, ctx)).toBeNull();
    expect(mapNewmarketLandmark({ ...arena, attributes: { ...arena.attributes, CAT: "PUBLIC SCHOOL" } }, ctx)).toBeNull();
  });
});
