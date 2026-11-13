# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. The same fact is not stored on two tranches.

Total pieces: **6,948,433**.
Total UNKNOWN gaps: **43,892,670**.
Derived values excluded from both totals: **3,566**.
Records: **1,416,313**.

The illustrative 500,000-piece target in master plan section 5.6 is a sizing example (venues 250,000, paths 100,000, transit 50,000, washrooms 100,000). This import's piece total is 6,948,433.
The piece total meets the illustrative total. The counts are not padded.
Tranches under their illustrative targets: washroom is 70,954 under its illustrative 100,000.

| Tranche | Records | Pieces | UNKNOWN gaps | Derived excluded | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 539715 | 2914937 | 20292808 | 0 | 250000 | 0 |
| washroom | 6287 | 29046 | 206294 | 3566 | 100000 | 70954 |
| path | 846525 | 3863020 | 23225780 | 0 | 100000 | 0 |
| transit | 23786 | 141430 | 167788 | 0 | 50000 | 0 |

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 2914937 | 0 | 0 | 0 | 0 |
| washroom | 29046 | 0 | 0 | 0 | 0 |
| path | 3863020 | 0 | 0 | 0 | 0 |
| transit | 0 | 141430 | 0 | 0 | 0 |

## Pieces by source and retrieval date

| Source | Records | Pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| gtfs-brampton | 2872 | 16917 | 20419 | 0 | 16917 | 2026-11-13 |
| gtfs-go-transit | 889 | 6151 | 5406 | 0 | 6151 | 2026-11-13 |
| gtfs-grt-bus | 2265 | 13750 | 15695 | 0 | 13750 | 2026-11-13 |
| gtfs-grt-ion | 32 | 159 | 257 | 0 | 159 | 2026-11-13 |
| gtfs-hsr | 2353 | 13993 | 16596 | 0 | 13993 | 2026-11-13 |
| gtfs-ltc | 1947 | 11625 | 13686 | 0 | 11625 | 2026-11-13 |
| gtfs-miway | 4066 | 22663 | 30195 | 0 | 22663 | 2026-11-13 |
| gtfs-ttc | 9357 | 56142 | 65499 | 0 | 56142 | 2026-11-13 |
| gtfs-up-express | 5 | 30 | 35 | 0 | 30 | 2026-11-13 |
| osm-ontario | 1392049 | 6802019 | 43711702 | 6802019 | 0 | 2026-11-13 |
| toronto-crem-washrooms | 119 | 1309 | 3213 | 1309 | 0 | 2026-11-13 |
| toronto-park-washrooms | 355 | 3651 | 9839 | 3651 | 0 | 2026-11-13 |
| toronto-street-washrooms | 4 | 24 | 128 | 24 | 0 | 2026-11-13 |

## Largest UNKNOWN gaps by field

### venue

- braille: 539715
- door_width: 539715
- handrail: 539715
- hearing_loop: 539715
- incline: 539715
- kerb_height: 539715
- ramp_stroller: 539715
- ramp_wheelchair: 539715
- step_count: 539715
- ramp: 539714
- speech_output: 539714
- elevator: 539713

### washroom

- locked: 6287
- addr_postcode: 6286
- adult_changing_table: 6286
- changing_table_fee: 6284
- supervised: 6284
- changing_table_location: 6283
- capacity: 6282
- shower: 6265
- addr_city: 6248
- addr_housenumber: 6236
- drinking_water: 6234
- addr_street: 6233

### path

- bidirectional: 846525
- from_ref: 846525
- max_slope: 846525
- min_width: 846525
- pathway_mode: 846525
- reversed_signposted_as: 846525
- signposted_as: 846525
- stair_count: 846525
- to_ref: 846525
- traversal_time_s: 846525
- wheelchair_description: 846490
- length_m: 846481

### transit

- level_id: 23786
- level_index: 23786
- level_name: 23786
- platform_code: 23629
- parent_station: 23610
- url: 22789
- description: 21564
- wheelchair_boarding: 3741
- stop_code: 1097
