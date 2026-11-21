import { describe, expect, it } from "vitest";
import { buildReviewEvidence } from "./evidence.js";
import { renderAudit, renderDesk } from "./report.js";
import {
  auditSession, createSession, planSession, reviewerDesk, sealSession, submitResponse, type SessionFile,
} from "./session.js";
import { exampleInputs, sessionExample } from "./test-data.js";

type Evidence = ReturnType<typeof buildReviewEvidence>;

function vote(evidence: Evidence, file: SessionFile, actor: string, choice: "ready" | "hold" | null) {
  const row = reviewerDesk(evidence, file, actor).cases[0]!;
  return {
    sessionId: file.sessionId, caseId: row.evidence.id, revision: row.revision,
    previous: row.previous, actor, kind: choice === null ? "withdraw" : "vote", choice,
  };
}

function deliver(evidence: Evidence, file: SessionFile, actor: string, choice: "ready" | "hold" | null) {
  return submitResponse(evidence, file, vote(evidence, file, actor, choice));
}

function ruling(evidence: Evidence, file: SessionFile) {
  const row = auditSession(evidence, file).cases[0]!;
  return {
    sessionId: file.sessionId, caseId: row.evidence.id, revision: row.revision,
    previous: row.historyHead, actor: "r-003", kind: "adjudicate", choice: "hold",
  };
}

describe("creating and sealing independent assignments", () => {
  it("creates an unconfirmed policy per selected source field with a fresh session identity", () => {
    const { evidence } = sessionExample();
    const first = createSession(evidence);
    expect(first.sessionId).not.toBe(createSession(evidence).sessionId);
    expect(first.cases[0]).toMatchObject({
      caseId: evidence[0]!.id, evidenceRevision: evidence[0]!.revision,
      conflictsChecked: false, binding: null, locked: [], events: [],
    });
    expect(() => planSession(evidence, first)).toThrow("conflicts-unchecked");
    expect(() => createSession([])).toThrow("empty-review");
  });

  it("reports the remaining seat and refuses to seal a partial allocation", () => {
    const { evidence } = sessionExample();
    const draft = createSession(evidence);
    draft.reviewers = [
      { reviewerId: "r-001", capacity: 1 }, { reviewerId: "r-002", capacity: 1 },
    ];
    Object.assign(draft.cases[0]!, { conflictsChecked: true, ownerId: "r-001" });
    const plan = planSession(evidence, draft);
    expect(plan.complete).toBe(false);
    expect(plan.assignments[0]).toMatchObject({ missing: 1, reviewerIds: ["r-002"] });
    expect(() => sealSession(evidence, draft)).toThrow("assignment-incomplete");
    expect(() => auditSession(evidence, draft)).toThrow("unsealed-session");
    expect(draft.cases[0]!.locked).toEqual([]);
  });

  it("reserves adjudicator aliases outside the voting roster", () => {
    const { evidence, file } = sessionExample();
    file.adjudicators.push("r-001");
    expect(() => planSession(evidence, file)).toThrow("overlapping-roles");
  });

  it("rejects singleton, fractional and oversized quorum", () => {
    const { evidence, file } = sessionExample();
    for (const quorum of [1, 1.5, 65]) {
      expect(() => planSession(evidence, { ...file, quorum })).toThrow("invalid-independent-quorum");
    }
  });

  it("keeps locks and bindings stable across JSON serialization and reordered aliases", () => {
    const { evidence, file } = sessionExample();
    const saved: SessionFile = JSON.parse(JSON.stringify(file));
    saved.reviewers.reverse();
    saved.cases[0]!.locked.reverse();
    expect(sealSession(evidence, saved)).toEqual(file);
    expect(saved.reviewers[0]!.reviewerId).toBe("r-002");
  });

  it("rejects a stale evidence revision when reopening old ballots", () => {
    const { evidence, file } = sessionExample();
    const voted = deliver(evidence, file, "r-001", "ready");
    const inputs = exampleInputs("no");
    const updated = buildReviewEvidence(inputs.registry, inputs.selections);
    expect(updated[0]!.id).toBe(evidence[0]!.id);
    expect(() => auditSession(updated, voted)).toThrow("stale-evidence");
  });

  it("detects a changed case set even when the incoming case count is identical", () => {
    const { evidence, file } = sessionExample();
    const stale = { ...evidence[0]!, id: "c-" + "0".repeat(32) };
    expect(() => auditSession([stale], file)).toThrow("case-set-changed");
  });

  it("binds the session identity, sealed seats, independent roles and exclusion declarations", () => {
    const { evidence, file } = sessionExample();
    const edits: Array<(copy: SessionFile) => void> = [
      copy => { copy.sessionId = createSession(evidence).sessionId; },
      copy => { copy.cases[0]!.locked.pop(); },
      copy => { copy.adjudicators = ["r-004"]; },
      copy => { copy.cases[0]!.excluded.push("r-008"); },
      copy => { copy.cases[0]!.ownerId = "r-009"; },
    ];
    for (const edit of edits) {
      const changed = structuredClone(file);
      edit(changed);
      expect(() => auditSession(evidence, changed)).toThrow("assignment-binding-changed");
    }
  });

  it("rejects partly stripped histories rather than resealing votes", () => {
    const { evidence, file } = sessionExample();
    const voted = deliver(evidence, file, "r-001", "ready");
    voted.cases[0]!.binding = null;
    expect(() => sealSession(evidence, voted)).toThrow("unsealed-votes");
  });

  it("rejects unknown properties at the file, case and reviewer boundary", () => {
    const { evidence, file } = sessionExample();
    expect(() => auditSession(evidence, { ...file, notes: "" })).toThrow("invalid-session");
    expect(() => auditSession(evidence, { ...file, cases: [{ ...file.cases[0], note: "" }] })).toThrow("invalid-case-policy");
    const reviewers = [{ reviewerId: "r-001", capacity: 1, name: "" }];
    expect(() => auditSession(evidence, { ...file, reviewers })).toThrow("invalid-reviewer");
  });
});

describe("disconnected responses", () => {
  it("keeps two reviewer desks blind before and after the other person casts a ballot", () => {
    const { evidence, file } = sessionExample();
    const before = reviewerDesk(evidence, file, "r-002");
    const voted = deliver(evidence, file, "r-001", "hold");
    expect(reviewerDesk(evidence, voted, "r-002")).toEqual(before);
    expect(renderDesk(before, "fr")).not.toContain("r-001");
    expect(reviewerDesk(evidence, voted, "r-001").cases[0]!.ownChoice).toBe("hold");
  });

  it("admits independent replies in either arrival order and keeps the accepted order in the audit", () => {
    const { evidence, file } = sessionExample();
    const first = vote(evidence, file, "r-001", "ready");
    const second = vote(evidence, file, "r-002", "hold");
    for (const [a, b] of [[first, second], [second, first]] as const) {
      const intermediate = submitResponse(evidence, file, a);
      const complete = submitResponse(evidence, intermediate, b);
      const row = auditSession(evidence, complete).cases[0]!;
      expect(row.outcome).toBe("disputed");
      expect(row.events.map(e => e.actor)).toEqual([a.actor, b.actor]);
      expect(row.events.map(e => e.sequence)).toEqual([1, 2]);
      expect(row.adjudicators).toEqual(["r-003"]);
    }
    expect(file.cases[0]!.events).toEqual([]);
  });

  it("treats re-delivery of the same vote as a no-op after an unrelated vote", () => {
    const { evidence, file } = sessionExample();
    const original = vote(evidence, file, "r-001", "ready");
    const one = submitResponse(evidence, file, original);
    const two = deliver(evidence, one, "r-002", "hold");
    expect(submitResponse(evidence, two, original)).toEqual(two);
    expect(() => submitResponse(evidence, two, { ...original, choice: "hold" })).toThrow("stale-response");
  });

  it("preserves withdrawals and rejects replay of a superseded vote", () => {
    const { evidence, file } = sessionExample();
    const original = vote(evidence, file, "r-001", "ready");
    const one = submitResponse(evidence, file, original);
    const withdraw = vote(evidence, one, "r-001", null);
    const withdrawn = submitResponse(evidence, one, withdraw);
    expect(submitResponse(evidence, withdrawn, withdraw)).toEqual(withdrawn);
    expect(() => submitResponse(evidence, withdrawn, original)).toThrow("stale-response");
    const changed = deliver(evidence, withdrawn, "r-001", "hold");
    const row = auditSession(evidence, changed).cases[0]!;
    expect(row.events.map(e => e.kind)).toEqual(["vote", "withdraw", "vote"]);
    expect(row.ballot.counts).toEqual({ ready: 0, hold: 1 });
  });

  it("refuses a ruling prepared against a previous history even if current votes again disagree", () => {
    const { evidence, file } = sessionExample();
    const one = deliver(evidence, file, "r-001", "ready");
    const two = deliver(evidence, one, "r-002", "hold");
    const oldRuling = ruling(evidence, two);
    const withdrawn = deliver(evidence, two, "r-002", null);
    const rebuilt = deliver(evidence, withdrawn, "r-002", "hold");
    expect(() => submitResponse(evidence, rebuilt, oldRuling)).toThrow("stale-response");
    const currentRuling = ruling(evidence, rebuilt);
    const closed = submitResponse(evidence, rebuilt, currentRuling);
    expect(submitResponse(evidence, closed, currentRuling)).toEqual(closed);
    expect(reviewerDesk(evidence, closed, "r-001").cases[0]!.closed).toBe(true);
    expect(() => deliver(evidence, closed, "r-001", null)).toThrow("decision-closed");
  });

  it("checks both session identity and the exact sealed case before processing a response", () => {
    const { evidence, file } = sessionExample();
    const response = vote(evidence, file, "r-001", "ready");
    const cases = [
      [{ ...response, sessionId: createSession(evidence).sessionId }, "other-session"],
      [{ ...response, caseId: "c-" + "0".repeat(32) }, "other-case"],
      [{ ...response, revision: evidence[0]!.revision }, "stale-assignment"],
      [{ ...response, previous: "invalid" }, "invalid-receipt"],
      [{ ...response, kind: "approve-source" }, "invalid-action"],
      [{ ...response, kind: "withdraw" }, "invalid-choice"],
      [{ ...response, choice: null }, "invalid-choice"],
      [{ ...response, comment: "extra" }, "invalid-response"],
    ] as const;
    for (const [input, code] of cases) expect(() => submitResponse(evidence, file, input)).toThrow(code);
  });

  it("keeps a source hold in effect after a ready consensus and after a ready ruling", () => {
    const { evidence, file } = sessionExample("unexpected-source-token");
    const ready = deliver(evidence, file, "r-001", "ready");
    const approved = deliver(evidence, ready, "r-002", "ready");
    const dispute = deliver(evidence, ready, "r-002", "hold");
    const overruled = submitResponse(evidence, dispute, { ...ruling(evidence, dispute), choice: "ready" });
    for (const current of [approved, overruled]) {
      const row = auditSession(evidence, current).cases[0]!;
      expect(row.ballot.status).toBe("ready");
      expect(row.outcome).toBe("hold");
      expect(row.evidence).toMatchObject({ source: "osm-ontario", value: "UNKNOWN", state: "held", verificationTier: 0 });
      expect(row.evidence.reasons).toContain("unsupported-value");
    }
  });

  it("can complete review of explicit Unknown while preserving the value, origin and tier", () => {
    const { evidence, file } = sessionExample();
    const one = deliver(evidence, file, "r-001", "ready");
    const ready = deliver(evidence, one, "r-002", "ready");
    const row = auditSession(evidence, ready).cases[0]!;
    expect(row.outcome).toBe("ready");
    expect(row.evidence).toEqual(evidence[0]);
    expect(row.evidence.value).toBe("UNKNOWN");
  });

  it("returns an empty desk to a registered reviewer with no work", () => {
    const { evidence, file } = sessionExample();
    file.reviewers.push({ reviewerId: "r-004", capacity: 0 });
    const desk = reviewerDesk(evidence, file, "r-004");
    expect(desk.cases).toEqual([]);
    expect(renderDesk(desk, "fr")).toContain("Aucun dossier");
    expect(() => reviewerDesk(evidence, file, "r-005")).toThrow("unknown-reviewer");
  });

  it("translates unknown licence and preserves the exact OSM notice during a licence hold", () => {
    const inputs = exampleInputs();
    inputs.selections[0]!.record.fields.wheelchair.licence = "unrecognised";
    const held = buildReviewEvidence(inputs.registry, inputs.selections);
    const draft = createSession(held);
    const { file } = sessionExample();
    draft.reviewers = file.reviewers;
    draft.cases[0]!.conflictsChecked = true;
    const audit = auditSession(held, sealSession(held, draft));
    expect(renderAudit(audit, "fr")).toContain("<dt>Licence</dt><dd>Inconnue</dd>");
    expect(renderAudit(audit, "en")).toContain("<dt>Licence</dt><dd>Unknown</dd>");
    for (const lang of ["en", "fr"] as const) {
      expect(renderAudit(audit, lang)).toContain("© OpenStreetMap contributors");
      expect(renderAudit(audit, lang)).not.toContain("unrecognised");
    }
  });
});
