# P15AB — Blind reviewer assignment and offline delivery governance

## Scope

P15AB is a local-only assignment and delivery package for the P15 offline evidence-review lane. It allocates independent reviewers to caller-supplied review tasks, creates identity-blind packets, collects decision records, supports recusal and adjudication, audits assignment fairness, and verifies offline packet bytes and delivery receipts.

It does not collect or infer accessibility facts. It does not change source records, assign confidence to evidence, or convert `UNKNOWN` into a positive statement. The review packet carries only the caller-supplied record and evidence digests, field, skill requirements, and a generic bilingual brief.

## Modules

- `p15ab-contract.mjs`: bounded identifiers, safe text, deterministic JSON digests, French typography and append-only event primitives.
- `p15ab-roster.mjs`: reviewer capability roster, availability, capacity, language and conflict-of-interest declarations.
- `p15ab-tasks.mjs`: strict review task set with blinded aliases and explicit independent reviewer quorum.
- `p15ab-assign.mjs`: deterministic capacity-aware allocation, skill/language matching, conflict exclusion, group independence and load validation.
- `p15ab-blind-review.mjs`: pseudonymous per-task reviewer tokens, identity-minimized packets, response validation and consensus reconciliation.
- `p15ab-ledger.mjs`: append-only plan, packet, response, recusal, adjudication and checkpoint event ledger.
- `p15ab-audit.mjs`: load fairness metrics, group concentration, conflict findings and blind-packet checks.
- `p15ab-governance.mjs`: recusal-driven reassignment, independent adjudicator selection and seed-based fairness simulation.
- `p15ab-delivery.mjs`: offline packet manifests, byte/digest verification, delivery receipts and bounded reissue history.
- `p15ab-*.test.mjs`: Node test suites with fictional fixtures only.

## Assignment rules

The allocator sorts work by explicit priority and due date. A reviewer is eligible only when active, available, suitably skilled, language-compatible, conflict-free, and within total and daily capacity. A task never receives two reviewers from the same declared independence group. Capacity and group limits are enforced again by the plan validator.

Assignments are deterministic for a given roster, conflict register, task set, policy and seed. Changing the seed can change tie-breaking; it does not change eligibility rules. Partial assignments remain queued and report why reviewer slots could not be filled.

## Blinding and review

Each packet receives a deterministic, task-specific blind token. Internal reviewer IDs, source/operator conflict groups and geographic-cell conflict metadata are not included in the packet. The packet digest binds the record/evidence digests and review instructions. Responses must refer to the packet digest and fall within the packet's issue/expiry window.

`UNKNOWN`, contradictory decisions, abstentions and missing quorum remain unresolved and require further review or adjudication. A consensus output is not a publication decision.

## Delivery and privacy

Delivery manifests use package-relative paths, a 1 KiB per-packet limit and an 8 MiB total limit. Actual bytes are checked for exact size and SHA-256 before acceptance. Receipts are pseudonymous and append-only. Only an `unreadable` receipt can be reissued, with a maximum of three attempts; reissue history is retained in the delivery ledger.

Reviewer IDs, conflict declarations and internal assignment plans are coordinator-side records. Blind packets omit these fields. Text fields reject contact details, markup and control characters. Fixtures contain fictional identifiers only.

## Local test

```sh
node --test docs/attribution/p15ab-*.test.mjs
```

The repository's existing root test command already includes `docs/attribution/*.test.mjs`; no package script, dependency, lockfile, workflow, application route or precache input is changed. No network access, timers, browser storage, scheduled workflows, cron jobs or keep-awake requests are used.
