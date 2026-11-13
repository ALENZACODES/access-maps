import { describe, expect, it } from "vitest";
import { isGap, isPiece } from "../src/model/provenance.js";
import { indexLevels, mapGtfsPathway, mapGtfsStop, resolveWheelchairBoarding, type WheelchairStop } from "../src/gtfs/map.js";
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
  it("uses parentless stop meanings when the stop has no parent", () => {
    const feed = feedOf({ s: { wheelchair_boarding: "0", location_type: "", parent_station: "" } });
    for (const code of ["0", ""]) {
      feed.set("s", { wheelchair_boarding: code, location_type: "", parent_station: "" });
      const field = resolveWheelchairBoarding("s", feed, ctx);
      expect(field.value).toBe("UNKNOWN");
      expect(field.tier).toBe(1);
      expect(isPiece(field)).toBe(false);
      expect(isGap(field)).toBe(true);
    }
    feed.set("s", { wheelchair_boarding: "1", location_type: "0", parent_station: "" });
    const accessible = resolveWheelchairBoarding("s", feed, ctx);
    expect(accessible.value).toBe("some_vehicles_accessible");
    expect(accessible.raw).toBe("1");
    expect(isPiece(accessible)).toBe(true);
    feed.set("s", { wheelchair_boarding: "2", location_type: "", parent_station: "" });
    expect(resolveWheelchairBoarding("s", feed, ctx).value).toBe("boarding_not_possible");
    feed.set("s", { wheelchair_boarding: "9", location_type: "", parent_station: "" });
    expect(resolveWheelchairBoarding("s", feed, ctx).value).toBe("9");
  });

  it("inherits 0 from the parent for child stops and names entrance access separately", () => {
    const feed = feedOf({
      station: { wheelchair_boarding: "1", location_type: "1", parent_station: "" },
      platform: { wheelchair_boarding: "0", location_type: "0", parent_station: "station" },
      path: { wheelchair_boarding: "1", location_type: "0", parent_station: "station" },
      blocked: { wheelchair_boarding: "2", location_type: "4", parent_station: "station" },
      door: { wheelchair_boarding: "1", location_type: "2", parent_station: "station" },
      closed: { wheelchair_boarding: "2", location_type: "2", parent_station: "station" },
      blankDoor: { wheelchair_boarding: "", location_type: "2", parent_station: "station" },
      orphan: { wheelchair_boarding: "0", location_type: "0", parent_station: "missing" },
    });
    const inherited = resolveWheelchairBoarding("platform", feed, ctx);
    expect(inherited.value).toBe("some_vehicles_accessible");
    expect(inherited.derived).toBe(true);
    expect(inherited.raw).toBe("0");
    expect(isPiece(inherited)).toBe(false);
    expect(resolveWheelchairBoarding("path", feed, ctx)).toMatchObject({
      value: "accessible_path",
      raw: "1",
    });
    expect(resolveWheelchairBoarding("blocked", feed, ctx).value).toBe("no_accessible_path");
    expect(resolveWheelchairBoarding("door", feed, ctx).value).toBe("entrance_accessible");
    expect(resolveWheelchairBoarding("closed", feed, ctx).value).toBe("entrance_not_accessible");
    const inheritedEntrance = resolveWheelchairBoarding("blankDoor", feed, ctx);
    expect(inheritedEntrance.value).toBe("some_vehicles_accessible");
    expect(inheritedEntrance.derived).toBe(true);
    expect(resolveWheelchairBoarding("orphan", feed, ctx).value).toBe("UNKNOWN");
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

function feedOf(rows: Record<string, WheelchairStop>): Map<string, WheelchairStop> {
  return new Map(Object.entries(rows));
}

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
