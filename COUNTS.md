# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. Section 5.6 counts only tier 2 and tier 3 values toward 500,000. Tier 0 and tier 1 accessibility facts are reported separately and are not verified.

Verified field-values toward the 500,000 target: **0**.
Tier 0 and tier 1 values count as 0 toward the 250,000 verified venue field-values and toward the 500,000 verified total. Section 5.6 counts tier 2 and tier 3 only.
Verified toward 500,000 is 0. None of those verified field-values exist in this import.
Open-data or operator-claimed physical accessibility facts (tier 0 and tier 1 only): **714,352**.
Context fields, reported separately (access, crossing, lit, fee, and the other context fields below): **503,750**.
All other populated values: **6,252,807**.
All populated pieces together: **7,470,909**.
Total UNKNOWN gaps: **46,686,778**.
UNKNOWN gaps on accessibility fields: **25,694,606**.
Derived values excluded from both totals: **3,995**.
Records: **1,512,551**.

The illustrative targets are 250,000 venue, 100,000 path, 50,000 transit, and 100,000 washroom verified field-values. Shortfall is the target minus verified values.

| Tranche | Records | Physical accessibility facts (tier 0–1) | Context fields | Other populated | Verified (tier 2–3) | UNKNOWN gaps | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 556764 | 109606 | 96113 | 2833982 | 0 | 20901151 | 250000 | 250000 |
| washroom | 6654 | 3554 | 2941 | 26138 | 0 | 222878 | 100000 | 100000 |
| path | 927505 | 584271 | 404696 | 3283209 | 0 | 25407984 | 100000 | 100000 |
| transit | 21628 | 16921 | 0 | 109478 | 0 | 154765 | 50000 | 50000 |

## Accessibility facts

An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, or automatic door. toilets:wheelchair is stored on the washroom wheelchair field. Legal access, crossing, lighting, fees, foot permission, and washroom audience or supervision are context fields and are counted on their own line. Names, categories, addresses, hours, operators, coordinates, and geometry are counted apart from both.

Physical accessibility facts, context fields, and the remaining pieces add up to the total: 714,352 + 503,750 + 6,252,807 = 7,470,909.

| Tranche | Physical accessibility pieces | Context pieces | Remaining pieces |
| --- | ---: | ---: | ---: |
| venue | 109606 | 96113 | 2833982 |
| washroom | 3554 | 2941 | 26138 |
| path | 584271 | 404696 | 3283209 |
| transit | 16921 | 0 | 109478 |

Context fields are populated values that are not a physical access measurement: access, crossing, lit, foot, fee, changing_table_fee, unisex, male, female, locked, and supervised. They are not accessibility facts and they are not names or geometry.

Fields counted as context, not as accessibility facts:

- venue: access, lit
- washroom: access, fee, changing_table_fee, unisex, male, female, locked, supervised
- path: foot, access, lit, crossing
- transit: none

Populated context fields:

### venue

- access: 87734
- lit: 8379

### washroom

- access: 1107
- fee: 732
- unisex: 506
- male: 297
- female: 293
- changing_table_fee: 3
- supervised: 3

### path

- crossing: 312842
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

- surface: 62658
- entrance: 17633
- wheelchair: 12670
- wheelchair_description: 8680
- capacity_disabled: 3932
- door: 2035
- speech_output: 1448
- kerb: 186
- smoothness: 132
- automatic_door: 93
- stroller: 51
- width: 30
- ramp: 29
- elevator: 13
- tactile_paving: 13
- hearing_loop: 3

### washroom

- wheelchair: 2086
- changing_table: 627
- published_accessibility: 592
- adult_changing_table: 176
- wheelchair_description: 69
- changing_table_location: 4

### path

- surface: 283397
- tactile_paving: 99435
- width: 67896
- kerb: 57242
- wheelchair: 26627
- smoothness: 25985
- incline: 14434
- wheelchair_description: 3134
- handrail: 2711
- step_count: 2038
- ramp: 1372

### transit

- wheelchair_boarding: 16921

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 3039701 | 0 | 0 | 0 | 0 |
| washroom | 32633 | 0 | 0 | 0 | 0 |
| path | 4272176 | 0 | 0 | 0 | 0 |
| transit | 0 | 126399 | 0 | 0 | 0 |

## Pieces by source and retrieval date

| Source | Records | Pieces | Accessibility pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| brampton-recreation-centres | 39 | 312 | 0 | 1365 | 312 | 0 | 2026-11-13 |
| greater-sudbury-playgrounds | 178 | 1354 | 14 | 6300 | 1354 | 0 | 2026-11-16 |
| greater-sudbury-recreation | 499 | 4343 | 0 | 17114 | 4343 | 0 | 2026-11-16 |
| greater-sudbury-walkways | 5456 | 28586 | 8202 | 146006 | 28586 | 0 | 2026-11-16 |
| gtfs-brampton | 2872 | 16917 | 2492 | 20419 | 0 | 16917 | 2026-11-13 |
| gtfs-gova | 1121 | 4484 | 0 | 10089 | 0 | 4484 | 2026-11-16 |
| gtfs-grt-bus | 2265 | 13750 | 2251 | 15695 | 0 | 13750 | 2026-11-13 |
| gtfs-grt-ion | 32 | 159 | 31 | 257 | 0 | 159 | 2026-11-13 |
| gtfs-hsr | 2353 | 13993 | 0 | 16596 | 0 | 13993 | 2026-11-13 |
| gtfs-kingston | 787 | 3148 | 0 | 7083 | 0 | 3148 | 2026-11-16 |
| gtfs-ltc | 1947 | 11625 | 1896 | 13686 | 0 | 11625 | 2026-11-13 |
| gtfs-ttc | 9357 | 56142 | 9357 | 65499 | 0 | 56142 | 2026-11-13 |
| kingston-accessible-features | 1003 | 8198 | 277 | 34763 | 8198 | 0 | 2026-11-13 |
| kingston-parking-lots | 56 | 400 | 27 | 2008 | 400 | 0 | 2026-11-16 |
| kingston-points-of-interest | 766 | 7600 | 0 | 25338 | 7600 | 0 | 2026-11-16 |
| kingston-public-washrooms | 48 | 432 | 0 | 1440 | 432 | 0 | 2026-11-13 |
| kingston-trails | 89 | 530 | 88 | 2318 | 530 | 0 | 2026-11-16 |
| metrolinx-go | 889 | 6151 | 889 | 5406 | 0 | 6151 | 2026-11-15 |
| metrolinx-up | 5 | 30 | 5 | 35 | 0 | 30 | 2026-11-15 |
| mto-picnic-parks | 168 | 1005 | 0 | 6219 | 1005 | 0 | 2026-11-13 |
| osm-ontario | 1392049 | 6802010 | 677579 | 43717520 | 6802010 | 0 | 2026-11-13 |
| ottawa-park-parking | 408 | 4694 | 1047 | 12850 | 4694 | 0 | 2026-11-16 |
| ottawa-parks-inventory | 7916 | 51047 | 7113 | 289341 | 51047 | 0 | 2026-11-16 |
| ottawa-public-washrooms | 186 | 1988 | 545 | 5266 | 1988 | 0 | 2026-11-16 |
| sudbury-fieldhouses | 61 | 480 | 0 | 2143 | 480 | 0 | 2026-11-13 |
| thunder-bay-city-facilities | 62 | 434 | 0 | 2232 | 434 | 0 | 2026-11-16 |
| thunder-bay-sidewalks | 3870 | 15480 | 0 | 108360 | 15480 | 0 | 2026-11-16 |
| thunder-bay-trails | 816 | 2804 | 0 | 23308 | 2804 | 0 | 2026-11-16 |
| toronto-accessible-parking-stalls | 669 | 3984 | 649 | 24783 | 3984 | 0 | 2026-11-16 |
| toronto-community-centre-washrooms | 9 | 108 | 9 | 243 | 108 | 0 | 2026-11-16 |
| toronto-crem-washrooms | 119 | 1309 | 119 | 3332 | 1309 | 0 | 2026-11-16 |
| toronto-drinking-fountains | 802 | 7235 | 0 | 27251 | 7235 | 0 | 2026-11-16 |
| toronto-library-branches | 182 | 1665 | 0 | 5669 | 1665 | 0 | 2026-11-16 |
| toronto-park-washrooms | 355 | 3746 | 355 | 9834 | 3746 | 0 | 2026-11-16 |
| toronto-parks-recreation-facilities | 1801 | 16201 | 0 | 61242 | 16201 | 0 | 2026-11-16 |
| toronto-pedestrian-network | 70749 | 361756 | 0 | 1902212 | 361756 | 0 | 2026-11-16 |
| toronto-street-washrooms | 4 | 24 | 0 | 132 | 24 | 0 | 2026-11-16 |
| toronto-traffic-signals | 2563 | 16785 | 1407 | 93424 | 16785 | 0 | 2026-11-16 |

## Largest UNKNOWN gaps by field

### venue

- braille: 556764
- door_width: 556764
- handrail: 556764
- incline: 556764
- kerb_height: 556764
- ramp_stroller: 556764
- ramp_wheelchair: 556764
- step_count: 556764
- hearing_loop: 556761
- elevator: 556751
- tactile_paving: 556751
- ramp: 556735

### washroom

- locked: 6654
- changing_table_fee: 6651
- supervised: 6651
- changing_table_location: 6650
- capacity: 6649
- shower: 6632
- addr_city: 6615
- drinking_water: 6601
- wheelchair_description: 6585
- addr_postcode: 6562
- indoor: 6528
- adult_changing_table: 6478

### path

- bidirectional: 927505
- from_ref: 927505
- max_slope: 927505
- min_width: 927505
- pathway_mode: 927505
- reversed_signposted_as: 927505
- stair_count: 927505
- to_ref: 927505
- traversal_time_s: 927505
- signposted_as: 927061
- ramp: 926133
- step_count: 925467

### transit

- level_id: 21628
- level_index: 21628
- level_name: 21628
- platform_code: 21614
- parent_station: 21460
- url: 20631
- description: 19406
- wheelchair_boarding: 4707
- stop_code: 2063

## GTFS-RT accessibility alerts

These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Each row is one alert from the TTC accessibility endpoint, validated by schema/service-alert.schema.json. Equipment is elevator or escalator only when the header text says so.

Alert records: **32**.
Elevator: **3**. Escalator: **29**. Both words: **0**. Equipment not stated: **0**.
Retrieval dates: 2026-11-13.
