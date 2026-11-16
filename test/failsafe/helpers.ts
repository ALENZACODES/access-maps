import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { fv, type Provenance } from "../../src/model/provenance.js";
import { buildRecord, type DataRecord } from "../../src/model/records.js";
import { compileValidators } from "../../src/validate/ajv.js";
import { resetFailsafeLog, type FailsafeLog } from "../../src/failsafe/report.js";

/** Labelled test fixture values. Not real places. */
export const ctx: Provenance = { source_id: "toronto-park-washrooms", licence: "OGL-Toronto-1.0", retrieved_at: "2026-11-16", tier: 0 };
export const CELL = "n43.5_w079.5";
export const validators = compileValidators(path.join(process.cwd(), "schema"));

const roots: string[] = [];

export function tempRoot(): { root: string; data: string; log: FailsafeLog } {
  const root = mkdtempSync(path.join(tmpdir(), "failsafe-"));
  roots.push(root);
  const log = resetFailsafeLog(path.join(root, ".cache", "failsafe"));
  return { root, data: path.join(root, "data"), log };
}

export function cleanup(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function washroom(id: string, lat: unknown = 43.65, lon: unknown = -79.38, region = CELL): DataRecord {
  const record = buildRecord("washroom", id, region, { name: fv(`Fixture washroom ${id}`, ctx, { source_key: "name" }) }, ctx);
  record.fields.lat = { ...fv(1, ctx, { source_key: "lat" }), value: lat as number };
  record.fields.lon = { ...fv(1, ctx, { source_key: "lon" }), value: lon as number };
  return record;
}

export function partitionFile(data: string, region = CELL, source = ctx.source_id): string {
  return path.join(data, "washrooms", source, `${region}.ndjson.gz`);
}

export function seedLive(data: string, count: number, region = CELL): string {
  const file = partitionFile(data, region);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gzipSync(Array.from({ length: count }, (_, i) => JSON.stringify(washroom(`old${i}`))).join("\n") + "\n"));
  return file;
}

export function idsIn(file: string): string[] {
  if (!existsSync(file)) return [];
  return gunzipSync(readFileSync(file)).toString("utf8").split("\n").filter((line) => line.trim()).map((line) => (JSON.parse(line) as { id: string }).id);
}

export function quarantineLines(log: FailsafeLog): Array<{ code: string; id?: string; reason: string; stage: string }> {
  if (!existsSync(log.quarantineFile)) return [];
  return readFileSync(log.quarantineFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
