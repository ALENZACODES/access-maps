import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, linkSync, openSync, readSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { SessionError } from "./session.js";

const maxBytes = 16 * 1024 * 1024;

function readBounded(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > maxBytes) throw new SessionError("input-file-limit");
    const buffer = Buffer.alloc(info.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size !== info.size) throw new SessionError("input-file-changed");
    return buffer.subarray(0, size);
  } finally {
    closeSync(fd);
  }
}

function decode(bytes: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SessionError("invalid-utf8");
  }
}

/** JSON.parse validates syntax. Walk its lexical tokens separately to catch
 * duplicate member names, including escaped spellings of the same key. */
export function parseInput(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SessionError("invalid-json");
  }
  const levels: (Set<string> | null)[] = [];
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[[\]{}]/gu;
  for (const match of text.matchAll(tokens)) {
    const value = match[0];
    if (value === "{" || value === "[") {
      if (levels.length >= 64) throw new SessionError("json-nesting-limit");
      levels.push(value === "{" ? new Set() : null);
    } else if (value === "}" || value === "]") {
      levels.pop();
    } else {
      const keys = levels.at(-1);
      if (!keys) continue;
      let i = match.index! + value.length;
      while (i < text.length && /[\t\r\n ]/u.test(text[i]!)) i++;
      if (text[i] !== ":") continue;
      const key = JSON.parse(value) as string;
      if (keys.has(key)) throw new SessionError("duplicate-json-key");
      keys.add(key);
    }
  }
  return parsed;
}

export function readJson(path: string): unknown {
  return parseInput(decode(readBounded(path)));
}

/** Accept the same .ndjson.gz records as the stored maps shards. Every row
 * enters the selection, so a missing field is diagnosed at intake. */
export function readShard(path: string, field: string): unknown[] {
  let bytes = readBounded(path);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      bytes = gunzipSync(bytes, { maxOutputLength: maxBytes });
    } catch {
      throw new SessionError("invalid-or-oversize-gzip");
    }
  }
  const text = decode(bytes);
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (lines.length === 4096) throw new SessionError("shard-row-limit");
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline;
    lines.push(text.slice(start, end));
    start = end + 1;
  }
  if (!lines.length) throw new SessionError("shard-row-limit");
  return lines.map(line => ({ field, record: parseInput(line) }));
}

/** Create in the destination directory, then expose the complete file in one
 * operation. A concurrent export or existing source file wins the name. */
export function saveOutput(path: string, contents: string): void {
  const temp = join(dirname(path), ".p15-session-" + randomUUID());
  const fd = openSync(temp, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, contents, "utf8");
    } finally {
      closeSync(fd);
    }
    linkSync(temp, path);
  } finally {
    unlinkSync(temp);
  }
}
