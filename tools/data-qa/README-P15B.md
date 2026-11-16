# Licence expiry, validity, and review

Run `vitest run tools/data-qa/stale-licence-report.test.ts` from the workspace.
The test runner imports the exported `reportStaleAndMissingLicences` function.

Call `reportStaleAndMissingLicences(records, { asOf: '2026-11-15', maxAgeDays: 365 })`
to classify each source's licence:

- **Blocking (fails CI unless the source is already held):** a missing, invalid,
  unrecognized, or expired licence, or a missing/invalid/future observation date.
  A held source (currently MiWay) is excluded from redistribution, so it is
  reported but does not fail this gate.
- **Informational, clearly labelled:** a licence that is still valid, but whose
  observation date is older than the review window (`maxAgeDays`, or the
  licence's `reviewEveryDays`). These issues use the code `LICENCE_REVIEW_DUE`
  and the wording "Informational: the licence is still valid, but it is due for
  review." They never fail CI on their own.

Recognized licences are the strict export allowlist plus the identifiers already
documented in `FINDINGS.md` / `findings.ts`. Input values, including
`accessibility: 'UNKNOWN'`, are never rewritten or inferred.

`npm run check:strict-data` runs this report over `sources/registry.json` and
exits non-zero on blocking licence issues. Review-due rows are printed as
informational. This does not replace the strict schema, held-feed, or ODbL silo
checks, and it does not schedule work.
