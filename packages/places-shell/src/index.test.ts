import { describe, expect, it, vi } from "vitest";
import { createPlacesModule, fold, placesMessages } from "./index.js";
import type { FieldValue, PackManifest, PackRecord, PackSource, PackSourceEntry, SearchHit, Tranche } from "./pack-types.js";

// Demonstration-only fixtures with invented names; no real-place accessibility assertions.
const sources: PackSourceEntry[] = [
  { sourceId: "open-a", name: "Demonstration catalogue", licence: "CC0-1.0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Demonstration catalogue", retrieved: "2026-11-01", inWebPack: true },
  { sourceId: "held-b", name: "Held demonstration feed", licence: "restricted", attribution: "Held demonstration feed", retrieved: "2026-11-01", inWebPack: false, heldReason: "Licence approval pending" },
];
const field = (value: FieldValue["value"], source_id = "open-a", tier: FieldValue["tier"] = 0, source_key?: string): FieldValue =>
  ({ value, source_id, licence: source_id === "open-a" ? "CC0-1.0" : "restricted", retrieved_at: "2026-11-01", tier, ...(source_key ? { source_key } : {}) });
const record = (id: string, tranche: Tranche, name: string, source = "open-a", tier: FieldValue["tier"] = 0, evidence?: string): PackRecord => ({
  id, tranche, region: "demonstration", fields: {
    name: field(name, source, tier, evidence),
    category: field("Demonstration"),
    addr_city: field("Fictional City"),
  },
});
const records: PackRecord[] = [
  record("v1", "venue", "École du Ruisseau"),
  record("w1", "washroom", "École – toilettes"),
  record("t1", "transit", "École arrêt"),
  record("held", "venue", "École tenue", "held-b"),
  record("unknown", "venue", "UNKNOWN"),
  record("no-evidence", "venue", "École sans preuve", "open-a", 3),
  record("with-evidence", "venue", "École vérifiée", "open-a", 3, "evidence-123"),
  record("p1", "path", "École sentier"),
];
const manifest: PackManifest = {
  version: 1, builtAt: "2026-11-01T00:00:00Z", sourceCommit: "demonstration",
  sources, regions: [], tranches: {}, search: {}, tiles: {}, counts: {},
};

/** Mirrors the I3 createFixtureSource API, without importing its implementation. */
function createFixtureSource(items: PackRecord[], entries: PackSourceEntry[]): PackSource {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    manifest: async () => ({ ...manifest, sources: entries }),
    cellsFor: async () => [],
    async *records(tranche) { for (const item of items) if (item.tranche === tranche) yield item; },
    search: async (text, opts) => {
      const key = fold(text);
      return items.filter((item) => (!opts.tranches || opts.tranches.includes(item.tranche)) &&
        fold(String(item.fields.name?.value ?? "")).includes(key))
        .slice(0, opts.limit)
        .map((item): SearchHit => ({ id: item.id, tranche: item.tranche,
          name: item.fields.name?.value === "UNKNOWN" ? null : String(item.fields.name?.value ?? "") }));
    },
    get: async (id) => byId.get(id) ?? null,
    sourcesFor: (item) => entries.filter((entry) => Object.values(item.fields).some((value) => value?.source_id === entry.sourceId)),
    regions: async () => [],
    downloadRegion: async (id) => ({ id }),
    deleteRegion: async () => {},
  };
}
const ctx = { locale: "fr" as const, offline: false, nowIso: "2026-11-15T00:00:00Z" };

describe("places module over the public web pack", () => {
  it("searches accents insensitively across venues, washrooms and transit and preserves provenance", async () => {
    const source = createFixtureSource(records, sources);
    const spy = vi.spyOn(source, "search");
    const result = await createPlacesModule(source).search({ text: "ecole" }, ctx);
    expect(spy).toHaveBeenCalledWith("ecole", { tranches: ["venue", "washroom", "transit"], limit: 50 });
    expect(result.items.map((item) => item.id).sort()).toEqual(["t1", "v1", "w1", "with-evidence"].sort());
    const names = result.items.map((item) => item.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr") || a.localeCompare(b)));
    for (const item of result.items) {
      expect(item.provenance).toMatchObject({ source_name: "Demonstration catalogue", licence: "CC0-1.0", source_date: "2026-11-01" });
      expect(item.provenance.tier).toBeGreaterThanOrEqual(0);
      expect(item.attribution).toBe("Demonstration catalogue");
      expect(item.sources[0]?.retrieved).toBe("2026-11-01");
    }
    expect(result.liveStatus).toBe("unavailable");
  });

  it("excludes held sources, unknown names and tiers without evidence", async () => {
    const module = createPlacesModule(createFixtureSource(records, sources));
    const result = await module.search({ text: "ecole" }, ctx);
    expect(result.items.map((item) => item.id)).not.toContain("held");
    expect(result.items.map((item) => item.id)).not.toContain("no-evidence");
    expect((await module.search({ text: "unknown" }, ctx)).items).toEqual([]);
    expect(module.diagnostics().skipped.name_unknown).toBe(1);
  });

  it("returns a sourced detail round-trip and a localizable ready not-found response", async () => {
    const module = createPlacesModule(createFixtureSource(records, sources));
    const hit = (await module.search({ text: "ruisseau" }, ctx)).items[0];
    expect(hit).toBeDefined();
    if (!hit) throw new Error("expected a search hit");
    const detail = await module.get(hit.id, ctx);
    expect(detail.items).toHaveLength(1);
    const item = detail.items[0];
    expect(item).toMatchObject({ id: hit.id, name: hit.name, record: { id: hit.id }, sources: [{ sourceId: "open-a" }] });
    expect(item?.record.fields.name?.value).toBe("École du Ruisseau");
    const missing = await module.get("missing", ctx);
    expect(missing).toMatchObject({ availability: "ready", items: [], messageKey: "places.shellNotFound" });
    expect(placesMessages.en[missing.messageKey as keyof typeof placesMessages.en]).toBe("Place not found");
    expect(placesMessages.fr[missing.messageKey as keyof typeof placesMessages.fr]).toBe("Lieu introuvable");
    expect((await module.get("held", ctx)).items).toEqual([]);
  });

  it("never passes location without consent, and exposes Near me only on consent", async () => {
    const source = createFixtureSource(records, sources);
    const spy = vi.spyOn(source, "search");
    const module = createPlacesModule(source);
    const near = { lat: 43.7, lon: -79.4 };
    const noConsent = await module.search({ text: "ecole" }, { ...ctx, near, geolocationGranted: false });
    expect(noConsent.nearMeAvailable).toBe(false);
    expect(spy.mock.lastCall?.[1]).not.toHaveProperty("near");
    const granted = await module.search({ text: "ecole" }, { ...ctx, near, geolocationGranted: true });
    expect(granted.nearMeAvailable).toBe(true);
    expect(spy.mock.lastCall?.[1]).toMatchObject({ near });
  });

  it("caps even a non-conforming index at 50 and reports truncation", async () => {
    const many = Array.from({ length: 54 }, (_, index) => record(`v${index}`, "venue", `École ${index}`));
    const source = createFixtureSource(many, sources);
    source.search = async () => many.map((item) => ({ id: item.id, tranche: item.tranche, name: String(item.fields.name?.value) }));
    const result = await createPlacesModule(source).search({ text: "ecole" }, ctx);
    expect(result.items).toHaveLength(50);
    expect(result.truncated).toBe(4);
  });
});
