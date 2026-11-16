import path from "node:path";
import { expect } from "vitest";
import { scrubRecord } from "../../src/privacy/scrub.js";
import { compileValidators } from "../../src/validate/ajv.js";
import type { Provenance } from "../../src/model/provenance.js";
import type { DataRecord } from "../../src/model/records.js";

export const root = path.resolve(import.meta.dirname, "..", "..");
const validators = compileValidators(path.join(root, "schema"));

export const ctxFor = (source_id: string, licence: string): Provenance => ({
  source_id,
  licence,
  retrieved_at: "2026-11-16",
  tier: 0,
});

/** The scrubbed record passes the record schema and every field is tier 0, dated 2026-11-16. */
export function expectValid(record: DataRecord): void {
  const clean = scrubRecord(record);
  const validate = validators.records[clean.tranche];
  expect(validate(clean), JSON.stringify(validate.errors)).toBe(true);
  for (const field of Object.values(clean.fields)) {
    expect(field.tier).toBe(0);
    expect(field.retrieved_at).toBe("2026-11-16");
  }
}
