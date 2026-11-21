export const DECISION_SCHEMA = "place-link-decisions/v1";

export type Decision = "reviewed" | "follow-up";
export type ReviewStatus = Decision | "open" | "stale" | "conflict" | "restricted";

export interface DecisionEntry {
  readonly id: string;
  readonly fingerprint: string;
  readonly decision: Decision;
}

export interface DecisionFile {
  readonly schema: typeof DECISION_SCHEMA;
  readonly entries: readonly DecisionEntry[];
}

export interface DecisionCase {
  readonly id: string;
  readonly fingerprint: string;
  readonly restricted: boolean;
}

export interface DecisionReconciliation {
  status: Map<string, ReviewStatus>;
  /** Distinct case IDs in the handoffs absent from this review's complete scope. */
  orphanCount: number;
}

type DecisionErrorCode = "shape" | "schema" | "unknown-field" | "entries" | "identifier" |
  "fingerprint" | "decision" | "duplicate-id" | "restricted";

export class DecisionError extends Error {
  readonly code: DecisionErrorCode;
  readonly field: string;
  constructor(code: DecisionErrorCode, field: string) {
    super(`${code} (${field})`);
    this.name = "DecisionError";
    this.code = code;
    this.field = field;
  }
}

function object(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DecisionError("shape", location);
  return value as Record<string, unknown>;
}

function own(row: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}

function exactFields(row: Record<string, unknown>, allowed: Set<string>, location: string): void {
  // Raising a path rather than echoing an unexpected key keeps notes and identifiers out of errors.
  if (Object.keys(row).some(key => !allowed.has(key))) throw new DecisionError("unknown-field", location);
}

function hash(value: unknown, code: "identifier" | "fingerprint", location: string): string {
  if (typeof value !== "string" || value.length !== 64 || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new DecisionError(code, location);
  }
  return value;
}

const rootFields = new Set(["schema", "entries"]);
const entryFields = new Set(["id", "fingerprint", "decision"]);

function* validEntries(input: unknown): IterableIterator<DecisionEntry> {
  const document = object(input, "file");
  exactFields(document, rootFields, "file");
  if (own(document, "schema") !== DECISION_SCHEMA) throw new DecisionError("schema", "schema");
  const entries = own(document, "entries");
  if (!Array.isArray(entries)) throw new DecisionError("entries", "entries");
  const seen = new Set<string>();
  for (const [i, item] of entries.entries()) {
    const at = `entries[${i}]`;
    const row = object(item, at);
    exactFields(row, entryFields, at);
    const id = hash(own(row, "id"), "identifier", at + ".id");
    const fingerprint = hash(own(row, "fingerprint"), "fingerprint", at + ".fingerprint");
    const decision = own(row, "decision");
    if (decision !== "reviewed" && decision !== "follow-up") throw new DecisionError("decision", at + ".decision");
    if (seen.has(id)) throw new DecisionError("duplicate-id", at + ".id");
    seen.add(id);
    yield { id, fingerprint, decision };
  }
}

/** A local handoff contains opaque case keys and dispositions only. */
export function readDecisions(input: unknown): DecisionFile {
  const entries = Array.from(validEntries(input), entry => Object.freeze(entry));
  return Object.freeze({ schema: DECISION_SCHEMA, entries: Object.freeze(entries) });
}

interface Tally {
  fingerprint: string;
  restricted: boolean;
  current: Decision | "conflict" | null;
  prior: boolean;
}

function recordVote(tally: Tally, entry: DecisionEntry): void {
  if (tally.restricted) return;
  if (tally.fingerprint !== entry.fingerprint) {
    tally.prior = true;
    return;
  }
  if (tally.current === null) tally.current = entry.decision;
  else if (tally.current !== entry.decision) tally.current = "conflict";
}

function resolved(tally: Tally): ReviewStatus {
  if (tally.restricted) return "restricted";
  return tally.current ?? (tally.prior ? "stale" : "open");
}

/**
 * Match both the stable case key and the fingerprint of its current evidence.
 * A declaration about an older fingerprint never decides the current case.
 * All files have equal precedence. Conflicting current decisions require review.
 */
export function reconcileDecisions(
  cases: Iterable<DecisionCase>, files: readonly DecisionFile[],
): DecisionReconciliation {
  const current = new Map<string, Tally>();
  let i = 0;
  for (const item of cases) {
    const at = `cases[${i++}]`;
    const row = object(item, at);
    const id = hash(own(row, "id"), "identifier", at + ".id");
    const fingerprint = hash(own(row, "fingerprint"), "fingerprint", at + ".fingerprint");
    const restricted = own(row, "restricted");
    if (typeof restricted !== "boolean") throw new DecisionError("restricted", at + ".restricted");
    if (current.has(id)) throw new DecisionError("duplicate-id", at + ".id");
    current.set(id, { fingerprint, restricted, current: null, prior: false });
  }

  const orphans = new Set<string>();
  for (const file of files) {
    for (const entry of validEntries(file)) {
      const tally = current.get(entry.id);
      if (tally) recordVote(tally, entry);
      else orphans.add(entry.id);
    }
  }

  const status = new Map<string, ReviewStatus>();
  for (const id of [...current.keys()].sort()) status.set(id, resolved(current.get(id)!));
  return { status, orphanCount: orphans.size };
}
