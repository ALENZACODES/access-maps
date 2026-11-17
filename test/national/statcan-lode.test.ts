import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { statcanLambertToWgs84 } from "../../src/geo/project.js";
import { parseGpkgGeometry, placeAnchor, readGpkgRows } from "../../src/io/gpkg.js";
import type { Provenance } from "../../src/model/provenance.js";
import {
  healthNameNamesPerson,
  lodeExclusion,
  mapOdcaf,
  mapOdef,
  mapOdhf,
  mapOdsrf,
  odefPoint,
} from "../../src/national/statcan-lode.js";
import { readRegistry } from "../../src/registry.js";
import { compileValidators } from "../../src/validate/ajv.js";
import { gpkgBlob, LAMBERT_REFERENCE, wkbLine, wkbPoint, wkbPolygon, writeGpkg } from "./lode-fixtures.js";

/** Every row below is a labelled test fixture, not a real place. */

const validators = compileValidators(path.join(process.cwd(), "schema"));
const ctx = (source_id: string): Provenance => ({ source_id, licence: "OGL-Canada-2.0", retrieved_at: "2026-11-16", tier: 0 });
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Statistics Canada Lambert (EPSG:3347) to degrees", () => {
  it("matches PROJ to better than a millionth of a degree across Ontario", () => {
    for (const point of LAMBERT_REFERENCE) {
      const out = statcanLambertToWgs84(point.x, point.y);
      expect(Math.abs(out.lon - point.lon)).toBeLessThan(1e-7);
      expect(Math.abs(out.lat - point.lat)).toBeLessThan(1e-7);
    }
  });
});

describe("GeoPackage geometry", () => {
  it("reads points, polygons and lines, and anchors places only", () => {
    const point = parseGpkgGeometry(gpkgBlob(wkbPoint(1, 2)));
    expect(point).toEqual({ type: "Point", coordinates: [1, 2] });
    expect(placeAnchor(point)).toEqual({ x: 1, y: 2, key: "geometry" });
    const square = parseGpkgGeometry(gpkgBlob(wkbPolygon([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]])));
    expect(placeAnchor(square)).toEqual({ x: 2, y: 2, key: "geometry:vertex_mean" });
    expect(placeAnchor(parseGpkgGeometry(gpkgBlob(wkbLine([[0, 0], [1, 1]]))))).toBeNull();
  });

  it("reads an envelope header and treats a non-GeoPackage blob as no geometry", () => {
    const header = Buffer.alloc(8 + 32);
    header.write("GP", 0, "ascii");
    header.writeUInt8(0x03, 3); // little-endian, envelope code 1 (32 bytes)
    header.writeInt32LE(3347, 4);
    expect(parseGpkgGeometry(Buffer.concat([header, wkbPoint(5, 6)]))).toEqual({ type: "Point", coordinates: [5, 6] });
    expect(parseGpkgGeometry(Buffer.from("not a geometry"))).toBeNull();
  });

  it("streams only the rows the filter selects", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gpkg-"));
    roots.push(root);
    const file = path.join(root, "fixture.gpkg");
    writeGpkg(file, "fixture", ["id", "prov_terr"], [
      { id: "a", prov_terr: "ON", geom: gpkgBlob(wkbPoint(1, 1)) },
      { id: "b", prov_terr: "QC", geom: gpkgBlob(wkbPoint(1, 1)) },
    ]);
    expect([...readGpkgRows(file, "fixture", "prov_terr = ?", ["ON"])].map((row) => row.id)).toEqual(["a"]);
    expect(() => [...readGpkgRows(file, "fixture; DROP TABLE x")]).toThrow(/table name/);
  });
});

describe("ODHF mapper", () => {
  const toronto = { lon: -79.3832, lat: 43.6532, key: "geometry" };

  it("maps a facility with every accessibility field UNKNOWN", () => {
    const record = mapOdhf({ id: "fx1", source_id: "S1", provider: "Government of Ontario", name: "Fixture Pharmacy", type: "Pharmacy", source_class: "Pharmacy", address: "1 Fixture Street", csdname: "Toronto", ownership: "Someone", health_authority: "Fixture HA" }, toronto, ctx("statcan-odhf"));
    expect(validators.records.venue(record)).toBe(true);
    expect(record.id).toBe("statcan-odhf:fx1");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.name?.value).toBe("Fixture Pharmacy");
    expect(record.fields.category?.value).toBe("Pharmacy");
    expect(record.fields.addr_housenumber?.value).toBe("1");
    expect(record.fields.addr_street?.value).toBe("Fixture Street");
    expect(record.fields.ref?.value).toBe("S1");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.fields.operator?.value).toBe("UNKNOWN");
  });

  it("does not store a name that may name a person; the place stays", () => {
    expect(healthNameNamesPerson("Dr. Fixture Person", "Clinic")).toBe(true);
    expect(healthNameNamesPerson("Fixture W J, Md", "Clinic")).toBe(true);
    expect(healthNameNamesPerson("Fixture Medicine Professional Corporation", "")).toBe(true);
    expect(healthNameNamesPerson("Fixture Eye Physician And Surgeon", "")).toBe(true);
    expect(healthNameNamesPerson("Fixture Clinic", "Integrated Community Health Services Centre")).toBe(true);
    expect(healthNameNamesPerson("Fixture Community Health Centre", "Community Health Centre")).toBe(false);
    const record = mapOdhf({ id: "fx2", name: "Dr. Fixture Person", type: "Clinic", source_class: "Walk-in Clinic", provider: "Regional Municipality of Peel" }, toronto, ctx("statcan-odhf"));
    expect(record.fields.name?.value).toBe("UNKNOWN");
    expect(record.fields.name?.raw).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain("Fixture Person");
  });

  it("keeps Statistics Canada's '..' as UNKNOWN and drops a point outside Ontario", () => {
    const record = mapOdhf({ id: "fx3", name: "..", type: "Hospital", address: ".." }, { lon: -100, lat: 60, key: "geometry" }, ctx("statcan-odhf"));
    expect(record.fields.name?.value).toBe("UNKNOWN");
    expect(record.fields.name?.raw).toBe("..");
    expect(record.region).toBe("unknown");
  });
});

describe("ODSRF mapper", () => {
  it("keeps the accessible column as the publisher's flag text, never as a wheelchair value", () => {
    const anchor = { lon: -75.7, lat: 45.42, key: "geometry:vertex_mean" };
    for (const [raw, kept] of [["yes/oui", "accessible=yes/oui"], ["No//Non", "accessible=No//Non"], ["", "UNKNOWN"]] as const) {
      const record = mapOdsrf({ id: `fx-${raw}`, name: "Fixture Park", type: "Park", category: "Parks and open space", accessible: raw, provider: "City of Ottawa" }, anchor, ctx("statcan-odsrf"));
      expect(validators.records.venue(record)).toBe(true);
      expect(record.fields.wheelchair_description?.value).toBe(kept);
      expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
      expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    }
  });

  it("leaves out trails, providers listed in the gaps file, and nothing else", () => {
    expect(lodeExclusion("statcan-odsrf", { category: "Trails and pathways", provider: "City of Ottawa" })).toBe("trail");
    expect(lodeExclusion("statcan-odsrf", { category: "Parks and open space", provider: "City of Mississauga" })).toBe("provider:mississauga");
    expect(lodeExclusion("statcan-odsrf", { category: "Parks and open space", provider: "City of Ottawa" })).toBeNull();
    expect(lodeExclusion("statcan-odhf", { provider: "City of London" })).toBe("provider:london");
    expect(lodeExclusion("statcan-odcaf", { Provider: "canadian museums association", ODCAF_Facility_Type: "museum" })).toBe("provider:not-open-data");
    expect(lodeExclusion("statcan-odcaf", { Provider: "toronto", ODCAF_Facility_Type: "artist" })).toBe("artist");
    expect(lodeExclusion("statcan-odcaf", { Provider: "toronto", ODCAF_Facility_Type: "gallery" })).toBeNull();
  });
});

describe("ODEF and ODCAF mappers", () => {
  it("ODEF: reads the WKT point and keeps school_id as ref", () => {
    expect(odefPoint("POINT (-79.5 43.7)")).toEqual({ lon: -79.5, lat: 43.7, key: "geometry" });
    expect(odefPoint("")).toBeNull();
    const record = mapOdef({ unique_id: "fx", facility_name: "Fixture Public School", facility_type: "Public", streetAddress: "2 Fixture Ave", addressLocality: "Fixture Town", postalCode: "A1A1A1", school_id: "999", geometry: "POINT (-79.5 43.7)" }, ctx("statcan-odef"));
    expect(validators.records.venue(record)).toBe(true);
    expect(record.fields.name?.value).toBe("Fixture Public School");
    expect(record.fields.ref?.value).toBe("999");
    expect(record.fields.addr_postcode?.value).toBe("A1A1A1");
    expect(mapOdef({ unique_id: "fx2", geometry: "" }, ctx("statcan-odef")).region).toBe("unknown");
  });

  it("ODCAF: maps the address columns and leaves '..' coordinates without a cell", () => {
    const record = mapOdcaf({ Index: "7", Facility_Name: "Fixture Gallery", ODCAF_Facility_Type: "gallery", Unit: "..", Street_No: "3", Street_Name: "fixture st", Postal_Code: "A1A 1A1", City: "fixture", Latitude: "43.65", Longitude: "-79.4" }, ctx("statcan-odcaf"));
    expect(validators.records.venue(record)).toBe(true);
    expect(record.id).toBe("statcan-odcaf:7");
    expect(record.fields.addr_unit?.value).toBe("UNKNOWN");
    expect(record.fields.lat?.source_key).toBe("Latitude,Longitude");
    expect(mapOdcaf({ Index: "8", Latitude: "..", Longitude: ".." }, ctx("statcan-odcaf")).region).toBe("unknown");
  });
});

describe("LODE registry entries", () => {
  it("are tier 0 federal sources under the Open Government Licence – Canada", () => {
    const registry = readRegistry(process.cwd());
    for (const id of ["statcan-odhf", "statcan-odsrf", "statcan-odef", "statcan-odcaf"]) {
      const source = registry.sources.find((entry) => entry.id === id);
      expect(source, id).toBeDefined();
      expect(source!.kind).toBe("federal");
      expect(source!.tier).toBe(0);
      expect(source!.licence_id).toBe("OGL-Canada-2.0");
      expect(source!.attribution).toContain("Contains information licensed under the Open Government Licence – Canada.");
      expect(validators.source(source)).toBe(true);
    }
  });
});

