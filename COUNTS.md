# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. Section 5.6 counts only tier 2 and tier 3 values toward 500,000. Tier 0 and tier 1 accessibility facts are reported separately and are not verified.

Verified field-values toward the 500,000 target: **0**.
Tier 0 and tier 1 values count as 0 toward the 250,000 verified venue field-values and toward the 500,000 verified total. Section 5.6 counts tier 2 and tier 3 only.
Verified toward 500,000 is 0. None of those verified field-values exist in this import.
Open-data or operator-claimed physical accessibility facts (tier 0 and tier 1 only): **727,568**.
Context fields, reported separately (access, crossing, lit, fee, and the other context fields below): **504,756**.
All other populated values: **6,279,485**.
All populated pieces together: **7,511,809**.
Total UNKNOWN gaps: **46,681,971**.
UNKNOWN gaps on accessibility fields: **25,671,503**.
Derived values excluded from both totals: **4,133**.
Records: **1,516,669**.

The illustrative targets are 250,000 venue, 100,000 path, 50,000 transit, and 100,000 washroom verified field-values. Shortfall is the target minus verified values.

| Tranche | Records | Physical accessibility facts (tier 0–1) | Context fields | Other populated | Verified (tier 2–3) | UNKNOWN gaps | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 556364 | 109579 | 96113 | 2827528 | 0 | 20890432 | 250000 | 250000 |
| washroom | 6746 | 3554 | 2941 | 26607 | 0 | 225859 | 100000 | 100000 |
| path | 927100 | 594622 | 405702 | 3284982 | 0 | 25381894 | 100000 | 100000 |
| transit | 26459 | 19813 | 0 | 140368 | 0 | 183786 | 50000 | 50000 |

## Accessibility facts

An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, or automatic door. toilets:wheelchair is stored on the washroom wheelchair field. Legal access, crossing, lighting, fees, foot permission, and washroom audience or supervision are context fields and are counted on their own line. Names, categories, addresses, hours, operators, coordinates, and geometry are counted apart from both.

Physical accessibility facts, context fields, and the remaining pieces add up to the total: 727,568 + 504,756 + 6,279,485 = 7,511,809.

| Tranche | Physical accessibility pieces | Context pieces | Remaining pieces |
| --- | ---: | ---: | ---: |
| venue | 109579 | 96113 | 2827528 |
| washroom | 3554 | 2941 | 26607 |
| path | 594622 | 405702 | 3284982 |
| transit | 19813 | 0 | 140368 |

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
- lit: 44748
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
- capacity_disabled: 3905
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

- surface: 287687
- tactile_paving: 99435
- width: 73557
- kerb: 57242
- wheelchair: 26627
- smoothness: 25985
- incline: 14434
- wheelchair_description: 3586
- handrail: 2659
- step_count: 2038
- ramp: 1372

### transit

- wheelchair_boarding: 19813

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 3033220 | 0 | 0 | 0 | 0 |
| washroom | 33102 | 0 | 0 | 0 | 0 |
| path | 4285306 | 0 | 0 | 0 | 0 |
| transit | 0 | 160181 | 0 | 0 | 0 |

## Pieces by source and retrieval date

| Source | Records | Pieces | Accessibility pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ajax-playgrounds | 81 | 486 | 0 | 2997 | 486 | 0 | 2026-11-16 |
| ajax-recreational-trails | 1073 | 6730 | 2119 | 27606 | 6730 | 0 | 2026-11-16 |
| ajax-town-facilities | 56 | 440 | 0 | 1968 | 440 | 0 | 2026-11-16 |
| brampton-recreation-centres | 39 | 312 | 0 | 1365 | 312 | 0 | 2026-11-13 |
| gtfs-brampton | 2872 | 16917 | 2492 | 20419 | 0 | 16917 | 2026-11-13 |
| gtfs-drt | 1912 | 11472 | 1912 | 13384 | 0 | 11472 | 2026-11-16 |
| gtfs-grt-bus | 2265 | 13750 | 2251 | 15695 | 0 | 13750 | 2026-11-13 |
| gtfs-grt-ion | 32 | 159 | 31 | 257 | 0 | 159 | 2026-11-13 |
| gtfs-hsr | 2353 | 13993 | 0 | 16596 | 0 | 13993 | 2026-11-13 |
| gtfs-ltc | 1947 | 11625 | 1896 | 13686 | 0 | 11625 | 2026-11-13 |
| gtfs-ttc | 9357 | 56142 | 9357 | 65499 | 0 | 56142 | 2026-11-13 |
| kingston-accessible-features | 1003 | 8198 | 277 | 34763 | 8198 | 0 | 2026-11-13 |
| kingston-public-washrooms | 48 | 432 | 0 | 1440 | 432 | 0 | 2026-11-13 |
| markham-city-facilities | 82 | 574 | 0 | 2952 | 574 | 0 | 2026-11-16 |
| markham-trails | 3075 | 15240 | 2994 | 83160 | 15240 | 0 | 2026-11-16 |
| metrolinx-go | 889 | 6151 | 889 | 5406 | 0 | 6151 | 2026-11-15 |
| metrolinx-up | 5 | 30 | 5 | 35 | 0 | 30 | 2026-11-15 |
| mto-picnic-parks | 168 | 1005 | 0 | 6219 | 1005 | 0 | 2026-11-13 |
| newmarket-landmarks | 35 | 244 | 0 | 1261 | 244 | 0 | 2026-11-16 |
| newmarket-park-features | 281 | 1715 | 0 | 10320 | 1715 | 0 | 2026-11-16 |
| newmarket-trail-points | 268 | 1337 | 0 | 10143 | 1337 | 0 | 2026-11-16 |
| newmarket-trails | 739 | 2956 | 739 | 20692 | 2956 | 0 | 2026-11-16 |
| oshawa-community-centres | 20 | 140 | 0 | 720 | 140 | 0 | 2026-11-16 |
| oshawa-trails | 299 | 897 | 0 | 8671 | 897 | 0 | 2026-11-16 |
| osm-ontario | 1392049 | 6802010 | 677579 | 43717520 | 6802010 | 0 | 2026-11-13 |
| ottawa-park-parking | 408 | 4694 | 1047 | 12850 | 4694 | 0 | 2026-11-16 |
| ottawa-parks-inventory | 7916 | 51047 | 7113 | 289341 | 51047 | 0 | 2026-11-16 |
| ottawa-public-washrooms | 186 | 1988 | 545 | 5266 | 1988 | 0 | 2026-11-16 |
| pickering-facilities | 28 | 250 | 0 | 954 | 250 | 0 | 2026-11-16 |
| pickering-parks | 201 | 1392 | 0 | 7095 | 1392 | 0 | 2026-11-16 |
| sudbury-fieldhouses | 61 | 480 | 0 | 2143 | 480 | 0 | 2026-11-13 |
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
| whitby-parks | 174 | 1273 | 14 | 5951 | 1273 | 0 | 2026-11-16 |
| whitby-sidewalks | 3578 | 28370 | 10680 | 86126 | 28370 | 0 | 2026-11-16 |
| whitby-town-facilities | 27 | 268 | 0 | 893 | 268 | 0 | 2026-11-16 |
| whitby-trails | 1062 | 6337 | 2109 | 27647 | 6337 | 0 | 2026-11-16 |
| york-region-yrt-bus-stops | 4827 | 29942 | 980 | 32809 | 0 | 29942 | 2026-11-16 |

## Largest UNKNOWN gaps by field

### venue

- braille: 556364
- door_width: 556364
- handrail: 556364
- incline: 556364
- kerb_height: 556364
- ramp_stroller: 556364
- ramp_wheelchair: 556364
- step_count: 556364
- hearing_loop: 556361
- elevator: 556351
- tactile_paving: 556351
- ramp: 556335

### washroom

- locked: 6746
- changing_table_fee: 6743
- supervised: 6743
- changing_table_location: 6742
- capacity: 6741
- shower: 6724
- addr_city: 6707
- drinking_water: 6693
- wheelchair_description: 6677
- addr_postcode: 6654
- indoor: 6620
- adult_changing_table: 6570

### path

- bidirectional: 927100
- from_ref: 927100
- max_slope: 927100
- min_width: 927100
- pathway_mode: 927100
- reversed_signposted_as: 927100
- signposted_as: 927100
- stair_count: 927100
- to_ref: 927100
- traversal_time_s: 927100
- ramp: 925728
- step_count: 925062

### transit

- level_id: 26459
- level_index: 26459
- level_name: 26459
- platform_code: 26445
- parent_station: 26291
- url: 25462
- description: 19410
- wheelchair_boarding: 6646
- stop_code: 155

## GTFS-RT accessibility alerts

These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Each row is one alert from the TTC accessibility endpoint, validated by schema/service-alert.schema.json. Equipment is elevator or escalator only when the header text says so.

Alert records: **32**.
Elevator: **3**. Escalator: **29**. Both words: **0**. Equipment not stated: **0**.
Retrieval dates: 2026-11-13.
