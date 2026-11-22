import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Issue } from "./common.ts";
import { canonicalLocation, MAX_COMPRESSED_BYTES, MAX_TRIP_ROWS, type AuditPart } from "./manifest.ts";

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_CALENDAR_BYTES = 32 * 1024 * 1024;
const MAX_TRIPS_BYTES = 4 * 1024 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

type FileOutcome = { ok: true; bytes: Buffer } | { ok: false; code: string };
export type PartRead =
  | { status: "calendar"; value: unknown }
  | { status: "trips"; rows: unknown[] }
  | { status: "missing" | "invalid"; issue: Issue };

function systemCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

function failureCode(error: unknown): string {
  switch (systemCode(error)) {
    case "ENOENT": return "file.missing";
    case "ELOOP": return "file.outside";
    default: return "file.unreadable";
  }
}

// Size and reads share a descriptor. A file growing after stat cannot turn this
// into an unbounded read. O_NONBLOCK allows us to reject a FIFO before reading.
async function readBounded(path: string, limit: number, expected?: number): Promise<FileOutcome> {
  const flags = constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
  try {
    const handle = await open(path, flags);
    try {
      const meta = await handle.stat();
      if (!meta.isFile()) return { ok: false, code: "file.type" };
      if (meta.size > limit) return { ok: false, code: "file.limit" };
      if (expected !== undefined && meta.size !== expected) return { ok: false, code: "file.size" };
      const bytes = Buffer.allocUnsafe(meta.size);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!result.bytesRead) return { ok: false, code: "file.size" };
        offset += result.bytesRead;
      }
      const more = await handle.read(Buffer.alloc(1), 0, 1, offset);
      return more.bytesRead ? { ok: false, code: "file.size" } : { ok: true, bytes };
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { ok: false, code: failureCode(error) };
  }
}

export async function readManifestFile(path: string): Promise<{ ok: true; value: unknown } | { ok: false; issue: Issue }> {
  const fail = (code: string) => ({ ok: false as const, issue: { code, at: "manifest", severity: "error" as const } });
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch (error) {
    return fail(failureCode(error));
  }
  const file = await readBounded(canonical, MAX_MANIFEST_BYTES);
  if (!file.ok) return fail(file.code);
  let text: string;
  try {
    text = strictUtf8.decode(file.bytes);
  } catch {
    return fail("file.utf8");
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return fail("file.json");
  }
}

function invalid(code: string, at: string): PartRead {
  return { status: "invalid", issue: { code, at, severity: "error" } };
}

function readFailure(code: string, at: string): PartRead {
  return code === "file.missing" ? { status: "missing", issue: { code, at, severity: "warning" } } : invalid(code, at);
}

function parseCalendar(bytes: Buffer, at: string): PartRead {
  let text: string;
  try {
    text = strictUtf8.decode(bytes);
  } catch {
    return invalid("file.utf8", at);
  }
  try {
    return { status: "calendar", value: JSON.parse(text) as unknown };
  } catch {
    return invalid("file.json", at);
  }
}

function parseTrips(bytes: Buffer, at: string): PartRead {
  const rows: unknown[] = [];
  let start = 0;
  while (start < bytes.length) {
    const newline = bytes.indexOf(10, start);
    const end = newline < 0 ? bytes.length : newline;
    const location = at + ".rows[" + rows.length + "]";
    if (end - start > MAX_LINE_BYTES || rows.length >= MAX_TRIP_ROWS) return invalid("file.limit", location);
    let text: string;
    try {
      text = strictUtf8.decode(bytes.subarray(start, end));
    } catch {
      return invalid("file.utf8", location);
    }
    try {
      rows.push(JSON.parse(text) as unknown);
    } catch {
      return invalid("file.ndjson", location);
    }
    start = end + 1;
  }
  return { status: "trips", rows };
}

function outside(directory: string, path: string): boolean {
  const rel = relative(directory, path);
  return rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel);
}

// Inspect a missing path component by component. realpath alone returns ENOENT
// both for a genuinely unstaged shard and for a link pointing off-root to a
// missing file. Follow internal links only, including internal link chains.
async function classifyMissing(directory: string, name: string): Promise<string> {
  let current = directory;
  let pending = name.split("/");
  let hops = 0;
  while (pending.length) {
    const next = join(current, pending.shift()!);
    if (!(await lstat(next)).isSymbolicLink()) {
      current = next;
      continue;
    }
    const target = resolve(current, await readlink(next));
    if (outside(directory, target) || ++hops > 40) return "file.outside";
    const suffix = relative(directory, target);
    if (suffix) pending = suffix.split(sep).concat(pending);
    current = directory;
  }
  return "file.missing";
}

async function readFromRoot(root: string, name: string, size: number): Promise<FileOutcome> {
  try {
    const directory = await realpath(root);
    let path: string;
    try {
      path = await realpath(join(directory, name));
    } catch (error) {
      if (systemCode(error) !== "ENOENT") throw error;
      return { ok: false, code: await classifyMissing(directory, name) };
    }
    if (outside(directory, path)) return { ok: false, code: "file.outside" };
    return await readBounded(path, MAX_COMPRESSED_BYTES, size);
  } catch (error) {
    return { ok: false, code: failureCode(error) };
  }
}

/** Read a single verified gzip member or concatenated gzip file. No cross-root fallback. */
export async function readPart(part: AuditPart, roots: { packRoot: string; releaseRoot?: string }): Promise<PartRead> {
  const at = Number.isSafeInteger(part.index) && part.index >= 0 ? "parts[" + part.index + "]" : "parts";
  if (!canonicalLocation(part)) return invalid("part.path", at);
  if (!Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > MAX_COMPRESSED_BYTES) {
    return invalid("file.limit", at);
  }
  const root = part.placement === "git" ? roots.packRoot : roots.releaseRoot;
  if (root === undefined) return readFailure("file.missing", at);
  const name = part.placement === "git" ? part.path : part.assetName;
  if (name === undefined) return invalid("part.path", at);
  const file = await readFromRoot(root, name, part.bytes);
  if (!file.ok) return readFailure(file.code, at);
  if (createHash("sha256").update(file.bytes).digest("hex") !== part.sha256) return invalid("file.hash", at);
  let expanded: Buffer;
  try {
    const maxOutputLength = part.kind === "calendar" ? MAX_CALENDAR_BYTES : MAX_TRIPS_BYTES;
    expanded = gunzipSync(file.bytes, { maxOutputLength });
  } catch (error) {
    return invalid(systemCode(error) === "ERR_BUFFER_TOO_LARGE" ? "file.limit" : "file.gzip", at);
  }
  return part.kind === "calendar" ? parseCalendar(expanded, at) : parseTrips(expanded, at);
}
