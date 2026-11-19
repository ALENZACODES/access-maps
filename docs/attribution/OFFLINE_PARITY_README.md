# Bilingual offline publication parity

The `offline-parity.ts` gate compares **explicitly registered** English and
French routes, without guessing route equivalence or inferring source rights.
It builds on the single authoritative `docs/attribution/index.ts` legal
catalogue and the merged `offline-bundle.ts` and `evidence-audit.ts` checks.

The plan format is `attribution-bilingual-parity/1` with `releaseId`,
`minimumTargetPx` (44 or greater), and `pairs`. Every pair records an ID,
`enRouteId`, `frRouteId`, `expectedSourceIds`, `sharedAssetPaths`, and an
explicit `requireOffline` boolean. Unknown is not treated as permission.
The published bundle already carries source, licence, evidence, asset and
surface records; no second source catalogue or data inventory is generated.

## Run

The executable is `docs/attribution/offline-parity-cli.ts`.
The explicit local command is:

```sh
npm run audit:bilingual-attribution -- release.json pairs.json --lang fr --format text
npm run audit:bilingual-attribution -- new.json new-pairs.json --before-bundle old.json --before-pairs old-pairs.json --format json
```

The command uses only local files, never contacts a provider, and does not
write to disk. The output may be text, standalone HTML or JSON. Status 0
means no blocking finding in the supplied records; 1 indicates blocked
publication or a regression; 2 indicates invalid arguments or input.
The output is **not** a substitute for manual keyboard or screen-reader
assessment and does not establish conditions at any physical location.

The HTML contains a strict CSP, skip link, heading and main landmarks,
reduced-motion CSS, visible keyboard focus and 44 px control styles. The
French report uses a nonbreaking space (U+00A0) before colons, including
`Données en date du :`; all missing dataset dates remain `UNKNOWN`.

The scanner requires recorded OSM map credit separately from ODbL terms,
Metrolinx AUA section 3 legend and both applicable-law lines separately
from the Metrolinx OGL notice, and an identifiable LTC notice when LTC data
is included. It never assumes that a provider name establishes licence
permission. MiWay is not included in the catalogue.

## Tests

The existing root test script already runs `tsx --test
 docs/attribution/offline-*.spec.ts` (without a line break in the command).
That glob includes `offline-parity.spec.ts`, `offline-parity-change.spec.ts`,
`offline-parity-report.spec.ts`, and `offline-parity-cli.spec.ts`.
Each CLI process test launches the `.ts` entry through the `tsx` loader when
running source tests and uses the `.js` entry only when compiled locally.
There are no scheduled tasks and no bundled provider datasets.
