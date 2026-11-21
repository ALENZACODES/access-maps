# P15AJ — Offline retention, preservation holds and disposition governance

## Scope

P15AJ extends the P15AI evidence-custody ledger with a human-governed retention and disposition workflow. It provides a dated retention policy set, a deterministic review plan, an append-only retention-review ledger, preservation holds, two-person disposition review, and an audit snapshot that compares governance findings over time.

The workflow is deliberately administrative and offline. It does not provide legal advice, decide whether a legal obligation exists, interpret a licence, delete evidence, publish evidence, or determine any accessibility fact. A disposition proposal can reach only `approved-for-manual-review`; no execution or deletion operation exists.

## Modules

- `p15aj-retention.mjs`: policy-set validation, retention date calculations, review plans, review ledger, human review decisions and summaries.
- `p15aj-holds.mjs`: preservation hold ledger, scoped hold placement, scheduled human review, independent release/withdrawal and active-hold queries.
- `p15aj-disposition.mjs`: disposition proposal register, retention/hold preconditions, independent approvals, rejection and withdrawal, with origin-digest protection.
- `p15aj-audit.mjs`: cross-ledger consistency audit, immutable governance snapshots and before/after finding comparison.
- `p15aj-fixtures.mjs`: fictional fixtures used only by tests.
- `p15aj-*.test.mjs`: Node built-in unit and integration tests.

P15AJ imports P15AI's contract and custody primitives. The complete P15AI dependency files are included in this archive so every relative import resolves without relying on an unmerged branch or an external package.

## Retention semantics

A policy is keyed to an evidence kind and declares a retention duration, review interval, anchor date (`capturedOn` or `retrievedOn`), effective date, owner role token and bounded notes. An item with no matching policy is reported as `unknown`; the system does not invent an expiry date.

A retention plan classifies each item as `within-retention`, `review-due`, `expired` or `unknown`. Expiry and review-due are prompts for human review, not instructions to dispose of evidence. A review decision is separately recorded and bound to the current custody item digest.

## Preservation holds

A preservation hold references one or more evidence item IDs and stores its scope, reason, placer, review date and lifecycle state. A hold can be reviewed, released or withdrawn only through explicit event-backed operations. The placer cannot release or withdraw their own hold. Active holds block disposition proposals.

The term “preservation hold” describes an internal workflow state. The software does not assert that a legal hold exists or advise on legal obligations.

## Disposition controls

A disposition proposal requires all of the following:

1. A valid custody ledger and matching evidence item.
2. An expired retention-plan item.
3. A current human retention review with `propose-disposition`.
4. No active preservation hold.
5. A reason code and rationale.

The proposer cannot review their own proposal. Two distinct reviewers must approve before the status becomes `approved-for-manual-review`. Rejection and withdrawal remain in the register history. No code path deletes, overwrites or releases evidence.

## Audit and integrity

Every register is digest-bound. Event ledgers use ordered SHA-256 hash chains. Disposition proposals preserve an origin digest so later changes to the original proposal content are detectable even after approvals or state transitions. Governance snapshots bind the custody, policy, review, hold and disposition revisions and can be compared to show new, cleared and persisting findings.

## Privacy and language

Role tokens are pseudonymous. Bounded free text rejects contact details, markup, control characters and prohibited guarantee/endorsement wording. Fixtures contain no personal information or real-place accessibility claims. `UNKNOWN` remains explicit.

The modules use only local input values and Node built-ins. No network access, timers, browser storage, background work, scheduled jobs, cron workflows, keep-awake requests, secrets, or third-party dependencies are introduced.

## Test discovery

The current repository root test script includes `node --test docs/attribution/*.test.mjs`; P15AJ test files are included by that glob after integration.

Focused P15AJ test command:

```sh
node --test docs/attribution/p15aj-*.test.mjs
```
