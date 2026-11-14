import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { SeedRecord } from "./types.js";

export interface ReadItem {
  line: number;
  record: SeedRecord | null;
  /** Set when the line is not a JSON object. */
  error?: string;
}

function asRecord(value: unknown): SeedRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as SeedRecord) : null;
}

/**
 * Reads records from `.ndjson`, `.jsonl`, `.ndjson.gz`, `.jsonl.gz`, or a
 * `.json` file holding an array or `{ "records": [...] }`. Line numbers are
 * 1-based. For a `.json` array, the "line" is the array position plus one.
 */
export async function* readRecords(path: string): AsyncGenerator<ReadItem> {
  if (/\.json$/i.test(path)) {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: unknown }).records)
        ? (parsed as { records: unknown[] }).records
        : null;
    if (!list) {
      yield { line: 1, record: null, error: "A .json seed file must hold an array or an object with a records array." };
      return;
    }
    for (const [index, item] of list.entries()) {
      const record = asRecord(item);
      yield record ? { line: index + 1, record } : { line: index + 1, record: null, error: "Item is not an object." };
    }
    return;
  }
  const raw = createReadStream(path);
  const input = /\.gz$/i.test(path) ? raw.pipe(createGunzip()) : raw;
  const lines = createInterface({ input, crlfDelay: Infinity });
  let line = 0;
  for await (const text of lines) {
    line += 1;
    if (text.trim() === "") continue;
    try {
      const record = asRecord(JSON.parse(text));
      yield record ? { line, record } : { line, record: null, error: "Line is not a JSON object." };
    } catch (error) {
      yield { line, record: null, error: `Line is not JSON: ${(error as Error).message}` };
    }
  }
}

export function isSeedFile(path: string): boolean {
  return /\.(ndjson|jsonl)(\.gz)?$/i.test(path) || /\.json$/i.test(path);
}
