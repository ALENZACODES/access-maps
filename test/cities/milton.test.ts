import { describe, expect, it } from "vitest";
import { mapMiltonParkAmenity, mapMiltonParkingLot, mapMiltonSidewalk, mapMiltonTrail } from "../../src/municipal/cities/milton.js";
import { geoFeature } from "../../src/municipal/cities/west-gta-shared.js";
import { WEST_CITY_JOBS } from "../../scripts/import-cities-west.js";
import { readRegistry } from "../../src/registry.js";
import { ctxFor, expectValid, root } from "./west-shared.js";

/**
 * Features below are copied from the Town of Milton layers retrieved on 2026-11-16, cut to the
 * first points of each outline or line. Rows built with a changed column are variations for the test.
 */
const ctx = (id: string) => ctxFor(id, "OGL-Milton-2.0");

describe("Milton parking lots", () => {
  const feature = geoFeature({
    geometry: {
      type: "Polygon",
      coordinates: [[[-79.8585097846783, 43.516143827652826], [-79.85845835075116, 43.516137774722424], [-79.8585097846783, 43.516143827652826]]],
    },
    properties: { OBJECTID: 1, NAME: "LAURIER PARK", ADDRESS: "756 LAURIER AVE", CAPACITY: 20, ACCESSIBLE_SPOTS: 2, LOT_ID: 1, STATUS: "ACTIVE", OWNER: "Town" },
  });

  it("stores the published accessible-space count at the vertex mean of the outline", () => {
    const record = mapMiltonParkingLot(feature, ctx("milton-parking-lots"));
    expect(record.fields.capacity_disabled).toMatchObject({ value: 2, raw: "2", source_key: "ACCESSIBLE_SPOTS" });
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.name?.value).toBe("LAURIER PARK");
    expect(record.fields.addr_housenumber?.value).toBe("756");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.region).toBe("n43.5_w080.0");
    expectValid(record);
  });

  it("stores a published zero and keeps a blank count UNKNOWN", () => {
    const zero = mapMiltonParkingLot({ ...feature, properties: { ...feature.properties, ACCESSIBLE_SPOTS: "0" } }, ctx("milton-parking-lots"));
    expect(zero.fields.capacity_disabled?.value).toBe(0);
    const blank = mapMiltonParkingLot({ ...feature, properties: { ...feature.properties, ACCESSIBLE_SPOTS: "" } }, ctx("milton-parking-lots"));
    expect(blank.fields.capacity_disabled?.value).toBe("UNKNOWN");
  });
});

describe("Milton park amenities", () => {
  const feature = geoFeature({
    geometry: { type: "Point", coordinates: [-79.84126622613286, 43.517297535858916] },
    properties: { OBJECTID: 1, CATEGORY: "BASEBALL", NAME: "BEATY", ADDRESS: "670 BENNETT BOULEVARD", LIGHTING: "NO", STATUS: "ACTIVE", WASHROOM: "NO", PARKING: "YES" },
  });

  it("stores the category and lighting and leaves accessibility UNKNOWN", () => {
    const record = mapMiltonParkAmenity(feature, ctx("milton-park-amenities"));
    expect(record?.fields.category?.value).toBe("BASEBALL");
    expect(record?.fields.lit).toMatchObject({ value: "no", raw: "NO" });
    expect(record?.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("leaves out a historic amenity", () => {
    expect(mapMiltonParkAmenity({ ...feature, properties: { ...feature.properties, STATUS: "Historic" } }, ctx("milton-park-amenities"))).toBeNull();
  });
});

describe("Milton sidewalks and trails", () => {
  const line = { type: "LineString", coordinates: [[-79.85108089081865, 43.51655189008791], [-79.85107850496206, 43.51656067457524]] };

  it("stores trail category, material and lighting", () => {
    const record = mapMiltonTrail(
      geoFeature({ geometry: line, properties: { OBJECTID: 1, MATERIAL: "ASPHALT", CATEGORY: "MULTI-USE TRAIL", LIT_PATHWAY: "NO", GIS_ID: 1 } }),
      ctx("milton-trails"),
    );
    expect(record.fields.kind?.value).toBe("MULTI-USE TRAIL");
    expect(record.fields.surface?.value).toBe("ASPHALT");
    expect(record.fields.lit?.value).toBe("no");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("stores a sidewalk with its material and keeps a blank lighting value UNKNOWN", () => {
    const record = mapMiltonSidewalk(
      geoFeature({
        geometry: { type: "LineString", coordinates: [[-80.04756693785038, 43.53256130224797], [-80.04751400619402, 43.53252374969658]] },
        properties: { OBJECTID: 48, MATERIAL: "CONCRETE", CATEGORY: "SIDEWALK", LIT_PATHWAY: null, GIS_ID: 48 },
      }),
      ctx("milton-sidewalks"),
    );
    expect(record.fields.footway?.value).toBe("sidewalk");
    expect(record.fields.surface?.value).toBe("CONCRETE");
    expect(record.fields.lit?.value).toBe("UNKNOWN");
    expectValid(record);
  });
});

describe("Milton registry entries", () => {
  it("has a tier 0 municipal entry under the Milton licence for every Milton job", () => {
    const registry = readRegistry(root);
    const jobs = WEST_CITY_JOBS.filter((job) => job.id.startsWith("milton-"));
    expect(jobs.length).toBe(4);
    for (const job of jobs) {
      const source = registry.sources.find((entry) => entry.id === job.id)!;
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.retrieved_at).toBe("2026-11-16");
      expect(source.licence_id).toBe("OGL-Milton-2.0");
      expect(source.download_url).toMatch(/^https:\/\/api\.milton\.ca\//);
    }
  });
});
