import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

export interface VerifiedFile {
  path: string;
  bytes: number;
  sha256: string;
  records: number;
}

/**
 * Reads a gzip NDJSON file to the end: every gzip member must decompress and
 * every non-empty line must parse as a JSON object. Throws on the first fault.
 */
export async function verifyNdjsonGz(file: string, onRecord?: (record: unknown, line: number) => void): Promise<VerifiedFile> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    const buffer = chunk as Buffer;
    bytes += buffer.length;
    hash.update(buffer);
  }
  if (bytes === 0) throw new Error("file is empty (0 bytes)");
  const input = createReadStream(file).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let records = 0;
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`line ${lineNumber} is not JSON`);
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`line ${lineNumber} is not a JSON object`);
      onRecord?.(parsed, lineNumber);
      records += 1;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return { path: file, bytes, sha256: hash.digest("hex"), records };
}

/** Counts records in every readable gzip NDJSON file under a directory. Unreadable files count as zero. */
export async function countDirRecords(directory: string): Promise<{ records: number; unreadable: string[] }> {
  if (!existsSync(directory)) return { records: 0, unreadable: [] };
  let records = 0;
  const unreadable: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    if (!name.endsWith(".ndjson.gz") || !statSync(file).isFile()) continue;
    try {
      records += (await verifyNdjsonGz(file)).records;
    } catch {
      unreadable.push(file);
    }
  }
  return { records, unreadable };
}

/**
 * Replaces `live` with `staged`. The old directory is moved aside first and
 * removed only after the new one is in place, so a crash leaves either the
 * old or the new directory, plus at most one `.old-*` copy to clean up.
 */
export function swapDirectory(staged: string, live: string): void {
  mkdirSync(path.dirname(live), { recursive: true });
  const aside = `${live}.old-${process.pid}-${Date.now()}`;
  const hadLive = existsSync(live);
  if (hadLive) renameSync(live, aside);
  try {
    renameSync(staged, live);
  } catch (error) {
    if (hadLive) renameSync(aside, live);
    throw error;
  }
  if (hadLive) rmSync(aside, { recursive: true, force: true });
}

/** Writes through a temporary file in the same directory and renames it into place. */
export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, data);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
