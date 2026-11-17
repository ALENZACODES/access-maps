/**
 * Distinct places: the number of real places behind the venue, washroom and
 * transit records once records that the same-place links join are counted
 * once. This is the number the place-page target is measured against.
 *
 * Definition (also printed in COUNTS.md):
 * - A place record is a record in the venue, washroom or transit tranche.
 *   Paths are not places.
 * - A cluster is one line of data/links/same-place: records from different
 *   sources that the matcher linked as one real place.
 * - Distinct places = place records that are in no cluster + clusters with at
 *   least one of their records present in the data. A link to a record that
 *   is no longer in the data is ignored.
 * - Possible duplicates are not merged: each side stays its own place.
 * - A distinct place has a known accessibility fact when at least one of its
 *   records has a populated, non-derived accessibility field (the same field
 *   lists as the piece counts). UNKNOWN is not a fact.
 * - Per source: "only in this source" is the number of distinct places whose
 *   every record comes from that source, that is, the places that source
 *   alone adds. "Shared" is the number of distinct places it shares with at
 *   least one other source. Neither depends on the order sources were added.
 */
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { isAccessibilityField } from "./accessibility.js";
import { isPiece, type FieldValue } from "../model/provenance.js";
import type { Tranche } from "../model/records.js";
import { memberKey, readClusters, readLinksIndex } from "../places/links.js";
import { recordKey, recordSource } from "../places/match.js";

export const DISTINCT_DEFINITION =
  "A place is a venue, washroom or transit record; paths are not places. Records from different sources that the same-place matcher links (data/links/same-place) count as one distinct place. Distinct places = place records in no link cluster + link clusters with at least one record present. Possible duplicates are not merged. A distinct place has a known accessibility fact when at least one of its records has a populated, non-derived accessibility field. \"Only in this source\" counts the distinct places whose every record comes from that source.";

export const PLACE_TRANCHES: readonly Tranche[] = ["venue", "washroom", "transit"];

export interface DistinctSourceSlice {
  records: number;
  /** Distinct places whose every record comes from this source. */
  only_in_this_source: number;
  /** Distinct places this source shares with at least one other source. */
  shared_with_other_sources: number;
}

export interface DistinctReport {
  definition: string;
  place_records: number;
  distinct_places: number;
  records_joined_by_links: number;
  clusters: number;
  with_known_accessibility_fact: number;
  by_source: Record<string, DistinctSourceSlice>;
  links: {
    method: string | null;
    /** True when the links were computed from exactly these record files. */
    current: boolean;
    input_digest: string | null;
    data_digest: string;
    possible_duplicates: number;
    links_to_missing_records: number;
  };
}

interface ClusterState {
  present: number;
  sources: Set<string>;
  access: boolean;
}

function hasAccessibilityFact(tranche: Tranche, fields: Record<string, FieldValue>): boolean {
  for (const [name, field] of Object.entries(fields)) {
    if (isAccessibilityField(tranche, name) && isPiece(field)) return true;
  }
  return false;
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * `files` are the record files (absolute paths) under `dataRoot`; only the
 * venue, washroom and transit ones are read. Streams; keeps one entry per
 * linked record and one small object per source.
 */
export async function countDistinctPlaces(dataRoot: string, files: readonly string[]): Promise<DistinctReport> {
  const clusterOf = new Map<string, string>();
  const clusters = new Map<string, ClusterState>();
  for await (const line of readClusters(dataRoot)) {
    clusters.set(line.cluster, { present: 0, sources: new Set(), access: false });
    for (const member of line.members) clusterOf.set(memberKey(member), line.cluster);
  }
  const index = readLinksIndex(dataRoot);
  const placeDirs = new Set(["venues", "washrooms", "transit"]);
  const placeFiles = files
    .map((file) => ({ file, relative: path.relative(dataRoot, file).split(path.sep).join("/") }))
    .filter((item) => placeDirs.has(item.relative.split("/")[0] ?? ""))
    .sort((a, b) => (a.relative < b.relative ? -1 : 1));
  const digest = createHash("sha256");
  const bySource: Record<string, DistinctSourceSlice> = {};
  const source = (id: string): DistinctSourceSlice => (bySource[id] ??= { records: 0, only_in_this_source: 0, shared_with_other_sources: 0 });
  let placeRecords = 0;
  let singles = 0;
  let singleAccess = 0;
  let linkedPresent = 0;
  for (const { file, relative } of placeFiles) {
    digest.update(`${relative} ${await sha256(file)}\n`);
    const input = createReadStream(file).pipe(createGunzip());
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const record = JSON.parse(line) as { id: string; tranche: Tranche; fields: Record<string, FieldValue> };
      if (!PLACE_TRANCHES.includes(record.tranche)) continue;
      placeRecords += 1;
      const sourceId = recordSource(record) ?? "unknown";
      source(sourceId).records += 1;
      const access = hasAccessibilityFact(record.tranche, record.fields);
      const cluster = clusterOf.get(recordKey(record.tranche, record.id));
      if (cluster === undefined) {
        singles += 1;
        if (access) singleAccess += 1;
        source(sourceId).only_in_this_source += 1;
        continue;
      }
      linkedPresent += 1;
      const state = clusters.get(cluster)!;
      state.present += 1;
      state.sources.add(sourceId);
      if (access) state.access = true;
    }
  }
  let presentClusters = 0;
  let clusterAccess = 0;
  for (const state of clusters.values()) {
    if (state.present === 0) continue;
    presentClusters += 1;
    if (state.access) clusterAccess += 1;
    const sources = [...state.sources];
    if (sources.length === 1) source(sources[0]!).only_in_this_source += 1;
    else for (const id of sources) source(id).shared_with_other_sources += 1;
  }
  const dataDigest = digest.digest("hex");
  const sortedSources = Object.fromEntries(Object.entries(bySource).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  return {
    definition: DISTINCT_DEFINITION,
    place_records: placeRecords,
    distinct_places: singles + presentClusters,
    records_joined_by_links: linkedPresent,
    clusters: presentClusters,
    with_known_accessibility_fact: singleAccess + clusterAccess,
    by_source: sortedSources,
    links: {
      method: index?.method ?? null,
      current: index !== null && index.input_digest === dataDigest,
      input_digest: index?.input_digest ?? null,
      data_digest: dataDigest,
      possible_duplicates: index?.possible_duplicates ?? 0,
      links_to_missing_records: clusterOf.size - linkedPresent,
    },
  };
}

export function renderDistinctMarkdown(report: DistinctReport): string {
  const n = (value: number) => value.toLocaleString("en-CA");
  const lines: string[] = [];
  lines.push("");
  lines.push("## Distinct places");
  lines.push("");
  lines.push(report.definition);
  lines.push("");
  lines.push(`Place records (venue, washroom, transit): **${n(report.place_records)}**.`);
  lines.push(`Distinct places: **${n(report.distinct_places)}**.`);
  lines.push(`Records joined by same-place links: **${n(report.records_joined_by_links)}** in **${n(report.clusters)}** clusters.`);
  lines.push(`Distinct places with at least one known accessibility fact: **${n(report.with_known_accessibility_fact)}**.`);
  lines.push(`Possible duplicates listed for review and not merged: **${n(report.links.possible_duplicates)}**.`);
  lines.push(
    report.links.current
      ? `The links were computed from exactly these record files (method ${report.links.method}).`
      : report.links.method === null
        ? "There are no same-place links: every place record is counted as its own place."
        : `The links are older than the record files (method ${report.links.method}): records added or changed since the last \`npm run match:places\` are counted as their own places until it is run again.`,
  );
  if (report.links.links_to_missing_records > 0) {
    lines.push(`Links that name a record no longer in the data (ignored): **${n(report.links.links_to_missing_records)}**.`);
  }
  lines.push("");
  lines.push("| Source | Place records | Distinct places only in this source | Distinct places shared with another source |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const [id, slice] of Object.entries(report.by_source)) {
    lines.push(`| ${id} | ${slice.records} | ${slice.only_in_this_source} | ${slice.shared_with_other_sources} |`);
  }
  lines.push("");
  return lines.join("\n");
}
