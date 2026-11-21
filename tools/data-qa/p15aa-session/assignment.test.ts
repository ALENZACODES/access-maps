import { describe, expect, it } from "vitest";
import {
  AssignmentInputError,
  planAssignments,
  type AssignmentCase,
  type AssignmentInputIssue,
  type AssignmentPlan,
  type AssignmentReviewer,
} from "./assignment.js";

const R1 = "r-001";
const R2 = "r-002";
const R3 = "r-003";
const R4 = "r-004";

function reviewer(reviewerId: string, capacity = 1): AssignmentReviewer {
  return { reviewerId, capacity };
}

function work(caseId: string, extra: Partial<AssignmentCase> = {}): AssignmentCase {
  return { caseId, required: 1, ...extra };
}

function errorCode(
  cases: readonly AssignmentCase[],
  roster: readonly AssignmentReviewer[],
): AssignmentInputIssue {
  try {
    planAssignments(cases, roster);
  } catch (error) {
    if (error instanceof AssignmentInputError) {
      expect(error.message).toBe(error.code);
      return error.code;
    }
    throw error;
  }
  throw new Error("Expected the invalid assignment batch to be rejected");
}

describe("independent session assignments", () => {
  it("moves a tentative assignment to keep the only independent reviewer available", () => {
    const result = planAssignments(
      [work("case-a"), work("case-b", { ownerId: R2 })],
      [reviewer(R1), reviewer(R2)],
    );
    expect(result.complete).toBe(true);
    expect(result.assignments.map(row => row.reviewerIds)).toEqual([[R2], [R1]]);
    expect(result.loads.map(row => row.assigned)).toEqual([1, 1]);
  });

  it("finds an alternating path across several earlier decisions", () => {
    const cases = [
      work("a", { excludedReviewerIds: [R3, R4] }),
      work("b", { excludedReviewerIds: [R1, R4] }),
      work("c", { excludedReviewerIds: [R1, R2] }),
      work("d", { excludedReviewerIds: [R2, R3, R4] }),
    ];
    const result = planAssignments(cases, [R1, R2, R3, R4].map(id => reviewer(id)));
    expect(result.complete).toBe(true);
    expect(result.assignments.map(row => row.reviewerIds)).toEqual([[R2], [R3], [R4], [R1]]);
  });

  it("holds distinct seats in a case even if one independent reviewer has spare capacity", () => {
    const result = planAssignments(
      [work("a", { required: 3, ownerId: R1 })],
      [reviewer(R1, 9), reviewer(R2, 9)],
    );
    expect(result.assignments).toEqual([{
      caseId: "a",
      reviewerIds: [R2],
      lockedReviewerIds: [],
      missing: 2,
      shortage: "insufficient-independent-reviewers",
    }]);
    expect(result.complete).toBe(false);
    expect(result.loads).toEqual([
      { reviewerId: R1, capacity: 9, assigned: 0 },
      { reviewerId: R2, capacity: 9, assigned: 1 },
    ]);
  });

  it("combines the submitter and the declared conflicts before any allocation", () => {
    const result = planAssignments(
      [
        work("a", { ownerId: R1, excludedReviewerIds: [R1, R2] }),
        work("b", { ownerId: R3, excludedReviewerIds: [R2] }),
      ],
      [reviewer(R1), reviewer(R2), reviewer(R3)],
    );
    expect(result.complete).toBe(true);
    expect(result.assignments.map(row => row.reviewerIds)).toEqual([[R3], [R1]]);
  });

  it("retains conflicts for inactive reviewers when reusing a saved case list", () => {
    const cases = [work("a", { ownerId: R3, excludedReviewerIds: [R4] })];
    expect(planAssignments(cases, [reviewer(R1)]).assignments[0]?.reviewerIds).toEqual([R1]);
    const changed = planAssignments(cases, [reviewer(R3), reviewer(R4)]);
    expect(changed.assignments[0]?.shortage).toBe("no-independent-reviewer");
  });

  it("returns the canonical plan for shuffled inputs and does not reorder caller arrays", () => {
    const cases = Object.freeze([
      Object.freeze(work("b", { required: 2, lockedReviewerIds: Object.freeze([R3]) })),
      Object.freeze(work("a", { excludedReviewerIds: Object.freeze([R3, R4]) })),
    ]);
    const roster = Object.freeze([R4, R2, R3, R1].map(id => Object.freeze(reviewer(id))));
    const stable = planAssignments(cases, roster);
    expect(stable.assignments.map(row => row.caseId)).toEqual(["a", "b"]);
    expect(stable.loads.map(row => row.reviewerId)).toEqual([R1, R2, R3, R4]);
    expect(planAssignments([...cases].reverse(), [...roster].reverse())).toEqual(stable);
    expect(cases.map(entry => entry.caseId)).toEqual(["b", "a"]);
    expect(roster.map(entry => entry.reviewerId)).toEqual([R4, R2, R3, R1]);
  });

  it("keeps results detached from input lists and the next planning pass", () => {
    const locked = [R3];
    const cases = [work("a", { required: 2, lockedReviewerIds: locked })];
    const roster = [reviewer(R1), reviewer(R2), reviewer(R3)];
    const earlier = planAssignments(cases, roster);
    earlier.assignments[0]!.reviewerIds.pop();
    earlier.assignments[0]!.lockedReviewerIds.push(R2);
    earlier.loads[0]!.assigned = 90;
    expect(locked).toEqual([R3]);
    const next = planAssignments(cases, roster);
    expect(next.assignments[0]?.reviewerIds).toEqual([R1, R3]);
    expect(next.assignments[0]?.lockedReviewerIds).toEqual([R3]);
    expect(next.loads[0]?.assigned).toBe(1);
  });
});

describe("locked decisions and changes in availability", () => {
  it("charges every existing lock before proposing additional reviewers", () => {
    const result = planAssignments(
      [work("a"), work("b", { lockedReviewerIds: [R1, R2], required: 2 })],
      [reviewer(R1, 1), reviewer(R2, 2)],
    );
    expect(result.assignments.map(row => row.reviewerIds)).toEqual([[R2], [R1, R2]]);
    expect(result.assignments[1]?.lockedReviewerIds).toEqual([R1, R2]);
    expect(result.loads.map(row => row.assigned)).toEqual([1, 2]);
  });

  it("respects a lock even when moving it could have filled another case", () => {
    const result = planAssignments(
      [work("a", { lockedReviewerIds: [R1] }), work("b", { excludedReviewerIds: [R2] })],
      [reviewer(R1), reviewer(R2)],
    );
    expect(result.complete).toBe(false);
    expect(result.assignments[1]).toMatchObject({
      reviewerIds: [],
      shortage: "capacity-exhausted",
      missing: 1,
    });
    expect(result.loads.find(row => row.reviewerId === R2)?.assigned).toBe(0);
  });

  it("replans around seats accepted before a conflict was recorded elsewhere", () => {
    const roster = [reviewer(R1), reviewer(R2), reviewer(R3)];
    const first = planAssignments([work("a"), work("b")], roster);
    const accepted = first.assignments[0]!.reviewerIds;
    const next = planAssignments([
      work("a", { lockedReviewerIds: accepted }),
      work("b", { ownerId: first.assignments[1]!.reviewerIds[0] }),
    ], roster);
    expect(next.complete).toBe(true);
    expect(next.assignments[0]?.lockedReviewerIds).toEqual(accepted);
    expect(next.assignments[1]?.reviewerIds).toEqual([R3]);
  });

  it("flags new conflicts against accepted work instead of silently dropping the lock", () => {
    expect(errorCode(
      [work("a", { lockedReviewerIds: [R1], ownerId: R1 })],
      [reviewer(R1)],
    )).toBe("conflicted-lock");
    expect(errorCode(
      [work("a", { lockedReviewerIds: [R1], excludedReviewerIds: [R1] })],
      [reviewer(R1)],
    )).toBe("conflicted-lock");
  });

  it("flags unavailable locked reviewers and impossible quota changes", () => {
    expect(errorCode([work("a", { lockedReviewerIds: [R1] })], [])).toBe("unknown-lock");
    expect(errorCode(
      [work("a", { lockedReviewerIds: [R1, R2] })],
      [reviewer(R1), reviewer(R2)],
    )).toBe("too-many-locks");
    expect(errorCode(
      [work("a", { lockedReviewerIds: [R2] }), work("b", { lockedReviewerIds: [R2] })],
      [reviewer(R2, 1)],
    )).toBe("over-capacity-locks");
  });

  it("round-trips a partially filled plan through locked assignments", () => {
    const cases = [work("a", { required: 2 }), work("b", { required: 3 })];
    const roster = [reviewer(R1, 2), reviewer(R2, 1), reviewer(R3, 0)];
    const first = planAssignments(cases, roster);
    const casesWithLocks = cases.map((entry, index) => ({
      ...entry,
      lockedReviewerIds: first.assignments[index]!.reviewerIds,
    }));
    const replay = planAssignments(casesWithLocks, roster);
    expect(replay.loads).toEqual(first.loads);
    expect(replay.assignments.map(row => row.reviewerIds))
      .toEqual(first.assignments.map(row => row.reviewerIds));
    expect(replay.assignments.every(row => row.lockedReviewerIds.length === row.reviewerIds.length))
      .toBe(true);
    expect(replay.complete).toBe(false);
  });
});

describe("actionable assignment shortages", () => {
  it("returns zero usage when there is nothing to review", () => {
    expect(planAssignments([], [])).toEqual({ complete: true, assignments: [], loads: [] });
    expect(planAssignments([], [reviewer(R1, 3)]).loads).toEqual([
      { reviewerId: R1, assigned: 0, capacity: 3 },
    ]);
  });

  it("distinguishes empty rosters, exclusions, independence counts, and capacity", () => {
    const check = (entry: AssignmentCase, roster: AssignmentReviewer[]) =>
      planAssignments([entry], roster).assignments[0]?.shortage;
    expect(check(work("a"), [])).toBe("empty-roster");
    expect(check(work("a", { ownerId: R1 }), [reviewer(R1)])).toBe("no-independent-reviewer");
    expect(check(work("a", { required: 2 }), [reviewer(R1)])).toBe("insufficient-independent-reviewers");
    expect(check(work("a"), [reviewer(R1, 0)])).toBe("capacity-exhausted");
    expect(check(work("a"), [reviewer(R1)])).toBe("none");
  });

  it("reports unfilled slots even for the largest representable input quota", () => {
    const result = planAssignments(
      [work("a", { required: Number.MAX_SAFE_INTEGER })],
      [reviewer(R1, Number.MAX_SAFE_INTEGER), reviewer(R2)],
    );
    expect(result.assignments[0]?.missing).toBe(Number.MAX_SAFE_INTEGER - 2);
    expect(result.loads.map(row => row.assigned)).toEqual([1, 1]);
  });
});

describe("assignment input boundary", () => {
  it("rejects duplicate entities and references before they can affect tallies", () => {
    expect(errorCode([work("a"), work("a")], [])).toBe("duplicate-case");
    expect(errorCode([], [reviewer(R1), reviewer(R1)])).toBe("duplicate-reviewer");
    expect(errorCode(
      [work("a", { lockedReviewerIds: [R1, R1] })], [reviewer(R1)],
    )).toBe("duplicate-reviewer-reference");
    expect(errorCode(
      [work("a", { excludedReviewerIds: [R1, R1] })], [],
    )).toBe("duplicate-reviewer-reference");
  });

  it("rejects invalid integer quotas including lossy or nonfinite numbers", () => {
    for (const invalid of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(errorCode([], [reviewer(R1, invalid)])).toBe("invalid-capacity");
      expect(errorCode([work("a", { required: invalid })], [])).toBe("invalid-required");
    }
    expect(errorCode([work("a", { required: 0 })], [])).toBe("invalid-required");
  });

  it("rejects malformed identifiers and never echoes the invalid field", () => {
    expect(errorCode([], [reviewer("r-1")])).toBe("invalid-reviewer-id");
    expect(errorCode([work("a", { ownerId: "name withheld" })], [])).toBe("invalid-reviewer-id");
    expect(errorCode([work("case/../a")], [])).toBe("invalid-case-id");
    expect(errorCode([work("a".repeat(97))], [])).toBe("invalid-case-id");
    expect(errorCode([work("a", { excludedReviewerIds: ["a@b.invalid"] })], []))
      .toBe("invalid-reviewer-id");
    expect(errorCode([work("a", { lockedReviewerIds: ["r-001\n"] })], []))
      .toBe("invalid-reviewer-id");
  });

  it("checks untyped JSON at the public boundary", () => {
    expect(errorCode(null as unknown as AssignmentCase[], [])).toBe("invalid-input");
    expect(errorCode([], {} as AssignmentReviewer[])).toBe("invalid-input");
    expect(errorCode([null as unknown as AssignmentCase], [])).toBe("invalid-input");
    expect(errorCode([], [null as unknown as AssignmentReviewer])).toBe("invalid-input");
    expect(errorCode([work("a", { lockedReviewerIds: R1 as unknown as string[] })], []))
      .toBe("invalid-reviewer-list");
    expect(errorCode([work("a", { excludedReviewerIds: null as unknown as string[] })], []))
      .toBe("invalid-reviewer-list");
  });

  it("bounds the case × reviewer product before allocating the network", () => {
    const cases = Array.from({ length: 2_000 }, (_, index) => work(`case-${index}`));
    const roster = Array.from({ length: 251 }, (_, index) =>
      reviewer(`r-${String(index).padStart(3, "0")}`),
    );
    expect(errorCode(cases, roster)).toBe("batch-too-large");
    expect(errorCode(Array<AssignmentCase>(10_001), [])).toBe("batch-too-large");
    expect(errorCode([], Array<AssignmentReviewer>(513))).toBe("batch-too-large");
  });
});

/**
 * Enumerate independent subsets one case at a time. This small oracle shares
 * no matching or residual-graph logic with the production implementation.
 */
function optimum(cases: AssignmentCase[], roster: AssignmentReviewer[]): number {
  const remaining = roster.map(slot => slot.capacity);
  function choose(caseIndex: number): number {
    if (caseIndex === cases.length) return 0;
    const entry = cases[caseIndex]!;
    const excluded = new Set(entry.excludedReviewerIds);
    const locked = new Set(entry.lockedReviewerIds);
    let best = -Infinity;
    for (let mask = 0; mask < 2 ** roster.length; mask++) {
      const positions = roster.map((_, index) => index).filter(index => (mask & (1 << index)) !== 0);
      const selected = new Set(positions.map(index => roster[index]!.reviewerId));
      if (selected.size > entry.required || [...locked].some(id => !selected.has(id))) continue;
      if (positions.some(index => remaining[index] === 0)) continue;
      if ([...selected].some(id => id === entry.ownerId || excluded.has(id))) continue;
      for (const index of positions) remaining[index] = remaining[index]! - 1;
      best = Math.max(best, positions.length + choose(caseIndex + 1));
      for (const index of positions) remaining[index] = remaining[index]! + 1;
    }
    return best;
  }
  return choose(0);
}

function checkAllocation(plan: AssignmentPlan, cases: AssignmentCase[], roster: AssignmentReviewer[]): void {
  const counted = new Map(roster.map(entry => [entry.reviewerId, 0]));
  for (const { caseId, reviewerIds, missing } of plan.assignments) {
    const entry = cases.find(row => row.caseId === caseId)!;
    expect(missing).toBe(entry.required - reviewerIds.length);
    expect(missing).toBeGreaterThanOrEqual(0);
    expect(new Set(reviewerIds).size).toBe(reviewerIds.length);
    for (const id of entry.lockedReviewerIds ?? []) expect(reviewerIds).toContain(id);
    for (const id of reviewerIds) {
      expect(counted.has(id)).toBe(true);
      expect(id).not.toBe(entry.ownerId);
      expect(entry.excludedReviewerIds ?? []).not.toContain(id);
      counted.set(id, counted.get(id)! + 1);
    }
  }
  for (const { reviewerId, assigned, capacity } of plan.loads) {
    expect(assigned).toBe(counted.get(reviewerId));
    expect(assigned).toBeLessThanOrEqual(capacity);
  }
  expect(plan.complete).toBe(plan.assignments.every(row => row.missing === 0));
}

describe("maximum attainable coverage", () => {
  it("matches exhaustive search for every two-case, three-reviewer conflict graph", () => {
    const ids = [R1, R2, R3];
    for (let graph = 0; graph < 64; graph++) {
      const excluded = (offset: number) => ids.filter((_, i) => graph & (1 << (offset + i)));
      const cases = [
        work("a", { required: 2, excludedReviewerIds: excluded(0) }),
        work("b", { required: 2, excludedReviewerIds: excluded(3) }),
      ];
      for (const roster of [
        ids.map(id => reviewer(id)),
        [reviewer(R1, 0), reviewer(R2, 1), reviewer(R3, 2)],
      ]) {
        const actual = planAssignments(cases, roster);
        const assigned = actual.loads.reduce((sum, entry) => sum + entry.assigned, 0);
        expect(assigned, `conflict matrix ${graph}`).toBe(optimum(cases, roster));
        checkAllocation(actual, cases, roster);
      }
    }
  });

  it("matches exhaustive search for mixed quotas when an accepted seat is immovable", () => {
    for (const requiredA of [1, 2, 3]) {
      for (const requiredB of [1, 2, 3]) {
        for (const owner of [R1, R2, R3]) {
          const cases = [
            work("a", { required: requiredA, lockedReviewerIds: [R2] }),
            work("b", { required: requiredB, ownerId: owner }),
            work("c", { required: 2, excludedReviewerIds: [R1], lockedReviewerIds: [R3] }),
          ];
          const roster = [reviewer(R1), reviewer(R2, 2), reviewer(R3, 2)];
          const actual = planAssignments(cases, roster);
          const assigned = actual.loads.reduce((sum, entry) => sum + entry.assigned, 0);
          expect(assigned).toBe(optimum(cases, roster));
          checkAllocation(actual, cases, roster);
        }
      }
    }
  });
});
