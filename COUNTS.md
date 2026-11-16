# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. Section 5.6 counts only tier 2 and tier 3 values toward 500,000. Tier 0 and tier 1 accessibility facts are reported separately and are not verified.

Verified field-values toward the 500,000 target: **0**.
Tier 0 and tier 1 values count as 0 toward the 250,000 verified venue field-values and toward the 500,000 verified total. Section 5.6 counts tier 2 and tier 3 only.
Verified toward 500,000 is 0. None of those verified field-values exist in this import.
Open-data or operator-claimed physical accessibility facts (tier 0 and tier 1 only): **722,377**.
Context fields, reported separately (access, crossing, lit, fee, and the other context fields below): **503,750**.
All other populated values: **6,482,921**.
All populated pieces together: **7,709,048**.
Total UNKNOWN gaps: **48,295,663**.
UNKNOWN gaps on accessibility fields: **26,488,370**.
Derived values excluded from both totals: **3,995**.
Records: **1,571,422**.

The illustrative targets are 250,000 venue, 100,000 path, 50,000 transit, and 100,000 washroom verified field-values. Shortfall is the target minus verified values.

| Tranche | Records | Physical accessibility facts (tier 0–1) | Context fields | Other populated | Verified (tier 2–3) | UNKNOWN gaps | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 558395 | 111957 | 96113 | 2839087 | 0 | 20963828 | 250000 | 250000 |
| washroom | 6750 | 3626 | 2941 | 26705 | 0 | 225983 | 100000 | 100000 |
| path | 981730 | 588893 | 404696 | 3486321 | 0 | 26935450 | 100000 | 100000 |
| transit | 24547 | 17901 | 0 | 130808 | 0 | 170402 | 50000 | 50000 |

## Accessibility facts

An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, or automatic door. toilets:wheelchair is stored on the washroom wheelchair field. Legal access, crossing, lighting, fees, foot permission, and washroom audience or supervision are context fields and are counted on their own line. Names, categories, addresses, hours, operators, coordinates, and geometry are counted apart from both.

Physical accessibility facts, context fields, and the remaining pieces add up to the total: 722,377 + 503,750 + 6,482,921 = 7,709,048.

| Tranche | Physical accessibility pieces | Context pieces | Remaining pieces |
| --- | ---: | ---: | ---: |
| venue | 111957 | 96113 | 2839087 |
| washroom | 3626 | 2941 | 26705 |
| path | 588893 | 404696 | 3486321 |
| transit | 17901 | 0 | 130808 |

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
- wheelchair_description: 11053
- capacity_disabled: 3910
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
- published_accessibility: 664
- changing_table: 627
- adult_changing_table: 176
- wheelchair_description: 69
- changing_table_location: 4

### path

- surface: 291170
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

- wheelchair_boarding: 17901

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 3047157 | 0 | 0 | 0 | 0 |
| washroom | 33272 | 0 | 0 | 0 | 0 |
| path | 4479910 | 0 | 0 | 0 | 0 |
| transit | 0 | 148709 | 0 | 0 | 0 |

## Pieces by source and retrieval date

| Source | Records | Pieces | Accessibility pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| brampton-city-parking | 5 | 40 | 5 | 175 | 40 | 0 | 2026-11-16 |
| brampton-recreation-centres | 39 | 312 | 0 | 1365 | 312 | 0 | 2026-11-13 |
| brampton-recreational-trails | 6954 | 20862 | 0 | 201666 | 20862 | 0 | 2026-11-16 |
| gtfs-brampton | 2872 | 16917 | 2492 | 20419 | 0 | 16917 | 2026-11-13 |
| gtfs-grt-bus | 2265 | 13750 | 2251 | 15695 | 0 | 13750 | 2026-11-13 |
| gtfs-grt-ion | 32 | 159 | 31 | 257 | 0 | 159 | 2026-11-13 |
| gtfs-hsr | 2353 | 13993 | 0 | 16596 | 0 | 13993 | 2026-11-13 |
| gtfs-ltc | 1947 | 11625 | 1896 | 13686 | 0 | 11625 | 2026-11-13 |
| gtfs-ttc | 9357 | 56142 | 9357 | 65499 | 0 | 56142 | 2026-11-13 |
| hamilton-bus-stop-amenities | 2387 | 16709 | 2387 | 85932 | 16709 | 0 | 2026-11-16 |
| hamilton-drinking-fountains | 157 | 1097 | 0 | 5654 | 1097 | 0 | 2026-11-16 |
| hamilton-park-washrooms | 73 | 510 | 72 | 2337 | 510 | 0 | 2026-11-16 |
| hamilton-pedestrian-features | 64 | 192 | 0 | 1856 | 192 | 0 | 2026-11-16 |
| hamilton-sidewalks | 44444 | 177776 | 0 | 1244432 | 177776 | 0 | 2026-11-16 |
| hamilton-trails | 1389 | 6944 | 1388 | 37504 | 6944 | 0 | 2026-11-16 |
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
| osm-ontario | 1392049 | 6802010 | 677579 | 43717520 | 6802010 | 0 | 2026-11-13 |
| ottawa-park-parking | 408 | 4694 | 1047 | 12850 | 4694 | 0 | 2026-11-16 |
| ottawa-parks-inventory | 7916 | 51047 | 7113 | 289341 | 51047 | 0 | 2026-11-16 |
| ottawa-public-washrooms | 186 | 1988 | 545 | 5266 | 1988 | 0 | 2026-11-16 |
| peel-trails | 7791 | 31164 | 7791 | 218148 | 31164 | 0 | 2026-11-16 |
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
| york-region-yrt-bus-stops | 4827 | 29942 | 980 | 32809 | 0 | 29942 | 2026-11-16 |

## Largest UNKNOWN gaps by field

### venue

- braille: 558395
- door_width: 558395
- handrail: 558395
- incline: 558395
- kerb_height: 558395
- ramp_stroller: 558395
- ramp_wheelchair: 558395
- step_count: 558395
- hearing_loop: 558392
- elevator: 558382
- tactile_paving: 558382
- ramp: 558366

### washroom

- locked: 6750
- changing_table_fee: 6747
- supervised: 6747
- changing_table_location: 6746
- capacity: 6745
- shower: 6728
- addr_city: 6711
- drinking_water: 6697
- wheelchair_description: 6681
- addr_postcode: 6658
- indoor: 6624
- adult_changing_table: 6574

### path

- bidirectional: 981730
- from_ref: 981730
- max_slope: 981730
- min_width: 981730
- pathway_mode: 981730
- reversed_signposted_as: 981730
- signposted_as: 981730
- stair_count: 981730
- to_ref: 981730
- traversal_time_s: 981730
- wheelchair_description: 981695
- ramp: 980358

### transit

- level_id: 24547
- level_index: 24547
- level_name: 24547
- platform_code: 24533
- parent_station: 24379
- url: 23550
- description: 17498
- wheelchair_boarding: 6646
- stop_code: 155

## GTFS-RT accessibility alerts

These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Each row is one alert from the TTC accessibility endpoint, validated by schema/service-alert.schema.json. Equipment is elevator or escalator only when the header text says so.

Alert records: **32**.
Elevator: **3**. Escalator: **29**. Both words: **0**. Equipment not stated: **0**.
Retrieval dates: 2026-11-13.
