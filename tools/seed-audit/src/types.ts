/**
 * Record shape read by the audit. It matches the import records in
 * access-maps (`DataRecord` and `FieldValue`) and the import schemas in
 * access-main `packages/schema/schema/import`. The audit only reads records.
 */
export const UNKNOWN = "UNKNOWN";

export interface FieldValue {
  value: unknown;
  source_id?: unknown;
  licence?: unknown;
  retrieved_at?: unknown;
  tier?: unknown;
  source_key?: unknown;
  raw?: unknown;
  derived?: unknown;
}

export interface SeedRecord {
  id?: unknown;
  tranche?: unknown;
  region?: unknown;
  fields?: Record<string, FieldValue>;
}

/** What a defect means for the reviewer. */
export type Severity = "blocker" | "serious" | "review";

export type DefectRule =
  | "unreadable-line"
  | "missing-id"
  | "duplicate-id"
  | "missing-fields"
  | "missing-field-key"
  | "unexpected-field-key"
  | "missing-source"
  | "missing-licence"
  | "missing-date"
  | "bad-date"
  | "future-date"
  | "missing-tier"
  | "tier-above-prototype"
  | "blank-value"
  | "zero-dimension"
  | "derived-measurement"
  | "repeated-measurement"
  | "possible-duplicate";

export interface Defect {
  rule: DefectRule;
  severity: Severity;
  file: string;
  /** Line number in the file, counted from 1, when one record is at fault. */
  line?: number;
  recordId?: string;
  field?: string;
  detail: string;
}

/** A second-source comparison typed in by the reviewer. The tool never fills this in. */
export interface CrossCheckEntry {
  recordId: string;
  field: string;
  secondSource: string;
  /** What the second source says, in the reviewer's words. */
  secondValue: string;
  result: "agrees" | "disagrees" | "not-in-second-source";
  checkedOn: string;
}

export interface SampledField {
  field: string;
  value: unknown;
  sourceId: string;
  licence: string;
  retrievedAt: string;
  tier: string;
}

export interface SampledRecord {
  /** The file, or the folder when sampling by directory. */
  group: string;
  file: string;
  line: number;
  recordId: string;
  tranche: string;
  /** Fields whose value is not UNKNOWN, so the reviewer can compare them to the source. */
  populated: SampledField[];
  unknownCount: number;
}

export interface FileCount {
  file: string;
  records: number;
  pieces: number;
  gaps: number;
  derivedExcluded: number;
  unreadableLines: number;
}

export interface Totals {
  records: number;
  pieces: number;
  gaps: number;
  derivedExcluded: number;
  byTranche: Record<string, { records: number; pieces: number; gaps: number; derivedExcluded: number }>;
  bySource: Record<string, { records: number; pieces: number; gaps: number; derivedExcluded: number }>;
}

export interface Reconciliation {
  key: string;
  counted: number;
  reported: number | null;
  matches: boolean;
}

export interface AuditOptions {
  /** Records sampled per group. The extended prompt asks for twenty per file. */
  samplePerFile: number;
  /**
   * "file" samples each file. "directory" samples each file's folder as one
   * group, for imports split into many region files per source.
   */
  sampleBy: "file" | "directory";
  /** Any string. The same seed and files give the same sample. */
  seed: string;
  /** ISO date of the audit. Dates after it are flagged. */
  auditDate: string;
  /** Prototype tiers. Canonical 0 and 1 map to SEEDED-OPEN-DATA and PROTOTYPE-UNVERIFIED. */
  allowedTiers: readonly (number | string)[];
  /** Field names whose value is a physical dimension, where 0 is suspect. */
  dimensionFields: readonly string[];
  /** Field names that are measurements, where a derived or repeated value is suspect. */
  measurementFields: readonly string[];
  /** Expected field keys per tranche. Omit to skip the key check. */
  fieldList?: Record<string, readonly string[]>;
  /** Share of a file's populated values in one measurement field that triggers a repeated-value flag. */
  repeatedShare: number;
  /** Minimum populated values before the repeated-value flag applies. */
  repeatedMinimum: number;
  /** Two named records closer than this, in metres, in different files are a possible duplicate. */
  duplicateMetres: number;
  /** Cap on defects listed per rule and file. Counts stay exact. */
  listLimit: number;
}

export interface AuditReport {
  format: "seed-deep-sample-1.0.0";
  auditDate: string;
  seed: string;
  samplePerFile: number;
  sampleBy: "file" | "directory";
  files: FileCount[];
  totals: Totals;
  reconciliation: Reconciliation[];
  sample: SampledRecord[];
  crossCheck: CrossCheckEntry[];
  /** Sampled records with no cross-check entry yet. */
  crossCheckPending: string[];
  defectCounts: Record<string, number>;
  defects: Defect[];
}
