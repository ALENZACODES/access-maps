import { describe, expect, it } from "vitest";
import { foldName, metresBetween, recordSource, runAudit } from "../src/audit.js";
import { renderAudit } from "../src/report.js";
import { field, record, tempDir, washroom, writeNdjson } from "./helpers.js";

const DATE = "2026-11-14";

function many(prefix: string, count: number, extra: (index: number) => Record<string, ReturnType<typeof field>> = () => ({})) {
  return Array.from({ length: count }, (_, index) =>
    washroom(`${prefix}:${index}`, {
      lat: field(43 + index * 0.01, { source_id: prefix }),
      lon: field(-79 - index * 0.01, { source_id: prefix }),
      ...extra(index),
    }),
  );
}

describe("independent counts", () => {
  it("counts pieces, UNKNOWN gaps, and derived values the same way as the counts report", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "a.ndjson", [
      record("src-a:1", "venue", {
        name: field("Synthetic A", { source_id: "src-a" }),
        wheelchair: field("UNKNOWN", { source_id: "src-a" }),
        lat: field(43.5, { source_id: "src-a", derived: true }),
      }),
    ]);
    const report = await runAudit({ files: [{ path, label: "a.ndjson" }] }, { auditDate: DATE });
    expect(report.files[0]).toMatchObject({ records: 1, pieces: 1, gaps: 1, derivedExcluded: 1 });
    expect(report.totals.byTranche.venue).toEqual({ records: 1, pieces: 1, gaps: 1, derivedExcluded: 1 });
    expect(report.totals.bySource["src-a"]?.records).toBe(1);
  });

  it("reads gzip files and reconciles against a counts report, naming each mismatch", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "w.ndjson.gz", many("src-w", 3), true);
    const report = await runAudit(
      { files: [{ path, label: "data/washrooms/src-w/w.ndjson.gz" }], reported: {
        records: 3,
        pieces: 9,
        gaps: 7,
        by_tranche: { washroom: { records: 3 }, venue: { records: 5 } },
        by_source: { "src-w": { records: 3, pieces: 9 } },
        files: [{ file: "data/washrooms/src-w/w.ndjson.gz", records: 4 }],
      } },
      { auditDate: DATE },
    );
    const byKey = Object.fromEntries(report.reconciliation.map((row) => [row.key, row]));
    expect(byKey.records?.matches).toBe(true);
    expect(byKey.pieces?.matches).toBe(true);
    expect(byKey.gaps).toMatchObject({ counted: 6, reported: 7, matches: false });
    expect(byKey["by_tranche.venue.records"]).toMatchObject({ counted: 0, reported: 5, matches: false });
    expect(byKey["by_source.src-w.pieces"]?.matches).toBe(true);
    expect(byKey["files.data/washrooms/src-w/w.ndjson.gz.records"]).toMatchObject({ counted: 3, reported: 4, matches: false });
  });

  it("lists a tranche the report leaves out as unreported", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "w.ndjson", many("src-w", 2));
    const report = await runAudit({ files: [{ path }], reported: { by_tranche: { venue: { records: 0 } } } }, { auditDate: DATE });
    expect(report.reconciliation.find((row) => row.key === "by_tranche.washroom.records")).toMatchObject({ reported: null, matches: false });
  });
});

describe("sample", () => {
  it("takes twenty records per file and gives the same sample for the same seed", async () => {
    const dir = tempDir();
    const big = writeNdjson(dir, "big.ndjson", many("src-big", 120));
    const small = writeNdjson(dir, "small.ndjson", many("src-small", 7));
    const files = [{ path: big, label: "big" }, { path: small, label: "small" }];
    const first = await runAudit({ files }, { auditDate: DATE, seed: "one" });
    const again = await runAudit({ files }, { auditDate: DATE, seed: "one" });
    const other = await runAudit({ files }, { auditDate: DATE, seed: "two" });
    expect(first.sample.filter((item) => item.file === "big")).toHaveLength(20);
    expect(first.sample.filter((item) => item.file === "small")).toHaveLength(7);
    expect(again.sample.map((item) => item.recordId)).toEqual(first.sample.map((item) => item.recordId));
    expect(other.sample.map((item) => item.recordId)).not.toEqual(first.sample.map((item) => item.recordId));
    const lines = first.sample.filter((item) => item.file === "big").map((item) => item.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it("shows only populated fields for comparison and keeps the UNKNOWN count", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "one.ndjson", [washroom("src-one:1")]);
    const report = await runAudit({ files: [{ path }] }, { auditDate: DATE });
    const sampled = report.sample[0]!;
    expect(sampled.populated.map((item) => item.field)).toEqual(["name", "lat", "lon"]);
    expect(sampled.unknownCount).toBe(2);
    expect(sampled.populated[0]).toMatchObject({ licence: "SYNTHETIC-TEST-ONLY", retrievedAt: "2026-11-13", tier: "0" });
  });

  it("keeps cross-check entries for sampled records and lists the rest as pending", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "two.ndjson", [washroom("src-two:1"), washroom("src-two:2", { lat: field(44, { source_id: "src-two" }) })]);
    const report = await runAudit(
      {
        files: [{ path }],
        crossCheck: [
          { recordId: "src-two:1", field: "name", secondSource: "Synthetic second source", secondValue: "Same name", result: "agrees", checkedOn: DATE },
          { recordId: "not-sampled", field: "name", secondSource: "x", secondValue: "y", result: "disagrees", checkedOn: DATE },
        ],
      },
      { auditDate: DATE },
    );
    expect(report.crossCheck).toHaveLength(1);
    expect(report.crossCheckPending).toEqual(["src-two:2"]);
  });
});

describe("defect rules", () => {
  async function rulesFor(records: unknown[], overrides = {}) {
    const dir = tempDir();
    const path = writeNdjson(dir, "x.ndjson", records);
    const report = await runAudit({ files: [{ path, label: "x.ndjson" }] }, { auditDate: DATE, ...overrides });
    return report;
  }

  it("treats UNKNOWN as an honest gap and a blank as a defect", async () => {
    const clean = await rulesFor([washroom("src:1")]);
    expect(clean.defectCounts).toEqual({});
    const blank = await rulesFor([washroom("src:1", { wheelchair: field("", { source_id: "src" }) })]);
    expect(blank.defectCounts["blank-value"]).toBe(1);
    expect(blank.defects[0]).toMatchObject({ severity: "serious", field: "wheelchair", line: 1, recordId: "src:1" });
  });

  it("blocks missing provenance and any tier above the prototype tiers", async () => {
    const report = await rulesFor([
      washroom("src:1", {
        wheelchair: field("yes", { source_id: "src", licence: "" }),
        door_width: field(0.9, { source_id: "src", tier: 2 }),
        name: field("Synthetic", { source_id: "src", tier: "VERIFIED" }),
        lat: field(43.6, { source_id: "", retrieved_at: undefined }),
        lon: field(-79.4, { source_id: "src", tier: "GOLD" }),
      }),
    ]);
    expect(report.defectCounts).toMatchObject({
      "missing-licence": 1,
      "tier-above-prototype": 2,
      "missing-source": 1,
      "missing-date": 1,
      "missing-tier": 1,
    });
    expect(report.defects.every((defect) => defect.severity === "blocker")).toBe(true);
  });

  it("accepts the prototype labels as tiers", async () => {
    const report = await rulesFor([
      washroom("src:1", {
        wheelchair: field("yes", { source_id: "src", tier: "SEEDED-OPEN-DATA" }),
        name: field("Synthetic", { source_id: "src", tier: "PROTOTYPE-UNVERIFIED" }),
      }),
    ]);
    expect(report.defectCounts).toEqual({});
  });

  it("flags future and malformed dates", async () => {
    const report = await rulesFor([
      washroom("src:1", {
        wheelchair: field("yes", { source_id: "src", retrieved_at: "2026-12-01" }),
        name: field("Synthetic", { source_id: "src", retrieved_at: "13/11/2026" }),
      }),
    ]);
    expect(report.defectCounts).toEqual({ "future-date": 1, "bad-date": 1 });
  });

  it("flags a zero dimension and a derived measurement for review, not as fact", async () => {
    const report = await rulesFor([
      washroom("src:1", {
        door_width: field(0, { source_id: "src" }),
        step_count: field(2, { source_id: "src", derived: true }),
      }),
    ]);
    expect(report.defectCounts).toEqual({ "zero-dimension": 1, "derived-measurement": 1 });
    expect(report.defects.every((defect) => defect.severity === "review")).toBe(true);
  });

  it("flags a measurement repeated across most of a file as a possible default", async () => {
    const report = await rulesFor(many("src", 25, () => ({ door_width: field(0.81, { source_id: "src" }) })));
    expect(report.defectCounts["repeated-measurement"]).toBe(1);
    expect(report.defects.find((defect) => defect.rule === "repeated-measurement")?.detail).toContain("25 of 25");
    const varied = await rulesFor(many("src", 25, (index) => ({ door_width: field(0.8 + index / 100, { source_id: "src" }) })));
    expect(varied.defectCounts["repeated-measurement"]).toBeUndefined();
  });

  it("flags an unreadable line and a record without fields", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "bad.ndjson", []);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, '{"id":"src:1","tranche":"venue"}\nnot json\n[1,2]\n');
    const report = await runAudit({ files: [{ path }] }, { auditDate: DATE });
    expect(report.defectCounts).toEqual({ "missing-fields": 1, "unreadable-line": 2 });
    expect(report.files[0]?.unreadableLines).toBe(2);
  });

  it("checks field keys against a field list when one is given", async () => {
    const report = await rulesFor([washroom("src:1")], { fieldList: { washroom: ["name", "lat", "lon", "wheelchair", "adult_changing_table"] } });
    expect(report.defectCounts).toEqual({ "missing-field-key": 1, "unexpected-field-key": 1 });
  });
});

describe("duplicates", () => {
  it("finds a repeated id across files", async () => {
    const dir = tempDir();
    const a = writeNdjson(dir, "a.ndjson", [washroom("src:1")]);
    const b = writeNdjson(dir, "b.ndjson", [washroom("src:1", { lat: field(44, { source_id: "src" }) })]);
    const report = await runAudit({ files: [{ path: a, label: "a" }, { path: b, label: "b" }] }, { auditDate: DATE });
    expect(report.defectCounts["duplicate-id"]).toBe(1);
    expect(report.defects[0]?.detail).toContain("a:1");
  });

  it("flags the same name from two sources within 25 metres, and not at 40 metres or from one source", async () => {
    const dir = tempDir();
    const near = 43.6 + 15 / 111_000;
    const far = 43.6 + 40 / 111_000;
    const named = (id: string, lat: number) =>
      washroom(id, {
        name: field("Sample Park Washroom", { source_id: id.split(":")[0] }),
        lat: field(lat, { source_id: id.split(":")[0] }),
      });
    const a = writeNdjson(dir, "a.ndjson", [named("city:1", 43.6), named("city:2", near)]);
    const b = writeNdjson(dir, "b.ndjson", [named("osm:1", near), named("osm:2", far + 0.01)]);
    const report = await runAudit({ files: [{ path: a, label: "a" }, { path: b, label: "b" }] }, { auditDate: DATE });
    const pairs = report.defects.filter((defect) => defect.rule === "possible-duplicate");
    expect(pairs.map((pair) => pair.recordId)).toEqual(["osm:1", "osm:1"]);
    expect(pairs[0]?.detail).toMatch(/Keep both unless a source shows/);
  });

  it("folds names and measures distance", () => {
    expect(foldName("Café  du Parc!")).toBe("cafe du parc");
    expect(Math.round(metresBetween({ lat: 43.6, lon: -79.4 }, { lat: 43.6 + 25 / 111_195, lon: -79.4 }))).toBe(25);
  });
});

describe("markdown", () => {
  it("says the cross-check is not done and gives no verdict", async () => {
    const dir = tempDir();
    const path = writeNdjson(dir, "m.ndjson", [washroom("src:1", { wheelchair: field("", { source_id: "src" }) })]);
    const report = await runAudit({ files: [{ path, label: "m.ndjson" }] }, { auditDate: DATE });
    const markdown = renderAudit(report);
    expect(markdown).toContain("| m.ndjson | 1 | src:1 | 3 | 1 | not checked | not checked |");
    expect(markdown).toContain("| blank-value | serious | 1 |");
    expect(markdown).toContain("does not compare a record to its source");
    expect(markdown).not.toMatch(/\bPASS\b|\bverified\b/);
  });
});

describe("grouping and attribution", () => {
  it("samples per folder when asked, across the files in it", async () => {
    const dir = tempDir();
    const { mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(dir, "src-a"));
    const a1 = writeNdjson(join(dir, "src-a"), "r1.ndjson", many("src-a", 15));
    const a2 = writeNdjson(join(dir, "src-a"), "r2.ndjson", many("src-a2", 15));
    const files = [
      { path: a1, label: "data/src-a/r1.ndjson" },
      { path: a2, label: "data/src-a/r2.ndjson" },
    ];
    const byFile = await runAudit({ files }, { auditDate: DATE });
    const byDirectory = await runAudit({ files }, { auditDate: DATE, sampleBy: "directory" });
    expect(byFile.sample).toHaveLength(30);
    expect(byDirectory.sample).toHaveLength(20);
    expect(new Set(byDirectory.sample.map((item) => item.group))).toEqual(new Set(["data/src-a"]));
    expect(new Set(byDirectory.sample.map((item) => item.file)).size).toBe(2);
  });

  it("attributes a record to the source most of its fields carry, not its id prefix", () => {
    const shaped = record("gtfs:operator-x:1", "transit", {
      name: field("Stop", { source_id: "operator-x" }),
      lat: field(43, { source_id: "operator-x" }),
      lon: field(-79, { source_id: "another-layer" }),
    });
    expect(recordSource(shaped)).toBe("operator-x");
    expect(recordSource({ id: "prefix:1", fields: {} })).toBe("prefix");
    expect(recordSource({})).toBe("unknown");
  });
});
