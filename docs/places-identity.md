# Same-place links and distinct places

Many places are in the data more than once: a park from OpenStreetMap and from the city's parks layer, a bus stop from a GTFS feed and from a city's stop-amenities layer. Each record is kept exactly as its source published it. A separate set of link files says which records, from different sources, describe the same real place. The links are used to count distinct places and to show one place page per real place, with every source's record side by side.

## Matcher (`npm run match:places`)

Code: `src/places/` (`normalize.ts`, `category.ts`, `match.ts`, `links.ts`) and `scripts/match-places.ts`.

It reads every venue, washroom and transit record and writes only `data/links/`. It never edits a record. Paths are not places and are not read.

1. **Candidates.** Records of different sources close together, found with a grid of about 110 m buckets. The radius is 100 m; 50 m where a bucket holds 120 or more place records (dense downtown blocks); 30 m when either record is a transit stop; 250 m when both are large-area places (park, campground, school, sports complex), whose points two sources often put far apart. Records of one source are never linked to each other: within-source duplicates are the importer's job.
2. **Class.** Each record gets a coarse class (park, library, transit, bench, parking, sports field, and so on) from its category words, whatever the source's taxonomy. Classes that cannot be the same place are never linked. Small point features (a stop, a washroom, a signal, a bench, a sports field, a bike-share dock) are linked only to the same kind of feature, never to a record of unknown category, because they often carry the name of the park or corner they are in. A bench is not linked to a picnic table, nor a parking lot to a parking stall.
3. **Name.** Names are compared on normalised tokens: case, accents, punctuation and apostrophes removed; "Inc", "Ltd", "the", "de" and similar dropped; street words and compass points folded ("Street", "St", "Saint" are one token); English and French forms folded (parc/park, bibliothèque/library, centre communautaire/community centre). Words that say what a place is rather than which one ("park", "centre", "library") count a quarter. A name made only of such words ("Splash Pad", "play structure") is treated as no name. Two names that state different kinds of place ("Riverdale Park" and "Riverdale Community Centre") or different school levels (elementary, secondary) are never linked.
4. **Address and identifiers.** When both records give a house number and street, a different number or street stops a match (the pair is listed as a possible duplicate). A shared published identifier (GTFS `stop_code`, a layer's `ref`) is strong evidence. For a pair of sources whose identifiers agree on at least half of their linked pairs (and at least 10), a different identifier stops a match.
5. **Transit stops.** "Opposite" on one name only, different platform numbers, different directions of travel, or a swapped street and cross street ("Mohawk at Upper Kenilworth" and "Upper Kenilworth at Mohawk") mean different stops. A platform or direction on one name only caps the pair at a possible duplicate.
6. **No distinctive name.** Without a usable name, a pair is linked only by an address, a shared identifier, or the same kind of small feature within 5 m.
7. **Ambiguity.** If a record matches two or more records of one other source with scores within 0.08, none of those matches is used. A match must also be the record's best match from that source.
8. **Clusters.** Matches are merged strongest first. Two groups merge only if no source would appear twice and every pair across them is at least a possible duplicate with no address conflict. Otherwise the edge is listed as a possible duplicate. Possible duplicates are never merged: under-merging adds a page, over-merging hides a place.

The run streams: pass 1 reads each file once and keeps a small per-cell working file in `.cache/places-match/`; pass 2 matches one 0.5-degree cell at a time with an edge margin from its eight neighbours. Each pair is evaluated exactly once. Everything is sorted by record key, so the output is the same for any input order (checked by a property test). On the data of 2026-11-16 at the first run (606,434 place records) a run took about 2 minutes on this 2-CPU machine, with a measured peak resident memory of about 0.9 GB.

## Link files

```
data/links/index.json                               method, parameters, input digest, file list (bytes, sha256, lines)
data/links/same-place/<cell>[.pN].jsonl.gz          one cluster per line, filed under the cell of its first member
data/links/possible-duplicates/<cell>[.pN].jsonl.gz one possible duplicate per line, under the cell of record a
```

The files use `.jsonl.gz`, so the record walkers (count, pack, tiles, data checks) that read `.ndjson.gz` never treat them as records. A cluster line:

```json
{"cluster":"venue|osm:way/1","method":"same-place-v1",
 "members":[{"tranche":"venue","id":"osm:way/1","source_id":"osm-ontario","cell":"n43.5_w079.5"},
            {"tranche":"venue","id":"toronto-parks-recreation-facilities:752","source_id":"toronto-parks-recreation-facilities","cell":"n43.5_w079.5"}],
 "evidence":[{"a":"venue|osm:way/1","b":"venue|toronto-parks-recreation-facilities:752","decision":"match","score":0.97,
              "distance_m":30.1,"radius_m":250,"name":1,"class_compat":1,"address":"unknown","code":"unknown",
              "reason":"name, distance and class agree"}]}
```

The cluster id is the key (`tranche|id`) of its first member in sort order. It changes only if a record that sorts earlier joins the cluster. Links carry no names or other values from the records, only record keys and the evidence numbers.

`index.json` stores `input_digest`, a SHA-256 over the sorted `path sha256` lines of every venue, washroom and transit file the run read. The count and the pack compare it with the data they read and say whether the links are current. A link to a record that is no longer in the data is ignored. A record added after the run counts as its own place until the matcher runs again.

## Distinct places (`npm run count`)

`counts.json` has a `distinct_places` object and `COUNTS.md` a "Distinct places" section. Definition (`src/count/distinct.ts`):

- A place record is a venue, washroom or transit record. Paths are not places.
- Distinct places = place records in no cluster + clusters with at least one record present.
- Possible duplicates are not merged; each side counts.
- A distinct place has a known accessibility fact when at least one of its records has a populated, non-derived accessibility field (the same field lists as the piece counts; UNKNOWN is not a fact).
- Per source: "only in this source" is the number of distinct places whose every record comes from that source (what the source alone adds); "shared" is the number of distinct places it shares with another source. Neither depends on the order sources were added.

The count reads every link file through `index.json` and stops if a file does not match its size, hash or line count, so a published count is never computed from part of the links.

## Evaluation

`npm run eval:places` reads `test/fixtures/places/labelled-pairs.jsonl` (record keys and a label only; no source values are copied) and the committed links, and prints precision and recall. A pair counts as predicted "same" when both records are in one cluster.

**Sample.** `scripts/places-eval.ts --sample` draws candidate pairs (records of different sources within the radius whose classes are compatible, and whose names score at least 0.25, or, without names, within 30 m), stratified by urban or rural (at least 150 place records in the surrounding ~1.1 km square) and by the matcher's band (match ≥ 0.85, match < 0.85, possible, rejected with a similar name, rejected otherwise). Ten strata, equal draws.

**Labels.** One person labelled each pair by reading both records (names, categories, addresses, identifiers, distance) without the score: "same" when both describe one physical place or feature; "different" for a part and its whole (a court in a park, a washroom in a library, a platform in a station), stops on different sides or streets, or different items; "unsure" when the records cannot tell. For unnamed small features of the same type the records cannot settle it, so the rule was: same within 5 m, unsure from 5 to 30 m. Those labels encode a judgement, not ground truth; results are reported with and without them.

**Two sets.** The figures below are for the links committed with this change, computed from main after the Statistics Canada, Province of Ontario and Overture imports (#72 to #78). The labelled pairs were drawn from the data before those imports. The tuning set (360 pairs, 285 judged) was labelled first and the rules were adjusted on it, so its figures are in-sample. The held-out set (200 pairs drawn later with another seed; the 17 already in the tuning set were dropped, leaving 183, 127 judged) was labelled before it was scored.

| Set | Judged | TP | FP | FN | TN | Precision | Recall | Weighted precision | Weighted recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tuning (in-sample) | 285 | 106 | 0 | 14 | 165 | 1.000 | 0.883 | 1.000 | 0.905 |
| Held-out, first scoring | 127 | 63 | 2 | 13 | 49 | 0.969 | 0.829 | 0.967 | 0.659 |
| Held-out, after fixes | 127 | 64 | 0 | 12 | 51 | 1.000 | 0.842 | 1.000 | 0.706 |

"Weighted" weights each stratum by its size in the candidate pool, so it estimates precision and recall over all candidate pairs rather than over the equal-sized strata.

The first held-out scoring is the out-of-sample result. Its two false merges (a bus-terminal stop and a "Southbound" rapid-transit platform; an outdoor skating rink and the park it is in) led to three fixes (direction-of-travel words on stops, the word "skating", and the stall/lot and furniture-type checks), after which the held-out set is no longer independent. All 14 false negatives of the tuning set, and 11 of the 12 of the held-out set after the fixes, are listed as possible duplicates.

| Held-out, after fixes | Judged | Precision | Recall |
| --- | ---: | ---: | ---: |
| Urban | 63 | 1.000 | 0.816 |
| Rural | 64 | 1.000 | 0.868 |
| Both records named | 68 | 1.000 | 0.853 |
| A side unnamed | 59 | 1.000 | 0.833 |

Limits:

- The sample is drawn from candidate pairs. A pair the candidate rules never consider (farther apart than the radius, or with incompatible classes) is in neither recall nor precision.
- 412 judged pairs give wide intervals; zero false merges in 127 held-out pairs is consistent with a false-merge rate of a few percent.
- The labelled pairs were drawn before the government-database and Overture imports. Those sources bring other taxonomies and many chain stores; the figures above do not cover them. A spot check of 25 Overture-OSM clusters (every 727th of 18,196, read by one person) found 24 clearly the same place and 1 uncertain (a park and a beach of the same name at the same point); that is a spot check, not a measured precision.

## Web pack

The pack carries the links (`src/pack/links.ts`). For every cell with packed records, `pack/v1/links/<cell>.json.gz` lists the clusters and possible duplicates that have a record in that cell; a cluster that spans two cells is in both files. `manifest.links` lists each file with its size, SHA-256 and counts, the method, the input and data digests and whether the links are current.

- Only records in a packed part are named. A record of a held source, in a withheld part, or no longer in the data is dropped from its cluster; a cluster left with fewer than two records is dropped, so the remaining record keeps its own page.
- If a committed link file does not match `index.json`, the pack carries no links (one page per record, nothing merged) and `manifest.withheld` gives the reason. The record parts are packed as usual.
- A cell's link file over the 25 MiB limit is withheld with its reason.
- `npm run verify:web-pack` checks every link file's size and hash, and that every member is a packed record in the cell it names, from a source in the pack; that every cluster has at least two members from different sources; and that a cluster is listed in the file of every cell it touches.

The place-page change that reads these files is in [place-page-clusters.md](place-page-clusters.md).
