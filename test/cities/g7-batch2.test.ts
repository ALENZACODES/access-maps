import { describe, expect, it } from "vitest";
import { LENNOX_ADDINGTON_JOBS, mapLaFacility } from "../../src/municipal/cities/lennox-addington.js";
import { NIAGARA_PENINSULA_CONSERVATION_JOBS, npcaTrailIsPath } from "../../src/municipal/cities/niagara-peninsula-conservation.js";
import { QUINTE_CONSERVATION_JOBS } from "../../src/municipal/cities/quinte-conservation.js";
import type { G7LayerJob } from "../../src/municipal/cities/g7-helpers.js";
import type { DataRecord } from "../../src/model/records.js";
import { contextFor, expectValid, VENUE_ACCESS_FIELDS } from "./g7-support.js";

/** Features below are copied from the layers retrieved on 2026-11-17, with long lines and rings cut short. */

function job(jobs: readonly G7LayerJob[], id: string): G7LayerJob {
  const found = jobs.find((entry) => entry.id === id);
  if (!found) throw new Error(`no job ${id}`);
  return found;
}

function records(jobs: readonly G7LayerJob[], id: string, feature: Parameters<G7LayerJob["map"]>[0]): DataRecord[] {
  const mapped = job(jobs, id).map(feature, contextFor(id));
  if (mapped === null) return [];
  const list = Array.isArray(mapped) ? mapped : [mapped];
  for (const record of list) expectValid(record);
  return list;
}

describe("County of Lennox and Addington", () => {
  const ctx = contextFor("lennox-addington-facility-sites");

  it("stores a community hall with its civic address from FACILITYID and accessibility UNKNOWN", () => {
    const record = mapLaFacility(
      {
        attributes: { OBJECTID: 1, FACILITYID: "2 Factory Street", NAME: "Newburgh Community Hall", FCODE: "Community Facility", DESCRIPT: "Community Centre", URL: "https://www.stonemills.com/services/culture-and-recreation/community-halls", COMMUNITY: "Newburgh" },
        geometry: { x: -76.87551122911731, y: 44.324184165865276 },
      },
      ctx,
    );
    if (!record) throw new Error("expected a record");
    expectValid(record);
    expect(record.tranche).toBe("venue");
    expect(record.fields.category?.value).toBe("Community Centre");
    expect(record.fields.category_group?.value).toBe("recreation");
    expect(record.fields.addr_housenumber?.value).toBe("2");
    expect(record.fields.addr_street?.value).toBe("Factory Street");
    for (const key of VENUE_ACCESS_FIELDS) expect(record.fields[key]?.value).toBe("UNKNOWN");
  });

  it("stores a Public Washroom row as a washroom record and leaves schools and cemeteries out", () => {
    const washroom = mapLaFacility(
      { attributes: { OBJECTID: 9, NAME: "Fixture Park Washroom", DESCRIPT: "Public Washroom", FCODE: "Recreation", COMMUNITY: "Napanee" }, geometry: { x: -76.95, y: 44.25 } },
      ctx,
    );
    if (!washroom) throw new Error("expected a record");
    expectValid(washroom);
    expect(washroom.tranche).toBe("washroom");
    expect(washroom.fields.wheelchair?.value).toBe("UNKNOWN");
    for (const type of ["Public Elementary School", "Cemetery", "Fire Station", "Golf Course", ""]) {
      expect(mapLaFacility({ attributes: { OBJECTID: 2, NAME: "Fixture", DESCRIPT: type }, geometry: { x: -76.9, y: 44.3 } }, ctx), type).toBeNull();
    }
  });

  it("imports sidewalk rows and leaves roadside walkways and gravel out", () => {
    const line = { paths: [[[-76.964026, 44.261103], [-76.96406, 44.2612]]] };
    const kept = records(LENNOX_ADDINGTON_JOBS, "lennox-addington-sidewalks", { attributes: { OBJECTID: 1, SURFACE: "Concrete Sidewalk" }, geometry: line });
    expect(kept).toHaveLength(1);
    expect(kept[0]?.fields.kind?.value).toBe("sidewalk");
    expect(kept[0]?.fields.surface?.value).toBe("Concrete Sidewalk");
    expect(records(LENNOX_ADDINGTON_JOBS, "lennox-addington-sidewalks", { attributes: { OBJECTID: 2, SURFACE: "Roadside Asphalt Walkway" }, geometry: line })).toEqual([]);
    expect(records(LENNOX_ADDINGTON_JOBS, "lennox-addington-sidewalks", { attributes: { OBJECTID: 3, SURFACE: "Gravel" }, geometry: line })).toEqual([]);
  });
});

describe("Quinte Conservation", () => {
  it("stores a conservation area with the civic part of its emergency address", () => {
    const [record] = records(QUINTE_CONSERVATION_JOBS, "quinte-conservation-areas", {
      attributes: { OBJECTID: 1, NAME: "Deerock Conservation Area", STATUS: "Active", MUNICIPALITY: "Township of Addington Highlands", EMERGENCY_ADDRESS: "390 Deer Rock Lake Road, Flinton, ON" },
      geometry: { x: -77.2317547641376, y: 44.733290429385235 },
    });
    expect(record?.fields.addr_housenumber?.value).toBe("390");
    expect(record?.fields.addr_street?.value).toBe("Deer Rock Lake Road");
    expect(record?.fields.addr_city?.value).toBe("Township of Addington Highlands");
  });

  it("keeps a trail's DIFFICULTY as the Authority's own text, never a wheelchair value", () => {
    const [trail] = records(QUINTE_CONSERVATION_JOBS, "quinte-conservation-trails", {
      attributes: { OBJECTID: 1, NAME: "Loyalist Loop", STATUS: "Active", DIFFICULTY: "Advanced" },
      geometry: { paths: [[[-77.434170, 44.148499], [-77.434159, 44.1486]]] },
    });
    expect(trail?.fields.wheelchair_description?.value).toBe("DIFFICULTY=Advanced");
    expect(trail?.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(trail?.fields.signposted_as?.value).toBe("Loyalist Loop");
  });
});

describe("Niagara Peninsula Conservation Authority", () => {
  it("anchors a conservation area at its outline's vertex mean and keeps WC_Access as the Authority's flag", () => {
    const [record] = records(NIAGARA_PENINSULA_CONSERVATION_JOBS, "npca-conservation-areas", {
      attributes: { CA_ID: 13, CA_Name: "Ball's Falls", Municipali: "Town of Lincoln", WC_Access: "Yes", WebPage: "http://www.npca.ca/conservation-areas/balls-falls/" },
      geometry: { rings: [[[-79.38, 43.13], [-79.37, 43.13], [-79.37, 43.14], [-79.38, 43.14], [-79.38, 43.13]]] },
    });
    expect(record?.id).toBe("npca-conservation-areas:13");
    expect(record?.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(record?.fields.wheelchair_description?.value).toBe("WC_Access=Yes");
    expect(record?.fields.wheelchair?.value).toBe("UNKNOWN");
  });

  it("keeps slope and grade without a unit as COLUMN=value text and leaves roads and retired paths out", () => {
    const [trail] = records(NIAGARA_PENINSULA_CONSERVATION_JOBS, "npca-trails", {
      attributes: { OBJECTID: 40, Feature: "Trail", TrailType: "Formal Trail", TrailName: "Fixture Loop", TrailRating: "1", Surface: "Gravel", AverageSlope: "3.55392312", MaximumGrade: "" },
      geometry: { paths: [[[-79.28, 43.06], [-79.281, 43.061]]] },
    });
    expect(trail?.fields.wheelchair_description?.value).toBe("TrailRating=1; AverageSlope=3.55392312");
    expect(trail?.fields.surface?.value).toBe("Gravel");
    expect(trail?.fields.max_slope?.value).toBe("UNKNOWN");
    expect(npcaTrailIsPath({ Feature: "Road", TrailType: "Road" })).toBe(false);
    expect(npcaTrailIsPath({ Feature: "Trail", TrailType: "Retired" })).toBe(false);
    expect(npcaTrailIsPath({ Feature: "Bruce Trail", TrailType: "Formal Trail", TrailRating: "2" })).toBe(true);
  });
});
