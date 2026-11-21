import { gunzipSync } from "node:zlib";
import fieldNames from "../../../schema/fields.json" with { type: "json" };
import {
  directoryNames, inputStamp, InputIssue, physicalRoot, readStablePart, sameFileStamp,
} from "./inputs.ts";
import { canDiscloseSources, type SourceCatalogue, type SourceEvidence } from "./provenance.ts";
import { isLinkCell, type LinkMember } from "./snapshot.ts";

export interface FieldInspection {
  /** Count of expected fields according to the tranche's shipped record schema. */
  total: number;
  /** Only an explicitly recorded value of "UNKNOWN" contributes to this count. */
  unknown: number;
  /** Required fields absent or lacking a value. These do not contribute to unknown. */
  missing: number;
  /** Present fields whose source, licence, retrieval date or tier differs from the named registry. */
  invalidProvenance: number;
}

export interface MemberInspection {
  member: LinkMember | null;
  sourceId: string;
  licence: string | null;
  retrievedOn: string | null;
  verificationTier: number | null;
  status: "matched" | "absent" | "duplicate" | "mismatch" | "unavailable" | "restricted";
  reason: string | null;
  partsRead: number;
  matchingRows: number | null;
  fields: FieldInspection | null;
  accessibility: "UNKNOWN";
}

const areas = { venue: "venues", washroom: "washrooms", transit: "transit" } as const;
const maxDecoded = 64 * 1024 * 1024;

class PartitionIssue extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

function ordinary(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw);
}

function fieldsOf(row: Record<string, unknown>, member: LinkMember, source: SourceEvidence): FieldInspection {
  const keys = fieldNames[member.tranche];
  const fields: FieldInspection = { total: keys.length, unknown: 0, missing: 0, invalidProvenance: 0 };
  const map = ordinary(row.fields) ? row.fields : {};
  for (const key of keys) {
    const field = map[key];
    if (!ordinary(field)) {
      fields.missing++;
      continue;
    }
    if (!Object.hasOwn(field, "value") || field.value === null) fields.missing++;
    else if (field.value === "UNKNOWN") fields.unknown++;
    if (field.source_id !== source.sourceId || field.licence !== source.licence ||
        field.retrieved_at !== source.retrievedOn || field.tier !== source.verificationTier) {
      fields.invalidProvenance++;
    }
  }
  return fields;
}

function partitionKeys(names: string[], cell: string): string[] {
  const regex = /^\.p(\d+)\.ndjson\.gz$/u;
  const keys: Array<{ name: string; number: number }> = [];
  for (const name of names) {
    if (!name.startsWith(cell + ".") || !name.endsWith(".ndjson.gz")) continue;
    const tail = name.slice(cell.length);
    if (tail === ".ndjson.gz") {
      keys.push({ name, number: 1 });
      continue;
    }
    const index = regex.exec(tail);
    const number = Number(index?.[1]);
    if (!Number.isSafeInteger(number) || number < 2 || tail !== ".p" + String(number).padStart(2, "0") + ".ndjson.gz") {
      throw new PartitionIssue("partition-sequence");
    }
    keys.push({ name, number });
  }
  keys.sort((a, b) => a.number - b.number);
  if (keys.length === 0) throw new PartitionIssue("partition-unavailable");
  if (!keys.every((key, i) => key.number === i + 1)) throw new PartitionIssue("partition-sequence");
  return keys.map(key => key.name);
}

function safeLocator(member: LinkMember): boolean {
  return Object.hasOwn(areas, member.tranche) && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u.test(member.sourceId) &&
    isLinkCell(member.cell);
}

function evidence(member: LinkMember, source: SourceEvidence | undefined, restricted: boolean): MemberInspection {
  return {
    member: restricted ? null : { ...member }, sourceId: member.sourceId, licence: source?.licence ?? null,
    retrievedOn: source?.retrievedOn ?? null, verificationTier: source?.verificationTier ?? null,
    status: restricted ? "restricted" : "unavailable", reason: restricted ? "source-restricted" : null,
    partsRead: 0, matchingRows: null, fields: null, accessibility: "UNKNOWN",
  };
}

interface MemberTarget {
  member: LinkMember;
  source: SourceEvidence;
  result: MemberInspection;
  matches: number;
  fields: FieldInspection | null;
  reason: string | null;
}

function visitRow(raw: unknown, targets: Map<string, MemberTarget>, partition: LinkMember) {
  if (!ordinary(raw) || typeof raw.id !== "string" || !raw.id) throw new PartitionIssue("invalid-partition");
  const target = targets.get(raw.id);
  const misplaced = raw.tranche !== partition.tranche || raw.region !== partition.cell;
  if (!target) {
    if (misplaced) throw new PartitionIssue("invalid-partition");
    return;
  }
  target.matches++;
  if (target.matches > 1) return;
  if (misplaced) {
    target.reason = "record-header";
    return;
  }
  const fields = fieldsOf(raw, target.member, target.source);
  target.fields = fields;
  if (fields.invalidProvenance) target.reason = "field-provenance";
  else if (fields.missing) target.reason = "missing-fields";
  else if (ordinary(raw.fields) && Object.keys(raw.fields).some(key => !fieldNames[partition.tranche].includes(key))) {
    target.reason = "unexpected-fields";
  }
}

function visitPart(bytes: Buffer, targets: Map<string, MemberTarget>, member: LinkMember): void {
  let text: string;
  try {
    const plain = gunzipSync(bytes, { maxOutputLength: maxDecoded });
    text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw new PartitionIssue("invalid-partition");
  }
  let position = 0;
  while (position < text.length) {
    const newline = text.indexOf("\n", position);
    const end = newline < 0 ? text.length : newline;
    const line = text.slice(position, end);
    position = end + 1;
    if (!line.trim()) continue;
    let row: unknown;
    try { row = JSON.parse(line); } catch { throw new PartitionIssue("invalid-partition"); }
    visitRow(row, targets, member);
  }
}

function complete(target: MemberTarget, partsRead: number): void {
  const row = target.result;
  row.partsRead = partsRead;
  row.matchingRows = target.matches;
  if (target.matches === 0) {
    row.status = "absent";
    row.reason = "no-matching-row";
  } else if (target.matches > 1) {
    row.status = "duplicate";
    row.reason = "duplicate-record";
  } else {
    row.fields = target.fields;
    row.status = target.reason ? "mismatch" : "matched";
    row.reason = target.reason;
  }
}

async function inspectPartition(root: string, group: MemberTarget[]): Promise<void> {
  const member = group[0]!.member;
  const area = areas[member.tranche];
  const directory = area + "/" + member.sourceId;
  let partsRead = 0;
  try {
    if (!safeLocator(member)) throw new PartitionIssue("unsafe-entry");
    const targets = new Map(group.map(target => [target.member.id, target]));
    const names = partitionKeys(await directoryNames(root, directory), member.cell);
    const stamps = [];
    for (const name of names) {
      const relative = directory + "/" + name;
      const before = await inputStamp(root, relative);
      stamps.push(before);
      const bytes = await readStablePart(root, relative, before);
      visitPart(bytes, targets, member);
      partsRead++;
    }
    const finalNames = partitionKeys(await directoryNames(root, directory), member.cell);
    if (finalNames.length !== names.length || finalNames.some((name, i) => name !== names[i])) {
      throw new PartitionIssue("changed-during-check");
    }
    for (const [i, name] of names.entries()) {
      if (!sameFileStamp(stamps[i]!, await inputStamp(root, directory + "/" + name))) {
        throw new PartitionIssue("changed-during-check");
      }
    }
    for (const target of group) complete(target, partsRead);
  } catch (error) {
    const reason = error instanceof InputIssue || error instanceof PartitionIssue ? error.reason : "partition-unavailable";
    for (const target of group) {
      target.result.reason = reason;
      target.result.partsRead = partsRead;
    }
  }
}

/** Scan each selected source/cell/tranche once. Fields and coordinates never leave the partition reader.
 * An absent result means no matching ID in the complete observed part sequence for this cell.
 * A release's optional input fingerprint check independently detects omitted files in the overall input tree.
 */
export async function inspectMembers(
  dataRoot: string, members: Iterable<LinkMember>, registry: SourceCatalogue,
): Promise<MemberInspection[]> {
  const results = new Map<string, MemberInspection>();
  const partitions = new Map<string, MemberTarget[]>();
  for (const member of members) {
    const source = registry.get(member.sourceId);
    const permitted = !!source && source.sourceId === member.sourceId && canDiscloseSources(registry, [member.sourceId]);
    const key = JSON.stringify([member.tranche, member.sourceId, member.cell, member.id]);
    if (results.has(key)) continue;
    const row = evidence(member, source, !permitted);
    results.set(key, row);
    if (!permitted) continue;
    const bucket = JSON.stringify([member.tranche, member.sourceId, member.cell]);
    const list = partitions.get(bucket) ?? [];
    list.push({ member, source, result: row, matches: 0, fields: null, reason: null });
    partitions.set(bucket, list);
  }
  if (partitions.size) {
    let root: string | undefined;
    try { root = await physicalRoot(dataRoot); } catch (error) {
      const reason = error instanceof InputIssue ? error.reason : "root-unavailable";
      for (const targets of partitions.values()) for (const target of targets) target.result.reason = reason;
    }
    if (root) for (const group of partitions.values()) await inspectPartition(root, group);
  }
  return [...results].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row);
}
