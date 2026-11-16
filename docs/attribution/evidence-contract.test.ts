import { describe, expect, it } from "vitest";
import {
  canonicalReleaseJson,
  createEmptyRelease,
  EvidenceInputError,
  parseReleaseEvidence,
  parseReleaseJson,
  parseSourceEvidence,
  parseSurfaceEvidence,
  removeSource,
  removeSurface,
  sourceUsage,
  unknownDates,
  unusedSources,
  updateSource,
  updateSurface,
} from "./evidence-contract.js";
import { sampleSource, sampleSurface, sampleRelease } from "./evidence-fixtures.js";

describe("strict release evidence parsing", () => {
  it("round trips valid records without modification", () => {
    const original = sampleRelease();
    const parsed = parseReleaseEvidence(original);
    expect(parsed).toEqual(original);
    expect(parseReleaseJson(JSON.stringify(parsed))).toEqual(original);
  });

  it("preserves UNKNOWN rather than inferring a date", () => {
    const result = parseReleaseEvidence(sampleRelease());
    expect(result.sources[0]?.datasetDate).toBe("UNKNOWN");
  });

  it("preserves UNKNOWN permission instead of assuming consent", () => {
    const release = sampleRelease([sampleSource({ redistributionPermission: "UNKNOWN" })]);
    expect(parseReleaseEvidence(release).sources[0]?.redistributionPermission).toBe("UNKNOWN");
  });

  it("preserves NO rather than rewriting it as UNKNOWN", () => {
    const release = sampleRelease([sampleSource({ redistributionPermission: "NO" })]);
    expect(parseReleaseEvidence(release).sources[0]?.redistributionPermission).toBe("NO");
  });

  it("accepts a release with no source records without inventing a provider", () => {
    expect(createEmptyRelease("first-pass").sources).toEqual([]);
    expect(createEmptyRelease("first-pass").surfaces).toEqual([]);
  });

  it("rejects non-record releases", () => {
    for (const value of [null, false, [], "text", 42]) {
      expect(() => parseReleaseEvidence(value)).toThrow(EvidenceInputError);
    }
  });

  it("rejects missing top-level fields", () => {
    const base = sampleRelease();
    for (const key of ["schema", "releaseId", "sources", "surfaces"] as const) {
      const record = { ...base } as Record<string, unknown>;
      delete record[key];
      expect(() => parseReleaseEvidence(record)).toThrow(/Missing field/);
    }
  });

  it("rejects unknown top-level fields", () => {
    expect(() => parseReleaseEvidence({ ...sampleRelease(), extra: "x" }))
      .toThrow(/Unknown field/);
  });

  it("rejects unsupported schema versions", () => {
    expect(() => parseReleaseEvidence({ ...sampleRelease(), schema: "attribution-evidence/2" }))
      .toThrow(/Unsupported schema/);
  });

  it("rejects source and surface arrays larger than 512 entries", () => {
    const source = sampleSource();
    const surface = sampleSurface();
    expect(() => parseReleaseEvidence({ ...sampleRelease(), sources: Array(513).fill(source) }))
      .toThrow(/up to 512/);
    expect(() => parseReleaseEvidence({ ...sampleRelease(), surfaces: Array(513).fill(surface) }))
      .toThrow(/up to 512/);
  });

  it("rejects non-array source and surface properties", () => {
    expect(() => parseReleaseEvidence({ ...sampleRelease(), sources: {} }))
      .toThrow(EvidenceInputError);
    expect(() => parseReleaseEvidence({ ...sampleRelease(), surfaces: "none" }))
      .toThrow(EvidenceInputError);
  });

  it("rejects duplicate source IDs even when values differ", () => {
    expect(() => parseReleaseEvidence(sampleRelease([
      sampleSource(), sampleSource({ name: "Other map" }),
    ]))).toThrow(/Duplicate ID/);
  });

  it("rejects duplicate surface IDs even when values differ", () => {
    expect(() => parseReleaseEvidence(sampleRelease([sampleSource()], [
      sampleSurface(), sampleSurface({ name: "Other map" }),
    ]))).toThrow(/Duplicate ID/);
  });

  it("does not resolve missing source references during structural parsing", () => {
    const release = sampleRelease([sampleSource()], [sampleSurface({ sourceIds: ["missing"] })]);
    expect(parseReleaseEvidence(release).surfaces[0]?.sourceIds).toEqual(["missing"]);
  });

  it("rejects duplicate source IDs linked to the same surface", () => {
    expect(() => parseSurfaceEvidence(sampleSurface({ sourceIds: ["osm-one", "osm-one"] })))
      .toThrow(/Duplicate ID/);
  });

  it("rejects too many source references on one surface", () => {
    const ids = Array.from({ length: 129 }, (_, i) => `source-${i}`);
    expect(() => parseSurfaceEvidence(sampleSurface({ sourceIds: ids })))
      .toThrow(/bounded list/);
  });

  it("rejects invalid JSON without showing raw parser text", () => {
    expect(() => parseReleaseJson("{"))
      .toThrow(/Invalid JSON/);
  });

  it("rejects oversized JSON before parsing", () => {
    expect(() => parseReleaseJson(" ".repeat(2_097_153)))
      .toThrow(/2 MiB/);
  });

  it("counts UTF-8 bytes, not only JavaScript code units", () => {
    expect(() => parseReleaseJson("é".repeat(1_048_577)))
      .toThrow(/2 MiB/);
  });

  it("rejects non-string JSON input", () => {
    expect(() => parseReleaseJson(11 as unknown as string)).toThrow(EvidenceInputError);
  });

  it("rejects control characters in user-provided text", () => {
    for (const value of ["Bad\u0000", "Bad\u001b", "Bad\u007f"]) {
      expect(() => parseSourceEvidence(sampleSource({ name: value }))).toThrow(/Control character/);
    }
  });

  it("allows printable Unicode and Canadian French apostrophes", () => {
    const source = sampleSource({ name: "Données d’Ontario", notes: "« Exemple »" });
    expect(parseSourceEvidence(source).name).toBe("Données d’Ontario");
  });

  it("rejects non-NFC text rather than changing its byte representation", () => {
    expect(() => parseSourceEvidence(sampleSource({ name: "Cafe\u0301" })))
      .toThrow(/NFC/);
  });

  it("rejects blank required source names", () => {
    expect(() => parseSourceEvidence(sampleSource({ name: "  " }))).toThrow(/empty/);
  });

  it("accepts blank optional source notes", () => {
    expect(parseSourceEvidence(sampleSource({ notes: "" })).notes).toBe("");
  });

  it("rejects overlong notes", () => {
    expect(() => parseSourceEvidence(sampleSource({ notes: "x".repeat(2001) })))
      .toThrow(/Too long/);
  });

  it("rejects overlong source names", () => {
    expect(() => parseSourceEvidence(sampleSource({ name: "x".repeat(161) })))
      .toThrow(/Too long/);
  });

  it("rejects overlong notices", () => {
    expect(() => parseSourceEvidence(sampleSource({ attribution: "x".repeat(4001) })))
      .toThrow(/Too long/);
  });

  it("rejects overlong IDs", () => {
    expect(() => parseSourceEvidence(sampleSource({ id: "a".repeat(65) })))
      .toThrow(/Too long/);
  });

  it("accepts lowercase hyphenated IDs", () => {
    for (const id of ["a", "a1", "source-22", "a-b-c", "feed2026"]) {
      expect(parseSourceEvidence(sampleSource({ id })).id).toBe(id);
    }
  });

  it("rejects ambiguous IDs", () => {
    for (const id of ["", "A", "a_1", "a--b", "a-", "-a", "1a", "a b", "a/b"]) {
      expect(() => parseSourceEvidence(sampleSource({ id }))).toThrow(EvidenceInputError);
    }
  });

  it("rejects extra source properties", () => {
    expect(() => parseSourceEvidence({ ...sampleSource(), invented: true }))
      .toThrow(/Unknown field/);
  });

  it("rejects extra surface properties", () => {
    expect(() => parseSurfaceEvidence({ ...sampleSurface(), invented: true }))
      .toThrow(/Unknown field/);
  });

  it("rejects missing source properties one at a time", () => {
    for (const key of Object.keys(sampleSource())) {
      const value: Record<string, unknown> = { ...sampleSource() };
      delete value[key];
      expect(() => parseSourceEvidence(value)).toThrow(/Missing field/);
    }
  });

  it("rejects missing surface properties one at a time", () => {
    for (const key of Object.keys(sampleSurface())) {
      const value: Record<string, unknown> = { ...sampleSurface() };
      delete value[key];
      expect(() => parseSurfaceEvidence(value)).toThrow(/Missing field/);
    }
  });

  it("requires an explicit source family", () => {
    for (const family of ["metrolinx", "miway", "", "OSM"]) {
      expect(() => parseSourceEvidence({ ...sampleSource(), family })).toThrow(EvidenceInputError);
    }
  });

  it("distinguishes Metrolinx AUA from OGL", () => {
    for (const family of ["metrolinx-aua", "metrolinx-ogl"] as const) {
      expect(parseSourceEvidence(sampleSource({ family })).family).toBe(family);
    }
  });

  it("does not infer source family from its name", () => {
    const result = parseSourceEvidence(sampleSource({ family: "other", name: "Metrolinx" }));
    expect(result.family).toBe("other");
  });

  it("accepts all explicit evidence states", () => {
    for (const state of ["YES", "NO", "UNKNOWN"] as const) {
      expect(parseSourceEvidence(sampleSource({ licenceEvidence: state })).licenceEvidence).toBe(state);
      expect(parseSurfaceEvidence(sampleSurface({ offline: state })).offline).toBe(state);
    }
  });

  it("rejects lowercase evidence states", () => {
    for (const state of ["yes", "no", "unknown", true, null]) {
      expect(() => parseSourceEvidence({ ...sampleSource(), licenceEvidence: state }))
        .toThrow(EvidenceInputError);
    }
  });

  it("accepts all supported publication states", () => {
    for (const state of ["included", "held", "excluded"] as const) {
      expect(parseSourceEvidence(sampleSource({ state })).state).toBe(state);
    }
  });

  it("rejects unrecognised publication states", () => {
    for (const state of ["active", "pending", "published", "unknown"]) {
      expect(() => parseSourceEvidence({ ...sampleSource(), state })).toThrow(EvidenceInputError);
    }
  });

  it("accepts supported display modes", () => {
    for (const mode of ["map", "journey", "list", "download", "other"] as const) {
      expect(parseSurfaceEvidence(sampleSurface({ mode })).mode).toBe(mode);
    }
  });

  it("rejects unrecognised display modes", () => {
    expect(() => parseSurfaceEvidence({ ...sampleSurface(), mode: "live-map" }))
      .toThrow(EvidenceInputError);
  });

  it("accepts both interface locales", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(parseSurfaceEvidence(sampleSurface({ locale })).locale).toBe(locale);
    }
  });

  it("rejects an invented locale", () => {
    expect(() => parseSurfaceEvidence({ ...sampleSurface(), locale: "es" }))
      .toThrow(EvidenceInputError);
  });

  it("requires HTTPS for a known source", () => {
    for (const sourceUrl of [
      "http://example.org/data", "ftp://example.org/data", "file:///tmp/a",
      "javascript:alert(1)", "data:text/html,abc", "//example.org/data",
    ]) {
      expect(() => parseSourceEvidence(sampleSource({ sourceUrl }))).toThrow(EvidenceInputError);
    }
  });

  it("rejects credentials in external URLs", () => {
    expect(() => parseSourceEvidence(sampleSource({ sourceUrl: "https://john:secret@example.org/feed" })))
      .toThrow(EvidenceInputError);
  });

  it("rejects URL fragment identifiers", () => {
    expect(() => parseSourceEvidence(sampleSource({ licenceUrl: "https://example.org/license#section" })))
      .toThrow(EvidenceInputError);
  });

  it("rejects loopback or local destinations", () => {
    for (const sourceUrl of [
      "https://localhost/", "https://dev.localhost/", "https://127.0.0.1/",
      "https://10.10.10.10/", "https://192.168.1.1/", "https://172.16.2.3/",
      "https://169.254.1.1/", "https://printer.local/", "https://[::1]/",
    ]) {
      expect(() => parseSourceEvidence(sampleSource({ sourceUrl }))).toThrow(EvidenceInputError);
    }
  });

  it("does not require a URL when the value is explicitly UNKNOWN", () => {
    expect(parseSourceEvidence(sampleSource({ sourceUrl: "UNKNOWN" })).sourceUrl).toBe("UNKNOWN");
    expect(parseSourceEvidence(sampleSource({ licenceUrl: "UNKNOWN" })).licenceUrl).toBe("UNKNOWN");
  });

  it("does not coerce malformed URLs into UNKNOWN", () => {
    expect(() => parseSourceEvidence(sampleSource({ sourceUrl: "not a url" })))
      .toThrow(EvidenceInputError);
  });

  it("accepts leap day in a leap year", () => {
    expect(parseSourceEvidence(sampleSource({ datasetDate: "2024-02-29" })).datasetDate)
      .toBe("2024-02-29");
  });

  it("rejects leap day in a non-leap year", () => {
    expect(() => parseSourceEvidence(sampleSource({ datasetDate: "2025-02-29" })))
      .toThrow(/calendar date/);
  });

  it("rejects invalid months and days", () => {
    for (const datasetDate of [
      "2026-00-01", "2026-13-01", "2026-04-31", "2026-01-00", "2026-11-31",
      "2026-02-30", "2026-06-31", "2026-12-32",
    ]) {
      expect(() => parseSourceEvidence(sampleSource({ datasetDate })))
        .toThrow(EvidenceInputError);
    }
  });

  it("rejects an invalid date format", () => {
    for (const datasetDate of ["2026-1-1", "01/01/2026", "2026-01-01T00:00:00Z", "yesterday"]) {
      expect(() => parseSourceEvidence(sampleSource({ datasetDate })))
        .toThrow(EvidenceInputError);
    }
  });

  it("accepts dates near calendar boundaries", () => {
    for (const date of ["1900-01-01", "2000-02-29", "2026-12-31", "9999-12-31"]) {
      expect(parseSourceEvidence(sampleSource({ datasetDate: date })).datasetDate).toBe(date);
    }
  });

  it("rejects dates before 1900", () => {
    expect(() => parseSourceEvidence(sampleSource({ datasetDate: "1899-12-31" })))
      .toThrow(EvidenceInputError);
  });

  it("accepts integer target dimensions within range", () => {
    for (const value of [0, 1, 24, 44, 48, 1000]) {
      expect(parseSurfaceEvidence(sampleSurface({ minimumTargetPx: value })).minimumTargetPx)
        .toBe(value);
    }
  });

  it("rejects fractional or impossible target dimensions", () => {
    for (const minimumTargetPx of [-1, 44.5, 1001, Number.NaN, Infinity, null, "44"]) {
      expect(() => parseSurfaceEvidence({ ...sampleSurface(), minimumTargetPx }))
        .toThrow(EvidenceInputError);
    }
  });

  it("preserves UNKNOWN target dimensions", () => {
    expect(parseSurfaceEvidence(sampleSurface({ minimumTargetPx: "UNKNOWN" })).minimumTargetPx)
      .toBe("UNKNOWN");
  });

  it("does not drop omitted surfaces from a valid release", () => {
    const release = sampleRelease([sampleSource()], []);
    expect(parseReleaseEvidence(release).surfaces).toEqual([]);
  });
});

describe("release editing and stable serialization", () => {
  it("sorts source IDs in canonical JSON", () => {
    const release = sampleRelease([
      sampleSource({ id: "z-source" }), sampleSource({ id: "a-source" }),
    ], []);
    const json = canonicalReleaseJson(release);
    expect(json.indexOf('"a-source"')).toBeLessThan(json.indexOf('"z-source"'));
  });

  it("sorts surface IDs in canonical JSON", () => {
    const release = sampleRelease([], [
      sampleSurface({ id: "z-map", sourceIds: [] }),
      sampleSurface({ id: "a-map", sourceIds: [] }),
    ]);
    const json = canonicalReleaseJson(release);
    expect(json.indexOf('"a-map"')).toBeLessThan(json.indexOf('"z-map"'));
  });

  it("sorts source references within a surface", () => {
    const release = sampleRelease([], [sampleSurface({ sourceIds: ["z-source", "a-source"] })]);
    expect(parseReleaseJson(canonicalReleaseJson(release)).surfaces[0]?.sourceIds)
      .toEqual(["a-source", "z-source"]);
  });

  it("canonical output ends in one newline", () => {
    expect(canonicalReleaseJson(sampleRelease()).endsWith("\n")).toBe(true);
    expect(canonicalReleaseJson(sampleRelease()).endsWith("\n\n")).toBe(false);
  });

  it("canonical output round trips", () => {
    const original = sampleRelease();
    expect(parseReleaseJson(canonicalReleaseJson(original))).toEqual(original);
  });

  it("updating a source replaces rather than duplicates it", () => {
    const updated = updateSource(sampleRelease(), sampleSource({ notes: "Reviewed locally" }));
    expect(updated.sources).toHaveLength(1);
    expect(updated.sources[0]?.notes).toBe("Reviewed locally");
  });

  it("adding a source preserves existing sources", () => {
    const updated = updateSource(sampleRelease(), sampleSource({ id: "osm-two" }));
    expect(updated.sources.map((source) => source.id)).toEqual(["osm-one", "osm-two"]);
  });

  it("updating a surface replaces rather than duplicates it", () => {
    const updated = updateSurface(sampleRelease(), sampleSurface({ name: "New name" }));
    expect(updated.surfaces).toHaveLength(1);
    expect(updated.surfaces[0]?.name).toBe("New name");
  });

  it("adding a surface preserves the original", () => {
    const updated = updateSurface(sampleRelease(), sampleSurface({ id: "second-map" }));
    expect(updated.surfaces.map((surface) => surface.id)).toEqual(["public-map", "second-map"]);
  });

  it("removing a source leaves references visible for the audit", () => {
    const updated = removeSource(sampleRelease(), "osm-one");
    expect(updated.sources).toHaveLength(0);
    expect(updated.surfaces[0]?.sourceIds).toEqual(["osm-one"]);
  });

  it("removing a surface does not delete source evidence", () => {
    const updated = removeSurface(sampleRelease(), "public-map");
    expect(updated.surfaces).toHaveLength(0);
    expect(updated.sources).toHaveLength(1);
  });

  it("removing a missing source is idempotent", () => {
    expect(removeSource(sampleRelease(), "missing")).toEqual(sampleRelease());
  });

  it("removing a missing surface is idempotent", () => {
    expect(removeSurface(sampleRelease(), "missing")).toEqual(sampleRelease());
  });

  it("finds all surfaces using a source", () => {
    const release = sampleRelease([sampleSource()], [
      sampleSurface(), sampleSurface({ id: "second-map" }),
      sampleSurface({ id: "third-map", sourceIds: [] }),
    ]);
    expect(sourceUsage(release, "osm-one")).toEqual(["public-map", "second-map"]);
  });

  it("reports unused sources without dropping them", () => {
    const release = sampleRelease([
      sampleSource(), sampleSource({ id: "second-source" }),
    ]);
    expect(unusedSources(release)).toEqual(["second-source"]);
  });

  it("reports unknown dataset dates by source ID", () => {
    const release = sampleRelease([
      sampleSource(), sampleSource({ id: "second-source", datasetDate: "2026-01-01" }),
    ]);
    expect(unknownDates(release)).toEqual(["osm-one"]);
  });

  it("does not mutate the original release during updates", () => {
    const original = sampleRelease();
    updateSource(original, sampleSource({ id: "other-source" }));
    updateSurface(original, sampleSurface({ id: "other-map" }));
    expect(original.sources).toHaveLength(1);
    expect(original.surfaces).toHaveLength(1);
  });

  it("rejects invalid updated sources instead of storing them", () => {
    expect(() => updateSource(sampleRelease(), { ...sampleSource(), sourceUrl: "file:///x" }))
      .toThrow(EvidenceInputError);
  });

  it("rejects invalid updated surfaces instead of storing them", () => {
    expect(() => updateSurface(sampleRelease(), { ...sampleSurface(), minimumTargetPx: -5 }))
      .toThrow(EvidenceInputError);
  });
});
