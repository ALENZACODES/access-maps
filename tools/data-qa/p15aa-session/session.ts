import { createHash, randomUUID } from "node:crypto";
import {
  planAssignments, type AssignmentPlan, type AssignmentReviewer, type CaseAllocation,
} from "./assignment.js";
import {
  evaluateBallots, type BallotContext, type BallotEvent, type BallotResult,
} from "./ballots.js";
import { buildReviewEvidence } from "./evidence.js";

type Evidence = ReturnType<typeof buildReviewEvidence>[number];
type Outcome = "awaiting" | "ready" | "hold" | "disputed";

export class SessionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SessionError";
  }
}

function fail(code: string): never {
  throw new SessionError(code);
}

function object(value: unknown, keys: string[], error: string) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(error);
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).length !== keys.length || keys.some(key => !Object.hasOwn(fields, key))) {
    fail(error);
  }
  return fields;
}

function list(value: unknown, limit: number, error: string): unknown[] {
  if (!Array.isArray(value) || value.length > limit) fail(error);
  return value;
}

function token(value: unknown, pattern: RegExp, error: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(error);
  return value;
}

const alias = /^r-[0-9]{3,6}$/u;
const digest = /^[a-f0-9]{64}$/u;
const caseId = /^c-[a-f0-9]{32}$/u;
const sessionId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const version = "p15-review-session/v1";

function aliases(value: unknown): string[] {
  const ids = list(value, 512, "invalid-roster").map(id => token(id, alias, "invalid-alias"));
  if (new Set(ids).size !== ids.length) fail("duplicate-alias");
  return ids.sort();
}

function hash(domain: string, parts: unknown): string {
  return createHash("sha256").update(JSON.stringify([version, domain, parts])).digest("hex");
}

interface Policy {
  caseId: string;
  evidenceRevision: string;
  conflictsChecked: boolean;
  ownerId: string | null;
  excluded: string[];
  locked: string[];
  binding: string | null;
  events: unknown[];
}

export interface SessionFile {
  schema: typeof version;
  sessionId: string;
  quorum: number;
  reviewers: AssignmentReviewer[];
  adjudicators: string[];
  cases: Policy[];
}

export function createSession(evidence: readonly Evidence[]): SessionFile {
  if (!evidence.length) fail("empty-review");
  return {
    schema: version, sessionId: randomUUID(), quorum: 2, reviewers: [], adjudicators: [],
    cases: evidence.map(item => ({
      caseId: item.id, evidenceRevision: item.revision, conflictsChecked: false,
      ownerId: null, excluded: [], locked: [], binding: null, events: [],
    })),
  };
}

function readPolicy(raw: unknown): Policy {
  const row = object(raw, [
    "caseId", "evidenceRevision", "conflictsChecked", "ownerId", "excluded", "locked", "binding", "events",
  ], "invalid-case-policy");
  if (row.conflictsChecked !== true) fail("conflicts-unchecked");
  return {
    caseId: token(row.caseId, caseId, "invalid-case-id"),
    evidenceRevision: token(row.evidenceRevision, digest, "invalid-evidence-revision"),
    conflictsChecked: true,
    ownerId: row.ownerId === null ? null : token(row.ownerId, alias, "invalid-owner"),
    excluded: aliases(row.excluded), locked: aliases(row.locked),
    binding: row.binding === null ? null : token(row.binding, digest, "invalid-binding"),
    events: list(row.events, 4096, "invalid-history").slice(),
  };
}

function readSession(input: unknown, evidence: readonly Evidence[]): SessionFile {
  const raw = object(input, ["schema", "sessionId", "quorum", "reviewers", "adjudicators", "cases"], "invalid-session");
  if (raw.schema !== version) fail("unsupported-session");
  if (typeof raw.quorum !== "number" || !Number.isInteger(raw.quorum) || raw.quorum < 2 || raw.quorum > 64) {
    fail("invalid-independent-quorum");
  }
  const reviewers = list(raw.reviewers, 512, "invalid-roster").map(value => {
    const r = object(value, ["reviewerId", "capacity"], "invalid-reviewer");
    if (typeof r.capacity !== "number" || !Number.isSafeInteger(r.capacity) || r.capacity < 0) fail("invalid-capacity");
    return { reviewerId: token(r.reviewerId, alias, "invalid-alias"), capacity: r.capacity };
  });
  reviewers.sort((a, b) => a.reviewerId < b.reviewerId ? -1 : a.reviewerId > b.reviewerId ? 1 : 0);
  const cases = list(raw.cases, 10000, "invalid-cases").map(readPolicy);
  const expected = new Map(evidence.map(item => [item.id, item.revision]));
  if (!cases.length || cases.length !== expected.size) fail("case-set-changed");
  for (const row of cases) {
    if (!expected.has(row.caseId)) fail("case-set-changed");
    if (expected.get(row.caseId) !== row.evidenceRevision) fail("stale-evidence");
    expected.delete(row.caseId);
  }
  cases.sort((a, b) => a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0);
  const adjudicators = aliases(raw.adjudicators);
  if (reviewers.some(r => adjudicators.includes(r.reviewerId))) fail("overlapping-roles");
  return {
    schema: version, sessionId: token(raw.sessionId, sessionId, "invalid-session-id"),
    quorum: raw.quorum, reviewers, adjudicators, cases,
  };
}

function excluded(row: Policy): string[] {
  const values = new Set(row.excluded);
  if (row.ownerId !== null) values.add(row.ownerId);
  return [...values].sort();
}

function contextFor(file: SessionFile, row: Policy, allocation: CaseAllocation): BallotContext {
  const omitted = excluded(row);
  const revision = hash("assignment", [
    file.sessionId, row.caseId, row.evidenceRevision, file.quorum,
    row.ownerId, omitted, allocation.reviewerIds, file.adjudicators,
  ]);
  return {
    revision, caseId: row.caseId, assigned: allocation.reviewerIds,
    adjudicators: file.adjudicators, excluded: omitted, quorum: file.quorum,
  };
}

interface Reviewed {
  evidence: Evidence;
  policy: Policy;
  allocation: CaseAllocation;
  context: BallotContext;
  ballot: BallotResult;
  events: BallotEvent[];
  outcome: Outcome;
}

interface OpenSession {
  file: SessionFile;
  plan: AssignmentPlan;
  rows: Reviewed[];
}

function openSession(evidence: readonly Evidence[], input: unknown): OpenSession {
  const file = readSession(input, evidence);
  const plan = planAssignments(file.cases.map(row => ({
    caseId: row.caseId, required: file.quorum, excludedReviewerIds: excluded(row),
    lockedReviewerIds: row.locked,
  })), file.reviewers);
  const allocations = new Map(plan.assignments.map(row => [row.caseId, row]));
  const records = new Map(evidence.map(row => [row.id, row]));
  const rows = file.cases.map(policy => {
    const allocation = allocations.get(policy.caseId)!;
    const record = records.get(policy.caseId)!;
    const context = contextFor(file, policy, allocation);
    if (policy.binding === null && policy.events.length) fail("unsealed-votes");
    if (policy.binding !== null && (
      policy.binding !== context.revision || policy.locked.length !== file.quorum || allocation.missing
    )) fail("assignment-binding-changed");
    const ballot = evaluateBallots(context, policy.events);
    // Only export the strict event schema after replay validates the entire history.
    const events = policy.events as BallotEvent[];
    const outcome = record.state === "held" ? "hold" : ballot.status;
    return { evidence: record, policy, allocation, context, ballot, events, outcome };
  });
  return { file, plan, rows };
}

export function planSession(evidence: readonly Evidence[], input: unknown): AssignmentPlan {
  return openSession(evidence, input).plan;
}

export function sealSession(evidence: readonly Evidence[], input: unknown): SessionFile {
  const { file, plan, rows } = openSession(evidence, input);
  if (!plan.complete) fail("assignment-incomplete");
  return {
    ...file,
    cases: rows.map(({ policy, allocation, context }) => ({
      ...policy, locked: allocation.reviewerIds.slice(), binding: context.revision,
    })),
  };
}

export function openSealedSession(evidence: readonly Evidence[], input: unknown): OpenSession {
  const session = openSession(evidence, input);
  if (session.rows.some(row => row.policy.binding === null)) fail("unsealed-session");
  return session;
}

function eventBody(event: BallotEvent) {
  return [event.kind, event.actor, event.kind === "withdraw" ? null : event.choice];
}

function receipt(row: Reviewed, actor?: string, stop = row.events.length) {
  const visible = row.events.slice(0, stop).filter(event => actor === undefined || event.actor === actor);
  return hash(actor === undefined ? "case-history" : "voter-history", [
    row.context.revision, actor ?? null, visible.map(eventBody),
  ]);
}

export function auditSession(evidence: readonly Evidence[], input: unknown) {
  const { file, rows } = openSealedSession(evidence, input);
  return {
    schema: "p15-review-audit/v1", sessionId: file.sessionId, quorum: file.quorum,
    cases: rows.map(row => ({
      evidence: row.evidence, outcome: row.outcome, ballot: row.ballot,
      assigned: row.allocation.reviewerIds, revision: row.context.revision,
      adjudicators: file.adjudicators.filter(actor => !row.context.assigned.includes(actor) && !row.context.excluded.includes(actor)),
      historyHead: receipt(row), events: row.events,
    })),
  };
}

export type SessionAudit = ReturnType<typeof auditSession>;

export function reviewerDesk(evidence: readonly Evidence[], input: unknown, reviewer: string) {
  token(reviewer, alias, "invalid-alias");
  const { file, rows } = openSealedSession(evidence, input);
  if (!file.reviewers.some(r => r.reviewerId === reviewer)) fail("unknown-reviewer");
  return {
    schema: "p15-review-desk/v1", sessionId: file.sessionId, reviewer,
    cases: rows.filter(row => row.context.assigned.includes(reviewer)).map(row => {
      const history = row.events.filter(event => event.actor === reviewer);
      const last = history.at(-1);
      return {
        evidence: row.evidence, revision: row.context.revision, previous: receipt(row, reviewer),
        ownChoice: last?.kind === "vote" ? last.choice : null, closed: row.ballot.adjudicated,
      };
    }),
  };
}

export type ReviewerDesk = ReturnType<typeof reviewerDesk>;

/** Apply a disconnected response exactly once. Receipts refer to an actor's
 * own chain for ordinary votes and to the complete case for a ruling. */
export function submitResponse(evidence: readonly Evidence[], input: unknown, response: unknown): SessionFile {
  const { file, rows } = openSealedSession(evidence, input);
  const raw = object(response, ["sessionId", "caseId", "revision", "actor", "previous", "kind", "choice"], "invalid-response");
  if (raw.sessionId !== file.sessionId) fail("other-session");
  const row = rows.find(r => r.evidence.id === raw.caseId);
  if (!row) fail("other-case");
  if (raw.revision !== row.context.revision) fail("stale-assignment");
  const actor = token(raw.actor, alias, "invalid-alias");
  const previous = token(raw.previous, digest, "invalid-receipt");
  const kind = raw.kind;
  if (kind !== "withdraw" && kind !== "vote" && kind !== "adjudicate") fail("invalid-action");
  const choice = raw.choice;
  if (kind === "withdraw" ? choice !== null : choice !== "hold" && choice !== "ready") fail("invalid-choice");
  const scope = kind === "adjudicate" ? undefined : actor;
  if (previous !== receipt(row, scope)) {
    let last = row.events.length - 1;
    while (last >= 0 && scope !== undefined && row.events[last]?.actor !== actor) last--;
    const event = row.events[last];
    if (event && event.kind === kind && event.actor === actor &&
        (event.kind === "withdraw" || event.choice === choice) && previous === receipt(row, scope, last)) return file;
    fail("stale-response");
  }
  const address = { sequence: row.events.length + 1, caseId: row.evidence.id, revision: row.context.revision, actor };
  const event = kind === "withdraw" ? { ...address, kind } : { ...address, kind, choice };
  const next = [...row.events, event];
  evaluateBallots(row.context, next);
  row.policy.events = next;
  return file;
}
