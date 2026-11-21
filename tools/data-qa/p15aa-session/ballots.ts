/** Replay one case's offline event log against its current evidence revision. */
export interface BallotContext {
  readonly caseId: string;
  readonly revision: string;
  readonly assigned: readonly string[];
  readonly adjudicators: readonly string[];
  readonly excluded: readonly string[];
  readonly quorum: number;
}

export type ReviewChoice = "ready" | "hold";
export type BallotStatus = ReviewChoice | "awaiting" | "disputed";

interface EventAddress {
  readonly sequence: number;
  readonly caseId: string;
  readonly revision: string;
  readonly actor: string;
}

export type BallotEvent =
  | (EventAddress & { readonly kind: "vote"; readonly choice: ReviewChoice })
  | (EventAddress & { readonly kind: "withdraw" })
  | (EventAddress & { readonly kind: "adjudicate"; readonly choice: ReviewChoice });

export interface BallotResult {
  readonly status: BallotStatus;
  readonly counts: Readonly<Record<ReviewChoice, number>>;
  readonly votersNeeded: number;
  readonly adjudicated: boolean;
}

export type BallotErrorCode =
  | "bad-context"
  | "bad-roster"
  | "conflicting-assignment"
  | "bad-quorum"
  | "bad-log"
  | "log-too-long"
  | "bad-event"
  | "out-of-sequence"
  | "other-case"
  | "stale-revision"
  | "bad-choice"
  | "unassigned-voter"
  | "vote-already-active"
  | "no-active-vote"
  | "ineligible-adjudicator"
  | "quorum-missing"
  | "no-dispute"
  | "decision-closed"
  | "history-mismatch"
  | "divergent-vote"
  | "concurrent-ruling";

/** Sequence is the expected one-based position in the file; input text stays private. */
export class BallotError extends Error {
  readonly code: BallotErrorCode;
  readonly sequence: number | null;

  constructor(code: BallotErrorCode, sequence: number | null = null) {
    super(code);
    this.name = "BallotError";
    this.code = code;
    this.sequence = sequence;
  }
}

const reviewerPattern = /^r-[0-9]{3,6}$/u;
const revisionPattern = /^[0-9a-f]{64}$/u;
const casePattern = /^[a-z][a-z0-9_-]{0,95}$/u;
const addressFields = ["kind", "sequence", "caseId", "revision", "actor"];
const choiceFields = [...addressFields, "choice"];

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function roster(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length > 512) throw new BallotError("bad-roster");
  const aliases = new Set<string>();
  for (const alias of value) {
    if (typeof alias !== "string" || !reviewerPattern.test(alias) || aliases.has(alias)) {
      throw new BallotError("bad-roster");
    }
    aliases.add(alias);
  }
  return aliases;
}

function readContext(context: BallotContext) {
  if (!isRecord(context) ||
      typeof context.caseId !== "string" || !casePattern.test(context.caseId) ||
      typeof context.revision !== "string" || !revisionPattern.test(context.revision)) {
    throw new BallotError("bad-context");
  }
  if (!Number.isSafeInteger(context.quorum) || context.quorum < 2 || context.quorum > 64) {
    throw new BallotError("bad-quorum");
  }
  const assigned = roster(context.assigned);
  const excluded = roster(context.excluded);
  const adjudicators = roster(context.adjudicators);
  for (const alias of assigned) {
    if (excluded.has(alias)) throw new BallotError("conflicting-assignment");
  }
  return { assigned, adjudicators, excluded };
}

function readEvent(value: unknown, sequence: number, context: BallotContext): BallotEvent {
  if (!isRecord(value)) throw new BallotError("bad-event", sequence);
  const { kind, actor, caseId, revision, choice } = value;
  if (kind !== "vote" && kind !== "withdraw" && kind !== "adjudicate") {
    throw new BallotError("bad-event", sequence);
  }
  const fields = kind === "withdraw" ? addressFields : choiceFields;
  if (Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value, key))) {
    throw new BallotError("bad-event", sequence);
  }
  if (value.sequence !== sequence) throw new BallotError("out-of-sequence", sequence);
  if (typeof actor !== "string" || !reviewerPattern.test(actor)) {
    throw new BallotError("bad-event", sequence);
  }
  if (caseId !== context.caseId) throw new BallotError("other-case", sequence);
  if (revision !== context.revision) throw new BallotError("stale-revision", sequence);
  if (kind === "withdraw") return { sequence, kind, caseId, revision, actor };
  if (choice !== "ready" && choice !== "hold") throw new BallotError("bad-choice", sequence);
  return { sequence, kind, caseId, revision, actor, choice };
}

/**
 * Quorum counts current, distinct assigned aliases. A withdrawal releases only
 * the actor's own vote. All corrections are explicit withdrawal + new vote.
 * A disagreement stays visible even when one side has a numerical majority.
 * Only an independent adjudicator may close a disputed case that has quorum.
 */
export function evaluateBallots(context: BallotContext, events: unknown): BallotResult {
  return replay(context, events);
}

function replay(context: BallotContext, events: unknown, log?: BallotEvent[]): BallotResult {
  const { assigned, adjudicators, excluded } = readContext(context);
  if (!Array.isArray(events)) throw new BallotError("bad-log");
  if (events.length > 4096) throw new BallotError("log-too-long");

  const active = new Map<string, ReviewChoice>();
  const counts: Record<ReviewChoice, number> = { ready: 0, hold: 0 };
  let ruling: ReviewChoice | undefined;

  for (const [offset, value] of events.entries()) {
    const sequence = offset + 1;
    if (ruling !== undefined) throw new BallotError("decision-closed", sequence);
    const event = readEvent(value, sequence, context);
    log?.push(event);
    if (event.kind === "adjudicate") {
      if (!adjudicators.has(event.actor) || assigned.has(event.actor) || excluded.has(event.actor)) {
        throw new BallotError("ineligible-adjudicator", sequence);
      }
      if (active.size < context.quorum) throw new BallotError("quorum-missing", sequence);
      if (counts.ready === 0 || counts.hold === 0) throw new BallotError("no-dispute", sequence);
      ruling = event.choice;
      continue;
    }
    if (!assigned.has(event.actor)) throw new BallotError("unassigned-voter", sequence);
    const previous = active.get(event.actor);
    if (event.kind === "withdraw") {
      if (previous === undefined) throw new BallotError("no-active-vote", sequence);
      active.delete(event.actor);
      counts[previous] -= 1;
    } else {
      if (previous !== undefined) throw new BallotError("vote-already-active", sequence);
      active.set(event.actor, event.choice);
      counts[event.choice] += 1;
    }
  }

  const votersNeeded = Math.max(0, context.quorum - active.size);
  let status: BallotStatus = "awaiting";
  if (ruling !== undefined) status = ruling;
  else if (counts.ready > 0 && counts.hold > 0) status = "disputed";
  else if (votersNeeded === 0) status = counts.hold > 0 ? "hold" : "ready";
  return { status, counts, votersNeeded, adjudicated: ruling !== undefined };
}

function canonicalLog(context: BallotContext, input: unknown): BallotEvent[] {
  const events: BallotEvent[] = [];
  replay(context, input, events);
  return events;
}

function sameIntent(a: BallotEvent, b: BallotEvent): boolean {
  if (a.actor !== b.actor || a.kind !== b.kind) return false;
  if (a.kind === "withdraw" || b.kind === "withdraw") return true;
  return a.choice === b.choice;
}

function sharedLength(first: readonly BallotEvent[], second: readonly BallotEvent[]): number {
  let offset = 0;
  while (offset < first.length && offset < second.length) {
    if (!sameIntent(first[offset]!, second[offset]!)) break;
    offset += 1;
  }
  return offset;
}

/**
 * Import a reviewer's returned log into the accepted log without overwriting a
 * recorded action. The base is the exact log that went out with the handoff.
 * Per-actor history after the common prefix distinguishes retries from edits
 * to different working copies. A ruling made without seeing concurrent edits
 * must return to the adjudicator for a new decision.
 */
export function reconcileBallotLogs(
  context: BallotContext,
  baseInput: unknown,
  acceptedInput: unknown,
  submittedInput: unknown,
): BallotEvent[] {
  const base = canonicalLog(context, baseInput);
  const accepted = canonicalLog(context, acceptedInput);
  const submitted = canonicalLog(context, submittedInput);
  if (sharedLength(base, accepted) < base.length || sharedLength(base, submitted) < base.length) {
    throw new BallotError("history-mismatch");
  }
  const common = sharedLength(accepted, submitted);
  if (common === submitted.length) return accepted;
  if (common === accepted.length) return submitted;

  const acceptedByActor = new Map<string, BallotEvent[]>();
  let acceptedRuling = false;
  for (const event of accepted.slice(common)) {
    const edits = acceptedByActor.get(event.actor);
    if (edits) edits.push(event);
    else acceptedByActor.set(event.actor, [event]);
    if (event.kind === "adjudicate") acceptedRuling = true;
  }

  const seen = new Map<string, number>();
  const merged = [...accepted];
  for (const event of submitted.slice(common)) {
    // Diverging logs can preserve a ruling only as part of a direct fast-forward.
    if (event.kind === "adjudicate") throw new BallotError("concurrent-ruling", event.sequence);
    const offset = seen.get(event.actor) ?? 0;
    seen.set(event.actor, offset + 1);
    const local = acceptedByActor.get(event.actor)?.[offset];
    if (local) {
      if (!sameIntent(local, event)) throw new BallotError("divergent-vote", event.sequence);
    } else {
      if (acceptedRuling) throw new BallotError("concurrent-ruling", event.sequence);
      merged.push({ ...event, sequence: merged.length + 1 });
    }
  }

  // Enforce the normal role, state-transition and resource limits on the combined log.
  evaluateBallots(context, merged);
  return merged;
}
