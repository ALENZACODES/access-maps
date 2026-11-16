import { describe, expect, it } from "vitest";
import realVenue from "./fixtures/venue.osm-node-238726675.json" with { type: "json" };
import osmSource from "./fixtures/source.osm-ontario.json" with { type: "json" };
import {
  SHELL_CONTRACT_VERSION,
  UNKNOWN,
  createPlacesModule,
  fold,
  type FieldValue,
  type PackRecord,
  type PackSource,
  type PackSourceEntry,
} from "../src/index.ts";

const ctx = { locale: "en" as const, offline: true, nowIso: "2026-11-14T12:00:00.000Z" };

const OSM: PackSourceEntry = {
  sourceId: osmSource.id,
  name: osmSource.name,
  licence: osmSource.licence_id,
  licenceUrl: osmSource.licence_url,
  attribution: osmSource.attribution,
  retrieved: osmSource.retrieved_at,
  inWebPack: true,
  url: osmSource.url,
};

const SYNTHETIC: PackSourceEntry = {
  sourceId: "synthetic-test",
  name: "Synthetic test source",
  licence: "SYNTHETIC-1.0",
  licenceUrl: "https://example.org/licence",
  attribution: "Synthetic test data",
  retrieved: "2026-11-10",
  inWebPack: true,
  url: "https://example.org/synthetic",
};

const REAL = realVenue as unknown as PackRecord;

function field(value: FieldValue["value"], tier: FieldValue["tier"] = 0, source_id = "synthetic-test"): FieldValue {
  return { value, source_id, licence: "SYNTHETIC-1.0", retrieved_at: "2026-11-10", tier };
}

/** Every field UNKNOWN except the ones given. No accessibility value is set. */
function synthetic(id: string, set: Record<string, FieldValue>): PackRecord {
  const keys = Object.keys(REAL.fields);
  const fields = Object.fromEntries(keys.map((key) => [key, field(UNKNOWN)]));
  return { id, tranche: "venue", region: "synthetic", fields: { ...fields, ...set } };
}

const A = synthetic("synthetic:a", { name: field("Synthetic Café Alpha"), addr_city: field("Sudbury"), category: field("cafe") });
const B = synthetic("synthetic:b", { name: field("Synthetic Library Beta"), addr_city: field("Sudbury") });
const NAMELESS = synthetic("synthetic:nameless", { addr_city: field("Sudbury") });
const UNREGISTERED = synthetic("synthetic:unregistered", { name: field("Synthetic Sudbury Gamma", 0, "nowhere") });
const TIER3 = synthetic("synthetic:tier3", { name: field("Synthetic Sudbury Delta", 3) });

function createFixtureSource(items: PackRecord[], entries: PackSourceEntry[]): PackSource {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    manifest: async () => ({
      version: 1,
      builtAt: "2026-11-13T00:00:00Z",
      sourceCommit: "fixture",
      sources: entries,
      regions: [],
      tranches: {},
      search: {},
      tiles: {},
      counts: {},
    }),
    cellsFor: async () => [],
    async *records(tranche) {
      for (const item of items) if (item.tranche === tranche) yield item;
    },
    search: async (text, opts) => {
      const key = fold(text);
      return items
        .filter((item) => (!opts.tranches || opts.tranches.includes(item.tranche)) &&
          fold(String(item.fields.name?.value ?? "")).includes(key))
        .slice(0, opts.limit)
        .map((item) => ({
          id: item.id,
          tranche: item.tranche,
          name: item.fields.name?.value === "UNKNOWN" ? null : String(item.fields.name?.value ?? ""),
        }));
    },
    get: async (id) => byId.get(id) ?? null,
    sourcesFor: (item) => entries.filter((entry) =>
      Object.values(item.fields).some((value) => value?.source_id === entry.sourceId)),
    regions: async () => [],
    downloadRegion: async (id) => ({ id }),
    deleteRegion: async () => {},
  };
}

describe("places shell adapter", () => {
  it("pins the shell contract version", () => {
    expect(SHELL_CONTRACT_VERSION).toBe("1.2.0");
  });

  it("maps the real OpenStreetMap fixture with its source, ODbL licence, date, tier 0, and attribution", async () => {
    const module = createPlacesModule(createFixtureSource([REAL], [OSM]));
    const result = await module.search({ text: "shoppers" }, ctx);
    expect(result.items).toHaveLength(1);
    const hit = result.items[0];
    expect(hit).toMatchObject({
      id: "osm:node/238726675",
      name: "Shoppers Drug Mart",
      provenance: {
        source_name: "OpenStreetMap, Geofabrik Ontario extract",
        source_url: "https://download.geofabrik.de/north-america/canada.html",
        licence: "ODbL-1.0",
        licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
        source_date: "2026-11-13",
        retrieved_at: "2026-11-13",
        tier: 0,
        prototype_label: "SEEDED-OPEN-DATA",
        freshness: "unknown",
      },
      attribution: "© OpenStreetMap contributors",
      category: "pharmacy",
      city: "Toronto",
      tranche: "venue",
    });
  });

  it("finds a place by name, ignoring case and accents", async () => {
    const module = createPlacesModule(createFixtureSource([A, B, REAL], [SYNTHETIC, OSM]));
    const cafe = await module.search({ text: "cafe alpha" }, ctx);
    expect(cafe.items.map((item) => item.id)).toEqual(["synthetic:a"]);
    const shoppers = await module.search({ text: "SHOPPERS" }, ctx);
    expect(shoppers.items.map((item) => item.id)).toEqual(["osm:node/238726675"]);
  });

  it("does not match on the word UNKNOWN", async () => {
    const module = createPlacesModule(createFixtureSource([A, B], [SYNTHETIC]));
    expect((await module.search({ text: "unknown" }, ctx)).items).toEqual([]);
  });

  it("leaves out unnamed, unregistered, and tier 3 venues and counts each reason", async () => {
    const items = [A, NAMELESS, UNREGISTERED, TIER3];
    const source = createFixtureSource(items, [SYNTHETIC]);
    // A non-conforming index may return records the module must still exclude.
    source.search = async () => items.map((item) => ({
      id: item.id,
      tranche: item.tranche,
      name: item.fields.name?.value === "UNKNOWN" ? null : String(item.fields.name?.value ?? ""),
    }));
    const module = createPlacesModule(source);
    const result = await module.search({ text: "synthetic" }, ctx);
    expect(result.items.map((item) => item.id)).toEqual(["synthetic:a"]);
    expect(module.diagnostics().skipped).toEqual({
      name_unknown: 1,
      source_not_registered: 1,
      tier_without_evidence: 1,
    });
  });

  it("returns an empty ready list for empty text instead of listing every place", async () => {
    const module = createPlacesModule(createFixtureSource([A, B], [SYNTHETIC]));
    const result = await module.search({ text: "   " }, ctx);
    expect(result).toMatchObject({
      availability: "ready",
      items: [],
      asOf: null,
      messageKey: "places.shellEnterText",
      liveStatus: "unavailable",
    });
  });

  it("caps results at the limit and reports how many were cut", async () => {
    const many = Array.from({ length: 54 }, (_, index) =>
      synthetic(`synthetic:${index}`, { name: field(`Synthetic Place ${index}`) }),
    );
    const source = createFixtureSource(many, [SYNTHETIC]);
    source.search = async () => many.map((item) => ({
      id: item.id,
      tranche: item.tranche,
      name: String(item.fields.name?.value),
    }));
    const result = await createPlacesModule(source).search({ text: "synthetic" }, ctx);
    expect(result.items).toHaveLength(50);
    expect(result.truncated).toBe(4);
    expect(result.items[0]?.name).toBe("Synthetic Place 0");
  });

  it("serves the shell module shape and keeps live status unavailable", async () => {
    const module = createPlacesModule(createFixtureSource([A], [SYNTHETIC]));
    const result = await module.search({ text: "alpha" }, ctx);
    expect(result.moduleId).toBe("places");
    expect(result.liveStatus).toBe("unavailable");
    expect(result.asOf).toBe("2026-11-10");
    expect(JSON.stringify(result)).not.toMatch(/"VERIFIED"/);
  });
});
