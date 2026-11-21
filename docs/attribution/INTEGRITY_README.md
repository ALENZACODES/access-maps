# P18 — Local source file integrity

This is an offline, user-facing tool for reconciling **locally selected file bytes** with an explicit source/licence manifest. It is separate from the attribution placement planner, notice trace explorer, observation journal, conflict review, bilingual parity tool, dependency inspector and notice bundle composer. It does not make a claim about a place, operator, legal right, or WCAG conformance.

## Routes and files

- `integrity.html` is the directly loadable EN/FR static page (`?lang=en` or `?lang=fr`). It loads `integrity.css` and `integrity-route.mjs` from the same directory. The root `index.html` adds two language links plus `integrity-link.css`, preserving the existing source-and-licence links.
- `integrity-core.mjs` owns the strict `map-source-file-integrity/1` register schema, mutations, cross-reference checks, and UNKNOWN preservation.
- `integrity-hash.mjs` computes SHA-256 using the browser Web Crypto API after a person chooses a file and presses the calculation control. It rejects files larger than 50 MiB. It returns a digest and length, **never file bytes**.
- `integrity-audit.mjs` checks included assets, required source metadata, observed notice text/placement, explicit human keyboard/screen-reader/touch/visual observations, matching hashes and lengths, conflicting measurements, and release regressions. A digest match cannot establish a right to distribute, that information is up-to-date, or that a place is accessible.
- `integrity-report.mjs` produces JSON, bilingual text, TSV with spreadsheet-formula neutralization, comparison and source-impact reports, and a standalone script-free review HTML document.
- `integrity-cli.mjs` accepts an explicitly supplied register file and optional previous register, exits 0 for no blocking evidence gaps, 1 for gaps/regressions, and 2 for malformed input or write failures.
- `integrity-copy.mjs` contains distinct EN/FR interface copy, with U+00A0 before French label colons. Legal/source credit text is printed as entered, not translated by the tool.

## Workflow

1. Import a local JSON register or start with a blank one. Enter a source, its **source HTTPS address**, licence and licence address, retrieval date (or `UNKNOWN`), evidence tier, exact credit and distribution permission (`yes`, `no` or `UNKNOWN`). A known licence label does not imply permission.
2. Add an asset, its type, a local display route, linked source IDs, expected file name, byte count and SHA-256. Begin in `draft`; only an explicit `included` asset enters release checks.
3. For each included asset/source pair, record observations for `visual`, `keyboard`, `screen-reader` and `touch`. Include the literal notice text, its location, observation date, licence availability and relevant input evidence. For ODbL-sourced basemap, geometry and overlay assets the credit must be recorded beside the map, exactly `© OpenStreetMap contributors`.
4. Select an asset and a file from your device, then calculate the digest locally. This does not change the register. Explicitly choose **Record measured values** to open a new measurement editor. Enter the date and supporting notes yourself; the tool does not read a clock to infer a date.
5. Review blocking gaps and missing observation slots, compare an earlier register if desired, and export local text, TSV, JSON or standalone HTML. A report with zero blocking gaps is still a human evidence record, not a legal or accessibility certification.

The browser page neither calls a network service nor uses `localStorage`, `IndexedDB`, cookies or background timers. Imports replace the in-memory register only after the complete schema is accepted. It sends nothing to an agency, a map provider or an online service. Downloading an export is an explicit user action.

## Data shape

```json
{
  "schema": "map-source-file-integrity/1",
  "title": "Local source file integrity",
  "sources": [],
  "assets": [],
  "checks": [],
  "measurements": []
}
```

The four record types have exact allowed fields. Unknown fields, duplicate identifiers, duplicate observation method slots, unsupported schema versions, invalid dates, unsafe external URL schemes, conflicting references, oversized imports, and malformed hashes are rejected. A digest is a lowercase 64-character SHA-256 hex string or `UNKNOWN`. A byte length, observation date, licence, credit, evidence tier, and file status remain explicit. A parser never fills in missing evidence from provider names.

## Standalone local checks

```sh
node --test docs/attribution/integrity-*.test.mjs
node --check docs/attribution/integrity-route.mjs
node docs/attribution/integrity-cli.mjs path/to/local-register.json --format text --lang fr
node docs/attribution/integrity-cli.mjs path/to/local-register.json --format html --output local-review.html
node docs/attribution/integrity-cli.mjs current.json --previous earlier.json --format json
```

The root `npm test` on `access-maps` already discovers `docs/attribution/*.test.mjs`; no scripts, lockfiles, scheduled workflows, install-budget files, thresholds, retries, or CI timeouts are changed. The added feature is in `docs/attribution`, not in the PWA's install/precache payload. A host deploying the static attribution directory must publish the new HTML/CSS/JS beside the existing pages. New tests run the same pure audit/export modules and CLI used by the UI.

Static and unit tests cannot establish browser accessibility conformance. Before release, conduct independent keyboard, switch, high-contrast, zoom, screen-reader, touch and axe checks in both languages. Do not interpret a recorded observation as verified real-world accessibility.
