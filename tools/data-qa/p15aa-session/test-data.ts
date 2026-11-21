/** Synthetic governance test inputs. No location or person is described. */
import { buildReviewEvidence } from "./evidence.js";
import { createSession, sealSession } from "./session.js";

import registryFixture from "./fixtures/registry.json" with { type: "json" };
import selectionFixture from "./fixtures/selections.json" with { type: "json" };

export function exampleInputs(value = "UNKNOWN") {
  const selections = structuredClone(selectionFixture);
  selections[0]!.record.fields.wheelchair.value = value;
  return { registry: structuredClone(registryFixture), selections };
}

export function sessionExample(value = "UNKNOWN") {
  const inputs = exampleInputs(value);
  const evidence = buildReviewEvidence(inputs.registry, inputs.selections);
  const draft = createSession(evidence);
  draft.reviewers = [
    { reviewerId: "r-001", capacity: 1 },
    { reviewerId: "r-002", capacity: 1 },
  ];
  draft.adjudicators = ["r-003"];
  draft.cases[0]!.conflictsChecked = true;
  return { evidence, file: sealSession(evidence, draft) };
}
