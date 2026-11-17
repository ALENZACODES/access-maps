import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { columnIndex, decodeXml, parseSheetXml, readXlsx } from "../../src/io/xlsx.js";
import type { Provenance } from "../../src/model/provenance.js";
import {
  liquorId,
  mapCorrectionalInstitution,
  mapCourthouse,
  mapLiquorRetail,
  mapPrivateSchool,
  mapPublicSchool,
  mapSeniorsCentre,
  slugId,
  unquoteHeaders,
} from "../../src/provincial/ontario-catalogue.js";
import { CATALOGUE_JOBS } from "../../scripts/import-ontario-catalogue.js";
import { readRegistry } from "../../src/registry.js";
import { compileValidators } from "../../src/validate/ajv.js";
import { xlsxFixture } from "./zip-fixture.js";

/** Every row below is a labelled test fixture, not a real place. */

const validators = compileValidators(path.join(process.cwd(), "schema"));
const ctx = (source_id: string): Provenance => ({ source_id, licence: "OGL-ON-1.0", retrieved_at: "2026-11-16", tier: 0 });
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("xlsx reader", () => {
  it("reads shared strings, inline strings, numbers, gaps and repeated headers", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("AB12")).toBe(27);
    expect(decodeXml("Caf&#233; &amp; Bar")).toBe("Café & Bar");
    const grid = parseSheetXml('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Inline</t></is></c></row><row r="2"><c r="B2"><v>43.5</v></c></row>', ["Shared"]);
    expect(grid).toEqual([["Shared", "", "Inline"], ["", "43.5"]]);
    const root = mkdtempSync(path.join(tmpdir(), "xlsx-"));
    roots.push(root);
    const file = path.join(root, "fixture.xlsx");
    writeFileSync(file, xlsxFixture([["Name", "Code", "Code", "Latitude"], ["Fixture School", "A", "B", "43.5"], ["", "", "", ""]]));
    const table = readXlsx(file);
    expect(table.headers).toEqual(["Name", "Code", "Code (2)", "Latitude"]);
    expect(table.rows).toEqual([{ Name: "Fixture School", Code: "A", "Code (2)": "B", Latitude: "43.5" }]);
  });

  it("throws on a file that is not a workbook", () => {
    const root = mkdtempSync(path.join(tmpdir(), "xlsx-"));
    roots.push(root);
    const file = path.join(root, "broken.xlsx");
    writeFileSync(file, "<html>503</html>");
    expect(() => readXlsx(file)).toThrow(/unable to read/);
  });
});

describe("Ontario catalogue mappers", () => {
  it("public school: reads location columns only and keeps accessibility UNKNOWN", () => {
    const record = mapPublicSchool({ "School Number": "000001", "School Name": "Fixture Public School", "School Level": "Elementary", Street: "1 Fixture Ave", City: "Fixture", "Postal Code": "A1A1A1", "Board Name": "Fixture DSB", Latitude: "43.700000000000003", Longitude: "-79.400000000000006", "Phone Number": "416-555-0100", Enrolment: "300" }, ctx("ontario-public-schools"));
    expect(validators.records.venue(record)).toBe(true);
    expect(record.id).toBe("ontario-public-schools:000001");
    expect(record.fields.lat?.value).toBe(43.7);
    expect(record.fields.operator?.value).toBe("Fixture DSB");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(JSON.stringify(record)).not.toContain("555");
    expect(JSON.stringify(record)).not.toContain("300");
  });

  it("private school: the main location keeps the school number; another location adds its address", () => {
    const base = { "School Number": "880001", "School Name": "Fixture Academy", "School Level": "Secondary", "Street Number": "5", "Street Name": "Fixture", "Street Type": "Rd", City: "Fixture Town", Latitude: "43.6", Longitude: "-79.5" };
    expect(mapPrivateSchool({ ...base, "School Main Location Flag": "T" }, ctx("ontario-private-schools")).id).toBe("ontario-private-schools:880001");
    const other = mapPrivateSchool({ ...base, "School Main Location Flag": "F" }, ctx("ontario-private-schools"));
    expect(other.id).toBe("ontario-private-schools:880001:5_fixture-rd_fixture-town");
    expect(other.fields.addr_street?.value).toBe("Fixture Rd");
    expect(validators.records.venue(other)).toBe(true);
  });

  it("alcohol retail: id from name and address, kind flags kept as COLUMN=Y", () => {
    const row = { Location: "Fixture Market", Ontario_producer: "N", LCBO_convenience_outlet: "Y", Bottle_return_only: "N", Address: "9 Fixture St", "City/Town": "Fixture", Postal_code: "A1A1A1", Latitude: "44.0", Longitude: "-79.0" };
    expect(liquorId(row)).toBe("fixture-market_9-fixture-st_fixture_a1a1a1");
    const record = mapLiquorRetail(row, ctx("ontario-alcohol-retail-locations"));
    expect(validators.records.venue(record)).toBe(true);
    expect(record.fields.category?.value).toBe("LCBO_convenience_outlet=Y");
    expect(mapLiquorRetail({ ...row, LCBO_convenience_outlet: "N" }, ctx("ontario-alcohol-retail-locations")).fields.category?.value).toBe("UNKNOWN");
  });

  it("courthouse, seniors centre and correctional institution", () => {
    const court = mapCourthouse(unquoteHeaders({ "'Bldg_Ministry_Official_Name'": "1 Fixture St - Fixture Courthouse", "'Bldg_City'": "Fixture", "'Bldg_Postal_Code'": "A1A 1A1", "'Bldg_Latitude'": "45.1", "'Bldg_Longitude'": "-75.1" }), ctx("ontario-courthouses"));
    expect(validators.records.venue(court)).toBe(true);
    expect(court.id).toBe("ontario-courthouses:1-fixture-st-fixture-courthouse");
    const centre = mapSeniorsCentre({ ID: "7", "Organization name": "Fixture Seniors Club", Address: "Fixture Community Centre", "2nd Address Line": "12 Fixture Road", "City/Ville": "Fixture", "Postal Code/\nCode postale": "A1A 1A1", Latitude: "44.5", Longitude: "-78.5", "Phone number": "(705) 555-0100" }, ctx("ontario-seniors-active-living-centres"));
    expect(centre.fields.addr_housenumber?.value).toBe("12");
    expect(centre.fields.addr_street?.source_key).toBe("2nd Address Line");
    expect(centre.fields.addr_postcode?.value).toBe("A1A 1A1");
    expect(JSON.stringify(centre)).not.toContain("555");
    expect(mapCorrectionalInstitution({ Institution: "Fixture Jail", Operating_Status: "Closed", Latitude: "44", Longitude: "-79" }, ctx("ontario-correctional-institutions"))).toBeNull();
    expect(mapCorrectionalInstitution({ Institution: "Fixture Centre", Facility_Type: "Jail", Operating_Status: "Open", Latitude: "44", Longitude: "-79" }, ctx("ontario-correctional-institutions"))?.id).toBe("ontario-correctional-institutions:fixture-centre");
  });

  it("leaves a point outside Ontario's box without a cell", () => {
    expect(mapSeniorsCentre({ ID: "8", Latitude: "44.6", Longitude: "-155.5" }, ctx("ontario-seniors-active-living-centres")).region).toBe("unknown");
    expect(slugId("École Fixe", "", "St.-Paul")).toBe("ecole-fixe_st-paul");
  });
});

describe("catalogue registry entries", () => {
  it("are tier 0 provincial sources under the Open Government Licence – Ontario", () => {
    const registry = readRegistry(process.cwd());
    for (const job of CATALOGUE_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source!.kind).toBe("provincial");
      expect(source!.tier).toBe(0);
      expect(source!.licence_id).toBe("OGL-ON-1.0");
      expect(validators.source(source)).toBe(true);
    }
  });
});
