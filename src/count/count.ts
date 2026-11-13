import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import {
  TOTAL_TARGET,
  TRANCHE_TARGETS,
  TRANCHES,
  type DataRecord,
  type Tranche,
} from "../model/records.js";
import { isDerivedExcluded, isGap, isPiece, type FieldValue } from "../model/provenance.js";

export interface Slice {
  records: number;
  pieces: number;
  gaps: number;
  derived_excluded: number;
  pieces_by_tier: Record<string, number>;
  gaps_by_tier: Record<string, number>;
  pieces_by_source: Record<string, number>;
  pieces_by_retrieved_at: Record<string, number>;
  gaps_by_retrieved_at: Record<string, number>;
  gap_fields: Record<string, number>;
}

export interface SourceSlice {
  records: number;
  pieces: number;
  gaps: number;
  derived_excluded: number;
  pieces_by_tier: Record<string, number>;
  pieces_by_tranche: Record<string, number>;
  pieces_by_retrieved_at: Record<string, number>;
}

export interface Shortfall {
  tranche: Tranche;
  pieces: number;
  illustrative_target: number;
  shortfall: number;
}

export interface CountReport {
  definition: string;
  records: number;
  pieces: number;
  gaps: number;
  derived_excluded: number;
  by_tranche: Record<Tranche, Slice>;
  by_source: Record<string, SourceSlice>;
  shortfalls: Shortfall[];
  illustrative_total_target: number;
  total_shortfall: number;
}

export function emptySlice(): Slice {
  return {
    records: 0,
    pieces: 0,
    gaps: 0,
    derived_excluded: 0,
    pieces_by_tier: {},
    gaps_by_tier: {},
    pieces_by_source: {},
    pieces_by_retrieved_at: {},
    gaps_by_retrieved_at: {},
    gap_fields: {},
  };
}

export class RecordCounter {
  private readonly seen = new Map<Tranche, Set<string>>(TRANCHES.map((tranche) => [tranche, new Set()]));
  private readonly byTranche = Object.fromEntries(TRANCHES.map((tranche) => [tranche, emptySlice()])) as Record<
    Tranche,
    Slice
  >;
  private readonly bySource: Record<string, SourceSlice> = {};

  add(record: DataRecord): void {
    const ids = this.seen.get(record.tranche);
    if (!ids) throw new Error(`unknown tranche ${record.tranche}`);
    if (ids.has(record.id)) throw new Error(`duplicate ${record.tranche} id ${record.id}`);
    ids.add(record.id);
    const slice = this.byTranche[record.tranche];
    slice.records += 1;
    const sourcesOnRecord = new Set<string>();
    for (const [fieldName, field] of Object.entries(record.fields)) {
      addField(slice, this.bySource, record.tranche, fieldName, field);
      sourcesOnRecord.add(field.source_id);
    }
    for (const sourceId of sourcesOnRecord) ensureSource(this.bySource, sourceId).records += 1;
  }

  finish(): CountReport {
    return finishReport(this.byTranche, this.bySource);
  }
}

export function countRecords(records: DataRecord[]): CountReport {
  const counter = new RecordCounter();
  for (const record of records) counter.add(record);
  return counter.finish();
}

function finishReport(byTranche: Record<Tranche, Slice>, bySource: Record<string, SourceSlice>): CountReport {
  const shortfalls = TRANCHES.map((tranche) => {
    const pieces = byTranche[tranche].pieces;
    const target = TRANCHE_TARGETS[tranche];
    return {
      tranche,
      pieces,
      illustrative_target: target,
      shortfall: Math.max(0, target - pieces),
    };
  });
  const pieces = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].pieces, 0);
  const gaps = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].gaps, 0);
  const derived = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].derived_excluded, 0);
  const recordsTotal = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].records, 0);
  return {
    definition:
      "A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. The same fact is not stored on two tranches.",
    records: recordsTotal,
    pieces,
    gaps,
    derived_excluded: derived,
    by_tranche: byTranche,
    by_source: bySource,
    shortfalls,
    illustrative_total_target: TOTAL_TARGET,
    total_shortfall: Math.max(0, TOTAL_TARGET - pieces),
  };
}

export async function countNdjsonGz(files: string[]): Promise<CountReport> {
  const counter = new RecordCounter();
  for (const file of files) {
    const stream = readline.createInterface({
      input: createReadStream(file).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of stream) {
      if (!line.trim()) continue;
      counter.add(JSON.parse(line) as DataRecord);
    }
  }
  return counter.finish();
}

function addField(
  slice: Slice,
  bySource: Record<string, SourceSlice>,
  tranche: Tranche,
  fieldName: string,
  field: FieldValue,
): void {
  const source = ensureSource(bySource, field.source_id);
  if (isPiece(field)) {
    slice.pieces += 1;
    bump(slice.pieces_by_tier, String(field.tier));
    bump(slice.pieces_by_source, field.source_id);
    bump(slice.pieces_by_retrieved_at, field.retrieved_at);
    source.pieces += 1;
    bump(source.pieces_by_tier, String(field.tier));
    bump(source.pieces_by_tranche, tranche);
    bump(source.pieces_by_retrieved_at, field.retrieved_at);
    return;
  }
  if (isGap(field)) {
    slice.gaps += 1;
    bump(slice.gaps_by_tier, String(field.tier));
    bump(slice.gaps_by_retrieved_at, field.retrieved_at);
    bump(slice.gap_fields, fieldName);
    source.gaps += 1;
    return;
  }
  if (isDerivedExcluded(field)) {
    slice.derived_excluded += 1;
    source.derived_excluded += 1;
  }
}

function ensureSource(bySource: Record<string, SourceSlice>, sourceId: string): SourceSlice {
  const existing = bySource[sourceId];
  if (existing) return existing;
  const created: SourceSlice = {
    records: 0,
    pieces: 0,
    gaps: 0,
    derived_excluded: 0,
    pieces_by_tier: {},
    pieces_by_tranche: {},
    pieces_by_retrieved_at: {},
  };
  bySource[sourceId] = created;
  return created;
}

function bump(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

export function renderCountsMarkdown(report: CountReport): string {
  const lines: string[] = [];
  lines.push("# Field-value counts");
  lines.push("");
  lines.push(report.definition);
  lines.push("");
  lines.push(`Total pieces: **${report.pieces.toLocaleString("en-CA")}**.`);
  lines.push(`Total UNKNOWN gaps: **${report.gaps.toLocaleString("en-CA")}**.`);
  lines.push(`Derived values excluded from both totals: **${report.derived_excluded.toLocaleString("en-CA")}**.`);
  lines.push(`Records: **${report.records.toLocaleString("en-CA")}**.`);
  lines.push("");
  lines.push(
    `The illustrative 500,000-piece target in master plan section 5.6 is a sizing example (venues 250,000, paths 100,000, transit 50,000, washrooms 100,000). This import's piece total is ${report.pieces.toLocaleString("en-CA")}.`,
  );
  const shortTranches = report.shortfalls.filter((item) => item.shortfall > 0);
  if (report.total_shortfall > 0) {
    lines.push(
      `That is ${report.total_shortfall.toLocaleString("en-CA")} pieces under the illustrative total. The counts are not padded.`,
    );
  } else {
    lines.push("The piece total meets the illustrative total. The counts are not padded.");
  }
  if (shortTranches.length > 0) {
    const detail = shortTranches
      .map(
        (item) =>
          `${item.tranche} is ${item.shortfall.toLocaleString("en-CA")} under its illustrative ${item.illustrative_target.toLocaleString("en-CA")}`,
      )
      .join("; ");
    lines.push(`Tranches under their illustrative targets: ${detail}.`);
  }
  lines.push("");
  lines.push("| Tranche | Records | Pieces | UNKNOWN gaps | Derived excluded | Illustrative target | Shortfall |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const tranche of TRANCHES) {
    const slice = report.by_tranche[tranche];
    const shortfall = report.shortfalls.find((item) => item.tranche === tranche);
    lines.push(
      `| ${tranche} | ${slice.records} | ${slice.pieces} | ${slice.gaps} | ${slice.derived_excluded} | ${shortfall?.illustrative_target ?? ""} | ${shortfall?.shortfall ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## Pieces by tier");
  lines.push("");
  lines.push("| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const tranche of TRANCHES) {
    const tiers = report.by_tranche[tranche].pieces_by_tier;
    lines.push(
      `| ${tranche} | ${tiers["0"] ?? 0} | ${tiers["1"] ?? 0} | ${tiers["2"] ?? 0} | ${tiers["3"] ?? 0} | ${tiers["4"] ?? 0} |`,
    );
  }
  lines.push("");
  lines.push("## Pieces by source and retrieval date");
  lines.push("");
  lines.push("| Source | Records | Pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const source of Object.keys(report.by_source).sort()) {
    const slice = report.by_source[source];
    if (!slice) continue;
    lines.push(
      `| ${source} | ${slice.records} | ${slice.pieces} | ${slice.gaps} | ${slice.pieces_by_tier["0"] ?? 0} | ${slice.pieces_by_tier["1"] ?? 0} | ${Object.keys(slice.pieces_by_retrieved_at).sort().join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Largest UNKNOWN gaps by field");
  lines.push("");
  for (const tranche of TRANCHES) {
    const ranked = Object.entries(report.by_tranche[tranche].gap_fields)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12);
    lines.push(`### ${tranche}`);
    lines.push("");
    if (ranked.length === 0) {
      lines.push("No gaps.");
    } else {
      for (const [field, count] of ranked) lines.push(`- ${field}: ${count}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
