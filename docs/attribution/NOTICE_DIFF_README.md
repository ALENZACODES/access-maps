# Attribution notice change inspector

This directory supplies a directly loadable offline page and an explicit
command-line audit for attribution notices displayed across publication
surfaces. Both run against locally supplied JSON. Neither requests remote
provider feeds, guesses evidence dates, changes account settings, or schedules
work. No files are persisted unless a person chooses an export in the page.

The single public catalogue is the existing `attribution-utils.mjs`. It
provides the OSM map credit, separate ODbL text, Metrolinx section 3 AUA
legend and applicable-laws lines, separate Metrolinx OGL line, and the
London Transit Commission notices. No provider name establishes rights to a
dataset; source permissions and licence records must be explicitly supplied.

## Data contract

`attribution-notice-diff/1` has `releaseId`, `sources`, `notices`, and
`surfaces`. Every source records a source URL, licence URL, licence family,
permission, licence evidence, evidence tier, acquisition date, dataset date,
terms-review date, and inclusion state. Every notice records its source ID,
text, language, visible state, proximity to a map, terms URL, and recorded
date. Every publication surface records its route, language, mode, source
and notice IDs, offline, keyboard and screen-reader evidence, target size,
and publication date.

Use the literal `UNKNOWN` when a fact was not supplied. The parser neither
supplies the current date nor substitutes a favourable value. Sources marked
`held` or `excluded` cannot support an included publication surface. OSM
map credit must be beside the map. The ODbL statement is independently
required. Metrolinx AUA and OGL notices are assessed according to the
recorded licence family and must not be mixed by assumption. LTC notice
selection is language-specific.

The release audit checks missing origin and rights, unsupported notice
visibility, licence compatibility, source-to-surface links, 44 px targets,
keyboard and screen-reader metadata, and explicit offline status.
The comparison audit detects removed evidence, lost permissions, changed
licences or terms, removed surfaces, and regressions in control dimensions.
Passing this metadata audit does not establish accessible conditions in
physical places or meet every browser and assistive-technology criterion.

## Local CLI

```sh
node docs/attribution/notice-diff-cli.mjs release.json --lang fr --format text
node docs/attribution/notice-diff-cli.mjs release.json --before earlier.json --format json
node docs/attribution/notice-diff-cli.mjs release.json --today 2026-11-19 --require-pairs
```

Status 0 means no blocking issue under the selected rules. Status 1 means
publication would be blocked, and status 2 means input or command error.
The command emits HTML, JSON or text to standard output only. It performs
no writes, network calls, background tasks, or external lookups.

## Offline page

Serve `docs/attribution/notice-diff.html` with its sibling CSS and ES
modules. The page reads JSON using a local file selector. It can compare
an optional earlier release and export HTML, JSON, or plain text on request.
It has a skip link, semantic landmarks, polite status announcements, labelled
controls, visible focus, reduced-motion styles, and 44 px control minimums.
French labels use U+00A0 before the colon and keep the literal `UNKNOWN`.
External source links in reports are shown as text, not fetched or loaded.

## Tests

Run:

```sh
node --test docs/attribution/notice-diff-*.test.mjs
```

The existing root `npm test` includes `node --test docs/attribution/*.test.mjs`.
The tests exercise the same executable modules used by the page and CLI.
They cover strict parsing, rights, language, legal notices, release changes,
output escaping, process exit codes, and actual page/file import wiring.
The test suite must be run with all local files and the pre-existing
`attribution-utils.mjs` present. No changes to `package.json` are required.
