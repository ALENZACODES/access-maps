import { describe, expect, it } from "vitest";
import { CENTRAL_LAKE_ONTARIO_CONSERVATION_JOBS, mapClocaTrail } from "../../src/municipal/cities/central-lake-ontario-conservation.js";
import { LAKE_SIMCOE_CONSERVATION_JOBS } from "../../src/municipal/cities/lake-simcoe-conservation.js";
import { nameKey } from "../../src/municipal/cities/g7-helpers.js";
import type { DataRecord } from "../../src/model/records.js";
import { contextFor, expectValid } from "./g7-support.js";

/** Features below are copied from the layers retrieved on 2026-11-17, with long lines and rings cut short. */

const ring = { rings: [[[-79.362295, 44.03736], [-79.36, 44.03736], [-79.36, 44.039], [-79.362295, 44.03736]]] };

describe("Lake Simcoe Region Conservation Authority", () => {
  const job = LAKE_SIMCOE_CONSERVATION_JOBS[0]!;

  it("builds one id per property name, so the parcels of one property are stored once", () => {
    const ctx = contextFor("lsrca-public-lands");
    const a = job.map({ attributes: { OBJECTID: 2, PROPERTY_NAME: "Pangman Springs Conseravtion Area", PUBLIC_RELEASE: "Yes" }, geometry: ring }, ctx) as DataRecord;
    const b = job.map({ attributes: { OBJECTID: 3, PROPERTY_NAME: "Pangman Springs Conseravtion Area", PUBLIC_RELEASE: "Yes" }, geometry: ring }, ctx) as DataRecord;
    expectValid(a);
    expect(a.id).toBe("lsrca-public-lands:pangman-springs-conseravtion-area");
    expect(b.id).toBe(a.id);
    expect(a.fields.name?.value).toBe("Pangman Springs Conseravtion Area");
    expect(a.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(a.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(job.order).toBe("OBJECTID");
    expect(job.map({ attributes: { OBJECTID: 4, PROPERTY_NAME: "Fixture", PUBLIC_RELEASE: "No" }, geometry: ring }, ctx)).toBeNull();
  });

  it("makes plain ASCII keys from names", () => {
    expect(nameKey("Bowmanville/Westside Conservation Area")).toBe("bowmanville-westside-conservation-area");
    expect(nameKey("Crow's Pass Conservation Area")).toBe("crow-s-pass-conservation-area");
    expect(nameKey("Mattice-Val Côté")).toBe("mattice-val-cote");
  });
});

describe("Central Lake Ontario Conservation Authority", () => {
  const ctx = contextFor("cloca-trails");
  const line = { paths: [[[-78.854086, 43.876566], [-78.853914, 43.8767]]] };

  it("spells out coded surface and difficulty through the layer's domains", () => {
    const [trail] = mapClocaTrail({ attributes: { OBJECTID: 1, NAME: "Oshawa Creek Trail", DESIGNATION: "OF", STATUS: 1, SURFACE: "AS", DIFFICULTY: "E" }, geometry: line }, ctx) ?? [];
    if (!trail) throw new Error("expected a record");
    expectValid(trail);
    expect(trail.fields.surface?.value).toBe("Asphalt");
    expect(trail.fields.surface?.raw).toBe("AS");
    expect(trail.fields.wheelchair_description?.value).toBe("DIFFICULTY=Easy");
    expect(trail.fields.wheelchair?.value).toBe("UNKNOWN");
  });

  it("leaves on-road rows and on-road surfaces out, and keeps a blank difficulty UNKNOWN", () => {
    expect(mapClocaTrail({ attributes: { OBJECTID: 2, DESIGNATION: "ON", STATUS: 1, SURFACE: "AS" }, geometry: line }, ctx)).toBeNull();
    expect(mapClocaTrail({ attributes: { OBJECTID: 3, DESIGNATION: "OF", STATUS: 1, SURFACE: "WPS" }, geometry: line }, ctx)).toBeNull();
    const [trail] = mapClocaTrail({ attributes: { OBJECTID: 4, DESIGNATION: "OF", STATUS: 1, SURFACE: "DT", DIFFICULTY: null }, geometry: line }, ctx) ?? [];
    expect(trail?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(trail?.fields.surface?.value).toBe("Dirt");
  });

  it("stores one conservation area per name", () => {
    const areas = CENTRAL_LAKE_ONTARIO_CONSERVATION_JOBS[0]!;
    const record = areas.map({ attributes: { Property_ID: 1, ConservationArea: "Heber Down Conservation Area" }, geometry: ring }, contextFor("cloca-conservation-areas")) as DataRecord;
    expectValid(record);
    expect(record.id).toBe("cloca-conservation-areas:heber-down-conservation-area");
  });
});
