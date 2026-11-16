# Fail-safe audit: one bad unit of data

Date: 2026-11-16. Repository: access-maps. Import rows were probed on main at `4274cd0`; pack and tile rows on main at `af8f44a` (the pack and tile code did not change between the two).

The question for every step: what happens today when exactly one unit is bad (one record, one file, one download, one source)? "Before" is what a probe observed when it ran against main at `4274cd0`. Nothing in the "Before" column comes from reading code alone. "After" is the behaviour on this branch, and the last column names the test that proves it. Sources will keep failing; the goal is that every failure stays inside the smallest unit, is logged, and never reaches a person as a fact.

## How a record travels

1. Download: each importer in `scripts/import-*.ts` reads a file in `.cache/` or fetches a page.
2. Parse and map: `src/io/csv.ts`, `src/gtfs`, `src/osm`, `src/municipal` (owned by the import lanes).
3. Scrub and validate: `commitRecord` in `src/io/commit.ts` (scrubber, then Ajv).
4. Write: `PartitionWriter` in `src/io/partition-writer.ts` writes `data/<tranche>/<source>/<cell>.ndjson.gz`.
5. Replace: `resetSourceDirs` removes the old source directory before the new import.
6. Count: `scripts/count.ts` writes `counts.json` and `COUNTS.md`.
7. Pack: `src/pack/build.ts` writes `pack/v1/manifest.json` and search indexes; `src/pack/verify.ts` checks them.
8. Tiles: `scripts/build-pmtiles.ts` writes `data/tiles/*/places*.pmtiles`.
9. App download, integrity check, IndexedDB and render: access-main `packages/data-client` (see the audit in that repository).

## Probe method

A scratch script imported `commitRecord`, `resetSourceDirs`, `PartitionWriter`, `buildWebPack` and `countNdjsonGz` from main and fed each one a fixture run with one bad unit between two good records (`g1`, bad, `g2`), or ten existing good records on disk. `npm run import` (`scripts/import-all.ts`) was also run in a temporary copy of the repository with no `.cache/` downloads.

## Results

| # | Fault (one unit) | Step | Before (observed on main) | After (this branch) | Test |
|---|---|---|---|---|---|
| 1 | Wrong type: latitude `"43.6"` as a string | validate | Written to data: Ajv allows any string value. Leaks as a fact. | Quarantined (`coordinate_range`); `g1`, `g2` written | `test/failsafe/import.test.ts` "wrong type" |
| 2 | Missing provenance (`source_id` removed) | validate | `commitRecord` throws. `g2` and every later record and source in the run are lost; the run stops. | Quarantined (`missing_provenance`); `g1`, `g2` written | "missing provenance" |
| 3 | Licence missing (empty `licence`) | validate | Throws, run stops, `g2` lost | Quarantined; others written | "licence missing" |
| 4 | Out-of-range coordinate (lat 430) | validate | Written to data. Leaks as a fact. | Quarantined (`coordinate_range`) | "out-of-range coordinate" |
| 5 | Swapped coordinates (lat -79, lon 43) | validate | Written to data. Leaks as a fact. | Quarantined (`coordinate_range`) | "swapped coordinates" |
| 6 | NaN coordinate | validate | Ajv rejects it, `commitRecord` throws, run stops | Quarantined (`non_finite`) | "NaN coordinate" |
| 7 | Infinity in a value | validate | Throws, run stops | Quarantined (`non_finite`) | "Infinity in a value" |
| 8 | Unknown enum: tier 7 | validate | Throws, run stops | Quarantined | "unknown enum: tier 7" |
| 9 | Unknown enum: tranche `shop` | validate | Crashes with `validate is not a function`, run stops | Quarantined (`unknown_tranche`) | "unknown enum: tranche" |
| 10 | Region cell does not hold the point | validate | Written into the wrong cell file | Quarantined (`region_mismatch`) | "region does not hold the point" |
| 11 | Field carries another source's provenance | validate | Written (detected later only by `check:strict-data`) | Quarantined (`provenance_mismatch`) | "another source's provenance" |
| 12 | Duplicate id reaching the writer | write | Both copies written | First kept, second quarantined (`duplicate_id`) | "duplicate id" |
| 13 | Source returns 0 rows | replace | Old directory deleted; source silently empty | Old files kept, reported `kept_last_known_good` | "a source that returns 0 rows" |
| 14 | Source returns far fewer rows (10 to 1) | replace | Old directory deleted; 9 of 10 records gone | Old files kept when under 50% (`ACCESS_FAILSAFE_MIN_RATIO`), unless `ACCESS_FAILSAFE_ALLOW_DROP` names the source | "a sudden drop", "a person can allow", "the keep ratio is configurable" |
| 15 | HTTP error mid-download (after 1 record of 10) | write | Old directory deleted, a truncated gzip left in `data/` (`unexpected end of file` on read), run stops | Old file byte-for-byte unchanged, the next importer runs | "an HTTP error mid-download" |
| 16 | Download missing (`npm run import` with no `.cache/`) | run | `import-all.ts` exits 1 at the first importer; the Toronto park washroom directory was deleted before the read failed; no later importer runs | `npm run import` (now `scripts/import-failsafe.ts`) ran all 9 steps, kept the 3 affected sources' files, and wrote `.cache/failsafe/run-report.json` | "runs the steps after a failed step"; run in a temporary copy, see the PR |
| 17 | File over the size limit | write | `close()` throws after the file is already in `data/` | File never moved in; previous file kept and reported | "a staged file over the size limit" |
| 18 | Existing partition is corrupt and a run appends to it | write | Appends a new gzip member to an unreadable file | Corrupt file not carried forward; reported `unreadable_replaced` | "a corrupt existing file" |
| 19 | Malformed JSON line in a data file | count | `countNdjsonGz` throws; `COUNTS.md` is not rewritten | Unchanged by design: counts are published facts and are not computed from part of the data. The import wrapper isolates the count step and the previous counts stay. | covered by row 16's wrapper test |
| 20 | Malformed JSON line in a data file | pack | `buildWebPack` throws; no pack | That part listed in `manifest.withheld` with the line number; other parts packed; `verify:web-pack` passes | `test/failsafe/pack-tiles.test.ts` "malformed JSON line" |
| 21 | Truncated gzip | pack | Throws `unexpected end of file`; no pack | Part withheld; others packed | "truncated gzip" |
| 22 | Empty file (0 bytes) | pack | Throws `unexpected end of file`; no pack | Part withheld; others packed | "empty file" |
| 23 | Record with unknown tranche, in the wrong cell, out of range, or with no licence | pack | Throws `Partition mismatch` for the first two; the last two were packed | Part withheld with the record's line and reason | "unknown tranche in a record", "record in the wrong cell", "out-of-range coordinate", "missing licence" |
| 24 | `data/alerts/` present (current repository) | pack | Throws `Unexpected partition path: alerts/...` on the committed data | Skipped; not a record partition | "alert snapshots next to the partitions" |
| 25 | Malformed line or truncated file | tiles | `buildOfflineTiles` throws (`Expected property name`, `unexpected end of file`); no tile is written | File adds nothing and is reported; other files drawn; an invalid record is skipped and quarantined | "a truncated file adds nothing", "a malformed line drops that file", "an invalid record is skipped" |
| 26 | Source in `data/` but not in `sources/registry.json` | pack | Throws `Unregistered source`; no pack | Part withheld (no licence to ship it); others packed | "a source missing from the registry" |
| 27 | Overlay tile over 25 MiB (`data/tiles/odbl/places.pmtiles` is 26,842,801 bytes on main) | pack | After row 24 was fixed, the build on the committed data threw `Tile exceeds 25 MiB` | Tile withheld with its size; the record parts are packed | "an overlay tile over the size limit"; and the run on the committed data below |
| 28 | Pack part with the wrong hash, record failing validation on the device | app | See `docs/failsafe-audit.md` in access-main | | |

## Committed data

The new record check (`src/failsafe/record-check.ts`, including Ajv, the Ontario envelope, the region check and the source check) was run over every committed record on main at `4274cd0`: 1,599,133 records in 1,337 files, 0 rejected. Committed extents: latitude 41.441991 to 55.990752, longitude -95.29768 to -74.146943. The envelope is latitude 41 to 57.5 and longitude -96 to -73.5.

The pack was then built from the committed data on main at `af8f44a` with this branch: `npm run build:web-pack -- --out <temporary directory>` finished with 1,711,289 records in 406 cells and one withheld entry (the 26,842,801-byte ODbL overlay tile), and `npm run verify:web-pack` on that output printed "Web pack verified". On main the same build stops at `data/alerts/` (row 24).

## Not contained

- Isolation is per importer step, not per source inside an importer. If one ArcGIS layer fails inside `import-cities-g3.ts`, the other layers of that step keep their previous files too (nothing is lost, but nothing from that step is refreshed). Per-source isolation needs each job loop to catch its own error; the import lanes own those files.
- The count step fails closed on one corrupt file (row 19). That is deliberate.
