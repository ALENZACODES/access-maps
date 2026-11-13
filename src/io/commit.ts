import { rmSync } from "node:fs";
import path from "node:path";
import { PartitionWriter } from "./partition-writer.js";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../model/records.js";
import { scrubRecord } from "../privacy/scrub.js";
import { validationError, type Validators } from "../validate/ajv.js";
import type { ValidateFunction } from "ajv";

function passed(validate: ValidateFunction, data: unknown): boolean {
  return validate(data) === true;
}

export async function commitRecord(
  record: DataRecord,
  sourceId: string,
  writer: PartitionWriter,
  validators: Validators,
): Promise<void> {
  const clean = scrubRecord(record);
  const validate = validators.records[clean.tranche];
  if (!passed(validate, clean)) {
    throw new Error(validationError(clean.id, validate.errors));
  }
  await writer.write(clean, sourceId);
}

export function resetSourceDirs(dataRoot: string, sourceId: string, tranches: readonly Tranche[]): void {
  for (const tranche of tranches) {
    rmSync(path.join(dataRoot, TRANCHE_DIR[tranche], sourceId), { recursive: true, force: true });
  }
}

export function acceptId(seen: Set<string>, id: string): string | null {
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }
  return null;
}
