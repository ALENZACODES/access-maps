# P15L — Local offline evidence package gate

This incremental lane adds a local-only inspection function for a candidate
offline package. It does not fetch data, create location facts, upload assets,
or publish anything. It accepts an explicit manifest and a map of local bytes
supplied by the caller. The manifest is an assertion about the supplied bytes;
passing the gate does not establish the real-world accuracy of a claim.

## Source notices in vector overlays

Inspect the notice in a local tile archive and look up the sources used in one tile. [Open tile source notices](tile-notice.html?lang=en)

Consultez la mention inscrite dans une archive locale et les sources utilisées dans une tuile. [Ouvrir les mentions de source des tuiles](tile-notice.html?lang=fr)

## Input contract

`auditOfflineEvidence(candidate, fileBytes)` accepts a strict root object with
`schemaVersion: 1`, a calendar `asOf` date, `maxAgeDays` (0–3650), and `sources`,
`records`, and `files` arrays. Each source has a stable local id, name, open
licence, observation date and relative provenance path. Each record has an
English and French label, accessibility feature, YES/NO/UNKNOWN access state,
confidence tier, source ids, local file ids, export partition, and observations
that carry their own dates and tiers. Each offline file has a SHA-256 digest,
byte length, source ids and partition. All file content is supplied by the
caller as an in-memory byte view. No disk or network operations are performed.

Tier 0 cannot enter the release export. Tier 1 may preserve UNKNOWN without
observations. Higher tiers require matching dated observations, and a positive
or negative access assertion needs supporting observation evidence. Contrary
observations leave the access state UNKNOWN. Sources and assets with an ODbL
lineage remain in a distinct export partition. Unsafe labels and local paths
are rejected; French spacing is checked for punctuation.

Bounded arrays and bytes limit the amount of data processed in any one audit.
The result is deterministic, with sorted diagnostic codes, paths, and EN/FR
explanations. Raw untrusted values are never embedded into the diagnostic text.

## Local checks

Run `node --test docs/attribution/p15l-offline-evidence.test.mjs` and
`node --check docs/attribution/p15l-offline-evidence.mjs`. The root test runner
already includes `docs/attribution/*.test.mjs`, so no modification to
`package.json` or test discovery is needed. Tests use only Node built-ins and
one included same-directory source file. This chunk does not change any
existing UI wording, workflow, scheduled job or dependency.

## Scope

P15L is an additional gate, not a substitute for the existing P15 publication
and regression checks. Real source snapshots must be provided separately and
reviewed by the project owner before use. The gate never fills gaps with
synthetic statements or guesses. Its focus is structural and local integrity.
