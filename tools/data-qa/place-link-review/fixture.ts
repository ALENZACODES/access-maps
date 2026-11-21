import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import fields from "../../../schema/fields.json" with { type: "json" };

type Side = "before" | "after";
const labels = ["alpha", "bravo", "charlie", "delta"] as const;
const cell = "n45.0_w080.0";
const nextCell = "n45.5_w080.0";
const retrieved = "2026-01-10";
const licence = "CC0-1.0";

function member(scenario: string, label: typeof labels[number], location = cell) {
  const source = "fixture-" + label;
  return { tranche: "venue", id: source + ":" + scenario, source_id: source, cell: location };
}

type WireMember = ReturnType<typeof member>;
function key(m: WireMember): string {
  return m.tranche + "|" + m.id;
}

function cluster(members: WireMember[]) {
  const ordered = [...members].sort((a, b) => key(a) < key(b) ? -1 : 1);
  const first = ordered[0]!;
  return {
    method: "same-place-v1",
    cluster: key(first),
    members: ordered,
    evidence: ordered.slice(1).map(other => ({
      a: key(first), b: key(other), distance_m: 2, radius_m: 100,
      class_compat: 1, score: 0.9, name: 0.96, address: "unknown",
      code: "unknown", decision: "match", reason: "name, distance and class agree",
    })),
  };
}

function pair(a: WireMember, b: WireMember) {
  return {
    method: "same-place-v1", a, b, why: "below the match score",
    evidence: {
      distance_m: 14, radius_m: 100, class_compat: 1, score: 0.68, name: 0.55,
      address: "unknown", code: "unknown", decision: "possible", reason: "below the match score",
    },
  };
}

function scenario(side: Side) {
  const split = labels.map(label => member("split", label));
  const merge = labels.map(label => member("merge", label));
  const promote = [member("promote", "alpha"), member("promote", "bravo")] as const;
  const demote = [member("demote", "alpha"), member("demote", "charlie")] as const;
  const same = [member("retained", "alpha"), member("retained", "delta")];
  const moved = [member("move", "alpha", side === "before" ? cell : nextCell), member("move", "bravo")];
  const isolated = [member("possible", "bravo"), member("possible", "delta")] as const;
  const groups = side === "before"
    ? [cluster(split), cluster(merge.slice(0, 2)), cluster(merge.slice(2)), cluster([...demote])]
    : [cluster(split.slice(0, 2)), cluster(split.slice(2)), cluster(merge), cluster([...promote])];
  groups.push(cluster(same), cluster(moved));
  const pairs = [side === "before" ? pair(...promote) : pair(...demote), pair(...isolated)];
  return { groups, pairs };
}

async function bytesAt(root: string, path: string, bytes: Buffer | string) {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes, { flag: "wx" });
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function addLine(buckets: Map<string, string[]>, path: string, row: unknown): void {
  const lines = buckets.get(path) ?? [];
  lines.push(JSON.stringify(row));
  buckets.set(path, lines);
}

function venue(raw: WireMember) {
  const provenance = { source_id: raw.source_id, licence, retrieved_at: retrieved, tier: 0 };
  const value = (field: string): number | string => {
    if (field === "name") return "Synthetic site " + raw.id.split(":")[1];
    if (field === "lat") return raw.cell === cell ? 45.25 : 45.75;
    if (field === "lon") return -79.75;
    return "UNKNOWN";
  };
  return {
    id: raw.id, tranche: raw.tranche, region: raw.cell,
    fields: Object.fromEntries(fields.venue.map(field => [field, { ...provenance, value: value(field) }])),
  };
}

async function stage(root: string, side: Side): Promise<void> {
  const data = join(root, "data");
  const { groups, pairs } = scenario(side);
  const links = new Map<string, string[]>();
  const members = new Map<string, WireMember>();
  for (const group of groups) {
    addLine(links, "links/same-place/" + group.members[0]!.cell + ".jsonl.gz", group);
    for (const item of group.members) members.set(key(item), item);
  }
  for (const candidate of pairs) {
    addLine(links, "links/possible-duplicates/" + candidate.a.cell + ".jsonl.gz", candidate);
    members.set(key(candidate.a), candidate.a);
    members.set(key(candidate.b), candidate.b);
  }
  const records = new Map<string, string[]>();
  for (const item of members.values()) {
    addLine(records, `venues/${item.source_id}/${item.cell}.ndjson.gz`, venue(item));
  }
  const inputHash = createHash("sha256");
  for (const path of [...records.keys()].sort()) {
    const bytes = gzipSync(records.get(path)!.sort().join("\n") + "\n");
    await bytesAt(data, path, bytes);
    inputHash.update(path + " " + digest(bytes) + "\n");
  }
  const files = [];
  for (const path of [...links.keys()].sort()) {
    const lines = links.get(path)!;
    const bytes = gzipSync(lines.join("\n") + "\n");
    await bytesAt(data, path, bytes);
    files.push({ path, bytes: bytes.byteLength, sha256: digest(bytes), lines: lines.length });
  }
  const index = {
    method: "same-place-v1",
    params: {
      radiusM: 100, denseRadiusM: 50, transitRadiusM: 30, areaRadiusM: 250, denseBucketRecords: 120,
      matchScore: 0.72, matchNameMin: 0.6, possibleScore: 0.5, possibleNameMin: 0.4,
      ambiguityMargin: 0.08, unnamedPossibleM: 25, bothUnnamedPossibleM: 8, sameSpotM: 5,
      codeComparableShare: 0.5, codeComparableMin: 10,
    },
    input_digest: inputHash.digest("hex"), input_files: records.size, places_read: members.size, skipped: [],
    clusters: groups.length, records_in_clusters: groups.reduce((count, group) => count + group.members.length, 0),
    possible_duplicates: pairs.length, files,
  };
  const sources = labels.map(label => ({
    id: "fixture-" + label, name: "Synthetic catalogue " + label, kind: "municipal",
    url: "https://example.invalid/" + label, download_url: "https://example.invalid/" + label + "/data",
    licence_name: "CC0 1.0 Universal", licence_id: licence,
    licence_url: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "Synthetic catalogue " + label, retrieved_at: retrieved, tier: 0,
  }));
  await bytesAt(data, "links/index.json", JSON.stringify(index));
  await bytesAt(root, "sources/registry.json", JSON.stringify({ sources }));
}

export interface FixturePaths {
  beforeRoot: string;
  afterRoot: string;
  beforeData: string;
  afterData: string;
  beforeRegistry: string;
  afterRegistry: string;
}

/** Create a pair of fictional publications in a fresh directory. Existing release paths
 * are refused. The caller owns the directory lifetime. No downloads or system clocks. */
export async function writeReviewFixture(root: string): Promise<FixturePaths> {
  const beforeRoot = join(root, "before");
  const afterRoot = join(root, "after");
  await mkdir(root, { recursive: true });
  await mkdir(beforeRoot);
  await mkdir(afterRoot);
  await stage(beforeRoot, "before");
  await stage(afterRoot, "after");
  return {
    beforeRoot, afterRoot, beforeData: join(beforeRoot, "data"), afterData: join(afterRoot, "data"),
    beforeRegistry: join(beforeRoot, "sources", "registry.json"),
    afterRegistry: join(afterRoot, "sources", "registry.json"),
  };
}
