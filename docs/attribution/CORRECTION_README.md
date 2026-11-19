# Local attribution correction register

The standalone `correction.html` page and `correction-cli.mjs` review correction
records against explicit source, licence, date, permission and publication
surface metadata. Neither entry point fetches remote resources or creates
scheduled tasks. A browser file selection remains in memory until the page is
closed, unless the person explicitly chooses a report export.

The input contract `attribution-corrections/1` contains sources, evidence,
cases, publication surfaces and an explicit EN/FR pairing requirement. Every
source identifies its provider, licence, source and licence URLs, acquisition
and dataset dates, terms-review date, permission, tier and notice. Cases record
the original text, proposed text, related evidence, state, disposition, date,
locale and rationale. `UNKNOWN` is preserved and is not silently replaced.

An included source with an unresolved correction blocks release. An accepted
case needs explicit permission, supporting records, a proposed replacement,
and a dated decision. Each publication surface must link the relevant cases
and source records. Included provider records require the notices applicable
to their specific licence; OSM source credit is separate from ODbL terms.
Metrolinx AUA terms are not conflated with its OGL terms. The existing
`attribution-utils.mjs` provides the authoritative notice constants.

The audit checks declared keyboard, screen-reader and touch-target evidence,
including the 44px minimum. A passing metadata audit does not establish the
actual accessibility of a place, route or deployed interface. Test the
rendered page with keyboard, touch, switch and assistive technology.

## Local commands

```sh
node docs/attribution/correction-cli.mjs release.json --lang fr --format text
node docs/attribution/correction-cli.mjs release.json --before prior.json --format html
node --test docs/attribution/correction-*.test.mjs
```

CLI status `0` means the supplied records have no blocking findings, `1`
means blocked, and `2` means malformed input or arguments. The process prints
reports to stdout and never writes files. No system date is consulted unless
`--date YYYY-MM-DD` is specified explicitly.

The existing root `npm test` discovers all `*.test.mjs` files under
`docs/attribution/`. Include this directory and its local dependencies in
an offline distribution if the standalone page is required. No application
router outside this scope is changed.
