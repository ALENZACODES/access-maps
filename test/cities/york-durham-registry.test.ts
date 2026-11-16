import { describe, expect, it } from "vitest";
import { GTFS_FEEDS } from "../../src/gtfs/feeds.js";
import { YORK_DURHAM_GTFS_FEED_IDS, YORK_DURHAM_JOBS } from "../../src/municipal/cities/york-durham-jobs.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { readRegistry } from "../../src/registry.js";
import { isDocumentedLicence } from "../../tools/data-qa/findings.js";
import { repoRoot } from "./york-durham-helpers.js";

/** The licence each publisher states, read on 2026-11-16. The key is the source id prefix. */
const LICENCE_BY_PREFIX: Record<string, string> = {
  "york-region-": "York-Region-Open-Data-Licence-1.0",
  "markham-": "Markham-Open-Data-Licence-1.0",
  "newmarket-": "Newmarket-Open-Data-Licence-2.0",
};

describe("York and Durham city registry entries", () => {
  const registry = readRegistry(repoRoot);

  it("has a municipal entry retrieved 2026-11-16 at the job's tier for every job", () => {
    for (const job of YORK_DURHAM_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source!.kind).toBe("municipal");
      expect(source!.tier).toBe(job.tier);
      expect([0, 1]).toContain(source!.tier);
      expect(source!.retrieved_at).toBe("2026-11-16");
      expect(source!.download_url).toMatch(/^https:\/\/[^/]+\/.+\/(FeatureServer|MapServer)\/\d+$/);
      expect(source!.attribution.length).toBeGreaterThan(20);
      expect(source!.licence_url).toMatch(/^https:\/\//);
      expect(source!.notes ?? "").toMatch(/Licence text read on 2026-11-16/);
    }
  });

  it("uses the licence the publisher states and documents it for the strict export check", () => {
    for (const job of YORK_DURHAM_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id)!;
      const prefix = Object.keys(LICENCE_BY_PREFIX).find((key) => job.id.startsWith(key));
      expect(prefix, job.id).toBeDefined();
      expect(source.licence_id).toBe(LICENCE_BY_PREFIX[prefix!]);
      expect(isDocumentedLicence(source.id, source.licence_id), job.id).toBe(true);
    }
  });

  it("names only GTFS feeds that the feed list and the registry both hold", () => {
    for (const id of YORK_DURHAM_GTFS_FEED_IDS) {
      expect(GTFS_FEEDS.some((feed) => feed.id === id), id).toBe(true);
      const source = registry.sources.find((entry) => entry.id === id);
      expect(source?.kind).toBe("gtfs");
      expect(source?.tier).toBe(1);
      expect(source?.retrieved_at).toBe("2026-11-16");
    }
  });
});

describe("cityFeature", () => {
  it("drops a point outside Ontario and keeps attributes as strings", () => {
    const feature = cityFeature({ attributes: { A: 1, B: null }, geometry: { x: 0, y: 0 } });
    expect(feature.point).toBeNull();
    expect(feature.attributes).toEqual({ A: "1", B: "" });
  });

  it("returns no point and no lines for a feature without geometry", () => {
    const feature = cityFeature({ attributes: {}, geometry: null });
    expect(feature.point).toBeNull();
    expect(feature.lines).toEqual([]);
  });
});
