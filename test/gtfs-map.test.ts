import { describe, expect, it } from "vitest";
import { isGap, isPiece } from "../src/model/provenance.js";
import { indexLevels, mapGtfsPathway, mapGtfsStop, mapWheelchairBoarding } from "../src/gtfs/map.js";
import type { Provenance } from "../src/model/provenance.js";
import { GTFS_FEEDS } from "../src/gtfs/feeds.js";
import { readRegistry } from "../src/registry.js";

const ctx: Provenance = {
  source_id: "gtfs-ttc",
  licence: "OGL-Toronto-1.0",
  retrieved_at: "2026-11-13",
  tier: 1,
};

describe("GTFS mapping", () => {
  it("stores wheelchair_boarding 0 and empty as UNKNOWN and keeps the raw code", () => {
    for (const raw of ["0", "", "  "]) {
      const field = mapWheelchairBoarding(raw, ctx);
      expect(field.value).toBe("UNKNOWN");
      expect(field.tier).toBe(1);
      expect(isPiece(field)).toBe(false);
      expect(isGap(field)).toBe(true);
    }
    const accessible = mapWheelchairBoarding("1", ctx);
    expect(accessible.value).toBe("some_vehicles_accessible");
    expect(accessible.raw).toBe("1");
    expect(isPiece(accessible)).toBe(true);
    expect(mapWheelchairBoarding("2", ctx).value).toBe("boarding_not_possible");
    expect(mapWheelchairBoarding("9", ctx).value).toBe("9");
  });

  it("applies the GTFS empty location_type default and joins a published level", () => {
    const levels = indexLevels([{ level_id: "L1", level_index: "0", level_name: "Street" }]);
    const stop = mapGtfsStop(
      {
        stop_id: "100",
        stop_name: "Queen",
        stop_lat: "43.65",
        stop_lon: "-79.38",
        location_type: "",
        parent_station: "",
        wheelchair_boarding: "2",
        level_id: "L1",
        platform_code: "A",
      },
      levels,
      ctx,
      "gtfs-ttc",
    );
    expect(stop?.fields.location_type?.value).toBe("stop");
    expect(stop?.fields.location_type?.raw).toBe("");
    expect(stop?.fields.parent_station?.value).toBe("UNKNOWN");
    expect(stop?.fields.wheelchair_boarding?.value).toBe("boarding_not_possible");
    expect(stop?.fields.level_index?.value).toBe(0);
    expect(stop?.fields.level_name?.value).toBe("Street");
    expect(stop?.fields.platform_code?.value).toBe("A");
    expect(stop?.fields.level_id?.value).toBe("L1");
  });

  it("leaves level names UNKNOWN when the stop publishes a level_id and levels.txt does not", () => {
    const stop = mapGtfsStop(
      {
        stop_id: "5",
        stop_name: "Platform",
        stop_lat: "43.7",
        stop_lon: "-79.4",
        location_type: "4",
        level_id: "missing",
        wheelchair_boarding: "0",
      },
      new Map(),
      ctx,
      "gtfs-miway",
    );
    expect(stop?.fields.location_type?.value).toBe("boarding_area");
    expect(stop?.fields.level_id?.value).toBe("missing");
    expect(stop?.fields.level_index?.value).toBe("UNKNOWN");
    expect(stop?.fields.level_name?.value).toBe("UNKNOWN");
    expect(stop?.fields.wheelchair_boarding?.value).toBe("UNKNOWN");
  });

  it("maps a pathway without inventing geometry", () => {
    const pathway = mapGtfsPathway(
      {
        pathway_id: "p1",
        pathway_mode: "2",
        is_bidirectional: "",
        from_stop_id: "a",
        to_stop_id: "b",
        stair_count: "12",
        length: "18.5",
      },
      ctx,
      "gtfs-ttc",
    );
    expect(pathway?.tranche).toBe("path");
    expect(pathway?.fields.kind?.value).toBe("gtfs_pathway");
    expect(pathway?.fields.pathway_mode?.value).toBe("stairs");
    expect(pathway?.fields.pathway_mode?.raw).toBe("2");
    expect(pathway?.fields.bidirectional?.value).toBe("yes");
    expect(pathway?.fields.stair_count?.value).toBe(12);
    expect(pathway?.fields.length_m?.value).toBe(18.5);
    expect(pathway?.fields.geometry?.value).toBe("UNKNOWN");
    expect(pathway?.fields.geometry_type?.value).toBe("UNKNOWN");
    expect(pathway?.fields.surface?.value).toBe("UNKNOWN");
  });

  it("registers every feed used by the importer", () => {
    const registry = readRegistry(process.cwd());
    const gtfs = new Set(registry.sources.filter((source) => source.kind === "gtfs").map((source) => source.id));
    expect(GTFS_FEEDS.map((feed) => feed.id).sort()).toEqual([...gtfs].sort());
    for (const source of registry.sources.filter((item) => item.kind === "gtfs")) {
      expect(source.tier).toBe(1);
      expect(source.licence_url.length).toBeGreaterThan(0);
      expect(source.attribution.length).toBeGreaterThan(0);
    }
  });
});
