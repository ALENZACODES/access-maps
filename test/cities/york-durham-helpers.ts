import path from "node:path";
import { expect } from "vitest";
import { scrubRecord } from "../../src/privacy/scrub.js";
import { compileValidators } from "../../src/validate/ajv.js";
import type { Provenance, Tier } from "../../src/model/provenance.js";
import type { DataRecord } from "../../src/model/records.js";

export const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const validators = compileValidators(path.join(repoRoot, "schema"));

export function provenance(source_id: string, licence: string, tier: Tier = 0): Provenance {
  return { source_id, licence, retrieved_at: "2026-11-16", tier };
}

/** The record passes the scrubber and the Ajv schema, and every field carries the source's tier and date. */
export function expectValid(record: DataRecord, tier: Tier = 0): void {
  const clean = scrubRecord(record);
  const validate = validators.records[clean.tranche];
  expect(validate(clean), JSON.stringify(validate.errors)).toBe(true);
  for (const field of Object.values(clean.fields)) {
    expect(field.tier).toBe(tier);
    expect(field.retrieved_at).toBe("2026-11-16");
    expect(field.source_id).toBe(record.id.split(":")[0]);
  }
}

/** Accessibility fields that must stay UNKNOWN when the source has no accessibility column. */
export function expectNoAccessibilityClaim(record: DataRecord): void {
  for (const key of ["wheelchair", "wheelchair_description", "ramp", "kerb", "step_count", "published_accessibility"]) {
    if (key in record.fields) expect(record.fields[key]?.value, key).toBe("UNKNOWN");
  }
}
