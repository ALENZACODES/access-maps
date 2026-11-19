# Offline attribution placement register

The directly loadable `obligation.html` route records which source-credit and
licence notices appear on each publication page. It uses `obligation-route.mjs` (via `obligation-index.mjs`)
and `obligation.css`, with the same parsing and auditing modules as the local
CLI. It does not fetch external data or retain files unless a person chooses
an explicit download. The directory must be published by the host for the
route to become reachable; this module does not change an unknown SPA router.

The contract `attribution-obligation-register/1` contains four arrays:
`sources`, `pages`, `placements` and `witnesses`. A source has a licence name
and URL, permission state, acquisition date, dataset date, terms-review date,
and evidence tier. A page records its language, source IDs, offline and keyboard
evidence, screen-reader labelling and minimum touch-target dimensions. A
placement records the exact displayed notice, element ID, notice type,
visibility, map adjacency and linked witnesses. Witnesses identify recorded
evidence with a source ID, date, URL and evidence tier. `UNKNOWN` remains
explicit; absent information is not filled in from the provider name or clock.

The gate uses the existing `attribution-utils.mjs` legal-notice catalogue.
OSM map credit and ODbL conditions are separate placements. Metrolinx GTFS
AUA section 3 and applicable-laws notices are separate from the OGL line.
LTC retains a source-specific notice. Other providers require explicit
open-licence evidence; no provider name alone establishes rights. Included
records must have permission, terms evidence and visible notice placements.
The audit does not establish actual physical access conditions or grant rights
under an external licence.

## Offline use

Serve the complete `docs/attribution/` folder and open `obligation.html`.
Choose a local current JSON register and, optionally, an earlier register.
Use the language selector for English or French. The explicit companion-page
checkbox activates an EN/FR pairing audit when the route naming is suitable.
The file selector does not send information to a server. HTML, text and JSON
report downloads are assembled on-device. The HTML report includes a strict
CSP, skip link, headings and 44 px link targets. The route provides labelled
44 px controls, visible keyboard focus, a live status region, small-screen
layout, high-contrast treatment and reduced-motion support. Source licences
and linked evidence must still be assessed by the release operator.

## Command line

```sh
node docs/attribution/obligation-cli.mjs current.json --lang fr --format text
node docs/attribution/obligation-cli.mjs current.json --before earlier.json --format json
node docs/attribution/obligation-cli.mjs current.json --require-pairs --format html
```

Exit **0** means no blocking findings for the supplied records. Exit **1**
means publication is blocked by the current audit or a release regression.
Exit **2** means the JSON, local file or options were invalid. The CLI accepts
only regular local files within the bounded document size. There is no
background job, network request or scheduled process.

Run the tests with the already configured root command:

```sh
node --test docs/attribution/*.test.mjs
```

The suite covers strict inputs, the provider notice variants, missing rights,
source/placement/witness relationships, unknown values, target dimensions,
release comparisons, bilingual report escaping, CLI process exits, and every
file imported or read by the tests. It does not replace manual browser,
keyboard, screen-reader or contrast testing in the deployed application.
