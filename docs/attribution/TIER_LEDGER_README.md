# Per-record attribution evidence tiers

The independent `tier.html` route reads a local JSON file and can be included in
an offline deployment by shipping its referenced CSS and ES modules. It uses
the existing `attribution-utils.mjs` catalogue for OSM, Metrolinx and LTC
notices. It does not create a competing source catalogue, ingest external data,
query map tiles, or save a file unless a person selects an export action.

The contract `attribution-tier-ledger/1` requires a `release`, `records` and
`surfaces` array. Every record carries its source and licence URL, actual
licence name, dataset/acquisition/terms dates, evidence tier (`primary`,
`secondary`, `community`, or `UNKNOWN`), permission state, attribution, evidence
URL and publication state. The category labels are descriptions of the recorded
evidence, **not** an assessment of an organisation or of access conditions.

Each surface links specific record IDs to a display type, language, offline
state, map-credit evidence, keyboard and labelling evidence, minimum target
size, and publication date. All unknown facts must be represented as `UNKNOWN`,
not blank dates or favourable defaults. Included records must have recorded
source and licence links, permission and attribution. OSM map credit is distinct
from ODbL terms. Metrolinx GTFS AUA legends and applicable-law lines are
separate from its OGL notice and must not be combined for a feed without
corresponding evidence. LTC terms are preserved. No provider status is inferred
from a provider name.

The gate produces blocking findings and nonblocking attention items. Its report
is a check of supplied metadata, **not** a claim of accessibility conformance
or a replacement for a deployment-specific accessibility review.

## Local use

Open `docs/attribution/tier.html` through a static host that publishes the
`docs/attribution/` directory. Select current and optional previous JSON files.
The controls generate a report in the browser without uploads. Run the same
checks from a terminal:

```sh
node docs/attribution/tier-cli.mjs release.json --lang fr --format text
node docs/attribution/tier-cli.mjs release.json --before earlier.json --format json
```

Exit status **0** means no blocking findings under these rules, **1** means a
release block, and **2** means an invalid input or local read error. No clock
is consulted unless `--date YYYY-MM-DD` is explicitly supplied. Neither the
route nor the CLI writes release records or schedules recurring activity.

`node --test docs/attribution/*.test.mjs` already runs through root `npm test`
on current main. The `tier-*.test.mjs` suites exercise the actual parser,
auditor, report and CLI modules and check route wiring. Review the generated
HTML manually with assistive technologies before deployment.
