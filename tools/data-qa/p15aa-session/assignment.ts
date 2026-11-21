/** Work allocation only. An assignment never changes a case's evidence or tier. */
export interface AssignmentCase {
  caseId: string;
  required: number;
  ownerId?: string;
  excludedReviewerIds?: readonly string[];
  lockedReviewerIds?: readonly string[];
}

export interface AssignmentReviewer {
  reviewerId: string;
  /** Total slots in this session, including the reviewer's locked assignments. */
  capacity: number;
}

export type AssignmentShortage =
  | "none"
  | "empty-roster"
  | "no-independent-reviewer"
  | "insufficient-independent-reviewers"
  | "capacity-exhausted";

export interface CaseAllocation {
  caseId: string;
  /** Includes locks. A reviewer occupies at most one slot per case. */
  reviewerIds: string[];
  lockedReviewerIds: string[];
  missing: number;
  shortage: AssignmentShortage;
}

export interface AssignmentPlan {
  complete: boolean;
  assignments: CaseAllocation[];
  loads: { reviewerId: string; assigned: number; capacity: number }[];
}

export type AssignmentInputIssue =
  | "invalid-input"
  | "batch-too-large"
  | "invalid-reviewer-id"
  | "invalid-case-id"
  | "invalid-capacity"
  | "invalid-required"
  | "duplicate-reviewer"
  | "duplicate-case"
  | "invalid-reviewer-list"
  | "duplicate-reviewer-reference"
  | "unknown-lock"
  | "conflicted-lock"
  | "too-many-locks"
  | "over-capacity-locks";

/** Error codes can be translated by callers without forwarding raw input. */
export class AssignmentInputError extends Error {
  constructor(public readonly code: AssignmentInputIssue) {
    super(code);
    this.name = "AssignmentInputError";
  }
}

const MAX_CASES = 10_000;
const MAX_REVIEWERS = 512;
const MAX_PAIRS = 500_000;
const CASE_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const REVIEWER_ID = /^r-[0-9]{3,6}$/;

function fail(code: AssignmentInputIssue): never {
  throw new AssignmentInputError(code);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function reviewerCode(value: unknown): string {
  if (typeof value !== "string" || !REVIEWER_ID.test(value)) {
    fail("invalid-reviewer-id");
  }
  return value;
}

function reviewerSet(value: unknown): Set<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > MAX_REVIEWERS) {
    fail("invalid-reviewer-list");
  }
  const ids = new Set<string>();
  for (const raw of value) {
    const id = reviewerCode(raw);
    if (ids.has(id)) fail("duplicate-reviewer-reference");
    ids.add(id);
  }
  return ids;
}

interface ReviewSlot {
  reviewerId: string;
  capacity: number;
  locked: number;
}

function readRoster(input: readonly AssignmentReviewer[]): ReviewSlot[] {
  const seen = new Set<string>();
  const slots: ReviewSlot[] = [];
  for (const entry of input) {
    if (entry === null || typeof entry !== "object") fail("invalid-input");
    const id = reviewerCode(entry.reviewerId);
    if (seen.has(id)) fail("duplicate-reviewer");
    if (!Number.isSafeInteger(entry.capacity) || entry.capacity < 0) {
      fail("invalid-capacity");
    }
    seen.add(id);
    slots.push({ reviewerId: id, capacity: entry.capacity, locked: 0 });
  }
  return slots.sort((a, b) => compareIds(a.reviewerId, b.reviewerId));
}

interface ReviewWork {
  caseId: string;
  required: number;
  excluded: Set<string>;
  locked: Set<string>;
}

function readCases(input: readonly AssignmentCase[], roster: ReviewSlot[]): ReviewWork[] {
  const slots = new Map(roster.map(slot => [slot.reviewerId, slot]));
  const seen = new Set<string>();
  const cases: ReviewWork[] = [];
  for (const entry of input) {
    if (entry === null || typeof entry !== "object") fail("invalid-input");
    if (typeof entry.caseId !== "string" || !CASE_ID.test(entry.caseId)) {
      fail("invalid-case-id");
    }
    if (seen.has(entry.caseId)) fail("duplicate-case");
    if (!Number.isSafeInteger(entry.required) || entry.required <= 0) {
      fail("invalid-required");
    }
    seen.add(entry.caseId);
    const excluded = reviewerSet(entry.excludedReviewerIds);
    if (entry.ownerId !== undefined) excluded.add(reviewerCode(entry.ownerId));
    const locked = reviewerSet(entry.lockedReviewerIds);
    if (locked.size > entry.required) fail("too-many-locks");
    for (const id of locked) {
      const reviewer = slots.get(id);
      if (!reviewer) fail("unknown-lock");
      if (excluded.has(id)) fail("conflicted-lock");
      if (++reviewer.locked > reviewer.capacity) fail("over-capacity-locks");
    }
    cases.push({ caseId: entry.caseId, required: entry.required, excluded, locked });
  }
  return cases.sort((a, b) => compareIds(a.caseId, b.caseId));
}

interface Edge {
  to: number;
  reverse: number;
  remaining: number;
}

/**
 * Dinic's algorithm uses reverse arcs to move an earlier tentative assignment
 * when it is the only way to fill a later case. Locks are deducted up front
 * and never enter the residual network.
 */
class SlotNetwork {
  readonly edges: Edge[][];

  constructor(vertices: number) {
    this.edges = Array.from({ length: vertices }, () => []);
  }

  connect(from: number, to: number, capacity: number): Edge {
    const forward = { to, remaining: capacity, reverse: this.edges[to]!.length };
    const reverse = { to: from, remaining: 0, reverse: this.edges[from]!.length };
    this.edges[from]!.push(forward);
    this.edges[to]!.push(reverse);
    return forward;
  }

  private levelsFrom(source: number): Int32Array {
    const levels = new Int32Array(this.edges.length).fill(-1);
    levels[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head]!;
      for (const edge of this.edges[vertex]!) {
        if (edge.remaining > 0 && levels[edge.to] === -1) {
          levels[edge.to] = levels[vertex]! + 1;
          queue.push(edge.to);
        }
      }
    }
    return levels;
  }

  fill(source: number, sink: number): void {
    for (;;) {
      const levels = this.levelsFrom(source);
      if (levels[sink] === -1) return;
      const next = new Int32Array(this.edges.length);
      // A level path alternates cases and distinct reviewers. Its call depth
      // is bounded by twice MAX_REVIEWERS plus the source and sink.
      const transfer = (vertex: number, amount: number): number => {
        if (vertex === sink) return amount;
        const arcs = this.edges[vertex]!;
        while (next[vertex]! < arcs.length) {
          const edge = arcs[next[vertex]!]!;
          if (edge.remaining && levels[edge.to] === levels[vertex]! + 1) {
            const sent = transfer(edge.to, Math.min(amount, edge.remaining));
            if (sent > 0) {
              edge.remaining -= sent;
              this.edges[edge.to]![edge.reverse]!.remaining += sent;
              return sent;
            }
          }
          next[vertex] = next[vertex]! + 1;
        }
        return 0;
      };
      while (transfer(source, MAX_PAIRS) > 0) {
        // Reuse the live edge cursors until this level graph has no path.
      }
    }
  }
}

function shortageFor(
  missing: number,
  rosterSize: number,
  independent: number,
  required: number,
): AssignmentShortage {
  if (missing === 0) return "none";
  if (rosterSize === 0) return "empty-roster";
  if (independent === 0) return "no-independent-reviewer";
  if (independent < required) return "insufficient-independent-reviewers";
  return "capacity-exhausted";
}

/**
 * Maximize the number of independent review slots filled. The stable case-ID
 * and reviewer-ID order determines ties. Replan with accepted assignments in
 * lockedReviewerIds to preserve them when evidence or availability changes.
 */
export function planAssignments(
  inputCases: readonly AssignmentCase[],
  inputReviewers: readonly AssignmentReviewer[],
): AssignmentPlan {
  if (!Array.isArray(inputCases) || !Array.isArray(inputReviewers)) fail("invalid-input");
  if (inputCases.length > MAX_CASES || inputReviewers.length > MAX_REVIEWERS ||
      inputCases.length * inputReviewers.length > MAX_PAIRS) {
    fail("batch-too-large");
  }
  const roster = readRoster(inputReviewers);
  const cases = readCases(inputCases, roster);
  const source = 0;
  const firstReviewer = cases.length + 1;
  const sink = firstReviewer + roster.length;
  const network = new SlotNetwork(sink + 1);
  const reviewerCaps = roster.map((reviewer, index) =>
    network.connect(firstReviewer + index, sink, reviewer.capacity - reviewer.locked),
  );
  const candidates = cases.map((entry, caseIndex) => {
    const vertex = caseIndex + 1;
    const open = entry.required - entry.locked.size;
    network.connect(source, vertex, open);
    const choices: { id: string; edge: Edge }[] = [];
    let independent = 0;
    for (const [index, reviewer] of roster.entries()) {
      if (entry.excluded.has(reviewer.reviewerId)) continue;
      independent++;
      if (!open || reviewer.locked === reviewer.capacity || entry.locked.has(reviewer.reviewerId)) {
        continue;
      }
      choices.push({
        id: reviewer.reviewerId,
        edge: network.connect(vertex, firstReviewer + index, 1),
      });
    }
    return { choices, independent };
  });

  network.fill(source, sink);
  const assignments = cases.map((entry, index): CaseAllocation => {
    const { choices, independent } = candidates[index]!;
    const lockedReviewerIds = [...entry.locked].sort(compareIds);
    const reviewerIds = [...lockedReviewerIds];
    for (const { id, edge } of choices) {
      if (edge.remaining === 0) reviewerIds.push(id);
    }
    reviewerIds.sort(compareIds);
    const missing = entry.required - reviewerIds.length;
    return {
      caseId: entry.caseId,
      reviewerIds,
      lockedReviewerIds,
      missing,
      shortage: shortageFor(missing, roster.length, independent, entry.required),
    };
  });
  return {
    complete: assignments.every(entry => entry.missing === 0),
    assignments,
    loads: roster.map(({ reviewerId, capacity }, index) => ({
      reviewerId,
      capacity,
      assigned: capacity - reviewerCaps[index]!.remaining,
    })),
  };
}
