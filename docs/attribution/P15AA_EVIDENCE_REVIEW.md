# P15AA — Ontario offline evidence review and route support

## Scope

This incremental data-QA package accepts a caller-provided Ontario accessibility evidence register, compares candidate releases, builds a local review queue, evaluates route evidence at a requested date, and packages dependency-complete local exports. It performs no retrieval, posting, scheduling, account access or background processing. It makes no claims about real-world locations. The fixtures use fictional names only.

The package reuses `dayNumber`, `french`, and `localPath` from `p15v-ontario-model.mjs`, which is present in `access-maps` main. All new relative imports otherwise resolve to files in this archive. The shared P15V source file must **not** be replaced by this archive.

## Files

- `p15aa-contract.mjs`: deterministic serialization, digests, strict record primitives and bilingual diagnostics.
- `p15aa-intake.mjs`: fail-closed source, observation, feature, asset and cross-record reference checks. Accepted records are sorted and copied.
- `p15aa-review.mjs`: comparison of two accepted registers, explicit removal policy, change queue and local human review decisions.
- `p15aa-route-evidence.mjs`: route-facing assessment at a requested day and confidence tier, with explicit `UNKNOWN` and `NO` handling.
- `p15aa-export.mjs`: dependency-complete local subsets, byte-level asset digest checks, route evidence receipts and inventory comparison.
- `p15aa-fixtures.mjs`: fictional testing helpers, not publication data.
- Five matching `.test.mjs` files covering each module.

## Register contract

A register supplies `version: 1`, `asOf` as a calendar date, `maxAgeDays`, and arrays for `sources`, `features`, `observations` and `assets`. Every source has a unique identifier, bilingual name, type, open licence, date, local reference, silo and independence group. Every feature has bilingual text, a feature kind, `YES`, `NO` or `UNKNOWN`, tier, silo and explicit source, observation and asset identifiers. Observations contain a dated source link, access, tier, role and plain-language note. Assets supply local paths, declared byte sizes, digests and source links.

The intake returns `ok: false`, a null value and ordered EN/FR issues whenever any part is unsafe. It never returns a partially usable register. Unsupported licence combinations and cross-silo references block the package. Tier-three positive statements require independently sourced observations. Conflicting positive and negative observations require `UNKNOWN`, and no feature can be promoted from `UNKNOWN` on inference alone.

## Review and routing

`compareEvidenceRegisters` accepts two valid snapshots and an explicit removal policy. The default is intentionally not permissive: callers must provide allowed removals and a maximum count. Reused source identifiers cannot silently change identities, and reused observations cannot silently change their evidence. Source dates cannot go backwards. A transition from `UNKNOWN` to a positive statement needs newly introduced evidence. The queue does not automatically accept changes; review decisions are local records that must be complete.

`assessRouteEvidence` evaluates a caller-specified ordered feature list, source group, as-of day and minimum tier. A supported negative observation blocks the route; a missing, conflicting, stale or too-low-tier observation yields `UNKNOWN`. A conditional route is only returned when the caller explicitly opts in. This tool does not invent graph connectivity or perform geographic route searches; it evaluates an externally supplied proposed route's evidence.

## Export and integrity

`exportEvidenceSubset` includes the selected features and only their necessary source, observation and asset references. `validateBytesByPath` requires actual `Uint8Array` bytes for every declared asset, checks the byte count and independently computes SHA-256. A mismatch blocks the export. Receipts hash the exact serialized bytes and never assert that a transfer or upload happened.

## Test invocation

From the repository root:

```bash
node --test docs/attribution/p15aa-*.test.mjs
npm run lint
npm test
```

The existing root `npm test` already runs `node --test docs/attribution/*.test.mjs`. No `package.json`, lockfile, dependency or workflow edit is required.

## Presentation requirements

All copy is EN/FR with French right apostrophes, nonbreaking spaces before colons and narrow nonbreaking spaces before semicolons, exclamation/question marks and inside guillemets when those marks appear. Data without adequate evidence remains the literal token `UNKNOWN`.
