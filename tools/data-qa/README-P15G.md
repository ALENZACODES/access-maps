# Offline publication audit (P15G)

Use `npm run data-qa:publish -- --input candidate.json --format en` for a local,
fail-closed publication check. Use `--format fr` for French or `--format json`
for machine-readable findings. `--output report.txt` writes a new local file;
it will not replace an existing report. Exit codes are 0 for pass, 1 for
blocked, and 2 for invalid input or I/O errors.

Schema version 1 expects `asOf`, `maxAgeDays`, `sources`, `places`, and `assets`.
Each source records `id`, `name`, open `licence`, `observedOn`, and local
`reference`. Each place records EN/FR labels, a feature, explicit `access`,
`sourceIds`, `evidence`, `assetIds`, `targetPx`, and an export `silo`.
Evidence records feature, access, source ID, and date. Assets include local path,
SHA-256, byte count, source IDs, and silo. Missing access remains `UNKNOWN`.

The gate blocks incomplete provenance, held feeds, stale dates, ODbL crossover,
missing translation, unsafe content, undersized 44 px controls, nonlocal paths,
conflicting asserted states, and missing evidence. It does not fetch, classify,
change, or publish data. Tests are run in the root test task and the data-QA
CI job, with no dependence on another unmerged branch.
