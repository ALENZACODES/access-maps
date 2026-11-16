import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  accessibilityFromWheelchair,
  adaptPackRecord,
  adaptRegistrySource,
  checkRepoData,
  undocumentedViolations,
} from "./repo-check";
import { checkStrictData } from "./index";
import { LICENCE_FINDINGS } from "./findings";

describe("accessibility mapping", () => {
  it("maps only explicit yes and no, and keeps conflicts unknown", () => {
    expect(accessibilityFromWheelchair("yes")).toBe("YES");
    expect(accessibilityFromWheelchair("NO")).toBe("NO");
    expect(accessibilityFromWheelchair("UNKNOWN")).toBe("UNKNOWN");
    expect(accessibilityFromWheelchair("limited")).toBe("UNKNOWN");
    expect(accessibilityFromWheelchair("yes;no")).toBe("UNKNOWN");
    expect(accessibilityFromWheelchair("designated")).toBe("UNKNOWN");
    expect(accessibilityFromWheelchair(1)).toBe("UNKNOWN");
  });
});

describe("adapters", () => {
  it("uses the registry source id, not notes that mention MiWay", () => {
    const adapted = adaptRegistrySource(
      {
        id: "metrolinx-go",
        name: "GO Transit static GTFS",
        kind: "gtfs",
        url: "https://example.invalid",
        download_url: "https://example.invalid/file",
        licence_name: "Metrolinx Access and Use Agreement (accepted 2026-11-15)",
        licence_url: "https://example.invalid/terms",
        licence_id: "Metrolinx Access and Use Agreement (accepted 2026-11-15)",
        attribution: "Plain agency name",
        retrieved_at: "2026-11-15",
        tier: 0,
        notes: "MiWay stays out.",
      },
      "sources/registry.json",
    );
    expect(typeof adapted).not.toBe("string");
    if (typeof adapted === "string") return;
    expect(adapted.record.source).toBe("metrolinx-go");
    const result = checkStrictData([adapted.record], "open");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).not.toMatch(/held feed/);
    expect(undocumentedViolations(result.errors, adapted.record)).toEqual([]);
  });

  it("maps a packed place record and keeps unknown access unknown", () => {
    const adapted = adaptPackRecord(
      {
        id: "osm:node/1",
        tranche: "venue",
        fields: {
          wheelchair: {
            value: "UNKNOWN",
            source_id: "osm-ontario",
            licence: "ODbL-1.0",
            retrieved_at: "2026-11-13",
          },
        },
      },
      "data/venues/example.ndjson.gz",
    );
    expect(typeof adapted).not.toBe("string");
    if (typeof adapted === "string") return;
    expect(adapted.record.accessibility).toBe("UNKNOWN");
    expect(adapted.record.silo).toBe("odbl");
    expect(checkStrictData([adapted.record], "odbl").ok).toBe(true);
  });
});

describe("documented licence findings", () => {
  it("lists every non-allowlist registry pair used in this repo", () => {
    const keys = new Set(LICENCE_FINDINGS.map((item) => `${item.sourceId}::${item.licence}`));
    expect(keys.size).toBe(LICENCE_FINDINGS.length);
    expect(keys.has("mto-picnic-parks::OGL-Ontario-1.0")).toBe(true);
    expect(keys.has("gtfs-ltc::LTC Open Data Terms of Use")).toBe(true);
  });
});

describe("checkRepoData", () => {
  it("passes allowlisted records and fails an undocumented licence", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "data-qa-"));
    writeFileSync(
      path.join(root, "sources-registry.json"),
      JSON.stringify({
        sources: [
          {
            id: "osm-ontario",
            name: "OpenStreetMap",
            kind: "osm",
            url: "https://example.invalid",
            download_url: "https://example.invalid/file",
            licence_name: "ODbL 1.0",
            licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
            licence_id: "ODbL-1.0",
            attribution: "OpenStreetMap contributors",
            retrieved_at: "2026-11-13",
            tier: 0,
          },
        ],
      }),
    );
    const goodDir = path.join(root, "data");
    mkdirSync(goodDir, { recursive: true });
    const good = JSON.stringify({
      id: "osm:node/1",
      tranche: "venue",
      fields: {
        wheelchair: {
          value: "yes",
          source_id: "osm-ontario",
          licence: "ODbL-1.0",
          retrieved_at: "2026-11-13",
        },
      },
    });
    writeFileSync(path.join(goodDir, "ok.ndjson.gz"), gzipSync(`${good}\n`));
    const ok = await checkRepoData({
      root,
      registryPath: path.join(root, "sources-registry.json"),
      dataDir: goodDir,
      packDir: path.join(root, "missing-pack"),
    });
    expect(ok.violations).toEqual([]);
    expect(ok.packRecords).toBe(1);
    expect(ok.registry).toBe(1);

    const badDir = path.join(root, "bad");
    mkdirSync(badDir, { recursive: true });
    const bad = JSON.stringify({
      id: "other:1",
      tranche: "venue",
      fields: {
        wheelchair: {
          value: "yes",
          source_id: "mystery-source",
          licence: "proprietary",
          retrieved_at: "2026-11-13",
        },
      },
    });
    writeFileSync(path.join(badDir, "bad.ndjson.gz"), gzipSync(`${bad}\n`));
    const failed = await checkRepoData({
      root,
      registryPath: path.join(root, "sources-registry.json"),
      dataDir: badDir,
      packDir: path.join(root, "missing-pack"),
    });
    expect(failed.violations.join(" ")).toMatch(/licence/);
  });

  it("fails a record whose source_id is miway or gtfs-miway", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "data-qa-miway-"));
    writeFileSync(
      path.join(root, "sources-registry.json"),
      JSON.stringify({
        sources: [
          {
            id: "osm-ontario",
            name: "OpenStreetMap",
            kind: "osm",
            url: "https://example.invalid",
            download_url: "https://example.invalid/file",
            licence_name: "ODbL 1.0",
            licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
            licence_id: "ODbL-1.0",
            attribution: "OpenStreetMap contributors",
            retrieved_at: "2026-11-13",
            tier: 0,
          },
        ],
      }),
    );
    for (const sourceId of ["miway", "gtfs-miway"] as const) {
      const dir = path.join(root, sourceId);
      mkdirSync(dir, { recursive: true });
      const record = JSON.stringify({
        id: `${sourceId}:stop/1`,
        tranche: "transit",
        fields: {
          wheelchair: {
            value: "yes",
            source_id: sourceId,
            licence: "ODbL-1.0",
            retrieved_at: "2026-11-13",
          },
        },
      });
      writeFileSync(path.join(dir, "held.ndjson.gz"), gzipSync(`${record}\n`));
      const report = await checkRepoData({
        root,
        registryPath: path.join(root, "sources-registry.json"),
        dataDir: dir,
        packDir: path.join(root, "missing-pack"),
      });
      expect(report.files).toBe(1);
      expect(report.violations.join(" "), sourceId).toMatch(/held feed/);
    }
  });

  it("fails closed when data/ and pack/v1 yield zero files", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "data-qa-empty-"));
    writeFileSync(
      path.join(root, "sources-registry.json"),
      JSON.stringify({
        sources: [
          {
            id: "osm-ontario",
            name: "OpenStreetMap",
            kind: "osm",
            url: "https://example.invalid",
            download_url: "https://example.invalid/file",
            licence_name: "ODbL 1.0",
            licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
            licence_id: "ODbL-1.0",
            attribution: "OpenStreetMap contributors",
            retrieved_at: "2026-11-13",
            tier: 0,
          },
        ],
      }),
    );
    const emptyData = path.join(root, "data");
    mkdirSync(emptyData, { recursive: true });
    const report = await checkRepoData({
      root,
      registryPath: path.join(root, "sources-registry.json"),
      dataDir: emptyData,
      packDir: path.join(root, "pack", "v1"),
    });
    expect(report.files).toBe(0);
    expect(report.packRecords).toBe(0);
    expect(report.violations.join(" ")).toMatch(/zero \.ndjson\.gz files; failing closed/);
  });
});
