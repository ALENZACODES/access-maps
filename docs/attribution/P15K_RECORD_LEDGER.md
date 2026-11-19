# P15K — candidate record evidence ledger

This local-only gate supplements the existing publication and regression checks.
It evaluates caller-supplied candidate places without making factual assertions
about any real site or operator. The input and local asset inventory must come
from the same offline capture, and the capture must retain its original source
references for later human review. Missing evidence blocks assertions; the
checker does not fetch sources, infer geography, or publish anything.

## Contract

Call `auditRecordLedger(candidate, assets)` from
`docs/attribution/p15k-record-ledger.mjs`.

The candidate has `asOf`, `maxAgeDays`, `sources`, and `records`.
Every source has an identifier, licence, observation date, local reference and
tier. Every place has an identifier, English and French text, feature, access
state, tier, export group, source identifiers, dated observations, offline asset
declaration (or `null`), and interaction target size. For offline assets, the
caller supplies a map keyed by relative path with actual byte length and digest.
The gate compares those values with the candidate's declared asset metadata;
it does not read files or calculate digests itself.

Supported access states are `YES`, `NO`, and `UNKNOWN`. Tier 0 represents a draft
and cannot assert `YES` or `NO`. A higher tier needs matching current evidence
from a source at least that tier. Conflicting current positive and negative
evidence requires `UNKNOWN`. Every source reference must be local and have a
supported licence and valid calendar date. Source and place identifiers must be
unique. Evidence cannot predate its source or exceed its tier. ODbL lineage is
kept in its own export group. Text is bilingual and checked for unsafe markup
and French typography. Targets have a 44-pixel minimum. Missing, mismatched,
or unsafe offline asset declarations block the candidate.

The report contains a boolean `ok`, deterministic bilingual findings, summary
counts, and a compact per-record audit listing. The report does not contain
actual asset bytes or credentials. No network activity, scheduled execution,
external mutation, or persistence is performed by this module.

## Testing

Run `node --test docs/attribution/p15k-record-ledger.test.mjs` locally.
The repository's existing root `npm test` command already matches this test
file through `node --test docs/attribution/*.test.mjs`; no root configuration
change is needed. The test fixtures are synthetic and are not source claims.
