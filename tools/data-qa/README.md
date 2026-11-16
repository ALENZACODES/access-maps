# Static data QA gate

Run `vitest run tools/data-qa/index.test.ts` from a workspace with Vitest installed.
Import `checkStrictData(json, 'open' | 'odbl')` and **only export records if
`ok` is `true`**. Inputs are arrays with `id`, `source`, `licence`, ISO
`observedOn`, `accessibility` (`YES`, `NO`, or `UNKNOWN`), `silo`, and nonempty
`lineage` entries containing source, licence and observed date.

The gate rejects unknown schemas, invalid provenance, non-allowlisted licences,
held MiWay feeds (including upstream lineage), duplicate IDs and ODbL leakage
into the general open export. An ODbL-derived record must be explicitly labelled
ODbL and exported only through the separate `odbl` silo. Do not merge silos,
interpret `UNKNOWN` as accessible or infer accessibility from other fields.

This module validates only; it never fetches, publishes or schedules work.
Licences in the allowlist still require their own attribution and reuse compliance.
