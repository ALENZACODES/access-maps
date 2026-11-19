# Manual source and licence checkpoint

This is a local-only publication checkpoint. It takes an explicitly supplied
JSON record, checks whether its source rights, licence links, dates, recorded
attribution and decision evidence are sufficient for the intended release,
and renders English and French findings. It never fetches a provider feed,
saves a file automatically, fills an absent date, or infers access conditions.

The JSON schema is `attribution-checkpoint/1`. A release contains `releaseId`,
`comparisonDate`, `sources`, and `surfaces`. Each source records a source URL,
licence name and URL, evidence URL and tier, terms/acquisition/dataset dates,
explicit publication permission, editorial decision, decision reason, date,
notice and publication state. The value `UNKNOWN` remains literal.

Every surface links source IDs and records an explicit display mode, locale, offline, keyboard, screen
reader, map-credit, publication-date and minimum-target evidence. An included
source without a recorded `YES` permission, accepted decision, supporting
references or notice blocks publication. A missing dataset date is reported
as UNKNOWN rather than assigned a date. An unknown accessibility dimension
or target under 44 pixels blocks the surface. Provider-specific legal notices
must come from the authoritative catalogue already merged in the application;
this checkpoint does not create a second provider catalogue.

## Offline browser

Publish `checkpoint.html`, `checkpoint-route.mjs`, `checkpoint-core.mjs`,
`checkpoint-audit.mjs`, `checkpoint-report.mjs`, and `checkpoint.css` together.
The page reads selected JSON files in memory; only explicit download buttons
create local reports. External scripts, tile servers, file uploads and
background polling are not used. A local static host may be required for
module loading. Provide a previously recorded release to see regressions.

## CLI

```sh
node docs/attribution/checkpoint-cli.mjs checkpoint.json --lang fr --format text
node docs/attribution/checkpoint-cli.mjs checkpoint.json --before old.json --format json
node docs/attribution/checkpoint-cli.mjs checkpoint.json --format html
```

Exit status 0 means no blocking findings in the supplied records, 1 means a
release blocker or regression, and 2 means malformed input or an unreadable
file. The comparison date is input data, not the system clock. There is no
scheduled or background operation.

## Tests

```sh
node --test docs/attribution/checkpoint-*.test.mjs
```

The current-main root `npm test` command already discovers all
`docs/attribution/*.test.mjs` files. No lockfile changes are required.
The test suite includes missing-file and CLI-process checks to prevent
accidental dependencies on compiled entry points or missing documentation.
The included `REFERENCE_PACK_README.md` repairs the missing static file read
by the existing reference-pack wiring test on PR #89.
