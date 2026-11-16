import path from "node:path";
import { markForReplacement, PartitionWriter } from "./partition-writer.js";
import { TRANCHE_DIR, type DataRecord, type Tranche } from "../model/records.js";
import { scrubRecord } from "../privacy/scrub.js";
import type { Validators } from "../validate/ajv.js";
import { checkRecord } from "../failsafe/record-check.js";
import { failsafeLog } from "../failsafe/report.js";

const seenIds = new WeakMap<PartitionWriter, Set<string>>();

/**
 * Scrubs, checks and writes one record. A record that fails a check is written
 * to the quarantine file with its reason and is not written to data/; the
 * records before and after it still land. Returns true when the record was
 * written.
 */
export async function commitRecord(
  record: DataRecord,
  sourceId: string,
  writer: PartitionWriter,
  validators: Validators,
): Promise<boolean> {
  let clean: DataRecord;
  try {
    clean = scrubRecord(record);
  } catch (error) {
    failsafeLog().quarantine({ stage: "import", source_id: sourceId, id: idOf(record), code: "not_object", reason: `scrub failed: ${(error as Error).message}` });
    return false;
  }
  const check = checkRecord(clean, { sourceId, validators: validators.records });
  if (!check.ok) {
    failsafeLog().quarantine({ stage: "import", source_id: sourceId, tranche: String(clean.tranche), id: idOf(clean), code: check.code, reason: check.reason, record: clean });
    return false;
  }
  const seen = seenIds.get(writer) ?? new Set<string>();
  seenIds.set(writer, seen);
  const key = `${clean.tranche}\u0000${sourceId}\u0000${clean.id}`;
  if (seen.has(key)) {
    failsafeLog().quarantine({ stage: "import", source_id: sourceId, tranche: clean.tranche, id: clean.id, code: "duplicate_id", reason: "a record with this id was already written in this run; the first one was kept", record: clean });
    return false;
  }
  seen.add(key);
  await writer.write(clean, sourceId);
  return true;
}

/**
 * Marks the source's directories to be replaced by this run. Nothing is
 * deleted now: the previous files stay until the writer has staged and
 * verified the new ones (see PartitionWriter.close).
 */
export function resetSourceDirs(dataRoot: string, sourceId: string, tranches: readonly Tranche[]): void {
  for (const tranche of tranches) {
    markForReplacement(dataRoot, path.posix.join(TRANCHE_DIR[tranche], sourceId));
  }
}

export function acceptId(seen: Set<string>, id: string): string | null {
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }
  return null;
}

function idOf(record: unknown): string | undefined {
  return record && typeof record === "object" && typeof (record as { id?: unknown }).id === "string" ? (record as { id: string }).id : undefined;
}
