# P15H: offline publication regression gate

P15H extends P15G without adding any network, account, timer, or publication side effect.
It compares two locally supplied complete publication snapshots. Each is first checked
by the existing P15G gate. A failure in either snapshot blocks the comparison.

Run `npm run data-qa:regression -- --before previous.json --after candidate.json`.
Use `--format en` or `--format fr` for human-readable bilingual diagnostics.
`--output report.txt` writes a new local report without overwriting an existing file.

Removed records must be named in an optional local policy file, such as
`{"removedPlaces":["old-place"],"maximumRemovals":1}`. No removal is allowed by
default. Updates preserve access UNKNOWN unless new dated evidence supports a
change. Reused source identifiers cannot silently change licences, source names,
or reference paths. Existing assets must not silently change bytes, digest, or
path. The CLI returns 0 for a passing comparison, 1 for blocked changes, and
2 for malformed input or I/O errors. No data is uploaded.

Run the regressions with `npx tsx --test tools/data-qa/p15h-*.test.ts`.
The root test script and the data-QA CI workflow also include this test suite.
