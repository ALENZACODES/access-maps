# Offline Attribution Evidence Chain

This directory adds a directly-served English/French evidence-chain review route:
`chain.html`, `chain-route.mjs`, `chain.css`, and the bilingual link in the
existing `index.html`. The page does not connect to remote systems or store
records automatically. It accepts only files the reviewer selects and keeps the
working document in browser memory. JavaScript is required for the editor;
the HTML includes a no-script fallback with its purpose in both languages.

## What the tool does

The versioned `map-attribution-evidence-chain/1` document links five bounded
collections: source metadata, downloaded or derived assets, publication
surfaces, displayed source notices, and manually recorded custody receipts.
The source is *not* inferred from its name: licence, source/terms links,
retrieval date, tier, credit, permission state, and source ownership notes are
explicit fields. Asset SHA-256 and byte length can remain `UNKNOWN` but cause
blocking or caution findings if the asset is selected for publication.

The graph explains source → asset → notice → surface paths, asset parentage,
receipt parentage, and which publication surfaces depend on a particular
source. Cycles, broken references, repeated IDs, missing notices, missing
receipts, absent keyboard/focus/screen-reader observations, undersized targets,
and mispositioned OSM credit are reported. A publication view without recorded
credit is blocked, not silently assigned a provider or licence.

The reviewer may select a local file to calculate SHA-256 and compare its
recorded digest and byte length. This is only a byte-consistency check. It is
**not** a signature, an assertion of origin, redistribution permission, data
currency, or real-world accessibility. No file bytes are saved to the ledger
or transmitted. The reviewer may export the register, human-readable findings,
a spreadsheet-safe coverage matrix, or a self-contained, script-free HTML
summary. A handoff packet can be exported for a **selected publication view**;
it contains only the explicitly attached source, asset, notice and receipt
records, preserving any transitive parent assets.

## Data boundary and nonclaims

`UNKNOWN` remains `UNKNOWN`. A recorded `yes` for redistribution permission
still requires assessment of the actual feed terms. The interface never
claims a publisher, government, transit company or accessibility organization
supports the App. All test records are fictional, not places, routes or
services with asserted access characteristics. No medical or benefit
eligibility advice is present.

The exact OSM map-credit string is `© OpenStreetMap contributors`, kept
separate from licence text. The catalogue itself is not duplicated in this
feature: this ledger stores the **literal** credit supplied with a source and
compares that text with the exact credit where ODbL applies. No MiWay or
other unapproved dataset is supplied.

## Data contract and integrity

The parser rejects unknown keys, malformed ISO dates, unsupported enumerations,
invalid identifiers, non-public/unsafe URLs, unbounded arrays, repeated
source/asset/notice tuples, missing cross-collection references, and oversized
imports (maximum 1.5 MB of UTF-8 JSON). Graph traversal reports asset and
receipt cycles, rather than assuming a valid chain just because the record
IDs are present. The audit distinguishes `block`, `caution`, and `info`.
An empty chain does not constitute publication evidence.

The SHA-256 module uses Web Crypto. Its deterministic receipt Merkle root
commits to the selected receipt fields but is not an authentication mechanism:
without a trusted signature, a hash or Merkle root cannot establish who
created or approved the record. Exports exclude file contents and never
introduce secret tokens or personal identifiers. The separate optional
reviewer-reference field is text entered by the operator; do not include
personal information in a publication package.

## Local executable tests

The root `npm test` command already discovers `docs/attribution/*.test.mjs`.
The source/test package uses only standard ES modules and Node's built-in test
runner and Web Crypto; it adds no package dependency or lockfile changes.
Focused execution is `node --test docs/attribution/chain-*.test.mjs` from the
repository root. CLI usage is available through `node docs/attribution/chain-cli.mjs --help`.
The CLI returns status 0 for an evidence package with no blockers and no
blocking semantic regression, 1 for recorded blockers/regressions, and 2 for
invalid files, invalid arguments or an output write failure. This status
checks evidence only, never certifies accessibility or legal rights.

The page has skip navigation, a main landmark, labeled inputs, a polite status
region, visible focus outlines, reduced-motion styling and 44px minimum
controls. Manual EN/FR browser, assistive-technology and axe checks in the
actual deployed environment are still required; source tests alone cannot
establish WCAG 2.2 AA conformance.

## Integration boundary

The only pre-existing changed file in this package is
`docs/attribution/index.html`. It comes from merged maps main `158e2723` and
adds the `chain-link.css` stylesheet and a bilingual navigation block. Every
other file is new and contained within `docs/attribution`. The bundle includes
no scheduled workflows, keep-awake requests, polling, changes to installation
budgets, changes to timeouts, or disabled tests. It does not modify the
application's service-worker precache list. The host must publish the static
`docs/attribution/` directory for the page to be reachable.
