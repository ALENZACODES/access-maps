# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. The same fact is not stored on two tranches.

Total pieces: **6,958,871**.
Accessibility-fact pieces: **1,192,420**.
Name, category, address, and geometry pieces: **5,766,451**.
Total UNKNOWN gaps: **43,938,499**.
UNKNOWN gaps on accessibility fields: **28,222,638**.
Derived values excluded from both totals: **3,566**.
Records: **1,417,632**.

The illustrative 500,000-piece target in master plan section 5.6 is a sizing example (venues 250,000, paths 100,000, transit 50,000, washrooms 100,000). This import's piece total is 6,958,871.
The piece total meets the illustrative total. The counts are not padded.
Tranches under their illustrative targets: washroom is 70,132 under its illustrative 100,000.

| Tranche | Records | Pieces | UNKNOWN gaps | Derived excluded | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 540944 | 2924553 | 20336039 | 0 | 250000 | 0 |
| washroom | 6377 | 29868 | 208892 | 3566 | 100000 | 70132 |
| path | 846525 | 3863020 | 23225780 | 0 | 100000 | 0 |
| transit | 23786 | 141430 | 167788 | 0 | 50000 | 0 |

## Accessibility facts

An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, automatic door, and the other fields listed in this report. Names, categories, addresses, hours, operators, coordinates, and geometry are pieces too, and they are counted apart from accessibility facts. toilets:wheelchair is stored on the washroom wheelchair field.

Accessibility facts and the other pieces add up to the total: 1,192,420 + 5,766,451 = 6,958,871.

| Tranche | Accessibility pieces | Accessibility-field gaps | Other pieces |
| --- | ---: | ---: | ---: |
| venue | 195072 | 13869472 | 2729481 |
| washroom | 5932 | 83346 | 23936 |
| path | 971371 | 14266079 | 2891649 |
| transit | 20045 | 3741 | 121385 |

Fields counted as accessibility facts:

- venue: wheelchair, wheelchair_description, entrance, automatic_door, door, door_width, ramp, ramp_wheelchair, ramp_stroller, step_count, incline, kerb, kerb_height, tactile_paving, handrail, width, access, surface, smoothness, lit, braille, hearing_loop, speech_output, stroller, capacity_disabled, elevator
- washroom: wheelchair, wheelchair_description, changing_table, changing_table_fee, changing_table_location, adult_changing_table, access, fee, unisex, male, female, locked, supervised, published_accessibility
- path: foot, surface, smoothness, incline, width, kerb, tactile_paving, lit, wheelchair, wheelchair_description, step_count, handrail, access, max_slope, min_width, stair_count, crossing, ramp
- transit: wheelchair_boarding

Populated accessibility facts by field:

### venue

- access: 87734
- surface: 62220
- entrance: 17633
- wheelchair: 12670
- lit: 7989
- capacity_disabled: 3497
- door: 2035
- wheelchair_description: 703
- kerb: 186
- smoothness: 132
- automatic_door: 93
- stroller: 51
- speech_output: 41
- width: 30
- ramp: 29
- elevator: 13
- tactile_paving: 13
- hearing_loop: 3

### washroom

- wheelchair: 2086
- access: 1107
- fee: 732
- unisex: 497
- changing_table: 443
- published_accessibility: 397
- male: 297
- female: 293
- wheelchair_description: 69
- changing_table_location: 4
- changing_table_fee: 3
- supervised: 3
- adult_changing_table: 1

### path

- crossing: 303536
- surface: 278258
- tactile_paving: 99435
- width: 67896
- kerb: 57242
- lit: 43742
- foot: 34632
- wheelchair: 26627
- smoothness: 25985
- incline: 14434
- access: 13480
- handrail: 2659
- step_count: 2038
- ramp: 1372
- wheelchair_description: 35

### transit

- wheelchair_boarding: 20045

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 2924553 | 0 | 0 | 0 | 0 |
| washroom | 29868 | 0 | 0 | 0 | 0 |
| path | 3863020 | 0 | 0 | 0 | 0 |
| transit | 0 | 141430 | 0 | 0 | 0 |

## Pieces by source and retrieval date

| Source | Records | Pieces | Accessibility pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| brampton-recreation-centres | 39 | 312 | 0 | 1365 | 312 | 0 | 2026-11-13 |
| gtfs-brampton | 2872 | 16917 | 2492 | 20419 | 0 | 16917 | 2026-11-13 |
| gtfs-go-transit | 889 | 6151 | 889 | 5406 | 0 | 6151 | 2026-11-13 |
| gtfs-grt-bus | 2265 | 13750 | 2251 | 15695 | 0 | 13750 | 2026-11-13 |
| gtfs-grt-ion | 32 | 159 | 31 | 257 | 0 | 159 | 2026-11-13 |
| gtfs-hsr | 2353 | 13993 | 0 | 16596 | 0 | 13993 | 2026-11-13 |
| gtfs-ltc | 1947 | 11625 | 1896 | 13686 | 0 | 11625 | 2026-11-13 |
| gtfs-miway | 4066 | 22663 | 3124 | 30195 | 0 | 22663 | 2026-11-13 |
| gtfs-ttc | 9357 | 56142 | 9357 | 65499 | 0 | 56142 | 2026-11-13 |
| gtfs-up-express | 5 | 30 | 5 | 35 | 0 | 30 | 2026-11-13 |
| kingston-accessible-features | 1003 | 8217 | 333 | 34702 | 8217 | 0 | 2026-11-13 |
| kingston-public-washrooms | 48 | 432 | 0 | 1392 | 432 | 0 | 2026-11-13 |
| mto-picnic-parks | 168 | 1005 | 0 | 6219 | 1005 | 0 | 2026-11-13 |
| osm-ontario | 1392049 | 6802019 | 1171449 | 43711702 | 6802019 | 0 | 2026-11-13 |
| sudbury-fieldhouses | 61 | 472 | 0 | 2151 | 472 | 0 | 2026-11-13 |
| toronto-crem-washrooms | 119 | 1309 | 238 | 3213 | 1309 | 0 | 2026-11-13 |
| toronto-park-washrooms | 355 | 3651 | 355 | 9839 | 3651 | 0 | 2026-11-13 |
| toronto-street-washrooms | 4 | 24 | 0 | 128 | 24 | 0 | 2026-11-13 |

## Largest UNKNOWN gaps by field

### venue

- braille: 540944
- door_width: 540944
- handrail: 540944
- incline: 540944
- kerb_height: 540944
- ramp_stroller: 540944
- ramp_wheelchair: 540944
- step_count: 540944
- hearing_loop: 540941
- elevator: 540931
- tactile_paving: 540931
- ramp: 540915

### washroom

- locked: 6377
- addr_postcode: 6376
- adult_changing_table: 6376
- changing_table_fee: 6374
- supervised: 6374
- changing_table_location: 6373
- capacity: 6372
- shower: 6355
- addr_city: 6338
- drinking_water: 6324
- wheelchair_description: 6308
- seasonal: 6252

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

## GTFS-RT accessibility alerts

These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Equipment is elevator or escalator only when the header text says so.

Alert records: **32**.
Elevator: **3**. Escalator: **29**. Both words: **0**. Equipment not stated: **0**.
Retrieval dates: 2026-11-13.
