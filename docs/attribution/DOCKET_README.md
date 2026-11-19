# Offline licence evidence recheck docket

This is an explicit, operator-run review of attribution records. The release
package uses `attribution-recheck-docket/1` and holds source metadata, exact
licence references, dates, review due dates, evidence tiers and explicit
publication decisions. The program does not infer licences, dataset dates,
permission, accessibility or freshness from provider names. `UNKNOWN` remains
`UNKNOWN` wherever no source record establishes the field.

The new source and decision records are separate from the existing provenance
and release inventories. They **do not replace** the existing release gates.
Use the docket to document evidence that reviewers may need to inspect, not
to establish the conditions of a location or service. All decisions are scoped
to the supplied release and may require re-examination if rights or source
terms change.

## Local browser page

Publish `docs/attribution/docket.html` with `docket.css`, `docket-route.mjs`,
`docket-core.mjs`, `docket-audit.mjs`, `docket-change.mjs`, `docket-report.mjs`,
and the existing `attribution-utils.mjs` from main. Open the local page, choose
a current JSON file and optionally an earlier one, and select English or French.
No file is automatically saved or transmitted. Export buttons activate only
after an accepted import. All source or licence links are explicit user actions.
The page has a restrictive CSP, labelled controls, a skip link, a live status
region and 44-pixel minimum control sizes. Automated source tests supplement,
but do not replace, keyboard and assistive-technology assessment.

## Command line

```sh
node docs/attribution/docket-cli.mjs release.json --lang fr --format text
node docs/attribution/docket-cli.mjs release.json --before previous.json --format json
node docs/attribution/docket-cli.mjs release.json --as-of 2026-11-19 --format html
```

The CLI reads only local, bounded JSON. It does not write files, consult a
network or schedule future activity. An explicit `--as-of` changes the audit
reference date; otherwise the date must come from the supplied docket. A
record whose recheck date has passed blocks publication only as a conclusion
about the supplied metadata. Exit 0 means no blocking evidence gaps, exit 1
means at least one block, and exit 2 means invalid arguments or input.

The source audit uses the existing `attribution-utils.mjs` for the OSM map
credit and ODbL terms, the distinct Metrolinx AUA legend and applicable-laws
lines versus the OGL statement, and LTC source terms. This work does not ship
provider datasets, claim endorsement, or infer permission from a source label.
Other sources require a specifically named open licence and evidence URL.

## Test discovery and dependencies

```sh
node --test docs/attribution/docket-*.test.mjs
```

The root `npm test` command already discovers
`node --test docs/attribution/*.test.mjs`; no package script, lockfile or CI
workflow change is required. Each executable module and test is delivered
under its exact repository path. Only `attribution-utils.mjs` is imported
from existing main. Missing documentation, CSS, route or module files are
checked by the integration test, which fails on absent paths.
