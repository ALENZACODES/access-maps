# P15AF — Source retirement and downstream impact governance

## Purpose

P15AF is an offline data-QA extension for the Access Maps evidence pipeline. It records source holds, releases, retirements and supersession decisions, then follows source lineage through records, offline assets and publication packages. It creates a deterministic remediation plan and checks whether the candidate catalog reflects the required downstream containment.

P15AF does not fetch sources, inspect physical locations, decide whether a place is accessible, or publish a package. It does not create positive or negative access assertions. `UNKNOWN` remains a distinct value. A passing reconciliation only means that the supplied catalog and governance history satisfy the declared impact-control checks.

## Modules

- `p15af-contract.mjs`: strict JSON contracts, identifiers, dates, privacy-safe text, canonical digests, bilingual typography and append-only event helpers.
- `p15af-catalog.mjs`: source, record, evidence, asset and package contracts with cross-entity lineage checks.
- `p15af-graph.mjs`: deterministic dependency graph, forward/reverse traversal and source blast-radius reports.
- `p15af-ledger.mjs`: append-only source hold/release/retirement history, action acknowledgement and remediation evidence.
- `p15af-impact.mjs`: dependency-ordered remediation plans, progress accounting and human release-review readiness.
- `p15af-review.mjs`: source revalidation checks for source state, snapshot digest, licence, attribution and observation currency.
- `p15af-reconcile.mjs`: candidate-catalog reconciliation against the original catalog, source ledger and remediation plan.
- `p15af-report.mjs`: compact English/French governance report and integrity summary.
- `p15af-fixtures.mjs`: synthetic fixtures only.
- `p15af-*.test.mjs`: Node built-in tests.

## Source lifecycle

A source can be active, held, retired or superseded. A hold records a reason code, human-readable reason, prior state and source snapshot digest. A release must point to the exact hold event and carry a review digest. Retirement and supersession are terminal decisions for that source ID.

The ledger is append-only and hash chained. Event dates cannot move backwards. Source release is not automatic: a human must review source status, source snapshot integrity, licence, attribution and observation currency. The source review output is a checklist result, not a source-state mutation.

## Impact graph and remediation

The dependency graph links:

1. source snapshots to records they support;
2. records and sources to offline assets that materialize them;
3. assets, records and sources to publication packages.

A held source produces a plan for every reachable record, asset and package. Known-state records are quarantined; `UNKNOWN` records are sent for review. Current assets are quarantined, and non-current assets are rebuilt. Ready packages are held. The plan orders dependencies so that record controls precede asset controls and asset controls precede package controls.

Every action requires an acknowledgement and a remediation result digest. Deferred and rejected actions remain incomplete. Release-review readiness is false until every planned action has been accepted and completed. This readiness flag does not release a source or publish a package.

## Candidate reconciliation

The reconciliation compares the original catalog to a separately supplied candidate catalog. It verifies that the source has a release or terminal retirement event, the source digest and status match the event, affected records are no longer usable, affected assets are quarantined or rebuilt with a new digest, and affected packages are held or withdrawn.

The candidate catalog must itself pass the catalog's lineage and package-readiness contracts. A package cannot remain `ready` while depending on a held source, non-usable record or non-current asset.

## Privacy, accessibility and licensing

All actors and reviewers use opaque tokens. Free text rejects email addresses, phone numbers, markup, control characters and prohibited marketing claims. Public reports omit actor tokens and direct identity fields. French punctuation requires U+00A0 before `:` and U+202F before `; ! ?` and inside « » where applicable.

Licences are recorded and mapped to separate `open` and `odbl` silos. P15AF does not make legal determinations about licence compatibility. Every source record carries a licence, observed/retrieved dates, a source digest and a package-relative source reference.

## Tests

Focused tests:

```sh
node --test docs/attribution/p15af-*.test.mjs
```

The existing repository root `npm test` command already includes `node --test docs/attribution/*.test.mjs`, so these `.test.mjs` files are discovered without modifying `package.json`. The P15AF additions import only other P15AF modules in the same directory and use Node built-ins only.

No application route, workflow, dependency, package script, build configuration or precache input is changed.
