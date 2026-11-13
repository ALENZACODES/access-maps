import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fields from "../schema/fields.json";
import { countRecords } from "../src/count/count.js";
import { mapGtfsStop } from "../src/gtfs/map.js";
import { mapTorontoParkWashroom } from "../src/municipal/map.js";
import { FIELD_LIST } from "../src/model/records.js";
import { mapOsmElement } from "../src/osm/map.js";
import { readRegistry } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";
import type { Provenance } from "../src/model/provenance.js";

const osm: Provenance = {
  source_id: "osm-ontario",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

describe("JSON schemas", () => {
  const validators = compileValidators(new URL("../schema/", import.meta.url).pathname);

  it("requires every schema field and no extras", () => {
    expect(FIELD_LIST.venue).toEqual(fields.venue);
    expect(FIELD_LIST.washroom).toEqual(fields.washroom);
    expect(FIELD_LIST.path).toEqual(fields.path);
    expect(FIELD_LIST.transit).toEqual(fields.transit);
    const venueSchema = validators.records.venue.schema as { properties: { fields: { required: string[] } } };
    expect(venueSchema.properties.fields.required).toEqual(fields.venue);
  });

  it("accepts mapped records and rejects a missing provenance tier", () => {
    const [venue] = mapOsmElement(
      {
        osmType: "node",
        osmId: "1",
        tags: { amenity: "cafe", wheelchair: "yes" },
        geometry: { type: "Point", coordinates: [-79.38, 43.65] },
      },
      osm,
    );
    expect(validators.records.venue(venue)).toBe(true);
    const broken = structuredClone(venue) as unknown as { fields: { wheelchair: { tier?: number } } };
    delete broken.fields.wheelchair.tier;
    expect(validators.records.venue(broken)).toBe(false);

    const washroom = mapOsmElement(
      {
        osmType: "node",
        osmId: "2",
        tags: { amenity: "toilets", wheelchair: "limited" },
        geometry: { type: "Point", coordinates: [-75.69, 45.42] },
      },
      osm,
    )[0];
    expect(validators.records.washroom(washroom)).toBe(true);

    const path = mapOsmElement(
      {
        osmType: "way",
        osmId: "3",
        tags: { highway: "footway", surface: "concrete" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-79.38, 43.65],
            [-79.381, 43.651],
          ],
        },
      },
      osm,
    )[0];
    expect(validators.records.path(path)).toBe(true);

    const stop = mapGtfsStop(
      {
        stop_id: "9",
        stop_name: "Union",
        stop_lat: "43.645",
        stop_lon: "-79.380",
        wheelchair_boarding: "1",
        location_type: "1",
      },
      new Map(),
      { source_id: "gtfs-ttc", licence: "OGL-Toronto-1.0", retrieved_at: "2026-11-13", tier: 1 },
      "gtfs-ttc",
    );
    expect(validators.records.transit(stop)).toBe(true);

    const park = mapTorontoParkWashroom(
      {
        ASSET_ID: "1",
        ALTERNATIVE_NAME: "Park Washroom",
        ACCESSIBLE_FEATURES: "None",
        geometry: '{"type":"Point","coordinates":[-79.4,43.7]}',
      },
      { ...osm, source_id: "toronto-park-washrooms", licence: "OGL-Toronto-1.0" },
    );
    expect(validators.records.washroom(park)).toBe(true);
    const counted = [venue, washroom, path, stop, park].filter((record): record is NonNullable<typeof record> => record != null);
    expect(countRecords(counted).pieces).toBeGreaterThan(0);
  });

  it("validates the committed source registry", () => {
    const registry = readRegistry(process.cwd());
    expect(registry.sources.length).toBeGreaterThanOrEqual(10);
    for (const source of registry.sources) {
      expect(validators.source(source)).toBe(true);
      expect(source.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const ids = registry.sources.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pins the service-alert schema to access-main c89241d", () => {
    const pin = JSON.parse(readFileSync(new URL("../schema/upstream-pin.json", import.meta.url), "utf8")) as { commit: string };
    expect(pin.commit).toBe("c89241dcd405f0885982bd5398c893a8a6ab6c15");
    const local = readFileSync(new URL("../schema/service-alert.schema.json", import.meta.url));
    const upstream = readFileSync(new URL("../schema/upstream/service-alert.schema.json", import.meta.url));
    expect(Buffer.compare(local, upstream)).toBe(0);
    expect(JSON.parse(local.toString("utf8")).$id).toBe("https://access-maps.local/schema/service-alert.schema.json");
  });

  it("validates every committed TTC accessibility alert", () => {
    const gzip = readFileSync(new URL("../data/alerts/gtfs-rt-ttc-accessibility/alerts.ndjson.gz", import.meta.url));
    const lines = gunzipSync(gzip).toString("utf8").split("\n").filter((line) => line.trim());
    expect(lines).toHaveLength(32);
    for (const line of lines) {
      const alert = JSON.parse(line) as { id: string };
      expect(validators.alert(alert), alert.id).toBe(true);
    }
  });
});
