/** Compare a declared offline publication bundle against actual local files. */
import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { BundleAudit, BundleAsset, BundleProblem, OfflineBundle } from "./offline-bundle.js";
import { auditOfflineBundle } from "./offline-bundle.js";

export interface FilesystemFinding extends BundleProblem {
  readonly expectedBytes: number | "UNKNOWN";
  readonly actualBytes: number | "UNKNOWN";
  readonly expectedHash: string;
  readonly actualHash: string;
}
export interface FilesystemAudit {
  readonly blocked: boolean;
  readonly base: BundleAudit;
  readonly files: readonly FilesystemFinding[];
  readonly inspected: number;
  readonly matched: number;
  readonly missing: number;
}
export interface InspectionOptions {
  readonly maxFileBytes?: number;
  readonly concurrency?: number;
  readonly requireOffline?: boolean;
}
const DEFAULT_FILE_LIMIT = 256 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const CHUNK_BYTES = 64 * 1024;

type InspectResult = { readonly actualBytes: number; readonly actualHash: string };

function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
function failure(
  code: string,
  path: string,
  expectedBytes: number | "UNKNOWN",
  expectedHash: string,
  description: string,
  actualBytes: number | "UNKNOWN" = "UNKNOWN",
  actualHash = "UNKNOWN",
): FilesystemFinding {
  return {
    code, level: "block", location: `assets.${path}`, description,
    expectedBytes, expectedHash, actualBytes, actualHash,
  };
}

/** Open path components without accepting symlinks or traversal from inside root. */
async function safeFile(root: string, local: string): Promise<string> {
  const rootReal = await realpath(root);
  const segments = local.split("/");
  let current = rootReal;
  for (const segment of segments) {
    current = join(current, segment);
    if (!within(rootReal, resolve(current))) throw new Error("PATH_OUTSIDE_ROOT");
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
  }
  const resolved = await realpath(current);
  if (!within(rootReal, resolved)) throw new Error("PATH_OUTSIDE_ROOT");
  const info = await lstat(resolved);
  if (!info.isFile()) throw new Error("NOT_REGULAR_FILE");
  return resolved;
}

/** Stream small bounded chunks so large binary files are never buffered entirely. */
async function inspectFile(filePath: string, maxFileBytes: number): Promise<InspectResult> {
  const handle = await open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("NOT_REGULAR_FILE");
    if (stat.size > maxFileBytes) throw new Error("FILE_TOO_LARGE");
    if (!Number.isSafeInteger(stat.size)) throw new Error("SIZE_NOT_SAFE");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let position = 0;
    while (position < stat.size) {
      const size = Math.min(buffer.length, stat.size - position);
      const result = await handle.read(buffer, 0, size, position);
      if (result.bytesRead === 0) throw new Error("FILE_CHANGED_DURING_READ");
      hash.update(buffer.subarray(0, result.bytesRead));
      position += result.bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error("FILE_CHANGED_DURING_READ");
    return { actualBytes: position, actualHash: hash.digest("hex") };
  } finally {
    await handle.close();
  }
}

async function inspectOne(root: string, asset: BundleAsset, maxFileBytes: number): Promise<FilesystemFinding[]> {
  const failures: FilesystemFinding[] = [];
  if (asset.disposition !== "included") return failures;
  let path: string;
  try { path = await safeFile(root, asset.path); }
  catch (error) {
    const reason = error instanceof Error ? error.message : "FILE_UNAVAILABLE";
    failures.push(failure("FILE_UNAVAILABLE", asset.path, asset.bytes, asset.sha256, reason));
    return failures;
  }
  let actual: InspectResult;
  try { actual = await inspectFile(path, maxFileBytes); }
  catch (error) {
    const reason = error instanceof Error ? error.message : "FILE_UNREADABLE";
    failures.push(failure("FILE_UNREADABLE", asset.path, asset.bytes, asset.sha256, reason));
    return failures;
  }
  if (asset.bytes !== "UNKNOWN" && asset.bytes !== actual.actualBytes) {
    failures.push(failure("FILE_SIZE_MISMATCH", asset.path, asset.bytes, asset.sha256,
      "Actual byte count differs from declared size", actual.actualBytes, actual.actualHash));
  }
  if (asset.sha256 !== "UNKNOWN" && asset.sha256 !== actual.actualHash) {
    failures.push(failure("FILE_HASH_MISMATCH", asset.path, asset.bytes, asset.sha256,
      "Actual digest differs from declared digest", actual.actualBytes, actual.actualHash));
  }
  return failures;
}

/**
 * Inspect only files listed as included. No files are created, rewritten,
 * downloaded, or renamed. Callers supply an already-existing local directory.
 * A report shows declared metadata separately from observed byte counts.
 */
export async function auditBundleFiles(
  bundle: OfflineBundle,
  directory: string,
  options: InspectionOptions = {},
): Promise<FilesystemAudit> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_FILE_LIMIT;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 1024 * 1024 * 1024) {
    throw new RangeError("maxFileBytes must be between 1 B and 1 GiB");
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new RangeError("concurrency must be between 1 and 16");
  }
  const base = auditOfflineBundle(bundle, options.requireOffline ?? true);
  const queue = bundle.assets.filter((item) => item.disposition === "included");
  const results: FilesystemFinding[][] = Array.from({length: queue.length}, () => []);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const i = cursor;
      cursor += 1;
      const item = queue[i];
      if (!item) continue;
      results[i] = await inspectOne(directory, item, maxFileBytes);
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
  const files = results.flat().sort((a,b) => a.location.localeCompare(b.location) || a.code.localeCompare(b.code));
  const missing = files.filter((entry) => entry.code === "FILE_UNAVAILABLE" || entry.code === "FILE_UNREADABLE").length;
  const mismatched = new Set(files.map((entry) => entry.location)).size;
  return {
    blocked: base.blocked || files.some((item) => item.level === "block"),
    base, files, inspected: queue.length, matched: queue.length - mismatched, missing,
  };
}

export function combinedFindings(result: FilesystemAudit): readonly BundleProblem[] {
  return [...result.base.problems, ...result.files]
    .sort((a,b) => a.location.localeCompare(b.location) || a.code.localeCompare(b.code));
}
