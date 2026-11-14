import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, parseArgs, parseCrossCheck } from "../src/cli.js";
import { licenceChecks } from "../src/licences.js";
import { renderLicenceChecks } from "../src/report.js";
import { field, tempDir, washroom, writeNdjson } from "./helpers.js";

/** Shaped like sources/registry.json. The entries are synthetic. */
const REGISTRY = {
  sources: [
    {
      id: "synthetic-share-alike",
      name: "Synthetic share-alike source",
      licence_name: "Open Database License (ODbL) 1.0",
      licence_url: "https://example.org/odbl",
      licence_id: "ODbL-1.0",
      retrieved_at: "2026-11-13",
    },
    {
      id: "synthetic-revocable",
      name: "Synthetic revocable source",
      licence_name: "Synthetic licence",
      licence_url: "https://example.org/licence",
      licence_id: "SYN-1",
      retrieved_at: "2026-11-13",
      notes: "The download terms are limited, revocable, and have not been reconciled with the licence PDF.",
    },
    {
      id: "synthetic-stale",
      name: "Synthetic stale source",
      licence_name: "Synthetic licence",
      licence_url: "https://example.org/licence",
      licence_id: "SYN-2",
      retrieved_at: "2026-05-01",
    },
    {
      id: "synthetic-clean",
      name: "Synthetic clean source",
      licence_name: "Synthetic licence",
      licence_url: "https://example.org/licence",
      licence_id: "SYN-3",
      retrieved_at: "2026-11-13",
    },
    { id: "synthetic-bare", name: "Synthetic bare source" },
  ],
};

describe("licence re-checks", () => {
  const checks = licenceChecks(REGISTRY, "2026-11-14");

  it("opens one dated, unowned check per source that needs fresh evidence", () => {
    expect(checks.map((check) => check.sourceId)).toEqual([
      "synthetic-bare",
      "synthetic-revocable",
      "synthetic-share-alike",
      "synthetic-stale",
    ]);
    for (const check of checks) {
      expect(check.openedOn).toBe("2026-11-14");
      expect(check.owner).toBeNull();
      expect(check.due).toBeNull();
    }
  });

  it("names the reason for each check", () => {
    const by = Object.fromEntries(checks.map((check) => [check.sourceId, check.reasons]));
    expect(by["synthetic-share-alike"]).toEqual(["share-alike"]);
    expect(by["synthetic-revocable"]).toEqual(["terms-not-settled"]);
    expect(by["synthetic-stale"]).toEqual(["retrieval-stale"]);
    expect(by["synthetic-bare"]).toEqual(["licence-not-recorded", "retrieval-date-missing"]);
    expect(checks.find((check) => check.sourceId === "synthetic-bare")?.licenceId).toBe("UNKNOWN");
  });

  it("renders owner and due as not set", () => {
    const markdown = renderLicenceChecks(checks, "2026-11-14");
    expect(markdown).toContain("| synthetic-stale | SYN-2 | 2026-05-01 |");
    expect(markdown.match(/\| not set \| not set \|/g)).toHaveLength(4);
  });
});

describe("cli", () => {
  it("parses flags and refuses a flag without a value", () => {
    expect(parseArgs(["a", "--seed", "x", "b"])).toEqual({ positional: ["a", "b"], flags: new Map([["seed", "x"]]) });
    expect(() => parseArgs(["--seed"])).toThrow("--seed needs a value.");
  });

  it("rejects an incomplete cross-check entry", () => {
    expect(() => parseCrossCheck({})).toThrow("JSON array");
    expect(() => parseCrossCheck([{ recordId: "a" }])).toThrow("missing field, secondSource, secondValue, result, checkedOn");
    expect(() =>
      parseCrossCheck([{ recordId: "a", field: "b", secondSource: "c", secondValue: "d", result: "maybe", checkedOn: "2026-11-14" }]),
    ).toThrow('result "maybe"');
  });

  it("writes the report and exits 1 when a blocker or a count mismatch is found", async () => {
    const dir = tempDir();
    const data = join(dir, "data");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(data);
    writeNdjson(data, "clean.ndjson.gz", [washroom("src:1")], true);
    const counts = join(dir, "counts.json");
    writeFileSync(counts, JSON.stringify({ records: 1 }));
    const out = join(dir, "out");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await main(["audit", data, "--root", dir, "--counts", counts, "--date", "2026-11-14", "--out", out])).toBe(0);
      const json = JSON.parse(readFileSync(join(out, "seed-deep-sample.json"), "utf8"));
      expect(json.files[0].file).toBe("data/clean.ndjson.gz");
      expect(existsSync(join(out, "seed-deep-sample.md"))).toBe(true);

      writeFileSync(counts, JSON.stringify({ records: 2 }));
      expect(await main(["audit", data, "--root", dir, "--counts", counts, "--date", "2026-11-14", "--out", out])).toBe(1);

      writeFileSync(counts, JSON.stringify({ records: 2 }));
      writeNdjson(data, "tiered.ndjson", [washroom("src:2", { wheelchair: field("yes", { source_id: "src", tier: 3 }) })]);
      expect(await main(["audit", data, "--root", dir, "--date", "2026-11-14", "--out", out])).toBe(1);

      const registry = join(dir, "registry.json");
      writeFileSync(registry, JSON.stringify(REGISTRY));
      expect(await main(["licences", registry, "--date", "2026-11-14", "--out", out])).toBe(0);
      expect(JSON.parse(readFileSync(join(out, "licence-rechecks.json"), "utf8")).checks).toHaveLength(4);
    } finally {
      write.mockRestore();
    }
  });

  it("refuses a bad date and an empty folder", async () => {
    await expect(main(["audit", tempDir()])).rejects.toThrow("No .ndjson");
    await expect(main(["licences", "x.json", "--date", "14-11-2026"])).rejects.toThrow("--date must be YYYY-MM-DD.");
  });
});
