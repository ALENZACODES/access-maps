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
docs/attribution/index.test.ts`. Integration into the app's routing is a
separate task: this lane adds a typed exported data entry point, not a route.

Source terms: https://www.openstreetmap.org/copyright ;
https://www.gotransit.com/en/partner-with-us/software-developers ;
https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf ;
https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/
