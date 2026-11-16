import { describe, expect, it } from "vitest";
import {
  buildAttributionPage,
  METROLINX_AUA_SECTION_3_LEGEND,
  METROLINX_OGL_LINE,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  OSM_ATTRIBUTION_LINE,
} from "./index";

describe("attribution page data", () => {
  it("selects only used sources and deduplicates them", () => {
    const page = buildAttributionPage("en", ["osm", "ltc", "osm"]);
    expect(page.entries.map((entry) => entry.id)).toEqual(["osm", "ltc"]);
    expect(page.entries[0]?.datasetAsOf).toBe("UNKNOWN");
  });

  it("preserves both independent Metrolinx notices in both locales", () => {
    for (const locale of ["en", "fr"] as const) {
      const page = buildAttributionPage(locale, ["metrolinx"]);
      expect(page.entries[0]?.notices).toEqual([
        METROLINX_AUA_SECTION_3_LEGEND,
        METROLINX_OGL_LINE,
        METROLINX_AUA_END_USER_LAWS_EN,
        METROLINX_AUA_END_USER_LAWS_FR,
      ]);
      expect(page.entries[0]?.sourceUrl).toContain("software-developers");
      expect(page.entries[0]?.licenceUrl).toContain("Open-Government-Licence");
    }
  });

  it("provides French display text and source and licence provenance", () => {
    const page = buildAttributionPage("fr", ["osm", "ltc"]);
    expect(page.heading).toBe("Sources et licences");
    expect(page.entries[0]?.explanation).toContain("d’OpenStreetMap");
    for (const entry of page.entries) {
      expect(entry.termsReviewedOn).toBe("2026-11-15");
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.licenceUrl).toMatch(/^https:\/\//);
      expect(entry.datasetAsOf).toBe("UNKNOWN");
    }
  });

  it("uses the exact OSM attribution line and keeps the ODbL note separate", () => {
    const page = buildAttributionPage("en", ["osm"]);
    expect(page.entries[0]?.notices[0]).toBe(OSM_ATTRIBUTION_LINE);
    expect(OSM_ATTRIBUTION_LINE).toBe("© OpenStreetMap contributors");
    expect(page.entries[0]?.notices[0]).not.toMatch(/ODbL/);
    expect(page.entries[0]?.notices.slice(1).join(" ")).toMatch(/ODbL 1\.0/);
  });

  it("has no MiWay source or copy in the attribution catalogue", () => {
    const page = buildAttributionPage("en", ["osm", "metrolinx", "ltc"]);
    const blob = JSON.stringify(page);
    expect(blob).not.toMatch(/miway/i);
    expect(page.entries.map((entry) => entry.id)).toEqual(["osm", "metrolinx", "ltc"]);
  });

  it("rejects a source identifier outside the catalogue", () => {
    expect(() => buildAttributionPage("en", ["other" as never])).toThrow(
      /Unknown attribution provider/,
    );
  });
});
