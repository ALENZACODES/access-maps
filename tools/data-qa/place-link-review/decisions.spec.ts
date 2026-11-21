import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  DECISION_SCHEMA, DecisionError, readDecisions, reconcileDecisions,
  type Decision, type DecisionCase, type DecisionEntry, type DecisionFile, type ReviewStatus,
} from "./decisions.ts";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function aCase(name: string, version = 1, restricted = false): DecisionCase {
  return { id: digest("case/" + name), fingerprint: digest(`evidence/${name}/${version}`), restricted };
}

function entry(item: DecisionCase, decision: Decision = "reviewed"): DecisionEntry {
  return { id: item.id, fingerprint: item.fingerprint, decision };
}

function handoff(...entries: DecisionEntry[]): DecisionFile {
  return readDecisions({ schema: DECISION_SCHEMA, entries });
}

function status(item: DecisionCase, ...files: DecisionFile[]): ReviewStatus | undefined {
  return reconcileDecisions([item], files).status.get(item.id);
}

function fails(action: () => unknown, code: string, field: string) {
  assert.throws(action, (problem: unknown) => {
    assert.ok(problem instanceof DecisionError);
    assert.equal(problem.code, code);
    assert.equal(problem.field, field);
    assert.equal(problem.message, `${code} (${field})`);
    return true;
  });
}

test("a handoff contains only opaque references and the chosen review disposition", () => {
  const alpha = aCase("synthetic alpha");
  const beta = aCase("synthetic beta");
  const file = handoff(entry(beta, "follow-up"), entry(alpha));
  assert.equal(file.schema, "place-link-decisions/v1");
  assert.deepEqual(file.entries.map(row => row.decision), ["follow-up", "reviewed"]);
  const json = JSON.stringify(file);
  assert.ok(!json.includes("synthetic"));
  assert.deepEqual(readDecisions(JSON.parse(json)), file);
  assert.deepEqual(handoff(), { schema: DECISION_SCHEMA, entries: [] });
});

test("validated decisions are snapshots detached from mutable input", () => {
  const raw = { schema: DECISION_SCHEMA, entries: [{ ...entry(aCase("a")) }] };
  const file = readDecisions(raw);
  raw.entries[0]!.decision = "follow-up";
  raw.entries.length = 0;
  assert.equal(file.entries.length, 1);
  assert.equal(file.entries[0]?.decision, "reviewed");
  assert.ok(Object.isFrozen(file.entries));
  assert.ok(Object.isFrozen(file.entries[0]));
  assert.ok(Object.isFrozen(file));
});

test("unexpected structure and future schemas fail explicitly", () => {
  for (const invalid of [null, true, [], "invalid", 1]) fails(() => readDecisions(invalid), "shape", "file");
  for (const schema of [undefined, null, 1, "place-link-decisions/v2", "PLACE-LINK-DECISIONS/V1"]) {
    fails(() => readDecisions({ schema, entries: [] }), "schema", "schema");
  }
  for (const invalid of [null, undefined, {}, "[]"]) {
    fails(() => readDecisions({ schema: DECISION_SCHEMA, entries: invalid }), "entries", "entries");
  }
  fails(() => readDecisions({ schema: DECISION_SCHEMA, entries: [null] }), "shape", "entries[0]");
});

test("rejects undeclared fields without reflecting their names or contents", () => {
  const complete = entry(aCase("a"));
  fails(() => readDecisions({ schema: DECISION_SCHEMA, entries: [], "private fixture": "private fixture" }),
    "unknown-field", "file");
  fails(() => readDecisions({ schema: DECISION_SCHEMA, entries: [{ ...complete, freeText: "private fixture" }] }),
    "unknown-field", "entries[0]");
  const parsed = JSON.parse('{"schema":"place-link-decisions/v1","entries":[],"__proto__":{}}');
  fails(() => readDecisions(parsed), "unknown-field", "file");
  fails(() => readDecisions(Object.create({ schema: DECISION_SCHEMA, entries: [] })), "schema", "schema");
});

test("handwritten, truncated and noncanonical case references cannot match", () => {
  const complete = entry(aCase("a"));
  for (const bad of [null, 0, "", "0".repeat(63), "0".repeat(65), "a".repeat(64) + "\n",
    "A".repeat(64), "z".repeat(64), "０".repeat(64), " fixture "]) {
    for (const key of ["id", "fingerprint"]) {
      fails(() => readDecisions({ schema: DECISION_SCHEMA, entries: [{ ...complete, [key]: bad }] }),
        key === "id" ? "identifier" : "fingerprint", "entries[0]." + key);
    }
  }
});

test("recognizes only explicit reviewer actions", () => {
  for (const decision of ["open", "stale", "conflict", "restricted", "approve", null, 0]) {
    fails(() => readDecisions({ schema: DECISION_SCHEMA, entries: [{ ...entry(aCase("a")), decision }] }),
      "decision", "entries[0].decision");
  }
});

test("one file cannot carry multiple decisions for a case across versions or choices", () => {
  const current = aCase("a", 2);
  for (const duplicate of [entry(current), entry(current, "follow-up"), entry(aCase("a", 1))]) {
    fails(() => handoff(entry(current), duplicate), "duplicate-id", "entries[1].id");
  }
});

test("current decisions win over stale entries independent of input file order", () => {
  const old = aCase("a", 1);
  const current = aCase("a", 2);
  for (const decision of ["reviewed", "follow-up"] as const) {
    const a = handoff(entry(current, decision));
    const b = handoff(entry(old, decision === "follow-up" ? "reviewed" : "follow-up"));
    assert.equal(status(current, a, b), decision);
    assert.equal(status(current, b, a), decision);
    assert.equal(status(current, b, b, a, b), decision);
  }
});

test("conflicting decisions on the same current evidence stay conflicted", () => {
  const current = aCase("a", 2);
  const old = handoff(entry(aCase("a", 1), "follow-up"));
  const a = handoff(entry(current));
  const b = handoff(entry(current, "follow-up"));
  assert.equal(status(current, a, b, a), "conflict");
  assert.equal(status(current, old, b, a, old), "conflict");
  assert.equal(status(current, b, a, b), "conflict");
});

test("a stale decision opens a new review and never becomes a vote on a different version", () => {
  const v1 = aCase("a", 1);
  const v2 = aCase("a", 2);
  const v3 = aCase("a", 3);
  assert.equal(status(v3, handoff(entry(v1)), handoff(entry(v2, "follow-up"))), "stale");
  assert.equal(status(v3, handoff(entry(v1)), handoff(entry(v1, "follow-up"))), "stale");
  assert.equal(status(v3, handoff()), "open");
  assert.equal(status(v3), "open");
});

test("a disclosure restriction overrides absent, current, stale and conflicting decisions", () => {
  const blocked = aCase("a", 2, true);
  const a = handoff(entry(blocked));
  const b = handoff(entry(blocked, "follow-up"));
  const prior = handoff(entry(aCase("a", 1)));
  for (const files of [[], [a], [prior], [b, prior], [a, b, prior]]) {
    assert.equal(status(blocked, ...files), "restricted");
  }
});

test("orphan count uses distinct IDs and cannot create a case from a decision file", () => {
  const a = aCase("a");
  const b = aCase("b");
  const absent = aCase("absent");
  const removed = aCase("removed");
  const files = [
    handoff(entry(a), entry(absent), entry(removed)),
    handoff(entry(aCase("absent", 2), "follow-up"), entry(removed, "follow-up")),
  ];
  const result = reconcileDecisions([a, b], files);
  assert.equal(result.orphanCount, 2);
  assert.equal(result.status.size, 2);
  assert.equal(result.status.get(a.id), "reviewed");
  assert.equal(result.status.get(b.id), "open");
  assert.ok(!result.status.has(absent.id));
  assert.equal(reconcileDecisions([], files).orphanCount, 3);
});

test("invalid or duplicate current cases cannot overwrite one another", () => {
  const a = aCase("a");
  for (const other of [a, { ...a, restricted: true }, aCase("a", 2)]) {
    fails(() => reconcileDecisions([a, other], []), "duplicate-id", "cases[1].id");
  }
  fails(() => reconcileDecisions([{ ...a, id: "" }], []), "identifier", "cases[0].id");
  fails(() => reconcileDecisions([{ ...a, fingerprint: "invalid" }], []), "fingerprint", "cases[0].fingerprint");
  fails(() => reconcileDecisions([{ ...a, restricted: null } as unknown as DecisionCase], []),
    "restricted", "cases[0].restricted");
});

test("a malformed file fails the reconciliation atomically even when passed without readDecisions", () => {
  const a = aCase("a");
  const b = aCase("b");
  const invalid = { schema: DECISION_SCHEMA, entries: [entry(a), { ...entry(b), decision: "invalid" }] };
  fails(() => reconcileDecisions([a, b], [handoff(entry(a)), invalid as unknown as DecisionFile]),
    "decision", "entries[1].decision");
});

test("multiple independent cases retain their own disposition in stable key order", () => {
  const a = aCase("a");
  const b = aCase("b");
  const c = aCase("c", 2);
  const files = [handoff(entry(a), entry(c)), handoff(entry(b, "follow-up"), entry(a, "follow-up"))];
  function* cases() { yield c; yield a; yield b; }
  const resolved = reconcileDecisions(cases(), files).status;
  assert.deepEqual([...resolved.keys()], [a.id, b.id, c.id].sort());
  assert.equal(resolved.get(a.id), "conflict");
  assert.equal(resolved.get(b.id), "follow-up");
  assert.equal(resolved.get(c.id), "reviewed");
  assert.deepEqual([...reconcileDecisions([a, b, c], files.reverse()).status], [...resolved]);
});
