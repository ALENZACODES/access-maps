# Field-value counts

A piece is one field on one record whose value is not UNKNOWN and whose derived flag is not true. UNKNOWN values are gaps. Derived copies are excluded from both pieces and gaps. Section 5.6 counts only tier 2 and tier 3 values toward 500,000. Tier 0 and tier 1 accessibility facts are reported separately and are not verified.

Verified field-values toward the 500,000 target: **0**.
Tier 0 and tier 1 values count as 0 toward the 250,000 verified venue field-values and toward the 500,000 verified total. Section 5.6 counts tier 2 and tier 3 only.
Verified toward 500,000 is 0. None of those verified field-values exist in this import.
Open-data or operator-claimed physical accessibility facts (tier 0 and tier 1 only): **873,275**.
Context fields, reported separately (access, crossing, lit, fee, and the other context fields below): **516,932**.
All other populated values: **6,949,660**.
All populated pieces together: **8,339,867**.
Total UNKNOWN gaps: **51,261,045**.
UNKNOWN gaps on accessibility fields: **27,910,521**.
Derived values excluded from both totals: **4,195**.
Records: **1,685,610**.

The illustrative targets are 250,000 venue, 100,000 path, 50,000 transit, and 100,000 washroom verified field-values. Shortfall is the target minus verified values.

| Tranche | Records | Physical accessibility facts (tier 0–1) | Context fields | Other populated | Verified (tier 2–3) | UNKNOWN gaps | Illustrative target | Shortfall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venue | 565690 | 115926 | 96320 | 2894088 | 0 | 21218336 | 250000 | 250000 |
| washroom | 7079 | 3668 | 3036 | 28524 | 0 | 236658 | 100000 | 100000 |
| path | 1080917 | 732401 | 417576 | 3860951 | 0 | 29578416 | 100000 | 100000 |
| transit | 31924 | 21280 | 0 | 166097 | 0 | 227635 | 50000 | 50000 |

## Accessibility facts

An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, or automatic door. toilets:wheelchair is stored on the washroom wheelchair field. Legal access, crossing, lighting, fees, foot permission, and washroom audience or supervision are context fields and are counted on their own line. Names, categories, addresses, hours, operators, coordinates, and geometry are counted apart from both.

Physical accessibility facts, context fields, and the remaining pieces add up to the total: 873,275 + 516,932 + 6,949,660 = 8,339,867.

| Tranche | Physical accessibility pieces | Context pieces | Remaining pieces |
| --- | ---: | ---: | ---: |
| venue | 115926 | 96320 | 2894088 |
| washroom | 3668 | 3036 | 28524 |
| path | 732401 | 417576 | 3860951 |
| transit | 21280 | 0 | 166097 |

Context fields are populated values that are not a physical access measurement: access, crossing, lit, foot, fee, changing_table_fee, unisex, male, female, locked, and supervised. They are not accessibility facts and they are not names or geometry.

Fields counted as context, not as accessibility facts:

- venue: access, lit
- washroom: access, fee, changing_table_fee, unisex, male, female, locked, supervised
- path: foot, access, lit, crossing
- transit: none

Populated context fields:

### venue

- access: 87785
- lit: 8535

### washroom

- access: 1202
- fee: 732
- unisex: 506
- male: 297
- female: 293
- changing_table_fee: 3
- supervised: 3

### path

- crossing: 317549
- lit: 51915
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

- surface: 63096
- entrance: 17633
- wheelchair_description: 14456
- wheelchair: 12670
- capacity_disabled: 4038
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
- published_accessibility: 695
- changing_table: 637
- adult_changing_table: 177
- wheelchair_description: 69
- changing_table_location: 4

### path

- surface: 364179
- width: 107305
- tactile_paving: 99435
- kerb: 57242
- wheelchair_description: 31073
- wheelchair: 26627
- smoothness: 25985
- incline: 14434
- handrail: 2711
- step_count: 2038
- ramp: 1372

### transit

- wheelchair_boarding: 21280

## Pieces by tier

| Tranche | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| venue | 3106334 | 0 | 0 | 0 | 0 |
| washroom | 35228 | 0 | 0 | 0 | 0 |
| path | 5010928 | 0 | 0 | 0 | 0 |
| transit | 1232 | 186145 | 0 | 0 | 0 |

## Pieces by source and retrieval date

| Source | Records | Pieces | Accessibility pieces | Gaps | Tier 0 pieces | Tier 1 pieces | Retrieval dates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ajax-playgrounds | 81 | 486 | 0 | 2997 | 486 | 0 | 2026-11-16 |
| ajax-recreational-trails | 1073 | 6730 | 2119 | 27606 | 6730 | 0 | 2026-11-16 |
| ajax-town-facilities | 56 | 440 | 0 | 1968 | 440 | 0 | 2026-11-16 |
| brampton-city-parking | 5 | 40 | 5 | 175 | 40 | 0 | 2026-11-16 |
| brampton-recreation-centres | 39 | 312 | 0 | 1365 | 312 | 0 | 2026-11-13 |
| brampton-recreational-trails | 6954 | 20862 | 0 | 201666 | 20862 | 0 | 2026-11-16 |
| brant-parks | 60 | 297 | 0 | 2283 | 297 | 0 | 2026-11-16 |
| brant-sidewalks | 1130 | 6669 | 2149 | 29491 | 6669 | 0 | 2026-11-16 |
| brant-trails | 102 | 510 | 0 | 2754 | 510 | 0 | 2026-11-16 |
| cambridge-play-structures | 392 | 2864 | 0 | 13992 | 2864 | 0 | 2026-11-16 |
| cornwall-recreational-paths | 221 | 1153 | 441 | 5919 | 1153 | 0 | 2026-11-16 |
| cornwall-sidewalks | 1636 | 9814 | 3270 | 42538 | 9814 | 0 | 2026-11-16 |
| cornwall-transit-bus-stops | 308 | 1232 | 0 | 2772 | 1232 | 0 | 2026-11-16 |
| cornwall-water-bottle-filling-stations | 6 | 30 | 0 | 228 | 30 | 0 | 2026-11-16 |
| essex-county-libraries | 15 | 120 | 0 | 525 | 120 | 0 | 2026-11-16 |
| essex-county-recreational-areas | 181 | 1086 | 0 | 6697 | 1086 | 0 | 2026-11-16 |
| essex-county-trails | 167 | 668 | 0 | 4676 | 668 | 0 | 2026-11-16 |
| greater-sudbury-playgrounds | 178 | 1354 | 14 | 6300 | 1354 | 0 | 2026-11-16 |
| greater-sudbury-recreation | 499 | 4343 | 0 | 17114 | 4343 | 0 | 2026-11-16 |
| greater-sudbury-walkways | 5456 | 28586 | 8202 | 146006 | 28586 | 0 | 2026-11-16 |
| gtfs-brampton | 2872 | 16917 | 2492 | 20419 | 0 | 16917 | 2026-11-13 |
| gtfs-drt | 1912 | 11472 | 1912 | 13384 | 0 | 11472 | 2026-11-16 |
| gtfs-gova | 1121 | 4484 | 0 | 10089 | 0 | 4484 | 2026-11-16 |
| gtfs-grt-bus | 2265 | 13750 | 2251 | 15695 | 0 | 13750 | 2026-11-13 |
| gtfs-grt-ion | 32 | 159 | 31 | 257 | 0 | 159 | 2026-11-13 |
| gtfs-hsr | 2353 | 13993 | 0 | 16596 | 0 | 13993 | 2026-11-13 |
| gtfs-kingston | 787 | 3148 | 0 | 7083 | 0 | 3148 | 2026-11-16 |
| gtfs-ltc | 1947 | 11625 | 1896 | 13686 | 0 | 11625 | 2026-11-13 |
| gtfs-ttc | 9357 | 56142 | 9357 | 65499 | 0 | 56142 | 2026-11-13 |
| guelph-parking-lots | 17 | 154 | 17 | 577 | 154 | 0 | 2026-11-16 |
| guelph-restrooms | 68 | 328 | 0 | 2324 | 328 | 0 | 2026-11-16 |
| guelph-sidewalks | 5236 | 26059 | 10351 | 141493 | 26059 | 0 | 2026-11-16 |
| guelph-trails | 2118 | 8472 | 2118 | 59304 | 8472 | 0 | 2026-11-16 |
| guelph-transit-gtfs | 622 | 3733 | 3 | 4353 | 0 | 3733 | 2026-11-16 |
| hamilton-bus-stop-amenities | 2387 | 16709 | 2387 | 85932 | 16709 | 0 | 2026-11-16 |
| hamilton-drinking-fountains | 157 | 1097 | 0 | 5654 | 1097 | 0 | 2026-11-16 |
| hamilton-park-washrooms | 73 | 510 | 72 | 2337 | 510 | 0 | 2026-11-16 |
| hamilton-pedestrian-features | 64 | 192 | 0 | 1856 | 192 | 0 | 2026-11-16 |
| hamilton-sidewalks | 44444 | 177776 | 0 | 1244432 | 177776 | 0 | 2026-11-16 |
| hamilton-trails | 1389 | 6944 | 1388 | 37504 | 6944 | 0 | 2026-11-16 |
| kingston-accessible-features | 1003 | 8198 | 277 | 34763 | 8198 | 0 | 2026-11-13 |
| kingston-parking-lots | 56 | 400 | 27 | 2008 | 400 | 0 | 2026-11-16 |
| kingston-points-of-interest | 766 | 7600 | 0 | 25338 | 7600 | 0 | 2026-11-16 |
| kingston-public-washrooms | 48 | 432 | 0 | 1440 | 432 | 0 | 2026-11-13 |
| kingston-trails | 89 | 530 | 88 | 2318 | 530 | 0 | 2026-11-16 |
| kitchener-accessible-parking | 53 | 365 | 53 | 1914 | 365 | 0 | 2026-11-16 |
| kitchener-crosswalks | 4707 | 28240 | 4706 | 122384 | 28240 | 0 | 2026-11-16 |
| kitchener-parking-lots | 51 | 507 | 28 | 1686 | 507 | 0 | 2026-11-16 |
| kitchener-playground-equipment | 44 | 308 | 44 | 1584 | 308 | 0 | 2026-11-16 |
| kitchener-playgrounds | 337 | 3235 | 582 | 11256 | 3235 | 0 | 2026-11-16 |
| kitchener-public-washrooms | 95 | 758 | 0 | 2947 | 758 | 0 | 2026-11-16 |
| kitchener-sidewalks | 17108 | 119683 | 51254 | 427773 | 119683 | 0 | 2026-11-16 |
| kitchener-trails | 4322 | 30177 | 12892 | 108127 | 30177 | 0 | 2026-11-16 |
| lambton-accessible-facilities | 81 | 710 | 80 | 2587 | 710 | 0 | 2026-11-16 |
| markham-city-facilities | 82 | 574 | 0 | 2952 | 574 | 0 | 2026-11-16 |
| markham-trails | 3075 | 15240 | 2994 | 83160 | 15240 | 0 | 2026-11-16 |
| metrolinx-go | 889 | 6151 | 889 | 5406 | 0 | 6151 | 2026-11-15 |
| metrolinx-up | 5 | 30 | 5 | 35 | 0 | 30 | 2026-11-15 |
| milton-park-amenities | 164 | 1299 | 0 | 5753 | 1299 | 0 | 2026-11-16 |
| milton-parking-lots | 57 | 567 | 56 | 1884 | 567 | 0 | 2026-11-16 |
| milton-sidewalks | 5256 | 31329 | 5256 | 136863 | 31329 | 0 | 2026-11-16 |
| milton-trails | 2107 | 10519 | 2107 | 56905 | 10519 | 0 | 2026-11-16 |
| mto-picnic-parks | 168 | 1005 | 0 | 6219 | 1005 | 0 | 2026-11-13 |
| newmarket-landmarks | 35 | 244 | 0 | 1261 | 244 | 0 | 2026-11-16 |
| newmarket-park-features | 281 | 1715 | 0 | 10320 | 1715 | 0 | 2026-11-16 |
| newmarket-trail-points | 268 | 1337 | 0 | 10143 | 1337 | 0 | 2026-11-16 |
| newmarket-trails | 739 | 2956 | 739 | 20692 | 2956 | 0 | 2026-11-16 |
| niagara-falls-playgrounds | 82 | 489 | 79 | 3037 | 489 | 0 | 2026-11-16 |
| niagara-falls-sidewalks | 4099 | 20490 | 4094 | 110678 | 20490 | 0 | 2026-11-16 |
| niagara-falls-trails | 43 | 221 | 32 | 1155 | 221 | 0 | 2026-11-16 |
| oakville-town-washrooms | 21 | 105 | 0 | 714 | 105 | 0 | 2026-11-16 |
| oakville-transit-gtfs | 1163 | 5815 | 0 | 9304 | 0 | 5815 | 2026-11-16 |
| oshawa-community-centres | 20 | 140 | 0 | 720 | 140 | 0 | 2026-11-16 |
| oshawa-trails | 299 | 897 | 0 | 8671 | 897 | 0 | 2026-11-16 |
| osm-ontario | 1392049 | 6802010 | 677579 | 43717520 | 6802010 | 0 | 2026-11-13 |
| ottawa-drinking-fountains | 112 | 1120 | 0 | 3696 | 1120 | 0 | 2026-11-16 |
| ottawa-library-locations | 34 | 340 | 0 | 1122 | 340 | 0 | 2026-11-16 |
| ottawa-park-parking | 408 | 4694 | 1047 | 12850 | 4694 | 0 | 2026-11-16 |
| ottawa-parks | 1378 | 12302 | 1331 | 46952 | 12302 | 0 | 2026-11-16 |
| ottawa-parks-inventory | 7916 | 51047 | 7113 | 289341 | 51047 | 0 | 2026-11-16 |
| ottawa-pedestrian-network | 20297 | 75358 | 0 | 574146 | 75358 | 0 | 2026-11-16 |
| ottawa-public-washrooms | 186 | 1988 | 545 | 5266 | 1988 | 0 | 2026-11-16 |
| ottawa-recreation-facilities | 371 | 2840 | 0 | 13113 | 2840 | 0 | 2026-11-16 |
| peel-trails | 7791 | 31164 | 7791 | 218148 | 31164 | 0 | 2026-11-16 |
| pickering-facilities | 28 | 250 | 0 | 954 | 250 | 0 | 2026-11-16 |
| pickering-parks | 201 | 1392 | 0 | 7095 | 1392 | 0 | 2026-11-16 |
| quinte-west-parks | 126 | 872 | 0 | 4546 | 872 | 0 | 2026-11-16 |
| quinte-west-trails | 132 | 799 | 139 | 3425 | 799 | 0 | 2026-11-16 |
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
| waterloo-parking-lots | 31 | 275 | 62 | 1058 | 275 | 0 | 2026-11-16 |
| waterloo-playgrounds | 83 | 580 | 82 | 2989 | 580 | 0 | 2026-11-16 |
| waterloo-sidewalks | 5261 | 26283 | 5239 | 142069 | 26283 | 0 | 2026-11-16 |
| waterloo-trails | 1576 | 7878 | 1575 | 42554 | 7878 | 0 | 2026-11-16 |
| welland-public-washrooms | 3 | 18 | 0 | 99 | 18 | 0 | 2026-11-16 |
| welland-trails | 52 | 208 | 52 | 1456 | 208 | 0 | 2026-11-16 |
| whitby-parks | 174 | 1273 | 14 | 5951 | 1273 | 0 | 2026-11-16 |
| whitby-sidewalks | 3578 | 28370 | 10680 | 86126 | 28370 | 0 | 2026-11-16 |
| whitby-town-facilities | 27 | 268 | 0 | 893 | 268 | 0 | 2026-11-16 |
| whitby-trails | 1062 | 6337 | 2109 | 27647 | 6337 | 0 | 2026-11-16 |
| windsor-bus-stops | 1425 | 9975 | 1425 | 51300 | 9975 | 0 | 2026-11-16 |
| windsor-drinking-fountains | 16 | 96 | 0 | 592 | 96 | 0 | 2026-11-16 |
| windsor-park-washrooms | 42 | 210 | 0 | 1428 | 210 | 0 | 2026-11-16 |
| windsor-paths-trails | 660 | 3242 | 1265 | 17878 | 3242 | 0 | 2026-11-16 |
| windsor-playgrounds | 131 | 903 | 117 | 4730 | 903 | 0 | 2026-11-16 |
| windsor-sidewalks | 6714 | 33512 | 13370 | 181336 | 33512 | 0 | 2026-11-16 |
| windsor-transit-gtfs | 1464 | 8784 | 1464 | 10248 | 0 | 8784 | 2026-11-16 |
| york-region-yrt-bus-stops | 4827 | 29942 | 980 | 32809 | 0 | 29942 | 2026-11-16 |

## Largest UNKNOWN gaps by field

### venue

- braille: 565690
- door_width: 565690
- handrail: 565690
- incline: 565690
- kerb_height: 565690
- ramp_stroller: 565690
- ramp_wheelchair: 565690
- step_count: 565690
- hearing_loop: 565687
- elevator: 565677
- tactile_paving: 565677
- ramp: 565661

### washroom

- locked: 7079
- changing_table_fee: 7076
- supervised: 7076
- changing_table_location: 7075
- capacity: 7074
- shower: 7057
- drinking_water: 7026
- wheelchair_description: 7010
- addr_city: 7009
- addr_postcode: 6987
- indoor: 6953
- adult_changing_table: 6902

### path

- bidirectional: 1080917
- from_ref: 1080917
- max_slope: 1080917
- min_width: 1080917
- pathway_mode: 1080917
- reversed_signposted_as: 1080917
- stair_count: 1080917
- to_ref: 1080917
- traversal_time_s: 1080917
- signposted_as: 1080023
- ramp: 1079545
- step_count: 1078879

### transit

- level_id: 31924
- level_index: 31924
- level_name: 31924
- platform_code: 31910
- parent_station: 31756
- url: 30927
- description: 24255
- wheelchair_boarding: 10644
- stop_code: 2063
- location_type: 308

## GTFS-RT accessibility alerts

These are operator-published service alerts, not pieces. A stored copy is a snapshot. Run `npm run fetch:ttc-alerts` to replace it. Each row is one alert from the TTC accessibility endpoint, validated by schema/service-alert.schema.json. Equipment is elevator or escalator only when the header text says so.

Alert records: **32**.
Elevator: **3**. Escalator: **29**. Both words: **0**. Equipment not stated: **0**.
Retrieval dates: 2026-11-13.
