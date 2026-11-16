import { describe, expect, it } from "vitest";
import {
  changedFields,
  changesForSource,
  changesForSurface,
  compareReleaseEvidence,
  distinctAffectedSurfaces,
  listBlockingChanges,
} from "./evidence-changes.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import { auditRelease } from "./evidence-audit.js";

function compareWithSource(overrides: Parameters<typeof sampleSource>[0]) {
  return compareReleaseEvidence(sampleRelease(), sampleRelease([sampleSource(overrides)]));
}

function compareWithSurface(overrides: Parameters<typeof sampleSurface>[0]) {
  return compareReleaseEvidence(sampleRelease(), sampleRelease([sampleSource()], [sampleSurface(overrides)]));
}

describe("release evidence comparison", () => {
  it("reports no changes for equal evidence", () => {
    const result = compareReleaseEvidence(sampleRelease(), sampleRelease());
    expect(result.changes).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("does not mutate the compared releases", () => {
    const before = sampleRelease();
    const after = sampleRelease([sampleSource({ notes: "Fresh note" })]);
    const snapshot = JSON.stringify({ before, after });
    compareReleaseEvidence(before, after);
    expect(JSON.stringify({ before, after })).toBe(snapshot);
  });

  it("identifies newly added sources", () => {
    const after = sampleRelease([
      sampleSource(), sampleSource({ id: "second-source", sourceUrl: "https://example.org/second" }),
    ]);
    const result = compareReleaseEvidence(sampleRelease(), after);
    expect(result.changes.some((item) => item.kind === "source-added" && item.entityId === "second-source"))
      .toBe(true);
  });

  it("identifies removed included sources as blocking changes", () => {
    const result = compareReleaseEvidence(sampleRelease(), sampleRelease([], []));
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "source-removed", severity: "blocking", entityId: "osm-one" }),
    ]));
  });

  it("marks removed held sources as review changes", () => {
    const before = sampleRelease([sampleSource({ state: "held" })], []);
    const result = compareReleaseEvidence(before, sampleRelease([], []));
    expect(result.changes.find((item) => item.kind === "source-removed")?.severity)
      .toBe("review");
  });

  it("identifies newly added publication surfaces", () => {
    const result = compareReleaseEvidence(sampleRelease([], []), sampleRelease([], [
      sampleSurface({ sourceIds: [] }),
    ]));
    expect(result.changes.some((item) => item.kind === "surface-added")).toBe(true);
  });

  it("identifies removed publication surfaces", () => {
    const result = compareReleaseEvidence(sampleRelease(), sampleRelease([sampleSource()], []));
    expect(result.changes.some((item) => item.kind === "surface-removed")).toBe(true);
  });

  it("treats loss of permission as blocking", () => {
    const result = compareWithSource({ redistributionPermission: "UNKNOWN" });
    expect(result.changes.some((item) =>
      item.field === "redistributionPermission" && item.severity === "blocking")).toBe(true);
    expect(result.blocked).toBe(true);
  });

  it("treats an explicit permission denial as blocking", () => {
    expect(compareWithSource({ redistributionPermission: "NO" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "redistributionPermission", severity: "blocking",
      })]));
  });

  it("treats loss of licence evidence as blocking", () => {
    expect(compareWithSource({ licenceEvidence: "UNKNOWN" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "licenceEvidence", severity: "blocking",
      })]));
  });

  it("treats loss of source URL as blocking", () => {
    expect(compareWithSource({ sourceUrl: "UNKNOWN" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "source-origin", severity: "blocking",
      })]));
  });

  it("treats loss of licence URL as blocking", () => {
    expect(compareWithSource({ licenceUrl: "UNKNOWN" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "source-licence", severity: "blocking",
      })]));
  });

  it("records changed licence names", () => {
    expect(compareWithSource({ licenceName: "Different licence" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "licenceName", kind: "source-licence",
      })]));
  });

  it("records changed source families", () => {
    expect(compareWithSource({ family: "other" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "family", kind: "source-metadata",
      })]));
  });

  it("reports changed attribution notices", () => {
    expect(compareWithSource({ attribution: "" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "attribution", kind: "source-notice", severity: "blocking",
      })]));
  });

  it("records a changed dataset date without treating it as proof of freshness", () => {
    const result = compareWithSource({ datasetDate: "2026-01-01" });
    expect(result.changes).toEqual(expect.arrayContaining([expect.objectContaining({
      field: "datasetDate", kind: "source-date", severity: "review",
    })]));
  });

  it("records a changed acquisition date", () => {
    expect(compareWithSource({ acquisitionDate: "2026-02-01" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "acquisitionDate", kind: "source-date",
      })]));
  });

  it("records a changed terms date", () => {
    expect(compareWithSource({ termsReviewedDate: "2026-02-01" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "termsReviewedDate", kind: "source-date",
      })]));
  });

  it("treats source notes as informational", () => {
    expect(compareWithSource({ notes: "New note" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "notes", kind: "source-metadata", severity: "informational",
      })]));
  });

  it("treats source display-name changes as informational", () => {
    expect(compareWithSource({ name: "New title" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "name", severity: "informational",
      })]));
  });

  it("blocks changing an included source to held", () => {
    expect(compareWithSource({ state: "held" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "state", severity: "blocking",
      })]));
  });

  it("blocks changing an included source to excluded", () => {
    expect(compareWithSource({ state: "excluded" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "state", severity: "blocking",
      })]));
  });

  it("identifies changes to linked source IDs", () => {
    expect(compareWithSurface({ sourceIds: [] }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "surface-sources", field: "sourceIds",
      })]));
  });

  it("ignores source ID order for equivalence", () => {
    const before = sampleRelease([
      sampleSource(), sampleSource({ id: "second-source", sourceUrl: "https://example.org/second" }),
    ], [sampleSurface({ sourceIds: ["osm-one", "second-source"] })]);
    const after = sampleRelease(before.sources, [sampleSurface({ sourceIds: ["second-source", "osm-one"] })]);
    expect(compareReleaseEvidence(before, after).changes).toEqual([]);
  });

  it("records surface locale changes", () => {
    expect(compareWithSurface({ locale: "fr" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "surface-locale", field: "locale",
      })]));
  });

  it("records surface mode changes", () => {
    expect(compareWithSurface({ mode: "journey" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "surface-metadata", field: "mode",
      })]));
  });

  it("identifies loss of offline availability", () => {
    expect(compareWithSurface({ offline: "NO" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "surface-offline", severity: "blocking",
      })]));
  });

  it("identifies offline UNKNOWN as a regression from YES", () => {
    expect(compareWithSurface({ offline: "UNKNOWN" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "offline", severity: "blocking",
      })]));
  });

  it("identifies loss of keyboard evidence", () => {
    expect(compareWithSurface({ keyboardAccessible: "NO" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: "surface-accessibility", severity: "blocking",
      })]));
  });

  it("identifies loss of screen reader labels", () => {
    expect(compareWithSurface({ screenReaderLabelled: "UNKNOWN" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "screenReaderLabelled", severity: "blocking",
      })]));
  });

  it("identifies loss of near-map credit", () => {
    expect(compareWithSurface({ creditedNearMap: "NO" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "creditedNearMap", severity: "blocking",
      })]));
  });

  it("identifies target reductions as blocking", () => {
    expect(compareWithSurface({ minimumTargetPx: 43 }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "minimumTargetPx", severity: "blocking",
      })]));
  });

  it("does not treat a larger target as a regression", () => {
    expect(compareWithSurface({ minimumTargetPx: 48 }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "minimumTargetPx", severity: "review",
      })]));
  });

  it("blocks when known target size becomes UNKNOWN", () => {
    expect(compareWithSurface({ minimumTargetPx: "UNKNOWN" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "minimumTargetPx", severity: "blocking",
      })]));
  });

  it("does not invent numeric values for targets previously UNKNOWN", () => {
    const before = sampleRelease([sampleSource()], [sampleSurface({ minimumTargetPx: "UNKNOWN" })]);
    const after = sampleRelease();
    expect(compareReleaseEvidence(before, after).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "minimumTargetPx", severity: "review",
      })]));
  });

  it("records publication date changes without treating them as freshness claims", () => {
    expect(compareWithSurface({ publicationDate: "2026-02-02" }).changes)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        field: "publicationDate", severity: "informational",
      })]));
  });

  it("detects new audit failures independently from field differences", () => {
    const result = compareWithSource({ redistributionPermission: "UNKNOWN" });
    expect(result.newlyBlockingCodes).toContain("REDISTRIBUTION_UNKNOWN");
    expect(result.changes.some((item) => item.kind === "new-finding")).toBe(true);
  });

  it("detects resolved audit failures", () => {
    const before = sampleRelease([sampleSource({ redistributionPermission: "UNKNOWN" })]);
    const result = compareReleaseEvidence(before, sampleRelease());
    expect(result.resolvedBlockingCodes).toContain("REDISTRIBUTION_UNKNOWN");
    expect(result.changes.some((item) => item.kind === "resolved-finding")).toBe(true);
  });

  it("contains both before and after audit results", () => {
    const result = compareWithSource({ licenceEvidence: "NO" });
    expect(result.beforeAudit.blocked).toBe(false);
    expect(result.afterAudit.blocked).toBe(true);
  });

  it("preserves comparison release IDs", () => {
    const before = sampleRelease();
    const after = { ...sampleRelease(), releaseId: "release-two" };
    const result = compareReleaseEvidence(before, after);
    expect(result.beforeReleaseId).toBe("release-one");
    expect(result.afterReleaseId).toBe("release-two");
  });

  it("returns changes affecting a particular source", () => {
    const result = compareWithSource({ notes: "New note" });
    expect(changesForSource(result, "osm-one").length).toBeGreaterThan(0);
    expect(changesForSource(result, "unknown-source")).toEqual([]);
  });

  it("returns changes affecting a particular surface", () => {
    const result = compareWithSurface({ minimumTargetPx: 12 });
    expect(changesForSurface(result, "public-map").length).toBeGreaterThan(0);
  });

  it("links source regressions back to affected surfaces", () => {
    const result = compareWithSource({ sourceUrl: "UNKNOWN" });
    expect(changesForSurface(result, "public-map").some((item) =>
      item.kind === "source-origin")).toBe(true);
  });

  it("returns distinct affected surface IDs", () => {
    const result = compareWithSource({ sourceUrl: "UNKNOWN", licenceEvidence: "UNKNOWN" });
    expect(distinctAffectedSurfaces(result)).toEqual(["public-map"]);
  });

  it("returns distinct changed fields", () => {
    const result = compareWithSource({ sourceUrl: "UNKNOWN", licenceEvidence: "UNKNOWN" });
    expect(changedFields(result, "osm-one")).toContain("sourceUrl");
    expect(changedFields(result, "osm-one")).toContain("licenceEvidence");
  });

  it("lists blocking changes independently from attention items", () => {
    const result = compareWithSource({ name: "New title", licenceEvidence: "UNKNOWN" });
    expect(listBlockingChanges(result).length).toBeGreaterThan(0);
    expect(listBlockingChanges(result).every((item) => item.severity === "blocking")).toBe(true);
  });

  it("does not fabricate findings from a clean release", () => {
    const result = compareReleaseEvidence(sampleRelease(), sampleRelease());
    expect(result.newlyBlockingCodes).toEqual([]);
    expect(result.resolvedBlockingCodes).toEqual([]);
    expect(result.afterAudit).toEqual(auditRelease(sampleRelease()));
  });
});
