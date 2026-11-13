# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. Section 5.6 counts only tier 2 and tier 3 values toward 500,000. Tier 0 and tier 1 accessibility facts are reported separately and are not verified.

Verified field-values toward the 500,000 target: **0**.
Tier 0 and tier 1 values count as 0 toward the 250,000 verified venue field-values and toward the 500,000 verified total. Section 5.6 counts tier 2 and tier 3 only.
Verified toward 500,000 is 0. None of those verified field-values exist in this import.
Open-data or operator-claimed physical accessibility facts (tier 0 and tier 1 only): **698,375**.
Context fields, reported separately (access, crossing, lit, fee, and the other context fields below): **494,045**.
All other populated values: **5,765,623**.
All populated pieces together: **6,958,043**.
Total UNKNOWN gaps: **43,945,704**.
UNKNOWN gaps on accessibility fields: **24,197,679**.
Derived values excluded from both totals: **3,566**.
Records: **1,417,632**.

The illustrative targets are 250,000 venue, 100,000 path, 50,000 transit, and 100,000 washroom verified field-values. Shortfall is the target minus verified values.

| Tranche | Records | Physical accessibility facts (tier 0–1) | Context fields | Other populated | Verified (tier 2–3) | UNKNOWN gaps | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 540944 | 99349 | 95723 | 2729376 | 0 | 20336144 | 250000 | 250000 |
| washroom | 6377 | 3000 | 2932 | 23213 | 0 | 215992 | 100000 | 100000 |
| path | 846525 | 575981 | 395390 | 2891649 | 0 | 23225780 | 100000 | 100000 |
| transit | 23786 | 20045 | 0 | 121385 | 0 | 167788 | 50000 | 50000 |

## Accessibility facts

An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, or automatic door. toilets:wheelchair is stored on the washroom wheelchair field. Legal access, crossing, lighting, fees, foot permission, and washroom audience or supervision are context fields and are counted on their own line. Names, categories, addresses, hours, operators, coordinates, and geometry are counted apart from both.

Physical accessibility facts, context fields, and the remaining pieces add up to the total: 698,375 + 494,045 + 5,765,623 = 6,958,043.

| Tranche | Physical accessibility pieces | Context pieces | Remaining pieces |
| --- | ---: | ---: | ---: |
| venue | 99349 | 95723 | 2729376 |
| washroom | 3000 | 2932 | 23213 |
| path | 575981 | 395390 | 2891649 |
| transit | 20045 | 0 | 121385 |

Context fields are populated values that are not a physical access measurement: access, crossing, lit, foot, fee, changing_table_fee, unisex, male, female, locked, and supervised. They are not accessibility facts and they are not names or geometry.

Fields counted as context, not as accessibility facts:

- venue: access, lit
- washroom: access, fee, changing_table_fee, unisex, male, female, locked, supervised
- path: foot, access, lit, crossing
- transit: none

Populated context fields:

### venue

- access: 87734
- lit: 7989

### washroom

- access: 1107
- fee: 732
- unisex: 497
- male: 297
- female: 293
- changing_table_fee: 3
- supervised: 3

### path

- crossing: 303536
- lit: 43742
- foot: 34632
- access: 13480

### transit

No populated context fields.

Fields counted as accessibility facts:

- venue: wheelchair, wheelchair_description, entrance, automatic_door, door, door_width, ramp, ramp_wheelchair, ramp_stroller, step_count, incline, kerb, kerb_height, tactile_paving, handrail, width, surface, smoothness, braille, hearing_loop, speech_output, stroller, capacity_disabled, elevator
- washroom: wheelchair, wheelchair_description, changing_table, changing_table_location, adult_changing_table, published_accessibility
- path: surface, smoothness, incline, width, kerb, tactile_paving, wheelchair, wheelchair_description, step_count, handrail, max_slope, min_width, stair_count, ramp
- transit: wheelchair_boarding

Populated accessibility facts by field:

### venue

- surface: 62220
- entrance: 17633
- wheelchair: 12670
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
- changing_table: 443
- published_accessibility: 397
- wheelchair_description: 69
- changing_table_location: 4
- adult_changing_table: 1

### path

- surface: 278258
- tactile_paving: 99435
- width: 67896
- kerb: 57242
- wheelchair: 26627
- smoothness: 25985
- incline: 14434
- handrail: 2659
- step_count: 2038
- ramp: 1372
- wheelchair_description: 35

### transit

- wheelchair_boarding: 20045

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 2924448 | 0 | 0 | 0 | 0 |
| washroom | 29145 | 0 | 0 | 0 | 0 |
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
| kingston-accessible-features | 1003 | 8198 | 277 | 34763 | 8198 | 0 | 2026-11-13 |
| kingston-public-washrooms | 48 | 432 | 0 | 1440 | 432 | 0 | 2026-11-13 |
| mto-picnic-parks | 168 | 1005 | 0 | 6219 | 1005 | 0 | 2026-11-13 |
| osm-ontario | 1392049 | 6800847 | 677579 | 43718683 | 6800847 | 0 | 2026-11-13 |
| sudbury-fieldhouses | 61 | 480 | 0 | 2143 | 480 | 0 | 2026-11-13 |
| toronto-crem-washrooms | 119 | 1309 | 119 | 3332 | 1309 | 0 | 2026-11-13 |
| toronto-park-washrooms | 355 | 4006 | 355 | 9839 | 4006 | 0 | 2026-11-13 |
| toronto-street-washrooms | 4 | 24 | 0 | 132 | 24 | 0 | 2026-11-13 |

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

These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Each row is one alert from the TTC accessibility endpoint, validated by schema/service-alert.schema.json. Equipment is elevator or escalator only when the header text says so.

Alert records: **32**.
Elevator: **3**. Escalator: **29**. Both words: **0**. Equipment not stated: **0**.
Retrieval dates: 2026-11-13.
