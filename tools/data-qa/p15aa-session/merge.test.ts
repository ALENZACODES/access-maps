import { describe, expect, it } from "vitest";
import type { EvidenceCase } from "./evidence.js";
import { mergeSessions } from "./merge.js";
import {
  auditSession, createSession, reviewerDesk, sealSession, submitResponse,
  type SessionFile,
} from "./session.js";

function syntheticCase(key: string): EvidenceCase {
  return {
    id: "c-" + key.repeat(32),
    revision: key.repeat(64),
    source: "osm-ontario",
    licence: "ODbL-1.0",
    retrievedOn: "2026-01-10",
    verificationTier: 0,
    attribution: "© OpenStreetMap contributors",
    state: "unknown",
    reasons: [],
    tranche: "venue",
    field: "wheelchair",
    value: "UNKNOWN",
  };
}

const a = syntheticCase("a");
const b = syntheticCase("b");
const corpus = [a, b];

function configured() {
  const file = createSession(corpus);
  file.cases.forEach(row => { row.conflictsChecked = true; });
  file.reviewers = [
    { reviewerId: "r-001", capacity: 2 },
    { reviewerId: "r-002", capacity: 2 },
  ];
  file.adjudicators = ["r-003"];
  return file;
}

function vote(file: SessionFile, item: EvidenceCase, actor: string, choice: "ready" | "hold") {
  const desk = reviewerDesk(corpus, file, actor);
  const row = desk.cases.find(candidate => candidate.evidence.id === item.id)!;
  return submitResponse(corpus, file, {
    sessionId: desk.sessionId, caseId: item.id, actor, choice, kind: "vote",
    revision: row.revision, previous: row.previous,
  });
}

describe("merging sealed coordinator copies", () => {
  it("reconciles independent offline desks and keeps case attribution and unknown tokens", () => {
    const base = sealSession(corpus, configured());
    const local = vote(base, a, "r-001", "hold");
    let packet = vote(base, b, "r-002", "hold");
    packet = vote(packet, a, "r-002", "ready");
    const merged = mergeSessions(corpus, base, local, packet);
    const audit = auditSession(corpus, merged);
    expect(audit.cases.map(row => [row.evidence.id, row.outcome, row.events.length])).toEqual([
      [a.id, "disputed", 2], [b.id, "awaiting", 1],
    ]);
    expect(audit.cases.map(row => row.evidence)).toEqual(corpus);
    expect(mergeSessions(corpus, base, merged, packet)).toEqual(merged);
    expect(base.cases.map(row => row.events.length)).toEqual([0, 0]);
  });

  it("normalizes file array order before checking the full policy", () => {
    const base = sealSession(corpus, configured());
    const packet = vote(base, a, "r-002", "ready");
    packet.cases.reverse();
    packet.reviewers.reverse();
    packet.cases.forEach(row => row.locked.reverse());
    const merged = mergeSessions(corpus, base, base, packet);
    expect(merged.cases.map(row => row.caseId)).toEqual([a.id, b.id]);
    expect(merged.cases[0]?.events).toHaveLength(1);
    expect(merged.reviewers).toEqual(base.reviewers);
  });

  it("rejects changed capacity even if it leaves every assignment untouched", () => {
    const base = sealSession(corpus, configured());
    const changed = structuredClone(base);
    changed.reviewers[0]!.capacity += 1;
    expect(auditSession(corpus, changed).cases.map(row => row.assigned))
      .toEqual(auditSession(corpus, base).cases.map(row => row.assigned));
    for (const [local, returned] of [[changed, base], [base, changed]]) {
      expect(() => mergeSessions(corpus, base, local, returned)).toThrow("coordinator-policy-mismatch");
    }
  });

  it("requires the exact sealed session identity across otherwise identical files", () => {
    const first = sealSession(corpus, configured());
    const separate = sealSession(corpus, configured());
    expect(first.sessionId).not.toBe(separate.sessionId);
    expect(() => mergeSessions(corpus, first, first, separate)).toThrow("coordinator-policy-mismatch");
  });

  it("rejects a resealed change to the adjudication roster", () => {
    const config = configured();
    const base = sealSession(corpus, config);
    config.adjudicators.push("r-004");
    const different = sealSession(corpus, config);
    expect(() => mergeSessions(corpus, base, base, different)).toThrow("coordinator-policy-mismatch");
  });

  it("refuses a fresh, stale, or incomplete copy even if the other two agree", () => {
    const config = configured();
    const base = sealSession(corpus, config);
    expect(() => mergeSessions(corpus, base, base, config)).toThrow("unsealed-session");
    const truncated = { ...base, cases: base.cases.slice(1) };
    expect(() => mergeSessions(corpus, base, truncated, base)).toThrow("case-set-changed");
    const newer = [{ ...a, revision: "0".repeat(64) }, b];
    expect(() => mergeSessions(newer, base, base, base)).toThrow("stale-evidence");
  });

  it("never returns a partial merge when an edit in the second case conflicts", () => {
    const base = sealSession(corpus, configured());
    const local = vote(base, b, "r-001", "ready");
    const packet = vote(vote(base, a, "r-001", "ready"), b, "r-001", "hold");
    const before = structuredClone(local);
    expect(() => mergeSessions(corpus, base, local, packet)).toThrow("divergent-vote");
    expect(local).toEqual(before);
    expect(auditSession(corpus, local).cases[0]?.events).toEqual([]);
  });

  it("checks the handoff's existing history independently in every case", () => {
    const empty = sealSession(corpus, configured());
    const issued = vote(empty, b, "r-001", "ready");
    const returned = vote(empty, a, "r-002", "ready");
    expect(() => mergeSessions(corpus, issued, issued, returned)).toThrow("history-mismatch");
  });

  it("refuses reviewer-only desk exports as coordinator input", () => {
    const base = sealSession(corpus, configured());
    const blind = reviewerDesk(corpus, base, "r-001");
    expect(() => mergeSessions(corpus, base, base, blind)).toThrow("invalid-session");
  });
});
