import { describe, expect, it } from "vitest";
import {
  KINGSTON_JOBS,
  KINGSTON_POI_TYPES,
  mapKingstonParkingLot,
  mapKingstonPointOfInterest,
  mapKingstonTrail,
} from "../../src/municipal/cities/kingston.js";
import { contextFor, expectValid, sourceEntry } from "./g4-support.js";

/** Features below are copied from the City of Kingston layers retrieved on 2026-11-16, with long outlines cut short. */

describe("Kingston parking lots", () => {
  const ctx = contextFor("kingston-parking-lots");
  const lot = {
    attributes: {
      OBJECTID: 4,
      LOT_ID: "2",
      LOT_NAME: "UPPER ROBERT BRUCE MEMORIAL LOT",
      CAPACITY: 52,
      CONTROL_TYPE: 1,
      HANDICAP_SPACE: "2",
      OWNERSHIP: "City of Kingston",
      MAP_LABEL: "Upper Robert Bruce Lot",
    },
    geometry: {
      rings: [
        [
          [-76.48444, 44.231391],
          [-76.484491, 44.231216],
          [-76.484848, 44.23127],
          [-76.48444, 44.231391],
        ],
      ],
    },
  };

  it("stores the published count of designated spaces and never a wheelchair value", () => {
    const record = mapKingstonParkingLot(lot, ctx);
    expect(record.tranche).toBe("venue");
    expect(record.id).toBe("kingston-parking-lots:4");
    expect(record.fields.capacity_disabled?.value).toBe(2);
    expect(record.fields.capacity_disabled?.source_key).toBe("HANDICAP_SPACE");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.category?.value).toBe("fee-based parking lot, Pay and Display");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record.fields.lat?.value).toBe(44.231292);
    expect(record.region).toBe("n44.0_w076.5");
    expectValid(record);
  });

  it("keeps a published zero and leaves blank, N and N/A counts UNKNOWN", () => {
    expect(mapKingstonParkingLot({ ...lot, attributes: { ...lot.attributes, HANDICAP_SPACE: "0" } }, ctx).fields.capacity_disabled?.value).toBe(0);
    for (const raw of [null, "N", "N/A"]) {
      const record = mapKingstonParkingLot({ ...lot, attributes: { ...lot.attributes, HANDICAP_SPACE: raw } }, ctx);
      expect(record.fields.capacity_disabled?.value).toBe("UNKNOWN");
    }
  });

  it("leaves an undefined control code out of the category", () => {
    const record = mapKingstonParkingLot({ ...lot, attributes: { ...lot.attributes, CONTROL_TYPE: null } }, ctx);
    expect(record.fields.category?.value).toBe("fee-based parking lot");
  });
});

describe("Kingston trails", () => {
  const ctx = contextFor("kingston-trails");
  const trail = {
    attributes: {
      OBJECTID: 1,
      TRAILNAME: "Greenwood Park Trail",
      ACTIVITIES: "WALKING, BICYCLING",
      TRAIL_CLASS: "Park Trail",
      STATUS: 0,
      MAP_LABEL: "Greenwood Park Trail",
      TRAIL_NUM: 9,
      ACCESSIBLE: "Yes",
    },
    geometry: {
      paths: [
        [
          [-76.451672, 44.267632],
          [-76.452317, 44.267565],
        ],
      ],
    },
  };

  it("keeps the City's flag as published text and leaves wheelchair UNKNOWN", () => {
    const record = mapKingstonTrail(trail, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.tranche).toBe("path");
    expect(record.fields.wheelchair_description?.value).toBe("ACCESSIBLE=Yes");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.kind?.value).toBe("Park Trail");
    expect(record.fields.surface?.value).toBe("UNKNOWN");
    expect(record.fields.geometry?.value).toEqual([
      [-76.451672, 44.267632],
      [-76.452317, 44.267565],
    ]);
    expectValid(record);
  });

  it("reads both spellings of the flag and leaves a blank flag UNKNOWN", () => {
    const flag = (value: string | null) =>
      mapKingstonTrail({ ...trail, attributes: { ...trail.attributes, ACCESSIBLE: value } }, ctx)?.fields.wheelchair_description?.value;
    expect(flag("Y")).toBe("ACCESSIBLE=Yes");
    expect(flag("N")).toBe("ACCESSIBLE=No");
    expect(flag("No")).toBe("ACCESSIBLE=No");
    expect(flag(null)).toBe("UNKNOWN");
  });

  it("skips inactive and proposed trails", () => {
    expect(mapKingstonTrail({ ...trail, attributes: { ...trail.attributes, STATUS: 1 } }, ctx)).toBeNull();
    expect(mapKingstonTrail({ ...trail, attributes: { ...trail.attributes, STATUS: 2 } }, ctx)).toBeNull();
  });
});

describe("Kingston points of interest", () => {
  const ctx = contextFor("kingston-points-of-interest");
  const library = {
    attributes: {
      OBJECTID: 100205,
      POI_ID: 7947,
      POI_NAME: "KINGSTON FRONTENAC LIBRARY - CENTRAL BRANCH",
      ADDRESS: "130 JOHNSON ST",
      POI_TYPE: 17,
      POI_TYPE_DESC: "Library",
      MAP_LABEL: "Kingston Frontenac Library - Central Branch",
      OWNERSHIP: "Municipal",
      URL: "https://www.kfpl.ca/",
    },
    geometry: { x: -76.4853, y: 44.2301 },
  };

  it("imports a listed type with every accessibility field UNKNOWN", () => {
    const record = mapKingstonPointOfInterest(library, ctx);
    if (!record) throw new Error("expected a record");
    expect(record.fields.name?.value).toBe("Kingston Frontenac Library - Central Branch");
    expect(record.fields.category_group?.value).toBe("civic_facility");
    expect(record.fields.addr_housenumber?.value).toBe("130");
    expect(record.fields.addr_street?.value).toBe("JOHNSON ST");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("skips types that are not listed, including the separate washroom source", () => {
    for (const type of ["Place of Worship", "Hotel / Motel", "Washroom", ""]) {
      expect(mapKingstonPointOfInterest({ ...library, attributes: { ...library.attributes, POI_TYPE_DESC: type } }, ctx)).toBeNull();
    }
    expect(KINGSTON_POI_TYPES.Washroom).toBeUndefined();
  });
});

describe("Kingston registry entries", () => {
  it("are tier 0 municipal sources under the Kingston licence, retrieved 2026-11-16", () => {
    for (const job of KINGSTON_JOBS) {
      const source = sourceEntry(job.id);
      expect(source.kind).toBe("municipal");
      expect(source.tier).toBe(0);
      expect(source.licence_id).toBe("Kingston-Open-Data-Licence-1.0");
      expect(source.retrieved_at).toBe("2026-11-16");
    }
    const feed = sourceEntry("gtfs-kingston");
    expect(feed.kind).toBe("gtfs");
    expect(feed.tier).toBe(1);
  });
});
