# Attribution coverage gate

`coverage.html` is a static, local-only EN/FR review screen. It loads
`coverage-route.mjs` and `coverage.css` from the same directory; route code
imports `coverage-core.mjs`, `coverage-audit.mjs`, `coverage-change.mjs`, and
`coverage-report.mjs`. The authoritative source notices remain in the merged
`attribution-utils.mjs`; this feature does not maintain a second catalogue.

A user selects a local JSON release register; an optional earlier register
produces a field-by-field regression report. Nothing is uploaded, fetched,
stored between sessions, or scheduled. The generated text, JSON, and HTML
exports are local. External source and licence URLs require explicit clicks.
For an offline deployment, publish this directory's HTML, CSS, and imported
JavaScript files together. The host SPA does not automatically mount the page.

A register uses `attribution-coverage/1`, containing a `releaseId`, `sources`,
and `views`. Each source identifies its actual provider, source URL, licence
URL, licence kind, recorded permission, evidence tier, acquisition date,
dataset date, terms-review date, attribution text, notes, and release state.
Each view records exact linked source IDs, language, view kind, offline,
keyboard and screen-reader evidence, map-credit evidence, minimum target size,
and publication date. The parser rejects extra fields, ambiguous IDs, bad
HTTPS URLs, invalid dates, and excessively large files. UNKNOWN is always
explicit; no provider label alone grants rights.

OSM credit and ODbL licence conditions are separate. For Metrolinx, the AUA
section 3 legend and both applicable-law lines are distinct from the OGL
notice. LTC terms are recorded independently. Unknown rights, missing notices,
missing source links, and failing target evidence block publication. Missing
dataset dates remain UNKNOWN and are reported rather than invented. The
audit does not establish conditions or accessibility at a physical location.

## Command line

```sh
node docs/attribution/coverage-cli.mjs candidate.json --lang fr --format text
node docs/attribution/coverage-cli.mjs candidate.json --previous before.json --format json
```

Exit codes are `0` (no blocking findings), `1` (blocked publication or
regression), and `2` (invalid input or failed local file read). This gate
is read-only. No new npm script or external service is needed.

## Tests

```sh
node --test docs/attribution/coverage-*.test.mjs
```

The current repository test script already runs `docs/attribution/*.test.mjs`.
Tests exercise the live parser, audit, comparison, report, CLI and browser
entry-point imports, including negative cases that must produce blocking
findings. These checks cannot substitute for keyboard, switch, screen-reader,
or contrast assessment in a deployed browser.
