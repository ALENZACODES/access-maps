# Attribution notice accessibility review

This offline workbench collects **manual observations about attribution notices themselves**. It does not assert the accessibility of a location, a service, or the surrounding application. It does not contact a provider, check a licence on the network, or assign a favourable state to missing evidence.

`access-review.html` is the directly loadable page; it imports `access-review-route.mjs`, which in turn imports the public `access-review-index.mjs` barrel. `access-review-core.mjs`, `access-review-audit.mjs`, `access-review-change.mjs`, and `access-review-report.mjs` provide the actual shared logic. The release gate reuses the already merged `attribution-utils.mjs` catalogue. No second catalogue is distributed.

## Contract

A local `attribution-access-review/1` JSON document contains a release ID, source records, and publication surfaces. Each included source has an ID, provider, explicit licence identifier, source and terms URLs, dataset/acquisition/terms dates, permission, evidence tier, notice text, and disposition. `UNKNOWN` remains `UNKNOWN`. A missing dataset date appears as an informational finding, whereas a missing source/terms date, permission, or licence identifier blocks inclusion.

Each included surface records its locale (`en` or `fr`), route, source IDs, offline status, and actual notice targets. Each notice target records its source, notice kind and exact text, visibility, keyboard access, visible focus, screen-reader labelling, width and height in pixels, review date, evidence link, and individual observations for keyboard, screen reader, contrast, reflow, and touch. Observations use `PASS`, `FAIL`, or `UNKNOWN`; they are *operator-supplied statements*, not automated conformance determinations. At least 44 px is required for each target dimension. An unknown or failed required observation blocks the metadata gate.

The OpenStreetMap credit and ODbL terms are separate notice requirements. Metrolinx GTFS AUA requires its section 3 legend and both applicable-laws lines; the Metrolinx OGL line applies to its own explicitly identified source record. LTC terms use language-appropriate wording. An unspecified custom open-licence name cannot establish usable rights, even if the permission flag is YES. These are checks against supplied metadata, not legal advice.

## Explicit local use

Open `docs/attribution/access-review.html` through a static host publishing the directory and its adjacent modules and stylesheet. A host SPA that does not expose this directory must mount it separately; the existing router is not modified. Import current JSON and optionally an earlier release, select optional policies, and review the findings. Export text, standalone HTML, or JSON with an explicit action. Data is kept only in memory and never uploaded.

Use the CLI as an explicit manual or CI release gate:

```sh
node docs/attribution/access-review-cli.mjs review.json --format text --lang fr
node docs/attribution/access-review-cli.mjs review.json --before old.json --require-offline --require-paired --require-evidence-links --format json
node --test docs/attribution/access-review-*.test.mjs
```

Exit code `0` indicates no blocking findings under the supplied policy, `1` indicates a blocked current release or regression, and `2` indicates invalid arguments, invalid JSON, or a file-read failure. No automatic or recurring task is installed. Root `npm test` already discovers `*.test.mjs` in this directory; no package-script or lockfile change is necessary.

## Accessibility and deployment

The page includes a skip link, `<main>` landmark, labelled language and file controls, explicit checkboxes, a status announcement region, visible keyboard focus, reflow styles, reduced-motion treatment, high-contrast handling, print styling, and minimum 44 px interactive targets. The report HTML has no executable scripts and includes a restrictive CSP. Links to outside source evidence open only after an explicit click. No map tiles, trackers, external styles, or third-party UI libraries are loaded.

The test suite covers strict parsing, licence-notice separation, manual observation coverage, target dimensions, UNKNOWN preservation, source-to-surface relationships, before/after regressions, HTML escaping, localized labels and punctuation, CLI process exits, the exact route and stylesheet paths, imports, and the README. A passing automated metadata audit cannot establish WCAG 2.2 AA conformance: perform manual keyboard, switch, touch, screen-reader, contrast, and reflow review in the actual deployment.
