# P18 parity inspector — release integration

Base commit: `8a1d0b2edefd2df9ffbce3b35802531e3f5a68ca` (`access-maps` main, merged #114). No files from open #115 or earlier unmerged branches have been used. The feature imports only merged `trace-core.mjs`, included byte-for-byte in the ZIP, and new same-directory modules included here. Applying complete paths onto this base preserves merged attribution navigation and source catalogue.

- No changes to `check-install-budget.ts`, test timeouts, test gates, package scripts, lockfiles or scheduled workflows.
- The root repository's existing `node --test docs/attribution/*.test.mjs` command discovers this feature's tests automatically.
- Local validation: `node --test docs/attribution/parity-*.test.mjs` 157/157; `node --check` every new `.mjs`; all local JavaScript relative imports resolved.
- Repository-wide lint, strict TypeScript check, precache/install budget and full browser/axe audit are **not certified** by this package. They require a complete repository checkout and actual runtime.
- The source and evidence fields in the synthetic fixture are fictitious except the required literal OSM legal credit. No data is imported from real accessibility reports.

## CI acceptance checklist

1. Ensure the package applies as full replacement/new files without losing #114 homepage navigation or the exact `Open attribution conflict review` wording.
2. Run existing root lint and test scripts unchanged.
3. Run existing repository install/precache budgets without increasing limits.
4. On the deployed HTML route, check keyboard Tab/Shift+Tab, skip link, visible focus, screen reader, 44px touch targets, color contrast and zero axe violations in English and French.
5. Import a real operator-supplied trace register and explicit pair register; confirm there is no automatic language pairing, and that UNKNOWN evidence produces blocking findings for included views.
6. Confirm a withheld, invalid or oversized JSON input never overwrites the working register.
7. Do not publish synthetic test fixtures as real place or service information.
