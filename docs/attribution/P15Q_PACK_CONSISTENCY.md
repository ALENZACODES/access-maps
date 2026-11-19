# P15Q: cross-pack offline consistency audit

This standalone module audits a caller-supplied array of offline place packs before
an application considers combining them. It never writes a file, opens a network
connection, modifies a record, upgrades access status, or produces a merged pack.
The caller chooses an explicit reference date and resource limits; the audit is
pure and returns deterministic English and French diagnostics.

## API

Import `auditPackConsistency` and `packConsistencyText` from
`./p15q-pack-consistency.mjs`. Provide `packs` as an array of complete objects
with fields `id`, `asOf`, `silo`, `sources`, `places` and `assets`.

A source has `id`, `name`, `licence`, `observedOn`, and safe relative `reference`.
A place has `id`, `en`, `fr`, `feature`, `access`, `tier`, `sourceIds`,
`evidence` and `assetIds`. Each evidence item has `sourceId`, `feature`,
`access`, `tier` and `observedOn`. An asset has `id`, `path`, `sha256`,
`bytes` and `sourceIds`. All source and asset references must resolve within
the containing pack. Only the documented open licences are accepted, with
ODbL isolated from other source licences.

Provide a policy object with exactly `asOf`, `maxPacks`, `maxPlaces`,
`maxAssets`, `maxBytes`, and `maxAgeDays`. All dates use valid YYYY-MM-DD
calendar days. Limits are upper bounds, not promises of delivery success.

The result is `{ ok, findings, summary }`; findings carry a stable code, a
structured path, pack ID, and paired `en` and `fr` messages. The report does
not echo any place names or private input values. A failed audit does not
return an exportable payload. Callers must not treat success as fieldwork,
recency guarantees, or permission to publish.

## Behaviour

The gate blocks conflicting source identities, incompatible duplicate place
records, offline path collisions and cross-licence export mixing. Duplicate
records are acceptable only if they are identical and already valid within
their own pack. `UNKNOWN` remains a real, explicit value. Any stated YES/NO
condition needs current matching evidence, and higher tiers need stronger
observation support; no tier is inferred. A held operator feed cannot enter.
All paths are relative and must not traverse directories or refer to URLs.
Both English and French text must be safe; French punctuation uses nonbreaking
spacing, including U+202F before semicolons.

## Local test integration

The repository's existing `node --test docs/attribution/*.test.mjs` test glob
includes `p15q-pack-consistency.test.mjs`, so package scripts do not need edits.
Run this module's suite directly with:

```sh
node --test docs/attribution/p15q-pack-consistency.test.mjs
```

This module and its test import only Node built-ins and each other; no external
files are needed. No workflow, account integration, secret, or scheduled task
is added. If applying to a branch, start from current main and do not replace
files that have subsequently changed upstream.
