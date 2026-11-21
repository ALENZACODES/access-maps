/**
 * Same-place links in the web pack.
 *
 * For every cell with packed records, pack/v1/links/<cell>.json.gz lists the
 * clusters and possible duplicates that have a record in that cell, so a
 * place page can show one page per real place with every source's record
 * side by side. A cluster that spans two cells is listed in both files.
 *
 * Fail-safe rules:
 * - Only records that are in a packed part are named. A record in a held
 *   source, a withheld part, or no longer in the data is left out of its
 *   cluster; a cluster left with fewer than two records is dropped, so the
 *   remaining record gets its own page. Links never bring a held record in.
 * - If the committed link files do not match data/links/index.json, the
 *   pack carries no links at all (one page per record, nothing merged) and
 *   the reason is listed in manifest.withheld. The record parts are packed
 *   as usual.
 * - A cell's link file over the pack file limit is withheld with its reason.
 * - Link files never change a record and never add a value: they only say
 *   which records describe one place, with the matcher's evidence.
 */
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import {
  memberKey,
  placeDataDigest,
  readClusters,
  readLinksIndex,
  readPossibleDuplicates,
  type ClusterLine,
  type LinkMember,
  type PossibleLine,
} from "../places/links.js";
import type { PackManifest } from "./types.js";

// Link omissions apply to an index or cell and have no individual record source or tranche.
type WithheldLinkPart = NonNullable<PackManifest["withheld"]>[number] & { sourceId: null; tranche: null };

export const PACK_LINKS_DIR = "links";

export interface PackLinkMember {
  tranche: string;
  id: string;
  sourceId: string;
  cell: string;
}

export interface PackLinkEvidence {
  a: string;
  b: string;
  score: number;
  distance_m: number;
  name: number | null;
  class_compat: number;
  address: string;
  code: string;
  reason: string;
}

export interface PackCluster {
  id: string;
  members: PackLinkMember[];
  evidence: PackLinkEvidence[];
}

export interface PackPossible {
  a: PackLinkMember;
  b: PackLinkMember;
  score: number;
  distance_m: number;
  why: string;
}

export interface PackLinkCell {
  cell: string;
  method: string;
  clusters: PackCluster[];
  possible: PackPossible[];
}

export interface PackLinksEntry {
  method: string;
  /** True when the links were computed from exactly the record files in data/. */
  current: boolean;
  inputDigest: string;
  dataDigest: string;
  cells: Record<string, { path: string; bytes: number; sha256: string; clusters: number; possible: number }>;
}

function toMember(member: LinkMember): PackLinkMember {
  return { tranche: member.tranche, id: member.id, sourceId: member.source_id, cell: member.cell };
}

async function writeGzipJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.tmp`;
  const gzip = createGzip({ level: 9 });
  const out = createWriteStream(temp);
  gzip.pipe(out);
  gzip.end(JSON.stringify(value));
  await once(out, "finish");
  await rename(temp, file);
}

/**
 * Builds the link part of the pack. `packed` maps the key (tranche|id) of
 * every record in a packed part to its cell. Returns undefined when there
 * are no links or the links are withheld.
 */
export async function buildPackLinks(options: {
  dataRoot: string;
  out: string;
  packed: ReadonlyMap<string, string>;
  limit: number;
  digest: (file: string) => Promise<{ bytes: number; sha256: string }>;
  withhold: (part: WithheldLinkPart) => void;
}): Promise<PackLinksEntry | undefined> {
  const { dataRoot, out, packed, withhold } = options;
  const dir = path.join(out, PACK_LINKS_DIR);
  await rm(dir, { recursive: true, force: true });
  let index;
  try {
    index = readLinksIndex(dataRoot);
  } catch (error) {
    withhold({ path: "links/index.json", sourceId: null, tranche: null, cell: null, reason: `links index is unreadable: ${(error as Error).message}` });
    return undefined;
  }
  if (!index) return undefined;
  const byCell = new Map<string, { clusters: PackCluster[]; possible: PackPossible[] }>();
  const cellEntry = (cell: string) => {
    let entry = byCell.get(cell);
    if (!entry) {
      entry = { clusters: [], possible: [] };
      byCell.set(cell, entry);
    }
    return entry;
  };
  const visible = (member: LinkMember): boolean => packed.get(memberKey(member)) === member.cell;
  try {
    for await (const line of readClusters(dataRoot) as AsyncGenerator<ClusterLine>) {
      const members = line.members.filter(visible);
      if (members.length < 2) continue;
      const keys = new Set(members.map(memberKey));
      const cluster: PackCluster = {
        id: line.cluster,
        members: members.map(toMember),
        evidence: line.evidence
          .filter((edge) => keys.has(edge.a) && keys.has(edge.b))
          .map((edge) => ({
            a: edge.a, b: edge.b, score: edge.score, distance_m: edge.distance_m, name: edge.name,
            class_compat: edge.class_compat, address: edge.address, code: edge.code, reason: edge.reason,
          })),
      };
      for (const cell of new Set(members.map((member) => member.cell))) cellEntry(cell).clusters.push(cluster);
    }
    for await (const line of readPossibleDuplicates(dataRoot) as AsyncGenerator<PossibleLine>) {
      if (!visible(line.a) || !visible(line.b)) continue;
      const item: PackPossible = { a: toMember(line.a), b: toMember(line.b), score: line.evidence.score, distance_m: line.evidence.distance_m, why: line.why };
      for (const cell of new Set([line.a.cell, line.b.cell])) cellEntry(cell).possible.push(item);
    }
  } catch (error) {
    // Under-merge, never over-merge: without trustworthy links every record keeps its own page.
    withhold({ path: "links/same-place", sourceId: null, tranche: null, cell: null, reason: `links do not match data/links/index.json: ${(error as Error).message}` });
    return undefined;
  }
  await mkdir(dir, { recursive: true });
  const entry: PackLinksEntry = {
    method: index.method,
    current: false,
    inputDigest: index.input_digest,
    dataDigest: await placeDataDigest(dataRoot),
    cells: {},
  };
  entry.current = entry.dataDigest === entry.inputDigest;
  for (const cell of [...byCell.keys()].sort()) {
    const { clusters, possible } = byCell.get(cell)!;
    clusters.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    possible.sort((x, y) => {
      const kx = `${x.a.tranche}|${x.a.id}|${x.b.tranche}|${x.b.id}`;
      const ky = `${y.a.tranche}|${y.a.id}|${y.b.tranche}|${y.b.id}`;
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
    const file = path.join(dir, `${cell}.json.gz`);
    const body: PackLinkCell = { cell, method: index.method, clusters, possible };
    await writeGzipJson(file, body);
    let digest;
    try {
      digest = await options.digest(file);
    } catch (error) {
      await rm(file, { force: true });
      withhold({ path: `links/${cell}.json.gz`, sourceId: null, tranche: null, cell, reason: (error as Error).message });
      continue;
    }
    if (digest.bytes > options.limit) {
      await rm(file, { force: true });
      withhold({ path: `links/${cell}.json.gz`, sourceId: null, tranche: null, cell, reason: `link file is ${digest.bytes} bytes, over the ${options.limit} byte limit` });
      continue;
    }
    entry.cells[cell] = { path: `pack/v1/${PACK_LINKS_DIR}/${cell}.json.gz`, ...digest, clusters: clusters.length, possible: possible.length };
  }
  return entry;
}
