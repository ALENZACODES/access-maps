import { describe, expect, it } from "vitest";
import { G3_LAYER_JOBS } from "../../scripts/import-cities-g3.js";
import { GTFS_FEEDS } from "../../src/gtfs/feeds.js";
import { readRegistry } from "../../src/registry.js";
import { root } from "./g3-helpers.js";

const NEVER_REQUESTED = /phone|fax|email|e_mail|contact|^source$|create_by|update_by|created_user|last_edited_user|inspectedby|memorial_name/i;

describe("city import jobs for Kitchener, Waterloo, Cambridge, Guelph, Windsor and the County of Lambton", () => {
  const registry = readRegistry(root);

  it("each layer job has a tier 0 municipal registry entry retrieved on 2026-11-16 with a licence and attribution", () => {
    for (const job of G3_LAYER_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source?.kind).toBe("municipal");
      expect(source?.tier).toBe(0);
      expect(source?.retrieved_at).toBe("2026-11-16");
      expect(source?.licence_id.length).toBeGreaterThan(0);
      expect(source?.licence_url.startsWith("https://")).toBe(true);
      expect(source?.attribution.length).toBeGreaterThan(0);
      expect(source?.download_url).toMatch(/\/(?:FeatureServer|MapServer)\/\d+$/);
      expect(source?.notes ?? "").toMatch(/Licence text read/);
    }
  });

  const G3_GTFS = ["guelph-transit-gtfs", "windsor-transit-gtfs"];

  it("the Guelph and Windsor GTFS feeds are importer feeds with tier 1 gtfs registry entries", () => {
    for (const id of G3_GTFS) {
      expect(GTFS_FEEDS.some((feed) => feed.id === id), id).toBe(true);
      const source = registry.sources.find((entry) => entry.id === id);
      expect(source?.kind, id).toBe("gtfs");
      expect(source?.tier).toBe(1);
      expect(source?.retrieved_at).toBe("2026-11-16");
    }
  });

  it("source ids start with the city slug and are unique", () => {
    const ids = [...G3_LAYER_JOBS.map((job) => job.id), ...G3_GTFS];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(?:kitchener|waterloo|cambridge|guelph|windsor|lambton)-[a-z-]+$/);
  });

  it("no job requests a contact, editor or inspector column", () => {
    for (const job of G3_LAYER_JOBS) {
      for (const field of job.fields) expect(NEVER_REQUESTED.test(field), `${job.id} ${field}`).toBe(false);
    }
  });
});
