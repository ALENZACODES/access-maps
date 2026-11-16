import { describe, expect, it } from "vitest";
import {
  buildAttributionPage,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_AUA_SECTION_3_LEGEND,
  METROLINX_OGL_LINE,
  OSM_ATTRIBUTION_LINE,
  parseReleaseEvidence,
  auditRelease,
  compareReleaseEvidence,
  renderAuditText,
} from "./index.js";
import { sampleRelease, sampleSource } from "./evidence-fixtures.js";

describe("single catalogue and published entry point", () => {
  it("exports release parsing and audit from the catalogue module", () => {
    const release = parseReleaseEvidence(sampleRelease());
    expect(auditRelease(release).blocked).toBe(false);
  });

  it("exports comparisons from the same public entry", () => {
    const release = sampleRelease();
    expect(compareReleaseEvidence(release, release).changes).toEqual([]);
  });

  it("exports the bilingual report renderer", () => {
    const release = sampleRelease();
    expect(renderAuditText(release, auditRelease(release), "fr"))
      .toContain("Rapport sur les sources et les licences");
  });

  it("keeps OSM credit separate from ODbL licence terms", () => {
    const page = buildAttributionPage("en", ["osm"]);
    expect(OSM_ATTRIBUTION_LINE).toBe("© OpenStreetMap contributors");
    expect(page.entries[0]?.notices[0]).toBe(OSM_ATTRIBUTION_LINE);
    expect(page.entries[0]?.notices).toContain("Open Database License (ODbL) 1.0");
  });

  it("preserves the AUA applicable-laws line in English", () => {
    expect(METROLINX_AUA_END_USER_LAWS_EN)
      .toBe("Users must follow applicable laws when using the transit data.");
  });

  it("preserves the AUA applicable-laws line in French", () => {
    expect(METROLINX_AUA_END_USER_LAWS_FR)
      .toBe("Les utilisateurs doivent respecter les lois applicables lorsqu’ils utilisent les données de transport en commun.");
  });

  it("preserves the section 3 English legal legend", () => {
    expect(METROLINX_AUA_SECTION_3_LEGEND).toContain(
      "Data used in this product or service is provided with the permission of Metrolinx.",
    );
    expect(METROLINX_AUA_SECTION_3_LEGEND).toContain(
      "assumes no responsibility for the accuracy or currency",
    );
  });

  it("preserves the independent OGL line", () => {
    expect(METROLINX_OGL_LINE).toBe(
      "Contains information licensed under the Open Government Licence - Ontario - Metrolinx.",
    );
  });

  it("lists both Metrolinx terms without deciding the licence for a feed", () => {
    const page = buildAttributionPage("en", ["metrolinx"]);
    expect(page.entries[0]?.notices).toContain(METROLINX_AUA_SECTION_3_LEGEND);
    expect(page.entries[0]?.notices).toContain(METROLINX_OGL_LINE);
    expect(page.entries[0]?.notices).toContain(METROLINX_AUA_END_USER_LAWS_EN);
    expect(page.entries[0]?.notices).toContain(METROLINX_AUA_END_USER_LAWS_FR);
  });

  it("keeps source, licence and terms-review provenance in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const page = buildAttributionPage(locale, ["osm", "metrolinx", "ltc"]);
      for (const entry of page.entries) {
        expect(entry.sourceUrl).toMatch(/^https:\/\//u);
        expect(entry.licenceUrl).toMatch(/^https:\/\//u);
        expect(entry.termsReviewedOn).toBe("2026-11-15");
        expect(entry.datasetAsOf).toBe("UNKNOWN");
      }
    }
  });

  it("keeps the LTC source and terms distinct", () => {
    const entry = buildAttributionPage("en", ["ltc"]).entries[0];
    expect(entry?.title).toContain("London Transit Commission");
    expect(entry?.licence).toBe("LTC Open Data Terms of Use");
    expect(entry?.sourceUrl).toContain("londontransit.ca/open-data/");
  });

  it("keeps MiWay excluded from the attribution catalogue", () => {
    const page = buildAttributionPage("en", ["osm", "metrolinx", "ltc"]);
    expect(JSON.stringify(page)).not.toMatch(/miway/iu);
    expect(page.entries.map((entry) => entry.id)).toEqual(["osm", "metrolinx", "ltc"]);
  });

  it("has no prohibited French instruction wording in user-facing explanations", () => {
    const page = buildAttributionPage("fr", ["osm", "metrolinx", "ltc"]);
    expect(JSON.stringify(page.entries.map((entry) => entry.explanation)))
      .not.toMatch(/v[eé]rif|vérifi|vérifiez/iu);
    expect(page.entries[1]?.explanation).toContain("Consulter les conditions");
  });

  it("does not infer permission from the word OpenStreetMap", () => {
    const release = sampleRelease([
      sampleSource({ name: "OpenStreetMap", licenceEvidence: "UNKNOWN" }),
    ]);
    expect(auditRelease(release).blocked).toBe(true);
  });

  it("rejects invented provider IDs in catalogue selection", () => {
    expect(() => buildAttributionPage("en", ["miway" as never])).toThrow();
  });

  it("deduplicates catalogue provider selections", () => {
    const page = buildAttributionPage("fr", ["osm", "osm", "ltc"]);
    expect(page.entries.map((entry) => entry.id)).toEqual(["osm", "ltc"]);
  });
});
