import { describe, expect, it } from "vitest";
import { auditManifest, canonicalLocation, MAX_COMPRESSED_BYTES, MAX_TRIP_ROWS } from "./manifest.ts";

const source = {
  sourceId: "fixture-feed",
  sourceName: "Fixture timetable",
  inWebPack: true,
  licence: "Fixture licence",
  licenceUrl: "https://example.invalid/licence",
  retrieved: "2024-02-29",
};

function part(file: string, region = "fixture-region", id = source.sourceId) {
  const calendar = file === "calendar.json.gz";
  return {
    sourceId: id,
    regionId: region,
    kind: calendar ? "calendar" : "trips",
    placement: "git",
    path: region + "/" + id + "/" + file,
    bytes: 432,
    sha256: "1a".repeat(32),
    tripCount: calendar ? 0 : 3,
    feedStart: "20240228",
    feedEnd: "20240301",
    licence: source.licence,
    licenceUrl: source.licenceUrl,
    retrieved: source.retrieved,
  };
}
const calendar = part("calendar.json.gz");
const trips = part("trips-0000.ndjson.gz");
function run(parts: unknown[], sources: unknown[] = [source]) {
  return auditManifest({ version: 1, sources, parts });
}

describe("builder v1 schedule declarations", () => {
  it("orders trips by the numeric shard number and keeps the original manifest positions", () => {
    const last = part("trips-0001.ndjson.gz");
    const input = [last, trips, calendar];
    const result = run(input);
    expect(result.issues).toEqual([]);
    expect(result.groups).toHaveLength(1);
    const [group] = result.groups;
    expect(group?.calendar.index).toBe(2);
    expect(group?.trips.map((row) => row.index)).toEqual([1, 0]);
    expect(group?.provenance).toEqual({
      source: source.sourceId,
      licence: source.licence,
      retrievedOn: "2024-02-29",
      verificationTier: "UNKNOWN",
    });
    expect(result.declaredParts).toBe(3);
    expect(input[0]).toBe(last);
  });

  it("allows the builder to place different shards of one group in different roots", () => {
    const release = {
      ...trips,
      placement: "release",
      assetName: "fixture-feed-schedules-v1-fixture-region-trips-0000.ndjson.gz",
    };
    const result = run([calendar, release]);
    expect(result.issues).toEqual([]);
    expect(result.groups[0]?.trips[0]).toMatchObject({ placement: "release", assetName: release.assetName });
    expect(result.groups[0]?.calendar).not.toHaveProperty("assetName");
  });

  it.each(["metrolinx-go", "metrolinx-up"])("requires the builder's release-only placement for %s", (sourceId) => {
    const row = {
      regionId: "fixture-region", sourceId, kind: "calendar" as const,
      path: "fixture-region/" + sourceId + "/calendar.json.gz",
    };
    expect(canonicalLocation({ ...row, placement: "git" })).toBe(false);
    expect(canonicalLocation({
      ...row, placement: "release", assetName: sourceId + "-schedules-v1-fixture-region-calendar.json.gz",
    })).toBe(true);
  });

  it("accepts the first five-digit shard number and rejects a noncanonical padded alias", () => {
    const location = (sequence: string) => canonicalLocation({
      sourceId: "fixture", regionId: "region", kind: "trips", placement: "git",
      path: "region/fixture/trips-" + sequence + ".ndjson.gz",
    });
    expect(location("9999")).toBe(true);
    expect(location("10000")).toBe(true);
    expect(location("010000")).toBe(false);
    expect(location("-001")).toBe(false);
  });

  it.each([0, 1, 2, 3, 4] as const)("retains explicit verification tier %i", (value) => {
    const result = run([calendar, { ...trips, verificationTier: value }], [{ ...source, verificationTier: value }]);
    expect(result.issues).toEqual([]);
    expect(result.groups[0]?.provenance.verificationTier).toBe(value);
  });

  it("refuses a shard's unsupported promotion of an unknown verification tier", () => {
    const result = run([calendar, { ...trips, verificationTier: 3 }]);
    expect(result.groups).toEqual([]);
    expect(result.issues).toEqual([{ code: "part.provenance", at: "parts[1]", severity: "error" }]);
  });

  it("retains an explicit unknown service boundary without synthesizing one from the retrieval date", () => {
    const result = run([calendar, trips].map((row) => ({ ...row, feedStart: "UNKNOWN" })));
    expect(result.groups[0]).toMatchObject({ feedStart: "UNKNOWN", feedEnd: "20240301" });
    expect(result.issues.map(({ severity }) => severity)).toEqual(["warning", "warning"]);
  });

  it("quarantines a group with unequal feed coverage across its shards", () => {
    const result = run([calendar, { ...trips, feedEnd: "20240229" }]);
    expect(result.issues[0]?.code).toBe("group.coverage");
    expect(result.groups).toEqual([]);
  });

  it.each([
    ["manifest", null], ["parts", { version: 1, parts: {}, sources: [] }],
    ["version", { version: "1", parts: [], sources: [] }], ["sources", { version: 1, parts: [], sources: null }],
  ])("validates the %s field before enumerating declarations", (_name, input) => {
    expect(auditManifest(input).issues).toEqual([{ code: "manifest.shape", at: "manifest", severity: "error" }]);
  });

  it("requires a source registry and identifies an included source with no group", () => {
    expect(run([], []).issues.map((i) => i.code)).toEqual(["manifest.shape"]);
    expect(run([]).issues).toEqual([{ code: "source.empty", at: "sources[0]", severity: "error" }]);
  });

  it("rejects oversized top-level vectors before evaluating their entries", () => {
    const rows: unknown[] = new Array(32_769);
    Object.defineProperty(rows, 0, { get() { throw new Error("oversized vector was read"); } });
    expect(run(rows).issues[0]?.code).toBe("manifest.limit");
    expect(run([], Array.from({ length: 4097 }, () => null)).issues[0]?.code).toBe("manifest.limit");
  });
});

describe("declaration quarantine", () => {
  it.each([
    ["bad compressed size", { bytes: MAX_COMPRESSED_BYTES + 1 }, "part.declaration"],
    ["zero compressed size", { bytes: 0 }, "part.declaration"],
    ["malformed hash", { sha256: "arbitrary" }, "part.declaration"],
    ["unsafe aggregate count", { tripCount: Number.MAX_SAFE_INTEGER }, "part.declaration"],
    ["unreadable declared row count", { tripCount: MAX_TRIP_ROWS + 1 }, "part.declaration"],
    ["fractional count", { tripCount: 2.5 }, "part.declaration"],
    ["unsupported placement", { placement: "remote" }, "part.declaration"],
    ["mislabelled kind", { kind: "unknown" }, "part.declaration"],
    ["unsafe region path", { path: "../fixture-feed/trips-0000.ndjson.gz" }, "part.path"],
    ["alternate zero padding", { path: "fixture-region/fixture-feed/trips-00000.ndjson.gz" }, "part.path"],
    ["unspecified release asset", { placement: "release" }, "part.path"],
    ["git with release asset", { assetName: "calendar.json.gz" }, "part.path"],
    ["foreign licence", { licence: "Other fixture grant" }, "part.provenance"],
    ["foreign URL", { licenceUrl: "https://example.invalid/other" }, "part.provenance"],
    ["altered retrieval date", { retrieved: "2024-03-01" }, "part.provenance"],
    ["invalid day of month", { feedStart: "20240230" }, "part.coverage"],
    ["reversed coverage", { feedEnd: "20230228" }, "part.coverage"],
  ] as const)("withholds the entire affected group for %s", (_name, changes, code) => {
    const unaffected = [part("calendar.json.gz", "other"), part("trips-0000.ndjson.gz", "other")];
    const result = run([calendar, trips, { ...part("trips-0001.ndjson.gz"), ...changes }, ...unaffected]);
    expect(result.groups.map((g) => g.regionId)).toEqual(["other"]);
    expect(result.issues.some((i) => i.code === code)).toBe(true);
  });

  it.each([
    ["group.calendar", [trips]],
    ["group.trips", [calendar]],
    ["group.sequence", [calendar, trips, part("trips-0002.ndjson.gz")]],
  ] as const)("identifies %s when coverage consists of individually valid declarations", (code, parts) => {
    expect(run([...parts]).issues).toEqual([{ code, at: "parts[0]", severity: "error" }]);
  });

  it("quarantines both owners of a case-folded release filename collision", () => {
    const published = {
      ...trips, placement: "release", assetName: "fixture-feed-schedules-v1-fixture-region-trips-0000.ndjson.gz",
    };
    const copied = { ...part("trips-0000.ndjson.gz", "other"), placement: "release", assetName: published.assetName.toUpperCase() };
    const result = run([calendar, published, part("calendar.json.gz", "other"), copied]);
    expect(result.groups).toEqual([]);
    expect(result.issues).toContainEqual({ code: "part.duplicate", at: "parts[3].assetName", severity: "error" });
  });

  it("withholds both copies of a canonical path even when the second entry has a malformed source", () => {
    const result = run([calendar, trips, { ...trips, sourceId: "??", path: trips.path.toUpperCase() }]);
    expect(result.groups).toEqual([]);
    expect(result.issues.map((i) => i.code)).toContain("part.duplicate");
  });

  it("withholds the group named in a unique shard path when the source metadata disagrees", () => {
    const misplaced = { ...part("trips-0001.ndjson.gz"), sourceId: "missing-source" };
    const independent = [part("calendar.json.gz", "other"), part("trips-0000.ndjson.gz", "other")];
    const result = run([calendar, trips, misplaced, ...independent]);
    expect(result.groups.map((group) => group.regionId)).toEqual(["other"]);
    expect(result.issues).toEqual([{ code: "part.source", at: "parts[2].sourceId", severity: "error" }]);
  });

  it("counts all invalid declarations and exposes only controlled issue values", () => {
    const invalid = Array.from({ length: 900 }, (_, i) => ({ sourceId: "unregistered", regionId: "region", path: "private-" + i }));
    const result = run([calendar, trips, ...invalid]);
    expect(result.groups).toHaveLength(1);
    expect(result.issues).toHaveLength(900);
    expect(JSON.stringify(result.issues)).not.toMatch(/private|unregistered/);
  });
});

describe("source declaration gates", () => {
  it("omits an intentionally held source without requiring the missing licence fields", () => {
    const held = { sourceId: "held-fixture", sourceName: "Held fixture", inWebPack: false, heldReason: "Terms unconfirmed" };
    const result = run([calendar, trips], [source, held]);
    expect(result.heldSources).toBe(1);
    expect(result.issues).toEqual([]);
    expect(result.groups.map((g) => g.sourceId)).toEqual([source.sourceId]);
    const misassigned = run([part("calendar.json.gz", "other", held.sourceId)], [held]);
    expect(misassigned.issues.map((i) => i.code)).toEqual(["source.held"]);
  });

  it.each([
    { sourceName: "Fixture MiWaY alias" }, { sourceId: "line-miway-copy" }, { heldReason: "Unconfirmed" },
    { sourceId: "metrolinx" }, { sourceId: "metrolinx-variant" },
  ])("applies the builder's held-source gate even if the manifest requests inclusion", (changes) => {
    const result = run([], [{ ...source, ...changes }]);
    expect(result.heldSources).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toEqual(["source.held"]);
  });

  it.each([
    { licence: " " }, { licenceUrl: "file:///tmp/licence" }, { licenceUrl: "https://fixture@invalid.example/" },
    { retrieved: "2023-02-29" }, { verificationTier: "2" }, { sourceId: "metrolinx-go" },
  ])("rejects malformed or conflicting source provenance", (changes) => {
    const result = run([], [{ ...source, ...changes }]);
    expect(result.issues.map((i) => i.code)).toEqual(["source.provenance"]);
  });

  it("quarantines a duplicated public source ID even when the case variant is malformed", () => {
    const result = run([calendar, trips], [source, { ...source, sourceId: source.sourceId.toUpperCase() }]);
    expect(result.groups).toEqual([]);
    expect(result.issues.map((i) => i.code)).toEqual(["source.duplicate", "part.source", "part.source"]);
  });
});
