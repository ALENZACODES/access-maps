import type {
  WavAvailabilityStatus,
  WavDataset,
  WavField,
  WavFieldName,
  WavFilter,
  WavIssue,
  WavSearchItem,
  WavSearchResult,
  WavServiceRecord,
} from "./wavTypes";
import {
  WAV_AVAILABILITY,
  WAV_FIELD_NAMES,
  WAV_SERVICE_TYPES,
  WAV_UNKNOWN,
  WAV_USABLE_AVAILABILITY,
} from "./wavTypes";

const DAY_MS = 86400000;
/** Matches the repository rule that an operator claim expires after 180 days. */
export const WAV_REVIEW_WINDOW_DAYS = 180;

const VOCABULARY: Partial<Record<WavFieldName, readonly string[]>> = {
  service_type: WAV_SERVICE_TYPES,
  availability: WAV_AVAILABILITY,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Parses a strict YYYY-MM-DD calendar date as UTC midnight, or NaN. */
export function parseDay(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return NaN;
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time)) return NaN;
  return new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

function fieldIssues(
  record: string,
  name: WavFieldName,
  field: unknown,
): WavIssue[] {
  if (!isRecord(field)) return [{ record, field: name, code: "missing" }];
  const issues: WavIssue[] = [];
  const add = (suffix: string, code: WavIssue["code"]): void => {
    issues.push({ record, field: `${name}.${suffix}`, code });
  };
  const vocabulary = VOCABULARY[name];
  if (!nonEmpty(field.value)) add("value", "missing");
  else if (vocabulary && !vocabulary.includes(field.value)) {
    add("value", "not_in_vocabulary");
  }
  if (!nonEmpty(field.source_id)) add("source_id", "missing");
  if (!nonEmpty(field.licence)) add("licence", "missing");
  const retrieved = parseDay(field.retrieved_at);
  if (!Number.isFinite(retrieved)) add("retrieved_at", "invalid_date");
  if (
    typeof field.tier !== "number" ||
    ![0, 1, 2, 3, 4].includes(field.tier)
  ) {
    add("tier", "invalid_tier");
  }
  if (field.source_key !== undefined && typeof field.source_key !== "string") {
    add("source_key", "invalid");
  }
  let dated = NaN;
  if (field.source_dated !== undefined) {
    dated = parseDay(field.source_dated);
    if (!Number.isFinite(dated)) add("source_dated", "invalid_date");
    else if (Number.isFinite(retrieved) && dated > retrieved) {
      add("source_dated", "source_dated_after_retrieval");
    }
  }
  if (
    name === "availability" &&
    field.value === "effectively_unavailable" &&
    !Number.isFinite(dated)
  ) {
    add("source_dated", "unavailable_needs_dated_source");
  }
  const known = [
    "value", "source_id", "licence", "retrieved_at", "tier", "source_key",
    "source_dated",
  ];
  for (const key of Object.keys(field)) {
    if (!known.includes(key)) add(key, "invalid");
  }
  return issues;
}

/**
 * Checks one record. "effectively_unavailable" is accepted only with a
 * source and the date that source carries; without them the honest value is
 * UNKNOWN.
 */
export function validateWavRecord(input: unknown): WavIssue[] {
  if (!isRecord(input)) {
    return [{ record: "", field: "record", code: "not_an_object" }];
  }
  const id = nonEmpty(input.id) ? input.id : "";
  const issues: WavIssue[] = [];
  if (!id) issues.push({ record: id, field: "id", code: "missing" });
  for (const name of WAV_FIELD_NAMES) {
    issues.push(...fieldIssues(id, name, input[name]));
  }
  if (input.synthetic !== undefined && typeof input.synthetic !== "boolean") {
    issues.push({ record: id, field: "synthetic", code: "invalid" });
  }
  const known: string[] = ["id", "synthetic", ...WAV_FIELD_NAMES];
  for (const key of Object.keys(input)) {
    if (!known.includes(key)) {
      issues.push({ record: id, field: key, code: "invalid" });
    }
  }
  return issues;
}

/**
 * Checks a whole dataset file. `kind: "dataset"` refuses any synthetic
 * record; `kind: "fixture"` requires every record to be labelled synthetic.
 */
export function validateWavDataset(
  input: unknown,
  kind: "dataset" | "fixture",
): WavIssue[] {
  if (
    !isRecord(input) ||
    input.format !== "access-maps-wav-services" ||
    input.version !== 1 ||
    !Array.isArray(input.records)
  ) {
    return [{ record: "", field: "dataset", code: "invalid" }];
  }
  const issues: WavIssue[] = [];
  const seen = new Set<string>();
  for (const record of input.records as unknown[]) {
    issues.push(...validateWavRecord(record));
    if (!isRecord(record)) continue;
    const id = typeof record.id === "string" ? record.id : "";
    if (id && seen.has(id)) {
      issues.push({ record: id, field: "id", code: "duplicate_id" });
    }
    seen.add(id);
    if (kind === "dataset" && record.synthetic === true) {
      issues.push({ record: id, field: "synthetic", code: "synthetic_not_allowed" });
    }
    if (kind === "fixture" && record.synthetic !== true) {
      issues.push({ record: id, field: "synthetic", code: "synthetic_label_required" });
    }
  }
  return issues;
}

/** Returns the dataset's records, or throws when the file is not valid. */
export function loadWavDataset(
  input: unknown,
  kind: "dataset" | "fixture" = "dataset",
): WavServiceRecord[] {
  const issues = validateWavDataset(input, kind);
  if (issues.length) {
    const first = issues[0] as WavIssue;
    throw new Error(
      `Invalid WAV dataset: ${first.record || "file"} ${first.field} ${first.code}` +
        (issues.length > 1 ? ` (+${issues.length - 1} more)` : ""),
    );
  }
  return (input as WavDataset).records;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function isStale(field: WavField, time: number, windowDays: number): boolean {
  const retrieved = parseDay(field.retrieved_at);
  return (
    !Number.isFinite(retrieved) ||
    retrieved > time ||
    time - retrieved >= windowDays * DAY_MS
  );
}

/**
 * Filters services. A positive filter is satisfied only by a stated,
 * in-window value: UNKNOWN never matches, and neither does a value whose
 * retrieval date is outside the review window. Records are never ranked as
 * better or worse; the order is by service name, then id.
 */
export function searchWav(
  records: readonly WavServiceRecord[],
  filter: WavFilter = {},
  now: Date = new Date(),
  reviewWindowDays: number = WAV_REVIEW_WINDOW_DAYS,
): WavSearchResult {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new RangeError("Invalid date");
  if (!(reviewWindowDays > 0)) throw new RangeError("Invalid review window");
  const usable: readonly string[] = WAV_USABLE_AVAILABILITY;
  if (filter.availability?.some((value) => !usable.includes(value))) {
    throw new RangeError("Availability filter accepts positive values only");
  }
  if (filter.serviceType !== undefined && filter.serviceType === (WAV_UNKNOWN as string)) {
    throw new RangeError("Service type filter cannot be UNKNOWN");
  }
  const wantedPlace =
    filter.municipality !== undefined ? fold(filter.municipality) : "";

  const items: WavSearchItem[] = [];
  for (const record of records) {
    const stale = WAV_FIELD_NAMES.filter((name) =>
      isStale(record[name], time, reviewWindowDays),
    );
    const current = (name: WavFieldName): boolean =>
      record[name].value !== WAV_UNKNOWN && !stale.includes(name);

    if (wantedPlace) {
      // A municipality is an identity, not a claim that ages, so only
      // UNKNOWN is excluded here.
      if (
        record.municipality.value === WAV_UNKNOWN ||
        fold(record.municipality.value) !== wantedPlace
      ) continue;
    }
    if (filter.serviceType !== undefined) {
      if (
        !current("service_type") ||
        record.service_type.value !== filter.serviceType
      ) continue;
    }
    if (filter.availability && filter.availability.length > 0) {
      const value: string = record.availability.value;
      if (!current("availability") || !filter.availability.some((v) => v === value)) {
        continue;
      }
    }
    const status: WavAvailabilityStatus =
      record.availability.value === WAV_UNKNOWN
        ? "unknown"
        : stale.includes("availability")
          ? "stale"
          : "stated";
    items.push({ record, availability_status: status, stale_fields: stale });
  }
  items.sort((a, b) => {
    const left = fold(a.record.service_name.value);
    const right = fold(b.record.service_name.value);
    if (left !== right) return left < right ? -1 : 1;
    return a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0;
  });
  return { items, coverage: items.length ? "records_found" : "no_records" };
}

/** Distinct stated municipality names, for a filter control. */
export function wavMunicipalities(
  records: readonly WavServiceRecord[],
): string[] {
  const names = new Map<string, string>();
  for (const record of records) {
    const value = record.municipality.value;
    if (value !== WAV_UNKNOWN && !names.has(fold(value))) {
      names.set(fold(value), value);
    }
  }
  return [...names.values()].sort((a, b) => (fold(a) < fold(b) ? -1 : 1));
}
