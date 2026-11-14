import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Synthetic records only. None of these describe a real place. */
export interface FieldInput {
  value: unknown;
  source_id?: unknown;
  licence?: unknown;
  retrieved_at?: unknown;
  tier?: unknown;
  derived?: boolean;
}

export function field(value: unknown, overrides: Partial<FieldInput> = {}): FieldInput {
  return {
    value,
    source_id: "synthetic-source",
    licence: "SYNTHETIC-TEST-ONLY",
    retrieved_at: "2026-11-13",
    tier: 0,
    ...overrides,
  };
}

export function record(id: string, tranche: string, fields: Record<string, FieldInput>): Record<string, unknown> {
  return { id, tranche, region: "synthetic", fields };
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "seed-audit-"));
}

export function writeNdjson(dir: string, name: string, records: unknown[], gzip = false): string {
  const body = `${records.map((item) => JSON.stringify(item)).join("\n")}\n`;
  const path = join(dir, name);
  writeFileSync(path, gzip ? gzipSync(body) : body);
  return path;
}

export function washroom(id: string, overrides: Record<string, FieldInput> = {}): Record<string, unknown> {
  const source = id.split(":")[0] ?? "synthetic-source";
  return record(id, "washroom", {
    name: field(`Synthetic washroom ${id}`, { source_id: source }),
    lat: field(43.6, { source_id: source }),
    lon: field(-79.4, { source_id: source }),
    wheelchair: field("UNKNOWN", { source_id: source }),
    door_width: field("UNKNOWN", { source_id: source }),
    ...overrides,
  });
}
