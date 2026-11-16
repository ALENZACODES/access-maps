import { describe, expect, it } from "vitest";
import { mapAjaxFacility, mapAjaxPlayground, mapAjaxTrail } from "../../src/municipal/cities/ajax.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectNoAccessibilityClaim, expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layers retrieved on 2026-11-16, cut to the columns read. Outlines are shortened. */
const LICENCE = "Ajax-Open-Data-Licence-1.0";

describe("Ajax town facilities", () => {
  const ctx = provenance("ajax-town-facilities", LICENCE);
  const geometry = {
    rings: [
      [
        [-79.04098823193996, 43.84581818017463],
        [-79.04062523014477, 43.84496613557206],
        [-79.04032109545284, 43.84425225943417],
        [-79.04098823193996, 43.84581818017463],
      ],
    ],
  };

  it("maps an outline to a venue at the vertex mean and leaves a blank address UNKNOWN", () => {
    const record = mapAjaxFacility(
      cityFeature({ attributes: { OBJECTID: 5, NAME: "AJAX PICKERING TRANSIT AUTHORITY", FACILITYID: "5", ADDRESS: null, LAST_USER: "x" }, geometry }),
      ctx,
    );
    expect(record.tranche).toBe("venue");
    expect(record.id).toBe("ajax-town-facilities:5");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.name?.value).toBe("AJAX PICKERING TRANSIT AUTHORITY");
    expect(record.fields.addr_street?.value).toBe("UNKNOWN");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.ref?.value).toBe("5");
    expect(JSON.stringify(record)).not.toContain("LAST_USER");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("splits a published address", () => {
    const record = mapAjaxFacility(
      cityFeature({ attributes: { OBJECTID: 2, NAME: "VILLAGE COMMUNITY CENTRE", FACILITYID: "2", ADDRESS: "22 Sherwood Road W" }, geometry }),
      ctx,
    );
    expect(record.fields.addr_housenumber?.value).toBe("22");
    expect(record.fields.addr_street?.value).toBe("Sherwood Road W");
  });
});

describe("Ajax playgrounds", () => {
  const ctx = provenance("ajax-playgrounds", LICENCE);

  it("maps a playground point with the park name and published type", () => {
    const record = mapAjaxPlayground(
      cityFeature({
        attributes: { OBJECTID: 6, LOCATION: "Guiness Park", TYPE: "Playground", FACILITYID: "PGN504.01" },
        geometry: { x: -79.03152324883672, y: 43.891933329270735 },
      }),
      ctx,
    );
    expect(record.tranche).toBe("venue");
    expect(record.fields.name?.value).toBe("Guiness Park");
    expect(record.fields.category?.value).toBe("Playground");
    expect(record.fields.category_group?.value).toBe("park_feature");
    expect(record.fields.ref?.value).toBe("PGN504.01");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });
});

describe("Ajax recreational trails", () => {
  const ctx = provenance("ajax-recreational-trails", LICENCE);
  const attributes = { OBJECTID: 144, SURFACE_TYPE: "Asphalt", LENGTH: 148.89, STATUS: "Completed", WIDTH: "2.60", GRADE: "Good", LIGHTING: "YES" };
  const geometry = {
    paths: [
      [
        [-79.06669107264162, 43.856287556749365],
        [-79.0665458685828, 43.8563921620447],
        [-79.06637387937675, 43.85651526350731],
      ],
    ],
  };

  it("keeps surface, width, length and lighting and does not store the condition grade", () => {
    const records = mapAjaxTrail(cityFeature({ attributes, geometry }), ctx)!;
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.id).toBe("ajax-recreational-trails:144");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.surface?.value).toBe("Asphalt");
    expect(record.fields.width?.value).toBe(2.6);
    expect(record.fields.length_m?.value).toBe(148.89);
    expect(record.fields.lit?.value).toBe("yes");
    expect(record.fields.smoothness?.value).toBe("UNKNOWN");
    expect(JSON.stringify(record)).not.toContain("Good");
    expectNoAccessibilityClaim(record);
    expectValid(record);
  });

  it("leaves blank lighting UNKNOWN and skips removed and decommissioned sections", () => {
    const blank = mapAjaxTrail(cityFeature({ attributes: { ...attributes, LIGHTING: null }, geometry }), ctx)![0]!;
    expect(blank.fields.lit?.value).toBe("UNKNOWN");
    expect(mapAjaxTrail(cityFeature({ attributes: { ...attributes, STATUS: "Removed" }, geometry }), ctx)).toBeNull();
    expect(mapAjaxTrail(cityFeature({ attributes: { ...attributes, GRADE: "Decommissioned" }, geometry }), ctx)).toBeNull();
  });
});
