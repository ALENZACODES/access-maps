# Fail-safe data pipeline

Sources fail. A city portal returns HTTP 503 halfway through, a layer comes back empty, a feed adds a column we do not expect, a file is cut short. This pipeline cannot stop that. What it does is make every failure safe: no single bad record, file, download or source can break an import, a pack or the tiles, change or drop other good data, or be published as a fact. A failure stays in the smallest unit the pipeline can isolate, is written down with its reason, and leaves the last known-good data in place.

The device side (download, integrity check, IndexedDB, render) is in access-main `docs/failsafe.md`. What one bad unit did before these changes, as observed by running it, is in [failsafe-audit.md](failsafe-audit.md).

## Guarantees

### Import (`npm run import`)

1. **Per record.** `commitRecord` scrubs each record, then checks it (`src/failsafe/record-check.ts`): structure, a source, licence, date and tier 0 to 4 on every field, the JSON Schema, no NaN or Infinity, latitude and longitude both numbers inside a box around Ontario (latitude 41 to 57.5, longitude -96 to -73.5), path vertices inside the same box, the region cell holds the point, and every field carries the importing source. A record that fails is appended to `.cache/failsafe/quarantine.ndjson` with the reason and is not written. The records before and after it are written. A second record with an id already written in the run is quarantined as `duplicate_id`.
2. **Atomic writes.** Records are written to `.cache/failsafe/staging/`. When the importer closes its writer, each staged file is read back in full (decompress, parse every line, count, size, SHA-256). Only then is it moved into `data/`: a whole source directory is swapped for a source being replaced, a single file otherwise. A file that fails the read-back, or is over 24 MiB, is not moved in, and the previous files stay.
3. **Last known-good.** `resetSourceDirs` no longer deletes anything. The old directory stays until the new one has verified. If the refreshed source returned no records, or fewer than half of the records it had (`ACCESS_FAILSAFE_MIN_RATIO`, default `0.5`), the old directory stays and the run report says why. After checking the source, a person can let it shrink with `ACCESS_FAILSAFE_ALLOW_DROP=<source_id>[,<source_id>]`.
4. **Per source.** Inside each importer (`scripts/import-municipal.ts`, `import-more-municipal.ts`, `import-city-open-data.ts`, `import-cities-*.ts`, `import-york-durham-cities.ts`, `import-gtfs.ts`, `import-statcan-lode.ts`, `import-ontario-geohub.ts`, `import-ontario-catalogue.ts`), every source runs through `PerSourceRun` (`src/failsafe/per-source.ts`) with its own `PartitionWriter` inside `runIsolated`. A source that throws (a missing or cut-short download, an HTTP error, a parse error, a duplicate id) is abandoned on its own: its directories keep their last known-good files, the run report gets a `step_failed` outcome named `<importer>/<source_id>` and a `kept_last_known_good` outcome for each of its directories, and the next source still runs. Sources that finished are committed as soon as they finish. After the loop the importer throws once, naming every failed source, so the step is still marked failed. `scripts/import-osm.ts` imports one source, so its step is its unit.
5. **Per step.** `npm run import` (`scripts/import-failsafe.ts`) reads the `await step(repoRoot)` calls in `scripts/import-all.ts` and runs them one at a time. A step that throws (an HTTP error, a missing download, a parse error) is recorded, the directories it was replacing keep their previous files, and the next step runs. The exit code is 1 when a step failed; `--strict` also exits 1 when anything was quarantined or kept back. `npm run import:unguarded` runs `import-all.ts` directly, as before.

### Pack (`npm run build:web-pack`)

6. **Per part.** Each partition is read to the end and every record is checked again (without the JSON Schema, with the partition's tranche, cell and source). A part that does not decompress, is empty, has a line that is not JSON, or has a record that fails is left out of the manifest and listed in `manifest.withheld` with its path, source, tranche, cell and reason. Every other part is packed. A source missing from `sources/registry.json` is withheld instead of stopping the build. `data/alerts/`, `data/tiles/` and `data/schedules/` are not record partitions and are skipped. An overlay tile over 25 MiB, or a file in `data/tiles/` with an unexpected name, is withheld; the record parts are still packed. `npm run build:tiles` splits a family by latitude band, then longitude band, so no tile it writes reaches 25 MiB, and it builds every file of a family before writing any.
7. **Checksums.** Every part and search index in the manifest carries its byte size, SHA-256 and record count. `npm run verify:web-pack` re-reads them, and rejects a manifest that lists a withheld part. The app checks the same size, hash and count before storing a part.

### Tiles (`npm run build:tiles`)

8. **Per file and per record.** A file that does not decompress or has a line that is not JSON adds nothing to the overlay and is reported; the other files are drawn. A record that fails its check is skipped and quarantined. Tiles are written through a temporary file and a rename, so a failed write leaves the previous tile.

## Not guaranteed

- **Freshness or completeness.** Last known-good data is the last copy that verified, not today's data. Kept records keep their own `retrieved_at` dates, so their age stays in the data.
- **Counts from part of the data.** `scripts/count.ts` still stops on a corrupt file, on purpose: a published count is never computed from part of the data. The previous `COUNTS.md` and `counts.json` stay, and the run report shows the failed step.
- **Truth of a value.** The checks catch values that cannot be right (a point in the ocean, a missing licence). They cannot tell whether a published "yes" is true.
- **Records inside a withheld part.** At the pack step the unit is the part (one source in one cell): one bad record withholds its part, because the app downloads the part file as it is. The import step makes this rare, because a record that fails the same check never reaches `data/`.

## Reading the run report and the quarantine

Both are under `.cache/failsafe/` (gitignored; set `ACCESS_FAILSAFE_DIR` to move them).

`run-report.json`:

```json
{
  "started_at": "…", "finished_at": "…",
  "status": "clean | contained | failed",
  "quarantined": { "total": 3, "by_source": { "<source_id>": { "coordinate_range": 2, "duplicate_id": 1 } } },
  "outcomes": [
    { "step": "write", "source_id": "<source_id>", "target": "washrooms/<source_id>", "status": "replaced", "before": 120, "after": 118, "files": [{ "path": "n43.5_w079.5.ndjson.gz", "bytes": 4100, "sha256": "…", "records": 118 }] },
    { "step": "write", "target": "venues/<source_id>", "status": "kept_last_known_good", "before": 800, "after": 0, "reason": "the source returned no records; the previous files were kept" },
    { "step": "importGtfs", "status": "step_failed", "reason": "…" }
  ]
}
```

- `clean`: nothing was quarantined or kept back. `contained`: something was, and everything else landed. `failed`: a step threw; the others ran.
- `replaced`, `appended`, `unchanged`: data moved in normally.
- `kept_last_known_good`: the previous files stayed; read `reason`.
- `unreadable_replaced`: an existing file could not be read, so it was not appended to; this run's records replaced it.
- `withheld`: the pack or the tiles left a file out; read `reason`.

`quarantine.ndjson` has one line per quarantined record: `run` (the report's `started_at`), `stage` (`import` or `tiles`), `source_id`, `tranche`, `id`, `code`, `reason`, and the scrubbed record (the first 2,000 characters for a line that did not parse). Codes: `not_object`, `bad_id`, `unknown_tranche`, `bad_region`, `schema`, `missing_provenance`, `provenance_mismatch`, `non_finite`, `coordinate_range`, `region_mismatch`, `duplicate_id`. The file is appended to across runs; filter by `run`.

## Tests

`npm run check:failsafe` (`vitest run test/failsafe`) injects each fault from the audit against fixtures and checks that it stays contained, plus a 300-seed fuzz of `commitRecord`. `test/failsafe/per-source.test.ts` runs the Toronto, Ottawa, GTFS, city layer, Statistics Canada LODE, Ontario GeoHub and Ontario Data Catalogue file importers on fixture caches in a temporary directory with one source broken (a missing download, a cut-short cache file, a file that is not a zip, a throw after one record) and checks that the other sources are refreshed, the broken one keeps its files byte for byte, and the report names it. It also checks that no multi-source importer opens a shared writer. The same files run inside `npm test`, so CI runs them on every pull request.
