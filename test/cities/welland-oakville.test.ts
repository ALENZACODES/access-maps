import { describe, expect, it } from "vitest";
import { mapOakvilleTownWashroom } from "../../src/municipal/cities/oakville.js";
import { mapWellandPublicWashroom, mapWellandTrail } from "../../src/municipal/cities/welland.js";
import { geoFeature } from "../../src/municipal/cities/west-gta-shared.js";
import { WEST_GTFS_FEED_IDS } from "../../scripts/import-cities-west.js";
import { GTFS_FEEDS } from "../../src/gtfs/feeds.js";
import { readRegistry } from "../../src/registry.js";
import { ctxFor, expectValid, root } from "./west-shared.js";

/**
 * Features below are copied from the City of Welland and Town of Oakville layers retrieved on
 * 2026-11-16, cut to the first points of a line. Rows built with a changed column are variations for the test.
 */
describe("Welland trails", () => {
  const ctx = ctxFor("welland-trails", "OGL-Welland-2.0");
  const feature = geoFeature({
    geometry: { type: "LineString", coordinates: [[-79.22486222698504, 43.02602951346983], [-79.2244398765908, 43.0262285410282]] },
    properties: { Name: "Merritt Island Trail", OBJECTID: 1, Enviro: "Off-Road", Class: "Main trail", Surface: "Unpaved" },
  });

  it("stores class and surface for an off-road trail", () => {
    const record = mapWellandTrail(feature, ctx);
    expect(record?.fields.kind?.value).toBe("Main trail");
    expect(record?.fields.surface?.value).toBe("Unpaved");
    expect(record?.region).toBe("n43.0_w079.5");
    expectValid(record!);
  });

  it("leaves out a row that may be the roadway", () => {
    expect(mapWellandTrail({ ...feature, properties: { ...feature.properties, Enviro: "On-Road/Sidewalk" } }, ctx)).toBeNull();
  });
});

describe("Welland public washrooms", () => {
  const ctx = ctxFor("welland-public-washrooms", "OGL-Welland-2.0");
  const feature = geoFeature({
    geometry: { type: "Point", coordinates: [-79.2259359755202, 42.977460089191005] },
    properties: { OBJECTID: 27, Type: "Parks and Recreation", SubType: "Public Washroom", Name: "Memorial Park Washroom", URL: "", Owner: "CoW", Address: "404 Memorial Park Drive" },
  });

  it("imports a public washroom row with wheelchair UNKNOWN", () => {
    const record = mapWellandPublicWashroom(feature, ctx);
    expect(record?.tranche).toBe("washroom");
    expect(record?.fields.name?.value).toBe("Memorial Park Washroom");
    expect(record?.fields.address?.value).toBe("404 Memorial Park Drive");
    expect(record?.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record?.fields.published_accessibility?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("skips other facility rows", () => {
    expect(mapWellandPublicWashroom({ ...feature, properties: { ...feature.properties, SubType: "Arena" } }, ctx)).toBeNull();
  });
});

describe("Oakville town washrooms", () => {
  const ctx = ctxFor("oakville-town-washrooms", "Oakville-Open-Data-Licence");
  const feature = geoFeature({
    geometry: { type: "Point", coordinates: [-79.7346238461296, 43.4792090877782] },
    properties: { FID: 50, NAME: "Issac Park Washroom", ADDRESS: "3086 Issac Avenue", DESCRIPTIO: "Washroom" },
  });

  it("imports a washroom row with wheelchair UNKNOWN", () => {
    const record = mapOakvilleTownWashroom(feature, ctx);
    expect(record?.id).toBe("oakville-town-washrooms:50");
    expect(record?.fields.name?.value).toBe("Issac Park Washroom");
    expect(record?.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("skips rows that are not described as a washroom", () => {
    for (const description of ["Playground", "Parking Lot", "Washroom/shower/changeroom", ""]) {
      expect(mapOakvilleTownWashroom({ ...feature, properties: { ...feature.properties, DESCRIPTIO: description } }, ctx), description).toBeNull();
    }
  });
});

describe("Oakville Transit feed", () => {
  it("is a tier 1 gtfs registry entry listed in the feed table", () => {
    const registry = readRegistry(root);
    for (const id of WEST_GTFS_FEED_IDS) {
      const source = registry.sources.find((entry) => entry.id === id)!;
      expect(source.kind).toBe("gtfs");
      expect(source.tier).toBe(1);
      expect(source.retrieved_at).toBe("2026-11-16");
      expect(GTFS_FEEDS.some((feed) => feed.id === id), id).toBe(true);
    }
  });
});
