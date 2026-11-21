import { isDeepStrictEqual } from "node:util";
import { reconcileBallotLogs } from "./ballots.js";
import type { EvidenceCase } from "./evidence.js";
import { openSealedSession, SessionError, type SessionFile } from "./session.js";

/** All policy has already been validated and canonically ordered by the reader. */
function policyOf(file: SessionFile) {
  return { ...file, cases: file.cases.map(policy => ({ ...policy, events: [] })) };
}

/**
 * Reconcile two coordinator copies of one sealed session. Reviewer desk files
 * contain only the recipient's work and cannot be merged as coordinator copies.
 * Every case must reconcile before the caller receives a new complete session.
 */
export function mergeSessions(
  evidence: readonly EvidenceCase[],
  baseInput: unknown,
  currentInput: unknown,
  returnedInput: unknown,
): SessionFile {
  const base = openSealedSession(evidence, baseInput);
  const current = openSealedSession(evidence, currentInput);
  const returned = openSealedSession(evidence, returnedInput);
  const issuedPolicy = policyOf(base.file);
  if (!isDeepStrictEqual(issuedPolicy, policyOf(current.file)) ||
      !isDeepStrictEqual(issuedPolicy, policyOf(returned.file))) {
    throw new SessionError("coordinator-policy-mismatch");
  }

  const cases = current.rows.map(({ policy, context, events }, index) => {
    // Policy equality includes the exact sorted case list and its assignment bindings.
    const history = reconcileBallotLogs(context, base.rows[index]!.events, events, returned.rows[index]!.events);
    return { ...policy, events: history };
  });
  return { ...current.file, cases };
}
