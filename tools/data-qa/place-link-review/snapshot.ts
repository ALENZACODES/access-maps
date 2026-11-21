import { createHash } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { InputIssue, inputStamp, physicalRoot, readStablePart } from "./inputs.ts";

export interface LinkMember {
  tranche: "venue" | "washroom" | "transit";
  id: string;
  sourceId: string;
  cell: string;
}

export interface LinkGroup {
  id: string;
  members: LinkMember[];
  evidenceDigest: string;
  publicationEdges?: Array<{ a: string; b: string; digest: string }>;
}

export interface LinkPair {
  a: LinkMember;
  b: LinkMember;
  evidenceDigest: string;
  publicationDigest?: string;
}

export interface LinkSnapshot {
  method: string;
  inputDigest: string;
  inputFiles?: number;
  skippedCount: number;
  groups: LinkGroup[];
  pairs: LinkPair[];
}

export type SnapshotIssue =
  | "unreadable" | "unsafe-path" | "changed" | "file-size" | "file-digest"
  | "index-format" | "inventory" | "compression" | "row-format"
  | "line-count" | "member-conflict" | "cluster-conflict" | "pair-conflict"
  | "evidence" | "totals";

export class SnapshotError extends Error {
  readonly code: SnapshotIssue;
  constructor(code: SnapshotIssue) {
    super(code);
    this.name = "SnapshotError";
    this.code = code;
  }
}

function requireValue(ok: unknown, code: SnapshotIssue): asserts ok {
  if (!ok) throw new SnapshotError(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8192 && value.trim().length > 0 &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function hash(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function isLinkCell(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = /^([ns])(\d{2}\.[05])_([ew])(\d{3}\.[05])$/u.exec(value);
  if (!parsed) return false;
  const lat = Number(parsed[2]) * (parsed[1] === "s" ? -1 : 1);
  const lon = Number(parsed[4]) * (parsed[3] === "w" ? -1 : 1);
  return !Object.is(lat, -0) && !Object.is(lon, -0) &&
    lat >= -90 && lat < 90 && lon >= -180 && lon < 180;
}

const FAMILIES = ["same-place", "possible-duplicates"] as const;
type Family = (typeof FAMILIES)[number];
type Entry = { file: string; family: Family; cell: string; bytes: number; sha256: string; lines: number };
type Index = {
  method: string;
  digest: string;
  inputFiles: number;
  skipped: number;
  groups: number;
  members: number;
  pairs: number;
  places: number;
  entries: Entry[];
};

// The publisher limits a compressed link shard to 24 MiB and rotates around 96 Mi
// UTF-16 code units. This larger byte bound also admits multibyte source identifiers.
const MAX_COMPRESSED = 24 * 1024 * 1024;
const MAX_EXPANDED = 3 * 96 * 1024 * 1024;
const MAX_INDEX = 16 * 1024 * 1024;
const MAX_ROW = 8 * 1024 * 1024;

function decodeJson(bytes: Buffer, code: SnapshotIssue): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new SnapshotError(code);
  }
}

function readIndex(raw: unknown): Index {
  requireValue(isObject(raw) && isText(raw.method) && isDigest(raw.input_digest), "index-format");
  requireValue(isObject(raw.params) && Object.keys(raw.params).length > 0 &&
    Object.values(raw.params).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0), "index-format");
  requireValue(isCount(raw.input_files) && isCount(raw.places_read) && isCount(raw.clusters) &&
    isCount(raw.records_in_clusters) && isCount(raw.possible_duplicates), "index-format");
  requireValue(Array.isArray(raw.skipped) && raw.skipped.every(
    (row: unknown) => isObject(row) && isText(row.path) && isText(row.reason),
  ), "index-format");
  requireValue(Array.isArray(raw.files), "index-format");
  const entries: Entry[] = [];
  const seen = new Set<string>();
  const runs = new Map<string, number[]>();
  let clusters = 0;
  let pairs = 0;
  for (const input of raw.files as unknown[]) {
    requireValue(isObject(input) && typeof input.path === "string", "index-format");
    const match = /^links\/(same-place|possible-duplicates)\/([ns]\d{2}\.[05]_[ew]\d{3}\.[05])(?:\.p([1-9]\d*))?\.jsonl\.gz$/u.exec(input.path);
    requireValue(match && isLinkCell(match[2]), "unsafe-path");
    const part = match[3] === undefined ? 1 : Number(match[3]);
    requireValue(Number.isSafeInteger(part) && (match[3] === undefined || part > 1), "inventory");
    requireValue(isCount(input.bytes) && input.bytes > 0 && input.bytes <= MAX_COMPRESSED &&
      isCount(input.lines) && input.lines > 0 && isDigest(input.sha256), "index-format");
    requireValue(!seen.has(input.path), "inventory");
    seen.add(input.path);
    const family = match[1] as Family;
    const cell = match[2];
    const runKey = family + "/" + cell;
    const run = runs.get(runKey) ?? [];
    run.push(part);
    runs.set(runKey, run);
    entries.push({ family, cell, file: input.path, bytes: input.bytes, sha256: input.sha256, lines: input.lines });
    if (family === "same-place") clusters += input.lines;
    else pairs += input.lines;
  }
  for (const run of runs.values()) {
    run.sort((a, b) => a - b);
    requireValue(run.every((part, index) => part === index + 1), "inventory");
  }
  requireValue(clusters === raw.clusters && pairs === raw.possible_duplicates &&
    raw.records_in_clusters >= clusters * 2 && raw.records_in_clusters <= raw.places_read, "totals");
  return {
    method: raw.method, digest: raw.input_digest, inputFiles: raw.input_files, skipped: raw.skipped.length,
    groups: raw.clusters, members: raw.records_in_clusters, pairs: raw.possible_duplicates,
    places: raw.places_read, entries,
  };
}

function isMissing(error: unknown): boolean {
  return isObject(error) && error.code === "ENOENT";
}

async function checkDirectory(dir: string): Promise<void> {
  const stat = await lstat(dir);
  requireValue(stat.isDirectory() && await realpath(dir) === dir, "unsafe-path");
}

async function checkInventory(links: string, entries: Entry[]): Promise<void> {
  await checkDirectory(links);
  const expected = new Set(entries.map(entry => entry.file));
  let found = 0;
  for (const family of FAMILIES) {
    const dir = join(links, family);
    try {
      await checkDirectory(dir);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (const file of await readdir(dir, { withFileTypes: true })) {
      if (!file.name.endsWith(".jsonl.gz")) continue;
      requireValue(file.isFile() && expected.has(`links/${family}/${file.name}`), "inventory");
      found++;
    }
  }
  requireValue(found === expected.size, "inventory");
}

async function readRegular(root: string, relative: string, maximum: number, exact?: number): Promise<Buffer> {
  const stamp = await inputStamp(root, relative);
  const length = Number(stamp.size);
  requireValue(length > 0 && length <= maximum && (exact === undefined || exact === length), "file-size");
  return readStablePart(root, relative, stamp);
}

function key(member: LinkMember): string {
  return member.tranche + "|" + member.id;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readMember(raw: unknown, all: Map<string, LinkMember>): LinkMember {
  requireValue(isObject(raw) && (raw.tranche === "venue" || raw.tranche === "washroom" || raw.tranche === "transit") &&
    isText(raw.id) && isText(raw.source_id) && isLinkCell(raw.cell), "row-format");
  const identity = raw.tranche + "|" + raw.id;
  const previous = all.get(identity);
  if (previous) {
    requireValue(previous.sourceId === raw.source_id && previous.cell === raw.cell, "member-conflict");
    return previous;
  }
  const member = { tranche: raw.tranche, id: raw.id, sourceId: raw.source_id, cell: raw.cell } satisfies LinkMember;
  all.set(identity, member);
  return member;
}

function boundedNumber(value: unknown, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

// Fixed field order makes the evidence fingerprint independent of the JSON writer's
// property order. Reject unsupported fields rather than silently omitting evidence.
function evidence(raw: Record<string, unknown>, match: boolean): unknown[] {
  const { decision, score, name, radius_m, distance_m, class_compat, address, code, reason } = raw;
  const fields = match ? 11 : 9;
  requireValue(Object.keys(raw).length === fields &&
    boundedNumber(score, 1) && (name === null || boundedNumber(name, 1)) && boundedNumber(class_compat, 1) &&
    boundedNumber(distance_m, Number.MAX_SAFE_INTEGER) && boundedNumber(radius_m, Number.MAX_SAFE_INTEGER) &&
    (address === "unknown" || address === "same" || address === "different_number" || address === "different_street") &&
    (code === "unknown" || code === "same" || code === "different") &&
    (decision === "match" || (!match && decision === "possible")) && isText(reason), "evidence");
  return [decision, score, name, radius_m, distance_m, class_compat, address, code, reason];
}

/** The pack writer publishes this subset of the matcher evidence for a group edge.
 * The pair of endpoint keys is bound separately by the caller. */
export function publishedEdgeDigest(edge: Record<string, unknown>): string {
  return hash(JSON.stringify([edge.score, edge.distance_m, edge.name, edge.class_compat,
    edge.address, edge.code, edge.reason]));
}

export function publishedPairDigest(score: unknown, distance: unknown, why: unknown): string {
  return hash(JSON.stringify([score, distance, why]));
}

function groupEvidence(raw: unknown, members: LinkMember[]): Pick<LinkGroup, "evidenceDigest" | "publicationEdges"> {
  requireValue(Array.isArray(raw) && raw.length >= members.length - 1, "evidence");
  const neighbours = new Map(members.map(member => [key(member), new Set<string>()]));
  const rows: string[] = [];
  const publicationEdges: NonNullable<LinkGroup["publicationEdges"]> = [];
  for (const edge of raw as unknown[]) {
    requireValue(isObject(edge) && isText(edge.a) && isText(edge.b) && edge.a !== edge.b, "evidence");
    const left = neighbours.get(edge.a);
    const right = neighbours.get(edge.b);
    requireValue(left && right && !left.has(edge.b), "evidence");
    left.add(edge.b);
    right.add(edge.a);
    const [a, b] = edge.a < edge.b ? [edge.a, edge.b] : [edge.b, edge.a];
    rows.push(JSON.stringify([a, b, ...evidence(edge, true)]));
    publicationEdges.push({ a, b, digest: publishedEdgeDigest(edge) });
  }
  const reached = new Set<string>();
  const queue = [key(members[0]!)];
  while (queue.length > 0) {
    const endpoint = queue.pop()!;
    if (reached.has(endpoint)) continue;
    reached.add(endpoint);
    for (const next of neighbours.get(endpoint)!) if (!reached.has(next)) queue.push(next);
  }
  requireValue(reached.size === members.length, "evidence");
  publicationEdges.sort((x, y) => compare(x.a, y.a) || compare(x.b, y.b));
  return { evidenceDigest: hash(JSON.stringify(rows.sort())), publicationEdges };
}

interface Collected {
  groups: LinkGroup[];
  pairs: LinkPair[];
  members: Map<string, LinkMember>;
  assigned: Set<string>;
  ids: Set<string>;
  pairIds: Set<string>;
}

function readGroup(row: Record<string, unknown>, cell: string, state: Collected): void {
  requireValue(isText(row.cluster) && Array.isArray(row.members) && row.members.length >= 2, "row-format");
  const members = (row.members as unknown[]).map(member => readMember(member, state.members));
  members.sort((a, b) => compare(key(a), key(b)));
  requireValue(members[0]!.cell === cell &&
    (row.method !== "same-place-v1" || row.cluster === key(members[0]!)), "cluster-conflict");
  requireValue(!state.ids.has(row.cluster), "cluster-conflict");
  const sources = new Set<string>();
  for (const member of members) {
    const identity = key(member);
    requireValue(!state.assigned.has(identity) && !sources.has(member.sourceId), "cluster-conflict");
    state.assigned.add(identity);
    sources.add(member.sourceId);
  }
  state.ids.add(row.cluster);
  state.groups.push({ id: row.cluster, members, ...groupEvidence(row.evidence, members) });
}

function readPair(row: Record<string, unknown>, cell: string, state: Collected): void {
  const first = readMember(row.a, state.members);
  const second = readMember(row.b, state.members);
  requireValue(first.cell === cell && first.sourceId !== second.sourceId, "pair-conflict");
  const [a, b] = key(first) < key(second) ? [first, second] : [second, first];
  const identity = JSON.stringify([key(a), key(b)]);
  requireValue(!state.pairIds.has(identity), "pair-conflict");
  requireValue(isObject(row.evidence) && isText(row.why), "evidence");
  const digest = hash(JSON.stringify([row.why, ...evidence(row.evidence, false)]));
  state.pairIds.add(identity);
  state.pairs.push({ a, b, evidenceDigest: digest, publicationDigest: publishedPairDigest(
    row.evidence.score, row.evidence.distance_m, row.why,
  ) });
}

async function readShard(root: string, entry: Entry, method: string, state: Collected): Promise<void> {
  const gzip = await readRegular(root, entry.file, MAX_COMPRESSED, entry.bytes);
  requireValue(hash(gzip) === entry.sha256, "file-digest");
  let data: Buffer;
  try {
    data = gunzipSync(gzip, { maxOutputLength: MAX_EXPANDED });
  } catch {
    throw new SnapshotError("compression");
  }
  let offset = 0;
  let lines = 0;
  while (offset < data.length) {
    const newline = data.indexOf(10, offset);
    const end = newline < 0 ? data.length : newline;
    requireValue(end > offset && end - offset <= MAX_ROW, "row-format");
    const row = decodeJson(data.subarray(offset, end), "row-format");
    requireValue(isObject(row) && row.method === method, "row-format");
    if (entry.family === "same-place") readGroup(row, entry.cell, state);
    else readPair(row, entry.cell, state);
    offset = end + 1;
    requireValue(++lines <= entry.lines, "line-count");
  }
  requireValue(lines === entry.lines, "line-count");
}

/** Load a complete local publication. inputDigest is the publisher's declaration
 * about source partitions. Inspecting link bytes alone cannot substantiate it. */
export async function readSnapshot(dataRoot: string): Promise<LinkSnapshot> {
  try {
    const root = await physicalRoot(dataRoot);
    const links = join(root, "links");
    await checkDirectory(links);
    const indexFile = "links/index.json";
    const initial = await readRegular(root, indexFile, MAX_INDEX);
    const index = readIndex(decodeJson(initial, "index-format"));
    await checkInventory(links, index.entries);
    const state: Collected = {
      groups: [], pairs: [], members: new Map(), assigned: new Set(), ids: new Set(), pairIds: new Set(),
    };
    for (const entry of index.entries) await readShard(root, entry, index.method, state);
    requireValue(state.groups.length === index.groups && state.assigned.size === index.members &&
      state.pairs.length === index.pairs && state.members.size <= index.places, "totals");
    // A matcher run swaps the whole publication directory. Never mix two
    // indexes if the directory is republished in the middle of this scan.
    await checkInventory(links, index.entries);
    requireValue(initial.equals(await readRegular(root, indexFile, MAX_INDEX)), "changed");
    state.groups.sort((a, b) => compare(a.id, b.id));
    state.pairs.sort((a, b) => compare(key(a.a), key(b.a)) || compare(key(a.b), key(b.b)));
    return {
      method: index.method, inputDigest: index.digest, inputFiles: index.inputFiles,
      skippedCount: index.skipped, groups: state.groups, pairs: state.pairs,
    };
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    if (error instanceof InputIssue) {
      if (error.reason === "unsafe-entry") throw new SnapshotError("unsafe-path");
      if (error.reason === "changed-during-check") throw new SnapshotError("changed");
      if (error.reason === "file-limit") throw new SnapshotError("file-size");
    }
    throw new SnapshotError("unreadable");
  }
}
