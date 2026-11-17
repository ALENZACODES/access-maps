import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Provenance } from "../../src/model/provenance.js";
import {
  arcAnchor,
  FISHING_FIELDS,
  mapFishingAccessPoint,
  mapMohServiceLocation,
  mapOfficialAirport,
  mapOtnAccessPoint,
  mapProvincialPark,
  mapRailwayStation,
  MOH_FIELDS,
  type GeohubFeature,
} from "../../src/provincial/ontario-geohub.js";
import { GEOHUB_JOBS } from "../../scripts/import-ontario-geohub.js";
import { readRegistry } from "../../src/registry.js";
import { compileValidators } from "../../src/validate/ajv.js";

/** Every feature below is a labelled test fixture, not a real place. */

const validators = compileValidators(path.join(process.cwd(), "schema"));
const ctx = (source_id: string): Provenance => ({ source_id, licence: "OGL-ON-1.0", retrieved_at: "2026-11-16", tier: 0 });
const at = (attributes: Record<string, string>, lon = -79.4, lat = 43.7): GeohubFeature => ({ attributes, anchor: { lon, lat, key: "geometry" } });

describe("ArcGIS anchors", () => {
  it("uses a point as published and the vertex mean of the largest ring of a polygon", () => {
    expect(arcAnchor({ x: -79.4, y: 43.7 })).toEqual({ lon: -79.4, lat: 43.7, key: "geometry" });
    const small: [number, number][] = [[-80, 44], [-79.99, 44], [-79.99, 44.01], [-80, 44]];
    const large: [number, number][] = [[-79, 43], [-78, 43], [-78, 44], [-79, 44], [-79, 43]];
    expect(arcAnchor({ rings: [small, large] })).toEqual({ lon: -78.5, lat: 43.5, key: "geometry:vertex_mean" });
    expect(arcAnchor(null)).toBeNull();
  });
});

describe("Ontario GeoHub mappers", () => {
  it("MOH service location: maps the address and keeps every accessibility field UNKNOWN", () => {
    const record = mapMohServiceLocation(at({ OGF_ID: "1", MOH_SERVICE_PROVIDER_IDENT: "77", SERVICE_TYPE: "Pharmacy", ENGLISH_NAME: "Fixture Pharmacy", ADDRESS_LINE_1: "10 Fixture Street", COMMUNITY: "Fixture Town", POSTAL_CODE: "A1A1A1" }), ctx("ontario-moh-service-locations"));
    expect(validators.records.venue(record)).toBe(true);
    expect(record.id).toBe("ontario-moh-service-locations:1");
    expect(record.fields.addr_housenumber?.value).toBe("10");
    expect(record.fields.addr_street?.value).toBe("Fixture Street");
    expect(record.fields.ref?.value).toBe("77");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(MOH_FIELDS).not.toContain("ADDRESS_DESCRIPTOR");
  });

  it("MOH service location: does not store a name that may name a person", () => {
    const named = mapMohServiceLocation(at({ OGF_ID: "2", SERVICE_TYPE: "Family Health Team", ENGLISH_NAME: "Dr. Fixture Person" }), ctx("ontario-moh-service-locations"));
    expect(named.fields.name?.value).toBe("UNKNOWN");
    expect(JSON.stringify(named)).not.toContain("Fixture Person");
    const clinic = mapMohServiceLocation(at({ OGF_ID: "3", SERVICE_TYPE: "Integrated Community Health Services Centre", ENGLISH_NAME: "Fixture Eye Centre" }), ctx("ontario-moh-service-locations"));
    expect(clinic.fields.name?.value).toBe("UNKNOWN");
  });

  it("fishing access point: keeps ACCESSIBILITY_FLG as the publisher's flag and skips rows not marked visible", () => {
    const yes = mapFishingAccessPoint(at({ OGF_ID: "4", FISHING_ACCESS_POINT_TYPE: "Boat Launch", SITE_NAME: "Fixture Launch", ACCESSIBILITY_FLG: "Yes", VISIBILITY_IND: "Yes" }), ctx("ontario-fishing-access-points"));
    expect(validators.records.venue(yes)).toBe(true);
    expect(yes?.fields.wheelchair_description?.value).toBe("ACCESSIBILITY_FLG=Yes");
    expect(yes?.fields.wheelchair?.value).toBe("UNKNOWN");
    const unknown = mapFishingAccessPoint(at({ OGF_ID: "5", ACCESSIBILITY_FLG: "Unknown", VISIBILITY_IND: "Yes" }), ctx("ontario-fishing-access-points"));
    expect(unknown?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(unknown?.fields.wheelchair_description?.raw).toBe("Unknown");
    expect(mapFishingAccessPoint(at({ OGF_ID: "6", VISIBILITY_IND: "No" }), ctx("ontario-fishing-access-points"))).toBeNull();
    expect(FISHING_FIELDS).toContain("VISIBILITY_IND");
  });

  it("provincial park, airport, trail access point and station", () => {
    const park = mapProvincialPark({ attributes: { OGF_ID: "7", PROTECTED_AREA_NAME_ENG: "FIXTURE PROVINCIAL PARK", TYPE_ENG: "Provincial Park", MANAGEMENT_ENG: "Fixture Agency", PROTECTED_SITE_IDENT: "P1" }, anchor: { lon: -78.5, lat: 45.5, key: "geometry:vertex_mean" } }, ctx("ontario-provincial-parks"));
    expect(validators.records.venue(park)).toBe(true);
    expect(park.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expect(park.fields.operator?.value).toBe("Fixture Agency");
    expect(mapOfficialAirport(at({ OGF_ID: "8", AIRPORT_TYPE: "Hospital Heliport", NAME: "Fixture" }), ctx("ontario-official-airports"))).toBeNull();
    expect(mapOfficialAirport(at({ OGF_ID: "9", AIRPORT_TYPE: "Seaplane Base", NAME: "Fixture Seaplane Base", AIRPORT_IDENT: "XX1" }), ctx("ontario-official-airports"))?.fields.ref?.value).toBe("XX1");
    const otn = mapOtnAccessPoint(at({ OGF_ID: "10", LOCATION_ACCURACY: "Within 10 metres" }), ctx("ontario-otn-access-points"));
    expect(validators.records.venue(otn)).toBe(true);
    expect(otn.fields.name?.value).toBe("UNKNOWN");
    expect(mapRailwayStation(at({ OGF_ID: "11", STNTYPE: "Freight", STENNAME: "Fixture Yard" }), ctx("ontario-railway-stations"))).toBeNull();
    expect(mapRailwayStation(at({ OGF_ID: "12", STNTYPE: "Passenger Station", STENNAME: "Fixture Station" }), ctx("ontario-railway-stations"))?.fields.name?.value).toBe("Fixture Station");
  });

  it("drops an anchor outside Ontario's box", () => {
    expect(mapOtnAccessPoint(at({ OGF_ID: "13" }, -100, 60), ctx("ontario-otn-access-points")).region).toBe("unknown");
  });
});

describe("GeoHub registry entries", () => {
  it("are tier 0 provincial sources under the Open Government Licence – Ontario", () => {
    const registry = readRegistry(process.cwd());
    for (const job of GEOHUB_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source!.kind).toBe("provincial");
      expect(source!.tier).toBe(0);
      expect(source!.licence_id).toBe("OGL-ON-1.0");
      expect(source!.download_url).toMatch(/^https:\/\/ws\.lioservices\.lrc\.gov\.on\.ca\/arcgis2\/rest\/services\/LIO_OPEN_DATA\/LIO_Open\d+\/MapServer\/\d+$/);
      expect(validators.source(source)).toBe(true);
    }
  });
});
