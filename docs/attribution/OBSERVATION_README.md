# P18 — attribution observation journal

The **Attribution Observation Journal** adds a directly loadable, offline-capable
page at `docs/attribution/observation.html`. The main sources-and-licences page
links to it in English and French. The existing notice placement and trace
explorer navigation from merged maps #108/#109 is retained.

This is a human evidence collection tool. It makes no measurements of physical
accessibility at real places, does not inspect provider data, and does not grant
redistribution permission. No personal information is needed. Source, licence,
retrieval date and evidence tier are supplied explicitly by a person using the
journal; `UNKNOWN` is retained, rather than inferred from a provider name.

## Workflow

1. Open the local page and select English or French.
2. Add a source record with its actual source, licence, HTTPS links, retrieval
   date, evidence tier, credit and permission evidence. A source can be saved
   with `UNKNOWN` fields, but publication evidence gaps will remain blocking.
3. Add an explicit publication view (`map`, `list`, or `journey`) and identify
   the sources that actually appear in it. The view route is local to the App.
4. For each included view and source, use the missing-check queue to record
   four independent observations: visual, keyboard, screen reader, and touch.
   For each, enter what was actually observed, including the exact notice text,
   its placement, licence availability, legibility, and an evidence reference.
5. Read the findings list. It shows explicit missing/negative/unknown states
   and lets the person filter by view or search for a finding code.
6. Export the complete JSON journal, a plain-text findings report, or compare
   against a previously exported journal. These actions are manual, local and
   do not transmit files.

All views and records are held in volatile browser memory. Import replaces the
journal only after the whole JSON file passes strict validation. There is no
localStorage, analytics, background task, remote API, geolocation, microphone,
camera or service-worker registration. External source links are recorded as
text and are not opened automatically.

## Contract

Schema: `map-attribution-observations/1`. Fields are required and extra fields
are rejected. The journal supports at most 100 source records, 150 publication
views and 1,500 observations. Imported JSON has a 1 MiB limit. Identifiers are
restricted to stable ASCII slugs; dates are valid ISO calendar dates or the
literal `UNKNOWN`. Licence/source URLs must be HTTPS without credentials,
nonstandard ports, fragments or local/private IPv4 hostnames. These URL checks
are a local input safeguard, **not** a licence determination.

The `permission` field records an evidence assertion made by the person entering
the data. It is not inferred from a source name. The gate blocks an included
view if permission is `no` or `UNKNOWN` and if a source has an unknown licence,
source URL, licence URL, retrieval date, or tier. The gate additionally requires
all four interaction methods to have explicit observation records, and blocks
when credit or licence is absent, the notice is not legible, required evidence
is unknown, or the recorded touch control size is below 44 CSS pixels.

OpenStreetMap map views require the exact
`© OpenStreetMap contributors` credit, as well as observation records that
place it beside the map. This credit is separate from the ODbL terms.
Metrolinx and LTC records are **not** assigned rights or legal notice wording
by this tool. The specific source's rights, attribution text and dates must be
entered explicitly, with no assumptions about GO Transit, UP Express or LTC.
MiWay is not introduced. The journal does not copy provider data into another
licence silo.

## Manual release gate

The audit functions run in both the browser and the explicit operator CLI.
For example:

```sh
node docs/attribution/observation-cli.mjs journal.json --language fr
node docs/attribution/observation-cli.mjs journal.json --format json --output findings.json
node docs/attribution/observation-cli.mjs current.json --before earlier.json
```

Exit 0: no blocking gaps in supplied included views and at least one included
view. Exit 1: blocking evidence gaps, zero included views, or removed included
views in a comparison. Exit 2: invalid input, arguments, or read/write failure.
A passing metadata audit **does not prove** legal rights, content accuracy or
WCAG 2.2 AA conformance. Human review on real devices and assistive technology
remains necessary. Release gates should not be described as independent
endorsement, third-party review, or certification.

## Code organization

- `observation-core.mjs`: bounded strict schema, safe dates/links/routes,
  immutable edits, explicit UNKNOWN defaults and serialization.
- `observation-audit.mjs`: deterministic evidence gap checking, missing-slot
  queue, sorted findings, before/after comparison and bilingual text report.
- `observation-copy.mjs`: paired EN/FR interface text and language selection.
- `observation-route.mjs`: standalone accessible editor and manual file actions.
- `observation.html`: CSP-restricted entry point with bilingual no-script text.
- `observation.css`: responsive layout, minimum 44px controls, visible focus,
  reduced-motion and print support.
- `observation-cli.mjs`: explicit operator-run offline audit and comparison.
- `observation.test.mjs` and `observation-cli.test.mjs`: Node built-in tests;
  the existing root glob `docs/attribution/*.test.mjs` includes both.

No new npm dependency, runtime service, build tool, scheduled workflow or
repository job is required for the additional static route. The static host
must serve the new files in `docs/attribution/` for the page to be reachable.
The root project's browser, strict typecheck and precache checks must also be
run on a complete checkout before release; the standalone Node tests do not
replace those gates.

## Coverage table

The editor provides an explicit **Export coverage table (TSV)** action. The
matrix lists all four observation methods for every source recorded by every
publication view, including views not marked for inclusion. Each row keeps
source, licence, retrieval date, evidence tier, observation dates, displayed
credit results, placement, evidence references, and blocking issue count.
Rows are labelled `missing`, `gap`, `recorded`, or `not-included`, not scored
as accessibility outcomes. Filtering helpers support view, source, method and
state. TSV values are quoted, doubled where necessary, and neutralized when
leading spreadsheet-formula characters could be interpreted as executable
spreadsheet formulas. No opening of spreadsheet software is required to use
or export the table.
