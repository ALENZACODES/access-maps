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
