# P15C: offline package and provenance QA

This is a local **export blocker**, not an accessibility assessment. Before
publishing a pre-built offline region package, run:

```sh
node tools/data-qa/p15c-cli.ts audit --root ./build/offline \
  --manifest manifest.json --as-of 2026-11-15 --max-age-days 60 \
  --format json --report-file ./qa-result.json
```

Exit code `0` permits further review, `1` blocks export, and `2` indicates a
configuration or I/O failure. No fetches, network submissions, or scheduled jobs
are performed. Report files are created exclusively (`wx`) to avoid overwrites.
Use `--format en` or `--format fr` for bilingual plain-text diagnostics. Every
issue also contains `en` and `fr` strings in machine-readable JSON output.
The CLI is exercised by the on-push CI check and imports the same audit library
used by the unit tests.

## Manifest contract

The manifest is one UTF-8 JSON object with `schemaVersion: 1`, a UTC calendar
`generatedOn`, `assets` and `regions`. Each asset has `id`, POSIX relative
`path`, lowercase SHA-256 `sha256`, integer `bytes`, `kind` (`records`, `tiles`,
`text`), `silo` (`open`, `odbl`), `source`, `licence`, `observedOn` and nonempty
`lineage`. Each lineage entry records `source`, `licence` and `observedOn`.
An asset's own provenance must appear in lineage. All contributing record
provenance must be declared in the asset lineage. Open licence identifiers are
allowlisted in `index.ts`; ODbL material cannot enter the ordinary export.
Paths must be within the local root, without traversal, URLs or symlinks.
Only local files are inspected; tiles are not requested from any server.

Every region has `id` and `cells`, each cell containing `id`, `status` and,
only when status is `PRESENT`, `assetId`. Missing cells must be explicitly
`UNKNOWN` with no asset reference. `PRESENT` means only that an offline data
asset exists, **not** that a place or route is accessible. The asset itself
must be checked for any accessibility value; missing observations never become
YES or NO. Coverage is reported as counts, not an accessibility percentage.

All checks are non-mutating. Invalid manifest entries block export; the tool
never tries to repair them. The age threshold is an explicit policy input, not
a freshness claim. Source/licence/date, held-feed exclusion, content hashes,
manifest/record provenance and silo boundaries are checked together.
No records, tile bundles, or lockfiles are included in this patch.

## Run tests

```sh
npx tsx --test tools/data-qa/p15c-pipeline.test.ts tools/data-qa/p15c-cli.test.ts
```

Root `npm test` also runs this suite via `tsx`. Existing Vitest suites for the
earlier lanes remain separate and unchanged.
