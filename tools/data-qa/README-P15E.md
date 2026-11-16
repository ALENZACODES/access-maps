# P15E — evidence, bilingual content and atomic offline updates

These four audit commands extend the existing `p15d-cli.ts` entry point. The
on-push CI job already runs `p15d-cli.test.ts`, which imports all P15E regression
suites. No network fetch, data harvesting, scheduled job or background update
is performed. Inputs and report outputs remain local files. An audit pass only
means the listed static conditions passed; keyboard, browser and assistive
technology testing remain essential.

## Observation history and publication decisions

```sh
node tools/data-qa/p15d-cli.ts evidence --input ./evidence.json --format fr
```

`evidence.json` contains `schemaVersion: 1`, `asOf`, `maxAgeDays`,
`observations[]`, and `decisions[]`. An observation declares `id`, `placeId`,
`feature` (`entrance`, `washroom`, `lift`, `parking`, `path`, `seating`),
`kind` (`OBSERVATION`, `CORRECTION`, `WITHDRAWAL`), `access` (`YES`, `NO`,
`UNKNOWN`), `recordedOn`, `reason`, `silo`, and `source` (`source`, `licence`,
`observedOn`, `reference`). Corrections and withdrawals name `supersedes`.
The source reference is a local relative path, not a remote URL. A decision
provides `placeId`, `feature`, `access`, `observationIds`, `silo`, and a source
stamp or `null`. Every observation must be accounted for by its decision.

The gate rejects inconsistent history, old/future dates, invalid or held
sources, absent licences, ODbL mixing, personal contact text, unmatched
source stamps, and unsupported access assertions. Conflicts and withdrawals
must lead to `UNKNOWN`; no access is inferred from missing information.
Reports are diagnostics; this tool does not decide if a location is suitable
for an individual.

## English/French offline text and control contract

```sh
node tools/data-qa/p15d-cli.ts locales --input ./locales.json --format en
```

`locales.json` contains `schemaVersion: 1`, `entries[]`, and `pages[]`.
Entries declare `key`, `kind`, `en`, `fr`, `placeholders`, and `context`.
Actions and links also declare `targetPx` (at least 44); links declare a
relative `href`. Pages declare unique `id`, separate `enPath`/`frPath`,
`keyRefs`, and `headingKey`, `skipKey`, `switchKey`, `statusKey`. The
`statusKey` must be `unknown`, with explicit `Unknown` and `Inconnu` text.
The audit rejects mismatched placeholders, incomplete language pairs,
unsafe markup, duplicated controls, remote links and unsafe claims.
French punctuation uses U+2019 apostrophes, U+00A0 before colons, and
U+202F before semicolons, exclamation/question marks and inside guillemets.
This static contract cannot measure final rendered sizes; keep browser
interaction tests alongside it.

## Dated bilingual source attribution

```sh
node tools/data-qa/p15d-cli.ts credits --input ./attribution.json --format fr
```

`attribution.json` contains `schemaVersion: 1`, `asOf`, `assets[]` and
`notices[]`. Each asset has `id`, `path`, `silo` and `sources[]`, where a
source contains `source`, `licence`, `observedOn` and a local `reference`.
Notices declare `id`, `assetIds`, bilingual `en`/`fr` credit text,
`licence` and `sourceReference`. Every asset/source pair must have matching
credit. The audit rejects missing and duplicated attributions, incorrect
source/licence claims, ODbL mixing, remote references, missing dates and
unsafe text. A missing source credit blocks the offline export.

## Atomic offline update consistency

```sh
node tools/data-qa/p15d-cli.ts updates --input ./plan.json --format json
```

`plan.json` specifies `schemaVersion: 1`, `asOf`, `maxBytes`, `maxAgeDays`,
`before` and `after` snapshots and `operations[]`. Snapshots contain
`revision`, `generatedOn` and `entries[]`. Entries declare `id`, `path`,
`sha256`, `bytes`, `silo`, `source`, `access`, `locale` (`en`, `fr`, or
`neutral`). Operations are `ADD`, `REPLACE` or `DELETE`, with `id`,
`reason`, an old digest for replacement/removal, and a full `next` entry
for additions/replacements. Every altered file must have exactly one
matching operation. Reports block silent removals, stale provenance,
unsafe paths, mismatched digests, excessive size, missing bilingual assets,
ODbL silo moves and access-state changes without newer source evidence.
The gate does not itself write files or perform the update.

All four commands output `json`, `en` or `fr`, with `--output` to create a
new local report. Exit codes are `0` for pass, `1` for blocking findings and
`2` for malformed input or file errors. To run directly:

```sh
node --test tools/data-qa/p15e-evidence.test.ts \
  tools/data-qa/p15e-locales.test.ts \
  tools/data-qa/p15e-updates.test.ts \
  tools/data-qa/p15e-attribution.test.ts \
  tools/data-qa/p15e-cli.test.ts
```
