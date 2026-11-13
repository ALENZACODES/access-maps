import { rmSync } from "node:fs";
import path from "node:path";
import { PartitionWriter } from "./partition-writer.js";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../model/records.js";
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
  const validate = validators.records[record.tranche];
  if (!passed(validate, record)) {
    throw new Error(validationError(record.id, validate.errors));
  }
  await writer.write(record, sourceId);
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
