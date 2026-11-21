# P18 — Bilingual attribution parity inspector

This is a directly loadable, offline-capable EN/FR publication tool for human-reviewed English/French map-notice pairs. It is not a map of actual accessibility conditions, does not establish a redistribution grant, and does not certify accessibility conformance. No provider, city or organization is associated with the App by virtue of inclusion.

## Working model

- `parity.html` loads `parity-route.mjs`, which imports the local parser (`parity-core.mjs`), gap audit (`parity-audit.mjs`), bilingual copy and export formatters (`parity-copy.mjs`), and the **existing merged** `trace-core.mjs`. Every JavaScript import is included in the package. `index.html` is the complete current-main homepage with a single additional stylesheet and EN/FR links; the placement, trace, observation, and conflict links and exact #114 conflict wording remain intact.
- Users first choose a strictly parsed `map-notice-trace/1` JSON file (same schema as the merged Trace Explorer). They then explicitly select an English and French surface, creating a separately saved `attribution-locale-pairs/1` register. The App never guesses that two routes or labels represent translations of one another.
- A pair records manual review date, evidence tier, an optional HTTPS evidence address, a three-state observation and publication state. UNKNOWN remains UNKNOWN, including absent acquisition or inspection dates. New pairs start as `draft` with UNKNOWN evidence.
- The fail-closed publication audit checks only actually *included* layers for source coverage, required credits, adjacent OSM credit where ODbL geometry is used, observation and interaction records, and 44px target records. Included pair review evidence is checked separately. Pairing does not establish a source licence or permission.
- The editor displays unpaired views and all audit findings, with a pair filter. Explicit local exports produce register JSON, bilingual text and spreadsheet-safe TSV. No provider feeds, tile requests, analytics, network calls, timers, cookies, `localStorage`, service worker or scheduled workflows are introduced.
- An explicit local command-line audit provides exit `0` for a non-blocking report, `1` for blocking evidence gaps, and `2` for malformed input/arguments. This is not automatically attached to CI. A genuine release must provide its actual trace and pair-register files and include hands-on keyboard, switch, screen-reader, touch and contrast review.

## Files

- `parity-core.mjs`: bounded strict import, versioned schema, explicit pair contract, mutation and reference checking.
- `parity-audit.mjs`: source coverage and notice placement audit, before/after comparisons.
- `parity-copy.mjs`: English/French interface text, semantic finding messages, safe exports.
- `parity-route.mjs`, `parity.html`, `parity.css`, `parity-link.css`: offline user-facing editor and homepage link.
- `parity-cli.mjs`: optional human-invoked local release audit.
- `parity-fixture.mjs`: fictional-only deterministic records.
- `parity-*.test.mjs`: strict parser, audit, CLI and wiring checks.
- `trace-core.mjs`: complete unchanged existing main dependency for a self-contained overlay package.
- `index.html`: complete replacement of merged main homepage with only the new links/CSS added.

Tests are picked up by the existing root `node --test docs/attribution/*.test.mjs` glob. No root scripts or check-install-budget.ts are edited. No budgets, thresholds, retries or timeouts are changed.

## Operational limits

The audit compares a shared source ID recorded in both selected surfaces, not automatically inferred equivalence of separate source IDs or geometries. A warning about missing observations is not evidence that the destination is inaccessible. The test fixtures are synthetic and are never published as accessibility facts about real places. Static/Node checks cannot establish WCAG 2.2 AA or axe-zero on deployed pages; those require genuine browser and assistive-technology review.
