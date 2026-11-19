# P15U: Offline transfer audit

## Purpose

P15U accepts caller-supplied bytes for a bounded offline transfer bundle. It does
not request remote data or perform filesystem reads or writes. It refuses to emit
an inventory if any required integrity, attribution, date, licence, evidence or
local-path check fails. This is a data gate, not a publication mechanism.

The module is intentionally independent of unmerged P15 work and has only the
Node `crypto` module as a runtime import. Its tests use Node's built-in test and
assertion modules. All included code works in Node 22 or newer.

## API

`auditOfflineTransfer(input, policy?)` returns either a blocked report with
`ok: false`, `findings`, and `totalBytes`, or an accepted report with the same
fields and a canonical `inventory`. A blocked result never includes an
inventory. Findings carry stable machine-readable codes and localized English
and French messages, and do not echo source data.

The input has `asOf`, `sources`, `assets`, and `records`. Each source has an ID,
English and French descriptions, an open licence, a date, and a local relative
reference. Each asset has an ID, path, associated source IDs, licence silo,
byte count, SHA-256 digest, observation date and an ordered list of parts.
Each part has an offset, actual `Uint8Array` or `ArrayBuffer` content, and the
SHA-256 digest for that part. Records carry bilingual descriptions, feature,
access state, tier, source IDs, asset IDs and dated observations.

The optional policy is an exact object containing `maxBytes`, `maxAgeDays` and
`allowEmpty`. Default limits are 64 MiB, 90 days and no empty inventory. Values
outside supported bounds are rejected. Input is not mutated.

`transferDiagnostic(report, locale)` renders only local English or French
messages and machine-readable paths. It never includes record values.

## Integrity and attribution

Asset bytes are hashed directly and compared both against each part's digest
and against the full declared asset digest. Offsets must be consecutive from
zero, and part size cannot exceed 4 MiB. Both aggregate and per-asset sizes
are bounded. A missing part, wrong offset, digest mismatch or absent bytes
blocks the transfer. A declared digest alone is never accepted as proof that
bytes were supplied.

Sources must use a supported open licence. ODbL material stays in its distinct
export group. Referenced source and asset IDs must exist, and a record cannot
silently use an asset whose source set is outside its own source set.

Dates must be calendar dates and remain within the caller's retention window.
An asserted YES or NO requires dated matching evidence. Tier 3 requires two
distinct supporting source IDs. Conflicting YES and NO observations cannot be
published as an asserted value. Missing access stays UNKNOWN.

French text uses nonbreaking space before colons and narrow nonbreaking space
before semicolons, exclamation marks and question marks. English and French
labels reject markup, script-style URLs, contact addresses and control text.

## Running tests

From the repository root:

```sh
node --check docs/attribution/p15u-transfer-audit.mjs
node --check docs/attribution/p15u-transfer-audit.test.mjs
node --test docs/attribution/p15u-transfer-audit.test.mjs
```

The existing root test command includes `docs/attribution/*.test.mjs`, so no
package script, configuration change, additional dependency or workflow is
needed. This module does not run in an unattended or scheduled process.

## Limitations

The audit cannot establish whether a location is accessible in the real world.
A supporting source remains necessary, and time-sensitive information may
become stale. The caller must provide every asset byte explicitly. The audit
does not fetch, install, publish or retain any bytes.
