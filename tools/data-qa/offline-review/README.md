# P15L — Offline publication review

This is a self-contained English/French **offline page** for a human review of
local static data publication manifests. It is an additive feature under
`tools/data-qa/offline-review/` and does not import any unmerged P15 module.
The page never downloads map tiles, calls APIs, stores input files or schedules
anything. It requires no account or remote server.

## Open the page

Run `node tools/data-qa/offline-review/serve.mjs` from the repository root,
then visit `http://127.0.0.1:8765/` in a modern browser. The server listens
only on loopback, serves a fixed allowlist of local page assets and explicitly
blocks all page network connections. This avoids browsers blocking ES modules
loaded directly from `file://`. No internet connection is needed.
Choose a local JSON manifest,
set an as-of date and source age policy, then select **Review files**. You can
optionally choose a prior JSON manifest to compare releases. Use the language
selector to switch the entire interface between English and French. Results
can be filtered by severity, finding code, or path, and exported locally in
JSON or CSV. File text stays on the device; the exported report omits the
submitted source descriptions.

## Input schema

The manifest has six required root fields:

- `schemaVersion`: integer `1`
- `generatedOn`: calendar date `YYYY-MM-DD`
- `sources`: array of objects with `id`, `name`, `licence`, `observedOn`,
  and relative `reference`
- `places`: array of objects with `id`, `region`, `category`, `nameEn`,
  and `nameFr`
- `observations`: array of objects with `id`, `placeId`, `state` (`YES`, `NO`,
  or `UNKNOWN`), `sourceIds`, `observedOn`, `descriptionEn`, and
  `descriptionFr`; optional `replacesId` expresses an explicit predecessor
- `assets`: array of objects with `id`, relative `path`, lowercase hexadecimal
  `sha256`, `bytes`, `sourceIds`, `silo` (`open` or `odbl`), and `kind`

The QA engine accepts only named open licences; ODbL assets must stay in their
own silo. Held feeds are excluded even when the source name is punctuated.
Date checks are based on calendar days. Source names, observation texts, and
paths are screened for unsafe markup and privacy-sensitive text.

No observations are generated from proximity or the existence of nearby map
objects. Missing accessibility evidence remains `UNKNOWN`. Conflicting known
observations produce a review notice, not an inferred positive state.

For a prior publication, the comparison gate blocks missing records unless
removal IDs are approved explicitly by the caller. The page defaults to *no
removal approvals*. It rejects in-place edits to published observation IDs,
source ID meaning changes, and asset hash changes without lineage changes.

## Limits and trust boundary

Only local files up to 2 MiB can be read by the page. Parsed input has strict
schema and collection-size limits. Paths must be local and relative; source
references and asset files are **metadata only** and are not opened or fetched.
The page is a diagnostic, not a publication writer or a suitability decision.
A passing report means only that these specific local checks found no blocking
issues; it does not claim completeness or an assessment of physical access.

## Tests and CI

From the repository root, run:

```sh
node --test tools/data-qa/offline-review/*.spec.mjs
```

The dedicated `.github/workflows/p15l-offline-review.yml` job uses Node 22,
checks JavaScript syntax and runs the same tests. The new suite is intentionally
named `*.spec.mjs`, so it does not conflict with the root Vitest `*.test.ts`
discovery. This feature does not change dependency versions or the existing
root lint/test commands.

## Browser accessibility

The page uses native labelled inputs, a skip link, aria-live outcomes,
keyboard-accessible disclosure controls, visible focus outlines, a minimum
44-by-44-pixel target size, reduced-motion handling, and a responsive layout.
The local UI copy is available in English and French, with French spacing and
punctuation. The source data token `UNKNOWN` stays literal in both languages.
