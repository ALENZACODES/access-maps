import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compression, PMTiles, TileType, zxyToTileId } from "pmtiles";
import { isAccessibilityField, assertAccessibilityFieldsMatchSchema } from "../src/count/accessibility.js";
import { TILES_HELD_FOR_LEGAL_REVIEW } from "../scripts/build-pmtiles.js";
import { countRecords } from "../src/count/count.js";
import { equipmentClass, parseAccessibilityAlerts } from "../src/gtfs-rt/alerts.js";
import { utm17nToWgs84, webMercatorToWgs84 } from "../src/geo/project.js";
import { readPointShapefileZip } from "../src/io/shp-points.js";
import {
  mapBramptonRecreationCentre,
  mapKingstonAccessibleFeature,
  mapKingstonPublicWashroom,
  mapMtoPicnicPark,
  mapSudburyFieldhouse,
} from "../src/municipal/map.js";
import { mapOsmElement } from "../src/osm/map.js";
import { mapWheelchairBoarding } from "../src/gtfs/map.js";
import { isPiece, type Provenance } from "../src/model/provenance.js";
import { roundCoord } from "../src/model/records.js";
import { assertArchiveSize, buildPmtiles, project, TileSizeError, MAX_PMTILES_BYTES } from "../src/tiles/build.js";

const osm: Provenance = {
  source_id: "osm-ontario",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

const city: Provenance = {
  source_id: "kingston-accessible-features",
  licence: "Kingston-Open-Data-Licence-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

describe("accessibility facts", () => {
  it("counts wheelchair and toilets:wheelchair apart from name and coordinates", () => {
    assertAccessibilityFieldsMatchSchema();
    const records = mapOsmElement(
      {
        osmType: "node",
        osmId: "9",
        tags: { amenity: "cafe", name: "Cafe", wheelchair: "yes", "toilets:wheelchair": "yes" },
        geometry: { type: "Point", coordinates: [-79.38, 43.65] },
      },
      osm,
    );
    const report = countRecords(records);
    const venue = records.find((record) => record.tranche === "venue");
    const washroom = records.find((record) => record.tranche === "washroom");
    expect(isAccessibilityField("venue", "name")).toBe(false);
    expect(isAccessibilityField("venue", "lat")).toBe(false);
    expect(isAccessibilityField("venue", "wheelchair")).toBe(true);
    expect(isAccessibilityField("washroom", "wheelchair")).toBe(true);
    expect(venue?.fields.wheelchair?.value).toBe("yes");
    expect(washroom?.fields.wheelchair?.value).toBe("yes");
    expect(report.accessibility_pieces).toBe(2);
    expect(report.context_pieces).toBe(0);
    expect(report.identity_pieces + report.context_pieces + report.accessibility_pieces).toBe(report.pieces);
    const litPath = mapOsmElement(
      {
        osmType: "way",
        osmId: "10",
        tags: { highway: "footway", lit: "yes", surface: "asphalt", access: "permissive" },
        geometry: { type: "LineString", coordinates: [[-79.4, 43.7], [-79.4, 43.701]] },
      },
      osm,
    ).find((record) => record.tranche === "path");
    const litReport = countRecords(litPath ? [litPath] : []);
    expect(litReport.by_tranche.path.accessibility_by_field.surface).toBe(1);
    expect(litReport.by_tranche.path.accessibility_by_field.lit).toBeUndefined();
    expect(litReport.by_tranche.path.context_by_field.lit).toBe(1);
    expect(litReport.by_tranche.path.context_by_field.access).toBe(1);
    expect(litReport.accessibility_pieces).toBe(1);
    expect(report.by_tranche.venue.accessibility_by_field.wheelchair).toBe(1);
    expect(report.by_tranche.washroom.accessibility_by_field.wheelchair).toBe(1);
    const boarding = mapWheelchairBoarding("0", { ...osm, source_id: "gtfs-ttc", licence: "OGL-Toronto-1.0", tier: 1 });
    expect(isPiece(boarding)).toBe(false);
  });
});

describe("TTC accessibility alerts", () => {
  const text = readFileSync(new URL("./fixtures/ttc-accessibility-alerts.textproto", import.meta.url), "utf8");

  it("classifies elevator and escalator only from the header words", () => {
    const alerts = parseAccessibilityAlerts(text, {
      source_id: "gtfs-rt-ttc-accessibility",
      licence: "OGL-Toronto-1.0",
      retrieved_at: "2026-11-13",
    });
    const escalator = alerts.find((alert) => alert.entity_id === "80239");
    const elevator = alerts.find((alert) => alert.entity_id === "80207");
    const unknown = alerts.find((alert) => alert.entity_id === "synthetic-colon");
    expect(escalator?.equipment).toBe("escalator");
    expect(escalator?.stop_ids).toEqual(["15659"]);
    expect(escalator?.active_periods[0]).toEqual({ start: 1795102200, end: 1795120200 });
    expect(elevator?.equipment).toBe("elevator");
    expect(elevator?.active_periods[0]).toEqual({ start: 1794579243 });
    expect(unknown?.equipment).toBe("UNKNOWN");
    expect(unknown?.header_text).toContain("film shoot");
    expect(equipmentClass("The elevator and the escalator are both out")).toBe("elevator_and_escalator");
    expect(alerts[0]?.tier).toBe(4);
    expect(alerts[0]?.feed_timestamp).toBe(1794598340);
  });

  it("rejects a feed with no header timestamp", () => {
    expect(() =>
      parseAccessibilityAlerts("entity { id: \"1\" alert { effect: OTHER } }", {
        source_id: "gtfs-rt-ttc-accessibility",
        licence: "OGL-Toronto-1.0",
        retrieved_at: "2026-11-13",
      }),
    ).toThrow(/timestamp/);
  });
});

describe("municipal coordinates and published facts", () => {
  it("keeps Kingston washroom wheelchair unknown and stores a curb cut as the published type", () => {
    const washroom = mapKingstonPublicWashroom(
      {
        "POI ID": "8054",
        "POI Name": "POLSON PARK WASHROOM",
        Address: "153 ROBERT WALLACE DR",
        "POI Type Description": "Washroom",
        Ownership: "Municipal",
        "Sub Description": "Washroom",
        "Map Label": "Polson Park Washroom",
        "Global ID": "f38737f1-fc0a-42b9-9567-ad0fba60e617",
        x: "-8519156.1218",
        y: "5501972.4683",
      },
      { ...city, source_id: "kingston-public-washrooms" },
    );
    expect(washroom.tranche).toBe("washroom");
    expect(washroom.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(washroom.fields.description?.value).toBe("Polson Park Washroom");
    expect(washroom.fields.description?.source_key).toBe("Map Label");
    expect(JSON.stringify(washroom.fields.description)).not.toContain("f38737f1");
    const expected = webMercatorToWgs84(-8519156.1218, 5501972.4683);
    expect(washroom.fields.lon?.value).toBe(roundCoord(expected.lon));
    expect(washroom.fields.lat?.value).toBe(roundCoord(expected.lat));
    expect(Math.abs((washroom.fields.lon?.value as number) - -76.52888152)).toBeLessThan(1e-5);

    const curb = mapKingstonAccessibleFeature(
      {
        OBJECTID: "5",
        Type: "Sidewalk Curb Cut",
        Status: "Active",
        "Facility Name": "Memorial Centre",
        Address: "303 York St",
        x: "-8516027.7608",
        y: "5502440.6515",
      },
      city,
    );
    expect(curb.tranche).toBe("venue");
    expect(curb.fields.kerb?.value).toBe("Sidewalk Curb Cut");
    expect(curb.fields.wheelchair?.value).toBe("UNKNOWN");
    const listening = mapKingstonAccessibleFeature(
      { OBJECTID: "90", Type: "Assistive Listening", "Facility Name": "Hall", Address: "1 Main St", x: "-76.5", y: "44.2" },
      city,
    );
    expect(listening.fields.hearing_loop?.value).toBe("Assistive Listening");
    expect(listening.fields.wheelchair?.value).toBe("UNKNOWN");

    const mens = mapKingstonAccessibleFeature(
      {
        OBJECTID: "16",
        Type: "Accessible Mens Washroom",
        Status: "Active",
        "Facility Name": "Memorial Centre",
        Comment: "Open May long weekend to mid-fall 9 a.m. to 9 p.m.",
        Address: "303 York St",
        x: "-8516027.7608",
        y: "5502440.6515",
      },
      city,
    );
    expect(mens.tranche).toBe("washroom");
    expect(mens.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(mens.fields.male?.value).toBe("yes");
    expect(mens.fields.unisex?.value).toBe("UNKNOWN");
    expect(mens.fields.published_accessibility?.value).toBe("Accessible Mens Washroom");
    expect(String(mens.fields.opening_hours?.value)).toContain("a.m.");

    const family = mapKingstonAccessibleFeature(
      { OBJECTID: "17", Type: "Accessible Family Washroom", "Facility Name": "Hall", Address: "1 Main St", x: "1", y: "1" },
      city,
    );
    expect(family.fields.unisex?.value).toBe("UNKNOWN");
    expect(family.fields.wheelchair?.value).toBe("UNKNOWN");
  });

  it("does not turn Brampton amenities or Sudbury occupancy into wheelchair", () => {
    const centre = mapBramptonRecreationCentre(
      {
        OBJECTID: "1",
        "FACILITY NAME": "ATIBA HUTCHINSON SOCCER COURT",
        ADDRESS: "340 VODDEN ST E",
        TYPE: "SOCCER COURT",
        WEBSITE: "https://www.brampton.ca/example",
        x: "-8878127.12548499",
        y: "5420557.84231275",
      },
      { ...city, source_id: "brampton-recreation-centres", licence: "CC-BY" },
    );
    expect(centre.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(centre.fields.category?.value).toBe("SOCCER COURT");
    expect(centre.fields.name?.value).toBe("ATIBA HUTCHINSON SOCCER COURT");

    const house = mapSudburyFieldhouse(
      {
        OBJECTID: "1",
        X: "502124.967305",
        Y: "5148560.67506",
        FACILITY_N: "Longsdale Playground Fieldhouse",
        OCCUPANCY: "Fieldhouse",
        ADDRESS: "811 Longsdale Avenue",
      },
      { ...city, source_id: "sudbury-fieldhouses", licence: "Greater-Sudbury-Open-Data-Licence-1.0" },
    );
    expect(house.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(house.fields.category?.value).toBe("Fieldhouse");
    const expected = utm17nToWgs84(502124.967305, 5148560.67506);
    expect(house.fields.lon?.value).toBe(roundCoord(expected.lon));
    expect(Math.abs((house.fields.lon?.value as number) - -80.972311)).toBeLessThan(1e-5);
    expect(Math.abs((house.fields.lat?.value as number) - 46.490613)).toBeLessThan(1e-5);
    const unlocated = mapSudburyFieldhouse(
      { OBJECTID: "59", X: "0", Y: "0", FACILITY_N: "Carol Richard Playground - Fieldhouse", ADDRESS: "" },
      { ...city, source_id: "sudbury-fieldhouses", licence: "Greater-Sudbury-Open-Data-Licence-1.0" },
    );
    expect(unlocated.fields.lat?.value).toBe("UNKNOWN");
    expect(unlocated.fields.lon?.value).toBe("UNKNOWN");
    expect(unlocated.fields.name?.value).toBe("Carol Richard Playground - Fieldhouse");
    const cited = mapSudburyFieldhouse(
      { OBJECTID: "59", X: "0", Y: "0", FACILITY_N: "Carol Richard Playground - Fieldhouse", ADDRESS: "" },
      { ...city, source_id: "sudbury-fieldhouses", licence: "Greater-Sudbury-Open-Data-Licence-1.0" },
      { lon: -81.01282241174695, lat: 46.62942174681167 },
    );
    expect(cited.fields.lon?.value).toBe(roundCoord(-81.01282241174695));
    expect(cited.fields.lat?.value).toBe(roundCoord(46.62942174681167));
    expect(cited.fields.lat?.source_key).toBe("AGOL_Recreation_Bilingual_For_Web_FGDB_V_3/FeatureServer/3");
  });

  it("reads a geographic point shapefile and refuses a projected one", () => {
    const rows = readPointShapefileZip(pointZip(-79.58287117699996, 45.23949820300004, "1.04000000000e+002", "Shell Service Centre"));
    expect(rows).toHaveLength(1);
    const park = mapMtoPicnicPark(rows[0]?.attributes ?? {}, rows[0]?.lon ?? 0, rows[0]?.lat ?? 0, {
      ...city,
      source_id: "mto-picnic-parks",
      licence: "OGL-Ontario-1.0",
    });
    expect(park.fields.ref?.value).toBe("104");
    expect(park.fields.category?.value).toBe("picnic park");
    expect(park.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(park.id).toBe("mto-picnic-parks:104");
    expect(() => readPointShapefileZip(pointZip(0, 0, "1", "X", "PROJCS[\"WebMercator\"]"))).toThrow(/projected/);
  });
});

describe("PMTiles overlay", () => {
  it("writes a readable archive and keeps ODbL out of the other file", async () => {
    expect(zxyToTileId(0, 0, 0)).toBe(0);
    expect(zxyToTileId(1, 0, 0)).toBe(1);
    expect(zxyToTileId(1, 0, 1)).toBe(2);
    expect(zxyToTileId(1, 1, 1)).toBe(3);
    expect(zxyToTileId(1, 1, 0)).toBe(4);
    expect(zxyToTileId(2, 0, 0)).toBe(5);
    const archive = buildPmtiles(
      [
        { lon: -79.38, lat: 43.65, props: { id: "a", wheelchair: "yes" }, licenceFamily: "odbl" },
        { lon: -79.4, lat: 43.7, props: { id: "b", name: "Library" }, licenceFamily: "odbl" },
      ],
      {
        family: "odbl",
        name: "test",
        description: "ODbL layer kept separate from other licences.",
        attribution: "(c) OpenStreetMap contributors",
        maxZoom: 4,
      },
    );
    expect(archive.length).toBeLessThan(MAX_PMTILES_BYTES);
    const reader = new PMTiles(new BufferSource(archive));
    const header = await reader.getHeader();
    expect(header.specVersion).toBe(3);
    expect(header.tileType).toBe(TileType.Mvt);
    expect(header.tileCompression).toBe(Compression.Gzip);
    const tile = project(-79.38, 43.65, 4);
    const response = await reader.getZxy(4, tile.x, tile.y);
    expect(response).toBeTruthy();
    const payload = response?.data ?? new Uint8Array();
    const bytes = Buffer.from(payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload);
    expect(bytes.includes(Buffer.from("access"))).toBe(true);
    expect(bytes.includes(Buffer.from("wheelchair"))).toBe(true);
    const metadata = (await reader.getMetadata()) as { description?: string };
    expect(metadata.description).toContain("ODbL");
    expect(metadata.description).toContain("separate");
    expect(() =>
      buildPmtiles(
        [
          { lon: -79.38, lat: 43.65, props: { id: "a" }, licenceFamily: "odbl" },
          { lon: -79.4, lat: 43.7, props: { id: "b" }, licenceFamily: "other" },
        ],
        { family: "other", name: "x", description: "x", attribution: "x", maxZoom: 1 },
      ),
    ).toThrow(/refusing to put/);
    expect(() => assertArchiveSize(MAX_PMTILES_BYTES)).toThrow(TileSizeError);
    expect([...TILES_HELD_FOR_LEGAL_REVIEW].sort()).toEqual([
      "gtfs-go-transit",
      "gtfs-ltc",
      "gtfs-miway",
      "gtfs-up-express",
    ]);
  });
});

class BufferSource {
  constructor(private readonly file: Buffer) {}

  getKey(): string {
    return "test";
  }

  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    const end = Math.min(this.file.length, offset + length);
    const slice = this.file.subarray(offset, end);
    const copy = new Uint8Array(slice.byteLength);
    copy.set(slice);
    return { data: copy.buffer };
  }
}

function pointZip(lon: number, lat: number, code: string, name: string, prj = 'GEOGCS["WGS 84",DATUM["WGS_1984"],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'): Buffer {
  const shp = Buffer.alloc(100 + 28);
  shp.writeInt32BE(9994, 0);
  shp.writeInt32BE(50 + 14, 24);
  shp.writeInt32LE(1000, 28);
  shp.writeInt32LE(1, 32);
  shp.writeDoubleLE(lon, 36);
  shp.writeDoubleLE(lat, 44);
  shp.writeDoubleLE(lon, 52);
  shp.writeDoubleLE(lat, 60);
  shp.writeInt32BE(1, 100);
  shp.writeInt32BE(10, 104);
  shp.writeInt32LE(1, 108);
  shp.writeDoubleLE(lon, 112);
  shp.writeDoubleLE(lat, 120);
  const nameField = dbfField("NAME", 32);
  const codeField = dbfField("MTOCODE", 24);
  const headerLength = 32 + 32 + 32 + 1;
  const recordLength = 1 + 32 + 24;
  const dbf = Buffer.alloc(headerLength + recordLength + 1);
  dbf.writeUInt8(3, 0);
  dbf.writeUInt32LE(1, 4);
  dbf.writeUInt16LE(headerLength, 8);
  dbf.writeUInt16LE(recordLength, 10);
  nameField.copy(dbf, 32);
  codeField.copy(dbf, 64);
  dbf.writeUInt8(0x0d, 96);
  dbf.writeUInt8(0x20, headerLength);
  dbf.write(name.padEnd(32, " "), headerLength + 1, "latin1");
  dbf.write(code.padEnd(24, " "), headerLength + 1 + 32, "latin1");
  dbf.writeUInt8(0x1a, headerLength + recordLength);
  return zipStored([
    { name: "picnic.shp", data: shp },
    { name: "picnic.dbf", data: dbf },
    { name: "picnic.prj", data: Buffer.from(prj) },
  ]);
}

function dbfField(name: string, length: number): Buffer {
  const field = Buffer.alloc(32);
  field.write(name, 0, "latin1");
  field.writeUInt8("C".charCodeAt(0), 11);
  field.writeUInt8(length, 16);
  return field;
}

function zipStored(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(file.data.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    parts.push(header, name, file.data);
  }
  return Buffer.concat(parts);
}
