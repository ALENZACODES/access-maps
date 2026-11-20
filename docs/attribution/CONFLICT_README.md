# P18 Attribution Conflict Review

This standalone local page is a user-facing register for **disagreements in displayed map source notices**. It does not inspect a place or determine whether a data publisher has given reuse permission. A reviewer chooses a JSON file or adds records deliberately. No provider feed or personally identifying record is bundled. Opening the page does not fetch resources or persist user data. The page supports English/French, an explicit 44-pixel control minimum, visible keyboard focus and a polite status announcement. Manual screen-reader, touch and contrast evaluation remains necessary.

## User flow

1. Open `docs/attribution/conflict.html?lang=en` or `?lang=fr`, linked from the existing attribution index alongside both merged P18 pages.
2. Import a local conflict register, or begin with an empty register. Only complete, schema-valid documents replace session data. The importer does not transmit files.
3. Select an item and edit its scope (view, map layer, source), the original and proposed credit or terms, the source evidence URL, licence, retrieval date, tier, priority and decision. Unknown information remains the literal `UNKNOWN`.
4. The evidence-gap list explains missing source records, missing evidence dates, unresolved items, duplicate-scoped records, absent OpenStreetMap credit and other recorded gaps. It is a review aid, not an accessibility or legal compliance determination.
5. An optional earlier local register produces a before/after field comparison. Removed records, reopened decisions and known evidence changed to `UNKNOWN` are flagged as regressions.
6. Export JSON, a bilingual text report or a spreadsheet-safe TSV. Nothing is automatically submitted, uploaded, or saved in browser storage.

## Data contract

`map-attribution-conflicts/1` includes a `title` and up to 500 `conflicts`. Every conflict contains an identifier, surface/layer/source IDs, category, current and proposed values, source HTTPS evidence, licence, retrieval date, evidence tier, reviewer reason, severity, decision, review date and note. All fields are required; when unrecorded their value is `UNKNOWN` rather than a fictional date or licence. The parser bounds total encoded JSON bytes to 1 MiB, checks ISO calendar dates, constrains identifiers and field lengths, rejects extra keys, unsafe URLs and duplicate IDs, and returns a fresh copy. No personal data field exists. Input files with errors leave the in-memory register unchanged.

The OSM credit is always literally **© OpenStreetMap contributors**. A proposed OSM credit missing that exact text produces a blocking finding; a map credit recorded as details-only is flagged. The reviewer must assess actual attribution and rights before publication. GO/UP and LTC sources may be recorded when evidence is supplied, but none is assumed or preloaded. MiWay is excluded. The review is not a provider endorsement.

`conflict-core.mjs`: strict browser/Node parser, edits, filtering and duplicate detection.

`conflict-audit.mjs`: evidence gap classification, source aggregates and before/after regression detection.

`conflict-copy.mjs`: bilingual copy and deterministic text/TSV reports, with French U+00A0 before every generated colon.

`conflict-route.mjs`, `conflict.html`, `conflict.css`, `conflict-link.css`: directly loadable offline interface and entry-page links. The page CSP disallows network requests and disallows forms submitting anywhere.

`conflict-cli.mjs`: manually invoked local audit for real review documents. Usage: `node docs/attribution/conflict-cli.mjs candidate.json [baseline.json] [--fr] [--json]`. Exit 0 means the supplied register has at least one record with no blocking findings, no unresolved records and no baseline regression; exit 1 means review is blocked; exit 2 means invalid inputs/options. A code 0 is only the result of these record checks, not a statement of rights or accessibility.

`conflict-*.test.mjs` + `conflict-fixture.mjs`: Node's built-in test suites and fully fictional fixtures, automatically discovered by the existing root `npm test` glob. No package scripts, dependencies, CI workflows or cron actions are added.

## Local checks

Run `node --test docs/attribution/conflict-*.test.mjs` from a complete `access-maps` checkout. Each `.mjs` implementation file also supports `node --check`. Full repository lint, TypeScript, precache and accessible browser checks must be performed in a real checkout before deployment. The new static route must be published alongside its files by the host. No assertion that a host SPA serves `docs/attribution/` is made here.
