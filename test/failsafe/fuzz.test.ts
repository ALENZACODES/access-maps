import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { commitRecord } from "../../src/io/commit.js";
import { PartitionWriter } from "../../src/io/partition-writer.js";
import { checkRecord } from "../../src/failsafe/record-check.js";
import type { DataRecord } from "../../src/model/records.js";
import { cleanup, ctx, partitionFile, quarantineLines, tempRoot, validators, washroom } from "./helpers.js";

afterEach(cleanup);

/** Small seeded generator so a failure can be replayed from its seed. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NASTY: unknown[] = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 1e9, "", "UNKNOWN", "43.6", [], {}, [[1]], true, "x".repeat(5000), -0];

function mutated(seed: number): unknown {
  const next = random(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const record = JSON.parse(JSON.stringify(washroom(`fuzz${seed}`))) as Record<string, unknown>;
  const fields = record.fields as Record<string, Record<string, unknown>>;
  const steps = 1 + Math.floor(next() * 3);
  for (let step = 0; step < steps; step += 1) {
    const roll = next();
    const name = pick(Object.keys(fields));
    if (roll < 0.15) record[pick(["id", "tranche", "region", "fields"])] = pick(NASTY);
    else if (roll < 0.35) delete fields[name]?.[pick(["value", "source_id", "licence", "retrieved_at", "tier"])];
    else if (roll < 0.6) { const field = fields[name]; if (field) field[pick(["value", "source_id", "licence", "retrieved_at", "tier"])] = pick(NASTY); }
    else if (roll < 0.75) fields[pick(["lat", "lon"])]!.value = pick([430, -79.38, 43.65, 91, -181, Number.NaN, "43"]);
    else if (roll < 0.85) fields[name] = pick(NASTY) as Record<string, unknown>;
    else record.region = pick(["n45.0_w075.5", "unknown", "", "n43.5_w079.5"]);
  }
  return record;
}

describe("fuzzed records are either written valid or quarantined", () => {
  it("300 seeded mutations: commit never throws, good neighbours always land, nothing invalid is written", async () => {
    const env = tempRoot();
    const writer = new PartitionWriter(env.data);
    let written = 0;
    let quarantined = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      expect(await commitRecord(washroom(`anchor${seed}`), ctx.source_id, writer, validators)).toBe(true);
      const ok = await commitRecord(mutated(seed) as DataRecord, ctx.source_id, writer, validators);
      if (ok) written += 1;
      else quarantined += 1;
    }
    await writer.close();
    const lines = gunzipSync(readFileSync(partitionFile(env.data))).toString("utf8").trim().split("\n");
    const records = lines.map((line) => JSON.parse(line) as DataRecord);
    expect(records.filter((record) => record.id.startsWith("anchor"))).toHaveLength(300);
    expect(records).toHaveLength(300 + written);
    for (const record of records) expect(checkRecord(record, { sourceId: ctx.source_id, validators: validators.records })).toEqual({ ok: true });
    expect(quarantineLines(env.log)).toHaveLength(quarantined);
    expect(quarantined).toBeGreaterThan(100);
  });
});
