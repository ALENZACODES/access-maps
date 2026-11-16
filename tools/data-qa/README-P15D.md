# P15D: offline release, interface and dependency gates

Three checks run from `p15d-cli.ts`. The existing on-push data QA CI job
runs all P15D regressions and checks the new CLI entry point. The tooling
runs locally without network requests or scheduled tasks. All errors block
export; notices are informational. A pass means these specified checks ran,
not that an interface meets every accessibility criterion.

## Release comparison

```sh
node tools/data-qa/p15d-cli.ts compare \
  --before ./previous/manifest.json --after ./current/manifest.json \
  --policy ./qa-policy.json --format fr --output ./release-report.txt
```

The JSON policy must specify `asOf`, `maxAgeDays`,
`maxLossOfPresentCells`, `maxUnexplainedAssetRemoval`, and `maxBytes`.
Optional arrays `allowRemovedRegionIds` and `allowRemovedCellKeys` name
planned retirements; cell keys are `regionId/cellId`. The release gate rejects
lost known cells, missing coverage cells, absent source lineage, held feeds,
ODbL crossing, older replacements and byte-budget violations. Allowances do
not suppress UNKNOWN regressions. Release comparison reports coverage presence,
not actual accessible routes, venues, or amenities. Run P15C content-hash
and licence checks on each release before relying on comparison findings.

## Offline shell audit

```sh
node tools/data-qa/p15d-cli.ts pages --input ./pages-input.json --format en
```

The input is a JSON array of `{ "file": "en.html", "html": "..." }` objects,
optionally including `maxBytes`. Include both English and French documents.
The static gate checks language links, landmarks, skip links, labels, names,
explicit 44px targets, visible focus rules, local-only resources, and the
source/licence/observation metadata. Dates use `YYYY-MM-DD`. Pages must include
`UNKNOWN` rather than implying access when source information is missing.
The static heuristics can miss layout-dependent problems; conduct keyboard,
switch, screen-reader and browser zoom tests on the running app as well.

## Local dependency closure

```sh
node tools/data-qa/p15d-cli.ts closure --input ./closure-input.json --format json
```

The input object has `root`, `entries`, `pagePaths`, `maxFileBytes`, and
`maxTotalBytes`. Each inventory entry declares `path`, `bytes`, `sha256` and
`mediaType` (HTML, CSS, JavaScript, JSON, SVG, PNG, JPEG, WebP or WOFF2).
The closure checker reads only files under `root`, rejecting symlinks, URL
schemes, absent paths, path escapes, changed digests, mismatched MIME types,
remote dependency URLs, nonliteral script imports and stylesheet cycles.
Entry HTML pages must reference every required local asset, directly or
transitively. It flags unreferenced files to help keep the offline package
small. All input paths are local; there is no tile server or URL fetch.

## Running tests

```sh
node --test tools/data-qa/p15d-release.test.ts \
  tools/data-qa/p15d-pages.test.ts \
  tools/data-qa/p15d-closure.test.ts \
  tools/data-qa/p15d-cli.test.ts
```

Node 24 is used in CI for native TypeScript execution. CLI outputs may be
`json`, `en` or `fr`. `--output` creates a new report and refuses overwrites.
Exit status `0` passes, `1` blocks export, `2` indicates invalid inputs or
local I/O problems. No report is uploaded. Every diagnostic includes English
and French, with French typographic punctuation used where applicable.
