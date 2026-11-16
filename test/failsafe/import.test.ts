import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitRecord, resetSourceDirs } from "../../src/io/commit.js";
import { PartitionWriter } from "../../src/io/partition-writer.js";
import { parseImportPlan, runIsolated } from "../../src/failsafe/isolate.js";
import { importWithFailsafe } from "../../scripts/import-failsafe.js";
import type { DataRecord } from "../../src/model/records.js";
import { cleanup, ctx, idsIn, partitionFile, quarantineLines, seedLive, tempRoot, validators, washroom } from "./helpers.js";

afterEach(() => {
  cleanup();
  delete process.env.ACCESS_FAILSAFE_ALLOW_DROP;
  delete process.env.ACCESS_FAILSAFE_MIN_RATIO;
});

async function run(records: DataRecord[], options: { seed?: number; reset?: boolean } = {}) {
  const env = tempRoot();
  if (options.seed) seedLive(env.data, options.seed);
  const writer = new PartitionWriter(env.data);
  if (options.reset) resetSourceDirs(env.data, ctx.source_id, ["washroom"]);
  const results: boolean[] = [];
  for (const record of records) results.push(await commitRecord(record, ctx.source_id, writer, validators));
  await writer.close();
  return { ...env, writer, results, ids: idsIn(partitionFile(env.data)), quarantined: quarantineLines(env.log) };
}

const good = (n: number) => washroom(`good${n}`);

function mutate(change: (record: DataRecord) => void): DataRecord {
  const record = washroom("bad");
  change(record);
  return record;
}

describe("one bad record never stops the others (import)", () => {
  const cases: Array<[string, DataRecord, string]> = [
    ["wrong type: latitude as a string", washroom("bad", "43.6"), "coordinate_range"],
    ["missing provenance: source_id removed", mutate((r) => { delete (r.fields.name as { source_id?: string }).source_id; }), "missing_provenance"],
    ["licence missing", mutate((r) => { r.fields.name!.licence = ""; }), "missing_provenance"],
    ["out-of-range coordinate", washroom("bad", 430, -79.38), "coordinate_range"],
    ["swapped coordinates", washroom("bad", -79.38, 43.65), "coordinate_range"],
    ["NaN coordinate", washroom("bad", Number.NaN, -79.38), "non_finite"],
    ["Infinity in a value", mutate((r) => { r.fields.name!.value = Number.POSITIVE_INFINITY; }), "non_finite"],
    ["unknown enum: tier 7", mutate((r) => { (r.fields.name as { tier: number }).tier = 7; }), "missing_provenance"],
    ["unknown enum: tranche", mutate((r) => { (r as { tranche: string }).tranche = "shop"; }), "unknown_tranche"],
    ["region does not hold the point", washroom("bad", 45.4, -75.7), "region_mismatch"],
    ["another source's provenance", mutate((r) => { r.fields.name!.source_id = "osm-ontario"; }), "provenance_mismatch"],
    ["field outside the schema", mutate((r) => { (r.fields as Record<string, unknown>).invented = { ...r.fields.name }; }), "schema"],
  ];
  for (const [label, bad, code] of cases) {
    it(`${label}: quarantined with a reason, good records land`, async () => {
      const outcome = await run([good(1), bad, good(2)]);
      expect(outcome.results).toEqual([true, false, true]);
      expect(outcome.ids).toEqual(["good1", "good2"]);
      expect(outcome.quarantined).toHaveLength(1);
      expect(outcome.quarantined[0]).toMatchObject({ code, stage: "import" });
      expect(outcome.quarantined[0]?.reason.length).toBeGreaterThan(0);
      expect(outcome.log.report.status).toBe("contained");
    });
  }

  it("duplicate id: the first copy is kept and the second is quarantined", async () => {
    const outcome = await run([good(1), good(1), good(2)]);
    expect(outcome.ids).toEqual(["good1", "good2"]);
    expect(outcome.quarantined.map((line) => line.code)).toEqual(["duplicate_id"]);
  });

  it("a clean run reports clean and quarantines nothing", async () => {
    const outcome = await run([good(1), good(2)], { seed: 3, reset: true });
    expect(outcome.ids).toEqual(["good1", "good2"]);
    expect(outcome.quarantined).toEqual([]);
    expect(outcome.writer.outcomes[0]).toMatchObject({ status: "replaced", before: 3, after: 2 });
  });
});

describe("last known-good data is kept (import)", () => {
  it("a source that returns 0 rows keeps the previous files", async () => {
    const outcome = await run([], { seed: 10, reset: true });
    expect(outcome.ids).toHaveLength(10);
    expect(outcome.writer.outcomes[0]).toMatchObject({ status: "kept_last_known_good", before: 10, after: 0 });
    expect(outcome.log.report.status).toBe("contained");
  });

  it("a sudden drop under the keep ratio keeps the previous files", async () => {
    const outcome = await run([good(1)], { seed: 10, reset: true });
    expect(outcome.ids).toHaveLength(10);
    expect(outcome.ids[0]).toBe("old0");
    expect(outcome.writer.outcomes[0]?.reason).toMatch(/ACCESS_FAILSAFE_ALLOW_DROP=toronto-park-washrooms/);
  });

  it("a person can allow one checked source to shrink", async () => {
    process.env.ACCESS_FAILSAFE_ALLOW_DROP = ctx.source_id;
    const outcome = await run([good(1)], { seed: 10, reset: true });
    expect(outcome.ids).toEqual(["good1"]);
  });

  it("the keep ratio is configurable", async () => {
    process.env.ACCESS_FAILSAFE_MIN_RATIO = "0.05";
    const outcome = await run([good(1)], { seed: 10, reset: true });
    expect(outcome.ids).toEqual(["good1"]);
  });

  it("an HTTP error mid-download leaves the previous file whole and the next step runs", async () => {
    const env = tempRoot();
    const file = seedLive(env.data, 10);
    const before = readFileSync(file);
    let nextRan = false;
    const first = await runIsolated("importFixtureFeed", async () => {
      const writer = new PartitionWriter(env.data);
      resetSourceDirs(env.data, ctx.source_id, ["washroom"]);
      await commitRecord(good(1), ctx.source_id, writer, validators);
      throw new Error("HTTP 503 after 1 of 10 pages");
    }, env.log);
    await runIsolated("importNextFeed", async () => { nextRan = true; }, env.log);
    expect(first.ok).toBe(false);
    expect(first.kept).toEqual(["washrooms/toronto-park-washrooms"]);
    expect(nextRan).toBe(true);
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(idsIn(file)).toHaveLength(10);
    expect(env.log.report.outcomes.map((outcome) => outcome.status)).toEqual(["step_failed", "kept_last_known_good"]);
  });

  it("a staged file over the size limit is not moved in and the previous file stays", async () => {
    const env = tempRoot();
    seedLive(env.data, 4);
    const writer = new PartitionWriter(env.data, 32_000_000, 256, 300);
    resetSourceDirs(env.data, ctx.source_id, ["washroom"]);
    for (let i = 0; i < 6; i += 1) await commitRecord(good(i), ctx.source_id, writer, validators);
    await writer.close();
    expect(idsIn(partitionFile(env.data))).toEqual(["old0", "old1", "old2", "old3"]);
    expect(writer.outcomes[0]?.reason).toMatch(/over the 300 byte limit/);
  });

  it("a corrupt existing file is not appended to; the new records replace it and it is reported", async () => {
    const env = tempRoot();
    const file = partitionFile(env.data);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
    const writer = new PartitionWriter(env.data);
    await commitRecord(good(1), ctx.source_id, writer, validators);
    await writer.close();
    expect(idsIn(file)).toEqual(["good1"]);
    expect(env.log.report.outcomes.some((outcome) => outcome.status === "unreadable_replaced")).toBe(true);
  });

  it("no staging directory is left behind", async () => {
    const outcome = await run([good(1)], { seed: 2, reset: true });
    expect(existsSync(path.join(outcome.root, ".cache", "failsafe", "staging"))).toBe(true);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(path.join(outcome.root, ".cache", "failsafe", "staging"))).toEqual([]);
  });
});

describe("one step failing never stops the run", () => {
  it("reads every step of scripts/import-all.ts in order", () => {
    const plan = parseImportPlan(readFileSync(path.join(process.cwd(), "scripts", "import-all.ts"), "utf8"));
    const names = plan.map((step) => step.name);
    expect(names[0]).toBe("importMunicipal");
    expect(names.at(-1)).toBe("writeCounts");
    expect(names).toContain("importOsm");
    expect(names).toContain("importGtfs");
    for (const step of plan) expect(existsSync(path.join(process.cwd(), "scripts", step.module.replace(/\.js$/, ".ts")))).toBe(true);
  });

  it("refuses a plan it cannot read instead of running nothing", () => {
    expect(() => parseImportPlan("console.log('nothing');")).toThrow(/no `await step/);
    expect(() => parseImportPlan("await missing(repoRoot);")).toThrow(/does not import it/);
  });

  it("runs the steps after a failed step and marks the run failed", async () => {
    const env = tempRoot();
    const scripts = path.join(env.root, "scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(path.join(scripts, "a.ts"), "export async function stepA() { throw new Error('download failed: HTTP 500'); }\n");
    writeFileSync(path.join(scripts, "b.ts"), "import { writeFileSync } from 'node:fs';\nimport path from 'node:path';\nexport async function stepB(root: string) { writeFileSync(path.join(root, 'b-ran'), 'yes'); }\n");
    writeFileSync(path.join(scripts, "plan.ts"), "import { stepA } from './a.js';\nimport { stepB } from './b.js';\nconst repoRoot = process.cwd();\nawait stepA(repoRoot);\nawait stepB(repoRoot);\n");
    const results = await importWithFailsafe(env.root, path.join(scripts, "plan.ts"));
    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(results[0]?.error).toMatch(/HTTP 500/);
    expect(existsSync(path.join(env.root, "b-ran"))).toBe(true);
    expect(env.log.report.status).toBe("failed");
  });
});
