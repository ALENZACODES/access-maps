import { describe, expect, it } from "vitest";
import {
  mapHamiltonBusStopAmenity,
  mapHamiltonDrinkingFountain,
  mapHamiltonParkWashroom,
  mapHamiltonPedestrianFeature,
  mapHamiltonSidewalk,
  mapHamiltonTrail,
} from "../../src/municipal/cities/hamilton.js";
import { geoFeature } from "../../src/municipal/cities/west-gta-shared.js";
import { WEST_CITY_JOBS } from "../../scripts/import-cities-west.js";
import { readRegistry } from "../../src/registry.js";
import { ctxFor, expectValid, root } from "./west-shared.js";

/**
 * Features below are copied from the City of Hamilton layers retrieved on 2026-11-16, cut to a few
 * columns. The path tests share the first two points of trail OBJECTID 1 as their line, and rows
 * built with a changed column are variations for the test.
 */
const ctx = (id: string) => ctxFor(id, "City-of-Hamilton-Open-Data-Licence");

describe("Hamilton park washrooms", () => {
  const feature = geoFeature({
    geometry: { type: "Point", coordinates: [-79.7345498904446, 43.2280216617782] },
    properties: {
      OBJECTID: 1,
      LOCATION: "Eastdale Park",
      PARK_ADDRESS: "81 Lincoln Rd",
      WARD: "10",
      WASHROOM_TYPE: "Universal",
      AODA_ACCESSIBILITY: "No",
      CATEGORY: "Stand-alone Park Washroom",
    },
  });

  it("keeps the City's AODA column as the published flag and never sets wheelchair", () => {
    const record = mapHamiltonParkWashroom(feature, ctx("hamilton-park-washrooms"));
    expect(record.tranche).toBe("washroom");
    expect(record.id).toBe("hamilton-park-washrooms:1");
    expect(record.region).toBe("n43.0_w080.0");
    expect(record.fields.name?.value).toBe("Eastdale Park");
    expect(record.fields.facility_type?.value).toBe("Universal");
    expect(record.fields.published_accessibility).toMatchObject({ value: "AODA_ACCESSIBILITY=No", source_key: "AODA_ACCESSIBILITY" });
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.building?.value).toBe("Stand-alone Park Washroom");
    expect(record.fields.lat).toMatchObject({ value: 43.228022, source_key: "geometry" });
    expectValid(record);
  });

  it("keeps a blank AODA column UNKNOWN", () => {
    const blank = mapHamiltonParkWashroom(
      { ...feature, properties: { ...feature.properties, AODA_ACCESSIBILITY: "" } },
      ctx("hamilton-park-washrooms"),
    );
    expect(blank.fields.published_accessibility?.value).toBe("UNKNOWN");
  });
});

describe("Hamilton drinking fountains", () => {
  it("stores the park name and address and leaves accessibility UNKNOWN", () => {
    const record = mapHamiltonDrinkingFountain(
      geoFeature({
        geometry: { type: "Point", coordinates: [-79.7769109584761, 43.216988844306] },
        properties: {
          OBJECTID: 1,
          PARK_NAME: "Father Sean O'Sullivan Memorial Park",
          ADDRESS: "1139 Greenhill Ave",
          LAST_EDITED_USER: "OpenHamilton",
        },
      }),
      ctx("hamilton-drinking-fountains"),
    );
    expect(record.fields.category_group?.value).toBe("drinking_water");
    expect(record.fields.addr_housenumber?.value).toBe("1139");
    expect(record.fields.addr_street?.value).toBe("Greenhill Ave");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(JSON.stringify(record)).not.toContain("OpenHamilton");
    expectValid(record);
  });
});

describe("Hamilton bus stop amenities", () => {
  const feature = geoFeature({
    geometry: { type: "Point", coordinates: [-79.8964180005569, 43.2518629994296] },
    properties: {
      OBJECTID: 1,
      STOP_NUMBER: "83024",
      STOP_NAME: "ABERDEEN at CHEDOKE",
      BENCH: "No",
      SHELTER: "No",
      LANDING_AREA: "Yes",
      LANDING_AREA_LIGHTING: "Ambi",
      LANDING_AREA_TYPE: "Blvd Paved",
      CREATED_USER: "OpenHamilton",
    },
  });

  it("keeps the landing area columns as published text", () => {
    const record = mapHamiltonBusStopAmenity(feature, ctx("hamilton-bus-stop-amenities"));
    expect(record.tranche).toBe("venue");
    expect(record.fields.wheelchair_description).toMatchObject({
      value: "LANDING_AREA=Yes; LANDING_AREA_TYPE=Blvd Paved",
      source_key: "LANDING_AREA,LANDING_AREA_TYPE",
    });
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.ref?.value).toBe("83024");
    expectValid(record);
  });
});

describe("Hamilton paths", () => {
  const line = { type: "LineString", coordinates: [[-79.8443491450974, 43.2098713520909], [-79.844280174576, 43.2098015806778]] };

  it("stores a pedestrian feature category as kind", () => {
    const record = mapHamiltonPedestrianFeature(
      geoFeature({ geometry: line, properties: { OBJECTID: 1, CATEGORY: "ped_only_street", OWNER: "CITY" } }),
      ctx("hamilton-pedestrian-features"),
    );
    expect(record.tranche).toBe("path");
    expect(record.fields.kind?.value).toBe("ped_only_street");
    expect(record.fields.step_count?.value).toBe("UNKNOWN");
    expect(record.fields.geometry?.value).toEqual([[-79.844349, 43.209871], [-79.84428, 43.209802]]);
    expectValid(record);
  });

  it("imports a multi-use trail with its published surface and length", () => {
    const record = mapHamiltonTrail(
      geoFeature({
        geometry: line,
        properties: { OBJECTID: 1, TRAIL_TYPE: "Multi-Use", SURFACE: "Asphalt", LENGTH_IN_METRES: 113.604 },
      }),
      ctx("hamilton-trails"),
    );
    expect(record?.fields.kind?.value).toBe("Multi-Use");
    expect(record?.fields.surface?.value).toBe("Asphalt");
    expect(record?.fields.length_m).toMatchObject({ value: 113.6, raw: "113.604" });
    expect(record?.fields.width?.value).toBe("UNKNOWN");
    expectValid(record!);
  });

  it("leaves out on-road routes and segments with no trail type", () => {
    const onRoad = geoFeature({ geometry: line, properties: { OBJECTID: 2, TRAIL_TYPE: "On-road Route" } });
    const untyped = geoFeature({ geometry: line, properties: { OBJECTID: 3, TRAIL_TYPE: null } });
    expect(mapHamiltonTrail(onRoad, ctx("hamilton-trails"))).toBeNull();
    expect(mapHamiltonTrail(untyped, ctx("hamilton-trails"))).toBeNull();
  });

  it("stores a sidewalk line with every measured field UNKNOWN", () => {
    const record = mapHamiltonSidewalk(geoFeature({ geometry: line, properties: { OBJECTID: 9 } }), ctx("hamilton-sidewalks"));
    expect(record.fields.footway).toMatchObject({ value: "sidewalk", source_key: "dataset" });
    for (const key of ["surface", "width", "incline", "kerb", "wheelchair", "length_m"]) {
      expect(record.fields[key]?.value, key).toBe("UNKNOWN");
    }
    expectValid(record);
  });
});

describe("Hamilton registry entries", () => {
  const registry = readRegistry(root);

  it("has a tier 0 municipal entry under the City of Hamilton licence for every Hamilton job", () => {
    const jobs = WEST_CITY_JOBS.filter((job) => job.id.startsWith("hamilton-"));
    expect(jobs.length).toBe(6);
    for (const job of jobs) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source!.kind).toBe("municipal");
      expect(source!.tier).toBe(0);
      expect(source!.retrieved_at).toBe("2026-11-16");
      expect(source!.licence_id).toBe("City-of-Hamilton-Open-Data-Licence");
      expect(source!.download_url).toMatch(/^https:\/\/services\.arcgis\.com\/rYz782eMbySr2srL\//);
    }
  });
});
