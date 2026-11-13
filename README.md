# access-maps

Unbranded Ontario accessibility open data for a spinal-cord-injury-first map. This repository is the open-data pipeline: schemas, importers, and the imported records.

No transit agency, municipality, OpenStreetMap, or other publisher endorses this project. Attribution in [ATTRIBUTION.md](ATTRIBUTION.md) is licence compliance. The data is not medical advice and not an eligibility determination.

## Verification tiers

Tiers apply to each field, not to the whole record.

| Tier | Meaning in this import |
| --- | --- |
| 0 | Open-data import. OSM tags and municipal open-data columns. Shown as an open-data import, not as verified. |
| 1 | Operator claim. Every static GTFS field, including `wheelchair_boarding`. Shown as an operator claim, not as verified. A tier 1 claim expires after 180 days. |
| 2–4 | Peer verification, trained survey, and live operational feeds. None of those are in this import. |

`wheelchair_boarding` empty or `0` is stored as `UNKNOWN` because the GTFS specification defines that code as no accessibility information. Empty `location_type` is stored as `stop` because the specification defines empty as location type 0. Empty `is_bidirectional` on a pathway is stored as `yes` because the specification default is bidirectional. The original token is kept on `raw` when the stored value was normalized.

## Field values

Every field is an object:

```json
{"value":"yes","source_id":"osm-ontario","licence":"ODbL-1.0","retrieved_at":"2026-11-13","tier":0,"source_key":"wheelchair"}
```

`value` is the explicit string `UNKNOWN` when the source did not state the fact. Unknown is not left out and not guessed. `licence` is the `licence_id` in [sources/registry.json](sources/registry.json).

A coordinate copied from a parent venue onto a washroom that exists only because the venue carries toilet tags is marked `"derived": true`. Derived copies are kept so the record can be mapped, and they are excluded from piece counts.

OSM `amenity=doctors` and `amenity=dentist`, and individual healthcare practitioner categories, do not keep `name`, `operator`, `brand`, or `website`. Phone and email tags are dropped. OSM contributor usernames are not exported (`osmium export -a type,id`).

## Counting

A piece is one field on one record whose value is not `UNKNOWN` and whose `derived` flag is not true. `UNKNOWN` values are gaps. Photos, reviews, and tags are not pieces. A fact stored on a washroom record is not also stored on the venue.

The 500,000 figure in the master plan is an illustration: 5,000 venues × 50 fields, 10,000 path segments × 10 fields, 5,000 transit stops × 10 fields, and 5,000 washrooms × 20 fields. This import reports the honest populated-field total in [COUNTS.md](COUNTS.md) and `counts.json`, with tier and retrieval-date breakdowns. It does not add filler to reach that illustration.

The 2026-11-13 import has 6,948,433 pieces, 43,892,670 UNKNOWN gaps, and 1,416,313 records. Venue, path, and transit pieces are above those illustrative examples because Ontario has far more than 5,000–10,000 real features and their identity, location, and geometry fields are populated. The washroom tranche has 29,046 pieces, 70,954 under the illustrative 100,000: this import has 6,287 washroom records, and most washroom fields are untagged. Tier 0 accounts for the OSM and municipal pieces. Tier 1 accounts for the GTFS pieces (141,430).

## Layout

- `schema/` — JSON Schema draft 2020-12. Field lists live in `schema/fields.json`; `npm run build:schemas` rewrites the record schemas.
- `sources/registry.json` — source name, URLs, licence, attribution, retrieval date, and tier.
- `sources/gaps.json` — feeds that were not imported because the file or the licence could not be confirmed.
- `data/{venues,washrooms,paths,transit}/{source_id}/*.ndjson.gz` — gzip NDJSON partitioned by 0.5-degree cell. Each file stays under 25 MB.
- `src/` — tag mapping, GTFS parsing, municipal mapping, Ajv validation, and counting.
- `scripts/` — importers.

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

`npm run import` runs the municipal, GTFS, and OSM importers, validates every record with Ajv, then rewrites `COUNTS.md` and `counts.json` by reading the gzip files back. Raw downloads stay in `.cache/` and are gitignored.

The OSM importer keeps the Geofabrik extract, filters it with `osmium tags-filter`, and streams `osmium export -f geojsonseq -a type,id`. A closed way can be exported once as a line and once as an area. The second record with the same id is dropped. Area venues store a vertex-mean of the outer ring as `lat` and `lon` (`source_key` `geometry:vertex_mean`). That point is not a surveyed entrance. Path length is stored only when the source publishes it. Path geometry is the published linestring, rounded to six decimal places, with consecutive duplicate points removed. Multipart paths keep the longest part.

Washroom fields from a venue, such as `toilets:wheelchair`, are emitted as a separate washroom record (`osm:toilets-at:...`) and are not copied onto the venue. `amenity=toilets` is only a washroom. A cycleway or bridleway is imported only when `foot` is `yes` or `designated`.

## Tests and CI

`npm test` covers OSM tag mapping and `UNKNOWN`, GTFS codes, municipal columns, counting rules, CSV parsing, and Ajv validation. `npm run lint` is `tsc --noEmit`.

`.github/workflows/ci.yml` runs on `pull_request` only: lint, vitest, and Ajv validation of a sample of the committed data plus the source registry. There is no schedule.

## Sources not imported

See [sources/gaps.json](sources/gaps.json). OC Transpo's terms page did not return a licence. YRT requires a named-person download form. Ottawa public washrooms did not expose a confirmed licence on the dataset record. GO and UP Express `stop_amenities.txt` has an undocumented integer `washroom` column, so that file was not interpreted.

None of the downloaded GTFS feeds included `pathways.txt` or `levels.txt`. MiWay `level_id` is stored when the stop publishes it. `level_index` and `level_name` stay `UNKNOWN` unless a levels table is present.
