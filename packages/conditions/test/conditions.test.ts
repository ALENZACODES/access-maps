import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/condition.schema.json";
import { conditionsNear } from "../src/query";
import { importConditions } from "../src/ingest";
import { serializeDrafts } from "../src/drafts";
import type {
  ConditionRecord,
  ObstacleDraft,
  SourceRegistryEntry,
} from "../src/types";

const fetchedAt = "2026-11-15T12:00:00.000Z";
const registry: SourceRegistryEntry = {
  sourceId: "synthetic-test",
  sourceName: "Synthetic fixture",
  licence: "CC0",
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  status: "confirmed",
  synthetic: true,
};

const record: ConditionRecord = {
  id: "synthetic-test:1",
  type: "ice",
  point: { lat: 43.85, lon: -79.45 },
  fact: {
    value: "SYNTHETIC ice",
    source_id: "synthetic-test",
    licence: "CC0",
    retrieved_at: fetchedAt,
    tier: 1,
  },
  last_fetched: fetchedAt,
  last_checked: null,
  expiry_hours: 3,
};

describe("manual licence-gated import", () => {
  it("emits zero records on hold without reading the file", async () => {
    const result = await importConditions({
      registry: {
        ...registry,
        status: "held",
        licence: null,
        licenceUrl: null,
        heldReason: "Licence not confirmed",
      },
      filePath: "/missing-file.geojson",
      format: "geojson",
      fetchedAt,
    });
    expect(result.records).toEqual([]);
    expect(result.silo).toBe("held");
    expect(result.heldReason).toBe("Licence not confirmed");
  });

  it("holds confirmed status without a licence URL", async () => {
    const result = await importConditions({
      registry: { ...registry, licenceUrl: null },
      fixture: "{}",
      format: "geojson",
      fetchedAt,
    });
    expect(result.records).toHaveLength(0);
    expect(result.heldReason).toMatch(/licence/i);
  });

  it("imports synthetic GeoJSON and validates its schema", async () => {
    const fixture = JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          id: "511-test",
          type: "road_restriction",
          description: "SYNTHETIC restriction",
        },
        geometry: {
          type: "Point",
          coordinates: [-79.45, 43.85],
        },
      }],
    });
    const result = await importConditions({
      registry,
      fixture,
      format: "geojson",
      fetchedAt,
    });
    expect(result.records).toHaveLength(1);
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(result.records[0]).toBeDefined();
    expect(validate(result.records[0]), JSON.stringify(validate.errors)).toBe(true);
    expect(result.records[0]?.fact.tier).toBe(1);
  });

  it("imports synthetic snow-area CSV", async () => {
    const result = await importConditions({
      registry,
      fixture: [
        "id,type,lat,lon,cell,description",
        "plough-1,snowbank,43.86,-79.44,synthetic-cell,SYNTHETIC area",
      ].join("\n"),
      format: "csv",
      fetchedAt,
    });
    expect(result.records[0]?.type).toBe("snowbank");
    expect(result.records[0]?.cell).toBe("synthetic-cell");
  });

  it("separates ODbL into its own silo", async () => {
    const result = await importConditions({
      registry: { ...registry, licence: "ODbL" },
      fixture: "id,type,lat,lon\n1,other,43.85,-79.45",
      format: "csv",
      fetchedAt,
    });
    expect(result.silo).toBe("odbl");
  });
});

describe("proximity and expiry", () => {
  const point = { lat: 43.85, lon: -79.45 };

  it("returns nearby recent records", () => {
    const matches = conditionsNear(
      point, 100, [record], new Date("2026-11-15T13:00:00Z"),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.status).toBe("last_fetched");
  });

  it("marks expired records needs check, never current", () => {
    const matches = conditionsNear(
      point, 100, [record], new Date("2026-11-15T16:00:00Z"),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.status).toBe("needs_check");
  });

  it("does not silently place cell-only records nearby", () => {
    const cellOnly = { ...record, point: undefined, cell: "unknown-cell" };
    expect(conditionsNear(point, 100, [cellOnly])).toEqual([]);
  });
});

describe("person-controlled obstacle exports", () => {
  const draft: ObstacleDraft = {
    id: "local-example",
    type: "curb_blocked",
    point: { lat: 43.85, lon: -79.45 },
    note: "SYNTHETIC example",
    observed_at: fetchedAt,
    verified_by_person: false,
    tier: 0,
  };

  it("refuses unverified drafts", () => {
    expect(() => serializeDrafts([draft])).toThrow(/verification/);
  });

  it("exports only approved tier-zero draft data", () => {
    const payload = JSON.parse(serializeDrafts([
      { ...draft, verified_by_person: true },
    ]));
    expect(payload.drafts[0].tier).toBe(0);
    expect(payload.drafts[0].verified_by_person).toBe(true);
    expect(payload.format).toBe("access-maps-obstacle-drafts");
  });
});
