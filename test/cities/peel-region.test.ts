import { describe, expect, it } from "vitest";
import { mapPeelTrail } from "../../src/municipal/cities/peel-region.js";
import { geoFeature } from "../../src/municipal/cities/west-gta-shared.js";
import { readRegistry } from "../../src/registry.js";
import { ctxFor, expectValid, root } from "./west-shared.js";

/**
 * The first feature is copied from the Region of Peel Trails layer retrieved on 2026-11-16, cut to
 * a few columns and to the first two points of its line. The other rows are variations of it for the test.
 */
describe("Region of Peel trails", () => {
  const ctx = ctxFor("peel-trails", "Peel-Open-Data-Licence-1.0");
  const line = { type: "LineString", coordinates: [[-79.6278270806783, 43.4830945161534], [-79.6277811017284, 43.4831001577425]] };

  it("stores the published class and surface", () => {
    const record = mapPeelTrail(
      geoFeature({ geometry: line, properties: { OBJECTID: 2, Name: "Waterfront Trail", Class: "Paved Multi-use Trail", Surface: "Asphalt", MUN: "Mississauga" } }),
      ctx,
    );
    expect(record?.tranche).toBe("path");
    expect(record?.fields.kind?.value).toBe("Paved Multi-use Trail");
    expect(record?.fields.surface).toMatchObject({ value: "Asphalt", source_key: "Surface" });
    expect(record?.fields.width?.value).toBe("UNKNOWN");
    expect(record?.fields.incline?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("keeps a blank surface UNKNOWN", () => {
    const record = mapPeelTrail(geoFeature({ geometry: line, properties: { OBJECTID: 3, Class: "Hiking Trail", Surface: null } }), ctx);
    expect(record?.fields.surface?.value).toBe("UNKNOWN");
  });

  it("leaves out bicycle lanes, on-road routes and untyped segments", () => {
    for (const cls of ["Bicycle Lane", "Marked On Road Bicycle Route", "On Road Connection", null]) {
      expect(mapPeelTrail(geoFeature({ geometry: line, properties: { OBJECTID: 4, Class: cls } }), ctx), String(cls)).toBeNull();
    }
  });

  it("has a tier 0 registry entry under the Region's licence", () => {
    const source = readRegistry(root).sources.find((entry) => entry.id === "peel-trails")!;
    expect(source.licence_id).toBe("Peel-Open-Data-Licence-1.0");
    expect(source.tier).toBe(0);
    expect(source.retrieved_at).toBe("2026-11-16");
  });
});
