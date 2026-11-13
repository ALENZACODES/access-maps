import { describe, expect, it } from "vitest";
import { isPiece } from "../src/model/provenance.js";
import { regionId } from "../src/model/records.js";
import { parseOsmFeature } from "../src/osm/feature.js";
import { mapOsmElement, type OsmElement } from "../src/osm/map.js";
import type { Provenance } from "../src/model/provenance.js";

const ctx: Provenance = {
  source_id: "osm-ontario",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

function element(partial: Partial<OsmElement> & Pick<OsmElement, "tags">): OsmElement {
  return {
    osmType: partial.osmType ?? "node",
    osmId: partial.osmId ?? "10",
    tags: partial.tags,
    geometry: partial.geometry ?? { type: "Point", coordinates: [-79.38, 43.65] },
  };
}

describe("OSM tag mapping", () => {
  it("keeps a published wheelchair value and leaves untagged fields UNKNOWN", () => {
    const [venue] = mapOsmElement(element({ tags: { amenity: "cafe", name: "Test Cafe", wheelchair: "limited" } }), ctx);
    expect(venue?.tranche).toBe("venue");
    expect(venue?.fields.wheelchair?.value).toBe("limited");
    expect(venue?.fields.wheelchair?.source_key).toBe("wheelchair");
    expect(venue?.fields.wheelchair?.tier).toBe(0);
    expect(venue?.fields.ramp?.value).toBe("UNKNOWN");
    expect(venue?.fields.automatic_door?.value).toBe("UNKNOWN");
    expect(venue?.fields.step_count?.value).toBe("UNKNOWN");
    expect(venue?.region).toBe(regionId(43.65, -79.38));
    expect(isPiece(venue?.fields.lat ?? fail())).toBe(true);
    expect(isPiece(venue?.fields.ramp ?? fail())).toBe(false);
  });

  it("stores level 0 and numeric step_count as numbers, and keeps non-numeric step text", () => {
    const [venue] = mapOsmElement(
      element({ tags: { shop: "convenience", level: "0", step_count: "4" } }),
      ctx,
    );
    expect(venue?.fields.level?.value).toBe(0);
    expect(venue?.fields.step_count?.value).toBe(4);
    const [other] = mapOsmElement(element({ tags: { shop: "convenience", step_count: "many" } }), ctx);
    expect(other?.fields.step_count?.value).toBe("many");
  });

  it("puts toilet tags on a washroom record and not on the venue", () => {
    const records = mapOsmElement(
      element({
        tags: {
          amenity: "cafe",
          name: "Test Cafe",
          wheelchair: "yes",
          "toilets:wheelchair": "no",
          changing_table: "yes",
        },
      }),
      ctx,
    );
    const venue = records.find((record) => record.tranche === "venue");
    const washroom = records.find((record) => record.tranche === "washroom");
    expect(venue?.fields.wheelchair?.value).toBe("yes");
    expect(venue?.fields).not.toHaveProperty("toilets_wheelchair");
    expect(JSON.stringify(venue)).not.toContain("toilets:wheelchair");
    expect(washroom?.id).toBe("osm:toilets-at:node/10");
    expect(washroom?.fields.wheelchair?.value).toBe("no");
    expect(washroom?.fields.wheelchair?.source_key).toBe("toilets:wheelchair");
    expect(washroom?.fields.changing_table?.value).toBe("yes");
    expect(washroom?.fields.parent_id?.value).toBe(venue?.id);
    expect(washroom?.fields.lat?.derived).toBe(true);
    expect(washroom?.fields.name?.value).toBe("UNKNOWN");
    expect(washroom?.fields.opening_hours?.value).toBe("UNKNOWN");
  });

  it("imports amenity=toilets only as a washroom and uses the toilet wheelchair tag", () => {
    const records = mapOsmElement(
      element({ osmId: "22", tags: { amenity: "toilets", wheelchair: "yes", fee: "no" } }),
      ctx,
    );
    expect(records.map((record) => record.tranche)).toEqual(["washroom"]);
    expect(records[0]?.fields.wheelchair?.value).toBe("yes");
    expect(records[0]?.fields.facility_type?.value).toBe("toilets");
    expect(records[0]?.fields.fee?.value).toBe("no");
    expect(records[0]?.fields.lat?.derived).toBeUndefined();
  });

  it("does not copy a venue wheelchair tag onto an attached washroom", () => {
    const records = mapOsmElement(element({ tags: { amenity: "cafe", wheelchair: "yes", toilets: "yes" } }), ctx);
    const washroom = records.find((record) => record.tranche === "washroom");
    expect(washroom?.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(washroom?.fields.facility_type?.value).toBe("yes");
    expect(washroom?.fields.access?.value).toBe("UNKNOWN");
  });

  it("maps toilets=customers to access once", () => {
    const records = mapOsmElement(element({ tags: { tourism: "museum", toilets: "customers" } }), ctx);
    const washroom = records.find((record) => record.tranche === "washroom");
    expect(washroom?.fields.access?.value).toBe("customers");
    expect(washroom?.fields.facility_type?.value).toBe("UNKNOWN");
  });

  it("drops practitioner names and does not keep them in raw", () => {
    const [venue] = mapOsmElement(
      element({
        tags: {
          amenity: "doctors",
          name: "Dr Ada Example",
          operator: "Dr Ada Example",
          phone: "416-555-0199",
          website: "https://example.test/ada",
        },
      }),
      ctx,
    );
    const encoded = JSON.stringify(venue);
    expect(encoded).not.toContain("Ada Example");
    expect(encoded).not.toContain("416-555-0199");
    expect(encoded).not.toContain("example.test");
    expect(venue?.fields.name?.value).toBe("UNKNOWN");
    expect(venue?.fields.operator?.value).toBe("UNKNOWN");
    expect(venue?.fields.category?.value).toBe("doctors");
  });

  it("drops personal tags while parsing a feature", () => {
    const parsed = parseOsmFeature({
      id: "n9",
      geometry: { type: "Point", coordinates: [-79.4, 43.7] },
      properties: {
        "@type": "node",
        "@id": 9,
        amenity: "cafe",
        phone: "416-555-0100",
        "contact:email": "person@example.test",
        user: "should-not-appear",
      },
    });
    expect(parsed?.droppedKeys.sort()).toEqual(["contact:email", "phone", "user"]);
    expect(parsed?.element.tags).toEqual({ amenity: "cafe" });
    expect(JSON.stringify(parsed)).not.toContain("should-not-appear");
    expect(JSON.stringify(parsed)).not.toContain("416-555-0100");
  });

  it("maps a sidewalk and skips a cycleway that does not publish foot access", () => {
    const [path] = mapOsmElement(
      element({
        osmType: "way",
        osmId: "20",
        tags: { highway: "footway", footway: "sidewalk", surface: "asphalt", wheelchair: "limited" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-79.38, 43.65],
            [-79.381, 43.651],
          ],
        },
      }),
      ctx,
    );
    expect(path?.tranche).toBe("path");
    expect(path?.fields.kind?.value).toBe("footway");
    expect(path?.fields.surface?.value).toBe("asphalt");
    expect(path?.fields.footway?.value).toBe("sidewalk");
    expect(path?.fields.geometry_type?.value).toBe("LineString");
    expect(path?.fields.length_m?.value).toBe("UNKNOWN");
    expect(mapOsmElement(element({ tags: { highway: "cycleway", surface: "asphalt" } }), ctx)).toEqual([]);
    const [shared] = mapOsmElement(element({ tags: { highway: "cycleway", foot: "designated" } }), ctx);
    expect(shared?.fields.kind?.value).toBe("cycleway");
    expect(shared?.fields.foot?.value).toBe("designated");
  });

  it("keeps a crossing kerb and joins distinct handrail tags", () => {
    const [crossing] = mapOsmElement(
      element({
        tags: { highway: "crossing", kerb: "lowered", tactile_paving: "yes", "handrail:left": "yes", "handrail:right": "no" },
      }),
      ctx,
    );
    expect(crossing?.fields.kind?.value).toBe("crossing");
    expect(crossing?.fields.kerb?.value).toBe("lowered");
    expect(crossing?.fields.handrail?.value).toBe("handrail:left=yes;handrail:right=no");
    expect(crossing?.fields.geometry_type?.value).toBe("Point");
  });
});

function fail(): never {
  throw new Error("missing field");
}
