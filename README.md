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

Section 5.6 counts only tier 2 and tier 3 values toward 500,000. This import's verified total is 0, so the shortfall is the full illustrative target in every tranche. The 2026-11-13 files contain 698,375 tier 0 or tier 1 physical accessibility-fact values. Context fields, including access, crossing, lit, and fee, are 494,045 and are counted separately. Other populated values are 5,765,623. [COUNTS.md](COUNTS.md) has the tier split, the retrieval date, and the UNKNOWN gaps.

[COUNTS.md](COUNTS.md) also lists accessibility facts separately from names, addresses, and geometry. `toilets:wheelchair` is stored on the washroom `wheelchair` field. Tier 4 alert rows are not pieces.

OSM data is ODbL share-alike and stays in `data/*/osm-ontario/`. Other sources stay in their own directories. Code licence: [LICENSE](LICENSE). Data licences: [DATA-LICENCE.md](DATA-LICENCE.md). Schema checks use `@access-main/schema` at `main` commit `5d7c17d2a8404a87bede3cef515f1e538e40c183`; see [schema/SOURCE.md](schema/SOURCE.md).

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

`npm run import` runs the municipal, extra municipal, GTFS, and OSM importers, validates every record with Ajv, then rewrites `COUNTS.md` and `counts.json` by reading the gzip files back. Raw downloads stay in `.cache/` and are gitignored. `npm run fetch:ttc-alerts` replaces the TTC accessibility alert snapshot. `schema/service-alert.schema.json` checks every row. `npm run build:tiles` writes the offline overlays, including path segments that sit inside a single tile. `npm run build:tiles -- --points` writes points only. Each PMTiles file stays under 50 MB. OpenStreetMap stays in `data/tiles/odbl/`. `data/tiles/open/` leaves out GO Transit, UP Express, MiWay, and London Transit. Their terms are unreconciled or revocable. This pipeline does not call Nominatim.

The OSM importer keeps the Geofabrik extract, filters it with `osmium tags-filter`, and streams `osmium export -f geojsonseq -a type,id`. A closed way can be exported once as a line and once as an area. The second record with the same id is dropped. Area venues store a vertex-mean of the outer ring as `lat` and `lon` (`source_key` `geometry:vertex_mean`). That point is not a surveyed entrance. Path length is stored only when the source publishes it. Path geometry is the published linestring, rounded to six decimal places, with consecutive duplicate points removed. Multipart paths keep the longest part.

Washroom fields from a venue, such as `toilets:wheelchair`, are emitted as a separate washroom record (`osm:toilets-at:...`) and are not copied onto the venue. `amenity=toilets` is only a washroom. A cycleway or bridleway is imported only when `foot` is `yes` or `designated`.

## Tests and CI

`npm test` covers OSM tag mapping and `UNKNOWN`, GTFS codes, municipal columns, counting rules, CSV parsing, and Ajv validation. `npm run lint` is `tsc --noEmit`.

`.github/workflows/ci.yml` runs on `pull_request` only: `npm run check:schema` (the pinned access-main Ajv validator over every import record), lint, vitest, and Ajv validation of a sample of the committed data plus the source registry. There is no schedule.

## Sources not imported

See [sources/gaps.json](sources/gaps.json). OC Transpo's terms page did not return a licence. YRT requires a named-person download form. Ottawa public washrooms, Peel recreation trails, Guelph parks and sidewalks, Thunder Bay recreation facilities, and Barrie park amenities did not expose a confirmed open licence on 2026-11-13, so they were not imported. Ontario catalogue packages marked Licence Not Specified were not imported. City of London open-data terms and additional City of Mississauga datasets need legal review and were not added.

GO Transit, UP Express, and MiWay rows already in this repository stay. Their terms still need legal review. The notes are in [sources/registry.json](sources/registry.json) and [ATTRIBUTION.md](ATTRIBUTION.md). GO and UP Express `stop_amenities.txt` has an undocumented integer `washroom` column, so that file was not interpreted.

None of the downloaded GTFS feeds included `pathways.txt` or `levels.txt`. MiWay `level_id` is stored when the stop publishes it. `level_index` and `level_name` stay `UNKNOWN` unless a levels table is present.
