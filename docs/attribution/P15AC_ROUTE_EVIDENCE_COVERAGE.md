# P15AC — Route evidence coverage and gap review

## Scope

This is a deterministic, offline-only audit for Ontario accessibility routes. It uses the
merged P15V snapshot validator and route planner. No parallel routing graph is built.
Its purpose is to explain what each route segment's dated, attributed evidence supports,
what remains UNKNOWN, which barriers are reported, and what a person can review before
relying on a route. It is not an eligibility assessment or medical recommendation.

The exported review does not assert that a route is suitable for any individual. In
particular, a path with missing or contradictory observations does not become YES.
Operator information and accessibility observations are used only when supplied by
the caller, with source licence and date attached. No requests are sent to a network.

## Files

- `p15ac-policy.mjs` — review input contract, bounded limits, open-licence allowlist,
  French typography check and safe source-date handling
- `p15ac-coverage.mjs` — source, observation, record, node, edge and route evidence
  review; stable issue codes; manual gap queue
- `p15ac-comparison.mjs` — integration with P15V routing; comparison of route
  alternatives and snapshot changes; route summary and checklist
- `p15ac-report.mjs` — EN/FR report text, bounded canonical JSON, CSV export,
  source-level audit trail and SHA-256 of serialized report bytes
- `p15ac-*.test.mjs` — self-contained Node tests based on existing fictional P15V
  fixtures; test registration is covered by the root `docs/attribution/*.test.mjs`
  glob, so root `package.json` and Vitest configuration stay untouched

## Caller API

```js
import { fictionalOntario } from './p15v-fixtures.mjs';
import { defaultReviewPolicy } from './p15ac-policy.mjs';
import { auditRouteChoices, decisionMatrix, makeReviewChecklist }
  from './p15ac-comparison.mjs';
import { createEvidenceReport, reportText, localFilePlan }
  from './p15ac-report.mjs';

const snapshot = fictionalOntario(); // For tests only, not actual route coverage.
const policy = defaultReviewPolicy(snapshot.asOf, {
  allowUnknown: true,
  minimumTier: 2,
  alternatives: 3,
});
const result = auditRouteChoices(snapshot, { start: 'a', end: 'd' }, policy);
if (result.ok) {
  const matrix = decisionMatrix(result);
  const checklist = makeReviewChecklist(result);
  const text = reportText(result, 'fr');
  const report = createEvidenceReport(result, 'fr');
  const localFiles = localFilePlan(report, 'fr');
  // Caller chooses whether to save files; no write or upload happens here.
  void [matrix, checklist, text, localFiles];
}
```

## Evidence policy

A review is accepted only when the complete underlying P15V snapshot passes the
existing structural, licence and provenance checks. The review policy must be a
complete bounded object with an explicit `asOf`, export silo, age window, tier,
`allowUnknown` switch, distance/hop limits, alternative count, feature exclusions,
source independence option, and findings cap.

For each cited observation:

1. The record and source identifiers must match.
2. The source must be in the same licence export as the record and request.
3. Dates must be calendar dates, not future dates, and inside the supplied window.
4. The observation cannot predate its cited source record.
5. The cited tier must meet the requested review threshold.
6. An observation with an access value of UNKNOWN is never treated as positive.
7. Conflicting YES and NO observations must not produce YES.

Route status follows all segments: any recorded NO is NO; all supported YES is YES;
otherwise it remains UNKNOWN. A route graph may contain a permitted UNKNOWN edge,
but that does not make its access status affirmative. Every output segment retains
source identifier, licence, observation date and evidence tier.

`makeReviewChecklist` makes manually actionable information-gap entries. It does
not change records, send messages, or mark work complete automatically. Each task
starts with `completion: 'UNKNOWN'`.

## Licence and copy boundaries

Only CC0-1.0, CC-BY-4.0, OGL-Canada-2.0, OGL-ON-1.0 and ODbL-1.0 are accepted.
ODbL is kept in its own export. Both languages are required for displayed record
names. French diagnostics use curly apostrophes, a nonbreaking space before a
colon and a narrow nonbreaking space before a semicolon. Exclamation points, question
marks and the inside of guillemets use a nonbreaking space.

No output contains contact credentials or live tracking claims. Report labels say
which data was supplied and which information needs manual review. The caller
must not interpret the presence of a route as proof that the route is usable.

## Reproduction

From repository root:

```bash
node --test docs/attribution/p15ac-*.test.mjs
node --check docs/attribution/p15ac-policy.mjs
node --check docs/attribution/p15ac-coverage.mjs
node --check docs/attribution/p15ac-comparison.mjs
node --check docs/attribution/p15ac-report.mjs
```

The normal root `npm test` already includes these tests through the existing glob.
The four P15V import targets are already on current main. No synthetic
test fixture is packaged as product data.
