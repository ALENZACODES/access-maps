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

## Pack and registry gate

`npm run check:strict-data` runs `checkStrictData` over `sources/registry.json`
and every `data/**/*.ndjson.gz` record (and `pack/v1` when present). CI runs
that command on pull requests and on pushes to `main`. It is not scheduled.

The job fails on undocumented violations. Licence identifiers that are in the
repo but outside the strict export allowlist are listed in `FINDINGS.md`.
Only an explicit wheelchair value of `yes` or `no` is mapped to `YES` or `NO`;
anything else, including `limited` and conflicting tags, stays `UNKNOWN`.
MiWay must not appear as a `source_id`. Notes that mention MiWay being out
are not used as the source field.
