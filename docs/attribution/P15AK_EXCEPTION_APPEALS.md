# P15AK — Retention exception requests, appeals and governance audit

## Scope

P15AK extends the evidence custody ledger and P15AJ retention workflow with temporary exception requests, independent approval, appeal of rejected requests, bilingual reports and cross-ledger consistency checks.

This is an offline administrative record. It does not decide whether a legal exception or obligation exists, interpret law or licences, delete evidence, publish evidence, or determine any accessibility fact. An accepted appeal only allows a new exception request to be filed; it does not approve or activate an exception.

## Modules

- `p15ak-exceptions.mjs`: controlled exception types, request validation, two-person approval, rejection, withdrawal, date-bounded active queries, disposition guard and summaries.
- `p15ak-appeals.mjs`: appeal filing for rejected requests, 30-day filing window, independent two-person appeal review, withdrawal and reconsideration eligibility.
- `p15ak-audit.mjs`: cross-checks exception records against the current custody ledger, policy set and retention plan.
- `p15ak-export.mjs`: identity-minimized English and French reports with required French nonbreaking spaces.
- `p15ak-fixtures.mjs` and `p15ak-appeal-fixtures.mjs`: fictional test-only fixtures.
- `p15ak-*.test.mjs`: Node built-in unit and integration tests.

P15AK uses the custody contracts and P15AJ retention/disposition modules. All transitive source and test files from those earlier rounds are included in the ZIP.

## Exception workflow

A request binds the current custody digest, evidence item digest, policy-set digest and retention-plan digest. Request dates are bounded to 365 days. A requester cannot review their own request. Two distinct reviewers must approve before an exception is considered active. Rejection and withdrawal are event-recorded and retained in the register.

An approved exception is active only between its request date and requested end date, inclusive. Expiry is computed at query time; it does not rewrite or delete the original record. An active exception blocks a disposition proposal through `proposeDispositionWithExceptionCheck`.

## Appeal workflow

Only a rejected exception request can be appealed, within 30 days of the recorded rejection. The original requester cannot file the appeal. Two distinct reviewers must accept an appeal before it reaches `accepted-for-reconsideration`.

That status is not an approval. It signals only that a fresh exception request may be filed and assessed under the normal request and approval rules. The original rejected exception remains rejected and unchanged.

## Integrity and privacy

Exception and appeal registers use ordered SHA-256 event chains and origin digests. Approvals, review receipts, withdrawal records and current source digests are validated. Role tokens are pseudonymous. Bounded text rejects contact details, markup, control characters and prohibited guarantee/endorsement wording.

The reports omit requester, appellant and reviewer tokens. `UNKNOWN` remains explicit. No automatic deletion, source mutation, network access, browser storage, timers, scheduled jobs, cron workflows, keep-awake requests, secrets or third-party dependencies are introduced.
