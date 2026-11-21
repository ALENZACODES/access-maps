import { describe, expect, it } from "vitest";
import {
  BallotError,
  evaluateBallots,
  reconcileBallotLogs,
  type BallotContext,
  type BallotErrorCode,
  type BallotEvent,
  type ReviewChoice,
} from "./ballots.js";

const caseId = "c-bfae85b573554c209cecdf75fe75dab1";
const revision = "ef61ed119bce63c34eab17ea52fd76f9936bc1556a389de0cd7436ef458bcf77";
const desk: BallotContext = {
  caseId, revision, quorum: 2,
  assigned: ["r-001", "r-002", "r-003"],
  adjudicators: ["r-004"],
  excluded: ["r-005"],
};

function vote(sequence: number, actor: string, choice: ReviewChoice): BallotEvent {
  return { caseId, revision, sequence, kind: "vote", actor, choice };
}

function withdraw(sequence: number, actor: string): BallotEvent {
  return { caseId, revision, sequence, kind: "withdraw", actor };
}

function ruling(sequence: number, actor: string, choice: ReviewChoice): BallotEvent {
  return { caseId, revision, sequence, kind: "adjudicate", actor, choice };
}

function expectFailure(work: () => unknown, code: BallotErrorCode, sequence: number | null) {
  expect(work).toThrowError(BallotError);
  expect(work).toThrowError(expect.objectContaining({ code, sequence }));
}

const first = vote(1, "r-001", "ready");
const agreeing = [first, vote(2, "r-002", "ready")];
const split = [first, vote(2, "r-002", "hold")];
const settled = [...split, ruling(3, "r-004", "hold")];

describe("replaying a single revision", () => {
  it("counts an empty log as waiting for the full quorum", () => {
    expect(evaluateBallots(desk, [])).toEqual({
      status: "awaiting", counts: { ready: 0, hold: 0 }, votersNeeded: 2, adjudicated: false,
    });
  });

  it("leaves a case with too few available independent reviewers pending", () => {
    const shortDesk = { ...desk, assigned: ["r-001"] };
    expect(evaluateBallots(shortDesk, [first])).toEqual({
      status: "awaiting", counts: { ready: 1, hold: 0 }, votersNeeded: 1, adjudicated: false,
    });
  });

  it.each(["ready", "hold"] as const)("recognizes unanimous %s at quorum", choice => {
    const events = [vote(1, "r-003", choice), vote(2, "r-001", choice)];
    const result = evaluateBallots(desk, events);
    expect(result.status).toBe(choice);
    expect(result.counts[choice]).toBe(2);
    expect(result.votersNeeded).toBe(0);
    expect(result.adjudicated).toBe(false);
  });

  it("opens a dispute if a third assigned reviewer dissents after quorum", () => {
    expect(evaluateBallots(desk, [...agreeing, vote(3, "r-003", "hold")])).toEqual({
      status: "disputed", counts: { ready: 2, hold: 1 }, votersNeeded: 0, adjudicated: false,
    });
  });

  it("reports disagreement before quorum without allowing a ruling", () => {
    const three = { ...desk, quorum: 3 };
    expect(evaluateBallots(three, split)).toEqual({
      status: "disputed", counts: { ready: 1, hold: 1 }, votersNeeded: 1, adjudicated: false,
    });
    expectFailure(() => evaluateBallots(three, settled), "quorum-missing", 3);
  });

  it("withdraws the actor's vote and recomputes both the counts and quorum", () => {
    const events = [...split, withdraw(3, "r-001")];
    expect(evaluateBallots(desk, events)).toEqual({
      status: "awaiting", counts: { ready: 0, hold: 1 }, votersNeeded: 1, adjudicated: false,
    });
    expect(evaluateBallots(desk, [...events, vote(4, "r-001", "hold")])).toEqual({
      status: "hold", counts: { ready: 0, hold: 2 }, votersNeeded: 0, adjudicated: false,
    });
  });

  it.each(["ready", "hold"] as const)("requires withdrawal before recasting %s", choice => {
    expectFailure(() => evaluateBallots(desk, [first, vote(2, "r-001", choice)]), "vote-already-active", 2);
  });

  it("requires a live vote from the actor who withdraws", () => {
    expectFailure(() => evaluateBallots(desk, [first, withdraw(2, "r-003")]), "no-active-vote", 2);
    expectFailure(() => evaluateBallots(desk, [
      first, withdraw(2, "r-001"), withdraw(3, "r-001"),
    ]), "no-active-vote", 3);
  });

  it("keeps the actual votes visible in the adjudication tally", () => {
    expect(evaluateBallots(desk, settled)).toEqual({
      status: "hold", counts: { ready: 1, hold: 1 }, votersNeeded: 0, adjudicated: true,
    });
  });

  it("permits an independent adjudicator to resolve the split in either direction", () => {
    expect(evaluateBallots(desk, [...split, ruling(3, "r-004", "ready")])).toEqual({
      status: "ready", counts: { ready: 1, hold: 1 }, votersNeeded: 0, adjudicated: true,
    });
  });

  it("preserves the accepted ruling even against a subsequent attempted reversal", () => {
    for (const postscript of [
      withdraw(4, "r-002"), vote(4, "r-003", "ready"), ruling(4, "r-004", "ready"),
    ]) {
      expectFailure(() => evaluateBallots(desk, [...settled, postscript]), "decision-closed", 4);
    }
  });

  it("refuses to adjudicate an undisputed or unreviewed case", () => {
    expectFailure(() => evaluateBallots(desk, [...agreeing, ruling(3, "r-004", "hold")]), "no-dispute", 3);
    expectFailure(() => evaluateBallots(desk, [ruling(1, "r-004", "hold")]), "quorum-missing", 1);
  });

  it("keeps the author, unassigned aliases, and the adjudicator out of ordinary votes", () => {
    for (const actor of ["r-004", "r-005", "r-999"]) {
      expectFailure(() => evaluateBallots(desk, [vote(1, actor, "ready")]), "unassigned-voter", 1);
      expectFailure(() => evaluateBallots(desk, [withdraw(1, actor)]), "unassigned-voter", 1);
    }
  });

  it("requires a registered adjudicator independent of the whole voter roster and case", () => {
    const globalRoles = { ...desk, adjudicators: ["r-001", "r-003", "r-004", "r-005"] };
    for (const actor of ["r-001", "r-003", "r-005", "r-999"]) {
      expectFailure(() => evaluateBallots(globalRoles, [...split, ruling(3, actor, "ready")]),
        "ineligible-adjudicator", 3);
    }
  });

  it("checks only pseudonymous aggregate workflow state into the result", () => {
    const result = evaluateBallots(desk, settled);
    expect(JSON.stringify(result)).not.toContain("r-00");
    expect(Object.keys(result).sort()).toEqual(["adjudicated", "counts", "status", "votersNeeded"]);
  });

  it("uses no caller-owned state for storage between replays", () => {
    const events = Object.freeze(split.map(event => Object.freeze({ ...event })));
    const result = evaluateBallots(Object.freeze(desk), events);
    expect(result).toEqual(evaluateBallots(desk, events));
    expect(result.counts).not.toBe(evaluateBallots(desk, events).counts);
    expect(evaluateBallots(desk, []).counts).toEqual({ ready: 0, hold: 0 });
  });
});

describe("invalid or misplaced ballot data", () => {
  it.each(["r001", "R-001", "r-01", "r-0000000", "r-００１", "sample@example.invalid"])(
    "rejects non-roster aliases without echoing submitted text", alias => {
      const work = () => evaluateBallots(desk, [{ ...first, actor: alias }]);
      expectFailure(work, "bad-event", 1);
      expect(work).not.toThrowError(new RegExp(alias));
    },
  );

  it.each([
    { ...first, note: "private free text" },
    { ...first, kind: "route-status" },
    { ...withdraw(1, "r-001"), choice: "ready" },
    { kind: "vote", caseId, revision, actor: "r-001", sequence: 1 },
    ["vote", "ready"],
    null,
  ])("accepts only explicitly shaped JSON events", event => {
    expectFailure(() => evaluateBallots(desk, [event]), "bad-event", 1);
  });

  it("refuses accessibility assertions as governance choices", () => {
    expectFailure(() => evaluateBallots(desk, [{ ...first, choice: "step-free" }]), "bad-choice", 1);
  });

  it("prevents foreign events from being moved into a second case", () => {
    const transferred = { ...split[1], caseId: "c-other" };
    expectFailure(() => evaluateBallots(desk, [first, transferred]), "other-case", 2);
  });

  it("invalidates every result, including a closed ruling, on evidence revision", () => {
    const updated = { ...desk, revision: "a".repeat(64) };
    expectFailure(() => evaluateBallots(updated, settled), "stale-revision", 1);
    expect(evaluateBallots(updated, []).status).toBe("awaiting");
  });

  it("rejects a stale withdrawal without applying the otherwise valid prefix", () => {
    const stale = { ...withdraw(3, "r-002"), revision: "0".repeat(64) };
    expectFailure(() => evaluateBallots(desk, [...agreeing, stale]), "stale-revision", 3);
    expect(evaluateBallots(desk, agreeing).status).toBe("ready");
  });

  it.each([0, -1, 2.5, "2", 3, 1])("requires the next contiguous sequence", submitted => {
    expectFailure(() => evaluateBallots(desk, [
      first, { ...vote(2, "r-003", "ready"), sequence: submitted },
    ]), "out-of-sequence", 2);
  });

  it("rejects duplicate actors in each role list rather than counting them twice", () => {
    for (const role of ["assigned", "adjudicators", "excluded"] as const) {
      const repeated = { ...desk, [role]: ["r-002", "r-002"] };
      expectFailure(() => evaluateBallots(repeated, []), "bad-roster", null);
    }
  });

  it("requires a valid roster even when there have been no votes", () => {
    expectFailure(() => evaluateBallots({ ...desk, assigned: ["unknown"] }, []), "bad-roster", null);
    const oversized = Array.from({ length: 513 }, (_, i) => "r-" + String(i).padStart(3, "0"));
    expectFailure(() => evaluateBallots({ ...desk, adjudicators: oversized }, []), "bad-roster", null);
    expectFailure(() => evaluateBallots({ ...desk, excluded: ["r-001"] }, []),
      "conflicting-assignment", null);
    expectFailure(() => evaluateBallots({ ...desk, adjudicators: null } as unknown as BallotContext, []),
      "bad-roster", null);
  });

  it.each([0, 1, -1, NaN, Infinity, 1.3, 65])("rejects unsupported quorum values", quorum => {
    expectFailure(() => evaluateBallots({ ...desk, quorum }, []), "bad-quorum", null);
  });

  it.each([
    { ...desk, caseId: "../other" },
    { ...desk, caseId: "c".repeat(97) },
    { ...desk, caseId: "c-α" },
    { ...desk, revision: "a".repeat(63) },
    { ...desk, revision: revision.toUpperCase() },
  ])("requires stable opaque case and revision identifiers", context => {
    expectFailure(() => evaluateBallots(context, []), "bad-context", null);
  });

  it("rejects missing, sparse, or oversized logs before producing a decision", () => {
    expectFailure(() => evaluateBallots(desk, undefined), "bad-log", null);
    expectFailure(() => evaluateBallots(desk, {}), "bad-log", null);
    expectFailure(() => evaluateBallots(desk, Array(1)), "bad-event", 1);
    expectFailure(() => evaluateBallots(desk, Array(4097)), "log-too-long", null);
  });
});

describe("reconciling disconnected ballot logs", () => {
  it("appends independent submissions behind the accepted chronology", () => {
    const local = [...agreeing, withdraw(3, "r-001")];
    const incoming = [first, vote(2, "r-003", "hold")];
    const merged = reconcileBallotLogs(desk, [first], local, incoming);
    expect(merged).toEqual([...local, vote(4, "r-003", "hold")]);
    expect(evaluateBallots(desk, merged)).toEqual({
      status: "disputed", counts: { ready: 1, hold: 1 }, votersNeeded: 0, adjudicated: false,
    });
    expect(incoming[1]?.sequence).toBe(2);
  });

  it("permits repeat delivery without duplicating votes or corrections", () => {
    const local = [first];
    const packet = [
      vote(1, "r-002", "hold"),
      withdraw(2, "r-002"),
      vote(3, "r-002", "ready"),
    ];
    const accepted = reconcileBallotLogs(desk, [], local, packet);
    expect(accepted).toEqual([
      first, vote(2, "r-002", "hold"), withdraw(3, "r-002"), vote(4, "r-002", "ready"),
    ]);
    expect(reconcileBallotLogs(desk, [], accepted, packet)).toEqual(accepted);
    expect(reconcileBallotLogs(desk, [], accepted, packet.slice(0, 2))).toEqual(accepted);
    expect(evaluateBallots(desk, accepted).status).toBe("ready");
  });

  it("deduplicates matching edits even when other actors have interleaved actions", () => {
    const local = [vote(1, "r-002", "hold"), vote(2, "r-003", "ready")];
    const packet = [first, vote(2, "r-002", "hold"), withdraw(3, "r-002")];
    const merged = reconcileBallotLogs(desk, [], local, packet);
    expect(merged).toEqual([...local, vote(3, "r-001", "ready"), withdraw(4, "r-002")]);
    expect(evaluateBallots(desk, merged).counts).toEqual({ ready: 2, hold: 0 });
  });

  it("requires an explicit choice between competing changes by the same voter", () => {
    const local = [vote(1, "r-002", "ready")];
    const submitted = [first, vote(2, "r-002", "hold")];
    expectFailure(() => reconcileBallotLogs(desk, [], local, submitted), "divergent-vote", 2);
    expect(evaluateBallots(desk, local).counts).toEqual({ ready: 1, hold: 0 });
  });

  it("detects disagreement deep in an actor's correction history", () => {
    const correction = withdraw(2, "r-001");
    const local = [first, correction, vote(3, "r-001", "hold")];
    const packet = [first, correction, vote(3, "r-001", "ready")];
    expectFailure(() => reconcileBallotLogs(desk, [first], local, packet), "divergent-vote", 3);
  });

  it("checks both histories against the outgoing handoff before importing anything", () => {
    const unrelated = [vote(1, "r-003", "ready")];
    for (const [accepted, submitted] of [
      [agreeing, unrelated], [unrelated, agreeing], [agreeing, []], [[], agreeing],
    ] as const) {
      expectFailure(() => reconcileBallotLogs(desk, [first], accepted, submitted), "history-mismatch", null);
    }
    expectFailure(() => reconcileBallotLogs(desk, agreeing, [first], [first]), "history-mismatch", null);
  });

  it("returns independent copies on fast-forward and no-op paths", () => {
    for (const [local, packet] of [[split, settled], [settled, split], [settled, settled]] as const) {
      const merged = reconcileBallotLogs(desk, split, Object.freeze(local), Object.freeze(packet));
      expect(merged).toEqual(settled);
      expect(merged).not.toBe(settled);
      expect(merged[0]).not.toBe(first);
    }
  });

  it("requires new adjudication when two valid local histories change concurrently", () => {
    const unseen = [...split, vote(3, "r-003", "ready")];
    expectFailure(() => reconcileBallotLogs(desk, split, settled, unseen), "concurrent-ruling", 3);
    expectFailure(() => reconcileBallotLogs(desk, split, unseen, settled), "concurrent-ruling", 3);
    const alternative = [...split, ruling(3, "r-004", "ready")];
    expectFailure(() => reconcileBallotLogs(desk, split, settled, alternative), "concurrent-ruling", 3);
  });

  it("absorbs an already-incorporated packet when the adjudicator has since ruled", () => {
    const independent = [vote(1, "r-002", "hold")];
    expect(reconcileBallotLogs(desk, [], settled, independent)).toEqual(settled);
  });

  it("refuses stale, cross-case and unauthorized input even on an apparent no-op", () => {
    const stale = [{ ...first, revision: "c".repeat(64) }];
    const foreign = [{ ...first, caseId: "c-other" }];
    expectFailure(() => reconcileBallotLogs(desk, stale, stale, stale), "stale-revision", 1);
    expectFailure(() => reconcileBallotLogs(desk, [], foreign, foreign), "other-case", 1);
    expectFailure(() => reconcileBallotLogs(desk, [], [], [vote(1, "r-999", "ready")]), "unassigned-voter", 1);
  });

  it("retains the local chronology while independent packet order leaves the result unchanged", () => {
    const a = [vote(1, "r-001", "ready"), withdraw(2, "r-001"), vote(3, "r-001", "hold")];
    const b = [vote(1, "r-002", "ready")];
    const c = [vote(1, "r-003", "hold"), withdraw(2, "r-003")];
    const orders = [[a, b, c], [b, c, a], [c, a, b], [a, c, b], [b, a, c], [c, b, a]];
    for (const packets of orders) {
      const merged = packets.reduce<BallotEvent[]>((log, packet) =>
        reconcileBallotLogs(desk, [], log, packet), []);
      expect(merged.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(evaluateBallots(desk, merged)).toEqual({
        status: "disputed", counts: { ready: 1, hold: 1 }, votersNeeded: 0, adjudicated: false,
      });
      for (const packet of packets) {
        expect(reconcileBallotLogs(desk, [], merged, packet)).toEqual(merged);
      }
    }
  });

  it("checks the event budget after a merge as well as on each submitted log", () => {
    function longLog(actor: string) {
      return Array.from({ length: 2049 }, (_, offset) => offset % 2 === 0
        ? vote(offset + 1, actor, "ready") : withdraw(offset + 1, actor));
    }
    expectFailure(() => reconcileBallotLogs(desk, [], longLog("r-001"), longLog("r-002")),
      "log-too-long", null);
  });
});
