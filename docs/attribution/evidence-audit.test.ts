import { describe, expect, it } from "vitest";
import {
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_AUA_SECTION_3_LEGEND,
  METROLINX_OGL_LINE,
} from "./index.js";
import {
  auditRelease,
  canPublishSurface,
  countByCode,
  findingsForSource,
  findingsForSurface,
  summarizeBlockingPaths,
  type AuditCode,
} from "./evidence-audit.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import type { SourceEvidence, SurfaceEvidence } from "./evidence-contract.js";

const AUA_NOTICE = [
  METROLINX_AUA_SECTION_3_LEGEND,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
].join("\n");

function withSource(overrides: Partial<SourceEvidence>) {
  return sampleRelease([sampleSource(overrides)]);
}

function withSurface(overrides: Partial<SurfaceEvidence>) {
  return sampleRelease([sampleSource()], [sampleSurface(overrides)]);
}

function codes(value: ReturnType<typeof auditRelease>): AuditCode[] {
  return value.findings.map((item) => item.code);
}

describe("attribution evidence audit", () => {
  it("does not block a complete OSM source and linked map", () => {
    const result = auditRelease(sampleRelease());
    expect(result.blocked).toBe(false);
    expect(result.blockingCount).toBe(0);
    expect(canPublishSurface(result, "public-map")).toBe(true);
  });

  it("does not invent a dataset date", () => {
    const result = auditRelease(sampleRelease());
    expect(codes(result)).toContain("DATASET_DATE_UNKNOWN");
    expect(result.findings.find((item) => item.code === "DATASET_DATE_UNKNOWN")?.level)
      .toBe("info");
  });

  it("blocks missing source URL", () => {
    const result = auditRelease(withSource({ sourceUrl: "UNKNOWN" }));
    expect(codes(result)).toContain("SOURCE_UNKNOWN");
    expect(result.blocked).toBe(true);
  });

  it("blocks missing licence URL", () => {
    const result = auditRelease(withSource({ licenceUrl: "UNKNOWN" }));
    expect(codes(result)).toContain("LICENCE_URL_UNKNOWN");
  });

  it("blocks unknown licence evidence", () => {
    expect(codes(auditRelease(withSource({ licenceEvidence: "UNKNOWN" }))))
      .toContain("LICENCE_UNKNOWN");
  });

  it("blocks expressly denied licence evidence", () => {
    expect(codes(auditRelease(withSource({ licenceEvidence: "NO" }))))
      .toContain("LICENCE_DENIED");
  });

  it("blocks unknown redistribution permission", () => {
    expect(codes(auditRelease(withSource({ redistributionPermission: "UNKNOWN" }))))
      .toContain("REDISTRIBUTION_UNKNOWN");
  });

  it("blocks expressly denied redistribution permission", () => {
    expect(codes(auditRelease(withSource({ redistributionPermission: "NO" }))))
      .toContain("REDISTRIBUTION_DENIED");
  });

  it("blocks unknown acquisition dates", () => {
    expect(codes(auditRelease(withSource({ acquisitionDate: "UNKNOWN" }))))
      .toContain("ACQUISITION_UNKNOWN");
  });

  it("blocks unknown terms-review dates", () => {
    expect(codes(auditRelease(withSource({ termsReviewedDate: "UNKNOWN" }))))
      .toContain("TERMS_DATE_UNKNOWN");
  });

  it("blocks missing attribution", () => {
    expect(codes(auditRelease(withSource({ attribution: "" }))))
      .toContain("ATTRIBUTION_MISSING");
  });

  it("blocks missing OSM credit independent of licence", () => {
    const result = auditRelease(withSource({ attribution: "ODbL 1.0" }));
    expect(codes(result)).toContain("OSM_CREDIT_MISSING");
    expect(codes(result)).not.toContain("ODBL_MISSING");
  });

  it("blocks missing ODbL licence independent of map credit", () => {
    const result = auditRelease(withSource({ licenceName: "UNKNOWN" }));
    expect(codes(result)).toContain("ODBL_MISSING");
    expect(codes(result)).not.toContain("OSM_CREDIT_MISSING");
  });

  it("blocks unrelated provider notices on OSM evidence", () => {
    const result = auditRelease(withSource({
      attribution: `© OpenStreetMap contributors\n${METROLINX_OGL_LINE}`,
    }));
    expect(codes(result)).toContain("INCOMPATIBLE_NOTICE");
  });

  it("recognises a complete AUA section 3 notice", () => {
    const release = sampleRelease([
      sampleSource({
        family: "metrolinx-aua", licenceName: "Metrolinx GTFS Access and Use Agreement",
        attribution: AUA_NOTICE,
      }),
    ], [sampleSurface({ mode: "journey" })]);
    const result = auditRelease(release);
    expect(result.blocked).toBe(false);
    expect(codes(result)).not.toContain("AUA_LEGEND_MISSING");
    expect(codes(result)).not.toContain("AUA_LAWS_MISSING");
  });

  it("blocks missing AUA section 3 legend", () => {
    const result = auditRelease(withSource({
      family: "metrolinx-aua", attribution:
        `${METROLINX_AUA_END_USER_LAWS_EN}\n${METROLINX_AUA_END_USER_LAWS_FR}`,
    }));
    expect(codes(result)).toContain("AUA_LEGEND_MISSING");
  });

  it("blocks missing English AUA applicable-laws notice", () => {
    const result = auditRelease(withSource({
      family: "metrolinx-aua", attribution:
        `${METROLINX_AUA_SECTION_3_LEGEND}\n${METROLINX_AUA_END_USER_LAWS_FR}`,
    }));
    expect(codes(result)).toContain("AUA_LAWS_MISSING");
  });

  it("blocks missing French AUA applicable-laws notice", () => {
    const result = auditRelease(withSource({
      family: "metrolinx-aua", attribution:
        `${METROLINX_AUA_SECTION_3_LEGEND}\n${METROLINX_AUA_END_USER_LAWS_EN}`,
    }));
    expect(codes(result)).toContain("AUA_LAWS_MISSING");
  });

  it("blocks mixing OGL notice with AUA evidence", () => {
    const result = auditRelease(withSource({
      family: "metrolinx-aua", attribution: `${AUA_NOTICE}\n${METROLINX_OGL_LINE}`,
    }));
    expect(codes(result)).toContain("MIXED_METROLINX_TERMS");
  });

  it("recognises a separate complete OGL notice", () => {
    const result = auditRelease(withSource({
      family: "metrolinx-ogl", licenceName: "Open Government Licence - Ontario - Metrolinx",
      attribution: METROLINX_OGL_LINE,
    }));
    expect(codes(result)).not.toContain("OGL_LINE_MISSING");
    expect(codes(result)).not.toContain("MIXED_METROLINX_TERMS");
  });

  it("blocks missing OGL notice", () => {
    expect(codes(auditRelease(withSource({
      family: "metrolinx-ogl", attribution: "Contains information from Metrolinx",
    })))).toContain("OGL_LINE_MISSING");
  });

  it("blocks mixing AUA legend into OGL evidence", () => {
    expect(codes(auditRelease(withSource({
      family: "metrolinx-ogl", attribution: `${METROLINX_OGL_LINE}\n${METROLINX_AUA_SECTION_3_LEGEND}`,
    })))).toContain("MIXED_METROLINX_TERMS");
  });

  it("accepts LTC credit and explicit terms", () => {
    const result = auditRelease(withSource({
      family: "ltc", licenceName: "LTC Open Data Terms of Use",
      attribution: "Data from London Transit Commission (LTC)",
    }));
    expect(codes(result)).not.toContain("LTC_NOTICE_MISSING");
    expect(codes(result)).not.toContain("LICENCE_UNKNOWN");
  });

  it("blocks missing LTC attribution", () => {
    expect(codes(auditRelease(withSource({
      family: "ltc", licenceName: "LTC Open Data Terms of Use", attribution: "Anonymous public data",
    })))).toContain("LTC_NOTICE_MISSING");
  });

  it("blocks missing LTC terms", () => {
    expect(codes(auditRelease(withSource({
      family: "ltc", licenceName: "UNKNOWN", attribution: "London Transit Commission",
    })))).toContain("LICENCE_UNKNOWN");
  });

  it("blocks other sources with unknown licence names", () => {
    expect(codes(auditRelease(withSource({
      family: "other", licenceName: "UNKNOWN", attribution: "Other data source",
    })))).toContain("LICENCE_UNKNOWN");
  });

  it("does not assert a provider licence merely from its name", () => {
    const result = auditRelease(withSource({
      family: "other", name: "Metrolinx", licenceName: "Other public licence",
      attribution: "Other source",
    }));
    expect(codes(result)).not.toContain("AUA_LEGEND_MISSING");
    expect(codes(result)).not.toContain("OGL_LINE_MISSING");
  });

  it("held sources are exempt from publication evidence checks", () => {
    const result = auditRelease(sampleRelease([
      sampleSource({ state: "held", licenceEvidence: "UNKNOWN" }),
    ], []));
    expect(codes(result)).not.toContain("LICENCE_UNKNOWN");
  });

  it("excluded sources are exempt from publication evidence checks", () => {
    const result = auditRelease(sampleRelease([
      sampleSource({ state: "excluded", redistributionPermission: "NO" }),
    ], []));
    expect(codes(result)).not.toContain("REDISTRIBUTION_DENIED");
  });

  it("blocks a surface referencing held sources", () => {
    const result = auditRelease(withSource({ state: "held" }));
    expect(codes(result)).toContain("SOURCE_HELD");
  });

  it("blocks a surface referencing excluded sources", () => {
    const result = auditRelease(withSource({ state: "excluded" }));
    expect(codes(result)).toContain("SOURCE_EXCLUDED");
  });

  it("blocks a surface referencing a missing source", () => {
    const result = auditRelease(withSurface({ sourceIds: ["missing-source"] }));
    expect(codes(result)).toContain("MISSING_SOURCE");
  });

  it("reports empty source sets on publication surfaces", () => {
    const result = auditRelease(withSurface({ sourceIds: [] }));
    expect(codes(result)).toContain("SURFACE_EMPTY");
  });

  it("reports unused included sources", () => {
    const result = auditRelease(sampleRelease([sampleSource()], []));
    expect(codes(result)).toContain("SOURCE_UNUSED");
  });

  it("reports completely empty inventories", () => {
    const result = auditRelease(sampleRelease([], []));
    expect(codes(result)).toContain("NO_SOURCES");
    expect(codes(result)).toContain("NO_SURFACES");
  });

  it("requires near-map OSM credit", () => {
    expect(codes(auditRelease(withSurface({ creditedNearMap: "NO" }))))
      .toContain("MAP_CREDIT_MISSING");
  });

  it("blocks UNKNOWN near-map credit", () => {
    expect(codes(auditRelease(withSurface({ creditedNearMap: "UNKNOWN" }))))
      .toContain("MAP_CREDIT_UNKNOWN");
  });

  it("does not require near-map credit for a list view", () => {
    expect(codes(auditRelease(withSurface({ mode: "list", creditedNearMap: "UNKNOWN" }))))
      .not.toContain("MAP_CREDIT_UNKNOWN");
  });

  it("does not treat another provider as OSM", () => {
    const result = auditRelease(sampleRelease([
      sampleSource({ family: "other", attribution: "Other provider" }),
    ], [sampleSurface({ creditedNearMap: "UNKNOWN" })]));
    expect(codes(result)).not.toContain("MAP_CREDIT_UNKNOWN");
  });

  it("can disable near-map audit only when explicitly requested", () => {
    const result = auditRelease(withSurface({ creditedNearMap: "NO" }), {
      requireMapCredit: false,
    });
    expect(codes(result)).not.toContain("MAP_CREDIT_MISSING");
  });

  it("blocks unknown keyboard evidence", () => {
    expect(codes(auditRelease(withSurface({ keyboardAccessible: "UNKNOWN" }))))
      .toContain("KEYBOARD_UNKNOWN");
  });

  it("blocks expressly inaccessible keyboard paths", () => {
    expect(codes(auditRelease(withSurface({ keyboardAccessible: "NO" }))))
      .toContain("KEYBOARD_MISSING");
  });

  it("blocks unknown screen reader labels", () => {
    expect(codes(auditRelease(withSurface({ screenReaderLabelled: "UNKNOWN" }))))
      .toContain("SCREEN_READER_UNKNOWN");
  });

  it("blocks expressly missing screen reader labels", () => {
    expect(codes(auditRelease(withSurface({ screenReaderLabelled: "NO" }))))
      .toContain("SCREEN_READER_MISSING");
  });

  it("allows disabling keyboard evidence requirement by option", () => {
    const result = auditRelease(withSurface({ keyboardAccessible: "NO" }), {
      requireKeyboardEvidence: false,
    });
    expect(codes(result)).not.toContain("KEYBOARD_MISSING");
  });

  it("allows disabling screen reader evidence requirement by option", () => {
    const result = auditRelease(withSurface({ screenReaderLabelled: "NO" }), {
      requireScreenReaderEvidence: false,
    });
    expect(codes(result)).not.toContain("SCREEN_READER_MISSING");
  });

  it("blocks 43 px targets", () => {
    const result = auditRelease(withSurface({ minimumTargetPx: 43 }));
    expect(codes(result)).toContain("TARGET_TOO_SMALL");
    expect(result.blocked).toBe(true);
  });

  it("accepts 44 px targets at the exact boundary", () => {
    expect(codes(auditRelease(withSurface({ minimumTargetPx: 44 }))))
      .not.toContain("TARGET_TOO_SMALL");
  });

  it("accepts larger targets", () => {
    expect(codes(auditRelease(withSurface({ minimumTargetPx: 48 }))))
      .not.toContain("TARGET_TOO_SMALL");
  });

  it("blocks unknown target measurements", () => {
    expect(codes(auditRelease(withSurface({ minimumTargetPx: "UNKNOWN" }))))
      .toContain("TARGET_UNKNOWN");
  });

  it("supports a stricter project-specific target boundary", () => {
    expect(codes(auditRelease(withSurface({ minimumTargetPx: 44 }), { minimumTargetPx: 48 })))
      .toContain("TARGET_TOO_SMALL");
  });

  it("rejects impossible configured target boundaries", () => {
    for (const minimumTargetPx of [0, -10, 44.5, Number.NaN]) {
      expect(() => auditRelease(sampleRelease(), { minimumTargetPx })).toThrow(RangeError);
    }
  });

  it("treats offline UNKNOWN as informational by default", () => {
    const result = auditRelease(withSurface({ offline: "UNKNOWN" }));
    expect(result.findings.find((item) => item.code === "OFFLINE_UNKNOWN")?.level)
      .toBe("info");
  });

  it("blocks offline UNKNOWN when offline delivery is required", () => {
    const result = auditRelease(withSurface({ offline: "UNKNOWN" }), { requireOffline: true });
    expect(result.findings.find((item) => item.code === "OFFLINE_UNKNOWN")?.level)
      .toBe("block");
  });

  it("blocks NO offline when offline delivery is required", () => {
    expect(codes(auditRelease(withSurface({ offline: "NO" }), { requireOffline: true })))
      .toContain("OFFLINE_DENIED");
  });

  it("does not block offline NO when delivery is not a release requirement", () => {
    expect(codes(auditRelease(withSurface({ offline: "NO" }))))
      .not.toContain("OFFLINE_DENIED");
  });

  it("does not infer today's date", () => {
    const result = auditRelease(withSource({ acquisitionDate: "9999-12-31" }));
    expect(codes(result)).not.toContain("FUTURE_DATE");
  });

  it("blocks dates beyond a supplied reference date", () => {
    const result = auditRelease(withSource({ acquisitionDate: "2027-01-01" }), {
      today: "2026-11-16",
    });
    expect(codes(result)).toContain("FUTURE_DATE");
  });

  it("rejects malformed reference dates", () => {
    expect(() => auditRelease(sampleRelease(), { today: "tomorrow" })).toThrow(RangeError);
  });

  it("warns about dataset date after acquisition", () => {
    expect(codes(auditRelease(withSource({
      datasetDate: "2026-02-01", acquisitionDate: "2026-01-04",
    })))).toContain("DATE_ORDER");
  });

  it("does not flag unknown dates as invented ordering errors", () => {
    expect(codes(auditRelease(withSource({ datasetDate: "UNKNOWN" }))))
      .not.toContain("DATE_ORDER");
  });

  it("tracks UNKNOWN publication dates without asserting freshness", () => {
    const result = auditRelease(withSurface({ publicationDate: "UNKNOWN" }));
    expect(codes(result)).toContain("SURFACE_DATE_UNKNOWN");
    expect(result.findings.find((item) => item.code === "SURFACE_DATE_UNKNOWN")?.level)
      .toBe("info");
  });

  it("reports duplicate included source provenance", () => {
    const result = auditRelease(sampleRelease([
      sampleSource(), sampleSource({ id: "osm-two" }),
    ]));
    expect(codes(result)).toContain("DUPLICATE_CONTENT");
  });

  it("does not flag different licences as duplicate content", () => {
    const result = auditRelease(sampleRelease([
      sampleSource(), sampleSource({ id: "osm-two", licenceUrl: "https://example.org/licence" }),
    ]));
    expect(codes(result)).not.toContain("DUPLICATE_CONTENT");
  });

  it("does not count held sources in duplicate detection", () => {
    const result = auditRelease(sampleRelease([
      sampleSource(), sampleSource({ id: "osm-two", state: "held" }),
    ]));
    expect(codes(result)).not.toContain("DUPLICATE_CONTENT");
  });

  it("counts findings by severity consistently", () => {
    const result = auditRelease(withSource({ sourceUrl: "UNKNOWN" }));
    expect(result.findings.length).toBe(result.blockingCount + result.attentionCount + result.informationCount);
  });

  it("sorts findings deterministically", () => {
    const result = auditRelease(withSource({ licenceEvidence: "NO", sourceUrl: "UNKNOWN" }));
    expect(result.findings.map((item) => item.path))
      .toEqual([...result.findings.map((item) => item.path)].sort());
  });

  it("never mutates the audited release", () => {
    const release = sampleRelease();
    const snapshot = JSON.stringify(release);
    auditRelease(release);
    expect(JSON.stringify(release)).toBe(snapshot);
  });

  it("retains the release ID and source count", () => {
    const result = auditRelease(sampleRelease());
    expect(result.releaseId).toBe("release-one");
    expect(result.sourceCount).toBe(1);
    expect(result.surfaceCount).toBe(1);
  });

  it("filters findings by source", () => {
    const result = auditRelease(withSource({ sourceUrl: "UNKNOWN" }));
    expect(findingsForSource(result, "osm-one").map((item) => item.code))
      .toContain("SOURCE_UNKNOWN");
    expect(findingsForSource(result, "missing")).toEqual([]);
  });

  it("filters findings by surface", () => {
    const result = auditRelease(withSurface({ minimumTargetPx: 12 }));
    expect(findingsForSurface(result, "public-map").map((item) => item.code))
      .toContain("TARGET_TOO_SMALL");
  });

  it("returns a stable code-frequency index", () => {
    const result = auditRelease(withSurface({ minimumTargetPx: 12 }));
    expect(countByCode(result).get("TARGET_TOO_SMALL")).toBe(1);
    expect(countByCode(result).get("MISSING_SOURCE")).toBeUndefined();
  });

  it("returns unique blocking paths", () => {
    const result = auditRelease(withSource({ attribution: "" }));
    const paths = summarizeBlockingPaths(result);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("sources.osm-one.attribution");
  });

  it("blocks publication for a surface with a failing source", () => {
    const result = auditRelease(withSource({ licenceEvidence: "UNKNOWN" }));
    expect(canPublishSurface(result, "public-map")).toBe(false);
  });

  it("blocks publication for a surface with failing accessibility evidence", () => {
    const result = auditRelease(withSurface({ keyboardAccessible: "NO" }));
    expect(canPublishSurface(result, "public-map")).toBe(false);
  });

  it("does not grant publication for an unrecorded surface", () => {
    expect(canPublishSurface(auditRelease(sampleRelease()), "unlisted")).toBe(false);
  });

  it("does not block an unrelated surface on a different source failure", () => {
    const release = sampleRelease([
      sampleSource({ id: "broken", licenceEvidence: "UNKNOWN" }),
      sampleSource({ id: "safe", sourceUrl: "https://example.org/safe" }),
    ], [sampleSurface({ sourceIds: ["safe"] })]);
    const result = auditRelease(release);
    expect(canPublishSurface(result, "public-map")).toBe(true);
  });
});
