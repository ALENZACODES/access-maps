# access-maps

Unbranded Ontario accessibility open data for a spinal-cord-injury-first map. This repository is the open-data pipeline: schemas, importers, and the imported records.

No transit agency, municipality, OpenStreetMap, or other publisher endorses this project. Attribution in [ATTRIBUTION.md](ATTRIBUTION.md) is licence compliance. The data is not medical advice and not an eligibility determination.

## Verification tiers

Tiers apply to each field, not to the whole record.

| Tier | Meaning in this import |
| --- | --- |
| 0 | Open-data import. OSM tags and municipal open-data columns. Shown as an open-data import, not as verified. |
| 1 | Operator claim. Every static GTFS field, including `wheelchair_boarding`. Shown as an operator claim, not as verified. A tier 1 claim expires after 180 days. |
| 2–3 | Peer verification and trained survey. None of those are in this import. |
| 4 | Live operator status. The TTC GTFS-RT accessibility alert snapshot is tier 4. It is stored separately and is not a piece. `schema/service-alert.schema.json` validates every alert row. |

`wheelchair_boarding` empty or `0` is stored as `UNKNOWN` because the GTFS specification defines that code as no accessibility information. Empty `location_type` is stored as `stop` because the specification defines empty as location type 0. Empty `is_bidirectional` on a pathway is stored as `yes` because the specification default is bidirectional. The original token is kept on `raw` when the stored value was normalized.

## Field values

Every field is an object:

```json
{"value":"yes","source_id":"osm-ontario","licence":"ODbL-1.0","retrieved_at":"2026-11-13","tier":0,"source_key":"wheelchair"}
```

`value` is the explicit string `UNKNOWN` when the source did not state the fact. Unknown is not left out and not guessed. `licence` is the `licence_id` in [sources/registry.json](sources/registry.json).

A coordinate copied from a parent venue onto a washroom that exists only because the venue carries toilet tags is marked `"derived": true`. Derived copies are kept so the record can be mapped, and they are excluded from piece counts.

OSM `amenity=doctors` and `amenity=dentist`, and individual healthcare practitioner categories, do not keep `name`, `operator`, `brand`, or `website`. Phone and email tags are dropped. OSM contributor usernames are not exported (`osmium export -a type,id`).

Every imported record, including paths, then passes through the same value scrubber. A phone match needs a leading `+` or separators between the groups, such as `+1 519 555 0100` or `519-555-0100`. A run of digits inside an OSM id, a URL, or another structured identifier is not a phone. An email address is removed. When a phone or email sits inside a longer value, such as opening hours, only the contact is removed and the rest is kept. The original contact is not kept in `raw`.

City of Toronto park washroom `Status` uses the datastore field note on resource `1c7d1063-2562-4de3-8cd3-4cef48419f6f`: `0` is `closed`, `1` is `open`, and `2` is `service_alert`. The code stays in `raw`. `posted_date` is the date prefix of `PostedDate`. The City refreshes that dataset daily and does not publish a numeric expiry. A status whose posted date is more than 30 days before `retrieved_at` stays as the mapped word and is marked `derived`, so the piece count does not treat it as a current fact. Thirty days is the status-snapshot window. A code the field note does not define stays `UNKNOWN`, with the code in `raw`.

## Counting

A piece is one field on one record whose value is not `UNKNOWN` and whose `derived` flag is not true. `UNKNOWN` values are gaps. Photos, reviews, and tags are not pieces. A fact stored on a washroom record is not also stored on the venue.

Section 5.6 counts only tier 2 and tier 3 values toward 500,000. This import's verified total is 0, so the shortfall is the full illustrative target in every tranche. The files, retrieved between 2026-11-13 and 2026-11-16, contain 910,236 tier 0 or tier 1 physical accessibility-fact values. Context fields, including access, crossing, lit, and fee, are 517,102 and are counted separately. Other populated values are 7,036,205. [COUNTS.md](COUNTS.md) has the tier split, the retrieval date, and the UNKNOWN gaps.

[COUNTS.md](COUNTS.md) also lists accessibility facts separately from names, addresses, and geometry. `toilets:wheelchair` is stored on the washroom `wheelchair` field. Tier 4 alert rows are not pieces.

Route-condition reports from people (`packages/conditions`) are treated like tier 4 alert rows: they are not pieces and never count toward a verified total. Two or more independent reports may raise a report group to tier 2, but a report is a time-limited observation, not a standing accessibility fact; it expires on its decay schedule whatever its tier, and the interface says "confirmed by N reports", never "verified". The counter in `src/count` reads only the record files under `data/`, and reports are never written there, so no change to the counter is needed; the package also marks every group and routing fact with `counting` flags that are always false and its routing fact as `derived`.

OSM data is ODbL share-alike and stays in `data/*/osm-ontario/`. Other sources stay in their own directories. Code licence: [LICENSE](LICENSE). Data licences: [DATA-LICENCE.md](DATA-LICENCE.md). Schema checks use `@access-main/schema` at `main` commit `c89241dcd405f0885982bd5398c893a8a6ab6c15`; see [schema/SOURCE.md](schema/SOURCE.md).

## Layout

- `schema/` — JSON Schema draft 2020-12. Field lists live in `schema/fields.json`; `npm run build:schemas` rewrites the record schemas.
- `sources/registry.json` — source name, URLs, licence, attribution, retrieval date, and tier.
- `sources/gaps.json` — feeds that were not imported because the file or the licence could not be confirmed.
- `data/{venues,washrooms,paths,transit}/{source_id}/*.ndjson.gz` — gzip NDJSON partitioned by 0.5-degree cell. Each file stays under 25 MB.
- `data/alerts/` — GTFS-RT accessibility alert snapshots. Not counted as pieces.
- `data/tiles/odbl/` and `data/tiles/open/` — PMTiles vector overlays. OpenStreetMap stays in `odbl`. Each file stays under 50 MB.
- `src/` — tag mapping, GTFS parsing, municipal mapping, Ajv validation, counting, and tiles.
- `scripts/` — importers. `npm run fetch:ttc-alerts` and `npm run build:tiles` are on demand. There is no schedule.

## Re-run

Requirements: Node 22, `osmium` 1.16 or newer, and `unzip`.

```bash
npm ci
npm test
# Place the Geofabrik Ontario PBF at .cache/osm/ontario-latest.osm.pbf
# and the GTFS zips and municipal CSVs at the paths in scripts/import-*.ts.
npm run import
npm run validate:sample
```

`npm run import` runs the municipal, extra municipal, city open-data (`scripts/import-city-open-data.ts`, City of Toronto and City of Ottawa; `scripts/import-cities-west.ts`, Peel, Hamilton, Halton and Niagara municipalities), GTFS, and OSM importers, validates every record with Ajv, then rewrites `COUNTS.md` and `counts.json` by reading the gzip files back. Raw downloads stay in `.cache/` and are gitignored. `npm run fetch:ttc-alerts` replaces the TTC accessibility alert snapshot. `schema/service-alert.schema.json` checks every row. `npm run build:tiles` writes the offline overlays, including path segments that sit inside a single tile. `npm run build:tiles -- --points` writes points only. Each PMTiles file stays under 50 MB. OpenStreetMap stays in `data/tiles/odbl/`. `data/tiles/open/` leaves out GO Transit and UP Express timetable stops, which stay in their own `metrolinx-*` files. This pipeline does not call Nominatim.

`npx tsx scripts/import-cities-g3.ts` reads the ArcGIS REST layers of Kitchener, Waterloo, Cambridge, Guelph, Windsor and the County of Lambton listed in that script. Each job names the columns it requests, and each municipality has its own mapper in `src/municipal/cities/` and its own test in `test/cities/`. `npm run import` runs it after the city open-data importer. The Guelph Transit and Transit Windsor GTFS feeds are in `src/gtfs/feeds.ts`. `npx tsx scripts/import-cities-g5.ts` reads the layers included on the repository owner's statement of 2026-11-16 (City of London, and City of Cambridge trails and sidewalks), with the same column rule; `npm run import` runs it after the G3 importer.

The OSM importer keeps the Geofabrik extract, filters it with `osmium tags-filter`, and streams `osmium export -f geojsonseq -a type,id`. A closed way can be exported once as a line and once as an area. The second record with the same id is dropped. Area venues store a vertex-mean of the outer ring as `lat` and `lon` (`source_key` `geometry:vertex_mean`). That point is not a surveyed entrance. Path length is stored only when the source publishes it. Path geometry is the published linestring, rounded to six decimal places, with consecutive duplicate points removed. Multipart paths keep the longest part.

Washroom fields from a venue, such as `toilets:wheelchair`, are emitted as a separate washroom record (`osm:toilets-at:...`) and are not copied onto the venue. `amenity=toilets` is only a washroom. A cycleway or bridleway is imported only when `foot` is `yes` or `designated`.


## York Region and Durham Region municipalities

`npx tsx scripts/import-york-durham-cities.ts` reads the ArcGIS REST layers listed in `src/municipal/cities/york-durham-jobs.ts`. Each municipality has its own mapper in `src/municipal/cities/` and its own test in `test/cities/`. `npm run import` runs it after the city open-data importer.

`npx tsx scripts/import-cities-g4.ts` reads the ArcGIS REST layers for Kingston, Greater Sudbury, Thunder Bay, Cornwall, Quinte West and the second set of Ottawa layers, and downloads the Kingston Transit and GOVA Transit GTFS zips. Each city has its own mapper in `src/municipal/cities/` and its own test in `test/cities/`. `npm run import` runs it before the GTFS importer. Outside `npm run import`, run it with `NODE_USE_ENV_PROXY=1` when the network needs a proxy.

<!-- g6 start -->
`npx tsx scripts/import-cities-g6.ts` reads the ArcGIS REST layers for the municipalities ranked 51 to 77 by 2021 Census population ([sources/ontario-municipalities-51-75.json](sources/ontario-municipalities-51-75.json)) and the counties that serve them: the County of Essex, the County of Brant and the Town of Orangeville so far. Each publisher has its own mapper in `src/municipal/cities/` and its own test in `test/cities/`. `npm run import` runs it after the G4 importer. Outside `npm run import`, run it with `NODE_USE_ENV_PROXY=1` when the network needs a proxy. A line drawn in several parts is stored as one path record per part.
<!-- g6 end -->

- York Region's Bus Stops from GTFS layer is a tier 1 operator claim. Its "Yes / Part" boarding label is kept as published and is not stored as a yes.
- A trail drawn in several parts is stored as one path record per part, so no part of the line is dropped. A length published for the whole trail is not repeated on the parts.
- A building or park-feature outline is stored at the vertex mean of its largest ring (`source_key` `geometry:vertex_mean`). That point is not a surveyed entrance.
- Durham Region Transit is imported from its GTFS zip (`gtfs-drt`, tier 1). Oshawa, Whitby, Ajax and Pickering layers are tier 0.
- Whitby sidewalk ramp counts and Whitby's park "Accessible Amenities" flag are kept as published in `wheelchair_description`. They are not stored as a ramp or wheelchair value.
- A washroom that a park layer only lists as an amenity (Whitby, Pickering) is a washroom record at the park point, marked `derived`. Pickering's amenity domain codes Yes as 0.
- For Vaughan, Richmond Hill, Aurora, Whitchurch-Stouffville, Georgina, Clarington, Barrie and Kawartha Lakes no licence that permits redistribution could be read on 2026-11-16, so nothing from them is imported. Peterborough's terms allow distribution only of unmodified datasets with each recipient's agreement, and the Barrie Transit and York Region Transit GTFS zips need a person to accept terms first. The reasons are in [sources/gaps.json](sources/gaps.json).

## Licence re-checks

`npm run licence:recheck -- --as-of YYYY-MM-DD` prints a dated register with one row for every source in `sources/registry.json` and every dataset in `sources/gaps.json`. Add `--format json` for JSON, and `--fail-on-overdue` to exit 1 when a row is overdue.

- A row is flagged only when the registry or gap text already says so (revocable terms, an indemnity, legal review, a missing licence version, an unreachable licence page, and so on), or when the source is in `TILES_HELD_FOR_LEGAL_REVIEW`. The register quotes the sentence that raised each flag.
- Flagged rows are due 30 days after the last check. Other rows are due after 90 days. These intervals are this repository's defaults, not figures from a licence.
- A gap with no date in its record is overdue now. It is not treated as checked.
- The command reads files only. It does not fetch a licence page and does not say what a licence allows.

A person records each re-check in `sources/licence-rechecks.json`: `subject` (registry id or gap name), `checked_on`, `checker_role` (a role, not a name), `url_checked`, `result` (`unchanged`, `changed`, or `unreachable`), `http_status` (required when unreachable), and `note`. The command stops and names any entry that does not meet those rules. The log starts empty.

## Tests and CI

`npm test` covers OSM tag mapping and `UNKNOWN`, GTFS codes, municipal columns, counting rules, CSV parsing, and Ajv validation. `npm run lint` is `tsc --noEmit`.

`.github/workflows/ci.yml` runs on `pull_request` only: `npm run check:schema` (the pinned access-main Ajv validator over every import record), lint, vitest, and Ajv validation of a sample of the committed data plus the source registry. There is no schedule.

## Sources not imported

See [sources/gaps.json](sources/gaps.json). The OC Transpo zip returned HTTP 403 on 2026-11-16. YRT requires a named-person download form. Toronto museum washrooms have no coordinates. Toronto pedestrian-network segments with no stated sidewalk were left out. Thunder Bay recreation facilities and Barrie park amenities did not expose a confirmed open licence on 2026-11-13, so they were not imported. City of Cambridge trails and pedestrian network have no catalogue record that states a licence; they are imported on the repository owner's statement of 2026-11-16 (licence id `owner-permission-2026-11-16`). Kitchener, Waterloo, Guelph and Windsor layers without an accessibility column were left out. Ontario catalogue packages marked Licence Not Specified were not imported. Additional City of Mississauga datasets need legal review and were not added. City of London layers were held for legal review until 2026-11-16, when the repository owner stated that their use is permitted; they are now imported under licence id `owner-permission-2026-11-16` (see [DATA-LICENCE.md](DATA-LICENCE.md)), and the London layers with no accessibility column are listed in the gaps file. Chatham-Kent and the City of Sarnia publish no accessibility-relevant file. No City of Woodstock or City of St. Thomas portal was found, the Oxford, Elgin and Haldimand county records state no licence that permits redistribution, and the Norfolk County portal returned HTTP 403 on 2026-11-16.

The City of Mississauga Terms of Use were re-read on 2026-11-16: the licence is revocable, binds recipients, and carries an indemnity, so Mississauga and MiWay stay held. Brampton sidewalks (429,007 lines) are over the size limit. Region of Peel and City of Hamilton on-road trail segments were left out. City of Burlington and City of Brantford terms can be revoked or cancelled, so those cities are held for legal review. No open-data portal was found for Halton Region or the Town of Halton Hills. niagaraopendata.ca answered HTTP 403, so Niagara Region Transit was not retrieved. Town of Oakville trails and accessible parking have no licence on the dataset and were not imported.

GO Transit and UP Express rows are stored only under `data/transit/metrolinx-go/` and `data/transit/metrolinx-up/`, under the Metrolinx Access and Use Agreement accepted on 2026-11-15. John Khan confirmed that acceptance directly to QA on 2026-11-15 at 5:59 PM ET (America/Toronto). MiWay is not in this pack. Licence notes are in [sources/registry.json](sources/registry.json) and [ATTRIBUTION.md](ATTRIBUTION.md). GO and UP Express `stop_amenities.txt` has an undocumented integer `washroom` column, so that file was not interpreted.

None of the downloaded GTFS feeds included `pathways.txt` or `levels.txt`. If a stop publishes `level_id`, that value is stored. `level_index` and `level_name` stay `UNKNOWN` unless a levels table is present.

## Journey packages

This branch also carries the door-to-door journey work that landed ahead of the open-data import:

- `packages/journey` — TypeScript journey-chain engine. Step-free status defaults to unknown. Tests use fixtures.
- `packages/map-ui` — React and MapLibre GL components. Every map feature is also a button in a list, with keyboard arrow keys and a polite status announcement.
- `packages/journey-data` — Rolling routes and transit options over downloaded pack records. Scheduled times come from I14's published timetable chunks when those chunks are already on the device; missing chunks stay unknown and times are never invented. MiWay is held; GO, UP Express, and LTC are in.

OpenTripPlanner (LGPL) and OpenRouteService (GPL) are not vendored and are rejected if named as an engine.

Imported records in `data/` follow the field-value shape (`value`, `source_id`, `licence`, `retrieved_at`, `tier`). The journey packages read that shape and do not edit the import pipelines. Unknown stays `UNKNOWN`.
