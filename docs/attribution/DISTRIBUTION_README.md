# Attribution distribution-chain gate

This directory adds a local-only, source-to-asset-to-view distribution audit.
The manifest is explicit: each source identifies its provider, source and
licence URLs, permission state, evidence tier, acquisition and dataset dates,
terms review date, and required notice. Each asset records its declared source
IDs, dependencies, size, digest and inclusion status. Each publication view
records its used assets, declared sources, visible notices, locale, offline
status, input accessibility evidence and published date.

No source permissions, evidence quality, dates, or accessibility conditions
are inferred. An unknown value remains the literal `UNKNOWN`. Dataset dates
may be UNKNOWN and are displayed as informational, whereas included sources
with UNKNOWN permission, licence evidence, licence URLs, or terms dates block
publication. No provider approval or external access conditions are implied.

## Review locally

Open `docs/attribution/distribution.html` through a static file host that
publishes this directory and its modules and stylesheet. The browser interface
accepts a current JSON manifest and an optional previous manifest. It does
not send, retain or automatically synchronize selected files. Export actions
require an explicit user click. External legal pages are not fetched.

The interface supports English and French and uses a 44-pixel minimum target
on file controls, buttons and links. It includes skip navigation, semantic
landmarks, live status announcements, keyboard focus and reduced-motion CSS.
Automated source tests are not a replacement for manual assistive-technology
and contrast assessment of the deployed site.

## Versioned manifest

The schema string is `attribution-distribution/1`. Root fields are exactly
`schema`, `releaseId`, `sources`, `assets` and `views`. Each reference ID must
be stable. The parser rejects unrecognized keys, unsafe URLs, path traversal,
duplicate IDs or paths, malformed dates and oversized input files. Asset
byte counts and digests must be explicit or `UNKNOWN`.

The graph audit follows all transitive asset dependencies. A view must declare
all sources used by its reachable assets, and it must not claim an unrelated
source. The audit blocks missing or held dependencies, circular references,
unsafe public notices, absent licence evidence and install budgets above
4,141,875 bytes. A language-pair gate is available when both EN and FR views
are required for the publishing surface.

The OpenStreetMap map credit and ODbL licence are distinct. The Metrolinx
GTFS Access and Use Agreement section 3 legend and applicable-law lines are
independent of the Open Government Licence notice; these notices may not be
substituted for one another. LTC notices follow the selected language.
The existing `attribution-utils.mjs` supplies the authoritative legal strings.
This package does not create a second provider catalogue.

## Explicit command-line gate

```sh
node docs/attribution/distribution-cli.mjs current.json --lang fr --format text
node docs/attribution/distribution-cli.mjs current.json --before previous.json --format html
node docs/attribution/distribution-cli.mjs current.json --require-pairs --format json
```

The CLI accepts local files only and does not write release manifests or
schedule work. The exit status **0** means no blocking evidence findings,
**1** means the candidate is blocked or has a material regression, and
**2** means invalid input or an unreadable file. Reports are written only
to stdout and include individual source/licence/date/tier records, affected
views, installation bytes and findings. The HTML export is self-contained.

## Regression tests

```sh
node --test docs/attribution/distribution-*.test.mjs
```

Current root `npm test` already discovers `docs/attribution/*.test.mjs`, so
no package script or lockfile change is required. The tests exercise strict
parsing, source-to-view closure, missing and cyclical dependencies, OSM/ODbL,
Metrolinx AUA/OGL and LTC notice selection, permissions, UNKNOWN preservation,
EN/FR text, blocked changes, CLI process exit codes, live-page file wiring,
and local import closure. The gate is metadata-only and cannot establish
actual conditions at a place, route or service.
