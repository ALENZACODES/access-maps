# P15AI — Offline evidence custody, access history and redaction packs

## Purpose

P15AI adds a bounded offline custody ledger for evidence references used by the P15 data-QA and review lanes. It records evidence metadata, source and content digests, custody transfers, state changes, access events, redaction receipts, checkpoints and identity-minimized offline packs.

The ledger stores references and digests only. It does not store source bytes, retrieve URLs, authenticate a human, decide legal licence compatibility, infer accessibility facts, or publish a record. `UNKNOWN` licence values remain explicit.

## Modules

- `p15ai-contract.mjs`: strict JSON contracts, canonical SHA-256 digests, UTC timestamp validation, bounded text, pseudonymous role tokens, French punctuation checks and append-only event helpers.
- `p15ai-ledger.mjs`: ledger creation, evidence intake, metadata revisions, state changes, custody transfers, access records, redaction receipts, checkpoints and validation.
- `p15ai-redaction.mjs`: redaction receipt manifests, item-level lookup and aggregate summaries.
- `p15ai-pack.mjs`: selected-item custody pack, optional access history, optional event history and English/French text summary.
- `p15ai-audit.mjs`: event-chain verification, source digest audit, access-purpose checks, before/after ledger comparison, pack-to-ledger verification and export privacy checks.
- `p15ai-fixtures.mjs`: fictional-only test data.
- `p15ai-*.test.mjs`: Node built-in unit and integration tests.

## Integrity model

Each evidence item is registered with a content digest, source digest, retrieval and capture dates, licence label, custodian role token and lifecycle state. Each item mutation is linked by a previous/next SHA-256 digest pair. The ledger validator replays this digest chain and checks that the final item matches its recorded history.

Custody transfers and state transitions are append-only events. Access and redaction entries require matching event receipts. Event sequences are contiguous, timestamps cannot move backwards, and each event is chained to its predecessor.

A redaction manifest can only reference redaction receipts already present in the ledger. A custody pack is bound to a specific ledger digest; its selected item digests are checked against the exact ledger revision before the pack is accepted.

## Privacy and safety

Actor identifiers are role-scoped pseudonyms. Free text rejects contact details, markup, control characters and prohibited endorsement/guarantee wording. Pack exports omit actor and custodian tokens. No personal data or real-world accessibility facts are present in fixtures.

No network calls, external URLs, browser storage, timers, scheduled jobs, cron workflows, keep-awake requests, secrets, third-party dependencies or application bundle imports are introduced. The modules use only Node built-ins and caller-supplied metadata.

## Test discovery

The current root `npm test` script includes `node --test docs/attribution/*.test.mjs`; the P15AI tests are therefore discoverable by the existing repository test command when the ZIP is integrated.

Focused lane command:

```sh
node --test docs/attribution/p15ai-*.test.mjs
```
