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
import { ACCESSIBILITY_DEFINITION, ACCESSIBILITY_FIELDS, isAccessibilityField } from "./accessibility.js";
import { isDerivedExcluded, isGap, isPiece, type FieldValue } from "../model/provenance.js";

export interface Slice {
  records: number;
  pieces: number;
  accessibility_facts: number;
  other_populated: number;
  verified: number;
  gaps: number;
  derived_excluded: number;
  pieces_by_tier: Record<string, number>;
  gaps_by_tier: Record<string, number>;
  pieces_by_source: Record<string, number>;
  pieces_by_retrieved_at: Record<string, number>;
  gaps_by_retrieved_at: Record<string, number>;
  gap_fields: Record<string, number>;
  accessibility_pieces: number;
  accessibility_gaps: number;
  accessibility_by_field: Record<string, number>;
}

export interface SourceSlice {
  records: number;
  pieces: number;
  gaps: number;
  derived_excluded: number;
  pieces_by_tier: Record<string, number>;
  pieces_by_tranche: Record<string, number>;
  pieces_by_retrieved_at: Record<string, number>;
  accessibility_pieces: number;
}

export interface Shortfall {
  tranche: Tranche;
  verified: number;
  illustrative_target: number;
  shortfall: number;
}

export interface CountReport {
  definition: string;
  records: number;
  pieces: number;
  gaps: number;
  derived_excluded: number;
  verified_toward_500k: number;
  accessibility_fact_pieces: number;
  other_populated_pieces: number;
  by_tranche: Record<Tranche, Slice>;
  by_source: Record<string, SourceSlice>;
  shortfalls: Shortfall[];
  illustrative_total_target: number;
  total_shortfall: number;
  accessibility_pieces: number;
  accessibility_gaps: number;
  identity_pieces: number;
  accessibility_definition: string;
  accessibility_fields: Record<Tranche, readonly string[]>;
}

export function emptySlice(): Slice {
  return {
    records: 0,
    pieces: 0,
    accessibility_facts: 0,
    other_populated: 0,
    verified: 0,
    gaps: 0,
    derived_excluded: 0,
    pieces_by_tier: {},
    gaps_by_tier: {},
    pieces_by_source: {},
    pieces_by_retrieved_at: {},
    gaps_by_retrieved_at: {},
    gap_fields: {},
    accessibility_pieces: 0,
    accessibility_gaps: 0,
    accessibility_by_field: {},
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
    const verified = byTranche[tranche].verified;
    const target = TRANCHE_TARGETS[tranche];
    return {
      tranche,
      verified,
      illustrative_target: target,
      shortfall: target - verified,
    };
  });
  const pieces = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].pieces, 0);
  const gaps = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].gaps, 0);
  const derived = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].derived_excluded, 0);
  const recordsTotal = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].records, 0);
const accessibilityPieces = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].accessibility_pieces, 0);
  const accessibilityGaps = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].accessibility_gaps, 0);
  const verified = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].verified, 0);
  const accessibility = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].accessibility_facts, 0);
  const other = TRANCHES.reduce((sum, tranche) => sum + byTranche[tranche].other_populated, 0);
  return {
    definition:
      "A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. Section 5.6 counts only tier 2 and tier 3 values toward 500,000. Tier 0 and tier 1 accessibility facts are reported separately and are not verified.",
    records: recordsTotal,
    pieces,
    gaps,
    derived_excluded: derived,
verified_toward_500k: verified,
    accessibility_fact_pieces: accessibility,
    other_populated_pieces: other,
    accessibility_pieces: accessibilityPieces,
    accessibility_gaps: accessibilityGaps,
    identity_pieces: pieces - accessibilityPieces,
    accessibility_definition: ACCESSIBILITY_DEFINITION,
    accessibility_fields: ACCESSIBILITY_FIELDS,
    by_tranche: byTranche,
    by_source: bySource,
    shortfalls,
    illustrative_total_target: TOTAL_TARGET,
    total_shortfall: TOTAL_TARGET - verified,
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
const access = isAccessibilityField(tranche, fieldName);
    const verifiedTier = field.tier === 2 || field.tier === 3;
    if (verifiedTier) slice.verified += 1;
    if (access) {
      slice.accessibility_pieces += 1;
      bump(slice.accessibility_by_field, fieldName);
      source.accessibility_pieces += 1;
      if (field.tier === 0 || field.tier === 1) slice.accessibility_facts += 1;
    }
    if (!verifiedTier && !(access && (field.tier === 0 || field.tier === 1))) slice.other_populated += 1;
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
    if (isAccessibilityField(tranche, fieldName)) slice.accessibility_gaps += 1;
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
    accessibility_pieces: 0,
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
lines.push(`Verified field-values toward the 500,000 target: **${report.verified_toward_500k.toLocaleString("en-CA")}**.`);
  lines.push(
    report.verified_toward_500k === 0
      ? "Section 5.6 counts only tier 2 (peer-verified) and tier 3 (trained surveyor) values. Verified toward 500,000 is 0. None of those verified field-values exist in this import."
      : `Section 5.6 counts only tier 2 and tier 3 values. Verified toward 500,000 is ${report.verified_toward_500k.toLocaleString("en-CA")}. The shortfall against 500,000 is ${report.total_shortfall.toLocaleString("en-CA")}.`,
  );
  lines.push(
    `Open-data or operator-claimed accessibility-fact values (tier 0 and tier 1 only; not names, coordinates, addresses, or geometry): **${report.accessibility_fact_pieces.toLocaleString("en-CA")}**.`,
  );
  lines.push(`All other populated values: **${report.other_populated_pieces.toLocaleString("en-CA")}**.`);
  lines.push(`All populated pieces together: **${report.pieces.toLocaleString("en-CA")}**.`);
  lines.push(`Total UNKNOWN gaps: **${report.gaps.toLocaleString("en-CA")}**.`);
  lines.push(
    `UNKNOWN gaps on accessibility fields: **${report.accessibility_gaps.toLocaleString("en-CA")}**.`,
  );
  lines.push(`Derived values excluded from both totals: **${report.derived_excluded.toLocaleString("en-CA")}**.`);
  lines.push(`Records: **${report.records.toLocaleString("en-CA")}**.`);
  lines.push("");
  lines.push(
    "The illustrative targets are 250,000 venue, 100,000 path, 50,000 transit, and 100,000 washroom verified field-values. Shortfall is the target minus verified values.",
  );
  lines.push("");
  lines.push(
    "| Tranche | Records | Accessibility facts (tier 0–1) | Other populated | Verified (tier 2–3) | UNKNOWN gaps | Illustrative target | Shortfall |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const tranche of TRANCHES) {
    const slice = report.by_tranche[tranche];
    const shortfall = report.shortfalls.find((item) => item.tranche === tranche);
    lines.push(
      `| ${tranche} | ${slice.records} | ${slice.accessibility_facts} | ${slice.other_populated} | ${slice.verified} | ${slice.gaps} | ${shortfall?.illustrative_target ?? ""} | ${shortfall?.shortfall ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## Accessibility facts");
  lines.push("");
  lines.push(report.accessibility_definition);
  lines.push("");
  lines.push(
    `Accessibility facts and the other pieces add up to the total: ${report.accessibility_pieces.toLocaleString("en-CA")} + ${report.identity_pieces.toLocaleString("en-CA")} = ${report.pieces.toLocaleString("en-CA")}.`,
  );
  lines.push("");
  lines.push("| Tranche | Accessibility pieces | Accessibility-field gaps | Other pieces |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const tranche of TRANCHES) {
    const slice = report.by_tranche[tranche];
    lines.push(
      `| ${tranche} | ${slice.accessibility_pieces} | ${slice.accessibility_gaps} | ${slice.pieces - slice.accessibility_pieces} |`,
    );
  }
  lines.push("");
  lines.push("Fields counted as accessibility facts:");
  lines.push("");
  for (const tranche of TRANCHES) {
    lines.push(`- ${tranche}: ${report.accessibility_fields[tranche].join(", ")}`);
  }
  lines.push("");
  lines.push("Populated accessibility facts by field:");
  lines.push("");
  for (const tranche of TRANCHES) {
    const ranked = Object.entries(report.by_tranche[tranche].accessibility_by_field).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    lines.push(`### ${tranche}`);
    lines.push("");
    if (ranked.length === 0) lines.push("No populated accessibility facts.");
    else for (const [field, count] of ranked) lines.push(`- ${field}: ${count}`);
    lines.push("");
  }
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
  lines.push(
    "| Source | Records | Pieces | Accessibility pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const source of Object.keys(report.by_source).sort()) {
    const slice = report.by_source[source];
    if (!slice) continue;
    lines.push(
      `| ${source} | ${slice.records} | ${slice.pieces} | ${slice.accessibility_pieces} | ${slice.gaps} | ${slice.pieces_by_tier["0"] ?? 0} | ${slice.pieces_by_tier["1"] ?? 0} | ${Object.keys(slice.pieces_by_retrieved_at).sort().join(", ")} |`,
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
