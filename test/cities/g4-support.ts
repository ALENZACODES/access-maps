import path from "node:path";
import { expect } from "vitest";
import { scrubRecord } from "../../src/privacy/scrub.js";
import { compileValidators } from "../../src/validate/ajv.js";
import { readRegistry } from "../../src/registry.js";
import type { Provenance } from "../../src/model/provenance.js";
import type { DataRecord } from "../../src/model/records.js";

export const root = path.resolve(import.meta.dirname, "..", "..");
const validators = compileValidators(path.join(root, "schema"));
const registry = readRegistry(root);

/** Provenance built from the registry entry, so a test fails if the source is not registered. */
export function contextFor(sourceId: string): Provenance {
  const source = registry.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`${sourceId} is not in sources/registry.json`);
  return { source_id: source.id, licence: source.licence_id, retrieved_at: source.retrieved_at, tier: source.tier };
}

export function expectValid(record: DataRecord, tier: 0 | 1 = 0): void {
  const clean = scrubRecord(record);
  const validate = validators.records[clean.tranche];
  expect(validate(clean), JSON.stringify(validate.errors)).toBe(true);
  for (const field of Object.values(clean.fields)) {
    expect(field.tier).toBe(tier);
    expect(field.retrieved_at).toBe("2026-11-16");
  }
}

export function sourceEntry(sourceId: string) {
  const source = registry.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`${sourceId} is not in sources/registry.json`);
  return source;
}
