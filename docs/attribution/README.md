# Attribution page data

`index.ts` exports `buildAttributionPage(locale, usedSources)` for an EN/FR
sources-and-licences screen. Pass only providers whose data the view actually
uses; it deduplicates them. `index.test.ts` is a Vitest spec that imports the
public module, so the implementation is exercised rather than orphaned.

The catalogue covers OpenStreetMap/ODbL, the exact Metrolinx GTFS Access and
Use Agreement section 3 legend **and** the separate Metrolinx Open Government
Licence line, plus London Transit Commission open-data terms. The required
Metrolinx English legal notice is left unchanged for both locales.

The recorded `termsReviewedOn` is the date the published terms were inspected
(2026-11-15), **not** the currency of any dataset. `datasetAsOf` stays
`UNKNOWN` until actual ingestion provenance exists. Feed-specific rights must
be checked before release; the public GTFS download agreement and the published
Open Government Licence must not be assumed interchangeable.

The OpenStreetMap attribution belongs close to the map, not only on a separate
legal page. Keep licence and source links available offline if the app ships
offline data. The Metrolinx legend must remain prominent. The LTC notice is
optional under its terms, but included here for transparency.

Run with the repository's Vitest runner, e.g. `vitest run
docs/attribution/index.test.ts`. The typed catalogue remains available for application integration.
A standalone static route is also included below; publishing it through an existing SPA
router requires configuration in the host application.

Source terms: https://www.openstreetmap.org/copyright ;
https://www.gotransit.com/en/partner-with-us/software-developers ;
https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf ;
https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/

## Directly loadable attribution route

`index.html` is a standalone, progressively enhanced route at the directory
path when the static host publishes `docs/attribution/`. It loads `route.mjs`
and `attribution.css`; `route.mjs` imports `attribution-utils.mjs` directly.
Neither the renderer nor its data functions are test-only modules. If the app
serves only a bundled SPA, the hosting configuration must explicitly publish
this directory or mount this route; adding these files alone does **not**
change an unknown SPA router. No existing application entry file is guessed.

Open `index.html?lang=fr&sources=osm,ltc` to show French notices for the two
selected sources. With no `sources` parameter, the list begins empty instead
of guessing which providers the surrounding view uses. Choose providers via
44px-or-larger checkbox rows, select all, or clear. The selection is encoded
only in the page URL and is never sent to a remote endpoint. The page offers
an explicit plain-text export of the currently selected notices and a print
view. A download is a locally assembled Blob, not a provider data request.

The English Metrolinx AUA section 3 legend and the separate OGL line are
preserved. They must be displayed only when those terms actually govern the
underlying dataset. In particular, the existence of both lines in the
catalogue does not establish that both licences apply to the same feed.
The dataset age is always `UNKNOWN` until provenance from ingestion is supplied;
`2026-11-15` identifies a review of source terms, not feed freshness.
There is no automated accessibility assertion or external service dependency.

The route includes skip navigation, landmarks, explicit field labels, keyboard
focus indication, an announcement region, reduced-motion treatment, high
contrast and dark colour schemes, print output, and a restrictive CSP that
blocks all network requests from scripts. External legal links require an
explicit user click. The route does not load maps, tiles, or tracker scripts.
The web page can be kept in an offline bundle by copying its four source
files together; a source link will not resolve without connectivity.

Run `node --test docs/attribution/attribution-utils.test.mjs` for the
executable Node tests, in addition to the previous `index.test.ts` Vitest
spec. Root `npm test` runs both. These checks exercise the same functions
imported by the browser route and test URLs, bilingual text, selection
fidelity, UNKNOWN behaviour, legal notice integrity, exports, CSP wiring,
and minimum control dimensions. Review visual and assistive-technology
behaviour in the target deployment as an additional step; static tests alone
cannot establish WCAG conformance.


## P18D: local provenance workbench and release gate

`provenance.html` is a directly loadable page linked from the existing
attribution route. Its executable entry point is `provenance-route.mjs`.
It imports `provenance-core.mjs`, `provenance-audit.mjs`, and
`provenance-messages.mjs`. The page uses `provenance.css` alongside the
existing stylesheet. There is no remote API, analytics call or data fetch;
`connect-src 'none'` and `form-action 'none'` are set in the page CSP.

This page keeps a **volatile, local-only** register in browser memory.
People enter a dataset ID, source name and HTTPS address, licence and terms
address, acquisition and dataset dates, attribution notice, licence flags,
and redistribution permission. `UNKNOWN` is a valid explicit value where
evidence is unavailable. Records start as `held`, not included. An import
replaces the in-memory register only after validating the whole file. Export
saves a JSON copy to the device; text audit export records findings. Nothing
persists unless the person deliberately saves an exported file. Selection,
filtering and locale changes do not contact an endpoint. The page is usable
without a connection when its local HTML, CSS and JS files are present.

### Contract and release gate

`provenance-core.mjs` enforces a versioned JSON schema, strict allowed fields,
valid ISO dates (or UNKNOWN), HTTPS-only public links, typed yes/no/UNKNOWN
flags, unique identifiers, and bounded import sizes. The parser fails closed:
unknown keys, unsupported schema versions and malformed records are rejected.
No licence type or date is inferred from the provider label.

`provenance-audit.mjs` blocks release when any **included** source lacks
required origin, licence, acquisition/terms dates, attribution notice, or
redistribution permission. OSM records require an explicit ODbL flag and
map credit. Metrolinx GTFS AUA and OGL are separate selections: their exact
English notices are checked according to the selected licence, never
combined by assumption. LTC source notices are checked; other sources
must identify their own open licence. Unknown dataset dates remain UNKNOWN
and are informational rather than fabricated; unknown permission blocks.
Excluded and held datasets do not count as release candidates.

Run the command-line release gate on an actual, operator-supplied inventory:

```sh
node docs/attribution/provenance-cli.mjs path/to/inventory.json --date 2026-11-15
node docs/attribution/provenance-cli.mjs path/to/inventory.json --json
```

Exit code **0** means no blocking evidence gaps under these rules; **1**
means a blocked release; **2** means invalid input, bad options or a read
failure. The supplied `--date` is used for future-date comparisons; without
it the comparison reference remains `UNKNOWN` (there is no system-clock
inference). The CLI is not implicitly enabled in an unknown repository CI
configuration. To wire it into a deployment job, invoke it against the
actual release inventory. No generated inventory or provider feed is bundled.

### Run the tests

```sh
node --test docs/attribution/attribution-utils.test.mjs   docs/attribution/provenance-*.test.mjs
```

The tests execute the same modules loaded by the live route and CLI. They
check malformed imports, URL rejection, exact legal notices, language keys,
UNKNOWN preservation, block-on-error behaviour, actual CLI exit codes,
route wiring, CSP, semantic structure and CSS target minimums. The audit
suite asserts that missing evidence produces an error: removing an audit
check makes the tests fail. Automated source checks do not replace a
manual keyboard, switch, screen-reader or contrast review in deployment.

### Integration boundary

The page is a real standalone static route at `docs/attribution/provenance.html`
and linked from `docs/attribution/index.html` through `route.mjs`. A host SPA
that does not publish `docs/attribution/` still needs its routing/publishing
configuration wired separately; that configuration is not in this lane's
allowed scope. The gate can be integrated into an existing CI job by calling
the command above; the repository's CI configuration has not been edited.
