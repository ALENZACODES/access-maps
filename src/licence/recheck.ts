import type { SourceEntry, SourceRegistry } from "../registry.js";

/**
 * Licence re-check register. Master plan Part 5, Appendix 5B, Day 30 task 2:
 * begin the licence re-checks flagged in the source register.
 *
 * Flags come only from words already written in sources/registry.json and
 * sources/gaps.json, and from the tile hold list. This file does not fetch a
 * licence page and does not decide what a licence allows. A person reads the
 * page and records the result in sources/licence-rechecks.json.
 */

export const DEFAULT_RECHECK_DAYS = 90;
export const FLAGGED_RECHECK_DAYS = 30;

export type FlagCode =
  | "revocable"
  | "indemnity"
  | "not-reconciled"
  | "legal-review"
  | "not-plain-open-grant"
  | "no-licence-version"
  | "licence-field-null"
  | "licence-page-unreachable"
  | "unknown-licence"
  | "no-grant-of-rights"
  | "request-form"
  | "held-from-open-tiles";

export interface LicenceFlag {
  code: FlagCode;
  /** The sentence in the register that raised the flag. Empty for the tile hold list. */
  evidence: string;
}

export type CheckResult = "unchanged" | "changed" | "unreachable";

export interface RecheckLogEntry {
  /** A registry id, or a gaps.json name for a dataset that was not imported. */
  subject: string;
  checked_on: string;
  /** A role, not a person's name. */
  checker_role: string;
  url_checked: string;
  result: CheckResult;
  http_status?: number;
  note: string;
}

export interface GapEntry {
  name: string;
  url: string;
  reason: string;
}

export type DueState = "overdue" | "due" | "not due";

export interface RegisterRow {
  subject: string;
  kind: "imported" | "not imported";
  licence_id: string;
  licence_url: string;
  flags: LicenceFlag[];
  flagged: boolean;
  last_checked: string;
  last_checked_from: "registry retrieval date" | "gap record date" | "re-check log" | "no date recorded";
  last_result: CheckResult | "no re-check recorded";
  interval_days: number;
  due_on: string | null;
  state: DueState;
}

export interface Register {
  as_of: string;
  rows: RegisterRow[];
  flagged: number;
  overdue: number;
  due: number;
  statement: string;
}

const RULES: Array<{ code: FlagCode; pattern: RegExp }> = [
  { code: "revocable", pattern: /\brevocable\b|\bmay cancel or suspend\b/i },
  { code: "indemnity", pattern: /\bindemnity\b/i },
  { code: "not-reconciled", pattern: /\bnot been reconciled\b|\bnot reconciled\b/i },
  { code: "legal-review", pattern: /\blegal review\b/i },
  { code: "not-plain-open-grant", pattern: /\bnot (?:recorded as )?a plain open grant\b|\bnot treated as a settled open grant\b/i },
  { code: "no-licence-version", pattern: /\bdoes not state a creative commons version\b|\bno version is\b/i },
  { code: "licence-field-null", pattern: /\blicen[cs]e_?id null\b|\blicenseinfo was null\b/i },
  { code: "licence-page-unreachable", pattern: /\bHTTP (?:403|404|5\d\d)\b|\binterstitial\b/i },
  { code: "unknown-licence", pattern: /\bUNKNOWN licence\b|\blicence text could not be confirmed\b|\blicence not specified\b/i },
  { code: "no-grant-of-rights", pattern: /\bno grant of rights\b|\bdid not include a grant of rights\b|\bdid not grant a right\b/i },
  { code: "request-form", pattern: /\brequest form\b/i },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESULTS: readonly CheckResult[] = ["unchanged", "changed", "unreachable"];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function flagsFromText(text: string): LicenceFlag[] {
  const flags: LicenceFlag[] = [];
  const parts = sentences(text);
  for (const rule of RULES) {
    const hit = parts.find((sentence) => rule.pattern.test(sentence));
    if (hit) flags.push({ code: rule.code, evidence: hit });
  }
  return flags;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function firstDate(text: string): string | null {
  const match = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  return match && isIsoDate(match[1]) ? match[1]! : null;
}

export interface LogIssue {
  index: number;
  field: string;
  message: string;
}

/** Check the hand-kept log before it is used. A bad entry is reported, not repaired. */
export function validateLog(entries: unknown, subjects: ReadonlySet<string>, asOf: string): LogIssue[] {
  const issues: LogIssue[] = [];
  if (!Array.isArray(entries)) return [{ index: -1, field: "", message: "The log must be a JSON array." }];
  entries.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ index, field: "", message: "Each entry must be an object." });
      return;
    }
    const entry = raw as Record<string, unknown>;
    const allowed = new Set(["subject", "checked_on", "checker_role", "url_checked", "result", "http_status", "note"]);
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) issues.push({ index, field: key, message: "This field is not part of a re-check entry." });
    }
    if (typeof entry.subject !== "string" || !subjects.has(entry.subject)) {
      issues.push({ index, field: "subject", message: "Use a registry id or a gaps.json name." });
    }
    if (!isIsoDate(entry.checked_on)) issues.push({ index, field: "checked_on", message: "Use a calendar date, YYYY-MM-DD." });
    else if (entry.checked_on > asOf) issues.push({ index, field: "checked_on", message: "The check date is after the as-of date." });
    if (typeof entry.checker_role !== "string" || entry.checker_role.trim().length < 3) {
      issues.push({ index, field: "checker_role", message: "Name the role that did the check." });
    }
    if (typeof entry.url_checked !== "string" || !/^https?:\/\/\S+$/.test(entry.url_checked)) {
      issues.push({ index, field: "url_checked", message: "Give the licence or terms URL that was read." });
    }
    if (!RESULTS.includes(entry.result as CheckResult)) {
      issues.push({ index, field: "result", message: "Use unchanged, changed, or unreachable." });
    }
    if (entry.http_status !== undefined && (!Number.isInteger(entry.http_status) || (entry.http_status as number) < 100 || (entry.http_status as number) > 599)) {
      issues.push({ index, field: "http_status", message: "Use an HTTP status code." });
    }
    if (entry.result === "unreachable" && entry.http_status === undefined) {
      issues.push({ index, field: "http_status", message: "An unreachable page needs the HTTP status that was returned." });
    }
    if (typeof entry.note !== "string" || entry.note.trim().length < 10) {
      issues.push({ index, field: "note", message: "Say what the page said, or what failed." });
    }
  });
  return issues;
}

function stateFor(dueOn: string | null, asOf: string): DueState {
  if (dueOn === null || dueOn < asOf) return "overdue";
  if (dueOn === asOf) return "due";
  return "not due";
}

export interface RegisterOptions {
  asOf: string;
  heldFromTiles?: ReadonlySet<string>;
  intervalDays?: number;
  flaggedIntervalDays?: number;
}

export function buildRegister(registry: SourceRegistry, gaps: readonly GapEntry[], log: readonly RecheckLogEntry[], options: RegisterOptions): Register {
  if (!isIsoDate(options.asOf)) throw new Error("as-of must be a calendar date, YYYY-MM-DD");
  const normal = options.intervalDays ?? DEFAULT_RECHECK_DAYS;
  const flaggedDays = options.flaggedIntervalDays ?? FLAGGED_RECHECK_DAYS;
  const held = options.heldFromTiles ?? new Set<string>();
  const latest = new Map<string, RecheckLogEntry>();
  for (const entry of log) {
    const current = latest.get(entry.subject);
    if (!current || entry.checked_on >= current.checked_on) latest.set(entry.subject, entry);
  }

  const rows: RegisterRow[] = [];
  const add = (row: Omit<RegisterRow, "flagged" | "interval_days" | "due_on" | "state" | "last_result" | "last_checked" | "last_checked_from">, base: string | null, baseFrom: RegisterRow["last_checked_from"]) => {
    const flagged = row.flags.length > 0;
    const interval = flagged ? flaggedDays : normal;
    const logged = latest.get(row.subject);
    const lastChecked = logged ? logged.checked_on : base;
    const dueOn = lastChecked ? addDays(lastChecked, interval) : null;
    rows.push({
      ...row,
      flagged,
      last_checked: lastChecked ?? "no date recorded",
      last_checked_from: logged ? "re-check log" : base ? baseFrom : "no date recorded",
      last_result: logged ? logged.result : "no re-check recorded",
      interval_days: interval,
      due_on: dueOn,
      state: stateFor(dueOn, options.asOf),
    });
  };

  for (const source of registry.sources) {
    const flags = flagsFromText(`${source.notes ?? ""} ${source.tier_note ?? ""}`);
    if (held.has(source.id)) flags.push({ code: "held-from-open-tiles", evidence: "" });
    add(
      { subject: source.id, kind: "imported", licence_id: source.licence_id, licence_url: source.licence_url, flags },
      isIsoDate(source.retrieved_at) ? source.retrieved_at : null,
      "registry retrieval date",
    );
  }
  for (const gap of gaps) {
    add(
      { subject: gap.name, kind: "not imported", licence_id: "UNKNOWN", licence_url: gap.url, flags: flagsFromText(gap.reason) },
      firstDate(gap.reason),
      "gap record date",
    );
  }

  const order: Record<DueState, number> = { overdue: 0, due: 1, "not due": 2 };
  rows.sort((a, b) => order[a.state] - order[b.state] || Number(b.flagged) - Number(a.flagged) || a.subject.localeCompare(b.subject));
  return {
    as_of: options.asOf,
    rows,
    flagged: rows.filter((row) => row.flagged).length,
    overdue: rows.filter((row) => row.state === "overdue").length,
    due: rows.filter((row) => row.state === "due").length,
    statement:
      "This register lists when each licence should be read again. It does not say what a licence allows. Flags quote the source register. A person records each re-check in sources/licence-rechecks.json.",
  };
}

export function subjectsOf(registry: SourceRegistry, gaps: readonly GapEntry[]): Set<string> {
  return new Set([...registry.sources.map((source: SourceEntry) => source.id), ...gaps.map((gap) => gap.name)]);
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function registerMarkdown(register: Register): string {
  const lines = [
    "# Licence re-check register",
    "",
    `As of ${register.as_of}. Flagged: ${register.flagged}. Overdue: ${register.overdue}. Due today: ${register.due}.`,
    "",
    register.statement,
    "",
    "| Dataset | Imported | Licence | Flags | Last checked | From | Last result | Due | State |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of register.rows) {
    lines.push(
      `| ${cell(row.subject)} | ${row.kind === "imported" ? "yes" : "no"} | ${cell(row.licence_id)} | ${row.flags.map((flag) => flag.code).join(", ") || "none"} | ${row.last_checked} | ${row.last_checked_from} | ${row.last_result} | ${row.due_on ?? "now"} | ${row.state} |`,
    );
  }
  const evidence = register.rows.filter((row) => row.flags.some((flag) => flag.evidence));
  if (evidence.length > 0) {
    lines.push("", "## Why each dataset is flagged", "");
    for (const row of evidence) {
      lines.push(`### ${cell(row.subject)}`, "");
      for (const flag of row.flags) {
        lines.push(`- ${flag.code}: ${flag.evidence ? `“${flag.evidence}”` : "listed in TILES_HELD_FOR_LEGAL_REVIEW in scripts/build-pmtiles.ts."}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
