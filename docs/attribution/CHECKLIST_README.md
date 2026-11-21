# P18 — Notice publication checklist

The standalone route `checklist.html` is an offline-first, local-only interface
for recording the source, licence and notice presentation evidence for a
specific publication view. It uses the schema `notice-publication-checklist/1`.
It does not fetch provider data or claim that a physical location is accessible.

## What the person can do

1. Open `checklist.html?lang=en` or `checklist.html?lang=fr` from the sources page.
2. Add a source. Record an explicit origin, HTTPS source, licence and terms URL,
   retrieval date, tier, permission claim and exact credit. No field is inferred
   from a source name; unavailable information remains `UNKNOWN`.
3. Add a publication view with local route, language, kind (map/list/journey)
   and the IDs of sources it actually displays. Mark inclusion deliberately.
4. Complete four observation methods for each included view/source pair:
   visual, keyboard, screen reader and touch. Record notice text, licence
   access, placement, date, focus and target size where applicable.
5. Review gaps and missing observation slots. Export the checklist as JSON,
   the bilingual finding report as plain text, or the coverage matrix as TSV.
   A previous checklist may be loaded locally for a comparison.

All information stays in volatile browser memory unless the person explicitly
exports it. Imports are bounded to 1 MiB and parsed in full before replacing
the working register. Exports use a local Blob and user-triggered download.
The route has no remote API, telemetry, background polling or scheduled task.
The restrictive CSP includes `connect-src 'none'`. External source URLs are
recorded, not fetched or embedded.

The audit rejects a missing source licence, source or licence URL, retrieval
date, evidence tier, displayed source credit, permission record, observation,
observation date, required keyboard/screen-reader evidence, or touch target
smaller than 44 CSS px. An ODbL map additionally needs the exact
`© OpenStreetMap contributors` line beside the map. Dates of datasets may
remain `UNKNOWN` and are reported rather than fabricated. A checklist with
zero blocking findings still requires actual manual accessibility and rights
review and does not constitute a compliance determination.

## Command-line review

Use the same pure parser and audit logic as the browser:

```sh
node docs/attribution/checklist-cli.mjs local-checklist.json --lang fr
node docs/attribution/checklist-cli.mjs local-checklist.json --before prior.json --format json
node docs/attribution/checklist-cli.mjs local-checklist.json --format tsv
```

Exit **0**: no blocking gap found in supplied metadata. Exit **1**: a block or
regression was found. Exit **2**: invalid arguments, malformed input or read
failure. This is an explicit local command, not an automated workflow. The
command does not write files or transmit them.

## Integration

`index.html` retains the complete main navigation and adds the two checklist
links and `checklist-link.css`. Every other file in this package is a new file
under `docs/attribution`. The browser script imports only the included new
modules; the files do not depend on any unmerged branch. The existing root
`npm test` discovers `docs/attribution/*.test.mjs`, including the new suites.
No dependencies, lockfiles, service workers or GitHub workflows are changed.

Run `node --test docs/attribution/checklist-*.test.mjs` for the feature checks,
then run the repository's lint, strict typecheck, full tests, web-pack budget
and accessibility checks in the complete repository. Static contract tests
do not establish WCAG conformance. Validate keyboard, screen-reader, touch,
contrast and focus behaviour on deployed URLs in both languages.
