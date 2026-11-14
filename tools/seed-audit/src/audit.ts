import { readRecords } from "./read.js";
import { Reservoir } from "./sample.js";
import {
  UNKNOWN,
  type AuditOptions,
  type AuditReport,
  type CrossCheckEntry,
  type Defect,
  type DefectRule,
  type FieldValue,
  type FileCount,
  type Reconciliation,
  type SampledRecord,
  type SeedRecord,
  type Severity,
  type Totals,
} from "./types.js";

export const DEFAULT_OPTIONS: AuditOptions = {
  samplePerFile: 20,
  sampleBy: "file",
  seed: "day-30-deep-sample",
  auditDate: new Date().toISOString().slice(0, 10),
  allowedTiers: [0, 1, "SEEDED-OPEN-DATA", "PROTOTYPE-UNVERIFIED"],
  dimensionFields: ["door_width", "width", "min_width", "kerb_height"],
  measurementFields: [
    "door_width",
    "width",
    "min_width",
    "kerb_height",
    "incline",
    "max_slope",
    "step_count",
    "stair_count",
    "length_m",
    "capacity_disabled",
  ],
  repeatedShare: 0.5,
  repeatedMinimum: 20,
  duplicateMetres: 25,
  listLimit: 25,
};

/** Tier values the canonical schema knows. Anything else is unrecognised. */
const KNOWN_TIERS = new Set<string>(["0", "1", "2", "3", "4", "E", "SEEDED-OPEN-DATA", "PROTOTYPE-UNVERIFIED", "COMMUNITY-REPORTED", "VERIFIED"]);

const SEVERITY: Record<DefectRule, Severity> = {
  "unreadable-line": "blocker",
  "missing-id": "blocker",
  "duplicate-id": "serious",
  "missing-fields": "blocker",
  "missing-field-key": "serious",
  "unexpected-field-key": "serious",
  "missing-source": "blocker",
  "missing-licence": "blocker",
  "missing-date": "blocker",
  "bad-date": "serious",
  "future-date": "serious",
  "missing-tier": "blocker",
  "tier-above-prototype": "blocker",
  "blank-value": "serious",
  "zero-dimension": "review",
  "derived-measurement": "review",
  "repeated-measurement": "review",
  "possible-duplicate": "review",
};

const DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function blank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

/** Folds a name for duplicate matching: case, accents, and punctuation are ignored. */
export function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Equirectangular distance in metres. Accurate enough at 25 m in Ontario. */
export function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRadians = Math.PI / 180;
  const x = (b.lon - a.lon) * toRadians * Math.cos(((a.lat + b.lat) / 2) * toRadians);
  const y = (b.lat - a.lat) * toRadians;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * The source a record is attributed to: the source_id that most of its fields
 * carry, as the counts report does. Ties go to the first field. A record whose
 * fields carry no source_id falls back to the id prefix before the first colon.
 */
export function recordSource(record: SeedRecord): string {
  const tally = new Map<string, number>();
  for (const field of Object.values(record.fields ?? {})) {
    const source = field && typeof field === "object" ? text(field.source_id) : "";
    if (source) tally.set(source, (tally.get(source) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [source, count] of tally) {
    if (count > bestCount) {
      best = source;
      bestCount = count;
    }
  }
  if (best) return best;
  const id = text(record.id);
  const colon = id.indexOf(":");
  return colon > 0 ? id.slice(0, colon) : "unknown";
}

function isUnknown(field: FieldValue): boolean {
  return field.value === UNKNOWN;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

interface NamedPoint {
  file: string;
  line: number;
  id: string;
  source: string;
  tranche: string;
  name: string;
  lat: number;
  lon: number;
}

class DefectLog {
  readonly counts: Record<string, number> = {};
  readonly listed: Defect[] = [];
  private readonly perBucket = new Map<string, number>();

  constructor(private readonly limit: number) {}

  add(defect: Omit<Defect, "severity">): void {
    const full: Defect = { ...defect, severity: SEVERITY[defect.rule] };
    this.counts[defect.rule] = (this.counts[defect.rule] ?? 0) + 1;
    const bucket = `${defect.rule}\u0000${defect.file}`;
    const used = this.perBucket.get(bucket) ?? 0;
    if (used < this.limit) {
      this.listed.push(full);
      this.perBucket.set(bucket, used + 1);
    }
  }
}

function emptyTotals(): Totals {
  return { records: 0, pieces: 0, gaps: 0, derivedExcluded: 0, byTranche: {}, bySource: {} };
}

function bump(map: Totals["byTranche"], key: string): Totals["byTranche"][string] {
  map[key] ??= { records: 0, pieces: 0, gaps: 0, derivedExcluded: 0 };
  return map[key];
}

function checkField(
  log: DefectLog,
  options: AuditOptions,
  where: { file: string; line: number; recordId: string },
  name: string,
  field: FieldValue,
): void {
  const at = { ...where, field: name };
  if (blank(field.source_id)) log.add({ rule: "missing-source", ...at, detail: "source_id is missing or blank." });
  if (blank(field.licence)) log.add({ rule: "missing-licence", ...at, detail: "licence is missing or blank. Write UNKNOWN when the licence is not known." });
  if (blank(field.retrieved_at)) {
    log.add({ rule: "missing-date", ...at, detail: "retrieved_at is missing or blank." });
  } else {
    const date = text(field.retrieved_at);
    if (!DATE.test(date) || Number.isNaN(Date.parse(date))) {
      log.add({ rule: "bad-date", ...at, detail: `retrieved_at "${date}" is not an ISO date.` });
    } else if (date.slice(0, 10) > options.auditDate) {
      log.add({ rule: "future-date", ...at, detail: `retrieved_at ${date} is after the audit date ${options.auditDate}.` });
    }
  }
  const tier = field.tier;
  if (blank(tier)) {
    log.add({ rule: "missing-tier", ...at, detail: "tier is missing." });
  } else if (!KNOWN_TIERS.has(text(tier))) {
    log.add({ rule: "missing-tier", ...at, detail: `tier "${text(tier)}" is not a canonical tier.` });
  } else if (!options.allowedTiers.map(String).includes(text(tier))) {
    log.add({
      rule: "tier-above-prototype",
      ...at,
      detail: `tier ${text(tier)} is above the prototype tiers (${options.allowedTiers.join(", ")}).`,
    });
  }
  if (blank(field.value)) {
    log.add({ rule: "blank-value", ...at, detail: "The value is blank. A value the source does not state is UNKNOWN." });
    return;
  }
  if (isUnknown(field)) return;
  if (options.dimensionFields.includes(name) && numeric(field.value) === 0) {
    log.add({ rule: "zero-dimension", ...at, detail: "A dimension of 0 could be read as a measurement. Check the source." });
  }
  if (options.measurementFields.includes(name) && field.derived === true) {
    log.add({ rule: "derived-measurement", ...at, detail: "A measurement is marked derived. Check it is not a guess." });
  }
}

export interface AuditInput {
  /** Paths as they should appear in the report. */
  files: { path: string; label?: string }[];
  /** Parsed counts report, for example counts.json. Omit to skip reconciliation. */
  reported?: unknown;
  crossCheck?: CrossCheckEntry[];
}

export async function runAudit(input: AuditInput, overrides: Partial<AuditOptions> = {}): Promise<AuditReport> {
  const options: AuditOptions = { ...DEFAULT_OPTIONS, ...overrides };
  const log = new DefectLog(options.listLimit);
  const totals = emptyTotals();
  const fileCounts: FileCount[] = [];
  const sample: SampledRecord[] = [];
  const seenIds = new Map<string, string>();
  const grid = new Map<string, NamedPoint[]>();
  const cell = options.duplicateMetres / 111_000;
  const duplicatePairs = new Set<string>();
  const reservoirs = new Map<string, Reservoir<{ file: string; line: number; record: SeedRecord }>>();
  const groupOf = (file: string) => (options.sampleBy === "directory" ? file.slice(0, Math.max(file.lastIndexOf("/"), 0)) || "." : file);

  const sorted = [...input.files].sort((a, b) => (a.label ?? a.path).localeCompare(b.label ?? b.path));
  for (const entry of sorted) {
    const file = entry.label ?? entry.path;
    const count: FileCount = { file, records: 0, pieces: 0, gaps: 0, derivedExcluded: 0, unreadableLines: 0 };
    const group = groupOf(file);
    let reservoir = reservoirs.get(group);
    if (!reservoir) {
      reservoir = new Reservoir(options.samplePerFile, `${options.seed}\u0000${group}`);
      reservoirs.set(group, reservoir);
    }
    const repeated = new Map<string, { populated: number; values: Map<string, number> }>();

    for await (const item of readRecords(entry.path)) {
      if (!item.record) {
        count.unreadableLines += 1;
        log.add({ rule: "unreadable-line", file, line: item.line, detail: item.error ?? "Unreadable." });
        continue;
      }
      const record = item.record;
      count.records += 1;
      totals.records += 1;
      const recordId = text(record.id);
      const tranche = text(record.tranche) || "unknown";
      const source = recordSource(record);
      bump(totals.byTranche, tranche).records += 1;
      bump(totals.bySource, source).records += 1;
      reservoir.offer({ file, line: item.line, record });

      if (!recordId) {
        log.add({ rule: "missing-id", file, line: item.line, detail: "The record has no id." });
      } else if (seenIds.has(recordId)) {
        log.add({ rule: "duplicate-id", file, line: item.line, recordId, detail: `Same id as ${seenIds.get(recordId)}.` });
      } else {
        seenIds.set(recordId, `${file}:${item.line}`);
      }

      const fields = record.fields;
      if (!fields || typeof fields !== "object") {
        log.add({ rule: "missing-fields", file, line: item.line, recordId, detail: "The record has no fields object." });
        continue;
      }
      const expected = options.fieldList?.[tranche];
      if (expected) {
        for (const key of expected) {
          if (!(key in fields)) log.add({ rule: "missing-field-key", file, line: item.line, recordId, field: key, detail: `${tranche} field ${key} is absent. Absent is not the same as UNKNOWN.` });
        }
        for (const key of Object.keys(fields)) {
          if (!expected.includes(key)) log.add({ rule: "unexpected-field-key", file, line: item.line, recordId, field: key, detail: `${key} is not a ${tranche} field.` });
        }
      }

      for (const [name, rawField] of Object.entries(fields)) {
        const field: FieldValue = rawField && typeof rawField === "object" ? rawField : { value: rawField };
        checkField(log, options, { file, line: item.line, recordId }, name, field);
        const fieldSource = text(field.source_id) || source;
        const derived = field.derived === true;
        if (derived) {
          count.derivedExcluded += 1;
          totals.derivedExcluded += 1;
          bump(totals.byTranche, tranche).derivedExcluded += 1;
          bump(totals.bySource, fieldSource).derivedExcluded += 1;
        } else if (isUnknown(field)) {
          count.gaps += 1;
          totals.gaps += 1;
          bump(totals.byTranche, tranche).gaps += 1;
          bump(totals.bySource, fieldSource).gaps += 1;
        } else {
          count.pieces += 1;
          totals.pieces += 1;
          bump(totals.byTranche, tranche).pieces += 1;
          bump(totals.bySource, fieldSource).pieces += 1;
        }
        if (options.measurementFields.includes(name) && !isUnknown(field) && !blank(field.value) && !derived) {
          const tally = repeated.get(name) ?? { populated: 0, values: new Map<string, number>() };
          tally.populated += 1;
          const key = JSON.stringify(field.value);
          if (tally.values.has(key) || tally.values.size < 10_000) tally.values.set(key, (tally.values.get(key) ?? 0) + 1);
          repeated.set(name, tally);
        }
      }

      const name = fields.name && !isUnknown(fields.name) ? text(fields.name.value) : "";
      const lat = numeric(fields.lat?.value);
      const lon = numeric(fields.lon?.value);
      if (name && lat !== null && lon !== null && recordId) {
        const point: NamedPoint = { file, line: item.line, id: recordId, source, tranche, name: foldName(name), lat, lon };
        const gx = Math.floor(lon / cell);
        const gy = Math.floor(lat / cell);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (const other of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
              if (other.source === point.source || other.tranche !== point.tranche || other.name !== point.name) continue;
              const metres = metresBetween(other, point);
              if (metres > options.duplicateMetres) continue;
              const pair = [other.id, point.id].sort().join("\u0000");
              if (duplicatePairs.has(pair)) continue;
              duplicatePairs.add(pair);
              log.add({
                rule: "possible-duplicate",
                file,
                line: item.line,
                recordId: point.id,
                detail: `Same name as ${other.id} (${other.file}:${other.line}), ${Math.round(metres)} m away, from a different source. Keep both unless a source shows they are one place.`,
              });
            }
          }
        }
        const key = `${gx}:${gy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(point);
        else grid.set(key, [point]);
      }
    }

    for (const [field, tally] of repeated) {
      if (tally.populated < options.repeatedMinimum) continue;
      let top: [string, number] = ["", 0];
      for (const pair of tally.values) if (pair[1] > top[1]) top = pair;
      const share = top[1] / tally.populated;
      if (share >= options.repeatedShare) {
        log.add({
          rule: "repeated-measurement",
          file,
          field,
          detail: `${top[1]} of ${tally.populated} populated ${field} values are ${top[0]} (${Math.round(share * 100)}%). Check this is what the source says and not a default.`,
        });
      }
    }

    fileCounts.push(count);
  }

  for (const [group, reservoir] of [...reservoirs].sort((a, b) => a[0].localeCompare(b[0]))) {
    const picks = reservoir.values().sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    for (const picked of picks) {
      const fields = picked.record.fields ?? {};
      const populated = Object.entries(fields)
        .filter(([, field]) => field && typeof field === "object" && !isUnknown(field) && !blank(field.value))
        .map(([field, value]) => ({
          field,
          value: value.value,
          sourceId: text(value.source_id),
          licence: text(value.licence),
          retrievedAt: text(value.retrieved_at),
          tier: text(value.tier),
        }));
      sample.push({
        group,
        file: picked.file,
        line: picked.line,
        recordId: text(picked.record.id),
        tranche: text(picked.record.tranche) || "unknown",
        populated,
        unknownCount: Object.values(fields).filter((field) => field && typeof field === "object" && isUnknown(field)).length,
      });
    }
  }

  const sampledIds = new Set(sample.map((item) => item.recordId));
  const crossCheck = (input.crossCheck ?? []).filter((entry) => sampledIds.has(entry.recordId));
  const checkedIds = new Set(crossCheck.map((entry) => entry.recordId));
  const crossCheckPending = sample.map((item) => item.recordId).filter((id) => !checkedIds.has(id));

  return {
    format: "seed-deep-sample-1.0.0",
    auditDate: options.auditDate,
    seed: options.seed,
    samplePerFile: options.samplePerFile,
    sampleBy: options.sampleBy,
    files: fileCounts,
    totals,
    reconciliation: input.reported === undefined ? [] : reconcile(totals, fileCounts, input.reported),
    sample,
    crossCheck,
    crossCheckPending,
    defectCounts: log.counts,
    defects: log.listed,
  };
}

function numberAt(object: unknown, ...path: string[]): number | null {
  let current: unknown = object;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" ? current : null;
}

const PAIRS: [keyof Totals["byTranche"][string], string][] = [
  ["records", "records"],
  ["pieces", "pieces"],
  ["gaps", "gaps"],
  ["derivedExcluded", "derived_excluded"],
];

/**
 * Compares independent counts to a counts report shaped like access-maps
 * counts.json: top-level totals, `by_tranche`, `by_source`, and optional
 * per-file `records`. A key the report leaves out is not compared, except
 * that a tranche or source the report omits entirely is listed as unreported.
 */
export function reconcile(totals: Totals, files: FileCount[], reported: unknown): Reconciliation[] {
  const rows: Reconciliation[] = [];
  const push = (key: string, counted: number, value: number | null, required: boolean) => {
    if (value === null && !required) return;
    rows.push({ key, counted, reported: value, matches: value === counted });
  };
  push("records", totals.records, numberAt(reported, "records"), false);
  push("pieces", totals.pieces, numberAt(reported, "pieces"), false);
  push("gaps", totals.gaps, numberAt(reported, "gaps"), false);
  push("derived_excluded", totals.derivedExcluded, numberAt(reported, "derived_excluded"), false);
  for (const [group, map] of [
    ["by_tranche", totals.byTranche],
    ["by_source", totals.bySource],
  ] as const) {
    const section = reported && typeof reported === "object" ? (reported as Record<string, unknown>)[group] : undefined;
    if (!section || typeof section !== "object") continue;
    const names = new Set([...Object.keys(map), ...Object.keys(section)]);
    for (const name of [...names].sort()) {
      const counted = map[name] ?? { records: 0, pieces: 0, gaps: 0, derivedExcluded: 0 };
      const present = name in section;
      for (const [ours, theirs] of PAIRS) {
        push(`${group}.${name}.${theirs}`, counted[ours], numberAt(section, name, theirs), !present && ours === "records");
      }
    }
  }
  const reportedFiles = reported && typeof reported === "object" ? (reported as { files?: unknown }).files : undefined;
  if (Array.isArray(reportedFiles)) {
    const byFile = new Map(files.map((file) => [file.file, file.records]));
    for (const item of reportedFiles) {
      if (!item || typeof item !== "object") continue;
      const name = text((item as { file?: unknown }).file);
      const value = numberAt(item, "records");
      if (!name || value === null) continue;
      push(`files.${name}.records`, byFile.get(name) ?? 0, value, true);
    }
  }
  return rows;
}
