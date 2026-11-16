# Stale-date and missing-licence diagnostic

Run `vitest run tools/data-qa/stale-licence-report.test.ts` from the workspace.
The test runner imports the exported `reportStaleAndMissingLicences` function.

Call `reportStaleAndMissingLicences(records, { asOf: '2026-11-15', maxAgeDays: 30 })`
to get a read-only report of missing or unsupported open licences, missing
sources, and absent, invalid, future or stale observation dates. The age limit
is in whole UTC calendar days; exactly 30 days is not stale in this example.
Every issue has an English and French description. Input values, including
`accessibility: 'UNKNOWN'`, are never rewritten or inferred.

This is **diagnostic only**. A clean report does not authorize publication:
continue to use the strict schema, source/licence and held-feed export checks,
including ODbL silo separation. No network or scheduled work is performed.
