import { describe, expect, it } from "vitest";
import realVenue from "./fixtures/venue.osm-node-238726675.json" with { type: "json" };
import osmSource from "./fixtures/source.osm-ontario.json" with { type: "json" };
import {
  SHELL_CONTRACT_VERSION,
  UNKNOWN,
  createPlacesSearch,
  fold,
  toPlaceHit,
  type FieldValue,
  type SourceRegistryEntry,
  type VenueRecord,
} from "../src/index.ts";

const NOW = "2026-11-14T12:00:00.000Z";
const ctx = { locale: "en" as const, offline: true, nowIso: NOW };
const OSM = osmSource as SourceRegistryEntry;
const REAL = realVenue as unknown as VenueRecord;

const SYNTHETIC_SOURCE: SourceRegistryEntry = {
  id: "synthetic-test",
  name: "Synthetic test source",
  kind: "municipal",
  url: "https://example.org/synthetic",
  download_url: "https://example.org/synthetic.csv",
  licence_name: "Synthetic licence for tests",
  licence_url: "https://example.org/licence",
  licence_id: "SYNTHETIC-1.0",
  attribution: "Synthetic test data",
  retrieved_at: "2026-11-10",
  tier: 0,
};

function field(value: FieldValue["value"], tier: FieldValue["tier"] = 0, source_id = "synthetic-test"): FieldValue {
  return { value, source_id, licence: "SYNTHETIC-1.0", retrieved_at: "2026-11-10", tier };
}

/** Every field UNKNOWN except the ones given. No accessibility value is set. */
function synthetic(id: string, set: Record<string, FieldValue>): VenueRecord {
  const keys = Object.keys(REAL.fields);
  const fields = Object.fromEntries(keys.map((key) => [key, field(UNKNOWN)]));
  return { id, tranche: "venue", region: "synthetic", fields: { ...fields, ...set } };
}

const A = synthetic("synthetic:a", { name: field("Synthetic Café Alpha"), addr_city: field("Sudbury"), category: field("cafe") });
const B = synthetic("synthetic:b", { name: field("Synthetic Library Beta"), addr_city: field("Sudbury") });
const NAMELESS = synthetic("synthetic:nameless", { addr_city: field("Sudbury") });
const UNREGISTERED = synthetic("synthetic:unregistered", { name: field("Synthetic Sudbury Gamma", 0, "nowhere") });
const TIER3 = synthetic("synthetic:tier3", { name: field("Synthetic Sudbury Delta", 3) });

describe("places shell adapter", () => {
  it("pins the shell contract version", () => {
    expect(SHELL_CONTRACT_VERSION).toBe("1.1.0");
  });

  it("maps the real OpenStreetMap fixture with its source, ODbL licence, date, tier 0, and attribution", () => {
    const hit = toPlaceHit(REAL, new Map([[OSM.id, OSM]]), NOW);
    expect(hit).toEqual({
      id: "osm:node/238726675",
      name: "Shoppers Drug Mart",
      provenance: {
        source_name: "OpenStreetMap, Geofabrik Ontario extract",
        source_url: "https://download.geofabrik.de/north-america/canada.html",
        licence: "ODbL-1.0",
        licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
        source_date: "2026-11-13",
        retrieved_at: NOW,
        tier: 0,
        prototype_label: "SEEDED-OPEN-DATA",
        freshness: "unknown",
      },
      attribution: "(c) OpenStreetMap contributors",
      category: "pharmacy",
      city: "Toronto",
    });
  });

  it("finds a place by name, city, or category, ignoring case and accents", () => {
    const places = createPlacesSearch({ venues: [A, B, REAL], sources: [SYNTHETIC_SOURCE, OSM] });
    expect(places.search({ ...ctx, query: "cafe alpha" }).result.items.map((item) => item.id)).toEqual(["synthetic:a"]);
    expect(places.search({ ...ctx, query: "SUDBURY" }).result.items.map((item) => item.id)).toEqual(["synthetic:a", "synthetic:b"]);
    expect(places.search({ ...ctx, query: "pharmacy" }).result.items.map((item) => item.id)).toEqual(["osm:node/238726675"]);
    expect(fold("  Café   ÉCOLE ")).toBe("cafe ecole");
  });

  it("does not match on the word UNKNOWN", () => {
    const places = createPlacesSearch({ venues: [A, B], sources: [SYNTHETIC_SOURCE] });
    expect(places.search({ ...ctx, query: "unknown" }).result.items).toEqual([]);
  });

  it("leaves out unnamed, unregistered, and tier 3 venues and counts each reason", () => {
    const places = createPlacesSearch({ venues: [A, NAMELESS, UNREGISTERED, TIER3], sources: [SYNTHETIC_SOURCE] });
    const outcome = places.search({ ...ctx, query: "sudbury" });
    expect(outcome.result.items.map((item) => item.id)).toEqual(["synthetic:a"]);
    expect(outcome.skipped).toEqual({ name_unknown: 1, source_not_registered: 1, tier_not_in_prototype: 1 });
  });

  it("returns an empty ready list for empty text instead of listing every place", () => {
    const places = createPlacesSearch({ venues: [A, B], sources: [SYNTHETIC_SOURCE] });
    const { result } = places.search({ ...ctx, query: "   " });
    expect(result).toMatchObject({ availability: "ready", items: [], asOf: null, messageKey: "places.shellEnterText", liveStatus: "unavailable" });
  });

  it("caps results at the limit and reports how many were cut", () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      synthetic(`synthetic:${index}`, { name: field(`Synthetic Place ${index}`) }),
    );
    const outcome = createPlacesSearch({ venues: many, sources: [SYNTHETIC_SOURCE], limit: 2 }).search({ ...ctx, query: "synthetic" });
    expect(outcome.result.items.map((item) => item.name)).toEqual(["Synthetic Place 0", "Synthetic Place 1"]);
    expect(outcome.truncated).toBe(3);
  });

  it("serves the shell module shape and keeps live status unavailable", async () => {
    const places = createPlacesSearch({ venues: [A], sources: [SYNTHETIC_SOURCE] });
    const result = await places.module.search({ text: "alpha" }, ctx);
    expect(result.moduleId).toBe("places");
    expect(result.liveStatus).toBe("unavailable");
    expect(result.asOf).toBe("2026-11-10");
    expect(JSON.stringify(result)).not.toMatch(/"VERIFIED"/);
  });
});
