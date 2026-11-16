import path from "node:path";
import { expect } from "vitest";
import { cityFeature, type CityFeature } from "../../src/municipal/cities/g3-shared.js";
import { scrubRecord } from "../../src/privacy/scrub.js";
import { compileValidators } from "../../src/validate/ajv.js";
import type { Provenance } from "../../src/model/provenance.js";
import type { DataRecord } from "../../src/model/records.js";

export const root = path.resolve(import.meta.dirname, "..", "..");
const validators = compileValidators(path.join(root, "schema"));

export function provenance(source_id: string, licence: string): Provenance {
  return { source_id, licence, retrieved_at: "2026-11-16", tier: 0 };
}

/** Builds a feature from the JSON shape the ArcGIS REST query returned on 2026-11-16. */
export function feature(attributes: Record<string, unknown>, geometry: Record<string, unknown> | null): CityFeature {
  return cityFeature({ attributes, geometry });
}

export function expectValid(record: DataRecord): void {
  const clean = scrubRecord(record);
  const validate = validators.records[clean.tranche];
  expect(validate(clean), JSON.stringify(validate.errors)).toBe(true);
  for (const field of Object.values(clean.fields)) {
    expect(field.tier).toBe(0);
    expect(field.retrieved_at).toBe("2026-11-16");
  }
}

/** Every accessibility field that must stay UNKNOWN when the publisher states only a flag or nothing. */
export function expectNoDerivedWheelchair(record: DataRecord): void {
  expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
}
