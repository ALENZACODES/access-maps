import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

type Reason = "invalid-declaration" | "root-unavailable" | "unsafe-entry" | "input-unreadable"
  | "file-limit" | "changed-during-check" | "digest-mismatch" | "count-mismatch";

export interface InputCheck {
  status: "matches" | "differs" | "unavailable";
  declaredDigest: string;
  observedDigest: string | null;
  files: number;
  bytes: number;
  reason: Reason | null;
}

export class InputIssue extends Error {
  readonly reason: Reason;
  constructor(reason: Reason) {
    super(reason);
    this.reason = reason;
  }
}

const inputAreas = ["venues", "washrooms", "transit"] as const;
const maxFileBytes = 50_000_000;
const emptyDigest = createHash("sha256").digest("hex");

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function sameFileStamp(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

async function stamp(path: string): Promise<BigIntStats> {
  return lstat(path, { bigint: true });
}

function safeSegment(name: string): boolean {
  return !!name && name !== "." && name !== ".." && !/[\\/\u0000-\u001f\u007f]/u.test(name);
}

export async function physicalRoot(root: string): Promise<string> {
  if (!root.trim()) throw new InputIssue("root-unavailable");
  const named = resolve(root);
  try {
    const prior = await stamp(named);
    if (prior.isSymbolicLink()) throw new InputIssue("unsafe-entry");
    if (!prior.isDirectory()) throw new InputIssue("root-unavailable");
    const physical = await realpath(named);
    if (!sameFileStamp(prior, await stamp(physical))) throw new InputIssue("changed-during-check");
    return physical;
  } catch (error) {
    throw error instanceof InputIssue ? error : new InputIssue("root-unavailable");
  }
}

/** A relative path is always derived from individually validated components. */
export function localPath(root: string, relative: string): string {
  const parts = relative.split("/");
  if (!parts.every(safeSegment)) throw new InputIssue("unsafe-entry");
  return join(root, ...parts);
}

export async function directoryNames(root: string, relative: string): Promise<string[]> {
  const path = localPath(root, relative);
  const before = await stamp(path);
  if (!before.isDirectory() || await realpath(path) !== path) throw new InputIssue("unsafe-entry");
  const names = await readdir(path);
  if (!sameFileStamp(before, await stamp(path))) throw new InputIssue("changed-during-check");
  return names.sort();
}

interface FileEntry {
  path: string;
  stamp: BigIntStats;
}

export async function inputStamp(root: string, relative: string): Promise<BigIntStats> {
  const path = localPath(root, relative);
  const stat = await stamp(path);
  if (!stat.isFile() || await realpath(path) !== path) throw new InputIssue("unsafe-entry");
  if (stat.size > BigInt(maxFileBytes)) throw new InputIssue("file-limit");
  return stat;
}

export async function readStablePart(root: string, relative: string, previous: BigIntStats): Promise<Buffer> {
  const path = localPath(root, relative);
  const file = await open(path, constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_RDONLY);
  try {
    const current = await file.stat({ bigint: true });
    if (!current.isFile() || !sameFileStamp(current, previous) || await realpath(path) !== path) {
      throw new InputIssue("changed-during-check");
    }
    if (current.size > BigInt(maxFileBytes)) throw new InputIssue("file-limit");
    const bytes = Buffer.alloc(Number(current.size));
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = await file.read(bytes, offset, bytes.length - offset, offset);
      if (chunk.bytesRead === 0) throw new InputIssue("changed-during-check");
      offset += chunk.bytesRead;
    }
    const final = await file.stat({ bigint: true });
    const named = await stamp(path).catch(() => null);
    if (!named || !sameFileStamp(current, named) || !sameFileStamp(current, final) ||
        await realpath(path) !== path) throw new InputIssue("changed-during-check");
    return bytes;
  } finally {
    await file.close();
  }
}

async function inventory(root: string): Promise<{ areas: number; files: FileEntry[] }> {
  const files: FileEntry[] = [];
  let areas = 0;
  for (const area of inputAreas) {
    let sources: string[];
    try {
      sources = await directoryNames(root, area);
    } catch (error) {
      if (missing(error)) continue;
      throw error;
    }
    areas++;
    for (const source of sources) {
      if (!safeSegment(source)) throw new InputIssue("unsafe-entry");
      const directory = area + "/" + source;
      for (const name of await directoryNames(root, directory)) {
        if (!name.endsWith(".ndjson.gz")) continue;
        if (!safeSegment(name)) throw new InputIssue("unsafe-entry");
        const path = directory + "/" + name;
        files.push({ path, stamp: await inputStamp(root, path) });
      }
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { areas, files };
}

/**
 * Reproduce the matcher's SHA-256 over sorted "relative-path SHA-256\n" lines.
 * Each inner hash covers the exact compressed input. The result concerns only
 * the input bytes and file count, independent of any rows skipped by the matcher.
 */
export async function checkInputs(dataRoot: string, expectedDigest: string, expectedCount?: number): Promise<InputCheck> {
  const result: InputCheck = {
    status: "unavailable", declaredDigest: expectedDigest, observedDigest: null, files: 0, bytes: 0, reason: null,
  };
  if (!/^[a-f\d]{64}$/u.test(expectedDigest) ||
      (expectedCount !== undefined && (!Number.isSafeInteger(expectedCount) || expectedCount < 0))) {
    result.reason = "invalid-declaration";
    return result;
  }
  try {
    const root = await physicalRoot(dataRoot);
    const start = await inventory(root);
    if (start.areas === 0 && (expectedDigest !== emptyDigest || (expectedCount ?? 0) > 0)) {
      throw new InputIssue("root-unavailable");
    }
    const outer = createHash("sha256");
    for (const entry of start.files) {
      const bytes = await readStablePart(root, entry.path, entry.stamp);
      const hash = createHash("sha256").update(bytes).digest("hex");
      outer.update(entry.path + " " + hash + "\n");
      result.files++;
      result.bytes += bytes.length;
    }
    const end = await inventory(root);
    if (await physicalRoot(dataRoot) !== root || end.files.length !== start.files.length ||
        start.files.some((entry, i) => end.files[i]!.path !== entry.path || !sameFileStamp(entry.stamp, end.files[i]!.stamp))) {
      throw new InputIssue("changed-during-check");
    }
    result.observedDigest = outer.digest("hex");
    if (expectedCount !== undefined && result.files !== expectedCount) result.reason = "count-mismatch";
    else if (result.observedDigest !== expectedDigest) result.reason = "digest-mismatch";
    result.status = result.reason ? "differs" : "matches";
  } catch (error) {
    result.reason = error instanceof InputIssue ? error.reason : "input-unreadable";
  }
  return result;
}
