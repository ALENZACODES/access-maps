# P15AI delivery verification record

## Base repository and current main

Repository: `ALENZACODES/access-maps`
Branch: `main`
Exact base commit: `158e2723053e12d75e54334f959b5f3321d9796d`

The current-main branch was checked immediately before this delivery and still pointed to the exact base commit above. P15AI adds only new files under `docs/attribution/`; it does not replace or modify existing main files. All relative imports used by P15AI are included in this ZIP.

## Open P15 PR health

Open P15 PRs checked against current main:

| PR | Base SHA matches main | Mergeable | Reported checks |
|---|---|---|---|
| #104 | Yes | Yes | map-audit, journey, ci — success |
| #120 | Yes | Yes | P15J, P15L, P15M, offline data QA, map-audit, journey, ci — success |
| #122 | Yes | Yes | offline data QA, map-audit, journey, ci — success |
| #123 | Yes | Yes | offline data QA, map-audit, journey, ci — success |

No red P15 PR was identified. P15AI is a new ZIP delivery and has not been pushed as a PR.

## Existing main CI evidence

GitHub Actions CI run `44869807243` completed successfully for the exact base commit. Its test job passed `npm ci`, `npm run check:schema`, `npm run lint`, `npm test` and `npm run validate:sample`; the data-QA job passed `npm run check:strict-data`.

The current root `npm run lint` includes root `tsc --noEmit` and workspace lint/type checks. The root `npm test` includes `node --test docs/attribution/*.test.mjs`, so the P15AI tests will be discovered by the existing root test command after integration.

These GitHub CI results are for the unchanged base commit, not for a commit containing P15AI.

## P15AI local verification

- Source and test code: 2,043 real lines across 14 `.mjs` modules and tests.
- Focused tests: `node --test docs/attribution/p15ai-*.test.mjs` — 359 passed, 0 failed.
- `node --check` passed for every P15AI `.mjs` source and test file.
- All relative imports resolve to files included in this archive.
- Unused-import scan: none found.
- Production scan found no network calls, external URLs, browser storage, timers, background APIs, SCIO or MiWay references.
- Tests cover evidence intake, append-only custody events, metadata digest chains, transfers, state transitions, access receipts, redaction receipts, manifests, offline packs, privacy checks and ledger comparisons.

The complete root lint and root test commands were not rerun locally because this delivery workspace does not contain the full repository checkout. The local green result is the focused P15AI test suite and syntax/import validation.

## Precache budget

The inspected current-main recursive tree, root package scripts and `.github/workflows/ci.yml` do not define a `check-install-budget`, precache-budget script or precache-budget workflow step. P15AI adds documentation-side `.mjs` modules and tests only and does not change application imports, assets, package scripts, build configuration or precache inputs. No precache-budget pass is claimed.

## Delivery boundary

This is a ZIP delivery only. No existing PR was force-pushed, no branch was merged, and no main-branch file was modified.
