import { describe, expect, it } from "vitest";
import { countRecords, renderCountsMarkdown } from "../src/count/count.js";
import { mapOsmElement, type OsmElement } from "../src/osm/map.js";
import { resolveWheelchairBoarding } from "../src/gtfs/map.js";
import { isPiece } from "../src/model/provenance.js";
import type { Provenance } from "../src/model/provenance.js";
import type { DataRecord } from "../src/model/records.js";

const ctx: Provenance = {
  source_id: "osm-ontario",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

describe("counting rules", () => {
  it("does not count UNKNOWN or derived copies, and does not double-count toilet fields", () => {
    const element: OsmElement = {
      osmType: "node",
      osmId: "7",
      tags: { amenity: "cafe", name: "Cafe", wheelchair: "yes", "toilets:wheelchair": "yes", changing_table: "yes" },
      geometry: { type: "Point", coordinates: [-79.38, 43.65] },
    };
    const records = mapOsmElement(element, ctx);
    const report = countRecords(records);
    const venue = records.find((record) => record.tranche === "venue") as DataRecord;
    const washroom = records.find((record) => record.tranche === "washroom") as DataRecord;
    const venuePieces = Object.values(venue.fields).filter(isPiece).length;
    const washroomPieces = Object.values(washroom.fields).filter(isPiece).length;
    expect(report.by_tranche.venue.pieces).toBe(venuePieces);
    expect(report.by_tranche.washroom.pieces).toBe(washroomPieces);
    expect(report.pieces).toBe(venuePieces + washroomPieces);
    expect(report.by_tranche.washroom.derived_excluded).toBe(2);
    expect(washroom.fields.lat?.derived).toBe(true);
    expect(JSON.stringify(venue.fields)).not.toContain("toilets:wheelchair");
    expect(report.by_tranche.venue.gaps).toBeGreaterThan(0);
    expect(report.by_source["osm-ontario"]?.pieces).toBe(report.pieces);
    expect(report.by_source["osm-ontario"]?.pieces_by_tier["0"]).toBe(report.pieces);
    expect(report.by_source["osm-ontario"]?.pieces_by_retrieved_at["2026-11-13"]).toBe(report.pieces);
  });

  it("counts numeric zero and does not count GTFS wheelchair_boarding 0", () => {
    const [venue] = mapOsmElement(
      {
        osmType: "node",
        osmId: "8",
        tags: { amenity: "library", level: "0" },
        geometry: { type: "Point", coordinates: [-79.4, 43.7] },
      },
      ctx,
    );
    expect(isPiece(venue?.fields.level ?? fail())).toBe(true);
    const boarding = resolveWheelchairBoarding(
      "s",
      new Map([["s", { wheelchair_boarding: "0", location_type: "0", parent_station: "" }]]),
      { ...ctx, source_id: "gtfs-ttc", licence: "OGL-Toronto-1.0", tier: 1 },
    );
    expect(isPiece(boarding)).toBe(false);
  });

  it("measures the 500,000 shortfall against verified values only", () => {
    const [venue] = mapOsmElement(
      {
        osmType: "node",
        osmId: "9",
        tags: { amenity: "cafe", wheelchair: "yes" },
        geometry: { type: "Point", coordinates: [-79.4, 43.7] },
      },
      ctx,
    );
    const report = countRecords([venue as DataRecord]);
    expect(report.verified_toward_500k).toBe(0);
    expect(report.by_tranche.venue.verified).toBe(0);
    expect(report.by_tranche.venue.accessibility_facts).toBe(1);
    expect(report.shortfalls.find((item) => item.tranche === "venue")?.shortfall).toBe(250_000);
    const markdown = renderCountsMarkdown(report);
    expect(markdown).not.toContain("meets the illustrative");
    expect(markdown).not.toMatch(/Shortfall 0/);
    expect(markdown).toContain("Verified toward 500,000 is 0");
  });

  it("rejects a duplicate id inside one tranche", () => {
    const [first] = mapOsmElement(
      {
        osmType: "node",
        osmId: "1",
        tags: { amenity: "cafe" },
        geometry: { type: "Point", coordinates: [-79.4, 43.7] },
      },
      ctx,
    );
    expect(() => countRecords([first as DataRecord, first as DataRecord])).toThrow(/duplicate venue id/);
  });
});

function fail(): never {
  throw new Error("missing");
}
